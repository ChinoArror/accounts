# GitHub SSO Setup Instructions

1. **Create GitHub OAuth App:**
   - Go to [GitHub Developer Settings](https://github.com/settings/developers).
   - Click "New OAuth App".
   - Application name: `SSO Auth Center`
   - Homepage URL: `https://accounts.aryuki.com`
   - Authorization callback URL: `https://accounts.aryuki.com/api/github/callback`
   - Click "Register application".

2. **Update Environment Variables:**
   - On the created app page, you will see a `Client ID`. Copy it.
   - Click "Generate a new client secret" and copy the secret.
   - Open `wrangler.toml` (or config in Cloudflare Workers Dashboard) and ensure these are added:
     ```toml
     [vars]
     # Existing vars...
     GITHUB_CLIENT_ID = "your_github_client_id"
     GITHUB_CLIENT_SECRET = "your_github_client_secret"
     ADMIN_GITHUB_ID = "your_admin_github_id_goes_here"
     ```

3. **Admin GitHub Binding:**
   - Log into the Admin Panel.
   - At the top right corner, click the GitHub icon. It will direct you to GitHub authorization.
   - After authorization, the page will display your `GitHub User ID`.
   - Copy this ID and set it as `ADMIN_GITHUB_ID` in `wrangler.toml` or Cloudflare Variables.

4. **Update Database Schema (Remote):**
   - You need to add the `github_id` column to your production database if D1 is already running:
   ```bash
   npx wrangler d1 execute auth-center-db --command "ALTER TABLE users ADD COLUMN github_id TEXT UNIQUE;" --remote
   ```
   *(If running locally for development, append `--local` instead of `--remote`)*

5. **User GitHub Binding:**
   - Admin goes to the user profile page.
   - Clicks "Copy Bind Link" in the GitHub section and sends it to the user.
   - The user opens the link, enters their current password, and is redirected to authorize.
   - Once authorized, the user can log in by clicking "Continue with Github" on the login page.
