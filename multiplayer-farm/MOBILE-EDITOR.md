# v2.6 모바일 조작 · 월드 편집기

기준 커밋: `10aa5d88375a283c4f4d8e5b2f9d91c3cf84688a`.
브랜치: `feature/v2.6-farm-content-expansion`.

- 게임: https://frontend-production-a998.up.railway.app/
- 편집기: https://frontend-production-a998.up.railway.app/editor.html
- 서버: https://backend-production-b244e.up.railway.app/healthz

## 휴대폰 조작

빈 땅을 탭하면 client의 bounded grid pathfinder가 충돌을 피해 경로를 구하고 기존 `moveX / moveY / run` 입력만 보냅니다. 서버에 목적 좌표를 쓰는 메시지는 없습니다. Colyseus Core 0.18.18, SDK 0.18.5, 30Hz simulation/patch, prediction/reconciliation/interpolation과 PostgreSQL 원자 저장은 유지합니다.

나무/그루터기/바위/작물/밭/채집/드랍/주민/상자/제작대/가공기/우물/동물/게시판/낚시 수역을 탭하면 도달 가능한 가까운 칸을 찾고 서버 위치·방향이 행동 조건을 만족할 때 한 번 행동합니다. 나무는 도끼, 바위는 곡괭이, 작물은 물주기/수확, 밭은 선택한 씨앗(없으면 소지 씨앗), 시든 작물은 괭이를 사용합니다. 한 번 탭할 때 한 타/한 행동이며 연속 벌목은 반복 탭하거나 행동 버튼을 이용합니다. 심기 중 RUN 제한 등 기존 서버 검증은 그대로입니다.

대상이 사라지거나 종류가 바뀌면 취소합니다. 수동 이동, 메뉴, 조작 배치 편집, 백그라운드 전환, 연결 끊김도 취소합니다. 30초 이동 제한과 막힌 길 감지를 둡니다. 두 손가락 확대는 이동 명령을 내리지 않으며 UI 터치는 월드 이벤트에 전달되지 않습니다.

출입구는 서버의 매 tick 위치로 판정합니다. 지역 변경도 기존 저장 queue를 통과하며 중복 전환을 억제합니다. 도착점은 충돌/다른 portal 밖으로 보정하고 1.4초 cooldown을 적용합니다. 터치/조이스틱/키보드 모두 같은 방식입니다.

햄버거 안에는 가방, 퀘스트/오늘 할 일, 도감, 지도, 주민, 달력, 동물, 꾸미기, 설정, 조작 배치 편집, 월드 편집기가 있습니다. 왼쪽 위의 고정 퀘스트는 제거했습니다. 오른쪽 위 compact HUD의 작은 `●`는 정상 연결, 복구 중/끊김은 짧은 경고로 표시합니다. 도구/퀵슬롯은 오른쪽, 기본 조이스틱은 왼쪽 아래입니다.

## 조작 배치 편집

1. 햄버거 → 조작 배치 편집.
2. 조이스틱·행동·RUN을 직접 드래그. 선택 목록과 슬라이더에서 크기/투명도 조절.
3. 저장 또는 취소. 기본값 복원 후 저장하면 기본 배치를 다시 씁니다.

`localStorage: farm-controls-v1`에 화면 비율 기반 위치와 크기를 저장합니다. 화면 회전, 주소창 높이 변화, safe-area를 반영해 화면 안으로 보정하고 HUD·도구·다른 조작 버튼과 겹치지 않는 가까운 빈 공간을 찾습니다. 극단적으로 작은 화면에 큰 버튼 3개를 놓으면 공간 제약이 있으므로 크기를 줄이세요. 서버 세이브에는 UI 설정이 들어가지 않습니다.

## 월드 편집기

Phaser 게임과 별도 Vite entry/Canvas UI입니다. 게임 번들에 편집기 코드가 포함되지 않습니다. 농장/농가/들꽃길/마을/상점/숲/광산1~5층/찻집/공방/해안 14개 지역을 지원합니다.

- 도구: 선택/이동, 화면 이동, 오브젝트, 바닥 타일 영역, 농사 영역, 충돌 영역, Spawn, 출입구.
- 배치 후 선택 모드에서 드래그 이동. 영역 우하단 네모 손잡이로 가로/세로 조절, 속성 숫자로도 조절.
- 복사, 삭제, Undo/Redo 30단계, 두 손가락 확대/이동, 확대/축소 버튼, 전체 보기.
- 맵 크기 12~128 타일. 숫자 입력 후 **맵 크기 적용**을 눌러야 변경됩니다. 축소는 배치/영역을 경계 안으로 보정하고 Undo가 가능합니다.
- Spawn 방향, warp 목적지 지역/Spawn, 오브젝트 asset/설명/배율/상호작용 종류/개별 충돌, 바닥·농사·충돌 영역.
- 새 Spawn ID로 변경하면 연결된 출입구도 갱신됩니다. 참조 중인 Spawn 삭제는 막습니다.
- 브라우저 초안 자동 보관, 명시적 서버 저장, JSON 내보내기/가져오기. JSON에는 세션/편집 키가 없습니다.

**저장 → 초기 월드 적용 → 새 가족 농장 만들기**가 실제 적용 흐름입니다. `world_blueprints`에 draft와 published snapshot을 분리 저장하고, 새 농장 생성 때 published를 world JSON으로 복사합니다. 기존 농장 세이브나 접속 중인 Room에 강제로 반영하지 않습니다. 적용 선택은 이 브라우저의 `farm-active-blueprint`에 남습니다. 기본 월드를 쓰려면 새 농장 생성 화면의 **기본 월드 사용**을 누릅니다. 다른 기기에서는 JSON을 가져와 저장/적용하거나 이미 만든 가족 코드를 공유하세요.

편집 키는 랜덤 256bit capability이며 DB에는 hash만 저장합니다. 별도 관리자 계정 없이 자신의 설계도만 수정할 수 있고 live 농장에 대한 권한은 주지 않습니다. 낙관적 revision 검사로 동시 저장 덮어쓰기를 막습니다. 편집 키는 `farm-editor-capability-v1`, 초안은 `farm-editor-draft-v1`에 보관됩니다. 사이트 데이터 삭제 전 JSON으로 내보내세요.

기존 가족 농장 전환 전 세션은 `farm-v26-sessions`에 최대20개 보관하여 새 농장 생성으로 기존 입장 토큰이 사라지지 않게 했습니다. 로그인 화면에서 이전 농장을 다시 선택할 수 있습니다.

### 편집 제한

- NPC 일정과 낚시 조건/수역, 광산 진행 규칙은 기존 콘텐츠 정의를 유지합니다. 이번 편집기는 퀘스트/경제/NPC 일정 편집기가 아닙니다. 맵 축소 시 이 콘텐츠의 위치를 고려하세요.
- 숲·광산의 일일 생성물은 날짜마다 서버가 생성하며, 맵 크기/충돌을 고려해 배치합니다. 편집기에서는 출입구·지형·고정 배치를 편집합니다.
- 의도적으로 지나갈 수 없게 만든 출입구/동선의 플레이 가능성은 미리 만든 새 농장에서 확인하세요. 최대 오브젝트/영역/요청 크기와 safe Spawn은 서버가 검증합니다.
- 기존 가족 농장의 지형 변경/삭제 도구는 제공하지 않습니다. 초기 월드를 적용해도 기존 가족은 계속 그 가족의 원래 맵을 사용합니다.

## 비밀번호 제거와 migration

생성은 닉네임, 참가는 가족 코드+닉네임입니다. 서버가 더 이상 비밀번호를 요구/해시/검증하지 않습니다. 기존 `password_hash`는 읽지 않는 deprecated 컬럼으로 남겨 기존 row를 파괴하지 않습니다. 새 row에는 비밀이 아닌 `disabled:code-only`만 들어갑니다. 기존 가족은 원래 코드로 참가하고 기존 세션은 그대로 재접속합니다. 가족 코드를 아는 사람은 참가할 수 있습니다.

Migration 2는 **farm_v26 schema 내부**에 `world_blueprints(id,edit_hash,draft,published,revision,updated_at)`를 추가하고 deprecated 컬럼 주석만 설정합니다. 기존 hash/가방/작물/상자 row 삭제나 D1 변경은 없습니다. world JSON v3는 기존 v2 영구 상태를 유지하면서 기본 맵 snapshot을 더합니다. 실시간 위치는 매 tick DB에 기록하지 않습니다.

## 배포와 검증

Railway의 현재 Frontend/Backend는 같은 v2.6 브랜치의 GitHub push를 감시하며 Wait for CI를 유지합니다. 기존 WSS/Origin/DB reference variables를 그대로 사용합니다. Docker frontend는 게임과 editor.html을 함께 빌드하며 장기 static server로 제공합니다. 새 서비스/권한/비밀 환경변수는 필요 없습니다. 검증 결과와 배포 SHA는 아래 실행 기록에 남깁니다.

기존 자동 검사에 새 기능별 대량 테스트를 추가하지 않았습니다. 비밀번호 unit을 code-only/설계도 격리 검사로 교체하고 기존 SDK integration에 자동 출입구 확인을 보탰습니다. 핵심 모바일 smoke 1개가 실제 화면 탭 → 자동 벌목, 조작 배치 저장/회전, 크기 적용 버튼/Undo/Redo, 서버 설계도 적용 → 새 농장 반영을 확인합니다. DB 검사에는 기존 hash가 있어도 참가 가능함과 설계도 원자 저장/새 농장 복사를 추가했습니다.

### 직접 플레이 확인

- [ ] Android A Wi-Fi + B 5G: 빈 땅 탭, 장애물 우회, 나무/드랍/상자/밭/NPC 탭.
- [ ] A가 접근 중 B가 대상 수확/줍기: 이동 취소 또는 서버의 안전한 거부, 중복 보상 없음.
- [ ] 농장↔들꽃길↔마을·숲·광산/건물 자동 진입, 도착 즉시 왕복 없음.
- [ ] 조이스틱+RUN+행동 멀티터치, pinch 후 의도치 않은 이동 없음.
- [ ] 배치 편집/저장/새로고침/기기 회전/주소창 변화/기본값 복원.
- [ ] 편집기 농사 영역 드래그·크기 조절, 맵 크기 적용, 출입구 목적지, 새 농장 적용.
- [ ] 기존 가족 코드와 저장된 세션 재접속, 기존 가방/나무/작물/공유 상자 유지.

Headless 모바일 viewport 검증은 실제 Android 기기 체감 테스트를 대신하지 않습니다.

### 작업 환경 실행 기록

- Clean install (`npm ci`), strict typecheck: 통과.
- Unit 14/14, 3 SDK client 통합 6/6, 정적 서버 배포 6/6: 통과.
- 모바일 browser 3/3: 통과. 390×844/844×390, joystick+RUN, prediction/remote interpolation, touch tree action, 배치 저장, 편집기 적용 포함.
- production client/server build: 통과. editor bundle은 별도 약18KB(7.4KB gzip), Phaser vendor 기존 경고 유지. production URL 검사에서 localhost/LAN을 거부합니다.
- Golden Lab byte-identical 확인 및 git diff whitespace 검사: 통과.
- 이 Work 환경은 PostgreSQL 실행에 필요한 OS 사용자 전환을 허용하지 않아 로컬 DB 검사는 실행하지 않았습니다. 실제 PostgreSQL migration/설계도/기존 hash 호환/재시작 및 Docker 검사는 기존 GitHub CI gate에서 검사합니다. 메모리 fixture를 PostgreSQL 검사로 표현하지 않습니다.

### CI 중 발견한 로딩/재접속 보정

첫 CI의 PostgreSQL migration/설계도·기존 hash 호환, 모바일 3개, Golden Lab 전체는 통과했지만 production browser가 타격 중 재접속으로 실패했습니다. 원인은 이미지 preload가 끝나기 전에 input prediction clock이 시작되는 초기 공백과 render 주기에만 갱신되던 연결 UI였습니다. Phaser scene 준비 이후 연결하고 네트워크 상태 변경 즉시 행동 버튼/아이콘을 갱신합니다. 이동/보간 알고리즘이나 검사 기준은 바꾸지 않았고, 동일한 production browser assertion을 유지한 로컬 재실행이 통과했습니다. 전환 action의 중복 패킷도 cooldown 전에 기존 영속 receipt를 반환하도록 보정했습니다.

### 공개 배포 기준

런타임 commit **7850f1e70588b1b7ae96892ddea2345dd011620a**에서 기존 게임 CI [37483604248](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37483604248)와 Farm/Golden Lab 전체 [37483604330](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37483604330)가 SUCCESS입니다. Farm 31개 검사와 Golden Lab 56개 검사, 실제 PostgreSQL migration/복원, Docker 2개 이미지/health/restart/shutdown gate를 통과했습니다.

Railway 자동배포는 추가 승인/설정 변경 없이 성공했습니다. Backend `ce8d13df-4243-4a28-86d3-534bada7879c`, Frontend `b4ad17dc-b394-41fa-8ad1-ad62440c2154`, 모두 위 런타임 commit입니다. 공개 HTTPS health는 database=true, tickRate=30, patchRate=30, latencyMs=0이고 `/editor.html`은 HTTP 200입니다. Work의 외부 Chromium 접근은 ERR_EMPTY_RESPONSE로 제한되어 기존 GitHub 공개 smoke를 사용합니다. `deployment/public-v26.json`은 배포가 끝난 SHA를 기록하며 공개 검증을 실행하고, runtime watchPatterns에 포함되지 않으므로 서버를 재배포하지 않습니다.

### 공개 검증 결과 (2026-10-06)

[공개 smoke 37485822184](https://github.com/yoosb1992-create/jiwoos-farm/actions/runs/37485822184)는 SUCCESS입니다. 실제 공개 HTTPS/WSS에서 3 SDK client의 같은 가족 접속, 양방향 이동/상태 수렴, 농사, 재연결, 모든 접속 종료 후 PostgreSQL에서 농장 재로딩을 통과했습니다. 비밀번호 없는 참가와 서버에 발행한 편집 맵으로 새 농장 생성도 통과했습니다. 이 짧은 측정에서 patch 30.3Hz, patch 간격 p95 35.3ms였습니다. 공개 서버 프로세스를 강제로 재시작하지는 않았으며 프로세스 재시작은 CI Docker/DB gate에서 검증했습니다.

같은 workflow의 실제 production 페이지 검사도 통과했습니다. 모바일 viewport 2개와 SDK observer 1개로 이동, 상대 canvas 변화, 경작/심기/물주기, 나무 3회 타격/드랍/획득/가방, 새로고침과 뒤로 가기 후 세션·아이템 유지까지 검사했습니다. 성공 화면은 workflow artifact `public-v26-browser-results`에 있습니다.

첫 공개 browser 실행은 마지막 뒤로 가기 후 인원 표시가 5초 안에 3명으로 돌아오지 않아 실패했습니다(2명 표시). 원인을 단정하지 않았으며 스크린샷/trace/연결 진단을 추가했습니다. 런타임·timeout·assertion을 변경하지 않은 재실행은 통과했습니다. 실제 Android의 다른 앱/페이지 방문 후 복귀와 Wi-Fi/5G 전환은 계속 직접 확인할 항목입니다.
