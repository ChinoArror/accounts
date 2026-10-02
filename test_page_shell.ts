import { chromium, type Page } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3100';
const isLive = base.startsWith('https://');
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});

async function assertFooter(page: Page, pageSelector: string) {
  const colors = await page.evaluate((selector) => {
    const pageRoot = document.querySelector(selector);
    const footer = document.querySelector('.ac-legal-footer');
    if (!pageRoot || !footer) return null;
    return {
      page: getComputedStyle(pageRoot).backgroundColor,
      footer: getComputedStyle(footer).backgroundColor,
    };
  }, pageSelector);
  if (!colors || colors.footer !== colors.page) throw new Error(`Footer does not match ${pageSelector}: ${JSON.stringify(colors)}`);
}

try {
  await mkdir('output', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 820 } });
  page.on('pageerror', (error) => console.error('page error:', error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error('console error:', message.text()); });
  page.on('response', (response) => { if (response.status() === 401) console.error('401 response:', new URL(response.url()).pathname); });
  await page.addInitScript(() => {
    localStorage.setItem('auth_center_theme', 'light');
    localStorage.setItem('sso_admin_auth', 'Bearer test-shell');
  });
  await page.route('**/admin/bind-token', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"bind_token":"test-shell"}' }));
  await page.route('**/api/auth/session/continue', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"user":{"role":"admin","username":"admin","uuid":"test-admin"},"token":"test-shell"}' }));
  await page.route('**/api/passkey/admin/list', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/admin/test-identities/by-name/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not found"}' }));
  await page.route('**/admin/apps', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto(`${base}/user/docs`);
  await page.getByRole('heading', { name: '用户使用指南' }).waitFor();
  if (await page.locator('.docs-home').getAttribute('href') !== '/user') throw new Error('User guide back target must be /user');
  await assertFooter(page, '.docs-page');
  const sidebar = page.locator('.docs-user-nav');
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(100);
  const sidebarStyle = await sidebar.evaluate((node) => ({ top: node.getBoundingClientRect().top, shadow: getComputedStyle(node).boxShadow }));
  if (sidebarStyle.top < 12 || sidebarStyle.top > 40 || sidebarStyle.shadow === 'none') throw new Error(`User guide directory is not floating: ${JSON.stringify(sidebarStyle)}`);
  await page.screenshot({ path: 'output/user-docs-floating-desktop.png' });
  await page.getByRole('button', { name: /dark mode/i }).click();
  await assertFooter(page, '.docs-page');

  await page.goto(`${base}/dev/docs`);
  await page.getByRole('heading', { name: '子应用接入文档' }).waitFor();
  await assertFooter(page, '.docs-page');

  if (!isLive) {
  await page.goto(`${base}/admin/passkey`);
  await page.getByRole('heading', { name: 'Admin Passkeys', exact: true }).waitFor({ timeout: 8000 }).catch(async () => {
    throw new Error(`Admin passkey page did not stay open: ${page.url()} ${(await page.locator('body').innerText()).slice(0, 160)}`);
  });
  if (await page.getByRole('link', { name: /Back/ }).getAttribute('href') !== '/dash') throw new Error('Admin passkey back target must be /dash');
  await assertFooter(page, '.dashboard-theme');

  await page.goto(`${base}/dev/@test-shell`);
  if (await page.getByRole('link', { name: /返回/ }).getAttribute('href') !== '/dash') throw new Error('Test identity back target must be /dash');

  const adminUser = { uuid: 'a069da92-1ee1-4e52-9297-056bf564ed25', username: 'zhou', name: 'Zhou', role: 'user', status: 'active', created_at: '2026-09-01T00:00:00Z' };
  await page.route('**/admin/users', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([adminUser]) }));
  await page.route('**/admin/auth/users/**/detail', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: adminUser, sessions: [], register_codes: [], oauth_bindings: [] }) }));
  await page.goto(`${base}/@zhou`);
  await page.getByRole('heading', { name: 'Zhou', exact: true }).waitFor();
  await assertFooter(page, '.dashboard-theme');

  await page.route('**/admin/apps', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[{"app_id":"test-app","app_name":"Test App","use_agent_limit":0}]' }));
  await page.route('**/admin/permissions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(`${base}/app/test-app`);
  await page.getByRole('heading', { name: 'App Configuration' }).waitFor();
  await assertFooter(page, '.app-details-page');
  await page.getByRole('button', { name: 'Back to Dashboard' }).waitFor();

  const userPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await userPage.addInitScript(() => localStorage.setItem('auth_center_theme', 'dark'));
  const uuid = 'a069da92-1ee1-4e52-9297-056bf564ed25';
  await userPage.route('**/api/user/session', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ uuid, username: 'tester', name: 'Test User', role: 'user', email: 'test@example.com', email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 }),
  }));
  await userPage.goto(`${base}/user`);
  await userPage.waitForURL(`**/user/${uuid}`);
  await userPage.getByRole('heading', { name: 'User Details' }).waitFor();
  await assertFooter(userPage, '.dashboard-theme');
  await userPage.goto(`${base}/user/docs`);
  await userPage.getByRole('heading', { name: '用户使用指南' }).waitFor();
  await userPage.screenshot({ path: 'output/user-docs-mobile-dark.png' });
  const overflow = await userPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (overflow) throw new Error('Mobile user guide overflows horizontally');
  if (await userPage.locator('.docs-home').getAttribute('href') !== '/user') throw new Error('Mobile user guide back target must be /user');
  await userPage.close();
  }

  await page.route('**/api/auth/session/continue', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
  });
  await page.goto(`${base}/dash`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  const loadingText = await page.locator('body').innerText();
  if (!/restoring|checking|loading/i.test(loadingText)) throw new Error('Dashboard has no visible first-paint loading state');

  const bootPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await bootPage.route(/\/(?:src\/main\.tsx|assets\/index-[^/]+\.js)(?:\?.*)?$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await bootPage.goto(`${base}/dash`, { waitUntil: 'commit' });
  await bootPage.locator('#dash-boot').waitFor({ state: 'visible' });
  await bootPage.close();

  if (!isLive) {
    const validDashPage = await browser.newPage({ viewport: { width: 1365, height: 820 } });
    await validDashPage.route('**/api/auth/session/continue', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 850));
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"user":{"role":"admin","username":"admin","uuid":"test-admin"},"token":"test-shell"}' });
    });
    for (const path of ['admin/users', 'admin/apps', 'admin/permissions']) {
      await validDashPage.route(`**/${path}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    }
    await validDashPage.goto(`${base}/dash`);
    await validDashPage.getByText('Restoring your session...').waitFor();
    await validDashPage.getByText('Unified identity workspace').waitFor();
    await validDashPage.close();
  }

  console.log(isLive
    ? 'Live public docs footer, floating directory, and dashboard first paint passed.'
    : 'Page shell, protected-page return targets, floating directory, and dashboard transition passed.');
} finally {
  await browser.close();
}
