import type { WorldLayout } from "../../shared/layout.js";
const DB = "jiwoo-world-editor-2";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("draft");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function loadDraft(): Promise<WorldLayout | undefined> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("draft").objectStore("draft").get("current");
      r.onsuccess = () => resolve(r.result as WorldLayout | undefined);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function storeDraft(layout: WorldLayout): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("draft", "readwrite");
      t.objectStore("draft").put(layout, "current");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}
