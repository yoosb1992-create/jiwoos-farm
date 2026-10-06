# Multiplayer Lab validation — 2026-10-06

기준: `23d6b3a4f7fa5105977062c6678e1a21f818efc1`

브랜치: `experiment/v2.4-multiplayer-lab-colyseus`

## 실제 실행 결과

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

**기존 지우네 농장으로 즉시 이식: NOT READY.** 격리된 Lab의 구현·자동 테스트·빌드 기반은 준비되었습니다. 다만 사용자의 가장 중요한 완료 기준인 실제 PC/Android/태블릿, Wi-Fi/5G에서의 체감과 5분 이상 연속 플레이는 아직 검증하지 않았습니다. README의 benchmark를 통과한 후 별도 이식 작업을 결정해야 합니다.
