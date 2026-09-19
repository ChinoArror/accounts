import assert from 'node:assert/strict';
import { registerCodeUnavailable, registerInviteExpiry } from './src/emailAuthFeature';

assert.equal(
  registerInviteExpiry(Date.parse('2026-08-02T12:00:00.000Z')),
  '2026-08-08T16:00:00.000Z',
);
assert.equal(
  registerInviteExpiry(Date.parse('2026-08-31T15:59:00.000Z')),
  '2026-09-06T16:00:00.000Z',
);
assert.equal(registerCodeUnavailable({ status: 'unused', used_count: 0 }), false);
assert.equal(registerCodeUnavailable({ status: 'reserved', used_count: 0 }), true);

console.log('Register invitation expiry and reservation checks passed.');
