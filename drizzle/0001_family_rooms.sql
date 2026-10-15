CREATE TABLE family_rooms (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX family_rooms_owner ON family_rooms(owner_id);
CREATE TABLE family_members (
  room_id TEXT NOT NULL REFERENCES family_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  player_id TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  last_joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX family_members_user ON family_members(user_id, last_joined_at);
