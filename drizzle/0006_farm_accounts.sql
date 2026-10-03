CREATE TABLE farm_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  login_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX farm_accounts_login ON farm_accounts(login_name);

CREATE TABLE farm_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES farm_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX farm_sessions_account ON farm_sessions(account_id);
CREATE INDEX farm_sessions_expiry ON farm_sessions(expires_at);
