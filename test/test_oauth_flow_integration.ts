import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index';
import { generateJWT, verifyJWT } from '../src/auth';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const db = {
  prepare(sql: string) {
    let args: any[] = [];
    const statement = () => sqlite.prepare(sql);
    const query = {
      bind(...values: any[]) { args = values; return query; },
      async first() { return statement().get(...args) || null; },
      async all() { return { results: statement().all(...args) }; },
      async run() { const result = statement().run(...args); return { meta: { changes: result.changes } }; },
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
const env: any = {
  DB: db, JWT_SECRET: 'local-test-secret', PASSWORD_PEPPER: 'local-test-pepper',
  PUBLIC_BASE_URL: 'https://accounts.aryuki.com', GITHUB_CLIENT_ID: 'client', GITHUB_CLIENT_SECRET: 'secret',
  ADMIN_GITHUB_ID: '999', REGISTRATION_MODE: 'open', ALLOWED_EMAIL_DOMAINS: 'gmail.com',
  MAX_GLOBAL_REGISTRATIONS_PER_DAY: '100', MAX_REGISTRATIONS_PER_IP_PER_HOUR: '3', MAX_REGISTRATIONS_PER_IP_PER_DAY: '5',
  ADMIN_USERNAME: 'admin',
};
let providerId = 42;
let providerEmail = 'Alice@GMAIL.COM';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any) => {
  const url = String(input);
  if (url.includes('github.com/login/oauth/access_token')) return Response.json({ access_token: 'access-token' });
  if (url.includes('api.github.com/user/emails')) return Response.json([{ email: providerEmail, primary: true, verified: true }]);
  if (url.includes('api.github.com/user')) return Response.json({ id: providerId, login: 'alice', name: 'Alice', avatar_url: null });
  throw new Error(`Unexpected upstream request: ${url}`);
};
try {
  const start = await worker.fetch(new Request('https://accounts.aryuki.com/api/github/login'), env);
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get('location')!);
  assert.equal(authorize.searchParams.get('scope'), 'read:user user:email');
  const state = authorize.searchParams.get('state')!;
  const stateCookie = start.headers.get('set-cookie')!.split(';')[0];
  const callback = await worker.fetch(new Request(`https://accounts.aryuki.com/api/github/callback?code=ok&state=${encodeURIComponent(state)}`, { headers: { cookie: stateCookie, 'CF-Connecting-IP': '127.0.0.1' } }), env);
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), '/welcomenewuser');
  const ticketCookie = callback.headers.getSetCookie().find((cookie) => cookie.startsWith('oauth_pending='))!.split(';')[0];
  const headers = { cookie: ticketCookie, 'CF-Connecting-IP': '127.0.0.1' };
  const pending = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/pending', { headers }), env);
  assert.equal((await pending.json() as any).decision, 'new_account');
  const complete = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/complete', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' }), env);
  const result: any = await complete.json();
  assert.equal(complete.status, 200, JSON.stringify(result));
  assert.equal(result.ok, true);
  assert.match(result.redirect_to, /^\/user\//);
  const created: any = sqlite.prepare('SELECT email, role, auth_provider FROM users LIMIT 1').get();
  assert.equal(created.email, 'alice@gmail.com');
  assert.equal(created.role, 'user');
  assert.equal(created.auth_provider, 'github');
  assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM registration_events').get() as any).count, 1);
  const adminToken = await generateJWT({ sub: 'admin', uuid: 'admin', role: 'admin' }, env.JWT_SECRET, 1);
  const statsResponse = await worker.fetch(new Request('https://accounts.aryuki.com/admin/stats/external-registrations?granularity=day', { headers: { Authorization: `Bearer ${adminToken}` } }), env);
  assert.equal(statsResponse.status, 200);
  const stats: any = await statsResponse.json();
  assert.equal(stats.lifetime_total, 1);
  assert.equal(stats.by_channel.github, 1);
  const sessionCookie = complete.headers.getSetCookie().find((cookie) => cookie.startsWith('sso_session='))!.split(';')[0];
  const replay = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/complete', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' }), env);
  assert.equal(replay.status, 410);

  const beginAgain = async (query = '') => {
    const response = await worker.fetch(new Request(`https://accounts.aryuki.com/api/github/login${query}`), env);
    return { state: new URL(response.headers.get('location')!).searchParams.get('state')!, cookie: response.headers.getSetCookie().find((cookie) => cookie.startsWith('oauth_state_github='))!.split(';')[0] };
  };
  const callbackAgain = async (state: string, cookie: string) => worker.fetch(new Request(`https://accounts.aryuki.com/api/github/callback?code=ok&state=${encodeURIComponent(state)}`, { headers: { cookie, 'CF-Connecting-IP': '127.0.0.1' } }), env);
  const linked = await beginAgain();
  const linkedLogin = await callbackAgain(linked.state, linked.cookie);
  assert.equal(linkedLogin.status, 302);
  assert.match(linkedLogin.headers.get('location') || '', /^\/user\//);
  assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM registration_events').get() as any).count, 1);

  const createdUuid = (sqlite.prepare('SELECT uuid FROM users WHERE email = ?').get('alice@gmail.com') as any).uuid;
  sqlite.prepare('INSERT INTO apps (app_id, app_name, callback_url, secret_key) VALUES (?, ?, ?, ?)')
    .run('sample-app', 'Sample App', 'https://app.example.com/sso-callback', 'local-secret');
  sqlite.prepare('INSERT INTO user_apps (uuid, app_id) VALUES (?, ?)').run(createdUuid, 'sample-app');
  const badTarget = await worker.fetch(new Request('https://accounts.aryuki.com/api/github/login?app_id=sample-app&app_redirect=https%3A%2F%2Fevil.example.com%2Fsso-callback'), env);
  assert.equal(badTarget.status, 400);
  const sso = await beginAgain('?app_id=sample-app&app_redirect=https%3A%2F%2Fapp.example.com%2Fsso-callback');
  const ssoCallback = await callbackAgain(sso.state, sso.cookie);
  assert.equal(ssoCallback.status, 302);
  const ssoUrl = new URL(ssoCallback.headers.get('location')!);
  assert.equal(ssoUrl.origin, 'https://app.example.com');
  assert.equal(ssoUrl.pathname, '/sso-callback');
  const ssoPayload = await verifyJWT(ssoUrl.searchParams.get('token')!, env.JWT_SECRET);
  assert.equal(ssoPayload.sub, createdUuid);
  assert.equal(ssoPayload.role, 'user');
  assert.equal(ssoPayload.email, 'alice@gmail.com');
  assert.equal(ssoPayload.auth_provider, 'github');

  providerId = 43;
  const second = await beginAgain();
  const collision = await callbackAgain(second.state, second.cookie);
  assert.equal(collision.headers.get('location'), '/welcomenewuser');
  const collisionTicket = collision.headers.getSetCookie().find((cookie) => cookie.startsWith('oauth_pending='))!.split(';')[0];
  const collisionHeaders = { cookie: collisionTicket, 'CF-Connecting-IP': '127.0.0.1', 'Content-Type': 'application/json' };
  const noProof = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/complete', { method: 'POST', headers: collisionHeaders, body: '{}' }), env);
  assert.equal(noProof.status, 403);
  const withProof = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/complete', { method: 'POST', headers: { ...collisionHeaders, cookie: `${collisionTicket}; ${sessionCookie}` }, body: '{}' }), env);
  assert.equal(withProof.status, 409);
  assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM users').get() as any).count, 1);
  assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM registration_events').get() as any).count, 1);

  sqlite.prepare(`INSERT INTO users (id, uuid, username, name, email, email_verified, role, status, auth_provider, password_hash, password_salt, cookie_expiry_days)
    VALUES ('u2', 'u2', 'bob', 'Bob', 'bob@gmail.com', 1, 'user', 'active', 'email', 'unused', 'unused', 7)`).run();
  sqlite.prepare(`INSERT INTO user_sessions (session_id, uuid, username, expires_at) VALUES (?, ?, ?, ?)`)
    .run('bob-session', 'u2', 'bob', new Date(Date.now() + 86400000).toISOString());
  const bobJwt = await generateJWT({ sub: 'u2', uuid: 'u2', role: 'user', session_id: 'bob-session' }, env.JWT_SECRET, 1);
  providerId = 45;
  providerEmail = 'bob@gmail.com';
  const bobStart = await beginAgain();
  const bobCallback = await callbackAgain(bobStart.state, bobStart.cookie);
  const bobTicket = bobCallback.headers.getSetCookie().find((cookie) => cookie.startsWith('oauth_pending='))!.split(';')[0];
  const bobNoProof = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/complete', { method: 'POST', headers: { cookie: bobTicket, 'Content-Type': 'application/json' }, body: '{}' }), env);
  assert.equal(bobNoProof.status, 403);
  const bobBind = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/complete', { method: 'POST', headers: { cookie: `${bobTicket}; sso_session=${bobJwt}`, 'Content-Type': 'application/json' }, body: '{}' }), env);
  assert.equal(bobBind.status, 200);
  assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM users').get() as any).count, 2);
  assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM registration_events').get() as any).count, 1);

  providerId = 46;
  providerEmail = 'new@aryuki.com';
  const domainStart = await beginAgain();
  const domainCallback = await callbackAgain(domainStart.state, domainStart.cookie);
  const domainTicket = domainCallback.headers.getSetCookie().find((cookie) => cookie.startsWith('oauth_pending='))!.split(';')[0];
  const domainHeaders = { cookie: domainTicket, 'Content-Type': 'application/json' };
  const unsupported = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/pending', { headers: domainHeaders }), env);
  assert.equal((await unsupported.json() as any).decision, 'unsupported_domain');
  const denied = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/complete', { method: 'POST', headers: domainHeaders, body: '{}' }), env);
  assert.equal(denied.status, 400);
  env.ALLOWED_EMAIL_DOMAINS += ',aryuki.com';
  const supported = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/pending', { headers: domainHeaders }), env);
  assert.equal((await supported.json() as any).decision, 'new_account');

  sqlite.prepare(`INSERT INTO users (id, uuid, username, name, email, email_verified, role, status, auth_provider, password_hash, password_salt, github_id)
    VALUES ('legacy', 'legacy', 'legacy', 'Legacy', 'legacy@gmail.com', 1, 'user', 'active', 'email', 'unused', 'unused', '55')`).run();
  providerId = 55;
  providerEmail = 'legacy@gmail.com';
  const legacyStart = await beginAgain();
  const legacyCallback = await callbackAgain(legacyStart.state, legacyStart.cookie);
  assert.equal(legacyCallback.headers.get('location'), '/welcomenewuser');
  const legacyTicket = legacyCallback.headers.getSetCookie().find((cookie) => cookie.startsWith('oauth_pending='))!.split(';')[0];
  const legacyStatus = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/pending', { headers: { cookie: legacyTicket } }), env);
  assert.equal((await legacyStatus.json() as any).decision, 'link_existing');

  sqlite.prepare("UPDATE auth_settings SET value = 'false' WHERE key = 'external_registration_enabled'").run();
  providerId = 44;
  providerEmail = 'new@gmail.com';
  const closedStart = await beginAgain();
  const closedCallback = await callbackAgain(closedStart.state, closedStart.cookie);
  const closedTicket = closedCallback.headers.getSetCookie().find((cookie) => cookie.startsWith('oauth_pending='))!.split(';')[0];
  const closedStatus = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/pending', { headers: { cookie: closedTicket } }), env);
  assert.equal((await closedStatus.json() as any).decision, 'closed');
  const stillLinked = await beginAgain();
  providerId = 42;
  const loginWhenClosed = await callbackAgain(stillLinked.state, stillLinked.cookie);
  assert.equal(loginWhenClosed.status, 302);
  console.log('OAuth flow integration test passed');
} finally { globalThis.fetch = originalFetch; }
