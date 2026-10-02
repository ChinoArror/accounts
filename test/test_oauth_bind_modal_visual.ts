import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
mkdirSync('output', { recursive: true });
try {
  for (const [label, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]] as const) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    await page.route('**/api/user/session', (route) => route.fulfill({ json: { uuid: 'u1', username: 'alice', name: 'Alice', role: 'user', status: 'active', exp: Date.now() / 1000 + 3600 } }));
    await page.route('**/api/account/sessions', (route) => route.fulfill({ json: { ok: true, sessions: [] } }));
    await page.route('**/api/account/oauth-bindings', (route) => route.fulfill({ json: { ok: true, bindings: [] } }));
    await page.route('**/api/auth/registration/rules', (route) => route.fulfill({ json: { ok: true, rules: {} } }));
    await page.goto('http://127.0.0.1:3100/user/u1');
    await page.getByRole('button', { name: 'Bind other account' }).click();
    await page.getByRole('button', { name: 'Continue with Google' }).waitFor();
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    const close = await page.getByRole('button', { name: 'Close' }).boundingBox();
    assert.ok(close && close.x >= 0 && close.y >= 0 && close.x + close.width <= viewport.width && close.y + close.height <= viewport.height);
    await page.screenshot({ path: `output/oauth-bind-user-${label}.png` });
    await page.getByRole('button', { name: 'Close' }).click();
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');

    let userDeletes = 0;
    await page.route('**/api/account/oauth-bindings', (route) => route.fulfill({ json: { ok: true, bindings: [{ provider: 'google', provider_subject: 'g-123', provider_email: 'alice@gmail.com', linked_at: '2026-09-30T00:00:00Z' }] } }));
    await page.route('**/api/account/oauth-bindings/google', (route) => {
      userDeletes += 1;
      return route.fulfill({ json: { ok: true } });
    });
    await page.reload();
    await page.getByRole('button', { name: 'Bind other account' }).click();
    await page.getByText('alice@gmail.com').last().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).count(), 0);
    await page.getByRole('button', { name: 'Unlink google' }).click();
    assert.equal(userDeletes, 0);
    await page.getByRole('button', { name: 'Unlink account' }).click();
    assert.equal(userDeletes, 1);
    await page.screenshot({ path: `output/oauth-unlink-user-${label}.png` });

    await page.addInitScript(() => localStorage.setItem('sso_admin_auth', 'Bearer expired'));
    await page.route('**/api/auth/session/continue', (route) => route.fulfill({ json: { ok: true, token: 'new-admin-token', user: { role: 'admin' } } }));
    await page.route('**/admin/users', (route) => route.request().headers().authorization === 'Bearer expired'
      ? route.fulfill({ status: 401, json: { error: 'Expired' } })
      : route.fulfill({ json: [{ uuid: 'u1', username: 'alice', name: 'Alice', status: 'active', role: 'user' }] }));
    await page.route('**/admin/auth/users/u1/detail', (route) => route.fulfill({ json: { user: { uuid: 'u1', username: 'alice', name: 'Alice', status: 'active', role: 'user' }, sessions: [], register_codes: [], oauth_bindings: [{ provider: 'google', provider_subject: 'g-123', provider_email: 'alice@gmail.com', linked_at: '2026-09-30T00:00:00Z' }] } }));
    await page.goto('http://127.0.0.1:3100/@alice');
    await page.getByRole('button', { name: 'Bind other account' }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('sso_admin_auth')), 'Bearer new-admin-token');
    await page.getByRole('button', { name: 'Continue with GitHub' }).waitFor();
    await page.getByText('Provider ID: g-123').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Continue with Google' }).count(), 0);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => document.body.style.position), 'fixed');
    const adminClose = await page.getByRole('button', { name: 'Close' }).boundingBox();
    assert.ok(adminClose && adminClose.x >= 0 && adminClose.y >= 0 && adminClose.x + adminClose.width <= viewport.width && adminClose.y + adminClose.height <= viewport.height);
    await page.screenshot({ path: `output/oauth-bind-admin-${label}.png` });
    await page.getByRole('button', { name: 'Unlink google' }).click();
    await page.getByRole('button', { name: 'Unlink account' }).waitFor();
    await page.screenshot({ path: `output/oauth-unlink-admin-${label}.png` });
    await page.close();
  }
  console.log('OAuth bind modal visual checks passed');
} finally { await browser.close(); }
