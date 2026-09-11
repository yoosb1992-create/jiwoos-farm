# 지우네 농장 그래픽 교체 구조

- `config.ts`: 타일 크기, 이동 속도, 상호작용 거리, 카메라와 시간 설정
- `assets/definitions.ts`: asset id, 경로/시트, 프레임 크기, 표시 배율, origin, 충돌·상호작용 기준점과 애니메이션 프레임
- `assets/AssetManager.ts`: 에셋 로딩과 현재 임시 그래픽 fallback 생성
- `data/crops.ts`: 작물 이름, 성장 일수/단계, 단계별 asset id, 씨앗·수확 아이템과 판매가
- `data/items.ts`: 도구·씨앗·수확물과 UI icon asset 연결
- `worldData.ts`: 논리 타일 종류, 이동/농사 가능 여부, 월드 오브젝트 위치·충돌·상호작용
- `rendering/WorldRenderer.ts`: 월드 데이터와 asset id를 Phaser 화면으로 변환
- `player/PlayerAnimationController.ts`: 이동/대기/도구 사용 상태를 방향별 애니메이션 이름으로 변환
- `actions/ToolActionSystem.ts`: 플레이어 행동 → 도구 행동 → 애니메이션 연결

새 그래픽으로 교체할 때는 `public/`에 파일을 추가하고 `assets/definitions.ts`의 `source`, `frameSize`, `displayScale`, `origin`, 프레임 범위를 변경한다. 게임 장면이나 농사 엔진은 수정하지 않는다.

플레이어 시트는 `idle_down/up/left/right`, `walk_down/up/left/right`, `tool_down/up/left/right`의 12개 상태를 정의한다. 지금은 모두 임시 그래픽의 0번 프레임을 사용한다.
