CREATE TABLE family_presence (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  pose_json TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id, user_id) REFERENCES family_members(room_id, user_id) ON DELETE CASCADE
);
CREATE INDEX family_presence_recent ON family_presence(room_id, last_seen);
