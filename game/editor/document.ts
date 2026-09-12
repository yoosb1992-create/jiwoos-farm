import { MAP_DEFINITIONS } from "../maps/definitions";
import type { MapDefinition } from "../maps/types";
import { cloneMapDefinitions } from "../maps/MapRegistry";
import { EDITOR_DOCUMENT_VERSION, type MapEditorDocument } from "./types";
import { validateEditorDocument } from "./validation";

export const createBuiltInEditorDocument = (): MapEditorDocument => ({
  editorVersion: EDITOR_DOCUMENT_VERSION,
  maps: Object.values(cloneMapDefinitions(MAP_DEFINITIONS)),
  updatedAt: Date.now(),
});

export const documentToRegistry = (document: MapEditorDocument) =>
  Object.fromEntries(document.maps.map((map) => [map.id, structuredClone(map)])) as Record<string, MapDefinition>;

export const cloneEditorDocument = (document: MapEditorDocument) => structuredClone(document) as MapEditorDocument;

export const parseEditorDocument = (value: unknown) => {
  const issues = validateEditorDocument(value);
  return issues.length ? { document: null, issues } : { document: cloneEditorDocument(value as MapEditorDocument), issues };
};

export class LocalMapEditorRepository {
  static readonly key = "jiwoos-farm.map-editor.v1";
  save(document: MapEditorDocument) { localStorage.setItem(LocalMapEditorRepository.key, JSON.stringify({ ...document, updatedAt: Date.now() })); }
  load() {
    const stored = localStorage.getItem(LocalMapEditorRepository.key);
    if (!stored) return null;
    try { return parseEditorDocument(JSON.parse(stored)).document; } catch { return null; }
  }
}
