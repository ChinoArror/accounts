import assert from 'node:assert/strict';
import { isAllowedOAuthRedirect, registrationChallengeRequired } from '../src/oauthFlow';

assert.equal(isAllowedOAuthRedirect('https://app.example.com/callback', 'https://app.example.com/callback?from=home'), true);
assert.equal(isAllowedOAuthRedirect('https://app.example.com/callback', 'https://evil.example.com/callback'), false);
assert.equal(isAllowedOAuthRedirect('https://app.example.com/callback', 'https://app.example.com/callback/else'), false);
assert.equal(isAllowedOAuthRedirect('https://app.example.com/callback', 'javascript:alert(1)'), false);
assert.equal(registrationChallengeRequired(3, 3), false);
assert.equal(registrationChallengeRequired(4, 3), true);
console.log('OAuth SSO policy tests passed');
