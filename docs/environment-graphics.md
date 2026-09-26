# 0.5 Environment Graphics Pack

## A — 타일

8개 타일은 `public/assets/tiles/`의 32×32 RGBA PNG다. 모든 기존 asset ID, texture key, 크기, 표시 배율과 origin을 유지한다.

| asset ID | 파일 |
|---|---|
| tile_grass | grass.png |
| tile_path | path.png |
| tile_water | water.png |
| tile_farm_empty | farm-empty.png |
| tile_farm_tilled | farm-tilled.png |
| tile_farm_watered | farm-watered.png |
| tile_wood_floor | wood-floor.png |
| tile_stone_floor | stone-floor.png |

게임은 기존 AssetManager로 로드하고 누락/디코딩 실패 시 기존 생성형 fallback을 사용한다. 편집기는 동일한 TILE_ASSETS와 TILE_TYPE_DEFINITIONS를 읽어 SVG 패턴을 표시한다. PNG 오류 시 기존 색상이 남는다. 농경지 편집 오버레이와 선택 표시는 유지한다. 갈아놓은 밭/물 준 밭은 저장 문서의 지형 종류가 아니라 플레이 중 농사 상태이므로 테스트 플레이에서 확인한다.

물은 이번에 정적 이미지다. 향후 32×32 프레임 시트로 확장할 때 `tile_water` ID와 맵 JSON은 유지하고 환경 애니메이션 등록/렌더러 및 편집기 정지 프레임 표시를 추가하면 된다. 이번 변경이 물 애니메이션을 구현한 것은 아니다.

## 제작 방식과 프롬프트

Built-in image generation 사용. 상용 게임 원본을 입력하거나 복제하지 않았다. 최종 PNG는 생성된 이미지의 최근접 축소와 반사 배치로 패킹해 타일의 양쪽 픽셀 경계를 일치시켰다.

타일 공통 프롬프트: “One seamless pixel art terrain tile for an original cozy farm game. Square orthographic top view, native 32×32 pixels, low contrast earthy palette, crisp pixels, no border/text/objects/shadows, opposite edges repeat.”
각 소재: moss green grass / sandy ochre packed path / muted teal water with horizontal aqua ripples / warm tan dry soil / brown horizontal tilled furrows / dark damp furrows / honey brown wooden planks / warm grey stone paving.

## 검증

`npm run test:regression`에서 PNG 실제 디코딩, 크기, 투명도, 타일 경계 일치, 전체 환경 preload, 로딩 성공 시 텍스처 보존, 누락 시 fallback 생성을 확인한다. 기존 모바일·맵 편집·저장·농사·플레이어 애니메이션 회귀 테스트도 유지한다. 브라우저 실제 플레이 검증과 자동 회귀 결과는 구분한다.

## B — 월드 오브젝트

`public/assets/objects/`: house.png (192×176), tree.png (44×56), sell-basket.png (90×76), store.png (192×160), bed.png (96×56), shop-counter.png (224×56).
기존 house/tree/sell_basket/store/bed/shop_counter ID와 크기·배율·origin을 모두 유지했다. collision과 interaction은 기존 맵 문서 값을 그대로 사용한다.

공통 생성 프롬프트: “Original cozy farming game pixel sprite, orthographic slightly top-down front view, earthy moss/teal/cream/brown/terracotta palette, crisp pixel clusters, single complete isolated object, transparent background, no ground shadow, text or commercial game imitation.” 소재는 terracotta roof farmhouse / broadleaf tree / open wicker selling basket / teal roof general store / horizontal wooden bed with terracotta quilt / wide wooden counter. 생성 후 투명 여백을 정리하고 각 기존 frameSize에 최근접 축소·패킹했다.

편집기는 동일 WORLD_OBJECT_ASSETS.source의 PNG를 origin 및 displaySizeOverride에 맞춰 표시한다. 투명 영역도 기존 사각형 선택 대상으로 유지하며 이름표·선택 테두리·충돌 오버레이도 유지한다. PNG 로드 실패 시 기존 색상 도형으로 복귀한다. React 정적 렌더 회귀 검사로 6종 이미지 URL과 타일 패턴이 출력되고 맵 문서가 바뀌지 않는지 확인한다. 실제 브라우저 터치/드래그 검증을 대체하지는 않는다.


## C — 작물 및 아이템

작물은 `public/assets/crops/`의 sproutberry-seed.png / sproutberry-sprout.png / sproutberry-growing.png / sproutberry-mature.png다. 모두 29×29 RGBA, 기존 crop_sproutberry_* ID와 중심 origin을 유지한다. 씨앗·새싹·성장·수확의 내용물 크기는 각각 최대 7/12/21/27px이며 아래 기준선은 y=26이다.

아이템은 `public/assets/items/`의 hoe.png / seed.png / water.png / hand.png / sproutberry.png다. 모두 32×32 RGBA, 기존 item_hoe/item_seed/item_water/item_hand/item_sproutberry ID를 유지한다. 퀵바는 28px, 수량 HUD는 18px로 표시한다. ItemIcon은 로드 오류 시 원래 icon 문자를 표시하며, 이미지 크기를 명시해 빈 배경 span이 0px로 줄어드는 문제를 방지한다. 픽셀 이미지는 image-rendering: pixelated로 표시한다.

작물 공통 생성 프롬프트: “Single original farming crop sprite, sproutberry species, oval pointed moss green leaves, orange fruit only at maturity, slightly top-down pixel RPG, restricted earthy palette, transparent background, no soil/pot/shadow/text.” 단계별 소재는 three tan seeds / two-leaf sprout / five-leaf young plant / leafy plant with three ripe orange berries.

아이템 공통 생성 프롬프트: “One original farming inventory icon, native 32×32 readable at24px, clear silhouette, bold pixel clusters, earthy palette, dark brown outline, transparent background, no ground/shadow/border/text.” 소재는 walnut shaft steel hoe / cream seed packet with sprout emblem / teal watering can / open cream gardening glove / orange berry with green leaves. 생성 후 투명 영역을 정리하고 종횡비를 유지해 최근접 축소·패킹했다.

## 범위와 다음 확인

총 23 PNG. PLAYER_ASSET, player-main.png, player-dev.png, FarmScene, WorldRenderer, SaveData, 맵/편집 JSON, D1/API, 농사·경제·시간 로직은 변경하지 않는다. AssetManager 수정 없이 기존 로더와 fallback을 활용한다.

편집기 지형/오브젝트 표시와 플레이 그래픽은 동일한 에셋 정의를 사용한다. 작물 성장 및 밭 상태는 기존 편집 문서에 저장되는 항목이 아니므로 테스트 플레이에서 확인한다.

직접 확인: 넓은 타일 영역의 반복 무늬, 집/상점 입구 이동과 충돌, 나무/가구 주변 이동, 편집기 선택·드래그·확대·저장/불러오기, 파종→물주기→다음 날 성장→수확, 모바일 퀵바의 아이콘 구분. 브라우저의 요청 차단 기능으로 PNG를 막은 뒤 새로고침하면 게임의 생성형 fallback, 편집기의 색상 도형, HUD의 문자 아이콘을 확인할 수 있다.

0.5의 후속 그래픽 후보: 물 애니메이션, 지형 전환/물가 경계 타일과 반복 변형, 도구별 소품/효과 및 수확 효과, 계절 변형, NPC 그래픽. 이번 팩은 정적 환경 그래픽이며 이러한 확장까지 구현하지 않는다.
