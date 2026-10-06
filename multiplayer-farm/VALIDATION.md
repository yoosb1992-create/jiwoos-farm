# v2.5 공개 검증 기록 — 2026-10-06

판정: **PLAYABLE WITH ISSUES**. 실제 공개 농장 플레이·영구저장을 검증했으며, 원본 콘텐츠의 모든 세부 기능과 실제 Android 체감 검증을 완료했다는 의미는 아닙니다.

## 공개 주소 / 격리

- 게임: https://frontend-production-a998.up.railway.app/
- Backend health: https://backend-production-b244e.up.railway.app/healthz
- WSS: `wss://backend-production-b244e.up.railway.app`
- Railway: `jiwoos-farm-v2-5` / `60e07bfd-eb89-4879-b082-f57a565fff1a`
- Backend: `3ba7c9b3-c4fb-4834-a064-1834332fdcdd`
- Frontend: `fb649095-e189-468d-95d1-f9417fe0d25e`
- Postgres: `2abd4aef-4cdf-4f39-93b3-c1dc95201b0a` + 전용 volume
- 세 서비스 Singapore, 앱 1 replica, Serverless 끔, PostgreSQL private networking만 사용.
- 두 앱은 이 저장소의 `feature/v2.5-multiplayer-farm-rebuild`만 자동 배포. Wait for CI 켬.
- `982a94dec72ac7d125d55050f707f635c4407fd5`에서 분기. Golden Lab 디렉터리·기존 Lab CI는 byte-identical gate로 보존. main/experiment ref를 변경하지 않음.
- 기존 Production/Sites/Cloudflare/D1/FAMILY_ROOM/auth/save 및 기존 Railway Lab 프로젝트 미변경. root `tsconfig.json`에는 새 독립 패키지 exclude만 추가.

## 재현 가능한 증거

아래 첫 공개 실행은 런타임 변경 commit `53b4d03ec84777b32ab77b9cd64b12a38048408d`를 배포한 서버를 검증했습니다. 검증 스크립트 revision은 후속 `f5df60873011bfb41485f27736a7b9e9a35a5f34`입니다. 검증 revision과 배포 revision을 동일하다고 간주하지 않습니다. 후속 수정에서는 브라우저 뒤로가기의 bfcache 복귀 시 폐기된 canvas/socket을 저장된 세션으로 재구축하도록 처리했고 개발·production 브라우저 검사에 페이지 이탈/복귀를 추가했습니다. 각 최종 revision의 CI는 GitHub branch Checks에서 확인할 수 있습니다.

| 검증 | 결과 | GitHub Actions |
|---|---|---|
| 기존 게임 dependency install / regression batch / build | PASS | [CI](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37444900667) |
| Farm strict / unit / integration / PostgreSQL / browser / build / Docker | PASS | [Farm v2.5](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37444900751) |
| Golden Lab 파일 동일성 및 모든 기존 검증 | PASS | 위 Farm workflow의 `golden-lab-regression` job |
| 실제 인터넷 HTTPS + WSS / SDK3 / browser2 | PASS | [Public Smoke](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37444900803) |
| 실제 공개 Backend 프로세스 재시작 후 DB 복원 | PASS | [Public Restart](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37444900954) |

Farm 자동 테스트: **30개 통과, 0 실패** — unit14, real SDK integration6, PostgreSQL migration/transaction1, static deployment6, development browser2, production browser1. 추가로 Docker2개 build/run/health/restart/graceful-stop gate를 통과했습니다. CI integration은 실제 PostgreSQL17을 사용합니다. 로컬 memory test double을 실제 DB 테스트라고 보고하지 않습니다.

Golden Lab: unit22 + SDK integration23 + static deployment6 + browser4 + production browser1 = **56개 통과**. 기존 게임 regression은 기존 단일 assertion batch를 그대로 실행했고 통과했습니다.

Production client와 compiled server 모두 build 성공. Phaser chunk는 약1.2MB raw/319KB gzip이고 게임 entry는 약302KB raw/91KB gzip입니다. 큰 chunk 경고는 남아 있으나 빌드 실패는 아닙니다. 생산 번들에서 localhost/127.0.0.1/LAN endpoint 검사를 통과했습니다.

## 요구사항 25개 대응

| 요구 | 실제 검증 |
|---|---|
| 1–3 같은 농장 / 양쪽 이동 / 서버 위치 권한 | SDK3 같은 room, 양방향 input, state 수렴, 좌표 메시지 주입 무효 |
| 4 원격 interpolation | 실제 browser2, 추가 RTT200ms, 렌더된 중간 좌표와 서버 좌표를 별도 측정 |
| 5 reconnect | WebSocket 종료→동일 세션 복귀, peer connected state 확인 |
| 6–8 심기 / 물 / 수확 한 번 | SDK3 state 공유, 수면3일 성장, SDK2 동시 수확 한 명만 성공 |
| 9–10 나무 동시 타격 / 중복 드랍 없음 | SDK3 동시3타, 그루터기1개, wood drop1개 |
| 11 같은 drop pickup | SDK2 동시 요청 중 한 명만 성공 |
| 12 공유상자 동시 인출 | wood1 deposit 후 SDK2 동시 withdraw, 한 명만 성공 |
| 13–14 제작 재료·중복 패킷 | 재료 부족 거부, 같은 actionId 동시 성공 응답은 같은 receipt/revision, 결과1개 |
| 15–16 stamina / range | SDK에서 기력0·원거리 도구 요청 거부, unit 앞칸·달리는 중 심기 거부 |
| 17–18 inventory / crop / tree 주입 | parser whitelist 및 SDK 직접 상태 메시지 무효 |
| 19–21 수면 / 날짜 / 숲 reset | 온라인3명 투표 후 공유 day 증가, 이전 날짜 forest ID 제거 |
| 22–23 광산 해금 / 동시 광석 | SDK3 한 rock 경쟁, 유효2타만 승인·drop1개·사다리로2층 해금 |
| 24 reconnect 후 수렴 | SDK 복구 후 peer 상태·이동, browser 새로고침 및 공개 복구 |
| 25 서버 재시작 DB 복원 | 새 server/store instance + 실제 Railway Backend Restart 후 crop/water/개인씨앗11개 복원 |

추가: 가공기 입력 차감·시간 전 수거 거부·보상1회, 낚시 입질시간·경로·보상1회, scrypt 긴 비밀번호 검증. sleep/harvest/drop/chest/craft/mine 경쟁은 실제 네트워크 clients로 실행했습니다.

## 공개 테스트 세부

- 공개 health HTTPS200, `database=true`, tick30/patch30, production latency0.
- SDK3: 새 disposable 농장 생성→같은 권위 room→A/B 이동→C 상태수신/수렴→괭이/심기/물주기→WebSocket reconnect→room을 비운 후 새 authority가 DB에서 복원.
- 실제 공개 production browser2(390×844) + SDK observer1: farm load/상대 canvas 이동/심기/물주기/씨앗11/새로고침/나무3타→그루터기/드랍3개 줍기/가방 wood1. 개발 hook이 bundle에 없고 page error0.
- 별도 dev browser: joystick+RUN 두 pointer 동시 입력·가방·action·복구. 추가 RTT200ms에서 로컬 렌더가 authority 변화 전에 반응하고 원격의 중간 렌더 좌표를 확인.
- 09:43:40 UTC 재시작 probe가 영구 작물 상태를 저장하고 대기. Railway에서 **새 v2.5 Backend만 Restart**. 09:45:27 UTC health uptime의 새 프로세스 시작을 확인하고 기존 session으로 DB 상태 복원 성공 (`processRestart=true`).
- 공개 probe 관측 patch rate 약30.3Hz, arrival gap p95 약34.5ms(한 번의 GitHub runner 관측). 앞선 실행은30.4Hz /51.2ms. Android RTT/FPS나 장시간 성능 수치로 일반화하지 않습니다.
- 초기 기본 profile은 검증된 Stable100ms. Fast75/Aggressive60은 사용자 선택 기능이며 한국 실제 모바일 네트워크에서 더 낫다는 판단은 아직 하지 않았습니다.

## Persistence / 보안

Migration1: `farms`, `members`, `sessions`, `action_receipts`, `world_checkpoints` 및 `farm_migrations`. 중요 command는 가족별 queue에서 검증 후 한 SQL transaction으로 world JSONB·revision·receipt·checkpoint를 함께 commit하고 나서 state를 공개합니다. 같은 농장은 DB session advisory lease를 하나만 획득합니다. 위치를 매 tick DB에 기록하지 않습니다.

서버 시작 migration, 5초 checkpoint, leave/empty/graceful shutdown과 재시작 복원을 검증했습니다. 가족 비밀번호 salted scrypt, session random256-bit + DB token hash. 정확한 Origin allowlist, payload/rate/수량/거리/기력/도구 검증 유지. 생산 서버는 DB 설정이 없으면 시작하지 않으며 memory fallback이 없습니다. DB 연결 비밀은 Railway reference variables만 사용합니다.

## 남은 범위 / 수동 검증

- 실제 Android2대·태블릿, Wi-Fi↔5G, 5분 이상 조작, 백그라운드/복귀, 순간 단절, pinch zoom의 기기별 감도는 아직 수동 검증 필요. Headless 검증은 실제 기기 검증이 아닙니다.
- 원본의 모든 관계/퀘스트/이벤트, 건물 확장·동물·개인 외형, map editor는 미이식. NPC는 기본 schedule/대화/수확퀘스트입니다.
- 숲/광산은 새 결정적 서버 배치, 낚시는 서버 검증 미로로 다시 작성했습니다. 기존 미니게임 UI/전체 원본 콘텐츠를 그대로 옮긴 것은 아닙니다.
- 동적 나무 몸통 충돌 및 길찾기는 미구현. 정적 집/울타리/물/맵 가장자리 충돌은 공용 movement에 구현. 화면 탭 이동은 직선 입력으로 장애물을 우회하지 않습니다.
- 로그아웃/브라우저 저장소 삭제 후 같은 플레이어 복구 UI는 미구현. 현재는 저장된 session을 유지하고 새로고침하는 방식으로 복귀합니다. 다른 기기에는 다른 닉네임을 사용합니다.
- 단일 replica/소규모 가족용이며 여러 서버 sharding·대규모 부하·DB 장애 복구 정책의 장기 운영 검증은 미완료.
- 현재 Railway 계정은 Trial 화면으로 확인됐습니다. 크레딧/기간이 끝나기 전 사용자 계정에서 요금제를 확인해야 합니다. 유료 결제나 요금제 변경은 수행하지 않았습니다.

## 모바일 유지보수

일상 플레이에는 공개 게임 URL만 필요합니다. GitHub push 후 CI 성공 시 Railway가 자동 재배포합니다. 공개 검사 재실행은 위 Public Smoke Actions 실행의 `Re-run all jobs`를 사용할 수 있습니다.

Public Restart workflow는 운영 중 자동 반복하지 않는 의도적인 점검입니다. 해당 실행을 다시 시작하면 smoke step이 준비된 뒤 **jiwoos-farm-v2-5 → Backend → Active deployment → Restart**를 누릅니다. 새 DB/Frontend 또는 기존 Lab을 재시작할 필요는 없습니다. 정상 CI/Docker restart test는 이 수동 절차에 의존하지 않습니다.
