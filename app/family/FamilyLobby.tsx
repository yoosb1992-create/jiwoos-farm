"use client";

import { useEffect, useRef, useState } from "react";
import { FamilyAPIError, familyFetch } from "@/game/family/client";
import type { FamilyRoom, FamilyRoomDetail, FamilySession } from "@/game/family/types";

export function FamilyLobby({ onBack, onEnter }: { onBack: () => void; onEnter: (session: FamilySession) => void }) {
  const [detail, setDetail] = useState<FamilyRoomDetail | null>(null);
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
  const manage = async (roomId: string, action = "detail") => {
    if (busy) return;
    if ((action === "delete" || action === "leave" || action === "rotate") && !window.confirm(action === "delete" ? "이 농장과 모든 가족의 농장 데이터를 영구 삭제할까요?" : action === "leave" ? "농장에서 나갈까요? 재참가 시 개인 인벤토리는 새로 시작합니다." : "기존 초대 코드를 사용할 수 없게 하고 새로 발급할까요?")) return;
    setBusy(true);
    try {
      const result = await familyFetch<FamilyRoomDetail>(action === "detail" ? `/api/family/rooms?roomId=${encodeURIComponent(roomId)}` : "/api/family/rooms", action === "detail" ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId, action, nickname }) });
      const recent = await familyFetch<{rooms: FamilyRoom[]}>("/api/family/rooms");
      if (live.current) { setDetail(result.room ? result : null); setRooms(recent.rooms); setMessage("농장 정보를 갱신했어요."); }
    } catch (error) { if (live.current) setMessage(error instanceof FamilyAPIError ? error.message : "서버 연결을 확인해 주세요."); }
    finally { if (live.current) setBusy(false); }
  };
  return <main className="family-screen"><section className="family-card">
    <button className="family-back" onClick={onBack}>← 처음으로</button>
    <h1>가족 농장</h1><p>각자 지우네 농장 계정으로 로그인해 같은 초대 코드로 모이세요.</p>
    <p className="family-note">Family Beta · 날짜와 자금은 공동, 씨앗과 수확물은 개인 소유입니다. 접속한 가족 모두 수면에 동의하면 다음 날로 넘어갑니다.</p>
    {needsLogin ? <a className="family-primary" href="/login?return_to=%2F%3Ffamily%3D1">로그인 / 계정 만들기</a> : <>
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
      {loading ? <p>불러오는 중…</p> : rooms.length ? <ul className="family-room-list">{rooms.map((room) => <li key={room.id}><div><strong>{room.name}</strong><small>{room.nickname}</small></div><button disabled={busy} onClick={() => void submit({ action: "join", code: room.inviteCode, nickname: nickname.trim() || room.nickname })}>들어가기</button><button disabled={busy} onClick={() => void manage(room.id)}>관리</button></li>)}</ul> : <p>아직 참가한 농장이 없습니다.</p>}
      {detail && <section className="family-management"><h2>{detail.room.name} 관리</h2><p>초대 코드: <strong>{detail.room.inviteCode}</strong></p>
        <ul>{detail.members.map(m => <li key={m.playerId}>{m.nickname} · {m.online ? "접속 중" : "오프라인"}</li>)}</ul>
        <button disabled={busy || !nickname.trim()} onClick={() => void manage(detail.room.id, "rename")}>위 닉네임으로 변경</button>
        {detail.room.isOwner ? <><button disabled={busy} onClick={() => void manage(detail.room.id, "rotate")}>초대 코드 새로 발급</button><button disabled={busy} onClick={() => void manage(detail.room.id, "delete")}>농장 삭제</button><p>방장은 나갈 수 없습니다. 농장 삭제 또는 후속 소유권 이전이 필요합니다.</p></> : <button disabled={busy} onClick={() => void manage(detail.room.id, "leave")}>방 나가기</button>}
        <button onClick={() => setDetail(null)}>관리 닫기</button></section>}
    </>}
    <p role="status" aria-live="polite">{busy ? "농장에 연결하는 중…" : message}</p>
    <p className="family-note">연결이 끊기면 행동을 저장하지 않습니다. 서버와 다시 연결된 뒤 상태를 확인해 주세요. 혼자 하기의 저장 파일은 그대로 보존됩니다.</p>
  </section></main>;
}
