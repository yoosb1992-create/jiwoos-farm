# Cloudflare 외부 Staging

목표는 기존 `chatgpt.site`를 유지한 채 동일한 게임을 별도 `workers.dev` 앱에서 실행하여
멀티 실시간 문제의 원인이 Sites 배포 계층인지 A/B 비교하는 것입니다.

## 구조

- 앱: `jiwoos-farm-staging.<account>.workers.dev`
- 실시간: `jiwoos-farm-realtime.<account>.workers.dev`
- 앱 D1: 새 staging DB
- 실시간 이동: 기존 2.3 `RealtimeRoom` Durable Object
- 로그인: 지우네 농장 자체 세션. 기존 Sites에서는 ChatGPT 로그인도 계속 인식합니다.

## 비밀번호 정책

자체 계정 비밀번호는 **2자 이상**만 요구합니다.

- 앱 차원의 최대 길이 제한 없음
- 영문/숫자/특수문자 조합 제한 없음
- 원문 저장 금지
- SHA-256 prehash + salt + PBKDF2-SHA256으로 저장

네트워크/플랫폼 자체 요청 크기 제한은 별개입니다.

## 1. 새 staging D1 생성

```bash
npx wrangler d1 create jiwoos-farm-staging
```

출력의 database id를 환경변수 `JIWOO_D1_DATABASE_ID`에 넣습니다.
기존 Sites DB를 staging에 재사용하지 않습니다.

PowerShell 예:

```powershell
$env:JIWOO_D1_DATABASE_ID="<D1 database id>"
$env:JIWOO_WORKER_NAME="jiwoos-farm-staging"
npm run staging:build
npm run staging:schema -- --fresh
npm run staging:deploy
```

`staging:schema -- --fresh`는 새 DB에서 한 번만 실행합니다.

## 2. Realtime Worker 배포

```bash
npm run realtime:deploy
npx wrangler secret put AUTH_SECRET --config realtime-worker/wrangler.jsonc
```

`AUTH_SECRET`은 24자 이상 난수로 설정합니다.
Realtime Worker는 `.chatgpt.site`와 `.workers.dev` origin을 모두 허용하지만,
실제 접속에는 Sites/App이 발급한 짧은 HMAC token이 반드시 필요합니다.

## 3. 앱 Worker에 실시간 연결값 설정

앱 Worker 배포 후 아래 두 값을 넣습니다.

```bash
npx wrangler secret put FAMILY_REALTIME_SECRET --config dist/server/wrangler.json
npx wrangler secret put FAMILY_REALTIME_URL --config dist/server/wrangler.json
```

- `FAMILY_REALTIME_SECRET`: Realtime Worker의 `AUTH_SECRET`과 동일
- `FAMILY_REALTIME_URL`: 예: `https://jiwoos-farm-realtime.<account>.workers.dev`

## 4. 비교

PC와 모바일에서 새 staging 주소에 각각 자체 계정을 만든 뒤 같은 가족 농장에 참가합니다.

HUD에서 다음을 확인합니다.

- `RT 실시간`
- RTT
- jitter
- 원격 캐릭터 이동 연속성

같은 기기 조합으로 기존 `chatgpt.site`와 staging `workers.dev`를 각각 10분 이상 비교합니다.

### 판정

- staging만 정상: Sites 배포 계층/인증/라우팅 쪽 영향이 큼 → 외부 Cloudflare 이전 진행
- 둘 다 비정상: realtime Worker/클라이언트 경로 자체 수정
- 멀티는 정상인데 맵 편집기만 죽음: 편집기 렌더/메모리 구조 문제로 별도 개선

기존 Sites project, 기존 D1, 기존 FAMILY_ROOM은 이 실험에서 삭제하거나 초기화하지 않습니다.
