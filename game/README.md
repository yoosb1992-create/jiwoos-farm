# 지우네 농장 그래픽 교체 구조

## 0.4 Mobile + Map Editor

모바일 게임은 왼쪽 아래 가상 조이스틱, 오른쪽 행동 버튼과 도구 퀵바를 사용한다.
키보드와 가상 조이스틱은 `game/input/MovementInput.ts`에서 같은 이동 벡터로 합쳐지므로
방향, 속도 정규화, 걷기 애니메이션 상태를 공유한다. 모바일 HUD는 safe-area를 반영하고
오늘 할 일과 저장 메뉴를 접을 수 있다.

모바일 맵 편집기는 상단 맵/저장/테스트, 중앙 캔버스, 하단 도구막대 구조다.
한 손가락은 현재 도구를 사용하고 두 손가락은 pan/pinch zoom에만 사용한다. 선택 항목의
Inspector는 Bottom Sheet로 열린다. Undo, Redo, 삭제, 레이어, Import/Export는 모두
터치 버튼으로 접근할 수 있다.

편집 문서는 항상 `LocalMapEditorRepository`에 먼저 저장된다. 로그인된 편집자는
`CloudMapEditorRepository`와 `/api/editor-draft`를 통해 D1의 `editor_drafts`에 사용자별
초안을 저장한다. 클라우드 실패는 로컬 편집을 막지 않으며, revision/updatedAt이 다르면
서버 버전 불러오기 또는 현재 로컬 유지 중 하나를 선택한다. 게임 SaveData v4와 편집 문서는
서로 다른 저장소를 계속 사용한다.

## 0.3.5 개발용 맵 편집기 기반 구조

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

## 0.5 플레이어 spritesheet 규격

최종 캐릭터 디자인은 아직 고정하지 않는다. 교체용 PNG는 투명 배경의 고정 크기 셀을
왼쪽 위부터 행 우선(row-major)으로 배치한 spritesheet여야 한다. 모든 셀은 같은
`frameWidth × frameHeight`를 사용하며 여백이나 간격 없이 붙인다. 파일은 `public/`
아래에 두고 `PLAYER_ASSET.source`만 다음 형태로 지정한다.

```ts
source: {
  kind: "spritesheet",
  path: "/assets/player/player.png",
  frameWidth: 32,
  frameHeight: 36,
},
```

권장 기본 배치는 각 상태에 4프레임을 주는 3행 × 16열, 총 48프레임이다.

| 상태 | 아래 | 위 | 왼쪽 | 오른쪽 |
| --- | --- | --- | --- | --- |
| 대기 | 0–3 | 4–7 | 8–11 | 12–15 |
| 걷기 | 16–19 | 20–23 | 24–27 | 28–31 |
| 도구 | 32–35 | 36–39 | 40–43 | 44–47 |

이 배치는 권장값일 뿐이다. 실제 범위, FPS, 반복 여부는
`PLAYER_ASSET.animations`의 12개 정의만 바꾸면 된다. 상태별 프레임 수가 달라도 되고
서로 떨어진 행을 사용해도 되지만, 각 상태의 `startFrame...endFrame` 범위는 연속이어야
한다. `frameSize`, `displayScale`, `origin`, `collisionBox`도 같은 에셋 정의에서
조정한다.

PNG가 없거나 로딩에 실패하거나 정의한 범위가 실제 시트 밖이면 플레이어는 기존
fallback 텍스처로 안전하게 실행된다. 키보드와 모바일 조이스틱은 같은 이동 벡터와
방향 판정을 공유하며, 정지하면 마지막 방향의 대기로 돌아간다. 괭이·물뿌리개·씨앗·손
행동은 공통 방향별 도구 애니메이션을 재생한 뒤 마지막 방향의 대기로 복귀한다.
FarmScene, 농사 시스템, 맵 데이터, SaveData와 편집 문서 schema는 그래픽 교체 시
수정하지 않는다.
