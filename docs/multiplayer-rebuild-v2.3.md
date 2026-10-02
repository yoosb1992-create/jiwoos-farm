# 지우네 농장 2.3 — Multiplayer Rebuild

## 결론

기존 2.2의 멀티 경로는 더 이상 확장하지 않는다.

기존 구조는 ChatGPT Sites 안에서 D1 presence, Next/vinext API, custom Worker WebSocket,
Durable Object, WebRTC signaling을 여러 단계로 겹쳐 사용하면서 다음 문제가 반복되었다.

- Sites WebSocket upgrade가 실제 배포 환경에서 안정적으로 유지되지 않음
- WebSocket 장애 시 D1 HTTP presence가 이동 경로까지 떠맡아 0.2~0.3초 지연이 발생
- 이동 위치와 영구 게임 상태 검증이 서로 얽혀 모바일 행동까지 실패
- D1 revision 충돌과 presence freshness가 클라이언트 입력 결과에 영향을 줌
- 실시간 transport가 실패할 때 fallback이 많아져 원인 분리가 어려움

2.3부터 **이동과 영구 상태를 완전히 분리**한다.

## 새 구조

### A. 전용 Realtime Worker

Sites와 별개의 Cloudflare Worker를 배포한다.

```
브라우저 A ─┐
            ├─ wss://<realtime-worker>/connect ─ RealtimeRoom Durable Object
브라우저 B ─┘
```

이 Worker의 역할은 딱 세 가지다.

1. 참가자 접속/퇴장
2. 캐릭터 이동/방향/달리기/애니메이션 상태 실시간 중계
3. RTT/지터 측정

D1을 사용하지 않는다.
농장 저장, 돈, 아이템, 작물, 건물 등은 절대 이 Worker가 변경하지 않는다.

### B. 기존 Sites + D1

```
브라우저 → Sites API → D1
```

다음만 담당한다.

- 가족방
- 농장/인벤토리/돈
- 작물/나무/광산/건물
- 제작/상점/보관함
- 날짜/시간
- 저장 상태

**캐릭터 이동을 D1 presence로 렌더링하지 않는다.**

## 이동 프로토콜

클라이언트는 약 20~30Hz snapshot과 상태 변경 즉시 packet을 보낸다.

- x / y
- vx / vy
- facing
- moving
- running
- mapId
- selectedTool
- seq

서버는 room 안의 다른 참가자에게 최신 packet을 즉시 broadcast한다.

전체 room snapshot을 매 packet마다 보내지 않는다.
한 플레이어의 움직임은 한 플레이어의 delta packet으로 전달한다.

## 화면 처리

로컬 캐릭터:
- 입력 즉시 로컬 physics로 이동
- 네트워크 응답을 기다리지 않음

원격 캐릭터:
- 최신 pose + velocity를 받음
- 짧은 dead reckoning만 사용
- 다음 packet으로 오차만 보정
- 오래된 seq는 폐기

목표:
- 같은 한국 네트워크 환경에서 체감 이동 지연 50~100ms 이하
- remote movement packet cadence 20~30Hz 이상
- 화면 60fps 유지

## 영구 행동

농사/도끼/물주기 등의 결과는 기존 D1 API가 권위 상태를 가진다.

하지만 2.3에서는 **D1 presence의 이전 위치를 행동 허가 조건으로 사용하지 않는다.**

가족 멀티는 신뢰 가능한 소규모 플레이를 전제로 하고,
행동 요청 자체의 pose + target + 거리 + 맵 상태를 검증한다.

이렇게 해서 realtime transport 장애가
농사/터치 행동 실패로 전파되지 않도록 한다.

## 장애 정책

Realtime Worker가 끊기면:

- 로컬 플레이/농사 행동은 계속 가능
- 원격 캐릭터는 연결 끊김 표시 후 숨김
- D1 polling을 캐릭터 이동 fallback으로 사용하지 않음

즉 느린 가짜 멀티보다 명확한 연결 끊김을 선택한다.

## 배포 분리

- Sites: 기존 지우네 농장 프로젝트
- Realtime: 별도 Cloudflare Worker `jiwoos-farm-realtime`
- 기존 D1: 그대로 유지
- 기존 FAMILY_ROOM: 2.2 호환을 위해 당장 삭제하지 않지만 새 이동 경로에서는 사용하지 않음

## 단계

### Phase 1 — 전용 Worker
- 독립 Worker + Durable Object
- join/leave
- pose delta broadcast
- ping/pong RTT
- no D1

### Phase 2 — Client Transport 교체
- 기존 WebSocket/WebRTC/D1 movement fallback 제거
- 전용 Worker 연결
- remote avatar delta 적용
- HUD에 RTT/jitter 표시

### Phase 3 — Action 분리
- D1 presence 기반 위치 검증 제거
- action.pose 자체 검증
- idempotent action id 추가
- revision conflict 자동 retry

### Phase 4 — 안정화
- PC↔PC
- PC↔모바일
- 모바일↔모바일
- Wi-Fi↔5G
- 30분 장시간 접속
- 맵 이동/백그라운드 복귀

## 합격 기준

다음 조건을 모두 만족할 때만 2.3 멀티를 완료로 본다.

- 두 플레이어가 10분 이상 접속 유지
- 이동 중 주기적인 0.2~0.3초 순간이동이 없음
- 터치 이동/행동 결과 누락이 없음
- 한 플레이어가 네트워크를 끊어도 다른 플레이어의 게임 상태가 깨지지 않음
- realtime 장애가 D1 영구 상태를 훼손하지 않음


## 구현 체크포인트 (현재 브랜치)

현재 `feature/v2.3-multiplayer-rebuild`에는 다음이 구현되어 있다.

- 전용 `realtime-worker` + `RealtimeRoom` Durable Object
- Sites가 Family membership을 확인하고 60초 signed HMAC 접속 token 발급
- 브라우저 secret 노출 없음
- Worker는 D1 binding 없이 transient movement만 처리
- 게임 클라이언트는 `DedicatedFamilyRealtimePresence`를 사용
- player별 pose delta 30Hz 전송 + 상태 변경 즉시 flush
- room 전체 snapshot을 매 movement packet마다 보내지 않음
- RTT / jitter ping-pong 진단
- realtime 장애 시 D1 movement fallback 금지
- D1 heartbeat는 sleep/online 판정용 저빈도 heartbeat만 유지
- 물 채우기/광산/낚시/배치가 D1 movement freshness에 의존하지 않도록 분리

### 배포 전 필요한 값

Realtime Worker와 Sites는 동일한 임의 secret을 공유해야 한다.

- Worker secret: `AUTH_SECRET`
- Sites secret: `FAMILY_REALTIME_SECRET`
- Sites variable: `FAMILY_REALTIME_URL=https://<deployed-realtime-worker>`

이 값들이 연결되기 전에는 Sites의 realtime ticket API가 503을 반환하며,
게임의 영구 상태/싱글 플레이에는 영향을 주지 않는다.
