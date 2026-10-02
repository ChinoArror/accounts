CREATE TABLE IF NOT EXISTS oauth_identities (
  provider TEXT NOT NULL CHECK(provider IN ('github', 'google')),
  provider_subject TEXT NOT NULL,
  user_uuid TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  last_login_at TEXT,
  PRIMARY KEY (provider, provider_subject),
  UNIQUE (provider, user_uuid)
);
CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_uuid);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('github', 'google')),
  verifier TEXT,
  nonce TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS oauth_pending (
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
CREATE INDEX IF NOT EXISTS idx_oauth_pending_expiry ON oauth_pending(expires_at);

CREATE TABLE IF NOT EXISTS registration_events (
  id TEXT PRIMARY KEY,
  user_uuid TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL CHECK(channel IN ('email', 'github', 'google')),
  source TEXT NOT NULL DEFAULT 'external',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registration_events_created ON registration_events(created_at, channel);

INSERT INTO auth_settings (key, value, updated_at)
VALUES ('oauth_turnstile_threshold_per_ip_hour', '3', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO NOTHING;

INSERT OR IGNORE INTO oauth_identities (provider, provider_subject, user_uuid, linked_at)
SELECT 'github', github_id, uuid, CURRENT_TIMESTAMP
FROM users
WHERE github_id IS NOT NULL AND github_id <> '';

INSERT OR IGNORE INTO registration_events (id, user_uuid, channel, source, created_at)
SELECT lower(hex(randomblob(16))), u.uuid, 'email', 'external', MIN(l.created_at)
FROM auth_audit_logs AS l
JOIN users AS u ON u.uuid = l.user_id
WHERE l.event_type = 'register_email_success' AND l.success = 1
  AND u.auth_provider IN ('email', 'code')
GROUP BY u.uuid;
