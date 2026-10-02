-- Email authentication, role-based authorization, audit logs, sessions, and mail jobs.
-- Run once on an existing auth-center D1 database:
-- npx wrangler d1 execute auth-center-db --remote --file=./migrate-email-auth-2026-05-30.sql

ALTER TABLE users ADD COLUMN id TEXT;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE users ADD COLUMN updated_at TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;

UPDATE users SET id = uuid WHERE id IS NULL;
UPDATE users SET role = 'user' WHERE role IS NULL OR role = '';
UPDATE users SET auth_provider = 'legacy' WHERE auth_provider IS NULL OR auth_provider = '';
UPDATE users SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;
UPDATE users SET status = 'disabled' WHERE status = 'paused' AND status IS NOT NULL;
UPDATE users SET password_plain = NULL WHERE password_plain IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id ON users(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS user_credentials (
    user_id TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    password_algo TEXT NOT NULL,
    password_updated_at TEXT NOT NULL,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    FOREIGN KEY (user_id) REFERENCES users(uuid) ON DELETE CASCADE
);

INSERT OR IGNORE INTO user_credentials (user_id, password_hash, password_algo, password_updated_at)
SELECT uuid, password_hash, 'legacy-pbkdf2-sha256', COALESCE(created_at, CURRENT_TIMESTAMP)
FROM users
WHERE password_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT,
    token_hash TEXT NOT NULL,
    type TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    metadata TEXT,
    FOREIGN KEY (user_id) REFERENCES users(uuid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup ON auth_tokens(token_hash, type, used_at);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    user_agent TEXT,
    ip_hash TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(uuid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, revoked_at, expires_at);

ALTER TABLE register_codes ADD COLUMN id TEXT;
ALTER TABLE register_codes ADD COLUMN code_hash TEXT;
ALTER TABLE register_codes ADD COLUMN label TEXT;
ALTER TABLE register_codes ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE register_codes ADD COLUMN max_uses INTEGER;
ALTER TABLE register_codes ADD COLUMN used_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE register_codes ADD COLUMN expires_at TEXT;
ALTER TABLE register_codes ADD COLUMN disabled_at TEXT;
ALTER TABLE register_codes ADD COLUMN created_by TEXT;

UPDATE register_codes SET id = code WHERE id IS NULL;
UPDATE register_codes SET label = template_name WHERE label IS NULL AND template_name IS NOT NULL;
UPDATE register_codes SET used_count = CASE WHEN status = 'used' THEN 1 ELSE 0 END WHERE used_count IS NULL OR used_count = 0;
UPDATE register_codes SET max_uses = 1 WHERE max_uses IS NULL AND status IN ('used', 'unused', 'pause');

CREATE UNIQUE INDEX IF NOT EXISTS idx_register_codes_id ON register_codes(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_register_codes_hash ON register_codes(code_hash);

CREATE TABLE IF NOT EXISTS register_code_uses (
    id TEXT PRIMARY KEY,
    code_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    used_at TEXT NOT NULL,
    ip_hash TEXT,
    FOREIGN KEY (user_id) REFERENCES users(uuid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_register_code_uses_code ON register_code_uses(code_id);

INSERT OR IGNORE INTO register_code_uses (id, code_id, user_id, used_at, ip_hash)
SELECT code || ':' || used_by_uuid, COALESCE(id, code), used_by_uuid, COALESCE(used_at, CURRENT_TIMESTAMP), NULL
FROM register_codes
WHERE used_by_uuid IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    event_type TEXT NOT NULL,
    ip_hash TEXT,
    user_agent TEXT,
    success INTEGER NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user ON auth_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_event ON auth_audit_logs(event_type, success, created_at);

CREATE TABLE IF NOT EXISTS email_jobs (
    id TEXT PRIMARY KEY,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    template_name TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_jobs_status ON email_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS registration_counters (
    id TEXT PRIMARY KEY,
    counter_type TEXT NOT NULL,
    counter_key TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    window_start TEXT NOT NULL,
    window_end TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registration_counters_lookup ON registration_counters(counter_type, counter_key, window_start);
