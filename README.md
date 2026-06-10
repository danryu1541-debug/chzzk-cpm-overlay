# 치지직 채팅 속도 측정기 v0.5

치지직 방송 채팅 속도를 OBS 오버레이로 보여주는 작은 웹앱입니다.

실제 채팅이 들어오면 최근 60초 기준 CPM(Chat Per Minute), 최근 10초 속도, 총 채팅 수, 최고 CPM, 평균 CPM, 그래프를 자동으로 갱신합니다.

v0.5부터는 소규모 서비스형 구조를 지원합니다. 운영자 한 명이 치지직 Developers 애플리케이션을 등록해두면, 사용자는 사이트에서 치지직 로그인만 하고 자기 OBS 오버레이 주소를 받아 쓸 수 있습니다.

## 특징

- OBS 브라우저 소스용 가로형 오버레이
- 치지직 공식 Open API 기반 OAuth 로그인
- 실제 치지직 채팅 이벤트로 CPM 계산
- 최근 60초 CPM 그래프
- 투명 배경 오버레이 지원
- 테스트용 `채팅 추가` 버튼 유지
- 서버가 꺼졌다 켜져도 저장된 토큰으로 자동 연결 시도
- 웹페이지와 OBS 화면의 CPM 동기화
- 사용자별 overlayKey 발급
- 사용자별 대시보드/OBS 오버레이 주소 분리

## 화면 주소

개인 로컬 사용자는 아래 주소를 OBS 브라우저 소스에 넣을 수 있습니다.

```text
http://localhost:8787/index.html?obs=1&transparent=1
```

OAuth 로그인 후에는 사용자별 주소가 따로 발급됩니다.

```text
http://localhost:8787/dashboard/사용자키
http://localhost:8787/overlay/사용자키?obs=1&transparent=1
```

일반 설정/테스트 화면:

```text
http://localhost:8787
```

얇은 미니 오버레이:

```text
http://localhost:8787/index.html?mini=1&transparent=1
```

## 쉬운 실행 방법

Windows에서는 `start.bat`을 더블클릭하면 됩니다.

처음 실행할 때 필요한 패키지가 없으면 자동으로 설치를 시도합니다.

직접 실행하려면 PowerShell에서 아래처럼 입력합니다.

```powershell
cd "프로젝트 폴더 경로"
npm.cmd install
npm.cmd start
```

서버가 정상 실행되면 아래처럼 표시됩니다.

```text
CHZZK CPM overlay server: http://localhost:8787
```

## 처음 설정

1. 치지직 Developers에서 애플리케이션을 등록합니다.
2. 로그인 리디렉션 URL을 아래 값으로 등록합니다.

```text
http://localhost:8787/auth/callback
```

3. API Scope에서 `채팅 메시지 조회`를 선택합니다.
4. `.env.example` 파일을 복사해서 `.env` 파일을 만듭니다.
5. `.env`에 Client ID와 Client Secret을 입력합니다.

```env
CHZZK_CLIENT_ID=your-client-id
CHZZK_CLIENT_SECRET=your-client-secret
CHZZK_REDIRECT_URI=http://localhost:8787/auth/callback
PUBLIC_BASE_URL=http://localhost:8787
PORT=8787
```

6. 서버를 실행합니다.
7. `http://localhost:8787`을 엽니다.
8. `OAuth 로그인`을 누르고 방송 계정으로 승인합니다.
9. OAuth 완료 화면에 나오는 Dashboard URL과 OBS Overlay URL을 저장합니다.
10. 상태가 `치지직 채팅 이벤트 구독됨`으로 바뀌면 준비 완료입니다.

## 소규모 서비스형으로 쓰기

친구나 소규모 사용자에게 제공하려면 운영자만 치지직 Developers 애플리케이션을 등록합니다.

사용자는 직접 개발자센터에 들어갈 필요 없이 아래 순서만 따르면 됩니다.

```text
1. 운영자가 제공한 사이트 접속
2. OAuth 로그인
3. 발급된 OBS Overlay URL 복사
4. OBS 브라우저 소스에 붙여넣기
```

실제 서버에 올릴 때는 `.env`를 서버 주소에 맞게 바꿉니다.

```env
CHZZK_REDIRECT_URI=https://your-domain.com/auth/callback
PUBLIC_BASE_URL=https://your-domain.com
```

치지직 Developers의 로그인 리디렉션 URL도 같은 주소로 등록해야 합니다.

```text
https://your-domain.com/auth/callback
```

## OBS 등록 방법

OBS에서:

1. `소스 목록`의 `+` 버튼을 누릅니다.
2. `브라우저`를 선택합니다.
3. `로컬 파일`은 체크하지 않습니다.
4. URL에 OAuth 완료 화면에서 받은 OBS Overlay URL을 입력합니다.

```text
http://localhost:8787/overlay/사용자키?obs=1&transparent=1
```

권장 크기:

```text
너비: 1920
높이: 160
```

더 얇게 쓰고 싶으면:

```text
http://localhost:8787/index.html?mini=1&transparent=1
높이: 120
```

## 방송할 때 순서

1. `start.bat` 실행
2. PowerShell 창을 방송 중 계속 켜두기
3. OBS 실행
4. 치지직 방송 시작
5. 채팅이 들어오면 CPM이 자동으로 올라가는지 확인

## 주의

- `.env` 파일에는 Client Secret이 들어갑니다. GitHub에 올리면 안 됩니다.
- `node_modules`, `.env`, `data` 폴더는 GitHub에 올리지 않습니다.
- OAuth 승인은 반드시 방송 중인 치지직 계정으로 해야 합니다.
- 서버가 꺼져 있으면 OBS 오버레이는 채팅을 받을 수 없습니다.

## GitHub Release 문구

### 제목

```text
치지직 채팅 속도 측정기 v0.5.0
```

### 설명

```markdown
치지직 방송용 CPM 오버레이 소규모 서비스형 버전입니다.

주요 기능:

- 치지직 공식 Open API OAuth 로그인
- Session API + Socket.IO 기반 실시간 채팅 이벤트 수신
- 최근 60초 CPM 계산
- 최근 10초 단기 속도 표시
- 총 채팅 수, 최고 CPM, 평균 CPM 표시
- canvas 기반 CPM 그래프
- OBS용 가로형/미니/투명 오버레이
- 테스트용 수동 채팅 추가 버튼
- 서버 재시작 후 저장된 토큰으로 자동 연결 시도
- 사용자별 overlayKey 발급
- 사용자별 Dashboard URL / OBS Overlay URL 제공
- 한 서버에서 여러 사용자의 오버레이를 분리 관리

운영자는 치지직 Developers에서 애플리케이션 등록 후 `.env`에 Client ID와 Client Secret을 입력해야 합니다. 사용자는 OAuth 로그인 후 발급된 OBS URL만 사용하면 됩니다.
```
