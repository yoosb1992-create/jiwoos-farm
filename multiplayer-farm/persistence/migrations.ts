export const MIGRATIONS = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS farms (
 id text PRIMARY KEY, password_hash text NOT NULL, world jsonb NOT NULL,
 revision bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS members (
 id uuid PRIMARY KEY, farm_id text NOT NULL REFERENCES farms(id), nickname text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(farm_id,nickname)
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, member_id uuid NOT NULL REFERENCES members(id), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS action_receipts (
 farm_id text NOT NULL REFERENCES farms(id), member_id uuid NOT NULL REFERENCES members(id), action_id text NOT NULL,
 command_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(farm_id,member_id,action_id)
);
CREATE TABLE IF NOT EXISTS world_checkpoints (
 farm_id text PRIMARY KEY REFERENCES farms(id), revision bigint NOT NULL, world jsonb NOT NULL, saved_at timestamptz NOT NULL DEFAULT now()
);
`,
  },
];
