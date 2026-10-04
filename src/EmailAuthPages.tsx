import React from 'react';
import { adminRequest } from './adminSessionClient';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Fingerprint, Github, KeyRound, LogOut, Mail, Moon, RefreshCw, Shield, ShieldCheck, Smartphone, Sun, UserCog, ArrowRight, LoaderCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { startAuthentication } from '@simplewebauthn/browser';
import { ThemeToggle, useThemeMode } from './theme';
import LegalFooter from './LegalFooter';
import PasswordStrength from './PasswordStrength';
import { passwordProblem } from './passwordPolicy';
import './landing.css';

const API_BASE = '';

type RegistrationDraft = { email: string; username: string; fullname: string; password: string; register_code: string; birthday: string; avatar_data: string; invite_token?: string };
let registrationDraft: RegistrationDraft | null = null;

type Rules = {
  mode: string;
  start_at: string | null;
  end_at: string | null;
  email_registration_allowed: boolean;
  invite_registration_allowed: boolean;
  allowed_email_domains_hint: string;
  turnstile_site_key?: string;
  external_registration_enabled?: boolean;
};

function routeForToken(token: string, fallback = '/account/security') {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role === 'admin' || payload.uuid === 'admin') return '/dash';
    return `/user/${payload.uuid || payload.sub}`;
  } catch {
    return fallback;
  }
}

function AuthFrame({ title, children, login = false }: { title: string; children: React.ReactNode; login?: boolean }) {
  const { theme, setTheme } = useThemeMode('dark');
  return (
    <div data-theme={theme} className="dashboard-theme fixed inset-0 flex flex-col overflow-y-auto">
      <div className="ui-auth-shell ui-auth-shell-with-footer items-start pb-8 pt-20 md:items-center md:py-8" style={{ flex: '1 0 auto' }}>
        <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
          <ThemeToggle theme={theme} onChange={setTheme} />
        </div>
        <motion.main
          initial={{ opacity: 0, scale: 0.98, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className={`ui-auth-card relative ${login ? 'ui-auth-card-login' : ''}`}
        >
          <div className="mb-6 flex justify-center">
            <div className="ui-logo-badge">
              <Shield className="h-7 w-7" />
            </div>
          </div>
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Auth Center</p>
            <h1 className="mt-3 text-[28px] font-bold leading-tight text-[var(--text-primary)]">{title}</h1>
          </div>
          {children}
        </motion.main>
      </div>
      <LegalFooter className="shrink-0" />
    </div>
  );
}

function WideFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme, setTheme } = useThemeMode('dark');
  return (
    <div data-theme={theme} className="dashboard-theme min-h-dvh bg-[var(--bg)]">
      <main className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="ui-logo-badge h-11 w-11">
              <Shield className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Auth Center</p>
              <h1 className="truncate text-2xl font-bold text-[var(--text-primary)]">{title}</h1>
            </div>
          </div>
          <ThemeToggle theme={theme} onChange={setTheme} />
        </div>
        {children}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm font-medium text-[var(--text-primary)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Notice({ children, tone = 'normal' }: { children: React.ReactNode; tone?: 'normal' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'text-[var(--danger)]' : tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]';
  return <div className={`rounded-[12px] border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm ${color}`}>{children}</div>;
}

function useRegistrationRules() {
  const [rules, setRules] = React.useState<Rules | null>(null);
  React.useEffect(() => {
    fetch(`${API_BASE}/api/auth/registration/rules`)
      .then((res) => res.json())
      .then((data) => setRules(data.rules))
      .catch(() => null);
  }, []);
  return rules;
}

function TurnstileBox({ siteKey, onToken, resetSignal = 0 }: { siteKey?: string; onToken: (token: string) => void; resetSignal?: number }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const widgetId = React.useRef<string | null>(null);
  const onTokenRef = React.useRef(onToken);
  React.useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);
  React.useEffect(() => {
    if (!siteKey || !ref.current) return;
    const render = () => {
      const turnstile = (window as any).turnstile;
      if (!turnstile || !ref.current || ref.current.dataset.rendered) return;
      ref.current.dataset.rendered = '1';
      widgetId.current = turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
      });
    };
    const existing = document.querySelector('script[data-turnstile-script="1"]') as HTMLScriptElement | null;
    if (existing) {
      render();
      existing.addEventListener('load', render);
      return () => existing.removeEventListener('load', render);
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = '1';
    script.onload = render;
    document.head.appendChild(script);
  }, [siteKey]);

  React.useEffect(() => {
    if (!resetSignal || !widgetId.current) return;
    const turnstile = (window as any).turnstile;
    if (turnstile?.reset) {
      turnstile.reset(widgetId.current);
      onTokenRef.current('');
    }
  }, [resetSignal]);

  if (!siteKey) return <Notice tone="danger">Turnstile is not configured.</Notice>;
  return <div className="flex min-h-[70px] justify-center rounded-[12px]"><div ref={ref} /></div>;
}

async function apiPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

export function LandingPage() {
  const { theme, setTheme } = useThemeMode('dark');
  const navigate = useNavigate();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || params.get('redirect_uri');
    const appId = params.get('app_id') || params.get('client_id');
    if (redirect && appId) {
      navigate(`/login?${params.toString()}`, { replace: true });
      return;
    }
    fetch(`${API_BASE}/api/auth/session/continue`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data?.ok) return;
        const role = data.user?.role || data.role;
        const uuid = data.user?.uuid || data.user?.id || data.uuid;
        navigate(role === 'admin' ? '/dash' : `/user/${uuid}`, { replace: true });
      })
      .catch(() => null);
  }, [navigate]);

  return (
    <div data-theme={theme} className="ac-landing">
      <div className="ac-landing-shell">
        <header className="ac-landing-header">
          <Link className="ac-landing-brand" to="/" aria-label="Aryuki Auth Center home">
            <span className="ac-landing-mark"><ShieldCheck size={23} strokeWidth={2} /></span>
            <span>Aryuki <span className="ac-landing-brand-sub">/ Auth Center</span></span>
          </Link>
          <button className="ac-landing-theme" type="button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? <Moon size={19} aria-hidden="true" /> : <Sun size={19} aria-hidden="true" />}
          </button>
        </header>

        <main className="ac-landing-main">
          <motion.div className="ac-landing-content" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42 }}>
            <div className="ac-landing-intro">
              <p className="ac-landing-eyebrow">Your secure starting point</p>
              <h1>Auth Center</h1>
              <p>One account for everything you do with Aryuki.</p>
            </div>

            <div className="ac-landing-panel">
              <a className="ac-landing-provider" href="/api/google/login"><span className="ac-landing-google" aria-hidden="true">G</span>Continue with Google</a>
              <a className="ac-landing-provider" href="/api/github/login"><Github size={19} aria-hidden="true" />Continue with GitHub</a>
              <div className="ac-landing-divider"><span>or</span></div>
              <Link className="ac-landing-email" to="/login"><Mail size={19} aria-hidden="true" />Continue with email</Link>
              <p className="ac-landing-fine">By continuing, you agree to the <Link to="/privacy">Privacy Policy</Link>.</p>
            </div>

            <p className="ac-landing-register">New here? <Link to="/register">Create an account <ArrowRight size={16} aria-hidden="true" /></Link></p>
          </motion.div>

          <motion.figure className="ac-landing-photo" initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.08 }}>
            <img src="/auth-center-hero.webp" alt="A creative professional working at a desk" />
          </motion.figure>
        </main>
        <footer className="ac-landing-footer"><span>© {new Date().getFullYear()} Aryuki</span><Link to="/privacy">Privacy</Link></footer>
      </div>
    </div>
  );
}

export function EmailLoginPage() {
  const rules = useRegistrationRules();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = React.useState<'password' | 'code'>('password');
  const [identifier, setIdentifier] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [codeSent, setCodeSent] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [turnstile, setTurnstile] = React.useState('');
  const [turnstileReset, setTurnstileReset] = React.useState(0);
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const redirectUri = searchParams.get('redirect') || searchParams.get('redirect_uri') || '';
  const appId = searchParams.get('app_id') || searchParams.get('client_id') || 'auth-center';
  const returnTo = searchParams.get('return') === '/welcomenewuser' ? '/welcomenewuser' : '';

  React.useEffect(() => {
    if (!redirectUri || !appId || returnTo) return;
    const controller = new AbortController();
    fetch(`${API_BASE}/api/auth/session/continue`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, redirect_uri: redirectUri }), signal: controller.signal,
    }).then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) })).then(({ ok, data }) => {
      if (controller.signal.aborted) return;
      if (ok && data?.redirect_to) window.location.replace(data.redirect_to);
      else if (!ok && typeof data?.error === 'string' && data.error.toLowerCase().includes('permission')) setMessage(data.error);
    }).catch(() => null);
    return () => controller.abort();
  }, [redirectUri, appId, returnTo]);

  React.useEffect(() => {
    const error = searchParams.get('error');
    if (error) setMessage(error === 'account_paused' ? 'This account is paused or disabled.' : error === 'no_permission' ? 'You do not have permission to access this application.' : error.replace(/_/g, ' '));
  }, [searchParams]);

  React.useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown > 0]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const data = await apiPost('/api/auth/login/email', { identifier, email: identifier, password, turnstile_token: turnstile, redirect_uri: redirectUri, app_id: appId });
      const target = data.token ? routeForToken(data.token) : '/account/security';
      if (data.token && target === '/dash') localStorage.setItem('sso_admin_auth', `Bearer ${data.token}`);
      else localStorage.removeItem('sso_admin_auth');
      window.location.href = returnTo || data.redirect_to || target;
    } catch (error: any) {
      setMessage(error.message);
      if (turnstile) {
        setTurnstile('');
        setTurnstileReset((value) => value + 1);
      }
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async () => {
    setLoading(true);
    setMessage('');
    try {
      const data = await apiPost('/api/auth/login/otp/send', { email, turnstile_token: turnstile });
      setMessage(data.message);
      setCodeSent(true);
      setResendCooldown(60);
      setTurnstile('');
      setTurnstileReset((value) => value + 1);
    } catch (error: any) {
      setMessage(error.message);
      setTurnstile('');
      setTurnstileReset((value) => value + 1);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const data = await apiPost('/api/auth/login/otp/verify', { email, code, redirect_uri: redirectUri, app_id: appId });
      const target = data.token ? routeForToken(data.token) : '/account/security';
      if (data.token && target === '/dash') localStorage.setItem('sso_admin_auth', `Bearer ${data.token}`);
      else localStorage.removeItem('sso_admin_auth');
      window.location.href = returnTo || data.redirect_to || target;
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const passkeyLogin = async () => {
    setLoading(true);
    setMessage('');
    try {
      const optionsRes = await fetch(`${API_BASE}/api/passkey/generate-authentication-options`, { credentials: 'include' });
      const options = await optionsRes.json();
      const credential = await startAuthentication(options);
      const query = redirectUri ? `?app_id=${encodeURIComponent(appId)}&app_redirect=${encodeURIComponent(redirectUri)}` : '';
      const verifyRes = await fetch(`${API_BASE}/api/passkey/verify-authentication${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(credential),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok || !data.verified) throw new Error(data.error || 'Passkey login failed');
      const target = routeForToken(data.token);
      if (data.token && target === '/dash') localStorage.setItem('sso_admin_auth', `Bearer ${data.token}`);
      else localStorage.removeItem('sso_admin_auth');
      window.location.href = returnTo || (redirectUri
        ? `${redirectUri}${redirectUri.includes('?') ? '&' : '?'}token=${encodeURIComponent(data.token)}`
        : target);
    } catch (error: any) {
      setMessage(error.message || 'Passkey login failed');
    } finally {
      setLoading(false);
    }
  };

  const githubHref = redirectUri
    ? `${API_BASE}/api/github/login?app_redirect=${encodeURIComponent(redirectUri)}&app_id=${encodeURIComponent(appId)}`
    : `${API_BASE}/api/github/login`;
  const googleHref = redirectUri
    ? `${API_BASE}/api/google/login?app_redirect=${encodeURIComponent(redirectUri)}&app_id=${encodeURIComponent(appId)}`
    : `${API_BASE}/api/google/login`;

  return (
    <AuthFrame title="Sign in" login>
      <div className="ac-login-providers">
        <a className="ac-login-provider" href={googleHref}><span className="ac-landing-google" aria-hidden="true">G</span>Continue with Google</a>
        <a className="ac-login-provider" href={githubHref}><Github className="h-5 w-5" aria-hidden="true" />Continue with GitHub</a>
      </div>
      <div className="ac-login-divider"><span>or</span></div>

      {tab === 'password' ? (
        <form onSubmit={login} className="space-y-4">
          <Field label="Email or name"><input required value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" /></Field>
          <AnimatePresence initial={false}>
            {identifier.trim() ? (
              <motion.div key="password-fields" className="overflow-hidden" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}>
                <div className="space-y-4 pt-1">
                  <Field label="Password"><input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></Field>
                  {message.includes('Turnstile') || message.includes('人机') ? <TurnstileBox siteKey={rules?.turnstile_site_key} onToken={setTurnstile} resetSignal={turnstileReset} /> : null}
                  <button className="ui-button-primary w-full" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
                  <button className="ac-login-switch" type="button" onClick={() => { setEmail(identifier.includes('@') ? identifier : ''); setTab('code'); }}>Use email code login</button>
                  <button className="ui-button-secondary flex w-full items-center justify-center gap-2" type="button" onClick={passkeyLogin} disabled={loading}>
                    <Fingerprint className="h-4 w-4" /> Passkey
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="space-y-4">
          <Field label="Email"><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></Field>
          {!codeSent ? <TurnstileBox siteKey={rules?.turnstile_site_key} onToken={setTurnstile} resetSignal={turnstileReset} /> : null}
          {!codeSent ? (
            <button className="ui-button-primary w-full" type="button" onClick={sendOtp} disabled={loading || !email || !turnstile}>Send code by email</button>
          ) : (
            <>
              <Field label="Six-digit code"><input inputMode="numeric" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></Field>
              {resendCooldown === 0 ? <TurnstileBox siteKey={rules?.turnstile_site_key} onToken={setTurnstile} resetSignal={turnstileReset} /> : null}
              <button
                className="ui-button-secondary w-full"
                type="button"
                onClick={sendOtp}
                disabled={loading || resendCooldown > 0 || !turnstile}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
              <button className="ui-button-primary w-full" disabled={loading || code.length !== 6}>{loading ? 'Signing in...' : 'Sign in'}</button>
            </>
          )}
          <button className="ac-login-switch" type="button" onClick={() => setTab('password')}>Use password login</button>
        </form>
      )}

      {message ? <div className="mt-4"><Notice>{message}</Notice></div> : null}
      <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
        <Link to="/forgot-password" className="font-semibold text-[var(--primary)] no-underline">Forgot password</Link>
        <Link to="/register" className="font-semibold text-[var(--primary)] no-underline">Create account</Link>
      </div>
    </AuthFrame>
  );
}

export function RegisterEmailPage() {
  const rules = useRegistrationRules();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || '';
  const [form, setForm] = React.useState({ email: '', username: '', fullname: '', password: '', register_code: '', birthday: '', avatar_data: '' });
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [invitation, setInvitation] = React.useState<{ expires_at: string; expires_at_display: string } | null>(null);
  const [inviteLoading, setInviteLoading] = React.useState(Boolean(inviteToken));

  React.useEffect(() => {
    if (!inviteToken) return;
    setInviteLoading(true);
    fetch(`${API_BASE}/api/auth/register/invite?token=${encodeURIComponent(inviteToken)}`, { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) throw new Error(data.message || 'This invitation is invalid or has expired.');
        setForm((current) => ({ ...current, email: data.email, register_code: data.register_code }));
        setInvitation({ expires_at: data.expires_at, expires_at_display: data.expires_at_display });
      })
      .catch((error) => setMessage(error.message || 'This invitation is invalid or has expired.'))
      .finally(() => setInviteLoading(false));
  }, [inviteToken]);

  const readAvatar = (file?: File) => {
    if (!file) {
      setForm((current) => ({ ...current, avatar_data: '' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, avatar_data: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = passwordProblem(form.password);
    if (problem) { setMessage(problem); return; }
    if (/admin/i.test(form.username) || /admin/i.test(form.fullname)) { setMessage('Username and full name cannot contain admin.'); return; }
    setLoading(true);
    setMessage('');
    try {
      await apiPost('/api/auth/register/preflight', { ...form, invite_token: inviteToken || undefined });
      registrationDraft = { ...form, invite_token: inviteToken || undefined };
      navigate('/welcomenewuser?channel=email');
    } catch (error: any) {
      setMessage(error.message || 'Please check your registration details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFrame title="Create account">
      <div className="mb-5">
        {inviteToken ? (
          invitation ? <Notice tone="success">Invitation reserved until {invitation.expires_at_display}. Complete registration before day 7 at 00:00.</Notice> : <Notice tone={message ? 'danger' : 'normal'}>{inviteLoading ? 'Loading invitation...' : message || 'Invitation unavailable.'}</Notice>
        ) : (
          <Notice>{!rules ? 'Loading registration rules...' : rules.email_registration_allowed && rules.external_registration_enabled !== false ? 'Public registration is open.' : 'Public registration is closed.'}</Notice>
        )}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><input type="email" required readOnly={!!invitation} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
        <Field label="Username"><input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></Field>
        <Field label="Full name"><input required value={form.fullname} onChange={(event) => setForm({ ...form, fullname: event.target.value })} /></Field>
        <Field label="Password"><input type="password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><PasswordStrength password={form.password} /></Field>
        <Field label="Register code"><input readOnly={!!invitation} value={form.register_code} onChange={(event) => setForm({ ...form, register_code: event.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Birthday"><input type="date" value={form.birthday} onChange={(event) => setForm({ ...form, birthday: event.target.value })} /></Field>
          <Field label="Avatar"><input type="file" accept="image/*" onChange={(event) => readAvatar(event.target.files?.[0])} /></Field>
        </div>
        <button className="ui-button-primary w-full" disabled={loading || inviteLoading || (!!inviteToken && !invitation) || (!invitation && (!rules?.email_registration_allowed || rules.external_registration_enabled === false))}>{loading ? 'Creating...' : 'Continue'}</button>
      </form>
      {message && (!inviteToken || invitation) ? <div className="mt-4"><Notice tone="danger">{message}</Notice></div> : null}
      <Link to="/login" className="mt-5 block text-center font-semibold text-[var(--primary)] no-underline">Back to sign in</Link>
    </AuthFrame>
  );
}

type OAuthPendingView = {
  provider: 'github' | 'google';
  email: string;
  name: string;
  avatar_url: string | null;
  decision: 'new_account' | 'link_existing' | 'verify_existing_first' | 'closed' | 'unsupported_domain';
  require_turnstile: boolean;
  site_key: string;
  can_bind: boolean;
};

export function WelcomeNewUserPage() {
  const rules = useRegistrationRules();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const emailMode = params.get('channel') === 'email';
  const [pending, setPending] = React.useState<OAuthPendingView | null>(null);
  const [loading, setLoading] = React.useState(!emailMode);
  const [submitting, setSubmitting] = React.useState(false);
  const [turnstile, setTurnstile] = React.useState('');
  const [resetSignal, setResetSignal] = React.useState(0);
  const [message, setMessage] = React.useState('');
  const [progress, setProgress] = React.useState(18);
  const autoStarted = React.useRef(false);

  React.useEffect(() => {
    if (emailMode) return;
    fetch('/api/auth/oauth/pending', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.message || 'This sign-in has expired.');
        setPending(data);
        setProgress(42);
      })
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [emailMode]);

  const finish = (data: any) => {
    if (data.token) {
      const target = data.redirect_to || routeForToken(data.token);
      if (routeForToken(data.token) === '/dash') localStorage.setItem('sso_admin_auth', `Bearer ${data.token}`);
      else localStorage.removeItem('sso_admin_auth');
      window.location.assign(target);
      return;
    }
    navigate('/login');
  };

  const submit = async () => {
    if (submitting) return;
    if (emailMode && (!registrationDraft || !turnstile)) return;
    if (!emailMode && (!pending || (pending.require_turnstile && !turnstile))) return;
    setSubmitting(true);
    setMessage('');
    setProgress(70);
    try {
      const started = Date.now();
      const data = emailMode
        ? await apiPost('/api/auth/register', { ...registrationDraft!, confirm_password: registrationDraft!.password, turnstile_token: turnstile })
        : await apiPost('/api/auth/oauth/complete', { turnstile_token: turnstile });
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 2000 - (Date.now() - started))));
      setProgress(100);
      if (emailMode) {
        const email = registrationDraft!.email;
        registrationDraft = null;
        if (!data.token) {
          navigate(`/verify-email?email=${encodeURIComponent(email)}&message=${encodeURIComponent(data.message || 'Verification email sent.')}`);
          return;
        }
      }
      finish(data);
    } catch (error: any) {
      setMessage(error.message || 'Unable to continue.');
      setProgress(42);
      setTurnstile('');
      setResetSignal((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  };

  React.useEffect(() => {
    if (emailMode || !pending || pending.decision !== 'new_account' || pending.require_turnstile || autoStarted.current) return;
    autoStarted.current = true;
    void submit();
  }, [emailMode, pending]);

  const label = emailMode ? 'Email' : pending?.provider === 'github' ? 'GitHub' : 'Google';
  const draftMissing = emailMode && !registrationDraft;
  const canSubmit = emailMode ? !!registrationDraft && !!turnstile : pending?.decision === 'link_existing'
    ? !!pending.can_bind : !!pending && pending.decision === 'new_account' && (!pending.require_turnstile || !!turnstile);

  return (
    <AuthFrame title="Welcome">
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3">
          {pending?.avatar_url ? <img className="h-11 w-11 rounded-[10px] object-cover" src={pending.avatar_url} alt="" /> : <div className="ui-logo-badge h-11 w-11"><Shield className="h-5 w-5" /></div>}
          <div className="min-w-0"><p className="font-semibold text-[var(--text-primary)]">{pending?.name || registrationDraft?.fullname || 'Your account'}</p><p className="break-all text-sm text-[var(--text-secondary)]">{pending?.email || registrationDraft?.email || label}</p></div>
        </div>
        <div aria-label="Registration progress" className="h-2 overflow-hidden rounded-full bg-[var(--surface-alt)]"><div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-700" style={{ width: `${progress}%` }} /></div>
        {loading || submitting ? <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><LoaderCircle className="h-4 w-4 animate-spin" /> {submitting ? 'Creating your account...' : 'Checking your account...'}</p> : null}
        {draftMissing ? <Notice tone="danger">Registration details were cleared. Please complete the form again.</Notice> : null}
        {!emailMode && pending?.decision === 'link_existing' ? <Notice>This email belongs to an existing account. Sign in to link {label} to it.</Notice> : null}
        {!emailMode && pending?.decision === 'verify_existing_first' ? <Notice tone="danger">Please verify your existing email account before linking {label}.</Notice> : null}
        {!emailMode && pending?.decision === 'closed' ? <Notice tone="danger">External registration is currently closed.</Notice> : null}
        {!emailMode && pending?.decision === 'unsupported_domain' ? <Notice tone="danger">This email domain is not supported for registration.</Notice> : null}
        {!loading && (emailMode || pending?.decision === 'new_account') && (emailMode || pending?.require_turnstile)
          ? <TurnstileBox siteKey={emailMode ? rules?.turnstile_site_key : pending?.site_key} onToken={setTurnstile} resetSignal={resetSignal} /> : null}
        {message ? <Notice tone="danger">{message}</Notice> : null}
        {pending?.decision === 'link_existing' && !pending.can_bind ? <Link className="ui-button-primary block text-center no-underline" to="/login?return=%2Fwelcomenewuser">Sign in to link</Link> : null}
        {!loading && canSubmit && (emailMode || pending?.decision === 'link_existing' || pending?.require_turnstile) ? <button className="ui-button-primary w-full" type="button" onClick={() => void submit()} disabled={submitting}>{pending?.decision === 'link_existing' ? 'Link account' : 'Create account'}</button> : null}
        <Link className="block text-center text-sm font-semibold text-[var(--primary)] no-underline" to={emailMode ? '/register' : '/login'}>{emailMode ? 'Back to registration' : 'Back to sign in'}</Link>
      </div>
    </AuthFrame>
  );
}

export function RegisterCodePage() {
  const rules = useRegistrationRules();
  const [form, setForm] = React.useState({ username: '', password: '', confirm_password: '', register_code: '' });
  const [turnstile, setTurnstile] = React.useState('');
  const [turnstileReset, setTurnstileReset] = React.useState(0);
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = passwordProblem(form.password);
    if (problem) { setMessage(problem); return; }
    setLoading(true);
    setMessage('');
    try {
      await apiPost('/api/auth/register/code', { ...form, turnstile_token: turnstile });
      window.location.href = '/account/security';
    } catch (error: any) {
      setMessage(error.message);
      setTurnstile('');
      setTurnstileReset((value) => value + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFrame title="Register code">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username"><input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></Field>
        <Field label="Password"><input type="password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><PasswordStrength password={form.password} /></Field>
        <Field label="Confirm password"><input type="password" required value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} /></Field>
        <Field label="Register code"><input required value={form.register_code} onChange={(event) => setForm({ ...form, register_code: event.target.value })} /></Field>
        <TurnstileBox siteKey={rules?.turnstile_site_key} onToken={setTurnstile} resetSignal={turnstileReset} />
        <button className="ui-button-primary w-full" disabled={loading || !turnstile || rules?.invite_registration_allowed === false}>{loading ? 'Creating...' : 'Create account'}</button>
      </form>
      {message ? <div className="mt-4"><Notice tone="danger">{message}</Notice></div> : null}
      <Link to="/login" className="mt-5 block text-center font-semibold text-[var(--primary)] no-underline">Back to sign in</Link>
    </AuthFrame>
  );
}

export function VerifyEmailNoticePage() {
  const rules = useRegistrationRules();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = React.useState(searchParams.get('email') || '');
  const [turnstile, setTurnstile] = React.useState('');
  const [turnstileReset, setTurnstileReset] = React.useState(0);
  const [message, setMessage] = React.useState(searchParams.get('message') || (searchParams.get('status') === 'success' ? 'Email verified.' : 'Check your inbox.'));
  const [loading, setLoading] = React.useState(false);
  const status = searchParams.get('status');

  const resend = async () => {
    setLoading(true);
    try {
      const data = await apiPost('/api/auth/email/verify/resend', { email, turnstile_token: turnstile });
      setMessage(data.message);
    } catch (error: any) {
      setMessage(error.message);
      setTurnstile('');
      setTurnstileReset((value) => value + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFrame title="Verify email">
      {status === 'success' ? (
        <div className="space-y-6 text-center">
          <CheckCircle2 className="mx-auto h-24 w-24 text-[var(--success)]" strokeWidth={1.7} />
          <div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">Email verified successfully</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Your account is ready to use.</p>
          </div>
          <Link to="/login" className="ui-button-primary flex w-full items-center justify-center no-underline">Back to sign in</Link>
        </div>
      ) : (
        <div className="space-y-4">
          <Notice tone="normal">{message}</Notice>
          <Field label="Email"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          <TurnstileBox siteKey={rules?.turnstile_site_key} onToken={setTurnstile} resetSignal={turnstileReset} />
          <button className="ui-button-primary flex w-full items-center justify-center gap-2" onClick={resend} disabled={loading || !email || !turnstile}>
            <RefreshCw className="h-4 w-4" /> Resend email
          </button>
          <Link to="/login" className="ui-button-secondary flex w-full items-center justify-center no-underline">Back to sign in</Link>
        </div>
      )}
    </AuthFrame>
  );
}

export function ForgotPasswordPage() {
  const rules = useRegistrationRules();
  const [email, setEmail] = React.useState('');
  const [turnstile, setTurnstile] = React.useState('');
  const [turnstileReset, setTurnstileReset] = React.useState(0);
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const data = await apiPost('/api/auth/password/forgot', { email, turnstile_token: turnstile });
      setMessage(data.message);
    } catch (error: any) {
      setMessage(error.message);
      setTurnstile('');
      setTurnstileReset((value) => value + 1);
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthFrame title="Reset password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
        <TurnstileBox siteKey={rules?.turnstile_site_key} onToken={setTurnstile} resetSignal={turnstileReset} />
        <button className="ui-button-primary w-full" disabled={loading || !turnstile}>{loading ? 'Sending...' : 'Send reset email'}</button>
      </form>
      {message ? <div className="mt-4"><Notice>{message}</Notice></div> : null}
    </AuthFrame>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [newPassword, setNewPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const problem = passwordProblem(newPassword);
      if (problem) throw new Error(problem);
      const data = await apiPost('/api/auth/password/reset', { token: searchParams.get('token'), new_password: newPassword, confirm_password: confirm });
      setMessage(data.message);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthFrame title="New password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password"><input type="password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><PasswordStrength password={newPassword} /></Field>
        <Field label="Confirm password"><input type="password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></Field>
        <button className="ui-button-primary w-full" disabled={loading}>{loading ? 'Saving...' : 'Save password'}</button>
      </form>
      {message ? <div className="mt-4"><Notice>{message}</Notice></div> : null}
    </AuthFrame>
  );
}

export function AccountSecurityPage() {
  const rules = useRegistrationRules();
  const [user, setUser] = React.useState<any>(null);
  const [sessions, setSessions] = React.useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [emailForm, setEmailForm] = React.useState({ new_email: '', password: '', turnstile: '' });
  const [emailTurnstileReset, setEmailTurnstileReset] = React.useState(0);
  const [passwordForm, setPasswordForm] = React.useState({ old_password: '', new_password: '', confirm_password: '' });
  const [registerCode, setRegisterCode] = React.useState('');

  const load = React.useCallback(async () => {
    const me = await fetch(`${API_BASE}/api/account/me`, { credentials: 'include' });
    if (!me.ok) {
      window.location.href = '/login';
      return;
    }
    const meData = await me.json();
    setUser(meData.user);
    const sessionRes = await fetch(`${API_BASE}/api/account/sessions`, { credentials: 'include' });
    const sessionData = await sessionRes.json();
    setSessions(sessionData.sessions || []);
    setCurrentSessionId(sessionData.current_session_id || '');
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const problem = passwordProblem(passwordForm.new_password);
      if (problem) throw new Error(problem);
      const data = await apiPost(user?.has_password === false ? '/api/account/password/set' : '/api/account/password/change', passwordForm);
      setMessage(data.message);
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
      await load();
    } catch (error: any) {
      setMessage(error.message);
      setEmailForm((current) => ({ ...current, turnstile: '' }));
      setEmailTurnstileReset((value) => value + 1);
    }
  };

  const changeEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const data = await apiPost('/api/account/email/change/request', { new_email: emailForm.new_email, password: emailForm.password, turnstile_token: emailForm.turnstile });
      setMessage(data.message);
    } catch (error: any) {
      setMessage(error.message);
    }
  };

  const revoke = async (session_id: string) => {
    await apiPost('/api/account/sessions/revoke', { session_id });
    await load();
  };

  const revokeAll = async () => {
    await apiPost('/api/account/sessions/revoke-all', {});
    window.location.href = '/login';
  };

  const applyRegisterCode = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const data = await apiPost('/api/account/register-code/apply', { register_code: registerCode });
      setMessage(data.message);
      setRegisterCode('');
    } catch (error: any) {
      setMessage(error.message);
    }
  };

  return (
    <WideFrame title="Account Security">
      {!user ? <Notice>Loading...</Notice> : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="ui-card p-5 md:p-6">
            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              <div className="ui-card-subtle p-4">
                <p className="text-xs text-[var(--text-tertiary)]">Username</p>
                <p className="mt-1 font-semibold">{user.username}</p>
              </div>
              <div className="ui-card-subtle p-4">
                <p className="text-xs text-[var(--text-tertiary)]">Email</p>
                <p className="mt-1 break-all font-semibold">{user.email || 'Not bound'}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{user.email_verified ? 'Verified' : 'Not verified'}</p>
              </div>
            </div>
            {!user.email ? <div className="mb-5"><Notice>Bind an email to recover your account.</Notice></div> : null}
            {message ? <div className="mb-5"><Notice>{message}</Notice></div> : null}

            <form onSubmit={changeEmail} className="space-y-4">
              <h2 className="text-lg font-semibold">Email</h2>
              <Field label="New email"><input type="email" placeholder="name@aryuki.com" value={emailForm.new_email} onChange={(event) => setEmailForm({ ...emailForm, new_email: event.target.value })} /></Field>
              <Field label="Current password"><input type="password" value={emailForm.password} onChange={(event) => setEmailForm({ ...emailForm, password: event.target.value })} /></Field>
              <TurnstileBox siteKey={rules?.turnstile_site_key} onToken={(token) => setEmailForm((current) => ({ ...current, turnstile: token }))} resetSignal={emailTurnstileReset} />
              <button className="ui-button-primary w-full" disabled={!emailForm.turnstile}>Send confirmation</button>
            </form>
          </section>

          <section className="ui-card p-5 md:p-6">
            <Link className="ui-button-secondary mb-5 flex items-center justify-center gap-2 no-underline" to={`/user/${encodeURIComponent(user.uuid)}?panel=oauth`}><Github className="h-4 w-4" /> Bind other account</Link>
            <form onSubmit={changePassword} className="space-y-4">
              <h2 className="text-lg font-semibold">Password</h2>
              {user.has_password !== false ? <Field label="Old password"><input type="password" value={passwordForm.old_password} onChange={(event) => setPasswordForm({ ...passwordForm, old_password: event.target.value })} /></Field> : null}
              <Field label="New password"><input type="password" value={passwordForm.new_password} onChange={(event) => setPasswordForm({ ...passwordForm, new_password: event.target.value })} /><PasswordStrength password={passwordForm.new_password} /></Field>
              <Field label="Confirm password"><input type="password" value={passwordForm.confirm_password} onChange={(event) => setPasswordForm({ ...passwordForm, confirm_password: event.target.value })} /></Field>
              <button className="ui-button-primary w-full">{user.has_password === false ? 'Add password' : 'Update password'}</button>
            </form>
            <form onSubmit={applyRegisterCode} className="mt-6 space-y-4 border-t border-[var(--border)] pt-5">
              <h2 className="text-lg font-semibold">Register code</h2>
              <Field label="Code"><input value={registerCode} onChange={(event) => setRegisterCode(event.target.value)} /></Field>
              <button className="ui-button-secondary w-full" disabled={!registerCode}>Apply configuration</button>
            </form>
          </section>

          <section className="ui-card p-5 md:col-span-2 md:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Devices</h2>
              <button className="ui-button-secondary flex items-center justify-center gap-2" onClick={revokeAll} type="button">
                <LogOut className="h-4 w-4" /> Sign out all
              </button>
            </div>
            <div className="space-y-3">
              {sessions.length === 0 ? <Notice>No sessions.</Notice> : sessions.map((session) => (
                <div key={session.id} className="ui-card-subtle flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium"><Smartphone className="h-4 w-4" />{session.id === currentSessionId ? 'Current device' : 'Signed-in device'}</p>
                    <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{session.user_agent || 'Unknown user agent'}</p>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">IP hash: {session.ip_hash || 'N/A'} · {session.created_at}</p>
                  </div>
                  <button className="ui-button-secondary" onClick={() => revoke(session.id)} disabled={!!session.revoked_at}>Sign out</button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </WideFrame>
  );
}

export function AdminSecurityPage() {
  const [section, setSection] = React.useState<'users' | 'codes' | 'rules' | 'logs' | 'emails'>('users');
  const [data, setData] = React.useState<any>({});
  const [message, setMessage] = React.useState('');
  const adminFetch = React.useCallback(async (path: string, options?: RequestInit) => {
    const res = await adminRequest(`${API_BASE}${path}`, options);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.ok === false) throw new Error(payload.error || payload.message || 'Request failed');
    return payload;
  }, []);

  const load = React.useCallback(async () => {
    const paths = {
      users: '/admin/auth/users',
      codes: '/admin/auth/register-codes',
      rules: '/admin/auth/registration-rules',
      logs: '/admin/auth/audit-logs',
      emails: '/admin/auth/email-jobs',
    };
    try {
      setMessage('');
      setData(await adminFetch(paths[section]));
    } catch (error: any) {
      setMessage(error.message);
    }
  }, [adminFetch, section]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const createCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const payload = await adminFetch('/admin/auth/register-codes', {
      method: 'POST',
      body: JSON.stringify({
        label: fd.get('label'),
        role: fd.get('role'),
        max_uses: fd.get('max_uses'),
        expires_at: fd.get('expires_at'),
      }),
    });
    setMessage(`Register code: ${payload.code}`);
    await load();
  };

  return (
    <WideFrame title="Security Admin">
      <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['users', 'Users'],
          ['codes', 'Codes'],
          ['rules', 'Rules'],
          ['logs', 'Logs'],
          ['emails', 'Email Jobs'],
        ].map(([id, label]) => (
          <button key={id} className="ui-nav-pill flex items-center justify-center gap-2 px-4 py-2.5" data-active={section === id} onClick={() => setSection(id as any)} type="button">
            {id === 'users' ? <UserCog className="h-4 w-4" /> : id === 'codes' ? <KeyRound className="h-4 w-4" /> : id === 'emails' ? <Mail className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
            {label}
          </button>
        ))}
      </div>
      {message ? <div className="mb-4"><Notice>{message}</Notice></div> : null}

      {section === 'users' ? (
        <section className="ui-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr><th className="p-3">ID</th><th className="p-3">User</th><th className="p-3">Email</th><th className="p-3">Verified</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Provider</th><th className="p-3">Created</th><th className="p-3">Actions</th></tr>
              </thead>
              <tbody>{(data.users || []).map((user: any) => (
                <tr key={user.uuid || user.id} className="border-t border-[var(--border)]">
                  <td className="max-w-[180px] truncate p-3 font-mono text-xs">{user.uuid || user.id}</td>
                  <td className="p-3 font-medium">{user.username}</td>
                  <td className="max-w-[180px] truncate p-3">{user.email || '-'}</td>
                  <td className="p-3">{user.email_verified ? <CheckCircle2 className="h-4 w-4 text-[var(--success)]" /> : '-'}</td>
                  <td className="p-3">{user.role}</td>
                  <td className="p-3">{user.status}</td>
                  <td className="p-3">{user.auth_provider}</td>
                  <td className="p-3 text-xs text-[var(--text-secondary)]">{user.created_at}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="ui-button-secondary" onClick={() => adminFetch(`/admin/auth/users/${user.uuid || user.id}/status`, { method: 'POST', body: JSON.stringify({ status: user.status === 'disabled' ? 'active' : 'disabled' }) }).then(load)}>{user.status === 'disabled' ? 'Enable' : 'Disable'}</button>
                      <button className="ui-button-secondary" onClick={() => adminFetch(`/admin/auth/users/${user.uuid || user.id}/role`, { method: 'POST', body: JSON.stringify({ role: user.role === 'admin' ? 'user' : 'admin' }) }).then(load)}>Role</button>
                      <button className="ui-button-secondary" onClick={() => adminFetch(`/admin/auth/users/${user.uuid || user.id}/revoke-sessions`, { method: 'POST' }).then(load)}>Revoke</button>
                      <button className="ui-button-secondary" onClick={() => adminFetch(`/admin/auth/users/${user.uuid || user.id}/send-reset`, { method: 'POST' }).then(load)}>Reset</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      {section === 'codes' ? (
        <section className="space-y-5">
          <form onSubmit={createCode} className="ui-card grid gap-3 p-4 md:grid-cols-5">
            <input name="label" placeholder="Label" />
            <select name="role" defaultValue="user"><option value="user">user</option><option value="moderator">moderator</option><option value="admin">admin</option></select>
            <input name="max_uses" type="number" min="1" placeholder="Max uses" />
            <input name="expires_at" type="datetime-local" />
            <button className="ui-button-primary">Create</button>
          </form>
          {(data.codes || []).map((code: any) => (
            <div key={code.id || code.code} className="ui-card-subtle flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold">{code.label || code.template_name || 'Untitled code'}</p>
                <p className="text-xs text-[var(--text-secondary)]">role {code.role} · used {code.used_count || 0}/{code.max_uses || '∞'} · expires {code.expires_at || 'never'}</p>
              </div>
              <button className="ui-button-secondary" onClick={() => adminFetch(`/admin/auth/register-codes/${code.id || code.code}/disable`, { method: 'POST' }).then(load)} disabled={!!code.disabled_at}>Disable</button>
            </div>
          ))}
        </section>
      ) : null}

      {section === 'rules' ? <pre className="ui-card-subtle overflow-auto p-4 text-xs">{JSON.stringify(data, null, 2)}</pre> : null}
      {section === 'logs' ? <pre className="ui-card-subtle max-h-[560px] overflow-auto p-4 text-xs">{JSON.stringify(data.logs || [], null, 2)}</pre> : null}
      {section === 'emails' ? <pre className="ui-card-subtle max-h-[560px] overflow-auto p-4 text-xs">{JSON.stringify(data.jobs || [], null, 2)}</pre> : null}
    </WideFrame>
  );
}
