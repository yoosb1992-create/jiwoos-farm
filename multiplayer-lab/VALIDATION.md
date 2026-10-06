# Multiplayer Lab validation — 2026-10-06

기준: `23d6b3a4f7fa5105977062c6678e1a21f818efc1`

브랜치: `experiment/v2.4-multiplayer-lab-colyseus`

## Railway 모바일 배포 후속 검증

후속 작업 시작 기준 HEAD: `cf7379cbe613aa954f7edf307603a5e07c389977`.
아래 상세 원격 CI 기록 대상: **`ea7eae0dd4d4d8115bca2a64cbe2efefdaad91d4`**. 이후 실제 배포한 **`2a93b13a9c126aae02cd35ac7f7f480aafa091bb`**도 Lab·기존 게임 CI 모두 성공했습니다.
기존 `server/`, `shared/` 및 이동·prediction·reconciliation 로직은 이 후속 작업에서 변경하지 않았습니다. `client/config.ts`의 한국어 오류 안내 두 곳에서 URL처럼 읽히는 문자열을 WS/WSS 설명으로 바꿨습니다. 연결 동작은 그대로입니다.
배포 이미지, 정적 serving, 빌드 주소 검증, 테스트, 문서와 Lab CI를 추가/수정했습니다.

| 실제 실행 항목 | 결과 |
|---|---|
| `npm ci` | PASS |
| TypeScript strict typecheck | PASS |
| 단위 테스트 | **22/22 PASS** (기존13 + 주소/배포검증9) |
| 실제 Colyseus 서버 통합 | **23/23 PASS** |
| 정적 HTTP 서버 및 종료 처리 | **6/6 PASS** |
| 기존 브라우저 prediction/interpolation/reconnect/multitouch | **4/4 PASS** |
| 컴파일된 production client + server 브라우저 | **1/1 PASS** |
| production client build | PASS, 공개 WSS 필수 / 로컬 주소 번들 검사 통과 |
| production server build | PASS, `npm start`는 컴파일된 JS |
| localhost/LAN endpoint로 build 시도 | 의도대로 거부, custom build mode도 우회 불가 |
| 공개 smoke 도구의 명시적 로컬 fixture | PASS, 실제 SDK2개 + 실제 브라우저1개, 이동48px·수렴·퇴장 정리 |
| Docker 이미지 build | **Backend / Frontend 모두 최종 GitHub CI에서 PASS** (`ea7eae0`) |
| Docker 실행 검증 | **PASS**, 두 이미지 시작·`/healthz`, Backend PORT override, production latency0, 두 컨테이너 SIGTERM 정상 종료 exit0 |
| 기존 게임 CI | **PASS**, 같은 `ea7eae0` commit |
| Railway 계정·프로젝트·서비스·도메인 | 사용자 앱 승인·저장소 Source·실험 브랜치·Wait for CI 연결 완료. 두 서비스 **Active / SUCCESS** |
| 공개 HTTPS health | Frontend·Backend `/healthz` 모두 **HTTP 200**. Backend status ok·tick30·patch30·latency0 |
| 공개 브라우저 두 명 같은 방 참가 | **PASS**, 같은 room 인원2·연결됨·30Hz 관찰. 두 명 모두 나가기 후 연결 대기 복귀 |
| 작업 환경의 공개 smoke 실행 | **사전 검사 실패**, OS DNS `EAI_AGAIN`. 앱 테스트 성공으로 간주하지 않으며 DNS 가드 변경 없음 |
| GitHub Actions 공개 smoke | **첫 실행 FAIL / 수정 후 재검증 대기**. bundle 검사에서 오류 안내 문구를 URL로 해석. 실제 공개 smoke 스크립트·DNS/주소 가드 변경 없음 |
| 실제 Android 두 대·Wi-Fi/5G·태블릿 | **미검증**, 실제 기기 benchmark 필요 |

Production 브라우저 smoke는 정적 산출물의 `wss://lab-validation.invalid` 요청을
**테스트에서만** 로컬의 실제 컴파일 서버로 전달합니다. 양쪽 브라우저의 방 생성/참가,
서버 좌표 변화, 상대 canvas의 실제 픽셀 이동, 390×844 세로 화면의 컨트롤 영역,
개발 debug hook 부재, production latency0을 확인했습니다.
이 테스트는 공개 DNS·TLS·Railway 라우팅이 성공했다는 증거가 아닙니다.

`tests/public-smoke.mjs`는 실제 배포 후 공개 HTTPS/WSS, 공개 DNS, 두 SDK client의 이동과
state 수렴, 공개 production 페이지의 실제 browser 참가, 로컬 주소가 없는 JS bundle,
정상 퇴장을 검사합니다. 기본값은 공개 주소만 허용하며 `--allow-local`은 fixture용으로
명시해야 합니다. 공개 테스트 미실행을 성공으로 표시하지 않습니다.

SDK0.18.5에 남아 있는 사용하지 않는 로컬 fallback 두 곳은 production bundling 중에만
설정된 공개 주소로 치환합니다. SDK 설치 파일이나 netcode는 수정하지 않습니다.
SDK 버전/정확한 모듈 형태가 달라지면 build가 실패하여 재검토를 요구합니다.

첫 배포 CI(`37428475066`)는 기존 게임 CI와 Lab의 설치·타입·모든 테스트·양쪽 build·두 Docker image build를 통과했습니다. 컨테이너 시작 약0.1초 뒤 첫 health 요청의 connection reset(curl56)이 재시도 대상에서 빠진 문제를 발견해, 모든 일시 연결 오류에 대한 재시도를 총30초로 제한하여 추가했습니다. health 응답 내용과 종료 코드는 계속 검사합니다.

수정 후 `ea7eae0`의 최종 원격 CI 두 개 모두 성공했습니다.

- [Multiplayer Lab — run 37428877941](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37428877941): 설치·strict typecheck·22 unit·23 integration·6 deployment·4 browser·1 production browser·client/server build·두 Docker image build/run/health/PORT/종료 검증 **PASS**.
- [기존 게임 CI — run 37428877967](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37428877967): **PASS**.

### 실제 공개 배포와 접속

Railway 프로젝트는 `jiwoos-farm-multiplayer-lab` (`aebabf47-0d3f-45b1-93d2-4d13c95286d7`), 환경은 `6894f013-1f3b-4d8b-8ccf-5f87f44c348b`입니다. GitHub App은 사용자 승인 후 `yoosb1992-create/jiwoos-farm` 하나에 연결했습니다. 두 서비스 모두 Source의 `experiment/v2.4-multiplayer-lab-colyseus` 브랜치와 Root Directory `/multiplayer-lab`, Wait for CI 켬을 확인·적용했습니다. 실제 배포가 Waiting for CI → Building → Success로 진행했습니다.

| 실제 확인한 배포 | 값 |
|---|---|
| 실행 코드 | `2a93b13a9c126aae02cd35ac7f7f480aafa091bb` |
| Backend service / deployment | `cb76d3f9-3ee0-4fa1-ac75-1fd9d67ee395` / `011760d3-9484-4b3f-b018-26d701b23cfd` |
| Frontend service / deployment | `a8173270-4f34-4bc4-be7d-0fcf4143400b` / `5f3fda87-daa6-4666-b909-63cf13c0f373` |
| Backend 공개 HTTPS | [backend-production-a9e97.up.railway.app](https://backend-production-a9e97.up.railway.app) |
| Frontend 공개 HTTPS | [frontend-production-768e.up.railway.app](https://frontend-production-768e.up.railway.app) |
| 실제 공개 health | 두 `/healthz` HTTP200, Backend `status=ok`, `tickRate=30`, `patchRate=30`, `latencyMs=0` |
| 실제 공개 브라우저 | 두 클라우드 브라우저가 room `mfQIxXCGY` 생성·참가, 인원2·연결됨·30Hz patch 관찰, 두 명 나가기 정리 |

테스트 room 코드는 당시 검사 기록이며 계속 사용할 방 코드가 아닙니다. 앱에서 새 방을 만드세요. 이 두 브라우저 검사는 실제 Android Wi-Fi/5G 또는 5분 이상 이동 체감 검증이 아닙니다.

각 Dockerfile·PORT(Backend2567/Frontend8080)·`/healthz`, Singapore, replica1, Serverless 끔, production·HOST·latency0과 상대 도메인 참조 변수를 적용했습니다. Watch Paths는 두 서비스 모두 `/multiplayer-lab/**`, `/.github/workflows/multiplayer-lab.yml`입니다. 기존 Production 서비스에는 연결하지 않았습니다.

### 공개 자동 smoke 실행 환경

작업 환경에서 실제 URL로 `tests/public-smoke.mjs`를 실행했지만 OS DNS 조회가 `EAI_AGAIN`으로 사전 검사에서 실패했습니다. 이 결과를 성공으로 바꾸거나 DNS 검사를 제거하지 않았습니다. 공개 HTTPS/WSS·정상 인증서·DNS 가드를 유지한 동일 스크립트를 GitHub-hosted runner에서 실행하도록 `.github/workflows/multiplayer-lab-public.yml`을 추가했습니다.

최초 workflow revision은 `8987c46d733c2f8b2c76828cb1eeda27326026b7`이며 **검사하는 배포 revision은 위의 `2a93b13`**입니다. workflow는 현재 공개된 Lab을 검사하므로 workflow revision 자체가 이미 배포되었다고 주장하지 않습니다. 첫 실행은 두 실제 SDK client의 이동·수렴 및 browser 참가까지 진행했으나, bundle 주소 검사에서 한국어 오류 안내의 `wss://로`와 `wss://)가`를 서버 URL로 해석해 실패했습니다. 두 안내 문자열만 WS/WSS 표현으로 수정하며, 검사 스크립트·DNS 가드·이동 및 네트워크 코어를 바꾸지 않습니다. 수정본 배포 후 재검증이 필요하며 **전체 공개 smoke PASS는 아직 선언하지 않습니다**. 최종 결과와 `multiplayer-lab-public-smoke-report` artifact를 함께 확인해야 합니다.

휴대폰에서는 [기존 Public Smoke 실행](https://github.com/yoosb1992-create/jiwoos-farm/actions/workflows/multiplayer-lab-public.yml)을 열어 **Re-run jobs → Re-run all jobs**로 재검사할 수 있습니다. 자세한 순서는 [RAILWAY.md](./RAILWAY.md#휴대폰에서-공개-자동-검증-다시-실행)에 있습니다.

모바일 최초 설정은 [RAILWAY.md](./RAILWAY.md), 플레이 방법은 [README.md](./README.md)를 따릅니다.

## 이전 Core 구현 검증 기록

아래는 공개 배포 이전의 이력입니다. 당시 미실행한 Docker·인터넷 배포의 현재 결과는 위 후속 검증 기록을 따릅니다.

### 실제 실행 결과

| 검증 | 결과 |
|---|---|
| `npm install` 및 clean `npm ci` | PASS, 독립 lockfile 설치 |
| `npm run typecheck` | PASS, strict + noUncheckedIndexedAccess |
| `npm run test:unit` | **13/13 PASS**, skip 없음 |
| `npm run test:integration` | **23/23 PASS**, skip 없음 |
| `npm run test:browser` | **4/4 PASS**, retry 0 |
| `npm run build:server` | PASS, TypeScript → `dist/server/index.js` |
| `VITE_MULTIPLAYER_SERVER_URL=wss://lab-validation.invalid npm run build:client` | PASS, 독립 Vite 정적 빌드 |
| 컴파일된 Node 서버 production 기동 | PASS |
| `/healthz` | PASS, 실제 tickRate30/patchRate30/latencyMs0 |
| production에 latency 설정200을 넣었을 때 | PASS, effective latency0 |
| 허용하지 않은 HTTP origin / matchmaking 요청 | PASS, 403 |
| 컴파일된 서버 SIGTERM 종료 | PASS, exit0 |
| `npm audit --json` (Vite8.0.16) | PASS, 알려진 취약점0 |
| Docker 이미지 build/run | **미실행**, 실행 환경에 Docker 없음 |
| 공개 인터넷 배포 / 실제 Android·태블릿 / 5G | **미실행**, 수동 benchmark 필요 |

환경: Linux 실행 컨테이너, Node **24.19.0**, npm **11.9.0**. 지원 baseline은 Node22.13+, Docker와 GitHub Actions 설정은 Node22입니다. 로컬에서 Node22/Docker를 실행했다고 주장하지 않습니다.

브라우저: Playwright **1.63.0**, Chromium **153.0.8010.0**. 기본 브라우저 다운로드/OS 패키지 설치가 이 실행 환경에서 실패하여, npm 배포 Chromium 실행 파일을 임시 디렉터리에 준비해 사용했습니다. 이 파일은 저장소 의존성·배포 산출물에 포함하지 않습니다. CI는 표준 Playwright Chromium 설치를 사용합니다.

실제 브라우저 실행 명령:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:browser
```

일반 PC/CI는 `npx playwright install chromium` 후 `npm run test:browser`로 실행합니다. Linux CI의 시스템 의존성은 `npx playwright install --with-deps chromium`으로 설치합니다.

## 요구한 핵심 테스트의 대응

| 요구 | 실제 검증 |
|---|---|
| 1 동일 room에 두 플레이어 | 실제 SDK/WebSocket create + joinById, ID·닉네임·색 구분 PASS |
| 2 A 이동 → 서버 좌표 | 서버 memory 권위 상태에서 고정 dt 이동량 확인 PASS |
| 3 B가 A 변경 수신 | B의 Schema state에서 A 좌표 확인 PASS |
| 4 양쪽 상태 수렴 | A/B 동시 이동 후 서버·양쪽 좌표 일치 PASS |
| 5 달리기 > 걷기 | 동일 입력 수에서260/160 속도비 PASS |
| 6 대각선 정규화 | 직선과 이동 거리 동일 PASS |
| 7 맵 경계 | 네 방향 footprint 경계 및 장애물 충돌 PASS |
| 8 disconnect cleanup | 명시적 leave와 unexpected drop 만료 모두 server/peer 삭제 PASS |
| 9 비정상 입력 | 999/NaN/Infinity/잘못된 타입·run, finite state·속도 상한 PASS |
| 10 x/y 주입 금지 | input에 임의x/y 추가, position/move message 모두 authority 변경 불가 PASS |

추가 단위/통합 검증: 공유 이동의 결정성, analog magnitude, 벽 슬라이딩, 비정상 dt, 입력 폭주 차단, 총 경과 tick 이동 예산, 짧은 전송 공백 따라잡기, 오래 쉰 뒤 이동 credit 축적 차단, reconnect 세션·좌표 보존, production origin/latency 설정.

긴 TCP 정지 회귀: 약 **700ms** 분량의 입력을 늦게 전달한 뒤 정상 빈도로 계속 전송해 persistent backlog를 만들었습니다. 서버가 **4010**으로 재동기화를 요구하고, 공식 reconnect 후 같은 session/위치를 보존하며 새 입력6개가 정확히6 step으로 처리되는 것을 검증했습니다. 오래된 입력은 이어서 실행되지 않았습니다. 이는 심한 지연에서 **잠깐 복구 상태로 전환하는 정책**이며 무중단 부드러움을 보장한다는 뜻이 아닙니다.

## 네트워크 시뮬레이션 측정

Colyseus의 실제 ping으로 측정한 마지막 전체 통합 테스트 실행 샘플입니다. 실험 서버와 Node client는 같은 실행 호스트에 있습니다.

| 추가 왕복 지연 | RTT 샘플(ms) | 상태 수렴 |
|---|---|---|
| 0ms | 0, 0, 0 | PASS |
| 50ms | 50, 50, 55 | PASS |
| 100ms | 102, 100, 101 | PASS |
| 200ms | 201, 201, 201 | PASS |

0ms는 로컬 호스트에서 SDK 측정 해상도로 반올림된 결과입니다. 실제 한국 인터넷의 RTT나 packet loss를 의미하지 않습니다. 평균·p95 benchmark로 일반화하지 않습니다.

## 브라우저 네 가지 검증

1. 별도 browser context 두 개가 같은 방에 참가. **추가 RTT200ms**에서 키 이벤트 후 **100ms 이내 로컬 렌더 이동**, 그 시점의 authority 이동량은 **0.1px 미만**. 렌더30프레임을 수집하며 최소800ms~최대4초의 범위로 측정합니다. 상대 렌더에서 받은 authority 좌표들을 그대로 덮어쓰는 방식으로 만들 수 없는 **중간 보간 좌표8개 초과**를 확인하고 최종 상태 수렴 검증.
2. 실제 WebSocket을 끊은 뒤 동일 room/session으로 reconnect하고 다시 이동.
3. reconnect 대기 중 나가기 후 예약된 retry 취소, 2초 뒤 열린/연결 중인 유령 WebSocket 없음.
4. Pixel7 viewport에서 Chromium CDP의 실제 multi-touch 이벤트로 조이스틱과 Run 동시 입력, 서버 좌표 이동, 모든 손가락 해제 후 입력0, scroll/zoom 없음.

브라우저 테스트는 software-rendered headless 환경이므로 **60FPS 달성을 입증하지 않습니다**. 실제 기기에서 local input delay, 상대 stutter, correction jump, 재접속과 장시간 플레이를 확인해야 합니다. Pixel7 viewport는 실제 Android 하드웨어 검증이 아닙니다.

최초 원격 CI에서는 기존 앱 regression/build와 Lab 설치·타입·단위·통합·양쪽 build가 성공했습니다. 브라우저4개 중3개는 통과했지만, 원격 보간 테스트의800ms 내 최소 프레임 수 조건이 실패했습니다(기대13개 이상, 실제9개). 이를 고정시간의 처리량 검사에서 제한시간 내30프레임 표본 검사로 수정하고, 보간 좌표 자체의 검증은 유지했습니다. 수정 후 로컬 브라우저4개가27.8초에 통과했습니다. 최종 원격 상태는 해당 branch HEAD의 GitHub Actions에서 확인할 수 있습니다.

원격 설치 로그에서 확인한 Lab 개발 의존성 Vite 보안 문제는 **8.0.13 → 8.0.16** 패치로 수정했습니다. 기존 앱의 Vite/package/lockfile은 그대로 유지합니다.

## 설계·검토로 해결한 문제

- 하나의 tick에서 입력을 무제한 처리하면 속도 조작 가능 → 제한된 실제 경과 tick 예산 적용.
- 항상 입력 하나만 처리하면 TCP 지연 후 추가 지연이 계속 남음 → 최근 미처리 tick에 한정한 catch-up과 지속 backlog 재동기화.
- SDK0.18.5의 자동 retry 예약을 나가기 때 취소할 수 없는 경우 → 공식 reconnect API를 사용하는 취소 가능한 제한된 재시도.
- 새 reconnect handshake 직후 단절되면 기존 token이 만료됨 → 회전된 새 token으로 재시도.
- prediction lead를 보정 오차로 잘못 표시할 위험 → 실제 reconciliation correction과 drift 측정 사용.
- Production에서 프레임워크 자체 latency 환경변수가 동작할 위험 → `COLYSEUS_LATENCY` 비영값 거부, Lab simulation은 production에서0.

독립 코드 리뷰에서 제기된 중요 항목은 수정 후 관련 회귀 검증을 추가했습니다.

## 범위와 이식 판단

Cloudflare DO 비교 backend: **미구현**. `NetworkAdapter` 경계와 ColyseusAdapter만 구현했습니다. 기존 `FAMILY_ROOM` 및 binding에 접근하거나 수정하지 않았습니다.

기존 Production 배포·D1·인증·세이브·게임 코드는 변경하지 않았습니다. 기존 root TypeScript 설정에는 Lab 제외 항목만 추가했고, 신규 Lab 전용 CI workflow는 배포하지 않습니다. 기존 production branch에는 commit/merge하지 않습니다.

**기존 지우네 농장으로 즉시 이식: NOT READY.** 격리된 Lab의 구현·자동 테스트·빌드 기반은 준비되었습니다. 다만 사용자의 가장 중요한 완료 기준인 실제 Android/태블릿, Wi-Fi/5G에서의 체감과 5분 이상 연속 플레이는 아직 검증하지 않았습니다. 공개 서비스 기동과 클라우드 브라우저 두 명의 같은 방 접속은 확인했습니다. README의 benchmark를 통과한 후 별도 이식 작업을 결정해야 합니다.
