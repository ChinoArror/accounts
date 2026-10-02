export type OAuthDecision = 'login' | 'blocked' | 'link_existing' | 'verify_existing_first' | 'closed' | 'unsupported_domain' | 'new_account';

export function oauthDecision(input: {
  linked: boolean;
  status: string | null;
  emailOwnerStatus: string | null;
  externalOpen: boolean;
  emailDomainAllowed?: boolean;
}): OAuthDecision {
  if (input.linked) return input.status === 'active' ? 'login' : 'blocked';
  if (input.emailOwnerStatus === 'active') return 'link_existing';
  if (input.emailOwnerStatus) return 'verify_existing_first';
  if (!input.externalOpen) return 'closed';
  return input.emailDomainAllowed === false ? 'unsupported_domain' : 'new_account';
}

export function safeOAuthName(value: unknown) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  return name.length <= 80 && !/admin/i.test(name) ? name : '';
}

export function oauthHourBucket(now = new Date()) {
  return new Date(Math.floor(now.getTime() / 3600000) * 3600000).toISOString();
}

export function oauthEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
