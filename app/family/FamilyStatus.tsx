"use client";
import { useEffect, useState } from "react";
import { CONNECTION_LABELS, type FamilyConnection } from "@/game/family/client";
import { gameEvents } from "@/game/events";
import { FAMILY_PRESENCE_TTL_MS } from "@/game/family/presence";
import type { FamilyPresenceSnapshot, FamilySession, FamilySnapshot } from "@/game/family/types";

export function FamilyStatus({ session }: { session: FamilySession }) {
  const [presence, setPresence] = useState<{ snapshot: FamilyPresenceSnapshot; received: number } | null>(null);
  const [connection, setConnection] = useState<FamilyConnection>("connecting");
  const [sleep, setSleep] = useState<FamilySnapshot["sleep"]>();
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = (event: Event) => { setPresence({ snapshot: (event as CustomEvent<FamilyPresenceSnapshot>).detail, received: Date.now() }); setNow(Date.now()); };
    const status = (event: Event) => { const d = (event as CustomEvent).detail; if (d.roomId === session.room.id) setConnection(d.state); };
    const sleepStatus = (event: Event) => setSleep((event as CustomEvent).detail);
    gameEvents.addEventListener("family-sleep", sleepStatus);
    gameEvents.addEventListener("family-connection", status);
    gameEvents.addEventListener("family-presence", update);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { gameEvents.removeEventListener("family-sleep", sleepStatus); gameEvents.removeEventListener("family-connection", status); clearInterval(timer); gameEvents.removeEventListener("family-presence", update); };
  }, [session.room.id]);
  const players = presence?.snapshot.players.filter((p) => presence.snapshot.serverNow + now - presence.received - p.lastSeen < FAMILY_PRESENCE_TTL_MS) ?? [];
  return <details className="family-status"><summary>{session.room.name} · 접속 {players.length}명 · <span role="status">{CONNECTION_LABELS[connection]}</span></summary>
    <p>초대 코드 <strong>{session.room.inviteCode}</strong></p>
    <p>{players.length ? players.map((p) => `${p.nickname}${p.playerId === session.room.playerId ? " (나)" : ""}`).join(" · ") : "참가자 연결 확인 중…"}</p>
    {!!sleep?.agreed && <p role="status">{sleep.waiting.join(", ")}님이 잠자기를 기다리고 있습니다. ({sleep.agreed}/{sleep.online}) {sleep.voted && <button onClick={() => gameEvents.dispatchEvent(new CustomEvent("command", { detail: { type: "family-sleep-cancel" } }))}>투표 취소</button>}</p>}
    <small>개인 인벤토리 · 공동 자금 · 약 1초 동기화</small>
  </details>;
}
