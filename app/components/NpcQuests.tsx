"use client";
import type { QuestView,QuestAction } from "@/game/quests/engine";
export function NpcQuests({quests,busy,onAction}:{quests:QuestView[];busy?:boolean;onAction:(action:QuestAction)=>void}){
 const labels={locked:"아직 잠긴 의뢰",available:"받을 수 있어요",active:"진행 중",completed:"보상 받기",rewarded:"마친 의뢰"};
 return <div className="npc-quests">{quests.map(q=><article key={q.id}><b>{q.name} · {labels[q.status]}</b><p>{q.description}</p><small>{q.detail} · 보상: {q.reward}</small>
 {q.status==="available"&&<button disabled={busy} onClick={()=>onAction({kind:"quest-start",questId:q.id})}>의뢰 받기</button>}
 {q.status==="active"&&q.canDeliver&&<button disabled={busy} onClick={()=>onAction({kind:"quest-deliver",questId:q.id})}>수확물 전달</button>}
 {q.status==="completed"&&<button disabled={busy} onClick={()=>onAction({kind:"quest-reward",questId:q.id})}>보상 받기</button>}
 </article>)}</div>;
}
