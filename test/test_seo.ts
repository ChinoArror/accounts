import assert from 'node:assert/strict';
import { buildCanonicalUrl, buildSitemapXml, classifyPublicPath, isKnownPrivatePath, preferredDocsLanguage, localizedDocsPath } from '../src/seo';

const site = 'https://accounts.aryuki.com';
assert.equal(buildCanonicalUrl(site, '/privacy/', '?utm_source=mail&gclid=abc'), `${site}/privacy`);
assert.equal(buildCanonicalUrl(site, '/dev/docs/%E6%B5%8B%E8%AF%95', '?fbclid=abc'), `${site}/dev/docs/%E6%B5%8B%E8%AF%95`);
assert.equal(classifyPublicPath('/privacy')?.path, '/privacy');
assert.equal(classifyPublicPath('/dev/docs/en')?.path, '/dev/docs/en');
assert.equal(classifyPublicPath('/user/docs/zh')?.path, '/user/docs/zh');
assert.equal(classifyPublicPath('/dev/docs'), null);
assert.equal(preferredDocsLanguage('en-US,en;q=0.9,zh-CN;q=0.8'), 'en');
assert.equal(preferredDocsLanguage('zh-CN,zh;q=0.9,en;q=0.8'), 'zh');
assert.equal(preferredDocsLanguage('fr-FR,fr;q=0.9'), 'en');
assert.equal(preferredDocsLanguage(null), 'zh');
assert.equal(preferredDocsLanguage('*'), 'zh');
assert.equal(localizedDocsPath('/dev/docs/guide', 'en'), '/dev/docs/en/guide');
assert.equal(localizedDocsPath('/dev/docs/统一登录与静默续期-2026-09-30', 'en'), '/dev/docs/en/unified-login-and-silent-renewal');
assert.equal(localizedDocsPath('/dev/docs/en/unified-login-and-silent-renewal', 'zh'), '/dev/docs/zh/%E7%BB%9F%E4%B8%80%E7%99%BB%E5%BD%95%E4%B8%8E%E9%9D%99%E9%BB%98%E7%BB%AD%E6%9C%9F-2026-09-30');
assert.equal(localizedDocsPath('/user/docs', 'zh'), '/user/docs/zh');
assert.equal(classifyPublicPath('/dev/docs/unknown'), null);
assert.equal(classifyPublicPath('/user/123'), null);
assert.equal(isKnownPrivatePath('/login'), true);
assert.equal(isKnownPrivatePath('/user/123'), true);
assert.equal(isKnownPrivatePath('/totally-unknown'), false);

const xml = buildSitemapXml(site, [
  { path: '/', title: 'Home', description: 'Home' },
  { path: '/privacy', title: 'Privacy', description: 'Privacy', lastmod: '2026-10-04' },
]);
assert.match(xml, /<loc>https:\/\/accounts\.aryuki\.com\/privacy<\/loc>/);
assert.match(xml, /<lastmod>2026-10-04<\/lastmod>/);
assert.doesNotMatch(xml, /localhost|workers\.dev|<loc>[^<]*\?/);

console.log('SEO URL, routing, and sitemap tests passed');
