import type { MapEditorDocument } from "./types";

export interface CloudEditorDraft {
  document: MapEditorDocument;
  revision: number;
  updatedAt: number;
}

export type CloudLoadResult =
  | { status: "ok"; draft: CloudEditorDraft | null }
  | { status: "unauthorized" | "unavailable"; message: string };

export type CloudSaveResult =
  | { status: "ok"; draft: CloudEditorDraft }
  | { status: "conflict"; draft: CloudEditorDraft }
  | { status: "unauthorized" | "unavailable" | "invalid"; message: string };

export class CloudMapEditorRepository {
  constructor(private readonly endpoint = "/api/editor-draft") {}

  async load(): Promise<CloudLoadResult> {
    try {
      const response = await fetch(this.endpoint, { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) return { status: "unauthorized", message: "로그인 후 클라우드 초안을 사용할 수 있습니다." };
      if (!response.ok) return { status: "unavailable", message: "클라우드 초안을 불러올 수 없습니다. 로컬 편집은 계속할 수 있습니다." };
      const body = await response.json() as { draft: CloudEditorDraft | null };
      return { status: "ok", draft: body.draft };
    } catch {
      return { status: "unavailable", message: "오프라인 상태입니다. 로컬에 먼저 보관합니다." };
    }
  }

  async save(document: MapEditorDocument, expectedRevision: number): Promise<CloudSaveResult> {
    try {
      const response = await fetch(this.endpoint, {
        method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ document, expectedRevision }),
      });
      const body = await response.json().catch(() => ({})) as { draft?: CloudEditorDraft; message?: string };
      if (response.status === 409 && body.draft) return { status: "conflict", draft: body.draft };
      if (response.status === 401) return { status: "unauthorized", message: "로그인 후 클라우드 초안을 사용할 수 있습니다." };
      if (response.status === 400) return { status: "invalid", message: body.message ?? "검증 오류로 클라우드에 저장하지 않았습니다." };
      if (!response.ok || !body.draft) return { status: "unavailable", message: body.message ?? "클라우드 저장에 실패했습니다. 로컬 사본은 안전하게 유지됩니다." };
      return { status: "ok", draft: body.draft };
    } catch {
      return { status: "unavailable", message: "네트워크 연결이 없어 로컬에만 보관했습니다." };
    }
  }
}
