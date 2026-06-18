# SSO & Analytics System (Cloudflare Workers)

This is a unified Single Sign-On (SSO) and Analytics system built on Cloudflare Workers, D1, and Workers Analytics Engine. It provides centralized authentication and usage tracking for multiple web applications.

## Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed.
- A Cloudflare account.

## 1. Initialization

### Create the D1 Database

First, create a new D1 database:

```bash
npx wrangler d1 create sso-db
```

Update your `wrangler.toml` with the generated `database_id`.

### Apply the Schema

Run the following command to initialize the database tables:

```bash
# For local development
npx wrangler d1 execute sso-db --local --file=./schema.sql

# For production
npx wrangler d1 execute sso-db --remote --file=./schema.sql
```

### Deploy the Worker

Deploy the worker to Cloudflare:

```bash
npm install
npm run build
npx wrangler deploy
```

## 2. Admin API Usage

The Admin API is protected by Basic Auth. Use the `ADMIN_USERNAME` and `ADMIN_PASSWORD` defined in your `wrangler.toml` (or set them as secrets via `wrangler secret put`).

> **Admin Login on Sub-Apps:** The admin account (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) can also log into any sub-app via the SSO login page. The admin JWT bypasses all per-app permission checks and grants access to every registered application by default.

### Apps Management

**Create an App:**
```bash
curl -X POST https://<your-worker-url>/admin/apps \
  -u admin:supersecretpassword \
  -H "Content-Type: application/json" \
  -d '{"app_id": "english-assistant", "app_name": "English Assistant", "callback_url": "https://app.example.com/callback", "secret_key": "app-secret"}'
```

**List Apps:**
```bash
curl https://<your-worker-url>/admin/apps -u admin:supersecretpassword
```

### User Management

**Create a User:**
```bash
curl -X POST https://<your-worker-url>/admin/users \
  -u admin:supersecretpassword \
  -H "Content-Type: application/json" \
  -d '{"username": "johndoe", "name": "John Doe", "password": "securepassword123", "cookie_expiry_days": 7}'
```

**Pause/Continue a User:**
```bash
# Pause
curl -X POST https://<your-worker-url>/admin/users/<uuid>/pause -u admin:supersecretpassword

# Continue
curl -X POST https://<your-worker-url>/admin/users/<uuid>/continue -u admin:supersecretpassword
```

### Permissions Management

**Assign an App to a User:**
```bash
curl -X POST https://<your-worker-url>/admin/permissions \
  -u admin:supersecretpassword \
  -H "Content-Type: application/json" \
  -d '{"uuid": "<user_uuid>", "app_id": "english-assistant"}'
```

## 3. Sub-App Integration Guide

### User Login

Sub-apps should redirect users to a centralized login page (or handle it via API).

**Endpoint:** `POST /login`
**Payload:** `{"username": "johndoe", "password": "securepassword123"}`

**Success Response:**
```json
{
  "token": "<jwt_string>",
  "jwt": "<jwt_string>",
  "uuid": "<user_uuid>",
  "user_id": 1,
  "name": "John Doe",
  "username": "johndoe",
  "avatar_url": "https://accounts.aryuki.com/api/avatar/<user_uuid>",
  "timestamp": 1709390000
}
```

The JWT payload also contains: `{ sub, uuid, user_id, name, username, email, email_verified, role, status, avatar_url?, exp }`. The `name` and `username` fields are both included so sub-apps can display the user's display name.

Legacy compatibility: existing sub-apps may still treat `name === "admin"` as an administrator. New sub-apps should not depend on that legacy rule; use `role === "admin"` for admin checks and `role === "user"` for normal users. Auth Center registration rejects `username` and `fullname` values containing `admin` in any letter case to avoid misleading legacy checks.

`avatar_url` is optional. If the user has uploaded an avatar, Auth Center includes a complete URL that points back to the centralized avatar endpoint. Sub-apps may render that field directly.

Important identity rule: all user-owned assets, business data, quota records, audit logs, and analytics rows must be keyed by Auth Center `uuid` / JWT `sub`. Display fields such as `name`, `username`, `fullname`, and `email` are only for UI convenience. Do not use them as ownership keys, because a deleted account and a later account with the same visible name must not inherit each other's records.

### Token Verification

When a user accesses a sub-app, the sub-app should verify the token and check if the user has permission for that specific app.

**Endpoint:** `GET /api/verify?app_id=english-assistant`
**Headers:** `Authorization: Bearer <jwt_string>`

If the user is paused by an admin, this endpoint will return a `403 Forbidden` error, and the sub-app should log the user out immediately.

### Analytics Tracking

Sub-apps can send usage data to the centralized Analytics Engine.

**Endpoint:** `POST /api/track`
**Payload:**
```json
{
  "app_id": "english-assistant",
  "uuid": "<user_uuid>",
  "event_type": "page_view",
  "duration_seconds": 120
}
```

The system automatically records the user's country (via Cloudflare headers) and parses the `User-Agent` to determine the device type and browser.

### User Self-Service Password Change

Users can change their own password via a dedicated public page (no admin login required).

**Page URL:** `https://accounts.aryuki.com/<user_uuid>/change-password`

**API Endpoint:** `POST /api/users/<uuid>/change-password`
**Payload:** `{"oldPassword": "current", "newPassword": "updated"}`

The page verifies the old password before allowing the update. You can copy the link from the User Profile page in the admin panel.

### Direct Auth Button in Sub-Apps

You can add an `Auth` button to the top-right user menu, username area, or another app-specific settings location. Point it to:

```text
https://accounts.aryuki.com/<user_uuid>
```

Recommended behavior:

- If the user already has an active Auth Center session in the same browser, the page opens the user's account center directly.
- If the user is not signed in yet, Auth Center redirects them to the user login page first, then returns them to the requested `/<user_uuid>` page after login.
- From that account center, the user can review and update their full name, birthday, avatar, passkeys, GitHub binding, password, and login sessions.

Example button:

```html
<a href="https://accounts.aryuki.com/{{user.uuid}}">Auth</a>
```

---

## 4. Sign-Out Integration (Sub-App → Auth Center)

When a user signs out of a sub-app, you should **also** invalidate their Auth Center session cookie. This ensures:
- The next time they click "Login" on any sub-app, they will be prompted to log in again (no silent auto-redirect).
- They can switch to a different account.
- They are fully logged out across the SSO system.

### Two Available Sign-Out Endpoints

#### Method 1: Redirect-based Logout (Recommended for browser flows)

```
GET https://accounts.aryuki.com/logout?redirect=<your-callback-url>
```

The Auth Center will clear the `sso_session` cookie, then immediately redirect the user back to the URL you specify.

**Example – JavaScript redirect from your sub-app:**
```javascript
function handleSignOut() {
  // Clear your own app's local session first
  localStorage.removeItem('app_session');

  // Then redirect to Auth Center to clear the SSO cookie
  const SSO_URL = 'https://accounts.aryuki.com';
  const afterLogoutUrl = encodeURIComponent(window.location.origin + '/login');
  window.location.href = `${SSO_URL}/logout?redirect=${afterLogoutUrl}`;
}
```

After the redirect, the user lands back on your sub-app's login page. The next time they click "Sign In", the Auth Center will show the login form (no stored session), allowing them to enter any credentials.

#### Method 2: API Logout (For backend or fetch-based flows)

```
POST https://accounts.aryuki.com/api/logout
```

Call this from your backend or via `fetch` (the browser must include cookies for the call to work, so this requires being on the same origin or using `credentials: 'include'`):

```javascript
async function handleSignOut() {
  // Clear your own app's local session
  localStorage.removeItem('app_session');

  // Call Auth Center API to clear SSO cookie
  await fetch('https://accounts.aryuki.com/api/logout', {
    method: 'POST',
    credentials: 'include',   // <-- required so the browser sends the SSO cookie
  });

  // Redirect to your app's login page
  window.location.href = '/login';
}
```

> **Note on `credentials: 'include'`:** This is required because the `sso_session` cookie is an `HttpOnly` cookie set on the `accounts.aryuki.com` domain. To clear it, the browser must send the cookie back to that domain, which only happens when `credentials: 'include'` is set. Without it, the cookie will remain active.

### Recommended Sign-Out Implementation (Cloudflare Workers sub-apps)

If your sub-app is also a Cloudflare Worker (e.g., using Hono), you can handle sign-out in a single backend route:

```typescript
// In your sub-app's Hono worker
app.post('/api/signout', async (c) => {
  // 1. Clear sub-app session cookie
  setCookie(c, 'app_session', '', { path: '/', maxAge: 0 });

  // 2. Proxy the logout to Auth Center
  await fetch('https://accounts.aryuki.com/api/logout', {
    method: 'POST',
    headers: { 'Cookie': c.req.header('Cookie') || '' } // forward the sso_session cookie
  });

  return c.json({ success: true });
});
```

---

## 5. WebApp Integration Code Examples

Here is how you can practically adapt your other web applications (frontend and backend) to use this SSO center.

### Example 1: OAuth-Style Seamless SSO Flow (Recommended)

When a user visits your app, check for the session. If not present, seamlessly redirect them to log in via the unified center.

```javascript
// Function to initiate SSO
function loginWithSSO() {
  const SSO_URL = 'https://accounts.aryuki.com';
  const APP_ID = 'your-app-id'; // Your registered app in the dashboard
  const RETURN_URL = window.location.origin + '/sso-callback'; 
  
  // 1. Redirect to Auth Center
  window.location.href = `${SSO_URL}/?client_id=${APP_ID}&redirect=${encodeURIComponent(RETURN_URL)}`;
}
```

```javascript
// On your child app logic (/sso-callback page)
window.onload = function() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  
  if (token) {
    // 2. Extract Token and store locally
    localStorage.setItem('app_session', token);
    window.location.href = '/dashboard';
  }
}
```

*Note: As long as the user's secure Cookie is valid on `accounts.aryuki.com`, clicking Login on any other authorized satellite Apps (like App B or C) will trigger a **0-second passwordless transparent redirect!***

### Example 2: Backend API Protection (Node.js/Hono/Express)

For your sub-app's backend, verify the user's session by making a request to the SSO Center's verify endpoint before processing sensitive data.

```javascript
// Express.js middleware example for a Sub-App
async function requireSSO(req, res, next) {
  const token = req.headers.authorization;
  const SSO_URL = 'https://accounts.aryuki.com';
  
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    // Verify against SSO center (requires the app_id query to test permissions)
    const verification = await fetch(`${SSO_URL}/api/verify?app_id=your-app-id`, {
      method: 'GET',
      headers: { 'Authorization': token }
    });

    if (!verification.ok) {
      return res.status(403).json({ error: 'SSO Verification Failed (Unauthorized or Paused user)' });
    }

    const { user } = await verification.json();
    req.user = user; // Push user profile downstream
    next();
  } catch (error) {
    res.status(500).json({ error: 'Internal SSO Error' });
  }
}

// Protected Route
app.get('/api/secure-data', requireSSO, (req, res) => {
  res.json({ message: `Welcome ${req.user.name}` });
});
```
