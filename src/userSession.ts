export const API_BASE = '';

export type ActiveUserSession = {
  session_id: string;
  uuid: string;
  username: string;
  name: string;
  exp: number;
  session?: {
    session_id: string;
    login_at: string;
    ip_address: string | null;
    browser: string | null;
    device_type: string | null;
    app_id: string | null;
    expires_at: string;
  };
};

export async function fetchCurrentUserSession(): Promise<ActiveUserSession | null> {
  const res = await fetch(`${API_BASE}/api/user/session`, {
    credentials: 'include',
  });

  if (!res.ok) return null;
  return res.json();
}

export async function requireCurrentUserSession(): Promise<ActiveUserSession> {
  const session = await fetchCurrentUserSession();
  if (!session) {
    throw new Error('Authentication required');
  }
  return session;
}
