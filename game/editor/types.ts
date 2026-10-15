import type { MapDefinition } from "../maps/types";

export const EDITOR_DOCUMENT_VERSION = 1 as const;

export interface MapEditorDocument {
  editorVersion: typeof EDITOR_DOCUMENT_VERSION;
  maps: MapDefinition[];
  updatedAt: number;
}

export type EditorTool = "select" | "terrain" | "object" | "collision" | "farm" | "spawn" | "warp";
export type EditorLayer = "terrain" | "objects" | "collision" | "farm" | "spawn" | "warp" | "grid";
export type SnapMode = "tile" | "half" | "free";
export type Selection =
  | { kind: "object"; id: string }
  | { kind: "collision"; index: number }
  | { kind: "farm"; index: number }
  | { kind: "spawn"; id: string }
  | { kind: "warp"; id: string }
  | null;

export interface ValidationIssue { mapId?: string; path: string; message: string }
