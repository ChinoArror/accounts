CREATE TABLE IF NOT EXISTS auth_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO auth_settings (key, value, updated_at)
VALUES ('external_registration_enabled', 'true', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO auth_settings (key, value, updated_at)
VALUES ('default_registration_config', '{"cookie_expiry_days":7,"permissions":[]}', CURRENT_TIMESTAMP);
