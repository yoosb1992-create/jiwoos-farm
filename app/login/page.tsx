"use client";

import { FormEvent, useEffect, useState } from "react";

type Mode = "login" | "register";

const safeReturnPath = (value: string | null) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
};

export default function FarmLoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [loginName, setLoginName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [returnTo, setReturnTo] = useState("/");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sitesHost, setSitesHost] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(safeReturnPath(params.get("return_to")));
    setSitesHost(window.location.hostname.endsWith(".chatgpt.site"));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/farm", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: mode,
          loginName,
          displayName,
          password,
        }),
      });
      const body = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) {
        setMessage(body.message ?? "로그인에 실패했습니다.");
        return;
      }
      window.location.assign(returnTo);
    } catch {
      setMessage("로그인 서버에 연결할 수 없습니다.");
    } finally {
      setBusy(false);
    }
  };

  const chatGptHref = "/signin-with-chatgpt?return_to=" + encodeURIComponent(returnTo);

  return <main className="family-screen"><section className="family-card">
    <a className="family-back" href={returnTo}>← 돌아가기</a>
    <h1>지우네 농장 로그인</h1>
    <p>외부 Cloudflare 서버에서도 사용할 수 있는 지우네 농장 자체 계정입니다.</p>

    <div className="compact-buttons">
      <button className={mode === "login" ? "primary" : ""} onClick={() => setMode("login")} disabled={busy}>로그인</button>
      <button className={mode === "register" ? "primary" : ""} onClick={() => setMode("register")} disabled={busy}>새 계정</button>
    </div>

    <form onSubmit={submit}>
      <label>계정 이름
        <input
          value={loginName}
          minLength={2}
          maxLength={32}
          autoComplete="username"
          spellCheck={false}
          required
          onChange={(event) => setLoginName(event.target.value)}
          disabled={busy}
        />
      </label>
      {mode === "register" && <label>표시 이름
        <input
          value={displayName}
          maxLength={20}
          autoComplete="nickname"
          required
          onChange={(event) => setDisplayName(event.target.value)}
          disabled={busy}
        />
      </label>}
      <label>비밀번호
        <input
          type="password"
          value={password}
          minLength={2}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />
      </label>
      <small>비밀번호는 2글자 이상이면 되며, 지우네 농장에서는 별도의 최대 길이를 제한하지 않습니다.</small>
      <button className="family-primary" disabled={busy || password.length < 2 || loginName.trim().length < 2}>
        {busy ? "확인 중…" : mode === "register" ? "계정 만들고 로그인" : "로그인"}
      </button>
    </form>

    {sitesHost && <p className="family-note">현재 ChatGPT Sites에서는 기존 방식도 계속 사용할 수 있습니다. <a href={chatGptHref}>ChatGPT 계정으로 로그인</a></p>}
    <p role="status" aria-live="polite">{message}</p>
  </section></main>;
}
