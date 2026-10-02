import { getCookie, setCookie } from 'hono/cookie';
import { generateJWT } from './auth';

const ACCESS_MAX = 3600;
const REFRESH_MAX = 30 * 86400;

export function accessSeconds(c: any) {
  const configured = Number(c.env.ACCESS_TOKEN_TTL_SECONDS || ACCESS_MAX);
  return Math.max(900, Math.min(ACCESS_MAX, Number.isFinite(configured) ? configured : ACCESS_MAX));
}

export function refreshSeconds(c: any, days?: number) {
  const configured = Number(c.env.REFRESH_TOKEN_TTL_SECONDS || REFRESH_MAX);
  const global = Math.max(86400, Math.min(REFRESH_MAX, Number.isFinite(configured) ? configured : REFRESH_MAX));
  const account = Number(days);
  return Number.isFinite(account) && account > 0 ? Math.min(global, Math.round(account * 86400)) : global;
}

export async function hashRefresh(c: any, token: string) {
  const data = new TextEncoder().encode(`${c.env.PASSWORD_PEPPER || ''}:${token}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function clearSessionCookies(c: any) {
  for (const name of ['sso_session', 'auth_refresh']) {
    setCookie(c, name, '', { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 0 });
  }
}

export function setAccessCookie(c: any, token: string) {
  setCookie(c, 'sso_session', token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: accessSeconds(c) });
}

function setRefreshCookie(c: any, token: string, seconds: number) {
  setCookie(c, 'auth_refresh', token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: seconds });
}

export async function recordSessionApp(c: any, sessionId: string, userId: string, appId: string) {
  const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO session_app_activity (session_id, user_id, app_id, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(session_id, app_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`)
    .bind(sessionId, userId, appId, now, now).run();
}

export async function issueDurableSession(c: any, user: any, payload: any, appId = 'auth-center') {
  const userId = user.uuid || user.id;
  const admin = userId === 'admin';
  const sessionId = crypto.randomUUID();
  const refresh = crypto.randomUUID() + crypto.randomUUID();
  const ttl = refreshSeconds(c, user.cookie_expiry_days);
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const hash = await hashRefresh(c, refresh);
  const agent = c.req.header('User-Agent') || '';
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || '';
  const ipHash = ip ? await hashRefresh(c, ip) : null;
  if (admin) {
    await c.env.DB.prepare(`INSERT INTO admin_auth_sessions (id, refresh_token_hash, user_agent, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)`).bind(sessionId, hash, agent, new Date().toISOString(), expiresAt).run();
  } else {
    await c.env.DB.prepare(`INSERT INTO auth_sessions (id, user_id, refresh_token_hash, user_agent, ip_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(sessionId, userId, hash, agent, ipHash, new Date().toISOString(), expiresAt).run();
    await c.env.DB.prepare(`INSERT INTO user_sessions (session_id, uuid, username, ip_address, user_agent, browser, device_type, app_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(sessionId, userId, user.username, ip || null,
      agent, 'Unknown', 'Unknown', appId, expiresAt).run();
  }
  await recordSessionApp(c, sessionId, userId, appId);
  const token = await generateJWT({ ...payload, sub: userId, uuid: userId, session_id: sessionId, session_kind: 'durable', iat: Math.floor(Date.now() / 1000) }, c.env.JWT_SECRET, accessSeconds(c) / 86400);
  setRefreshCookie(c, refresh, ttl);
  setAccessCookie(c, token);
  return { token, sessionId };
}

export async function findRefreshSession(c: any) {
  const refresh = getCookie(c, 'auth_refresh');
  if (!refresh) return null;
  const hash = await hashRefresh(c, refresh);
  const now = new Date().toISOString();
  for (const admin of [false, true]) {
    const table = admin ? 'admin_auth_sessions' : 'auth_sessions';
    const row: any = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE (refresh_token_hash = ? OR (previous_refresh_token_hash = ? AND previous_refresh_until > ?)) AND revoked_at IS NULL AND expires_at > ? LIMIT 1`)
      .bind(hash, hash, now, now).first();
    if (row) return { row, admin, hash, refresh };
  }
  return null;
}

export async function rotateRefreshSession(c: any, found: NonNullable<Awaited<ReturnType<typeof findRefreshSession>>>) {
  if (found.row.refresh_token_hash !== found.hash) return;
  const fresh = crypto.randomUUID() + crypto.randomUUID();
  const nextHash = await hashRefresh(c, fresh);
  const table = found.admin ? 'admin_auth_sessions' : 'auth_sessions';
  const grace = new Date(Date.now() + 15000).toISOString();
  const result = await c.env.DB.prepare(`UPDATE ${table} SET refresh_token_hash = ?, previous_refresh_token_hash = ?, previous_refresh_until = ? WHERE id = ? AND refresh_token_hash = ? AND revoked_at IS NULL`)
    .bind(nextHash, found.hash, grace, found.row.id, found.hash).run();
  if (Number(result.meta?.changes || 0) > 0) setRefreshCookie(c, fresh, Math.max(1, Math.floor((Date.parse(found.row.expires_at) - Date.now()) / 1000)));
}

export async function durableSessionActive(c: any, payload: any) {
  if (payload.session_kind !== 'durable') return true;
  if (!payload.session_id) return false;
  const admin = payload.sub === 'admin' || payload.uuid === 'admin';
  const table = admin ? 'admin_auth_sessions' : 'auth_sessions';
  const row: any = await c.env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? ${admin ? '' : 'AND user_id = ?'} AND revoked_at IS NULL AND expires_at > ?`)
    .bind(...(admin ? [payload.session_id, new Date().toISOString()] : [payload.session_id, payload.sub || payload.uuid, new Date().toISOString()])).first();
  if (!row) return false;
  if (!admin) {
    const session: any = await c.env.DB.prepare('SELECT revoked_at FROM user_sessions WHERE session_id = ?').bind(payload.session_id).first();
    if (!session || session.revoked_at) return false;
  }
  return true;
}

export async function revokeDurableSession(c: any, sessionId: string) {
  const now = new Date().toISOString();
  await c.env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').bind(now, sessionId).run();
  await c.env.DB.prepare('UPDATE admin_auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').bind(now, sessionId).run();
  await c.env.DB.prepare('UPDATE user_sessions SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL').bind(now, sessionId).run();
}
