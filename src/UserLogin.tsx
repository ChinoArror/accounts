import React from 'react';
import { motion } from 'motion/react';
import { KeyRound, Shield, User } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle, useThemeMode } from './theme';
import { API_BASE, sanitizeRedirectPath } from './userPortal';

export default function UserLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useThemeMode('dark');
  const [form, setForm] = React.useState({ username: '', password: '' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const searchParams = new URLSearchParams(location.search);
  const redirectTarget = sanitizeRedirectPath(searchParams.get('redirect'), '');
  const registered = searchParams.get('registered') === '1';

  React.useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      const res = await fetch(`${API_BASE}/api/user/session`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      navigate(redirectTarget || `/${data.uuid}`, { replace: true });
    };

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [navigate, redirectTarget]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          redirect_to: redirectTarget || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to sign in');
        return;
      }

      navigate(data.redirect_to || redirectTarget || `/${data.uuid}`, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-theme={theme} className="dashboard-theme min-h-screen bg-[var(--bg)]">
      <div className="ui-auth-shell">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <ThemeToggle theme={theme} onChange={setTheme} />
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="ui-auth-card relative"
        >
          <div className="mb-6 flex justify-center">
            <div className="ui-logo-badge">
              <User className="h-7 w-7" />
            </div>
          </div>
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1 text-[12px] font-semibold text-[var(--text-secondary)]">
              <KeyRound className="h-3.5 w-3.5 text-[var(--primary)]" />
              Password-only user access
            </div>
            <h2 className="mt-4 text-[28px] font-bold leading-tight text-[var(--text-primary)]">User Sign In</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Continue with your username and password to manage bindings, passkeys, sessions, and password updates.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {registered ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)]">
                Your account was created successfully. Sign in with your new credentials.
              </div>
            ) : null}
            {error ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm text-[var(--danger)]">
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Username</label>
              <input
                type="text"
                required
                autoComplete="username"
                placeholder="Your username"
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="Your password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              />
            </div>

            <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} className="ui-button-primary mt-2 w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Continue'}
            </motion.button>
          </form>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link to="/register" className="ui-button-secondary inline-flex w-full items-center justify-center gap-2 no-underline">
              Register
            </Link>
            <div className="ui-card-subtle w-full p-4">
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-4 w-4 text-[var(--primary)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">What happens next</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    After sign-in, you will return to your requested self-service page or your account hub. Admin accounts cannot log in here.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
