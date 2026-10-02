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
    ['desktop', { width: 1440, height: 900 }],
    ['tablet', { width: 1024, height: 768 }],
    ['mobile', { width: 390, height: 844 }],
    ['small-mobile', { width: 360, height: 740 }],
  ] as const) {
    for (const theme of ['light', 'dark'] as const) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      await page.addInitScript((selected) => localStorage.setItem('auth_center_theme', selected), theme);
      await page.route('**/api/session', (route) => route.fulfill({ json: { active: false } }));
      await page.route('**/api/auth/oauth/config', (route) => route.fulfill({ json: { ok: true, google_enabled: true, github_enabled: true } }));
      await page.goto('http://127.0.0.1:3100/');
      await page.locator(`.ac-landing[data-theme="${theme}"]`).waitFor();
      await page.getByRole('link', { name: 'Continue with Google' }).waitFor();
      assert.equal(await page.getByRole('link', { name: 'Continue with email' }).getAttribute('href'), '/login');
      assert.equal(await page.getByRole('link', { name: 'Continue with Google' }).getAttribute('href'), '/api/google/login');
      assert.equal(await page.getByRole('link', { name: 'Continue with GitHub' }).getAttribute('href'), '/api/github/login');
      assert.equal(await page.locator('.ac-landing-photo img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), true);
      const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      assert.ok(width.scroll <= width.client + 1, `${label}/${theme} horizontal overflow: ${JSON.stringify(width)}`);
      const email = await page.getByRole('link', { name: 'Continue with email' }).boundingBox();
      assert.ok(email && email.y + email.height < viewport.height, `${label}/${theme} email action outside first viewport`);
      await page.screenshot({ path: `output/landing-${label}-${theme}.png`, fullPage: true });
      await page.close();
    }
  }
  console.log('Landing browser layout checks passed');
} finally { await browser.close(); }
