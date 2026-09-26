"use client";
import { useEffect, useState } from "react";
import { gameEvents } from "@/game/events";
import { FAMILY_PRESENCE_TTL_MS } from "@/game/family/presence";
import type { FamilyPresenceSnapshot, FamilySession } from "@/game/family/types";

export function FamilyStatus({ session }: { session: FamilySession }) {
  const [presence, setPresence] = useState<{ snapshot: FamilyPresenceSnapshot; received: number } | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = (event: Event) => { setPresence({ snapshot: (event as CustomEvent<FamilyPresenceSnapshot>).detail, received: Date.now() }); setNow(Date.now()); };
    gameEvents.addEventListener("family-presence", update);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); gameEvents.removeEventListener("family-presence", update); };
  }, []);
  const players = presence?.snapshot.players.filter((p) => presence.snapshot.serverNow + now - presence.received - p.lastSeen < FAMILY_PRESENCE_TTL_MS) ?? [];
  return <details className="family-status"><summary>{session.room.name} · 접속 {players.length}명</summary>
    <p>초대 코드 <strong>{session.room.inviteCode}</strong></p>
    <p>{players.length ? players.map((p) => `${p.nickname}${p.playerId === session.room.playerId ? " (나)" : ""}`).join(" · ") : "참가자 연결 확인 중…"}</p>
    <small>개인 인벤토리 · 공동 자금 · 약 1초 동기화</small>
  </details>;
}
