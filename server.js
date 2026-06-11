const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

require("dotenv").config();

const express = require("express");
const { Server } = require("socket.io");
const ioClient = require("socket.io-client");

const app = express();
const server = http.createServer(app);
const overlayIo = new Server(server);

const PORT = Number(process.env.PORT || 8787);
const CLIENT_ID = process.env.CHZZK_CLIENT_ID || "";
const CLIENT_SECRET = process.env.CHZZK_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.CHZZK_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const OPEN_API_BASE = "https://openapi.chzzk.naver.com";
const AUTH_URL = "https://chzzk.naver.com/account-interlock";
const DATA_DIR = path.join(__dirname, "data");
const USERS_PATH = path.join(DATA_DIR, "users.json");
const TOKEN_PATH = path.join(DATA_DIR, "tokens.json");
const STATE_PATH = path.join(DATA_DIR, "oauth-state.json");

// Runtime-only sockets live here. Tokens and overlay keys are stored in data/users.json.
const userSessions = new Map();

app.use(express.json());

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function requireConfig() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("CHZZK_CLIENT_ID and CHZZK_CLIENT_SECRET are required in .env.");
  }
}

function readUsers() {
  const store = readJson(USERS_PATH, { users: {} });
  if (!store.users || typeof store.users !== "object") {
    return { users: {} };
  }
  return store;
}

function writeUsers(store) {
  writeJson(USERS_PATH, store);
}

function saveUser(user) {
  const store = readUsers();
  store.users[user.overlayKey] = {
    ...user,
    updatedAt: new Date().toISOString()
  };
  writeUsers(store);
  return store.users[user.overlayKey];
}

function findUser(overlayKey) {
  const store = readUsers();
  return store.users[overlayKey] || null;
}

function listUsers() {
  return Object.values(readUsers().users);
}

function getDefaultUser() {
  const users = listUsers();
  if (users.length > 0) {
    return users[0];
  }

  // v0.4 compatibility: migrate old data/tokens.json into a local overlay user.
  const oldTokens = readJson(TOKEN_PATH, null);
  if (!oldTokens?.refreshToken) {
    return null;
  }

  return saveUser({
    overlayKey: "local",
    createdAt: new Date().toISOString(),
    tokens: oldTokens,
    channelId: "",
    chatEvents: [],
    totalChats: 0
  });
}

function getRequestOverlayKey(request) {
  return (
    request.params.overlayKey ||
    request.query.overlayKey ||
    request.body?.overlayKey ||
    ""
  );
}

function getRequestUser(request) {
  const overlayKey = getRequestOverlayKey(request);
  if (overlayKey) {
    return findUser(String(overlayKey));
  }
  return getDefaultUser();
}

function getOrCreateRuntime(overlayKey) {
  if (!userSessions.has(overlayKey)) {
    userSessions.set(overlayKey, {
      socket: null,
      sessionKey: "",
      isConnecting: false
    });
  }
  return userSessions.get(overlayKey);
}

function roomName(overlayKey) {
  return `overlay:${overlayKey}`;
}

function roomClientCount(overlayKey) {
  return overlayIo.sockets.adapter.rooms.get(roomName(overlayKey))?.size || 0;
}

function saveTokens(tokenBody) {
  const expiresIn = Number(tokenBody.expiresIn || 86400);
  return {
    accessToken: tokenBody.accessToken,
    refreshToken: tokenBody.refreshToken,
    tokenType: tokenBody.tokenType || "Bearer",
    scope: tokenBody.scope || "",
    expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000
  };
}

async function openApiFetch(pathname, options = {}) {
  const response = await fetch(`${OPEN_API_BASE}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body.code && body.code !== 200)) {
    throw new Error(body.message || `CHZZK Open API request failed: ${response.status}`);
  }
  return body.content || body;
}

async function exchangeCodeForToken(code, state) {
  requireConfig();
  return openApiFetch("/auth/v1/token", {
    method: "POST",
    body: JSON.stringify({
      grantType: "authorization_code",
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      code,
      state
    })
  });
}

async function refreshTokenIfNeeded(user) {
  requireConfig();
  if (!user?.tokens?.refreshToken) {
    throw new Error("Saved token is missing. Please log in with CHZZK OAuth first.");
  }
  if (user.tokens.accessToken && user.tokens.expiresAt && user.tokens.expiresAt > Date.now()) {
    return user.tokens;
  }

  const refreshed = await openApiFetch("/auth/v1/token", {
    method: "POST",
    body: JSON.stringify({
      grantType: "refresh_token",
      refreshToken: user.tokens.refreshToken,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET
    })
  });

  user.tokens = saveTokens(refreshed);
  saveUser(user);
  return user.tokens;
}

async function createUserSession(accessToken) {
  return openApiFetch("/open/v1/sessions/auth", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

async function subscribeChatEvent(accessToken, sessionKey) {
  const params = new URLSearchParams({ sessionKey });
  return openApiFetch(`/open/v1/sessions/events/subscribe/chat?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

function parseSocketPayload(payload) {
  if (typeof payload !== "string") {
    return payload || {};
  }
  try {
    return JSON.parse(payload);
  } catch (error) {
    return { raw: payload };
  }
}

function previewPayload(payload) {
  try {
    return JSON.stringify(payload).slice(0, 1200);
  } catch (error) {
    return String(payload).slice(0, 1200);
  }
}

function emitStatus(user, status, extra = {}) {
  console.log(`[CHZZK:${user.overlayKey}] ${status}`, extra);
  overlayIo.to(roomName(user.overlayKey)).emit("chzzk:status", { status, overlayKey: user.overlayKey, ...extra });
}

function emitError(user, error) {
  const message = error?.message || String(error);
  console.error(`[CHZZK ERROR:${user?.overlayKey || "unknown"}]`, message);
  if (user?.overlayKey) {
    overlayIo.to(roomName(user.overlayKey)).emit("chzzk:error", { message, overlayKey: user.overlayKey });
  }
}

function pruneUserChatEvents(user, now = Date.now()) {
  const cutoff = now - 60000;
  user.chatEvents = (user.chatEvents || []).filter((time) => time >= cutoff);
}

function getUserStats(user, now = Date.now()) {
  pruneUserChatEvents(user, now);
  return {
    overlayKey: user.overlayKey,
    channelId: user.channelId || "",
    chatEvents: user.chatEvents || [],
    totalChats: Number(user.totalChats || 0),
    serverTime: now
  };
}

function emitStats(user) {
  overlayIo.to(roomName(user.overlayKey)).emit("chzzk:stats", getUserStats(user));
}

function getMessageType(message) {
  return message?.type || message?.data?.type || message?.body?.type || message?.content?.type || "";
}

function isChatPayload(message) {
  const eventType =
    message?.eventType ||
    message?.data?.eventType ||
    message?.body?.eventType ||
    message?.content?.eventType ||
    "";
  const type = getMessageType(message);
  return eventType === "CHAT" || type === "CHAT";
}

function findSessionKey(value) {
  if (!value || typeof value !== "object") {
    return "";
  }
  if (typeof value.sessionKey === "string") {
    return value.sessionKey;
  }
  return findSessionKey(value.data) || findSessionKey(value.body) || findSessionKey(value.content);
}

function closeChzzkSession(user) {
  const runtime = getOrCreateRuntime(user.overlayKey);
  if (runtime.socket) {
    runtime.socket.close();
    runtime.socket = null;
  }
  runtime.sessionKey = "";
}

function emitChatEvent(user, message) {
  const chatData = message?.data || message?.body || message;
  const now = Date.now();

  user.chatEvents = user.chatEvents || [];
  user.chatEvents.push(now);
  user.totalChats = Number(user.totalChats || 0) + 1;
  pruneUserChatEvents(user, now);
  saveUser(user);

  console.log(`[CHZZK CHAT:${user.overlayKey}]`, previewPayload(chatData));
  console.log(`[OVERLAY:${user.overlayKey}] broadcasting chat to ${roomClientCount(user.overlayKey)} client(s)`);
  overlayIo.to(roomName(user.overlayKey)).emit("chzzk:chat", chatData);
  emitStats(user);
}

function attachSocketEventLogger(user, socket) {
  const originalOnevent = socket.onevent;

  // Socket.IO v2 does not have onAny, so this wraps the low-level event entry.
  socket.onevent = function onevent(packet) {
    const args = packet?.data || [];
    const eventName = args[0];
    const payload = parseSocketPayload(args[1]);

    if (eventName && !["connect", "disconnect"].includes(eventName)) {
      console.log(`[CHZZK ANY:${user.overlayKey}:${eventName}]`, previewPayload(payload));
      if (eventName !== "SYSTEM" && eventName !== "CHAT" && isChatPayload(payload)) {
        emitChatEvent(user, payload);
      }
    }

    originalOnevent.call(this, packet);
  };
}

function handleChzzkSessionMessage(user, payload, eventName = "message") {
  const message = parseSocketPayload(payload);
  console.log(`[CHZZK EVENT:${user.overlayKey}:${eventName}]`, previewPayload(message));

  if (eventName === "CHAT") {
    emitChatEvent(user, message);
    return;
  }

  const messageType = getMessageType(message);
  const runtime = getOrCreateRuntime(user.overlayKey);

  if (messageType === "connected") {
    runtime.sessionKey = findSessionKey(message);
    emitStatus(user, "session-connected", { sessionKey: runtime.sessionKey });
    if (!runtime.sessionKey) {
      emitError(user, new Error("Session key was not found."));
      return;
    }
    refreshTokenIfNeeded(user)
      .then((tokens) => subscribeChatEvent(tokens.accessToken, runtime.sessionKey))
      .then(() => emitStatus(user, "chat-subscribed"))
      .catch((error) => emitError(user, error));
    return;
  }

  if (messageType === "subscribed") {
    const channelId = message?.data?.channelId || message?.body?.channelId || message?.content?.channelId || "";
    if (channelId && user.channelId !== channelId) {
      user.channelId = channelId;
      saveUser(user);
    }
    emitStatus(user, "chat-subscribed", { channelId });
    return;
  }

  if (messageType === "revoked") {
    emitError(user, new Error("CHZZK permission was revoked. Please log in again."));
    return;
  }

  if (isChatPayload(message)) {
    emitChatEvent(user, message);
  }
}

async function connectChzzkSession(user) {
  const runtime = getOrCreateRuntime(user.overlayKey);
  if (runtime.isConnecting) {
    return { ok: true, pending: true, overlayKey: user.overlayKey };
  }

  runtime.isConnecting = true;
  try {
    const tokens = await refreshTokenIfNeeded(user);
    const session = await createUserSession(tokens.accessToken);
    if (!session?.url) {
      throw new Error("Session socket URL was not issued.");
    }

    closeChzzkSession(user);
    runtime.socket = ioClient(session.url, {
      transports: ["websocket"],
      reconnection: false,
      "force new connection": true,
      "connect timeout": 3000
    });
    attachSocketEventLogger(user, runtime.socket);

    runtime.socket.on("connect", () => emitStatus(user, "socket-connected"));
    runtime.socket.on("disconnect", () => emitStatus(user, "socket-disconnected"));
    runtime.socket.on("connect_error", (error) => emitError(user, new Error(error.message || "Socket.IO connection failed")));
    runtime.socket.on("SYSTEM", (payload) => handleChzzkSessionMessage(user, payload, "SYSTEM"));
    runtime.socket.on("CHAT", (payload) => handleChzzkSessionMessage(user, payload, "CHAT"));
    runtime.socket.on("message", (payload) => handleChzzkSessionMessage(user, payload, "message"));

    return { ok: true, overlayKey: user.overlayKey };
  } finally {
    runtime.isConnecting = false;
  }
}

function autoConnectUser(user, reason) {
  const runtime = getOrCreateRuntime(user.overlayKey);
  if (runtime.socket || runtime.isConnecting || !user.tokens?.refreshToken) {
    return;
  }

  console.log(`[CHZZK:${user.overlayKey}] saved token found, auto connecting (${reason})`);
  connectChzzkSession(user).catch((error) => emitError(user, error));
}

function autoConnectAllUsers(reason) {
  getDefaultUser();
  listUsers().forEach((user) => autoConnectUser(user, reason));
}

function createOverlayKey() {
  return crypto.randomBytes(9).toString("base64url");
}

function sendIndex(response) {
  response.sendFile(path.join(__dirname, "index.html"));
}

app.get("/", (request, response) => {
  const user = getDefaultUser();
  if (user) {
    response.redirect(`/dashboard/${user.overlayKey}`);
    return;
  }
  sendIndex(response);
});

app.get("/dashboard/:overlayKey", (request, response) => sendIndex(response));
app.get("/overlay/:overlayKey", (request, response) => sendIndex(response));
app.get("/u/:overlayKey", (request, response) => response.redirect(`/dashboard/${request.params.overlayKey}`));

app.get("/auth/login", (request, response) => {
  try {
    requireConfig();
    const state = crypto.randomBytes(16).toString("hex");
    writeJson(STATE_PATH, { state, createdAt: Date.now() });
    const params = new URLSearchParams({
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      state
    });
    response.redirect(`${AUTH_URL}?${params.toString()}`);
  } catch (error) {
    response.status(500).send(error.message);
  }
});

app.get("/auth/callback", async (request, response) => {
  try {
    const { code, state } = request.query;
    const savedState = readJson(STATE_PATH, {});
    if (!code || !state || state !== savedState.state) {
      response.status(400).send("OAuth state does not match.");
      return;
    }

    const tokenBody = await exchangeCodeForToken(String(code), String(state));
    const overlayKey = createOverlayKey();
    const user = saveUser({
      overlayKey,
      createdAt: new Date().toISOString(),
      tokens: saveTokens(tokenBody),
      channelId: "",
      chatEvents: [],
      totalChats: 0
    });

    autoConnectUser(user, "oauth-callback");

    const dashboardUrl = `${PUBLIC_BASE_URL}/dashboard/${overlayKey}`;
    const overlayUrl = `${PUBLIC_BASE_URL}/overlay/${overlayKey}?obs=1&transparent=1`;

    response.send(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>CHZZK CPM OAuth Complete</title>
  <style>
    body { margin: 0; padding: 32px; color: #f4fff9; background: #07100d; font-family: Arial, sans-serif; }
    a { color: #22e58b; }
    code { display: block; margin: 10px 0 18px; padding: 12px; background: #0e1815; border: 1px solid rgba(139,255,203,.2); border-radius: 8px; }
  </style>
</head>
<body>
  <h1>OAuth login complete</h1>
  <p>Keep these URLs. The overlay URL is what you add to OBS.</p>
  <p>Dashboard</p>
  <code>${dashboardUrl}</code>
  <p>OBS Overlay</p>
  <code>${overlayUrl}</code>
  <p><a href="${dashboardUrl}">Open dashboard</a></p>
</body>
</html>`);
  } catch (error) {
    response.status(500).send(error.message);
  }
});

app.get("/api/status", (request, response) => {
  const user = getRequestUser(request);
  if (!user) {
    response.json({ loggedIn: false, sessionConnected: false, sessionKey: "", overlayKey: "" });
    return;
  }
  const runtime = getOrCreateRuntime(user.overlayKey);
  response.json({
    loggedIn: Boolean(user.tokens?.accessToken || user.tokens?.refreshToken),
    sessionConnected: Boolean(runtime.socket?.connected),
    sessionKey: runtime.sessionKey,
    overlayKey: user.overlayKey,
    channelId: user.channelId || "",
    dashboardUrl: `${PUBLIC_BASE_URL}/dashboard/${user.overlayKey}`,
    overlayUrl: `${PUBLIC_BASE_URL}/overlay/${user.overlayKey}?obs=1&transparent=1`
  });
});

app.get("/api/stats", (request, response) => {
  const user = getRequestUser(request);
  if (!user) {
    response.status(404).json({ ok: false, message: "Overlay user was not found." });
    return;
  }
  response.json(getUserStats(user));
});

app.post("/api/connect", async (request, response) => {
  try {
    const user = getRequestUser(request);
    if (!user) {
      response.status(404).json({ ok: false, message: "Overlay user was not found. Please log in first." });
      return;
    }
    const result = await connectChzzkSession(user);
    response.json(result);
  } catch (error) {
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.post("/api/disconnect", (request, response) => {
  const user = getRequestUser(request);
  if (user) {
    closeChzzkSession(user);
  }
  response.json({ ok: true });
});

app.use(express.static(__dirname));

overlayIo.on("connection", (socket) => {
  const requestedKey = socket.handshake?.query?.overlayKey || "";
  const user = requestedKey ? findUser(String(requestedKey)) : getDefaultUser();
  const transport = socket.conn?.transport?.name || "unknown";
  const userAgent = socket.handshake?.headers?.["user-agent"] || "unknown";

  if (!user) {
    console.log(`[OVERLAY] rejected client id=${socket.id} transport=${transport}`);
    socket.emit("chzzk:error", { message: "Overlay user was not found. Please log in first." });
    return;
  }

  const runtime = getOrCreateRuntime(user.overlayKey);
  socket.join(roomName(user.overlayKey));
  console.log(`[OVERLAY:${user.overlayKey}] client connected id=${socket.id} transport=${transport} ua=${userAgent}`);
  socket.emit("chzzk:status", {
    status: runtime.socket?.connected ? "socket-connected" : "test-mode",
    overlayKey: user.overlayKey,
    sessionKey: runtime.sessionKey
  });
  socket.emit("chzzk:stats", getUserStats(user));
  autoConnectUser(user, "overlay-client");

  socket.on("disconnect", (reason) => {
    console.log(`[OVERLAY:${user.overlayKey}] client disconnected id=${socket.id} reason=${reason}`);
  });
});

server.listen(PORT, () => {
  console.log(`CHZZK CPM overlay server: http://localhost:${PORT}`);
  autoConnectAllUsers("server-start");
});
