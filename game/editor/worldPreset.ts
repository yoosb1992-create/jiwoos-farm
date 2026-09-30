import type { MapEditorDocument } from "./types";

export interface PublishedWorldPreset {
  document: MapEditorDocument;
  revision: number;
  updatedAt: number;
}

export type WorldPresetLoadResult =
  | { status: "ok"; preset: PublishedWorldPreset | null }
  | { status: "unavailable"; message: string };

export type WorldPresetPublishResult =
  | { status: "ok"; preset: PublishedWorldPreset }
  | { status: "conflict"; preset: PublishedWorldPreset | null; message: string }
  | { status: "unauthorized" | "forbidden" | "invalid" | "unavailable"; message: string };

export class PublishedWorldRepository {
  constructor(private readonly endpoint = "/api/world-preset") {}

  async load(): Promise<WorldPresetLoadResult> {
    try {
      const response = await fetch(this.endpoint, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) return { status: "unavailable", message: "게시된 초기 월드를 불러올 수 없습니다. 내장 월드로 시작합니다." };
      const body = await response.json() as { preset: PublishedWorldPreset | null };
      return { status: "ok", preset: body.preset };
    } catch {
      return { status: "unavailable", message: "초기 월드 서버에 연결할 수 없어 내장 월드를 사용합니다." };
    }
  }

  async publish(document: MapEditorDocument, expectedRevision: number): Promise<WorldPresetPublishResult> {
    try {
      const response = await fetch(this.endpoint, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document, expectedRevision }),
      });
      const body = await response.json().catch(() => ({})) as {
        preset?: PublishedWorldPreset | null;
        message?: string;
      };
      if (response.status === 409) return { status: "conflict", preset: body.preset ?? null, message: body.message ?? "더 최신 초기 월드가 있습니다." };
      if (response.status === 401) return { status: "unauthorized", message: body.message ?? "로그인이 필요합니다." };
      if (response.status === 403) return { status: "forbidden", message: body.message ?? "초기 월드를 갱신할 권한이 없습니다." };
      if (response.status === 400) return { status: "invalid", message: body.message ?? "월드 검증 오류가 있습니다." };
      if (!response.ok || !body.preset) return { status: "unavailable", message: body.message ?? "초기 월드 게시에 실패했습니다." };
      return { status: "ok", preset: body.preset };
    } catch {
      return { status: "unavailable", message: "네트워크 연결이 없어 초기 월드에 적용하지 못했습니다." };
    }
  }
}
