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
