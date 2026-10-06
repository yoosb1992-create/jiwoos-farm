import './style.css';
import { HUD_INTERVAL_MS, serverUrl } from './config.js';
import { InputController } from './input.js';
import { ColyseusAdapter, type NetworkAdapter, type NetworkSnapshot } from './network.js';
import { createRenderer } from './scene.js';
import type { MovementInput } from '../shared/applyMovement.js';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element: ${id}`);
  return found as T;
}

const nickname = element<HTMLInputElement>('nickname');
const roomCode = element<HTMLInputElement>('room-code');
const createButton = element<HTMLButtonElement>('create-room');
const joinButton = element<HTMLButtonElement>('join-room');
const leaveButton = element<HTMLButtonElement>('leave-room');
const statusElement = element('connection-status');
const statusMessage = element('status-message');
const roomLabel = element('current-room');
const hud = element('network-hud');
const hudToggle = element<HTMLButtonElement>('hud-toggle');
const controls = new InputController(element('joystick'), element('joystick-knob'), element<HTMLButtonElement>('run-button'));
const listeners = new AbortController();
let adapter: NetworkAdapter | undefined;
let lastSnapshot: NetworkSnapshot | null = null;
let lastStatus = '';
let lastHudTime = 0;
let fps = 0;
let busy = false;
let disposed = false;
let currentInput: MovementInput = { moveX: 0, moveY: 0, run: false };

try {
  adapter = new ColyseusAdapter(serverUrl());
} catch (error: unknown) {
  statusElement.textContent = '설정 필요';
  statusElement.dataset.state = 'error';
  statusMessage.textContent = error instanceof Error ? error.message : String(error);
  createButton.disabled = joinButton.disabled = true;
}

function setBusy(value: boolean): void {
  busy = value;
  const inRoom = lastSnapshot?.status === 'connected' || lastSnapshot?.status === 'reconnecting';
  createButton.disabled = !adapter || busy || inRoom;
  joinButton.disabled = !adapter || busy || inRoom;
  nickname.disabled = roomCode.disabled = busy || inRoom;
  leaveButton.disabled = !adapter || busy || !inRoom;
}

function updateHud(snapshot: NetworkSnapshot): void {
  const value = (id: string, text: string) => { element(id).textContent = text; };
  value('hud-fps', `${Math.round(fps)}`);
  value('hud-rtt', snapshot.smoothedRtt === null ? '측정 중' : `${snapshot.smoothedRtt.toFixed(0)} ms`);
  value('hud-tick', snapshot.tickRate ? `${snapshot.tickRate} Hz` : '—');
  value('hud-patches', snapshot.patchRate ? `${snapshot.patchRate.toFixed(1)} /s` : '—');
  value('hud-players', String(snapshot.players.length));
  value('hud-local', snapshot.local ? `${snapshot.local.predicted.x.toFixed(1)}, ${snapshot.local.predicted.y.toFixed(1)}` : '—');
  value('hud-authority', snapshot.local ? `${snapshot.local.authoritative.x.toFixed(1)}, ${snapshot.local.authoritative.y.toFixed(1)}` : '—');
  value('hud-correction', `${snapshot.correctionDistance.toFixed(3)} px`);
  value('hud-drift', `${snapshot.correctionEma.toFixed(3)} / ${snapshot.correctionPeak.toFixed(3)}`);
  value('hud-reconnect', `${snapshot.reconnectCount}회${snapshot.status === 'reconnecting' ? ` · 시도 ${snapshot.reconnectAttempt}` : ''}`);
  value('hud-input', `${snapshot.acknowledgedInputs} / ${snapshot.sentInputs}`);
  roomLabel.textContent = snapshot.roomId || '아직 연결되지 않음';
  const names = { disconnected: '연결 대기', connecting: '연결 중', connected: '연결됨', reconnecting: '재연결 중', error: '연결 실패' };
  statusElement.textContent = names[snapshot.status];
  statusElement.dataset.state = snapshot.status;
  statusMessage.textContent = snapshot.message;
}

const game = createRenderer((now, delta) => {
  if (disposed || !adapter) return null;
  const sampleFps = delta > 0 ? 1_000 / delta : 0;
  fps = fps === 0 ? sampleFps : fps * 0.92 + sampleFps * 0.08;
  currentInput = controls.read();
  lastSnapshot = adapter.frame(now, currentInput);
  if (lastSnapshot.status !== lastStatus) {
    // Never carry a held touch or key through a disconnect/resume boundary.
    if (lastSnapshot.status === 'reconnecting' || lastStatus === 'reconnecting') controls.reset();
    lastStatus = lastSnapshot.status;
    setBusy(busy);
    updateHud(lastSnapshot);
  }
  if (now - lastHudTime >= HUD_INTERVAL_MS) {
    lastHudTime = now;
    updateHud(lastSnapshot);
  }
  return lastSnapshot;
});

async function connect(create: boolean): Promise<void> {
  if (!adapter || busy) return;
  if (!nickname.value.trim()) { nickname.focus(); nickname.reportValidity(); return; }
  if (!create && !roomCode.value.trim()) { roomCode.focus(); roomCode.reportValidity(); return; }
  controls.reset();
  setBusy(true);
  try {
    if (create) await adapter.create(nickname.value.trim());
    else await adapter.join(roomCode.value.trim(), nickname.value.trim());
    const snapshot = adapter.snapshot();
    roomCode.value = snapshot.roomId;
    element('playfield').focus({ preventScroll: true });
  } catch (error: unknown) {
    statusMessage.textContent = error instanceof Error ? error.message : String(error);
  } finally { setBusy(false); }
}

createButton.addEventListener('click', () => void connect(true), { signal: listeners.signal });
joinButton.addEventListener('click', () => void connect(false), { signal: listeners.signal });
leaveButton.addEventListener('click', () => {
  controls.reset();
  void adapter?.leave();
}, { signal: listeners.signal });
element('playfield').addEventListener('pointerdown', () => element('playfield').focus({ preventScroll: true }), { signal: listeners.signal });
hudToggle.addEventListener('click', () => {
  hud.hidden = !hud.hidden;
  hudToggle.setAttribute('aria-expanded', String(!hud.hidden));
  hudToggle.textContent = hud.hidden ? 'HUD 표시' : 'HUD 숨기기';
}, { signal: listeners.signal });

function dispose(): void {
  if (disposed) return;
  disposed = true;
  controls.dispose();
  listeners.abort();
  adapter?.dispose();
  game.destroy(true);
}

window.addEventListener('pagehide', (event) => { if (!event.persisted) dispose(); else controls.reset(); }, { signal: listeners.signal });
if (import.meta.hot) import.meta.hot.dispose(dispose);

if (import.meta.env.DEV) {
  // Read-only copies, no action hooks, token, room handle or state references.
  // Browser smoke tests observe the same values that the player sees.
  Object.defineProperty(window, '__LAB_DEBUG__', {
    configurable: true,
    get: () => {
      const snapshot = lastSnapshot ?? adapter?.snapshot();
      if (!snapshot) return null;
      return Object.freeze({
        ...snapshot, fps,
        players: Object.freeze(snapshot.players.map((player) => Object.freeze({ ...player }))),
        local: snapshot.local ? Object.freeze({
          predicted: Object.freeze({ ...snapshot.local.predicted }),
          authoritative: Object.freeze({ ...snapshot.local.authoritative }),
        }) : null,
        input: Object.freeze({ ...currentInput }),
      });
    },
  });
}
