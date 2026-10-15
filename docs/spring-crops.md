# Family Beta 봄 작물

기존 새싹열매와 ID, SaveData v4 필드를 유지한다. 신규 작물은 물을 준 날에만 한 단계 성장한다. 별도 성장 카운터 없이 하루당 단계를 두며 일부 단계는 같은 성장 이미지를 사용한다.

| ID | 이름 | 물 준 성장일 | 씨앗 가격 | 수확물 판매가 |
|---|---|---:|---:|---:|
| sproutberry | 새싹열매 | 3 | 20 | 35 |
| sunpotato | 햇살감자 | 4 | 30 | 60 |
| heartberry | 하트딸기 | 5 | 45 | 90 |
| morningcarrot | 아침당근 | 3 | 25 | 45 |

화면의 씨앗 선택 메뉴는 기존 seed 도구를 유지하며 심을 종류를 바꾼다. 재접속 시 선택은 새싹열매로 시작한다. 수확물 판매는 모든 작물을 판매한다. 실제 가격과 성장 수치는 클라이언트가 보내지 않고 공유 정의를 서버에서 읽는다.

## 에셋

각 ID마다 `public/assets/crops/<ID>-seed.png`, `-sprout.png`, `-growing.png`, `-mature.png` (29×29 RGBA), `public/assets/items/<ID>_seed.png`, `<ID>.png` (32×32 RGBA)를 추가했다. 기존 fallback 유지. 플레이어/타일/오브젝트 이미지는 변경하지 않았다.

Built-in imagegen으로 독자적인 3×2 투명 픽셀 시트를 각각 생성한 후 셀 분리·nearest-neighbor 축소·투명 캔버스 배치로 게임 규격에 맞췄다. 외부 상용 게임 그래픽은 사용하지 않았다. 처음 요청 중 한도 오류로 중단됐던 딸기/당근도 재개 후 생성 완료했다.

공통 생성 프롬프트: "One original pixel-art crop atlas for a cozy family farming game. Transparent background; exactly 3 columns by 2 rows, six isolated centered sprites with generous gutters. Crisp chunky pixels, limited warm palette, designed for 29px game assets, three-quarter top-down view. No text, grid, scenery or commercial game copying. Top row: planted seeds in soil mound, two-leaf sprout, growing leafy plant. Bottom row: mature plant, beige seed packet with crop symbol, harvested crop. Each object fits in central 60 percent of cell."

작물별 지정: Sun Potato — golden round tubers, green leaves, pale flowers. Heart Berry — coral red heart-shaped berries, leafy cap, pale flowers. Morning Carrot — short plump orange roots, feathery green leaves. Carrot에는 "no glow or shadow or backdrop"을 추가 요청했다. 원본 생성 이미지가 아니라 위 규격으로 분리된 PNG를 게임이 로딩한다.
