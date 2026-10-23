# OAuth integration and external registration

> Updated: 2026-10-10. Older guides are being updated; new subapps should start with [Unified sign-in and silent renewal](统一登录与静默续期-2026-09-30.md).

Auth Center handles GitHub, Google, email, and passkeys centrally. Subapps must not handle OAuth authorization codes, provider tokens, email passwords, or Turnstile tokens.

## The unchanged subapp contract

1. Send users to `https://accounts.aryuki.com/login?app_id=<app_id>&redirect=<callback_url>`. The callback must match the app's configured callback origin and path.
2. Auth Center still attaches `token` to the callback after sign-in. Verify the JWT expiration and app permission using Auth Center's `/api/verify?app_id=...`, then establish your local session.
3. Associate all user assets, data, and records with JWT `sub`/`uuid`. Never use email, username, full name, or a GitHub/Google ID as an ownership key: those display fields can change or be reused.
4. New subapps use `jwt.role` for `admin`/`user`, not `username === "admin"`. The JWT also carries `email`, `email_verified`, and `avatar_url`. `auth_provider` identifies the current sign-in method, such as `email`, `github`, or `google`.

## Sign-in and registration

- An already linked GitHub/Google identity signs in and returns to the subapp without a welcome page.
- An unlinked identity enters `/welcomenewuser`, where Auth Center checks its email, the External registration switch, default permissions, and Turnstile when required. Subapps do not perform these steps.
- If the provider's verified email belongs to an existing account, the user must prove control of that account before linking the provider to the same UUID. A matching email never merges accounts automatically.
- A new OAuth account receives the default app permissions configured on Register at that time. If the target `app_id` is not allowed, Auth Center will not issue a usable callback for that app.
- Administrators can see real daily or monthly external-registration trends under Statistics; those are separate from visit analytics.

## Google configuration

The Authorized redirect URI for the Google Web OAuth client is `https://accounts.aryuki.com/api/google/callback`. Prefer a single Worker secret, `GOOGLE_OAUTH_CREDENTIALS`, containing `{"client_id":"...","client_secret":"..."}`. Alternatively set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` separately. The Google and GitHub buttons are always visible; fix server-side credentials if a provider is not ready. Birthday data requires additional People API authorization and is empty without it.

Legacy GitHub/Google bindings were cleared on 2026-09-30; existing accounts must re-link via **Bind other account** in their profile. Old `/:uuid/ssoconnect` and `/sso-binding` links are retired. Subapps do not need provider-specific login logic; redirect to Auth Center when their JWT expires.
