type GoogleTag = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GoogleTag;
  }
}

let lastPagePath: string | null = null;

const KNOWN_STATIC_PATHS = new Set([
  '/',
  '/privacy',
  '/dash',
  '/dev/docs',
  '/user/docs',
  '/preview',
  '/admin/passkey',
  '/admin/security',
  '/login',
  '/register',
  '/register/email',
  '/register/code',
  '/welcomenewuser',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/account/security',
  '/session',
  '/users',
]);

export function normalizeAnalyticsPath(pathname: string): string {
  if (pathname === '/register/email' || pathname === '/register/code') return '/register';
  if (KNOWN_STATIC_PATHS.has(pathname)) return pathname;
  if (/^\/@[^/]+\/?$/.test(pathname)) return '/@user';
  if (/^\/user\/[^/]+\/?$/.test(pathname)) return '/user/:id';
  if (/^\/app\/[^/]+\/?$/.test(pathname)) return '/app/:id';
  if (/^\/dev\/[^/]+\/?$/.test(pathname)) return '/dev/:id';

  const privateUserRoute = pathname.match(/^\/[^/]+\/(edit|change-password|passkey)\/?$/);
  if (privateUserRoute) return `/:user/${privateUserRoute[1]}`;

  return '/other';
}

function safeReferrer(): string {
  if (!document.referrer) return '';
  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin === window.location.origin) {
      return `${referrer.origin}${normalizeAnalyticsPath(referrer.pathname)}`;
    }
    return referrer.origin;
  } catch {
    return '';
  }
}

export function trackGoogleAnalyticsPageView(pathname: string) {
  const pagePath = normalizeAnalyticsPath(pathname);
  if (pagePath === lastPagePath || !window.gtag) return;

  const pageReferrer = lastPagePath
    ? `${window.location.origin}${lastPagePath}`
    : safeReferrer();

  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: pagePath,
    page_referrer: pageReferrer,
  });
  lastPagePath = pagePath;
}
