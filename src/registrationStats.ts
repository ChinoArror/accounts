export type RegistrationRange = { granularity: 'day' | 'month'; from: string; to: string };
type CountRow = { bucket: string; channel: string; total: number };

function validDate(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const parsed = new Date(`${input}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === input;
}

export function parseRegistrationRange(granularity: string, from: string, to: string): RegistrationRange | null {
  if (granularity !== 'day' && granularity !== 'month') return null;
  if (!validDate(from) || !validDate(to) || from > to) return null;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (days > (granularity === 'day' ? 365 : 730)) return null;
  return { granularity, from, to };
}

export function buildRegistrationSeries(rows: CountRow[], range: RegistrationRange) {
  const byBucket = new Map<string, { period: string; total: number; email: number; github: number; google: number }>();
  const cursor = new Date(`${range.from.slice(0, range.granularity === 'month' ? 7 : 10)}${range.granularity === 'month' ? '-01' : ''}T00:00:00Z`);
  const end = range.granularity === 'month' ? range.to.slice(0, 7) : range.to;
  for (let count = 0; count < 366; count++) {
    const period = cursor.toISOString().slice(0, range.granularity === 'month' ? 7 : 10);
    if (period > end) break;
    byBucket.set(period, { period, total: 0, email: 0, github: 0, google: 0 });
    if (range.granularity === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const row of rows) {
    const bucket = byBucket.get(row.bucket);
    if (!bucket || !['email', 'github', 'google'].includes(row.channel)) continue;
    const amount = Number(row.total) || 0;
    bucket.total += amount;
    bucket[row.channel as 'email' | 'github' | 'google'] += amount;
  }
  return Array.from(byBucket.values());
}
