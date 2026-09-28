-- Apply only to the existing staging DB during a separately authorized deployment.
-- Player progress belongs to one membership, never to the shared world JSON.
CREATE TABLE family_player_progress (
  player_id TEXT PRIMARY KEY NOT NULL REFERENCES family_members(player_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  progress_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
