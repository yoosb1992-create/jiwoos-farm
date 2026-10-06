/** Fixed 20 Hz touch simulation. The server replays bounded hold/release inputs. */
export const FISH_STEP_MS = 50;
export const FISH_MAX_STEPS = 400;
export interface FishingChallenge {
  id: string;
  seed: number;
  fishId: string;
  difficulty: number;
  area: string;
  x: number;
  y: number;
  biteAt: number;
  expiresAt: number;
  startedAt: number;
}
export interface FishingFrame {
  tick: number;
  cursor: number;
  velocity: number;
  fish: number;
  progress: number;
  tension: number;
  done: boolean;
  won: boolean;
}
export function newFishingFrame(): FishingFrame {
  return {
    tick: 0,
    cursor: 0.5,
    velocity: 0,
    fish: 0.5,
    progress: 0.3,
    tension: 0,
    done: false,
    won: false,
  };
}
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export function fishPosition(
  seed: number,
  difficulty: number,
  tick: number,
): number {
  const t = (tick * FISH_STEP_MS) / 1000,
    phase = ((seed % 997) / 997) * Math.PI * 2;
  return clamp(
    0.5 +
      Math.sin(t * (0.72 + difficulty * 1.2) + phase) *
        (0.18 + difficulty * 0.14) +
      Math.sin(t * (1.6 + difficulty * 2.4) + phase * 1.7) * difficulty * 0.13,
    0.1,
    0.9,
  );
}
export function fishingStep(
  frame: FishingFrame,
  held: boolean,
  seed: number,
  difficulty: number,
): void {
  if (frame.done) return;
  const dt = FISH_STEP_MS / 1000;
  frame.tick++;
  frame.velocity = clamp(
    (frame.velocity + (held ? 2.8 : -2.2) * dt) * 0.86,
    -0.75,
    0.75,
  );
  frame.cursor = clamp(frame.cursor + frame.velocity * dt, 0.09, 0.91);
  if (frame.cursor === 0.09 || frame.cursor === 0.91) frame.velocity *= 0.35;
  frame.fish = fishPosition(seed, difficulty, frame.tick);
  const caught =
    Math.abs(frame.cursor - frame.fish) <= 0.18 - difficulty * 0.065;
  frame.progress = clamp(
    frame.progress +
      (caught ? 0.14 - difficulty * 0.025 : -0.095 - difficulty * 0.045) * dt,
  );
  frame.tension = clamp(frame.tension + (caught ? -0.45 : 0.28) * dt);
  frame.won = frame.progress >= 1;
  frame.done = frame.won || frame.progress <= 0 || frame.tick >= FISH_MAX_STEPS;
}
export function replayFishing(
  inputs: readonly number[],
  challenge: FishingChallenge,
): FishingFrame {
  const frame = newFishingFrame();
  for (const input of inputs)
    fishingStep(frame, input === 1, challenge.seed, challenge.difficulty);
  return frame;
}
