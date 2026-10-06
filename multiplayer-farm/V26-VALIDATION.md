# v2.6 validation record

기준: `feature/v2.5-multiplayer-farm-rebuild` / `3fad61ce6c567fe5449371e8ecf871282b6b69df`.
새 브랜치: `feature/v2.6-farm-content-expansion`.
검증 완료 런타임: `5b518b53c8033c4d13c90b85c2256a3551397e62` (2026-10-06). 이후 문서/배포 설정표 변경은 런타임 변경이 아닙니다.

## 실제 로컬 자동 검증

- strict TypeScript: PASS
- unit 14/14: PASS. 기존 낚시 경로 테스트를 bite/hook/경과시간/hold 입력 replay/1회 보상 검증으로 교체.
- integration 6/6: PASS. 3 SDK client 이동/경쟁 action/중복 receipt/공유 농사/재접속/별도 서버 복원. 이 실행은 명시적 MemoryTestStore를 사용했으며 PostgreSQL 결과로 표현하지 않습니다.
- static deployment 6/6: PASS
- browser 2/2: PASS. 모바일 390×844의 두 context/joystick+RUN/가방/새로고침/뒤로 가기; 200ms RTT 조건의 prediction-before-authority/remote interpolation.
- 기존 모바일 smoke에 작물/물고기 도감 열기/스크린샷을 추가하여 재실행: 1/1 PASS.
- production server TypeScript build: PASS
- production client Vite build: PASS (`VITE_MULTIPLAYER_SERVER_URL=wss://farm-validation.invalid`). 주소 미지정 build는 의도대로 거부되는 것도 확인. Phaser vendor chunk 약1.20MB/319KB gzip 경고는 유지되며 앱 chunk 약352KB/110KB gzip.
- production 앱 endpoint: WSS validation host 사용, 개발 ws://localhost·ws://127.0.0.1 미포함. Railway 전환 시 기존 공개 Backend domain reference variable로 재빌드됩니다.
- `git diff --check`: PASS. Golden Lab 파일 변경 없음.

## GitHub CI

런타임 HEAD 기준:

| 검사 | 결과 | 실행 |
|---|---|---|
| 기존 게임 CI | SUCCESS | [37458706347](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37458706347) |
| Farm 전체 + Golden Lab 회귀 | SUCCESS | [37458706245](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37458706245) |
| Farm strict / unit / SDK integration | PASS / 14/14 / 6/6 | 위 Farm job 112252560654 |
| PostgreSQL migration/transaction/restore + schema isolation | 1/1 PASS | 동일 job, PostgreSQL 17 disposable service |
| Static deployment / browser / production browser | 6/6 / 2/2 / 1/1 PASS | production browser는 두 browser context와 실제 UI를 사용 |
| Farm client/server build, Docker 두 이미지 | PASS | 동일 job |
| Docker migration/health/restart/graceful shutdown | PASS | database=true, latencyMs=0, tickRate=30 및 정상 exit 검증 |
| Golden Lab unit / integration / deployment | 22/22 / 23/23 / 6/6 PASS | job 112253577855 |
| Golden Lab browser / production browser | 4/4 / 1/1 PASS | 동일 job |
| Golden Lab byte-identical gate | PASS | 기준 982a94d와 파일 비교 |

Farm 30개 및 Lab 56개 검사가 모두 통과했습니다. clean install과 production build도 실행했습니다. DB 검사에서 동명 `public.farms`의 열/데이터를 sentinel로 유지한 채 `farm_v26`에 새 schema를 생성하고 재접속 복원했습니다. 이 sentinel은 CI의 일회용 DB에만 만들었습니다. 실제 Railway DB에는 아직 v2.6 migration을 실행하지 않았습니다.

중간 후보에서 낮은 software-GPU FPS 때문에 짧은 행동 터치가 다음 render 전에 끝나 누락되는 문제가 발견되어, pointerdown/첫 Space 입력에서 즉시 action을 전송하도록 수정했습니다. 모바일 pinch zoom 시 계절 overlay 좌표도 보정했습니다. Lab의 프레임 수 샘플 검사는 간헐적으로 28프레임(기준 30)으로 실패했습니다. 최종 run의 해당 Lab job만 재실행하여 attempt 2에서 통과했으며 Lab 파일과 검사 기준은 변경하지 않았습니다. 실패한 검사를 끄거나 배포 gate를 우회하지 않았습니다.

문서/설정표 후보 30ed646의 production browser에서 행동 입력 누락이 다시 재현되었습니다. 진단 중 재연결 상태에서는 인원수가 그대로 유지되어도 행동 전송이 불가능한 구간을 확인했습니다. 후속 5b518b5에서 이벤트 직전 최신 connection snapshot을 확인하고, 재연결 중 행동 버튼을 비활성화하며 이동/반복 입력을 해제하고 복구 안내를 표시합니다. 기존 browser helper도 단순 인원수/좌표 클릭 대신 실제 연결 상태와 버튼 actionability를 기다립니다. 나무 HP·드랍·가방·공유 상태의 기존 assertion은 유지합니다. 로컬 production client 진단은 MemoryTestStore로 1/1 통과했고, 최종 GitHub CI는 실제 PostgreSQL로 전체 통과했습니다.

새 기능마다 테스트 파일을 늘리지 않았습니다. 이번 자동 검증 확대는 기존 낚시 의미 변경과 기존 모바일 smoke의 도감 확인 정도이며, 콘텐츠 구현·미감·모바일 정보 구조에 작업을 집중했습니다. Headless를 실제 Android 검증으로 부르지 않습니다.

## Railway / 공개

신규 프로젝트 생성은 Railway 무료 플랜 리소스 한도로 거절되어 새 리소스를 할당하거나 결제를 변경하지 않았습니다. 사용자가 허용한 기존 Farm 서비스 Source 전환을 준비했습니다. 기존 v2.5 브랜치·public 저장 테이블·브라우저 세션은 보존하며 새 코드는 farm_v26/schema와 별도 세션을 사용합니다.

CI 성공 후 실제 deploy 적용을 요청했으나 도구가 **“Cancelled — the user did not approve this action. No changes were made.”**를 반환했습니다. 우회하지 않았습니다. 재조회 결과 Frontend/Backend/Postgres는 기존 deployment로 online이고, Source/watchPatterns 7개 변경은 staged로 남아 있습니다. 실제 v2.6 공개 배포·HTTPS/WSS·공개 3 SDK/2 browser smoke는 **미실행**입니다. CI production browser 성공을 공개 서버 성공으로 표현하지 않습니다.

- 공개 Frontend (현재 v2.5): https://frontend-production-a998.up.railway.app/
- 공개 Backend: https://backend-production-b244e.up.railway.app/healthz
- staged patch: d6a45d10-78f9-4a68-8e7b-65c6c42d694b
- 기존 Frontend deployment: 0aac4127-7694-433a-8f08-a943f810b398
- 기존 Backend deployment: ffdf8a3b-ec18-4b22-9ada-707fd5377ce5
- Postgres service/volume 변경 없음. main/Sites/D1/FAMILY_ROOM/Lab 배포 변경 없음.

휴대폰에서 적용하는 정확한 경로와 공개 smoke/복구 방법은 [RAILWAY-V26.md](./RAILWAY-V26.md)에 있습니다. 판정: **CONTENT EXPANDED WITH ISSUES** — 콘텐츠 구현과 CI 완료, 공개 전환은 승인 대기.

## 수동 확인

README의 실기기 체크리스트가 남아 있습니다. 핵심: Android Wi-Fi↔5G, 5분 이동/발열, 터치 낚시 난이도, 계절 전환, 동물 생산/공유 pickup, 신규 v2.6 PostgreSQL 재배포 복원, 행사와 경제 밸런스. 실제 v2.6 공개 테스트 결과가 없으므로 공개 플레이 완료로 판정하지 않습니다.
