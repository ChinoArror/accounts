import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});
mkdirSync('output', { recursive: true });
try {
  for (const [label, viewport] of [
    ['mobile', { width: 390, height: 844 }],
    ['desktop', { width: 1440, height: 900 }],
  ] as const) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    await page.route('**/api/auth/registration/rules', (route) => route.fulfill({ json: { ok: true, rules: { mode: 'open', email_registration_allowed: true, external_registration_enabled: true, turnstile_site_key: 'test-site-key' } } }));
    await page.route('**/api/auth/oauth/config', (route) => route.fulfill({ json: { ok: true, github_enabled: true, google_enabled: false } }));
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `window.turnstile={render:(node,options)=>{node.textContent='Test verification';options.callback('test-token');return 'test-widget'},reset:()=>{}};` }));
    await page.goto('http://127.0.0.1:3100/login');
    await page.getByRole('heading', { name: 'Sign in' }).waitFor();
    await page.waitForTimeout(450);
    assert.equal(await page.evaluate(() => window.innerWidth), viewport.width);
    assert.equal(await page.getByRole('link', { name: /Google/ }).count(), 1);
    assert.equal(await page.getByRole('link', { name: /GitHub/ }).count(), 1);
    await page.screenshot({ path: `output/oauth-login-${label}.png`, fullPage: true });
    let width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(width.scroll <= width.client + 1, `Login overflows ${label}: ${JSON.stringify(width)}`);

    await page.goto('http://127.0.0.1:3100/register');
    await page.getByLabel('Email').fill('alice@gmail.com');
    await page.getByLabel('Username').fill('alice');
    await page.getByLabel('Full name').fill('Alice');
    await page.getByLabel('Password').fill('Password123');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Welcome' }).waitFor();
    await page.waitForTimeout(450);
    await page.screenshot({ path: `output/oauth-welcome-email-${label}.png`, fullPage: true });
    width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(width.scroll <= width.client + 1, `Welcome overflows ${label}: ${JSON.stringify(width)}`);
    await page.close();
  }
  console.log('OAuth browser layout checks passed');
} finally { await browser.close(); }
