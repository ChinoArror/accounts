import assert from 'node:assert/strict';
import { buildCanonicalUrl, buildSitemapXml, classifyPublicPath, isKnownPrivatePath } from '../src/seo';

const site = 'https://accounts.aryuki.com';
assert.equal(buildCanonicalUrl(site, '/privacy/', '?utm_source=mail&gclid=abc'), `${site}/privacy`);
assert.equal(buildCanonicalUrl(site, '/dev/docs/%E6%B5%8B%E8%AF%95', '?fbclid=abc'), `${site}/dev/docs/%E6%B5%8B%E8%AF%95`);
assert.equal(classifyPublicPath('/privacy')?.path, '/privacy');
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
