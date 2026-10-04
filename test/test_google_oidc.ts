import assert from 'node:assert/strict';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { exchangeGoogle } from '../src/oauthProviders';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'test-key', use: 'sig', alg: 'RS256' };
const token = await new SignJWT({ sub: 'google-subject', email: 'User@GMAIL.COM', email_verified: true, name: 'Alice', nonce: 'nonce-one' })
  .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
  .setIssuer('https://accounts.google.com')
  .setAudience('client-id')
  .setIssuedAt()
  .setExpirationTime('5m')
  .sign(privateKey);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any) => {
  const url = String(input);
  if (url === 'https://oauth2.googleapis.com/token') return Response.json({ id_token: token, access_token: 'access' });
  if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
  throw new Error(`Unexpected request ${url}`);
};
try {
  const profile = await exchangeGoogle('code', 'https://accounts.aryuki.com/api/google/callback', 'client-id', 'client-secret', 'pkce-verifier', 'nonce-one', false);
  assert.equal(profile.subject, 'google-subject');
  assert.equal(profile.email, 'user@gmail.com');
  await assert.rejects(exchangeGoogle('code', 'https://accounts.aryuki.com/api/google/callback', 'client-id', 'client-secret', 'pkce-verifier', 'wrong-nonce', false));
  console.log('Google OIDC verification tests passed');
} finally { globalThis.fetch = originalFetch; }
