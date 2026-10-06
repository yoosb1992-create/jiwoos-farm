# v2.6 validation record

기준: `feature/v2.5-multiplayer-farm-rebuild` / `3fad61ce6c567fe5449371e8ecf871282b6b69df`.
새 브랜치: `feature/v2.6-farm-content-expansion`.

## 실제 로컬 자동 검증

- strict TypeScript: PASS
- unit 14/14: PASS. 기존 낚시 경로 테스트를 bite/hook/경과시간/hold 입력 replay/1회 보상 검증으로 교체.
- integration 6/6: PASS. 3 SDK client 이동/경쟁 action/중복 receipt/공유 농사/재접속/별도 서버 복원. 이 실행은 명시적 MemoryTestStore를 사용했으며 PostgreSQL 결과로 표현하지 않습니다.
- static deployment 6/6: PASS
- browser 2/2: PASS. 모바일 390×844의 두 context/joystick+RUN/가방/새로고침/뒤로 가기; 200ms RTT 조건의 prediction-before-authority/remote interpolation.
- 기존 모바일 smoke에 작물/물고기 도감 열기/스크린샷을 추가하여 재실행: 1/1 PASS.
- production server TypeScript build: PASS
- production client Vite build: PASS (`VITE_MULTIPLAYER_SERVER_URL=wss://farm-validation.invalid`). 주소 미지정 build는 의도대로 거부되는 것도 확인. Phaser vendor chunk 약1.20MB/319KB gzip 경고는 유지되며 앱 chunk 약352KB/110KB gzip.
- production 앱 endpoint: WSS validation host 사용, 개발 ws://localhost·ws://127.0.0.1 미포함. 실제 v2.6 domain 발급 후 재빌드해야 합니다.
- `git diff --check`: PASS. Golden Lab 파일 변경 없음.

## GitHub CI

새 브랜치 push 후 기존 게임 CI와 Farm 전체 CI를 실행합니다. Farm gate는 clean install → strict typecheck → 기존 unit/integration → 실제 Postgres migration/transaction → deployment tests → build → 3 browser tests → Docker build/run/health/restart/shutdown. Golden Lab regression도 유지합니다. CI run ID/최종 결과는 실행 완료 후 이 문서에 기록합니다.

새 기능마다 테스트 파일을 늘리지 않았습니다. 이번 자동 검증 확대는 기존 낚시 의미 변경과 기존 모바일 smoke의 도감 확인 정도이며, 콘텐츠 구현·미감·모바일 정보 구조에 작업을 집중했습니다. Headless를 실제 Android 검증으로 부르지 않습니다.

## Railway / 공개

신규 프로젝트 생성은 플랜 한도로 거절되어 새 리소스를 할당하지 않았습니다. 현재 허용된 기존 Farm 서비스의 Source를 v2.6로 전환하는 방식으로 변경합니다. 추가된 schema/session 격리 변경이 실제 PostgreSQL CI를 통과한 뒤 배포합니다. 기존 v2.5 브랜치·public 저장 테이블·브라우저 세션은 보존합니다. 실제 공개 결과는 완료 후 기록합니다.

첫 콘텐츠 후보 `3d55906fa62ea412ffc1aa31c3b4d554da85741f`: [기존 게임 CI](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37455228933) SUCCESS, [Farm + Golden Lab 전체 CI](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37455229124) SUCCESS. 별도 schema를 추가한 후속 commit도 같은 전체 CI로 확인합니다.

## 수동 확인

README의 실기기 체크리스트가 남아 있습니다. 핵심: Android Wi-Fi↔5G, 5분 이동/발열, 터치 낚시 난이도, 계절 전환, 동물 생산/공유 pickup, 신규 v2.6 PostgreSQL 재배포 복원, 행사와 경제 밸런스. 실제 v2.6 공개 테스트 결과가 없으므로 공개 플레이 완료로 판정하지 않습니다.
