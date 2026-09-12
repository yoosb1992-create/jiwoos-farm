export const GAME_CONFIG = {
  tileSize: 32,
  playerSpeed: 145,
  startingMoney: 120,
  startingSeedCount: 8,
  farmInteractionDistance: 120,
  toolActionCooldownMs: 180,
  autoSaveIntervalMs: 4_000,
  cameraZoom: 1.25,
  cameraFollowLerp: 0.12,
  day: {
    realMsPerGameMinute: 500,
    startMinutes: 6 * 60,
    lateNightMinutes: 22 * 60,
    endMinutes: 23 * 60 + 50,
    daysPerSeason: 28,
    sleepTransitionMs: 800,
  },
} as const;
