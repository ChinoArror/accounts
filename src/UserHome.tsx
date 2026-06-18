import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Github,
  ImagePlus,
  KeyRound,
  LockKeyhole,
  LogOut,
  Mail,
  MonitorSmartphone,
  RefreshCw,
  Settings2,
  Shield,
  Ticket,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ThemeToggle, useThemeMode } from './theme';
import { API_BASE, formatDateTime, useRequiredUserSession } from './userPortal';

type ModalKind = 'profile' | 'email' | 'password' | 'code' | 'sessions' | null;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2.5 text-sm font-medium text-[var(--text-primary)]">
      <span className="block">{label}</span>
      {children}
    </label>
  );
}

function Notice({ children, tone = 'normal' }: { children: React.ReactNode; tone?: 'normal' | 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'text-[var(--danger)]' : tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]';
  return <div className={`rounded-[12px] border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm ${color}`}>{children}</div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex overscroll-contain bg-[var(--overlay)] p-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onTouchMove={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        className="ui-auth-card mt-auto max-h-[92dvh] w-full max-w-[520px] overflow-y-auto overscroll-contain p-5 sm:mt-0 sm:p-6"
        onTouchMove={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Account Center</p>
            <h2 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="ui-icon-button shrink-0" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read image file'));
    reader.readAsDataURL(file);
  });
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
      return;
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

export default function UserHome() {
  const { uuid } = useParams();
  const navigate = useNavigate();
  const { theme, setTheme } = useThemeMode('light');
  const { session, loading, setSession } = useRequiredUserSession(uuid);
  const [modal, setModal] = React.useState<ModalKind>(null);
  const [message, setMessage] = React.useState('');
  const [rules, setRules] = React.useState<any>(null);
  const [sessions, setSessions] = React.useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = React.useState('');
  const [profileForm, setProfileForm] = React.useState({ name: '', birthday: '', avatar_data: undefined as string | undefined });
  const [emailForm, setEmailForm] = React.useState({ new_email: '', password: '', turnstile: '' });
  const [emailTurnstileReset, setEmailTurnstileReset] = React.useState(0);
  const [passwordForm, setPasswordForm] = React.useState({ newPassword: '', confirm: '' });
  const [registerCode, setRegisterCode] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetch(`${API_BASE}/api/auth/registration/rules`)
      .then((res) => res.json())
      .then((data) => setRules(data.rules))
      .catch(() => null);
  }, []);

  React.useEffect(() => {
    if (!session) return;
    setProfileForm({ name: session.name || session.username, birthday: session.birthday || '', avatar_data: undefined });
  }, [session]);

  const loadSessions = React.useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/account/sessions`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    setSessions(data.sessions || []);
    setCurrentSessionId(data.current_session_id || '');
  }, []);

  React.useEffect(() => {
    if (session) void loadSessions();
  }, [session, loadSessions]);

  React.useEffect(() => {
    if (!modal || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [modal]);

  const apiPost = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || data.message || 'Request failed');
    return data;
  };

  const updateProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/user/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: profileForm.name,
          birthday: profileForm.birthday || null,
          avatar_data: profileForm.avatar_data,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to update profile');
      setSession((current) => current ? { ...current, ...data.user } : current);
      setMessage('Profile updated.');
      setModal(null);
    } catch (error: any) {
      setMessage(error.message);
      setEmailForm((current) => ({ ...current, turnstile: '' }));
      setEmailTurnstileReset((value) => value + 1);
    } finally {
      setSaving(false);
    }
  };

  const updateEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const data = await apiPost('/api/account/email/change/request', {
        new_email: emailForm.new_email,
        password: emailForm.password,
        turnstile_token: emailForm.turnstile,
      });
      setMessage(data.message || 'Confirmation email sent.');
      setModal(null);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirm) {
      setMessage('Passwords do not match.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const data = await apiPost('/api/user/change-password', { newPassword: passwordForm.newPassword });
      setMessage(data.message || 'Password updated.');
      setPasswordForm({ newPassword: '', confirm: '' });
      setModal(null);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const applyRegisterCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const data = await apiPost('/api/account/register-code/apply', { register_code: registerCode });
      setMessage(data.message || 'Register code applied.');
      setRegisterCode('');
      setModal(null);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    await apiPost('/api/account/sessions/revoke', { session_id: sessionId });
    await loadSessions();
  };

  const signOutAll = async () => {
    await apiPost('/api/account/sessions/revoke-all', {});
    await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' }).catch(() => null);
    navigate('/login', { replace: true });
  };

  const signOut = async () => {
    await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' });
    navigate('/login', { replace: true });
  };

  const actions = [
    { key: 'profile', title: 'Edit Info', icon: Settings2, onClick: () => setModal('profile') },
    { key: 'email', title: session?.email ? 'Change Email' : 'Bind Email', icon: Mail, onClick: () => setModal('email') },
    { key: 'password', title: 'Change Password', icon: LockKeyhole, onClick: () => setModal('password') },
    { key: 'code', title: 'Apply Register Code', icon: Ticket, onClick: () => setModal('code') },
    { key: 'sessions', title: 'Login Devices', icon: MonitorSmartphone, onClick: () => setModal('sessions') },
  ];

  return (
    <div data-theme={theme} className="dashboard-theme min-h-dvh bg-[var(--bg)] text-[var(--text-primary)]">
      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 md:py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="ui-logo-badge h-11 w-11 shrink-0">
              <Shield className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Account Center</p>
              <h1 className="truncate text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">User Details</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} onChange={setTheme} />
            <button type="button" onClick={signOut} className="ui-button-secondary inline-flex items-center justify-center gap-2">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </header>

        {loading || !session ? (
          <div className="ui-card p-6 text-sm text-[var(--text-secondary)]">Loading your account...</div>
        ) : (
          <div className="space-y-5 md:space-y-6">
            {message ? <Notice tone="success">{message}</Notice> : null}

            <section className="ui-card p-5 md:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                {session.avatar_url ? (
                  <img src={session.avatar_url} alt={`${session.name || session.username} avatar`} className="h-20 w-20 rounded-[20px] object-cover shadow-md" />
                ) : (
                  <div className="ui-logo-badge h-20 w-20 shrink-0 rounded-[20px] text-3xl font-bold">
                    {(session.name || session.username || '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="truncate text-2xl font-bold text-[var(--text-primary)]">{session.name || session.username}</h2>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">@{session.username}</p>
                      <p className="mt-2 break-all font-mono text-xs text-[var(--text-tertiary)]">{session.uuid}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">{session.role || 'user'}</span>
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">{session.auth_provider || 'legacy'}</span>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="ui-card-subtle p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Email</p>
                      <p className="mt-2 break-all text-sm font-semibold text-[var(--text-primary)]">{session.email || 'Not bound'}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{session.email_verified ? 'Verified' : 'Not verified'}</p>
                    </div>
                    <div className="ui-card-subtle p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Birthday</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{session.birthday || 'Not set'}</p>
                    </div>
                    <div className="ui-card-subtle p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Session</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{formatDateTime(session.session?.login_at)}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">Expires {formatDateTime(session.session?.expires_at)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {!session.email ? <Notice>This account has no email bound. Binding an email helps with password recovery.</Notice> : null}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {actions.map((action, index) => (
                <motion.button
                  type="button"
                  key={action.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.035 }}
                  onClick={action.onClick}
                  className="ui-card-subtle min-h-[112px] p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--primary)]"
                >
                  <span className="ui-logo-badge mb-4 h-10 w-10 rounded-[12px]">
                    <action.icon className="h-5 w-5" />
                  </span>
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">{action.title}</span>
                </motion.button>
              ))}
              <Link to={`/${session.uuid}/sso-binding`} className="ui-card-subtle min-h-[112px] p-4 text-left no-underline transition hover:-translate-y-0.5 hover:border-[var(--primary)]">
                <span className="ui-logo-badge mb-4 h-10 w-10 rounded-[12px]">
                  <Github className="h-5 w-5" />
                </span>
                <span className="block text-sm font-semibold text-[var(--text-primary)]">Bind GitHub</span>
              </Link>
              <Link to={`/${session.uuid}/passkey`} className="ui-card-subtle min-h-[112px] p-4 text-left no-underline transition hover:-translate-y-0.5 hover:border-[var(--primary)]">
                <span className="ui-logo-badge mb-4 h-10 w-10 rounded-[12px]">
                  <KeyRound className="h-5 w-5" />
                </span>
                <span className="block text-sm font-semibold text-[var(--text-primary)]">Passkeys</span>
              </Link>
            </section>
          </div>
        )}
      </main>

      <AnimatePresence>
        {modal === 'profile' && session ? (
          <Modal title="Edit Info" onClose={() => setModal(null)}>
            <form onSubmit={updateProfile} className="space-y-5">
              <Field label="Full name">
                <input value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} required />
              </Field>
              <Field label="Birthday">
                <input type="date" value={profileForm.birthday} onChange={(event) => setProfileForm({ ...profileForm, birthday: event.target.value })} />
              </Field>
              <Field label="Avatar">
                <label className="ui-card-subtle flex cursor-pointer items-center justify-center gap-2 px-4 py-4 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--primary)]">
                  <ImagePlus className="h-4 w-4" /> Upload avatar
                  <input className="hidden" type="file" accept="image/*" onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setProfileForm({ ...profileForm, avatar_data: await readFileAsDataUrl(file) });
                  }} />
                </label>
              </Field>
              <button className="ui-button-primary w-full" disabled={saving}>{saving ? 'Saving...' : 'Save Info'}</button>
            </form>
          </Modal>
        ) : null}

        {modal === 'email' ? (
          <Modal title="Change Email" onClose={() => setModal(null)}>
            <form onSubmit={updateEmail} className="space-y-5">
              <Field label="New email">
                <input type="email" value={emailForm.new_email} onChange={(event) => setEmailForm({ ...emailForm, new_email: event.target.value })} required />
              </Field>
              <Field label="Current password">
                <input type="password" value={emailForm.password} onChange={(event) => setEmailForm({ ...emailForm, password: event.target.value })} required />
              </Field>
              <TurnstileBox siteKey={rules?.turnstile_site_key} onToken={(token) => setEmailForm((current) => ({ ...current, turnstile: token }))} resetSignal={emailTurnstileReset} />
              <button className="ui-button-primary w-full" disabled={saving || !emailForm.turnstile}>{saving ? 'Sending...' : 'Send Confirmation'}</button>
            </form>
          </Modal>
        ) : null}

        {modal === 'password' ? (
          <Modal title="Change Password" onClose={() => setModal(null)}>
            <form onSubmit={updatePassword} className="space-y-5">
              <Field label="New password">
                <input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} required />
              </Field>
              <Field label="Confirm password">
                <input type="password" value={passwordForm.confirm} onChange={(event) => setPasswordForm({ ...passwordForm, confirm: event.target.value })} required />
              </Field>
              <button className="ui-button-primary w-full" disabled={saving}>{saving ? 'Saving...' : 'Save Password'}</button>
            </form>
          </Modal>
        ) : null}

        {modal === 'code' ? (
          <Modal title="Apply Register Code" onClose={() => setModal(null)}>
            <form onSubmit={applyRegisterCode} className="space-y-5">
              <Field label="Register code">
                <input value={registerCode} onChange={(event) => setRegisterCode(event.target.value)} required />
              </Field>
              <button className="ui-button-primary w-full" disabled={saving}>{saving ? 'Applying...' : 'Apply Code'}</button>
            </form>
          </Modal>
        ) : null}

        {modal === 'sessions' ? (
          <Modal title="Login Devices" onClose={() => setModal(null)}>
            <div className="space-y-3">
              {sessions.length === 0 ? (
                <div className="ui-card-subtle p-4 text-sm text-[var(--text-secondary)]">No sessions.</div>
              ) : sessions.map((item) => (
                <div key={item.id} className="ui-card-subtle min-w-0 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                        <MonitorSmartphone className="h-4 w-4 text-[var(--primary)]" /> {item.id === currentSessionId ? 'Current device' : 'Signed-in device'}
                      </p>
                      <p className="mt-1 break-words text-xs text-[var(--text-secondary)] [overflow-wrap:anywhere]">{item.user_agent || 'Unknown user agent'}</p>
                      <div className="mt-2 grid min-w-0 gap-1 text-xs text-[var(--text-tertiary)]">
                        <p className="min-w-0 break-all [overflow-wrap:anywhere]">IP hash: {item.ip_hash || 'N/A'}</p>
                        <p className="min-w-0 break-all [overflow-wrap:anywhere]">App ID: {item.app_id || 'auth-center'}</p>
                        <p>{formatDateTime(item.created_at)}</p>
                      </div>
                    </div>
                    <button type="button" className="ui-button-secondary shrink-0" onClick={() => revokeSession(item.id)} disabled={!!item.revoked_at}>
                      Sign out
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={loadSessions} className="ui-button-secondary inline-flex w-full items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button type="button" onClick={signOutAll} className="ui-button-primary inline-flex w-full items-center justify-center gap-2">
                <LogOut className="h-4 w-4" /> Sign out all devices
              </button>
            </div>
          </Modal>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
