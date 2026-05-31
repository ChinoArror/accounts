ALTER TABLE users ADD COLUMN birthday TEXT;
ALTER TABLE users ADD COLUMN avatar_data TEXT;

CREATE TABLE IF NOT EXISTS register_codes (
    code TEXT PRIMARY KEY,
    template_name TEXT,
    config_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unused',
    used_by_uuid TEXT,
    used_by_username TEXT,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_register_codes_status ON register_codes(status);
CREATE INDEX IF NOT EXISTS idx_register_codes_created_at ON register_codes(created_at);
