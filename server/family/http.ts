import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../app/chatgpt-auth";
import { FamilyError, type FamilyDB } from "./rooms";

export const familyJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
export async function familyRequest(request: Request, action: (db: FamilyDB, userId: string) => Promise<unknown>) {
  const user = await getChatGPTUser();
  if (!user) return familyJson({ message: "ChatGPT 로그인이 필요합니다." }, 401);
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) return familyJson({ message: "다른 사이트의 요청은 허용하지 않습니다." }, 403);
  }
  try {
    if (!env.DB) throw new FamilyError(503, "가족 농장 DB가 준비되지 않았습니다.");
    return familyJson(await action(env.DB.withSession("first-primary"), user.userId));
  } catch (error) {
    if (error instanceof FamilyError) return familyJson({ message: error.message }, error.status);
    console.error("family api failed", error);
    return familyJson({ message: "가족 농장 서버를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
}
export async function familyBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new FamilyError(415, "JSON 요청이 필요합니다.");
  const text = await request.text();
  if (text.length > 4096) throw new FamilyError(413, "요청이 너무 큽니다.");
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new FamilyError(400, "올바른 JSON이 아닙니다."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new FamilyError(400, "올바른 요청이 아닙니다.");
  return body as Record<string, unknown>;
}
