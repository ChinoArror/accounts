# SSO and analytics system (Cloudflare Workers)

> Updated: 2026-10-10. This guide retains historical examples and is being updated. **For new subapps, start with [Unified sign-in and silent renewal](统一登录与静默续期-2026-09-30.md).** Legacy `?token=...` callbacks and `/api/verify?app_id=...` remain supported. After a JWT expires, redirect the browser to Auth Center to renew silently with its valid cookie. Auth Center cannot directly refresh a subapp's own cookie.

This is a centralized SSO and analytics system built on Cloudflare Workers, D1, and Workers Analytics Engine.

## Prerequisites and initialization

Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) and use a Cloudflare account. For a **new** deployment, create a D1 database, put its generated ID in `wrangler.toml`, apply the current repository schema and migrations, then build and deploy:

```bash
npx wrangler d1 create sso-db
npx wrangler d1 execute sso-db --local --file=./schema.sql
npx wrangler d1 execute sso-db --remote --file=./schema.sql
npm install
npm run build
npx wrangler deploy
```

Do not reapply initialization SQL blindly to an existing production database. Follow the current README's migration instructions. The historical commands above are illustrative.

## Admin API examples

Some historical admin API endpoints use Basic Auth with `ADMIN_USERNAME` and `ADMIN_PASSWORD`. Keep these secrets server-side. An admin account can use SSO for registered apps; the JWT `role` is the correct authorization signal.

```bash
curl -X POST https://<auth-center>/admin/apps \
  -u admin:<password> -H 'Content-Type: application/json' \
  -d '{"app_id":"english-assistant","app_name":"English Assistant","callback_url":"https://app.example.com/callback","secret_key":"<app-secret>"}'

curl -X POST https://<auth-center>/admin/users \
  -u admin:<password> -H 'Content-Type: application/json' \
  -d '{"username":"johndoe","name":"John Doe","password":"<password>","cookie_expiry_days":7}'
```

The admin dashboard is the current way to manage apps, users, and permissions. Do not place Basic Auth credentials or app secrets in frontend code.

## Subapp login and token verification

Use the centralized login URL described in the unified guide rather than collecting credentials in a subapp. The historical `POST /login` response includes `token`/`jwt`, `uuid`, `user_id`, `name`, `username`, optional `avatar_url`, and a timestamp. Its JWT carries `sub`, `uuid`, `user_id`, `name`, `username`, `email`, `email_verified`, `role`, `status`, optional `avatar_url`, and `exp`.

`name` and `username` are for display. Some old subapps still recognize `name === "admin"`; **new subapps must use `role === "admin"` or `role === "user"`**. Auth Center disallows registration names containing `admin` in any case to avoid confusing legacy checks. `avatar_url`, when supplied, is a complete URL to Auth Center's avatar endpoint.

All user-owned assets, business data, quotas, audit logs, and analytics rows must be keyed by Auth Center `uuid` or JWT `sub`, not by names, email, or OAuth IDs. A deleted account and a later account with the same visible name must never share data.

For authoritative verification, call `GET https://accounts.aryuki.com/api/verify?app_id=<APP_ID>` with `Authorization: Bearer <jwt>`. A paused account or missing app permission is rejected. Check the token's expiration and current permission before sensitive operations; redirect expired sessions to Auth Center as the unified guide explains.

## Analytics and user self-service

Subapps can report `app_id`, `uuid`, `event_type`, and optionally `duration_seconds` to `POST /api/track`. Auth Center records country and derives device/browser information from the request. Send usage and analytics asynchronously where appropriate.

Users manage profile, email, password, passkeys, provider bindings, and devices in Auth Center's user center. A subapp can offer an **Auth** link to `https://accounts.aryuki.com/user/<user_uuid>`; use the UUID from a verified JWT.

## Sign-out integration

When signing out, clear the subapp's **own** session first. To also clear the Auth Center SSO cookie, navigate to:

```text
https://accounts.aryuki.com/logout?redirect=<URL_ENCODED_RETURN_URL>
```

Or call `POST https://accounts.aryuki.com/api/logout` with the Auth Center cookie when your browser or backend context can actually send it. A cross-site subapp backend does **not** automatically possess Auth Center's host-only cookie; do not assume forwarding the subapp's Cookie header logs the user out centrally. The redirect-based method is the dependable browser flow. Without central sign-out, another authorized app may sign in silently while the SSO session remains valid.

## Historical integration examples

Older callbacks accept `?token=<jwt>`. A subapp receives the token at its callback route, verifies it via `/api/verify?app_id=...`, establishes a local session, and redirects to its own dashboard. Do not log the token-bearing URL. For a React SPA running behind a Worker, ensure the callback route falls back to the app's frontend asset; see [Integration troubleshooting](接入错误经验总结.md).

On every protected backend request, require the verified session, check the correct app permission, and key data by `sub`/`uuid`. When the JWT expires, perform the silent-renewal redirect rather than merely showing an error. This keeps the existing callback protocol and avoids asking users to enter credentials while their Auth Center session is still valid.
