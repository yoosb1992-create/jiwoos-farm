import {
  LAYERS,
  TERRAIN,
  TERRAIN_NAMES,
  SEASONS,
  ZONES,
} from "../../shared/world2.js";
export const html = `<header><a href="/" aria-label="농장으로">←</a><strong>World Editor <b>2.0</b></strong><select id="map" aria-label="편집 지역"></select><button id="menu" aria-label="설정과 저장">☰</button></header>
<div id="preview-bar"><div id="seasons">${SEASONS.map((s, i) => `<button data-season="${s}" ${i === 0 ? 'class="active"' : ""}>${["봄", "여름", "가을", "겨울"][i]}</button>`).join("")}</div><select id="time" aria-label="시간 미리보기"><option value="420">아침</option><option value="720" selected>낮</option><option value="1110">저녁</option><option value="1320">밤</option></select><select id="weather" aria-label="날씨 미리보기"><option value="clear">맑음</option><option value="rain">비</option><option value="snow">눈</option><option value="fog">안개</option></select></div>
<main id="viewport"><canvas id="map-canvas" aria-label="월드 편집 캔버스"></canvas><div id="coordinates">0, 0</div><canvas id="minimap" width="150" height="96" aria-label="미니맵"></canvas><div id="zoom"><button id="minus">−</button><button id="fit">전체</button><button id="plus">＋</button></div><div id="test-controls" hidden><button data-walk="up">↑</button><div><button data-walk="left">←</button><button id="test-action">행동</button><button data-walk="right">→</button></div><button data-walk="down">↓</button><button id="test-exit">편집기로 복귀</button></div></main>
<nav id="quick" aria-label="빠른 도구"><button id="undo" title="Undo">↶<small>취소</small></button><button id="redo" title="Redo">↷<small>복원</small></button><button data-tool="pencil">✎<small>브러시</small></button><button data-tool="eraser">▱<small>지우개</small></button><button data-tool="selection">▣<small>선택</small></button><button data-panel="layers">▤<small>레이어</small></button><button data-panel="objects">♧<small>배치</small></button><button id="save">↓<small>저장</small></button><button id="test">▶<small>테스트</small></button></nav>
<section id="sheet" hidden><div class="sheet-head"><strong id="sheet-title">도구</strong><button id="close-sheet" aria-label="패널 접기">⌄</button></div><div id="sheet-content">
<div data-page="brush"><div class="row"><label>도구<select id="mode">${[
  ["pencil", "연필"],
  ["eraser", "지우개"],
  ["rectangle", "사각형"],
  ["circle", "원"],
  ["line", "직선"],
  ["fill", "채우기"],
  ["eyedropper", "스포이트"],
  ["selection", "영역 선택"],
  ["move", "이동"],
  ["paste", "붙여넣기"],
  ["pan", "화면 이동"],
  ["forest", "숲 브러시"],
  ["meadow", "들판 브러시"],
  ["spawn", "시작점"],
  ["warp", "출입구"],
  ["npc", "NPC 경로"],
  ["event", "이벤트 영역"],
  ["nav", "A → B 경로"],
]
  .map(([v, n]) => `<option value="${v}">${n}</option>`)
  .join(
    "",
  )}</select></label><label>크기 <input id="brush-size" type="range" min="1" max="15" value="1"><output id="brush-size-value">1 × 1</output></label></div>
<label>편집 레이어<select id="active-layer">${LAYERS.map((l) => `<option>${l}</option>`).join("")}</select></label>
<div class="terrain-grid">${TERRAIN.map((t, i) => `<button data-terrain="${t}"><i style="background:var(--terrain-${i},#96b56f)"></i>${TERRAIN_NAMES[i]}</button>`).join("")}</div>
<div class="row"><label>충돌<select id="collision-value"><option value="1">통행 불가</option><option value="2">통행 가능</option><option value="0">자동 판정</option></select></label><label>영역<select id="zone-value">${Object.keys(
  ZONES,
)
  .map(
    (z, i) =>
      `<option value="${z}">${["농사", "건물 배치", "장식 배치", "동물", "채집 생성", "낚시", "배치 금지"][i]}</option>`,
  )
  .join("")}</select></label></div>
<details><summary>자연 브러시 비율</summary><label>밀도 <input id="density" type="range" min="1" max="100" value="20"></label><label>나무 종류 <select id="tree-species"><option value="tree">기본 나무</option></select></label>${["tree", "bush", "rock", "flower", "mushroom"].map((v, i) => `<label>${["나무", "관목", "돌", "꽃", "버섯"][i]} <input id="ratio-${v}" type="number" min="0" max="100" value="${[50, 20, 10, 15, 5][i]}"></label>`).join("")}</details>
</div>
<div data-page="layers"><p>눈: 표시 · 자물쇠: 편집 보호 · 편집: 현재 레이어 강조</p><div id="layer-list"></div></div>
<div data-page="objects"><div class="row"><input id="search" placeholder="이름 검색" aria-label="오브젝트 검색"><select id="category"><option>전체</option><option>Nature</option><option>Farm</option><option>Village</option><option>Water</option><option>Buildings</option></select></div><div class="row" id="palette-tabs"><button data-tab="all" class="active">전체</button><button data-tab="recent">최근 사용</button><button data-tab="favorite">즐겨찾기</button></div><div id="palette"></div><button id="more-assets">더 보기</button><small>썸네일 선택 → 맵을 터치하여 배치 · ☆ 즐겨찾기</small></div>
<div data-page="properties"><div id="inspector">선택 도구로 배치물·출입구·이벤트를 선택하세요.</div><div class="row"><button id="copy">복사</button><button id="paste">붙여넣기</button><button id="delete">삭제</button><button id="group">그룹</button><button id="ungroup">해제</button></div><button id="save-prefab">선택 영역을 템플릿으로 저장</button></div>
<div data-page="world"><h3>월드 목록</h3><label>새 지역 이름<input id="new-map-name" placeholder="예: 달빛호수" maxlength="60"></label><button id="create-map">새 지역 만들기</button><details open><summary>맵 설정 · 크기 적용</summary><label>이름<input id="map-name" maxlength="60"></label><div class="row"><label>가로 타일<input id="width" type="number" min="12" max="1024"></label><label>세로 타일<input id="height" type="number" min="12" max="1024"></label></div><button id="resize">맵 크기 적용</button><small>맵별 최대 262,144타일. 축소 전에 잘릴 내용을 확인합니다.</small></details><label>랜덤 seed<input id="seed" type="number" min="0" max="4294967295"></label><button id="apply-seed">Seed 적용</button><label><input type="checkbox" id="grid" checked> 그리드</label><label>Snap<select id="snap"><option value="1">타일</option><option value="0.5">반 타일</option><option value="0">자유</option></select></label><label><input type="checkbox" id="nav-debug">이동 가능 영역 표시</label><button id="nav-test">A → B 경로 테스트</button><h3>낚시 영역 속성</h3><small>이 지역의 낚시 브러시 영역에 공통 적용됩니다.</small><label>수역<select id="water-type"><option value="pond">연못</option><option value="river">강</option><option value="forest">요정의 숲</option><option value="sea">바다</option><option value="cave">광산</option></select></label><label>물고기 표<select id="fish-table"><option value="seasonal">계절 전체</option><option value="common">일반 물고기</option><option value="rare">희귀 물고기</option></select></label><label>계절 override<select id="fish-season"><option value="">실제 계절</option>${SEASONS.map((s, i) => `<option value="${s}">${["봄", "여름", "가을", "겨울"][i]}</option>`).join("")}</select></label><label>희귀 보너스<input id="fish-bonus" type="number" min="0" max="1" step=".1" value="0"></label><button id="save-fishing">낚시 속성 적용</button></div>
<div data-page="prefabs"><p>템플릿 선택 → 맵 터치. 선택 영역도 내 템플릿으로 저장할 수 있습니다.</p><div id="prefabs"></div></div>
<div data-page="npc"><label>주민<select id="npc-id"></select></label><label>시각<input type="time" id="npc-time" value="08:00"></label><label>바라보는 방향<select id="npc-facing"><option value="down">아래</option><option value="up">위</option><option value="left">왼쪽</option><option value="right">오른쪽</option></select></label><label>활동 이름<input id="npc-animation" maxlength="40" placeholder="산책 / 휴식"></label><label>대사<input id="npc-dialogue" maxlength="240"></label><button id="add-route-point">맵에 일정 지점 찍기</button><div id="route-list"></div><small>시각 사이의 경로는 실제 충돌/고도를 따릅니다. 막힌 경로는 출발점에 머무릅니다.</small></div>
<div data-page="save"><p><b>초안 → 서버 저장 → 초기 월드 적용</b></p><p>기존 가족 농장은 바뀌지 않습니다. 적용한 월드는 이 기기에서 새로 만드는 가족 농장에 사용됩니다.</p><div id="version-info"></div><button id="publish">초기 월드 적용</button><button id="new-farm">새 가족 농장 만들기</button><button id="load-server">서버 저장본 불러오기</button><button id="export">JSON 내보내기</button><label class="file">JSON 가져오기<input id="import" type="file" accept=".json,application/json"></label><button id="defaults">기본 설계도 복원</button><p>자동 초안은 기기에 보관합니다. 편집 키는 이 브라우저에만 저장하며 JSON에는 넣지 않습니다.</p></div>
<div data-page="menu"><div class="menu-grid">${[
  ["brush", "브러시와 도구"],
  ["world", "맵 설정 · 크기 적용"],
  ["properties", "선택 속성"],
  ["npc", "NPC 일정"],
  ["prefabs", "템플릿"],
  ["save", "저장 · 초기 월드 적용"],
]
  .map(([v, n]) => `<button data-panel="${v}">${n}</button>`)
  .join(
    "",
  )}</div><p>한 손가락: 현재 도구 · 두 손가락: 화면 이동/확대 · 길게 누르기: 속성</p><p>테스트 모드는 실제 가족 저장과 연결되지 않습니다.</p></div>
</div></section><footer id="status" role="status">월드 편집기 준비 중…</footer>`;
