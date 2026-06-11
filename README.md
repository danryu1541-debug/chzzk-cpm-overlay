# 치지직 CPM 오버레이 v0.7

치지직 방송 채팅 속도를 OBS 오버레이로 보여주는 중앙 서버형 웹앱입니다.

운영자가 치지직 Developers 애플리케이션을 한 번 등록해두면, 사용자는 개발자센터에 들어가지 않고 치지직 로그인만으로 개인 OBS 오버레이 주소를 받을 수 있습니다.

## 사용자 흐름

```text
1. 서비스 사이트 접속
2. 치지직 로그인
3. 대시보드에서 OBS Overlay URL 복사
4. OBS 브라우저 소스에 붙여넣기
```

사용자는 아래 작업을 하지 않아도 됩니다.

```text
개발자센터 앱 등록
Client Secret 입력
Node.js 설치
npm 명령어 실행
.env 편집
```

## 주요 기능

- 치지직 공식 Open API OAuth 로그인
- 사용자별 overlayKey 발급
- 사용자별 Dashboard URL / OBS Overlay URL 제공
- Session API + Socket.IO 기반 실시간 채팅 이벤트 수신
- 최근 60초 CPM 표시
- 최근 10초 속도 표시
- 총 채팅 수, 최고 CPM, 평균 CPM 표시
- canvas 기반 CPM 그래프
- OBS용 가로형/미니/투명 오버레이
- 서버 재시작 후 저장된 토큰으로 자동 연결 시도

## 운영자 설정

운영자는 치지직 Developers에서 애플리케이션을 등록해야 합니다.

로컬 개발용 Redirect URL:

```text
http://localhost:8787/auth/callback
```

실제 서버용 Redirect URL 예시:

```text
https://your-domain.com/auth/callback
```

필요 Scope:

```text
채팅 메시지 조회
```

`.env` 예시:

```env
CHZZK_CLIENT_ID=your-client-id
CHZZK_CLIENT_SECRET=your-client-secret
CHZZK_REDIRECT_URI=https://your-domain.com/auth/callback
PUBLIC_BASE_URL=https://your-domain.com
PORT=8787
```

로컬에서만 테스트할 때는 아래처럼 둡니다.

```env
CHZZK_REDIRECT_URI=http://localhost:8787/auth/callback
PUBLIC_BASE_URL=http://localhost:8787
```

## 화면 주소

첫 화면:

```text
https://your-domain.com
```

로그인 후 대시보드:

```text
https://your-domain.com/dashboard/사용자키
```

OBS 오버레이:

```text
https://your-domain.com/overlay/사용자키?obs=1&transparent=1
```

미니 오버레이:

```text
https://your-domain.com/overlay/사용자키?mini=1&transparent=1
```

## OBS 등록

OBS에서:

```text
소스 추가
브라우저 선택
로컬 파일 체크 해제
URL에 OBS Overlay URL 붙여넣기
너비 1920
높이 160
```

미니 오버레이 권장 높이:

```text
120
```

## 로컬 개발자용 실행

일반 사용자용 설명이 아니라, 개발/운영자가 로컬에서 확인할 때 쓰는 방법입니다.

처음 한 번:

```text
setup.bat
```

실행:

```text
start.bat
```

명령어로 실행:

```powershell
npm.cmd install
npm.cmd start
```

## 주의

- `.env`에는 Client Secret이 들어갑니다. GitHub에 올리면 안 됩니다.
- `data/`에는 사용자 토큰이 저장됩니다. GitHub에 올리면 안 됩니다.
- 현재 저장 방식은 `data/users.json`입니다. 소규모 테스트용으로 적합합니다.
- 실제 운영에서는 SQLite 또는 PostgreSQL로 이전하는 것을 권장합니다.
- 서버가 꺼져 있으면 OBS 오버레이가 채팅을 받을 수 없습니다.

## Release 문구

### 제목

```text
치지직 CPM 오버레이 v0.7.0
```

### 설명

```markdown
치지직 CPM 오버레이 v0.7.0

중앙 서버형 사용 흐름에 맞춰 첫 화면과 대시보드를 정리한 버전입니다.

주요 변경:

- 첫 화면을 치지직 로그인 중심으로 변경
- 로그인 후 대시보드에서 OBS Overlay URL 복사 버튼 제공
- 기존 설정/테스트 항목을 고급 설정으로 축소
- 직접 연결 실험 버튼 숨김
- README를 중앙 서버형 기준으로 정리
- .bat 설명을 로컬 개발자용으로 낮춤

운영자가 치지직 Developers 애플리케이션을 등록하면, 사용자는 치지직 로그인 후 발급된 OBS URL만 사용하면 됩니다.
```
