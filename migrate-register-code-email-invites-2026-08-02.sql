ALTER TABLE register_codes ADD COLUMN invited_email TEXT;
ALTER TABLE register_codes ADD COLUMN invite_expires_at TEXT;
ALTER TABLE register_codes ADD COLUMN invite_token_id TEXT;

CREATE INDEX IF NOT EXISTS idx_register_codes_invite_expiry
ON register_codes(status, invite_expires_at);
