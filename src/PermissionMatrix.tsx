import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  KeyRound,
  Layers,
  RefreshCw,
  Search,
  Settings,
  ToggleLeft,
  ToggleRight,
  Users,
  X,
  XCircle,
} from 'lucide-react';

type AuthFetch = (path: string, options?: any) => Promise<Response>;

type PermissionCell = {
  user_id: string;
  app_id: string;
  enabled: boolean;
  status: string;
  label: string;
  percent: number;
  role_in_app: string;
  quota_source: string;
  has_override: boolean;
  quotas: Array<{ type: string; used: number | null; limit: number | null; reset_period: string }>;
  raw?: Record<string, any> | null;
};

const STATUS_OPTIONS = [
  ['all', 'All status'],
  ['enabled', 'Enabled'],
  ['off', 'OFF'],
  ['near_limit', 'Near limit'],
  ['exceeded', 'Exceeded'],
  ['override', 'Override'],
  ['disabled', 'Disabled'],
];

function statusClass(status: string) {
  if (status === 'exceeded') return 'border-red-500/30 bg-red-500/15 text-red-300';
  if (status === 'near_limit') return 'border-amber-500/30 bg-amber-500/15 text-amber-300';
  if (status === 'override') return 'border-blue-500/30 bg-blue-500/15 text-blue-300';
  if (status === 'on') return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
  if (status === 'disabled') return 'border-zinc-500/30 bg-zinc-500/15 text-zinc-300';
  return 'border-white/10 bg-white/5 text-white/45';
}

function formatLimit(value: number | null | undefined) {
  if (value === null || value === undefined) return 'Unlimited';
  return new Intl.NumberFormat().format(value);
}

function limitPercent(quota: { used: number | null; limit: number | null }) {
  if (!quota.limit || quota.used === null) return 0;
  return Math.min(100, Math.round((Number(quota.used) / Number(quota.limit)) * 100));
}

function CellBadge({ cell }: { cell: PermissionCell }) {
  return (
    <span className={`inline-flex min-w-[58px] justify-center rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(cell.status)}`}>
      {cell.label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm font-medium text-[var(--text-primary)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function PermissionMatrix({ authFetch }: { authFetch: AuthFetch }) {
  const [data, setData] = React.useState<any>(null);
  const [detail, setDetail] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [filters, setFilters] = React.useState({ user_search: '', app_search: '', role: 'all', plan: 'all', status: 'all', app_group: 'all' });
  const [selectedUsers, setSelectedUsers] = React.useState<Record<string, boolean>>({});
  const [selectedApps, setSelectedApps] = React.useState<Record<string, boolean>>({});
  const [mobileMode, setMobileMode] = React.useState<'home' | 'users' | 'apps' | 'anomalies' | 'logs'>('home');
  const [logs, setLogs] = React.useState<any[]>([]);
  const [form, setForm] = React.useState({ enabled: true, role_in_app: 'user', rpm_limit: '', rpd_limit: '', daily_token_limit: '', override_reason: '' });

  const query = React.useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') params.set(key, String(value));
    });
    return params.toString();
  }, [filters]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/admin/permissions/matrix${query ? `?${query}` : ''}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [authFetch, query]);

  const loadLogs = React.useCallback(async () => {
    const res = await authFetch('/api/admin/permissions/audit-logs');
    if (res.ok) setLogs((await res.json()).logs || []);
  }, [authFetch]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (mobileMode === 'logs') void loadLogs();
  }, [mobileMode, loadLogs]);

  React.useEffect(() => {
    if (!detail || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [detail]);

  const openDetail = async (userId: string, appId: string) => {
    const res = await authFetch(`/api/admin/permissions/detail?user_id=${encodeURIComponent(userId)}&app_id=${encodeURIComponent(appId)}`);
    if (!res.ok) return;
    const payload = await res.json();
    setDetail(payload);
    const raw = payload.permission?.raw || {};
    setForm({
      enabled: !!payload.permission?.enabled,
      role_in_app: payload.permission?.role_in_app || 'user',
      rpm_limit: raw.rpm_limit ?? '',
      rpd_limit: raw.rpd_limit ?? '',
      daily_token_limit: raw.daily_token_limit ?? '',
      override_reason: raw.override_reason || '',
    });
  };

  const saveDetail = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!detail) return;
    if (!form.enabled && !confirm('This will close access for the selected user and app. Continue?')) return;
    setSaving(true);
    try {
      const res = await authFetch('/api/admin/permissions/update', {
        method: 'POST',
        body: JSON.stringify({
          user_id: detail.user.uuid,
          app_id: detail.app.app_id,
          enabled: form.enabled,
          role_in_app: form.role_in_app,
          rpm_limit: form.rpm_limit === '' ? null : Number(form.rpm_limit),
          rpd_limit: form.rpd_limit === '' ? null : Number(form.rpd_limit),
          daily_token_limit: form.daily_token_limit === '' ? null : Number(form.daily_token_limit),
          override_reason: form.override_reason,
        }),
      });
      if (res.ok) {
        await load();
        await openDetail(detail.user.uuid, detail.app.app_id);
      }
    } finally {
      setSaving(false);
    }
  };

  const resetQuota = async () => {
    if (!detail || !confirm('Restore this user-app quota to the default configuration?')) return;
    const res = await authFetch('/api/admin/permissions/reset-quota', {
      method: 'POST',
      body: JSON.stringify({ user_id: detail.user.uuid, app_id: detail.app.app_id }),
    });
    if (res.ok) {
      await load();
      await openDetail(detail.user.uuid, detail.app.app_id);
    }
  };

  const selectedUserIds = Object.entries(selectedUsers).filter(([, enabled]) => enabled).map(([id]) => id);
  const selectedAppIds = Object.entries(selectedApps).filter(([, enabled]) => enabled).map(([id]) => id);
  const selectedCount = selectedUserIds.length * selectedAppIds.length;

  const bulkUpdate = async (action: 'enable' | 'disable' | 'apply_quota') => {
    if (!selectedUserIds.length || !selectedAppIds.length) {
      alert('Select at least one user and one app.');
      return;
    }
    const label = action === 'enable' ? 'enable access' : action === 'disable' ? 'close access' : 'apply quota';
    if (!confirm(`This will ${label} for ${selectedUserIds.length} users and ${selectedAppIds.length} apps, affecting ${selectedCount} relations. Continue?`)) return;
    const res = await authFetch('/api/admin/permissions/bulk-update', {
      method: 'POST',
      body: JSON.stringify({
        action,
        user_ids: selectedUserIds,
        app_ids: selectedAppIds,
        role_in_app: 'user',
        rpm_limit: action === 'apply_quota' ? 60 : null,
        rpd_limit: action === 'apply_quota' ? 1000 : null,
        daily_token_limit: action === 'apply_quota' ? 100000 : null,
        override_reason: 'Bulk quota template',
      }),
    });
    if (res.ok) {
      await load();
      setSelectedUsers({});
      setSelectedApps({});
    }
  };

  const exportCsv = async () => {
    const res = await authFetch(`/api/admin/permissions/export${query ? `?${query}` : ''}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'permissions.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const users = data?.users || [];
  const apps = data?.apps || [];
  const rows = data?.matrix || [];
  const summary = data?.summary || { users: 0, apps: 0, enabledRelations: 0, nearLimit: 0, exceeded: 0 };
  const filtersMeta = data?.filters || { roles: [], plans: [], app_groups: [] };
  const anomalies = rows.flatMap((row: any) => row.cells.filter((cell: PermissionCell) => ['near_limit', 'exceeded', 'disabled'].includes(cell.status)).map((cell: PermissionCell) => ({
    cell,
    user: users.find((user: any) => user.uuid === cell.user_id),
    app: apps.find((app: any) => app.app_id === cell.app_id),
  })));

  const clearFilters = () => {
    setFilters({ user_search: '', app_search: '', role: 'all', plan: 'all', status: 'all', app_group: 'all' });
  };

  const renderStats = () => (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {[
        ['Users', summary.users, Users],
        ['Apps', summary.apps, Layers],
        ['Enabled', summary.enabledRelations, CheckCircle2],
        ['Near limit', summary.nearLimit, AlertTriangle],
        ['Exceeded', summary.exceeded, XCircle],
      ].map(([label, value, Icon]: any) => (
        <div key={label} className="ui-card-subtle p-4">
          <Icon className="mb-3 h-5 w-5 text-[var(--primary)]" />
          <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
          <p className="text-xs text-[var(--text-secondary)]">{label}</p>
        </div>
      ))}
    </div>
  );

  const renderDetailForm = (sheet = false) => detail ? (
    <form onSubmit={saveDetail} className="space-y-5">
      <div className="ui-card-subtle p-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{detail.user.username} / {detail.app.app_name}</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{detail.user.email || 'No email'} · {detail.app.app_id}</p>
      </div>
      <label className="ui-card-subtle flex items-center justify-between gap-4 p-4 text-sm font-semibold text-[var(--text-primary)]">
        Access status
        <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
      </label>
      <Field label="App role">
        <select value={form.role_in_app} onChange={(event) => setForm({ ...form, role_in_app: event.target.value })}>
          <option value="user">user</option>
          <option value="moderator">moderator</option>
          <option value="admin">admin</option>
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="RPM limit">
          <input type="number" min="0" value={form.rpm_limit} onChange={(event) => setForm({ ...form, rpm_limit: event.target.value })} placeholder="Unlimited" />
        </Field>
        <Field label="RPD limit">
          <input type="number" min="0" value={form.rpd_limit} onChange={(event) => setForm({ ...form, rpd_limit: event.target.value })} placeholder="Unlimited" />
        </Field>
        <Field label="Daily tokens">
          <input type="number" min="0" value={form.daily_token_limit} onChange={(event) => setForm({ ...form, daily_token_limit: event.target.value })} placeholder="Unlimited" />
        </Field>
      </div>
      <Field label="Override reason">
        <input value={form.override_reason} onChange={(event) => setForm({ ...form, override_reason: event.target.value })} placeholder="Optional note" />
      </Field>
      <div className="space-y-3">
        {detail.permission.quotas.map((quota: any) => (
          <div key={quota.type} className="ui-card-subtle p-4">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-[var(--text-primary)]">{quota.type}</span>
              <span className="text-[var(--text-secondary)]">{quota.used === null ? '-' : formatLimit(quota.used)} / {formatLimit(quota.limit)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
              <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${limitPercent(quota)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className={`${sheet ? 'grid gap-3' : 'flex flex-wrap gap-3'}`}>
        <button className="ui-button-primary inline-flex w-full items-center justify-center gap-2 sm:w-auto" disabled={saving}>
          <Settings className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="ui-button-secondary inline-flex w-full items-center justify-center gap-2 sm:w-auto" onClick={resetQuota}>
          <RefreshCw className="h-4 w-4" /> Restore default
        </button>
        <button type="button" className="ui-button-secondary inline-flex w-full items-center justify-center gap-2 sm:w-auto" onClick={() => setMobileMode('logs')}>
          <FileText className="h-4 w-4" /> View logs
        </button>
      </div>
    </form>
  ) : null;

  return (
    <div className="space-y-6">
      <header className="ui-card p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">子应用权限与额度</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">管理每个用户可访问的应用、App 内角色、默认额度、单独额度和当前用量。</p>
          </div>
          <button type="button" onClick={load} className="ui-button-secondary inline-flex items-center justify-center gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-6">
          <label className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input className="pl-10" placeholder="Search user or email" value={filters.user_search} onChange={(event) => setFilters({ ...filters, user_search: event.target.value })} />
          </label>
          <label className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input className="pl-10" placeholder="Search app" value={filters.app_search} onChange={(event) => setFilters({ ...filters, app_search: event.target.value })} />
          </label>
          <select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}>
            <option value="all">All roles</option>
            {filtersMeta.roles.map((role: string) => <option key={role} value={role}>{role}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={filters.plan} onChange={(event) => setFilters({ ...filters, plan: event.target.value })}>
            <option value="all">All plans</option>
            {filtersMeta.plans.map((plan: string) => <option key={plan} value={plan}>{plan}</option>)}
          </select>
          <select value={filters.app_group} onChange={(event) => setFilters({ ...filters, app_group: event.target.value })}>
            <option value="all">All app groups</option>
            {filtersMeta.app_groups.map((group: string) => <option key={group} value={group}>{group}</option>)}
          </select>
          <button type="button" className="ui-button-secondary" onClick={() => bulkUpdate('enable')}>Batch enable</button>
          <button type="button" className="ui-button-secondary" onClick={() => bulkUpdate('disable')}>Batch close</button>
          <button type="button" className="ui-button-secondary" onClick={() => bulkUpdate('apply_quota')}>Batch quota</button>
          <button type="button" className="ui-button-secondary inline-flex items-center justify-center gap-2" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </header>

      {renderStats()}

      <div className="hidden md:block">
        <div className="ui-card overflow-hidden">
          {users.length === 0 || apps.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
              当前没有符合筛选条件的用户或子应用。
              <button type="button" className="ml-3 font-semibold text-[var(--primary)]" onClick={clearFilters}>Clear filters</button>
            </div>
          ) : (
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-30 w-[280px] border-b border-r border-[var(--border)] bg-[var(--surface)] p-3">
                      <label className="flex items-center gap-3">
                        <input type="checkbox" checked={users.length > 0 && users.every((user: any) => selectedUsers[user.uuid])} onChange={(event) => {
                          const next: Record<string, boolean> = {};
                          if (event.target.checked) users.forEach((user: any) => { next[user.uuid] = true; });
                          setSelectedUsers(next);
                        }} />
                        User
                      </label>
                    </th>
                    {apps.map((app: any) => (
                      <th key={app.app_id} className="sticky top-0 z-20 w-[108px] border-b border-r border-[var(--border)] bg-[var(--surface)] p-3 text-center">
                        <label className="flex flex-col items-center gap-2">
                          <input type="checkbox" checked={!!selectedApps[app.app_id]} onChange={(event) => setSelectedApps({ ...selectedApps, [app.app_id]: event.target.checked })} />
                          <span title={app.app_name} className={`max-w-[86px] truncate font-bold ${app.status !== 'active' ? 'text-[var(--text-tertiary)]' : 'text-[var(--primary)]'}`}>{app.short_name}</span>
                          <span className="max-w-[86px] truncate text-[10px] text-[var(--text-tertiary)]">{app.app_group}</span>
                        </label>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any) => {
                    const user = users.find((item: any) => item.uuid === row.user_id);
                    return (
                      <tr key={row.user_id} className="group hover:bg-[var(--surface-alt)]">
                        <td className="sticky left-0 z-10 border-b border-r border-[var(--border)] bg-[var(--surface)] p-3 group-hover:bg-[var(--surface-alt)]">
                          <label className="flex min-w-0 items-start gap-3">
                            <input type="checkbox" checked={!!selectedUsers[row.user_id]} onChange={(event) => setSelectedUsers({ ...selectedUsers, [row.user_id]: event.target.checked })} />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-[var(--text-primary)]">{user?.username}</span>
                              <span className="block truncate text-xs text-[var(--text-secondary)]">{user?.email || user?.name}</span>
                              <span className="mt-2 flex flex-wrap gap-1">
                                <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]">{user?.role || 'user'}</span>
                                <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{user?.plan}</span>
                                <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{user?.status}</span>
                              </span>
                            </span>
                          </label>
                        </td>
                        {row.cells.map((cell: PermissionCell) => (
                          <td key={`${cell.user_id}-${cell.app_id}`} className="border-b border-r border-[var(--border)] p-2 text-center">
                            <button type="button" onClick={() => openDetail(cell.user_id, cell.app_id)} className={`rounded-[12px] border p-2 transition hover:border-[var(--primary)] ${detail?.user?.uuid === cell.user_id && detail?.app?.app_id === cell.app_id ? 'border-[var(--primary)]' : 'border-transparent'}`}>
                              <CellBadge cell={cell} />
                            </button>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span>Legend:</span>
          {['ON', 'ON*', '90%', '超额', 'OFF'].map((item) => <span key={item} className="rounded-full border border-[var(--border)] px-2 py-1">{item}</span>)}
          <span>Selected: {selectedUserIds.length} users / {selectedAppIds.length} apps / {selectedCount} relations</span>
        </div>
      </div>

      <div className="md:hidden">
        {mobileMode === 'home' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['users', '按用户管理', Users],
                ['apps', '按应用管理', Layers],
                ['anomalies', '异常额度', AlertTriangle],
                ['logs', '最近操作', Activity],
              ].map(([mode, label, Icon]: any) => (
                <button key={mode} type="button" className="ui-card-subtle min-h-[104px] p-4 text-left" onClick={() => setMobileMode(mode)}>
                  <Icon className="mb-3 h-5 w-5 text-[var(--primary)]" />
                  <span className="font-semibold text-[var(--text-primary)]">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button type="button" className="ui-button-secondary mb-4" onClick={() => setMobileMode('home')}>Back</button>
        )}

        {mobileMode === 'users' ? (
          <div className="space-y-3">
            {users.map((user: any) => {
              const row = rows.find((item: any) => item.user_id === user.uuid);
              const enabled = row?.cells.filter((cell: PermissionCell) => cell.enabled).length || 0;
              const exceeded = row?.cells.filter((cell: PermissionCell) => cell.status === 'exceeded').length || 0;
              return (
                <div key={user.uuid} className="ui-card p-4">
                  <p className="font-semibold text-[var(--text-primary)]">{user.username}</p>
                  <p className="mt-1 break-all text-sm text-[var(--text-secondary)]">{user.email || user.name}</p>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">role: {user.role} · plan: {user.plan}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">Enabled {enabled} / {apps.length} apps · Exceeded {exceeded}</p>
                  <div className="mt-3 grid gap-2">
                    {row?.cells.map((cell: PermissionCell) => {
                      const app = apps.find((item: any) => item.app_id === cell.app_id);
                      return (
                        <button key={cell.app_id} className="ui-card-subtle flex items-center justify-between gap-3 p-3 text-left" onClick={() => openDetail(cell.user_id, cell.app_id)}>
                          <span>
                            <span className="block font-semibold text-[var(--text-primary)]">{app?.app_name}</span>
                            <span className="text-xs text-[var(--text-secondary)]">{cell.has_override ? 'Override' : cell.quota_source}</span>
                          </span>
                          <CellBadge cell={cell} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {mobileMode === 'apps' ? (
          <div className="space-y-3">
            {apps.map((app: any) => {
              const cells = rows.flatMap((row: any) => row.cells).filter((cell: PermissionCell) => cell.app_id === app.app_id);
              return (
                <div key={app.app_id} className="ui-card p-4">
                  <p className="font-semibold text-[var(--text-primary)]">{app.app_name}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{app.app_id} · {app.app_group}</p>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">Enabled {cells.filter((cell: PermissionCell) => cell.enabled).length} / {users.length} · Near {cells.filter((cell: PermissionCell) => cell.status === 'near_limit').length} · Exceeded {cells.filter((cell: PermissionCell) => cell.status === 'exceeded').length}</p>
                  <div className="mt-3 grid gap-2">
                    {cells.map((cell: PermissionCell) => {
                      const user = users.find((item: any) => item.uuid === cell.user_id);
                      return (
                        <button key={`${cell.user_id}-${app.app_id}`} className="ui-card-subtle flex items-center justify-between gap-3 p-3 text-left" onClick={() => openDetail(cell.user_id, cell.app_id)}>
                          <span className="font-semibold text-[var(--text-primary)]">{user?.username}</span>
                          <CellBadge cell={cell} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {mobileMode === 'anomalies' ? (
          <div className="space-y-3">
            {anomalies.length === 0 ? <div className="ui-card p-4 text-sm text-[var(--text-secondary)]">当前没有异常额度。</div> : anomalies.map((item: any) => (
              <button key={`${item.cell.user_id}-${item.cell.app_id}`} className="ui-card flex w-full items-center justify-between gap-3 p-4 text-left" onClick={() => openDetail(item.cell.user_id, item.cell.app_id)}>
                <span>
                  <span className="block font-semibold text-[var(--text-primary)]">{item.user?.username} / {item.app?.app_name}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{item.cell.quotas[0]?.used || 0} / {formatLimit(item.cell.quotas[0]?.limit)}</span>
                </span>
                <CellBadge cell={item.cell} />
              </button>
            ))}
          </div>
        ) : null}

        {mobileMode === 'logs' ? (
          <div className="space-y-3">
            {logs.length === 0 ? <div className="ui-card p-4 text-sm text-[var(--text-secondary)]">当前没有 permission 相关操作日志。</div> : logs.map((log: any, index) => (
              <div key={`${log.created_at}-${index}`} className="ui-card p-4">
                <p className="font-semibold text-[var(--text-primary)]">{log.action}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{log.created_at} · {log.success ? 'success' : 'failed'}</p>
                <pre className="mt-2 max-h-28 overflow-auto text-xs text-[var(--text-tertiary)]">{log.detail}</pre>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {typeof document !== 'undefined' ? createPortal(
        <div className="dashboard-theme">
          <AnimatePresence>
            {detail ? (
              <>
                <motion.aside
                  initial={{ x: 420 }}
                  animate={{ x: 0 }}
                  exit={{ x: 420 }}
                  className="fixed bottom-0 right-0 top-0 z-[9999] hidden w-[420px] overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl md:block"
                >
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Permission detail</p>
                      <h2 className="mt-2 text-xl font-bold text-[var(--text-primary)]">{detail.user.username} / {detail.app.short_name}</h2>
                    </div>
                    <button type="button" className="ui-icon-button" onClick={() => setDetail(null)}><X className="h-5 w-5" /></button>
                  </div>
                  {renderDetailForm(false)}
                </motion.aside>
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  className="fixed inset-0 z-[9999] h-dvh w-screen overflow-y-auto overscroll-contain bg-[var(--bg)] px-4 py-16 md:hidden"
                  onTouchMove={(event) => event.stopPropagation()}
                  onWheel={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    aria-label="Close permission detail"
                    className="ui-icon-button fixed right-4 top-4 z-[10000] shadow-lg"
                    onClick={() => setDetail(null)}
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className="ui-auth-card mx-auto mb-8 w-full max-w-[520px] p-5">
                    <div className="mb-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Permission detail</p>
                      <h2 className="mt-2 text-xl font-bold text-[var(--text-primary)]">编辑额度</h2>
                      <p className="mt-2 break-words text-sm text-[var(--text-secondary)]">{detail.user.username} / {detail.app.short_name}</p>
                    </div>
                    {renderDetailForm(true)}
                  </div>
                </motion.div>
              </>
            ) : null}
          </AnimatePresence>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
