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
