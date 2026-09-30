import type { ProgressAction, ProgressSnapshot, ProgressResult } from "../npc/progress";
import { gameEvents } from "../events";
import type { FamilyAction, FamilyPose, FamilySession, FamilySnapshot, FamilyPresenceSnapshot } from "./types";
import { familyPersonalKey, parseFamilyPose } from "./personal";

export const FAMILY_STATE_POLL_MS = 1000;
export const FAMILY_PRESENCE_FALLBACK_MS = 1000;
/** When a WebSocket/DO presence channel is injected later, D1 presence remains
 * a low-rate membership/online keepalive instead of carrying movement frames. */
export const FAMILY_PRESENCE_KEEPALIVE_MS = 5000;
/** Backwards-compatible name used by existing retry tests/callers. */
export const FAMILY_POLL_MS = FAMILY_STATE_POLL_MS;
export type FamilyConnection = "connecting" | "connected" | "reconnecting" | "disconnected" | "syncing";
export const CONNECTION_LABELS: Record<FamilyConnection, string> = { connecting: "연결 중", connected: "연결됨", reconnecting: "재연결 중", disconnected: "연결 끊김", syncing: "최신 상태 동기화 중" };
export const familyRetryDelay = (failures: number) => Math.min(16000, FAMILY_STATE_POLL_MS * 2 ** Math.min(4, failures));
export class FamilyAPIError extends Error {
  constructor(public status: number, message: string, public snapshot?: FamilySnapshot) { super(message); }
}
export async function familyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", credentials: "same-origin", signal: init.signal ?? AbortSignal.timeout(8000) });
  const result = await response.json() as { message?: string; snapshot?: FamilySnapshot };
  if (!response.ok) throw new FamilyAPIError(response.status, result.message ?? "가족 농장 요청이 실패했습니다.", result.snapshot);
  return result as T;
}

export interface FamilyRealtimePresenceContext {
  roomId: string;
  sessionId: string;
  pose: () => FamilyPose | undefined;
  onSnapshot: (snapshot: FamilyPresenceSnapshot) => void;
  onDisconnect: () => void;
}
/** Optional fast channel. D1 state/action APIs remain authoritative regardless
 * of whether a realtime channel is installed. */
export interface FamilyRealtimePresenceChannel {
  start(context: FamilyRealtimePresenceContext): void;
  stop(): void;
}
export class FamilyClient {
  progress?: ProgressSnapshot;
  async loadProgress() {
    const progress=await familyFetch<ProgressSnapshot>(`/api/family/progress?roomId=${encodeURIComponent(this.session.room.id)}`);
    if(this.live && (!this.progress||progress.revision>=this.progress.revision))this.progress=progress;
    return this.progress;
  }
  async npcAction(action:ProgressAction,pose:FamilyPose):Promise<ProgressResult|undefined> {
    if(!this.live||this.busy||this.connection!=="connected"){this.onMessage("연결 복구 후 다시 이야기해 주세요.");return;}
    this.busy=true;
    try {
      if(!this.progress)await this.loadProgress();
      if(!this.live||!this.progress)return;
      const result=await familyFetch<ProgressResult>("/api/family/progress",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({roomId:this.session.room.id,expectedRevision:this.progress.revision,action,pose})});
      if(!this.live)return;
      if(result.progress.revision>=this.progress.revision)this.progress=result.progress;
      if(result.snapshot)this.accept(result.snapshot);
      return result;
    }catch(error){
      if(!this.live)return;
      if(error instanceof FamilyAPIError&&error.status===409)await this.loadProgress().catch(()=>{});
      this.onMessage(error instanceof FamilyAPIError&&error.status<500?error.message:"주민 기록에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.");
    }finally{this.busy=false;}
  }
  snapshot?: FamilySnapshot;
  busy = false;
  connection: FamilyConnection = "connecting";
  private failures = 0;
  private setConnection(state: FamilyConnection) {
    if (!this.live) return;
    this.connection = state;
    gameEvents.dispatchEvent(new CustomEvent("family-connection", { detail: { roomId: this.session.room.id, state } }));
  }
  private live = false;
  private sessionId = crypto.randomUUID();
  private pose?: () => FamilyPose;
  private onPresence?: (snapshot: FamilyPresenceSnapshot) => void;
  private heartbeatRequest?: Promise<void>;
  private stateTimer?: ReturnType<typeof setTimeout>;
  private presenceTimer?: ReturnType<typeof setTimeout>;
  private realtimeStarted = false;
  setPresence(pose: () => FamilyPose, onPresence: (snapshot: FamilyPresenceSnapshot) => void) {
    this.pose = pose; this.onPresence = onPresence;
    if (this.live) this.startRealtimePresence();
  }
  private async heartbeat() {
    if (!this.pose || !this.live) return;
    const snapshot = await familyFetch<FamilyPresenceSnapshot>("/api/family/presence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId: this.session.room.id, sessionId: this.sessionId, pose: this.pose() }) });
    if (this.live) this.onPresence?.(snapshot);
  }
  constructor(
    readonly session: FamilySession,
    private onSnapshot: (snapshot: FamilySnapshot) => void,
    private onMessage: (message: string) => void,
    private readonly realtimePresence?: FamilyRealtimePresenceChannel,
  ) {}
  private accept(snapshot: FamilySnapshot) {
    if (!this.live || (this.snapshot && (snapshot.revision < this.snapshot.revision || (snapshot.revision === this.snapshot.revision && snapshot.serverNow < this.snapshot.serverNow)))) return;
    this.snapshot = snapshot; this.onSnapshot(snapshot);
  }
  start() {
    if (this.live) return;
    this.live = true;
    this.startRealtimePresence();
    void this.pollState();
    void this.pollPresence();
  }
  stop() {
    if (!this.live) return;
    this.live = false;
    clearTimeout(this.stateTimer); clearTimeout(this.presenceTimer);
    if (this.realtimeStarted) { this.realtimePresence?.stop(); this.realtimeStarted = false; }
    // Wait for an already-sent D1 keepalive so leaving cannot be undone by its late response.
    void (this.heartbeatRequest ?? Promise.resolve()).catch(() => {}).then(() => familyFetch("/api/family/presence", {
      method: "DELETE", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId: this.session.room.id, sessionId: this.sessionId }),
    })).catch(() => {});
  }
  private startRealtimePresence() {
    if (!this.realtimePresence || !this.pose || !this.onPresence || this.realtimeStarted) return;
    this.realtimeStarted = true;
    this.realtimePresence.start({
      roomId: this.session.room.id,
      sessionId: this.sessionId,
      pose: () => this.live ? this.pose?.() : undefined,
      onSnapshot: (snapshot) => { if (this.live) this.onPresence?.(snapshot); },
      onDisconnect: () => { /* D1 keepalive/presence polling remains the safe fallback. */ },
    });
  }
  private async pollState() {
    if (this.failures) this.setConnection(this.failures >= 3 ? "disconnected" : "reconnecting");
    try {
      await this.refresh();
      this.failures = 0; this.setConnection("connected");
    } catch {
      this.failures++; this.setConnection(this.failures >= 3 ? "disconnected" : "reconnecting");
    } finally {
      if (this.live) this.stateTimer = setTimeout(() => void this.pollState(), familyRetryDelay(this.failures));
    }
  }
  private async pollPresence() {
    try {
      this.heartbeatRequest = this.heartbeat();
      await this.heartbeatRequest;
    } catch {
      // Presence loss must not block authoritative farming/shop actions. The
      // state channel owns the connection state and retries independently.
    } finally {
      if (this.live) this.presenceTimer = setTimeout(
        () => void this.pollPresence(),
        this.realtimeStarted ? FAMILY_PRESENCE_KEEPALIVE_MS : FAMILY_PRESENCE_FALLBACK_MS,
      );
    }
  }
  async refresh() {
    if (!this.live) return;
    if (this.connection !== "connected") this.setConnection("syncing");
    this.accept(await familyFetch<FamilySnapshot>(`/api/family/state?roomId=${encodeURIComponent(this.session.room.id)}`));
  }
  async act(action: FamilyAction): Promise<boolean> {
    if (!this.live || this.busy || !this.snapshot || this.connection !== "connected") { this.onMessage("연결 복구 후 다시 행동해 주세요. 이동은 계속할 수 있어요."); return false; }
    this.busy = true;
    try {
      const snapshot = await familyFetch<FamilySnapshot>("/api/family/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId: this.session.room.id, expectedRevision: this.snapshot.revision, action }) });
      if (!this.live) return false;
      this.accept(snapshot); this.onMessage(snapshot.fishingNotice ?? "가족 농장에 반영했어요."); return true;
    } catch (error) {
      if (!this.live) return false;
      if (error instanceof FamilyAPIError && error.snapshot) {
        this.accept(error.snapshot);
        this.onMessage("다른 가족의 변경으로 새로고침됐어요. 다시 행동해 주세요.");
      } else if (error instanceof FamilyAPIError && error.status < 500) {
        this.onMessage(error.message);
      } else {
        this.failures = Math.max(1, this.failures);
        this.setConnection("reconnecting");
        this.onMessage("연결이 끊겼어요. 최신 상태를 받은 뒤 다시 행동해 주세요.");
      }
      return false;
    } finally { this.busy = false; }
  }
  loadPersonal(): (FamilyPose & { forestDaySerial?: number }) | null {
    try {
      const value = JSON.parse(localStorage.getItem(familyPersonalKey(this.session.room.id, this.session.room.playerId)) ?? "null");
      const pose = parseFamilyPose(value);
      return pose && Number.isSafeInteger(value.forestDaySerial) && value.forestDaySerial > 0 ? { ...pose, forestDaySerial: value.forestDaySerial } : pose;
    } catch { return null; }
  }
  savePersonal(pose: FamilyPose, forestDaySerial?: number) {
    try { localStorage.setItem(familyPersonalKey(this.session.room.id, this.session.room.playerId), JSON.stringify({ ...pose, forestDaySerial })); } catch { /* Server state remains authoritative. */ }
  }
}
