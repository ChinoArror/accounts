import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users (uuid TEXT PRIMARY KEY, github_id TEXT, auth_provider TEXT);
CREATE TABLE auth_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE auth_audit_logs (user_id TEXT, event_type TEXT, success INTEGER, created_at TEXT);
INSERT INTO users VALUES ('u1', '42', 'email');
INSERT INTO users VALUES ('u2', NULL, 'sso');
INSERT INTO auth_audit_logs VALUES ('u1', 'register_email_success', 1, '2026-09-20T00:00:00Z');`);
const sql = readFileSync(new URL('./migration/migrate-oauth-external-registration-2026-09-29.sql', import.meta.url), 'utf8');
db.exec(sql);
assert.deepEqual({ ...db.prepare('SELECT provider, provider_subject, user_uuid FROM oauth_identities').get() }, { provider: 'github', provider_subject: '42', user_uuid: 'u1' });
assert.equal((db.prepare('SELECT COUNT(*) AS count FROM registration_events').get() as any).count, 1);
assert.throws(() => db.prepare('INSERT INTO oauth_identities (provider, provider_subject, user_uuid, linked_at) VALUES (?, ?, ?, ?)').run('github', '42', 'u2', 'now'));
db.exec(sql);
assert.equal((db.prepare('SELECT COUNT(*) AS count FROM registration_events').get() as any).count, 1);
console.log('OAuth migration tests passed');
