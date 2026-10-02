import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3100';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true });
await mkdir('output', { recursive: true });

try {
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/dev/docs`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '子应用接入文档', exact: true }).waitFor();
    const count = await page.locator('.docs-sidebar .docs-list-item').count();
    if (count !== 6) throw new Error(`${name}: expected 6 guides, got ${count}`);
    await page.goto(`${base}/dev/docs?doc=${encodeURIComponent('测试身份适配指南.md')}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '测试身份适配指南', exact: true }).waitFor();
    await page.getByRole('button', { name: /测试身份适配指南/ }).click();
    await page.getByRole('heading', { name: '测试身份适配指南', exact: true }).waitFor();
    await page.screenshot({ path: `output/dev-docs-${name}.png`, fullPage: false });
    await page.goto(`${base}/user/docs`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '用户使用指南', exact: true }).first().waitFor();
    await page.getByRole('heading', { name: '登录设备与退出' }).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error(`${name}: horizontal overflow`);
    await page.screenshot({ path: `output/user-docs-${name}.png`, fullPage: false });
    if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
    await page.close();
    console.log(`${name}: 6 guides, routes, rendering and width OK`);
  }
} finally {
  await browser.close();
}
