import type { FamilyAction, FamilyPose, FamilySession, FamilySnapshot } from "./types";
import { familyPersonalKey, parseFamilyPose } from "./personal";

export const FAMILY_POLL_MS = 1000;
export class FamilyAPIError extends Error {
  constructor(public status: number, message: string, public snapshot?: FamilySnapshot) { super(message); }
}
export async function familyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", credentials: "same-origin", signal: init.signal ?? AbortSignal.timeout(8000) });
  const result = await response.json() as { message?: string; snapshot?: FamilySnapshot };
  if (!response.ok) throw new FamilyAPIError(response.status, result.message ?? "가족 농장 요청이 실패했습니다.", result.snapshot);
  return result as T;
}
export class FamilyClient {
  snapshot?: FamilySnapshot;
  busy = false;
  private live = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(readonly session: FamilySession, private onSnapshot: (snapshot: FamilySnapshot) => void, private onMessage: (message: string) => void) {}
  private accept(snapshot: FamilySnapshot) {
    if (!this.live || (this.snapshot && (snapshot.revision < this.snapshot.revision || (snapshot.revision === this.snapshot.revision && snapshot.serverNow < this.snapshot.serverNow)))) return;
    this.snapshot = snapshot; this.onSnapshot(snapshot);
  }
  start() { this.live = true; void this.poll(); }
  stop() { this.live = false; clearTimeout(this.timer); }
  private async poll() {
    try { await this.refresh(); } catch (error) { if (this.live) this.onMessage(error instanceof Error ? error.message : "가족 농장 연결이 끊겼습니다."); }
    finally { if (this.live) this.timer = setTimeout(() => void this.poll(), FAMILY_POLL_MS); }
  }
  async refresh() {
    if (!this.live) return;
    this.accept(await familyFetch<FamilySnapshot>(`/api/family/state?roomId=${encodeURIComponent(this.session.room.id)}`));
  }
  async act(action: FamilyAction): Promise<boolean> {
    if (!this.live || this.busy || !this.snapshot) return false;
    this.busy = true;
    try {
      const snapshot = await familyFetch<FamilySnapshot>("/api/family/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId: this.session.room.id, expectedRevision: this.snapshot.revision, action }) });
      if (!this.live) return false;
      this.accept(snapshot); this.onMessage("가족 농장에 반영했어요."); return true;
    } catch (error) {
      if (!this.live) return false;
      if (error instanceof FamilyAPIError && error.snapshot) this.accept(error.snapshot);
      this.onMessage(error instanceof Error ? error.message : "연결을 확인해 주세요. 자동 재전송하지 않습니다.");
      // A timeout may hide a committed action. Read authority before allowing another command.
      this.snapshot = undefined;
      try { await this.refresh(); } catch { /* Polling will recover; actions stay disabled. */ }
      return false;
    } finally { this.busy = false; }
  }
  loadPersonal(): FamilyPose | null {
    try { return parseFamilyPose(JSON.parse(localStorage.getItem(familyPersonalKey(this.session.room.id, this.session.room.playerId)) ?? "null")); } catch { return null; }
  }
  savePersonal(pose: FamilyPose) {
    try { localStorage.setItem(familyPersonalKey(this.session.room.id, this.session.room.playerId), JSON.stringify(pose)); } catch { /* Server state remains authoritative. */ }
  }
}
