import { MAP_DEFINITIONS } from "../maps/definitions";
import type { MapDefinition } from "../maps/types";
import { cloneMapDefinitions } from "../maps/MapRegistry";
import { ensureRuntimeEntranceAnchors } from "../maps/runtimeEntrances";
import { EDITOR_DOCUMENT_VERSION, type MapEditorDocument } from "./types";
import { validateEditorDocument } from "./validation";

export const createBuiltInEditorDocument = (): MapEditorDocument => ({
  editorVersion: EDITOR_DOCUMENT_VERSION,
  maps: Object.values(cloneMapDefinitions(MAP_DEFINITIONS)),
  updatedAt: Date.now(),
});

export const documentToRegistry = (document: MapEditorDocument) =>
  ensureRuntimeEntranceAnchors(Object.fromEntries(document.maps.map((map) => [map.id, structuredClone(map)])) as Record<string, MapDefinition>);

export const cloneEditorDocument = (document: MapEditorDocument) => structuredClone(document) as MapEditorDocument;

export const touchEditorDocument = (document: MapEditorDocument, now = Date.now()): MapEditorDocument => {
  document.updatedAt = Math.max(now, document.updatedAt + 1);
  return document;
};

export const parseEditorDocument = (value: unknown) => {
  const issues = validateEditorDocument(value);
  if (issues.length) return { document: null, issues };
  const document = cloneEditorDocument(value as MapEditorDocument);
  const maps = ensureRuntimeEntranceAnchors(Object.fromEntries(document.maps.map((map) => [map.id, map])) as Record<string, MapDefinition>);
  document.maps = Object.values(maps);
  return { document, issues };
};

type LocalEditorManifest = {
  editorVersion: number;
  updatedAt: number;
  mapIds: string[];
};

export class LocalMapEditorRepository {
  static readonly legacyKey = "jiwoos-farm.map-editor.v1";
  static readonly key = "jiwoos-farm.map-editor.v2.manifest";

  private static mapKey(mapId: string) {
    return `jiwoos-farm.map-editor.v2.map.${encodeURIComponent(mapId)}`;
  }

  save(document: MapEditorDocument) {
    try {
      const previous = this.readManifest();
      const mapIds = document.maps.map((map) => map.id);
      // Serialize one map at a time instead of building one world-sized JSON
      // string. This keeps peak autosave memory bounded by the largest map.
      for (const map of document.maps) {
        localStorage.setItem(LocalMapEditorRepository.mapKey(map.id), JSON.stringify(map));
      }
      const manifest: LocalEditorManifest = {
        editorVersion: document.editorVersion,
        updatedAt: document.updatedAt,
        mapIds,
      };
      localStorage.setItem(LocalMapEditorRepository.key, JSON.stringify(manifest));
      if (previous) {
        const active = new Set(mapIds);
        for (const stale of previous.mapIds) {
          if (!active.has(stale)) localStorage.removeItem(LocalMapEditorRepository.mapKey(stale));
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  load() {
    const split = this.loadSplit();
    if (split) return split;
    const stored = localStorage.getItem(LocalMapEditorRepository.legacyKey);
    if (!stored) return null;
    try { return parseEditorDocument(JSON.parse(stored)).document; } catch { return null; }
  }

  private readManifest(): LocalEditorManifest | null {
    const stored = localStorage.getItem(LocalMapEditorRepository.key);
    if (!stored) return null;
    try {
      const value = JSON.parse(stored) as Partial<LocalEditorManifest>;
      if (!Number.isInteger(value.editorVersion) || !Number.isFinite(value.updatedAt) || !Array.isArray(value.mapIds) || value.mapIds.some((id) => typeof id !== "string")) return null;
      return value as LocalEditorManifest;
    } catch {
      return null;
    }
  }

  private loadSplit() {
    const manifest = this.readManifest();
    if (!manifest) return null;
    try {
      const maps = manifest.mapIds.map((id) => {
        const stored = localStorage.getItem(LocalMapEditorRepository.mapKey(id));
        if (!stored) throw new Error("missing map");
        return JSON.parse(stored) as MapDefinition;
      });
      return parseEditorDocument({
        editorVersion: manifest.editorVersion,
        maps,
        updatedAt: manifest.updatedAt,
      }).document;
    } catch {
      return null;
    }
  }
}
