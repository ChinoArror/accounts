import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
mkdirSync('output', { recursive: true });

try {
  for (const [label, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]] as const) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    await page.route('**/api/auth/session/continue', (route) => route.fulfill({ json: { ok: true, token: 'admin-token', user: { role: 'admin', username: 'admin', name: 'Admin' } } }));
    await page.route('**/admin/users', (route) => route.fulfill({ json: [{ uuid: 'u1', username: 'alice', name: 'Alice', status: 'active', role: 'user', cookie_expiry_days: 7, password_plain: 'test-password' }] }));
    await page.route('**/admin/apps', (route) => route.fulfill({ json: [] }));
    await page.route('**/admin/permissions', (route) => route.fulfill({ json: [] }));
    await page.goto('http://127.0.0.1:3100/dash');
    await page.evaluate(() => {
      (window as any).__dashboardOpeningOverlayOpacity = null;
      const observer = new MutationObserver(() => {
        const close = document.querySelector('[aria-label="Close"]');
        const overlay = close?.parentElement?.parentElement;
        if (!overlay) return;
        (window as any).__dashboardOpeningOverlayOpacity = getComputedStyle(overlay).opacity;
        observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    await page.getByRole('button', { name: 'Overwrite password' }).click();
    await page.getByRole('heading', { name: 'Overwrite Password' }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).__dashboardOpeningOverlayOpacity), '1', 'opening overlay must cover the triggering button immediately');
    await page.waitForTimeout(240);

    assert.equal(await page.evaluate(() => document.body.style.position), 'fixed');
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), 'hidden');
    assert.equal(await page.locator('[aria-label="Close"]').count(), 1);
    const close = await page.locator('[aria-label="Close"]').boundingBox();
    assert.ok(close && close.x >= 0 && close.y >= 0 && close.x + close.width <= viewport.width && close.y + close.height <= viewport.height);
    const overlay = page.locator('[aria-label="Close"]').locator('xpath=../..');
    assert.equal(await overlay.evaluate((node) => node.parentElement === document.body), true, 'modal overlay must be portalled to document.body');
    const panel = page.getByRole('heading', { name: 'Overwrite Password' }).locator('xpath=../..');
    assert.equal(await panel.evaluate((node) => getComputedStyle(node).backgroundColor), 'rgb(11, 15, 25)', 'Dash modal retains its dark dashboard panel');
    await page.screenshot({ path: `output/dashboard-password-modal-${label}.png` });
    await page.getByRole('button', { name: 'Close' }).click();
    await page.waitForTimeout(260);
    assert.equal(await page.evaluate(() => document.body.style.position), '');
    await page.close();
  }
  console.log('Dashboard modal visual checks passed');
} finally {
  await browser.close();
}
