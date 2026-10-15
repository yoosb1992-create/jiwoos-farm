# 0.6 Family Alpha

## 체크포인트 3 — 가족 방

기존 ChatGPT 인증의 `getChatGPTUser()`만 사용한다. 신뢰된 인증 프록시가 주입하는 헤더를 전제로 하며, 클라이언트가 보낸 userId/playerId를 인증으로 사용하지 않는다. 별도 공개 배포 환경에서는 반드시 이 인증 프록시가 헤더를 제거·주입하도록 구성해야 한다.

`GET /api/family/rooms`: 내 최근 방 목록. `GET ?roomId=...`: 멤버 전용 방/멤버 목록. `POST` JSON `{action:"create",name,nickname}` 또는 `{action:"join",code,nickname}`. 이름40자/닉네임20자, 초대코드8자(혼동 문자 제외). 생성자도 멤버로 등록하며 방 생성과 최초 멤버 등록은 D1 batch 트랜잭션이다. 같은 계정 재참가는 기존 playerId를 유지한다. 계정당 방 생성10개 제한. 초대코드는 가족에게만 전달한다. 초대코드 폐기/멤버 추방은 알파 후속 과제다.

D1 테이블: `family_rooms`, `family_members`. 기존 editor_drafts 및 편집기 JSON 스키마는 변경하지 않는다. SQL: `drizzle/0001_family_rooms.sql`. production에는 적용하지 않았다. API는 no-store이며 멤버십을 확인하고 D1 first-primary 세션으로 읽는다.

자동 테스트는 Node 내장 SQLite 메모리 DB에서 실제 migration과 서비스 SQL을 실행한다. Cloudflare 배포 및 실제 인증 로그인/두 브라우저 플레이 검증과는 별개다.

## 체크포인트 4 — 공유 상태

`family_state` (`0002_family_state.sql`): 방당 revision/world_json/inventories_json/updated_at. world에는 날짜·시간 기준점·농장 타일·공동 자금, inventories에는 playerId별 개인 인벤토리만 저장한다. 응답에는 요청자 자신의 인벤토리만 포함한다. 두 JSON 컬럼을 같은 조건부 UPDATE로 갱신해 밭 변경과 아이템 소비/획득이 원자적으로 처리된다.

`GET /api/family/state?roomId=...`, `POST` `{roomId,expectedRevision,action}`. action은 tool/buy/sell/sleep만 받으며 전체 SaveData나 임의 세계 JSON 업로드는 받지 않는다. 서버가 기존 작물·경제 상수로 결과를 계산한다. 멤버십/위치/범위/인벤토리를 검증하고 `WHERE revision = expectedRevision`으로 경쟁을 막는다. 충돌은409+최신 snapshot. 클라이언트는 자동 재전송하지 않고 상태를 다시 읽은 후 사용자가 다시 행동하도록 한다. 늦게 도착한 낮은 revision 응답은 무시한다.

시간은 서버 시각과 저장된 기준점으로 산출하므로 접속자 수에 따라 빨라지지 않는다. 접속이 없어도 밤의 종료 시각까지 흐르며 자동 날짜 변경은 하지 않는다. 누군가 침대에서 잠들면 모두의 날짜가 바뀌고 물 준 작물이 성장한다. 전원 수면 투표는 미구현이다. 메뉴/도움말은 개인 조작만 멈추고 공유 시간은 멈추지 않는다.

가족 모드에서는 로컬 SaveData를 읽거나 쓰지 않는다. 맵/좌표/방향/도구만 `jiwoos-farm.family-personal.v1:<room>:<player>`에 따로 보관한다. 인벤토리는 서버에 저장한다. 기존 싱글플레이·편집기 테스트 플레이 경로는 유지한다. 가족 방은 기본 맵을 공유하며 사용자 편집 맵을 업로드하지 않는다.

## 체크포인트 5 — 캐릭터 presence

`family_presence` (`0003_family_presence.sql`): 방/계정당 접속 세션·위치 JSON·서버 last_seen. playerId와 nickname은 클라이언트 입력을 신뢰하지 않고 멤버 테이블에서 가져온다. `POST /api/family/presence` heartbeat, GET 목록, DELETE 해당 접속 세션 종료. 모든 요청은 멤버십을 검증한다.

한 polling 사이클에서 상태 GET과 presence POST를 실행하고 둘 다 끝난 후 1000ms 뒤 다음 사이클을 실행한다(네트워크 지연에 따라 실제 간격은 늘어남). 요청 제한8초. 서버 갱신12초 이상 없는 캐릭터는 목록에서 제외하고, 클라이언트도 마지막 서버 시각과 수신 후 경과 시간으로 제거한다. 정상 종료는 DELETE, 탭 강제 종료/네트워크 끊김은 TTL로 정리한다. 같은 계정의 여러 탭/기기는 같은 playerId를 쓰므로 동시 플레이는 계정당 하나의 기기만 사용한다.

Phaser RemotePlayers는 같은 맵의 다른 playerId만 일반 Sprite로 생성한다. 기존 플레이어 PNG/idle/walk 애니메이션을 재사용하고 청색 tint/투명도·닉네임·방향 화살표로 구분한다. 지수 보간(시정수180ms)을 적용하고 물리 바디/충돌은 생성하지 않는다. 원격 도구 사용 애니메이션은 아직 동기화하지 않는다.

## 체크포인트 6 — 진입 UI와 테스트 절차

시작 화면: 혼자 하기 / 가족 농장 / 맵 편집기. 가족 로비: 로그인 안내, 닉네임, 새 농장 생성, 초대 코드 참가, 최근 방 재참가. 게임 안의 가족 정보는 초대 코드와 현재 접속자 목록을 표시한다. 기존 모든 구성원 목록은 멤버 전용 rooms detail API로도 제공한다. 모바일 폼은 한 열로 표시하고 별도 스크롤을 제공한다. 가족 모드에서 편집 맵을 공유하는 기능은 없으며 맵 편집은 시작 화면에서 별도로 이용한다.

### migration 적용 준비 (이번 작업에서는 미적용)

1. production과 분리된 개발/스테이징 D1 및 신뢰된 ChatGPT 인증 프록시가 있는 환경을 준비한다. Worker 바인딩 이름은 기존과 같은 `DB`다. 현재 production 데이터베이스 ID를 재사용하지 않는다.
2. 새 DB라면 기존 `drizzle/0000_black_bill_hollister.sql`, 이후 `0001_family_rooms.sql`, `0002_family_state.sql`, `0003_family_presence.sql` 순서로 해당 테스트 DB에만 적용한다. 기존 editor_drafts가 있는 DB는0000을 재실행하지 않는다. migration은 한 번씩만 적용한다.
3. 예시: `npx wrangler d1 execute <테스트-DB-이름> --local --file=drizzle/0001_family_rooms.sql --config <테스트-config>` (나머지 두 파일도 순서대로). 원격 staging 적용/배포는 별도 승인 후 수행한다. production을 대상으로 `--remote` 실행하거나 배포하지 않는다.
4. `feature/v0.6-family-alpha`의 앱을 위 환경에 연결한다. ChatGPT 인증이 없는 임의의 공개 호스트에 헤더 인증 API만 직접 노출하지 않는다. 브라우저에서 로그인 후 방 API가401/503이 아닌 정상 응답을 주는지 확인한다.

### 실제 가족 2명 테스트

- A/B는 서로 다른 ChatGPT 계정과 브라우저/기기를 사용한다. A가 가족 농장을 만들고 게임의 가족 정보 패널에서8자리 코드를 전달한다. B는 가족 농장→코드 참가로 들어간다.
- 둘 다 도움말을 닫고 같은 농장 맵에서 움직인다. 상대 닉네임/방향과 보간 이동을 확인한다. 다른 맵으로 이동하면 상대가 보이지 않아야 한다.
- A가 밭 갈기/씨앗 심기, B가 갱신된 밭 확인/물 주기를 한다. 동시에 같은 밭에 행동했을 때409 안내 후 최신 상태를 받는지 확인한다. 개인 씨앗은 자신의 행동에만 감소해야 한다.
- 침대에서 한 사람이 잠들면 양쪽 날짜/작물 단계가 바뀌는지 확인한다. 수확물은 수확한 사람에게 들어가고 판매금은 함께 증가해야 한다.
- B가 나가거나 탭을 닫으면 정상 종료 직후 또는 마지막 heartbeat부터 약12초 뒤 목록/캐릭터에서 사라져야 한다.
- 가족 농장을 나온 뒤 혼자 하기의 기존 로컬 저장/불러오기, 맵 편집기의 선택·저장·Undo/Redo·Import/Export·테스트 플레이를 확인한다.

### 검증 범위 및 제한

자동 검증: 메모리 SQLite에 실제 SQL migration 적용, A생성/B참가/동일상태읽기, revision 경쟁, 심기/물주기/성장/수확/공동판매금, 개인 인벤토리 분리, 다른 방 접근 거부, presence 식별/같은 맵 표시/TTL/퇴장, 실제 RemotePlayers 렌더러의 비물리 sprite 경로, 클라이언트 응답 순서/종료, 로비 React 정적 렌더. 기존 로컬 SaveData v4 migration, 모바일 입력, 맵 편집기 회귀 테스트도 함께 실행한다.

Work 환경에서 실제 두 브라우저 동시 플레이 및 인증된 staging D1 연결은 검증하지 않았다. migration/production 배포도 수행하지 않았다. 자동 테스트는 로컬 SQLite/D1 호환 인터페이스에서 서버 SQL과 동기화 서비스 동작까지 검증하며 네트워크 지연·모바일 실기기의 UI 품질을 보장하는 실사용 검증은 아니다.

미구현: WebSocket/Durable Objects, 서버 권위 이동/충돌 검증 및 부정행위 방지, 오프라인 변경 병합, 전원 수면 투표, 원격 도구 애니메이션, 채팅/거래, 방 탈퇴·삭제·추방/초대코드 교체, 편집 맵 공유. 같은 계정의 여러 기기 동시 플레이는 지원하지 않는다. 맵/위치/도구는 기기별 별도 저장이며 서버 presence에는 최신 접속 위치만 남는다. 가족 인벤토리와 세계는 서버에 영속 저장된다.
