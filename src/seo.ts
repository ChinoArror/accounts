export const DEFAULT_SITE_URL = 'https://accounts.aryuki.com';
import { translatedDocSlug } from './docsCatalog';

export type SeoPage = {
  path: string;
  title: string;
  description: string;
  lastmod?: string;
  kind?: 'website' | 'article';
  asset?: string;
  legacyFilename?: string;
  language?: 'en' | 'zh';
};

export type DocsLanguage = 'en' | 'zh';

export function preferredDocsLanguage(header: string | null): DocsLanguage {
  if (!header) return 'zh';
  const choices = header.split(',').map((entry, index) => {
    const [tag, ...parameters] = entry.trim().split(';');
    const quality = parameters.find((part) => part.trim().startsWith('q='));
    const weight = quality ? Number(quality.trim().slice(2)) : 1;
    return { language: tag.toLowerCase().split('-')[0], weight: Number.isFinite(weight) ? weight : 0, index };
  }).filter((choice) => choice.weight > 0 && (choice.language === 'en' || choice.language === 'zh'));
  choices.sort((a, b) => b.weight - a.weight || a.index - b.index);
  return (choices[0]?.language as DocsLanguage | undefined) || (header.trim() === '*' ? 'zh' : 'en');
}

export function localizedDocsPath(pathname: string, language: DocsLanguage): string {
  const path = normalizedPath(pathname);
  if (path === '/user/docs') return `/user/docs/${language}`;
  if (path === '/dev/docs') return `/dev/docs/${language}`;
  if (path.startsWith('/dev/docs/')) {
    const suffix = path.slice('/dev/docs/'.length).replace(/^(?:en|zh)\//, '');
    const slug = decodeURIComponent(suffix);
    return `/dev/docs/${language}/${encodeURIComponent(translatedDocSlug(slug, language))}`;
  }
  throw new Error(`Not a documentation path: ${pathname}`);
}

export const CORE_PUBLIC_PAGES: SeoPage[] = [
  { path: '/', title: 'Auth Center | Aryuki', description: 'One secure Aryuki account for connected applications, with email, passkey, Google and GitHub sign-in.', kind: 'website', asset: 'home' },
  { path: '/privacy', title: 'Privacy Policy · 隐私权政策 | Aryuki Auth Center', description: 'How Aryuki Auth Center collects, uses, protects and shares account and sign-in information.', lastmod: '2026-10-04', kind: 'article', asset: 'privacy' },
  { path: '/dev/docs/zh', title: '子应用接入文档 | Aryuki Auth Center', description: 'Auth Center 子应用接入文档：统一登录、权限、测试身份与用量接入指南。', kind: 'website', asset: 'dev-docs-zh', language: 'zh' },
  { path: '/dev/docs/en', title: 'Subapp integration docs | Aryuki Auth Center', description: 'Integrate SSO, permissions, test identities, and API quotas with Aryuki Auth Center.', kind: 'website', asset: 'dev-docs-en', language: 'en' },
  { path: '/user/docs/zh', title: '用户使用指南 | Aryuki Auth Center', description: 'Auth Center 用户指南：登录、注册、个人资料、登录方式和账号安全。', kind: 'article', asset: 'user-docs-zh', language: 'zh' },
  { path: '/user/docs/en', title: 'User guide | Aryuki Auth Center', description: 'Learn how to sign in, register, update your profile, and manage account security.', kind: 'article', asset: 'user-docs-en', language: 'en' },
];

export function normalizedPath(pathname: string): string {
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return '/';
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');
  return withoutTrailingSlash || '/';
}

export function buildCanonicalUrl(siteUrl: string, pathname: string, _query = ''): string {
  const site = new URL(siteUrl);
  if (site.protocol !== 'https:') throw new Error('SITE_URL must use HTTPS');
  return new URL(normalizedPath(pathname), `${site.origin}/`).toString();
}

export function classifyPublicPath(pathname: string, pages: SeoPage[] = CORE_PUBLIC_PAGES): SeoPage | null {
  return pages.find((page) => page.path === normalizedPath(pathname)) || null;
}

export function isKnownPrivatePath(pathname: string): boolean {
  const path = normalizedPath(pathname);
  if (new Set([
    '/dash', '/login', '/register', '/register/code', '/register/email', '/welcomenewuser',
    '/verify-email', '/forgot-password', '/reset-password', '/account/security', '/user',
    '/session', '/preview', '/admin/passkey', '/admin/security', '/logout',
  ]).has(path)) return true;
  return /^\/(?:user\/[^/]+|users(?:\/.*)?|app\/[^/]+|dev\/@[^/]+|@[^/]+|[0-9a-f-]{36}(?:\/(?:edit|change-password|passkey))?)$/i.test(path);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function buildSitemapXml(siteUrl: string, pages: SeoPage[]): string {
  const uniquePaths = new Set<string>();
  const entries = pages.filter((page) => {
    if (uniquePaths.has(page.path)) return false;
    uniquePaths.add(page.path);
    return true;
  }).map((page) => {
    const lastmod = page.lastmod && /^\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?$/.test(page.lastmod)
      ? `<lastmod>${escapeXml(page.lastmod)}</lastmod>` : '';
    return `<url><loc>${escapeXml(buildCanonicalUrl(siteUrl, page.path))}</loc>${lastmod}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>`;
}
