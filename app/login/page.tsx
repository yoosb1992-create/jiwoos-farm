"use client";
import { useEffect, useState } from "react";
const safeReturnTo = () => { const value = new URLSearchParams(window.location.search).get("return_to") ?? "/"; return value.startsWith("/") && !value.startsWith("//") ? value : "/"; };
export default function LoginPage() {
  const [username,setUsername]=useState(""), [password,setPassword]=useState(""), [busy,setBusy]=useState(false), [message,setMessage]=useState("");
  useEffect(() => { const controller=new AbortController(); void fetch("/api/auth/session",{cache:"no-store",credentials:"same-origin",signal:controller.signal})
    .then(r=>r.ok?r.json():null).then(p=>{if(p?.user)window.location.replace(safeReturnTo());}).catch(()=>{}); return()=>controller.abort(); },[]);
  const submit=async(action:"login"|"register")=>{ if(busy)return; setBusy(true); setMessage("");
    try { const response=await fetch("/api/auth/session",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({action,username,password})});
      const payload=await response.json() as {message?:string}; if(!response.ok){setMessage(payload.message??"로그인에 실패했습니다.");return;} window.location.assign(safeReturnTo());
    } catch { setMessage("서버에 연결할 수 없습니다."); } finally { setBusy(false); } };
  const disabled=busy||!username.trim()||[...password].length<2;
  return <main className="family-screen"><section className="family-card family-welcome">
    <span className="family-leaf" aria-hidden="true">🌱</span><h1>지우네 농장 로그인</h1><p>외부 Cloudflare 서버에서 사용할 지우네 농장 계정입니다.</p>
    <label>사용자 이름<input value={username} maxLength={40} autoComplete="username" onChange={e=>setUsername(e.target.value)} disabled={busy}/></label>
    <label>비밀번호<input type="password" value={password} minLength={2} autoComplete="current-password" onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>
    <p className="family-note">비밀번호는 2자 이상이면 됩니다. 최대 길이와 영문·숫자·특수문자 조합 제한은 두지 않습니다.</p>
    <div className="family-forms"><button className="family-primary" disabled={disabled} onClick={()=>void submit("login")}>로그인</button><button className="family-secondary" disabled={disabled} onClick={()=>void submit("register")}>새 계정 만들기</button></div>
    <p role="status" aria-live="polite">{busy?"확인 중…":message}</p><a className="family-secondary" href="/">처음으로</a>
  </section></main>;
}
