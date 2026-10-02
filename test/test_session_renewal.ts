import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './src/index';
import { generateJWT, generateSalt, hashPassword, verifyJWT } from './src/auth';

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
const env: any = { DB: db, JWT_SECRET: 'session-test-secret', PASSWORD_PEPPER: 'session-test-pepper', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD_SECRET: 'admin-test-password', ADMIN_COOKIE_EXPIRY_DAYS: '7', ACCESS_TOKEN_TTL_SECONDS: '3600', REFRESH_TOKEN_TTL_SECONDS: '2592000' };
const salt = generateSalt();
const hash = await hashPassword('member-test-password', salt);
sqlite.prepare('INSERT INTO users (id, uuid, username, name, email, email_verified, password_hash, password_salt, cookie_expiry_days) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 7)')
  .run('u1', 'u1', 'member', 'Member', 'member@gmail.com', hash, salt);
sqlite.prepare("INSERT INTO apps (app_id, app_name, callback_url, secret_key) VALUES ('test-app', 'Test App', 'https://app.example.com/callback', 'secret')").run();
sqlite.prepare("INSERT INTO user_apps (uuid, app_id) VALUES ('u1', 'test-app')").run();

const login = await worker.fetch(new Request('https://accounts.aryuki.com/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'member', password: 'member-test-password', app_id: 'auth-center' }) }), env);
assert.equal(login.status, 200);
const cookies = login.headers.getSetCookie();
const refresh = cookies.find((value) => value.startsWith('auth_refresh='))?.split(';')[0];
assert.ok(refresh, 'login should issue a refresh cookie');
const continuation = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/session/continue', {
  method: 'POST', headers: { cookie: refresh, 'Content-Type': 'application/json', Origin: 'https://accounts.aryuki.com' },
  body: JSON.stringify({ app_id: 'test-app', redirect_uri: 'https://app.example.com/callback' }),
}), env);
assert.equal(continuation.status, 200);
const result: any = await continuation.json();
assert.equal(result.ok, true);
const callback = new URL(result.redirect_to);
assert.equal(callback.origin, 'https://app.example.com');
const jwt = callback.searchParams.get('token')!;
const payload = await verifyJWT(jwt, env.JWT_SECRET);
assert.equal(payload.sub, 'u1');
assert.equal(payload.role, 'user');
assert.equal(payload.session_kind, 'durable');
assert.ok(payload.exp - Math.floor(Date.now() / 1000) <= 3600);
assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM session_app_activity WHERE session_id = ? AND app_id = ?').get(payload.session_id, 'test-app') as any).n, 1);

const rotatedRefresh = continuation.headers.getSetCookie().find((value) => value.startsWith('auth_refresh='))?.split(';')[0];
assert.ok(rotatedRefresh, 'continuation should rotate refresh cookie');
const replay = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/session/continue', {
  method: 'POST', headers: { cookie: refresh, 'Content-Type': 'application/json', Origin: 'https://accounts.aryuki.com' }, body: '{}',
}), env);
assert.equal(replay.status, 200, 'concurrent old cookie is accepted within short grace');
assert.ok(!replay.headers.getSetCookie().some((value) => value.startsWith('auth_refresh=')), 'grace request must not rotate a second time');

const verify = await worker.fetch(new Request('https://accounts.aryuki.com/api/verify?app_id=test-app', { headers: { Authorization: `Bearer ${jwt}` } }), env);
assert.equal(verify.status, 200);

const revoke = await worker.fetch(new Request(`https://accounts.aryuki.com/api/user/sessions/${payload.session_id}`, {
  method: 'DELETE', headers: { cookie: continuation.headers.getSetCookie().find((value) => value.startsWith('sso_session='))?.split(';')[0] || '' },
}), env);
assert.equal(revoke.status, 200);
const revokedVerify = await worker.fetch(new Request('https://accounts.aryuki.com/api/verify?app_id=test-app', { headers: { Authorization: `Bearer ${jwt}` } }), env);
assert.equal(revokedVerify.status, 401);
const revokedContinue = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/session/continue', {
  method: 'POST', headers: { cookie: rotatedRefresh, 'Content-Type': 'application/json' }, body: '{}',
}), env);
assert.equal(revokedContinue.status, 401);

const adminLogin = await worker.fetch(new Request('https://accounts.aryuki.com/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin-test-password' }) }), env);
assert.equal(adminLogin.status, 200);
const adminRefresh = adminLogin.headers.getSetCookie().find((value) => value.startsWith('auth_refresh='))?.split(';')[0];
assert.ok(adminRefresh);
const adminContinue = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/session/continue', {
  method: 'POST', headers: { cookie: adminRefresh, 'Content-Type': 'application/json' }, body: '{}',
}), env);
assert.equal(adminContinue.status, 200);
assert.equal((await adminContinue.json() as any).user.role, 'admin');

const forged = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/session/continue', {
  method: 'POST', headers: { cookie: refresh, 'Content-Type': 'application/json', Origin: 'https://accounts.aryuki.com' },
  body: JSON.stringify({ app_id: 'test-app', redirect_uri: 'https://evil.example.com/callback' }),
}), env);
assert.equal(forged.status, 400);

const secondLogin = await worker.fetch(new Request('https://accounts.aryuki.com/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'member', password: 'member-test-password' }) }), env);
const secondRefresh = secondLogin.headers.getSetCookie().find((value) => value.startsWith('auth_refresh='))?.split(';')[0];
assert.ok(secondRefresh);
sqlite.prepare("UPDATE user_apps SET enabled = 0 WHERE uuid = 'u1' AND app_id = 'test-app'").run();
const denied = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/session/continue', {
  method: 'POST', headers: { cookie: secondRefresh, 'Content-Type': 'application/json' }, body: JSON.stringify({ app_id: 'test-app', redirect_uri: 'https://app.example.com/callback' }),
}), env);
assert.equal(denied.status, 403);
sqlite.prepare("UPDATE user_apps SET enabled = 1 WHERE uuid = 'u1' AND app_id = 'test-app'").run();
sqlite.prepare("UPDATE auth_sessions SET expires_at = '2000-01-01' WHERE user_id = 'u1'").run();
const expired = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/session/continue', {
  method: 'POST', headers: { cookie: secondRefresh, 'Content-Type': 'application/json' }, body: '{}',
}), env);
assert.equal(expired.status, 401);

const oldId = crypto.randomUUID();
sqlite.prepare("INSERT INTO user_sessions (session_id, uuid, username, expires_at) VALUES (?, 'u1', 'member', ?)").run(oldId, new Date(Date.now() + 86400000).toISOString());
const oldJwt = await generateJWT({ sub: 'u1', uuid: 'u1', username: 'member', role: 'user', session_id: oldId }, env.JWT_SECRET, 1);
const upgraded = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/session/continue', {
  method: 'POST', headers: { cookie: `sso_session=${oldJwt}`, 'Content-Type': 'application/json' }, body: '{}',
}), env);
assert.equal(upgraded.status, 200, 'legacy unexpired SSO cookie should upgrade without another login');
assert.ok(upgraded.headers.getSetCookie().some((value) => value.startsWith('auth_refresh=')));
console.log('Session renewal test passed');
