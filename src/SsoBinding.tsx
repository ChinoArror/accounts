import React from 'react';
import { motion } from 'motion/react';
import { Github, Link2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  API_BASE,
  UserLogoutButton,
  UserPortalLoading,
  UserPortalScaffold,
  useRequiredUserSession,
} from './userPortal';

export default function SsoBinding() {
  const { uuid } = useParams();
  const { session, loading } = useRequiredUserSession(uuid);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const startBinding = async () => {
    setBusy(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/user/bind-token`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.bind_token) {
        setError(data.error || 'Unable to start GitHub binding');
        return;
      }
      window.location.href = `${API_BASE}/api/github/login?bind_token=${encodeURIComponent(data.bind_token)}`;
    } catch (err: any) {
      setError(err.message || 'Unable to start GitHub binding');
    } finally {
      setBusy(false);
    }
  };

  return (
    <UserPortalScaffold
      title="Bind GitHub"
      description="Your current session is already trusted, so this flow jumps straight into GitHub authorization."
      actions={<UserLogoutButton />}
    >
      {loading || !session ? (
        <UserPortalLoading label="Preparing GitHub binding..." />
      ) : (
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="ui-card p-6">
            <div className="flex items-start gap-4">
              <div className="ui-logo-badge">
                <Github className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Connect GitHub</h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  When you continue, GitHub will ask you to authorize the link for <span className="font-semibold text-[var(--text-primary)]">@{session.username}</span>.
                </p>
              </div>
            </div>
          </div>

          <div className="ui-card space-y-4 p-6">
            {error ? <div className="rounded-[var(--radius-md)] border border-[var(--danger)]/20 px-4 py-3 text-sm text-[var(--danger)]">{error}</div> : null}

            <div className="ui-card-subtle p-4">
              <p className="text-sm text-[var(--text-secondary)]">
                No extra password step is required here. We use your active login session to issue a short-lived binding token.
              </p>
            </div>

            <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} className="ui-button-primary w-full" disabled={busy} onClick={startBinding}>
              <span className="inline-flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                {busy ? 'Redirecting...' : 'Continue with GitHub'}
              </span>
            </motion.button>
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
