import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { hashPassword, generateSalt, verifyPassword, generateJWT, verifyJWT } from './auth';
import { getCookie, setCookie } from 'hono/cookie';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { cleanupExpiredPendingRegistrations, registerEmailAuthFeature, releaseExpiredRegisterInvites } from './emailAuthFeature';
import { buildPreviewUrl, expandPreviewApps, normalizePreviewEnabled, previewSessionExpiresAt } from './testPreview';

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
  ADMIN_PASSWORD?: string;
  ADMIN_PASSWORD_SECRET?: string;
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
  ADMIN_COOKIE_EXPIRY_DAYS?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

function getAdminCookieExpiryDays(c: any) {
  const configured = Number(c.env.ADMIN_COOKIE_EXPIRY_DAYS);
  return Number.isFinite(configured) && configured > 0 ? Math.round(configured) : 7;
}

function getAdminPassword(c: any) {
  return String(c.env.ADMIN_PASSWORD_SECRET || c.env.ADMIN_PASSWORD || '');
}

function getClientIp(c: any) {
  return c.req.header('CF-Connecting-IP')
    || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
    || null;
}

function getCountryCode(c: any) {
  const value = String(c.req.header('CF-IPCountry') || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(value) ? value : null;
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
  const version = avatarKey || 'legacy';
  return `${getRequestOrigin(c)}/api/avatar/${uuid}?v=${encodeURIComponent(version)}`;
}

function buildAvatarOriginalUrl(c: any, uuid: string, originalKey?: string | null, avatarKey?: string | null, legacyAvatarData?: string | null) {
  if (!originalKey && !avatarKey && !legacyAvatarData) return null;
  const version = originalKey || avatarKey || 'legacy';
  return `${getRequestOrigin(c)}/api/avatar/${uuid}/original?v=${encodeURIComponent(version)}`;
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

    const previousOriginalKey = currentUser.avatar_original_key || null;
    const nextOriginalKey = originalData
      ? await putAvatarObject(c, uuid, 'original', originalData)
      : previousOriginalKey;
    const nextAvatarKey = await putAvatarObject(c, uuid, 'cropped', croppedData);

    if (currentUser.avatar_key && currentUser.avatar_key !== nextOriginalKey) {
      await deleteAvatarIfPresent(c, currentUser.avatar_key);
    }
    if (previousOriginalKey && previousOriginalKey !== currentUser.avatar_key && previousOriginalKey !== nextOriginalKey) {
      await deleteAvatarIfPresent(c, previousOriginalKey);
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

const TEST_DATA_SCOPES = new Set(['public_read', 'public_write', 'private_read', 'private_write']);
const TEST_ROLES = new Set(['user', 'admin']);

function getEffectiveTestDataScopes(scope: string) {
  switch (scope) {
    case 'public_read':
      return ['public_read', 'private_read'];
    case 'public_write':
      return ['public_read', 'public_write', 'private_read', 'private_write'];
    case 'private_write':
      return ['private_read', 'private_write'];
    case 'private_read':
    default:
      return ['private_read'];
  }
}

function randomToken(prefix = '') {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const value = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}${value}`;
}

async function hashTestSecret(value: string) {
  return sha256Hex(`test-auth:${value}`);
}

async function hashTestToken(value: string) {
  return sha256Hex(`test-token:${value}`);
}

async function getSecretCryptoKey(secret: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`test-secret-cipher:${secret}`));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptTestSecret(c: any, secret: string) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await getSecretCryptoKey(c.env.JWT_SECRET);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(secret));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

async function decryptTestSecret(c: any, cipher?: string | null) {
  if (!cipher || !cipher.includes('.')) return null;
  try {
    const [ivRaw, cipherRaw] = cipher.split('.');
    const key = await getSecretCryptoKey(c.env.JWT_SECRET);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(ivRaw) }, key, base64ToBytes(cipherRaw));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

function normalizeTestName(input: unknown) {
  return String(input || '').trim().toLowerCase().replace(/^@/, '');
}

function parseJsonArrayField(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : fallback;
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function serializeStringArray(value: unknown) {
  return JSON.stringify(parseJsonArrayField(value));
}

function normalizeTestIdentityRow(row: any) {
  if (!row) return null;
  return {
    ...row,
    preview_enabled: normalizePreviewEnabled(row.preview_enabled),
    allowed_subapps: parseJsonArrayField(row.allowed_subapps),
    allowed_ip_ranges: parseJsonArrayField(row.allowed_ip_ranges),
    session_ttl_minutes: Number(row.session_ttl_minutes || 30),
    one_time_token_ttl_seconds: Number(row.one_time_token_ttl_seconds || 60),
    max_api_calls_per_session: row.max_api_calls_per_session == null ? null : Number(row.max_api_calls_per_session),
  };
}

function testIdentityAllowsSubapp(identity: any, targetSubapp: string) {
  const allowed = parseJsonArrayField(identity.allowed_subapps);
  return allowed.includes('*') || allowed.includes('all') || allowed.includes(targetSubapp);
}

function normalizeTestIdentityInput(body: any) {
  const name = normalizeTestName(body?.name);
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(name)) {
    throw new Error('Name must be 2-63 lowercase letters, numbers, hyphen, or underscore');
  }
  const role = TEST_ROLES.has(String(body?.role || 'user')) ? String(body?.role || 'user') : 'user';
  const dataScope = TEST_DATA_SCOPES.has(String(body?.data_scope || 'public_read')) ? String(body?.data_scope || 'public_read') : 'public_read';
  const allowedSubapps = parseJsonArrayField(body?.allowed_subapps);
  if (!allowedSubapps.length) throw new Error('Allowed subapps is required');
  const sessionTtl = Math.max(5, Math.min(1440, Math.round(Number(body?.session_ttl_minutes || 30))));
  const tokenTtl = Math.max(15, Math.min(600, Math.round(Number(body?.one_time_token_ttl_seconds || 60))));
  const expiresAt = String(body?.expires_at || '').trim();
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) throw new Error('Expires at is required');
  return {
    name,
    display_name: String(body?.display_name || name).trim(),
    role,
    allowed_subapps: allowedSubapps,
    target_default_subapp: String(body?.target_default_subapp || allowedSubapps[0] || '').trim() || null,
    expires_at: new Date(Date.parse(expiresAt)).toISOString(),
    session_ttl_minutes: sessionTtl,
    one_time_token_ttl_seconds: tokenTtl,
    preview_enabled: normalizePreviewEnabled(body?.preview_enabled),
    data_scope: dataScope,
    max_api_calls_per_session: normalizeLimitValue(body?.max_api_calls_per_session),
    allowed_ip_ranges: parseJsonArrayField(body?.allowed_ip_ranges),
    notes: String(body?.notes || '').trim() || null,
  };
}

function getTestIdentityRiskReasons(input: any) {
  const reasons: string[] = [];
  if (input.data_scope === 'public_write') reasons.push('public_write can open sensitive public config, template, and cache APIs');
  if (input.data_scope === 'private_read') reasons.push('private_read can read real user content, files, records, or settings');
  if (input.data_scope === 'private_write') reasons.push('private_write can read and modify real app data');
  if (input.role === 'admin') reasons.push('模拟管理员 role=admin');
  if (input.preview_enabled) reasons.push('Preview 链接可使用长期测试 secret 交换浏览器 session');
  if (Number(input.session_ttl_minutes) > 60) reasons.push('测试 session 超过 60 分钟');
  if (parseJsonArrayField(input.allowed_subapps).some((item) => item === '*' || item === 'all')) reasons.push('允许访问全部应用');
  if (Date.parse(input.expires_at) - Date.now() > 7 * 86400 * 1000) reasons.push('测试身份有效期超过 7 天');
  return reasons;
}

function buildTestAgentCommand(c: any, identity: any, secret?: string | null) {
  const target = identity.target_default_subapp || parseJsonArrayField(identity.allowed_subapps)[0] || '<target_subapp>';
  const secretValue = secret || '<rotate-secret-to-view-once>';
  return [
    `npx auth-center-cli test-login --auth ${getRequestOrigin(c)} --app ${target} --name ${identity.name} --secret ${secretValue}`,
    '',
    `curl -X POST "${getRequestOrigin(c)}/api/test-auth/exchange" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '{"name":"${identity.name}","secret":"${secretValue}","target_subapp":"${target}"}'`,
    '',
    `提醒：login_url 需在 ${identity.one_time_token_ttl_seconds || 60} 秒内打开；登录后的测试 session 有效 ${identity.session_ttl_minutes || 30} 分钟；data_scope=${identity.data_scope}；不要把 secret 写入 GitHub、日志、公开聊天或前端代码。`,
  ].join('\n');
}

async function writeTestAudit(c: any, input: { testIdentityId?: string | null; eventType: string; targetSubapp?: string | null; success: boolean; detail?: any }) {
  await c.env.DB.prepare(`
    INSERT INTO test_auth_audit_logs (id, test_identity_id, event_type, target_subapp, ip_hash, user_agent, success, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    input.testIdentityId || null,
    input.eventType,
    input.targetSubapp || null,
    await sha256Hex(getClientIp(c)),
    c.req.header('User-Agent') || null,
    input.success ? 1 : 0,
    input.detail === undefined ? null : JSON.stringify(input.detail),
    new Date().toISOString()
  ).run().catch(() => null);
}

function ipv4ToNumber(ip: string) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
}

function ipMatchesRange(ip: string | null, range: string) {
  if (!ip) return false;
  const normalizedRange = range.trim();
  if (!normalizedRange) return false;
  if (!normalizedRange.includes('/')) return ip === normalizedRange;
  const [base, bitsRaw] = normalizedRange.split('/');
  const bits = Number(bitsRaw);
  const ipNum = ipv4ToNumber(ip);
  const baseNum = ipv4ToNumber(base);
  if (ipNum == null || baseNum == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ipNum >>> 0) & mask) === ((baseNum >>> 0) & mask);
}

function requestIpAllowed(c: any, identity: any) {
  const ranges = parseJsonArrayField(identity.allowed_ip_ranges);
  if (!ranges.length) return true;
  const ip = getClientIp(c);
  return ranges.some((range) => ipMatchesRange(ip, range));
}

function buildTestJwtPayload(c: any, identity: any, sessionId: string, targetSubapp: string) {
  return {
    sub: identity.id,
    uuid: identity.id,
    user_id: identity.id,
    username: identity.name,
    name: identity.display_name || identity.name,
    role: identity.role || 'user',
    status: identity.status,
    auth_provider: 'test_identity',
    identity_type: 'test',
    test_session: true,
    allowed_subapps: parseJsonArrayField(identity.allowed_subapps),
    data_scope: identity.data_scope || 'public_read',
    data_scope_permissions: getEffectiveTestDataScopes(identity.data_scope || 'public_read'),
    session_id: sessionId,
    target_subapp: targetSubapp,
    iat: Math.floor(Date.now() / 1000),
  };
}

function setPreviewResponseHeaders(c: any) {
  c.header('Cache-Control', 'no-store, private');
  c.header('Pragma', 'no-cache');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Content-Type-Options', 'nosniff');
}

function previewJson(c: any, body: any, status = 200) {
  setPreviewResponseHeaders(c);
  return c.json(body, status as any);
}

function setPreviewSessionCookie(c: any, token: string, maxAgeSeconds: number) {
  setCookie(c, 'test_preview_session', token, {
    path: '/preview',
    secure: true,
    httpOnly: true,
    sameSite: 'Strict',
    maxAge: maxAgeSeconds,
  });
}

function clearPreviewSessionCookie(c: any) {
  setCookie(c, 'test_preview_session', '', {
    path: '/preview',
    secure: true,
    httpOnly: true,
    sameSite: 'Strict',
    maxAge: 0,
  });
}

function isActivePreviewIdentity(identity: any) {
  return Boolean(
    identity
      && normalizePreviewEnabled(identity.preview_enabled)
      && identity.status === 'active'
      && !identity.disabled_at
      && !identity.deleted_at
      && Date.parse(identity.expires_at) > Date.now(),
  );
}

async function createTestIdentitySession(c: any, identity: any, targetSubapp: string, expiresAt: string) {
  const sessionId = crypto.randomUUID();
  const jwtId = crypto.randomUUID();
  const remainingDays = Math.max(1, Date.parse(expiresAt) - Date.now()) / (24 * 60 * 60 * 1000);
  const payload = buildTestJwtPayload(c, identity, sessionId, targetSubapp);
  const jwtToken = await generateJWT({ ...payload, jti: jwtId }, c.env.JWT_SECRET, remainingDays);
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    INSERT INTO test_sessions (id, test_identity_id, target_subapp, session_token_hash, jwt_id, status, created_at, expires_at, ip_hash, user_agent)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `).bind(
    sessionId,
    identity.id,
    targetSubapp,
    await sha256Hex(jwtToken),
    jwtId,
    now,
    expiresAt,
    await sha256Hex(getClientIp(c)),
    c.req.header('User-Agent') || null,
  ).run();

  return { sessionId, jwtToken, expiresAt };
}

async function authenticatePreviewSession(c: any) {
  const token = getCookie(c, 'test_preview_session');
  if (!token) return null;

  try {
    const payload: any = await verifyJWT(token, c.env.JWT_SECRET);
    const identityId = String(payload?.sub || payload?.uuid || '');
    const sessionId = String(payload?.session_id || '');
    if (!identityId || !sessionId || payload.identity_type !== 'test' || payload.target_subapp !== 'auth-center-preview') return null;

    const [identity, session]: any[] = await Promise.all([
      c.env.DB.prepare('SELECT * FROM test_identities WHERE id = ?').bind(identityId).first(),
      c.env.DB.prepare(`
        SELECT * FROM test_sessions
        WHERE id = ? AND test_identity_id = ? AND target_subapp = 'auth-center-preview'
      `).bind(sessionId, identityId).first(),
    ]);
    if (!isActivePreviewIdentity(identity)) return null;
    if (!session || session.status !== 'active' || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return null;

    return { token, payload, identity, session };
  } catch {
    return null;
  }
}

async function getTestActivity(c: any, id: string) {
  const start = c.req?.query?.('start');
  const end = c.req?.query?.('end');
  const usageWindow = `${start ? ' AND created_at >= ?' : ''}${end ? ' AND created_at <= ?' : ''}`;
  const usageBinds = [id, ...(start ? [String(start)] : []), ...(end ? [String(end)] : [])];
  const [activeSessions, recentSessions, recentLogs, usageRows, usageSessionRows, totals] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM test_sessions WHERE test_identity_id = ? AND status = 'active' AND revoked_at IS NULL AND expires_at > ?`).bind(id, new Date().toISOString()).first(),
    c.env.DB.prepare(`SELECT * FROM test_sessions WHERE test_identity_id = ? ORDER BY created_at DESC LIMIT 10`).bind(id).all(),
    c.env.DB.prepare(`SELECT * FROM test_auth_audit_logs WHERE test_identity_id = ? ORDER BY created_at DESC LIMIT 20`).bind(id).all(),
    c.env.DB.prepare(`SELECT subapp, SUM(amount) AS calls FROM test_api_usage_records WHERE test_identity_id = ?${usageWindow} GROUP BY subapp ORDER BY calls DESC`).bind(...usageBinds).all(),
    c.env.DB.prepare(`SELECT COALESCE(session_id, 'unknown') AS session_id, SUM(amount) AS calls FROM test_api_usage_records WHERE test_identity_id = ?${usageWindow} GROUP BY session_id ORDER BY calls DESC`).bind(...usageBinds).all(),
    c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM test_sessions WHERE test_identity_id = ?) AS login_count,
        (SELECT MAX(created_at) FROM test_sessions WHERE test_identity_id = ?) AS recent_login,
        (SELECT COUNT(*) FROM test_auth_audit_logs WHERE test_identity_id = ? AND event_type = 'exchange_failed') AS failed_exchange_count,
        (SELECT COALESCE(SUM(amount), 0) FROM test_api_usage_records WHERE test_identity_id = ?) AS api_call_count
    `).bind(id, id, id, id).first(),
  ]);
  return {
    active_session_count: Number(activeSessions?.count || 0),
    recent_sessions: recentSessions.results || [],
    recent_audit_logs: recentLogs.results || [],
    usage_by_subapp: usageRows.results || [],
    usage_by_session: usageSessionRows.results || [],
    login_count: Number(totals?.login_count || 0),
    recent_login: totals?.recent_login || null,
    failed_exchange_count: Number(totals?.failed_exchange_count || 0),
    api_call_count: Number(totals?.api_call_count || 0),
  };
}

async function cleanupExpiredTestIdentities(c: any) {
  const now = new Date().toISOString();
  const expired: any = await c.env.DB.prepare(`
    SELECT id, name
    FROM test_identities
    WHERE deleted_at IS NULL AND expires_at <= ?
  `).bind(now).all().catch(() => ({ results: [] }));
  for (const row of expired.results || []) {
    const tombstoneName = `${row.name}__deleted__${String(row.id).slice(-8)}__${Date.now()}`;
    await c.env.DB.prepare(`
      UPDATE test_identities
      SET name = ?, status = 'deleted', deleted_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(tombstoneName, now, now, row.id).run().catch(() => null);
    await c.env.DB.prepare(`
      UPDATE test_sessions
      SET status = 'revoked', revoked_at = ?
      WHERE test_identity_id = ? AND revoked_at IS NULL
    `).bind(now, row.id).run().catch(() => null);
  }
}

async function getActiveTestSecret(c: any, id: string) {
  const row: any = await c.env.DB.prepare(`
    SELECT secret_prefix, secret_cipher
    FROM test_identity_secrets
    WHERE test_identity_id = ? AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(id).first();
  const secret = await decryptTestSecret(c, row?.secret_cipher);
  return { secret, secret_prefix: row?.secret_prefix || null };
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

  if ((identifier === c.env.ADMIN_USERNAME || (!!adminEmail && loginEmail === adminEmail)) && password === getAdminPassword(c)) {
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
      cookie_expiry_days: getAdminCookieExpiryDays(c)
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
    email: userToAuth.email || null,
    email_verified: !!userToAuth.email_verified,
    role: userToAuth.role || 'user',
    auth_provider: userToAuth.auth_provider || 'legacy',
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
      ) VALUES (?, ?, ?, ?, 'user', 'active', 'code', 0, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      uuid,
      uuid,
      username,
      name,
      hash,
      salt,
      password,
      config.cookie_expiry_days,
      birthday || null,
      null,
      avatarKey
    ).run();

    await applyRegisterCodeConfigToUser(c, uuid, config);

    const claimResult: any = await c.env.DB.prepare(`
      UPDATE register_codes
      SET status = 'used', max_uses = 1, used_count = 1, used_by_uuid = ?, used_by_username = ?, used_at = CURRENT_TIMESTAMP
      WHERE code = ? AND status = 'unused'
    `).bind(uuid, username, register_code).run();

    if (!claimResult?.meta?.changes) {
      throw new Error('Register code is no longer available');
    }
    await c.env.DB.prepare(`
      INSERT INTO register_code_uses (id, code_id, user_id, used_at, ip_hash, country_code)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `).bind(
      crypto.randomUUID(),
      register_code,
      uuid,
      await sha256Hex(getClientIp(c)),
      getCountryCode(c)
    ).run();

    return c.json({
      success: true,
      uuid,
      username,
      redirect_to: '/users/',
    });
  } catch (e: any) {
    await deleteAvatarIfPresent(c, avatarKey);
    await c.env.DB.prepare(`
      UPDATE register_codes
      SET status = 'unused', used_count = 0, used_by_uuid = NULL, used_by_username = NULL, used_at = NULL
      WHERE code = ? AND used_by_uuid = ?
    `).bind(register_code, uuid).run().catch(() => null);
    await c.env.DB.prepare('DELETE FROM register_code_uses WHERE code_id = ? AND user_id = ?').bind(register_code, uuid).run().catch(() => null);
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

app.post('/preview/api/session', async (c) => {
  let identity: any = null;
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = normalizeTestName(body?.name);
    const secret = String(body?.secret || '').trim();
    if (!name || !secret) {
      await writeTestAudit(c, { eventType: 'preview_session_failed', targetSubapp: 'auth-center-preview', success: false, detail: { reason: 'missing_credentials' } });
      return previewJson(c, { ok: false, error: 'Preview access denied' }, 401);
    }

    identity = await c.env.DB.prepare(`
      SELECT ti.*, tis.id AS secret_id, tis.secret_hash
      FROM test_identities ti
      JOIN test_identity_secrets tis ON tis.test_identity_id = ti.id AND tis.status = 'active'
      WHERE ti.name = ? AND ti.deleted_at IS NULL
      ORDER BY tis.created_at DESC
      LIMIT 1
    `).bind(name).first();
    const secretHash = await hashTestSecret(secret);
    if (!identity || identity.secret_hash !== secretHash || !isActivePreviewIdentity(identity) || !requestIpAllowed(c, identity)) {
      await writeTestAudit(c, {
        testIdentityId: identity?.id,
        eventType: 'preview_session_failed',
        targetSubapp: 'auth-center-preview',
        success: false,
        detail: { reason: 'access_denied' },
      });
      return previewJson(c, { ok: false, error: 'Preview access denied' }, 401);
    }

    await writeTestAudit(c, { testIdentityId: identity.id, eventType: 'preview_session_attempt', targetSubapp: 'auth-center-preview', success: true });
    const expiresAt = previewSessionExpiresAt(new Date(), Number(identity.session_ttl_minutes || 30));
    const session = await createTestIdentitySession(c, identity, 'auth-center-preview', expiresAt);
    await c.env.DB.prepare('UPDATE test_identity_secrets SET last_used_at = ? WHERE id = ?').bind(new Date().toISOString(), identity.secret_id).run();
    setPreviewSessionCookie(c, session.jwtToken, Math.max(1, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)));
    await writeTestAudit(c, {
      testIdentityId: identity.id,
      eventType: 'preview_session_created',
      targetSubapp: 'auth-center-preview',
      success: true,
      detail: { session_id: session.sessionId },
    });
    return previewJson(c, { ok: true, expires_at: expiresAt });
  } catch {
    await writeTestAudit(c, { testIdentityId: identity?.id, eventType: 'preview_session_failed', targetSubapp: 'auth-center-preview', success: false, detail: { reason: 'unexpected_error' } });
    return previewJson(c, { ok: false, error: 'Preview access denied' }, 401);
  }
});

app.get('/preview/api/session', async (c) => {
  const previewSession = await authenticatePreviewSession(c);
  if (!previewSession) {
    clearPreviewSessionCookie(c);
    return previewJson(c, { ok: false, error: 'Preview access denied' }, 401);
  }

  const { results } = await c.env.DB.prepare(`
    SELECT app_id, app_name, status
    FROM apps
    WHERE COALESCE(status, 'active') = 'active'
    ORDER BY app_name ASC
  `).all();
  const apps = expandPreviewApps(
    parseJsonArrayField(previewSession.identity.allowed_subapps),
    (results || []).map((app: any) => ({ ...app, status: app.status || 'active' })),
  ).map((app) => ({ app_id: app.app_id, app_name: app.app_name || app.name || app.app_id }));

  return previewJson(c, {
    ok: true,
    identity: {
      name: previewSession.identity.name,
      display_name: previewSession.identity.display_name || previewSession.identity.name,
      role: previewSession.identity.role || 'user',
      expires_at: previewSession.identity.expires_at,
    },
    session: { expires_at: previewSession.session.expires_at },
    apps,
  });
});

app.post('/preview/api/launch', async (c) => {
  const previewSession = await authenticatePreviewSession(c);
  if (!previewSession) {
    clearPreviewSessionCookie(c);
    return previewJson(c, { ok: false, error: 'Preview access denied' }, 401);
  }
  const body = await c.req.json().catch(() => ({}));
  const appId = String(body?.app_id || '').trim();
  if (!appId || !testIdentityAllowsSubapp(previewSession.identity, appId)) {
    await writeTestAudit(c, { testIdentityId: previewSession.identity.id, eventType: 'preview_app_launch_denied', targetSubapp: appId || null, success: false, detail: { reason: 'subapp_not_allowed' } });
    return previewJson(c, { ok: false, error: 'Preview access denied' }, 403);
  }

  const appRecord: any = await c.env.DB.prepare(`
    SELECT app_id, callback_url, status
    FROM apps
    WHERE app_id = ? AND COALESCE(status, 'active') = 'active'
  `).bind(appId).first();
  let callback: URL;
  try {
    callback = new URL(String(appRecord?.callback_url || ''));
    if (!['http:', 'https:'].includes(callback.protocol)) throw new Error('unsupported_callback_protocol');
  } catch {
    await writeTestAudit(c, { testIdentityId: previewSession.identity.id, eventType: 'preview_app_launch_denied', targetSubapp: appId, success: false, detail: { reason: 'app_unavailable' } });
    return previewJson(c, { ok: false, error: 'Preview access denied' }, 403);
  }

  const expiresAtMs = Math.min(Date.parse(previewSession.session.expires_at), Date.parse(previewSession.identity.expires_at));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    clearPreviewSessionCookie(c);
    return previewJson(c, { ok: false, error: 'Preview access denied' }, 401);
  }
  const session = await createTestIdentitySession(c, previewSession.identity, appId, new Date(expiresAtMs).toISOString());
  callback.hash = '';
  callback.searchParams.set('token', session.jwtToken);
  callback.searchParams.set('identity_type', 'test');
  await writeTestAudit(c, {
    testIdentityId: previewSession.identity.id,
    eventType: 'preview_app_launch',
    targetSubapp: appId,
    success: true,
    detail: { preview_session_id: previewSession.session.id, session_id: session.sessionId },
  });
  return previewJson(c, { ok: true, redirect_url: callback.toString() });
});

app.post('/preview/api/logout', async (c) => {
  const previewSession = await authenticatePreviewSession(c);
  if (previewSession) {
    await c.env.DB.prepare(`
      UPDATE test_sessions
      SET status = 'revoked', revoked_at = ?
      WHERE id = ? AND test_identity_id = ? AND revoked_at IS NULL
    `).bind(new Date().toISOString(), previewSession.session.id, previewSession.identity.id).run();
    await writeTestAudit(c, { testIdentityId: previewSession.identity.id, eventType: 'preview_session_revoked', targetSubapp: 'auth-center-preview', success: true, detail: { session_id: previewSession.session.id } });
  }
  clearPreviewSessionCookie(c);
  return previewJson(c, { ok: true });
});

app.post('/api/test-auth/exchange', async (c) => {
  let identity: any = null;
  let targetSubapp = '';
  try {
    const body = await c.req.json();
    const name = normalizeTestName(body?.name);
    const secret = String(body?.secret || '').trim();
    targetSubapp = String(body?.target_subapp || '').trim();
    if (!name || !secret || !targetSubapp) {
      await writeTestAudit(c, { eventType: 'exchange_failed', targetSubapp, success: false, detail: { reason: 'missing_fields', name } });
      return c.json({ ok: false, error: 'Invalid test identity credentials' }, 400);
    }

    identity = await c.env.DB.prepare(`
      SELECT ti.*, tis.id AS secret_id, tis.secret_hash, tis.secret_prefix, tis.status AS secret_status
      FROM test_identities ti
      JOIN test_identity_secrets tis ON tis.test_identity_id = ti.id AND tis.status = 'active'
      WHERE ti.name = ? AND ti.deleted_at IS NULL
      ORDER BY tis.created_at DESC
      LIMIT 1
    `).bind(name).first();

    const secretHash = await hashTestSecret(secret);
    if (!identity || identity.secret_hash !== secretHash) {
      await writeTestAudit(c, { testIdentityId: identity?.id, eventType: 'exchange_failed', targetSubapp, success: false, detail: { reason: 'bad_secret', name } });
      return c.json({ ok: false, error: 'Invalid test identity credentials' }, 401);
    }
    if (identity.status !== 'active' || identity.disabled_at || Date.parse(identity.expires_at) <= Date.now()) {
      await writeTestAudit(c, { testIdentityId: identity.id, eventType: 'exchange_failed', targetSubapp, success: false, detail: { reason: 'inactive_or_expired' } });
      return c.json({ ok: false, error: 'Test identity is not active' }, 403);
    }
    if (!testIdentityAllowsSubapp(identity, targetSubapp)) {
      await writeTestAudit(c, { testIdentityId: identity.id, eventType: 'access_denied', targetSubapp, success: false, detail: { reason: 'subapp_not_allowed' } });
      return c.json({ ok: false, error: 'Target subapp is not allowed' }, 403);
    }
    if (!requestIpAllowed(c, identity)) {
      await writeTestAudit(c, { testIdentityId: identity.id, eventType: 'exchange_failed', targetSubapp, success: false, detail: { reason: 'ip_not_allowed' } });
      return c.json({ ok: false, error: 'Source IP is not allowed' }, 403);
    }

    const token = randomToken('ott_');
    const tokenHash = await hashTestToken(token);
    const tokenTtl = Math.max(15, Math.min(600, Number(identity.one_time_token_ttl_seconds || 60)));
    const expiresAt = new Date(Date.now() + tokenTtl * 1000).toISOString();
    await c.env.DB.prepare(`
      INSERT INTO test_one_time_tokens (id, test_identity_id, token_hash, target_subapp, expires_at, created_at, ip_hash, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      identity.id,
      tokenHash,
      targetSubapp,
      expiresAt,
      new Date().toISOString(),
      await sha256Hex(getClientIp(c)),
      c.req.header('User-Agent') || null
    ).run();
    await c.env.DB.prepare('UPDATE test_identity_secrets SET last_used_at = ? WHERE id = ?').bind(new Date().toISOString(), identity.secret_id).run();
    await writeTestAudit(c, { testIdentityId: identity.id, eventType: 'exchange_success', targetSubapp, success: true });

    return c.json({
      ok: true,
      login_url: `${getRequestOrigin(c)}/test-session/consume?token=${encodeURIComponent(token)}`,
      one_time_token_expires_in: tokenTtl,
      test_session_ttl_minutes: Number(identity.session_ttl_minutes || 30),
      target_subapp: targetSubapp,
    });
  } catch (e: any) {
    await writeTestAudit(c, { testIdentityId: identity?.id, eventType: 'exchange_failed', targetSubapp, success: false, detail: { reason: e.message || 'unknown' } });
    return c.json({ ok: false, error: 'Unable to exchange test identity secret' }, 400);
  }
});

app.get('/test-session/consume', async (c) => {
  const token = String(c.req.query('token') || '').trim();
  if (!token) return c.text('Missing test login token', 400);

  const tokenHash = await hashTestToken(token);
  const tokenRow: any = await c.env.DB.prepare(`
    SELECT
      tot.id AS token_id,
      tot.test_identity_id,
      tot.token_hash,
      tot.target_subapp,
      tot.expires_at AS token_expires_at,
      tot.consumed_at,
      ti.id,
      ti.name,
      ti.display_name,
      ti.role,
      ti.status,
      ti.allowed_subapps,
      ti.target_default_subapp,
      ti.data_scope,
      ti.session_ttl_minutes,
      ti.one_time_token_ttl_seconds,
      ti.max_api_calls_per_session,
      ti.allowed_ip_ranges,
      ti.expires_at AS identity_expires_at,
      ti.disabled_at,
      ti.deleted_at
    FROM test_one_time_tokens tot
    JOIN test_identities ti ON ti.id = tot.test_identity_id
    WHERE tot.token_hash = ?
    LIMIT 1
  `).bind(tokenHash).first();

  if (!tokenRow || tokenRow.consumed_at || Date.parse(tokenRow.token_expires_at) <= Date.now()) {
    await writeTestAudit(c, { testIdentityId: tokenRow?.test_identity_id, eventType: 'consume_failed', targetSubapp: tokenRow?.target_subapp, success: false, detail: { reason: 'invalid_or_expired_token' } });
    return c.text('This test login URL is invalid or expired.', 400);
  }
  if (tokenRow.status !== 'active' || tokenRow.disabled_at || tokenRow.deleted_at || Date.parse(tokenRow.identity_expires_at) <= Date.now()) {
    await writeTestAudit(c, { testIdentityId: tokenRow.test_identity_id, eventType: 'consume_failed', targetSubapp: tokenRow.target_subapp, success: false, detail: { reason: 'identity_inactive_or_expired' } });
    return c.text('This test identity is not active.', 403);
  }
  if (!testIdentityAllowsSubapp(tokenRow, tokenRow.target_subapp)) {
    await writeTestAudit(c, { testIdentityId: tokenRow.test_identity_id, eventType: 'access_denied', targetSubapp: tokenRow.target_subapp, success: false, detail: { reason: 'subapp_not_allowed_at_consume' } });
    return c.text('Target subapp is not allowed.', 403);
  }

  const sessionId = crypto.randomUUID();
  const sessionTtlMinutes = Math.max(5, Math.min(1440, Number(tokenRow.session_ttl_minutes || 30)));
  const sessionExpiresAt = new Date(Date.now() + sessionTtlMinutes * 60 * 1000).toISOString();
  const jwtId = crypto.randomUUID();
  const payload = buildTestJwtPayload(c, tokenRow, sessionId, tokenRow.target_subapp);
  const jwtToken = await generateJWT({ ...payload, jti: jwtId }, c.env.JWT_SECRET, sessionTtlMinutes / (24 * 60));

  await c.env.DB.prepare('UPDATE test_one_time_tokens SET consumed_at = ? WHERE id = ?').bind(new Date().toISOString(), tokenRow.token_id).run();
  await c.env.DB.prepare(`
    INSERT INTO test_sessions (id, test_identity_id, target_subapp, session_token_hash, jwt_id, status, created_at, expires_at, ip_hash, user_agent)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `).bind(
    sessionId,
    tokenRow.test_identity_id,
    tokenRow.target_subapp,
    await sha256Hex(jwtToken),
    jwtId,
    new Date().toISOString(),
    sessionExpiresAt,
    await sha256Hex(getClientIp(c)),
    c.req.header('User-Agent') || null
  ).run();
  await writeTestAudit(c, { testIdentityId: tokenRow.test_identity_id, eventType: 'consume_success', targetSubapp: tokenRow.target_subapp, success: true, detail: { session_id: sessionId } });

  setUserSessionCookie(c, jwtToken, sessionTtlMinutes * 60);

  const appRecord: any = await c.env.DB.prepare('SELECT app_id, callback_url FROM apps WHERE app_id = ?').bind(tokenRow.target_subapp).first();
  const fallback = `${getRequestOrigin(c)}/dev/@${encodeURIComponent(tokenRow.name)}`;
  const redirectBase = appRecord?.callback_url || fallback;
  const separator = redirectBase.includes('?') ? '&' : '?';
  return c.redirect(`${redirectBase}${separator}token=${encodeURIComponent(jwtToken)}&identity_type=test`);
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

  const keys = [user.avatar_original_key, user.avatar_key].filter(Boolean);
  for (const key of keys) {
    const object = await c.env.AVATAR_BUCKET.get(key);
    if (!object) continue;

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

    if (payload.identity_type === 'test' || payload.test_session === true) {
      const identityId = payload.sub || payload.uuid;
      const sessionId = payload.session_id;
      const [identity, session]: any[] = await Promise.all([
        c.env.DB.prepare('SELECT id, status, allowed_subapps, expires_at, disabled_at, deleted_at FROM test_identities WHERE id = ?').bind(identityId).first(),
        c.env.DB.prepare('SELECT id, status, expires_at, revoked_at FROM test_sessions WHERE id = ? AND test_identity_id = ?').bind(sessionId, identityId).first(),
      ]);
      if (!identity || identity.status !== 'active' || identity.disabled_at || identity.deleted_at || Date.parse(identity.expires_at) <= Date.now()) {
        await writeTestAudit(c, { testIdentityId: identityId, eventType: 'access_denied', targetSubapp: appId, success: false, detail: { reason: 'identity_inactive' } });
        return c.json({ error: 'Test identity is inactive' }, 403);
      }
      if (!session || session.status !== 'active' || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) {
        await writeTestAudit(c, { testIdentityId: identityId, eventType: 'access_denied', targetSubapp: appId, success: false, detail: { reason: 'session_inactive' } });
        return c.json({ error: 'Test session expired' }, 403);
      }
      if (appId && !testIdentityAllowsSubapp(identity, appId)) {
        await writeTestAudit(c, { testIdentityId: identityId, eventType: 'access_denied', targetSubapp: appId, success: false, detail: { reason: 'subapp_not_allowed' } });
        return c.json({ error: 'No permission for this app' }, 403);
      }
      return c.json({ valid: true, user: payload, legacy_subapp_compat: true });
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

  const testIdentity: any = await c.env.DB.prepare(
    'SELECT id, status, allowed_subapps, expires_at, disabled_at, deleted_at, max_api_calls_per_session FROM test_identities WHERE id = ?'
  ).bind(uuid).first();
  if (testIdentity) {
    if (testIdentity.status !== 'active' || testIdentity.disabled_at || testIdentity.deleted_at || Date.parse(testIdentity.expires_at) <= Date.now()) {
      return c.json({ error: 'Test identity is inactive' }, 403);
    }
    if (!testIdentityAllowsSubapp(testIdentity, appId)) {
      await writeTestAudit(c, { testIdentityId: uuid, eventType: 'access_denied', targetSubapp: appId, success: false, detail: { reason: 'quota_subapp_not_allowed' } });
      return c.json({ error: 'Permission denied' }, 403);
    }
    return c.json({
      valid: true,
      unlimited: testIdentity.max_api_calls_per_session == null,
      test_session: true,
      remaining_tokens: null,
      remaining_requests: null,
      quota: { max_api_calls_per_session: testIdentity.max_api_calls_per_session },
    });
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

  const testIdentity: any = await c.env.DB.prepare(
    'SELECT id, status, allowed_subapps, expires_at, disabled_at, deleted_at FROM test_identities WHERE id = ?'
  ).bind(uuid).first();
  if (testIdentity) {
    if (testIdentity.status !== 'active' || testIdentity.disabled_at || testIdentity.deleted_at || Date.parse(testIdentity.expires_at) <= Date.now() || !testIdentityAllowsSubapp(testIdentity, app_id)) {
      await writeTestAudit(c, { testIdentityId: uuid, eventType: 'access_denied', targetSubapp: app_id, success: false, detail: { reason: 'quota_consume_denied' } });
      return c.json({ error: 'Permission denied' }, 403);
    }
    await c.env.DB.prepare(`
      INSERT INTO test_api_usage_records (id, test_identity_id, session_id, subapp, api_path, method, amount, status_code, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      uuid,
      null,
      app_id,
      '/api/quota/consume',
      'POST',
      1,
      200,
      new Date().toISOString(),
      JSON.stringify({ tokens })
    ).run().catch(() => null);
    return c.json({ success: true, test_session: true });
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

  const testIdentity: any = await c.env.DB.prepare('SELECT id FROM test_identities WHERE id = ?').bind(uuid).first().catch(() => null);
  if (testIdentity) {
    await c.env.DB.prepare(`
      INSERT INTO test_api_usage_records (id, test_identity_id, session_id, subapp, api_path, method, amount, status_code, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      uuid,
      null,
      app_id,
      '/api/track',
      'POST',
      1,
      200,
      new Date().toISOString(),
      JSON.stringify({ event_type, duration_seconds: duration_seconds || 0 })
    ).run().catch(() => null);
  }

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
    if (password === getAdminPassword(c)) {
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
        cookie_expiry_days: getAdminCookieExpiryDays(c)
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
          status: 'active', cookie_expiry_days: getAdminCookieExpiryDays(c)
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
      if (payload.role === 'admin' && payload.identity_type !== 'test' && payload.test_session !== true) {
        return next();
      }
    } catch (e) { }
  }

  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const decoded = atob(authHeader.substring(6));
      const separatorIndex = decoded.indexOf(':');
      const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : '';
      const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';
      if (username === c.env.ADMIN_USERNAME && password === getAdminPassword(c)) {
        return next();
      }
    } catch (e) { }
  }

  return c.json({ error: 'Admin authentication required' }, 401);
}

// Apply admin auth to all admin routes. New code must use role=admin for JWTs.
app.use('/admin/*', adminAuthGuard);
app.use('/api/admin/*', adminAuthGuard);

app.post('/admin/bind-token', async (c) => {
  const bindToken = await generateJWT({ action: 'bind', uuid: 'admin' }, c.env.JWT_SECRET, 1 / 24);
  return c.json({ success: true, bind_token: bindToken });
});

app.get('/admin/register-codes', async (c) => {
  await releaseExpiredRegisterInvites(c.env);
  const { results } = await c.env.DB.prepare(`
    SELECT
      register_codes.code,
      register_codes.template_name,
      register_codes.config_json,
      register_codes.status,
      COALESCE(
        register_codes.used_by_uuid,
        (
          SELECT uses.user_id
          FROM register_code_uses uses
          WHERE uses.code_id = register_codes.id OR uses.code_id = register_codes.code
          ORDER BY uses.used_at DESC
          LIMIT 1
        )
      ) AS used_by_uuid,
      COALESCE(
        register_codes.used_by_username,
        (
          SELECT code_user.username
          FROM register_code_uses uses
          INNER JOIN users code_user ON code_user.uuid = uses.user_id OR code_user.id = uses.user_id
          WHERE uses.code_id = register_codes.id OR uses.code_id = register_codes.code
          ORDER BY uses.used_at DESC
          LIMIT 1
        )
      ) AS used_by_username,
      register_codes.used_at,
      register_codes.created_at,
      register_codes.invited_email,
      register_codes.invite_expires_at,
      (
        SELECT uses.country_code
        FROM register_code_uses uses
        WHERE uses.code_id = register_codes.id OR uses.code_id = register_codes.code
        ORDER BY uses.used_at DESC
        LIMIT 1
      ) AS country_code
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

app.get('/api/admin/test-identities', async (c) => {
  await cleanupExpiredTestIdentities(c);
  const { results } = await c.env.DB.prepare(`
    SELECT ti.*,
           tis.secret_prefix,
           (SELECT COUNT(*) FROM test_sessions ts WHERE ts.test_identity_id = ti.id AND ts.status = 'active' AND ts.revoked_at IS NULL AND ts.expires_at > ?) AS active_session_count,
           (SELECT MAX(created_at) FROM test_sessions ts WHERE ts.test_identity_id = ti.id) AS recent_login,
           (SELECT COALESCE(SUM(amount), 0) FROM test_api_usage_records tu WHERE tu.test_identity_id = ti.id) AS api_call_count
    FROM test_identities ti
    LEFT JOIN test_identity_secrets tis ON tis.test_identity_id = ti.id AND tis.status = 'active'
    WHERE ti.deleted_at IS NULL
    ORDER BY ti.created_at DESC
  `).bind(new Date().toISOString()).all();
  return c.json({ ok: true, test_identities: (results || []).map(normalizeTestIdentityRow) });
});

app.post('/api/admin/test-identities', async (c) => {
  try {
    const body = await c.req.json();
    const input = normalizeTestIdentityInput(body);
    const existing: any = await c.env.DB.prepare('SELECT id, status FROM test_identities WHERE name = ? AND deleted_at IS NULL').bind(input.name).first();
    if (existing) {
      return c.json({ ok: false, error: `测试身份 name 已存在：${input.name}` }, 409);
    }
    const deletedBlockers: any = await c.env.DB.prepare('SELECT id, name FROM test_identities WHERE name = ? AND deleted_at IS NOT NULL').bind(input.name).all();
    for (const row of deletedBlockers.results || []) {
      const tombstoneName = `${row.name}__deleted__${String(row.id).slice(-8)}__${Date.now()}`;
      await c.env.DB.prepare('UPDATE test_identities SET name = ?, updated_at = ? WHERE id = ?').bind(tombstoneName, new Date().toISOString(), row.id).run();
    }
    const id = `test_${crypto.randomUUID()}`;
    const secret = randomToken('sk_test_');
    const secretHash = await hashTestSecret(secret);
    const secretCipher = await encryptTestSecret(c, secret);
    const secretPrefix = `${secret.slice(0, 15)}****`;
    const now = new Date().toISOString();

    await c.env.DB.prepare(`
      INSERT INTO test_identities (
        id, name, display_name, role, status, allowed_subapps, target_default_subapp, data_scope,
        preview_enabled, session_ttl_minutes, one_time_token_ttl_seconds, max_api_calls_per_session,
        allowed_ip_ranges, expires_at, created_by, created_at, updated_at, notes
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.name,
      input.display_name,
      input.role,
      JSON.stringify(input.allowed_subapps),
      input.target_default_subapp,
      input.data_scope,
      input.preview_enabled ? 1 : 0,
      input.session_ttl_minutes,
      input.one_time_token_ttl_seconds,
      input.max_api_calls_per_session,
      JSON.stringify(input.allowed_ip_ranges),
      input.expires_at,
      c.env.ADMIN_USERNAME || 'admin',
      now,
      now,
      input.notes
    ).run();

    await c.env.DB.prepare(`
      INSERT INTO test_identity_secrets (id, test_identity_id, secret_hash, secret_cipher, secret_prefix, version, status, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 'active', ?)
    `).bind(crypto.randomUUID(), id, secretHash, secretCipher, secretPrefix, now).run();
    const row = normalizeTestIdentityRow({ ...input, id, status: 'active', secret_prefix: secretPrefix, created_at: now, updated_at: now, created_by: c.env.ADMIN_USERNAME || 'admin' });
    await writeTestAudit(c, { testIdentityId: id, eventType: 'admin_create_test_identity', targetSubapp: input.target_default_subapp, success: true, detail: { risk_reasons: getTestIdentityRiskReasons(input) } });

    return c.json({
      ok: true,
      test_identity: row,
      secret,
      secret_prefix: secretPrefix,
      agent_command: buildTestAgentCommand(c, row, secret),
      preview_url: input.preview_enabled ? buildPreviewUrl(getRequestOrigin(c), row.name, secret) : null,
      risk_reasons: getTestIdentityRiskReasons(input),
    });
  } catch (e: any) {
    if (String(e?.message || '').includes('UNIQUE constraint failed: test_identities.name')) {
      return c.json({ ok: false, error: '测试身份 name 已存在，请换一个 name。' }, 409);
    }
    return c.json({ ok: false, error: e.message || 'Unable to create test identity' }, 400);
  }
});

app.get('/api/admin/test-identities/by-name/:name', async (c) => {
  await cleanupExpiredTestIdentities(c);
  const name = normalizeTestName(c.req.param('name'));
  const row: any = await c.env.DB.prepare(`
    SELECT ti.*, tis.secret_prefix
    FROM test_identities ti
    LEFT JOIN test_identity_secrets tis ON tis.test_identity_id = ti.id AND tis.status = 'active'
    WHERE ti.name = ? AND ti.deleted_at IS NULL
  `).bind(name).first();
  if (!row) return c.json({ error: 'Test identity not found' }, 404);
  const identity = normalizeTestIdentityRow(row);
  const secretInfo = await getActiveTestSecret(c, row.id);
  return c.json({
    ok: true,
    test_identity: identity,
    activity: await getTestActivity(c, row.id),
    secret: secretInfo.secret,
    secret_prefix: secretInfo.secret_prefix,
    agent_command: secretInfo.secret ? buildTestAgentCommand(c, identity, secretInfo.secret) : null,
    preview_url: identity.preview_enabled && secretInfo.secret ? buildPreviewUrl(getRequestOrigin(c), identity.name, secretInfo.secret) : null,
  });
});

app.get('/api/admin/test-identities/:id/activity', async (c) => {
  const id = c.req.param('id');
  const identity: any = await c.env.DB.prepare('SELECT * FROM test_identities WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!identity) return c.json({ error: 'Test identity not found' }, 404);
  const secretInfo = await getActiveTestSecret(c, id);
  return c.json({
    ok: true,
    activity: await getTestActivity(c, id),
    secret: secretInfo.secret,
    secret_prefix: secretInfo.secret_prefix,
    agent_command: identity && secretInfo.secret ? buildTestAgentCommand(c, normalizeTestIdentityRow(identity), secretInfo.secret) : null,
    preview_url: normalizeTestIdentityRow(identity)?.preview_enabled && secretInfo.secret
      ? buildPreviewUrl(getRequestOrigin(c), identity.name, secretInfo.secret)
      : null,
  });
});

app.put('/api/admin/test-identities/:id', async (c) => {
  const id = c.req.param('id');
  const identity: any = await c.env.DB.prepare('SELECT * FROM test_identities WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!identity) return c.json({ error: 'Test identity not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const nextAllowedSubapps = parseJsonArrayField(body?.allowed_subapps ?? identity.allowed_subapps);
  if (!nextAllowedSubapps.length) return c.json({ error: 'Allowed subapps is required' }, 400);
  const nextDataScope = TEST_DATA_SCOPES.has(String(body?.data_scope || identity.data_scope))
    ? String(body?.data_scope || identity.data_scope)
    : String(identity.data_scope || 'public_read');
  const nextRole = TEST_ROLES.has(String(body?.role || identity.role))
    ? String(body?.role || identity.role)
    : String(identity.role || 'user');
  const nextTarget = String(body?.target_default_subapp || identity.target_default_subapp || nextAllowedSubapps[0] || '').trim() || null;
  const nextApiLimit = normalizeLimitValue(body?.max_api_calls_per_session ?? identity.max_api_calls_per_session);
  const nextPreviewEnabled = body?.preview_enabled === undefined
    ? normalizePreviewEnabled(identity.preview_enabled)
    : normalizePreviewEnabled(body?.preview_enabled);
  const input = {
    ...normalizeTestIdentityRow(identity),
    role: nextRole,
    data_scope: nextDataScope,
    allowed_subapps: nextAllowedSubapps,
    target_default_subapp: nextTarget,
    max_api_calls_per_session: nextApiLimit,
    preview_enabled: nextPreviewEnabled,
  };
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE test_identities
    SET role = ?, allowed_subapps = ?, target_default_subapp = ?, data_scope = ?, max_api_calls_per_session = ?, preview_enabled = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `).bind(
    nextRole,
    JSON.stringify(nextAllowedSubapps),
    nextTarget,
    nextDataScope,
    nextApiLimit,
    nextPreviewEnabled ? 1 : 0,
    now,
    id
  ).run();
  if (!nextPreviewEnabled) {
    await c.env.DB.prepare(`
      UPDATE test_sessions
      SET status = 'revoked', revoked_at = ?
      WHERE test_identity_id = ? AND target_subapp = 'auth-center-preview' AND revoked_at IS NULL
    `).bind(now, id).run();
  }
  await writeTestAudit(c, {
    testIdentityId: id,
    eventType: 'admin_update_test_identity',
    targetSubapp: nextTarget || undefined,
    success: true,
    detail: { risk_reasons: getTestIdentityRiskReasons(input), fields: ['role', 'allowed_subapps', 'target_default_subapp', 'data_scope', 'max_api_calls_per_session', 'preview_enabled'] },
  });
  if (normalizePreviewEnabled(identity.preview_enabled) !== nextPreviewEnabled) {
    await writeTestAudit(c, {
      testIdentityId: id,
      eventType: nextPreviewEnabled ? 'admin_enable_test_preview' : 'admin_disable_test_preview',
      targetSubapp: 'auth-center-preview',
      success: true,
    });
  }
  const row: any = await c.env.DB.prepare('SELECT * FROM test_identities WHERE id = ?').bind(id).first();
  return c.json({ ok: true, test_identity: normalizeTestIdentityRow(row), risk_reasons: getTestIdentityRiskReasons(input) });
});

app.post('/api/admin/test-identities/:id/rotate-secret', async (c) => {
  const id = c.req.param('id');
  const identity: any = await c.env.DB.prepare('SELECT * FROM test_identities WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!identity) return c.json({ error: 'Test identity not found' }, 404);
  const latest: any = await c.env.DB.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM test_identity_secrets WHERE test_identity_id = ?').bind(id).first();
  const secret = randomToken('sk_test_');
  const secretPrefix = `${secret.slice(0, 15)}****`;
  const secretCipher = await encryptTestSecret(c, secret);
  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE test_identity_secrets SET status = 'revoked', revoked_at = ?, rotated_at = ? WHERE test_identity_id = ? AND status = 'active'").bind(now, now, id).run();
  await c.env.DB.prepare(`
    INSERT INTO test_identity_secrets (id, test_identity_id, secret_hash, secret_cipher, secret_prefix, version, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
  `).bind(crypto.randomUUID(), id, await hashTestSecret(secret), secretCipher, secretPrefix, Number(latest?.version || 0) + 1, now).run();
  await c.env.DB.prepare('UPDATE test_identities SET updated_at = ? WHERE id = ?').bind(now, id).run();
  await writeTestAudit(c, { testIdentityId: id, eventType: 'admin_rotate_test_secret', targetSubapp: identity.target_default_subapp, success: true });
  const normalized = normalizeTestIdentityRow({ ...identity, secret_prefix: secretPrefix });
  return c.json({
    ok: true,
    secret,
    secret_prefix: secretPrefix,
    agent_command: buildTestAgentCommand(c, normalized, secret),
    preview_url: normalized.preview_enabled ? buildPreviewUrl(getRequestOrigin(c), normalized.name, secret) : null,
  });
});

app.post('/api/admin/test-identities/:id/disable', async (c) => {
  const id = c.req.param('id');
  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE test_identities SET status = 'disabled', disabled_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id).run();
  await c.env.DB.prepare("UPDATE test_sessions SET status = 'revoked', revoked_at = ? WHERE test_identity_id = ? AND revoked_at IS NULL").bind(now, id).run();
  await writeTestAudit(c, { testIdentityId: id, eventType: 'admin_disable_test_identity', success: true });
  return c.json({ ok: true });
});

app.post('/api/admin/test-identities/:id/enable', async (c) => {
  const id = c.req.param('id');
  const now = new Date().toISOString();
  const identity: any = await c.env.DB.prepare('SELECT expires_at FROM test_identities WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!identity) return c.json({ error: 'Test identity not found' }, 404);
  if (Date.parse(identity.expires_at) <= Date.now()) {
    await cleanupExpiredTestIdentities(c);
    return c.json({ error: '测试身份已过期并删除' }, 410);
  }
  await c.env.DB.prepare("UPDATE test_identities SET status = 'active', disabled_at = NULL, updated_at = ? WHERE id = ?").bind(now, id).run();
  await c.env.DB.prepare(`
    UPDATE test_identity_secrets
    SET status = 'active', revoked_at = NULL
    WHERE id = (
      SELECT id FROM test_identity_secrets
      WHERE test_identity_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    )
  `).bind(id).run();
  await writeTestAudit(c, { testIdentityId: id, eventType: 'admin_enable_test_identity', success: true });
  return c.json({ ok: true });
});

app.post('/api/admin/test-identities/:id/revoke-sessions', async (c) => {
  const id = c.req.param('id');
  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE test_sessions SET status = 'revoked', revoked_at = ? WHERE test_identity_id = ? AND revoked_at IS NULL").bind(now, id).run();
  await writeTestAudit(c, { testIdentityId: id, eventType: 'admin_revoke_test_sessions', success: true });
  return c.json({ ok: true });
});

app.delete('/api/admin/test-identities/:id', async (c) => {
  const id = c.req.param('id');
  const now = new Date().toISOString();
  const row: any = await c.env.DB.prepare('SELECT name FROM test_identities WHERE id = ?').bind(id).first();
  const tombstoneName = row?.name ? `${row.name}__deleted__${String(id).slice(-8)}__${Date.now()}` : null;
  await c.env.DB.prepare("UPDATE test_identities SET name = COALESCE(?, name), status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?").bind(tombstoneName, now, now, id).run();
  await c.env.DB.prepare("UPDATE test_sessions SET status = 'revoked', revoked_at = ? WHERE test_identity_id = ? AND revoked_at IS NULL").bind(now, id).run();
  await c.env.DB.prepare("UPDATE test_identity_secrets SET status = 'revoked', revoked_at = ? WHERE test_identity_id = ? AND status = 'active'").bind(now, id).run();
  await writeTestAudit(c, { testIdentityId: id, eventType: 'admin_delete_test_identity', success: true });
  return c.json({ ok: true });
});

app.post('/api/test-auth/usage', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const appId = String(body?.subapp || body?.app_id || '').trim();
  const identityId = String(body?.test_identity_id || body?.uuid || '').trim();
  const authHeader = c.req.header('Authorization');
  const secret = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (!appId || !identityId || !secret) return c.json({ error: 'Missing fields' }, 400);
  const appRecord: any = await c.env.DB.prepare('SELECT secret_key FROM apps WHERE app_id = ?').bind(appId).first();
  if (!appRecord || appRecord.secret_key !== secret) return c.json({ error: 'Unauthorized' }, 401);
  await c.env.DB.prepare(`
    INSERT INTO test_api_usage_records (id, test_identity_id, session_id, subapp, api_path, method, amount, status_code, created_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    identityId,
    body?.session_id || null,
    appId,
    body?.api_path || null,
    body?.method || null,
    Math.max(1, Number(body?.amount || 1)),
    body?.status_code == null ? null : Number(body.status_code),
    new Date().toISOString(),
    body?.metadata === undefined ? null : JSON.stringify(body.metadata)
  ).run();
  return c.json({ ok: true });
});

// Users CRUD
app.get('/admin/users', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT user_id, id, uuid, username, name, email, email_verified, role, status, auth_provider, password_plain, cookie_expiry_days, created_at, updated_at, last_login_at, github_id, birthday, avatar_data, avatar_key FROM users'
  ).all();
  return c.json((results || []).map((user: any) => toUserSummary(c, user)));
});

app.post('/admin/users', async (c) => {
  const body = await c.req.json();
  const username = String(body?.username || '').trim();
  const name = String(body?.name || '').trim();
  const password = String(body?.password || '');
  const cookieExpiryDays = Math.max(1, Number(body?.cookie_expiry_days) || 7);
  const birthday = body?.birthday || null;
  const avatarData = body?.avatar_data || null;
  if (!username || !name || !password) return c.json({ error: 'Username, full name, and password are required' }, 400);
  const existingUser: any = await c.env.DB.prepare('SELECT uuid FROM users WHERE lower(username) = lower(?)').bind(username).first();
  if (existingUser) return c.json({ error: 'Username already exists' }, 409);
  const uuid = crypto.randomUUID();
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  let avatarKey: string | null = null;

  try {
    avatarKey = await resolveAvatarKeyUpdate(c, uuid, avatarData, null);
    await c.env.DB.prepare(
      "INSERT INTO users (id, uuid, username, name, role, status, auth_provider, email_verified, password_hash, password_salt, password_plain, cookie_expiry_days, birthday, avatar_data, avatar_key, updated_at) VALUES (?, ?, ?, ?, 'user', 'active', 'sso', 0, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
    ).bind(uuid, uuid, username, name, hash, salt, password, cookieExpiryDays, birthday, null, avatarKey).run();
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
  await c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL').bind(uuid).run().catch(() => null);
  await c.env.DB.prepare('UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE uuid = ? AND revoked_at IS NULL').bind(uuid).run().catch(() => null);
  return c.json({ success: true });
});

app.delete('/admin/users/:uuid', async (c) => {
  const uuid = c.req.param('uuid');
  const user: any = await c.env.DB.prepare('SELECT avatar_key FROM users WHERE uuid = ?').bind(uuid).first();
  await deleteAvatarIfPresent(c, user?.avatar_key);
  await c.env.DB.prepare('DELETE FROM user_apps WHERE uuid = ?').bind(uuid).run().catch(() => null);
  await c.env.DB.prepare('DELETE FROM user_sessions WHERE uuid = ?').bind(uuid).run().catch(() => null);
  await c.env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(uuid).run().catch(() => null);
  await c.env.DB.prepare('DELETE FROM user_credentials WHERE user_id = ?').bind(uuid).run().catch(() => null);
  await c.env.DB.prepare('DELETE FROM passkeys WHERE uuid = ?').bind(uuid).run();
  await c.env.DB.prepare('DELETE FROM users WHERE uuid = ?').bind(uuid).run();
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
    const existingApp: any = await c.env.DB.prepare('SELECT app_id FROM apps WHERE app_id = ?').bind(app_id).first();
    if (existingApp) return c.json({ error: 'App ID already exists' }, 409);
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
  await c.env.DB.prepare('DELETE FROM user_apps WHERE app_id = ?').bind(appId).run().catch(() => null);
  await c.env.DB.prepare('DELETE FROM test_api_usage_records WHERE subapp = ?').bind(appId).run().catch(() => null);
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
  if (new URL(c.req.url).pathname.startsWith('/preview')) {
    setPreviewResponseHeaders(c);
  }
  return await c.env.ASSETS.fetch(new Request(new URL('/', c.req.url).toString(), c.req.raw));
});

export default {
  fetch: app.fetch,
  async scheduled(_event: any, env: Bindings) {
    await cleanupExpiredAvatarDeletes(env);
    await cleanupExpiredPendingRegistrations(env);
    await releaseExpiredRegisterInvites(env);
  },
};
