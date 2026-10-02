import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './src/index';
import { generateJWT, verifyJWT } from './src/auth';

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
const env: any = { DB: db, JWT_SECRET: 'test-secret', ADMIN_USERNAME: 'admin' };
sqlite.prepare("INSERT INTO users (id, uuid, username, name, password_hash, github_id) VALUES ('u1', 'u1', 'member', 'Member', 'hash', 'gh-123')").run();
sqlite.prepare("INSERT INTO oauth_identities (provider, provider_subject, user_uuid, linked_at) VALUES ('github', 'gh-123', 'u1', CURRENT_TIMESTAMP)").run();
const token = await generateJWT({ sub: 'admin', uuid: 'admin', role: 'admin' }, env.JWT_SECRET, 1);
const bind = await worker.fetch(new Request('https://accounts.aryuki.com/admin/users/u1/oauth-bind-token', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'google' }) }), env);
assert.equal(bind.status, 200);
const bindData: any = await bind.json();
const bindUrl = new URL(bindData.authorize_url, 'https://accounts.aryuki.com');
assert.equal(bindUrl.pathname, '/api/google/login');
const bindProof = await verifyJWT(bindUrl.searchParams.get('bind_token')!, env.JWT_SECRET);
assert.equal(bindProof.uuid, 'u1');
assert.equal(bindProof.provider, 'google');
assert.equal(bindProof.action, 'bind');
assert.ok(bindProof.exp - Math.floor(Date.now() / 1000) <= 300);
sqlite.prepare("INSERT INTO oauth_identities (provider, provider_subject, user_uuid, linked_at) VALUES ('google', 'google-123', 'u1', CURRENT_TIMESTAMP)").run();
const response = await worker.fetch(new Request('https://accounts.aryuki.com/admin/users/u1', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }), env);
assert.equal(response.status, 200);
assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM oauth_identities WHERE user_uuid = ?').get('u1') as any).n, 0);
assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM users WHERE uuid = ?').get('u1') as any).n, 0);
console.log('OAuth binding cleanup test passed');
