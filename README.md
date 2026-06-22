# Auth Center

Auth Center is a Cloudflare Workers based identity center for SSO, account management, subapp access control, quotas, passkeys, GitHub login, email authentication, and usage analytics.

It is designed so child apps only receive and verify JWTs. Email, password, OTP, registration, passkey, GitHub binding, session management, and permission management stay inside Auth Center.

## Current Features

- Unified landing page at `/`
- Combined login page at `/login`
- Email or username + password login
- Email OTP login
- GitHub login for bound users
- Passkey login for bound users
- Email registration at `/register`
- Optional register-code configuration during registration
- Cloudflare Turnstile validation for registration and high-risk actions
- Email verification, password reset, email change confirmation, and security notices
- User account center at `/user/:uuid`
- Admin dashboard at `/dash`
- Admin user, app, register-code, permission, quota, and analytics management
- D1-backed login sessions and device revocation
- Analytics Engine based access statistics
- Role-aware JWTs with `role`, `email`, `email_verified`, and `auth_provider`

## Important Auth Rules

- New integrations should use `jwt.role` to distinguish `admin` and `user`.
- Existing `username === "admin"` compatibility may still exist for older subapps, but new subapps should not depend on it.
- Usernames and full names containing `admin` are rejected during public registration.
- Child apps must not implement email/password/OTP/register-code logic directly.

## Main Routes

- `/`: landing page. If already signed in, redirects to `/dash` for admins or `/user/:uuid` for users.
- `/login`: combined password, OTP, passkey, and GitHub login.
- `/register`: email registration with optional register code.
- `/verify-email`: verification notice and resend page.
- `/forgot-password`: password reset request.
- `/reset-password`: password reset form.
- `/user/:uuid`: user account center, profile, email change, password change, register-code update, and login devices. Login device rows show the initiating `app_id`; direct Auth Center activity is recorded as `auth-center`.
- `/dash`: admin dashboard.

## Admin Dashboard

Dashboard tabs:

- Users
- Applications
- Permissions
- Register
- Statistics

The Permissions tab is now the subapp permission and quota management surface. It uses real D1 data from `users`, `apps`, `user_apps`, and `auth_audit_logs`.

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
CF_API_TOKEN
```

## Database Setup

Fresh database:

```bash
npx wrangler d1 execute auth-center-db --remote --file=./schema.sql
```

Existing database migrations used by recent updates:

```bash
npx wrangler d1 execute auth-center-db --remote --file=./migrate-email-auth-2026-05-30.sql
npx wrangler d1 execute auth-center-db --remote --file=./migrate-auth-settings-2026-05-30.sql
npx wrangler d1 execute auth-center-db --remote --file=./migrate-user-sessions.sql
npx wrangler d1 execute auth-center-db --remote --file=./migrate-register-codes.sql
npx wrangler d1 execute auth-center-db --remote --file=./migrate-user-avatar-r2.sql
npx wrangler d1 execute auth-center-db --remote --file=./migrate-permission-matrix-2026-05-31.sql
npx wrangler d1 execute auth-center-db --remote --file=./migrate-avatar-editor-2026-06-20.sql
```

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
