export type AppCallbackRecord = {
  callback_url: string;
  allow_cn_callback?: number | boolean | null;
};

export type ResolvedAppCallback = { url: string; usedCn: boolean; fallback: boolean };

/** Only Aryuki-owned HTTPS callback hosts have a matching .cn identity. */
export function alternateCnCallback(callbackUrl: string): string | null {
  try {
    const url = new URL(callbackUrl);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash) return null;
    if (url.hostname !== 'aryuki.com' && !url.hostname.endsWith('.aryuki.com')) return null;
    url.hostname = `${url.hostname.slice(0, -4)}.cn`;
    return url.toString();
  } catch {
    return null;
  }
}

function sameCallback(registered: string, requested: string): boolean {
  try {
    const expected = new URL(registered);
    const actual = new URL(requested);
    return expected.protocol === 'https:' && actual.protocol === 'https:'
      && expected.origin === actual.origin && expected.pathname === actual.pathname
      && !actual.username && !actual.password && !actual.hash;
  } catch {
    return false;
  }
}

/** A disabled .cn alias falls back to the original registered callback. */
export function resolveAppCallback(app: AppCallbackRecord, requested: string): ResolvedAppCallback | null {
  if (sameCallback(app.callback_url, requested)) return { url: requested, usedCn: false, fallback: false };
  const alternate = alternateCnCallback(app.callback_url);
  if (!alternate || !sameCallback(alternate, requested)) return null;
  if (app.allow_cn_callback === 1 || app.allow_cn_callback === true) {
    return { url: requested, usedCn: true, fallback: false };
  }
  return { url: app.callback_url, usedCn: false, fallback: true };
}
