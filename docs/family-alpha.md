# 0.6 Family Alpha

## 체크포인트 3 — 가족 방

기존 ChatGPT 인증의 `getChatGPTUser()`만 사용한다. 신뢰된 인증 프록시가 주입하는 헤더를 전제로 하며, 클라이언트가 보낸 userId/playerId를 인증으로 사용하지 않는다. 별도 공개 배포 환경에서는 반드시 이 인증 프록시가 헤더를 제거·주입하도록 구성해야 한다.

`GET /api/family/rooms`: 내 최근 방 목록. `GET ?roomId=...`: 멤버 전용 방/멤버 목록. `POST` JSON `{action:"create",name,nickname}` 또는 `{action:"join",code,nickname}`. 이름40자/닉네임20자, 초대코드8자(혼동 문자 제외). 생성자도 멤버로 등록하며 방 생성과 최초 멤버 등록은 D1 batch 트랜잭션이다. 같은 계정 재참가는 기존 playerId를 유지한다. 계정당 방 생성10개 제한. 초대코드는 가족에게만 전달한다. 초대코드 폐기/멤버 추방은 알파 후속 과제다.

D1 테이블: `family_rooms`, `family_members`. 기존 editor_drafts 및 편집기 JSON 스키마는 변경하지 않는다. SQL: `drizzle/0001_family_rooms.sql`. production에는 적용하지 않았다. API는 no-store이며 멤버십을 확인하고 D1 first-primary 세션으로 읽는다.

자동 테스트는 Node 내장 SQLite 메모리 DB에서 실제 migration과 서비스 SQL을 실행한다. Cloudflare 배포 및 실제 인증 로그인/두 브라우저 플레이 검증과는 별개다.
