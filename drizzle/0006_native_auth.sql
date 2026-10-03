CREATE TABLE native_users (
  user_id TEXT PRIMARY KEY NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE native_sessions (
  session_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES native_users(user_id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX native_sessions_user ON native_sessions(user_id);
CREATE INDEX native_sessions_expiry ON native_sessions(expires_at);
