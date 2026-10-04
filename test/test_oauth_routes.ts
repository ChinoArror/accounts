import assert from 'node:assert/strict';
import worker from '../src/index';

const env: any = { JWT_SECRET: 'local-test-secret', GITHUB_CLIENT_ID: 'github-id', GITHUB_CLIENT_SECRET: 'github-secret', GOOGLE_CLIENT_ID: 'REPLACE_GOOGLE_CLIENT_ID' };
const config = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/config'), env);
assert.equal(config.status, 200);
assert.equal((await config.json() as any).google_enabled, false);
const bundledConfig = await worker.fetch(new Request('https://accounts.aryuki.com/api/auth/oauth/config'), { ...env, GOOGLE_OAUTH_CREDENTIALS: JSON.stringify({ web: { client_id: 'real-client-id', client_secret: 'real-client-secret' } }) });
assert.equal((await bundledConfig.json() as any).google_enabled, true);
const google = await worker.fetch(new Request('https://accounts.aryuki.com/api/google/login'), env);
assert.equal(google.status, 302);
assert.equal(google.headers.get('location'), '/login?error=google_unavailable');
const stats = await worker.fetch(new Request('https://accounts.aryuki.com/admin/stats/external-registrations'), env);
assert.equal(stats.status, 401);
console.log('OAuth route tests passed');
