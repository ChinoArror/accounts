import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Github,
  Link2,
  ImagePlus,
  KeyRound,
  LogOut,
  Mail,
  MailCheck,
  MonitorSmartphone,
  Pencil,
  Shield,
  TicketCheck,
  Trash2,
  X,
} from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import DatePicker from './DatePicker';
import { openRegisterCodeDetails, type RegisterCodeRecord } from './RegisterCodeManager';
import { ThemeToggle, useThemeMode } from './theme';
import { adminRequest } from './adminSessionClient';

type UserRecord = {
  uuid: string;
  id?: string;
  username: string;
  name: string;
  email?: string | null;
  email_verified?: number;
  role?: string;
  status?: string;
  auth_provider?: string;
  password_plain?: string | null;
  cookie_expiry_days?: number;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string | null;
  github_id?: string | null;
  birthday?: string | null;
  avatar_url?: string | null;
};

type SessionRecord = {
  id: string;
  user_agent?: string;
  ip_address?: string;
  browser?: string;
  device_type?: string;
  app_id?: string;
  created_at: string;
  expires_at: string;
  revoked_at?: string | null;
};

type DetailPayload = {
  user: UserRecord;
  sessions: SessionRecord[];
  register_codes: RegisterCodeRecord[];
  oauth_bindings: OAuthBinding[];
};

type OAuthBinding = { provider: 'github' | 'google'; provider_subject: string; provider_email?: string | null; provider_username?: string | null; linked_at: string };

type ModalName = 'edit' | 'password' | 'oauth' | null;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read avatar image'));
    reader.readAsDataURL(file);
  });
}

function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function useBodyScrollLock() {
  React.useLayoutEffect(() => {
    const scrollY = window.scrollY;
    const previous = {
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      bodyWidth: document.body.style.width,
      htmlOverflow: document.documentElement.style.overflow,
    };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.position = previous.bodyPosition;
      document.body.style.top = previous.bodyTop;
      document.body.style.width = previous.bodyWidth;
      document.documentElement.style.overflow = previous.htmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, []);
}

function AdminModal({
  title,
  compact = false,
  onClose,
  children,
}: {
  title: string;
  compact?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useBodyScrollLock();
  const theme = document.documentElement.dataset.theme || 'light';
  return createPortal(
    <motion.div
      data-theme={theme}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="dashboard-theme fixed inset-0 z-[2147483647] flex items-end justify-center overscroll-none bg-black/45 backdrop-blur-sm md:items-center md:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ y: 28, opacity: 0, scale: 0.99 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.99 }}
        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        className={[
          'relative w-full overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-overlay)]',
          compact
            ? 'max-h-[88dvh] rounded-t-[1.75rem] rounded-b-[1.25rem] md:max-w-lg md:rounded-[var(--radius-xl)]'
            : 'h-dvh rounded-none md:h-auto md:max-h-[92dvh] md:max-w-2xl md:rounded-[var(--radius-xl)]',
        ].join(' ')}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="ui-icon-button absolute right-4 top-4 z-20 rounded-full bg-[var(--surface)] shadow-lg"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className={`ui-modal-scroll touch-pan-y overscroll-contain overflow-y-auto p-5 pb-7 pt-16 sm:p-6 sm:pt-16 ${compact ? 'max-h-[88dvh]' : 'h-dvh md:h-auto md:max-h-[92dvh]'}`}>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h2>
          <div className="mt-6">{children}</div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export default function UserProfile({ usernameOverride }: { usernameOverride?: string }) {
  const params = useParams();
  const username = usernameOverride || params.username || '';
  const { theme, setTheme } = useThemeMode('light');
  const [user, setUser] = React.useState<UserRecord | null>(null);
  const [detail, setDetail] = React.useState<DetailPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; tone: 'success' | 'danger' } | null>(null);
  const [modal, setModal] = React.useState<ModalName>(null);
  const [editInfo, setEditInfo] = React.useState({ name: '', cookie_expiry_days: 7, birthday: '' });
  const [avatarData, setAvatarData] = React.useState<string | undefined>(undefined);
  const [avatarPreview, setAvatarPreview] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [showPasswordInput, setShowPasswordInput] = React.useState(false);
  const [showPlainPassword, setShowPlainPassword] = React.useState(false);
  const [isLogged, setIsLogged] = React.useState(true);
  const [unlinkProvider, setUnlinkProvider] = React.useState<'github' | 'google' | null>(null);

  const adminFetch = React.useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await adminRequest(path, options);
    if (response.status === 401) {
      localStorage.removeItem('sso_admin_auth');
      setIsLogged(false);
      window.location.replace('/login');
    }
    return response;
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const usersResponse = await adminFetch('/admin/users');
      if (!usersResponse.ok) throw new Error('Unable to load user');
      const users = await usersResponse.json();
      const selected = users.find((item: UserRecord) => item.username.toLowerCase() === username.toLowerCase());
      if (!selected) {
        setNotFound(true);
        return;
      }
      const detailResponse = await adminFetch(`/admin/auth/users/${encodeURIComponent(selected.uuid)}/detail`);
      const detailData = await detailResponse.json();
      if (!detailResponse.ok) throw new Error(detailData.error || 'Unable to load user details');
      const mergedUser = { ...detailData.user, ...selected };
      setUser(mergedUser);
      setDetail({ ...detailData, user: mergedUser });
      setEditInfo({
        name: mergedUser.name || '',
        cookie_expiry_days: Number(mergedUser.cookie_expiry_days || 7),
        birthday: mergedUser.birthday || '',
      });
      setAvatarPreview(mergedUser.avatar_url || '');
      setAvatarData(undefined);
      setNotFound(false);
    } catch (error: any) {
      setMessage({ text: error.message || 'Unable to load user details', tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [adminFetch, username]);

  React.useEffect(() => {
    if (isLogged) void load();
  }, [isLogged, load]);

  if (!isLogged) return <Navigate to="/login" replace />;

  const notify = (text: string, tone: 'success' | 'danger' = 'success') => {
    setMessage({ text, tone });
    window.setTimeout(() => setMessage(null), 3200);
  };

  const beginOauthBinding = async (provider: 'github' | 'google') => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const response = await adminFetch(`/admin/users/${encodeURIComponent(user.uuid)}/oauth-bind-token`, {
        method: 'POST', body: JSON.stringify({ provider }),
      });
      const data = await response.json();
      if (!response.ok || !data.authorize_url) throw new Error(data.error || 'Unable to start binding');
      window.location.assign(data.authorize_url);
    } catch (error: any) {
      notify(error.message || 'Unable to start binding', 'danger');
      setBusy(false);
    }
  };

  const removeOauthBinding = async () => {
    if (!user || !unlinkProvider || busy) return;
    setBusy(true);
    try {
      const response = await adminFetch(`/admin/users/${encodeURIComponent(user.uuid)}/oauth-bindings/${unlinkProvider}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to remove account');
      setUnlinkProvider(null);
      await load();
      notify('Account unlinked. The user email is unchanged.');
    } catch (error: any) {
      notify(error.message || 'Unable to remove account', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const saveInfo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        ...editInfo,
        username: user.username,
        birthday: editInfo.birthday || null,
      };
      if (avatarData !== undefined) body.avatar_data = avatarData;
      const response = await adminFetch(`/admin/users/${encodeURIComponent(user.uuid)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update user');
      setModal(null);
      await load();
      notify('User information updated.');
    } catch (error: any) {
      notify(error.message || 'Unable to update user', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !newPassword) return;
    setBusy(true);
    try {
      const response = await adminFetch(`/admin/users/${encodeURIComponent(user.uuid)}/password`, {
        method: 'PUT',
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to overwrite password');
      setNewPassword('');
      setModal(null);
      await load();
      notify('Password overwritten and active sessions revoked.');
    } catch (error: any) {
      notify(error.message || 'Unable to overwrite password', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const verifyEmail = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const response = await adminFetch(`/admin/auth/users/${encodeURIComponent(user.uuid)}/verify-email`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to verify email');
      await load();
      notify(data.already_verified ? 'Email was already verified.' : 'Email verified. Welcome email queued.');
    } catch (error: any) {
      notify(error.message || 'Unable to verify email', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const revokeSession = async (sessionId?: string) => {
    if (!user) return;
    setBusy(true);
    try {
      const path = sessionId
        ? `/admin/auth/users/${encodeURIComponent(user.uuid)}/sessions/${encodeURIComponent(sessionId)}/revoke`
        : `/admin/auth/users/${encodeURIComponent(user.uuid)}/revoke-sessions`;
      const response = await adminFetch(path, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to sign out device');
      await load();
      notify(sessionId ? 'Device signed out.' : 'All devices signed out.');
    } catch (error: any) {
      notify(error.message || 'Unable to sign out device', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const handleAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAvatarData(dataUrl);
      setAvatarPreview(dataUrl);
    } catch (error: any) {
      notify(error.message || 'Unable to read avatar image', 'danger');
    }
  };

  if (loading) {
    return (
      <div data-theme={theme} className="dashboard-theme fixed inset-0 grid place-items-center bg-[var(--bg)]">
        <div className="text-sm font-medium text-[var(--text-secondary)]">Loading user details...</div>
      </div>
    );
  }

  if (notFound || !user) {
    return (
      <div data-theme={theme} className="dashboard-theme fixed inset-0 grid place-items-center bg-[var(--bg)] p-4">
        <div className="ui-card w-full max-w-sm p-6 text-center">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">User not found</h1>
          <Link to="/dash" className="ui-button-primary mt-5 inline-flex items-center gap-2 no-underline">
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const emailState = !user.email ? 'Unbound' : Number(user.email_verified || 0) === 1 ? 'Verified' : 'Verifying';
  const activeSessions = (detail?.sessions || []).filter((session) => !session.revoked_at && Date.parse(session.expires_at) > Date.now());

  return (
    <div data-theme={theme} className="dashboard-theme min-h-dvh bg-[var(--bg)] text-[var(--text-primary)]">
      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 md:py-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <Link to="/dash" className="ui-button-secondary inline-flex items-center gap-2 no-underline">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <ThemeToggle theme={theme} onChange={setTheme} />
        </div>

        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="ui-page-header p-5 sm:p-6"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover shadow-[var(--shadow-card)]" />
            ) : (
              <div className="ui-logo-badge h-20 w-20 shrink-0 text-2xl font-bold">{user.name?.[0]?.toUpperCase() || '?'}</div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-2xl font-bold sm:text-3xl">{user.name}</h1>
                <span className="rounded-full bg-[var(--surface-alt)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">{user.status || 'active'}</span>
                <span className="rounded-full bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface))] px-3 py-1 text-xs font-semibold text-[var(--primary)]">{user.role || 'user'}</span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">@{user.username}</p>
              <p className="mt-2 break-all font-mono text-xs text-[var(--text-tertiary)]">{user.uuid}</p>
            </div>
          </div>
        </motion.header>

        {message ? (
          <div
            className="mt-4 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium"
            style={{
              borderColor: `color-mix(in srgb, var(--${message.tone === 'success' ? 'success' : 'danger'}) 34%, var(--border))`,
              color: `var(--${message.tone === 'success' ? 'success' : 'danger'})`,
              background: `color-mix(in srgb, var(--${message.tone === 'success' ? 'success' : 'danger'}) 8%, var(--surface))`,
            }}
          >
            {message.text}
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_1.95fr]">
          <div className="space-y-5">
            <section className="ui-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Account</h2>
                <Shield className="h-5 w-5 text-[var(--primary)]" />
              </div>
              <div className="mt-4 grid gap-3">
                <div className="ui-card-subtle p-4">
                  <p className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Provider</p>
                  <p className="mt-2 text-sm font-medium">{user.auth_provider || 'legacy'}</p>
                </div>
                <div className="ui-card-subtle p-4">
                  <p className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Session expiry</p>
                  <p className="mt-2 text-sm font-medium">{user.cookie_expiry_days || 7} days</p>
                </div>
                <div className="ui-card-subtle p-4">
                  <p className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Created</p>
                  <p className="mt-2 text-sm font-medium">{formatDate(user.created_at)}</p>
                </div>
                <div className="ui-card-subtle p-4">
                  <p className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Last login</p>
                  <p className="mt-2 text-sm font-medium">{formatDate(user.last_login_at)}</p>
                </div>
              </div>
            </section>

            <section className="ui-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Password</h2>
                <button type="button" className="ui-icon-button" onClick={() => setShowPlainPassword((value) => !value)} aria-label="Toggle password">
                  {showPlainPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="mt-4 break-all rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 font-mono text-sm">
                {showPlainPassword ? user.password_plain || 'Not recorded' : '••••••••••••'}
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="ui-card p-5">
              <h2 className="font-semibold">Actions</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <button type="button" className="ui-button-primary inline-flex items-center justify-center gap-2" onClick={() => setModal('edit')}>
                  <Pencil className="h-4 w-4" /> Edit information
                </button>
                <button type="button" className="ui-button-secondary inline-flex items-center justify-center gap-2" onClick={() => setModal('password')}>
                  <KeyRound className="h-4 w-4" /> Overwrite password
                </button>
                <button type="button" className="ui-button-secondary inline-flex items-center justify-center gap-2" onClick={() => setModal('oauth')}>
                  <Link2 className="h-4 w-4" /> Bind other account
                </button>
              </div>
            </section>

            <section className="ui-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {emailState === 'Verified' ? <MailCheck className="h-5 w-5 text-[var(--success)]" /> : <Mail className="h-5 w-5 text-[var(--primary)]" />}
                  <h2 className="font-semibold">Email</h2>
                </div>
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    color: emailState === 'Verified' ? 'var(--success)' : emailState === 'Verifying' ? 'var(--warning)' : 'var(--text-secondary)',
                    background: `color-mix(in srgb, ${emailState === 'Verified' ? 'var(--success)' : emailState === 'Verifying' ? 'var(--warning)' : 'var(--text-secondary)'} 10%, var(--surface))`,
                  }}
                >
                  {emailState}
                </span>
              </div>
              <p className="mt-4 break-all text-sm text-[var(--text-secondary)]">{user.email || 'No email bound'}</p>
              {emailState === 'Verifying' ? (
                <button type="button" className="ui-button-primary mt-4 inline-flex items-center gap-2" onClick={verifyEmail} disabled={busy}>
                  <MailCheck className="h-4 w-4" /> Approve verification
                </button>
              ) : null}
            </section>

            <section className="ui-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-5">
                <div className="flex items-center gap-2">
                  <MonitorSmartphone className="h-5 w-5 text-[var(--primary)]" />
                  <h2 className="font-semibold">Signed-in devices</h2>
                  <span className="text-sm text-[var(--text-tertiary)]">{activeSessions.length}</span>
                </div>
                {activeSessions.length ? (
                  <button type="button" className="ui-button-secondary inline-flex items-center gap-2 text-[var(--danger)]" onClick={() => revokeSession()} disabled={busy}>
                    <LogOut className="h-4 w-4" /> Sign out all
                  </button>
                ) : null}
              </div>
              <div className="divide-y divide-[var(--border)]">
                {activeSessions.length ? activeSessions.map((session) => (
                  <div key={session.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{session.browser || session.device_type || 'Device'}</span>
                        <span className="rounded-full bg-[var(--surface-alt)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">{session.app_id || 'auth-center'}</span>
                      </div>
                      <p className="mt-1 break-all text-xs text-[var(--text-secondary)]">{session.ip_address || 'IP unavailable'}</p>
                      <p className="mt-1 text-xs text-[var(--text-tertiary)]">{formatDate(session.created_at)} · expires {formatDate(session.expires_at)}</p>
                    </div>
                    <button type="button" className="ui-button-secondary shrink-0 text-[var(--danger)]" onClick={() => revokeSession(session.id)} disabled={busy}>Force sign out</button>
                  </div>
                )) : (
                  <div className="p-5 text-sm text-[var(--text-secondary)]">No active devices.</div>
                )}
              </div>
            </section>

            <section className="ui-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--border)] p-5">
                <TicketCheck className="h-5 w-5 text-[var(--primary)]" />
                <h2 className="font-semibold">Register code usage</h2>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {detail?.register_codes?.length ? detail.register_codes.map((record) => (
                  <div key={`${record.code}-${record.used_at}`} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-sm font-semibold">{record.code}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{formatDate(record.used_at)} · {record.country_code || 'Unknown country'}</p>
                    </div>
                    <button type="button" className="ui-button-secondary shrink-0" onClick={() => openRegisterCodeDetails(record)}>Details</button>
                  </div>
                )) : (
                  <div className="p-5 text-sm text-[var(--text-secondary)]">No register code used.</div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      <AnimatePresence mode="wait">
        {modal === 'edit' ? (
          <AdminModal title="Edit information" onClose={() => setModal(null)}>
            <form onSubmit={saveInfo} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Full name</label>
                <input required value={editInfo.name} onChange={(event) => setEditInfo((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Session expiry days</label>
                <input type="number" min={1} required value={editInfo.cookie_expiry_days} onChange={(event) => setEditInfo((current) => ({ ...current, cookie_expiry_days: Number(event.target.value) }))} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Birthday</label>
                <DatePicker value={editInfo.birthday} onChange={(birthday) => setEditInfo((current) => ({ ...current, birthday }))} />
              </div>
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Avatar</label>
                <div className="ui-card-subtle flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                  ) : (
                    <div className="ui-logo-badge h-16 w-16 text-lg font-bold">{editInfo.name?.[0]?.toUpperCase() || '?'}</div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <label className="ui-button-secondary inline-flex cursor-pointer items-center gap-2">
                      <ImagePlus className="h-4 w-4" /> Upload
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                    </label>
                    <button type="button" className="ui-button-secondary inline-flex items-center gap-2 text-[var(--danger)]" onClick={() => {
                      setAvatarData('');
                      setAvatarPreview('');
                    }}>
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  </div>
                </div>
              </div>
              <button className="ui-button-primary w-full" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
            </form>
          </AdminModal>
        ) : null}

        {modal === 'password' ? (
          <AdminModal title="Overwrite password" compact onClose={() => setModal(null)}>
            <form onSubmit={savePassword} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">New password</label>
                <div className="relative">
                  <input
                    type={showPasswordInput ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="pr-12"
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[var(--text-secondary)]" onClick={() => setShowPasswordInput((value) => !value)}>
                    {showPasswordInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button className="ui-button-primary w-full" disabled={busy}>{busy ? 'Saving...' : 'Save password'}</button>
            </form>
          </AdminModal>
        ) : null}

        {modal === 'oauth' && !unlinkProvider ? (
          <AdminModal title="Bind other account" compact onClose={() => setModal(null)}>
            <div className="grid gap-3">
              {(['google', 'github'] as const).map((provider) => {
                const linked = detail?.oauth_bindings?.find((item) => item.provider === provider);
                return linked ? (
                  <div key={provider} className="ui-card-subtle min-w-0 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{provider === 'google' ? 'Google' : 'GitHub'}</p>
                      <button type="button" className="ui-icon-button shrink-0 text-[var(--danger)]" onClick={() => setUnlinkProvider(provider)} aria-label={`Unlink ${provider}`} title={`Unlink ${provider}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <p className="mt-2 break-all text-sm text-[var(--text-secondary)]">{provider === 'google'
                      ? linked.provider_email || (user?.email ? `Account email: ${user.email}` : 'Google email not recorded')
                      : linked.provider_username ? `@${linked.provider_username}` : 'GitHub username not recorded'}</p>
                    <p className="mt-2 break-all font-mono text-xs text-[var(--text-tertiary)]">Provider ID: {linked.provider_subject}</p>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">Linked: {formatDate(linked.linked_at)}</p>
                  </div>
                ) : (
                  <button key={provider} type="button" className="ui-button-secondary flex items-center justify-center gap-2" disabled={busy} onClick={() => void beginOauthBinding(provider)}>
                    {provider === 'github' ? <Github className="h-4 w-4" /> : <span className="font-bold">G</span>} Continue with {provider === 'github' ? 'GitHub' : 'Google'}
                  </button>
                );
              })}
            </div>
          </AdminModal>
        ) : null}
        {modal === 'oauth' && unlinkProvider ? (
          <AdminModal title={`Unlink ${unlinkProvider === 'google' ? 'Google' : 'GitHub'}?`} compact onClose={() => setUnlinkProvider(null)}>
            <p className="mb-6 text-sm text-[var(--text-secondary)]">Remove this sign-in method for {user?.username}? The account email remains unchanged.</p>
            <div className="flex gap-3">
              <button type="button" className="ui-button-secondary flex-1" onClick={() => setUnlinkProvider(null)}>Cancel</button>
              <button type="button" className="ui-button-danger flex-1" disabled={busy} onClick={() => void removeOauthBinding()}>{busy ? 'Removing...' : 'Unlink account'}</button>
            </div>
          </AdminModal>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
