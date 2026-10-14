import type { WorldLayout } from "../../shared/layout.js";
import type {
  BlueprintCapability,
  FarmSnapshot,
} from "../../shared/world-templates.js";
export interface Draft {
  id: string;
  name: string;
  revision: number;
  updatedAt: number;
  kind: "personal" | "official" | "farm";
  layout: WorldLayout;
  capability?: BlueprintCapability;
  officialRevision?: number;
  farm?: FarmSnapshot;
}
const DB = "jiwoo-world-editor-2";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("draft")) db.createObjectStore("draft");
      if (!db.objectStoreNames.contains("templates")) {
        const templates = db.createObjectStore("templates", { keyPath: "id" });
        const old = r.transaction!.objectStore("draft").get("current");
        old.onsuccess = () => {
          if (old.result)
            templates.put({
              id: "legacy-draft",
              name: "이전 기기 초안",
              revision: 1,
              updatedAt: Date.now(),
              kind: "personal",
              layout: old.result,
            });
        };
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(Error("다른 편집기 탭을 닫고 다시 열어 주세요"));
  });
}
async function read<T>(
  get: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const r = get(db.transaction("templates").objectStore("templates"));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export const listDrafts = () => read<Draft[]>((s) => s.getAll());
export const getDraft = (id: string) =>
  read<Draft | undefined>((s) => s.get(id));
/** Atomic compare-and-swap also prevents two tabs editing the SAME template from overwriting. */
export async function putDraft(draft: Draft): Promise<Draft> {
  const db = await open(),
    snapshot = structuredClone(draft);
  try {
    return await new Promise<Draft>((resolve, reject) => {
      const t = db.transaction("templates", "readwrite"),
        s = t.objectStore("templates"),
        get = s.get(snapshot.id);
      let error: Error | undefined;
      get.onsuccess = () => {
        const current = get.result as Draft | undefined;
        if ((current?.revision ?? 0) !== snapshot.revision) {
          error = Error(
            "다른 탭에서 이 초안을 저장했어요. JSON으로 내보낸 뒤 다시 불러오세요",
          );
          t.abort();
          return;
        }
        snapshot.revision++;
        snapshot.updatedAt = Date.now();
        s.put(snapshot);
      };
      t.oncomplete = () => resolve(snapshot);
      t.onerror = t.onabort = () =>
        reject(error ?? t.error ?? Error("기기 저장 실패"));
    });
  } finally {
    db.close();
  }
}
export async function deleteDraft(id: string, revision: number) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("templates", "readwrite"),
        s = t.objectStore("templates"),
        r = s.get(id);
      r.onsuccess = () => {
        if (r.result?.revision !== revision) t.abort();
        else s.delete(id);
      };
      t.oncomplete = () => resolve();
      t.onerror = t.onabort = () =>
        reject(Error("초안 버전이 바뀌었어요. 목록을 새로 불러오세요"));
    });
  } finally {
    db.close();
  }
}
const CAPS = "farm-blueprint-capabilities-v2";
export function capabilities(): BlueprintCapability[] {
  try {
    const list = JSON.parse(
      localStorage.getItem(CAPS) ?? "[]",
    ) as BlueprintCapability[];
    const old = JSON.parse(
      localStorage.getItem("farm-editor-capability-v1") ?? "null",
    ) as BlueprintCapability | null;
    if (old?.id && old.editToken && !list.some((c) => c.id === old.id))
      list.push(old);
    return list.filter(
      (c) => typeof c.id === "string" && typeof c.editToken === "string",
    );
  } catch {
    return [];
  }
}
export function rememberCapability(cap: BlueprintCapability) {
  localStorage.setItem(
    CAPS,
    JSON.stringify([...capabilities().filter((c) => c.id !== cap.id), cap]),
  );
}
export function newDraft(
  layout: WorldLayout,
  name = "나만의 시작 농장",
): Draft {
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 30) || "나만의 시작 농장",
    revision: 0,
    updatedAt: Date.now(),
    kind: "personal",
    layout: structuredClone(layout),
  };
}
