CREATE TABLE family_state (
  room_id TEXT PRIMARY KEY NOT NULL REFERENCES family_rooms(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  world_json TEXT NOT NULL,
  inventories_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
