import assert from 'node:assert/strict';
import { githubProfile, googleProfile, googleAuthorizeUrl } from './src/oauthProviders';

assert.deepEqual(githubProfile({ id: 42, login: 'alice', name: 'Alice', avatar_url: 'https://avatars.githubusercontent.com/u/42' }, [
  { email: 'other@example.com', primary: false, verified: true },
  { email: 'ALICE@GMAIL.COM', primary: true, verified: true },
]), {
  provider: 'github', subject: '42', email: 'alice@gmail.com', username: 'alice', name: 'Alice', avatar_url: 'https://avatars.githubusercontent.com/u/42', birthday: null,
});
assert.equal(githubProfile({ id: 42, login: 'alice' }, [{ email: 'alice@gmail.com', primary: true, verified: false }])?.email, null);
assert.equal(googleProfile({ sub: 'subject', email: 'user@gmail.com', email_verified: false })?.email, null);
assert.equal(googleProfile({ sub: 'subject', email: 'user@gmail.com', email_verified: true })?.subject, 'subject');
const url = new URL(googleAuthorizeUrl('client-id', 'https://accounts.aryuki.com/api/google/callback', 'state', 'challenge', 'nonce'));
assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
assert.equal(url.searchParams.get('nonce'), 'nonce');
console.log('OAuth provider tests passed');
