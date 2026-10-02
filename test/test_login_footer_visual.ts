import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    await page.route('**/api/auth/registration/rules', (route) => route.fulfill({ json: { ok: true, rules: { turnstile_site_key: 'test' } } }));
    await page.goto('http://127.0.0.1:3100/login');
    await page.getByRole('heading', { name: 'Sign in' }).waitFor();
    assert.equal(await page.getByLabel('Password').count(), 0, 'password starts collapsed');
    assert.equal(await page.getByRole('link', { name: /Google/ }).count(), 1);
    assert.equal(await page.getByRole('link', { name: /GitHub/ }).count(), 1);
    await page.screenshot({ path: `output/login-initial-${viewport.width}.png` });
    await page.getByLabel('Email or name').fill('alice');
    await page.getByLabel('Password').waitFor();
    await page.waitForTimeout(320);
    await page.screenshot({ path: `output/login-expanded-${viewport.width}.png` });
    assert.equal(await page.getByRole('button', { name: 'Sign in' }).count(), 1);
    const cardBottom = await page.locator('.ui-auth-card-login').evaluate((node) => node.getBoundingClientRect().bottom);
    const footerTop = await page.locator('footer').last().evaluate((node) => node.getBoundingClientRect().top);
    assert.ok(footerTop >= cardBottom, 'footer does not overlap expanded login card');
    await page.getByRole('button', { name: /code login/i }).click();
    await page.getByRole('button', { name: 'Send code by email' }).waitFor();
    const footer = page.locator('footer').last();
    assert.equal(await footer.evaluate((node) => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', 'footer uses page surface');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.goto('http://127.0.0.1:3100/login?app_id=grade-save&redirect_uri=https%3A%2F%2Fexample.com%2Fcallback');
    await page.getByRole('heading', { name: 'Sign in' }).waitFor();
    assert.match(await page.getByRole('link', { name: /Google/ }).getAttribute('href') || '', /app_id=grade-save/);
    assert.equal(await page.getByLabel('Password').count(), 0);
    await page.close();
  }
  console.log('Login and footer visual checks passed');
} finally { await browser.close(); }
