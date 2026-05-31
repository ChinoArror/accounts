import React from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  API_BASE,
  UserLogoutButton,
  UserPortalLoading,
  UserPortalScaffold,
  useRequiredUserSession,
} from './userPortal';

export default function ChangePassword() {
  const { uuid } = useParams();
  const { session, loading } = useRequiredUserSession(uuid);
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showNew, setShowNew] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API_BASE}/api/user/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to update password');
        return;
      }

      setMessage('Your password has been updated.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Unable to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <UserPortalScaffold
      title="Change Password"
      description="You are already verified through your current session, so you only need to enter the new password."
      actions={<UserLogoutButton />}
    >
      {loading || !session ? (
        <UserPortalLoading label="Checking your session..." />
      ) : (
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="ui-card p-6">
            <div className="flex items-start gap-4">
              <div className="ui-logo-badge">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Set a new password</h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  This update applies to <span className="font-semibold text-[var(--text-primary)]">@{session.username}</span>.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="ui-card space-y-4 p-6">
            {error ? <div className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div> : null}
            {message ? <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)]">{message}</div> : null}

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">New password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="pr-12"
                />
                <button type="button" onClick={() => setShowNew((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Confirm password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="pr-12"
                />
                <button type="button" onClick={() => setShowConfirm((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} className="ui-button-primary w-full" disabled={saving}>
              {saving ? 'Updating...' : 'Update Password'}
            </motion.button>
          </form>

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
