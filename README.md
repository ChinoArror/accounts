# Auth Center

> Updated: 2026-09-30. The current subapp integration baseline is [统一登录与静默续期-2026-09-30.md](Subapp-Docs子应用配置文档/统一登录与静默续期-2026-09-30.md). Older examples are being updated gradually; follow the dated guide when they differ.

Auth Center is a Cloudflare Workers based identity center for SSO, account management, subapp access control, quotas, passkeys, GitHub login, email authentication, and usage analytics.

It is designed so child apps only receive and verify JWTs. Email, password, OTP, registration, passkey, GitHub binding, session management, and permission management stay inside Auth Center.

## Current Features

- Unified landing page at `/`
- Combined login page at `/login`
- Email or username + password login
- Email OTP login
- GitHub and Google OAuth sign-in for bound users, plus external OAuth registration
- Passkey login for bound users
- Email registration at `/register`
- Optional register-code configuration during registration
- Cloudflare Turnstile validation for registration and high-risk actions
- Email verification, password reset, email change confirmation, and security notices
- User account center at `/user/:uuid`
- Admin dashboard at `/dash`
- Admin user, app, register-code, permission, quota, Test Access, and analytics management
- Test Identity login for agent/CLI/browser automation access to published subapps
- D1-backed login sessions and device revocation
- Analytics Engine based access statistics
- Role-aware JWTs with `role`, `email`, `email_verified`, and `auth_provider`

## Important Auth Rules

- New integrations should use `jwt.role` to distinguish `admin` and `user`.
- Existing `username === "admin"` compatibility may still exist for older subapps, but new subapps should not depend on it.
- Usernames and full names containing `admin` are rejected during public registration.
- Child apps must not implement email/password/OTP/register-code logic directly.
- Test identities are isolated from the normal `users` table, have no normal password, and are never exposed on the normal login page.

## Main Routes

- `/`: landing page. If already signed in, redirects to `/dash` for admins or `/user/:uuid` for users.
- `/login`: combined password, OTP, passkey, GitHub, and Google login.
- `/register`: email registration with optional register code.
- `/welcomenewuser`: OAuth account creation/linking and email-registration Turnstile step.
- `/verify-email`: verification notice and resend page.
- `/forgot-password`: password reset request.
- `/reset-password`: password reset form.
- `/user/:uuid`: user account center, profile, email change, password change, register-code update, and login devices. Login device rows show the initiating `app_id`; direct Auth Center activity is recorded as `auth-center`.
- `/user/docs`: user-facing guide for sign-in, registration, profile, account security, and devices. Linked from the user center.
- `/dash`: admin dashboard.
- `/dev/docs`: the complete subapp integration documentation library, including SSO, OAuth, Test Identity, quotas, and troubleshooting. Select or search individual documents; document links work within the library.
- `/dev/@name`: Test Identity detail page for admin review.
- `/preview`: browser-only Test Identity Preview portal. It has no normal login entry.

## Admin Dashboard

Dashboard tabs:

- Users
- Applications
- Permissions
- Register
- Test Access
- Statistics

The Permissions tab is now the subapp permission and quota management surface. It uses real D1 data from `users`, `apps`, `user_apps`, and `auth_audit_logs`. Register also controls the per-IP hourly OAuth sign-up count before Turnstile is required (default: 3). Statistics shows D1-backed external registrations by email, GitHub, and Google, with daily/monthly views separate from access analytics.

## OAuth And External Registration

- GitHub uses the existing `/api/github/login` and `/api/github/callback` routes. Request `read:user user:email` in the GitHub OAuth App. Existing linked GitHub IDs can still sign in even when GitHub does not expose a verified email; new accounts require a verified primary email.
- Create a **Web application** OAuth client in Google Cloud. Set the exact Authorized redirect URI to `https://accounts.aryuki.com/api/google/callback` (no trailing slash). `https://accounts.aryuki.com` is the optional Authorized JavaScript origin. Base scopes are `openid email profile`.
- To configure both values in one step, set the Worker secret `GOOGLE_OAUTH_CREDENTIALS` to JSON such as `{"client_id":"...","client_secret":"..."}` using `npx wrangler secret put GOOGLE_OAUTH_CREDENTIALS`. Alternatively, set `GOOGLE_CLIENT_ID` in vars and `GOOGLE_CLIENT_SECRET` as a separate Worker secret. Google and GitHub buttons are always displayed; incomplete provider credentials produce a login error. Never put credentials in Git, URLs, or frontend code.
- Birthday is optional: enable Google People API and its `user.birthday.read` scope, then set `GOOGLE_BIRTHDAY_SCOPE_ENABLED="true"` only after consent-screen and verification requirements are satisfied. GitHub has no standard birthday field. Missing/denied birthday data stays empty.
- Linked provider subjects sign in directly. Unlinked identities enter `/welcomenewuser`. Matching email alone never links or logs into an existing account: the user must first sign in to that account. A signed-in account without email may attach the verified provider email without a second email code. Disabled/pending accounts cannot be taken over.
- Public email/GitHub/Google creation obeys Register's External registration switch and current registration window/domain rules. New OAuth users receive the current default app permissions and cookie lifetime once; changing defaults later does not rewrite existing users. Bound-account login and proven account linking still work when public registration is closed.
- Email registration always solves Turnstile on `/welcomenewuser`. New GitHub/Google registrations solve it only after the configured count of unbound OAuth attempts from the same IP within one hour; existing global/IP hard limits still apply. OAuth state and pending tickets expire after 10 minutes, and the Worker cron removes expired rows.
- Registration statistics count successful account creations once per UUID. Pending email accounts are included and shown separately; old events are backfilled only when audit evidence exists. The chart states its traceable history start and uses Asia/Taipei day/month buckets.
- OAuth-only users can add a password from `/account/security`. The user and admin user-detail pages provide a **Bind other account** modal for GitHub or Google; old binding-link routes are retired. Bound providers show their account identity instead of another bind button. Unlinking requires confirmation and removes only the provider association, never the Auth Center account email. Admins also see the provider's immutable subject ID and linked time. Older links without saved provider profile details gain them on their next OAuth sign-in; an Auth Center email shown as fallback is labelled as such. The JWT retains `sub`/`uuid`, `role`, `email`, `avatar_url`, and the existing subapp callback token contract; `auth_provider` identifies the current sign-in method.
- The `/login` page, including subapp redirects, begins with an email/username field and expands the password controls after entry. Google/GitHub remain available immediately; email-code and Passkey flows still use the same backend. Footer links now follow the light/dark page theme, and the dashboard footer stays at the bottom during loading.
- On 2026-09-30, existing GitHub/Google identity links and legacy `github_id` values were cleared. Users must bind the desired provider again; user UUIDs and permissions are unchanged. Do not rerun the old OAuth migration after this cleanup, because it contains a legacy GitHub-binding backfill.

## Durable SSO Sessions (2026-09-30)

New logins through email, OTP, username, Passkey, GitHub, Google and admin credentials issue a short-lived access JWT and a hashed, revocable D1 refresh session. The HttpOnly `auth_refresh` cookie lasts for the lesser of the account's `cookie_expiry_days` and the global refresh limit; the admin uses `ADMIN_COOKIE_EXPIRY_DAYS`. Renewal never extends the original absolute expiry. `/api/verify` checks user/app permission and new-session revocation. The original subapp callback `?token=...` and JWT role/UUID fields remain unchanged.

Subapps already redirecting expired JWTs back to `/login?app_id=...&redirect=...` need no login-code change. Auth Center silently renews and returns a fresh JWT if its cookie is valid. A subapp that only shows an error, or has a separate shorter local cookie, must add that redirect itself; Auth Center cannot modify a cross-site cookie. The user device list records all visited app IDs for a session. The internal `/api/auth/session/continue` endpoint is for same-origin Auth Center pages, not for direct subapp use.

## Test Identity Login

Admins can create Test Identities from `/dash` → `Test Access`. A Test Identity is for temporary published subapp testing by agents, CLI tools, browser automation, or manual QA.

- Test identities use separate D1 tables and never enter the normal `users` table.
- Test identities have no normal password and cannot log in through `/login`.
- A secret can be copied from create, rotate, and detail views. The database stores its hash, prefix, and encrypted cipher text.
- The terminal command calls `/api/test-auth/exchange` with `name + secret + target_subapp`.
- Exchange returns a one-time `login_url`; the URL is valid for 60 seconds by default and can be consumed only once.
- The actual test session is separate from that one-time URL and defaults to 30 minutes. It is configurable per identity.
- Preview is off by default. When an admin enables it, the create, rotate, and detail views show a browser Preview link using the same Test Identity secret.
- A Preview link uses `https://accounts.aryuki.com/preview#name=...&secret=...`. The fragment is removed from the browser address bar before exchange and is never put in a query string or pathname.
- Preview creates a separate `test_preview_session` HttpOnly, Secure, SameSite=Strict cookie scoped to `/preview`; it never replaces the normal `sso_session`.
- Manual QA can use Preview instead of CLI. Agents and CI should keep using the CLI or `/api/test-auth/exchange` flow.
- Preview lists only active D1 apps allowed to the identity. Launches open the selected subapp in a new tab and create the same compatible app-specific test JWT/session shape used by the existing one-time-login flow. The source card keeps its launch indicator for two seconds, then returns to its ready state.
- Disabling Preview revokes Preview sessions immediately. Rotating a secret invalidates old Preview links but leaves established sessions valid until expiry or manual revocation.
- The JWT contains `identity_type=test`, `test_session=true`, `allowed_subapps`, `data_scope`, `data_scope_permissions`, and `session_id`.
- Old subapps remain compatible and may treat test sessions as fully visible after JWT verification.
- New subapps should read `identity_type`, `data_scope`, and `data_scope_permissions` and enforce public/private data access rules. Public scopes include same-level private scopes, for example `public_read` includes `private_read` but not `private_write`.
- High-risk settings such as `private_write`, `admin`, all subapps, or long sessions trigger a red confirmation dialog.

Chinese adapter guide: [测试身份适配指南](Subapp-Docs子应用配置文档/测试身份适配指南.md).

### Dashboard Dialogs

- Register code rows in `/dash` -> `Register` open a real detail dialog with status, cookie expiry, usage, and app permissions from D1.
- Register code, Test Access, delete confirmation, and sensitive confirmation dialogs are rendered above the dashboard chrome.
- Long dialogs keep the close button fixed in the top-right corner and lock background scrolling, including on mobile.

### Permission Management

Desktop layout:

- User/app search
- Role, plan, status, and app-group filters
- Summary counters for users, apps, enabled relations, near-limit relations, and exceeded relations
- Sticky user column
- Sticky app header
- Horizontal matrix scrolling
- Cell status badges: `ON`, `ON*`, `OFF`, near-limit percent, exceeded, disabled
- Right-side detail drawer for editing one user-app relation
- Batch enable, batch close, batch quota, and CSV export

Mobile layout:

- No wide matrix on small screens
- Statistics overview
- Manage by user
- Manage by app
- Anomaly list
- Recent permission operations
- Full-screen edit panel with visible close button

Permission APIs:

- `GET /api/admin/permissions/matrix`
- `GET /api/admin/permissions/detail?user_id=...&app_id=...`
- `POST /api/admin/permissions/update`
- `POST /api/admin/permissions/bulk-update`
- `POST /api/admin/permissions/reset-quota`
- `GET /api/admin/permissions/anomalies`
- `GET /api/admin/permissions/audit-logs`
- `GET /api/admin/permissions/export`

All admin permission APIs require admin authorization. JWT-based admin checks use `role = admin`.

## Data Model

Main D1 tables:

- `users`: accounts, profile fields, role, status, email verification state, auth provider, password hash fields, and session settings
- `user_credentials`: password credential metadata for email-auth accounts
- `auth_tokens`: hashed email verification, password reset, email change, and OTP tokens
- `auth_sessions`: refresh/session records for email-auth flows
- `user_sessions`: browser login devices shown to users, including the initiating `app_id`
- `apps`: registered child apps
- `user_apps`: user-app access, app role, quotas, usage counters, and permission state
- `register_codes`: admin-created register codes and their configuration
- `register_code_uses`: register-code usage records
- `auth_audit_logs`: security and admin operation audit records
- `email_jobs`: queued email jobs
- `registration_counters`: D1-backed registration and email throttling counters
- `passkeys`: WebAuthn credentials

## Cloudflare Bindings

Required bindings:

- D1 database: `DB`
- Static assets: `ASSETS`
- Analytics Engine dataset: `ANALYTICS`
- R2 avatar bucket: `AVATAR_BUCKET`
- Workers Email / Cloudflare Email Service binding: `EMAIL`

## Environment Variables

Example `wrangler.toml` values:

```toml
ADMIN_USERNAME = "admin"
ADMIN_EMAIL = "admin@example.com"
APP_NAME = "Auth Center"
PUBLIC_BASE_URL = "https://accounts.example.com"
JWT_ISSUER = "auth-center"
EMAIL_FROM = "noreply@accounts.example.com"
TURNSTILE_SITE_KEY = "0x..."
# Optional alternative to the GOOGLE_OAUTH_CREDENTIALS Worker secret:
# GOOGLE_CLIENT_ID = "..."
GOOGLE_BIRTHDAY_SCOPE_ENABLED = "false"
REGISTRATION_MODE = "open"
REGISTRATION_START_AT = ""
REGISTRATION_END_AT = ""
ALLOWED_EMAIL_DOMAINS = "gmail.com,outlook.com,qq.com,hotmail.com"
BLOCKED_EMAIL_DOMAINS = "tempmail.com,10minutemail.com"
MAX_GLOBAL_REGISTRATIONS_PER_DAY = "100"
MAX_REGISTRATIONS_PER_IP_PER_HOUR = "3"
MAX_REGISTRATIONS_PER_IP_PER_DAY = "5"
MAX_VERIFY_EMAILS_PER_EMAIL_PER_DAY = "3"
MAX_REGISTER_ATTEMPTS_PER_EMAIL_PER_HOUR = "5"
MAX_REGISTER_ATTEMPTS_PER_IP_PER_HOUR = "10"
ACCESS_TOKEN_TTL_SECONDS = "3600"
REFRESH_TOKEN_TTL_SECONDS = "2592000"
NEAR_LIMIT_THRESHOLD = "0.9"
```

Secrets:

```text
ADMIN_PASSWORD
JWT_SECRET
TURNSTILE_SECRET_KEY
PASSWORD_PEPPER
GITHUB_CLIENT_SECRET
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_CREDENTIALS (recommended single JSON secret; alternative to the separate ID/Secret pair)
CF_API_TOKEN
```

## Database Setup

Fresh database:

```bash
npx wrangler d1 execute auth-center-db --remote --file=./schema.sql
```

Existing database migrations used by recent updates:

```bash
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-email-auth-2026-05-30.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-auth-settings-2026-05-30.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-user-sessions.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-register-codes.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-user-avatar-r2.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-permission-matrix-2026-05-31.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-avatar-editor-2026-06-20.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-test-identity-preview-2026-09-19.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-oauth-external-registration-2026-09-29.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-session-and-oauth-cleanup-2026-09-30.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-oauth-binding-details-2026-09-30.sql
```

`schema.sql` contains `DROP TABLE` statements and is **only** for a fresh disposable database. Run each migration once on an existing D1. The 2026-09-29 OAuth migration must not be rerun after the 2026-09-30 binding cleanup, or its legacy GitHub backfill will recreate links.

## Avatar Editing

Users can update avatars from `/user/:uuid` in the Edit Info modal.

- Upload opens an adjustment window with the same square rounded preview used by the account page.
- Users can adjust size, horizontal position, and vertical position before saving. The editor clamps movement so the preview never exposes empty image bounds.
- Saving in the adjustment window immediately writes the avatar to R2. It stores two R2 objects: the original image under `Avatar/<uuid>/original/` and the cropped display image under `Avatar/<uuid>/cropped/`.
- `avatar_url` in JWTs and API responses always points to the cropped display image and includes a version query derived from the stored object key so browsers refresh after avatar changes.
- Future edits use the original image when it exists, including after later sessions. Older avatars without an original are treated as already-cropped images.
- Delete marks the avatar for removal and switches the UI back to the generated name avatar after Save.
- After deletion, the same open account interface can restore the avatar for 30 minutes. A scheduled Worker cron clears expired pending images from R2.

## Email Setup

1. Add the sending domain to Cloudflare.
2. Configure the required DNS records for Cloudflare Email Service / Workers Email.
3. Add the Worker `send_email` binding named `EMAIL`.
4. Set `EMAIL_FROM` to a verified sender on your domain.
5. Deploy and test registration, resend verification, password reset, OTP login, and email change.

Emails are queued through `email_jobs` and rendered with HTML plus text fallback.

## Turnstile Setup

1. Create a Cloudflare Turnstile widget.
2. Set `TURNSTILE_SITE_KEY` in Worker vars.
3. Set `TURNSTILE_SECRET_KEY` as a Worker secret.
4. Confirm registration, resend verification, OTP send, password reset, and email change all verify server-side.

If a form submit fails after Turnstile has been solved, the frontend resets the widget so the next submit can be verified cleanly.

## Build And Deploy

```bash
npm install
npm run build
npx wrangler deploy
```

### Online Documentation

`/dev/docs` imports every Markdown file in `Subapp-Docs子应用配置文档/` during the Vite build. `/user/docs` imports `docs/user-guide.md`. These files are the only content sources: adding, deleting, or editing a guide is reflected automatically in the **next build and deployment**, without editing a second online copy. The pages show the deployment build date (Asia/Taipei); each guide also shows its own `更新时间`/`更新` date. Update that date when revising a guide. Local edits alone cannot change the live Worker. The older guides remain available, but new subapps should start with the dated unified-login guide.

`.github/workflows/publish-docs.yml` builds and deploys automatically when documentation sources are pushed to `master`. Before relying on this, configure the GitHub repository secrets `CLOUDFLARE_API_TOKEN` (a token authorized to deploy this Worker) and `CLOUDFLARE_ACCOUNT_ID`. Changes on other branches or unpushed local edits still require a merge/push to `master` or a manual deployment with the commands above.

## Useful Verification

Admin permission matrix:

```bash
curl -H "Authorization: Basic <base64-admin-credentials>" \
  https://accounts.example.com/api/admin/permissions/matrix
```

Logout should clear both session cookies:

```bash
curl -i -X POST https://accounts.example.com/api/logout
```

Email or username login:

```bash
curl -X POST https://accounts.example.com/api/auth/login/email \
  -H "Content-Type: application/json" \
  -d '{"identifier":"username-or-email","password":"password"}'
```

## Subapp JWT Claims

JWTs include:

```json
{
  "sub": "user_uuid",
  "uuid": "user_uuid",
  "username": "example",
  "name": "Example User",
  "email": "user@example.com",
  "email_verified": true,
  "role": "user",
  "avatar_url": "https://accounts.aryuki.com/api/avatar/user_uuid?v=Avatar%2Fuser_uuid%2Fcropped%2Favatar-cropped-...",
  "auth_provider": "email",
  "session_id": "session_uuid"
}
```

Subapps should use `role` for authorization and `sub`/`uuid` as the stable user identifier. All user-owned assets, app data, quota records, audit logs, and analytics records must be keyed by the Auth Center `uuid`. Display fields such as `name`, `username`, `fullname`, and `email` are only for UI convenience and must not be used to join or own records; otherwise a deleted account and a later account with the same visible name could be linked incorrectly.

`avatar_url` is a complete cache-busted URL when the user has an avatar. Subapps can render it directly, and should keep using `uuid` as the ownership key even when showing the avatar next to a display name.
