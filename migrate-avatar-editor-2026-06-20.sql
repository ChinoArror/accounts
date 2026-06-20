ALTER TABLE users ADD COLUMN avatar_original_key TEXT;
ALTER TABLE users ADD COLUMN avatar_pending_delete_key TEXT;
ALTER TABLE users ADD COLUMN avatar_original_pending_delete_key TEXT;
ALTER TABLE users ADD COLUMN avatar_delete_deadline TEXT;
ALTER TABLE users ADD COLUMN avatar_restore_token TEXT;
