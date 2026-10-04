import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.match(source, /function useDashboardBodyScrollLock\(active: boolean\) \{\s*useLayoutEffect\(/s,
  'Dash modal locking must happen before the opening frame paints');
assert.match(source, /function DashboardModalLayer\(/,
  'Dash modals must use one dedicated top-level layer rather than mount inside the scrolling main element');
assert.match(source, /createPortal\(/,
  'Dash modal layer must render outside the dashboard scroll container');
assert.match(source, /<AnimatePresence mode="wait">\s*\{modal/s,
  'Dash modal changes must wait for the prior overlay exit animation');

const layerStart = source.indexOf('function DashboardModalLayer');
const layerEnd = source.indexOf('function Dashboard()', layerStart);
const layerSource = source.slice(layerStart, layerEnd);
assert.match(layerSource, /key=\{modalKey\}[\s\S]{0,600}initial=\{false\}/,
  'Dash overlay must be opaque on its first frame so the triggering button cannot flash through');

console.log('Dashboard modal transition safeguards passed');
