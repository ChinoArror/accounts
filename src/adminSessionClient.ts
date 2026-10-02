export async function renewAdminAccess() {
  const response = await fetch('/api/auth/session/continue', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const data = response.ok ? await response.json().catch(() => null) : null;
  if (!data?.ok || data.user?.role !== 'admin' || !data.token) return null;
  const header = `Bearer ${data.token}`;
  localStorage.setItem('sso_admin_auth', header);
  return header;
}

export async function adminRequest(path: string, options: RequestInit = {}) {
  let authorization = localStorage.getItem('sso_admin_auth') || await renewAdminAccess();
  const send = (header: string) => {
    const headers = new Headers(options.headers);
    headers.set('Authorization', header);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(path, { ...options, headers, credentials: 'include' });
  };
  if (!authorization) return new Response(JSON.stringify({ error: 'Admin session expired' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  let response = await send(authorization);
  if (response.status === 401) {
    authorization = await renewAdminAccess();
    if (authorization) response = await send(authorization);
  }
  return response;
}
