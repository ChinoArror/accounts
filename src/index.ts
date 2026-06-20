import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { cors } from 'hono/cors';
import { hashPassword, generateSalt, verifyPassword, generateJWT, verifyJWT } from './auth';
import { getCookie, setCookie } from 'hono/cookie';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { registerEmailAuthFeature } from './emailAuthFeature';

type D1Database = any;
type AnalyticsEngineDataset = any;
type Fetcher = any;
type R2Bucket = any;

type RegisterCodePermission = {
  app_id: string;
  rpm_limit: number | null;
  rpd_limit: number | null;
  daily_token_limit: number | null;
};

type RegisterCodeConfig = {
  cookie_expiry_days: number;
  permissions: RegisterCodePermission[];
};

type Bindings = {
  DB: D1Database;
  ANALYTICS: AnalyticsEngineDataset;
  ASSETS: Fetcher;
  AVATAR_BUCKET: R2Bucket;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ADMIN_GITHUB_ID: string;
  ADMIN_EMAIL?: string;
  APP_NAME?: string;
  PUBLIC_BASE_URL?: string;
  JWT_ISSUER?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  PASSWORD_PEPPER?: string;
  EMAIL_FROM?: string;
  EMAIL?: any;
  REGISTRATION_MODE?: string;
  REGISTRATION_START_AT?: string;
  REGISTRATION_END_AT?: string;
  ALLOWED_EMAIL_DOMAINS?: string;
  BLOCKED_EMAIL_DOMAINS?: string;
  MAX_GLOBAL_REGISTRATIONS_PER_DAY?: string;
  MAX_REGISTRATIONS_PER_IP_PER_HOUR?: string;
  MAX_REGISTRATIONS_PER_IP_PER_DAY?: string;
  MAX_VERIFY_EMAILS_PER_EMAIL_PER_DAY?: string;
  ACCESS_TOKEN_TTL_SECONDS?: string;
  REFRESH_TOKEN_TTL_SECONDS?: string;
  NEAR_LIMIT_THRESHOLD?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

function getClientIp(c: any) {
  return c.req.header('CF-Connecting-IP')
    || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
    || null;
}

async function sha256Hex(input: string | null | undefined) {
  const bytes = new TextEncoder().encode(String(input || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function detectClientEnvironment(userAgent: string) {
  let deviceType = 'Desktop';
  if (/Mobile|Android|iP(hone|od|ad)/i.test(userAgent)) {
    deviceType = 'Mobile';
  } else if (/Tablet|iPad/i.test(userAgent)) {
    deviceType = 'Tablet';
  }

  let browser = 'Other';
  if (/Edg/i.test(userAgent)) browser = 'Edge';
  else if (/Chrome/i.test(userAgent)) browser = 'Chrome';
  else if (/Safari/i.test(userAgent)) browser = 'Safari';
  else if (/Firefox/i.test(userAgent)) browser = 'Firefox';

  return { deviceType, browser };
}

async function persistUserSession(c: any, user: any, sessionId: string, expiresAt: string, appId: string | null = null) {
  const userAgent = c.req.header('User-Agent') || '';
  const { browser, deviceType } = detectClientEnvironment(userAgent);
  const ipAddress = getClientIp(c);

  await c.env.DB.prepare(`
    INSERT INTO user_sessions (
      session_id, uuid, username, ip_address, user_agent, browser, device_type, app_id, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    sessionId,
    user.uuid,
    user.username,
    ipAddress,
    userAgent,
    browser,
    deviceType,
    appId || 'auth-center',
    expiresAt
  ).run();
}

function setUserSessionCookie(c: any, token: string, maxAgeSeconds: number) {
  setCookie(c, 'sso_session', token, {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: maxAgeSeconds
  });
}

function sanitizeRedirectPath(input: unknown, fallback: string) {
  if (typeof input !== 'string') return fallback;
  if (!input.startsWith('/') || input.startsWith('//')) return fallback;
  return input;
}

function normalizeLoginEmail(input: unknown) {
  const value = String(input || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

function getRequestOrigin(c: any) {
  return c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin;
}

function buildAvatarUrl(c: any, uuid: string, avatarKey?: string | null, legacyAvatarData?: string | null) {
  if (!avatarKey && !legacyAvatarData) return null;
  return `${getRequestOrigin(c)}/api/avatar/${uuid}`;
}

function buildAvatarOriginalUrl(c: any, uuid: string, originalKey?: string | null, avatarKey?: string | null, legacyAvatarData?: string | null) {
  if (!originalKey && !avatarKey && !legacyAvatarData) return null;
  return `${getRequestOrigin(c)}/api/avatar/${uuid}/original`;
}

function getAvatarExtension(contentType: string) {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'bin';
  }
}

function parseAvatarDataUrl(input: string) {
  const match = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Avatar must be a valid image data URL');
  }

  const contentType = match[1].toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(contentType)) {
    throw new Error('Unsupported avatar image type');
  }

  const binary = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  return {
    contentType,
    body: binary,
    extension: getAvatarExtension(contentType),
  };
}

async function deleteAvatarIfPresent(c: any, avatarKey?: string | null) {
  if (!avatarKey) return;
  await c.env.AVATAR_BUCKET.delete(avatarKey).catch(() => { });
}

async function deleteAvatarKeyWithEnv(env: any, avatarKey?: string | null) {
  if (!avatarKey) return;
  await env.AVATAR_BUCKET.delete(avatarKey).catch(() => { });
}

async function cleanupExpiredAvatarDeletes(env: any) {
  if (!env?.DB || !env?.AVATAR_BUCKET) return;
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(`
    SELECT uuid, avatar_pending_delete_key, avatar_original_pending_delete_key
    FROM users
    WHERE avatar_delete_deadline IS NOT NULL AND avatar_delete_deadline <= ?
  `).bind(now).all();

  for (const row of results || []) {
    await deleteAvatarKeyWithEnv(env, row.avatar_pending_delete_key);
    await deleteAvatarKeyWithEnv(env, row.avatar_original_pending_delete_key);
    await env.DB.prepare(`
      UPDATE users
      SET avatar_pending_delete_key = NULL,
          avatar_original_pending_delete_key = NULL,
          avatar_delete_deadline = NULL,
          avatar_restore_token = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE uuid = ?
    `).bind(row.uuid).run();
  }
}

async function putAvatarObject(c: any, uuid: string, kind: 'original' | 'cropped', avatarData: string) {
  const parsed = parseAvatarDataUrl(avatarData);
  const objectKey = `Avatar/${uuid}/${kind}/avatar-${kind}-${Date.now()}.${parsed.extension}`;
  await c.env.AVATAR_BUCKET.put(objectKey, parsed.body, {
    httpMetadata: {
      contentType: parsed.contentType,
      cacheControl: 'public, max-age=86400',
    }
  });
  return objectKey;
}

async function resolveAvatarKeyUpdate(c: any, uuid: string, nextAvatarData: unknown, currentAvatarKey?: string | null) {
  if (nextAvatarData === undefined) {
    return currentAvatarKey || null;
  }

  const normalized = typeof nextAvatarData === 'string' ? nextAvatarData.trim() : '';
  if (!normalized) {
    await deleteAvatarIfPresent(c, currentAvatarKey);
    return null;
  }

  if (!normalized.startsWith('data:image/')) {
    throw new Error('Avatar payload must be an uploaded image');
  }

  const parsed = parseAvatarDataUrl(normalized);
  const objectKey = `Avatar/${uuid}/${Date.now()}.${parsed.extension}`;
  await c.env.AVATAR_BUCKET.put(objectKey, parsed.body, {
    httpMetadata: {
      contentType: parsed.contentType,
      cacheControl: 'public, max-age=86400',
    }
  });
  await deleteAvatarIfPresent(c, currentAvatarKey);
  return objectKey;
}

async function resolveProfileAvatarUpdate(c: any, uuid: string, body: any, currentUser: any) {
  const croppedData = typeof body.avatar_cropped_data === 'string' ? body.avatar_cropped_data.trim() : '';
  const originalData = typeof body.avatar_original_data === 'string' ? body.avatar_original_data.trim() : '';

  if (body.avatar_delete === true) {
    if (!currentUser.avatar_key && !currentUser.avatar_original_key && !currentUser.avatar_data) {
      return {
        avatarKey: null,
        originalKey: null,
        legacyAvatarData: null,
        pendingKey: null,
        pendingOriginalKey: null,
        deleteDeadline: null,
        restoreToken: null,
      };
    }

    return {
      avatarKey: null,
      originalKey: null,
      legacyAvatarData: null,
      pendingKey: currentUser.avatar_key || null,
      pendingOriginalKey: currentUser.avatar_original_key || null,
      deleteDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      restoreToken: crypto.randomUUID() + crypto.randomUUID(),
    };
  }

  if (croppedData) {
    if (!croppedData.startsWith('data:image/')) {
      throw new Error('Avatar crop must be an uploaded image');
    }
    if (originalData && !originalData.startsWith('data:image/')) {
      throw new Error('Avatar original must be an uploaded image');
    }

    const nextOriginalKey = originalData
      ? await putAvatarObject(c, uuid, 'original', originalData)
      : currentUser.avatar_original_key || null;
    const nextAvatarKey = await putAvatarObject(c, uuid, 'cropped', croppedData);

    await deleteAvatarIfPresent(c, currentUser.avatar_key);
    if (currentUser.avatar_original_key && currentUser.avatar_original_key !== currentUser.avatar_key) {
      await deleteAvatarIfPresent(c, currentUser.avatar_original_key);
    }
    await deleteAvatarIfPresent(c, currentUser.avatar_pending_delete_key);
    await deleteAvatarIfPresent(c, currentUser.avatar_original_pending_delete_key);

    return {
      avatarKey: nextAvatarKey,
      originalKey: nextOriginalKey,
      legacyAvatarData: null,
      pendingKey: null,
      pendingOriginalKey: null,
      deleteDeadline: null,
      restoreToken: null,
    };
  }

  if (body.avatar_data !== undefined) {
    const avatarKey = await resolveAvatarKeyUpdate(c, uuid, body.avatar_data, currentUser.avatar_key);
    if (currentUser.avatar_original_key && currentUser.avatar_original_key !== currentUser.avatar_key) {
      await deleteAvatarIfPresent(c, currentUser.avatar_original_key);
    }
    return {
      avatarKey,
      originalKey: null,
      legacyAvatarData: body.avatar_data === undefined ? currentUser.avatar_data : null,
      pendingKey: currentUser.avatar_pending_delete_key || null,
      pendingOriginalKey: currentUser.avatar_original_pending_delete_key || null,
      deleteDeadline: currentUser.avatar_delete_deadline || null,
      restoreToken: currentUser.avatar_restore_token || null,
    };
  }

  return {
    avatarKey: currentUser.avatar_key || null,
    originalKey: currentUser.avatar_original_key || null,
    legacyAvatarData: currentUser.avatar_data || null,
    pendingKey: currentUser.avatar_pending_delete_key || null,
    pendingOriginalKey: currentUser.avatar_original_pending_delete_key || null,
    deleteDeadline: currentUser.avatar_delete_deadline || null,
    restoreToken: currentUser.avatar_restore_token || null,
  };
}

function toUserSummary(c: any, user: any) {
  return {
    user_id: user.user_id,
    id: user.id || user.uuid,
    uuid: user.uuid,
    username: user.username,
    name: user.name,
    email: user.email || null,
    email_verified: !!user.email_verified,
    role: user.role || 'user',
    status: user.status,
    auth_provider: user.auth_provider || 'legacy',
    password_plain: user.password_plain || null,
    cookie_expiry_days: user.cookie_expiry_days,
    created_at: user.created_at,
    updated_at: user.updated_at || null,
    last_login_at: user.last_login_at || null,
    github_id: user.github_id,
    birthday: user.birthday || null,
    avatar_url: buildAvatarUrl(c, user.uuid, user.avatar_key, user.avatar_data),
  };
}

function buildTokenPayload(c: any, user: any, sessionId?: string | null) {
  return {
    sub: user.uuid || user.id || String(user.user_id || ''),
    uuid: user.uuid,
    user_id: user.user_id,
    name: user.name,
    username: user.username,
    email: user.email || null,
    email_verified: !!user.email_verified,
    role: user.role || (user.uuid === 'admin' ? 'admin' : 'user'),
    status: user.status,
    auth_provider: user.auth_provider || (user.uuid === 'admin' ? 'sso' : 'legacy'),
    iat: Math.floor(Date.now() / 1000),
    avatar_url: buildAvatarUrl(c, user.uuid, user.avatar_key, user.avatar_data),
    ...(sessionId ? { session_id: sessionId } : {}),
  };
}

function normalizeLimitValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : null;
}

function parseRegisterCodeConfig(input: any): RegisterCodeConfig {
  const cookieExpiry = normalizeLimitValue(input?.cookie_expiry_days) ?? 7;
  const permissions = Array.isArray(input?.permissions)
    ? input.permissions
      .map((permission: any) => ({
        app_id: String(permission?.app_id || '').trim(),
        rpm_limit: normalizeLimitValue(permission?.rpm_limit),
        rpd_limit: normalizeLimitValue(permission?.rpd_limit),
        daily_token_limit: normalizeLimitValue(permission?.daily_token_limit),
      }))
      .filter((permission: RegisterCodePermission) => permission.app_id)
    : [];

  return {
    cookie_expiry_days: Math.max(1, cookieExpiry),
    permissions,
  };
}

async function applyRegisterCodeConfigToUser(c: any, uuid: string, config: RegisterCodeConfig) {
  const today = new Date().toISOString().split('T')[0];

  for (const permission of config.permissions) {
    await c.env.DB.prepare(`
      INSERT INTO user_apps (uuid, app_id, rpm_limit, rpd_limit, daily_token_limit, last_reset_date)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(uuid, app_id) DO UPDATE SET
        rpm_limit = excluded.rpm_limit,
        rpd_limit = excluded.rpd_limit,
        daily_token_limit = excluded.daily_token_limit,
        last_reset_date = excluded.last_reset_date
    `).bind(
      uuid,
      permission.app_id,
      permission.rpm_limit,
      permission.rpd_limit,
      permission.daily_token_limit,
      today
    ).run();
  }
}

async function revokeSession(c: any, sessionId: string) {
  await c.env.DB.prepare(
    'UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_id = ? AND revoked_at IS NULL'
  ).bind(sessionId).run();
}

async function authenticateCookieSession(c: any, allowAdmin = false) {
  const token = getCookie(c, 'sso_session');
  if (!token) return null;

  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET);

    if (payload.uuid === 'admin') {
      return allowAdmin ? { token, payload, session: null } : null;
    }

    if (!payload.session_id) return null;

    const user: any = await c.env.DB.prepare(
      'SELECT uuid, id, user_id, username, name, email, email_verified, role, status, auth_provider, cookie_expiry_days, birthday, avatar_data, avatar_key, avatar_original_key, avatar_pending_delete_key, avatar_original_pending_delete_key, avatar_delete_deadline, avatar_restore_token FROM users WHERE uuid = ? OR id = ?'
    ).bind(payload.uuid || payload.sub, payload.uuid || payload.sub).first();

    if (!user || !['active', 'pending'].includes(user.status)) return null;

    const session: any = await c.env.DB.prepare(`
      SELECT session_id, uuid, username, login_at, ip_address, browser, device_type, app_id, expires_at, revoked_at
      FROM user_sessions
      WHERE session_id = ?
    `).bind(payload.session_id).first();

    if (!session || session.revoked_at) return null;

    const expiresAtMs = Date.parse(session.expires_at);
    if (!Number.isNaN(expiresAtMs) && expiresAtMs <= Date.now()) {
      await revokeSession(c, payload.session_id);
      return null;
    }

    await c.env.DB.prepare(
      'UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = ?'
    ).bind(payload.session_id).run();

    return { token, payload, user, session };
  } catch {
    return null;
  }
}

// --- Public Routes ---

// Login
app.post('/login', async (c) => {
  const { username, password, app_id } = await c.req.json();
  const identifier = String(username || '').trim();
  const loginEmail = normalizeLoginEmail(identifier);
  if (!identifier || !password) {
    return c.json({ error: 'Username and password required' }, 400);
  }

  let userToAuth: any = null;
  const adminEmail = normalizeLoginEmail(c.env.ADMIN_EMAIL || '');

  if ((identifier === c.env.ADMIN_USERNAME || (!!adminEmail && loginEmail === adminEmail)) && password === c.env.ADMIN_PASSWORD) {
    userToAuth = {
      uuid: 'admin',
      user_id: "0",
      name: 'Admin',
      username: c.env.ADMIN_USERNAME,
      role: 'admin',
      email: c.env.ADMIN_EMAIL || null,
      email_verified: !!c.env.ADMIN_EMAIL,
      auth_provider: 'sso',
      status: 'active',
      cookie_expiry_days: 7
    };
  } else if (identifier === c.env.ADMIN_USERNAME || (!!adminEmail && loginEmail === adminEmail)) {
    return c.json({ error: 'Invalid credentials' }, 401);
  } else {
    const user: any = loginEmail
      ? await c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?').bind(loginEmail).first()
      : await c.env.DB.prepare('SELECT * FROM users WHERE lower(username) = ? OR lower(name) = ? LIMIT 1').bind(identifier.toLowerCase(), identifier.toLowerCase()).first();
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    if (user.status === 'paused') {
      return c.json({ error: 'Account is paused' }, 403);
    }

    const isValid = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!isValid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    userToAuth = user;
  }

  const payload = buildTokenPayload(c, userToAuth);

  let tokenPayload: any = payload;
  if (userToAuth.uuid !== 'admin') {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + userToAuth.cookie_expiry_days * 86400 * 1000).toISOString();
    await persistUserSession(c, userToAuth, sessionId, expiresAt, app_id || 'auth-center');
    tokenPayload = buildTokenPayload(c, userToAuth, sessionId);
  }

  const token = await generateJWT(tokenPayload, c.env.JWT_SECRET, userToAuth.cookie_expiry_days);

  setUserSessionCookie(c, token, userToAuth.cookie_expiry_days * 86400);

  return c.json({
    token: token,
    jwt: token,
    uuid: userToAuth.uuid,
    user_id: userToAuth.user_id,
    name: userToAuth.name,
    username: userToAuth.username,
    avatar_url: buildAvatarUrl(c, userToAuth.uuid, userToAuth.avatar_key, userToAuth.avatar_data),
    timestamp: Math.floor(Date.now() / 1000)
  });
});

app.post('/api/users/login', async (c) => {
  const { username, password, redirect_to } = await c.req.json();
  const identifier = String(username || '').trim();
  const loginEmail = normalizeLoginEmail(identifier);
  if (!identifier || !password) {
    return c.json({ error: 'Username and password required' }, 400);
  }

  if (identifier === c.env.ADMIN_USERNAME || (!!normalizeLoginEmail(c.env.ADMIN_EMAIL || '') && loginEmail === normalizeLoginEmail(c.env.ADMIN_EMAIL || ''))) {
    return c.json({ error: 'Admin accounts must use the admin login' }, 403);
  }

  const user: any = loginEmail
    ? await c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?').bind(loginEmail).first()
    : await c.env.DB.prepare('SELECT * FROM users WHERE lower(username) = ? OR lower(name) = ? LIMIT 1').bind(identifier.toLowerCase(), identifier.toLowerCase()).first();
  if (!user) return c.json({ error: 'Invalid credentials' }, 401);
  if (user.status === 'paused') return c.json({ error: 'Account is paused' }, 403);

  const isValid = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!isValid) return c.json({ error: 'Invalid credentials' }, 401);

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + user.cookie_expiry_days * 86400 * 1000).toISOString();
  await persistUserSession(c, user, sessionId, expiresAt, 'user-portal');

  const token = await generateJWT(
    buildTokenPayload(c, user, sessionId) as any,
    c.env.JWT_SECRET,
    user.cookie_expiry_days
  );

  setUserSessionCookie(c, token, user.cookie_expiry_days * 86400);

  return c.json({
    success: true,
    uuid: user.uuid,
    username: user.username,
    avatar_url: buildAvatarUrl(c, user.uuid, user.avatar_key, user.avatar_data),
    redirect_to: sanitizeRedirectPath(redirect_to, `/${user.uuid}`)
  });
});

app.post('/api/register', async (c) => {
  const { username, password, name, birthday, register_code, avatar_data } = await c.req.json();

  if (!username || !password || !name || !register_code) {
    return c.json({ error: 'Username, password, full name, and register code are required' }, 400);
  }

  if (username === c.env.ADMIN_USERNAME) {
    return c.json({ error: 'This username is reserved' }, 400);
  }
  if (/admin/i.test(username) || /admin/i.test(name || '')) {
    return c.json({ error: 'Username and full name cannot contain admin' }, 400);
  }

  const existingUser: any = await c.env.DB.prepare('SELECT uuid FROM users WHERE username = ?').bind(username).first();
  if (existingUser) {
    return c.json({ error: 'Username already exists' }, 409);
  }

  const registerCodeRecord: any = await c.env.DB.prepare(`
    SELECT code, config_json, status
    FROM register_codes
    WHERE code = ?
  `).bind(register_code).first();

  if (!registerCodeRecord) return c.json({ error: 'Register code not found' }, 404);
  if (registerCodeRecord.status === 'pause') return c.json({ error: 'Register code is paused' }, 403);
  if (registerCodeRecord.status === 'used') return c.json({ error: 'Register code has already been used' }, 409);
  if (registerCodeRecord.status !== 'unused') return c.json({ error: 'Register code is unavailable' }, 403);

  let config: RegisterCodeConfig;
  try {
    config = parseRegisterCodeConfig(JSON.parse(registerCodeRecord.config_json));
  } catch {
    return c.json({ error: 'Register code configuration is invalid' }, 500);
  }

  const uuid = crypto.randomUUID();
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  let avatarKey: string | null = null;

  try {
    avatarKey = await resolveAvatarKeyUpdate(c, uuid, avatar_data, null);
    await c.env.DB.prepare(`
      INSERT INTO users (
        id, uuid, username, name, role, status, auth_provider, email_verified, password_hash, password_salt, password_plain, cookie_expiry_days, birthday, avatar_data, avatar_key, updated_at
      ) VALUES (?, ?, ?, ?, 'user', 'active', 'code', 0, ?, ?, NULL, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      uuid,
      uuid,
      username,
      name,
      hash,
      salt,
      config.cookie_expiry_days,
      birthday || null,
      null,
      avatarKey
    ).run();

    await applyRegisterCodeConfigToUser(c, uuid, config);

    const claimResult: any = await c.env.DB.prepare(`
      UPDATE register_codes
      SET status = 'used', used_by_uuid = ?, used_by_username = ?, used_at = CURRENT_TIMESTAMP
      WHERE code = ? AND status = 'unused'
    `).bind(uuid, username, register_code).run();

    if (!claimResult?.meta?.changes) {
      throw new Error('Register code is no longer available');
    }

    return c.json({
      success: true,
      uuid,
      username,
      redirect_to: '/users/',
    });
  } catch (e: any) {
    await deleteAvatarIfPresent(c, avatarKey);
    await c.env.DB.prepare('DELETE FROM user_apps WHERE uuid = ?').bind(uuid).run().catch(() => { });
    await c.env.DB.prepare('DELETE FROM users WHERE uuid = ?').bind(uuid).run().catch(() => { });
    return c.json({ error: e.message || 'Registration failed' }, 400);
  }
});

// Logout
app.post('/api/logout', async (c) => {
  const activeSession = await authenticateCookieSession(c, true);
  if (activeSession?.payload?.session_id) {
    await revokeSession(c, activeSession.payload.session_id);
  }
  setCookie(c, 'sso_session', '', { path: '/', maxAge: 0, secure: true, httpOnly: true, sameSite: 'Lax' });
  setCookie(c, 'auth_refresh', '', { path: '/', maxAge: 0, secure: true, httpOnly: true, sameSite: 'Lax' });
  return c.json({ success: true });
});

app.get('/logout', async (c) => {
  const activeSession = await authenticateCookieSession(c, true);
  if (activeSession?.payload?.session_id) {
    await revokeSession(c, activeSession.payload.session_id);
  }
  setCookie(c, 'sso_session', '', { path: '/', maxAge: 0, secure: true, httpOnly: true, sameSite: 'Lax' });
  setCookie(c, 'auth_refresh', '', { path: '/', maxAge: 0, secure: true, httpOnly: true, sameSite: 'Lax' });
  const redirect = c.req.query('redirect');
  if (redirect) return c.redirect(redirect);
  return c.json({ success: true, message: 'Logged out successfully' });
});

// Check Active SSO Session
app.get('/api/session', async (c) => {
  const activeSession = await authenticateCookieSession(c, true);
  if (!activeSession) return c.json({ active: false }, 401);
  return c.json({ active: true, user: activeSession.payload, token: activeSession.token });
});

app.get('/api/user/session', async (c) => {
  const activeSession = await authenticateCookieSession(c);
  if (!activeSession) return c.json({ error: 'Authentication required' }, 401);

  return c.json({
    session_id: activeSession.payload.session_id,
    uuid: activeSession.user.uuid,
    username: activeSession.user.username,
    name: activeSession.user.name,
    email: activeSession.user.email || null,
    email_verified: !!activeSession.user.email_verified,
    role: activeSession.user.role || 'user',
    auth_provider: activeSession.user.auth_provider || 'legacy',
    birthday: activeSession.user.birthday || null,
    avatar_url: buildAvatarUrl(c, activeSession.user.uuid, activeSession.user.avatar_key, activeSession.user.avatar_data),
    avatar_original_url: buildAvatarOriginalUrl(c, activeSession.user.uuid, activeSession.user.avatar_original_key, activeSession.user.avatar_key, activeSession.user.avatar_data),
    exp: activeSession.payload.exp,
    session: activeSession.session
  });
});

app.get('/api/avatar/:uuid/original', async (c) => {
  const uuid = c.req.param('uuid');
  const user: any = await c.env.DB.prepare(
    'SELECT avatar_original_key, avatar_key, avatar_data FROM users WHERE uuid = ?'
  ).bind(uuid).first();

  if (!user) return c.json({ error: 'User not found' }, 404);

  const key = user.avatar_original_key || user.avatar_key;
  if (key) {
    const object = await c.env.AVATAR_BUCKET.get(key);
    if (!object) return c.json({ error: 'Avatar not found' }, 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', headers.get('cache-control') || 'public, max-age=86400');
    return new Response(object.body, { headers });
  }

  if (typeof user.avatar_data === 'string' && user.avatar_data.startsWith('data:image/')) {
    const parsed = parseAvatarDataUrl(user.avatar_data);
    return new Response(parsed.body, {
      headers: {
        'content-type': parsed.contentType,
        'cache-control': 'public, max-age=86400',
      }
    });
  }

  return c.json({ error: 'Avatar not found' }, 404);
});

app.get('/api/avatar/:uuid', async (c) => {
  const uuid = c.req.param('uuid');
  const user: any = await c.env.DB.prepare(
    'SELECT avatar_key, avatar_data FROM users WHERE uuid = ?'
  ).bind(uuid).first();

  if (!user) return c.json({ error: 'User not found' }, 404);

  if (user.avatar_key) {
    const object = await c.env.AVATAR_BUCKET.get(user.avatar_key);
    if (!object) return c.json({ error: 'Avatar not found' }, 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', headers.get('cache-control') || 'public, max-age=86400');
    return new Response(object.body, { headers });
  }

  if (typeof user.avatar_data === 'string' && user.avatar_data.startsWith('data:image/')) {
    const parsed = parseAvatarDataUrl(user.avatar_data);
    return new Response(parsed.body, {
      headers: {
        'content-type': parsed.contentType,
        'cache-control': 'public, max-age=86400',
      }
    });
  }

  return c.json({ error: 'Avatar not found' }, 404);
});

app.post('/api/user/bind-token', async (c) => {
  const activeSession = await authenticateCookieSession(c);
  if (!activeSession) return c.json({ error: 'Authentication required' }, 401);

  const bindToken = await generateJWT({ action: 'bind', uuid: activeSession.user.uuid }, c.env.JWT_SECRET, 1 / 24);
  return c.json({ success: true, bind_token: bindToken, uuid: activeSession.user.uuid });
});

app.post('/api/user/change-password', async (c) => {
  const activeSession = await authenticateCookieSession(c);
  if (!activeSession) return c.json({ error: 'Authentication required' }, 401);

  const { newPassword } = await c.req.json();
  if (!newPassword || String(newPassword).trim().length < 1) {
    return c.json({ error: 'New password is required' }, 400);
  }

  const newSalt = generateSalt();
  const newHash = await hashPassword(newPassword, newSalt);

  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ?, password_salt = ?, password_plain = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?'
  ).bind(newHash, newSalt, newPassword, activeSession.user.uuid).run();
  await c.env.DB.prepare('DELETE FROM user_credentials WHERE user_id = ?').bind(activeSession.user.uuid).run().catch(() => null);

  return c.json({ success: true });
});

app.put('/api/user/profile', async (c) => {
  const activeSession = await authenticateCookieSession(c);
  if (!activeSession) return c.json({ error: 'Authentication required' }, 401);

  const body = await c.req.json();
  const { name, birthday } = body;
  if (!name || !String(name).trim()) {
    return c.json({ error: 'Full name is required' }, 400);
  }

  try {
    const avatarUpdate = await resolveProfileAvatarUpdate(c, activeSession.user.uuid, body, activeSession.user);
    await c.env.DB.prepare(
      `UPDATE users
       SET name = ?,
           birthday = ?,
           avatar_key = ?,
           avatar_original_key = ?,
           avatar_data = ?,
           avatar_pending_delete_key = ?,
           avatar_original_pending_delete_key = ?,
           avatar_delete_deadline = ?,
           avatar_restore_token = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE uuid = ?`
    ).bind(
      String(name).trim(),
      birthday ? String(birthday).trim() : null,
      avatarUpdate.avatarKey,
      avatarUpdate.originalKey,
      avatarUpdate.legacyAvatarData,
      avatarUpdate.pendingKey,
      avatarUpdate.pendingOriginalKey,
      avatarUpdate.deleteDeadline,
      avatarUpdate.restoreToken,
      activeSession.user.uuid
    ).run();

    const updatedUser: any = await c.env.DB.prepare(
      'SELECT uuid, user_id, username, name, status, cookie_expiry_days, birthday, avatar_data, avatar_key, avatar_original_key, avatar_delete_deadline, avatar_restore_token FROM users WHERE uuid = ?'
    ).bind(activeSession.user.uuid).first();

    return c.json({
      success: true,
      user: {
        uuid: updatedUser.uuid,
        username: updatedUser.username,
        name: updatedUser.name,
        birthday: updatedUser.birthday || null,
        avatar_url: buildAvatarUrl(c, updatedUser.uuid, updatedUser.avatar_key, updatedUser.avatar_data),
        avatar_original_url: buildAvatarOriginalUrl(c, updatedUser.uuid, updatedUser.avatar_original_key, updatedUser.avatar_key, updatedUser.avatar_data),
        avatar_delete_deadline: updatedUser.avatar_delete_deadline || null,
        avatar_restore_token: updatedUser.avatar_restore_token || null,
      }
    });
  } catch (e: any) {
    return c.json({ error: e.message || 'Unable to update profile' }, 400);
  }
});

app.post('/api/user/avatar/restore', async (c) => {
  const activeSession = await authenticateCookieSession(c);
  if (!activeSession) return c.json({ error: 'Authentication required' }, 401);

  const { restore_token } = await c.req.json().catch(() => ({}));
  const token = String(restore_token || '').trim();
  if (!token) return c.json({ error: 'Restore token is required' }, 400);

  const user: any = await c.env.DB.prepare(`
    SELECT uuid, avatar_pending_delete_key, avatar_original_pending_delete_key, avatar_delete_deadline, avatar_restore_token
    FROM users
    WHERE uuid = ?
  `).bind(activeSession.user.uuid).first();

  if (!user || user.avatar_restore_token !== token || !user.avatar_delete_deadline || Date.parse(user.avatar_delete_deadline) <= Date.now()) {
    await cleanupExpiredAvatarDeletes(c.env);
    return c.json({ error: 'Restore window has expired' }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE users
    SET avatar_key = ?,
        avatar_original_key = ?,
        avatar_pending_delete_key = NULL,
        avatar_original_pending_delete_key = NULL,
        avatar_delete_deadline = NULL,
        avatar_restore_token = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE uuid = ?
  `).bind(user.avatar_pending_delete_key, user.avatar_original_pending_delete_key, activeSession.user.uuid).run();

  const updatedUser: any = await c.env.DB.prepare(
    'SELECT uuid, avatar_data, avatar_key, avatar_original_key FROM users WHERE uuid = ?'
  ).bind(activeSession.user.uuid).first();

  return c.json({
    success: true,
    user: {
      avatar_url: buildAvatarUrl(c, updatedUser.uuid, updatedUser.avatar_key, updatedUser.avatar_data),
      avatar_original_url: buildAvatarOriginalUrl(c, updatedUser.uuid, updatedUser.avatar_original_key, updatedUser.avatar_key, updatedUser.avatar_data),
      avatar_delete_deadline: null,
      avatar_restore_token: null,
    }
  });
});

app.get('/api/user/sessions', async (c) => {
  const activeSession = await authenticateCookieSession(c);
  if (!activeSession) return c.json({ error: 'Authentication required' }, 401);

  const { results } = await c.env.DB.prepare(`
    SELECT session_id, login_at, ip_address, browser, device_type, app_id, expires_at, revoked_at
    FROM user_sessions
    WHERE uuid = ?
    ORDER BY login_at DESC
  `).bind(activeSession.user.uuid).all();

  return c.json({
    current_session_id: activeSession.payload.session_id,
    sessions: results
  });
});

app.delete('/api/user/sessions/:sessionId', async (c) => {
  const activeSession = await authenticateCookieSession(c);
  if (!activeSession) return c.json({ error: 'Authentication required' }, 401);

  const sessionId = c.req.param('sessionId');
  const session: any = await c.env.DB.prepare(
    'SELECT session_id FROM user_sessions WHERE session_id = ? AND uuid = ?'
  ).bind(sessionId, activeSession.user.uuid).first();

  if (!session) return c.json({ error: 'Session not found' }, 404);

  await revokeSession(c, sessionId);
  if (sessionId === activeSession.payload.session_id) {
    setCookie(c, 'sso_session', '', { path: '/', maxAge: 0, secure: true, httpOnly: true, sameSite: 'Lax' });
  }

  return c.json({ success: true, revoked_current: sessionId === activeSession.payload.session_id });
});

// Verify Token & App Permission
app.get('/api/verify', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid token' }, 401);
  }

  const token = authHeader.split(' ')[1];
  const appId = c.req.query('app_id');

  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET);

    if (payload.uuid === 'admin') {
      return c.json({ valid: true, user: payload });
    }

    // Check if user is active in DB (crucial for pause/continue)
    const user: any = await c.env.DB.prepare('SELECT status FROM users WHERE uuid = ?').bind(payload.uuid).first();
    if (!user || user.status !== 'active') {
      return c.json({ error: 'User is paused or not found' }, 403);
    }

    // Check app permission if app_id is provided
    if (appId) {
      const permission = await c.env.DB.prepare('SELECT * FROM user_apps WHERE uuid = ? AND app_id = ? AND COALESCE(enabled, 1) = 1')
        .bind(payload.uuid, appId).first();
      if (!permission) {
        return c.json({ error: 'No permission for this app' }, 403);
      }
    }

    return c.json({ valid: true, user: payload });
  } catch (e) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
});

// Quota Check
app.get('/api/quota/check', async (c) => {
  const uuid = c.req.query('uuid');
  const appId = c.req.query('app_id');
  const authHeader = c.req.header('Authorization');
  const secret = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!uuid || !appId || !secret) return c.json({ error: 'Missing uuid, app_id or secret' }, 400);

  const appRecord: any = await c.env.DB.prepare('SELECT secret_key, use_agent_limit FROM apps WHERE app_id = ?').bind(appId).first();
  if (!appRecord || appRecord.secret_key !== secret) return c.json({ error: 'Unauthorized' }, 401);

  if (!appRecord.use_agent_limit) {
    return c.json({ valid: true, unlimited: true, remaining_tokens: null, remaining_requests: null });
  }

  // Admin always has unlimited quota — skip all checks
  if (uuid === 'admin') {
    return c.json({ valid: true, unlimited: true, remaining_tokens: null, remaining_requests: null });
  }

  const quota: any = await c.env.DB.prepare('SELECT * FROM user_apps WHERE uuid = ? AND app_id = ? AND COALESCE(enabled, 1) = 1').bind(uuid, appId).first();
  if (!quota) return c.json({ error: 'Permission denied' }, 403);

  // If no quota is configured at all, deny by default (admin must set limits first)
  if (quota.rpm_limit == null && quota.rpd_limit == null && quota.daily_token_limit == null) {
    return c.json({ error: '请设置用量限制' }, 403);
  }

  const today = new Date().toISOString().split('T')[0];
  if (quota.last_reset_date !== today) {
    await c.env.DB.prepare('UPDATE user_apps SET used_tokens_today = 0, used_requests_today = 0, last_reset_date = ? WHERE uuid = ? AND app_id = ?').bind(today, uuid, appId).run();
    quota.used_tokens_today = 0;
    quota.used_requests_today = 0;
  }

  // Block only when quota is fully exhausted (>= limit).
  // The consume endpoint never blocks, so in-flight requests always complete
  // even if they push usage slightly past the limit.
  if (quota.daily_token_limit && quota.used_tokens_today >= quota.daily_token_limit) {
    return c.json({ error: 'Token limit exceeded' }, 429);
  }
  if (quota.rpd_limit && quota.used_requests_today >= quota.rpd_limit) {
    return c.json({ error: 'Daily request limit exceeded' }, 429);
  }

  const remaining_tokens = quota.daily_token_limit
    ? Math.max(0, quota.daily_token_limit - quota.used_tokens_today)
    : null;
  const remaining_requests = quota.rpd_limit
    ? Math.max(0, quota.rpd_limit - quota.used_requests_today)
    : null;

  return c.json({ valid: true, quota, remaining_tokens, remaining_requests });
});


// Quota Consume
app.post('/api/quota/consume', async (c) => {
  const { uuid, app_id, tokens = 0 } = await c.req.json();
  const authHeader = c.req.header('Authorization');
  const secret = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!uuid || !app_id || !secret) return c.json({ error: 'Missing fields' }, 400);

  const appRecord: any = await c.env.DB.prepare('SELECT secret_key, use_agent_limit FROM apps WHERE app_id = ?').bind(app_id).first();
  if (!appRecord || appRecord.secret_key !== secret) return c.json({ error: 'Unauthorized' }, 401);

  if (!appRecord.use_agent_limit) {
    return c.json({ success: true });
  }

  await c.env.DB.prepare('UPDATE user_apps SET used_tokens_today = used_tokens_today + ?, used_requests_today = used_requests_today + 1 WHERE uuid = ? AND app_id = ?').bind(tokens, uuid, app_id).run();

  c.env.ANALYTICS.writeDataPoint({
    blobs: [app_id, uuid, 'quota_consume', 'Unknown', 'Unknown', 'Unknown'],
    doubles: [tokens],
    indexes: [app_id]
  });

  return c.json({ success: true });
});

// Track Analytics
app.post('/api/track', async (c) => {
  const { app_id, uuid, event_type, duration_seconds } = await c.req.json();

  if (!app_id || !uuid || !event_type) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const country = (c.req.raw as any).cf?.country || 'Unknown';
  const userAgent = c.req.header('User-Agent') || '';
  const { deviceType, browser } = detectClientEnvironment(userAgent);

  // Write to Analytics Engine
  c.env.ANALYTICS.writeDataPoint({
    blobs: [app_id, uuid, event_type, country as string, deviceType, browser],
    doubles: [duration_seconds || 0],
    indexes: [app_id]
  });

  return c.json({ success: true });
});

// Self-service password change
app.post('/api/users/:uuid/change-password', async (c) => {
  const uuid = c.req.param('uuid');
  const { oldPassword, newPassword } = await c.req.json();

  const user: any = await c.env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE uuid = ?').bind(uuid).first();
  if (!user) return c.json({ error: 'User not found' }, 404);

  const isValid = await verifyPassword(oldPassword, user.password_salt, user.password_hash);
  if (!isValid) return c.json({ error: 'Incorrect original password' }, 401);

  const newSalt = generateSalt();
  const newHash = await hashPassword(newPassword, newSalt);

  await c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, password_plain = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?').bind(newHash, newSalt, newPassword, uuid).run();
  await c.env.DB.prepare('DELETE FROM user_credentials WHERE user_id = ?').bind(uuid).run().catch(() => null);

  return c.json({ success: true });
});

// Verify Password for SSO Binding
app.post('/api/users/:uuid/verify-password', async (c) => {
  const uuid = c.req.param('uuid');
  const { password } = await c.req.json();

  if (uuid === 'admin') {
    if (password === c.env.ADMIN_PASSWORD) {
      const token = await generateJWT({ action: 'bind', uuid }, c.env.JWT_SECRET, 1 / 24);
      return c.json({ success: true, bind_token: token });
    } else {
      return c.json({ error: 'Incorrect password' }, 401);
    }
  }

  const user: any = await c.env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE uuid = ?').bind(uuid).first();
  if (!user) return c.json({ error: 'User not found' }, 404);

  const isValid = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!isValid) return c.json({ error: 'Incorrect password' }, 401);

  const token = await generateJWT({ action: 'bind', uuid }, c.env.JWT_SECRET, 1 / 24); // 1 hour validity
  return c.json({ success: true, bind_token: token });
});

// GitHub Login
app.get('/api/github/login', async (c) => {
  const admin_uuid = c.req.query('admin_bind');
  const bind_token = c.req.query('bind_token');
  const app_redirect = c.req.query('app_redirect');
  const app_id = c.req.query('app_id');

  let statePayload: any = { action: 'login' };

  if (app_redirect && app_id) {
    statePayload = { action: 'sso_login', app_redirect, app_id };
  }

  if (admin_uuid === 'admin') {
    statePayload = { action: 'bind', uuid: 'admin' };
  } else if (bind_token) {
    try {
      const payload = await verifyJWT(bind_token, c.env.JWT_SECRET);
      if (payload.action === 'bind') {
        statePayload = { action: 'bind', uuid: payload.uuid };
      }
    } catch (e) {
      return c.text('Invalid bind token', 400);
    }
  }

  const state = await generateJWT(statePayload, c.env.JWT_SECRET, 1);
  const redirect_uri = `${new URL(c.req.url).origin}/api/github/callback`;

  const githubUrl = `https://github.com/login/oauth/authorize?client_id=${c.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect_uri)}&state=${state}`;
  return c.redirect(githubUrl);
});

// GitHub Callback
app.get('/api/github/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) return c.text('Missing code or state', 400);

  let statePayload: any;
  try {
    statePayload = await verifyJWT(state, c.env.JWT_SECRET);
  } catch (e) {
    return c.text('Invalid state', 400);
  }

  const redirect_uri = `${new URL(c.req.url).origin}/api/github/callback`;

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri
    })
  });

  const tokenData: any = await tokenResponse.json();
  if (tokenData.error) return c.text(`GitHub Error: ${tokenData.error_description}`, 400);

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'User-Agent': 'cloudflare-worker'
    }
  });

  const userData: any = await userResponse.json();
  const githubId = userData.id.toString();

  if (statePayload.action === 'bind') {
    if (statePayload.uuid === 'admin') {
      return c.html(`
        <html><body style="background:#0B0F19;color:white;font-family:sans-serif;padding:40px;text-align:center;">
          <h2>Admin GitHub Bound Locally</h2>
          <p>Your GitHub ID is <strong style="color:#4ade80;font-size:24px;">${githubId}</strong>.</p>
          <p>Please add <code>ADMIN_GITHUB_ID = "${githubId}"</code> to your <code>wrangler.toml</code> or Cloudflare environment variables.</p>
          <button onclick="window.close()" style="margin-top:20px;padding:10px 20px;background:#9333ea;color:white;border:none;border-radius:10px;cursor:pointer;">Close</button>
        </body></html>
      `);
    } else {
      await c.env.DB.prepare('UPDATE users SET github_id = ? WHERE uuid = ?').bind(githubId, statePayload.uuid).run();
      return c.html(`
        <html><body style="background:#0B0F19;color:white;font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#4ade80;">GitHub Bound Successfully</h2>
          <p>You can now use GitHub to log in.</p>
          <button onclick="window.close()" style="margin-top:20px;padding:10px 20px;background:#9333ea;color:white;border:none;border-radius:10px;cursor:pointer;">Close Window</button>
        </body></html>
      `);
    }
  } else if (statePayload.action === 'login' || statePayload.action === 'sso_login') {
    let userToAuth: any = null;

    if (githubId === c.env.ADMIN_GITHUB_ID) {
      userToAuth = {
        uuid: 'admin',
        user_id: "0",
        name: 'Admin',
        username: c.env.ADMIN_USERNAME,
        role: 'admin',
        email: c.env.ADMIN_EMAIL || null,
        email_verified: !!c.env.ADMIN_EMAIL,
        auth_provider: 'sso',
        status: 'active',
        cookie_expiry_days: 7
      };
    } else {
      const user: any = await c.env.DB.prepare('SELECT * FROM users WHERE github_id = ?').bind(githubId).first();
      if (!user) {
        return c.redirect('/?error=github_not_bound');
      }
      if (user.status === 'paused') return c.redirect('/?error=account_paused');
      userToAuth = user;
    }

    const payload = buildTokenPayload(c, userToAuth);
    let tokenPayload: any = payload;
    if (userToAuth.uuid !== 'admin') {
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + userToAuth.cookie_expiry_days * 86400 * 1000).toISOString();
      await persistUserSession(
        c,
        userToAuth,
        sessionId,
        expiresAt,
        statePayload.action === 'sso_login' ? statePayload.app_id : 'auth-center'
      );
      tokenPayload = buildTokenPayload(c, userToAuth, sessionId);
    }

    const jwtToken = await generateJWT(tokenPayload, c.env.JWT_SECRET, userToAuth.cookie_expiry_days);

    if (statePayload.action === 'sso_login') {
      const appId = statePayload.app_id;
      const redirect = statePayload.app_redirect;

      if (userToAuth.uuid !== 'admin') {
        const permission = await c.env.DB.prepare('SELECT * FROM user_apps WHERE uuid = ? AND app_id = ? AND COALESCE(enabled, 1) = 1').bind(userToAuth.uuid, appId).first();
        if (!permission) {
          return c.redirect('/?error=no_permission');
        }
      }

      await fetch(`${new URL(c.req.url).origin}/api/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, uuid: userToAuth.uuid, event_type: 'login_success', duration_seconds: 0 })
      }).catch(() => { });

      setUserSessionCookie(c, jwtToken, userToAuth.cookie_expiry_days * 86400);

      return c.html(`
        <html><body>
          <script>
            window.location.href = '${redirect}${redirect.includes('?') ? '&' : '?'}token=${jwtToken}';
          </script>
        </body></html>
      `);
    }

    setUserSessionCookie(c, jwtToken, userToAuth.cookie_expiry_days * 86400);

    const isAdmin = userToAuth.uuid === 'admin' || userToAuth.role === 'admin';
    const targetPath = isAdmin ? '/dash' : `/user/${userToAuth.uuid}`;
    const adminStorage = isAdmin
      ? `localStorage.setItem('sso_admin_auth', 'Bearer ${jwtToken}'); localStorage.setItem('sso_admin_name', ${JSON.stringify(userToAuth.name || 'Admin')});`
      : `localStorage.removeItem('sso_admin_auth');`;
    return c.html(`
      <html><body>
        <script>
          ${adminStorage}
          window.location.href = '${targetPath}';
        </script>
      </body></html>
    `);
  }

  return c.text('Unknown action', 400);
});

// --- Passkeys API (WebAuthn) ---

const rpName = 'Auth Center SSO';

app.post('/api/passkey/generate-registration-options', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ error: 'Missing token' }, 401);
  const token = authHeader.split(' ')[1];

  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    if (payload.action !== 'bind') return c.json({ error: 'Invalid token action' }, 403);
    const uuid = payload.uuid;

    const { results } = await c.env.DB.prepare('SELECT credential_id FROM passkeys WHERE uuid = ?').bind(uuid).all();
    const existingCredentials = results.map((row: any) => ({
      id: row.credential_id,
      type: 'public-key' as const,
      transports: ['internal', 'usb', 'ble', 'nfc'] as any[],
    }));

    let username = uuid;
    if (uuid === 'admin') {
      username = c.env.ADMIN_USERNAME;
    } else {
      const user: any = await c.env.DB.prepare('SELECT username FROM users WHERE uuid = ?').bind(uuid).first();
      if (user) username = user.username;
    }

    const rpID = new URL(c.req.url).hostname;
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(uuid),
      userName: username,
      attestationType: 'none',
      excludeCredentials: existingCredentials,
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });

    const challengeToken = await generateJWT({ challenge: options.challenge, uuid }, c.env.JWT_SECRET, 1 / 24);
    setCookie(c, 'passkey_reg_challenge', challengeToken, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });

    return c.json(options);
  } catch (e) {
    return c.json({ error: 'Authentication failed' }, 401);
  }
});

app.post('/api/passkey/verify-registration', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ error: 'Missing token' }, 401);
  const bindToken = authHeader.split(' ')[1];
  const challengeToken = getCookie(c, 'passkey_reg_challenge');
  if (!challengeToken) return c.json({ error: 'Missing challenge' }, 400);

  try {
    const payload = await verifyJWT(bindToken, c.env.JWT_SECRET);
    if (payload.action !== 'bind') return c.json({ error: 'Invalid token action' }, 403);
    const uuid = payload.uuid;

    const challengePayload = await verifyJWT(challengeToken, c.env.JWT_SECRET);
    if (challengePayload.uuid !== uuid) return c.json({ error: 'Challenge mismatch' }, 400);

    const body = await c.req.json();
    const rpID = new URL(c.req.url).hostname;
    const origin = new URL(c.req.url).origin;

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengePayload.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      const passkeyId = crypto.randomUUID();
      // Encoding to base64url equivalent string handling via buffer/uint8array is generally done internally
      // But we will turn them to pure strings. Uint8Array.
      // Or just use Buffer.from(credentialID).toString('base64url') - this requires base64url helper
      const b64CredentialId = body.id; // Already base64url encoded credential id natively by client
      const b64PublicKey = isoBase64URL.fromBuffer(credential.publicKey);

      await c.env.DB.prepare(
        'INSERT INTO passkeys (id, uuid, credential_id, public_key, counter) VALUES (?, ?, ?, ?, ?)'
      ).bind(passkeyId, uuid, b64CredentialId, b64PublicKey, credential.counter).run();

      setCookie(c, 'passkey_reg_challenge', '', { maxAge: 0, path: '/' });
      return c.json({ verified: true });
    }
  } catch (e: any) {
    return c.json({ error: e.message || 'Verification failed' }, 400);
  }
  return c.json({ error: 'Failed' }, 400);
});

app.get('/api/passkey/:uuid/list', async (c) => {
  const uuid = c.req.param('uuid');
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ error: 'Missing token' }, 401);
  const token = authHeader.split(' ')[1];
  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    if (payload.action !== 'bind' || payload.uuid !== uuid) return c.json({ error: 'Unauthorized' }, 403);
    const { results } = await c.env.DB.prepare('SELECT id, name, created_at FROM passkeys WHERE uuid = ?').bind(uuid).all();
    return c.json(results);
  } catch (e) { return c.json({ error: 'Invalid token' }, 401); }
});

app.put('/api/passkey/:uuid/:id', async (c) => {
  const uuid = c.req.param('uuid');
  const pid = c.req.param('id');
  const { name } = await c.req.json();
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.split(' ')[1] || '';
  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    if (payload.action !== 'bind' || payload.uuid !== uuid) return c.json({ error: 'Unauthorized' }, 403);
    await c.env.DB.prepare('UPDATE passkeys SET name = ? WHERE id = ? AND uuid = ?').bind(name, pid, uuid).run();
    return c.json({ success: true });
  } catch (e) { return c.json({ error: 'Unauthorized' }, 401); }
});

app.delete('/api/passkey/:uuid/:id', async (c) => {
  const uuid = c.req.param('uuid');
  const pid = c.req.param('id');
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.split(' ')[1] || '';
  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    if (payload.action !== 'bind' || payload.uuid !== uuid) return c.json({ error: 'Unauthorized' }, 403);
    await c.env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND uuid = ?').bind(pid, uuid).run();
    return c.json({ success: true });
  } catch (e) { return c.json({ error: 'Unauthorized' }, 401); }
});

app.get('/api/passkey/admin/list', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.split(' ')[1] || '';
  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    if (payload.action !== 'bind' || payload.uuid !== 'admin') return c.json({ error: 'Unauthorized' }, 403);
    const { results } = await c.env.DB.prepare('SELECT id, name, created_at FROM passkeys WHERE uuid = ?').bind('admin').all();
    return c.json(results);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
});

app.put('/api/passkey/admin/:id', async (c) => {
  const pid = c.req.param('id');
  const { name } = await c.req.json();
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.split(' ')[1] || '';
  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    if (payload.action !== 'bind' || payload.uuid !== 'admin') return c.json({ error: 'Unauthorized' }, 403);
    await c.env.DB.prepare('UPDATE passkeys SET name = ? WHERE id = ? AND uuid = ?').bind(name, pid, 'admin').run();
    return c.json({ success: true });
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
});

app.delete('/api/passkey/admin/:id', async (c) => {
  const pid = c.req.param('id');
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.split(' ')[1] || '';
  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    if (payload.action !== 'bind' || payload.uuid !== 'admin') return c.json({ error: 'Unauthorized' }, 403);
    await c.env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND uuid = ?').bind(pid, 'admin').run();
    return c.json({ success: true });
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
});

app.get('/api/passkey/generate-authentication-options', async (c) => {
  const rpID = new URL(c.req.url).hostname;
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
  });
  const challengeToken = await generateJWT({ challenge: options.challenge }, c.env.JWT_SECRET, 1 / 24);
  setCookie(c, 'passkey_login_challenge', challengeToken, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
  return c.json(options);
});

import { isoBase64URL } from '@simplewebauthn/server/helpers';

app.post('/api/passkey/verify-authentication', async (c) => {
  const challengeToken = getCookie(c, 'passkey_login_challenge');
  if (!challengeToken) return c.json({ error: 'Missing challenge' }, 400);

  const appId = c.req.query('app_id');
  const appRedirect = c.req.query('app_redirect');

  try {
    const challengePayload = await verifyJWT(challengeToken, c.env.JWT_SECRET);
    const body = await c.req.json();

    const rpID = new URL(c.req.url).hostname;
    const origin = new URL(c.req.url).origin;

    const b64CredentialId = body.id;
    const passkeyRecord: any = await c.env.DB.prepare('SELECT uuid, credential_id, public_key, counter FROM passkeys WHERE credential_id = ?').bind(b64CredentialId).first();

    if (!passkeyRecord) return c.json({ error: 'Passkey not found' }, 404);

    const credential = {
      publicKey: isoBase64URL.toBuffer(passkeyRecord.public_key),
      id: passkeyRecord.credential_id,
      counter: passkeyRecord.counter,
    };

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challengePayload.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential,
      requireUserVerification: false,
    });


    if (verification.verified && verification.authenticationInfo) {
      await c.env.DB.prepare('UPDATE passkeys SET counter = ? WHERE credential_id = ?').bind(verification.authenticationInfo.newCounter, passkeyRecord.credential_id).run();

      const uuid = passkeyRecord.uuid;
      let userToAuth: any = null;

      if (uuid === 'admin') {
        userToAuth = {
        uuid: 'admin', user_id: "0", name: 'Admin', username: c.env.ADMIN_USERNAME,
          role: 'admin', email: c.env.ADMIN_EMAIL || null, email_verified: !!c.env.ADMIN_EMAIL, auth_provider: 'sso',
          status: 'active', cookie_expiry_days: 7
        };
      } else {
        const user: any = await c.env.DB.prepare('SELECT * FROM users WHERE uuid = ?').bind(uuid).first();
        if (!user || user.status === 'paused') {
          return c.json({ error: 'User omitted or paused' }, 403);
        }
        userToAuth = user;

        if (appId) {
          const permission = await c.env.DB.prepare('SELECT * FROM user_apps WHERE uuid = ? AND app_id = ? AND COALESCE(enabled, 1) = 1').bind(uuid, appId).first();
          if (!permission) return c.json({ error: 'No permission for this app' }, 403);
        }
      }

      const payload = buildTokenPayload(c, userToAuth);
      let tokenPayload: any = payload;
      if (userToAuth.uuid !== 'admin') {
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + userToAuth.cookie_expiry_days * 86400 * 1000).toISOString();
        await persistUserSession(c, userToAuth, sessionId, expiresAt, appId || 'auth-center');
        tokenPayload = buildTokenPayload(c, userToAuth, sessionId);
      }

      const jwtToken = await generateJWT(tokenPayload, c.env.JWT_SECRET, userToAuth.cookie_expiry_days);

      if (appId && appRedirect) {
        setCookie(c, 'passkey_login_challenge', '', { maxAge: 0, path: '/' });
        setUserSessionCookie(c, jwtToken, userToAuth.cookie_expiry_days * 86400);
        return c.json({ verified: true, token: jwtToken });
      } else {
        setUserSessionCookie(c, jwtToken, userToAuth.cookie_expiry_days * 86400);
        setCookie(c, 'passkey_login_challenge', '', { maxAge: 0, path: '/' });
        return c.json({ verified: true, token: jwtToken });
      }
    }
  } catch (e: any) {
    return c.json({ error: e.message || 'Verification failed' }, 400);
  }
  return c.json({ error: 'Failed' }, 400);
});

registerEmailAuthFeature(app);

// --- Admin Routes ---

async function adminAuthGuard(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const payload = await verifyJWT(token, c.env.JWT_SECRET);
      if (payload.role === 'admin') {
        return next();
      }
    } catch (e) { }
  }

  const auth = basicAuth({
    username: c.env.ADMIN_USERNAME,
    password: c.env.ADMIN_PASSWORD,
  });
  return auth(c, next);
}

// Apply admin auth to all admin routes. New code must use role=admin for JWTs.
app.use('/admin/*', adminAuthGuard);
app.use('/api/admin/*', adminAuthGuard);

app.post('/admin/bind-token', async (c) => {
  const bindToken = await generateJWT({ action: 'bind', uuid: 'admin' }, c.env.JWT_SECRET, 1 / 24);
  return c.json({ success: true, bind_token: bindToken });
});

app.get('/admin/register-codes', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT code, template_name, config_json, status, used_by_uuid, used_by_username, used_at, created_at
    FROM register_codes
    ORDER BY created_at DESC
  `).all();
  return c.json(results);
});

app.post('/admin/register-codes/batch', async (c) => {
  const body = await c.req.json();
  const count = Math.max(1, Math.min(500, Number(body?.count) || 1));
  const templateName = String(body?.template_name || '').trim() || null;
  const config = parseRegisterCodeConfig(body);
  const configJson = JSON.stringify(config);
  const generatedCodes: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const code = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO register_codes (code, template_name, config_json, status)
      VALUES (?, ?, ?, 'unused')
    `).bind(code, templateName, configJson).run();
    generatedCodes.push(code);
  }

  return c.json({ success: true, codes: generatedCodes });
});

app.post('/admin/register-codes/bulk-action', async (c) => {
  const { codes, action } = await c.req.json();
  const list = Array.isArray(codes) ? codes.map((code) => String(code)).filter(Boolean) : [];
  if (!list.length) return c.json({ error: 'No register codes selected' }, 400);

  const placeholders = list.map(() => '?').join(', ');

  if (action === 'delete') {
    await c.env.DB.prepare(`DELETE FROM register_codes WHERE code IN (${placeholders})`).bind(...list).run();
    return c.json({ success: true, action, count: list.length });
  }

  if (action === 'pause') {
    await c.env.DB.prepare(`
      UPDATE register_codes
      SET status = 'pause'
      WHERE code IN (${placeholders}) AND status = 'unused'
    `).bind(...list).run();
    return c.json({ success: true, action, count: list.length });
  }

  if (action === 'continue') {
    await c.env.DB.prepare(`
      UPDATE register_codes
      SET status = 'unused'
      WHERE code IN (${placeholders}) AND status = 'pause'
    `).bind(...list).run();
    return c.json({ success: true, action, count: list.length });
  }

  return c.json({ error: 'Unsupported action' }, 400);
});

// Users CRUD
app.get('/admin/users', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT user_id, id, uuid, username, name, email, email_verified, role, status, auth_provider, password_plain, cookie_expiry_days, created_at, updated_at, last_login_at, github_id, birthday, avatar_data, avatar_key FROM users'
  ).all();
  return c.json((results || []).map((user: any) => toUserSummary(c, user)));
});

app.post('/admin/users', async (c) => {
  const { username, name, password, cookie_expiry_days = 7, birthday = null, avatar_data = null } = await c.req.json();
  const uuid = crypto.randomUUID();
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  let avatarKey: string | null = null;

  try {
    avatarKey = await resolveAvatarKeyUpdate(c, uuid, avatar_data, null);
    await c.env.DB.prepare(
      "INSERT INTO users (id, uuid, username, name, role, status, auth_provider, email_verified, password_hash, password_salt, password_plain, cookie_expiry_days, birthday, avatar_data, avatar_key, updated_at) VALUES (?, ?, ?, ?, 'user', 'active', 'sso', 0, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
    ).bind(uuid, uuid, username, name, hash, salt, password, cookie_expiry_days, birthday, null, avatarKey).run();
    return c.json({ success: true, uuid });
  } catch (e: any) {
    await deleteAvatarIfPresent(c, avatarKey);
    return c.json({ error: e.message }, 400);
  }
});

app.put('/admin/users/:uuid', async (c) => {
  const uuid = c.req.param('uuid');
  const { name, username, cookie_expiry_days, birthday, avatar_data } = await c.req.json();
  try {
    const currentUser: any = await c.env.DB.prepare(
      'SELECT avatar_key, avatar_data, birthday FROM users WHERE uuid = ?'
    ).bind(uuid).first();
    if (!currentUser) return c.json({ error: 'User not found' }, 404);

    const avatarKey = await resolveAvatarKeyUpdate(c, uuid, avatar_data, currentUser.avatar_key);
    await c.env.DB.prepare(
      'UPDATE users SET name = ?, username = ?, cookie_expiry_days = ?, birthday = ?, avatar_key = ?, avatar_data = ? WHERE uuid = ?'
    ).bind(
      name,
      username,
      cookie_expiry_days,
      birthday === undefined ? currentUser.birthday : (birthday || null),
      avatarKey,
      avatar_data === undefined ? currentUser.avatar_data : null,
      uuid
    ).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.put('/admin/users/:uuid/password', async (c) => {
  const uuid = c.req.param('uuid');
  const { password } = await c.req.json();
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ?, password_salt = ?, password_plain = ?, updated_at = CURRENT_TIMESTAMP WHERE uuid = ?'
  ).bind(hash, salt, password, uuid).run();
  await c.env.DB.prepare('DELETE FROM user_credentials WHERE user_id = ?').bind(uuid).run().catch(() => null);
  return c.json({ success: true });
});

app.delete('/admin/users/:uuid', async (c) => {
  const uuid = c.req.param('uuid');
  const user: any = await c.env.DB.prepare('SELECT avatar_key FROM users WHERE uuid = ?').bind(uuid).first();
  await deleteAvatarIfPresent(c, user?.avatar_key);
  await c.env.DB.prepare('DELETE FROM users WHERE uuid = ?').bind(uuid).run();
  await c.env.DB.prepare('DELETE FROM passkeys WHERE uuid = ?').bind(uuid).run();
  return c.json({ success: true });
});

// Pause / Continue
app.post('/admin/users/:uuid/pause', async (c) => {
  const uuid = c.req.param('uuid');
  await c.env.DB.prepare("UPDATE users SET status = 'paused' WHERE uuid = ?").bind(uuid).run();
  return c.json({ success: true, status: 'paused' });
});

app.post('/admin/users/:uuid/continue', async (c) => {
  const uuid = c.req.param('uuid');
  await c.env.DB.prepare("UPDATE users SET status = 'active' WHERE uuid = ?").bind(uuid).run();
  return c.json({ success: true, status: 'active' });
});

// Apps CRUD
app.get('/admin/apps', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM apps').all();
  return c.json(results);
});

app.post('/admin/apps', async (c) => {
  const { app_id, app_name, callback_url, secret_key, use_agent_limit } = await c.req.json();
  try {
    await c.env.DB.prepare(
      'INSERT INTO apps (app_id, app_name, callback_url, secret_key, use_agent_limit) VALUES (?, ?, ?, ?, ?)'
    ).bind(app_id, app_name, callback_url, secret_key, use_agent_limit ? 1 : 0).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.put('/admin/apps/:app_id', async (c) => {
  const appId = c.req.param('app_id');
  const { app_name, callback_url, secret_key, use_agent_limit } = await c.req.json();
  await c.env.DB.prepare(
    'UPDATE apps SET app_name = ?, callback_url = ?, secret_key = ?, use_agent_limit = ? WHERE app_id = ?'
  ).bind(app_name, callback_url, secret_key, use_agent_limit ? 1 : 0, appId).run();
  return c.json({ success: true });
});

app.delete('/admin/apps/:app_id', async (c) => {
  const appId = c.req.param('app_id');
  await c.env.DB.prepare('DELETE FROM apps WHERE app_id = ?').bind(appId).run();
  return c.json({ success: true });
});

function makeAppShortName(app: any) {
  const explicit = String(app.short_name || '').trim();
  if (explicit) return explicit.slice(0, 8);
  const name = String(app.app_name || app.app_id || '').trim();
  const words = name.split(/[\s\-_]+/).filter(Boolean);
  if (words.length > 1) return words.map((word) => word[0]).join('').slice(0, 6).toUpperCase();
  return (name || app.app_id || 'APP').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'APP';
}

function numberOrNull(value: any) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

function permissionPlan(user: any) {
  return `Session ${Number(user.cookie_expiry_days || 7)}d`;
}

function quotaPairs(permission: any) {
  return [
    { type: 'Daily requests', used: Number(permission?.used_requests_today || 0), limit: numberOrNull(permission?.rpd_limit), reset_period: 'daily' },
    { type: 'Daily tokens', used: Number(permission?.used_tokens_today || 0), limit: numberOrNull(permission?.daily_token_limit), reset_period: 'daily' },
    { type: 'Requests / minute', used: null, limit: numberOrNull(permission?.rpm_limit), reset_period: 'minute' },
  ];
}

function computePermissionCell(user: any, app: any, permission: any, threshold = 0.9) {
  const enabled = !!permission && Number(permission.enabled ?? 1) !== 0;
  const quotas = quotaPairs(permission || {});
  const finiteQuotas = quotas.filter((quota) => quota.limit !== null && quota.limit > 0 && quota.used !== null);
  const maxPercent = finiteQuotas.reduce((max, quota) => Math.max(max, Number(quota.used) / Number(quota.limit)), 0);
  const exceeded = finiteQuotas.some((quota) => Number(quota.used) >= Number(quota.limit));
  const nearLimit = !exceeded && maxPercent >= threshold;
  const hasOverride = !!permission && [
    permission.rpm_limit,
    permission.rpd_limit,
    permission.daily_token_limit,
  ].some((value) => value !== null && value !== undefined && value !== '');

  let status = 'off';
  let label = 'OFF';
  if (user.status !== 'active' || (app.status || 'active') !== 'active') {
    status = 'disabled';
    label = '禁用';
  } else if (!enabled) {
    status = 'off';
    label = 'OFF';
  } else if (exceeded) {
    status = 'exceeded';
    label = '超额';
  } else if (nearLimit) {
    status = 'near_limit';
    label = `${Math.round(maxPercent * 100)}%`;
  } else if (hasOverride) {
    status = 'override';
    label = 'ON*';
  } else {
    status = 'on';
    label = 'ON';
  }

  return {
    user_id: user.uuid,
    app_id: app.app_id,
    enabled,
    exists: !!permission,
    status,
    label,
    percent: Math.round(maxPercent * 100),
    role_in_app: permission?.role_in_app || 'user',
    quota_source: hasOverride ? 'User Override' : permission ? permission.quota_source || 'Default' : 'None',
    has_override: hasOverride,
    quotas,
    raw: permission || null,
  };
}

async function permissionAudit(c: any, action: string, detail: Record<string, unknown>, success = true) {
  await c.env.DB.prepare(`
    INSERT INTO auth_audit_logs (id, user_id, event_type, ip_hash, user_agent, success, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    crypto.randomUUID(),
    'admin',
    action,
    await sha256Hex(getClientIp(c)),
    c.req.header('User-Agent') || '',
    success ? 1 : 0,
    JSON.stringify(detail)
  ).run().catch(() => null);
}

async function loadPermissionMatrixData(c: any) {
  const usersResult = await c.env.DB.prepare(`
    SELECT uuid, id, user_id, username, name, email, role, status, cookie_expiry_days, created_at, updated_at, last_login_at
    FROM users
    ORDER BY created_at DESC
  `).all();
  const appsResult = await c.env.DB.prepare(`
    SELECT app_id, app_name, callback_url, use_agent_limit, created_at,
           COALESCE(short_name, '') AS short_name,
           COALESCE(app_group, '未分组') AS app_group,
           COALESCE(status, 'active') AS status
    FROM apps
    ORDER BY app_name ASC
  `).all();
  const permissionsResult = await c.env.DB.prepare(`
    SELECT uuid, app_id, created_at, rpm_limit, rpd_limit, daily_token_limit,
           used_tokens_today, used_requests_today, last_reset_date,
           COALESCE(enabled, 1) AS enabled,
           COALESCE(role_in_app, 'user') AS role_in_app,
           COALESCE(quota_source, 'default') AS quota_source,
           override_reason,
           updated_at
    FROM user_apps
  `).all();

  const users = (usersResult.results || []).map((user: any) => ({
    ...user,
    plan: permissionPlan(user),
  }));
  const apps = (appsResult.results || []).map((app: any) => ({
    ...app,
    short_name: makeAppShortName(app),
    app_group: app.app_group || '未分组',
    status: app.status || 'active',
  }));
  const permissions = permissionsResult.results || [];
  return { users, apps, permissions };
}

async function buildPermissionMatrix(c: any) {
  const { users, apps, permissions } = await loadPermissionMatrixData(c);
  const threshold = Math.max(0.1, Math.min(1, Number(c.env.NEAR_LIMIT_THRESHOLD || 0.9)));
  const userSearch = String(c.req.query('user_search') || '').trim().toLowerCase();
  const appSearch = String(c.req.query('app_search') || '').trim().toLowerCase();
  const role = String(c.req.query('role') || 'all');
  const plan = String(c.req.query('plan') || 'all');
  const statusFilter = String(c.req.query('status') || 'all');
  const appGroup = String(c.req.query('app_group') || 'all');

  const filteredUsersBase = users.filter((user: any) => {
    const matchesSearch = !userSearch || [user.username, user.name, user.email, user.uuid].some((value) => String(value || '').toLowerCase().includes(userSearch));
    const matchesRole = role === 'all' || user.role === role;
    const matchesPlan = plan === 'all' || user.plan === plan;
    return matchesSearch && matchesRole && matchesPlan;
  });
  const filteredAppsBase = apps.filter((app: any) => {
    const matchesSearch = !appSearch || [app.app_id, app.app_name, app.short_name].some((value) => String(value || '').toLowerCase().includes(appSearch));
    const matchesGroup = appGroup === 'all' || app.app_group === appGroup;
    return matchesSearch && matchesGroup;
  });

  const permissionMap = new Map<string, any>();
  permissions.forEach((permission: any) => permissionMap.set(`${permission.uuid}::${permission.app_id}`, permission));

  const allCells: any[] = [];
  filteredUsersBase.forEach((user: any) => {
    filteredAppsBase.forEach((app: any) => {
      allCells.push(computePermissionCell(user, app, permissionMap.get(`${user.uuid}::${app.app_id}`), threshold));
    });
  });

  const statusMatches = (cell: any) => statusFilter === 'all'
    || (statusFilter === 'enabled' && ['on', 'override', 'near_limit', 'exceeded'].includes(cell.status))
    || (statusFilter === 'off' && cell.status === 'off')
    || (statusFilter === 'near_limit' && cell.status === 'near_limit')
    || (statusFilter === 'exceeded' && cell.status === 'exceeded')
    || (statusFilter === 'override' && cell.status === 'override')
    || (statusFilter === 'disabled' && cell.status === 'disabled');

  const visibleCellKeys = new Set(allCells.filter(statusMatches).map((cell) => `${cell.user_id}::${cell.app_id}`));
  const visibleUserIds = statusFilter === 'all'
    ? new Set(filteredUsersBase.map((user: any) => user.uuid))
    : new Set(Array.from(visibleCellKeys).map((key) => String(key).split('::')[0]));
  const visibleAppIds = statusFilter === 'all'
    ? new Set(filteredAppsBase.map((app: any) => app.app_id))
    : new Set(Array.from(visibleCellKeys).map((key) => String(key).split('::')[1]));

  const visibleUsers = filteredUsersBase.filter((user: any) => visibleUserIds.has(user.uuid));
  const visibleApps = filteredAppsBase.filter((app: any) => visibleAppIds.has(app.app_id));
  const matrix = visibleUsers.map((user: any) => ({
    user_id: user.uuid,
    cells: visibleApps.map((app: any) => computePermissionCell(user, app, permissionMap.get(`${user.uuid}::${app.app_id}`), threshold)),
  }));
  const visibleCells = matrix.flatMap((row: any) => row.cells);

  return {
    summary: {
      users: visibleUsers.length,
      apps: visibleApps.length,
      enabledRelations: visibleCells.filter((cell: any) => ['on', 'override', 'near_limit', 'exceeded'].includes(cell.status)).length,
      nearLimit: visibleCells.filter((cell: any) => cell.status === 'near_limit').length,
      exceeded: visibleCells.filter((cell: any) => cell.status === 'exceeded').length,
    },
    filters: {
      roles: Array.from(new Set(users.map((user: any) => user.role || 'user'))),
      plans: Array.from(new Set(users.map((user: any) => user.plan))),
      app_groups: Array.from(new Set(apps.map((app: any) => app.app_group || '未分组'))),
      statuses: ['all', 'enabled', 'off', 'near_limit', 'exceeded', 'override', 'disabled'],
    },
    users: visibleUsers,
    apps: visibleApps,
    matrix,
  };
}

app.get('/api/admin/permissions/matrix', async (c) => c.json(await buildPermissionMatrix(c)));

app.get('/api/admin/permissions/detail', async (c) => {
  const userId = c.req.query('user_id') || '';
  const appId = c.req.query('app_id') || '';
  if (!userId || !appId) return c.json({ error: 'Missing user_id or app_id' }, 400);
  const { users, apps, permissions } = await loadPermissionMatrixData(c);
  const user = users.find((item: any) => item.uuid === userId || item.id === userId);
  const appRecord = apps.find((item: any) => item.app_id === appId);
  if (!user || !appRecord) return c.json({ error: 'User or app not found' }, 404);
  const permission = permissions.find((item: any) => item.uuid === user.uuid && item.app_id === appRecord.app_id);
  const cell = computePermissionCell(user, appRecord, permission, Number(c.env.NEAR_LIMIT_THRESHOLD || 0.9));
  const logResult = await c.env.DB.prepare(`
    SELECT event_type, success, detail, created_at, user_agent
    FROM auth_audit_logs
    WHERE event_type LIKE 'admin_permission_%'
    ORDER BY created_at DESC
    LIMIT 30
  `).all();
  const logs = (logResult.results || []).filter((log: any) => {
    try {
      const detail = JSON.parse(log.detail || '{}');
      return detail.target_user_id === user.uuid || detail.target_app_id === appRecord.app_id;
    } catch {
      return false;
    }
  });
  return c.json({ user, app: appRecord, permission: cell, logs });
});

app.post('/api/admin/permissions/update', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const userId = String(body.user_id || body.uuid || '').trim();
  const appId = String(body.app_id || '').trim();
  if (!userId || !appId) return c.json({ error: 'Missing user_id or app_id' }, 400);
  const enabled = body.enabled === false || body.enabled === 0 ? 0 : 1;
  const roleInApp = String(body.role_in_app || 'user').trim() || 'user';
  const rpmLimit = numberOrNull(body.rpm_limit);
  const rpdLimit = numberOrNull(body.rpd_limit);
  const dailyTokenLimit = numberOrNull(body.daily_token_limit);
  const hasOverride = [rpmLimit, rpdLimit, dailyTokenLimit].some((value) => value !== null);
  const before: any = await c.env.DB.prepare('SELECT * FROM user_apps WHERE uuid = ? AND app_id = ?').bind(userId, appId).first();
  await c.env.DB.prepare(`
    INSERT INTO user_apps (uuid, app_id, enabled, role_in_app, rpm_limit, rpd_limit, daily_token_limit, quota_source, override_reason, updated_at, last_reset_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, COALESCE((SELECT last_reset_date FROM user_apps WHERE uuid = ? AND app_id = ?), ?))
    ON CONFLICT(uuid, app_id) DO UPDATE SET
      enabled = excluded.enabled,
      role_in_app = excluded.role_in_app,
      rpm_limit = excluded.rpm_limit,
      rpd_limit = excluded.rpd_limit,
      daily_token_limit = excluded.daily_token_limit,
      quota_source = excluded.quota_source,
      override_reason = excluded.override_reason,
      updated_at = CURRENT_TIMESTAMP
  `).bind(userId, appId, enabled, roleInApp, rpmLimit, rpdLimit, dailyTokenLimit, hasOverride ? 'override' : 'default', String(body.override_reason || ''), userId, appId, new Date().toISOString().slice(0, 10)).run();
  const after: any = await c.env.DB.prepare('SELECT * FROM user_apps WHERE uuid = ? AND app_id = ?').bind(userId, appId).first();
  await permissionAudit(c, 'admin_permission_update', { target_user_id: userId, target_app_id: appId, before, after });
  return c.json({ success: true, permission: after });
});

app.post('/api/admin/permissions/bulk-update', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const userIds = Array.isArray(body.user_ids) ? body.user_ids.map(String).filter(Boolean) : [];
  const appIds = Array.isArray(body.app_ids) ? body.app_ids.map(String).filter(Boolean) : [];
  const action = String(body.action || '');
  if (!userIds.length || !appIds.length) return c.json({ error: 'Select at least one user and one app' }, 400);
  if (!['enable', 'disable', 'apply_quota'].includes(action)) return c.json({ error: 'Unsupported bulk action' }, 400);
  const rpmLimit = numberOrNull(body.rpm_limit);
  const rpdLimit = numberOrNull(body.rpd_limit);
  const dailyTokenLimit = numberOrNull(body.daily_token_limit);
  const roleInApp = String(body.role_in_app || 'user').trim() || 'user';
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  for (const userId of userIds) {
    for (const appId of appIds) {
      if (action === 'disable') {
        await c.env.DB.prepare(`
          INSERT INTO user_apps (uuid, app_id, enabled, role_in_app, quota_source, updated_at, last_reset_date)
          VALUES (?, ?, 0, ?, 'default', CURRENT_TIMESTAMP, ?)
          ON CONFLICT(uuid, app_id) DO UPDATE SET enabled = 0, updated_at = CURRENT_TIMESTAMP
        `).bind(userId, appId, roleInApp, today).run();
      } else {
        await c.env.DB.prepare(`
          INSERT INTO user_apps (uuid, app_id, enabled, role_in_app, rpm_limit, rpd_limit, daily_token_limit, quota_source, override_reason, updated_at, last_reset_date)
          VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
          ON CONFLICT(uuid, app_id) DO UPDATE SET
            enabled = 1,
            role_in_app = excluded.role_in_app,
            rpm_limit = CASE WHEN ? THEN excluded.rpm_limit ELSE user_apps.rpm_limit END,
            rpd_limit = CASE WHEN ? THEN excluded.rpd_limit ELSE user_apps.rpd_limit END,
            daily_token_limit = CASE WHEN ? THEN excluded.daily_token_limit ELSE user_apps.daily_token_limit END,
            quota_source = excluded.quota_source,
            override_reason = excluded.override_reason,
            updated_at = CURRENT_TIMESTAMP
        `).bind(
          userId,
          appId,
          roleInApp,
          rpmLimit,
          rpdLimit,
          dailyTokenLimit,
          action === 'apply_quota' ? 'override' : 'default',
          String(body.override_reason || ''),
          today,
          action === 'apply_quota' ? 1 : 0,
          action === 'apply_quota' ? 1 : 0,
          action === 'apply_quota' ? 1 : 0
        ).run();
      }
      count += 1;
    }
  }
  await permissionAudit(c, 'admin_permission_bulk_update', { action, user_ids: userIds, app_ids: appIds, affected: count });
  return c.json({ success: true, affected: count });
});

app.post('/api/admin/permissions/reset-quota', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const userId = String(body.user_id || body.uuid || '').trim();
  const appId = String(body.app_id || '').trim();
  if (!userId || !appId) return c.json({ error: 'Missing user_id or app_id' }, 400);
  const before: any = await c.env.DB.prepare('SELECT * FROM user_apps WHERE uuid = ? AND app_id = ?').bind(userId, appId).first();
  await c.env.DB.prepare(`
    UPDATE user_apps
    SET rpm_limit = NULL, rpd_limit = NULL, daily_token_limit = NULL, quota_source = 'default', override_reason = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE uuid = ? AND app_id = ?
  `).bind(userId, appId).run();
  const after: any = await c.env.DB.prepare('SELECT * FROM user_apps WHERE uuid = ? AND app_id = ?').bind(userId, appId).first();
  await permissionAudit(c, 'admin_permission_reset_quota', { target_user_id: userId, target_app_id: appId, before, after });
  return c.json({ success: true, permission: after });
});

app.get('/api/admin/permissions/anomalies', async (c) => {
  const matrix = await buildPermissionMatrix(c);
  const items: any[] = [];
  matrix.matrix.forEach((row: any) => {
    row.cells.forEach((cell: any) => {
      if (['near_limit', 'exceeded', 'disabled'].includes(cell.status)) {
        const user = matrix.users.find((item: any) => item.uuid === cell.user_id);
        const appRecord = matrix.apps.find((item: any) => item.app_id === cell.app_id);
        items.push({ ...cell, user, app: appRecord });
      }
    });
  });
  return c.json({ items });
});

app.get('/api/admin/permissions/audit-logs', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT user_id AS admin_user_id, event_type AS action, detail, created_at, success, ip_hash, user_agent
    FROM auth_audit_logs
    WHERE event_type LIKE 'admin_permission_%'
    ORDER BY created_at DESC
    LIMIT 100
  `).all();
  return c.json({ logs: results || [] });
});

app.get('/api/admin/permissions/export', async (c) => {
  const matrix = await buildPermissionMatrix(c);
  const rows = [['username', 'email', 'role', 'plan', 'app_id', 'app_name', 'enabled', 'status', 'rpm_limit', 'rpd_limit', 'daily_token_limit', 'used_requests_today', 'used_tokens_today']];
  matrix.matrix.forEach((row: any) => {
    const user = matrix.users.find((item: any) => item.uuid === row.user_id);
    row.cells.forEach((cell: any) => {
      const appRecord = matrix.apps.find((item: any) => item.app_id === cell.app_id);
      rows.push([
        user?.username || '',
        user?.email || '',
        user?.role || '',
        user?.plan || '',
        cell.app_id,
        appRecord?.app_name || '',
        cell.enabled ? 'true' : 'false',
        cell.status,
        cell.raw?.rpm_limit ?? '',
        cell.raw?.rpd_limit ?? '',
        cell.raw?.daily_token_limit ?? '',
        cell.raw?.used_requests_today ?? '',
        cell.raw?.used_tokens_today ?? '',
      ].map((value) => `"${String(value).replace(/"/g, '""')}"`));
    });
  });
  return new Response(rows.map((row) => row.join(',')).join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="permissions.csv"',
    },
  });
});

// Permissions
app.get('/admin/permissions', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM user_apps').all();
  return c.json(results);
});

app.post('/admin/permissions', async (c) => {
  const { uuid, app_id } = await c.req.json();
  try {
    await c.env.DB.prepare(`
      INSERT INTO user_apps (uuid, app_id, enabled, role_in_app, quota_source, updated_at)
      VALUES (?, ?, 1, 'user', 'default', CURRENT_TIMESTAMP)
      ON CONFLICT(uuid, app_id) DO UPDATE SET enabled = 1, updated_at = CURRENT_TIMESTAMP
    `).bind(uuid, app_id).run();
    await permissionAudit(c, 'admin_permission_enable', { target_user_id: uuid, target_app_id: app_id });
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.delete('/admin/permissions', async (c) => {
  const { uuid, app_id } = await c.req.json();
  await c.env.DB.prepare(`
    INSERT INTO user_apps (uuid, app_id, enabled, role_in_app, quota_source, updated_at)
    VALUES (?, ?, 0, 'user', 'default', CURRENT_TIMESTAMP)
    ON CONFLICT(uuid, app_id) DO UPDATE SET enabled = 0, updated_at = CURRENT_TIMESTAMP
  `).bind(uuid, app_id).run();
  await permissionAudit(c, 'admin_permission_disable', { target_user_id: uuid, target_app_id: app_id });
  return c.json({ success: true });
});

app.put('/admin/permissions/quota', async (c) => {
  const { uuid, app_id, rpm_limit, rpd_limit, daily_token_limit } = await c.req.json();
  try {
    await c.env.DB.prepare(`
      INSERT INTO user_apps (uuid, app_id, enabled, role_in_app, rpm_limit, rpd_limit, daily_token_limit, quota_source, updated_at)
      VALUES (?, ?, 1, 'user', ?, ?, ?, 'override', CURRENT_TIMESTAMP)
      ON CONFLICT(uuid, app_id) DO UPDATE SET
        enabled = 1,
        rpm_limit = excluded.rpm_limit,
        rpd_limit = excluded.rpd_limit,
        daily_token_limit = excluded.daily_token_limit,
        quota_source = 'override',
        updated_at = CURRENT_TIMESTAMP
    `).bind(uuid, app_id, rpm_limit || null, rpd_limit || null, daily_token_limit || null).run();
    await permissionAudit(c, 'admin_permission_quota_update', { target_user_id: uuid, target_app_id: app_id, rpm_limit, rpd_limit, daily_token_limit });
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Analytics Stats (GraphQL Proxy)
app.post('/admin/stats/graphql', async (c) => {
  const { query, variables } = await c.req.json();
  const url = `https://api.cloudflare.com/client/v4/graphql`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { accountTag: c.env.CF_ACCOUNT_ID, ...variables } })
  });

  if (!response.ok) {
    const text = await response.text();
    return c.json({ error: 'GraphQL API Error', details: text }, response.status as any);
  }

  const data = await response.json();
  return c.json(data);
});

// Analytics Engine SQL API proxy — used to query quota consumption with blob/double fields
// The Cloudflare GraphQL API does NOT expose blob1/blob2/double1 for custom datasets.
// The SQL API is the correct way to query custom Analytics Engine data.
app.get('/admin/stats/quota', async (c) => {
  const appId = c.req.query('app_id');
  if (!appId) return c.json({ error: 'Missing app_id' }, 400);

  // Build SQL query: group by date (day) and blob2 (user uuid)
  // blob1 = app_id, blob2 = uuid, blob3 = event type, double1 = tokens
  const sql = `
    SELECT
      toDate(timestamp) AS day,
      blob2             AS uuid,
      SUM(double1)      AS total_tokens
    FROM "auth-center"
    WHERE blob1 = '${appId.replace(/'/g, "''")}'
      AND blob3 = 'quota_consume'
      AND timestamp >= now() - INTERVAL '90' DAY
    GROUP BY day, uuid
    ORDER BY day ASC
  `;

  const url = `https://api.cloudflare.com/client/v4/accounts/${c.env.CF_ACCOUNT_ID}/analytics_engine/sql`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.CF_API_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: sql
  });

  if (!response.ok) {
    const text = await response.text();
    return c.json({ error: 'Analytics SQL Error', details: text }, response.status as any);
  }

  const data: any = await response.json();
  return c.json(data);
});

// Analytics Engine SQL API proxy — used to query generic system tracking (App.tsx stats)
app.get('/admin/stats/usage', async (c) => {
  const sql = `
    SELECT
      toDate(timestamp) AS day,
      blob1 AS app_id,
      blob2 AS uuid,
      blob3 AS event_type,
      blob4 AS country,
      blob5 AS device,
      blob6 AS browser,
      SUM(double1) AS total_value,
      COUNT() AS events
    FROM "auth-center"
    WHERE timestamp >= now() - INTERVAL '7' DAY
      AND blob3 IN ('page_view', 'login_success', 'sso_auto_login')
    GROUP BY day, app_id, uuid, event_type, country, device, browser
    ORDER BY day ASC
    LIMIT 10000
  `;

  const url = `https://api.cloudflare.com/client/v4/accounts/${c.env.CF_ACCOUNT_ID}/analytics_engine/sql`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.CF_API_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: sql
  });

  if (!response.ok) {
    const text = await response.text();
    return c.json({ error: 'Analytics SQL Error', details: text }, response.status as any);
  }

  const data: any = await response.json();
  return c.json(data);
});

// Fallback for SPA Routing (React Router)
app.get('*', async (c) => {
  return await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url).toString(), c.req.raw));
});

export default {
  fetch: app.fetch,
  async scheduled(_event: any, env: Bindings) {
    await cleanupExpiredAvatarDeletes(env);
  },
};
