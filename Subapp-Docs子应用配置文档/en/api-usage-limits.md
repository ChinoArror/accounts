# Subapp Agent quota and rate-limit integration

> Updated: 2026-10-10

This guide explains how an SSO-integrated subapp can use Auth Center's Agent limits to control model API request rates and token consumption.

## 1. How quotas work

The quota engine is separate from basic SSO. It records and constrains traffic only for apps with **Enable Agent Limits** turned on. For an enabled app, administrators authorize a user and configure RPM, RPD, and daily tokens. Authorization is separate from the numeric limits: a user with no app permission is denied even if the limit fields are blank. An authorized user's blank limit is unlimited; `0` means zero, and any other non-negative integer is the exact limit.

Integration has two steps. **Pre-check** the user's access and remaining quota before calling an LLM; **post-consume** the actual token usage after the response. To avoid breaking a streamed response, `/api/quota/consume` only records usage. A limit crossed during that request is enforced on the next pre-check. Enabled app activity is shown in usage charts and token reports.

## 2. Dashboard setup

As an admin, go to **Applications**. Select **Enable Agent Limits** when creating an app, or open **App Details**, enable it, and save. Put that app's `app_id` and `secret_key` in the subapp's server-side environment, never frontend code.

In **Permissions**, authorize the user for the app, then use its **Settings** control to set:

| Field | Unit | Meaning |
| --- | --- | --- |
| RPM | requests/minute | Request rate per minute |
| RPD | requests/day | Requests per day |
| Tokens Per Day | raw tokens/day | Daily input and output token allowance; `100000` means 100,000 tokens, not 100k as an abbreviated unit |

Each field uses the same rule: blank = unlimited, `0` = zero allowance, another non-negative integer = that exact allowance. This does not grant app permission by itself.

## 3. Pre-check before the model call

On the subapp backend, use the signed-in user's stable Auth Center `uuid` (or JWT `sub`), the app ID, and the app secret:

```javascript
const AUTH_CENTER_URL = 'https://accounts.aryuki.com';

async function checkQuota(uuid, env) {
  const url = `${AUTH_CENTER_URL}/api/quota/check?uuid=${encodeURIComponent(uuid)}&app_id=${encodeURIComponent(env.YOUR_APP_ID)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${env.YOUR_SECRET_KEY}` }
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error('Quota exceeded; try later or contact an administrator.');
    if (response.status === 403) throw new Error('This account is not authorized for this app or quota.');
    if (response.status === 401) throw new Error('App secret is invalid.');
    throw new Error(`Quota check failed: HTTP ${response.status}`);
  }
  return response.json(); // { valid: true, quota, remaining_tokens: ... }
}
```

Do not use a display name or email as the quota subject. They can change or be reused by another account.

## 4. Report actual consumption

After the LLM responds, obtain its actual total token usage and send it to Auth Center. Where possible, use `ctx.waitUntil(...)` in a Cloudflare Worker so accounting does not delay the response to the user.

```javascript
async function consumeQuota(uuid, totalTokens, env) {
  const response = await fetch(`${AUTH_CENTER_URL}/api/quota/consume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.YOUR_SECRET_KEY}`
    },
    body: JSON.stringify({ uuid, app_id: env.YOUR_APP_ID, tokens: totalTokens })
  });
  if (!response.ok) console.error('Quota accounting failed:', response.status);
}
```

## 5. Reading token usage from providers

Provider response shapes differ between streaming and non-streaming calls. These are examples, not a substitute for checking the provider's current API contract.

### OpenAI-compatible, non-streaming

```javascript
const totalTokens = data.usage.total_tokens;
```

### OpenAI-style SSE streaming

Request usage in the final streamed chunk and read its `usage` field:

```javascript
const body = {
  model: 'gpt-4o',
  messages: [],
  stream: true,
  stream_options: { include_usage: true }
};
// While decoding SSE chunks:
if (chunk.usage) totalTokens = chunk.usage.total_tokens;
```

The final chunk can contain usage without any generated text delta.

### Anthropic Claude

For a non-streaming response, add `data.usage.input_tokens + data.usage.output_tokens`. For streaming, capture `input_tokens` from `message_start` and accumulate `output_tokens` from `message_delta` events.

### Google Gemini

For non-streaming output or the final streamed chunk, use `data.usageMetadata.totalTokenCount` when supplied.
