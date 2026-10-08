import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildCanonicalUrl, CORE_PUBLIC_PAGES, DEFAULT_SITE_URL, type SeoPage } from '../src/seo';

const outputDir = path.resolve('dist/_seo');
const shell = await readFile(path.resolve('dist/index.html'), 'utf8');
const siteUrl = process.env.SITE_URL || DEFAULT_SITE_URL;
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

function markdownSummary(content: string): string {
  const line = content.split(/\r?\n/).map((part) => part.trim()).find((part) =>
    Boolean(part) && !/^(?:#|>|```|[-*] |\d+\.|\|)/.test(part)) || '';
  return line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').slice(0, 180);
}

function renderPage(page: SeoPage, body: string): string {
  const canonical = buildCanonicalUrl(siteUrl, page.path);
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const content = `<meta name="description" content="${description}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="${page.kind === 'article' ? 'article' : 'website'}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:site_name" content="Aryuki Auth Center">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<script type="application/ld+json">${safeJson(page.path === '/'
    ? { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Aryuki Auth Center', url: canonical, description: page.description }
    : { '@context': 'https://schema.org', '@type': 'WebPage', name: page.title, url: canonical, description: page.description, ...(page.lastmod ? { dateModified: page.lastmod } : {}) })}</script>`;
  const withHead = shell.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`).replace('</head>', `${content}\n</head>`);
  const lang = page.path === '/' || page.path === '/privacy' ? 'en' : 'zh-CN';
  return withHead.replace('<html lang="en">', `<html lang="${lang}">`)
    .replace(/<!--SEO_ROOT_START-->[\s\S]*?<!--SEO_ROOT_END-->/, `<!--SEO_ROOT_START-->${body}<!--SEO_ROOT_END-->`);
}

const vite = await createServer({
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const { SeoSsrRouter } = await vite.ssrLoadModule('/src/SeoSsrRouter.tsx');
  const { LandingPage } = await vite.ssrLoadModule('/src/EmailAuthPages.tsx');
  const { default: PrivacyPolicy } = await vite.ssrLoadModule('/src/PrivacyPolicy.tsx');
  const { SubappDocsPage, UserDocsPage, seoDocuments } = await vite.ssrLoadModule('/src/DocsPages.tsx');
  const documents = seoDocuments as Array<{ filename: string; slug: string; title: string; updated: string; content: string }>;
  if (!documents.length) throw new Error('No public subapp documents found');
  const pages: SeoPage[] = CORE_PUBLIC_PAGES.map((page) => ({ ...page }));
  const guide = await readFile(path.resolve('docs/user-guide.md'), 'utf8');
  pages.find((page) => page.path === '/user/docs')!.lastmod = guide.match(/^>\s*更新时间[:：]\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
  pages.find((page) => page.path === '/dev/docs')!.lastmod = documents.map((doc) => doc.updated).filter(Boolean).sort().at(-1);
  documents.forEach((doc, index) => {
    pages.push({
      path: `/dev/docs/${encodeURIComponent(doc.slug)}`,
      title: `${doc.title} | Aryuki Auth Center`,
      description: markdownSummary(doc.content) || `${doc.title}。Auth Center 子应用接入说明与配置步骤。`,
      lastmod: doc.updated || undefined,
      kind: 'article',
      asset: `doc-${index}`,
      legacyFilename: doc.filename,
    });
  });
  await mkdir(outputDir, { recursive: true });
  for (const page of pages) {
    const Component = page.path === '/' ? LandingPage : page.path === '/privacy' ? PrivacyPolicy
      : page.path === '/user/docs' ? UserDocsPage : SubappDocsPage;
    const body = renderToStaticMarkup(React.createElement(SeoSsrRouter, { path: page.path }, React.createElement(Component)));
    if ((body.match(/<h1\b/g) || []).length !== 1) throw new Error(`Expected one H1 in ${page.path}`);
    await writeFile(path.join(outputDir, `${page.asset}.html`), renderPage(page, body));
  }
  await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(pages));
  await writeFile(path.join(outputDir, '404.html'), `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Page not found | Aryuki Auth Center</title><style>body{font:16px system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f8fb;color:#1b2430}main{padding:2rem;text-align:center}h1{font-size:2.4rem}a{color:#2464bd}</style></head><body><main><h1>Page not found</h1><p>This address does not exist.</p><a href="/">Return to Auth Center</a></main></body></html>`);
  console.log(`Generated ${pages.length} public SEO pages`);
} finally {
  await vite.close();
}
