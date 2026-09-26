"use client";

import { useEffect, useRef, useState } from "react";
import { FamilyAPIError, familyFetch } from "@/game/family/client";
import type { FamilyRoom, FamilyRoomDetail, FamilySession } from "@/game/family/types";

export function FamilyLobby({ onBack, onEnter }: { onBack: () => void; onEnter: (session: FamilySession) => void }) {
  const [rooms, setRooms] = useState<FamilyRoom[]>([]);
  const [nickname, setNickname] = useState("");
  const [name, setName] = useState("우리 가족 농장");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [message, setMessage] = useState("");
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    void familyFetch<{ rooms: FamilyRoom[] }>("/api/family/rooms", { signal: controller.signal }).then((result) => {
      if (live.current) { setRooms(result.rooms); setNickname(result.rooms[0]?.nickname ?? ""); }
    }).catch((error) => {
      if (live.current) { setNeedsLogin(error instanceof FamilyAPIError && error.status === 401); setMessage(error instanceof Error ? error.message : "목록을 불러오지 못했습니다."); }
    }).finally(() => { clearTimeout(timeout); if (live.current) setLoading(false); });
    return () => { live.current = false; clearTimeout(timeout); controller.abort(); };
  }, []);
  const submit = async (body: Record<string, string>) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const detail = await familyFetch<FamilyRoomDetail>("/api/family/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (live.current) onEnter({ room: detail.room });
    } catch (error) {
      if (live.current) { setNeedsLogin(error instanceof FamilyAPIError && error.status === 401); setMessage(error instanceof Error ? error.message : "요청에 실패했습니다."); }
    } finally { if (live.current) setBusy(false); }
  };
  return <main className="family-screen"><section className="family-card">
    <button className="family-back" onClick={onBack}>← 처음으로</button>
    <h1>가족 농장</h1><p>각자 ChatGPT 계정으로 로그인해 같은 초대 코드로 모이세요.</p>
    <p className="family-note">Family Alpha · 날짜와 자금은 공동, 씨앗과 수확물은 개인 소유입니다. 한 사람이 잠들면 모두 다음 날로 넘어갑니다.</p>
    {needsLogin ? <a className="family-primary" href="/signin-with-chatgpt?return_to=%2F%3Ffamily%3D1">ChatGPT로 로그인</a> : <>
      <label>구성원 닉네임<input value={nickname} maxLength={20} autoComplete="nickname" placeholder="농장에서 부를 이름" onChange={(event) => setNickname(event.target.value)} disabled={busy} /></label>
      <div className="family-forms">
        <form onSubmit={(event) => { event.preventDefault(); void submit({ action: "create", name, nickname }); }}>
          <h2>새 가족 농장 만들기</h2><label>농장 이름<input value={name} maxLength={40} required onChange={(event) => setName(event.target.value)} /></label>
          <button disabled={busy || loading || !nickname.trim() || !name.trim()}>농장 만들기</button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); void submit({ action: "join", code, nickname }); }}>
          <h2>초대 코드로 참가</h2><label>8자리 초대 코드<input value={code} maxLength={8} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="예: AB3D5F7H" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s/g, ""))} /></label>
          <button disabled={busy || loading || !nickname.trim() || code.length !== 8}>참가하기</button>
        </form>
      </div>
      <h2>최근 참가한 가족 농장</h2>
      {loading ? <p>불러오는 중…</p> : rooms.length ? <ul className="family-room-list">{rooms.map((room) => <li key={room.id}><div><strong>{room.name}</strong><small>{room.nickname}</small></div><button disabled={busy} onClick={() => void submit({ action: "join", code: room.inviteCode, nickname: nickname.trim() || room.nickname })}>들어가기</button></li>)}</ul> : <p>아직 참가한 농장이 없습니다.</p>}
    </>}
    <p role="status" aria-live="polite">{busy ? "농장에 연결하는 중…" : message}</p>
    <p className="family-note">연결이 끊기면 행동을 저장하지 않습니다. 서버와 다시 연결된 뒤 상태를 확인해 주세요. 혼자 하기의 저장 파일은 그대로 보존됩니다.</p>
  </section></main>;
}
