"use client";
import type { DialogueView } from "@/game/npc/dialogue";
export function NpcDialogue({dialogue,onNext,onClose,children}:{dialogue:DialogueView;onNext:()=>void;onClose:()=>void;children?:React.ReactNode}) {
 return <div className="npc-dialogue-shade" onPointerDown={e=>e.stopPropagation()}><section className="npc-dialogue" role="dialog" aria-modal="true" aria-label={`${dialogue.name}와 대화`}>
  <header><span className="npc-portrait" role="img" aria-label={dialogue.name} style={{backgroundImage:`url(${dialogue.image})`}}/><div><b>{dialogue.name}</b>{dialogue.relationship&&<small>{dialogue.relationship}</small>}</div></header>
  <p aria-live="polite">{dialogue.lines[dialogue.index]}</p>{dialogue.notice&&<small role="status">{dialogue.notice}</small>}{children}<footer><span>{dialogue.index+1}/{dialogue.lines.length}</span><button autoFocus onClick={onNext}>{dialogue.index+1<dialogue.lines.length?"다음":"대화 마치기"}</button><button onClick={onClose}>닫기</button></footer>
 </section></div>;
}
