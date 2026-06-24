import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  ExternalLink,
  KeyRound,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DatePicker from './DatePicker';
import testIdentityDocsMarkdown from '../Subapp-Docs子应用配置文档/测试身份适配指南.md?raw';

const API_BASE = '';

const DATA_SCOPE_LABELS: Record<string, string> = {
  public_read: 'Public read',
  public_write: 'Public write',
  private_read: 'Private read',
  private_write: 'Private write',
};

const DATA_SCOPE_HINTS: Record<string, string> = {
  public_read: 'Includes private_read',
  public_write: 'Includes private_read / private_write',
  private_read: 'Private read only',
  private_write: 'Includes private_read',
};

const ROLE_OPTIONS = ['user', 'admin'];
const DATA_SCOPE_OPTIONS = ['public_read', 'public_write', 'private_read', 'private_write'];

type AuthFetch = (path: string, options?: any) => Promise<Response>;

type TestIdentityForm = {
  name: string;
  display_name: string;
  role: string;
  allowed_subapps: string[];
  target_default_subapp: string;
  expires_at: string;
  session_ttl_minutes: number;
  one_time_token_ttl_seconds: string;
  data_scope: string;
  max_api_calls_per_session: string;
  notes: string;
};

function defaultExpiresDate() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateToEndOfDayIso(value: string) {
  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function emptyForm(apps: any[]): TestIdentityForm {
  const firstApp = apps[0]?.app_id || '';
  return {
    name: '',
    display_name: '',
    role: 'user',
    allowed_subapps: firstApp ? [firstApp] : [],
    target_default_subapp: firstApp,
    expires_at: defaultExpiresDate(),
    session_ttl_minutes: 30,
    one_time_token_ttl_seconds: '60',
    data_scope: 'public_read',
    max_api_calls_per_session: '',
    notes: '',
  };
}

function formFromIdentity(identity: any): TestIdentityForm {
  return {
    name: identity?.name || '',
    display_name: identity?.display_name || '',
    role: identity?.role || 'user',
    allowed_subapps: identity?.allowed_subapps || [],
    target_default_subapp: identity?.target_default_subapp || '',
    expires_at: identity?.expires_at ? identity.expires_at.slice(0, 10) : defaultExpiresDate(),
    session_ttl_minutes: Number(identity?.session_ttl_minutes || 30),
    one_time_token_ttl_seconds: String(identity?.one_time_token_ttl_seconds || 60),
    data_scope: identity?.data_scope || 'public_read',
    max_api_calls_per_session: identity?.max_api_calls_per_session == null ? '' : String(identity.max_api_calls_per_session),
    notes: identity?.notes || '',
  };
}

function riskReasons(form: Pick<TestIdentityForm, 'data_scope' | 'role' | 'session_ttl_minutes' | 'allowed_subapps' | 'expires_at'>) {
  const reasons: string[] = [];
  if (form.data_scope === 'public_write') reasons.push('public_write can modify public resources.');
  if (form.data_scope === 'private_read') reasons.push('private_read can read real user content.');
  if (form.data_scope === 'private_write') reasons.push('private_write can modify real app data.');
  if (form.role === 'admin') reasons.push('role=admin 会被子应用识别为管理员。');
  if (Number(form.session_ttl_minutes) > 60) reasons.push('测试 session 超过 60 分钟。');
  if (form.allowed_subapps.includes('*')) reasons.push('允许访问全部应用。');
  if (new Date(`${form.expires_at}T23:59:59`).getTime() - Date.now() > 7 * 86400 * 1000) {
    reasons.push('有效期超过 7 天。');
  }
  return reasons;
}

function CopyButton({ text, label = 'Copy' }: { text?: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (!text) return;
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }).catch(() => null);
      }}
      className="ui-icon-button shrink-0"
      aria-label={label}
      title={label}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Clipboard className="h-4 w-4" />}
    </button>
  );
}

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

function ModalShell({
  children,
  maxWidth = 'max-w-3xl',
  mobileMode = 'sheet',
  onClose,
}: {
  children: React.ReactNode;
  maxWidth?: string;
  mobileMode?: 'sheet' | 'full';
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;
  const fullMobile = mobileMode === 'full';
  return createPortal(
    <div
      data-theme={getPortalTheme()}
      className={`dashboard-theme fixed inset-0 z-[2147483647] flex justify-center overscroll-none bg-black/55 backdrop-blur-md sm:items-center sm:p-4 ${fullMobile ? 'items-stretch p-0' : 'items-end p-2 sm:p-4'}`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        className={`relative w-full overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:w-full ${maxWidth} sm:rounded-[1.75rem] ${fullMobile ? 'h-[100dvh] rounded-none' : 'max-h-[96dvh] rounded-[1.75rem]'}`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-30 grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] shadow-lg hover:text-[var(--text-primary)]"
          aria-label="Close"
        >
          <XCircle className="h-5 w-5" />
        </button>
        <div className={`ui-modal-scroll touch-pan-y overscroll-contain overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-16 sm:max-h-[94dvh] sm:px-6 ${fullMobile ? 'h-full' : 'max-h-[96dvh]'}`}>
          {children}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{children}</label>;
}

function AppPicker({
  apps,
  value,
  onChange,
}: {
  apps: any[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState(false);
  const allSelected = value.includes('*');
  const selectedApps = allSelected ? [{ app_id: '*', name: '全部应用' }] : apps.filter((app) => value.includes(app.app_id));
  const filteredApps = apps.filter((app) => `${app.app_id || ''} ${app.name || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const visibleApps = expanded ? filteredApps : filteredApps.slice(0, 6);

  const toggleApp = (appId: string) => {
    if (appId === '*') {
      onChange(allSelected ? [] : ['*']);
      return;
    }
    if (allSelected) onChange([appId]);
    else if (value.includes(appId)) onChange(value.filter((id) => id !== appId));
    else onChange([...value, appId]);
  };

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-soft)] p-3">
      <div className="flex flex-wrap gap-2">
        {selectedApps.length ? selectedApps.map((app) => (
          <span key={app.app_id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            <span className="truncate">{app.app_id === '*' ? '全部应用' : app.app_id}</span>
            <button type="button" onClick={() => toggleApp(app.app_id)} className="rounded-full p-0.5 hover:bg-blue-200" aria-label="Remove app">
              <X className="h-3 w-3" />
            </button>
          </span>
        )) : <span className="text-sm text-[var(--text-tertiary)]">请选择应用</span>}
      </div>
      <div className="relative">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索应用" className="ui-input w-full pr-9" />
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => toggleApp('*')}
          className={`flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2 text-sm font-semibold ${
            allSelected ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]'
          }`}
        >
          全部应用
          {allSelected ? <Check className="h-4 w-4" /> : null}
        </button>
        {visibleApps.map((app) => {
          const checked = !allSelected && value.includes(app.app_id);
          return (
            <button
              key={app.app_id}
              type="button"
              onClick={() => toggleApp(app.app_id)}
              className={`flex min-w-0 items-center justify-between gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm font-semibold ${
                checked ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]'
              }`}
            >
              <span className="min-w-0 break-all">{app.app_id}</span>
              {checked ? <Check className="h-4 w-4 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
      {filteredApps.length > 6 ? (
        <button type="button" onClick={() => setExpanded((current) => !current)} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600">
          {expanded ? '收起' : `展开 ${filteredApps.length - 6} 个`}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      ) : null}
    </div>
  );
}

function SecretPanel({ result, onClose }: { result: any; onClose: () => void }) {
  if (!result) return null;
  return (
    <ModalShell onClose={onClose} maxWidth="max-w-5xl">
      <div className="space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">Test Secret</p>
          <h3 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">测试登录命令</h3>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
          secret 可在详情页再次复制。不要提交到代码、日志或公开聊天。
        </div>
        {result.secret ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-soft)] p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--text-tertiary)]">Secret</p>
              <p className="mt-1 break-all font-mono text-sm text-[var(--text-primary)]">{result.secret}</p>
            </div>
            <div className="flex h-full items-center">
              <CopyButton text={result.secret} label="Copy secret" />
            </div>
          </div>
        ) : null}
        <pre className="ui-modal-scroll max-h-[32dvh] overflow-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-xs leading-6 text-[var(--text-primary)] sm:max-h-[46dvh]">{result.agent_command || ''}</pre>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => navigator.clipboard?.writeText(result.agent_command || '')} className="ui-button-primary inline-flex items-center justify-center gap-2 whitespace-nowrap">
            <Clipboard className="h-4 w-4" />复制命令
          </button>
          <button type="button" onClick={onClose} className="ui-button-secondary">完成</button>
        </div>
      </div>
    </ModalShell>
  );
}

function RiskDialog({ reasons, onCancel, onConfirm }: { reasons: string[]; onCancel: () => void; onConfirm: () => void }) {
  return (
    <ModalShell onClose={onCancel} maxWidth="max-w-xl">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-500">Risk confirmation</p>
            <h3 className="text-xl font-bold text-[var(--text-primary)]">确认风险</h3>
          </div>
        </div>
        <div className="space-y-2">
          {reasons.map((reason) => (
            <p key={reason} className="rounded-[var(--radius-md)] border border-red-100 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">{reason}</p>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onCancel} className="ui-button-secondary">取消</button>
          <button type="button" onClick={onConfirm} className="rounded-[var(--radius-md)] bg-red-600 px-4 py-3 font-semibold text-white shadow-lg shadow-red-900/20 hover:bg-red-500">
            确认
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function DeleteDialog({ item, onCancel, onConfirm }: { item: any; onCancel: () => void; onConfirm: () => void }) {
  return (
    <ModalShell onClose={onCancel} maxWidth="max-w-lg">
      <div className="space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-500">Delete</p>
          <h3 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">删除 @{item?.name}</h3>
        </div>
        <p className="text-sm leading-6 text-[var(--text-secondary)]">删除后 secret 不可用，并撤销全部 session。</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onCancel} className="ui-button-secondary">取消</button>
          <button type="button" onClick={onConfirm} className="rounded-[var(--radius-md)] bg-red-600 px-4 py-3 font-semibold text-white shadow-lg shadow-red-900/20 hover:bg-red-500">删除</button>
        </div>
      </div>
    </ModalShell>
  );
}

function EditAccessDialog({
  identity,
  apps,
  onCancel,
  onSave,
}: {
  identity: any;
  apps: any[];
  onCancel: () => void;
  onSave: (form: TestIdentityForm) => void;
}) {
  const [form, setForm] = React.useState<TestIdentityForm>(() => formFromIdentity(identity));
  return (
    <ModalShell onClose={onCancel} maxWidth="max-w-4xl" mobileMode="full">
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(form);
        }}
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">Access</p>
          <h3 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">修改权限</h3>
        </div>
        <div className="space-y-2">
          <FieldLabel>Apps</FieldLabel>
          <AppPicker
            apps={apps}
            value={form.allowed_subapps}
            onChange={(next) => setForm({
              ...form,
              allowed_subapps: next,
              target_default_subapp: next.includes('*')
                ? form.target_default_subapp
                : next.includes(form.target_default_subapp) ? form.target_default_subapp : next[0] || '',
            })}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel>Data Scope</FieldLabel>
          <select value={form.data_scope} onChange={(event) => setForm({ ...form, data_scope: event.target.value })} className="ui-input w-full">
            {DATA_SCOPE_OPTIONS.map((scope) => <option key={scope} value={scope}>{DATA_SCOPE_LABELS[scope]}</option>)}
          </select>
          <p className="text-xs text-[var(--text-tertiary)]">{DATA_SCOPE_HINTS[form.data_scope]}</p>
        </div>
        <div className="space-y-2">
          <FieldLabel>API per session</FieldLabel>
          <input
            value={form.max_api_calls_per_session}
            onChange={(event) => setForm({ ...form, max_api_calls_per_session: event.target.value })}
            className="ui-input w-full"
            placeholder="留空则无限"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onCancel} className="ui-button-secondary">取消</button>
          <button type="submit" className="ui-button-primary">Save</button>
        </div>
      </form>
    </ModalShell>
  );
}

function TestIdentityCard({
  item,
  onRotate,
  onToggleStatus,
  onRevoke,
  onDelete,
}: {
  item: any;
  onRotate: () => void;
  onToggleStatus: () => void;
  onRevoke: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="ui-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link to={`/dev/@${item.name}`} className="inline-flex max-w-full items-center gap-2 text-xl font-bold text-blue-600 hover:text-blue-500">
            <span className="min-w-0 break-all">@{item.name}</span>
            <ExternalLink className="h-4 w-4 shrink-0 opacity-60" />
          </Link>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-3 py-1 font-semibold ${item.status === 'disabled' ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'}`}>{item.status}</span>
            <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">{item.role}</span>
            <span className="rounded-full bg-purple-50 px-3 py-1 font-semibold text-purple-700">{DATA_SCOPE_LABELS[item.data_scope] || item.data_scope}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-tertiary)] sm:grid-cols-4 lg:text-right">
          <div><p>Session</p><p className="font-semibold text-[var(--text-primary)]">{item.session_ttl_minutes}m</p></div>
          <div><p>Active</p><p className="font-semibold text-[var(--text-primary)]">{item.active_session_count || 0}</p></div>
          <div><p>API</p><p className="font-semibold text-[var(--text-primary)]">{item.api_call_count || 0}</p></div>
          <div><p>Expires</p><p className="font-semibold text-[var(--text-primary)]">{formatDate(item.expires_at)}</p></div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(item.allowed_subapps || []).map((app: string) => <span key={app} className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">{app}</span>)}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-4">
        <button type="button" onClick={onRotate} className="ui-button-secondary">换 secret</button>
        <button type="button" onClick={onRevoke} className="ui-button-secondary">撤销 session</button>
        <button type="button" onClick={onToggleStatus} className="ui-button-secondary">{item.status === 'disabled' ? '启用' : '禁用'}</button>
        <button type="button" onClick={onDelete} className="rounded-[var(--radius-md)] border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
          <Trash2 className="mr-1 inline h-4 w-4" />删除
        </button>
      </div>
    </motion.div>
  );
}

export function TestAccess({ authFetch, apps }: { authFetch: AuthFetch; apps: any[] }) {
  const [items, setItems] = React.useState<any[]>([]);
  const [form, setForm] = React.useState<TestIdentityForm>(() => emptyForm(apps));
  const [secretResult, setSecretResult] = React.useState<any>(null);
  const [pendingRisk, setPendingRisk] = React.useState<{ reasons: string[]; action: () => void } | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<any>(null);
  const [editTarget, setEditTarget] = React.useState<any>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const modalOpen = Boolean(secretResult || pendingRisk || deleteTarget || editTarget);
  useBodyScrollLock(modalOpen);

  React.useEffect(() => {
    setForm((current) => current.allowed_subapps.length ? current : emptyForm(apps));
  }, [apps]);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await authFetch('/api/admin/test-identities');
      const data = await res.json();
      if (res.ok) setItems(data.test_identities || []);
    } finally {
      setRefreshing(false);
    }
  }, [authFetch]);

  React.useEffect(() => { void load(); }, [load]);

  const submitCreateNow = async () => {
    const res = await authFetch('/api/admin/test-identities', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        expires_at: dateToEndOfDayIso(form.expires_at),
        one_time_token_ttl_seconds: form.one_time_token_ttl_seconds ? Number(form.one_time_token_ttl_seconds) : 60,
        max_api_calls_per_session: form.max_api_calls_per_session ? Number(form.max_api_calls_per_session) : null,
        allowed_ip_ranges: [],
      }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Create failed');
    setSecretResult(data);
    setForm(emptyForm(apps));
    setPendingRisk(null);
    await load();
  };

  const submitCreate = () => {
    const reasons = riskReasons(form);
    if (reasons.length) {
      setPendingRisk({ reasons, action: submitCreateNow });
      return;
    }
    void submitCreateNow();
  };

  const saveAccessNow = async (target: any, next: TestIdentityForm) => {
    const res = await authFetch(`/api/admin/test-identities/${target.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        role: next.role,
        allowed_subapps: next.allowed_subapps,
        target_default_subapp: next.target_default_subapp,
        data_scope: next.data_scope,
        max_api_calls_per_session: next.max_api_calls_per_session ? Number(next.max_api_calls_per_session) : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Save failed');
    setEditTarget(null);
    setPendingRisk(null);
    await load();
  };

  const requestSaveAccess = (next: TestIdentityForm) => {
    if (!editTarget) return;
    const reasons = riskReasons(next);
    if (reasons.length) {
      const target = editTarget;
      setPendingRisk({ reasons, action: () => saveAccessNow(target, next) });
      return;
    }
    void saveAccessNow(editTarget, next);
  };

  const action = async (item: any, path: string, method = 'POST') => {
    const res = await authFetch(path, { method });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Action failed');
    if (data.secret || data.agent_command) setSecretResult(data);
    await load();
  };

  const selectedTargetApps = form.allowed_subapps.includes('*') ? apps : apps.filter((app) => form.allowed_subapps.includes(app.app_id));

  return (
    <div className="space-y-8 pb-10">
      <header className="ui-card p-4 md:p-7">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">Test Access</p>
            <h1 className="mt-1 truncate text-2xl font-bold text-[var(--text-primary)] md:text-3xl">测试身份</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            {refreshing ? <span className="text-xs text-[var(--text-tertiary)]">Refreshing...</span> : null}
            <Link to="/dev/docs" className="ui-button-secondary whitespace-nowrap">Docs View</Link>
          </div>
        </div>
      </header>

      <div className="grid gap-8 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={(event) => { event.preventDefault(); submitCreate(); }} className="ui-card p-5 md:p-6">
          <h2 className="mb-5 flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
            <KeyRound className="h-5 w-5 text-blue-500" />创建测试身份
          </h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <FieldLabel>Name</FieldLabel>
              <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="ui-input w-full" />
            </div>
            <div className="space-y-2">
              <FieldLabel>Display Name</FieldLabel>
              <input value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} className="ui-input w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <FieldLabel>Role</FieldLabel>
                <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="ui-input w-full">
                  {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel>Data Scope</FieldLabel>
                <select value={form.data_scope} onChange={(event) => setForm({ ...form, data_scope: event.target.value })} className="ui-input w-full">
                  {DATA_SCOPE_OPTIONS.map((scope) => <option key={scope} value={scope}>{DATA_SCOPE_LABELS[scope]}</option>)}
                </select>
                <p className="text-xs text-[var(--text-tertiary)]">{DATA_SCOPE_HINTS[form.data_scope]}</p>
              </div>
            </div>
            <div className="space-y-2">
              <FieldLabel>Apps</FieldLabel>
              <AppPicker
                apps={apps}
                value={form.allowed_subapps}
                onChange={(next) => setForm({
                  ...form,
                  allowed_subapps: next,
                  target_default_subapp: next.includes('*')
                    ? form.target_default_subapp
                    : next.includes(form.target_default_subapp) ? form.target_default_subapp : next[0] || '',
                })}
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>默认目标应用</FieldLabel>
              <select value={form.target_default_subapp} onChange={(event) => setForm({ ...form, target_default_subapp: event.target.value })} className="ui-input w-full">
                <option value="">不预设</option>
                {selectedTargetApps.map((app) => <option key={app.app_id} value={app.app_id}>{app.app_id}</option>)}
              </select>
              <p className="text-xs leading-5 text-[var(--text-tertiary)]">生成命令时预填 target_subapp。</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <FieldLabel>Expires</FieldLabel>
                <DatePicker value={form.expires_at} onChange={(value) => setForm({ ...form, expires_at: value })} placeholder="选择日期" />
              </div>
              <div className="space-y-2">
                <FieldLabel>Session</FieldLabel>
                <select value={form.session_ttl_minutes} onChange={(event) => setForm({ ...form, session_ttl_minutes: Number(event.target.value) })} className="ui-input w-full">
                  {[5, 15, 30, 60, 120].map((ttl) => <option key={ttl} value={ttl}>{ttl} 分钟</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>URL 秒数</FieldLabel>
                <input value={form.one_time_token_ttl_seconds} onChange={(event) => setForm({ ...form, one_time_token_ttl_seconds: event.target.value })} className="ui-input w-full" />
              </div>
              <div className="space-y-2">
                <FieldLabel>API per session</FieldLabel>
                <input value={form.max_api_calls_per_session} onChange={(event) => setForm({ ...form, max_api_calls_per_session: event.target.value })} className="ui-input w-full" />
              </div>
            </div>
            <p className="-mt-2 text-xs text-[var(--text-tertiary)]">API per session 留空则无限。</p>
            <div className="space-y-2">
              <FieldLabel>Notes</FieldLabel>
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="ui-input min-h-[88px] w-full" />
            </div>
            <button type="submit" className="ui-button-primary w-full">创建测试身份</button>
          </div>
        </form>

        <div className="space-y-4">
          {!refreshing && items.length === 0 ? <div className="ui-card p-6 text-[var(--text-tertiary)]">暂无测试身份。</div> : null}
          {items.map((item) => (
            <TestIdentityCard
              key={item.id}
              item={item}
              onRotate={() => action(item, `/api/admin/test-identities/${item.id}/rotate-secret`)}
              onToggleStatus={() => action(item, `/api/admin/test-identities/${item.id}/${item.status === 'disabled' ? 'enable' : 'disable'}`)}
              onRevoke={() => action(item, `/api/admin/test-identities/${item.id}/revoke-sessions`)}
              onDelete={() => setDeleteTarget(item)}
            />
          ))}
        </div>
      </div>

      <AnimatePresence>
        {editTarget ? <EditAccessDialog identity={editTarget} apps={apps} onCancel={() => setEditTarget(null)} onSave={requestSaveAccess} /> : null}
        {secretResult ? <SecretPanel result={secretResult} onClose={() => setSecretResult(null)} /> : null}
        {pendingRisk ? <RiskDialog reasons={pendingRisk.reasons} onCancel={() => setPendingRisk(null)} onConfirm={() => pendingRisk.action()} /> : null}
        {deleteTarget ? (
          <DeleteDialog
            item={deleteTarget}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => {
              const target = deleteTarget;
              setDeleteTarget(null);
              void action(target, `/api/admin/test-identities/${target.id}`, 'DELETE');
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function IdentityActivity({ identity, activity }: { identity: any; activity: any }) {
  return (
    <div className="space-y-5">
      {activity?.secret || activity?.agent_command ? (
        <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-soft)] p-4">
          {activity?.secret ? (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--text-tertiary)]">Secret</p>
                <p className="mt-1 break-all font-mono text-sm text-[var(--text-primary)]">{activity.secret}</p>
              </div>
              <CopyButton text={activity.secret} label="Copy secret" />
            </div>
          ) : null}
          {activity?.agent_command ? (
            <pre className="ui-modal-scroll max-h-[260px] overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-6 text-[var(--text-primary)]">{activity.agent_command}</pre>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['状态', identity.status],
          ['Apps', (identity.allowed_subapps || []).join(', ')],
          ['data_scope', DATA_SCOPE_LABELS[identity.data_scope] || identity.data_scope],
          ['API 调用', activity?.api_call_count || 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-soft)] p-4">
            <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
            <p className="mt-2 break-words text-sm font-bold text-[var(--text-primary)]">{value as any}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ActivityBlock title="Usage by subapp" empty="暂无使用记录。">
          {(activity?.usage_by_subapp || []).map((row: any) => (
            <div key={row.subapp} className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              <span className="min-w-0 break-all">{row.subapp}</span><span className="shrink-0 pl-3">{row.calls}</span>
            </div>
          ))}
        </ActivityBlock>
        <ActivityBlock title="Usage by session" empty="暂无 session 聚合。">
          {(activity?.usage_by_session || []).map((row: any) => (
            <div key={row.session_id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              <span className="min-w-0 break-all font-mono">{row.session_id}</span><span className="shrink-0">{row.calls}</span>
            </div>
          ))}
        </ActivityBlock>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ActivityBlock title="Recent sessions" empty="暂无 session。">
          {(activity?.recent_sessions || []).map((row: any) => (
            <div key={row.id} className="rounded-[var(--radius-md)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              <p className="break-all font-mono">{row.id}</p>
              <p className="break-all">{row.target_subapp || '-'} · {row.status} · expires {formatDate(row.expires_at)}</p>
            </div>
          ))}
        </ActivityBlock>
        <ActivityBlock title="Recent audit logs" empty="暂无日志。">
          {(activity?.recent_audit_logs || []).map((row: any) => (
            <div key={row.id} className="grid gap-2 rounded-[var(--radius-md)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--text-secondary)] sm:grid-cols-[1fr_auto_auto]">
              <span className="break-all">{row.event_type}</span><span className="break-all">{row.target_subapp || '-'}</span><span>{formatDate(row.created_at)}</span>
            </div>
          ))}
        </ActivityBlock>
      </div>
    </div>
  );
}

function ActivityBlock({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const list = React.Children.toArray(children);
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <h4 className="mb-3 font-bold text-[var(--text-primary)]">{title}</h4>
      <div className="space-y-2">
        {list.length === 0 ? <p className="text-sm text-[var(--text-tertiary)]">{empty}</p> : list}
      </div>
    </div>
  );
}

function MarkdownView({ markdown }: { markdown: string }) {
  const blocks: Array<{ type: 'code' | 'text'; content: string }> = [];
  let inCode = false;
  let buffer: string[] = [];
  const flush = (type: 'code' | 'text') => {
    const content = buffer.join('\n').trim();
    if (content) blocks.push({ type, content });
    buffer = [];
  };
  for (const line of markdown.split('\n')) {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        flush('code');
        inCode = false;
      } else {
        flush('text');
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      buffer.push(line);
      continue;
    }
    if (!line.trim()) {
      flush('text');
      continue;
    }
    buffer.push(line);
  }
  flush(inCode ? 'code' : 'text');
  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (block.type === 'code') {
          return <pre key={index} className="ui-modal-scroll overflow-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-xs leading-6 text-[var(--text-primary)]">{block.content}</pre>;
        }
        const text = block.content.trim();
        if (!text) return null;
        if (text.startsWith('# ')) return <h1 key={index} className="text-3xl font-bold text-[var(--text-primary)]">{text.slice(2)}</h1>;
        if (text.startsWith('## ')) return <h2 key={index} className="pt-3 text-2xl font-bold text-[var(--text-primary)]">{text.slice(3)}</h2>;
        if (text.startsWith('### ')) return <h3 key={index} className="pt-2 text-xl font-bold text-[var(--text-primary)]">{text.slice(4)}</h3>;
        if (/^[-*] /.test(text) || /^\d+\. /.test(text)) {
          return (
            <ul key={index} className="space-y-2 pl-5 text-sm leading-7 text-[var(--text-secondary)]">
              {text.split('\n').map((line) => <li key={line} className="list-disc">{renderInlineMarkdown(line.replace(/^[-*] |\d+\. /, ''))}</li>)}
            </ul>
          );
        }
        return <p key={index} className="text-sm leading-7 text-[var(--text-secondary)]">{renderInlineMarkdown(text)}</p>;
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="rounded bg-[var(--surface-soft)] px-1.5 py-0.5 font-mono text-xs text-blue-700">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold text-[var(--text-primary)]">{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

export function TestIdentityDocsPage() {
  const navigate = useNavigate();
  return (
    <div data-theme="light" className="dashboard-theme min-h-dvh bg-[var(--bg)] p-4 text-[var(--text-primary)] md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <button type="button" onClick={() => navigate(-1)} className="ui-button-secondary inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />返回
        </button>
        <article className="ui-card p-5 md:p-8">
          <MarkdownView markdown={testIdentityDocsMarkdown} />
        </article>
      </div>
    </div>
  );
}

export function TestIdentityDevPage() {
  const params = useParams();
  const navigate = useNavigate();
  const name = String(params.name || '').replace(/^@/, '');
  const [data, setData] = React.useState<any>(null);
  const [apps, setApps] = React.useState<any[]>([]);
  const [error, setError] = React.useState('');
  const [editOpen, setEditOpen] = React.useState(false);
  const [pendingRisk, setPendingRisk] = React.useState<{ reasons: string[]; action: () => void } | null>(null);
  const modalOpen = editOpen || Boolean(pendingRisk);
  useBodyScrollLock(modalOpen);

  const load = React.useCallback(async () => {
    const header = localStorage.getItem('sso_admin_auth') || '';
    try {
      const [identityRes, appsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/test-identities/by-name/${encodeURIComponent(name)}`, { headers: { Authorization: header } }),
        fetch(`${API_BASE}/admin/apps`, { headers: { Authorization: header } }),
      ]);
      const identityBody = await identityRes.json().catch(() => ({}));
      const appsBody = await appsRes.json().catch(() => ({}));
      if (!identityRes.ok) throw new Error(identityBody.error || 'Unable to load test identity');
      setData(identityBody);
      if (appsRes.ok) setApps(Array.isArray(appsBody) ? appsBody : (appsBody.apps || []));
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  }, [name]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const saveAccessNow = async (next: TestIdentityForm) => {
    if (!data?.test_identity) return;
    const header = localStorage.getItem('sso_admin_auth') || '';
    const res = await fetch(`${API_BASE}/api/admin/test-identities/${data.test_identity.id}`, {
      method: 'PUT',
      headers: { Authorization: header, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: next.role,
        allowed_subapps: next.allowed_subapps,
        target_default_subapp: next.target_default_subapp,
        data_scope: next.data_scope,
        max_api_calls_per_session: next.max_api_calls_per_session ? Number(next.max_api_calls_per_session) : null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return alert(body.error || 'Save failed');
    setEditOpen(false);
    setPendingRisk(null);
    await load();
  };

  const requestSaveAccess = (next: TestIdentityForm) => {
    const reasons = riskReasons(next);
    if (reasons.length) {
      setPendingRisk({ reasons, action: () => saveAccessNow(next) });
      return;
    }
    void saveAccessNow(next);
  };

  return (
    <div data-theme="light" className="dashboard-theme min-h-dvh bg-[var(--bg)] p-4 text-[var(--text-primary)] md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <button type="button" onClick={() => navigate(-1)} className="ui-button-secondary inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />返回
        </button>
        <header className="ui-card p-5 md:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">Test Identity</p>
              <h1 className="mt-2 break-all text-3xl font-bold text-[var(--text-primary)]">@{name}</h1>
            </div>
            {data?.test_identity ? <button type="button" onClick={() => setEditOpen(true)} className="ui-button-primary">修改</button> : null}
          </div>
        </header>
        {error ? <div className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 p-4 text-red-700">{error}</div> : null}
        {!data && !error ? <div className="ui-card p-5 text-[var(--text-tertiary)]">Loading...</div> : null}
        {data ? <IdentityActivity identity={data.test_identity} activity={{ ...(data.activity || {}), secret: data.secret, agent_command: data.agent_command }} /> : null}
      </div>
      <AnimatePresence>
        {editOpen && data?.test_identity ? (
          <EditAccessDialog identity={data.test_identity} apps={apps} onCancel={() => setEditOpen(false)} onSave={requestSaveAccess} />
        ) : null}
        {pendingRisk ? <RiskDialog reasons={pendingRisk.reasons} onCancel={() => setPendingRisk(null)} onConfirm={() => pendingRisk.action()} /> : null}
      </AnimatePresence>
    </div>
  );
}
