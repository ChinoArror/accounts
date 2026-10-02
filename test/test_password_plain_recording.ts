import assert from 'node:assert/strict';
import fs from 'node:fs';

const emailAuth = fs.readFileSync('src/emailAuthFeature.ts', 'utf8');
const legacyAuth = fs.readFileSync('src/index.ts', 'utf8');

assert.equal((emailAuth.match(/INSERT INTO users \([^)]*password_plain/g) || []).length, 3);
assert(!legacyAuth.includes("password_hash, password_salt, password_plain, cookie_expiry_days, birthday, avatar_data, avatar_key, updated_at\n      ) VALUES (?, ?, ?, ?, 'user', 'active', 'code', 0, ?, ?, NULL"));

console.log('All registration paths record password_plain.');
