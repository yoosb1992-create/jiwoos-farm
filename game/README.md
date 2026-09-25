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

새 그래픽으로 교체할 때는 `public/`에 파일을 추가하고 `assets/definitions.ts`의 `source`, `frameSize`, `displayScale`, `origin`, 충돌박스와 프레임 범위만 변경한다. 게임 장면, 농사 엔진, SaveData, 맵 편집 문서는 수정하지 않는다.

## 0.5 플레이어 spritesheet 규격

현재 `PLAYER_ASSET.source`는 `/assets/player/player-main.png`에 연결되어 1차 실제 플레이어 캐릭터를 표시한다. 기존 `public/assets/player/player-dev.png`는 비교 및 수동 전환용으로 보존한다. 자동 복구는 기존 생성형 fallback 캐릭터를 사용한다. PNG가 없거나, 로딩에 실패하거나, 정의된 마지막 프레임까지 들어 있지 않은 시트가 로드되면 `AssetManager`가 불완전한 텍스처를 버리고 같은 fallback으로 복구한다.

개발 기준 시트는 투명 배경 PNG, 프레임당 32×36px, 가로 16칸×세로 3줄(전체 512×108px), 왼쪽 위부터 0번인 행 우선 번호를 사용한다. 최종 디자인은 이 크기나 프레임 수에 고정되지 않는다. 다른 규격을 사용할 때 `source.frameWidth/frameHeight`, `frameSize`, `displayScale`, `origin`, `collisionBox`, 그리고 아래 프레임 범위를 함께 조정하면 된다.

물리적인 시트 행은 3줄이다. 1행(0–15)은 대기, 2행(16–31)은 걷기, 3행(32–47)은 도구 사용이며, 각 행 안에서 방향별로 4프레임씩 연속 배치한다.

| 상태 | 프레임 | 시트 행 | FPS | 반복 |
|---|---:|---:|---:|---:|
| 아래 대기 `idle_down` | 0–3 | 1 | 1 | 무한 |
| 위 대기 `idle_up` | 4–7 | 1 | 1 | 무한 |
| 왼쪽 대기 `idle_left` | 8–11 | 1 | 1 | 무한 |
| 오른쪽 대기 `idle_right` | 12–15 | 1 | 1 | 무한 |
| 아래 걷기 `walk_down` | 16–19 | 2 | 8 | 무한 |
| 위 걷기 `walk_up` | 20–23 | 2 | 8 | 무한 |
| 왼쪽 걷기 `walk_left` | 24–27 | 2 | 8 | 무한 |
| 오른쪽 걷기 `walk_right` | 28–31 | 2 | 8 | 무한 |
| 아래 도구 `tool_down` | 32–35 | 3 | 10 | 1회 |
| 위 도구 `tool_up` | 36–39 | 3 | 10 | 1회 |
| 왼쪽 도구 `tool_left` | 40–43 | 3 | 10 | 1회 |
| 오른쪽 도구 `tool_right` | 44–47 | 3 | 10 | 1회 |

연결할 때 `PLAYER_ASSET.source`만 다음 형태로 지정한다.

```ts
source: {
  kind: "spritesheet",
  path: "/assets/player/player-main.png",
  frameWidth: 32,
  frameHeight: 36,
},
```

대기·걷기·도구의 `startFrame`, `endFrame`, `fps`, `repeat`는 모두 `PLAYER_ASSET.animations`의 데이터로 결정된다. 키보드와 모바일 조이스틱은 공통 이동 벡터와 방향 판정을 거쳐 같은 걷기 애니메이션을 사용한다. 도구는 괭이·물뿌리개·씨앗·손 모두 현재 방향의 `tool_*`을 재생한 뒤 같은 방향의 `idle_*`로 복귀한다.



### 2단계 연결 검증

개발 PNG는 이미지 생성 도구로 만든 파란 상의 테스트 캐릭터를 셀별로 정렬·최근접 축소한 것이다. 생성 요구: 투명 배경, 정면/후면/좌/우, 대기/걷기/도구 각 4프레임, 최종 아트 아님. 실제 파일은 512×108 RGBA PNG이며 12개 상태 각각 4개 프레임의 픽셀이 서로 다르다.

`frameSize` 32×36, `displayScale` 1×1, `origin` (0.5, 0.5), `collisionBox` 18×22 및 offset (7, 9)를 유지한다. 셀 간 동일한 기준으로 정렬하며 프레임마다 투명 여백을 잘라 크기를 바꾸지 않는다.

회귀 테스트는 PNG 헤더/크기, 48개 프레임 범위, 정상 텍스처 등록, 누락/불완전 텍스처 fallback, 중복 애니메이션 재등록, 이동/도구 후 대기 복귀를 확인한다. 실제 브라우저 검증은 실행환경의 Chromium 다운로드 시간 초과로 수행하지 못했다. 손상 PNG 디코딩 실패 후 게임 실행, 모바일 터치와 키보드의 실제 재생, 벽/나무 충돌은 다음 실사용 확인 항목이다.


### 3단계 실제 플레이어 그래픽 1차

`public/assets/player/player-main.png`는 이미지 생성 도구로 새로 제작한 독자적인 캐릭터다. 적갈색 짧은 머리, 청록색 작업 조끼, 크림색 소매, 겨자색 목수건, 어두운 자주색 바지와 갈색 부츠를 48프레임에서 공유한다. 상용 게임의 원본 이미지나 캐릭터를 참조하지 않았다.

생성된 시트를 동일 배율로 최근접 축소하고 투명 알파를 정리해 512×108 RGBA PNG에 배치했다. 모든 셀은 32×36이며 발바닥 최하단을 셀의 y=32에 정렬했다. 대기는 미세한 움직임, 걷기는 교차하는 팔·다리, 공통 도구 동작은 준비→들기→숙이기→복귀다. 고정 도구 이미지를 그리지 않아 네 행동에서 같은 시트를 사용할 수 있다.

프레임 배치와 FPS는 위 표 그대로다. `origin`, `displayScale`, `collisionBox`, `interactionPoints` 및 로더·컨트롤러·FarmScene은 변경하지 않았다. 개발용 이미지로 비교하려면 `PLAYER_ASSET.source.path`만 `/assets/player/player-dev.png`로 바꾼다.

검증: 두 PNG의 헤더·크기·RGBA 형식 및 기존 애니메이션/fallback 회귀 테스트. 새 시트는 별도 디코딩 검사로 48개 셀의 비어 있지 않은 픽셀, 셀 내부 여백, 동일한 발 기준선을 확인했다. 실제 플레이에서는 네 방향의 걷기 반복, 정지 후 마지막 방향 대기, 네 도구의 동작 후 복귀, 모바일 조이스틱, 장애물 주변의 발 위치를 확인한다. 브라우저 실플레이 검증은 수행하지 않았다.
