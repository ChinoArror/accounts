import React from 'react';
import { Activity, LogOut, Shield } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle, useThemeMode } from './theme';

export const API_BASE = '';

export type ActiveUserSession = {
  session_id: string;
  uuid: string;
  username: string;
  name: string;
  email?: string | null;
  email_verified?: boolean;
  role?: string;
  auth_provider?: string;
  birthday?: string | null;
  avatar_url?: string | null;
  exp: number;
  session?: {
    session_id: string;
    login_at: string;
    ip_address: string | null;
    browser: string | null;
    device_type: string | null;
    app_id: string | null;
    expires_at: string;
    revoked_at: string | null;
  };
};

export function sanitizeRedirectPath(input?: string | null, fallback = '/') {
  if (!input) return fallback;
  if (!input.startsWith('/') || input.startsWith('//')) return fallback;
  return input;
}

export function buildUserLoginPath(redirectPath?: string | null) {
  const safeRedirect = sanitizeRedirectPath(redirectPath, '');
  return safeRedirect ? `/login?redirect=${encodeURIComponent(safeRedirect)}` : '/login';
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export async function logoutUser() {
  await fetch(`${API_BASE}/api/logout`, { method: 'POST' });
}

export function useRequiredUserSession(expectedUuid?: string | null) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = React.useState<ActiveUserSession | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/user/session`);
        if (!res.ok) {
          if (!cancelled) {
            navigate(buildUserLoginPath(`${location.pathname}${location.search}${location.hash}`), { replace: true });
          }
          return;
        }

        const data: ActiveUserSession = await res.json();
        if (expectedUuid && data.uuid !== expectedUuid) {
          if (!cancelled) navigate(`/user/${data.uuid}`, { replace: true });
          return;
        }

        if (!cancelled) setSession(data);
      } catch {
        if (!cancelled) {
          navigate(buildUserLoginPath(`${location.pathname}${location.search}${location.hash}`), { replace: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [expectedUuid, location.hash, location.pathname, location.search, navigate]);

  return { session, loading, setSession };
}

export function UserPortalScaffold({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { theme, setTheme } = useThemeMode('dark');

  return (
    <div data-theme={theme} className="dashboard-theme min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-5xl p-4 md:p-8">
        <div className="ui-page-header mb-6 flex flex-col gap-4 p-5 md:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="ui-logo-badge">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1 text-[12px] font-semibold text-[var(--text-secondary)]">
                <Activity className="w-3.5 h-3.5 text-[var(--primary)]" />
                User workspace
              </div>
              <h1 className="mt-3 text-2xl font-bold text-[var(--text-primary)] md:text-3xl">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)] md:text-base">{description}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle theme={theme} onChange={setTheme} />
            {actions}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function UserPortalLoading({ label = 'Loading your workspace...' }: { label?: string }) {
  return (
    <div className="ui-card p-6 text-sm text-[var(--text-secondary)]">
      <div className="flex items-center gap-3">
        <Activity className="h-4 w-4 animate-spin text-[var(--primary)]" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function UserLogoutButton({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logoutUser();
    onDone?.();
    navigate('/users', { replace: true });
  };

  return (
    <button type="button" className="ui-button-secondary inline-flex items-center gap-2" onClick={handleLogout}>
      <LogOut className="w-4 h-4" />
      Sign Out
    </button>
  );
}
