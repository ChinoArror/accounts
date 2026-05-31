import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, LayoutGrid, KeyRound, LogOut, CheckCircle2, XCircle, Plus, Trash2, Shield, Settings, Activity, BarChart3, PieChart, Clock, ExternalLink, Github, Zap, Globe, Database, Code2, Box, Layers, Cpu, Rocket, Star, Sparkles, Bot, Wifi, Lock, Palette, Ticket, Mail, Eye, EyeOff } from 'lucide-react';
import { Routes, Route, useNavigate, Link, useLocation, Navigate } from 'react-router-dom';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart as RePieChart, Pie, Cell, Legend } from 'recharts';
import UserProfile from './UserProfile';
import ChangePassword from './ChangePassword';
import SsoBinding from './SsoBinding';
import AppDetails from './AppDetails';
import AdminPasskeyManage from './AdminPasskeyManage';
import UserPasskeyManage from './UserPasskeyManage';
import { startAuthentication } from '@simplewebauthn/browser';
import { ThemeToggle, useThemeMode } from './theme';
import UserLogin from './UserLogin';
import UserHome from './UserHome';
import UserEditProfile from './UserEditProfile';
import SessionCenter from './SessionCenter';
import RegisterCodeManager from './RegisterCodeManager';
import PermissionMatrix from './PermissionMatrix';
import {
  AccountSecurityPage,
  AdminSecurityPage,
  EmailLoginPage,
  ForgotPasswordPage,
  LandingPage,
  RegisterEmailPage,
  ResetPasswordPage,
  VerifyEmailNoticePage,
} from './EmailAuthPages';

const API_BASE = ''; // Base URL for the worker (empty string to use the current origin)

// Consistent icon picker: same app_id always gets same icon
const APP_ICONS = [Zap, Globe, Database, Code2, Box, Layers, Cpu, Rocket, Star, Sparkles, Bot, Wifi, Lock, Palette, Shield, BarChart3] as const;
function getAppIcon(appId: string) {
  let hash = 0;
  for (let i = 0; i < appId.length; i++) hash = (hash * 31 + appId.charCodeAt(i)) >>> 0;
  return APP_ICONS[hash % APP_ICONS.length];
}

const NUMBER_UNITS = ['', 'K', 'M', 'G', 'T', 'P'];
const ACCESS_EVENT_TYPES = new Set(['page_view', 'login_success', 'sso_auto_login']);
const REGION_LABELS = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

function roundToTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatCompactNumber(value: number | string | null | undefined) {
  const numericValue = typeof value === 'string' ? Number(value) : value ?? 0;
  if (!Number.isFinite(numericValue)) return '0.00';

  let scaledValue = numericValue;
  let unitIndex = 0;
  while (Math.abs(scaledValue) >= 1000 && unitIndex < NUMBER_UNITS.length - 1) {
    scaledValue /= 1000;
    unitIndex += 1;
  }

  let roundedValue = roundToTwo(scaledValue);
  while (Math.abs(roundedValue) >= 1000 && unitIndex < NUMBER_UNITS.length - 1) {
    scaledValue = roundedValue / 1000;
    unitIndex += 1;
    roundedValue = roundToTwo(scaledValue);
  }

  return `${roundedValue.toFixed(2)}${NUMBER_UNITS[unitIndex]}`;
}

function formatPercent(value: number) {
  return `${roundToTwo(value).toFixed(2)}%`;
}

function normalizeAnalyticsPayload(payload: any) {
  return {
    ...payload,
    data: Array.isArray(payload?.data)
      ? payload.data.map((row: Record<string, unknown>) => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, typeof value === 'number' ? roundToTwo(value) : value])
      ))
      : []
  };
}

function isSupportedRegionCode(code: string) {
  return /^[A-Z]{2}$/.test(code) || /^\d{3}$/.test(code);
}

function getRegionLabel(code: string) {
  const normalizedCode = (code || '').toUpperCase();
  if (!normalizedCode || normalizedCode === 'UNKNOWN') return 'Unknown Region';
  if (!isSupportedRegionCode(normalizedCode)) return normalizedCode;
  try {
    return REGION_LABELS?.of(normalizedCode) || normalizedCode;
  } catch {
    return normalizedCode;
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read image file'));
    reader.readAsDataURL(file);
  });
}

function CountrySharePanel({ countries, topCountry, totalEvents }: { countries: Array<{ name: string; value: number }>; topCountry: string; totalEvents: number }) {
  const countryRows = countries.map((country) => {
    const code = String(country.name || '').toUpperCase();
    const percent = totalEvents > 0 ? (country.value / totalEvents) * 100 : 0;
    return {
      ...country,
      code,
      label: getRegionLabel(code),
      percent,
    };
  });

  return (
    <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-sm">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 mb-8">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Globe className="text-cyan-300 w-5 h-5" />
            Visitor Regions
          </h3>
          <p className="text-sm text-white/45 mt-2">
            Country-level request proportions for the last 7 days, led by {getRegionLabel(topCountry)}.
          </p>
        </div>
        <div className="text-sm text-white/35">
          Top {countryRows.length} countries by access-event share.
        </div>
      </div>

      {countryRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-white/40">
          No country-level visitor data is available yet.
        </div>
      ) : (
        <div className="space-y-4">
          {countryRows.map((country, index) => (
            <div key={`${country.code}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex w-2.5 h-2.5 rounded-full ${index === 0 ? 'bg-amber-400' : 'bg-cyan-400'}`}></span>
                    <span className="text-white font-medium truncate">{country.label}</span>
                    <span className="text-xs text-white/35">{country.code}</span>
                  </div>
                  <p className="text-xs text-white/35 mt-1">
                    {formatCompactNumber(country.value)} requests
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-white/85">{formatPercent(country.percent)}</p>
                  <p className="text-xs text-white/35">of total visits</p>
                </div>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full ${index === 0 ? 'bg-amber-400' : 'bg-cyan-400'}`}
                  style={{ width: `${Math.min(100, Math.max(country.percent, 2))}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const { theme, setTheme } = useThemeMode('dark');
  const [isLogged, setIsLogged] = useState(false);
  const [checkingAdminSession, setCheckingAdminSession] = useState(true);
  const [authHeader, setAuthHeader] = useState('');
  const [adminName, setAdminName] = useState('');
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Quota Modal
  const [quotaModal, setQuotaModal] = useState<any>(null);
  const [passwordModal, setPasswordModal] = useState<any>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // Stats state
  const [statsData, setStatsData] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // SSO Session Flow State
  const [ssoMode, setSsoMode] = useState(false);
  const [ssoAppId, setSsoAppId] = useState('');
  const [ssoRedirect, setSsoRedirect] = useState('');
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState('');

  // Check login state & Auto SSO Trigger
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const redirect = searchParams.get('redirect');
    const appId = searchParams.get('app_id') || searchParams.get('client_id');

    if (redirect && appId) {
      setSsoMode(true);
      setSsoAppId(appId);
      setSsoRedirect(redirect);
      setSsoLoading(true);
      checkSsoSession(appId, redirect);
    }

    const saved = localStorage.getItem('sso_admin_auth');
    if (saved) {
      setAuthHeader(saved);
      setIsLogged(true);
      setAdminName(localStorage.getItem('sso_admin_name') || 'Admin');
      setCheckingAdminSession(false);
    } else {
      fetch(`${API_BASE}/api/session`, { credentials: 'include' })
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.active && (data.user?.role === 'admin' || data.role === 'admin') && data.token) {
            const header = `Bearer ${data.token}`;
            localStorage.setItem('sso_admin_auth', header);
            localStorage.setItem('sso_admin_name', data.user?.name || data.user?.username || 'Admin');
            setAuthHeader(header);
            setAdminName(data.user?.name || data.user?.username || 'Admin');
            setIsLogged(true);
          }
        })
        .catch(() => null)
        .finally(() => setCheckingAdminSession(false));
    }

    // Check for github errors
    const errorParam = searchParams.get('error');
    if (errorParam === 'github_not_bound') {
      alert('This GitHub account is not linked to any user.');
    } else if (errorParam === 'account_paused') {
      alert('Your account is paused.');
    }
  }, []);

  const checkSsoSession = async (appId: string, redirect: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/session`);
      if (res.ok) {
        const data = await res.json();
        if (data.active) {
          const verifyRes = await fetch(`${API_BASE}/api/verify?app_id=${appId}`, {
            headers: { 'Authorization': `Bearer ${data.token}` }
          });
          if (verifyRes.ok) {
            await fetch(`${API_BASE}/api/track`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ app_id: appId, uuid: data.user.uuid, event_type: 'sso_auto_login', duration_seconds: 0 })
            });
            window.location.href = `${redirect}${redirect.includes('?') ? '&' : '?'}token=${data.token}`;
            return;
          } else {
            setSsoError('You do not have permission to access this app.');
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
    setSsoLoading(false);
  };

  useEffect(() => {
    if (isLogged) {
      fetchUsers();
      fetchApps();
      fetchPermissions();
    }
  }, [isLogged]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const token = btoa(`${credentials.username}:${credentials.password}`);
    const header = `Basic ${token}`;

    // Test login
    fetch(`${API_BASE}/admin/users`, { headers: { 'Authorization': header } })
      .then(res => {
        if (res.ok) {
          localStorage.setItem('sso_admin_auth', header);
          localStorage.setItem('sso_admin_name', credentials.username);
          setAuthHeader(header);
          setAdminName(credentials.username);
          setIsLogged(true);
        } else {
          alert('Invalid credentials');
        }
      }).catch(err => alert('Network error: ' + err.message));
  };

  const handleSsoLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSsoError('');
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      const data = await res.json();
      if (!res.ok) {
        setSsoError(data.error || 'Login failed');
        return;
      }

      const verifyRes = await fetch(`${API_BASE}/api/verify?app_id=${ssoAppId}`, {
        headers: { 'Authorization': `Bearer ${data.token}` }
      });
      if (verifyRes.ok) {
        await fetch(`${API_BASE}/api/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_id: ssoAppId, uuid: data.uuid, event_type: 'login_success', duration_seconds: 0 })
        });
        window.location.href = `${ssoRedirect}${ssoRedirect.includes('?') ? '&' : '?'}token=${data.token}`;
      } else {
        setSsoError('You do not have permission to access this app.');
      }
    } catch (err: any) {
      setSsoError(err.message);
    }
  };

  const handlePasskeyLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    setSsoError('');
    try {
      const resp = await fetch(`${API_BASE}/api/passkey/generate-authentication-options`);
      const options = await resp.json();
      if (!resp.ok) throw new Error(options.error || 'Failed to get options');

      const attResp = await startAuthentication({ optionsJSON: options });

      const verifyResp = await fetch(`${API_BASE}/api/passkey/verify-authentication?app_id=${ssoAppId}&app_redirect=${encodeURIComponent(ssoRedirect)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attResp)
      });
      const data = await verifyResp.json();
      if (verifyResp.ok && data.verified) {
        // Automatically redirect via token in JSON similar to GitHub login but client-side redirect
        if (data.token) {
          window.location.href = `${ssoRedirect}${ssoRedirect.includes('?') ? '&' : '?'}token=${data.token}`;
        }
      } else {
        throw new Error(data.error || 'Login failed');
      }
    } catch (err: any) {
      console.error(err);
      setSsoError(err.message || err.toString() || 'Passkey verification failed');
    }
  };

  const handleLogout = async () => {
    await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' }).catch(() => null);
    localStorage.removeItem('sso_admin_auth');
    localStorage.removeItem('sso_admin_name');
    setAuthHeader('');
    setIsLogged(false);
    navigate('/login', { replace: true });
  };

  const authFetch = async (path: string, options: any = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...options.headers, 'Authorization': authHeader, 'Content-Type': 'application/json' }
    });
    if (res.status === 401) handleLogout();
    return res;
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/admin/users');
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const fetchApps = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/admin/apps');
      if (res.ok) setApps(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async () => {
    const res = await authFetch('/admin/permissions');
    if (res.ok) setPermissions(await res.json());
  };

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await authFetch('/admin/stats/usage');
      if (res.ok) {
        const data = normalizeAnalyticsPayload(await res.json());
        setStatsData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (isLogged && activeTab === 'statistics' && !statsData) {
      fetchStats();
    }
  }, [activeTab, isLogged]);

  /* ----- Users API Actions ----- */
  const toggleUserStatus = async (uuid: string, currentStatus: string) => {
    const action = currentStatus === 'active' ? 'pause' : 'continue';
    const res = await authFetch(`/admin/users/${uuid}/${action}`, { method: 'POST' });
    if (res.ok) fetchUsers();
  };

  const deleteUser = async (uuid: string) => {
    if (!confirm('Are you sure?')) return;
    const res = await authFetch(`/admin/users/${uuid}`, { method: 'DELETE' });
    if (res.ok) fetchUsers();
  };

  const createUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const avatarFile = fd.get('avatar');
    const body: any = {
      username: String(fd.get('username') || ''),
      name: String(fd.get('name') || ''),
      password: String(fd.get('password') || ''),
      cookie_expiry_days: Number(fd.get('cookie_expiry_days') || 7),
      birthday: String(fd.get('birthday') || '') || null,
    };

    if (avatarFile instanceof File && avatarFile.size > 0) {
      body.avatar_data = await readFileAsDataUrl(avatarFile);
    }

    const res = await authFetch('/admin/users', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    if (res.ok) { fetchUsers(); form.reset(); }
  };

  const overwriteUserPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') || '');
    if (!passwordModal?.uuid || !password) return;
    const res = await authFetch(`/admin/users/${passwordModal.uuid}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password })
    });
    if (res.ok) {
      setPasswordModal(null);
      fetchUsers();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Unable to update password');
    }
  };

  /* ----- Apps API Actions ----- */
  const createApp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const body: any = Object.fromEntries(fd.entries());
    body.use_agent_limit = body.use_agent_limit === 'on' ? true : false;

    try {
      const res = await authFetch('/admin/apps', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (res.ok) {
        fetchApps(); form.reset();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Failed to register app: ${errorData.error || res.statusText}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    }
  };

  const deleteApp = async (appId: string) => {
    if (!confirm('Are you sure?')) return;
    const res = await authFetch(`/admin/apps/${appId}`, { method: 'DELETE' });
    if (res.ok) fetchApps();
  };

  /* ----- Permissions API Actions ----- */
  const togglePermission = async (uuid: string, app_id: string, currentlyHasAccess: boolean) => {
    const res = await authFetch('/admin/permissions', {
      method: currentlyHasAccess ? 'DELETE' : 'POST',
      body: JSON.stringify({ uuid, app_id })
    });
    if (res.ok) fetchPermissions();
  };

  const parseLimit = (val: FormDataEntryValue | null): number | null => {
    if (!val || (val as string).trim() === '') return null;
    const n = parseInt(val as string, 10);
    return isNaN(n) ? null : n;
  };

  const updateQuota = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const rpm = parseLimit(fd.get('rpm_limit'));
    const rpd = parseLimit(fd.get('rpd_limit'));
    const tokenK = parseLimit(fd.get('daily_token_limit_k'));
    // convert k → raw tokens
    const dailyTokenLimit = tokenK !== null ? tokenK * 1000 : null;

    const res = await authFetch('/admin/permissions/quota', {
      method: 'PUT',
      body: JSON.stringify({
        uuid: quotaModal.uuid,
        app_id: quotaModal.app_id,
        rpm_limit: rpm,
        rpd_limit: rpd,
        daily_token_limit: dailyTokenLimit
      })
    });
    if (res.ok) {
      setQuotaModal(null);
      fetchPermissions();
    } else {
      const errData = await res.json().catch(() => ({}));
      alert('Failed to update quota: ' + (errData.error || res.status));
    }
  };

  if (ssoMode) {
    return (
      <div data-theme={theme} className="dashboard-theme fixed inset-0 overflow-y-auto">
        <div className="ui-auth-shell">
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
            <ThemeToggle theme={theme} onChange={setTheme} />
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="ui-auth-card relative"
          >
            <div className="flex justify-center mb-6">
              <div className="ui-logo-badge">
                <Shield className="w-7 h-7" />
              </div>
            </div>
            <div className="text-center mb-8">
              <h2 className="text-[28px] leading-tight font-bold text-[var(--text-primary)]">Single Sign-On</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-2">Continue to {ssoAppId}</p>
            </div>

            {ssoLoading ? (
              <div className="flex justify-center py-8">
                <Activity className="w-7 h-7 text-[var(--primary)] animate-spin" />
              </div>
            ) : (
              <form onSubmit={handleSsoLogin} className="space-y-4">
                {ssoError && (
                  <div className="rounded-[12px] border px-4 py-3 text-sm text-center" style={{ borderColor: 'color-mix(in srgb, var(--danger) 40%, var(--border))', background: 'color-mix(in srgb, var(--danger) 10%, var(--surface))', color: 'var(--danger)' }}>
                    {ssoError}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Account</label>
                  <input
                    type="text"
                    required
                    placeholder="User account"
                    value={credentials.username}
                    onChange={e => setCredentials({ ...credentials, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Password"
                    value={credentials.password}
                    onChange={e => setCredentials({ ...credentials, password: e.target.value })}
                  />
                </div>

                <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} className="ui-button-primary w-full">
                  Log In & Continue
                </motion.button>
                <Link
                  to={`/login?redirect=${encodeURIComponent(ssoRedirect)}&app_id=${encodeURIComponent(ssoAppId)}`}
                  className="ui-button-secondary w-full flex items-center justify-center gap-3 no-underline"
                >
                  <Mail className="w-5 h-5 text-[var(--primary)]" />
                  Continue with Email
                </Link>

                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-[var(--divider)]"></div>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Other options</span>
                  <div className="h-px flex-1 bg-[var(--divider)]"></div>
                </div>

                <motion.a
                  href={`${API_BASE}/api/github/login?app_redirect=${encodeURIComponent(ssoRedirect)}&app_id=${ssoAppId}`}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.99 }}
                  className="ui-button-secondary w-full flex items-center justify-center gap-3 no-underline"
                >
                  <Github className="w-5 h-5" />
                  Continue with GitHub
                </motion.a>
                <motion.button
                  type="button"
                  onClick={handlePasskeyLogin}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.99 }}
                  className="ui-button-secondary w-full flex items-center justify-center gap-3"
                >
                  <KeyRound className="w-5 h-5 text-[var(--primary)]" />
                  Continue with Passkey
                </motion.button>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  if (!isLogged) {
    if (checkingAdminSession) return null;
    return <Navigate to="/login" replace />;
  }

  return (
    <div data-theme={theme} className="dashboard-theme fixed inset-0 overflow-hidden flex flex-col md:flex-row">
      <motion.aside
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="ui-shell-sidebar w-full md:w-[280px] border-b md:border-b-0 md:border-r flex flex-col z-10 relative flex-shrink-0"
      >
        <div className="p-4 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="ui-logo-badge">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Auth Center</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Unified identity workspace</p>
              </div>
            </div>
            <motion.button onClick={handleLogout} className="ui-icon-button md:hidden" title="Sign Out">
              <LogOut className="w-4 h-4" />
            </motion.button>
          </div>
          {adminName && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="ui-card-subtle mt-5 p-4"
            >
              <p className="text-xs text-[var(--text-tertiary)] font-semibold uppercase tracking-[0.18em] mb-2">Signed in</p>
              <p className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-blue-300">
                Hi, {adminName} 👋
              </p>
            </motion.div>
          )}
        </div>

        <nav className="flex md:flex-col overflow-x-auto px-4 pb-2 md:pb-4 md:space-y-2 w-full no-scrollbar">
          {[
            { id: 'users', icon: Users, label: 'Users' },
            { id: 'apps', icon: LayoutGrid, label: 'Applications' },
            { id: 'permissions', icon: KeyRound, label: 'Permissions' },
            { id: 'register', icon: Ticket, label: 'Register' },
            { id: 'statistics', icon: BarChart3, label: 'Statistics' }
          ].map(tab => (
            <motion.button
              key={tab.id}
              data-active={activeTab === tab.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab(tab.id)}
              className="ui-nav-pill flex-shrink-0 flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3 font-medium transition-all duration-300"
            >
              <tab.icon className="w-5 h-5" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </motion.button>
          ))}
        </nav>

        <div className="hidden md:block p-4 mt-auto mb-4">
          <motion.button
            whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            className="ui-button-secondary w-full flex items-center gap-3 justify-start"
          >
            <LogOut className="w-5 h-5 text-[var(--danger)]" />
            Sign Out
          </motion.button>
        </div>
      </motion.aside>

      <main className="flex-1 overflow-y-auto overflow-x-hidden z-10 relative bg-[var(--bg)]">
        <div className="max-w-7xl mx-auto p-4 md:p-8 lg:p-10">
          <div className="ui-page-header mb-8 p-5 md:p-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-2">Admin Workspace</p>
              <h1 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)]">Manage authentication, apps, and usage</h1>
              <p className="text-sm md:text-base text-[var(--text-secondary)] mt-2">A cleaner, token-driven dashboard with consistent cards, light and dark modes, and the same underlying product logic.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ThemeToggle theme={theme} onChange={setTheme} />
              <Link
                to={`/admin/passkey`}
                className="ui-button-secondary inline-flex items-center gap-2 no-underline"
                title="Manage Passkeys for Admin"
              >
                <KeyRound className="w-4 h-4 text-[var(--primary)]" />
                Passkeys
              </Link>
              <motion.a
                href={`${API_BASE}/api/github/login?admin_bind=admin`}
                target="_blank" rel="noreferrer"
                className="ui-button-secondary inline-flex items-center gap-2 no-underline"
                title="Bind GitHub for Admin"
              >
                <Github className="w-4 h-4" />
                GitHub Bind
              </motion.a>
            </div>
          </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="max-w-6xl mx-auto space-y-8"
          >
            {activeTab === 'users' && (
              <div>
                <header className="mb-8 flex justify-between items-center bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-md">
                  <div>
                    <h1 className="text-3xl font-bold mb-2">User Management</h1>
                    <p className="text-blue-200/60">Configure SSO identities and access status.</p>
                  </div>
                </header>

                <div className="grid lg:grid-cols-3 gap-8">
                  {/* Create form */}
                  <div className="lg:col-span-1">
                    <div className="bg-white/5 backdrop-blur-lg border border-white/10 p-6 rounded-3xl shadow-xl hover:shadow-purple-500/10 transition-shadow">
                      <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <Plus className="text-purple-400 w-5 h-5" /> New User
                      </h3>
                      <form onSubmit={createUser} className="space-y-4">
                        <input name="username" placeholder="Username" required className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder-white/30" />
                        <input name="name" placeholder="Full Name" required className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder-white/30" />
                        <input name="password" type="password" placeholder="Password" required className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder-white/30" />
                        <input name="birthday" type="date" className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder-white/30 text-white" />
                        <label className="block rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
                          Avatar (Optional)
                          <input name="avatar" type="file" accept="image/*" className="mt-2 block w-full text-xs text-white/50 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white" />
                        </label>
                        <input name="cookie_expiry_days" type="number" placeholder="Session Expiry (Days)" defaultValue={7} className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder-white/30 text-white" />
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-3 rounded-xl shadow-lg transition-colors mt-2">
                          Create User
                        </motion.button>
                      </form>
                    </div>
                  </div>

                  {/* Users list */}
                  <div className="lg:col-span-2 space-y-4">
                    {loading ? <div className="text-center py-10 text-white/50 animate-pulse">Loading users...</div> :
                      users.map((u: any) => (
                        <motion.div
                          key={u.uuid}
                          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                          className="bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 p-5 rounded-2xl flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between transition-all group"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              <Link to={`/@${u.username}`} className="font-semibold text-lg hover:underline text-purple-300 transition-colors flex items-center gap-1">
                                {u.name} <ExternalLink className="w-4 h-4 opacity-50" />
                              </Link>
                              <span className={`px-3 py-1 text-xs rounded-full font-medium ${u.status === 'active' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                                {u.status.toUpperCase()}
                              </span>
                            </div>
                            <div className="mt-3 flex max-w-full flex-col gap-2 sm:flex-row sm:items-center">
                              <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                                <span className="font-semibold uppercase tracking-[0.14em] text-white/35">PASS</span>
                                <span className={`min-w-0 truncate font-mono ${revealedPasswords[u.uuid] ? 'text-emerald-300' : 'text-white/50 tracking-[0.25em]'}`}>
                                  {revealedPasswords[u.uuid] ? (u.password_plain || '(not recorded)') : '••••••••'}
                                </span>
                                <button
                                  type="button"
                                  className="rounded-lg p-1 text-white/45 hover:bg-white/10 hover:text-white"
                                  title={revealedPasswords[u.uuid] ? 'Hide password' : 'Reveal password'}
                                  onClick={() => setRevealedPasswords((current) => ({ ...current, [u.uuid]: !current[u.uuid] }))}
                                >
                                  {revealedPasswords[u.uuid] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                              <button
                                type="button"
                                className="rounded-xl border border-blue-500/30 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25"
                                onClick={() => setPasswordModal({ uuid: u.uuid, name: u.name, username: u.username })}
                              >
                                Overwrite password
                              </button>
                            </div>
                            <Link to={`/@${u.username}`} className="text-sm text-white/40 mt-1 hover:text-purple-300 hover:underline transition-colors block">
                              @{u.username} • Exp: {u.cookie_expiry_days} days
                            </Link>
                          </div>

                          <div className="flex items-center gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                            <motion.button
                              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                              onClick={() => toggleUserStatus(u.uuid, u.status)}
                              className={`p-2.5 rounded-xl shadow-lg ${u.status === 'active' ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/40' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40'}`}
                              title={u.status === 'active' ? 'Pause User' : 'Activate User'}
                            >
                              {u.status === 'active' ? <XCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                              onClick={() => deleteUser(u.uuid)}
                              className="p-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/40 shadow-lg"
                            >
                              <Trash2 className="w-5 h-5" />
                            </motion.button>
                          </div>
                        </motion.div>
                      ))
                    }
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'apps' && (
              <div>
                <header className="mb-8 bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-md">
                  <h1 className="text-3xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-emerald-300">Registered Applications</h1>
                  <p className="text-blue-200/60">Manage OAuth-like clients and verifying entities.</p>
                </header>

                <div className="grid lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1">
                    <div className="bg-white/5 backdrop-blur-lg border border-white/10 p-6 rounded-3xl shadow-xl hover:shadow-emerald-500/10 transition-shadow">
                      <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                        <Settings className="text-emerald-400 w-5 h-5" /> Register App
                      </h3>
                      <form onSubmit={createApp} className="space-y-4">
                        <input name="app_id" placeholder="App ID (e.g. game-client)" required className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder-white/30" />
                        <input name="app_name" placeholder="Display Name" required className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder-white/30" />
                        <input name="callback_url" placeholder="Callback URL (Optional)" className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder-white/30" />
                        <input name="secret_key" placeholder="App Secret Key" required className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder-white/30" />

                        <label className="flex items-center gap-3 bg-black/30 border border-white/5 p-3 rounded-xl cursor-pointer hover:bg-black/50 transition-colors">
                          <input type="checkbox" name="use_agent_limit" className="w-5 h-5 accent-emerald-500 rounded focus:ring-emerald-500 focus:ring-2 bg-black/50 border-white/10" />
                          <span className="text-sm font-medium text-emerald-300">是否使用agent 用量限制</span>
                        </label>

                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-xl shadow-lg transition-colors mt-2">
                          Register Application
                        </motion.button>
                      </form>
                    </div>
                  </div>

                  <div className="lg:col-span-2 grid gap-4 grid-cols-1 md:grid-cols-2">
                    {loading ? <div className="text-center py-10 text-white/50 col-span-2 animate-pulse">Loading apps...</div> :
                      apps.map((a: any) => (
                        <motion.div
                          key={a.app_id}
                          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                          className="bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 p-6 rounded-3xl flex flex-col justify-between transition-all group hover:shadow-2xl hover:shadow-emerald-500/10"
                        >
                          <Link to={`/app/${a.app_id}`} className="block h-full">
                            <div className="flex justify-between items-start mb-4">
                              {(() => {
                                const Icon = getAppIcon(a.app_id); return (
                                  <div className="p-3 bg-gradient-to-br from-purple-500/20 to-blue-500/20 text-purple-300 rounded-xl">
                                    <Icon className="w-6 h-6" />
                                  </div>
                                );
                              })()}
                              <motion.button
                                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                onClick={(e) => { e.preventDefault(); deleteApp(a.app_id); }}
                                className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-auto"
                              >
                                <Trash2 className="w-4 h-4" />
                              </motion.button>
                            </div>
                            <h4 className="font-bold text-xl mb-1 text-white flex items-center gap-2">
                              {a.app_name}
                              {a.use_agent_limit === 1 && <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded uppercase font-bold tracking-wider">Limit On</span>}
                            </h4>
                            <p className="text-xs font-mono text-emerald-300/70 mb-4">{a.app_id}</p>
                            {a.callback_url && <p className="text-sm text-white/50 bg-black/20 p-2 rounded-lg truncate" title={a.callback_url}>{a.callback_url}</p>}
                          </Link>
                        </motion.div>
                      ))
                    }
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'permissions' && (
              <PermissionMatrix authFetch={authFetch} />
            )}

            {activeTab === 'register' && (
              <RegisterCodeManager authFetch={authFetch} apps={apps} />
            )}

            {activeTab === 'statistics' && (() => {
              const rawData = statsData?.data || [];
              const data = rawData.filter((item: any) => ACCESS_EVENT_TYPES.has(String(item.event_type || '')));

              // 1. KPI Aggregations
              const totalEvents = data.reduce((acc: number, c: any) => acc + (c.events || 0), 0);
              const uniqueUsers = new Set(data.map((c: any) => c.uuid)).size;
              const totalVisitsDisplay = formatCompactNumber(totalEvents);

              const getTop = (key: string) => {
                const map: any = {};
                data.forEach((c: any) => {
                  const val = c[key] || 'Unknown';
                  map[val] = (map[val] || 0) + (c.events || 0);
                });
                return Object.entries(map).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || 'N/A';
              };

              const topAppId = getTop('app_id');
              const topApp = apps.find(a => a.app_id === topAppId)?.display_name || topAppId;
              const topBrowser = getTop('browser');
              const topCountry = getTop('country');

              // 2. Daily Trends for AreaChart
              const dailyMap: any = {};
              data.forEach((c: any) => {
                const day = c.day || 'N/A';
                if (!dailyMap[day]) dailyMap[day] = { day, visits: 0, users: new Set() };
                dailyMap[day].visits += c.events;
                dailyMap[day].users.add(c.uuid);
              });
              const dailyData = Object.values(dailyMap).map((d: any) => ({
                day: d.day,
                visits: d.visits,
                users: d.users.size
              })).sort((a: any, b: any) => a.day.localeCompare(b.day));

              // 3. Category Data for Pie/Bar Charts
              const getBreakdown = (key: string, limit = 5): Array<{ name: string; value: number }> => {
                const map: Record<string, number> = {};
                data.forEach((c: any) => {
                  const val = c[key] || 'Unknown';
                  map[val] = (map[val] || 0) + (c.events || 0);
                });
                return Object.entries(map)
                  .map(([name, value]) => ({ name, value: Number(value) || 0 }))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, limit);
              };

              const browsersData = getBreakdown('browser');
              const countriesData = getBreakdown('country', 10);
              const eventTypeData = getBreakdown('event_type', 3);
              const appsData = getBreakdown('app_id').map(item => ({
                ...item,
                name: apps.find(a => a.app_id === item.name)?.display_name || item.name
              }));

              const COLORS = ['#A855F7', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

              return (
                <div className="space-y-8 pb-12">
                  <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5 p-8 rounded-[2.5rem] border border-white/10 backdrop-blur-xl mb-4 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                    <div className="relative">
                      <h1 className="text-4xl font-bold text-white tracking-tight mb-2 flex items-center gap-3">
                        <BarChart3 className="text-purple-400 w-8 h-8" />
                        System Analytics
                      </h1>
                      <p className="text-white/50 text-lg">Access analytics for the last 7 days across your Auth ecosystem.</p>
                      <p className="text-white/30 text-sm mt-3">
                        Metrics below cover only the last 7 days and are aggregated from access events only: <span className="text-white/55">page_view</span>, <span className="text-white/55">login_success</span>, and <span className="text-white/55">sso_auto_login</span>. Quota writes are excluded.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-4">
                        {eventTypeData.map((event: any) => (
                          <span key={event.name} className="px-3 py-1.5 rounded-full border border-white/10 bg-black/20 text-xs text-white/60">
                            {event.name}: {formatCompactNumber(event.value)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 relative">
                      <button onClick={fetchStats} className={`p-4 rounded-2xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-all hover:scale-105 active:scale-95 ${loadingStats ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <Activity className={`w-6 h-6 ${loadingStats ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </header>

                  {/* KPI Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                      { label: 'Total Visits', value: totalVisitsDisplay, sub: 'Access events counted, compacted to K/M/G', icon: Activity, color: 'blue' },
                      { label: 'Unique Visitors', value: uniqueUsers, sub: 'Distinct user IDs', icon: Users, color: 'purple' },
                      { label: 'Top Browser', value: topBrowser, sub: 'Preferred environment', icon: Globe, color: 'emerald' },
                      { label: 'Hot Application', value: topApp, sub: 'Most active access source', icon: Zap, color: 'amber' },
                    ].map((kpi, idx) => (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
                        key={kpi.label} className="bg-white/5 border border-white/10 p-6 rounded-[2rem] hover:bg-white/10 transition-all cursor-default group"
                      >
                        <div className={`p-3 rounded-2xl bg-${kpi.color}-500/10 text-${kpi.color}-400 w-fit mb-4 group-hover:scale-110 transition-transform`}>
                          <kpi.icon className="w-6 h-6" />
                        </div>
                        <p className="text-white/40 text-sm font-medium mb-1">{kpi.label}</p>
                        <p className="text-3xl font-bold text-white mb-1 truncate">
                          {loadingStats ? '...' : typeof kpi.value === 'number' ? formatCompactNumber(kpi.value) : kpi.value}
                        </p>
                        <p className="text-xs text-white/20">{kpi.sub}</p>
                      </motion.div>
                    ))}
                  </div>

                  {/* Trends Chart */}
                  <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2"><Clock className="text-purple-400 w-5 h-5" /> Traffic Distribution</h3>
                      <div className="flex gap-4 text-xs">
                        <span className="flex items-center gap-1.5 text-purple-400"><div className="w-2 h-2 rounded-full bg-purple-500"></div> Visits</span>
                        <span className="flex items-center gap-1.5 text-blue-400"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Unique Users</span>
                      </div>
                    </div>
                    <div className="h-[400px] w-full min-w-0 min-h-[400px]">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={320}>
                        <AreaChart data={dailyData}>
                          <defs>
                            <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#A855F7" stopOpacity={0.3} /><stop offset="95%" stopColor="#A855F7" stopOpacity={0} /></linearGradient>
                            <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0} /></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }} tickFormatter={(value) => formatCompactNumber(value)} />
                          <RechartsTooltip
                            contentStyle={{ backgroundColor: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', color: '#fff' }}
                            itemStyle={{ color: '#fff' }}
                            formatter={(value: number | string) => formatCompactNumber(value)}
                          />
                          <Area type="monotone" dataKey="visits" stroke="#A855F7" fillOpacity={1} fill="url(#colorVisits)" strokeWidth={3} />
                          <Area type="monotone" dataKey="users" stroke="#3B82F6" fillOpacity={1} fill="url(#colorUsers)" strokeWidth={3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Breakdowns */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Top Apps */}
                    <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8">
                      <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Zap className="text-amber-400 w-5 h-5" /> Activity by Application</h3>
                      <div className="space-y-4">
                        {appsData.map((app: any, i) => (
                          <div key={app.name} className="flex items-center gap-4 group">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 font-bold border border-white/5 group-hover:border-purple-500/50 transition-colors">{i + 1}</div>
                            <div className="flex-1">
                              <div className="flex justify-between items-end mb-2">
                                <span className="text-white font-medium">{app.name}</span>
                                <span className="text-white/40 text-sm">{formatCompactNumber(app.value)} events</span>
                              </div>
                              <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }} animate={{ width: `${totalEvents > 0 ? (app.value / totalEvents) * 100 : 0}%` }}
                                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Geo / Browser Mix */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 flex flex-col items-center min-w-0">
                        <h3 className="text-lg font-bold text-white mb-6 self-start flex items-center gap-2"><Globe className="text-emerald-400 w-4 h-4" /> Countries</h3>
                        <div className="h-48 w-full min-w-0 min-h-[12rem]">
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
                            <RePieChart>
                              <Pie data={countriesData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                {countriesData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                ))}
                              </Pie>
                              <RechartsTooltip formatter={(value: number | string) => formatCompactNumber(value)} />
                            </RePieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="mt-4 w-full space-y-2">
                          {countriesData.map((c, i) => (
                            <div key={c.name} className="flex justify-between text-xs items-center text-white/70">
                              <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div> {getRegionLabel(c.name)}</span>
                              <span className="text-white/30 font-mono">{formatPercent(totalEvents > 0 ? (c.value / totalEvents) * 100 : 0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 flex flex-col items-center min-w-0">
                        <h3 className="text-lg font-bold text-white mb-6 self-start flex items-center gap-2"><PieChart className="text-blue-400 w-4 h-4" /> Browsers</h3>
                        <div className="h-48 w-full min-w-0 min-h-[12rem]">
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
                            <RePieChart>
                              <Pie data={browsersData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                {browsersData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                ))}
                              </Pie>
                              <RechartsTooltip formatter={(value: number | string) => formatCompactNumber(value)} />
                            </RePieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="mt-4 w-full space-y-2">
                          {browsersData.map((b, i) => (
                            <div key={b.name} className="flex justify-between text-xs items-center text-white/70">
                              <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div> {b.name}</span>
                              <span className="text-white/30 font-mono">{formatPercent(totalEvents > 0 ? (b.value / totalEvents) * 100 : 0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <CountrySharePanel countries={countriesData} topCountry={topCountry} totalEvents={totalEvents} />

                  {/* JSON Footer for debugging */}
                  <details className="mt-12 text-white/10 text-xs">
                    <summary className="cursor-pointer hover:text-white/30 transition-colors">Raw Analytics Payload (last 7 days, access events only)</summary>
                    <pre className="p-4 bg-black/40 rounded-3xl border border-white/5 mt-4 overflow-auto max-h-64">
                      {JSON.stringify(rawData, null, 2)}
                    </pre>
                  </details>
                </div>
              )
            })()}
          </motion.div>
        </AnimatePresence>
        </div>

        {quotaModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-[#0B0F19] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button
                onClick={() => setQuotaModal(null)}
                className="absolute top-4 right-4 text-white/50 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>

              <h2 className="text-2xl font-bold mb-1 text-blue-300">Usage Limits</h2>
              <p className="text-white/50 text-sm mb-6 pb-4 border-b border-white/10">Configure quota for {quotaModal.user_name} on {quotaModal.app_name}</p>

              <form onSubmit={updateQuota} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Requests Per Minute (RPM)</label>
                  <input name="rpm_limit" type="number" defaultValue={quotaModal.rpm_limit ?? ''} placeholder="Unlimited" className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder-white/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Requests Per Day (RPD)</label>
                  <input name="rpd_limit" type="number" defaultValue={quotaModal.rpd_limit ?? ''} placeholder="Unlimited" className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder-white/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Tokens Per Day (k)</label>
                  <input
                    name="daily_token_limit_k"
                    type="number"
                    defaultValue={quotaModal.daily_token_limit != null ? Math.round(quotaModal.daily_token_limit / 1000) : ''}
                    placeholder="Unlimited"
                    min="0"
                    step="1"
                    className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder-white/20"
                  />
                  <p className="text-xs text-white/30 mt-1">Enter in thousands. e.g. 100 = 100k tokens/day</p>
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={() => setQuotaModal(null)} className="px-5 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 transition-colors">Cancel</button>
                  <button type="submit" className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg transition-colors">Save Quota</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {passwordModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-[#0B0F19] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl relative"
            >
              <button
                onClick={() => setPasswordModal(null)}
                className="absolute top-4 right-4 text-white/50 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
                type="button"
              >
                <XCircle className="w-5 h-5" />
              </button>

              <h2 className="text-2xl font-bold mb-1 text-blue-300">Overwrite Password</h2>
              <p className="text-white/50 text-sm mb-6 pb-4 border-b border-white/10">
                Set a new password for {passwordModal.name || passwordModal.username}. The plaintext value will be shown in admin dash.
              </p>

              <form onSubmit={overwriteUserPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">New Password</label>
                  <input name="password" type="text" required className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder-white/20" />
                </div>
                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={() => setPasswordModal(null)} className="px-5 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 transition-colors">Cancel</button>
                  <button type="submit" className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg transition-colors">Save Password</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const isProfileMatch = location.pathname.match(/^\/@([^/]+)\/?$/);

  if (isProfileMatch) {
    // Return UserProfile, but we need to modify UserProfile to accept username prop or params.
    // Wait, UserProfile reads from useParams(). So rendering it directly will fail to read username.
    // Or we can just render the profile inside a route:
    return (
      <Routes>
        <Route path={location.pathname} element={<UserProfile usernameOverride={decodeURIComponent(isProfileMatch[1])} />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dash" element={<Dashboard />} />
      <Route path="/admin/passkey" element={<AdminPasskeyManage />} />
      <Route path="/admin/security" element={<AdminSecurityPage />} />
      <Route path="/login" element={<EmailLoginPage />} />
      <Route path="/register/email" element={<Navigate to="/register" replace />} />
      <Route path="/register/code" element={<Navigate to="/register" replace />} />
      <Route path="/register" element={<RegisterEmailPage />} />
      <Route path="/verify-email" element={<VerifyEmailNoticePage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/account/security" element={<AccountSecurityPage />} />
      <Route path="/user/:uuid" element={<UserHome />} />
      <Route path="/users/*" element={<UserLogin />} />
      <Route path="/session" element={<SessionCenter />} />
      <Route path="/:uuid/edit" element={<UserEditProfile />} />
      <Route path="/:uuid/change-password" element={<ChangePassword />} />
      <Route path="/:uuid/sso-binding" element={<SsoBinding />} />
      <Route path="/:uuid/passkey" element={<UserPasskeyManage />} />
      <Route path="/:uuid" element={<UserHome />} />
      <Route path="/app/:appId" element={<AppDetails />} />
      <Route path="/*" element={<LandingPage />} />
    </Routes>
  );
}
