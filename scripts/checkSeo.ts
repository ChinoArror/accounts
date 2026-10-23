import assert from 'node:assert/strict';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { DEFAULT_SITE_URL } from '../src/seo';

const base = (process.argv[2] || process.env.SEO_BASE_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const site = process.env.SITE_URL || DEFAULT_SITE_URL;
if (/^https:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(base)) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

async function get(path: string, redirect: RequestRedirect = 'follow', language?: string) {
  return fetch(`${base}${path}`, { redirect, headers: { 'User-Agent': 'AuthCenterSeoCheck/1.0', ...(language ? { 'Accept-Language': language } : {}) } });
}

function checkHtml(html: string, path: string, title?: string) {
  assert.match(html, /<title>[^<]+<\/title>/i, `${path}: title`);
  assert.match(html, /<meta name="description" content="[^"]+"/i, `${path}: description`);
  assert.match(html, /<h1\b[^>]*>[^<]+<\/h1>/i, `${path}: H1 in first response`);
  assert.match(html, /<meta property="og:title"/i, `${path}: Open Graph`);
  assert.match(html, /<script type="application\/ld\+json">/i, `${path}: JSON-LD`);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
  assert.equal(canonical, `${site}${path === '/' ? '/' : path}`, `${path}: canonical`);
  assert.doesNotMatch(html, /<meta name="robots" content="[^"]*noindex/i, `${path}: unexpected noindex`);
  if (title) assert.ok(html.includes(title), `${path}: expected page content`);
  if (/\/(?:dev|user)\/docs\/(?:en|zh)(?:\/|$)/.test(path)) {
    assert.match(html, /<link rel="alternate" hreflang="en"/);
    assert.match(html, /<link rel="alternate" hreflang="zh-CN"/);
    assert.match(html, new RegExp(`<html lang="${path.includes('/docs/en') ? 'en' : 'zh-CN'}">`));
  }
}

const home = await get('/');
assert.equal(home.status, 200, 'home status');
assert.doesNotMatch(home.headers.get('x-robots-tag') || '', /noindex/i, 'production homepage must be indexable');
checkHtml(await home.text(), '/', 'One account for everything');

const robots = await get('/robots.txt');
assert.equal(robots.status, 200, 'robots status');
assert.match(robots.headers.get('content-type') || '', /text\/plain/i);
assert.match(await robots.text(), new RegExp(`Sitemap: ${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap\\.xml`));

const sitemap = await get('/sitemap.xml');
assert.equal(sitemap.status, 200, 'sitemap status');
assert.match(sitemap.headers.get('content-type') || '', /application\/xml/i);
const xml = await sitemap.text();
assert.equal(XMLValidator.validate(xml), true, 'sitemap XML is valid');
const parsed = new XMLParser().parse(xml);
const entries = [parsed.urlset.url].flat();
const locs = entries.map((entry: any) => entry.loc as string);
assert.ok(locs.length >= 4, 'sitemap contains public pages');
assert.equal(new Set(locs).size, locs.length, 'sitemap contains no duplicate URLs');
for (const loc of locs) {
  assert.ok(loc.startsWith(`${site}/`), `non-canonical sitemap URL: ${loc}`);
  assert.doesNotMatch(loc, /localhost|workers\.dev|\?/i);
  if (loc !== `${site}/`) assert.ok(!loc.endsWith('/'), `trailing slash in ${loc}`);
}
assert.ok(locs.includes(`${site}/`), 'home listed');
assert.ok(locs.includes(`${site}/privacy`), 'privacy listed');
for (const path of ['/dev/docs/en', '/dev/docs/zh', '/user/docs/en', '/user/docs/zh']) {
  assert.ok(locs.includes(`${site}${path}`), `${path} listed`);
}
assert.ok(!locs.includes(`${site}/dev/docs`) && !locs.includes(`${site}/user/docs`), 'language-neutral aliases excluded');
const doc = locs.find((loc) => loc.includes('/dev/docs/zh/'));
assert.ok(doc, 'generated document listed');

for (const loc of locs) {
  const path = new URL(loc).pathname;
  const response = await get(path);
  assert.equal(response.status, 200, `${path}: status`);
  assert.doesNotMatch(response.headers.get('x-robots-tag') || '', /noindex/i, `${path}: noindex header`);
  checkHtml(await response.text(), path);
}
const tracked = await get('/privacy?utm_source=seo-check&gclid=test');
checkHtml(await tracked.text(), '/privacy');

const missing = await get('/this-page-does-not-exist-seo-check');
assert.equal(missing.status, 404, 'unknown route must be real 404');
assert.match(missing.headers.get('x-robots-tag') || '', /noindex/i);
assert.match(await missing.text(), /<h1>Page not found<\/h1>/);

const privatePage = await get('/login');
assert.equal(privatePage.status, 200, 'login remains usable');
assert.match(privatePage.headers.get('x-robots-tag') || '', /noindex/i);

const slash = await get('/privacy/', 'manual');
assert.equal(slash.status, 301, 'trailing slash redirects');
assert.equal(new URL(slash.headers.get('location')!).pathname, '/privacy');

const oldDocumentUrl = `/dev/docs?doc=${encodeURIComponent(decodeURIComponent(new URL(doc).pathname.split('/').at(-1)!) + '.md')}`;
const oldDocument = await get(oldDocumentUrl, 'manual');
assert.equal(oldDocument.status, 302, 'legacy document link redirects');
assert.equal(new URL(oldDocument.headers.get('location')!).pathname, new URL(doc).pathname);
const oldSlug = new URL(doc).pathname.replace('/dev/docs/zh/', '/dev/docs/');
const oldSlugResponse = await get(oldSlug, 'manual', 'en-US');
assert.equal(oldSlugResponse.status, 302, 'legacy slug redirects');
assert.equal(new URL(oldSlugResponse.headers.get('location')!).pathname, new URL(doc).pathname.replace('/dev/docs/zh/', '/dev/docs/en/'));

for (const [header, suffix] of [['en-US,en;q=0.9', 'en'], ['zh-CN,zh;q=0.9', 'zh']] as const) {
  for (const prefix of ['/dev/docs', '/user/docs']) {
    const alias = await get(prefix, 'manual', header);
    assert.equal(alias.status, 302, `${prefix} negotiates ${suffix}`);
    assert.equal(new URL(alias.headers.get('location')!).pathname, `${prefix}/${suffix}`);
    assert.equal(alias.headers.get('vary'), 'Accept-Language');
  }
}
const englishGuide = await get('/user/docs/en');
assert.match(await englishGuide.text(), /Recover your password/);
const chineseGuide = await get('/user/docs/zh');
assert.match(await chineseGuide.text(), /找回密码/);

console.log(`SEO checks passed against ${base}: ${locs.length} canonical sitemap URLs`);
