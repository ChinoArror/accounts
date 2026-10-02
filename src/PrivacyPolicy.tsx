import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

const PRIVACY_CONTACT = 'yysy.rhy@gmail.com';

function PolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-slate-200 py-6 first:border-0 first:pt-0 last:pb-0">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700 sm:text-base">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Privacy Policy · 隐私权政策 | Aryuki Auth Center';
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <div data-theme="light" className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link to="/" className="flex items-center gap-3 text-slate-900 no-underline">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-600 text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Aryuki Auth Center</span>
              <span className="block text-xs text-slate-500">Privacy Policy · 隐私权政策</span>
            </span>
          </Link>
          <a href="#chinese" className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            中文
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 rounded-3xl bg-slate-950 px-6 py-8 text-white sm:px-9 sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Updated September 29, 2026</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
            This policy explains what Aryuki Auth Center collects, how it uses and shares that information, how long it is kept, and how you can make a privacy request. It covers the Auth Center website, account services, sign-in methods, and single sign-on connections.
          </p>
        </div>

        <article id="english" lang="en" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-9">
          <PolicySection title="1. Who operates Auth Center">
            <p>This is the privacy policy for Aryuki Auth Center, the account and single sign-on service at accounts.aryuki.com. The service administrator operates it. For privacy questions or requests, contact <a className="font-medium text-blue-700 underline underline-offset-2" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>. This address is also the contact for requests to access, correct, export, unlink, or delete account information.</p>
          </PolicySection>

          <PolicySection title="2. Information we collect">
            <p><strong>Account and profile information.</strong> Depending on how you register or sign in, we process a username, display name, email address and its verification status, account identifier, optional birthday, profile image you upload, account status, and the identity provider you use. We also process password and password-verification information when password sign-in is used. Authorized administrators can reset passwords and may access password records for some legacy or manually managed accounts; do not reuse a password from another service.</p>
            <p><strong>Google sign-in information.</strong> When you choose Google sign-in and grant consent, Auth Center receives your Google account identifier, verified email address, and basic profile information such as your name. A profile-photo URL may be held briefly during account creation to show the sign-in profile; Auth Center does not save that Google photo URL to your account. If the optional birthday permission is enabled for the service and you grant it, Auth Center may also request your complete date of birth from Google People API and save it in your account profile. Auth Center does not request Gmail, Drive, Calendar, or other Google content.</p>
            <p><strong>Other sign-in providers.</strong> If you choose GitHub sign-in, we receive the GitHub account identifier, verified primary email, username, name, and profile-photo URL needed to authenticate or link your account. Provider access tokens are used to complete sign-in and are not retained for ongoing access.</p>
            <p><strong>Authentication and security information.</strong> We process passkey credential identifiers and public keys, authentication counters, session and refresh-token records, sign-in timestamps, the app you signed in to, and security or verification events. We do not receive your passkey's private key or biometric data; those remain with your device or authenticator.</p>
            <p><strong>Device and request information.</strong> Requests may include an IP address, browser or device user-agent, approximate country or region, and request time. Session records may store an IP address and browser/device details. Security and registration controls may instead store a keyed hash of an IP address. We use this information for session management, abuse prevention, troubleshooting, and security auditing.</p>
            <p><strong>Usage, permissions, and test-access information.</strong> We record the app identifier, account identifier, event type (for example, sign-in or page access), country, browser/device category, duration, and quota usage. Administrators may configure app permissions and limits. If an administrator creates a temporary test identity, we process its label, permitted apps, expiry, session activity, API path and method, response status, and usage records.</p>
            <p><strong>Support and email information.</strong> We process the email address and the content needed to deliver account verification, sign-in codes, password resets, email-change confirmations, and security notices. We also process your privacy or support request and the information you choose to include.</p>
          </PolicySection>

          <PolicySection title="3. How Google user data is used">
            <p>Google sign-in requests the <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em]">openid</code>, <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em]">email</code>, and <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em]">profile</code> scopes. The optional birthday scope is requested only when enabled by the service and shown in Google's consent flow. We use the resulting account identifier and verified email to authenticate you, create or link your Auth Center account, and prevent duplicate or unauthorized account access. Name and profile information are used to identify and populate your Auth Center account. A birthday, if requested and returned, is saved as profile information.</p>
            <p>We store the Google account identifier, verified email, name, and optional birthday in the Auth Center account database for account operation. A Google profile-photo URL is used only during account creation and is not kept in the account profile. The authorization code and Google access token are used by the server only to complete sign-in and, when enabled, retrieve a birthday; we do not retain Google access or refresh tokens for ongoing access.</p>
            <p>Google user data is used only to provide or maintain the user-facing account, authentication, account-linking, and single sign-on features you request. If you choose to sign in to a connected application, the relevant identity claims described below may be sent to that application's approved callback. Otherwise, Google profile data is not disclosed to other recipients except Cloudflare as our hosting and database infrastructure provider. We do not sell Google user data, use it for advertising, credit decisions, or train generalized AI or machine-learning models.</p>
            <p>For more details about Google's handling of your Google Account information, read the <a className="font-medium text-blue-700 underline underline-offset-2" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a> and the <a className="font-medium text-blue-700 underline underline-offset-2" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>.</p>
          </PolicySection>

          <PolicySection title="4. Why we use information">
            <ul className="list-disc space-y-2 pl-5">
              <li>Create and maintain accounts; verify email; authenticate password, Google, GitHub, and passkey sign-ins; and provide account recovery.</li>
              <li>Provide single sign-on to the application you choose, enforce its access permissions, and return the identity claims needed for that sign-in.</li>
              <li>Show and manage profile information, sessions, passkeys, app access, security settings, and quotas.</li>
              <li>Send transactional account and security messages, respond to support and privacy requests, and operate the service.</li>
              <li>Protect accounts and applications, detect abuse, enforce rate limits, troubleshoot errors, and maintain audit and usage statistics.</li>
              <li>Meet legal obligations and establish, exercise, or defend legal claims where necessary.</li>
            </ul>
            <p>Where applicable law requires a legal basis, processing is based on providing the service you request, our legitimate interests in operating and securing Auth Center, your consent for optional provider permissions, or compliance with a legal obligation.</p>
          </PolicySection>

          <PolicySection title="5. When information is shared">
            <p><strong>Cloudflare.</strong> Auth Center uses Cloudflare Workers and related infrastructure for hosting, database and image storage, request security, Turnstile abuse prevention, service analytics, and transactional email. Cloudflare may process request, account, and Google-derived profile data as needed to host and operate the service. See <a className="font-medium text-blue-700 underline underline-offset-2" href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare's Privacy Policy</a>.</p>
            <p><strong>Applications you choose to access.</strong> Only when you continue from Auth Center to a registered application, we send a signed, time-limited authentication token to that application's approved callback. Depending on the account and sign-in flow, it can contain your Auth Center account identifier, username, name, email and verification status, role, authentication provider, avatar URL, and session identifier, including Google-derived name or email used to identify you. The receiving application then handles that information under its own privacy policy.</p>
            <p><strong>Identity providers.</strong> Google or GitHub processes your sign-in request under its own terms and privacy notice. Auth Center sends the provider the information required to complete the authorization request and receives only the profile data described above.</p>
            <p><strong>Legal and safety reasons.</strong> We may disclose information when required by law or valid legal process, or when reasonably necessary to protect users, the service, or another person's rights and safety.</p>
            <p>These service providers and the application you explicitly choose are the only routine recipients of the information described above. We do not sell or rent personal information, disclose Google user data to data brokers or advertisers, or use it for targeted, personalized, or interest-based advertising. We may also disclose information for the legal and safety reasons described above.</p>
          </PolicySection>

          <PolicySection title="6. Cookies and browser storage">
            <p>Auth Center uses essential, first-party storage to keep you signed in and complete secure sign-in flows. This includes HTTP-only session and refresh cookies, short-lived OAuth state cookies, and temporary browser storage used by administrator authentication, passkey setup, and your theme preference. Clearing browser storage may sign you out or make account features unavailable.</p>
            <p><strong>Google Analytics 4.</strong> The Google tag with measurement ID <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em]">G-9NV66HSM65</code> loads whenever this website is opened and records page-view analytics. This website does not show an in-product analytics consent or choice prompt. You can block analytics through browser settings or Google's <a className="font-medium text-blue-700 underline underline-offset-2" href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer">Google Analytics opt-out browser add-on</a>.</p>
            <p>For navigation within this single-page app, we send page-view events containing a generalized route, generic page label, and a sanitized referrer. Query strings, URL fragments, account identifiers in dynamic routes, account profile data, sign-in tokens, passwords, and form contents are not included in these manually sent page-view events. We do not set an Analytics user ID. Google Signals and advertising personalization signals are disabled in the tag configuration. Other automatic interaction events may depend on the measurement settings in the Google Analytics property.</p>
            <p>Google Analytics may process event timestamps, session statistics, browser and device information, and approximate location. It may use first-party <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em]">_ga</code> cookies or related identifiers to distinguish pseudonymous browsers and sessions. For GA4, Google says it uses an IP address at collection to derive approximate location and discards the IP address before logging the data. Google processes analytics data under its own terms and privacy information; see <a className="font-medium text-blue-700 underline underline-offset-2" href="https://support.google.com/analytics/answer/11593727" target="_blank" rel="noreferrer">what Google Analytics collects</a> and <a className="font-medium text-blue-700 underline underline-offset-2" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google's Privacy Policy</a>. We do not use advertising cookies or cross-site ad tracking.</p>
          </PolicySection>

          <PolicySection title="7. Retention">
            <p>We keep account and profile information while the account remains active and for as long as needed to provide the service, resolve disputes, meet legal duties, and protect account security. If you request account deletion, we delete or de-identify account information that no longer needs to be kept, subject to legal, security, and operational records that must be retained.</p>
            <p>Session access expires according to the account's configured lifetime and can be revoked earlier. Unverified pending registrations are automatically removed after 24 hours. Email verification links expire after 24 hours, password-reset links after 30 minutes, one-time login codes after 10 minutes, and OAuth sign-in transactions after 10 minutes. Temporary test identities and sessions end at their configured expiry; related audit or usage records may be retained for security and service reporting.</p>
            <p>We retain analytics and security records only as needed for service operation, fraud prevention, and reporting. Google Analytics event retention follows the retention period configured for the Analytics property; the service administrator can adjust that setting. Google Analytics events are not joined to your Auth Center account by email or a user ID. Backups and provider-held copies may take additional time to expire. You can request access to or deletion of information by contacting us as described above.</p>
          </PolicySection>

          <PolicySection title="8. Your choices and privacy rights">
            <p>You can update supported profile details, manage passkeys, sign out, and review or revoke active sessions through Auth Center account settings. You can also ask us to provide a copy of your data, correct it, delete your account, restrict or object to processing, or unlink a sign-in provider, subject to applicable law and verification of your request.</p>
            <p>To delete Google-derived information or unlink Google sign-in, revoke Auth Center's access in your Google Account settings and email us at <a className="font-medium text-blue-700 underline underline-offset-2" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>. Revoking provider access prevents future authorization but does not by itself delete information already stored in your Auth Center account. Account deletion requests are handled by the service administrator; include the account email or username, and do not send your password or a sign-in code.</p>
            <p>Your rights depend on where you live. Where available, you may also complain to your local data-protection authority. We may ask for information needed to verify your identity before acting on a request.</p>
          </PolicySection>

          <PolicySection title="9. Security and international processing">
            <p>Connections to the website and its services use HTTPS/TLS to protect information in transit. We apply access controls and the security features available in our hosting and identity infrastructure; Google authorization codes and access tokens are used only for the short-lived sign-in flow. Some legacy or manually managed accounts may have password records accessible to an authorized administrator, as disclosed above, so use a unique password. No online service can guarantee absolute security. Cloudflare and identity providers may process information in locations outside your country; where required, appropriate safeguards apply to international transfers.</p>
          </PolicySection>

          <PolicySection title="10. Changes to this policy">
            <p>We may update this policy when the service or its data practices change. We will update the date at the top of this page. If a change materially affects how we use Google user data or other sensitive account information, we will provide notice through the service or an account communication where required.</p>
          </PolicySection>
        </article>

        <article id="chinese" lang="zh-Hans" className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-9">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">更新日期：2026 年 9 月 29 日</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">隐私权政策</h2>
            <p className="mt-3 text-sm leading-7 text-slate-700 sm:text-base">本政策说明 Aryuki Auth Center 收集哪些信息、如何使用和共享信息、保留多久，以及如何提出隐私请求。本政策适用于 Auth Center 网站、账号服务、登录方式及单点登录连接。</p>
          </div>

          <PolicySection title="1. 服务运营方">
            <p>本政策适用于位于 accounts.aryuki.com 的 Aryuki Auth Center 账号与单点登录服务，由服务管理员运营。有关隐私的问题或请求，可联系 <a className="font-medium text-blue-700 underline underline-offset-2" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>。你也可以通过此地址请求查阅、更正、导出、解绑或删除账号信息。</p>
          </PolicySection>

          <PolicySection title="2. 我们收集的信息">
            <p><strong>账号与资料。</strong>根据注册和登录方式，我们会处理用户名、显示名称、邮箱及验证状态、账号标识、可选生日、你上传的头像、账号状态和所用身份提供商。使用密码登录时，我们也会处理密码及密码验证信息。授权管理员可以重置密码，并可能为部分旧版或手动管理的账号查看密码记录；请勿重复使用其他服务的密码。</p>
            <p><strong>Google 登录信息。</strong>你选择 Google 登录并授权后，Auth Center 会收到 Google 账号标识、已验证邮箱及姓名等基本资料。创建账号时，头像图片网址可能会短暂保存在待完成的登录资料中用于显示；Auth Center 不会将该 Google 头像网址保存到账户资料。如果服务启用了可选生日权限且你在 Google 授权页面同意，Auth Center 也可能通过 Google People API 请求完整生日，并将其保存到账户资料。Auth Center 不会请求 Gmail、云端硬盘、日历或其他 Google 内容。</p>
            <p><strong>其他登录提供商。</strong>你选择 GitHub 登录时，我们会收到完成身份验证或账号绑定所需的 GitHub 账号标识、已验证的主要邮箱、用户名、姓名和头像网址。提供商访问令牌仅用于完成登录，不会被保留以供持续访问。</p>
            <p><strong>身份验证与安全信息。</strong>我们会处理通行密钥凭据标识和公钥、验证计数器、会话与刷新令牌记录、登录时间、登录目标应用，以及安全和验证事件。我们不会收到通行密钥的私钥或生物识别数据；这些信息保留在你的设备或身份验证器中。</p>
            <p><strong>设备与请求信息。</strong>请求可能包含 IP 地址、浏览器或设备 User-Agent、粗略国家或地区及请求时间。会话记录可能保存 IP 地址及浏览器/设备详情；安全和注册防滥用流程也可能改为保存 IP 地址的带密钥哈希值。我们用这些信息管理会话、防止滥用、排查问题和进行安全审计。</p>
            <p><strong>使用、权限与测试访问信息。</strong>我们会记录应用标识、账号标识、事件类型（例如登录或页面访问）、国家、浏览器/设备类别、持续时间及额度使用情况。管理员可以配置应用权限和限制。如果管理员创建临时测试身份，我们会处理其名称、允许访问的应用、有效期、会话活动、API 路径与方法、响应状态和用量记录。</p>
            <p><strong>支持与邮件信息。</strong>我们会处理发送账号验证、登录验证码、密码重置、邮箱变更确认和安全通知所需的邮箱地址及内容。我们也会处理你的支持或隐私请求及你主动提供的信息。</p>
          </PolicySection>

          <PolicySection title="3. Google 用户数据的使用方式">
            <p>Google 登录请求 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em]">openid</code>、<code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em]">email</code> 和 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em]">profile</code> 权限范围。只有在服务启用了可选生日权限时，才会在 Google 授权页面请求生日权限。我们用账号标识和已验证邮箱验证身份、创建或绑定 Auth Center 账号，并防止重复或未授权访问；姓名和基本资料用于识别及填充 Auth Center 账号。若请求并取得生日，该生日会作为账号资料保存。</p>
            <p>我们会将 Google 账号标识、已验证邮箱、姓名及可选生日保存在 Auth Center 账号数据库中，用于运营账号。Google 头像网址仅在创建账号时临时使用，不保存到账户资料。授权码和 Google 访问令牌仅由服务器用于完成登录流程；启用生日权限时，访问令牌还会用于读取生日。我们不会保留 Google 访问令牌或刷新令牌以持续访问 Google 账号。</p>
            <p>Google 用户数据仅用于提供或维护你请求的账号、身份验证、账号绑定和单点登录功能。仅当你主动选择登录已连接应用时，相关身份声明才会发送到该应用获准的回调地址。除此之外，Google 资料只会由 Cloudflare 作为托管和数据库基础设施服务商按需处理，不会披露给其他接收方。我们不会出售 Google 用户数据，不将其用于广告、信用评估或训练通用人工智能或机器学习模型。</p>
            <p>有关 Google 如何处理 Google 账号信息，请参阅 <a className="font-medium text-blue-700 underline underline-offset-2" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google 隐私权政策</a>及 <a className="font-medium text-blue-700 underline underline-offset-2" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API 服务用户数据政策</a>。</p>
          </PolicySection>

          <PolicySection title="4. 我们使用信息的目的">
            <ul className="list-disc space-y-2 pl-5">
              <li>创建和维护账号、验证邮箱、验证密码/Google/GitHub/通行密钥登录，以及提供账号恢复服务。</li>
              <li>向你选择的应用提供单点登录、执行访问权限，并返回该次登录所需的身份声明。</li>
              <li>显示和管理资料、会话、通行密钥、应用访问、安全设置和使用额度。</li>
              <li>发送账号与安全事务邮件、回复支持和隐私请求，并运营服务。</li>
              <li>保护账号及应用、防止滥用、执行频率限制、排查错误并维护审计和使用统计。</li>
              <li>在必要时遵守法律义务，以及确立、行使或抗辩法律请求。</li>
            </ul>
            <p>在适用法律要求说明处理依据时，我们依据你请求的服务、运营和保护 Auth Center 的正当利益、你对可选提供商权限的同意，或遵守法律义务处理信息。</p>
          </PolicySection>

          <PolicySection title="5. 信息共享对象">
            <p><strong>Cloudflare。</strong>Auth Center 使用 Cloudflare Workers 及相关基础设施进行托管、数据库和头像存储、请求安全、Turnstile 防滥用、服务分析统计及事务邮件。Cloudflare 可能为托管和运营服务而处理请求、账号及源自 Google 的资料。请参阅 <a className="font-medium text-blue-700 underline underline-offset-2" href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare 隐私权政策</a>。</p>
            <p><strong>你选择访问的应用。</strong>仅当你继续前往已注册应用时，我们才会将签名且有时效的身份验证令牌发送到该应用已批准的回调地址。令牌可能包含 Auth Center 账号标识、用户名、姓名、邮箱及验证状态、角色、登录提供商、头像网址和会话标识，也可能包含用于识别你的 Google 姓名或邮箱。接收应用之后依其自身隐私政策处理这些信息。</p>
            <p><strong>身份提供商。</strong>Google 或 GitHub 会依据各自条款和隐私声明处理你的登录请求。Auth Center 只向提供商发送完成授权所需的信息，并接收上文列明的资料。</p>
            <p><strong>法律与安全原因。</strong>法律或有效法律程序要求时，或为保护用户、服务或他人的权利与安全而有合理必要时，我们可能披露信息。</p>
            <p>上述服务提供商及你主动选择的应用是信息的常规接收方。我们不会出售或出租个人信息，不会向数据经纪商或广告商披露 Google 用户数据，也不会将其用于定向、个性化或兴趣广告；法律与安全原因所需披露的情况除外。</p>
          </PolicySection>

          <PolicySection title="6. Cookie 与浏览器存储">
            <p>Auth Center 使用必要的第一方存储以保持登录状态并完成安全登录流程，包括 HTTP-only 会话与刷新 Cookie、短期 OAuth 状态 Cookie，以及管理员身份验证、通行密钥设置和主题偏好使用的临时浏览器存储。清除浏览器存储可能会使你退出登录或无法使用部分账号功能。</p>
            <p><strong>Google Analytics 4。</strong>本网站每次打开时都会加载 measurement ID 为 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em]">G-9NV66HSM65</code> 的 Google tag，并记录页面浏览分析。本网站不显示分析同意或选择提示。你可以通过浏览器设置或 Google 提供的 <a className="font-medium text-blue-700 underline underline-offset-2" href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer">Google Analytics 退出测量浏览器插件</a>屏蔽分析。</p>
            <p>在此单页应用内导航时，我们会发送包含泛化路由、通用页面标签和经过清理的来源页的页面浏览事件。这些手动发送的事件不包含查询字符串、URL 片段、动态路由中的账号标识、账号资料、登录令牌、密码或表单内容。我们不会设置 Analytics user ID。Google Signals 和广告个性化信号已在标签配置中关闭。其他自动交互事件可能取决于 Google Analytics 媒体资源的测量设置。</p>
            <p>Google Analytics 可能处理事件时间、会话统计、浏览器和设备信息及大致位置，也可能使用第一方 <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.9em]">_ga</code> Cookie 或相关标识区分假名化浏览器和会话。Google 表示，GA4 会在数据采集时使用 IP 地址推断大致位置，随后在记录数据前丢弃该地址。Google 依其条款和隐私说明处理分析数据，请参阅 <a className="font-medium text-blue-700 underline underline-offset-2" href="https://support.google.com/analytics/answer/11593727" target="_blank" rel="noreferrer">Google Analytics 收集的数据</a>及 <a className="font-medium text-blue-700 underline underline-offset-2" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google 隐私权政策</a>。我们不使用广告 Cookie 或跨站广告追踪。</p>
          </PolicySection>

          <PolicySection title="7. 信息保留期限">
            <p>账号和资料信息会在账号有效期间保留，并在提供服务、处理争议、履行法律义务及保护账号安全所需期间保留。你请求删除账号后，我们会删除或去标识化不再需要保留的信息；依法、出于安全或运营原因必须保留的记录除外。</p>
            <p>会话访问权限依账号设置的有效期到期，也可以提前撤销。未验证的待处理注册会在 24 小时后自动清理；邮箱验证链接 24 小时后失效，密码重置链接 30 分钟后失效，一次性登录验证码 10 分钟后失效，OAuth 登录事务 10 分钟后失效。临时测试身份和会话在各自设定的期限结束；相关审计或使用记录可能为安全和服务报告继续保留。</p>
            <p>我们仅在服务运营、防欺诈和报告所需期间保留分析及安全记录。Google Analytics 事件依 Analytics 媒体资源配置的保留期限保存，该设置可由服务管理员调整。Google Analytics 事件不会通过邮箱或 user ID 与 Auth Center 账号关联。备份或服务提供商持有的副本可能需要额外时间才会过期。你可以按上文所述联系我们，请求查阅或删除相关信息。</p>
          </PolicySection>

          <PolicySection title="8. 你的选择与隐私权利">
            <p>你可以通过 Auth Center 账号设置更新支持修改的资料、管理通行密钥、退出登录，并查看或撤销有效会话。在适用法律允许的范围内，你也可以请求我们提供个人数据副本、更正或删除账号、限制或反对处理，或解绑登录提供商；提出请求时，我们可能需要验证你的身份。</p>
            <p>如要删除与 Google 相关的资料或解绑 Google 登录，请在 Google 账号设置中撤销 Auth Center 的访问权限，并发送邮件至 <a className="font-medium text-blue-700 underline underline-offset-2" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>。撤销权限会阻止未来授权，但不会自动删除已保存于 Auth Center 账号中的资料。账号删除由服务管理员处理；请提供账号邮箱或用户名，不要发送密码或登录验证码。</p>
            <p>你的具体权利取决于居住地；在适用时，你也可以向当地数据保护监管机构投诉。</p>
          </PolicySection>

          <PolicySection title="9. 安全与跨境处理">
            <p>网站和服务连接使用 HTTPS/TLS 保护传输中的信息。我们使用访问控制及托管和身份验证基础设施提供的安全功能；Google 授权码与访问令牌仅用于短时登录流程。部分旧版或手动管理账号的密码记录可能可由授权管理员查看，详情见上文，请使用独立密码。任何在线服务都无法保证绝对安全。Cloudflare 和身份提供商可能在你所在国家或地区以外处理信息；在法律要求时，我们会为跨境传输采用适当保障措施。</p>
          </PolicySection>

          <PolicySection title="10. 政策更新">
            <p>当服务或数据处理方式发生变化时，我们可能更新本政策，并修改页面顶部的更新日期。如果变更实质影响 Google 用户数据或其他敏感账号信息的使用方式，我们会在适用法律要求时通过服务页面或账号邮件通知你。</p>
          </PolicySection>
        </article>

        <p className="px-2 py-6 text-center text-xs leading-6 text-slate-500">
          Google user data is handled according to the Google API Services User Data Policy. · Google 用户数据依照 Google API 服务用户数据政策处理。
        </p>
      </main>
    </div>
  );
}
