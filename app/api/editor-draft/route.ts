import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { parseEditorDocument } from "@/game/editor/document";
import type { MapEditorDocument } from "@/game/editor/types";

export const dynamic = "force-dynamic";

interface DraftRow { document_json: string; document_version: number; revision: number; updated_at: number }

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

function database() {
  const binding = env.DB;
  if (!binding) throw new Error("D1 binding DB is unavailable");
  return binding;
}

function serializeRow(row: DraftRow | null) {
  if (!row) return null;
  try {
    const parsed = parseEditorDocument(JSON.parse(row.document_json));
    if (!parsed.document) return null;
    return { document: parsed.document, revision: row.revision, updatedAt: row.updated_at };
  } catch { return null; }
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return json({ message: "authentication required" }, 401);
  try {
    const row = await database().prepare("SELECT document_json, document_version, revision, updated_at FROM editor_drafts WHERE owner_id = ?")
      .bind(user.userId).first<DraftRow>();
    return json({ draft: serializeRow(row) });
  } catch (error) {
    console.error("editor draft load failed", error);
    return json({ message: "cloud draft unavailable" }, 503);
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({ message: "authentication required" }, 401);
  let payload: { document?: unknown; expectedRevision?: unknown };
  try { payload = await request.json(); } catch { return json({ message: "올바른 JSON 요청이 아닙니다." }, 400); }
  const parsed = parseEditorDocument(payload.document);
  if (!parsed.document) return json({ message: `편집 문서에 ${parsed.issues.length}개 검증 오류가 있습니다.`, issues: parsed.issues }, 400);
  const expectedRevision = Number(payload.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return json({ message: "revision 값이 올바르지 않습니다." }, 400);

  const document = parsed.document as MapEditorDocument;
  const updatedAt = Math.max(Date.now(), document.updatedAt);
  const body = JSON.stringify({ ...document, updatedAt });
  try {
    const db = database();
    const current = await db.prepare("SELECT document_json, document_version, revision, updated_at FROM editor_drafts WHERE owner_id = ?")
      .bind(user.userId).first<DraftRow>();
    if (current && current.revision !== expectedRevision) return json({ message: "newer cloud draft", draft: serializeRow(current) }, 409);
    if (!current && expectedRevision !== 0) return json({ message: "cloud draft was reset", draft: null }, 409);

    const nextRevision = expectedRevision + 1;
    const result = current
      ? await db.prepare("UPDATE editor_drafts SET document_version = ?, document_json = ?, revision = ?, updated_at = ? WHERE owner_id = ? AND revision = ?")
        .bind(document.editorVersion, body, nextRevision, updatedAt, user.userId, expectedRevision).run()
      : await db.prepare("INSERT OR IGNORE INTO editor_drafts (owner_id, document_version, document_json, revision, updated_at) VALUES (?, ?, ?, ?, ?)")
        .bind(user.userId, document.editorVersion, body, nextRevision, updatedAt).run();
    if ((result.meta.changes ?? 0) !== 1) {
      const latest = await db.prepare("SELECT document_json, document_version, revision, updated_at FROM editor_drafts WHERE owner_id = ?")
        .bind(user.userId).first<DraftRow>();
      return json({ message: "newer cloud draft", draft: serializeRow(latest) }, 409);
    }
    return json({ draft: { document: { ...document, updatedAt }, revision: nextRevision, updatedAt } });
  } catch (error) {
    console.error("editor draft save failed", error);
    return json({ message: "cloud draft unavailable" }, 503);
  }
}
