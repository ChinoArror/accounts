export type PreviewApp = {
  app_id: string;
  app_name?: string | null;
  name?: string | null;
  status?: string | null;
};

export function normalizePreviewEnabled(value: unknown) {
  return value === true || value === 1 || value === '1';
}

export function buildPreviewUrl(origin: string, name: string, secret: string) {
  const base = new URL('/preview', origin).toString();
  return `${base}#name=${encodeURIComponent(name)}&secret=${encodeURIComponent(secret)}`;
}

export function expandPreviewApps(allowedSubapps: string[], apps: PreviewApp[]) {
  const allowed = new Set(allowedSubapps);
  const allApps = allowed.has('*') || allowed.has('all');
  return apps.filter((app) => {
    if (!app?.app_id || app.status !== 'active') return false;
    return allApps || allowed.has(app.app_id);
  });
}

export function previewSessionExpiresAt(now: string | number | Date, sessionTtlMinutes: number) {
  const nowMs = new Date(now).getTime();
  const ttl = Math.max(5, Math.min(1440, Math.round(Number(sessionTtlMinutes) || 30)));
  return new Date(nowMs + ttl * 60 * 1000).toISOString();
}
