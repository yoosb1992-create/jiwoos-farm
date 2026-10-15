"use client";
import type { HudState } from "@/game/events";
export function VillageJournal({hud,onClose}:{hud:HudState;onClose:()=>void}){
 const labels={locked:"잠김",available:"받을 수 있음",active:"진행 중",completed:"보상 수령 가능",rewarded:"완료"};
 return <div className="npc-dialogue-shade"><section className="npc-dialogue village-journal" role="dialog" aria-modal="true" aria-label="주민과 의뢰"><header><b>주민과 나의 의뢰</b><button autoFocus onClick={onClose}>닫기</button></header>
 <p className="journal-note">주민 가까이에서 Space 또는 행동 버튼으로 대화하세요. ! 의뢰 · ★ 전달/보상 가능</p>
 <ul>{hud.villagers?.map(n=><li key={n.id}><b>{n.name}</b> · {n.level} ({n.points})<small>{n.location} · {n.activity}</small></li>)}</ul>
 {hud.quests?.map(q=><article key={q.id}><b>{q.name} · {labels[q.status]}</b><p>{q.description}</p><small>{q.detail} · {q.reward}</small></article>)}
 </section></div>;
}
