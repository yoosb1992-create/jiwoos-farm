# 지우네 농장 · Multiplayer Lab

휴대폰 두 대가 같은 방에서 움직이며 **내 캐릭터의 즉시 반응과 상대 캐릭터의 부드러운 이동**을 확인하는 독립 실험입니다. 농사·NPC·아이템은 포함하지 않습니다.

**현재 공개 서비스는 아직 실행되지 않습니다.** Railway 로그인과 독립 Lab 프로젝트, Backend/Frontend 서비스·공개 도메인 생성 및 실행 설정은 완료했습니다. GitHub의 Railway App 설치 화면에서 이 저장소만 선택했으며, 마지막 **Install & Authorize** 승인이 남았습니다. Source·실험 브랜치·Wait for CI와 코드 배포는 아직 진행하지 않았습니다. [Frontend 주소](https://frontend-production-768e.up.railway.app)는 생성되었지만 아직 오프라인이며, 실제 브라우저 접속에서도 Railway의 404 안내 페이지를 확인했습니다. [Railway 배포 기록과 남은 단계](./RAILWAY.md)를 참고하세요. 배포가 완료되면 플레이하는 사람은 아래 순서만 따르면 됩니다. PC, 터미널, Node.js, Docker 설치는 필요 없습니다.

## 휴대폰 두 대로 플레이

1. 두 휴대폰의 Chrome에서 배포된 **Frontend의 HTTPS 주소**를 엽니다. Backend 주소는 게임 화면 주소가 아닙니다.
2. 휴대폰 A에서 닉네임을 입력하고 **방 만들기**를 누릅니다. 화면의 방 코드를 B에게 알려줍니다.
3. 휴대폰 B에서 다른 닉네임과 같은 방 코드를 입력하고 **참가**를 누릅니다.
4. 서로 다른 색과 이름의 플레이어 두 명, 연결됨 상태, HUD의 인원 2를 확인합니다.
5. 세로 화면에서 왼쪽 조이스틱을 움직입니다. 오른쪽 **Run**을 다른 손가락으로 함께 누르면 달립니다. 대각선 이동, 손가락 떼기, 가로/세로 전환도 확인합니다.
6. 먼저 두 휴대폰을 같은 Wi-Fi에 연결합니다. 이어서 A는 Wi-Fi를 유지하고 B는 Wi-Fi를 끄고 5G/LTE로 같은 공개 주소에 접속합니다. 다른 네트워크에서도 같은 방이 보여야 합니다.

인터넷에 배포한 주소를 쓰므로 같은 Wi-Fi에서도 PC의 IP 주소, 공유기 포트 설정, 로컬 서버는 필요 없습니다. 태블릿도 같은 주소와 조작을 사용합니다. PC를 이용한다면 WASD/방향키 이동, Shift 달리기도 지원합니다.

연결이 잠깐 끊기면 화면에 **재연결 중**이 표시됩니다. 최대 10회 시도하며 서버는 30초 동안 같은 플레이어의 자리를 보존합니다. 복구 후 조이스틱을 다시 누르세요. 실패하면 같은 코드로 다시 참가하거나 새 방을 만들 수 있습니다. 서버 재배포·재시작으로 사라진 방은 새로 만들어야 합니다.

## Network HUD

**HUD 숨기기 / HUD 표시**로 켜고 끕니다. 화면 녹화와 함께 다음 값을 관찰하면 원인 구분에 도움이 됩니다.

| 표시 | 의미 |
|---|---|
| FPS | 실제 렌더링 프레임 측정값 |
| 연결 상태 / 현재 Room / 인원 | 실제 접속 상태와 같은 방의 플레이어 수 |
| RTT / Ping | SDK acknowledgment 기반 왕복 시간. 첫 측정 전에는 측정 중 |
| Server tick / patch rate | 서버 simulation 설정 주기 / 실제 state patch 수신 빈도 |
| Local / Authoritative position | 로컬 예측 위치 / 마지막으로 받은 서버 위치 |
| correction / drift | 같은 입력 시점의 prediction 오차와 보정 관찰값 |
| reconnect | 성공 횟수와 진행 중인 시도 횟수 |
| input ack / sent | 서버가 처리한 입력과 보낸 입력의 수 |

로컬과 최신 서버 위치 사이의 거리는 RTT 때문에 정상적으로 생길 수 있습니다. 이를 prediction 보정 오차와 혼동하지 마세요. WebSocket은 TCP 기반이며 가짜 packet-loss 수치를 표시하지 않습니다. 공개 배포의 인위적 추가 지연은 **0ms**입니다. 이는 실제 인터넷 RTT가 0이라는 뜻이 아닙니다.

## 휴대폰·태블릿 benchmark

다음은 실제 기기에서 아직 수행해야 하는 검사입니다. headless 브라우저의 모바일 화면 크기 테스트가 실제 Android/5G 테스트를 대신하지 않습니다.

| Test | 조합 | 상태 |
|---|---|---|
| A | Android Chrome 두 대 / 같은 Wi-Fi | 공개 배포 후 실제 기기 확인 필요 |
| B | Android A Wi-Fi + Android B 5G/LTE | 공개 배포 후 실제 기기 확인 필요 |
| C | Android Chrome + 태블릿 / 세로·가로 전환 | 공개 배포 후 실제 기기 확인 필요 |

각 조합에서 다음을 확인합니다.

- [ ] 걷기 30초, 빠른 방향 전환, 원형 이동
- [ ] 조이스틱 + Run 두 손가락 동시 입력, 달리다가 멈추기
- [ ] 대각선 이동, 맵 가장자리와 장애물에 부딪히기
- [ ] 두 명이 동시에 이동하며 5분 이상 계속 플레이하기
- [ ] 세로/가로 전환, 조작 영역 밖으로 손가락 이동 후 떼기
- [ ] 앱을 백그라운드로 보냈다가 복귀하기
- [ ] Wi-Fi를 잠깐 끊었다 복구하고 재연결 확인하기
- [ ] 30초보다 오래 단절한 뒤 수동으로 다시 참가하기
- [ ] 재접속 후 유령 플레이어, 계속 눌린 입력, 중복 플레이어가 없는지 확인하기

| 날짜 / 기기 / 네트워크 | local input delay | remote stutter | teleport | reconciliation jump | disconnect / reconnect | RTT / FPS |
|---|---|---|---|---|---|---|
| 미실시 | | | | | | |

통과 기준은 입력 후 서버 왕복을 기다리지 않고 로컬이 움직이며, 상대가 patch마다 계단식으로 이동하지 않고, 장애물에서 반복적인 순간이동이 없으며, 재연결 후 입력과 인원이 정상인 것입니다. 측정하지 않은 수치는 추정해서 기록하지 않습니다.

## Architecture

Phaser client는 입력을 WebSocket으로 Colyseus에 보내고, 서버의 authoritative simulation 결과를 state patch로 받습니다. 클라이언트는 서버에 최종 x/y 좌표를 보내지 않습니다.

| 구분 | 구현 |
|---|---|
| Colyseus | `@colyseus/core` 0.18.18 / `@colyseus/sdk` 0.18.5 / Schema 5.0.36 / WebSocket transport 0.18.4 |
| 서버 | 장기 실행 Node.js, `defineInput()` + `setFixedTimestep()`, **30 tick/s** |
| state 전송 | Schema 변경 필드 patch, 목표 **30회/s** |
| 입력 | `moveX`, `moveY`, `run`; SDK sequence/acknowledgment |
| 로컬 | 공식 SDK prediction, 서버 상태에서 미확인 입력 재실행, 화면 보정 smoothing |
| 상대 | **100ms** 지연 snapshot 사이 interpolation, 렌더링 목표 60 FPS |
| 공용 simulation | `shared/applyMovement.ts`, 대각선 정규화·맵 경계·장애물 충돌 |
| 저장 | Room 메모리만 사용. DB 없음. 프로세스 재시작 시 방 소멸 |
| 배포 | Frontend HTTPS 정적 파일 서비스 + Backend WSS Colyseus 서비스 |

서버는 입력 범위·유한값·버퍼와 메시지 속도를 제한합니다. 기본 한 tick당 입력 하나를 처리하며, 짧은 TCP 지연 후 실제 놓친 tick 예산 안에서만 최대 두 입력을 처리합니다. 심한 장기 backlog는 같은 플레이어의 제한된 reconnect로 정리합니다. 수치와 세부 설계는 [개발 참고](./DEVELOPMENT.md)에 있습니다.

## 격리와 제한사항

대상은 `yoosb1992-create/jiwoos-farm`의 `experiment/v2.4-multiplayer-lab-colyseus` 브랜치이며 기준 커밋은 `23d6b3a4f7fa5105977062c6678e1a21f818efc1`입니다. 기존 게임 코드·인증·D1·저장 데이터·`FAMILY_ROOM`·기존 Sites/Cloudflare 배포를 재사용하거나 변경하지 않습니다. 루트 TypeScript 설정은 Lab 제외 경계만 추가하며 Lab 전용 CI를 사용합니다.

- 방 코드와 닉네임은 실험용이며 계정 인증·영구 저장·다중 서버 운영 기능은 없습니다. Backend는 **1 replica**로 실행합니다.
- 네트워크 장기 단절이나 모바일 OS의 백그라운드 중단에서는 부드러운 연속 이동을 보장할 수 없습니다.
- 정적 2D 맵만 검증합니다. 플레이어 간 물리 충돌, 농사·NPC·광산 등은 포함하지 않습니다.
- `NetworkAdapter` 경계는 마련했으나 Cloudflare DO 비교 백엔드는 구현하지 않았습니다. 기존 `FAMILY_ROOM`은 그대로입니다.
- 공개 서비스 기동과 실제 Android/5G 검증이 남아 있으므로 기존 농장 이식 판단은 **NOT READY**입니다. 배포와 위 benchmark를 통과한 뒤 이식을 판단합니다.

## 관련 문서

- [RAILWAY.md](./RAILWAY.md): 휴대폰 브라우저로 최초 배포·자동 배포 설정
- [VALIDATION.md](./VALIDATION.md): 실제 자동 테스트·빌드 결과와 미검증 항목
- [DEVELOPMENT.md](./DEVELOPMENT.md): 유지보수자용 로컬 실행, 환경변수, Docker, 지연 시뮬레이션, 자동 검증 명령 — 플레이 사용자에게 필요 없음
- [Colyseus server input](https://docs.colyseus.io/netcode/server-input), [prediction/reconciliation](https://docs.colyseus.io/netcode/client-prediction), [determinism](https://docs.colyseus.io/netcode/determinism)
