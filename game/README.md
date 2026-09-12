# 지우네 농장 그래픽 교체 구조

## 0.3.5 개발용 맵 편집기

게임 화면 상단의 `맵 편집`으로 진입한다. 편집 문서는 게임 SaveData v4와 다른
`jiwoos-farm.map-editor.v1` localStorage key에 저장되며, `editorVersion: 1`을 가진다.

- `MapRegistry`: 내장 `MAP_DEFINITIONS`와 runtime working copy 사이의 경계
- `game/editor/document.ts`: 편집 문서 clone, local repository, registry 변환
- `game/editor/history.ts`: 최근 75단계 snapshot 기반 Undo/Redo
- `game/editor/validation.ts`: Import/저장/테스트 플레이 전 schema와 데이터 참조 검증
- `app/editor/*`: 도구, SVG 맵 화면, Inspector UI

JSON Import는 validation을 통과한 문서만 적용한다. `테스트 플레이`는 편집 문서의
working copy를 별도 registry로 주입하며 실제 게임 저장에는 쓰지 않는다.

## 그래픽·에셋 구조

- `config.ts`: 타일 크기, 이동 속도, 상호작용 거리, 카메라와 시간 설정
- `assets/definitions.ts`: asset id, 경로/시트, 프레임 크기, 표시 배율, origin, 충돌·상호작용 기준점과 애니메이션 프레임
- `assets/AssetManager.ts`: 에셋 로딩과 현재 임시 그래픽 fallback 생성
- `data/crops.ts`: 작물 이름, 성장 일수/단계, 단계별 asset id, 씨앗·수확 아이템과 판매가
- `data/items.ts`: 도구·씨앗·수확물과 UI icon asset 연결
- `maps/types.ts`: 맵, 타일, 오브젝트, 스폰, 워프 데이터 계약
- `maps/definitions.ts`: 다섯 장소의 타일·충돌·농사 영역·오브젝트·스폰·워프 데이터
- `data/shop.ts`: 상점 판매 목록과 가격
- `rendering/WorldRenderer.ts`: 현재 맵 데이터와 asset id를 Phaser 화면으로 변환
- `player/PlayerAnimationController.ts`: 이동/대기/도구 사용 상태를 방향별 애니메이션 이름으로 변환
- `actions/ToolActionSystem.ts`: 플레이어 행동 → 도구 행동 → 애니메이션 연결

새 그래픽으로 교체할 때는 `public/`에 파일을 추가하고 `assets/definitions.ts`의 `source`, `frameSize`, `displayScale`, `origin`, 프레임 범위를 변경한다. 게임 장면이나 농사 엔진은 수정하지 않는다.

플레이어 시트는 `idle_down/up/left/right`, `walk_down/up/left/right`, `tool_down/up/left/right`의 12개 상태를 정의한다. 지금은 모두 임시 그래픽의 0번 프레임을 사용한다.
