import type { MapEditorDocument } from "./types";
import type { MapDefinition } from "../maps/types";

export class EditorHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private readonly clone: (value: T) => T, private readonly limit = 75) {}
  push(previous: T) {
    this.past.push(this.clone(previous));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(current: T) {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(this.clone(current));
    return this.clone(previous);
  }
  redo(current: T) {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(this.clone(current));
    return this.clone(next);
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  clear() { this.past = []; this.future = []; }
}

type DocumentHistoryEntry =
  | { kind: "map"; mapId: string; map: MapDefinition }
  | { kind: "document"; document: MapEditorDocument };

const cloneMap = (map: MapDefinition) => structuredClone(map) as MapDefinition;
const cloneDocument = (document: MapEditorDocument) => structuredClone(document) as MapEditorDocument;

/**
 * Editor history optimized for a world made of many maps.
 *
 * Normal edits snapshot only the active map. Full-document snapshots are
 * reserved for structural operations such as import/reset/map add/remove.
 * This keeps undo memory tied to the map being edited instead of multiplying
 * the entire world document for every brush stroke or object move.
 */
export class EditorDocumentHistory {
  private past: DocumentHistoryEntry[] = [];
  private future: DocumentHistoryEntry[] = [];

  constructor(private readonly limit = 30) {}

  pushMap(document: MapEditorDocument, mapId: string) {
    const map = document.maps.find((entry) => entry.id === mapId);
    if (!map) return;
    this.push({ kind: "map", mapId, map: cloneMap(map) });
  }

  pushDocument(document: MapEditorDocument) {
    this.push({ kind: "document", document: cloneDocument(document) });
  }

  undo(current: MapEditorDocument) {
    const previous = this.past.pop();
    if (!previous) return null;
    const swapped = this.swap(current, previous);
    if (!swapped) return null;
    this.future.push(swapped.inverse);
    return swapped.document;
  }

  redo(current: MapEditorDocument) {
    const next = this.future.pop();
    if (!next) return null;
    const swapped = this.swap(current, next);
    if (!swapped) return null;
    this.past.push(swapped.inverse);
    return swapped.document;
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  clear() {
    this.past = [];
    this.future = [];
  }

  private push(entry: DocumentHistoryEntry) {
    this.past.push(entry);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  private swap(current: MapEditorDocument, entry: DocumentHistoryEntry) {
    if (entry.kind === "document") {
      return {
        document: cloneDocument(entry.document),
        inverse: { kind: "document", document: cloneDocument(current) } satisfies DocumentHistoryEntry,
      };
    }
    const index = current.maps.findIndex((map) => map.id === entry.mapId);
    if (index < 0) return null;
    const next: MapEditorDocument = { ...current, maps: current.maps.slice() };
    const currentMap = current.maps[index];
    next.maps[index] = cloneMap(entry.map);
    return {
      document: next,
      inverse: { kind: "map", mapId: entry.mapId, map: cloneMap(currentMap) } satisfies DocumentHistoryEntry,
    };
  }
}
