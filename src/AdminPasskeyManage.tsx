import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Edit2, Key, LogOut, Shield, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { startRegistration } from '@simplewebauthn/browser';
import { ThemeToggle, useThemeMode } from './theme';

const API_BASE = '';

type PasskeyItem = {
  id: string;
  name: string;
  created_at: string;
};

export default function AdminPasskeyManage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useThemeMode('dark');
  const [authHeader] = React.useState(() => localStorage.getItem('sso_admin_auth') || '');
  const [bindToken, setBindToken] = React.useState('');
  const [passkeys, setPasskeys] = React.useState<PasskeyItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingKeys, setLoadingKeys] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const logoutAdmin = React.useCallback(() => {
    localStorage.removeItem('sso_admin_auth');
    localStorage.removeItem('sso_admin_name');
    navigate('/', { replace: true });
  }, [navigate]);

  const fetchBindToken = React.useCallback(async () => {
    if (!authHeader) {
      logoutAdmin();
      throw new Error('Admin login required');
    }

    const res = await fetch(`${API_BASE}/admin/bind-token`, {
      method: 'POST',
      headers: { Authorization: authHeader },
    });

    if (!res.ok) {
      logoutAdmin();
      throw new Error('Admin login expired');
    }

    const data = await res.json();
    setBindToken(data.bind_token);
    return data.bind_token as string;
  }, [authHeader, logoutAdmin]);

  const authFetch = React.useCallback(async (path: string, options: RequestInit = {}, retry = true) => {
    const token = bindToken || await fetchBindToken();
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 401 && retry) {
      const refreshedToken = await fetchBindToken();
      return fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
          Authorization: `Bearer ${refreshedToken}`,
        },
      });
    }

    return res;
  }, [bindToken, fetchBindToken]);

  const fetchPasskeys = React.useCallback(async () => {
    setLoadingKeys(true);
    setError('');

    try {
      const res = await authFetch('/api/passkey/admin/list');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to load admin passkeys');
        return;
      }
      setPasskeys(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load admin passkeys');
    } finally {
      setLoadingKeys(false);
    }
  }, [authFetch]);

  React.useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        await fetchBindToken();
        if (!cancelled) {
          await fetchPasskeys();
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Unable to verify admin session');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [fetchBindToken, fetchPasskeys]);

  const addPasskey = async () => {
    if (passkeys.length >= 5) {
      setError('You can only register up to 5 admin passkeys.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const optionsRes = await authFetch('/api/passkey/generate-registration-options', { method: 'POST' });
      const options = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(options.error || 'Unable to start registration');

      const attestation = await startRegistration({ optionsJSON: options });
      const verifyRes = await authFetch('/api/passkey/verify-registration', {
        method: 'POST',
        body: JSON.stringify(attestation),
      });
      const verification = await verifyRes.json();
      if (!verifyRes.ok || !verification.verified) {
        throw new Error(verification.error || 'Passkey registration failed');
      }

      await fetchPasskeys();
    } catch (err: any) {
      setError(err.message || 'Unable to add admin passkey');
    } finally {
      setBusy(false);
    }
  };

  const renamePasskey = async (id: string, currentName: string) => {
    const nextName = window.prompt('Rename admin passkey', currentName);
    if (!nextName) return;

    setBusy(true);
    setError('');

    try {
      const res = await authFetch(`/api/passkey/admin/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: nextName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to rename admin passkey');
        return;
      }
      await fetchPasskeys();
    } catch (err: any) {
      setError(err.message || 'Unable to rename admin passkey');
    } finally {
      setBusy(false);
    }
  };

  const deletePasskey = async (id: string) => {
    if (!window.confirm('Delete this admin passkey?')) return;

    setBusy(true);
    setError('');

    try {
      const res = await authFetch(`/api/passkey/admin/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to delete admin passkey');
        return;
      }
      await fetchPasskeys();
    } catch (err: any) {
      setError(err.message || 'Unable to delete admin passkey');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-theme={theme} className="dashboard-theme min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-5xl p-4 md:p-8">
        <div className="ui-page-header mb-6 flex flex-col gap-4 p-5 md:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="ui-logo-badge">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1 text-[12px] font-semibold text-[var(--text-secondary)]">
                <Key className="h-3.5 w-3.5 text-[var(--primary)]" />
                Admin security
              </div>
              <h1 className="mt-3 text-2xl font-bold text-[var(--text-primary)] md:text-3xl">Admin Passkeys</h1>
              <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)] md:text-base">
                This page uses your existing admin login state and manages only the administrator&apos;s passkeys.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle theme={theme} onChange={setTheme} />
            <Link to="/" className="ui-button-secondary inline-flex items-center gap-2 no-underline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <button type="button" className="ui-button-secondary inline-flex items-center gap-2" onClick={logoutAdmin}>
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-3xl space-y-4">
          <div className="ui-card p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Registered admin passkeys</h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Add up to 5 passkeys tied directly to the administrator account.
                </p>
              </div>
              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} type="button" className="ui-button-primary" disabled={busy || loading} onClick={addPasskey}>
                {busy ? 'Working...' : 'Add Passkey'}
              </motion.button>
            </div>
          </div>

          {error ? <div className="ui-card p-4 text-sm text-[var(--danger)]">{error}</div> : null}

          <div className="ui-card p-6">
            {loading || loadingKeys ? (
              <div className="text-sm text-[var(--text-secondary)]">Loading admin passkeys...</div>
            ) : passkeys.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-6 py-10 text-center">
                <Key className="mx-auto h-10 w-10 text-[var(--text-tertiary)]" />
                <p className="mt-4 text-sm text-[var(--text-secondary)]">No admin passkeys registered yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {passkeys.map((passkey) => (
                  <div key={passkey.id} className="ui-card-subtle flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="ui-logo-badge h-10 w-10">
                        <Key className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{passkey.name}</h3>
                        <p className="text-sm text-[var(--text-secondary)]">Added {new Date(passkey.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="ui-icon-button" onClick={() => renamePasskey(passkey.id, passkey.name)} title="Rename admin passkey">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button type="button" className="ui-icon-button" onClick={() => deletePasskey(passkey.id)} title="Delete admin passkey">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-right text-xs text-[var(--text-tertiary)]">{passkeys.length} / 5 passkeys used</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
