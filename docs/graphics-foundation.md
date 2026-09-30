# 지우네 농장 Graphics Foundation 1.0

## 공식 Art Direction

기준은 따뜻하고 화사한 농장 동화풍이다. 2000년대 한국 2D RPG의 풍부한 월드 밀도를 일부 참고하되 특정 게임의 형태, 실루엣, 타일 배열을 직접 모사하지 않는다. 농장과 생활 공간은 포근하고 밝게, 요정의 숲 같은 특수 지역은 같은 세계 안에서 판타지 밀도를 높인다. 농장 장르에 필요한 이동·작물·상호작용 가독성은 항상 장식보다 우선한다.

- 시점: 완전 수직 top view가 아닌 **3/4 top-down**. 건물 정면과 지붕을 함께 충분히 보여 준다.
- 팔레트: 따뜻한 녹색, 황갈색 흙길, 맑은 청록·파란 물, 부드러운 자연 그림자, 계절 꽃과 장식.
- 외곽선: 검은 외곽선을 과하게 두르지 않고 재질과 명암으로 형태를 분리한다.
- 화면 밀도: 배경은 풍부하게 만들 수 있지만 플레이어, 작물, 행동 가능한 오브젝트, NPC, 동물의 실루엣·명도·색 대비를 보존한다.
- 특수 지역: 요정의 숲은 발광 식물, 특수 수목, 안개·입자 등 판타지 요소를 강화하되 이동 가능 구역은 읽혀야 한다.

첨부 기준 이미지는 분위기와 화면 밀도의 참고 자료다. 한 장의 배경으로 사용하지 않고 tile, world object, building, crop, character, animal, item 에셋으로 분해해 렌더링한다.

## 32×32 논리 타일과 시각 크기

`GAME_CONFIG.tileSize = 32`는 이동, 농사, 충돌, warp, 맵 문서의 기준으로 유지한다. PNG 프레임과 화면 표시 크기는 논리 타일과 별개다. `frameSize`, `displayScale`, `origin`, `visualFootprint`가 표현을 담당하며 충돌은 캐릭터의 `collisionBox` 또는 맵 오브젝트의 `collision`이 담당한다.

따라서 나무의 판정이 1~2칸이어도 수관은 시각적으로 2×3칸 이상 덮을 수 있고, 집·상점·닭장·작업창고도 큰 투명 PNG를 사용할 수 있다. 표시 크기를 바꾸어도 collision과 interaction이 자동 확대되지 않는다. 기존 맵 JSON의 `displaySizeOverride`, `collision`, `interaction`, `depth` 필드는 그대로 호환된다.

향후 큰 나무, 집, 상점, 닭장, 작업창고, 가로등, 표지판, 다리, 바위, 꽃덤불 교체 시 한 정의에서 다음 값을 조정한다.

1. `source.path`와 spritesheet의 `frameWidth` / `frameHeight`
2. `frameSize`, `displayScale`, `origin`, `visualFootprint`
3. `groundAnchor`, 선택적 `shadow`
4. 캐릭터는 `collisionBox`, `interactionAnchor`, `animations`
5. 월드 오브젝트 판정은 맵의 `collision` 또는 에셋의 authoring용 `defaultCollisionBox`

## Ground Anchor와 Depth 계약

`groundAnchor`는 프레임 안의 정규화된 접지점이다. `origin`은 PNG를 월드 좌표에 놓는 기준이고 `groundAnchor`는 앞뒤 정렬 기준이므로 서로 같을 필요가 없다. `groundAnchorPoint`와 `depthFromGroundAnchor`가 공통 계산을 제공한다. 기존 명시적 depth는 유지되며, 실제 y-sort 전환은 맵별 검증 후 선택적으로 적용한다.

- 건물: 문턱 또는 정면 벽이 지면과 만나는 중앙을 접지점으로 삼는다. 지붕은 위쪽 캐릭터를 덮을 수 있다.
- 나무: 줄기 밑동을 접지점으로 삼는다. 수관 크기는 collision을 바꾸지 않는다.
- 플레이어·NPC: 두 발 중앙을 접지점으로 삼는다. 행동 판정은 발 끝보다 약간 위의 독립 `interactionAnchor`를 사용한다.
- 동물: 네 발이 닿는 영역의 중앙을 접지점으로 삼는다.

같은 y-sort 레이어에서는 접지점의 월드 Y가 큰 항목이 앞에 그려진다. 그림자도 `shadow.anchor`에 붙지만 물리 판정에는 참여하지 않는다. UI, 이름표, 이펙트는 별도 상위 레이어를 유지한다.

## 바닥·장식·물 확장

기본 grass는 저대비·저빈도의 조용한 반복 타일로 제작한다. 꽃, 잡초, 작은 돌, 풀잎은 `terrain-decoration` 레이어의 별도 decorative object로 분리한다. `TERRAIN_GRAPHICS_PROFILE`은 이 분리를 데이터 수준에서 예약하며 이번 단계에서는 랜덤 배치 시스템을 만들지 않는다.

물은 현재 `tile_water` 한 장을 center로 계속 사용한다. 같은 프로필에 north/east/south/west edge, 네 corner, bank, reeds, lily pads, rocks 슬롯을 마련했다. 슬롯이 비어 있는 동안 기존 물 타일과 기존 fallback이 그대로 동작한다. 맵 JSON schema는 변경하지 않는다.

## 캐릭터 성장·외형·애니메이션 계약

`CharacterLifeStage`는 `child | teen | adult`다. 각 `CharacterVisualProfile`은 sprite asset, frame size, display scale, origin, collision box, interaction anchor, 12개 animation frame map, 선택적 portrait를 독립 정의할 수 있다. 현재 기본은 `adult`이며 child와 teen은 전용 PNG가 제작될 때까지 검증된 기존 시트를 사용한다.

life stage는 `spriteProfileId`와 분리되고 body, hair, outfit, accessory ID도 별도 필드다. 이번 단계에서는 합성 렌더러나 커스터마이징 UI를 만들지 않는다. FarmScene은 선택된 `CharacterVisualProfile`만 받고 실제 프레임 번호를 알지 않는다.

애니메이션 키 계약은 다음 12종을 유지한다.

- `idle_down/up/left/right`
- `walk_down/up/left/right`
- `tool_down/up/left/right`

현재 플레이에서는 성장하지 않으므로 SaveData와 Family 스키마에 나이 또는 life stage를 추가하지 않는다. 알 수 없는 단계는 코드 레벨에서 adult 기본 프로필로 돌아간다. 최근 lower-body interaction anchor도 프로필의 authored anchor로 보존한다.

## 첫 교체 세트와 fallback

`game/assets/graphicsFoundation.ts`의 `GRAPHICS_FOUNDATION_ASSET_SET`이 첫 10종 교체 경계다.

1. grass
2. path
3. water
4. farm empty
5. farm tilled
6. farm watered
7. tree
8. farm house
9. player
10. 대표 봄 작물 sproutberry 1종(4 성장 프레임)

현재 항목들은 모두 기존 AssetManager/definitions 에셋을 가리킨다. 새 PNG가 없는 항목은 기존 PNG를 사용하며 파일 누락·불완전 spritesheet는 기존 생성형 fallback으로 복구한다. Map Editor는 같은 `TILE_ASSETS`와 `WORLD_OBJECT_ASSETS`를 읽기 때문에 새 path, 표시 크기, origin을 자동 반영하고 이미지 로드 실패 시 기존 도형 fallback을 표시한다.

## Graphics 1.4 vertical slice

성인 기본 프로필은 `48 × 72` 프레임, `16 × 3` 배열(`768 × 216`)의 48프레임 시트를 사용한다. 행은 idle, walk, tool이고 각 행 안에서 down/up/left/right가 4프레임씩 이어진다. `FarmScene`은 실제 프레임 번호를 알지 않으며 기존 `CharacterVisualProfile.animations` 계약만 읽는다.

시각적 신장 비율은 child `0.72~0.78`, teen `0.86~0.92`, adult `1.0`을 기준으로 한다. 이번 단계에서는 adult만 새 시트를 사용한다. child와 teen은 각각 독립 프로필을 유지하면서 검증된 기존 시트를 fallback으로 사용하므로 저장 데이터 마이그레이션이 없다.

성인 프레임의 접지점은 두 발 중앙(`24, 70`), 충돌은 하체 `18 × 22`(`15, 48`), 상호작용 anchor는 (`24, 62.3`)이다. 프레임이 커져도 기존 월드 좌표에 대한 충돌 하단과 상호작용 anchor의 상대 위치가 각각 `+13`, `+5.3` 픽셀로 유지된다. 따라서 농사·물주기·낚시·NPC 상호작용 좌표 계약은 바뀌지 않는다.

신규 농장 dressing은 각각 독립 투명 PNG이며 `WORLD_OBJECT_ASSETS`에 frameSize, origin, visualFootprint, groundAnchor, shadow를 정의한다. 울타리·우물·나무만 필요한 배치에서 명시적 collision을 사용하고, 관목·꽃밭·우체통·벤치·가로등·상자·그루터기는 기본적으로 시각 장식이다. Map Editor 문서 schema는 그대로이며 새 asset id만 동일 팔레트에서 선택할 수 있다.

## 다음 단계 PNG 제작 목록

- 32×32 seamless grass(조용한 base), path, water center
- 32×32 farm empty, tilled, watered
- 투명 여백을 포함한 대형 tree 1종과 farm house 1종
- adult 플레이어 48프레임 spritesheet(12 animation × 4 frames)
- sproutberry seed/sprout/growing/mature 4개 투명 PNG
- 후속 물 확장용 edge 4방향, corner 4방향, bank 변형, reeds, lily pads, rocks
- 후속 성장용 child·teen 48프레임 spritesheet와 선택적 portrait

모든 새 에셋은 기존 ID와 논리 tile 32×32를 유지한 채 path와 visual profile 값만 교체한다.

Graphics Foundation 1.0은 구조와 교체 계약까지만 다루며 production publish, DB, D1 migration은 범위 밖이다.

## Graphics Foundation 1.1 — First Visual Pass

첫 시각 교체본은 `public/assets/graphics-first-pass/` 아래에 별도 보관한다. Foundation 1.0의 기존 PNG는 삭제하지 않았으며, 활성 definitions의 source path만 새 파일로 전환했다. 첨부 기준 이미지는 색감·밀도·3/4 시점 참고에만 사용했고 배경 crop이나 원본 조각은 포함하지 않았다.

| 역할 | PNG 규격 | 적용 원칙 |
| --- | --- | --- |
| grass | 128×128 RGBA | 저대비 warm green base, 꽃·돌 제외, 네 변 seamless |
| path | 128×128 RGBA | 밝은 황갈색 흙과 작은 돌, edge/corner는 후속 슬롯으로 유지 |
| farm empty | 32×32 RGBA | 조용한 마른 공용 토양 |
| farm tilled | 32×32 RGBA | 같은 토양의 얕은 수평 고랑 |
| farm watered | 32×32 RGBA | 같은 고랑, 더 어두운 습윤 명도, 물방울 아이콘 없음 |
| water center | 128×128 RGBA | 파랑·청록 깊이와 부드러운 하이라이트, bank 장식 없음 |
| tree | 128×160 RGBA | `origin = groundAnchor = (0.5, 0.92)`, 128×160 visual footprint, 기존 22×18 collision 유지 |
| farm house | 224×192 RGBA | 중앙 origin, `groundAnchor = (0.5, 0.96)`, 기존 collision·현관 warp 유지 |
| sproutberry 4단계 | 각 29×29 RGBA | seed → sprout → growing → mature의 실루엣 증가와 coral-orange 수확 신호 |

논리 타일은 계속 32×32다. grass/path/water의 `frameSize`는 32×32 그대로 두고, 실제 반복 PNG 규격만 `textureSize = 128×128`로 분리해 32px 체크무늬 인상을 낮춘다. farm 3종은 한 칸 단위 상태 표시이므로 32×32를 유지한다. 현행 tile ID와 단일 center 렌더를 유지하므로 맵 JSON을 바꾸지 않는다. tree와 house는 frameSize·visualFootprint·origin·groundAnchor만 교체하고 map object의 collision, interaction, warp, depth는 변경하지 않는다. Map Editor도 런타임과 같은 definitions를 읽어 새 PNG와 표시 크기를 사용하며 문서 schema는 그대로다.

이번 단계에서 플레이어, terrain decoration, water edge/corner/bank, 맵 배치와 게임 시스템은 변경하지 않는다. 다음 단계는 작은 꽃·잡초·돌·낙엽·나뭇가지·작은 풀을 별도 `terrain-decoration` 에셋으로 제작하고, 실제 맵 화면을 기준으로 밀도를 조정하는 작업이다.
