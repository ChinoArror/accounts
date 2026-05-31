# SubApp Agent 用量控制与限频接入指南

本文档指导开发者如何将已对接 SSO 的子应用 (SubApp) 接入 Auth-Center 提供的**“Agent 用量限制”**功能，配置应用绑定以及相关代码拦截逻辑，从而有效监控与管理各大模型 API 的 Token 消耗与请求速率。

## 1. 原理概述

1. **配额系统 (Quota Engine)** 是 Auth-Center 独立于基础身份验证 (SSO) 之外的第二层核心引擎。
2. **只有开启了“用量限制”的应用**，流量与使用日志才会被系统收录与约束。一旦开启：
   - 管理员必须主动为获得授权的用户设置对应的配额指标（RPM / RPD / Tokens Limit），**不配置限流指标的用户默认会被拒绝访问本应用**，只有系统 Admin 及获得明确限额（或设为无限额）的用户才能通行通过。
   - 所有该应用的请求都会反馈在可视化分析图表（日历与用户的 Token 消耗量）中。
3. **两步走逻辑设计**：
   - 前置检查：在向大模型（如 OpenAI、Anthropic）发起请求前，向 Auth-Center API 校验当前用户是否有权发送请求，以及是否超过了上述的设限。
   - 后置扣费：在 LLM 接口真实流出数据后，拿到具体使用的 Token 并在 Auth-Center 扣除。
   - **平滑放行体验**：考虑到流式输出不可中断。`/api/quota/consume` 只是计费器，不做阻断，即使本次请求用量刚好超过剩余额度也会完成消费记录。系统的实际拦截动作均安排在下一次 Pre-check 校验中。

## 2. 第一步：在管理后台完成配置绑定

### 1) 开启应用的 Agent 限制功能
你需要以管理员身份登录 Auth-Center，去往 **Applications** 页面：
- 若**注册新应用**，可以在表单最底端直接勾选 `开启 Agent 用量限制 (Enable Agent Limits)` 。
- 若是已存在应用，点击应用名称进入 **App Details** (详情页)，勾选该项目的选项并点击右上角 `Save Changes` 更新变更。

完成后请将其 `app_id`（如 `ai-english-tutor`）和 `secret_key` 提供给 SubApp 环境变量使用。

### 2) 分配并设置限流项
切换去往 **Permissions** 面板页面：
1. 找到对应的用户勾选（授权）该 App 的准入权。
2. 点击应用勾选框旁的蓝色 `Settings`（配置齿轮）图标，**按需填写该用户的用量限额**：
   - **RPM (Requests Per Minute)**: 每分钟并发 / 频次限制。
   - **RPD (Requests Per Day)**: 每日对话 / 请求数上限。
   - **Tokens Per Day**: （最关键）万级/千级 Token 总量。这里填写的是 k 计算，例如配置 `100` 即 100k (100,000) Tokens 每日。

## 3. 第二步：在代码中添加前置校验 (Pre-check)

在你的 SubApp 后端代码中，只要获取到正在操作对话的用户的 `uuid`，便能使用之前拿到的 `app_id` 与 `secret_key` 进行核验绑定：

```javascript
const AUTH_CENTER_URL = "https://accounts.aryuki.com"; // 你的AuthCenter域名

async function checkQuota(uuid) {
  // 通过 Query 拼接传递 uuid 和被代理的 app_id
  const url = `${AUTH_CENTER_URL}/api/quota/check?uuid=${uuid}&app_id=${env.YOUR_APP_ID}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      // 通过 Header Bearer 方式提供你的专属子应用 secret_key 校验权
      "Authorization": `Bearer ${env.YOUR_SECRET_KEY}`
    }
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("配额超限：请今日稍后再试，或联系管理员增加使用额度。");
    } else if (response.status === 403) {
      const respError = await response.json();
      throw new Error(respError.error || "当前账户似乎并未得到该服务应用的配额授权。");
    } else if (response.status === 401) {
      throw new Error("Secret_Key 应用密钥不匹配。");
    }
    throw new Error("权限校验失败：" + response.statusText);
  }
  
  // 校验通过，可以继续向后游请求大模型了
  // 这里也会返回该用户今天还剩余可用的一些剩余 Tokens，如果需要可以回传前端展示
  const data = await response.json();
  return data; // { valid: true, quota, remaining_tokens: 84000 }
}
```

## 4. 第三步：异步后置消费结算 (Post-deduction)

在后端代码接收完 LLM 响应后，应尽力寻找结果体或最后一个 Chunk 的 `usage` 属性里的整体消耗，传回进行报表入账。

考虑到大模型文本生成速度较慢，**建议你使用如 Cloudflare Workers 中的 `ctx.waitUntil(...)` 或是以不阻塞主线程的方法进行此步 API 操作，以免客户端产生响应滞后体验感！**

```javascript
async function consumeQuota(uuid, totalTokens) {
  const url = `${AUTH_CENTER_URL}/api/quota/consume`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.YOUR_SECRET_KEY}`
    },
    body: JSON.stringify({
      uuid: uuid,
      app_id: env.YOUR_APP_ID,
      tokens: totalTokens // 取自 LLM 结果的 total_tokens
    })
  });

  if (!response.ok) {
    console.error("Auth Center 上报消耗记录入账失败：", await response.text());
  }
}
```

---

## 5. 各大平台 Token 精准获取（参考附录）

不同厂商、流式与非流式环境统计真正 Token 消耗的手法有差异，此作为通用参考附录供前端/后端数据处理。

### A. OpenAI / 兼容接口（非流式）
响应包结构 `usage` 存在于主级：
```javascript
const totalTokens = data.usage.total_tokens; // 一般提取总和指标
```

### B. OpenAI 风格流式输出（SSE，例如 Deepseek 等同样适用）
流式请求下**必须给请求载体添加** `stream_options`，才能拿到结尾数据：
```javascript
// POST 请求 body 参数设定
{
  model: 'gpt-4o',
  messages: [...],
  stream: true,
  stream_options: { include_usage: true }  // ← 这项必带
}

// ... 处理解码流
while (true) {
  // ...
  const chunk = JSON.parse(jsonLine);
  if (chunk.usage) {
    // 最后发出的一个包往往没有任何 delta 返回文本，仅为纯粹带有 usage 统计。
    totalTokens = chunk.usage.total_tokens;
  }
}
```

### C. Anthropic Claude
Anthropic (非流式):
```javascript
const totalTokens = data.usage.input_tokens + data.usage.output_tokens;
```

Anthropic (流式):  
你需要捕获并累计两个特定 Event (不是在最后阶段抛出)，在 `message_start` 事件里抓取 `input_tokens`，再在 `message_delta` 里累积 `output_tokens` 得到最终和。

### D. Google Gemini
```javascript
// 非流式或最后流片段取得
const totalTokens = data.usageMetadata.totalTokenCount;
```
