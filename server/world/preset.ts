import { documentToRegistry, parseEditorDocument } from "../../game/editor/document";
import type { MapEditorDocument } from "../../game/editor/types";
import type { MapDefinition } from "../../game/maps/types";
import { cloneMapDefinitions } from "../../game/maps/MapRegistry";
import { MAP_DEFINITIONS } from "../../game/maps/definitions";

export const WORLD_PRESET_ID = "initial-world";
export type WorldPresetDB = Pick<D1Database, "prepare">;

export interface PublishedWorldPreset {
  document: MapEditorDocument;
  revision: number;
  updatedAt: number;
}

interface WorldPresetRow {
  owner_id: string;
  document_json: string;
  document_version: number;
  revision: number;
  updated_at: number;
}

export function serializeWorldPreset(row: WorldPresetRow | null): (PublishedWorldPreset & { ownerId: string }) | null {
  if (!row) return null;
  try {
    const parsed = parseEditorDocument(JSON.parse(row.document_json));
    if (!parsed.document) return null;
    return { document: parsed.document, revision: row.revision, updatedAt: row.updated_at, ownerId: row.owner_id };
  } catch {
    return null;
  }
}

export async function readPublishedWorldPreset(db: WorldPresetDB): Promise<(PublishedWorldPreset & { ownerId: string }) | null> {
  const row = await db.prepare(
    "SELECT owner_id, document_json, document_version, revision, updated_at FROM world_presets WHERE id = ?",
  ).bind(WORLD_PRESET_ID).first<WorldPresetRow>();
  return serializeWorldPreset(row);
}

export async function publishedWorldMaps(db: WorldPresetDB): Promise<Record<string, MapDefinition>> {
  const preset = await readPublishedWorldPreset(db);
  return preset ? documentToRegistry(preset.document) : cloneMapDefinitions(MAP_DEFINITIONS);
}
