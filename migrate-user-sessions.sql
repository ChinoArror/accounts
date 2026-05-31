CREATE TABLE IF NOT EXISTS user_sessions (
    session_id TEXT PRIMARY KEY,
    uuid TEXT NOT NULL,
    username TEXT NOT NULL,
    login_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    browser TEXT,
    device_type TEXT,
    app_id TEXT,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uuid) REFERENCES users(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_uuid ON user_sessions(uuid);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(uuid, revoked_at, expires_at);
