import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index';
import { generateJWT, generateSalt, hashPassword } from '../src/auth';
import { passwordProblem, passwordStrength } from '../src/passwordPolicy';

assert.equal(passwordStrength(''), 0);
assert.equal(passwordStrength('pass1234'), 1);
assert.equal(passwordStrength('Passphrase123'), 2);
assert.equal(passwordStrength('Long!Passphrase123'), 3);
assert.ok(passwordProblem('pass1234'));
assert.equal(passwordProblem('Passphrase123'), '');

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
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
  async batch(queries: any[]) { return Promise.all(queries.map((query) => query.run())); },
};
const env: any = {
  DB: db, JWT_SECRET: 'test-secret', PASSWORD_PEPPER: 'test-pepper', ADMIN_USERNAME: 'admin',
  REGISTRATION_MODE: 'open', ALLOWED_EMAIL_DOMAINS: 'gmail.com',
};
const salt = generateSalt();
const hash = await hashPassword('Existing!Password123', salt);
sqlite.prepare('INSERT INTO users (id, uuid, username, name, email, email_verified, status, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)')
  .run('u1', 'u1', 'existing', 'Existing', 'existing@gmail.com', 'active', hash, salt);
sqlite.prepare("INSERT INTO apps (app_id, app_name, callback_url, secret_key, use_agent_limit) VALUES ('test-app', 'Test App', 'https://app.example.com/callback', 'app-secret', 1)").run();

const post = (path: string, body: Record<string, unknown>) => worker.fetch(new Request(`https://accounts.aryuki.com${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), env);
const draft = { email: 'new@gmail.com', username: 'newuser', fullname: 'New User', password: 'New!Password123' };
assert.equal((await post('/api/auth/register/preflight', draft)).status, 200);
assert.equal((await post('/api/auth/register/preflight', { ...draft, password: 'pass1234' })).status, 400);
assert.equal((await post('/api/auth/register/preflight', { ...draft, username: 'existing' })).status, 409);
assert.equal((await post('/api/auth/register/preflight', { ...draft, email: 'existing@gmail.com' })).status, 409);
assert.equal((await post('/api/auth/register/preflight', { ...draft, register_code: 'bad-code' })).status, 400);

sqlite.prepare("UPDATE users SET status = 'paused' WHERE uuid = 'u1'").run();
const paused = await post('/api/auth/login/email', { identifier: 'existing', password: 'Existing!Password123' });
assert.equal(paused.status, 403);
assert.match((await paused.json() as any).message, /paused/i);
const pausedLegacy = await post('/login', { username: 'existing', password: 'Existing!Password123' });
assert.equal(pausedLegacy.status, 403);
assert.match((await pausedLegacy.json() as any).error, /paused/i);
sqlite.prepare("UPDATE users SET status = 'active' WHERE uuid = 'u1'").run();
const forbidden = await post('/api/auth/login/email', { identifier: 'existing', password: 'Existing!Password123', app_id: 'test-app' });
assert.equal(forbidden.status, 403);
assert.match((await forbidden.json() as any).message, /permission/i);
const forbiddenLegacy = await post('/login', { username: 'existing', password: 'Existing!Password123', app_id: 'test-app' });
assert.equal(forbiddenLegacy.status, 403);
assert.match((await forbiddenLegacy.json() as any).error, /permission/i);

const quota = () => worker.fetch(new Request('https://accounts.aryuki.com/api/quota/check?uuid=u1&app_id=test-app', { headers: { Authorization: 'Bearer app-secret' } }), env);
sqlite.prepare("INSERT INTO user_apps (uuid, app_id, rpm_limit, rpd_limit, daily_token_limit) VALUES ('u1', 'test-app', NULL, NULL, NULL)").run();
const unlimited = await quota();
assert.equal(unlimited.status, 200);
assert.equal((await unlimited.json() as any).unlimited, true);
sqlite.prepare("UPDATE user_apps SET daily_token_limit = 0 WHERE uuid = 'u1' AND app_id = 'test-app'").run();
assert.equal((await quota()).status, 429);
const consume = await post('/api/quota/consume', { uuid: 'u1', app_id: 'test-app', tokens: 1 });
assert.equal(consume.status, 400, 'consume requires the app secret');
const consumeZero = await worker.fetch(new Request('https://accounts.aryuki.com/api/quota/consume', {
  method: 'POST', headers: { Authorization: 'Bearer app-secret', 'Content-Type': 'application/json' },
  body: JSON.stringify({ uuid: 'u1', app_id: 'test-app', tokens: 1 }),
}), env);
assert.equal(consumeZero.status, 429);
const adminToken = await generateJWT({ sub: 'admin', uuid: 'admin', role: 'admin' }, env.JWT_SECRET, 1);
const saveDefault = await worker.fetch(new Request('https://accounts.aryuki.com/admin/auth/default-registration-config', {
  method: 'PUT', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ external_registration_enabled: true, permissions: [{ app_id: 'test-app', rpm_limit: null, rpd_limit: 0, daily_token_limit: null }] }),
}), env);
assert.equal(saveDefault.status, 200);
assert.deepEqual((await saveDefault.json() as any).config.permissions[0], { app_id: 'test-app', rpm_limit: null, rpd_limit: 0, daily_token_limit: null });
console.log('Registration preflight, password policy, account status, and quota tests passed');
