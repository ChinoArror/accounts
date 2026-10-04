import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/UserProfile.tsx', import.meta.url), 'utf8');

assert.match(
  source,
  /function useBodyScrollLock\(\) \{\s*React\.useLayoutEffect\(/s,
  'Admin modal must lock the document before the browser paints the opening frame',
);
assert.match(
  source,
  /<AnimatePresence mode="wait">/,
  'Admin modal changes must finish the previous exit animation before mounting the next modal',
);

console.log('Admin modal transition safeguards passed');
