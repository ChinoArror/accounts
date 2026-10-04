# Auth Center

> 更新时间：2026-09-30。新子应用请以[统一登录与静默续期接入指南](Subapp-Docs子应用配置文档/统一登录与静默续期-2026-09-30.md)为准；目录内旧示例正在逐步更新，冲突时以有日期的新指南为准。

Auth Center 是一个基于 Cloudflare Workers 的统一身份中心，用于 SSO、账号管理、子应用权限、额度管理、Passkey、GitHub 登录、邮箱认证和访问统计。

设计原则是：子应用只接收并校验 JWT。邮箱、密码、验证码、注册、Passkey、GitHub 绑定、会话管理和权限管理都由 Auth Center 统一处理。

## 当前功能

- 根路径 `/` 为落地页
- 合并登录页 `/login`
- 邮箱或用户名 + 密码登录
- 邮箱验证码登录
- 已绑定用户可使用 GitHub、Google 登录；未绑定者可走 OAuth 外部注册
- 已绑定用户可使用 Passkey 登录
- 邮箱注册页 `/register`
- 注册时可选 register code，用于应用对应配置
- Cloudflare Turnstile 用于注册和高风险操作
- 邮箱验证、重置密码、修改邮箱确认、安全提醒邮件
- 用户中心 `/user/:uuid`
- 管理员后台 `/dash`
- 管理员用户、应用、注册码、权限、额度、Test Access 和统计管理
- 测试身份登录，用于 agent、CLI、浏览器自动化临时进入已发布子应用
- D1 登录设备记录与设备撤销
- Analytics Engine 访问统计
- JWT 包含 `role`、`email`、`email_verified`、`auth_provider`

## 认证规则

- 新接入的子应用必须使用 `jwt.role` 判断 `admin` 和 `user`。
- 旧的 `username === "admin"` 兼容规则可以保留给历史子应用，但新子应用不应依赖它。
- 公开注册时，`username` 和 `fullname` 不允许包含 `admin`。
- 子应用不能直接处理邮箱、密码、验证码或注册码注册逻辑。
- 测试身份与普通 `users` 表隔离，没有普通密码，也不会出现在普通登录页。

## 主要路由

- `/`：落地页。已登录时，管理员跳到 `/dash`，普通用户跳到 `/user/:uuid`。
- `/login`：密码、验证码、Passkey、GitHub、Google 的合并登录页。
- `/register`：邮箱注册页，可选注册码。
- `/welcomenewuser`：OAuth 注册/绑定与邮箱注册的 Turnstile 验证步骤。
- `/verify-email`：邮箱验证提示和重发页面。
- `/forgot-password`：发送重置密码邮件。
- `/reset-password`：设置新密码。
- `/user/:uuid`：用户中心，包含资料、邮箱、密码、注册码更新和登录设备。登录设备会显示发起登录的 `app_id`，直接在 Auth Center 中发起的登录记为 `auth-center`。
- `/user/docs`：面向普通用户的独立教程，说明登录、注册、资料、账号安全及登录设备；用户中心有入口。
- `/dash`：管理员后台。
- `/dev/docs`：完整的子应用接入文档库，包含统一登录、OAuth、测试身份、用量限制和排错；可切换和搜索各文件，文档间链接可直接跳转。
- `/dev/@name`：测试身份详情页，供 admin 查看活动和日志。
- `/preview`：仅供测试身份使用的浏览器 Preview 门户，不提供普通登录入口。

## 管理员后台

后台 tab：

- Users
- Applications
- Permissions
- Register
- Test Access
- Statistics

### 子应用权限与额度

Permissions 页使用真实 D1 数据，来源包括 `users`、`apps`、`user_apps` 和 `auth_audit_logs`。

Register 页可设置同一 IP 每小时 OAuth 未绑定注册尝试次数，超过阈值才要求 GitHub/Google 新用户通过 Turnstile，默认阈值为 3。Statistics 页以 D1 实际建号事件展示邮箱、GitHub、Google 的总量与按日/月趋势；访问统计仍独立展示。

## OAuth 与外部注册

- GitHub 沿用 `/api/github/login` 与 `/api/github/callback`，OAuth App 申请 `read:user user:email`。已绑定的旧 GitHub ID 即使未提供已验证邮箱仍可登录；新建账号必须取得已验证的主邮箱。
- 在 Google Cloud 创建 **Web application** 类型的 OAuth 客户端，Authorized redirect URI 精确填写 `https://accounts.aryuki.com/api/google/callback`，末尾不加 `/`。如需 JavaScript origin，填 `https://accounts.aryuki.com`。基础 scope 为 `openid email profile`。
- 推荐只设置一个 Worker secret：`npx wrangler secret put GOOGLE_OAUTH_CREDENTIALS`，内容为 `{"client_id":"...","client_secret":"..."}`。也可分别在 vars 设置真实 `GOOGLE_CLIENT_ID`，并通过 Wrangler secret 设置 `GOOGLE_CLIENT_SECRET`。Google、GitHub 按钮始终显示；凭据不完整时登录会报错。不能把凭据写入 Git、URL 或前端。
- 生日为可选信息：启用 People API、申请 `user.birthday.read` 权限，完成同意屏幕及可能的应用验证后，才把 `GOOGLE_BIRTHDAY_SCOPE_ENABLED` 设为 `true`。GitHub 常规资料没有生日；未授权或缺失时保持空值。
- 已绑定的 provider subject 直接登录；未绑定身份进入 `/welcomenewuser`。仅凭邮箱相同绝不接管旧账号，必须先登录旧账号再确认绑定。已登录但尚无邮箱的账号，可直接绑定 provider 返回的已验证邮箱，无需二次邮件验证码。待验证或停用账号不会被自动激活。
- 邮箱、GitHub、Google 公开建号均遵守 Register 的 External registration 开关、开放时间和邮箱域规则。新 OAuth 用户只在建号时应用一次默认应用权限与 cookie 天数；修改默认配置不会覆盖已创建用户。关闭外部注册不影响已绑定用户登录和已证明身份的旧账号绑定。
- 邮箱注册每次都在 `/welcomenewuser` 完成 Turnstile。GitHub/Google 新建超过同 IP 每小时阈值时才出现验证；全站/单 IP 硬性注册限额依旧有效。OAuth state 与待完成票据 10 分钟失效，由定时任务清理。
- 注册统计按 UUID 仅计一次成功建号；待验证的邮箱账号会计入并单独显示数量。旧记录只回填可由安全日志证明的部分，图表标明可追溯起点，以 Asia/Taipei 时区按日/月统计。
- OAuth-only 用户可在 `/account/security` 设置密码。用户详情和管理后台用户详情统一使用 **Bind other account** 弹窗选择 GitHub/Google；旧绑定链接已废弃。已绑定渠道显示其账号资料，不再显示重复绑定按钮；解绑需二次确认，只删除渠道关联，不删除 Auth Center 账号邮箱。管理员还可查看渠道唯一 ID 与绑定时间。历史绑定若缺少渠道资料，下次 OAuth 登录后自动补齐；若显示账号邮箱作为候补，会明确标注为账号邮箱。JWT 继续包含 `sub`/`uuid`、`role`、`email`、`avatar_url`，子应用回调 token 格式不变；`auth_provider` 表示本次登录方式。
- `/login`（含子应用跳转登录）先显示邮箱/用户名，输入后展开密码操作；Google/GitHub 按钮立即可用，邮箱验证码与 Passkey 的后端流程不变。页脚随亮/暗主题融入页面，Dashboard 加载时页脚固定在页面底部。
- 2026-09-30 已清除现存 GitHub/Google 绑定及旧 `github_id` 对应值；受影响用户需重新绑定，原 UUID、权限和资产不变。清理后禁止重跑含旧 GitHub 回填语句的 OAuth migration。

## 长期会话与静默续登（2026-09-30）

邮箱、验证码、用户名、Passkey、GitHub、Google 与管理员新登录统一签发短期 access JWT，并在 D1 建立可撤销的长期会话；refresh token 只存 hash，Cookie 为 HttpOnly/Secure。有效期取账号 `cookie_expiry_days` 与全局 refresh 上限较短者，管理员使用 `ADMIN_COOKIE_EXPIRY_DAYS`，续签不会延长原绝对到期时间。`/api/verify` 会核对新会话撤销状态和最新应用权限。

原子应用回调的 `?token=...`、JWT UUID/role 和验证接口形状不变。按旧文档在 JWT 到期后跳回 `/login?app_id=...&redirect=...` 的子应用无需改登录代码，Auth Center Cookie 有效时会无提示续登并返回新 JWT。若子应用只显示错误、不跳回，或自设更短的本地 Cookie，则必须在该应用补回跳；身份中心不能跨站修改它的 Cookie。设备列表会保留每个会话访问过的 app ID。`/api/auth/session/continue` 只供身份中心同域页面调用。

## 测试身份登录

管理员可在 `/dash` → `Test Access` 创建测试身份。测试身份用于 agent、CLI、浏览器自动化或人工 QA 临时进入已发布的 subapp 检查可用性。

- 测试身份使用独立 D1 表，不进入普通 `users` 表。
- 测试身份没有普通密码，不能通过 `/login` 登录。
- secret 可在创建、轮换和详情页复制；数据库保存 hash、prefix 和加密密文，禁止提交到代码、日志或公开聊天。
- 终端命令使用 `name + secret + target_subapp` 调用 `/api/test-auth/exchange`。
- exchange 返回一次性 `login_url`，默认 60 秒内必须打开，且只能消费一次。
- 60 秒只限制登录链接消费时间，不限制测试时长。
- 登录后的测试 session 默认 30 分钟，可按测试身份配置。
- Preview 默认关闭。管理员开启后，创建、轮换 secret 和详情页面会展示同一个测试身份 secret 对应的 Preview 链接。
- Preview 链接格式为 `https://accounts.aryuki.com/preview#name=...&secret=...`。secret 位于 fragment，不使用 query/path；页面会在交换 session 前立即从地址栏清除 fragment。
- Preview 使用独立的 `test_preview_session` Cookie，属性为 HttpOnly、Secure、SameSite=Strict、Path=/preview，不会覆盖普通用户或管理员的 `sso_session`。
- 人工 QA 可直接使用 Preview，不必运行 CLI；agent、CI 和脚本自动化仍建议继续使用 CLI 或 `/api/test-auth/exchange`。
- Preview 只显示该测试身份真实允许且 active 的 D1 应用；点击后会在新标签页打开对应 subapp，并签发与原 one-time login 兼容的 app 专用测试 JWT/session。原页面的应用卡片会保留 2 秒启动反馈，之后自动恢复可点击状态。
- 关闭 Preview 会立刻撤销 Preview session；轮换 secret 会使旧 Preview 链接失效，但已建立 session 保持至过期或管理员手动撤销。
- JWT 包含 `identity_type=test`、`test_session=true`、`allowed_subapps`、`data_scope`、`data_scope_permissions` 和 `session_id`。
- 旧 subapp 保持兼容，完成 JWT 校验后可能默认全可见。
- 新 subapp 应读取 `identity_type`、`data_scope` 和 `data_scope_permissions`，主动限制 public/private scope。公共权限默认包含同级私有权限，例如 `public_read` 包含 `private_read`，但不包含 `private_write`。
- `private_write`、`admin`、全部应用、长 session 等高风险配置会触发红色确认弹窗。

子应用适配请阅读：[测试身份适配指南](Subapp-Docs子应用配置文档/测试身份适配指南.md)。

### Dashboard 弹窗

- `/dash` → `Register` 中点击 register code 行会打开真实详情弹窗，展示 D1 中的状态、cookie 有效期、使用人和应用权限。
- Register code、Test Access、删除确认、敏感确认弹窗都会浮在 dashboard 顶栏之上。
- 过长弹窗会锁定底层页面滚动，关闭按钮固定在右上角；手机端也只滚动弹窗内容。

桌面端：

- 用户和应用搜索
- role、plan、status、app group 筛选
- 用户数、应用数、已开通、接近额度、超额汇总
- 用户列 sticky
- 应用表头 sticky
- 横向矩阵滚动
- 单元格状态：`ON`、`ON*`、`OFF`、接近额度百分比、超额、禁用
- 点击单元格打开右侧详情抽屉
- 批量开启、批量关闭、批量套用额度
- 当前筛选结果 CSV 导出

手机端：

- 不显示完整宽矩阵
- 显示统计首页
- 支持按用户管理
- 支持按应用管理
- 支持异常额度列表
- 支持最近 permission 操作
- 编辑时使用全屏详情页，关闭按钮固定在顶部可见

Permission API：

- `GET /api/admin/permissions/matrix`
- `GET /api/admin/permissions/detail?user_id=...&app_id=...`
- `POST /api/admin/permissions/update`
- `POST /api/admin/permissions/bulk-update`
- `POST /api/admin/permissions/reset-quota`
- `GET /api/admin/permissions/anomalies`
- `GET /api/admin/permissions/audit-logs`
- `GET /api/admin/permissions/export`

所有 permission 管理 API 都需要管理员鉴权；JWT 管理员判断使用 `role = admin`。

## 数据结构

主要 D1 表：

- `users`：用户账号、资料、role、状态、邮箱验证状态、认证来源、密码 hash 字段和会话配置
- `user_credentials`：邮箱认证用户的密码凭据元数据
- `auth_tokens`：邮箱验证、密码重置、邮箱修改、登录验证码 token
- `auth_sessions`：邮箱认证相关的 refresh/session 记录
- `user_sessions`：展示给用户的登录设备，包含发起登录的 `app_id`
- `apps`：子应用配置
- `user_apps`：用户与应用的访问权限、应用内角色、额度、用量和启停状态
- `register_codes`：管理员创建的注册码和配置
- `register_code_uses`：注册码使用记录
- `auth_audit_logs`：安全日志和管理员操作日志
- `email_jobs`：邮件任务队列
- `registration_counters`：注册和邮件发送限流计数
- `passkeys`：WebAuthn 凭据

## Cloudflare 绑定

需要配置：

- D1 数据库：`DB`
- Worker 静态资源：`ASSETS`
- Analytics Engine：`ANALYTICS`
- R2 头像桶：`AVATAR_BUCKET`
- Workers Email / Cloudflare Email Service：`EMAIL`

## 环境变量

示例：

```toml
ADMIN_USERNAME = "admin"
ADMIN_EMAIL = "admin@example.com"
APP_NAME = "Auth Center"
PUBLIC_BASE_URL = "https://accounts.example.com"
JWT_ISSUER = "auth-center"
EMAIL_FROM = "noreply@accounts.example.com"
TURNSTILE_SITE_KEY = "0x..."
# GOOGLE_OAUTH_CREDENTIALS Worker secret 的可选替代项：
# GOOGLE_CLIENT_ID = "..."
GOOGLE_BIRTHDAY_SCOPE_ENABLED = "false"
REGISTRATION_MODE = "open"
REGISTRATION_START_AT = ""
REGISTRATION_END_AT = ""
ALLOWED_EMAIL_DOMAINS = "gmail.com,outlook.com,qq.com,hotmail.com"
BLOCKED_EMAIL_DOMAINS = "tempmail.com,10minutemail.com"
MAX_GLOBAL_REGISTRATIONS_PER_DAY = "100"
MAX_REGISTRATIONS_PER_IP_PER_HOUR = "3"
MAX_REGISTRATIONS_PER_IP_PER_DAY = "5"
MAX_VERIFY_EMAILS_PER_EMAIL_PER_DAY = "3"
MAX_REGISTER_ATTEMPTS_PER_EMAIL_PER_HOUR = "5"
MAX_REGISTER_ATTEMPTS_PER_IP_PER_HOUR = "10"
ACCESS_TOKEN_TTL_SECONDS = "3600"
REFRESH_TOKEN_TTL_SECONDS = "2592000"
NEAR_LIMIT_THRESHOLD = "0.9"
```

Secrets：

```text
ADMIN_PASSWORD
JWT_SECRET
TURNSTILE_SECRET_KEY
PASSWORD_PEPPER
GITHUB_CLIENT_SECRET
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_CREDENTIALS（推荐，包含 ID 与 Secret 的单个 JSON secret，替代上面的分开配置）
CF_API_TOKEN
```

## 数据库初始化和迁移

新环境：

```bash
npx wrangler d1 execute auth-center-db --remote --file=./schema.sql
```

已有环境按需执行近期迁移：

```bash
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-email-auth-2026-05-30.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-auth-settings-2026-05-30.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-user-sessions.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-register-codes.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-user-avatar-r2.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-permission-matrix-2026-05-31.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-avatar-editor-2026-06-20.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-test-identity-preview-2026-09-19.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-oauth-external-registration-2026-09-29.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-session-and-oauth-cleanup-2026-09-30.sql
npx wrangler d1 execute auth-center-db --remote --file=./test/migration/migrate-oauth-binding-details-2026-09-30.sql
```

`schema.sql` 含有 `DROP TABLE`，只可用于全新可丢弃数据库。已有生产 D1 每个迁移只执行一次。清理旧绑定后不得重跑 2026-09-29 OAuth migration，否则旧 GitHub 对应关系会被重新写回。

## 头像编辑

用户可在 `/user/:uuid` 的 Edit Info 悬浮窗口中修改头像。

- Upload 会打开头像调整窗口，预览框与账号页头像框保持同等比例的方形圆角效果。
- 可调整大小、横向位置和纵向位置，编辑器会限制移动范围，预览中不会露出图片外的空白边界。
- 在调整窗口点击 Save 会立即写入 R2，保存两份图片：原图保存到 `Avatar/<uuid>/original/`，裁切后的显示图保存到 `Avatar/<uuid>/cropped/`。
- JWT 和 API 返回的 `avatar_url` 始终指向裁切后的显示图，并带有基于对象 key 的版本参数，头像更新后浏览器会刷新缓存。
- 下次修改头像时优先基于原图重新调整，包括之后重新进入页面的情况；旧头像没有原图时，会按已裁切头像处理。
- Delete 后再 Save，会恢复为根据 name 生成的默认头像。
- 删除后，在同一个已打开的账号界面内 30 分钟内可 Restore；超过 30 分钟后，Worker cron 会自动清理 R2 中等待删除的图片。

## 邮件配置

1. 在 Cloudflare 添加并验证发件域名。
2. 配置 Cloudflare Email Service / Workers Email 要求的 DNS 记录。
3. 在 Worker 中添加 `send_email` binding，名称为 `EMAIL`。
4. 设置 `EMAIL_FROM` 为已验证的发件地址。
5. 部署后测试邮箱验证、重发验证、重置密码、验证码登录和修改邮箱。

邮件任务写入 `email_jobs`，并提供 HTML 模板和纯文本 fallback。

## Turnstile 配置

1. 创建 Cloudflare Turnstile widget。
2. 设置 `TURNSTILE_SITE_KEY`。
3. 设置 secret：`TURNSTILE_SECRET_KEY`。
4. 确认注册、重发验证、发送验证码、忘记密码和修改邮箱都进行服务端校验。

如果表单提交失败，前端会重置 Turnstile 状态，便于下一次重新验证。

## 构建和部署

```bash
npm install
npm run build
npx wrangler deploy
```

### 在线文档同步

`/dev/docs` 在 Vite 构建时自动收录 `Subapp-Docs子应用配置文档/` 目录下的**全部 Markdown 文件**；`/user/docs` 直接读取 `docs/user-guide.md`。仓库文件是唯一内容来源，新增、删除或修改文档后，**下一次构建并部署**即可同步网页，无需再手工维护一份页面内容。页面展示以台北时区计算的构建日期；每份文档另显示自身的“更新时间”，修订文档时也应更新该日期。仅修改本地文件不会自动改变线上 Worker。旧指南继续可查阅，但新子应用请优先使用注明日期的统一登录指南。

`.github/workflows/publish-docs.yml` 会在文档或隐私政策源码推送到 `master` 时构建并部署；也可在 **Actions > Publish online documentation > Run workflow** 手动运行。先在 **GitHub 仓库 > Settings > Secrets and variables > Actions > New repository secret** 新建两个仓库级 Actions 密钥：

1. `CLOUDFLARE_API_TOKEN`：在 Cloudflare 创建账号 API Token，选 **Edit Cloudflare Workers**，或给现有 Auth Center Worker 授予 Workers Editor，并将资源限定到正确账号。如果部署会修改路由或自定义域，还需对应 Zone 的 **Workers Routes > Write**。不要把 Token 提交到仓库。
2. `CLOUDFLARE_ACCOUNT_ID`：此 Worker 所在的 Cloudflare **账号 ID**，不是 Zone ID。

保存两项后重新运行 Action；缺失时会在 Wrangler 前给出明确错误。此 Action 会部署**整个 Worker 与前端构建产物**，不只是文档或隐私页，因此触发前需检查 `master` 上的其他改动。其他分支或尚未推送的本地改动不会自动上线。Worker 运行时的 JWT、OAuth、Turnstile 等密钥与 GitHub Actions 密钥是两套配置。

安全前置：不要把 `JWT_SECRET`、`GITHUB_CLIENT_SECRET`、`CF_API_TOKEN` 等凭据放在受 Git 跟踪的 `wrangler.toml` 的 `[vars]` 中。应通过 `npx wrangler secret put <NAME>` 或 Worker 控制台的 Variables and Secrets 保存运行时密钥，并轮换曾提交到 Git 的值。GitHub Actions 部署 Token 与 Worker 运行时使用的 `CF_API_TOKEN` 不是同一个配置。

注册和修改密码显示低、中、高三档强度与三段进度条，至少需字母、数字且达到中等强度；邮箱注册在进入 Turnstile 页面前预检邮箱、名称、密码和选填注册码，并在最终提交时复核。GitHub/Google 新账号可能将提供商头像复制到 R2；已有账号头像不变，用户可更换或恢复默认。额度单位统一为 RPM（每分钟请求）、RPD（每日请求）、每日原始 token 数；留空表示无限，`0` 表示额度为零。

## 常用验证

Permission matrix：

```bash
curl -H "Authorization: Basic <base64-admin-credentials>" \
  https://accounts.example.com/api/admin/permissions/matrix
```

退出登录应清理会话 cookie：

```bash
curl -i -X POST https://accounts.example.com/api/logout
```

邮箱或用户名登录：

```bash
curl -X POST https://accounts.example.com/api/auth/login/email \
  -H "Content-Type: application/json" \
  -d '{"identifier":"username-or-email","password":"password"}'
```

## 子应用 JWT 字段

JWT 示例：

```json
{
  "sub": "user_uuid",
  "uuid": "user_uuid",
  "username": "example",
  "name": "Example User",
  "email": "user@example.com",
  "email_verified": true,
  "role": "user",
  "avatar_url": "https://accounts.aryuki.com/api/avatar/user_uuid?v=Avatar%2Fuser_uuid%2Fcropped%2Favatar-cropped-...",
  "auth_provider": "email",
  "session_id": "session_uuid"
}
```

子应用应使用 `role` 做权限判断，使用 `sub` 或 `uuid` 作为稳定用户标识。所有属于用户的资产、业务数据、额度记录、审计日志和统计记录，都必须使用 Auth Center 的 `uuid` 关联。`name`、`username`、`fullname`、`email` 等字段只用于页面展示和用户识别，不得作为数据归属键，避免删除账号后，新出现的同名账号错误对应原有记录。

当用户设置了头像时，`avatar_url` 会以带缓存版本的完整 URL 下发给子应用，子应用可以直接渲染；但头像展示旁边的名称仍只是显示信息，数据归属继续以 `uuid` 为准。
