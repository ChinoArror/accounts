import type { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { generateSalt, generateJWT, verifyJWT } from './auth';

type Ctx = any;

type RegistrationMode = 'open' | 'closed' | 'time_window' | 'invite_only';

const EMAIL_DOMAIN = 'aryuki.com';
const ACCESS_TOKEN_TTL_DEFAULT = 3600;
const REFRESH_TOKEN_TTL_DEFAULT = 2592000;
const VERIFY_TOKEN_MINUTES = 60;
const RESET_TOKEN_MINUTES = 30;
const OTP_TOKEN_MINUTES = 10;
const PASSWORD_PBKDF2_ITERATIONS = 100000;

function nowIso() {
  return new Date().toISOString();
}

function addMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function envString(c: Ctx, key: string, fallback = '') {
  return String(c.env?.[key] ?? fallback);
}

function envInt(c: Ctx, key: string, fallback: number) {
  const value = Number(c.env?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function getPublicBaseUrl(c: Ctx) {
  return envString(c, 'PUBLIC_BASE_URL') || new URL(c.req.url).origin;
}

function buildAvatarUrl(c: Ctx, uuid?: string | null, avatarKey?: string | null, legacyAvatarData?: string | null) {
  if (!uuid || (!avatarKey && !legacyAvatarData)) return null;
  return `${getPublicBaseUrl(c)}/api/avatar/${encodeURIComponent(uuid)}`;
}

function getClientIp(c: Ctx) {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || '0.0.0.0';
}

function getUserAgent(c: Ctx) {
  return c.req.header('User-Agent') || '';
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashSecret(c: Ctx, value: string) {
  return sha256Hex(`${envString(c, 'PASSWORD_PEPPER')}:${value}`);
}

async function ipHash(c: Ctx) {
  return hashSecret(c, getClientIp(c));
}

function safeJson(input: unknown) {
  try {
    return typeof input === 'string' ? JSON.parse(input) : input || {};
  } catch {
    return {};
  }
}

function normalizeEmail(input: unknown) {
  const email = String(input || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function emailDomain(email: string) {
  return email.split('@').pop()?.trim().toLowerCase() || '';
}

function csvList(value: unknown) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function passwordProblem(password: string) {
  if (password.length < 8) return '密码至少需要 8 位，并包含字母和数字。';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return '密码至少需要包含字母和数字。';
  return '';
}

function publicRegistrationRules(c: Ctx) {
  const mode = (envString(c, 'REGISTRATION_MODE', 'open') as RegistrationMode) || 'open';
  const start = envString(c, 'REGISTRATION_START_AT');
  const end = envString(c, 'REGISTRATION_END_AT');
  const allowed = csvList(envString(c, 'ALLOWED_EMAIL_DOMAINS', EMAIL_DOMAIN));
  const blocked = csvList(c.env?.BLOCKED_EMAIL_DOMAINS);
  const now = Date.now();
  const startMs = start ? Date.parse(start) : Number.NaN;
  const endMs = end ? Date.parse(end) : Number.NaN;
  const inWindow = (!start || (!Number.isNaN(startMs) && now >= startMs)) && (!end || (!Number.isNaN(endMs) && now <= endMs));
  const emailRegistrationAllowed = mode === 'open' || (mode === 'time_window' && inWindow);
  return {
    mode,
    start_at: start || null,
    end_at: end || null,
    email_registration_allowed: emailRegistrationAllowed,
    invite_registration_allowed: mode !== 'closed' || envString(c, 'ALLOW_REGISTER_CODE_WHEN_CLOSED', 'true') === 'true',
    allowed_email_domains_hint: allowed.length ? allowed.join(', ') : `${EMAIL_DOMAIN}`,
    blocked_email_domains_configured: blocked.length > 0,
    limits: {
      max_global_registrations_per_day: envInt(c, 'MAX_GLOBAL_REGISTRATIONS_PER_DAY', 100),
      max_registrations_per_ip_per_hour: envInt(c, 'MAX_REGISTRATIONS_PER_IP_PER_HOUR', 3),
      max_registrations_per_ip_per_day: envInt(c, 'MAX_REGISTRATIONS_PER_IP_PER_DAY', 5),
      max_verify_emails_per_email_per_day: envInt(c, 'MAX_VERIFY_EMAILS_PER_EMAIL_PER_DAY', 3),
    },
    turnstile_site_key: envString(c, 'TURNSTILE_SITE_KEY'),
  };
}

async function publicRegistrationRulesAsync(c: Ctx) {
  return {
    ...publicRegistrationRules(c),
    external_registration_enabled: await externalRegistrationEnabled(c),
  };
}

function assertEmailDomain(c: Ctx, email: string) {
  const domain = emailDomain(email);
  const allowed = csvList(envString(c, 'ALLOWED_EMAIL_DOMAINS', EMAIL_DOMAIN));
  const blocked = csvList(c.env?.BLOCKED_EMAIL_DOMAINS);
  if (blocked.includes(domain)) return '该邮箱域名暂不支持注册';
  if (allowed.length && !allowed.includes(domain)) return '该邮箱域名暂不支持注册';
  return '';
}

async function verifyTurnstile(c: Ctx, token: unknown) {
  const secret = envString(c, 'TURNSTILE_SECRET_KEY');
  if (!secret) return { ok: false, message: 'Turnstile secret is not configured.' };
  const body = new FormData();
  body.set('secret', secret);
  body.set('response', String(token || ''));
  body.set('remoteip', getClientIp(c));
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  const data: any = await response.json().catch(() => ({}));
  return { ok: !!data.success, message: data.success ? '' : 'Turnstile verification failed.' };
}

async function incrementCounter(c: Ctx, type: string, key: string, windowMs: number, max: number) {
  if (!max || max <= 0) return true;
  const now = new Date();
  const bucketStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const bucketEnd = new Date(bucketStart.getTime() + windowMs);
  const id = `${type}:${key}:${bucketStart.toISOString()}`;
  const current: any = await c.env.DB.prepare('SELECT count FROM registration_counters WHERE id = ?').bind(id).first();
  if (current && Number(current.count) >= max) return false;
  if (current) {
    await c.env.DB.prepare('UPDATE registration_counters SET count = count + 1 WHERE id = ?').bind(id).run();
  } else {
    await c.env.DB.prepare(`
      INSERT INTO registration_counters (id, counter_type, counter_key, count, window_start, window_end)
      VALUES (?, ?, ?, 1, ?, ?)
    `).bind(id, type, key, bucketStart.toISOString(), bucketEnd.toISOString()).run();
  }
  return true;
}

async function getSetting(c: Ctx, key: string, fallback: any) {
  try {
    const row: any = await c.env.DB.prepare('SELECT value FROM auth_settings WHERE key = ?').bind(key).first();
    return row ? safeJson(row.value) : fallback;
  } catch {
    return fallback;
  }
}

async function setSetting(c: Ctx, key: string, value: any) {
  const serialized = JSON.stringify(value);
  await c.env.DB.prepare(`
    INSERT INTO auth_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, serialized, nowIso()).run();
}

function normalizePermissionConfig(input: any) {
  const permissions = Array.isArray(input?.permissions)
    ? input.permissions.map((permission: any) => ({
      app_id: String(permission?.app_id || '').trim(),
      rpm_limit: permission?.rpm_limit === '' || permission?.rpm_limit === undefined ? null : Number(permission.rpm_limit),
      rpd_limit: permission?.rpd_limit === '' || permission?.rpd_limit === undefined ? null : Number(permission.rpd_limit),
      daily_token_limit: permission?.daily_token_limit === '' || permission?.daily_token_limit === undefined ? null : Number(permission.daily_token_limit),
    })).filter((permission: any) => permission.app_id)
    : [];
  return {
    cookie_expiry_days: Math.max(1, Number(input?.cookie_expiry_days || 7)),
    permissions,
  };
}

async function applyPermissionConfig(c: Ctx, uuid: string, config: any, replace = false) {
  const normalized = normalizePermissionConfig(config);
  const today = new Date().toISOString().split('T')[0];
  if (replace) {
    await c.env.DB.prepare('DELETE FROM user_apps WHERE uuid = ?').bind(uuid).run();
  }
  await c.env.DB.prepare('UPDATE users SET cookie_expiry_days = ?, updated_at = ? WHERE uuid = ? OR id = ?')
    .bind(normalized.cookie_expiry_days, nowIso(), uuid, uuid).run();
  for (const permission of normalized.permissions) {
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

async function defaultRegistrationConfig(c: Ctx) {
  return normalizePermissionConfig(await getSetting(c, 'default_registration_config', { cookie_expiry_days: 7, permissions: [] }));
}

async function externalRegistrationEnabled(c: Ctx) {
  const value = await getSetting(c, 'external_registration_enabled', true);
  return value !== false;
}

function containsAdmin(value: string) {
  return /admin/i.test(value || '');
}

async function findRegisterCode(c: Ctx, plainCode: string) {
  const codeHash = await hashSecret(c, plainCode);
  return c.env.DB.prepare(`
    SELECT * FROM register_codes
    WHERE code_hash = ? OR code = ?
    LIMIT 1
  `).bind(codeHash, plainCode).first();
}

function registerCodeUnavailable(record: any) {
  if (!record) return true;
  if (record.disabled_at || record.status === 'pause' || record.status === 'used') return true;
  if (record.expires_at && Date.parse(record.expires_at) <= Date.now()) return true;
  if (record.max_uses !== null && record.max_uses !== undefined && Number(record.used_count || 0) >= Number(record.max_uses)) return true;
  return false;
}

async function logAudit(c: Ctx, eventType: string, success: boolean, detail: Record<string, unknown> = {}, userId: string | null = null) {
  await c.env.DB.prepare(`
    INSERT INTO auth_audit_logs (id, user_id, event_type, ip_hash, user_agent, success, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    eventType,
    await ipHash(c),
    getUserAgent(c),
    success ? 1 : 0,
    JSON.stringify(detail),
    nowIso()
  ).run();
}

async function hashPasswordV2(c: Ctx, password: string, salt: string) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(`${password}:${envString(c, 'PASSWORD_PEPPER')}`), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: enc.encode(salt),
    iterations: PASSWORD_PBKDF2_ITERATIONS,
    hash: 'SHA-256',
  }, keyMaterial, 256);
  return Array.from(new Uint8Array(bits)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyPasswordV2(c: Ctx, password: string, stored: string, legacySalt?: string | null, legacyHash?: string | null) {
  if (stored?.startsWith('pbkdf2-sha256$')) {
    const [, iterations, salt, hash] = stored.split('$');
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(`${password}:${envString(c, 'PASSWORD_PEPPER')}`), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: Number(iterations) || PASSWORD_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    }, keyMaterial, 256);
    const computed = Array.from(new Uint8Array(bits)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return computed === hash;
  }
  if (legacySalt && legacyHash) {
    const { verifyPassword } = await import('./auth');
    return verifyPassword(password, legacySalt, legacyHash);
  }
  return false;
}

async function createPasswordHash(c: Ctx, password: string) {
  const salt = generateSalt();
  return `pbkdf2-sha256$${PASSWORD_PBKDF2_ITERATIONS}$${salt}$${await hashPasswordV2(c, password, salt)}`;
}

function buildEmailLayout(title: string, heading: string, intro: string, mainContent: string, actionUrl: string, actionText: string) {
  const safeUrl = escapeHtml(actionUrl);
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="padding:24px 28px;border-bottom:1px solid #eef0f3;"><div style="font-size:20px;font-weight:700;color:#111827;">Auth Center</div><div style="font-size:13px;color:#6b7280;margin-top:4px;">安全登录与账号验证</div></td></tr>
<tr><td style="padding:28px;"><h1 style="margin:0 0 16px;font-size:22px;line-height:1.35;color:#111827;">${escapeHtml(heading)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#374151;">${escapeHtml(intro)}</p>${mainContent}
${actionUrl ? `<div style="margin:28px 0;"><a href="${safeUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 18px;border-radius:10px;">${escapeHtml(actionText)}</a></div>
<p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#6b7280;">如果按钮无法点击，请复制以下链接到浏览器打开：</p>
<p style="word-break:break-all;margin:0;font-size:12px;line-height:1.6;color:#4b5563;">${safeUrl}</p>` : ''}
</td></tr>
<tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #eef0f3;"><p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">如果这不是你本人操作，请忽略此邮件，或立即修改密码并联系管理员。</p><p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">© ${new Date().getFullYear()} Auth Center. This is an automated security email.</p></td></tr>
</table></td></tr></table></body></html>`;
}

function escapeHtml(value: string) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

function renderEmail(templateName: string, payload: any) {
  const appUrl = String(payload.action_url || '');
  const expire = String(payload.expire_minutes || VERIFY_TOKEN_MINUTES);
  const username = String(payload.username || payload.username_or_email || 'there');
  const security = '\n\n如果这不是你本人操作，请忽略此邮件，或立即修改密码并联系管理员。';

  if (templateName === 'login_otp') {
    const code = String(payload.code || '');
    const title = '你的登录验证码 - Auth Center';
    const intro = `你好，${username}：你的登录验证码将在 ${expire} 分钟后失效，请勿将验证码告诉他人。`;
    const html = buildEmailLayout(title, '你的登录验证码', intro, `<div style="font-size:32px;font-weight:800;letter-spacing:6px;background:#f3f4f6;border-radius:12px;padding:16px;text-align:center;margin:20px 0;">${escapeHtml(code)}</div>`, '', '');
    return { subject: title, html, text: `你好，${username}：\n\n你的登录验证码是：${code}\n\n验证码将在 ${expire} 分钟后失效。请勿将验证码告诉他人。${security}` };
  }

  const templates: Record<string, { subject: string; heading: string; intro: string; action: string }> = {
    verify_email: {
      subject: '验证你的邮箱 - Auth Center',
      heading: '验证你的邮箱',
      intro: `你好，${username}：你正在注册 Auth Center 账号。请点击下方按钮完成邮箱验证。此链接将在 ${expire} 分钟后失效。`,
      action: '验证邮箱',
    },
    password_reset: {
      subject: '重置你的密码 - Auth Center',
      heading: '重置你的密码',
      intro: `你好，${username}：我们收到了你的密码重置请求。请点击下方按钮设置新密码。此链接将在 ${expire} 分钟后失效。`,
      action: '重置密码',
    },
    email_change: {
      subject: '确认你的新邮箱 - Auth Center',
      heading: '确认你的新邮箱',
      intro: `你好，${username}：请点击下方按钮确认将账号邮箱修改为 ${payload.new_email || ''}。此链接将在 ${expire} 分钟后失效。`,
      action: '确认邮箱',
    },
    password_changed: {
      subject: '你的密码已修改 - Auth Center',
      heading: '密码已修改',
      intro: `你好，${username}：你的 Auth Center 密码已经修改。如果这不是你本人操作，请立即联系管理员。`,
      action: '查看账号安全',
    },
    email_changed: {
      subject: '你的邮箱已修改 - Auth Center',
      heading: '邮箱已修改',
      intro: `你好，${username}：你的 Auth Center 邮箱已经修改为 ${payload.new_email || ''}。`,
      action: '查看账号安全',
    },
    new_device_login: {
      subject: '新设备登录提醒 - Auth Center',
      heading: '新设备登录提醒',
      intro: `你好，${username}：你的账号刚刚完成一次登录。若非本人操作，请立即修改密码。`,
      action: '查看登录设备',
    },
    login_failures: {
      subject: '连续登录失败提醒 - Auth Center',
      heading: '连续登录失败提醒',
      intro: `你好，${username}：你的账号出现连续登录失败。若非本人操作，请检查账号安全。`,
      action: '查看账号安全',
    },
    account_disabled: {
      subject: '账号已被管理员禁用 - Auth Center',
      heading: '账号已禁用',
      intro: `你好，${username}：你的账号已被管理员禁用，如有疑问请联系管理员。`,
      action: '打开 Auth Center',
    },
    account_enabled: {
      subject: '账号已恢复 - Auth Center',
      heading: '账号已恢复',
      intro: `你好，${username}：你的账号已被管理员恢复，可以继续使用 Auth Center。`,
      action: '打开 Auth Center',
    },
    test_email: {
      subject: 'send test',
      heading: 'send test',
      intro: 'This is a Cloudflare Email Service test from Auth Center.',
      action: 'Open Auth Center',
    },
  };
  const item = templates[templateName] || templates.new_device_login;
  const html = buildEmailLayout(item.subject, item.heading, item.intro, `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#6b7280;">有效期：${escapeHtml(expire)} 分钟。请勿将邮件链接或验证码告诉他人。</p>`, appUrl, item.action);
  return { subject: item.subject, html, text: `${item.intro}\n\n${appUrl ? `${item.action}: ${appUrl}\n\n` : ''}有效期：${expire} 分钟。${security}` };
}

async function enqueueEmail(c: Ctx, toEmail: string, templateName: string, payload: Record<string, unknown>, subjectOverride = '') {
  const rendered = renderEmail(templateName, payload);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO email_jobs (id, to_email, subject, template_name, payload, status, attempts, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)
  `).bind(id, toEmail, subjectOverride || rendered.subject, templateName, JSON.stringify({ ...payload, subject: rendered.subject }), nowIso()).run();
  c.executionCtx?.waitUntil?.(sendEmailJob(c, id));
  return id;
}

async function sendEmailJob(c: Ctx, jobId: string) {
  const job: any = await c.env.DB.prepare('SELECT * FROM email_jobs WHERE id = ?').bind(jobId).first();
  if (!job || job.status === 'sent') return;
  const payload = safeJson(job.payload);
  const rendered = renderEmail(job.template_name, payload);
  try {
    if (!c.env.EMAIL?.send) throw new Error('EMAIL binding is not configured.');
    const fromEmail = envString(c, 'EMAIL_FROM', `noreply@${EMAIL_DOMAIN}`);
    await c.env.EMAIL.send({
      to: job.to_email,
      from: { email: fromEmail, name: envString(c, 'APP_NAME', 'Auth Center') },
      subject: job.subject || rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await c.env.DB.prepare("UPDATE email_jobs SET status = 'sent', attempts = attempts + 1, sent_at = ?, last_error = NULL WHERE id = ?").bind(nowIso(), jobId).run();
  } catch (error: any) {
    await c.env.DB.prepare("UPDATE email_jobs SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE id = ?").bind(String(error?.message || error), jobId).run();
  }
}

async function createToken(c: Ctx, type: string, userId: string | null, email: string | null, value: string, expiresAt: string, metadata: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO auth_tokens (id, user_id, email, token_hash, type, expires_at, created_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, userId, email, await hashSecret(c, value), type, expiresAt, nowIso(), JSON.stringify(metadata)).run();
  return id;
}

async function consumeToken(c: Ctx, type: string, value: string, email?: string | null) {
  const tokenHash = await hashSecret(c, value);
  const token: any = await c.env.DB.prepare(`
    SELECT * FROM auth_tokens
    WHERE token_hash = ? AND type = ? AND used_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(tokenHash, type).first();
  if (!token) return null;
  if (email && token.email && token.email.toLowerCase() !== email.toLowerCase()) return null;
  if (Date.parse(token.expires_at) <= Date.now()) return null;
  await c.env.DB.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ?').bind(nowIso(), token.id).run();
  return token;
}

async function findUserByEmail(c: Ctx, email: string) {
  return c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?').bind(email.toLowerCase()).first();
}

async function findUserByUuid(c: Ctx, uuid: string) {
  return c.env.DB.prepare('SELECT * FROM users WHERE uuid = ? OR id = ?').bind(uuid, uuid).first();
}

async function getUserCredential(c: Ctx, uuid: string) {
  return c.env.DB.prepare('SELECT * FROM user_credentials WHERE user_id = ?').bind(uuid).first();
}

async function createSessionAndJwt(c: Ctx, user: any, appId = 'auth-center') {
  const accessTtl = envInt(c, 'ACCESS_TOKEN_TTL_SECONDS', ACCESS_TOKEN_TTL_DEFAULT);
  const refreshTtl = envInt(c, 'REFRESH_TOKEN_TTL_SECONDS', REFRESH_TOKEN_TTL_DEFAULT);
  const refreshToken = crypto.randomUUID() + crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + refreshTtl * 1000).toISOString();
  await c.env.DB.prepare(`
    INSERT INTO auth_sessions (id, user_id, refresh_token_hash, user_agent, ip_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(sessionId, user.uuid || user.id, await hashSecret(c, refreshToken), getUserAgent(c), await ipHash(c), nowIso(), expiresAt).run();
  await c.env.DB.prepare(`
    INSERT INTO user_sessions (session_id, uuid, username, ip_address, user_agent, browser, device_type, app_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(sessionId, user.uuid || user.id, user.username, getClientIp(c), getUserAgent(c), 'Unknown', 'Unknown', appId, expiresAt).run().catch(() => null);
  await c.env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE uuid = ? OR id = ?').bind(nowIso(), nowIso(), user.uuid || user.id, user.uuid || user.id).run();
  const token = await generateJWT({
    sub: user.uuid || user.id,
    uuid: user.uuid || user.id,
    user_id: user.user_id || user.id || user.uuid,
    username: user.username,
    name: user.name || user.username,
    email: user.email || null,
    email_verified: !!user.email_verified,
    role: user.role || 'user',
    status: user.status || 'active',
    auth_provider: user.auth_provider || 'email',
    avatar_url: buildAvatarUrl(c, user.uuid || user.id, user.avatar_key, user.avatar_data),
    session_id: sessionId,
    iat: Math.floor(Date.now() / 1000),
  }, c.env.JWT_SECRET, accessTtl / 86400);
  setCookie(c, 'auth_refresh', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: refreshTtl,
  });
  setCookie(c, 'sso_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: accessTtl,
  });
  return { token, sessionId };
}

async function requireAuth(c: Ctx) {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : getCookie(c, 'sso_session');
  if (!token) return null;
  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    const user = await findUserByUuid(c, payload.sub || payload.uuid);
    if (!user || !['active', 'pending'].includes(user.status)) return null;
    return { payload, user };
  } catch {
    return null;
  }
}

async function requireAdmin(c: Ctx) {
  const active = await requireAuth(c);
  if (active?.payload?.role === 'admin' || active?.user?.role === 'admin') return active;
  const authHeader = c.req.header('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    try {
      const payload = await verifyJWT(authHeader.substring(7), c.env.JWT_SECRET);
      if (payload.role === 'admin' || payload.uuid === 'admin' || payload.sub === 'admin') {
        return {
          payload,
          user: {
            uuid: 'admin',
            id: 'admin',
            username: c.env.ADMIN_USERNAME || payload.username || 'admin',
            name: payload.name || 'Admin',
            email: c.env.ADMIN_EMAIL || payload.email || null,
            email_verified: true,
            role: 'admin',
            status: 'active',
          },
        };
      }
    } catch {
      return null;
    }
  }
  if (authHeader.startsWith('Basic ')) {
    try {
      const decoded = atob(authHeader.substring(6));
      const separator = decoded.indexOf(':');
      const username = decoded.slice(0, separator);
      const password = decoded.slice(separator + 1);
      if (username === c.env.ADMIN_USERNAME && password === c.env.ADMIN_PASSWORD) {
        return {
          payload: { role: 'admin', username, sub: 'admin' },
          user: { uuid: 'admin', id: 'admin', username, role: 'admin', status: 'active' },
        };
      }
    } catch {
      return null;
    }
  }
  return null;
}

function redirectOrJson(c: Ctx, redirectUri: string | undefined, token: string, fallbackPath = '') {
  if (redirectUri) {
    const url = `${redirectUri}${redirectUri.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
    return c.json({ ok: true, token, redirect_to: url });
  }
  return c.json({ ok: true, token, ...(fallbackPath ? { redirect_to: fallbackPath } : {}) });
}

export function registerEmailAuthFeature(app: Hono<any>) {
  app.get('/api/auth/registration/rules', async (c) => c.json({ ok: true, rules: await publicRegistrationRulesAsync(c) }));

  app.post('/api/auth/register', async (c) => {
    const body: any = await c.req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const username = String(body.username || '').trim();
    const fullName = String(body.fullname || body.name || '').trim();
    const password = String(body.password || '');
    const confirm = String(body.confirm_password || password);
    const registerCode = String(body.register_code || '').trim();
    const generic = 'If the information is valid, a verification email will be sent.';
    await logAudit(c, 'register_email_attempt', true, { email_domain: email ? emailDomain(email) : null, has_register_code: !!registerCode });

    if (!(await externalRegistrationEnabled(c))) {
      return c.json({ ok: false, message: 'External registration is closed.' }, 403);
    }

    const rules = publicRegistrationRules(c);
    if (!rules.email_registration_allowed) return c.json({ ok: false, message: 'Public registration is closed.' }, 403);
    if (!email || !username || !fullName || !password || password !== confirm) return c.json({ ok: false, message: 'Please complete the required fields.' }, 400);
    if (containsAdmin(username) || containsAdmin(fullName)) return c.json({ ok: false, message: 'Username and full name cannot contain admin.' }, 400);
    const domainError = assertEmailDomain(c, email);
    if (domainError) return c.json({ ok: false, message: domainError }, 400);
    const passError = passwordProblem(password);
    if (passError) return c.json({ ok: false, message: passError }, 400);
    const turnstile = await verifyTurnstile(c, body.turnstile_token);
    if (!turnstile.ok) return c.json({ ok: false, message: 'Turnstile verification failed.' }, 400);

    const ipKey = await ipHash(c);
    const okGlobal = await incrementCounter(c, 'global_registrations_day', 'global', 86400000, envInt(c, 'MAX_GLOBAL_REGISTRATIONS_PER_DAY', 100));
    const okIpHour = await incrementCounter(c, 'ip_registrations_hour', ipKey, 3600000, envInt(c, 'MAX_REGISTRATIONS_PER_IP_PER_HOUR', 3));
    const okIpDay = await incrementCounter(c, 'ip_registrations_day', ipKey, 86400000, envInt(c, 'MAX_REGISTRATIONS_PER_IP_PER_DAY', 5));
    const okEmailAttempts = await incrementCounter(c, 'email_register_attempts_hour', email, 3600000, envInt(c, 'MAX_REGISTER_ATTEMPTS_PER_EMAIL_PER_HOUR', 5));
    const okUsernameAttempts = await incrementCounter(c, 'username_register_attempts_hour', username.toLowerCase(), 3600000, envInt(c, 'MAX_REGISTER_ATTEMPTS_PER_USERNAME_PER_HOUR', 5));
    if (!okGlobal || !okIpHour || !okIpDay || !okEmailAttempts || !okUsernameAttempts) return c.json({ ok: false, message: 'Too many requests. Please try later.' }, 429);

    const existing: any = await c.env.DB.prepare('SELECT uuid FROM users WHERE username = ? OR lower(email) = ?').bind(username, email).first();
    if (existing) return c.json({ ok: true, message: generic });

    let config = await defaultRegistrationConfig(c);
    let role = 'user';
    let codeRecord: any = null;
    if (registerCode) {
      codeRecord = await findRegisterCode(c, registerCode);
      if (registerCodeUnavailable(codeRecord)) return c.json({ ok: false, message: 'Register code is invalid.' }, 400);
      config = normalizePermissionConfig(safeJson(codeRecord.config_json));
      role = ['admin', 'moderator', 'user'].includes(codeRecord.role) ? codeRecord.role : 'user';
    }

    const uuid = crypto.randomUUID();
    try {
      const passwordHash = await createPasswordHash(c, password);
      await c.env.DB.prepare(`
        INSERT INTO users (id, uuid, username, name, email, email_verified, role, status, auth_provider, password_hash, password_salt, cookie_expiry_days, birthday, avatar_data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, 'pending', ?, ?, '', ?, ?, ?, ?, ?)
      `).bind(
        uuid,
        uuid,
        username,
        fullName,
        email,
        role,
        registerCode ? 'code' : 'email',
        passwordHash,
        config.cookie_expiry_days || 7,
        body.birthday || null,
        typeof body.avatar_data === 'string' && body.avatar_data.startsWith('data:image/') ? body.avatar_data : null,
        nowIso(),
        nowIso()
      ).run();
      await c.env.DB.prepare(`
        INSERT INTO user_credentials (user_id, password_hash, password_algo, password_updated_at)
        VALUES (?, ?, 'pbkdf2-sha256', ?)
      `).bind(uuid, passwordHash, nowIso()).run();
      await applyPermissionConfig(c, uuid, config, false);

      if (codeRecord) {
        await c.env.DB.prepare('UPDATE register_codes SET used_count = COALESCE(used_count, 0) + 1, status = CASE WHEN max_uses = 1 THEN "used" ELSE status END, used_by_uuid = COALESCE(used_by_uuid, ?), used_by_username = COALESCE(used_by_username, ?), used_at = COALESCE(used_at, CURRENT_TIMESTAMP) WHERE id = ? OR code = ?').bind(uuid, username, codeRecord.id, codeRecord.code).run();
        await c.env.DB.prepare('INSERT INTO register_code_uses (id, code_id, user_id, used_at, ip_hash) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), codeRecord.id || codeRecord.code, uuid, nowIso(), await ipHash(c)).run();
        await logAudit(c, 'register_code_success', true, { code_id: codeRecord.id || codeRecord.code, role }, uuid);
      }

      const token = crypto.randomUUID() + crypto.randomUUID();
      await createToken(c, 'email_verify', uuid, email, token, addMinutes(VERIFY_TOKEN_MINUTES));
      await enqueueEmail(c, email, 'verify_email', {
        username,
        action_url: `${getPublicBaseUrl(c)}/api/auth/email/verify?token=${encodeURIComponent(token)}`,
        expire_minutes: VERIFY_TOKEN_MINUTES,
      });
      await logAudit(c, 'register_email_success', true, { email_domain: emailDomain(email), has_register_code: !!registerCode }, uuid);
      await logAudit(c, 'email_verify_sent', true, { email }, uuid);
      return c.json({ ok: true, message: generic });
    } catch (error: any) {
      await c.env.DB.prepare('DELETE FROM user_credentials WHERE user_id = ?').bind(uuid).run().catch(() => null);
      await c.env.DB.prepare('DELETE FROM users WHERE uuid = ?').bind(uuid).run().catch(() => null);
      await logAudit(c, 'register_email_failed', false, { reason: String(error?.message || error).slice(0, 240), email_domain: emailDomain(email) });
      return c.json({ ok: false, message: 'Registration failed. Please try again later.' }, 500);
    }
  });

  app.post('/api/auth/register/email', async (c) => {
    const body: any = await c.req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const confirm = String(body.confirm_password || '');
    const generic = '如果信息有效，我们将发送验证邮件，请前往邮箱完成验证。';
    await logAudit(c, 'register_email_attempt', true, { email_domain: email ? emailDomain(email) : null });
    const rules = publicRegistrationRules(c);
    if (!rules.email_registration_allowed) return c.json({ ok: false, message: rules.mode === 'invite_only' ? '当前仅支持注册码注册' : '当前暂未开放公开注册' }, 403);
    if (!email || !username || !password || password !== confirm) return c.json({ ok: true, message: generic });
    if (containsAdmin(username)) return c.json({ ok: false, message: 'Username cannot contain admin.' }, 400);
    const domainError = assertEmailDomain(c, email);
    if (domainError) return c.json({ ok: false, message: domainError }, 400);
    const passError = passwordProblem(password);
    if (passError) return c.json({ ok: false, message: passError }, 400);
    const turnstile = await verifyTurnstile(c, body.turnstile_token);
    if (!turnstile.ok) return c.json({ ok: false, message: '真人验证失败，请刷新后重试。' }, 400);
    const ipKey = await ipHash(c);
    const okGlobal = await incrementCounter(c, 'global_registrations_day', 'global', 86400000, envInt(c, 'MAX_GLOBAL_REGISTRATIONS_PER_DAY', 100));
    const okIpHour = await incrementCounter(c, 'ip_registrations_hour', ipKey, 3600000, envInt(c, 'MAX_REGISTRATIONS_PER_IP_PER_HOUR', 3));
    const okIpDay = await incrementCounter(c, 'ip_registrations_day', ipKey, 86400000, envInt(c, 'MAX_REGISTRATIONS_PER_IP_PER_DAY', 5));
    const okEmailAttempts = await incrementCounter(c, 'email_register_attempts_hour', email, 3600000, envInt(c, 'MAX_REGISTER_ATTEMPTS_PER_EMAIL_PER_HOUR', 5));
    const okUsernameAttempts = await incrementCounter(c, 'username_register_attempts_hour', username.toLowerCase(), 3600000, envInt(c, 'MAX_REGISTER_ATTEMPTS_PER_USERNAME_PER_HOUR', 5));
    if (!okGlobal || !okIpHour || !okIpDay || !okEmailAttempts || !okUsernameAttempts) return c.json({ ok: false, message: '请求过于频繁，请稍后再试。' }, 429);
    const existing: any = await c.env.DB.prepare('SELECT uuid FROM users WHERE username = ? OR lower(email) = ?').bind(username, email).first();
    if (existing) return c.json({ ok: true, message: generic });
    const uuid = crypto.randomUUID();
    const passwordHash = await createPasswordHash(c, password);
    await c.env.DB.prepare(`
      INSERT INTO users (id, uuid, username, name, email, email_verified, role, status, auth_provider, password_hash, password_salt, cookie_expiry_days, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'user', 'pending', 'email', ?, '', 7, ?, ?)
    `).bind(uuid, uuid, username, username, email, passwordHash, nowIso(), nowIso()).run();
    await c.env.DB.prepare(`
      INSERT INTO user_credentials (user_id, password_hash, password_algo, password_updated_at)
      VALUES (?, ?, 'pbkdf2-sha256', ?)
    `).bind(uuid, passwordHash, nowIso()).run();
    const token = crypto.randomUUID() + crypto.randomUUID();
    await createToken(c, 'email_verify', uuid, email, token, addMinutes(VERIFY_TOKEN_MINUTES));
    await enqueueEmail(c, email, 'verify_email', {
      username,
      action_url: `${getPublicBaseUrl(c)}/api/auth/email/verify?token=${encodeURIComponent(token)}`,
      expire_minutes: VERIFY_TOKEN_MINUTES,
    });
    await logAudit(c, 'register_email_success', true, { email_domain: emailDomain(email) }, uuid);
    await logAudit(c, 'email_verify_sent', true, { email }, uuid);
    return c.json({ ok: true, message: generic });
  });

  app.post('/api/auth/register/code', async (c) => {
    const body: any = await c.req.json().catch(() => ({}));
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const confirm = String(body.confirm_password || '');
    const registerCode = String(body.register_code || '').trim();
    await logAudit(c, 'register_code_attempt', true, { username });
    const rules = publicRegistrationRules(c);
    if (!rules.invite_registration_allowed) return c.json({ ok: false, message: '当前暂未开放注册码注册。' }, 403);
    if (!username || !password || password !== confirm || !registerCode) return c.json({ ok: false, message: '请填写完整注册信息。' }, 400);
    const passError = passwordProblem(password);
    if (passError) return c.json({ ok: false, message: passError }, 400);
    const turnstile = await verifyTurnstile(c, body.turnstile_token);
    if (!turnstile.ok) return c.json({ ok: false, message: '真人验证失败，请刷新后重试。' }, 400);
    const existing: any = await c.env.DB.prepare('SELECT uuid FROM users WHERE username = ?').bind(username).first();
    if (existing) return c.json({ ok: false, message: '该用户名不可用。' }, 409);
    const codeHash = await hashSecret(c, registerCode);
    const record: any = await c.env.DB.prepare(`
      SELECT * FROM register_codes
      WHERE code_hash = ?
      LIMIT 1
    `).bind(codeHash).first();
    if (!record || record.disabled_at || record.status === 'pause') return c.json({ ok: false, message: '注册码不可用。' }, 403);
    if (record.expires_at && Date.parse(record.expires_at) <= Date.now()) return c.json({ ok: false, message: '注册码不可用。' }, 403);
    if (record.max_uses !== null && record.max_uses !== undefined && Number(record.used_count || 0) >= Number(record.max_uses)) return c.json({ ok: false, message: '注册码不可用。' }, 403);
    const uuid = crypto.randomUUID();
    const passwordHash = await createPasswordHash(c, password);
    const role = ['admin', 'moderator', 'user'].includes(record.role) ? record.role : 'user';
    await c.env.DB.prepare(`
      INSERT INTO users (id, uuid, username, name, email, email_verified, role, status, auth_provider, password_hash, password_salt, cookie_expiry_days, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, 0, ?, 'active', 'code', ?, '', 7, ?, ?)
    `).bind(uuid, uuid, username, username, role, passwordHash, nowIso(), nowIso()).run();
    await c.env.DB.prepare(`
      INSERT INTO user_credentials (user_id, password_hash, password_algo, password_updated_at)
      VALUES (?, ?, 'pbkdf2-sha256', ?)
    `).bind(uuid, passwordHash, nowIso()).run();
    await c.env.DB.prepare('UPDATE register_codes SET used_count = COALESCE(used_count, 0) + 1, status = CASE WHEN max_uses = 1 THEN "used" ELSE status END, used_by_uuid = COALESCE(used_by_uuid, ?), used_by_username = COALESCE(used_by_username, ?), used_at = COALESCE(used_at, CURRENT_TIMESTAMP) WHERE id = ? OR code = ?').bind(uuid, username, record.id, record.code).run();
    await c.env.DB.prepare('INSERT INTO register_code_uses (id, code_id, user_id, used_at, ip_hash) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), record.id || record.code, uuid, nowIso(), await ipHash(c)).run();
    await logAudit(c, 'register_code_success', true, { code_id: record.id || record.code, role }, uuid);
    const { token } = await createSessionAndJwt(c, { uuid, username, name: username, role, status: 'active', auth_provider: 'code', email: null, email_verified: 0 }, 'auth-center');
    return c.json({ ok: true, message: '注册成功', token });
  });

  app.get('/api/auth/email/verify', async (c) => {
    const token = c.req.query('token') || '';
    const record = await consumeToken(c, 'email_verify', token);
    if (!record) {
      await logAudit(c, 'email_verify_failed', false, {});
      return c.redirect('/verify-email?status=failed');
    }
    await c.env.DB.prepare("UPDATE users SET email_verified = 1, status = 'active', updated_at = ? WHERE uuid = ? OR id = ?").bind(nowIso(), record.user_id, record.user_id).run();
    await logAudit(c, 'email_verify_success', true, {}, record.user_id);
    return c.redirect('/verify-email?status=success');
  });

  app.post('/api/auth/email/verify/resend', async (c) => {
    const body: any = await c.req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const message = '如果该邮箱需要验证，我们将发送验证邮件。';
    const turnstile = await verifyTurnstile(c, body.turnstile_token);
    if (!turnstile.ok) return c.json({ ok: false, message: '真人验证失败，请刷新后重试。' }, 400);
    if (email) {
      const ok = await incrementCounter(c, 'verify_email_day', email, 86400000, envInt(c, 'MAX_VERIFY_EMAILS_PER_EMAIL_PER_DAY', 3));
      if (!ok) return c.json({ ok: true, message });
      const user: any = await findUserByEmail(c, email);
      if (user && !user.email_verified) {
        const token = crypto.randomUUID() + crypto.randomUUID();
        await createToken(c, 'email_verify', user.uuid || user.id, email, token, addMinutes(VERIFY_TOKEN_MINUTES));
        await enqueueEmail(c, email, 'verify_email', {
          username: user.username,
          action_url: `${getPublicBaseUrl(c)}/api/auth/email/verify?token=${encodeURIComponent(token)}`,
          expire_minutes: VERIFY_TOKEN_MINUTES,
        });
        await logAudit(c, 'email_verify_sent', true, { resend: true }, user.uuid || user.id);
      }
    }
    return c.json({ ok: true, message });
  });

  app.post('/api/auth/login/email', async (c) => {
    const body: any = await c.req.json().catch(() => ({}));
    const identifier = String(body.email || body.identifier || body.username || '').trim();
    const email = normalizeEmail(identifier);
    const password = String(body.password || '');
    const generic = '邮箱或密码不正确。';
    if (!identifier || !password) return c.json({ ok: false, message: generic }, 401);
    const adminEmail = normalizeEmail(c.env.ADMIN_EMAIL || '');
    const isAdminIdentifier =
      identifier.toLowerCase() === String(c.env.ADMIN_USERNAME || 'admin').toLowerCase()
      || (!!adminEmail && email === adminEmail);
    if (isAdminIdentifier && password === c.env.ADMIN_PASSWORD) {
      const token = await generateJWT({
        sub: 'admin',
        uuid: 'admin',
        user_id: '0',
        username: c.env.ADMIN_USERNAME || 'admin',
        name: 'Admin',
        email: c.env.ADMIN_EMAIL || null,
        email_verified: !!c.env.ADMIN_EMAIL,
        role: 'admin',
        status: 'active',
        auth_provider: 'sso',
        iat: Math.floor(Date.now() / 1000),
      }, c.env.JWT_SECRET, envInt(c, 'ACCESS_TOKEN_TTL_SECONDS', ACCESS_TOKEN_TTL_DEFAULT) / 86400);
      setCookie(c, 'sso_session', token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: envInt(c, 'ACCESS_TOKEN_TTL_SECONDS', ACCESS_TOKEN_TTL_DEFAULT) });
      await logAudit(c, 'login_success', true, { method: 'admin_password' }, 'admin');
      return redirectOrJson(c, body.redirect_uri, token, '/dash');
    }
    const user: any = email
      ? await findUserByEmail(c, email)
      : await c.env.DB.prepare('SELECT * FROM users WHERE lower(username) = ? OR lower(name) = ? LIMIT 1').bind(identifier.toLowerCase(), identifier.toLowerCase()).first();
    const userId = user?.uuid || user?.id || null;
    if (!user || !['active'].includes(user.status) || (email && !user.email_verified)) {
      await logAudit(c, 'login_failed', false, { method: 'email' }, userId);
      return c.json({ ok: false, message: generic }, 401);
    }
    const credential: any = await getUserCredential(c, user.uuid || user.id);
    if (credential?.locked_until && Date.parse(credential.locked_until) > Date.now()) return c.json({ ok: false, message: '登录失败次数过多，请稍后再试。' }, 423);
    if (Number(credential?.failed_login_count || 0) >= 5) {
      const turnstile = await verifyTurnstile(c, body.turnstile_token);
      if (!turnstile.ok) return c.json({ ok: false, message: '请先完成人机验证。', require_turnstile: true }, 400);
    }
    const valid = await verifyPasswordV2(c, password, credential?.password_hash, user.password_salt, user.password_hash);
    if (!valid) {
      const failedCount = Number(credential?.failed_login_count || 0) + 1;
      const lockedUntil = failedCount >= 10 ? addMinutes(60) : failedCount >= 5 ? addMinutes(15) : null;
      await c.env.DB.prepare('UPDATE user_credentials SET failed_login_count = ?, locked_until = ? WHERE user_id = ?').bind(failedCount, lockedUntil, user.uuid || user.id).run();
      await logAudit(c, failedCount >= 5 ? 'account_locked' : 'login_failed', false, { method: 'email', failed_count: failedCount }, user.uuid || user.id);
      return c.json({ ok: false, message: generic, require_turnstile: failedCount >= 5 }, 401);
    }
    await c.env.DB.prepare('UPDATE user_credentials SET failed_login_count = 0, locked_until = NULL WHERE user_id = ?').bind(user.uuid || user.id).run();
    const { token } = await createSessionAndJwt(c, user, body.app_id || 'auth-center');
    if (user.email) {
      await enqueueEmail(c, user.email, 'new_device_login', { username: user.username, action_url: `${getPublicBaseUrl(c)}/account/security`, expire_minutes: 0 });
    }
    await logAudit(c, 'login_success', true, { method: 'email' }, user.uuid || user.id);
    return redirectOrJson(c, body.redirect_uri, token, user.role === 'admin' ? '/dash' : `/user/${user.uuid || user.id}`);
  });

  app.post('/api/auth/login/otp/send', async (c) => {
    const body: any = await c.req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const message = '如果该邮箱可以登录，我们将发送验证码。';
    const turnstile = await verifyTurnstile(c, body.turnstile_token);
    if (!turnstile.ok) return c.json({ ok: false, message: '真人验证失败，请刷新后重试。' }, 400);
    if (email) {
      const user: any = await findUserByEmail(c, email);
      if (user && user.email_verified && user.status === 'active') {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await createToken(c, 'login_otp', user.uuid || user.id, email, code, addMinutes(OTP_TOKEN_MINUTES));
        await enqueueEmail(c, email, 'login_otp', { username_or_email: user.username || email, code, expire_minutes: OTP_TOKEN_MINUTES });
        await logAudit(c, 'login_otp_sent', true, {}, user.uuid || user.id);
      }
    }
    return c.json({ ok: true, message });
  });

  app.post('/api/auth/login/otp/verify', async (c) => {
    const body: any = await c.req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').trim();
    const generic = '验证码无效或已过期。';
    if (!email || !/^\d{6}$/.test(code)) return c.json({ ok: false, message: generic }, 401);
    const token = await consumeToken(c, 'login_otp', code, email);
    if (!token) return c.json({ ok: false, message: generic }, 401);
    const user: any = await findUserByUuid(c, token.user_id);
    if (!user || user.status !== 'active' || !user.email_verified) return c.json({ ok: false, message: generic }, 401);
    const session = await createSessionAndJwt(c, user, body.app_id || 'auth-center');
    await logAudit(c, 'login_otp_success', true, {}, user.uuid || user.id);
    return redirectOrJson(c, body.redirect_uri, session.token, user.role === 'admin' ? '/dash' : `/user/${user.uuid || user.id}`);
  });

  app.post('/api/auth/password/forgot', async (c) => {
    const body: any = await c.req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const message = '如果该邮箱存在，我们将发送密码重置邮件。';
    const turnstile = await verifyTurnstile(c, body.turnstile_token);
    if (!turnstile.ok) return c.json({ ok: false, message: '真人验证失败，请刷新后重试。' }, 400);
    await logAudit(c, 'password_reset_requested', true, { email_domain: email ? emailDomain(email) : null });
    if (email) {
      const user: any = await findUserByEmail(c, email);
      if (user) {
        const token = crypto.randomUUID() + crypto.randomUUID();
        await createToken(c, 'password_reset', user.uuid || user.id, email, token, addMinutes(RESET_TOKEN_MINUTES));
        await enqueueEmail(c, email, 'password_reset', {
          username: user.username,
          action_url: `${getPublicBaseUrl(c)}/reset-password?token=${encodeURIComponent(token)}`,
          expire_minutes: RESET_TOKEN_MINUTES,
        });
      }
    }
    return c.json({ ok: true, message });
  });

  app.post('/api/auth/password/reset', async (c) => {
    const body: any = await c.req.json().catch(() => ({}));
    const password = String(body.new_password || '');
    const confirm = String(body.confirm_password || '');
    const passError = passwordProblem(password);
    if (!body.token || password !== confirm || passError) return c.json({ ok: false, message: passError || '请确认两次输入的新密码一致。' }, 400);
    const token = await consumeToken(c, 'password_reset', String(body.token));
    if (!token) return c.json({ ok: false, message: '重置链接无效或已过期。' }, 400);
    const hash = await createPasswordHash(c, password);
    await c.env.DB.prepare(`
      INSERT INTO user_credentials (user_id, password_hash, password_algo, password_updated_at, failed_login_count, locked_until)
      VALUES (?, ?, 'pbkdf2-sha256', ?, 0, NULL)
      ON CONFLICT(user_id) DO UPDATE SET
        password_hash = excluded.password_hash,
        password_algo = excluded.password_algo,
        password_updated_at = excluded.password_updated_at,
        failed_login_count = 0,
        locked_until = NULL
    `).bind(token.user_id, hash, nowIso()).run();
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = "", password_plain = ?, updated_at = ? WHERE uuid = ? OR id = ?').bind(hash, password, nowIso(), token.user_id, token.user_id).run();
    await c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(nowIso(), token.user_id).run();
    const user: any = await findUserByUuid(c, token.user_id);
    if (user?.email) await enqueueEmail(c, user.email, 'password_changed', { username: user.username, action_url: `${getPublicBaseUrl(c)}/account/security`, expire_minutes: 0 });
    await logAudit(c, 'password_reset_success', true, {}, token.user_id);
    return c.json({ ok: true, message: '密码已重置，请重新登录。' });
  });

  app.get('/api/account/me', async (c) => {
    const active = await requireAuth(c);
    if (!active) return c.json({ error: 'Authentication required' }, 401);
    const user = active.user;
    return c.json({ ok: true, user: {
      id: user.uuid || user.id,
      username: user.username,
      name: user.name || user.username,
      email: user.email || null,
      email_verified: !!user.email_verified,
      role: user.role || 'user',
      status: user.status,
      auth_provider: user.auth_provider || 'email',
      created_at: user.created_at,
      last_login_at: user.last_login_at || null,
    } });
  });

  app.post('/api/account/password/change', async (c) => {
    const active = await requireAuth(c);
    if (!active) return c.json({ error: 'Authentication required' }, 401);
    const body: any = await c.req.json().catch(() => ({}));
    const oldPassword = String(body.old_password || '');
    const newPassword = String(body.new_password || '');
    const confirm = String(body.confirm_password || '');
    const passError = passwordProblem(newPassword);
    if (newPassword !== confirm || passError) return c.json({ ok: false, message: passError || '请确认两次输入的新密码一致。' }, 400);
    const credential: any = await getUserCredential(c, active.user.uuid || active.user.id);
    const valid = await verifyPasswordV2(c, oldPassword, credential?.password_hash, active.user.password_salt, active.user.password_hash);
    if (!valid) return c.json({ ok: false, message: '旧密码不正确。' }, 403);
    const hash = await createPasswordHash(c, newPassword);
    await c.env.DB.prepare(`
      INSERT INTO user_credentials (user_id, password_hash, password_algo, password_updated_at, failed_login_count, locked_until)
      VALUES (?, ?, 'pbkdf2-sha256', ?, 0, NULL)
      ON CONFLICT(user_id) DO UPDATE SET
        password_hash = excluded.password_hash,
        password_algo = excluded.password_algo,
        password_updated_at = excluded.password_updated_at,
        failed_login_count = 0,
        locked_until = NULL
    `).bind(active.user.uuid || active.user.id, hash, nowIso()).run();
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = "", password_plain = ?, updated_at = ? WHERE uuid = ? OR id = ?').bind(hash, newPassword, nowIso(), active.user.uuid || active.user.id, active.user.uuid || active.user.id).run();
    await c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL').bind(nowIso(), active.user.uuid || active.user.id, active.payload.session_id || '').run();
    if (active.user.email) await enqueueEmail(c, active.user.email, 'password_changed', { username: active.user.username, action_url: `${getPublicBaseUrl(c)}/account/security`, expire_minutes: 0 });
    await logAudit(c, 'password_changed', true, {}, active.user.uuid || active.user.id);
    return c.json({ ok: true, message: '密码已修改。' });
  });

  app.post('/api/account/email/change/request', async (c) => {
    const active = await requireAuth(c);
    if (!active) return c.json({ error: 'Authentication required' }, 401);
    const body: any = await c.req.json().catch(() => ({}));
    const newEmail = normalizeEmail(body.new_email);
    const turnstile = await verifyTurnstile(c, body.turnstile_token);
    if (!turnstile.ok) return c.json({ ok: false, message: '真人验证失败，请刷新后重试。' }, 400);
    if (!newEmail) return c.json({ ok: false, message: '邮箱格式不正确。' }, 400);
    const domainError = assertEmailDomain(c, newEmail);
    if (domainError) return c.json({ ok: false, message: domainError }, 400);
    const credential: any = await getUserCredential(c, active.user.uuid || active.user.id);
    const valid = await verifyPasswordV2(c, String(body.password || ''), credential?.password_hash, active.user.password_salt, active.user.password_hash);
    if (!valid) return c.json({ ok: false, message: '密码不正确。' }, 403);
    const taken = await findUserByEmail(c, newEmail);
    if (taken) return c.json({ ok: false, message: '该邮箱不可用。' }, 409);
    const token = crypto.randomUUID() + crypto.randomUUID();
    await createToken(c, 'email_change', active.user.uuid || active.user.id, newEmail, token, addMinutes(VERIFY_TOKEN_MINUTES), { old_email: active.user.email || null, new_email: newEmail });
    await enqueueEmail(c, newEmail, 'email_change', {
      username: active.user.username,
      new_email: newEmail,
      action_url: `${getPublicBaseUrl(c)}/api/account/email/change/confirm?token=${encodeURIComponent(token)}`,
      expire_minutes: VERIFY_TOKEN_MINUTES,
    });
    await logAudit(c, 'email_change_requested', true, { new_email_domain: emailDomain(newEmail) }, active.user.uuid || active.user.id);
    return c.json({ ok: true, message: '确认邮件已发送，请前往新邮箱完成确认。' });
  });

  app.get('/api/account/email/change/confirm', async (c) => {
    const token = c.req.query('token') || '';
    const record = await consumeToken(c, 'email_change', token);
    if (!record) return c.redirect('/account/security?email_change=failed');
    const meta: any = safeJson(record.metadata);
    const newEmail = normalizeEmail(record.email || meta.new_email);
    if (!newEmail) return c.redirect('/account/security?email_change=failed');
    await c.env.DB.prepare('UPDATE users SET email = ?, email_verified = 1, updated_at = ? WHERE uuid = ? OR id = ?').bind(newEmail, nowIso(), record.user_id, record.user_id).run();
    const user: any = await findUserByUuid(c, record.user_id);
    if (user?.email) await enqueueEmail(c, user.email, 'email_changed', { username: user.username, new_email: newEmail, action_url: `${getPublicBaseUrl(c)}/account/security`, expire_minutes: 0 });
    await logAudit(c, 'email_change_success', true, { new_email_domain: emailDomain(newEmail) }, record.user_id);
    return c.redirect('/account/security?email_change=success');
  });

  app.get('/api/account/sessions', async (c) => {
    const active = await requireAuth(c);
    if (!active) return c.json({ error: 'Authentication required' }, 401);
    const { results } = await c.env.DB.prepare(`
      SELECT
        s.id,
        s.user_agent,
        s.ip_hash,
        s.created_at,
        s.expires_at,
        s.revoked_at,
        COALESCE(us.app_id, 'auth-center') AS app_id
      FROM auth_sessions s
      LEFT JOIN user_sessions us ON us.session_id = s.id AND us.uuid = s.user_id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
      LIMIT 100
    `).bind(active.user.uuid || active.user.id).all();
    return c.json({ ok: true, current_session_id: active.payload.session_id || null, sessions: results || [] });
  });

  app.post('/api/account/sessions/revoke', async (c) => {
    const active = await requireAuth(c);
    if (!active) return c.json({ error: 'Authentication required' }, 401);
    const body: any = await c.req.json().catch(() => ({}));
    const sessionId = String(body.session_id || '');
    await c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL').bind(nowIso(), sessionId, active.user.uuid || active.user.id).run();
    await c.env.DB.prepare('UPDATE user_sessions SET revoked_at = ? WHERE session_id = ? AND uuid = ? AND revoked_at IS NULL').bind(nowIso(), sessionId, active.user.uuid || active.user.id).run().catch(() => null);
    await logAudit(c, 'session_revoked', true, { session_id: sessionId }, active.user.uuid || active.user.id);
    return c.json({ ok: true });
  });

  app.post('/api/account/sessions/revoke-all', async (c) => {
    const active = await requireAuth(c);
    if (!active) return c.json({ error: 'Authentication required' }, 401);
    await c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(nowIso(), active.user.uuid || active.user.id).run();
    await c.env.DB.prepare('UPDATE user_sessions SET revoked_at = ? WHERE uuid = ? AND revoked_at IS NULL').bind(nowIso(), active.user.uuid || active.user.id).run().catch(() => null);
    await logAudit(c, 'all_sessions_revoked', true, {}, active.user.uuid || active.user.id);
    setCookie(c, 'sso_session', '', { path: '/', maxAge: 0, secure: true, httpOnly: true, sameSite: 'Lax' });
    setCookie(c, 'auth_refresh', '', { path: '/', maxAge: 0, secure: true, httpOnly: true, sameSite: 'Lax' });
    return c.json({ ok: true });
  });

  app.post('/api/account/register-code/apply', async (c) => {
    const active = await requireAuth(c);
    if (!active) return c.json({ error: 'Authentication required' }, 401);
    const body: any = await c.req.json().catch(() => ({}));
    const plainCode = String(body.register_code || '').trim();
    if (!plainCode) return c.json({ ok: false, message: 'Register code is required.' }, 400);
    const record: any = await findRegisterCode(c, plainCode);
    if (registerCodeUnavailable(record)) {
      await logAudit(c, 'register_code_update_failed', false, {}, active.user.uuid || active.user.id);
      return c.json({ ok: false, message: 'Register code is invalid or unavailable.' }, 400);
    }
    const config = normalizePermissionConfig(safeJson(record.config_json) || { role: record.role || 'user' });
    await applyPermissionConfig(c, active.user.uuid || active.user.id, config, true);
    await c.env.DB.prepare('UPDATE register_codes SET used_count = COALESCE(used_count, 0) + 1, status = CASE WHEN max_uses = 1 THEN "used" ELSE status END WHERE id = ? OR code = ?')
      .bind(record.id, record.code || record.id).run();
    await c.env.DB.prepare('INSERT INTO register_code_uses (id, code_id, user_id, used_at, ip_hash) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), record.id || record.code, active.user.uuid || active.user.id, nowIso(), await ipHash(c)).run();
    await logAudit(c, 'register_code_update_success', true, { code_id: record.id || record.code }, active.user.uuid || active.user.id);
    return c.json({ ok: true, message: 'Register code configuration applied.' });
  });

  app.get('/admin/auth/users', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const { results } = await c.env.DB.prepare(`
      SELECT uuid, id, username, name, email, email_verified, role, status, auth_provider, created_at, last_login_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 200
    `).all();
    return c.json({ ok: true, users: results || [] });
  });

  app.post('/admin/auth/users/:uuid/status', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const uuid = c.req.param('uuid');
    const body: any = await c.req.json().catch(() => ({}));
    const status = ['active', 'disabled', 'locked', 'pending'].includes(body.status) ? body.status : 'active';
    await c.env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE uuid = ? OR id = ?').bind(status, nowIso(), uuid, uuid).run();
    await logAudit(c, status === 'disabled' ? 'admin_disable_user' : 'admin_enable_user', true, { status, target_user: uuid }, admin.user.uuid || admin.user.id);
    const user: any = await findUserByUuid(c, uuid);
    if (user?.email) await enqueueEmail(c, user.email, status === 'disabled' ? 'account_disabled' : 'account_enabled', { username: user.username, action_url: `${getPublicBaseUrl(c)}/`, expire_minutes: 0 });
    return c.json({ ok: true });
  });

  app.post('/admin/auth/users/:uuid/role', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const uuid = c.req.param('uuid');
    const body: any = await c.req.json().catch(() => ({}));
    const role = ['admin', 'moderator', 'user', 'disabled'].includes(body.role) ? body.role : 'user';
    await c.env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE uuid = ? OR id = ?').bind(role, nowIso(), uuid, uuid).run();
    await logAudit(c, 'admin_update_user_role', true, { role, target_user: uuid }, admin.user.uuid || admin.user.id);
    return c.json({ ok: true });
  });

  app.post('/admin/auth/users/:uuid/revoke-sessions', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const uuid = c.req.param('uuid');
    await c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(nowIso(), uuid).run();
    await c.env.DB.prepare('UPDATE user_sessions SET revoked_at = ? WHERE uuid = ? AND revoked_at IS NULL').bind(nowIso(), uuid).run().catch(() => null);
    await logAudit(c, 'all_sessions_revoked', true, { target_user: uuid }, admin.user.uuid || admin.user.id);
    return c.json({ ok: true });
  });

  app.post('/admin/auth/users/:uuid/send-reset', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const uuid = c.req.param('uuid');
    const user: any = await findUserByUuid(c, uuid);
    if (user?.email) {
      const token = crypto.randomUUID() + crypto.randomUUID();
      await createToken(c, 'password_reset', uuid, user.email, token, addMinutes(RESET_TOKEN_MINUTES));
      await enqueueEmail(c, user.email, 'password_reset', { username: user.username, action_url: `${getPublicBaseUrl(c)}/reset-password?token=${encodeURIComponent(token)}`, expire_minutes: RESET_TOKEN_MINUTES });
    }
    await logAudit(c, 'password_reset_requested', true, { by_admin: true, target_user: uuid }, admin.user.uuid || admin.user.id);
    return c.json({ ok: true });
  });

  app.get('/admin/auth/register-codes', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const { results } = await c.env.DB.prepare(`
      SELECT id, code, label, role, max_uses, used_count, expires_at, disabled_at, created_by, created_at, status, template_name
      FROM register_codes
      ORDER BY created_at DESC
      LIMIT 200
    `).all();
    return c.json({ ok: true, codes: results || [] });
  });

  app.post('/admin/auth/register-codes', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const body: any = await c.req.json().catch(() => ({}));
    const plain = crypto.randomUUID().replace(/-/g, '');
    const id = crypto.randomUUID();
    const role = ['admin', 'moderator', 'user'].includes(body.role) ? body.role : 'user';
    await c.env.DB.prepare(`
      INSERT INTO register_codes (id, code, code_hash, label, role, max_uses, used_count, expires_at, created_by, created_at, status, config_json)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'unused', ?)
    `).bind(id, id, await hashSecret(c, plain), String(body.label || '').trim() || null, role, body.max_uses ? Number(body.max_uses) : null, body.expires_at || null, admin.user.uuid || admin.user.id, nowIso(), JSON.stringify({ role })).run();
    await logAudit(c, 'admin_create_register_code', true, { code_id: id, role }, admin.user.uuid || admin.user.id);
    return c.json({ ok: true, code: plain, record: { id, label: body.label || null, role, max_uses: body.max_uses || null, expires_at: body.expires_at || null } });
  });

  app.post('/admin/auth/register-codes/:id/disable', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const id = c.req.param('id');
    await c.env.DB.prepare('UPDATE register_codes SET disabled_at = ?, status = "pause" WHERE id = ? OR code = ?').bind(nowIso(), id, id).run();
    await logAudit(c, 'admin_disable_register_code', true, { code_id: id }, admin.user.uuid || admin.user.id);
    return c.json({ ok: true });
  });

  app.get('/admin/auth/register-codes/:id/uses', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const id = c.req.param('id');
    const { results } = await c.env.DB.prepare('SELECT * FROM register_code_uses WHERE code_id = ? ORDER BY used_at DESC LIMIT 100').bind(id).all();
    return c.json({ ok: true, uses: results || [] });
  });

  app.get('/admin/auth/registration-rules', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    return c.json({
      ok: true,
      source: 'environment',
      read_only: true,
      rules: await publicRegistrationRulesAsync(c),
      default_registration_config: await defaultRegistrationConfig(c),
      note: '修改时间、域名、频率等注册规则需要更新 Worker 环境变量后重新部署；外部注册开关和默认应用配置可在后台保存。',
    });
  });

  app.get('/admin/auth/default-registration-config', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    return c.json({
      ok: true,
      external_registration_enabled: await externalRegistrationEnabled(c),
      config: await defaultRegistrationConfig(c),
    });
  });

  app.put('/admin/auth/default-registration-config', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const body: any = await c.req.json().catch(() => ({}));
    const config = normalizePermissionConfig(body);
    await setSetting(c, 'external_registration_enabled', body.external_registration_enabled !== false);
    await setSetting(c, 'default_registration_config', config);
    await logAudit(c, 'admin_update_default_registration_config', true, {}, admin.user.uuid || admin.user.id);
    return c.json({ ok: true, external_registration_enabled: body.external_registration_enabled !== false, config });
  });

  app.get('/admin/auth/audit-logs', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const user = c.req.query('user') || null;
    const event = c.req.query('event_type') || null;
    const success = c.req.query('success');
    const from = c.req.query('from') || null;
    const to = c.req.query('to') || null;
    const ip = c.req.query('ip_hash') || null;
    let sql = 'SELECT * FROM auth_audit_logs WHERE 1 = 1';
    const values: any[] = [];
    if (user) { sql += ' AND user_id = ?'; values.push(user); }
    if (event) { sql += ' AND event_type = ?'; values.push(event); }
    if (success === '0' || success === '1') { sql += ' AND success = ?'; values.push(Number(success)); }
    if (from) { sql += ' AND created_at >= ?'; values.push(from); }
    if (to) { sql += ' AND created_at <= ?'; values.push(to); }
    if (ip) { sql += ' AND ip_hash = ?'; values.push(ip); }
    sql += ' ORDER BY created_at DESC LIMIT 200';
    const { results } = await c.env.DB.prepare(sql).bind(...values).all();
    return c.json({ ok: true, logs: results || [] });
  });

  app.get('/admin/auth/email-jobs', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const { results } = await c.env.DB.prepare('SELECT * FROM email_jobs ORDER BY created_at DESC LIMIT 200').all();
    return c.json({ ok: true, jobs: results || [] });
  });

  app.post('/admin/auth/email-jobs/:id/retry', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const id = c.req.param('id');
    await c.env.DB.prepare("UPDATE email_jobs SET status = 'pending', last_error = NULL WHERE id = ?").bind(id).run();
    c.executionCtx?.waitUntil?.(sendEmailJob(c, id));
    return c.json({ ok: true });
  });

  app.post('/admin/auth/email-test', async (c) => {
    const admin = await requireAdmin(c);
    if (!admin) return c.json({ error: 'Forbidden' }, 403);
    const body: any = await c.req.json().catch(() => ({}));
    const to = normalizeEmail(body.to_email || body.email);
    if (!to) return c.json({ error: 'Valid to_email is required' }, 400);
    const id = await enqueueEmail(c, to, 'test_email', {
      username: 'there',
      action_url: `${getPublicBaseUrl(c)}/login`,
      expire_minutes: 0,
    }, 'send test');
    return c.json({ ok: true, job_id: id });
  });
}
