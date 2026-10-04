import assert from 'node:assert/strict';
import { oauthDecision, oauthHourBucket, safeOAuthName } from '../src/oauthPolicy';

assert.equal(oauthDecision({ linked: true, status: 'active', emailOwnerStatus: null, externalOpen: false }), 'login');
assert.equal(oauthDecision({ linked: false, status: null, emailOwnerStatus: 'active', externalOpen: false }), 'link_existing');
assert.equal(oauthDecision({ linked: false, status: null, emailOwnerStatus: 'pending', externalOpen: true }), 'verify_existing_first');
assert.equal(oauthDecision({ linked: false, status: null, emailOwnerStatus: null, externalOpen: false }), 'closed');
assert.equal(oauthDecision({ linked: false, status: null, emailOwnerStatus: null, externalOpen: true }), 'new_account');
assert.equal(oauthDecision({ linked: false, status: null, emailOwnerStatus: null, externalOpen: true, emailDomainAllowed: false }), 'unsupported_domain');
assert.equal(oauthDecision({ linked: false, status: null, emailOwnerStatus: null, externalOpen: false, emailDomainAllowed: false }), 'closed');
assert.equal(oauthDecision({ linked: false, status: null, emailOwnerStatus: 'active', externalOpen: true, emailDomainAllowed: false }), 'link_existing');
assert.equal(safeOAuthName('Admin Helper'), '');
assert.equal(safeOAuthName('  Alice  '), 'Alice');
assert.equal(oauthHourBucket(new Date('2026-09-29T13:59:59Z')), '2026-09-29T13:00:00.000Z');
console.log('OAuth registration policy tests passed');
