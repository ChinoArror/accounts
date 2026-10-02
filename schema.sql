DROP TABLE IF EXISTS registration_events;
DROP TABLE IF EXISTS oauth_pending;
DROP TABLE IF EXISTS oauth_states;
DROP TABLE IF EXISTS oauth_identities;
DROP TABLE IF EXISTS registration_counters;
DROP TABLE IF EXISTS email_jobs;
DROP TABLE IF EXISTS auth_audit_logs;
DROP TABLE IF EXISTS register_code_uses;
DROP TABLE IF EXISTS register_codes;
DROP TABLE IF EXISTS auth_settings;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS auth_tokens;
DROP TABLE IF EXISTS user_credentials;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS passkeys;
DROP TABLE IF EXISTS user_apps;
DROP TABLE IF EXISTS apps;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    user_id INTEGER UNIQUE,
    id TEXT UNIQUE,
    uuid TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    email_verified INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'active',
    auth_provider TEXT NOT NULL DEFAULT 'email',
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL DEFAULT '',
    password_plain TEXT,
    cookie_expiry_days INTEGER NOT NULL DEFAULT 7,
    github_id TEXT UNIQUE,
    birthday TEXT,
    avatar_data TEXT,
    avatar_key TEXT,
    avatar_original_key TEXT,
    avatar_pending_delete_key TEXT,
    avatar_original_pending_delete_key TEXT,
    avatar_delete_deadline TEXT,
    avatar_restore_token TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT
);

CREATE INDEX idx_users_uuid ON users(uuid);
CREATE INDEX idx_users_id ON users(id);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE user_credentials (
    user_id TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    password_algo TEXT NOT NULL,
    password_updated_at TEXT NOT NULL,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    FOREIGN KEY (user_id) REFERENCES users(uuid) ON DELETE CASCADE
);

CREATE TABLE auth_tokens (
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
CREATE INDEX idx_auth_tokens_lookup ON auth_tokens(token_hash, type, used_at);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id);

CREATE TABLE auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    user_agent TEXT,
    ip_hash TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    previous_refresh_token_hash TEXT,
    previous_refresh_until TEXT,
    FOREIGN KEY (user_id) REFERENCES users(uuid) ON DELETE CASCADE
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id, revoked_at, expires_at);
CREATE INDEX idx_auth_sessions_refresh ON auth_sessions(refresh_token_hash);

CREATE TABLE admin_auth_sessions (
    id TEXT PRIMARY KEY,
    refresh_token_hash TEXT NOT NULL,
    previous_refresh_token_hash TEXT,
    previous_refresh_until TEXT,
    user_agent TEXT,
    ip_hash TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
);
CREATE INDEX idx_admin_auth_sessions_refresh ON admin_auth_sessions(refresh_token_hash);

CREATE TABLE session_app_activity (
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (session_id, app_id)
);
CREATE INDEX idx_session_app_activity_user ON session_app_activity(user_id, last_seen_at);

CREATE TABLE apps (
    app_id TEXT PRIMARY KEY,
    app_name TEXT NOT NULL,
    short_name TEXT,
    app_group TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    callback_url TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    use_agent_limit INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

CREATE TABLE user_apps (
    uuid TEXT NOT NULL,
    app_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    role_in_app TEXT NOT NULL DEFAULT 'user',
    quota_source TEXT NOT NULL DEFAULT 'default',
    override_reason TEXT,
    rpm_limit INTEGER,
    rpd_limit INTEGER,
    daily_token_limit INTEGER,
    used_tokens_today INTEGER DEFAULT 0,
    used_requests_today INTEGER DEFAULT 0,
    last_reset_date TEXT,
    PRIMARY KEY (uuid, app_id),
    FOREIGN KEY (uuid) REFERENCES users(uuid) ON DELETE CASCADE,
    FOREIGN KEY (app_id) REFERENCES apps(app_id) ON DELETE CASCADE
);

CREATE TABLE passkeys (
    id TEXT PRIMARY KEY,
    uuid TEXT NOT NULL,
    credential_id TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL,
    name TEXT DEFAULT 'My Passkey',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_passkeys_uuid ON passkeys(uuid);

CREATE TABLE user_sessions (
    session_id TEXT PRIMARY KEY,
    uuid TEXT NOT NULL,
    username TEXT NOT NULL,
    login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    browser TEXT,
    device_type TEXT,
    app_id TEXT,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uuid) REFERENCES users(uuid) ON DELETE CASCADE
);
CREATE INDEX idx_user_sessions_uuid ON user_sessions(uuid);
CREATE INDEX idx_user_sessions_active ON user_sessions(uuid, revoked_at, expires_at);

CREATE TABLE register_codes (
    id TEXT UNIQUE,
    code TEXT PRIMARY KEY,
    code_hash TEXT UNIQUE,
    label TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    max_uses INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    disabled_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    template_name TEXT,
    config_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'unused',
    used_by_uuid TEXT,
    used_by_username TEXT,
    used_at TEXT,
    invited_email TEXT,
    invite_expires_at TEXT,
    invite_token_id TEXT
);
CREATE INDEX idx_register_codes_hash ON register_codes(code_hash);
CREATE INDEX idx_register_codes_status ON register_codes(status);
CREATE INDEX idx_register_codes_created_at ON register_codes(created_at);

CREATE TABLE register_code_uses (
    id TEXT PRIMARY KEY,
    code_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    used_at TEXT NOT NULL,
    ip_hash TEXT,
    country_code TEXT,
    FOREIGN KEY (user_id) REFERENCES users(uuid) ON DELETE CASCADE
);
CREATE INDEX idx_register_code_uses_code ON register_code_uses(code_id);
CREATE UNIQUE INDEX idx_register_code_uses_one_per_code ON register_code_uses(code_id);

CREATE TABLE auth_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO auth_settings (key, value, updated_at)
VALUES
    ('external_registration_enabled', 'true', CURRENT_TIMESTAMP),
    ('default_registration_config', '{"cookie_expiry_days":7,"permissions":[]}', CURRENT_TIMESTAMP),
    ('oauth_turnstile_threshold_per_ip_hour', '3', CURRENT_TIMESTAMP);

CREATE TABLE oauth_identities (
    provider TEXT NOT NULL CHECK(provider IN ('github', 'google')),
    provider_subject TEXT NOT NULL,
    user_uuid TEXT NOT NULL,
    provider_email TEXT,
    provider_username TEXT,
    linked_at TEXT NOT NULL,
    last_login_at TEXT,
    PRIMARY KEY (provider, provider_subject),
    UNIQUE (provider, user_uuid)
);
CREATE INDEX idx_oauth_identities_user ON oauth_identities(user_uuid);
CREATE TRIGGER users_remove_oauth_bindings AFTER DELETE ON users
BEGIN
    DELETE FROM oauth_identities WHERE user_uuid = OLD.uuid;
END;

CREATE TABLE oauth_states (
    state_hash TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK(provider IN ('github', 'google')),
    verifier TEXT,
    nonce TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
);
CREATE INDEX idx_oauth_states_expiry ON oauth_states(expires_at);

CREATE TABLE oauth_pending (
    ticket_hash TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK(provider IN ('github', 'google')),
    provider_subject TEXT NOT NULL,
    email TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    app_id TEXT,
    redirect_uri TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
);
CREATE INDEX idx_oauth_pending_expiry ON oauth_pending(expires_at);

CREATE TABLE registration_events (
    id TEXT PRIMARY KEY,
    user_uuid TEXT NOT NULL UNIQUE,
    channel TEXT NOT NULL CHECK(channel IN ('email', 'github', 'google')),
    source TEXT NOT NULL DEFAULT 'external',
    created_at TEXT NOT NULL
);
CREATE INDEX idx_registration_events_created ON registration_events(created_at, channel);

CREATE TABLE auth_audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    event_type TEXT NOT NULL,
    ip_hash TEXT,
    user_agent TEXT,
    success INTEGER NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_auth_audit_logs_user ON auth_audit_logs(user_id);
CREATE INDEX idx_auth_audit_logs_event ON auth_audit_logs(event_type, success, created_at);

CREATE TABLE email_jobs (
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
CREATE INDEX idx_email_jobs_status ON email_jobs(status, created_at);

CREATE TABLE registration_counters (
    id TEXT PRIMARY KEY,
    counter_type TEXT NOT NULL,
    counter_key TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    window_start TEXT NOT NULL,
    window_end TEXT NOT NULL
);
CREATE INDEX idx_registration_counters_lookup ON registration_counters(counter_type, counter_key, window_start);

CREATE TABLE IF NOT EXISTS test_identities (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  allowed_subapps TEXT NOT NULL,
  target_default_subapp TEXT,
  preview_enabled INTEGER NOT NULL DEFAULT 0,
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
  secret_cipher TEXT,
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
