import jwt from '@tsndr/cloudflare-worker-jwt';

// Generate a random salt
export function generateSalt(): string {
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Hash password using PBKDF2 (Web Crypto API)
export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const exportedKey = await crypto.subtle.exportKey('raw', key);
  const hashBuffer = new Uint8Array(exportedKey as ArrayBuffer);
  return Array.from(hashBuffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verify password
export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const computedHash = await hashPassword(password, salt);
  return computedHash === hash;
}

// Generate JWT
export async function generateJWT(payload: any, secret: string, expiresInDays: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + (expiresInDays * 24 * 60 * 60);
  return await jwt.sign({ ...payload, exp }, secret);
}

// Verify JWT
export async function verifyJWT(token: string, secret: string): Promise<any> {
  const isValid = await jwt.verify(token, secret);
  if (!isValid) {
    throw new Error('Invalid token');
  }
  const { payload } = jwt.decode(token);
  return payload;
}
