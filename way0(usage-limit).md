为系统加入**大模型 API 用量控制（Quota & Rate Limiting）**是非常有远见的一步。因为 LLM 的 Token 就是真金白银，一旦没有限制，恶意的并发请求或失控的脚本会迅速消耗掉你的 API 余额。
在 Cloudflare Workers 生态下，将 Auth-Center 升级为兼具**鉴权与用量网关（API Gateway）**的角色是最佳实践。
以下是为你梳理的架构思路和精准统计的工程实现方案：
一、 架构思路：Auth-Center 与 SubApp 的分工
核心原则是：规则由 Auth-Center 制定并存储，SubApp 负责执行和上报，实际用量由 Auth-Center 扣除。
1. D1 数据库结构升级 (Auth-Center 侧)
在 Auth-Center 的 D1 中，扩展之前的 user_apps 表，或者新增一张 app_quotas 表，为每个 uuid + app_id 组合配置以下字段：
• rpm_limit (Requests Per Minute): 每分钟请求次数限制（防并发/防刷）。
• rpd_limit (Requests Per Day): 每天对话次数上限。
• daily_token_limit: 每天允许消耗的总 Token 数。
• used_tokens_today: 今天已使用的 Token 数（每天午夜重置，或按 24 小时滚动）。
• used_requests_today: 今天已使用的请求数。
2. 通信流程设计 (Pre-flight 与 Post-deduction)
由于 Token 数量通常要在请求完成后才能确切知道（特别是流式输出），我们需要采用**“先验权，后扣费”**的机制：
1. 先验权 (Pre-check)：SubApp 收到前端的对话请求时，解析 JWT 获取 uuid。SubApp 内部向 Auth-Center 发起请求 GET /api/quota/check?uuid=xxx&app_id=yyy。
• Auth-Center 检查 D1，如果 used_tokens_today >= daily_token_limit，直接返回 429 (Too Many Requests)。
• 如果余额充足，返回 200 放行。
2. 执行请求：SubApp 拿到放行许可，向 OpenAI/Anthropic 等发请求。
3. 后扣费 (Post-deduction)：LLM 响应结束，SubApp 计算出实际消耗的 Token（Prompt Token + Completion Token），然后异步向 Auth-Center 发送 POST /api/quota/consume。
• Auth-Center 在 D1 中执行原子更新：UPDATE app_quotas SET used_tokens_today = used_tokens_today + ? WHERE uuid = ?。
