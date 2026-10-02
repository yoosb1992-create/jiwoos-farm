"use client";
import { useEffect, useState } from "react";
import { familyFetch, CONNECTION_LABELS, type FamilyConnection } from "@/game/family/client";
import { gameEvents } from "@/game/events";
import { FAMILY_PRESENCE_TTL_MS } from "@/game/family/presence";
import type { FamilyPresenceSnapshot, FamilySession, FamilySnapshot, FamilyPresence, FamilyRoomDetail } from "@/game/family/types";

export function FamilyRoster({ players, ownId, mapId }: { players: FamilyPresence[]; ownId: string; mapId: string }) {
  return <ul className="family-roster">{players.map(player => <li key={player.playerId}><span>{player.nickname}{player.playerId === ownId ? " (나)" : ""}</span><small>{player.mapId === mapId ? "같은 맵" : "다른 맵"}</small></li>)}</ul>;
}

export function FamilyStatus({ session, mapId = "farm" }: { session: FamilySession; mapId?: string }) {
  const [presence, setPresence] = useState<{ snapshot: FamilyPresenceSnapshot; received: number } | null>(null);
  const [connection, setConnection] = useState<FamilyConnection>("connecting");
  const [sleep, setSleep] = useState<FamilySnapshot["sleep"]>();
  const [room, setRoom] = useState(session.room);
  const [copyMessage, setCopyMessage] = useState("");
  const [open, setOpen] = useState(false);
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
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    void familyFetch<FamilyRoomDetail>(`/api/family/rooms?roomId=${encodeURIComponent(session.room.id)}`, { signal: controller.signal })
      .then(detail => { if (!controller.signal.aborted) setRoom(detail.room); })
      .catch(() => {}).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [open, session.room.id]);
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(room.inviteCode); setCopyMessage("초대 코드를 복사했어요."); }
    catch { setCopyMessage("복사할 수 없습니다. 위 코드를 길게 눌러 복사해 주세요."); }
  };
  const players = presence?.snapshot.players.filter((p) => presence.snapshot.serverNow + now - presence.received - p.lastSeen < FAMILY_PRESENCE_TTL_MS) ?? [];
  return <details className="family-status" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span>가족 {players.length}명</span><span role="status">{CONNECTION_LABELS[connection]}</span>{!!sleep?.agreed && <span>수면 {sleep.agreed}/{sleep.online}</span>}</summary>
    <div className="family-panel-body"><b>{room.name}</b>
    <p>초대 코드 <strong>{room.inviteCode}</strong> <button onClick={() => void copyCode()}>복사</button></p>
    {!!copyMessage && <p role="status">{copyMessage}</p>}
    {players.length ? <FamilyRoster players={players} ownId={session.room.playerId} mapId={mapId} /> : <p>참가자 연결 확인 중…</p>}
    {!!sleep?.agreed && <p role="status">{sleep.waiting.join(", ")}님이 잠자기를 기다리고 있습니다. ({sleep.agreed}/{sleep.online}) {sleep.voted && <button disabled={connection !== "connected"} onClick={() => gameEvents.dispatchEvent(new CustomEvent("command", { detail: { type: "family-sleep-cancel" } }))}>투표 취소</button>}</p>}
    <small>개인 인벤토리 · 공동 자금 · 이동은 실시간 연결, 영구 상태는 서버 동기화</small>
    </div>
  </details>;
}
