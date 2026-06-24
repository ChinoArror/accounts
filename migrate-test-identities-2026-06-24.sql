CREATE TABLE IF NOT EXISTS test_identities (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  allowed_subapps TEXT NOT NULL,
  target_default_subapp TEXT,
  data_scope TEXT NOT NULL DEFAULT 'public_read',
  session_ttl_minutes INTEGER NOT NULL DEFAULT 30,
  one_time_token_ttl_seconds INTEGER NOT NULL DEFAULT 60,
  max_api_calls_per_session INTEGER,
  allowed_ip_ranges TEXT,
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled_at TEXT,
  deleted_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS test_identity_secrets (
  id TEXT PRIMARY KEY,
  test_identity_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  secret_prefix TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  last_used_at TEXT,
  rotated_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (test_identity_id) REFERENCES test_identities(id)
);

CREATE TABLE IF NOT EXISTS test_one_time_tokens (
  id TEXT PRIMARY KEY,
  test_identity_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  target_subapp TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash TEXT,
  user_agent TEXT,
  FOREIGN KEY (test_identity_id) REFERENCES test_identities(id)
);

CREATE TABLE IF NOT EXISTS test_sessions (
  id TEXT PRIMARY KEY,
  test_identity_id TEXT NOT NULL,
  target_subapp TEXT NOT NULL,
  session_token_hash TEXT,
  jwt_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  FOREIGN KEY (test_identity_id) REFERENCES test_identities(id)
);

CREATE TABLE IF NOT EXISTS test_auth_audit_logs (
  id TEXT PRIMARY KEY,
  test_identity_id TEXT,
  event_type TEXT NOT NULL,
  target_subapp TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_api_usage_records (
  id TEXT PRIMARY KEY,
  test_identity_id TEXT NOT NULL,
  session_id TEXT,
  subapp TEXT NOT NULL,
  api_path TEXT,
  method TEXT,
  amount INTEGER NOT NULL DEFAULT 1,
  status_code INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT,
  FOREIGN KEY (test_identity_id) REFERENCES test_identities(id),
  FOREIGN KEY (session_id) REFERENCES test_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_test_identity_secrets_identity ON test_identity_secrets(test_identity_id, status);
CREATE INDEX IF NOT EXISTS idx_test_one_time_tokens_hash ON test_one_time_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_test_sessions_identity ON test_sessions(test_identity_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_test_audit_identity ON test_auth_audit_logs(test_identity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_test_usage_identity ON test_api_usage_records(test_identity_id, created_at);
