# Test Identity integration guide

> Updated: 2026-10-10

Test identities let agents, CLIs, browser automation, and people temporarily inspect a published subapp. They are not ordinary users: they do not appear in `users`, have no normal password, and are absent from the normal sign-in page.

## Sign-in flow

1. An admin creates an identity in Dashboard > Test Access.
2. The dashboard can copy the full secret at creation, after rotation, or from the identity details.
3. An agent sends `name + secret + target_subapp` to `/api/test-auth/exchange`.
4. Auth Center returns a one-time `login_url`, normally usable for 60 seconds.
5. Opening the URL creates a test session, signs a JWT, and redirects to the selected subapp.
6. The test session defaults to 30 minutes and can be changed in the identity configuration.

The 60-second limit applies only to consuming the one-time link, not the test session itself.

## Browser Preview

An admin can enable **Preview** for a test identity under Dashboard > Test Access. The dashboard then provides a link shaped like:

```text
https://accounts.aryuki.com/preview#name=<name>&secret=<secret>
```

Human testers can open it, press **START**, and choose from the identity's actual allowed apps. Preview does not replace the CLI: agents and CI should call `/api/test-auth/exchange` to obtain a one-time `login_url`.

- The secret is in the URL fragment, not the path or query. Preview removes the fragment from the address bar before making a server request.
- Preview creates a separate `test_preview_session` cookie with HttpOnly, Secure, SameSite=Strict, and Path=/preview. It does not overwrite a normal `sso_session`.
- Only active D1 apps in `allowed_subapps` are listed. Opening an app uses the existing JWT callback in a new tab; the card returns to idle after two seconds. Subapps need no Preview route.
- Disabling Preview or the identity, or deleting it, rejects Preview sessions immediately. Rotating the secret invalidates old links but not already established sessions before their configured expiry or admin revocation.
- Never commit or log Preview links, secrets, JWTs, or callback tokens, and never place them in public chats, frontend code, or issues.

## Dashboard controls

Use Dashboard > Test Access to create, enable, disable, delete, or edit identities. The detail route is `/dev/@name`; it shows allowed apps, data permissions, API per session, a secret-copy control, and real activity. Dashboard > Register opens a register-code detail dialog with its app permissions, cookie duration, use state, and user. Sensitive-confirmation and edit dialogs sit above the dashboard header; on mobile, only the dialog scrolls.

## JWT fields and legacy compatibility

Test JWTs use the existing Auth Center signing scheme, so the old verification entry point remains usable. For example:

```json
{
  "sub": "test_identity_id",
  "uuid": "test_identity_id",
  "username": "agent-ocr-checker",
  "role": "user",
  "identity_type": "test",
  "test_session": true,
  "allowed_subapps": ["ocr", "paste"],
  "data_scope": "public_read",
  "data_scope_permissions": ["public_read", "private_read"],
  "session_id": "test_session_id"
}
```

Ordinary JWTs do not have `test_session=true`. To let older subapps be tested, legacy subapps that verify JWTs with `/api/verify` can admit test identities even before they understand `data_scope`. New subapps **must** inspect `identity_type`, `test_session`, `allowed_subapps`, `data_scope`, `data_scope_permissions`, and `session_id`, and enforce them on backend APIs.

## Data-scope permissions

`data_scope_permissions` contains Auth Center's expanded permissions. A public permission includes its equivalent private permission: `public_read` includes `private_read`, but not `private_write`. New subapps should use the array; older subapps may still inspect `data_scope`.

| Scope | Access |
| --- | --- |
| `public_read` | Read public and private data; write neither. Expanded: `public_read`, `private_read`. |
| `public_write` | Read and write public and private data. Expanded: all four permissions. Use only briefly and audit sensitive actions. |
| `private_read` | Read public and private data; write neither. |
| `private_write` | Read and write public and private data. Highest risk; use only for necessary, short-lived production tests. |

Public data includes global and public-page settings, templates, resources, lists, statistics, public status, and non-user-private system information. Private data includes real user content, files, mail, paste or OCR records, API-key lists, personal settings, and usage details.

## Middleware example

```ts
function requireSubappAccess(payload, appId) {
  if (!payload) throw unauthorized();

  if (payload.identity_type === "test" || payload.test_session === true) {
    if (!payload.allowed_subapps?.includes(appId) && !payload.allowed_subapps?.includes("*")) {
      throw forbidden();
    }
    return {
      identityType: "test",
      subjectId: payload.sub,
      role: payload.role,
      dataScope: payload.data_scope || "public_read",
      dataScopePermissions: payload.data_scope_permissions || [payload.data_scope || "public_read"],
      sessionId: payload.session_id
    };
  }

  return { identityType: "user", subjectId: payload.sub || payload.uuid, role: payload.role || "user" };
}

function canReadPrivate(ctx) {
  if (ctx.identityType !== "test") return true;
  return (ctx.dataScopePermissions || []).includes("private_read");
}

function canWritePrivate(ctx) {
  if (ctx.identityType !== "test") return true;
  return (ctx.dataScopePermissions || []).includes("private_write");
}

function canWritePublic(ctx) {
  if (ctx.identityType !== "test") return true;
  return (ctx.dataScopePermissions || []).includes("public_write");
}
```

## API usage reporting

After a test request, a new subapp can report usage to Auth Center:

```http
POST /api/test-auth/usage
Authorization: Bearer <subapp_secret_key>
Content-Type: application/json
```

```json
{
  "test_identity_id": "test_identity_id",
  "session_id": "test_session_id",
  "subapp": "ocr",
  "api_path": "/api/ocr/jobs",
  "method": "POST",
  "amount": 1,
  "status_code": 200,
  "metadata": { "route_group": "ocr" }
}
```

Older subapps using `/api/quota/check` and `/api/quota/consume` receive compatible access for test identities and basic usage logging.

## Integration checklist

- [ ] Keep the established Auth Center JWT verification path.
- [ ] Detect `identity_type=test` and check `allowed_subapps` for this app.
- [ ] Enforce `data_scope` and `data_scope_permissions` for public/private APIs.
- [ ] Key user assets and business data by stable `uuid`/`sub`; names and email are display-only.
- [ ] Audit `private_write` operations.
- [ ] Report `/api/test-auth/usage` so the dashboard can show test activity.
