import React from 'react';
import { motion } from 'motion/react';
import { CalendarDays, ImagePlus, KeyRound, Ticket, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggle, useThemeMode } from './theme';

const API_BASE = '';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useThemeMode('dark');
  const [form, setForm] = React.useState({
    username: '',
    password: '',
    name: '',
    birthday: '',
    register_code: '',
    avatar_data: '',
  });
  const [preview, setPreview] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');

  const updateField = (key: string, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      updateField('avatar_data', '');
      setPreview('');
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Unable to read image'));
      reader.readAsDataURL(file);
    });

    updateField('avatar_data', dataUrl);
    setPreview(dataUrl);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to create account');
        return;
      }

      setSuccess('Registration completed. Redirecting to the user sign-in page...');
      window.setTimeout(() => {
        navigate('/users/?registered=1', { replace: true });
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Unable to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-theme={theme} className="dashboard-theme min-h-screen bg-[var(--bg)]">
      <div className="ui-auth-shell">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <ThemeToggle theme={theme} onChange={setTheme} />
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="ui-auth-card relative max-w-[520px]"
        >
          <div className="mb-6 flex justify-center">
            <div className="ui-logo-badge">
              <Ticket className="h-7 w-7" />
            </div>
          </div>
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1 text-[12px] font-semibold text-[var(--text-secondary)]">
              <KeyRound className="h-3.5 w-3.5 text-[var(--primary)]" />
              One-time register code onboarding
            </div>
            <h2 className="mt-4 text-[28px] font-bold leading-tight text-[var(--text-primary)]">Create Your Account</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Enter your register code to create a new account with the preset permissions and quota template.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? <div className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div> : null}
            {success ? <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)]">{success}</div> : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Username</label>
                <input value={form.username} onChange={(event) => updateField('username', event.target.value)} required autoComplete="username" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Full Name</label>
                <input value={form.name} onChange={(event) => updateField('name', event.target.value)} required />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Password</label>
                <input type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} required autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Birthday (Optional)</label>
                <div className="relative">
                  <input type="date" value={form.birthday} onChange={(event) => updateField('birthday', event.target.value)} className="pr-10" />
                  <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Register Code (Required)</label>
              <div className="relative">
                <input value={form.register_code} onChange={(event) => updateField('register_code', event.target.value)} required placeholder="Paste the UUID register code" className="pr-10" />
                <Ticket className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Avatar (Optional)</label>
              <div className="ui-card-subtle flex items-center gap-4 p-4">
                <label className="ui-button-secondary inline-flex cursor-pointer items-center gap-2">
                  <ImagePlus className="h-4 w-4" />
                  Upload Image
                  <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
                </label>
                <div className="flex items-center gap-3">
                  {preview ? (
                    <img src={preview} alt="Avatar preview" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-tertiary)]">
                      <UserRound className="h-5 w-5" />
                    </div>
                  )}
                  <p className="text-sm text-[var(--text-secondary)]">Optional. Uploaded to secure avatar storage and linked to your profile.</p>
                </div>
              </div>
            </div>

            <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} className="ui-button-primary mt-2 w-full" disabled={loading}>
              {loading ? 'Creating Account...' : 'Register'}
            </motion.button>
          </form>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link to="/" className="ui-button-secondary inline-flex w-full items-center justify-center gap-2 no-underline">
              Admin Sign In
            </Link>
            <Link to="/users/" className="ui-button-secondary inline-flex w-full items-center justify-center gap-2 no-underline">
              User Sign In
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
