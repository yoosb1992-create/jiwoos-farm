/** Rates are Hertz; delay/interval constants explicitly use milliseconds. */
export const ROOM_NAME = 'multiplayer_lab';
export const SERVER_TICK_RATE = 30;
export const PATCH_RATE = 30;
export const PATCH_INTERVAL_MS = 1000 / PATCH_RATE;
export const INTERPOLATION_DELAY = 100;
export const WALK_SPEED = 160;
export const RUN_SPEED = 260;
export const RECONCILIATION_THRESHOLD = 0.5;
export const PLAYER_RADIUS = 12;
export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 640;
export const INPUT_BUFFER_SIZE = 64;
export const MAX_MESSAGES_PER_SECOND = 120;
export const MAX_PLAYERS = 16;
export const RECONNECTION_SECONDS = 30;
export const MAX_MOVEMENT_SUBSTEP = PLAYER_RADIUS / 2;
export const MAX_SIMULATION_DT = 1;
export const MAX_CATCHUP_INPUTS_PER_TICK = 2;
export const MAX_CATCHUP_CREDITS = 6;
export const CATCHUP_CREDIT_EXPIRY_MS = 500;
export const INPUT_BACKLOG_RESYNC_THRESHOLD = 3;
export const INPUT_BACKLOG_RESYNC_TIMEOUT_MS = 1000;

export interface Obstacle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** No player-to-player collision: this lab isolates transport and prediction. */
export const OBSTACLES: readonly Obstacle[] = [
  { x: 240, y: 180, width: 160, height: 56 },
  { x: 540, y: 280, width: 64, height: 208 },
  { x: 160, y: 430, width: 180, height: 60 },
  { x: 720, y: 150, width: 100, height: 100 },
];

export const PLAYER_COLORS: readonly string[] = [
  '#60a5fa', '#f472b6', '#4ade80', '#facc15',
  '#c084fc', '#fb923c', '#22d3ee', '#f87171',
  '#a3e635', '#e879f9', '#2dd4bf', '#fde68a',
  '#818cf8', '#fdba74', '#67e8f9', '#d1d5db',
];
