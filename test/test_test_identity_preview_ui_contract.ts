import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('./src/App.tsx', import.meta.url), 'utf8');
const accessSource = readFileSync(new URL('./src/TestAccess.tsx', import.meta.url), 'utf8');

assert.match(appSource, /import \{ TestIdentityPreview \} from '\.\/TestIdentityPreview'/);
assert.match(appSource, /<Route path="\/preview" element=\{<TestIdentityPreview \/>\} \/>/);
assert.match(accessSource, /MonitorPlay/);
assert.match(accessSource, /preview_enabled/);
assert.match(accessSource, /preview_url/);
assert.match(accessSource, /Preview link/);

const previewSource = readFileSync(new URL('./src/TestIdentityPreview.tsx', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('./src/index.css', import.meta.url), 'utf8');
assert.match(previewSource, /preview-redline-shell/);
assert.match(previewSource, /preview-command-mark/);
assert.match(previewSource, /preview-launch-core/);
assert.match(previewSource, /preview-app-matrix/);
assert.doesNotMatch(previewSource, /ThemeToggle/);
assert.match(styleSource, /\.preview-redline-shell/);
assert.match(styleSource, /clip-path: polygon/);
assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(previewSource, /const launchTab = window\.open\('', '_blank'\)/);
assert.match(previewSource, /launchTab\.location\.replace\(body\.redirect_url\)/);
assert.match(previewSource, /window\.setTimeout\(\(\) => setLaunching\(''\), 2000\)/);
assert.doesNotMatch(previewSource, /window\.location\.assign\(body\.redirect_url\)/);
assert.doesNotMatch(previewSource, /AC\/07/);
assert.match(styleSource, /\.preview-app-plate--2 \{ clip-path: polygon\(6% 0, 100% 0, 94% 100%, 0 100%, 0 16%\); \}/);

console.log('Test identity Preview UI contract passed.');
