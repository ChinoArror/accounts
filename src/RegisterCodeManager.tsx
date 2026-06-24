import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CheckSquare, Copy, MoreVertical, PauseCircle, PlayCircle, Square, Ticket, Trash2, X } from 'lucide-react';

type AppOption = {
  app_id: string;
  app_name: string;
};

type RegisterCodeRecord = {
  code: string;
  template_name: string | null;
  config_json: string;
  status: 'unused' | 'used' | 'pause';
  used_by_uuid: string | null;
  used_by_username: string | null;
  used_at: string | null;
  created_at: string;
};

type RegisterTemplateState = {
  enabled: boolean;
  rpm_limit: string;
  rpd_limit: string;
  daily_token_limit: string;
};

function useBodyScrollLock(active: boolean) {
  React.useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const scrollY = window.scrollY;
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const previous = {
      bodyOverflow: bodyStyle.overflow,
      bodyPosition: bodyStyle.position,
      bodyTop: bodyStyle.top,
      bodyLeft: bodyStyle.left,
      bodyRight: bodyStyle.right,
      bodyWidth: bodyStyle.width,
      bodyOverscroll: bodyStyle.overscrollBehavior,
      htmlOverflow: htmlStyle.overflow,
      htmlOverscroll: htmlStyle.overscrollBehavior,
    };
    bodyStyle.overflow = 'hidden';
    bodyStyle.position = 'fixed';
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.left = '0';
    bodyStyle.right = '0';
    bodyStyle.width = '100%';
    bodyStyle.overscrollBehavior = 'none';
    htmlStyle.overflow = 'hidden';
    htmlStyle.overscrollBehavior = 'none';
    return () => {
      bodyStyle.overflow = previous.bodyOverflow;
      bodyStyle.position = previous.bodyPosition;
      bodyStyle.top = previous.bodyTop;
      bodyStyle.left = previous.bodyLeft;
      bodyStyle.right = previous.bodyRight;
      bodyStyle.width = previous.bodyWidth;
      bodyStyle.overscrollBehavior = previous.bodyOverscroll;
      htmlStyle.overflow = previous.htmlOverflow;
      htmlStyle.overscrollBehavior = previous.htmlOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}

function getPortalTheme() {
  if (typeof document === 'undefined') return 'light';
  return document.querySelector('.dashboard-theme')?.getAttribute('data-theme') || 'light';
}

function parseRecordConfig(record: RegisterCodeRecord): any {
  try {
    return JSON.parse(record.config_json || '{}');
  } catch {
    return {};
  }
}

function openRegisterCodeDetails(record: RegisterCodeRecord) {
  if (typeof document === 'undefined') return;
  document.getElementById('register-code-detail-portal')?.remove();

  const config = parseRecordConfig(record);
  const permissions = Array.isArray(config.permissions) ? config.permissions : [];
  const scrollY = window.scrollY;
  const previous = {
    bodyOverflow: document.body.style.overflow,
    bodyPosition: document.body.style.position,
    bodyTop: document.body.style.top,
    bodyLeft: document.body.style.left,
    bodyRight: document.body.style.right,
    bodyWidth: document.body.style.width,
    htmlOverflow: document.documentElement.style.overflow,
  };

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    overlay.classList.remove('opacity-100');
    overlay.classList.add('opacity-0');
    panel.classList.remove('translate-y-0', 'scale-100', 'opacity-100');
    panel.classList.add('translate-y-3', 'scale-[0.98]', 'opacity-0');
    window.setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.position = previous.bodyPosition;
      document.body.style.top = previous.bodyTop;
      document.body.style.left = previous.bodyLeft;
      document.body.style.right = previous.bodyRight;
      document.body.style.width = previous.bodyWidth;
      document.documentElement.style.overflow = previous.htmlOverflow;
      window.scrollTo(0, scrollY);
    }, 180);
  };

  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  document.documentElement.style.overflow = 'hidden';

  const overlay = document.createElement('div');
  overlay.id = 'register-code-detail-portal';
  overlay.setAttribute('data-theme', getPortalTheme());
  overlay.className = 'dashboard-theme fixed inset-0 z-[2147483647] flex items-end justify-center overscroll-none bg-black/45 p-2 opacity-0 backdrop-blur-sm transition-opacity duration-200 ease-out md:items-center md:p-4';
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close();
  });

  const panel = document.createElement('div');
  panel.className = 'relative max-h-[94dvh] w-full max-w-2xl translate-y-3 scale-[0.98] overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] opacity-0 shadow-[var(--shadow-overlay)] transition duration-200 ease-out md:rounded-[var(--radius-xl)]';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'absolute right-4 top-4 z-30 grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] shadow-lg transition-colors hover:text-[var(--text-primary)]';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>';
  closeButton.addEventListener('click', close);

  const scroll = document.createElement('div');
  scroll.className = 'ui-modal-scroll max-h-[94dvh] touch-pan-y overscroll-contain overflow-y-auto p-6 pb-8 pt-16';

  const label = document.createElement('p');
  label.className = 'text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]';
  label.textContent = 'Register Code Details';
  const title = document.createElement('h3');
  title.className = 'mt-2 break-all text-xl font-semibold text-[var(--text-primary)]';
  title.textContent = record.code;
  const subtitle = document.createElement('p');
  subtitle.className = 'mt-2 text-sm text-[var(--text-secondary)]';
  subtitle.textContent = record.template_name || 'Untitled template';
  scroll.append(label, title, subtitle);

  const grid = document.createElement('div');
  grid.className = 'mt-6 grid gap-4 md:grid-cols-2';
  const addCard = (heading: string, value: string) => {
    const card = document.createElement('div');
    card.className = 'ui-card-subtle p-4';
    const h = document.createElement('p');
    h.className = 'text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]';
    h.textContent = heading;
    const v = document.createElement('p');
    v.className = 'mt-2 break-words text-sm text-[var(--text-primary)]';
    v.textContent = value;
    card.append(h, v);
    grid.append(card);
  };
  addCard('Status', record.status);
  addCard('Cookie Expiry', `${config.cookie_expiry_days || 7} days`);
  addCard('Used By', record.used_by_username || 'Not used yet');
  scroll.append(grid);

  const permissionsTitle = document.createElement('p');
  permissionsTitle.className = 'mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]';
  permissionsTitle.textContent = 'App Permissions';
  const permissionsList = document.createElement('div');
  permissionsList.className = 'mt-3 space-y-3';
  if (permissions.length) {
    for (const permission of permissions) {
      const item = document.createElement('div');
      item.className = 'ui-card-subtle p-4';
      const app = document.createElement('p');
      app.className = 'break-all text-sm font-semibold text-[var(--text-primary)]';
      app.textContent = String(permission.app_id || 'Unknown app');
      const quota = document.createElement('p');
      quota.className = 'mt-1 text-xs text-[var(--text-secondary)]';
      quota.textContent = `RPM ${permission.rpm_limit || 'unlimited'} / RPD ${permission.rpd_limit || 'unlimited'} / Tokens ${permission.daily_token_limit || 'unlimited'}`;
      item.append(app, quota);
      permissionsList.append(item);
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'ui-card-subtle p-4 text-sm text-[var(--text-secondary)]';
    empty.textContent = 'No app permissions are attached to this register code.';
    permissionsList.append(empty);
  }
  scroll.append(permissionsTitle, permissionsList);

  panel.append(closeButton, scroll);
  overlay.append(panel);
  document.body.append(overlay);
  window.requestAnimationFrame(() => {
    overlay.classList.remove('opacity-0');
    overlay.classList.add('opacity-100');
    panel.classList.remove('translate-y-3', 'scale-[0.98]', 'opacity-0');
    panel.classList.add('translate-y-0', 'scale-100', 'opacity-100');
  });
}

export default function RegisterCodeManager({
  authFetch,
  apps,
}: {
  authFetch: (path: string, options?: RequestInit) => Promise<Response>;
  apps: AppOption[];
}) {
  const [codes, setCodes] = React.useState<RegisterCodeRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [selectedCodes, setSelectedCodes] = React.useState<string[]>([]);
  const [templateName, setTemplateName] = React.useState('');
  const [batchCount, setBatchCount] = React.useState('10');
  const [cookieExpiryDays, setCookieExpiryDays] = React.useState('7');
  const [copiedCode, setCopiedCode] = React.useState('');
  const [menuCode, setMenuCode] = React.useState('');
  const [detailCode, setDetailCode] = React.useState<RegisterCodeRecord | null>(null);
  const [templateState, setTemplateState] = React.useState<Record<string, RegisterTemplateState>>({});
  const [defaultState, setDefaultState] = React.useState<Record<string, RegisterTemplateState>>({});
  const [defaultCookieExpiryDays, setDefaultCookieExpiryDays] = React.useState('7');
  const [externalRegistrationEnabled, setExternalRegistrationEnabled] = React.useState(true);
  const codesRef = React.useRef<RegisterCodeRecord[]>([]);
  useBodyScrollLock(Boolean(detailCode));

  React.useEffect(() => {
    codesRef.current = codes;
  }, [codes]);

  React.useEffect(() => {
    setTemplateState((current) => {
      const next = { ...current };
      for (const app of apps) {
        next[app.app_id] = next[app.app_id] || {
          enabled: false,
          rpm_limit: '',
          rpd_limit: '',
          daily_token_limit: '',
        };
      }
      return next;
    });
    setDefaultState((current) => {
      const next = { ...current };
      for (const app of apps) {
        next[app.app_id] = next[app.app_id] || {
          enabled: false,
          rpm_limit: '',
          rpd_limit: '',
          daily_token_limit: '',
        };
      }
      return next;
    });
  }, [apps]);

  const fetchCodes = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/admin/register-codes');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to load register codes');
        return;
      }
      setCodes(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load register codes');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  React.useEffect(() => {
    void fetchCodes();
  }, [fetchCodes]);

  React.useEffect(() => {
    if (!menuCode) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(`[data-register-menu-root="${menuCode}"]`)) return;
      setMenuCode('');
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [menuCode]);

  React.useEffect(() => {
    const handleOpenDetails = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest('[data-register-code-ignore]')) return;
      const opener = target.closest('[data-register-code-open]') as HTMLElement | null;
      if (!opener) return;
      const code = opener.getAttribute('data-register-code-open');
      const record = codesRef.current.find((item) => item.code === code);
      if (!record) return;
      event.preventDefault();
      window.setTimeout(() => openRegisterCodeDetails(record), 0);
    };

    document.addEventListener('click', handleOpenDetails, true);
    return () => {
      document.removeEventListener('click', handleOpenDetails, true);
      document.getElementById('register-code-detail-portal')?.remove();
    };
  }, []);

  const allSelected = codes.length > 0 && selectedCodes.length === codes.length;

  const toggleSelectAll = () => {
    setSelectedCodes(allSelected ? [] : codes.map((code) => code.code));
  };

  const toggleSingle = (code: string) => {
    setSelectedCodes((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  };

  const copyText = async (value: string, marker: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedCode(marker);
    window.setTimeout(() => setCopiedCode(''), 1600);
  };

  const buildPermissionsPayload = () => (Object.entries(templateState) as Array<[string, RegisterTemplateState]>)
    .filter(([, value]) => value.enabled)
    .map(([app_id, value]) => ({
      app_id,
      rpm_limit: value.rpm_limit.trim() || null,
      rpd_limit: value.rpd_limit.trim() || null,
      daily_token_limit: value.daily_token_limit.trim() || null,
    }));

  const buildPermissionsFromState = (state: Record<string, RegisterTemplateState>) => (Object.entries(state) as Array<[string, RegisterTemplateState]>)
    .filter(([, value]) => value.enabled)
    .map(([app_id, value]) => ({
      app_id,
      rpm_limit: value.rpm_limit.trim() || null,
      rpd_limit: value.rpd_limit.trim() || null,
      daily_token_limit: value.daily_token_limit.trim() || null,
    }));

  const loadDefaultConfig = React.useCallback(async () => {
    try {
      const res = await authFetch('/admin/auth/default-registration-config');
      const data = await res.json();
      if (!res.ok) return;
      setExternalRegistrationEnabled(data.external_registration_enabled !== false);
      setDefaultCookieExpiryDays(String(data.config?.cookie_expiry_days || 7));
      const permissions = Array.isArray(data.config?.permissions) ? data.config.permissions : [];
      setDefaultState((current) => {
        const next = { ...current };
        for (const app of apps) {
          const permission = permissions.find((item: any) => item.app_id === app.app_id);
          next[app.app_id] = {
            enabled: !!permission,
            rpm_limit: permission?.rpm_limit == null ? '' : String(permission.rpm_limit),
            rpd_limit: permission?.rpd_limit == null ? '' : String(permission.rpd_limit),
            daily_token_limit: permission?.daily_token_limit == null ? '' : String(permission.daily_token_limit),
          };
        }
        return next;
      });
    } catch {
      // The register-code page can still work if this newer endpoint is unavailable.
    }
  }, [authFetch, apps]);

  React.useEffect(() => {
    if (apps.length) void loadDefaultConfig();
  }, [apps.length, loadDefaultConfig]);

  const saveDefaultConfig = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await authFetch('/admin/auth/default-registration-config', {
        method: 'PUT',
        body: JSON.stringify({
          external_registration_enabled: externalRegistrationEnabled,
          cookie_expiry_days: defaultCookieExpiryDays,
          permissions: buildPermissionsFromState(defaultState),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setError(data.error || data.message || 'Unable to save default registration config');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to save default registration config');
    } finally {
      setSubmitting(false);
    }
  };

  const generateCodes = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await authFetch('/admin/register-codes/batch', {
        method: 'POST',
        body: JSON.stringify({
          template_name: templateName,
          count: batchCount,
          cookie_expiry_days: cookieExpiryDays,
          permissions: buildPermissionsPayload(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to generate register codes');
        return;
      }
      setSelectedCodes(data.codes || []);
      await fetchCodes();
    } catch (err: any) {
      setError(err.message || 'Unable to generate register codes');
    } finally {
      setSubmitting(false);
    }
  };

  const runBulkAction = async (action: 'pause' | 'continue' | 'delete', codesToApply = selectedCodes) => {
    if (!codesToApply.length) return;
    setError('');

    try {
      const res = await authFetch('/admin/register-codes/bulk-action', {
        method: 'POST',
        body: JSON.stringify({ action, codes: codesToApply }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Unable to ${action} register codes`);
        return;
      }
      setMenuCode('');
      setSelectedCodes((current) => current.filter((code) => !codesToApply.includes(code) || action !== 'delete'));
      await fetchCodes();
    } catch (err: any) {
      setError(err.message || `Unable to ${action} register codes`);
    }
  };

  const parseConfig = (record: RegisterCodeRecord) => {
    try {
      return JSON.parse(record.config_json);
    } catch {
      return { cookie_expiry_days: 7, permissions: [] };
    }
  };

  const statusClassMap: Record<RegisterCodeRecord['status'], string> = {
    unused: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    used: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
    pause: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  };

  return (
    <div className="space-y-8">
      <div className="ui-card p-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Default Registration</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Applied once to new email registrations without a register code.</p>
          </div>
          <label className="ui-card-subtle flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={externalRegistrationEnabled}
              onChange={(event) => setExternalRegistrationEnabled(event.target.checked)}
              className="h-4 w-4"
            />
            External registration
          </label>
        </div>

        <div className="mb-5 max-w-xs space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Cookie Expiry Days</label>
          <input type="number" min="1" value={defaultCookieExpiryDays} onChange={(event) => setDefaultCookieExpiryDays(event.target.value)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {apps.map((app) => {
            const value = defaultState[app.app_id] || { enabled: false, rpm_limit: '', rpd_limit: '', daily_token_limit: '' };
            return (
              <div key={app.app_id} className="ui-card-subtle p-4">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => setDefaultState((current) => ({ ...current, [app.app_id]: { ...value, enabled: !value.enabled } }))} className="mt-0.5">
                    {value.enabled ? <CheckSquare className="h-5 w-5 text-[var(--primary)]" /> : <Square className="h-5 w-5 text-[var(--text-tertiary)]" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--text-primary)]">{app.app_name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{app.app_id}</p>
                    {value.enabled ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <input placeholder="RPM" value={value.rpm_limit} onChange={(event) => setDefaultState((current) => ({ ...current, [app.app_id]: { ...value, rpm_limit: event.target.value } }))} />
                        <input placeholder="RPD" value={value.rpd_limit} onChange={(event) => setDefaultState((current) => ({ ...current, [app.app_id]: { ...value, rpd_limit: event.target.value } }))} />
                        <input placeholder="Daily Tokens" value={value.daily_token_limit} onChange={(event) => setDefaultState((current) => ({ ...current, [app.app_id]: { ...value, daily_token_limit: event.target.value } }))} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" className="ui-button-primary mt-6" onClick={saveDefaultConfig} disabled={submitting}>
          Save Default Config
        </button>
      </div>

      <div className="ui-card p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Register Code Templates</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Generate one-time register codes from a reusable template. Each code can be used once to create a user with preset app access, quotas, and cookie expiry rules.
          </p>
        </div>

        <form onSubmit={generateCodes} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Template Name</label>
              <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Spring launch cohort" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Batch Count</label>
              <input type="number" min="1" max="500" value={batchCount} onChange={(event) => setBatchCount(event.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Cookie Expiry Days</label>
              <input type="number" min="1" value={cookieExpiryDays} onChange={(event) => setCookieExpiryDays(event.target.value)} />
            </div>
            <div className="ui-card-subtle flex items-center justify-between px-4 py-3 md:col-span-2">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Copy mode</p>
                <p className="text-sm text-[var(--text-secondary)]">You can copy one code, all codes, or only selected codes after generation.</p>
              </div>
              <Ticket className="h-5 w-5 text-[var(--primary)]" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Permission Template</h3>
              <span className="text-xs text-[var(--text-secondary)]">Select apps and optional quota values</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {apps.map((app) => {
                const value = templateState[app.app_id] || { enabled: false, rpm_limit: '', rpd_limit: '', daily_token_limit: '' };
                return (
                  <div key={app.app_id} className="ui-card-subtle p-4">
                    <div className="flex items-start gap-3">
                      <button type="button" onClick={() => setTemplateState((current) => ({ ...current, [app.app_id]: { ...value, enabled: !value.enabled } }))} className="mt-0.5">
                        {value.enabled ? <CheckSquare className="h-5 w-5 text-[var(--primary)]" /> : <Square className="h-5 w-5 text-[var(--text-tertiary)]" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[var(--text-primary)]">{app.app_name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{app.app_id}</p>
                        {value.enabled ? (
                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <input placeholder="RPM" value={value.rpm_limit} onChange={(event) => setTemplateState((current) => ({ ...current, [app.app_id]: { ...value, rpm_limit: event.target.value } }))} />
                            <input placeholder="RPD" value={value.rpd_limit} onChange={(event) => setTemplateState((current) => ({ ...current, [app.app_id]: { ...value, rpd_limit: event.target.value } }))} />
                            <input placeholder="Daily Tokens" value={value.daily_token_limit} onChange={(event) => setTemplateState((current) => ({ ...current, [app.app_id]: { ...value, daily_token_limit: event.target.value } }))} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} className="ui-button-primary" disabled={submitting}>
            {submitting ? 'Generating...' : 'Generate Register Codes'}
          </motion.button>
        </form>
      </div>

      <div className="ui-card overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Register Codes</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Manage one-time codes, inspect template details, and run bulk actions across selected items.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ui-button-secondary inline-flex items-center gap-2" onClick={() => copyText(codes.map((item) => item.code).join('\n'), 'all')}>
                <Copy className="h-4 w-4" />
                {copiedCode === 'all' ? 'Copied All' : 'Copy All'}
              </button>
              <button
                type="button"
                className="ui-button-secondary inline-flex items-center gap-2"
                disabled={!selectedCodes.length}
                onClick={() => copyText(codes.filter((item) => selectedCodes.includes(item.code)).map((item) => item.code).join('\n'), 'selected')}
              >
                <Copy className="h-4 w-4" />
                {copiedCode === 'selected' ? 'Copied Selected' : 'Copy Selected'}
              </button>
            </div>
          </div>

          {selectedCodes.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--surface-alt)] px-3 py-1 text-sm text-[var(--text-secondary)]">
                {selectedCodes.length} selected
              </span>
              <button type="button" className="ui-button-secondary inline-flex items-center gap-2" onClick={() => runBulkAction('pause')}>
                <PauseCircle className="h-4 w-4" />
                Pause
              </button>
              <button type="button" className="ui-button-secondary inline-flex items-center gap-2" onClick={() => runBulkAction('continue')}>
                <PlayCircle className="h-4 w-4" />
                Continue
              </button>
              <button type="button" className="ui-button-secondary inline-flex items-center gap-2 text-[var(--danger)]" onClick={() => runBulkAction('delete')}>
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          ) : null}
          {error ? <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div> : null}
        </div>

        <div className="flex items-center border-b border-[var(--border)] px-4 text-sm text-[var(--text-secondary)]">
          <button type="button" onClick={toggleSelectAll} className="mr-4 flex h-12 w-6 items-center justify-center">
            {allSelected ? <CheckSquare className="h-5 w-5 text-[var(--primary)]" /> : <Square className="h-5 w-5" />}
          </button>
          <div className="flex h-12 flex-1 items-center">Register Code</div>
          <div className="hidden h-12 w-32 items-center md:flex">Status</div>
          <div className="hidden h-12 w-40 items-center md:flex">Template</div>
          <div className="hidden h-12 w-44 items-center md:flex">Used By</div>
          <div className="flex h-12 w-12 items-center justify-end"></div>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-sm text-[var(--text-secondary)]">Loading register codes...</div>
        ) : codes.length === 0 ? (
          <div className="px-6 py-10 text-sm text-[var(--text-secondary)]">No register codes generated yet.</div>
        ) : (
          <div>
            {codes.map((record) => {
              const parsedConfig = parseConfig(record);
              const isSelected = selectedCodes.includes(record.code);
              return (
                <div
                  key={record.code}
                  data-register-code-open={record.code}
                  className="relative cursor-pointer border-b border-[var(--border)] px-4 py-0 transition-colors hover:bg-[var(--surface-soft)] md:px-4"
                  onClick={() => openRegisterCodeDetails(record)}
                >
                  <div className="flex min-h-[56px] flex-col gap-3 py-3 md:flex-row md:items-center md:gap-0 md:py-0">
                    <button
                      type="button"
                      data-register-code-ignore
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleSingle(record.code);
                      }}
                      className="mr-4 flex h-6 w-6 items-center justify-center self-start md:h-[56px] md:self-auto"
                      aria-label={`Select ${record.code}`}
                    >
                      {isSelected ? <CheckSquare className="h-5 w-5 text-[var(--primary)]" /> : <Square className="h-5 w-5 text-[var(--text-tertiary)]" />}
                    </button>

                    <button
                      type="button"
                      data-register-code-open={record.code}
                      onClick={() => openRegisterCodeDetails(record)}
                      className="flex min-h-[40px] flex-1 items-center text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[15px] font-medium text-[var(--text-primary)] md:text-[16px]">{record.code}</span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {record.template_name || 'Untitled template'} · Cookie {parsedConfig.cookie_expiry_days || 7} days · {parsedConfig.permissions?.length || 0} apps
                        </p>
                        <div className="mt-2 flex items-center gap-2 md:hidden">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Status</span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClassMap[record.status]}`}>{record.status}</span>
                        </div>
                      </div>
                    </button>

                    <div className="hidden w-32 items-center md:flex">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClassMap[record.status]}`}>{record.status}</span>
                    </div>
                    <div className="hidden w-40 items-center text-sm text-[var(--text-secondary)] md:flex">{record.template_name || 'Untitled'}</div>
                    <div className="hidden w-44 items-center truncate text-sm text-[var(--text-secondary)] md:flex">{record.used_by_username || 'Not used yet'}</div>

                    <div
                      className="relative flex items-center justify-end md:w-12"
                      data-register-menu-root={record.code}
                      data-register-code-ignore
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button type="button" className="ui-icon-button" onClick={() => setMenuCode((current) => current === record.code ? '' : record.code)} aria-label={`More actions for ${record.code}`}>
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {menuCode === record.code ? (
                        <div className="absolute right-0 top-10 z-20 w-44 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-overlay)]">
                          <button type="button" onClick={() => copyText(record.code, record.code)} className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-alt)]">
                            <Copy className="h-4 w-4" />
                            {copiedCode === record.code ? 'Copied' : 'Copy'}
                          </button>
                          {record.status !== 'used' ? (
                            <button type="button" onClick={() => runBulkAction(record.status === 'pause' ? 'continue' : 'pause', [record.code])} className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-alt)]">
                              {record.status === 'pause' ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                              {record.status === 'pause' ? 'Continue' : 'Pause'}
                            </button>
                          ) : null}
                          <button type="button" onClick={() => runBulkAction('delete', [record.code])} className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--surface-alt)]">
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {detailCode && typeof document !== 'undefined' ? createPortal(
          <motion.div
            data-theme={getPortalTheme()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="dashboard-theme fixed inset-0 z-[2147483647] flex items-end justify-center overscroll-none bg-black/45 p-2 backdrop-blur-sm md:items-center md:p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDetailCode(null);
            }}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
              className="relative max-h-[94dvh] w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-overlay)] md:rounded-[var(--radius-xl)]"
            >
              <button type="button" className="ui-icon-button absolute right-4 top-4 z-20 bg-[var(--surface)] shadow-lg" onClick={() => setDetailCode(null)}>
                  <X className="h-4 w-4" />
              </button>
              <div className="ui-modal-scroll max-h-[94dvh] touch-pan-y overscroll-contain overflow-y-auto p-6 pb-8 pt-16">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Register Code Details</p>
                    <h3 className="mt-2 break-all text-xl font-semibold text-[var(--text-primary)]">{detailCode.code}</h3>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{detailCode.template_name || 'Untitled template'}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="ui-card-subtle p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Status</p>
                  <p className="mt-2 text-sm text-[var(--text-primary)]">{detailCode.status}</p>
                </div>
                <div className="ui-card-subtle p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Cookie Expiry</p>
                  <p className="mt-2 text-sm text-[var(--text-primary)]">{parseConfig(detailCode).cookie_expiry_days || 7} days</p>
                </div>
                <div className="ui-card-subtle p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Created</p>
                  <p className="mt-2 text-sm text-[var(--text-primary)]">{new Date(detailCode.created_at).toLocaleString()}</p>
                </div>
                <div className="ui-card-subtle p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Used By</p>
                  <p className="mt-2 text-sm text-[var(--text-primary)]">{detailCode.used_by_username || 'Not used yet'}</p>
                </div>
                </div>

                <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">App Permissions</p>
                <div className="mt-3 space-y-3">
                  {parseConfig(detailCode).permissions?.length ? parseConfig(detailCode).permissions.map((permission: any) => (
                    <div key={`${detailCode.code}-${permission.app_id}`} className="ui-card-subtle p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">{apps.find((app) => app.app_id === permission.app_id)?.app_name || permission.app_id}</p>
                          <p className="text-xs text-[var(--text-secondary)]">{permission.app_id}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
                          <span className="rounded-full bg-[var(--surface)] px-3 py-1">RPM: {permission.rpm_limit ?? 'Unlimited'}</span>
                          <span className="rounded-full bg-[var(--surface)] px-3 py-1">RPD: {permission.rpd_limit ?? 'Unlimited'}</span>
                          <span className="rounded-full bg-[var(--surface)] px-3 py-1">Daily Tokens: {permission.daily_token_limit ?? 'Unlimited'}</span>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="ui-card-subtle p-4 text-sm text-[var(--text-secondary)]">No app permissions are attached to this register code.</div>
                  )}
                </div>
                </div>
              </div>
            </motion.div>
          </motion.div>,
          document.body
        ) : null}
      </AnimatePresence>
    </div>
  );
}
