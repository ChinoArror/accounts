import type { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { generateJWT, generateSalt, hashPassword, verifyJWT } from './auth';
import { oauthDecision, oauthEmail, oauthHourBucket, safeOAuthName } from './oauthPolicy';
import { exchangeGithub, exchangeGoogle, googleAuthorizeUrl, type OAuthProfile, type OAuthProvider } from './oauthProviders';
import { enqueueEmail } from './emailAuthFeature';

type Ctx = any;
type Target = { app_id?: string; app_redirect?: string };
type Dependencies = {
  currentSession: (c: Ctx) => Promise<any>;
  finishLogin: (c: Ctx, user: any, target: Target, provider: OAuthProvider, asJson?: boolean) => Promise<Response>;
};

const TEN_MINUTES = 600000;
const STATE_COOKIE = 'oauth_state_';
const TICKET_COOKIE = 'oauth_pending';

export function isAllowedOAuthRedirect(configured: string, requested: string) {
  try {
    const expected = new URL(configured);
    const actual = new URL(requested);
    return expected.protocol === 'https:' && actual.protocol === 'https:'
      && expected.origin === actual.origin && expected.pathname === actual.pathname
      && !actual.username && !actual.password;
  } catch { return false; }
}

export function registrationChallengeRequired(attempt: number, threshold: number) {
  return attempt > Math.max(0, threshold);
}

async function sha256(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomSecret() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
}

async function hashIp(c: Ctx) {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  return sha256(`${c.env.PASSWORD_PEPPER || c.env.JWT_SECRET}:${ip}`);
}

function clearCookie(c: Ctx, name: string) {
  setCookie(c, name, '', { path: '/', maxAge: 0, httpOnly: true, secure: true, sameSite: 'Lax' });
}

function setPrivateCookie(c: Ctx, name: string, value: string) {
  setCookie(c, name, value, { path: '/', maxAge: 600, httpOnly: true, secure: true, sameSite: 'Lax' });
}

async function safeTarget(c: Ctx, appId: string | undefined, redirect: string | undefined): Promise<Target | null> {
  if (!appId && !redirect) return {};
  if (!appId || !redirect) return null;
  const app: any = await c.env.DB.prepare('SELECT callback_url, status FROM apps WHERE app_id = ?').bind(appId).first();
  if (!app || app.status !== 'active' || !isAllowedOAuthRedirect(app.callback_url, redirect)) return null;
  return { app_id: appId, app_redirect: redirect };
}

async function setting(c: Ctx, key: string, fallback: any) {
  const row: any = await c.env.DB.prepare('SELECT value FROM auth_settings WHERE key = ?').bind(key).first();
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

function envNumber(c: Ctx, key: string, fallback: number) {
  const value = Number(c.env[key]);
  return Number.isFinite(value) ? value : fallback;
}

function publicRegistrationOpen(c: Ctx) {
  const mode = String(c.env.REGISTRATION_MODE || 'open');
  if (mode === 'open') return true;
  if (mode !== 'time_window') return false;
  const now = Date.now();
  const start = c.env.REGISTRATION_START_AT ? Date.parse(c.env.REGISTRATION_START_AT) : 0;
  const end = c.env.REGISTRATION_END_AT ? Date.parse(c.env.REGISTRATION_END_AT) : Infinity;
  return Number.isFinite(start) && (end === Infinity || Number.isFinite(end)) && now >= start && now <= end;
}

function allowedEmailDomain(c: Ctx, email: string) {
  const domain = email.split('@')[1];
  const list = (value: string) => value.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
  const allowed = list(String(c.env.ALLOWED_EMAIL_DOMAINS || ''));
  const blocked = list(String(c.env.BLOCKED_EMAIL_DOMAINS || ''));
  return !blocked.includes(domain) && (!allowed.length || allowed.includes(domain));
}

async function counter(c: Ctx, type: string, key: string, windowMs: number, max?: number) {
  const bucketStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const bucketEnd = new Date(bucketStart.getTime() + windowMs);
  const id = `${type}:${key}:${bucketStart.toISOString()}`;
  const row: any = await c.env.DB.prepare(`
    INSERT INTO registration_counters (id, counter_type, counter_key, count, window_start, window_end)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET count = count + 1
    WHERE ? IS NULL OR count < ?
    RETURNING count
  `).bind(id, type, key, bucketStart.toISOString(), bucketEnd.toISOString(), max ?? null, max ?? null).first();
  return row ? Number(row.count) : null;
}

async function log(c: Ctx, event: string, success: boolean, userId: string | null, detail: Record<string, unknown>) {
  await c.env.DB.prepare(`
    INSERT INTO auth_audit_logs (id, user_id, event_type, ip_hash, user_agent, success, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), userId, event, await hashIp(c), c.req.header('User-Agent') || '', success ? 1 : 0, JSON.stringify(detail), new Date().toISOString()).run();
}

async function lookupPending(c: Ctx) {
  const ticket = getCookie(c, TICKET_COOKIE);
  if (!ticket) return null;
  const row: any = await c.env.DB.prepare(`
    SELECT * FROM oauth_pending WHERE ticket_hash = ? AND consumed_at IS NULL AND expires_at > ?
  `).bind(await sha256(ticket), new Date().toISOString()).first();
  if (!row) return null;
  const profile: OAuthProfile & { email: string; challenge?: boolean } = JSON.parse(row.profile_json);
  return { row, profile };
}

async function linkedUser(c: Ctx, profile: OAuthProfile) {
  const link: any = await c.env.DB.prepare('SELECT user_uuid FROM oauth_identities WHERE provider = ? AND provider_subject = ?')
    .bind(profile.provider, profile.subject).first();
  if (link?.user_uuid === 'admin') {
    return { uuid: 'admin', user_id: '0', username: c.env.ADMIN_USERNAME || 'admin', name: 'Admin', email: c.env.ADMIN_EMAIL || null, email_verified: !!c.env.ADMIN_EMAIL, role: 'admin', status: 'active', auth_provider: profile.provider, cookie_expiry_days: envNumber(c, 'ADMIN_COOKIE_EXPIRY_DAYS', 7) };
  }
  const uuid = link?.user_uuid;
  if (uuid) return c.env.DB.prepare('SELECT * FROM users WHERE uuid = ?').bind(uuid).first();
  return null;
}

function googleCredentials(c: Ctx) {
  let clientId = String(c.env.GOOGLE_CLIENT_ID || '');
  let clientSecret = String(c.env.GOOGLE_CLIENT_SECRET || '');
  if (c.env.GOOGLE_OAUTH_CREDENTIALS) {
    try {
      const bundle = JSON.parse(c.env.GOOGLE_OAUTH_CREDENTIALS);
      const fields = bundle.web || bundle;
      clientId = String(fields.client_id || fields.clientId || clientId);
      clientSecret = String(fields.client_secret || fields.clientSecret || clientSecret);
    } catch { return null; }
  }
  if (!clientId || !clientSecret || clientId.startsWith('REPLACE_') || clientSecret.startsWith('REPLACE_')) return null;
  return { clientId, clientSecret };
}

async function importAvatar(c: Ctx, uuid: string, source: string | null, provider: OAuthProvider) {
  if (!source || !c.env.AVATAR_BUCKET) return null;
  try {
    const url = new URL(source);
    const hosts = provider === 'github' ? ['avatars.githubusercontent.com'] : ['googleusercontent.com', 'lh3.googleusercontent.com', 'lh4.googleusercontent.com', 'lh5.googleusercontent.com', 'lh6.googleusercontent.com'];
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname)) return null;
    const response = await fetch(source, { redirect: 'error' });
    const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return null;
    if (Number(response.headers.get('content-length') || 0) > 2_000_000) return null;
    if (!response.body) return null;
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 2_000_000) { await reader.cancel(); return null; }
      parts.push(value);
    }
    if (total < 128) return null;
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    const extension = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp';
    const key = `avatars/${uuid}/original-oauth-${crypto.randomUUID()}.${extension}`;
    await c.env.AVATAR_BUCKET.put(key, bytes, { httpMetadata: { contentType } });
    return key;
  } catch { return null; }
}

export function registerOAuthFlow(app: Hono<any>, deps: Dependencies) {
  app.get('/api/auth/oauth/config', (c) => c.json({ ok: true, google_enabled: !!googleCredentials(c), github_enabled: !!(c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET) }));

  async function begin(c: Ctx, provider: OAuthProvider) {
    const google = googleCredentials(c);
    if (provider === 'google' && !google) return c.redirect('/login?error=google_unavailable');
    if (provider === 'github' && (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET)) return c.redirect('/login?error=github_unavailable');
    const target = await safeTarget(c, c.req.query('app_id'), c.req.query('app_redirect'));
    if (!target) return c.json({ ok: false, message: 'Invalid application callback.' }, 400);
    const bindToken = c.req.query('bind_token');
    const currentBind = c.req.query('bind') === '1' ? await deps.currentSession(c) : null;
    let bindUuid: string | null = null;
    let bindProof = false;
    if (bindToken) {
      const proof = await verifyJWT(bindToken, c.env.JWT_SECRET).catch(() => null);
      if (proof?.action !== 'bind' || !proof.uuid || proof.provider !== provider) return c.json({ ok: false, message: 'Invalid bind token.' }, 400);
      bindUuid = String(proof.uuid);
      bindProof = true;
    }
    if (c.req.query('bind') === '1') {
      if (!currentBind) return c.redirect('/login');
      bindUuid = currentBind.payload.uuid;
    }
    const sid = randomSecret();
    const nonce = randomSecret();
    const verifier = provider === 'google' ? randomSecret() : null;
    const state = await generateJWT({ sid, provider, nonce, bind_uuid: bindUuid, bind_proof: bindProof, ...target }, c.env.JWT_SECRET, TEN_MINUTES / 86400000);
    const now = new Date();
    await c.env.DB.prepare('INSERT INTO oauth_states (state_hash, provider, verifier, nonce, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await sha256(state), provider, verifier, nonce, now.toISOString(), new Date(now.getTime() + TEN_MINUTES).toISOString()).run();
    setPrivateCookie(c, `${STATE_COOKIE}${provider}`, sid);
    const redirect = `${c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin}/api/${provider}/callback`;
    if (provider === 'google') {
      const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier!)))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return c.redirect(googleAuthorizeUrl(google!.clientId, redirect, state, challenge, nonce, c.env.GOOGLE_BIRTHDAY_SCOPE_ENABLED === 'true'));
    }
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID);
    url.searchParams.set('redirect_uri', redirect);
    url.searchParams.set('scope', 'read:user user:email');
    url.searchParams.set('state', state);
    return c.redirect(url.toString());
  }

  async function callback(c: Ctx, provider: OAuthProvider) {
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (!code || !state) return c.redirect('/login?error=oauth_cancelled');
    const payload = await verifyJWT(state, c.env.JWT_SECRET).catch(() => null);
    const sid = getCookie(c, `${STATE_COOKIE}${provider}`);
    if (!payload || payload.provider !== provider || !sid || payload.sid !== sid) return c.redirect('/login?error=oauth_state');
    const now = new Date().toISOString();
    const row: any = await c.env.DB.prepare(`
      UPDATE oauth_states SET used_at = ?
      WHERE state_hash = ? AND provider = ? AND used_at IS NULL AND expires_at > ?
      RETURNING verifier, nonce
    `).bind(now, await sha256(state), provider, now).first();
    clearCookie(c, `${STATE_COOKIE}${provider}`);
    if (!row) return c.redirect('/login?error=oauth_state');
    const redirect = `${c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin}/api/${provider}/callback`;
    const google = provider === 'google' ? googleCredentials(c) : null;
    if (provider === 'google' && !google) return c.redirect('/login?error=google_unavailable');
    let profile: OAuthProfile;
    try {
      profile = provider === 'github'
        ? await exchangeGithub(code, redirect, c.env.GITHUB_CLIENT_ID, c.env.GITHUB_CLIENT_SECRET)
        : await exchangeGoogle(code, redirect, google!.clientId, google!.clientSecret, row.verifier, row.nonce, c.env.GOOGLE_BIRTHDAY_SCOPE_ENABLED === 'true');
    } catch {
      await log(c, 'oauth_login_failed', false, null, { provider, reason: 'provider_profile' });
      return c.redirect('/login?error=oauth_profile');
    }
    const target = await safeTarget(c, payload.app_id, payload.app_redirect);
    if (!target) return c.redirect('/login?error=oauth_target');
    if (payload.bind_uuid) {
      const current = await deps.currentSession(c);
      if (!payload.bind_proof && (!current || current.payload.uuid !== payload.bind_uuid)) return c.redirect('/login?error=oauth_bind');
      const bindTarget: any = payload.bind_uuid === 'admin'
        ? { username: 'admin', status: 'active' }
        : await c.env.DB.prepare('SELECT username, status FROM users WHERE uuid = ?').bind(payload.bind_uuid).first();
      if (!bindTarget || bindTarget.status !== 'active') return c.redirect('/login?error=account_unavailable');
      const owner = await linkedUser(c, profile);
      if (owner && owner.uuid !== payload.bind_uuid) return c.redirect('/login?error=oauth_bound');
      try {
        await c.env.DB.prepare('INSERT INTO oauth_identities (provider, provider_subject, user_uuid, provider_email, provider_username, linked_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(provider, profile.subject, payload.bind_uuid, profile.email, profile.username, now).run();
      } catch { return c.redirect('/login?error=oauth_bound'); }
      await log(c, 'oauth_link_success', true, payload.bind_uuid, { provider });
      if (payload.bind_proof) {
        return c.redirect(payload.bind_uuid === 'admin' ? '/dash' : `/@${encodeURIComponent(bindTarget.username)}?oauth_linked=${provider}`);
      }
      return c.redirect(payload.bind_uuid === 'admin' ? '/dash' : `/user/${encodeURIComponent(payload.bind_uuid)}`);
    }
    const user = await linkedUser(c, profile);
    if (user) {
      if (user.status !== 'active') return c.redirect(user.status === 'paused' || user.status === 'disabled' ? '/login?error=account_paused' : '/login?error=account_unavailable');
      await c.env.DB.prepare('UPDATE oauth_identities SET last_login_at = ?, provider_email = ?, provider_username = ? WHERE provider = ? AND provider_subject = ?')
        .bind(now, profile.email, profile.username, provider, profile.subject).run();
      await log(c, 'oauth_login_success', true, user.uuid, { provider });
      return deps.finishLogin(c, user, target, provider);
    }
    if (!profile.email) return c.redirect('/login?error=verified_email_required');
    const emailOwner: any = oauthEmail(c.env.ADMIN_EMAIL) === profile.email
      ? { uuid: 'admin' }
      : await c.env.DB.prepare('SELECT uuid FROM users WHERE lower(email) = ?').bind(profile.email).first();
    const attempts = emailOwner ? 0 : await counter(c, 'oauth_unbound_attempts_hour', await hashIp(c), 3600000);
    const threshold = Math.max(0, Number(await setting(c, 'oauth_turnstile_threshold_per_ip_hour', 3)) || 0);
    const ticket = randomSecret();
    await c.env.DB.prepare(`
      INSERT INTO oauth_pending (ticket_hash, provider, provider_subject, email, profile_json, app_id, redirect_uri, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(await sha256(ticket), provider, profile.subject, profile.email, JSON.stringify({ ...profile, challenge: !emailOwner && registrationChallengeRequired(attempts || threshold + 1, threshold) }), target.app_id || null, target.app_redirect || null, now, new Date(Date.now() + TEN_MINUTES).toISOString()).run();
    setPrivateCookie(c, TICKET_COOKIE, ticket);
    await log(c, 'oauth_register_attempt', true, null, { provider });
    return c.redirect('/welcomenewuser');
  }

  app.get('/api/github/login', (c) => begin(c, 'github'));
  app.get('/api/github/callback', (c) => callback(c, 'github'));
  app.get('/api/google/login', (c) => begin(c, 'google'));
  app.get('/api/google/callback', (c) => callback(c, 'google'));

  app.get('/api/auth/oauth/pending', async (c) => {
    const pending = await lookupPending(c);
    if (!pending) return c.json({ ok: false, message: 'This sign-in has expired.' }, 410);
    const { row, profile } = pending;
    const adminEmail = oauthEmail(c.env.ADMIN_EMAIL);
    const owner: any = adminEmail === profile.email
      ? { uuid: 'admin', status: 'active' }
      : await c.env.DB.prepare('SELECT uuid, status FROM users WHERE lower(email) = ?').bind(profile.email).first();
    const open = await setting(c, 'external_registration_enabled', true) !== false && publicRegistrationOpen(c);
    const current = await deps.currentSession(c);
    const bindCurrentWithoutEmail = !!current?.user && current.payload.uuid !== 'admin' && !current.user.email && !owner;
    const decision = bindCurrentWithoutEmail ? 'link_existing' : oauthDecision({ linked: false, status: null, emailOwnerStatus: owner?.status || null, externalOpen: open, emailDomainAllowed: allowedEmailDomain(c, profile.email) });
    return c.json({ ok: true, provider: profile.provider, email: profile.email, name: profile.name,
      avatar_url: profile.avatar_url, decision, require_turnstile: decision === 'new_account' && !!profile.challenge,
      site_key: c.env.TURNSTILE_SITE_KEY || '', can_bind: !!current && (current.payload.uuid === owner?.uuid || bindCurrentWithoutEmail),
      expires_at: row.expires_at });
  });

  app.post('/api/auth/oauth/cancel', async (c) => {
    const pending = await lookupPending(c);
    if (pending) await c.env.DB.prepare('UPDATE oauth_pending SET consumed_at = ? WHERE ticket_hash = ? AND consumed_at IS NULL')
      .bind(new Date().toISOString(), pending.row.ticket_hash).run();
    clearCookie(c, TICKET_COOKIE);
    return c.json({ ok: true });
  });

  app.post('/api/auth/oauth/complete', async (c) => {
    const pending = await lookupPending(c);
    if (!pending) return c.json({ ok: false, message: 'This sign-in has expired.' }, 410);
    const body: any = await c.req.json().catch(() => ({}));
    const { row, profile } = pending;
    const target = await safeTarget(c, row.app_id || undefined, row.redirect_uri || undefined);
    if (!target) return c.json({ ok: false, message: 'Invalid application callback.' }, 400);
    const adminEmail = oauthEmail(c.env.ADMIN_EMAIL);
    const owner: any = adminEmail === profile.email
      ? { uuid: 'admin', status: 'active', email: adminEmail }
      : await c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?').bind(profile.email).first();
    const existing = await linkedUser(c, profile);
    if (existing) return c.json({ ok: false, message: 'This account is already linked. Sign in again.' }, 409);
    const current = await deps.currentSession(c);
    const now = new Date().toISOString();
    if (owner || (current && !current.user?.email)) {
      if ((owner && (owner.status !== 'active' || current?.payload.uuid !== owner.uuid))
        || (!owner && (!current || current.payload.uuid === 'admin' || current.user?.email))) {
        return c.json({ ok: false, message: 'Sign in to the existing account before linking.' }, 403);
      }
      const uuid = owner?.uuid || current.user.uuid;
      try {
        const statements = [
          c.env.DB.prepare('UPDATE oauth_pending SET consumed_at = ? WHERE ticket_hash = ? AND consumed_at IS NULL AND expires_at > ?').bind(now, row.ticket_hash, now),
          c.env.DB.prepare('INSERT INTO oauth_identities (provider, provider_subject, user_uuid, provider_email, provider_username, linked_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(profile.provider, profile.subject, uuid, profile.email, profile.username, now),
        ];
        if (uuid !== 'admin') {
          statements.push(c.env.DB.prepare('UPDATE users SET email = COALESCE(email, ?), email_verified = CASE WHEN email IS NULL THEN 1 ELSE email_verified END, updated_at = ? WHERE uuid = ?').bind(profile.email, now, uuid));
        }
        await c.env.DB.batch(statements);
      } catch { return c.json({ ok: false, message: 'Unable to link this sign-in method.' }, 409); }
      clearCookie(c, TICKET_COOKIE);
      await log(c, 'oauth_link_success', true, uuid, { provider: profile.provider });
      const user = uuid === 'admin' ? await linkedUser(c, profile) : await c.env.DB.prepare('SELECT * FROM users WHERE uuid = ?').bind(uuid).first();
      const noticeEmail = user?.email || profile.email;
      if (noticeEmail) await enqueueEmail(c, noticeEmail, 'oauth_linked', { username: user?.username || 'there', provider: profile.provider, action_url: `${c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin}/account/security`, expire_minutes: 0 }).catch(() => null);
      return deps.finishLogin(c, user, target, profile.provider, true);
    }
    const externalOpen = await setting(c, 'external_registration_enabled', true) !== false;
    if (!externalOpen || !publicRegistrationOpen(c)) return c.json({ ok: false, message: 'External registration is closed.' }, 403);
    if (!allowedEmailDomain(c, profile.email)) return c.json({ ok: false, message: 'This email domain is not supported.' }, 400);
    if (profile.challenge) {
      const form = new FormData();
      form.set('secret', String(c.env.TURNSTILE_SECRET_KEY || ''));
      form.set('response', String(body.turnstile_token || ''));
      form.set('remoteip', c.req.header('CF-Connecting-IP') || '');
      const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
      const answer: any = await check.json().catch(() => ({}));
      if (!answer.success) return c.json({ ok: false, message: 'Turnstile verification failed.' }, 400);
    }
    const ip = await hashIp(c);
    const limits = [
      ['global_registrations_day', 'global', 86400000, envNumber(c, 'MAX_GLOBAL_REGISTRATIONS_PER_DAY', 100)],
      ['ip_registrations_hour', ip, 3600000, envNumber(c, 'MAX_REGISTRATIONS_PER_IP_PER_HOUR', 3)],
      ['ip_registrations_day', ip, 86400000, envNumber(c, 'MAX_REGISTRATIONS_PER_IP_PER_DAY', 5)],
    ] as const;
    for (const [type, key, ms, max] of limits) {
      if (await counter(c, type, key, ms, max) === null) return c.json({ ok: false, message: 'Too many registrations. Please try later.' }, 429);
    }
    const config: any = await setting(c, 'default_registration_config', { cookie_expiry_days: 7, permissions: [] });
    const expiryDays = Math.max(1, Math.min(30, Number(config.cookie_expiry_days) || 7));
    const uuid = crypto.randomUUID();
    const salt = generateSalt();
    const unavailablePassword = await hashPassword(randomSecret(), salt);
    const avatarKey = await importAvatar(c, uuid, profile.avatar_url, profile.provider);
    const base = (safeOAuthName(profile.username).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'member');
    let username = base;
    for (let i = 0; i < 5; i++) {
      const used = await c.env.DB.prepare('SELECT uuid FROM users WHERE lower(username) = ?').bind(username).first();
      if (!used) break;
      username = `${base}_${crypto.randomUUID().slice(0, 6)}`;
    }
    const permissions = Array.isArray(config.permissions) ? config.permissions : [];
    const statements: any[] = [
      c.env.DB.prepare('UPDATE oauth_pending SET consumed_at = ? WHERE ticket_hash = ? AND consumed_at IS NULL AND expires_at > ?').bind(now, row.ticket_hash, now),
      c.env.DB.prepare(`INSERT INTO users (id, uuid, username, name, email, email_verified, role, status, auth_provider, password_hash, password_salt, cookie_expiry_days, birthday, avatar_key, avatar_original_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 'user', 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(uuid, uuid, username, safeOAuthName(profile.name) || 'Member', profile.email, profile.provider, unavailablePassword, salt, expiryDays, profile.birthday, avatarKey, avatarKey, now, now),
      c.env.DB.prepare('INSERT INTO oauth_identities (provider, provider_subject, user_uuid, provider_email, provider_username, linked_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(profile.provider, profile.subject, uuid, profile.email, profile.username, now),
      c.env.DB.prepare('INSERT INTO registration_events (id, user_uuid, channel, source, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), uuid, profile.provider, 'external', now),
    ];
    const seen = new Set<string>();
    for (const permission of permissions) {
      const appId = String(permission.app_id || '');
      if (!appId || seen.has(appId)) continue;
      seen.add(appId);
      const app: any = await c.env.DB.prepare("SELECT app_id FROM apps WHERE app_id = ? AND status = 'active'").bind(appId).first();
      if (!app) continue;
      const num = (value: any) => value == null || value === '' ? null : Math.max(0, Number(value) || 0);
      statements.push(c.env.DB.prepare(`INSERT INTO user_apps (uuid, app_id, rpm_limit, rpd_limit, daily_token_limit, last_reset_date)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(uuid, appId, num(permission.rpm_limit), num(permission.rpd_limit), num(permission.daily_token_limit), now.slice(0, 10)));
    }
    try { await c.env.DB.batch(statements); }
    catch (error: any) {
      if (avatarKey) await c.env.AVATAR_BUCKET.delete(avatarKey).catch(() => null);
      await log(c, 'oauth_register_failed', false, null, { provider: profile.provider, reason: 'database_conflict' });
      if (/users\.email/i.test(String(error))) return c.json({ ok: false, message: 'This email is already in use.' }, 409);
      return c.json({ ok: false, message: 'Registration failed. Please try again.' }, 409);
    }
    clearCookie(c, TICKET_COOKIE);
    await log(c, 'oauth_register_success', true, uuid, { provider: profile.provider });
    const user = await c.env.DB.prepare('SELECT * FROM users WHERE uuid = ?').bind(uuid).first();
    await enqueueEmail(c, profile.email, 'welcome', { username, email: profile.email, action_url: `${c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin}/login` }).catch(() => null);
    return deps.finishLogin(c, user, target, profile.provider, true);
  });
}

export async function cleanupOAuthFlow(env: any) {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM oauth_pending WHERE expires_at <= ?').bind(now),
  ]);
}
