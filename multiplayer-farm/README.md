# 지우네 농장 v2.5 — 독립 Multiplayer Farm

Golden baseline: `982a94dec72ac7d125d55050f707f635c4407fd5`. `multiplayer-lab/`은 변경하지 않습니다.
작업 브랜치: `feature/v2.5-multiplayer-farm-rebuild`.

## 모바일 플레이

공개 게임: https://frontend-production-a998.up.railway.app/
Backend: https://backend-production-b244e.up.railway.app/healthz
 새 가족 농장 → 닉네임/2글자 이상 비밀번호 → 가족 코드를 다른 기기에 전달합니다. 같은 Wi-Fi는 필요하지 않습니다. 브라우저 세션을 보존하면 새로고침 후 동일 인벤토리로 복귀합니다. 다른 기기는 다른 닉네임을 사용합니다. 세션을 지우면 같은 플레이어 복구는 아직 지원하지 않습니다.

조이스틱/화면 탭/WASD로 이동, RUN/Shift로 달리기, 도구 선택 후 행동/Space. 씨앗은 행동을 누른 채 걸으면 연속 심기, 달리면서 심기는 거부합니다. 두 손가락으로 게임 카메라 확대/축소. 가방·메뉴는 모바일 화면에 맞춘 별도 창입니다.

농장 앞 밭에서 괭이→씨앗→물뿌리개. 매일 물을 준 만큼 성장합니다. 가족 모두 메뉴에서 잠자기 투표하면 다음 날입니다. 성숙한 작물은 손으로 수확 후 드랍을 줍습니다. 가까운 나무는 도끼 3타→그루터기, 그루터기도 3타입니다. 손으로 보관함·제작대·우물·입구·주민과 상호작용합니다. 농장 남쪽→들꽃길→마을/요정의 숲/광산. 마을 상점은 씨앗과 비스켓 구매·작물 판매. 광산 바위를 깨면 사다리가 생겨 5층까지 내려갑니다.

## 구조

- client: Phaser, 원본 48프레임 캐릭터·농장/마을 맵·PNG asset 재사용.
- server: Colyseus Core0.18.18/SDK0.18.5, 30tick/s·30Hz Schema delta.
- shared: 순수 movement + 서버 command reducer + legacy 데이터 snapshot. legacy polling/runtime/D1 코드 import 없음.
- persistence: 새 PostgreSQL. Farm Room 하나당 DB advisory lease로 중복 권위 차단. replica1 필수.
- 위치: 입력만 전송. 공식 prediction/reconciliation, 상대 interpolation. 기본 Stable100ms; Fast75/Aggressive60 선택 시 3개의 고정 buffer predictor 출력 사이를 완만하게 전환합니다. 공식 SDK attachAll의 frozen profile 특성 때문에 기본값만 변경하는 방식을 사용하지 않습니다. Lab100ms는 그대로.
- 모든 명령: 타입·거리·앞칸·수량·도구·기력·쿨다운·대상 검증. 가족별 직렬 queue→DB transaction→state 공개.
- 영구 action receipt `(farm,member,actionId)`와 command hash로 재전송 중복 보상 차단. DB commit 실패 시 결과 미공개.
- inventory는 본인에게만 private message. public Schema에는 현재 접속자와 월드 객체. JSONB 전체 월드를 매 patch 전송하지 않음.
- 중요 행동마다 저장, 5초 checkpoint, leave/empty/shutdown 저장. 이동은 메모리에서만 시뮬레이션하며 DB에는 저장하지 않음.
- DB 장애 시 이동 유지/행동 저장 실패 표시. DB lease가 사라지면 연결 종료하여 이중 권위 방지. 저장 성공이 불확실하면 재접속/서버 복구 필요.
- password: salted scrypt. session: random256-bit token, DB에는 SHA256 해시만. 세션90일. 비밀번호 최소2글자, 리소스 보호용4096바이트 한도.

## PostgreSQL

`farm_migrations`, `farms`(family password hash + versioned world JSONB), `members`, `sessions`, `action_receipts`, `world_checkpoints`.
JSONB world는 inventory/tools/skills/quests, crops/trees/drops/chest/machines, day/weather/seed, mine progress를 하나의 transaction으로 저장합니다. 현재 game schema version1. 자동 startup migration은 별도 advisory transaction lock으로 직렬화합니다. 기존 D1 또는 save의 데이터 이관은 없습니다.

## Railway

새 프로젝트 `jiwoos-farm-v2-5`: Backend + Frontend + PostgreSQL. 기존 Lab 프로젝트를 수정하지 않습니다.
두 앱의 Source는 본 저장소/새 feature 브랜치, root `/`, Wait for CI 켬. Dockerfiles가 `multiplayer-farm`만 빌드하며 Frontend는 원본 `public/assets`만 함께 복사합니다.

Backend variables:
```
RAILWAY_DOCKERFILE_PATH=multiplayer-farm/Dockerfile
NODE_ENV=production
HOST=0.0.0.0
PORT=2567
DATABASE_URL=${{Postgres.DATABASE_URL}}
CLIENT_ORIGINS=https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}
LAB_LATENCY_MS=0
```
Frontend variables:
```
RAILWAY_DOCKERFILE_PATH=multiplayer-farm/Dockerfile.client
NODE_ENV=production
HOST=0.0.0.0
PORT=8080
VITE_MULTIPLAYER_SERVER_URL=wss://${{Backend.RAILWAY_PUBLIC_DOMAIN}}
```
두 서비스 health `/healthz`, Singapore, 1replica, Serverless 끔. Backend deployment overlap은 DB lease로 제한되어 재배포 중인 방은 다시 연결해야 합니다. 실시간 위치는 안전한 spawn에서 복구합니다. PostgreSQL은 private networking만 사용합니다. secret을 commit하지 않습니다.

## 유지보수 검증

사용자에게 PC/CLI는 필요하지 않습니다. 아래는 CI/개발자용입니다.
```
npm ci
npm run typecheck
npm run test:unit
npm run test:integration
DATABASE_URL=... npm run test:db
npm run test:deployment
VITE_MULTIPLAYER_SERVER_URL=wss://farm-validation.invalid npm run build
npx playwright install --with-deps chromium
npm run test:browser
npm run test:production-browser
```
DB 테스트는 실제 Postgres가 없으면 실패하며 skip하거나 memory 결과로 대체하지 않습니다. 일반 integration은 DB URL이 있으면 실제 Postgres, 없으면 명시적으로 주입한 test double을 사용합니다. Production entrypoint는 DATABASE_URL을 필수로 요구합니다.

## 이식 범위와 남은 항목

기본 농사4종, 4방향 캐릭터, 이동/달리기/기력, 도구, 벌목/그루터기/드랍, inventory/shared chest/crafting/tool upgrade/wood processor, 공유시간/날씨/잠자기, NPC3명 기본 schedule/대화/수확퀘스트, 숲 daily reset, 광산1~5층/광석/XP/해금, 서버 검증 낚시 미로를 구현했습니다.
원본 definitions에서 맵·작물·아이템·제작법·NPC·graphics를 한 방향 data snapshot으로 재사용했습니다. `scripts/import-content.ts`는 재생성 전용이며 runtime에 legacy 서버를 묶지 않습니다.

아직 미이식: 맵 editor, 전체 관계/퀘스트, 건물 확장/동물, 개인 외형 선택, 기존 데이터 import, 다중 server sharding. 숲/광산은 원본 구역 의도를 살린 새 결정적 배치이며 원본 생성 알고리즘 그대로가 아닙니다. 낚시는 기존 미로 아이디어/asset을 사용한 서버 검증 경로 게임이며 기존 UI 그대로는 아닙니다. tree는 상호작용 대상이며 동적 trunk collision은 아직 적용하지 않습니다. Static house/water/fence 충돌은 양쪽 공용입니다.

실기기 검증: Android A Wi-Fi + B5G, 태블릿 세로/가로에서 걷기/빠른 방향전환/RUN+joystick/행동/5분 연속 이동/백그라운드/통신 단절복구/서버재시작 후 inventory 유지. Headless browser를 실제 Android로 표현하지 않습니다.

## 실제 검증 결과

[VALIDATION.md](./VALIDATION.md)에 CI 링크, 25개 요구사항별 증거, 공개 WSS·모바일 브라우저·실제 Railway 재시작 결과와 남은 제한사항을 기록했습니다. 사용자는 위 공개 게임 URL을 열고 새 가족 농장을 만들면 됩니다. 다른 기기는 코드·비밀번호로 참가하며 Wi-Fi와 5G가 달라도 됩니다.

개발자용 Docker (사용자 휴대폰에 Docker 설치 불필요): 저장소 root에서 실행합니다. `.env`에는 새 v2.5 DB와 공개 Origin만 넣습니다.
```
docker build -f multiplayer-farm/Dockerfile -t jiwoos-farm-backend .
docker run --init --env-file multiplayer-farm/.env -p 2567:2567 jiwoos-farm-backend
docker build -f multiplayer-farm/Dockerfile.client --build-arg VITE_MULTIPLAYER_SERVER_URL=wss://backend-production-b244e.up.railway.app -t jiwoos-farm-frontend .
docker run --init -p 8080:8080 jiwoos-farm-frontend
```

실기기 체크리스트(A: PC Chrome+Edge, B: Android2대 같은 Wi-Fi, C: Android Wi-Fi+5G, D: 태블릿 세로/가로):
- [ ] 걷기30초·빠른 방향 전환·원형 이동·RUN+joystick 동시 입력
- [ ] 장애물 충돌·동시에 서로 이동·5분 이상 연속 조작
- [ ] 밭/씨앗/물/3일 성장/수확 공유, 나무3타·동시 pickup·보관함 동시 인출
- [ ] 숲과 광산 입장·가공·낚시·잠자기 투표
- [ ] 백그라운드 후 복귀·Wi-Fi 잠깐 중단 후 복구·새로고침 후 가방 유지
- [ ] local input delay / remote stutter / teleport / reconciliation jump / disconnect / reconnect를 기기·네트워크와 함께 기록
