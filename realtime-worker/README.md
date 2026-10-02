# Jiwoos Farm Realtime Worker

지우네 농장 2.3 멀티 재구축용 **전용 실시간 서버**입니다.

이 Worker는 Sites와 별도로 배포합니다.

## 역할

- WebSocket room
- 참가자 join/leave
- pose delta broadcast
- ping/pong RTT

D1과 영구 게임 상태는 다루지 않습니다.

## 로컬 실행

루트에서:

```bash
npm run realtime:dev
```

## 배포

Cloudflare 로그인 후:

```bash
npm run realtime:deploy
```

첫 배포 뒤 발급되는 `https://jiwoos-farm-realtime.<account>.workers.dev` 주소를
Sites 클라이언트 transport 설정에 연결합니다.

## WebSocket

```
wss://<worker>/connect?room=<roomId>&player=<playerId>&nick=<nickname>&session=<sessionId>
```

현재 Worker는 transient movement 전용입니다.
영구 상태 보안과 권위는 기존 Sites/D1 API가 담당합니다.
