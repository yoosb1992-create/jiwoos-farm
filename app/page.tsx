"use client";

import { useEffect, useRef, useState } from "react";
import type * as Phaser from "phaser";
import { gameEvents, type HudState, initialHud, type ToolKey } from "@/game/events";
import { ITEM_ASSETS } from "@/game/assets/definitions";
import { ITEM_DEFINITIONS } from "@/game/data/items";

const toolKeys: ToolKey[] = ["hoe", "seed", "water", "hand"];
const tools = toolKeys.map((key) => {
  const item = ITEM_DEFINITIONS[key];
  return { key, ...item, visual: ITEM_ASSETS[item.assetId] };
});

export default function Home() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [hud, setHud] = useState<HudState>(initialHud);
  const [showHelp, setShowHelp] = useState(true);

  useEffect(() => {
    const update = (event: Event) => setHud((event as CustomEvent<HudState>).detail);
    gameEvents.addEventListener("hud", update);
    let cancelled = false;
    import("@/game/createGame").then(({ createGame }) => {
      if (!cancelled && !gameRef.current) gameRef.current = createGame("game-canvas");
    });
    return () => {
      cancelled = true;
      gameEvents.removeEventListener("hud", update);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  const command = (type: string, value?: string) =>
    gameEvents.dispatchEvent(new CustomEvent("command", { detail: { type, value } }));

  const toggleHelp = () => {
    const next = !showHelp;
    setShowHelp(next);
    command("help", next ? "open" : "close");
  };

  return (
    <main className="game-shell">
      <section className="game-frame" aria-label="지우네 농장 게임">
        <div id="game-canvas" className="game-canvas" />
        <header className="top-hud">
          <div className="brand-plate"><span className="brand-leaf">✦</span><div><strong>지우네 농장</strong><small>우리 가족의 봄날</small></div></div>
          <div className="status-plate"><span>☀ 맑음</span><b>봄 {hud.day}일</b><strong>{hud.timeText}</strong><em>{hud.money.toLocaleString()} G</em></div>
        </header>
        <aside className="quest-card">
          <span className="quest-kicker">오늘 할 일</span><strong>{hud.objective}</strong>
          <div className="growth-track"><i style={{ width: `${hud.progress}%` }} /></div><small>{hud.message}</small>
        </aside>
        <div className="save-row"><button onClick={() => command("save")}>저장</button><button onClick={() => command("load")}>불러오기</button><button onClick={toggleHelp}>?</button></div>
        {showHelp && <div className="modal-shade"><div className="help-card"><button aria-label="도움말 닫기" onClick={toggleHelp}>×</button><b>농사 시작하기</b><p><kbd>WASD</kbd> / 방향키로 이동 · 가까운 밭을 클릭하거나 <kbd>Space</kbd>로 행동</p><p>괭이 → 씨앗 → 물 → 잠자기 → 다음 날 물 주기 순서로 키워 보세요.</p><p>집 문 앞에서 <kbd>Space</kbd>를 누르면 하루를 마칠 수 있어요.</p></div></div>}
        {hud.sleepPrompt && <div className="modal-shade"><div className="sleep-card" role="dialog" aria-modal="true" aria-label="잠자기 확인"><span>🌙</span><b>오늘 하루를 마치고 잠드시겠습니까?</b><p>물을 준 작물은 잠든 사이 한 단계 자랍니다.</p><div><button onClick={() => command("sleep-confirm")}>확인</button><button onClick={() => command("sleep-cancel")}>취소</button></div></div></div>}
        {hud.transitioning && <div className="night-fade"><span>하루를 마무리합니다…</span></div>}
        <div className="inventory-chip" aria-live="polite"><span>씨앗 <b>{hud.seeds}</b></span><span>새싹열매 <b>{hud.harvest}</b></span></div>
        <nav className="quickbar" aria-label="도구 선택">
          {tools.map((tool, index) => {
            const iconPath = tool.visual.source?.kind === "image" ? tool.visual.source.path : null;
            return <button key={tool.key} className={hud.selectedTool === tool.key ? "selected" : ""} onClick={() => command("tool", tool.key)} title={`${index + 1} · ${tool.toolbarHint}`}><em>{index + 1}</em><span style={iconPath ? { backgroundImage: `url(${iconPath})`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" } : undefined}>{iconPath ? "" : tool.visual.icon}</span><small>{tool.name}</small></button>;
          })}
          <button className="sell-slot" onClick={() => command("sell")} disabled={!hud.harvest}><span>🧺</span><small>전부 판매</small></button>
        </nav>
        <button className="action-button" onClick={() => command("action")}>행동</button>
      </section>
    </main>
  );
}
