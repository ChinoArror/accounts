# Subapp SSO integration troubleshooting (EdgePDF case)

> Updated: 2026-10-24. This historical troubleshooting record is being updated. For new login integrations and JWT expiry, follow [Unified sign-in and silent renewal](unified-login-and-silent-renewal.md).

Originally recorded on 2026-03-04 for a Cloudflare Workers + Hono + React SPA subapp connecting to `accounts.aryuki.com`.

## 1. SPA callback returns 404

**Symptom:** Auth Center redirects to `/sso-callback?token=...`, but the Worker returns 404. The React Router path has no physical file; the Worker needs to forward unmatched non-API routes to its asset handler. The earlier deployment's `not_found_handling` setting alone did not cover its Worker route.

```toml
[assets]
directory = "dist"
not_found_handling = "single-page-application"
binding = "ASSETS"
```

```typescript
app.notFound(async (c) => c.env.ASSETS.fetch(c.req.raw));
// Bindings must include: ASSETS: Fetcher
```

Ensure the callback path is not swallowed by an API route and test a direct browser reload of the callback route.

## 2. JWT signature verification fails

**Symptom:** `/api/sso-callback` returns `401 Invalid token signature`. The registered app's **App Secret** identifies the app; it is **not** the global Auth Center JWT signing key. Do not use the App Secret for local HS256 verification.

```typescript
const verifyRes = await fetch('https://accounts.aryuki.com/api/verify?app_id=edge-pdf', {
  headers: { Authorization: `Bearer ${token}` }
});
if (!verifyRes.ok) throw new Error(`Verification rejected: ${verifyRes.status}`);
```

Check `exp` and app permission as well. Keep secrets on the backend.

## 3. D1 reports `incomplete input`

**Symptom:** `D1_EXEC_ERROR` while creating a table from a multi-statement or malformed SQL string. In the original app, the way `db.exec()` received its SQL caused a truncated statement. Use an actual migration for schema changes; for one prepared statement, call `db.prepare(...).run()` and verify the SQL is complete. Do not treat a multiline SQL string as inherently invalid: the issue is how it was parsed and submitted.

```typescript
await db.prepare(
  'CREATE TABLE IF NOT EXISTS users (' +
  'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  'uuid TEXT NOT NULL UNIQUE, ' +
  'name TEXT)'
).run();
```

Prefer migrations over creating a table on every request in a production subapp.

## 4. Verify call turns into an opaque 500

**Symptom:** A callback responds with a generic 500 because body parsing, network verification, and D1 writes share one broad catch block. Handle each stage separately; set a fetch timeout; inspect non-JSON verification errors; return a useful but non-sensitive error to the client. Never echo tokens, app secrets, or raw database credentials.

```typescript
let token: string;
try {
  const body = await c.req.json<{ token: string }>();
  if (!body?.token) throw new Error('missing token');
  token = body.token;
} catch {
  return c.json({ success: false, message: 'Invalid request body' }, 400);
}

let verified;
try {
  verified = await fetch(verifyUrl, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(6000)
  });
} catch {
  return c.json({ success: false, message: 'Verification unavailable' }, 503);
}
if (!verified.ok) return c.json({ success: false, message: 'Verification rejected' }, 403);
```

Report D1 failures separately on the server with redacted diagnostics.

## 5. Tailwind v4 dark mode fails

**Symptom:** `<html>` receives `dark` but `dark:*` styles do not apply. The old custom variant matched only descendants, not `.dark` itself. Use:

```css
@custom-variant dark (&:where(.dark *, .dark));
```

## Recommended callback flow

1. Redirect the browser to Auth Center with the registered app ID and callback URL.
2. Receive `?token=<jwt>` at the subapp callback.
3. POST the token to the subapp backend; do not log the full callback URL.
4. Decode expiry only as an early check; call `/api/verify?app_id=...` for authoritative validation.
5. Associate the local user with the verified `uuid`/`sub`; upsert the local D1 record and create the subapp session.
6. On JWT expiry, redirect to Auth Center to renew using its valid cookie, as described in the unified guide.

Use `uuid`/`sub` for every asset, usage row, audit entry, and other ownership relationship. `name`, `username`, `fullname`, and `email` are display-only and may be reused after deletion.

If tracking analytics, send `login` after a successful callback, page views on entry, duration on exit, and product-specific events such as `pdf_generate` or `r2_upload`. Make non-critical tracking fire-and-forget where appropriate.

**Historical note:** The original EdgePDF integration used `app_id=edge-pdf` and callback `https://pdf.andog.eu/sso-callback`. A secret value shown in the old source document is intentionally omitted here. Store active app secrets only in Worker secrets; rotate any credential that was ever published in a public document.

## Admin-role compatibility

JWTs include `email`, `email_verified`, `role`, and optionally a complete `avatar_url`. Legacy subapps may still treat `name === "admin"` as an admin, but all new subapps must use `role === "admin"` and `role === "user"`. Registration rejects usernames and full names containing `admin` in any case to reduce confusion while legacy apps migrate.

## SSO session latency behind ESA and a proxy Worker (2026-10-24)

Start with the ordinary D1-backed limiter and finish the ESA and proxy Worker configuration. Consider a Workers Rate Limiting binding for the login endpoint **only if** real sign-ins on that multi-layer route are slow and stage timings identify the D1 limiter as the bottleneck. Do not replace every D1 limiter merely because a proxy was added.

One Point `.cn` session exchange took 19.52 seconds. Its application `Server-Timing` header reported `rate-limit=18525 ms`, `auth-verify=97 ms`, `db-session=694 ms`, and `total=19316 ms`. The wait was in the D1 limiter call; this evidence does not identify the underlying D1 delay or implicate ESA caching or Auth Center verification. The rate-limit table had only 12 rows and a primary-key index. Timing a public configuration endpoint cannot substitute for timing an authenticated exchange.

Instrument the application response with token-free `Server-Timing` stages for rate limiting, `/api/verify`, and session creation; compare them with the browser request duration. Never share callback JWTs, Cookie or Set-Cookie values, or secrets in logs and screenshots. If the limiter is the confirmed long tail, change only that entry point: Point uses `AUTH_SESSION_RATE_LIMIT` at 10 requests per 60 seconds; AI and other strict limits still use D1. Successful logins still create D1 sessions. Recheck a real sign-in and 429 behavior after deployment.

The former limiter performed a D1 `rate_limits` UPSERT on every attempt. The new login limiter consumes **zero D1 rows** for its check, while the remaining session reads and writes are unchanged. Determine exact savings from the old query's `meta.rows_read` and `meta.rows_written`, not from request count alone. Workers Rate Limiting is approximate, local to each Cloudflare location, and supports only 10- or 60-second windows; it is not equivalent to the old global 30-per-10-minute D1 window. Keep D1 or use a Durable Object when a strict worldwide limit is required. IP keys can group unrelated users behind one egress IP. See [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
