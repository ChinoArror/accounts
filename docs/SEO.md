# Search Engine Indexing

> Updated: 2026-10-10

## Public pages and canonical URLs

The canonical production origin is `https://accounts.aryuki.com` (`SITE_URL` in `wrangler.toml`). Public pages are `/`, `/privacy`, both `/user/docs/{en,zh}` and `/dev/docs/{en,zh}`, and one `/dev/docs/<language>/<document-slug>` URL per translated Markdown guide. Language-neutral aliases are not listed. Login, user profiles, dashboards, APIs, previews, and test identities are not in the sitemap.

`npm run build` runs Vite and then pre-renders the real React public pages into first-response HTML. It also generates the sitemap manifest from the current document files. Chinese guides in `Subapp-Docs子应用配置文档/` require same-named English files in its `en/` directory. The user guide likewise pairs `docs/user-guide.md` with `docs/user-guide.en.md`. Adding or removing a guide changes the generated page list at the next build/deploy; a missing English translation fails the build. Update each guide's `更新时间` or `Updated` line when the guide changes; that date becomes its sitemap `lastmod`. Do not substitute the current time for unchanged content.

The Worker serves `/robots.txt` and `/sitemap.xml` from the production origin. `/dev/docs`, `/user/docs`, legacy `/dev/docs?doc=...`, and old guide slugs redirect according to the browser's `Accept-Language` header; an explicit `/en` or `/zh` path always wins. The language-specific HTML contains a matching `<html lang>`, canonical URL, and reciprocal `hreflang` entries; `x-default` points to the negotiating alias. Trailing slashes redirect as before. Tracking query parameters do not enter canonical URLs or the sitemap. Unknown URLs return HTTP 404 with `noindex`. Private routes return `noindex` and continue to use the existing React app. In a non-production deployment set `ENVIRONMENT` to a value other than `production`; it will serve an empty sitemap, a disallowing robots file, and `X-Robots-Tag: noindex` on public HTML.

If the Worker is reachable at a `workers.dev` hostname, production HTML requests are redirected to `SITE_URL`. Cloudflare DNS and route configuration must separately send any HTTP or `www` variants to the canonical origin; this repository cannot redirect hostnames that do not reach this Worker.

## Google Search Console

1. Add `aryuki.com` as a **Domain property** and verify it with the TXT record provided by Search Console in Cloudflare DNS. DNS verification is preferred. For a URL-prefix property, `GOOGLE_SITE_VERIFICATION` may be set as a Worker variable/secret; the Worker inserts the verification meta tag into public HTML. Do not commit the verification token.
2. Submit `https://accounts.aryuki.com/sitemap.xml` in **Sitemaps**.
3. For an important new public URL, use **URL Inspection > Test live URL > Request indexing**. Indexing is not guaranteed and is not accelerated by Google's Indexing API for ordinary web pages.

## Verification

```bash
npm run lint
npm run test:seo
npm run build
npx wrangler dev --local --port 8791 --local-protocol https
# In another terminal:
SEO_BASE_URL=https://127.0.0.1:8791 npm run check:seo
```

The checker verifies first-response HTML for every sitemap URL, robots, sitemap XML and URL set, privacy, login noindex, legacy-document and trailing-slash redirects, and a true 404. For production, set `SEO_BASE_URL=https://accounts.aryuki.com` and run the same command. The local self-signed HTTPS certificate is accepted only when the checker points to localhost. Search Console itself is not part of CI.

`npm run build` must precede `wrangler deploy`: the pre-rendered HTML and manifest live in `dist/_seo/`. Do not deploy a Worker bundle with an old or missing `dist` directory.
