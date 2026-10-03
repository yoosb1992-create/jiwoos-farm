import { env } from "cloudflare:workers";
import { getAppUser } from "@/app/auth";
import { NativeAuthError, authenticateNativeUser, clearNativeSessionCookie, createNativeSession, deleteNativeSession, ensureNativeAuthStorage, nativeSessionCookie, readNativeSessionToken, registerNativeUser } from "@/server/auth/native";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200, cookie?: string) => {
  const headers = new Headers({ "cache-control": "no-store" }); if (cookie) headers.set("set-cookie", cookie);
  return Response.json(body, { status, headers });
};
const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return request.headers.get("sec-fetch-site") !== "cross-site" && (!origin || origin === new URL(request.url).origin);
};
export async function GET() { return json({ user: await getAppUser() }); }
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ message: "다른 사이트의 요청은 허용하지 않습니다." }, 403);
  const db = env.DB?.withSession("first-primary");
  if (!db) return json({ message: "로그인 DB가 준비되지 않았습니다." }, 503);
  let body: { action?: unknown; username?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return json({ message: "올바른 JSON 요청이 아닙니다." }, 400); }
  try {
    await ensureNativeAuthStorage(db);
    const action = String(body.action ?? "");
    if (action === "logout") {
      await deleteNativeSession(db, readNativeSessionToken(request.headers.get("cookie")));
      return json({ ok: true }, 200, clearNativeSessionCookie(request.url));
    }
    const user = action === "register" ? await registerNativeUser(db, body.username, body.password)
      : action === "login" ? await authenticateNativeUser(db, body.username, body.password) : null;
    if (!user) return json({ message: "지원하지 않는 로그인 요청입니다." }, 400);
    const session = await createNativeSession(db, user.userId);
    return json({ user: { ...user, source: "native" } }, 200, nativeSessionCookie(session.token, request.url));
  } catch (error) {
    if (error instanceof NativeAuthError) return json({ message: error.message }, error.status);
    console.error("native auth failed", error);
    return json({ message: "로그인 처리 중 오류가 발생했습니다." }, 503);
  }
}
