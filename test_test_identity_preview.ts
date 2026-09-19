import assert from 'node:assert/strict';
import {
  buildPreviewUrl,
  expandPreviewApps,
  normalizePreviewEnabled,
  previewSessionExpiresAt,
} from './src/testPreview';

assert.equal(normalizePreviewEnabled(true), true);
assert.equal(normalizePreviewEnabled(1), true);
assert.equal(normalizePreviewEnabled('1'), true);
assert.equal(normalizePreviewEnabled(false), false);
assert.equal(normalizePreviewEnabled('true'), false);

const origin = 'https://accounts.aryuki.com';
const previewUrl = buildPreviewUrl(origin, 'qa-check', 'sk_test_example');
assert.equal(previewUrl, 'https://accounts.aryuki.com/preview#name=qa-check&secret=sk_test_example');
assert.equal(new URL(previewUrl).search, '');
assert.equal(new URL(previewUrl).pathname, '/preview');

const apps = [
  { app_id: 'class-schedule', app_name: 'Class Schedule', status: 'active' },
  { app_id: 'grade-save', app_name: 'Grade Save', status: 'active' },
  { app_id: 'old-app', app_name: 'Old App', status: 'disabled' },
];
assert.deepEqual(
  expandPreviewApps(['*'], apps).map((app) => app.app_id),
  ['class-schedule', 'grade-save'],
);
assert.deepEqual(
  expandPreviewApps(['grade-save', 'missing'], apps).map((app) => app.app_id),
  ['grade-save'],
);

assert.equal(
  previewSessionExpiresAt('2026-09-19T00:00:00.000Z', 30),
  '2026-09-19T00:30:00.000Z',
);

console.log('Test identity Preview domain helpers passed.');
