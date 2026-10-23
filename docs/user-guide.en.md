# User guide

> Updated: 2026-10-24

Some apps offer both `.com` and `.cn` entry points. When the app's `.cn` callback switch is on, sign-in from `.cn` returns to its matching `.cn` address; when it is off, sign-in returns to the original `.com` address. If that page cannot open, ask the app administrator to check the allowed domains.

## Sign in

Open the [sign-in page](/login) to use your email address or username and password. You can also sign in with an email code, passkey, Google, or GitHub. After requesting an email code, enter the six-digit code; a countdown shows when you can request another.

When you arrive from a subapp, Auth Center returns you to that app after sign-in.

## Register and verify your email

On the [registration page](/register), enter your email, username, full name, and password. A registration code is optional. An email invitation pre-fills your email and code. Complete the human check and email verification as prompted. If external registration is closed, contact an administrator.

Your password must be at least eight characters, include both letters and numbers, and reach Medium or High on the three-segment strength indicator. The form checks your email, username, full name, password, and optional registration code before the human-verification step, so you can fix errors on the same page.

If the verification email does not arrive, check your spam folder, then use Resend on the verification page. Registration codes and invitation links have their own usage and expiration limits.

## Recover your password

Enter your linked email on the [forgot-password page](/forgot-password). Use the emailed link before it expires to set a new password. If your account has no linked email, contact an administrator.

## Manage your profile

After signing in, open your user details to change your full name, birthday, or avatar. You can position and scale an uploaded image; the original is retained so you can crop it again later. Removing a custom avatar restores the name-based default avatar. The page offers a 30-minute restore option.

New Google or GitHub accounts may initially use the provider avatar. Linking a provider to an existing account does not change its avatar. You can upload your own image or restore the name-based default from your profile.

## Email, password, and sign-in methods

Choose **Change Email / Bind Email** in your profile to add or change an email address. Your old address stays in place until the new one is confirmed. Choose **Change Password** to update your password.

Use **Bind other account** to connect Google or GitHub, or remove an existing connection. Removing a sign-in provider does not delete your account or its email address. Keep at least one sign-in method you can access.

Manage passkeys under **Passkeys**. Support depends on your device and browser.

## Registration codes and app permissions

Choose **Apply Register Code** in your profile to enter a code. Applying it updates the associated app permissions and quotas. Each code can be used only once. Administrators configure which apps and quotas are available.

## Login devices and sign-out

Choose **Login Devices** to see devices and the app ID that initiated each sign-in. Activity started directly in Auth Center appears as `auth-center`. You can revoke one device or sign out of all devices; you must sign in again afterward.

## Troubleshooting

- Email code or verification message missing: check spam and the address spelling, then wait for the resend countdown.
- Sign-in failed: check your email or username, password, and verification status. Use a password-reset email if needed.
- An app is unavailable: ask its administrator to check your app permission and quota.
- Suspicious account or device activity: change your password and sign out of all devices promptly.
