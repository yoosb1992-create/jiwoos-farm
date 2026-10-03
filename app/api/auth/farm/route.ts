import { env } from "cloudflare:workers";
import {
  FarmAuthError,
  authenticateFarmAccount,
  clearFarmSessionCookie,
  createFarmAccount,
  createFarmSession,
  deleteFarmSession,
  farmSessionCookie,
  readFarmSession,
} from "@/server/auth/farmSession";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      ...(headers ?? {}),
    },
  });

const database = () => {
  if (!env.DB) throw new FarmAuthError(503, "자체 계정 DB가 준비되지 않았습니다.");
  return env.DB.withSession("first-primary");
};

const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
};

const secureRequest = (request: Request) => new URL(request.url).protocol === "https:";

export async function GET(request: Request) {
  try {
    const user = await readFarmSession(database(), request.headers.get("cookie"));
    return json({
      user: user
        ? { loginName: user.loginName, displayName: user.displayName }
        : null,
    });
  } catch (error) {
    if (error instanceof FarmAuthError) return json({ message: error.message }, error.status);
    console.error("farm session read failed", error);
    return json({ message: "자체 계정 저장소를 사용할 수 없습니다." }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ message: "다른 사이트의 로그인 요청은 허용하지 않습니다." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid body");
    body = value as Record<string, unknown>;
  } catch {
    return json({ message: "올바른 JSON 요청이 필요합니다." }, 400);
  }

  const action = String(body.action ?? "");
  const db = database();

  try {
    if (action === "logout") {
      await deleteFarmSession(db, request.headers.get("cookie"));
      return json(
        { ok: true },
        200,
        { "set-cookie": clearFarmSessionCookie(secureRequest(request)) },
      );
    }

    const loginName = String(body.loginName ?? "");
    const password = typeof body.password === "string" ? body.password : "";
    const user = action === "register"
      ? await createFarmAccount(db, loginName, String(body.displayName ?? ""), password)
      : action === "login"
        ? await authenticateFarmAccount(db, loginName, password)
        : null;

    if (!user) throw new FarmAuthError(400, "지원하지 않는 로그인 요청입니다.");

    await deleteFarmSession(db, request.headers.get("cookie"));
    const session = await createFarmSession(db, user.accountId);
    return json(
      { user: { loginName: user.loginName, displayName: user.displayName } },
      200,
      { "set-cookie": farmSessionCookie(session.token, secureRequest(request)) },
    );
  } catch (error) {
    if (error instanceof FarmAuthError) return json({ message: error.message }, error.status);
    console.error("farm authentication failed", error);
    return json({ message: "자체 계정 저장소를 사용할 수 없습니다. D1 초기화를 확인해 주세요." }, 503);
  }
}
