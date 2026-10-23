import assert from 'node:assert/strict';
import { alternateCnCallback, resolveAppCallback } from '../src/appCallback';

const primary = 'https://point.aryuki.com/sso-callback';
const alternate = 'https://point.aryuki.cn/sso-callback';

assert.equal(alternateCnCallback(primary), alternate);
assert.equal(alternateCnCallback('https://point.aryuki.com/other/path'), 'https://point.aryuki.cn/other/path');
assert.equal(alternateCnCallback('https://unrelated.com/sso-callback'), null);
assert.equal(alternateCnCallback('http://point.aryuki.com/sso-callback'), null);
assert.equal(alternateCnCallback('https://point.aryuki.com:8443/sso-callback'), null);
assert.equal(alternateCnCallback('https://point.aryuki.com/sso-callback?next=1'), null);

assert.deepEqual(resolveAppCallback({ callback_url: primary, allow_cn_callback: 0 }, alternate), { url: primary, usedCn: false, fallback: true });
assert.deepEqual(resolveAppCallback({ callback_url: primary, allow_cn_callback: 1 }, alternate), { url: alternate, usedCn: true, fallback: false });
assert.deepEqual(resolveAppCallback({ callback_url: primary, allow_cn_callback: 1 }, primary), { url: primary, usedCn: false, fallback: false });
assert.equal(resolveAppCallback({ callback_url: primary, allow_cn_callback: 1 }, 'https://evil.aryuki.cn/sso-callback'), null);
assert.equal(resolveAppCallback({ callback_url: primary, allow_cn_callback: 1 }, 'https://point.aryuki.cn/other'), null);
assert.equal(resolveAppCallback({ callback_url: primary, allow_cn_callback: 1 }, 'https://point.aryuki.cn:8443/sso-callback'), null);

console.log('App callback tests passed');
