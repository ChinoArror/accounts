# Unified sign-in and silent renewal

> Updated: 2026-10-24. This is the current authentication baseline for new subapps. Older examples in this directory are being updated; where they conflict, follow this guide and the current API behavior.

## Subapps handle JWTs only

Do not implement email, password, verification-code, Google/GitHub OAuth, or refresh-token handling inside a subapp. Send the browser to:

```text
https://accounts.aryuki.com/login?app_id=<APP_ID>&redirect=<URL_ENCODED_CALLBACK>
```

The root path `/` with the same parameters enters the sign-in flow too; the legacy `client_id` parameter remains supported. By default, the callback must equal the app's configured HTTPS `.com` `callback_url`. An administrator may turn **Allow .cn callback** on in app registration or details; `/dash` shows the state. When enabled, the corresponding `aryuki.cn` host with the exact same path is accepted. The switch takes effect on new login requests. When off, a `.cn` login request falls back to the original `.com` callback instead of failing. After checking that the app is active and the user is allowed, Auth Center appends `token` to the callback query. Never log a callback URL containing a JWT.

Choose the Auth Center login host and app callback from the **verified public request origin**: `.com` uses `accounts.aryuki.com` and the stored callback; `.cn` uses `accounts.aryuki.cn` and the matching `.cn` callback. For ESA traffic, the Worker must verify the HMAC origin proof covering version `v1`, public host, method, path and query, and a timestamp within five minutes. Never trust `Host`, `Origin`, or `X-Forwarded-Host` alone. Auth Center checks the app ID, callback host/path, and switch again. **A client that restricts reachable domains may fail to open the `.com` fallback when `.cn` is disabled. Check its allowed-domain list before release.**

Passkeys follow browser WebAuthn domain rules: a credential registered on `.com` cannot be used directly on `.cn`. Register a separate credential from the `.cn` page if passkey sign-in is needed there.

After receiving the token, call `GET https://accounts.aryuki.com/api/verify?app_id=<APP_ID>` with `Authorization: Bearer <token>`. Success retains the `{ "valid": true, "user": ... }` response shape. On sensitive backend requests, check the local JWT expiration and, as needed, call this endpoint to confirm that the account, app permission, and session are still valid. A local cookie does not make an expired JWT valid.

The JWT includes `sub`/`uuid`, `role`, `email`, `email_verified`, `avatar_url`, `auth_provider`, and `session_id`. Key user-owned assets and records by `sub`/`uuid`, never by email, username, or OAuth provider ID. New apps use `role` to distinguish `admin` from `user`. Migrate legacy checks based on the username `admin` when updating those apps.

## What happens when a token expires

An access JWT lasts at most one hour. The Auth Center HttpOnly refresh cookie is limited by the shorter of the user's `cookie_expiry_days` and the global cap; admins use the admin expiry setting. Refresh does **not** extend the session's absolute expiration. A subapp cookie belongs to another site, so Auth Center cannot update the JWT stored inside it directly.

If the subapp JWT expires or `/api/verify` rejects it, clear the subapp's local session and redirect the browser to the `/login?...` URL above. While the Auth Center refresh cookie and D1 session remain valid, it issues a new JWT without a prompt, checks current app permissions, and redirects back. Otherwise the normal sign-in form appears. Existing subapps that already do this need no login-code change. Apps that merely show an error or use a shorter local cookie must add the redirect themselves; Auth Center cannot prolong a subapp's cookie remotely.

Signing out or forcibly revoking a device revokes its D1 session; `/api/verify` rejects the associated JWT immediately. The user center lists the app IDs accessed by a device. Subapps must not call `/api/auth/session/continue`; it is a same-origin cookie renewal endpoint.

## OAuth and account linking

Google and GitHub are always offered on the sign-in page. Linked identities sign in directly; new identities enter Auth Center's external-registration flow. Existing users should choose a provider in **Bind other account** from their profile; an admin can start a binding for a selected user from the user detail page. Do not construct, store, or forward obsolete `/:uuid/ssoconnect`, `/sso-binding`, or copied binding links.

The sign-in form now expands password controls after entering an email or username. This changes only Auth Center's UI, not the subapp callback, JWT verification, or silent-renewal contract. Unlinking Google or GitHub removes only that provider association, not the Auth Center email. Continue to key business data by UUID.

On 2026-09-30, legacy Google/GitHub bindings, including old `github_id` relations, were cleared. Affected users must link their accounts again; UUIDs, permissions, and existing assets are unchanged. **Do not rerun the legacy OAuth migration SQL that repopulates GitHub bindings in production.**

The Google callback URI is `https://accounts.aryuki.com/api/google/callback`. OAuth client secrets live only in Auth Center Worker secrets, never in subapps. New Google/GitHub registrations obey the External registration switch; sign-in to an already linked account does not.
