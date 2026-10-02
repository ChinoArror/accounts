import { createRemoteJWKSet, jwtVerify } from 'jose';
import { oauthEmail, safeOAuthName } from './oauthPolicy';

export type OAuthProvider = 'github' | 'google';
export type OAuthProfile = {
  provider: OAuthProvider;
  subject: string;
  email: string | null;
  username: string;
  name: string;
  avatar_url: string | null;
  birthday: string | null;
};

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export function githubProfile(user: any, emails: any[]): OAuthProfile | null {
  const primary = emails.find((item) => item.primary === true && item.verified === true);
  const email = oauthEmail(primary?.email);
  if (!Number.isSafeInteger(Number(user?.id))) return null;
  const avatar = String(user.avatar_url || '');
  return {
    provider: 'github', subject: String(user.id), email,
    username: safeOAuthName(user.login) || 'member',
    name: safeOAuthName(user.name) || safeOAuthName(user.login) || 'Member',
    avatar_url: /^https:\/\/avatars\.githubusercontent\.com\//.test(avatar) ? avatar : null,
    birthday: null,
  };
}

export function googleProfile(claims: any, birthday: string | null = null): OAuthProfile | null {
  const email = claims?.email_verified === true ? oauthEmail(claims.email) : null;
  if (!claims?.sub) return null;
  const avatar = String(claims.picture || '');
  return {
    provider: 'google', subject: String(claims.sub), email,
    username: safeOAuthName(claims.name) || 'member',
    name: safeOAuthName(claims.name) || 'Member',
    avatar_url: /^https:\/\/(lh3\.googleusercontent\.com|googleusercontent\.com)\//.test(avatar) ? avatar : null,
    birthday,
  };
}

export function googleAuthorizeUrl(clientId: string, redirectUri: string, state: string, challenge: string, nonce: string, birthday = false) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', `openid email profile${birthday ? ' https://www.googleapis.com/auth/user.birthday.read' : ''}`);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'online');
  return url.toString();
}

export async function exchangeGithub(code: string, redirectUri: string, clientId: string, clientSecret: string): Promise<OAuthProfile> {
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  });
  const token: any = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) throw new Error('GitHub authorization failed');
  const headers = { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'auth-center' };
  const [userResponse, emailResponse] = await Promise.all([
    fetch('https://api.github.com/user', { headers }),
    fetch('https://api.github.com/user/emails', { headers }),
  ]);
  if (!userResponse.ok || !emailResponse.ok) throw new Error('GitHub profile is unavailable');
  const profile = githubProfile(await userResponse.json(), await emailResponse.json());
  if (!profile) throw new Error('GitHub requires a verified primary email');
  return profile;
}

export async function exchangeGoogle(code: string, redirectUri: string, clientId: string, clientSecret: string, verifier: string, nonce: string, birthdayEnabled: boolean): Promise<OAuthProfile> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
  });
  const token: any = await response.json();
  if (!response.ok || !token.id_token) throw new Error('Google authorization failed');
  const { payload } = await jwtVerify(token.id_token, googleKeys, {
    algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: clientId,
  });
  if (payload.nonce !== nonce) throw new Error('Google authorization state mismatch');
  let birthday: string | null = null;
  if (birthdayEnabled && token.access_token) {
    const people = await fetch('https://people.googleapis.com/v1/people/me?personFields=birthdays', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    }).catch(() => null);
    if (people?.ok) {
      const data: any = await people.json();
      const date = data.birthdays?.find((item: any) => item.date?.year && item.date?.month && item.date?.day)?.date;
      if (date) {
        const candidate = `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
        if (!Number.isNaN(Date.parse(candidate))) birthday = candidate;
      }
    }
  }
  const profile = googleProfile(payload, birthday);
  if (!profile) throw new Error('Google requires a verified email');
  return profile;
}
