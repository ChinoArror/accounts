# OAuth 接入与外部注册说明

> 更新时间：2026-09-30。旧文档正在逐步更新；新子应用优先阅读[统一登录与静默续期接入指南](统一登录与静默续期-2026-09-30.md)。

Auth Center 统一处理 GitHub、Google、邮箱与 Passkey；子应用不接触 OAuth code、provider token、邮箱密码或 Turnstile token。

## 子应用保持不变的部分

1. 子应用把用户送到 `https://accounts.aryuki.com/login?app_id=<app_id>&redirect=<callback_url>`，`callback_url` 必须与 Auth Center 中该应用配置的回调地址同源同路径。
2. Auth Center 完成登录后仍按原有 callback 方式附加 `token`；子应用验证 JWT 签名、有效期和应用权限后建立本地会话。
3. 用户资产、数据、记录一律以 JWT 的 `sub`/`uuid` 对应，不以邮箱、用户名、全名或 GitHub/Google ID 对应；这些展示字段会变化，也可能被删除后重新使用。
4. 新子应用使用 `jwt.role` 判断 `admin`/`user`，不要依赖 `username === "admin"`。JWT 仍提供 `email`、`email_verified`、`avatar_url`；`auth_provider` 表示本次登录方式，可能是 `email`、`github` 或 `google`。

## 登录与注册路径

- 已绑定 GitHub/Google 身份直接登录并回跳，不经过欢迎页。
- 未绑定身份进入 `/welcomenewuser`，由 Auth Center 检查邮箱、外部注册开关、默认权限和必要的 Turnstile；子应用不处理这些步骤。
- 如果 provider 的已验证邮箱已属于旧账号，用户必须先证明旧账号身份，再把 provider 绑定到原 UUID。邮箱相同不会自动合并账号。
- 新 OAuth 账号获得 Register 页面当时的默认应用权限。若目标 `app_id` 未获授权，Auth Center 拒绝向该子应用发放有效登录回跳。
- 管理员可在 Statistics 查看真实外部注册日/月趋势；它与访问事件统计不是同一指标。

## Google 配置

Google Web OAuth 客户端的 Authorized redirect URI：`https://accounts.aryuki.com/api/google/callback`。推荐通过单个 Worker secret `GOOGLE_OAUTH_CREDENTIALS` 配置 JSON：`{"client_id":"...","client_secret":"..."}`；也可分别设置 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET`。Google/GitHub 按钮始终显示，凭据未就绪时应修正服务端配置。生日需要额外的 People API 权限，未授权时为空。

2026-09-30 清理了历史 GitHub/Google 绑定，原账号须从用户详情的 **Bind other account** 弹窗重新绑定。旧 `/:uuid/ssoconnect`、`/sso-binding` 链接停用。子应用不需区分具体 OAuth 渠道；JWT 到期时仍按统一登录指南重定向至 Auth Center。
