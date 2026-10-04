import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workerSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

assert.match(schema, /preview_enabled INTEGER NOT NULL DEFAULT 0/);
assert.match(workerSource, /app\.post\('\/preview\/api\/session'/);
assert.match(workerSource, /app\.get\('\/preview\/api\/session'/);
assert.match(workerSource, /app\.post\('\/preview\/api\/launch'/);
assert.match(workerSource, /app\.post\('\/preview\/api\/logout'/);
assert.match(workerSource, /setCookie\(c, 'test_preview_session'/);
assert.match(workerSource, /sameSite: 'Strict'/);
assert.match(workerSource, /path: '\/preview'/);
assert.match(workerSource, /Cache-Control', 'no-store, private'/);
assert.match(workerSource, /preview_session_created/);
assert.match(workerSource, /preview_app_launch/);
assert.match(workerSource, /preview_session_revoked/);
assert.match(workerSource, /pathname\.startsWith\('\/preview'\)[\s\S]{0,220}setPreviewResponseHeaders/);

console.log('Test identity Preview Worker contract passed.');
