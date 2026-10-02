CREATE TRIGGER IF NOT EXISTS users_remove_oauth_bindings AFTER DELETE ON users
BEGIN
    DELETE FROM oauth_identities WHERE user_uuid = OLD.uuid;
END;

ALTER TABLE auth_sessions ADD COLUMN previous_refresh_token_hash TEXT;
ALTER TABLE auth_sessions ADD COLUMN previous_refresh_until TEXT;
CREATE INDEX IF NOT EXISTS idx_auth_sessions_refresh ON auth_sessions(refresh_token_hash);

CREATE TABLE IF NOT EXISTS admin_auth_sessions (
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
CREATE INDEX IF NOT EXISTS idx_admin_auth_sessions_refresh ON admin_auth_sessions(refresh_token_hash);

CREATE TABLE IF NOT EXISTS session_app_activity (
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (session_id, app_id)
);
CREATE INDEX IF NOT EXISTS idx_session_app_activity_user ON session_app_activity(user_id, last_seen_at);
