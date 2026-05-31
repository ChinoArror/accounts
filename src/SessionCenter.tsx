import React from 'react';
import { Clock3, LaptopMinimal, MapPin, MonitorSmartphone, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import {
  UserLogoutButton,
  UserPortalLoading,
  UserPortalScaffold,
  formatDateTime,
  useRequiredUserSession,
} from './userPortal';

const API_BASE = '';

type UserSessionItem = {
  session_id: string;
  login_at: string;
  ip_address: string | null;
  browser: string | null;
  device_type: string | null;
  app_id: string | null;
  expires_at: string;
  revoked_at: string | null;
};

function getDeviceLabel(deviceType?: string | null) {
  if (!deviceType) return 'Unknown device';
  return deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
}

function getDeviceIcon(deviceType?: string | null) {
  return deviceType === 'mobile' ? Smartphone : LaptopMinimal;
}

export default function SessionCenter() {
  const { session, loading } = useRequiredUserSession();
  const [sessions, setSessions] = React.useState<UserSessionItem[]>([]);
  const [currentSessionId, setCurrentSessionId] = React.useState('');
  const [busySessionId, setBusySessionId] = React.useState('');
  const [error, setError] = React.useState('');

  const fetchSessions = React.useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/user/sessions`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Unable to load sessions');
      return;
    }
    setSessions(data.sessions || []);
    setCurrentSessionId(data.current_session_id || '');
  }, []);

  React.useEffect(() => {
    if (!session) return;
    void fetchSessions();
  }, [fetchSessions, session]);

  const closeSession = async (sessionId: string) => {
    setBusySessionId(sessionId);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/user/sessions/${sessionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to close session');
        return;
      }

      if (data.revoked_current) {
        window.location.href = '/users';
        return;
      }

      await fetchSessions();
    } catch (err: any) {
      setError(err.message || 'Unable to close session');
    } finally {
      setBusySessionId('');
    }
  };

  return (
    <UserPortalScaffold
      title="Login Sessions"
      description="Review where your account is signed in and close any session you no longer trust."
      actions={<UserLogoutButton />}
    >
      {loading || !session ? (
        <UserPortalLoading label="Loading session inventory..." />
      ) : (
        <div className="space-y-4">
          {error ? (
            <div className="ui-card p-4 text-sm text-[var(--danger)]">{error}</div>
          ) : null}

          {sessions.length === 0 ? (
            <div className="ui-card p-6 text-sm text-[var(--text-secondary)]">No login sessions found.</div>
          ) : (
            sessions.map((item) => {
              const DeviceIcon = getDeviceIcon(item.device_type);
              const isCurrent = item.session_id === currentSessionId;
              const isRevoked = Boolean(item.revoked_at);

              return (
                <div key={item.session_id} className="ui-card p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="ui-logo-badge h-10 w-10">
                          <DeviceIcon className="h-4 w-4" />
                        </div>
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                          {item.browser || 'Unknown browser'}
                        </h2>
                        {isCurrent ? (
                          <span className="rounded-full bg-[var(--surface-alt)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
                            Current session
                          </span>
                        ) : null}
                        {isRevoked ? (
                          <span className="rounded-full bg-[var(--surface-alt)] px-3 py-1 text-xs font-semibold text-[var(--danger)]">
                            Closed
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-[var(--text-secondary)] md:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-4 w-4 text-[var(--primary)]" />
                          <span>Login time: {formatDateTime(item.login_at)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-[var(--primary)]" />
                          <span>IP: {item.ip_address || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MonitorSmartphone className="h-4 w-4 text-[var(--primary)]" />
                          <span>Device: {getDeviceLabel(item.device_type)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
                          <span>App: {item.app_id || 'Account center'}</span>
                        </div>
                        <div className="flex items-center gap-2 md:col-span-2">
                          <LaptopMinimal className="h-4 w-4 text-[var(--primary)]" />
                          <span>Expires: {formatDateTime(item.expires_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={isRevoked || busySessionId === item.session_id}
                        onClick={() => closeSession(item.session_id)}
                        className="ui-button-secondary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {busySessionId === item.session_id ? 'Closing...' : 'Close Session'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </UserPortalScaffold>
  );
}
