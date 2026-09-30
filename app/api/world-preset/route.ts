import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { parseEditorDocument } from "@/game/editor/document";
import type { MapEditorDocument } from "@/game/editor/types";
import { WORLD_PRESET_ID, ensureWorldPresetStorage, readPublishedWorldPreset } from "@/server/world/preset";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

function database() {
  const binding = env.DB;
  if (!binding) throw new Error("D1 binding DB is unavailable");
  return binding;
}

export async function GET() {
  try {
    const preset = await readPublishedWorldPreset(database());
    return json({ preset: preset ? { document: preset.document, revision: preset.revision, updatedAt: preset.updatedAt } : null });
  } catch (error) {
    console.error("world preset load failed", error);
    return json({ message: "초기 월드 설정을 불러올 수 없습니다." }, 503);
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ message: "로그인이 필요합니다." }, 401);

  let payload: { document?: unknown; expectedRevision?: unknown };
  try { payload = await request.json(); }
  catch { return json({ message: "올바른 JSON 요청이 아닙니다." }, 400); }

  const parsed = parseEditorDocument(payload.document);
  if (!parsed.document) {
    return json({ message: `편집 문서에 ${parsed.issues.length}개 검증 오류가 있습니다.`, issues: parsed.issues }, 400);
  }
  const expectedRevision = Number(payload.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    return json({ message: "초기 월드 버전 값이 올바르지 않습니다." }, 400);
  }

  const document = parsed.document as MapEditorDocument;
  const updatedAt = Math.max(Date.now(), document.updatedAt);
  const body = JSON.stringify({ ...document, updatedAt });

  try {
    const db = database();
    await ensureWorldPresetStorage(db);
    const current = await readPublishedWorldPreset(db);
    if (current && current.ownerId !== user.userId) {
      return json({ message: "이 초기 월드는 처음 게시한 계정에서만 갱신할 수 있습니다." }, 403);
    }
    if (current && current.revision !== expectedRevision) {
      return json({ message: "더 최신 초기 월드가 이미 게시되어 있습니다.", preset: { document: current.document, revision: current.revision, updatedAt: current.updatedAt } }, 409);
    }
    if (!current && expectedRevision !== 0) {
      return json({ message: "게시된 초기 월드가 초기화되었습니다.", preset: null }, 409);
    }

    const nextRevision = expectedRevision + 1;
    const result = current
      ? await db.prepare(
          "UPDATE world_presets SET document_version = ?, document_json = ?, revision = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND revision = ?",
        ).bind(document.editorVersion, body, nextRevision, updatedAt, WORLD_PRESET_ID, user.userId, expectedRevision).run()
      : await db.prepare(
          "INSERT OR IGNORE INTO world_presets (id, owner_id, document_version, document_json, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(WORLD_PRESET_ID, user.userId, document.editorVersion, body, nextRevision, updatedAt).run();

    if ((result.meta.changes ?? 0) !== 1) {
      const latest = await readPublishedWorldPreset(db);
      return json({ message: "더 최신 초기 월드가 이미 게시되어 있습니다.", preset: latest ? { document: latest.document, revision: latest.revision, updatedAt: latest.updatedAt } : null }, 409);
    }

    return json({ preset: { document: { ...document, updatedAt }, revision: nextRevision, updatedAt } });
  } catch (error) {
    console.error("world preset publish failed", error);
    return json({ message: "초기 월드 설정을 저장할 수 없습니다." }, 503);
  }
}
