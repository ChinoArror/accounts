import assert from 'node:assert/strict';
import { buildRegistrationSeries, parseRegistrationRange } from './src/registrationStats';

const range = parseRegistrationRange('day', '2026-09-29', '2026-09-30');
assert.equal(range?.granularity, 'day');
assert.equal(parseRegistrationRange('day', '2026-01-01', '2028-01-01'), null);
assert.deepEqual(buildRegistrationSeries([{ bucket: '2026-09-29', channel: 'google', total: 2 }], range!), [
  { period: '2026-09-29', total: 2, email: 0, github: 0, google: 2 },
  { period: '2026-09-30', total: 0, email: 0, github: 0, google: 0 },
]);
console.log('Registration statistics tests passed');
