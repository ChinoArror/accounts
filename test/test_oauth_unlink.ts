import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './src/index';
import { generateJWT } from './src/auth';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const db = {
  prepare(sql: string) {
    let args: any[] = [];
    const query = {
      bind(...values: any[]) { args = values; return query; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: result.changes } }; },
    };
    return query;
  },
  async batch(queries: any[]) {
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const query of queries) results.push(await query.run());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const env: any = { DB: db, JWT_SECRET: 'test-secret', PASSWORD_PEPPER: 'pepper', ADMIN_USERNAME: 'admin' };
sqlite.prepare("INSERT INTO users (id, uuid, username, name, email, email_verified, password_hash, github_id) VALUES ('u1', 'u1', 'alice', 'Alice', 'alice@gmail.com', 1, 'hash', '123456')").run();
sqlite.prepare("INSERT INTO users (id, uuid, username, name, password_hash) VALUES ('u2', 'u2', 'bob', 'Bob', 'hash')").run();
sqlite.prepare("INSERT INTO oauth_identities (provider, provider_subject, user_uuid, provider_email, linked_at) VALUES ('google', 'g-123', 'u1', 'alice@gmail.com', '2026-09-30T00:00:00Z')").run();
sqlite.prepare("INSERT INTO oauth_identities (provider, provider_subject, user_uuid, provider_username, linked_at) VALUES ('github', '123456', 'u1', 'alice-gh', '2026-09-30T00:00:00Z')").run();
sqlite.prepare("INSERT INTO user_sessions (session_id, uuid, username, expires_at) VALUES ('s1', 'u1', 'alice', '2030-01-01T00:00:00Z')").run();
const token = await generateJWT({ sub: 'u1', uuid: 'u1', role: 'user', session_id: 's1' }, env.JWT_SECRET, 1);
const admin = await generateJWT({ sub: 'admin', uuid: 'admin', role: 'admin' }, env.JWT_SECRET, 1);
const request = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://accounts.aryuki.com${path}`, init), env);
const own = await request('/api/account/oauth-bindings', { headers: { Cookie: `sso_session=${token}` } });
assert.equal(own.status, 200);
const ownBindings = (await own.json() as any).bindings;
assert.deepEqual(ownBindings.map((entry: any) => entry.provider).sort(), ['github', 'google']);
assert.equal(ownBindings.find((entry: any) => entry.provider === 'google').provider_email, 'alice@gmail.com');
assert.equal(ownBindings.find((entry: any) => entry.provider === 'github').provider_username, 'alice-gh');
const adminList = await request('/admin/users/u1/oauth-bindings', { headers: { Authorization: `Bearer ${admin}` } });
assert.equal(adminList.status, 200);
assert.equal((await adminList.json() as any).bindings.length, 2);
const blocked = await request('/admin/users/u1/oauth-bindings/google', { method: 'DELETE', headers: { Cookie: `sso_session=${token}` } });
assert.equal(blocked.status, 401);
const unlink = await request('/api/account/oauth-bindings/google', { method: 'DELETE', headers: { Cookie: `sso_session=${token}` } });
assert.equal(unlink.status, 200);
assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM oauth_identities WHERE provider='google' AND provider_subject='g-123'").get() as any).n, 0);
assert.equal((sqlite.prepare("SELECT email FROM users WHERE uuid='u1'").get() as any).email, 'alice@gmail.com');
sqlite.prepare("INSERT INTO oauth_identities (provider, provider_subject, user_uuid, linked_at) VALUES ('google', 'g-123', 'u2', CURRENT_TIMESTAMP)").run();
const adminUnlink = await request('/admin/users/u1/oauth-bindings/github', { method: 'DELETE', headers: { Authorization: `Bearer ${admin}` } });
assert.equal(adminUnlink.status, 200);
assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM oauth_identities WHERE provider='github' AND provider_subject='123456'").get() as any).n, 0);
assert.equal((sqlite.prepare("SELECT github_id FROM users WHERE uuid='u1'").get() as any).github_id, null);
console.log('OAuth unlink tests passed');
