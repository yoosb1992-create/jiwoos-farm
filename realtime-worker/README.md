# Jiwoos Farm Realtime Worker

지우네 농장 2.3부터 캐릭터 이동은 Sites/D1과 분리된 이 Worker가 담당합니다.

## 역할

- WebSocket room
- join / leave
- 플레이어별 pose delta broadcast
- ping / pong RTT 측정

D1, 돈, 인벤토리, 작물, 건물 등 영구 상태는 절대 수정하지 않습니다.

## 인증

Sites의 `/api/family/realtime`가 로그인과 Family membership을 확인한 뒤
60초짜리 HMAC 접속 토큰을 발급합니다.

Sites와 이 Worker는 동일한 secret을 사용해야 합니다.

Worker:

```bash
npx wrangler secret put AUTH_SECRET --config realtime-worker/wrangler.jsonc
```

Sites:

- `FAMILY_REALTIME_SECRET` = Worker의 `AUTH_SECRET`와 동일한 값
- `FAMILY_REALTIME_URL` = 배포된 Worker의 HTTPS base URL

예:

```
FAMILY_REALTIME_URL=https://jiwoos-farm-realtime.<account>.workers.dev
```

브라우저는 secret을 받지 않으며, Sites가 발급한 짧은 수명의 signed token만 받습니다.

## 실행

```bash
npm run realtime:dev
npm run realtime:deploy
```

## 장애 정책

Realtime Worker가 끊기면 원격 캐릭터는 연결 끊김으로 처리합니다.
D1 polling을 캐릭터 이동 fallback으로 사용하지 않습니다.
로컬 이동과 D1 기반 농사/저장은 계속 동작합니다.
