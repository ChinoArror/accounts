import React from 'react';
import { motion } from 'motion/react';
import { Edit2, Key, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { startRegistration } from '@simplewebauthn/browser';
import {
  API_BASE,
  UserLogoutButton,
  UserPortalLoading,
  UserPortalScaffold,
  useRequiredUserSession,
} from './userPortal';

type PasskeyItem = {
  id: string;
  name: string;
  created_at: string;
};

export default function UserPasskeyManage() {
  const { uuid } = useParams();
  const { session, loading } = useRequiredUserSession(uuid);
  const [bindToken, setBindToken] = React.useState('');
  const [passkeys, setPasskeys] = React.useState<PasskeyItem[]>([]);
  const [loadingKeys, setLoadingKeys] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const fetchBindToken = React.useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/user/bind-token`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.bind_token) {
      throw new Error(data.error || 'Unable to authorize passkey management');
    }
    setBindToken(data.bind_token);
    return data.bind_token as string;
  }, []);

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
    if (!uuid) return;
    setLoadingKeys(true);
    setError('');

    try {
      const res = await authFetch(`/api/passkey/${uuid}/list`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to load passkeys');
        return;
      }
      setPasskeys(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load passkeys');
    } finally {
      setLoadingKeys(false);
    }
  }, [authFetch, uuid]);

  React.useEffect(() => {
    if (!session) return;
    void fetchPasskeys();
  }, [fetchPasskeys, session]);

  const addPasskey = async () => {
    if (passkeys.length >= 5) {
      setError('You can only register up to 5 passkeys.');
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
      setError(err.message || 'Unable to add passkey');
    } finally {
      setBusy(false);
    }
  };

  const renamePasskey = async (id: string, currentName: string) => {
    const nextName = window.prompt('Rename passkey', currentName);
    if (!nextName || nextName === currentName || !uuid) return;

    setBusy(true);
    setError('');

    try {
      const res = await authFetch(`/api/passkey/${uuid}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: nextName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to rename passkey');
        return;
      }
      await fetchPasskeys();
    } catch (err: any) {
      setError(err.message || 'Unable to rename passkey');
    } finally {
      setBusy(false);
    }
  };

  const deletePasskey = async (id: string) => {
    if (!uuid || !window.confirm('Delete this passkey?')) return;

    setBusy(true);
    setError('');

    try {
      const res = await authFetch(`/api/passkey/${uuid}/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to delete passkey');
        return;
      }
      await fetchPasskeys();
    } catch (err: any) {
      setError(err.message || 'Unable to delete passkey');
    } finally {
      setBusy(false);
    }
  };

  return (
    <UserPortalScaffold
      title="Passkeys"
      description="Manage passkeys with your current login session. No extra password prompt is required."
      actions={<UserLogoutButton />}
    >
      {loading || !session ? (
        <UserPortalLoading label="Loading passkeys..." />
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="ui-card p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Registered passkeys</h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Add up to 5 passkeys for <span className="font-semibold text-[var(--text-primary)]">@{session.username}</span>.
                </p>
              </div>
              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} type="button" className="ui-button-primary" disabled={busy} onClick={addPasskey}>
                {busy ? 'Working...' : 'Add Passkey'}
              </motion.button>
            </div>
          </div>

          {error ? <div className="ui-card p-4 text-sm text-[var(--danger)]">{error}</div> : null}

          <div className="ui-card p-6">
            {loadingKeys ? (
              <UserPortalLoading label="Refreshing passkeys..." />
            ) : passkeys.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-6 py-10 text-center">
                <Key className="mx-auto h-10 w-10 text-[var(--text-tertiary)]" />
                <p className="mt-4 text-sm text-[var(--text-secondary)]">No passkeys registered yet.</p>
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
                      <button type="button" className="ui-icon-button" onClick={() => renamePasskey(passkey.id, passkey.name)} title="Rename passkey">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button type="button" className="ui-icon-button" onClick={() => deletePasskey(passkey.id)} title="Delete passkey">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-right text-xs text-[var(--text-tertiary)]">{passkeys.length} / 5 passkeys used</p>
              </div>
            )}
          </div>

          <div className="text-center text-sm text-[var(--text-secondary)]">
            <Link to={`/${session.uuid}`} className="font-semibold text-[var(--primary)] no-underline">
              Back to account center
            </Link>
          </div>
        </div>
      )}
    </UserPortalScaffold>
  );
}
