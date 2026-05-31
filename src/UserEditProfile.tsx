import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Save, Upload, UserCircle2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  API_BASE,
  UserLogoutButton,
  UserPortalLoading,
  UserPortalScaffold,
  useRequiredUserSession,
} from './userPortal';

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read avatar image'));
    reader.readAsDataURL(file);
  });
}

export default function UserEditProfile() {
  const { uuid } = useParams();
  const { session, loading, setSession } = useRequiredUserSession(uuid);
  const [form, setForm] = React.useState({ name: '', birthday: '' });
  const [avatarData, setAvatarData] = React.useState<string | undefined>(undefined);
  const [avatarPreview, setAvatarPreview] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!session) return;
    setForm({
      name: session.name || '',
      birthday: session.birthday || '',
    });
    setAvatarPreview(session.avatar_url || '');
    setAvatarData(undefined);
  }, [session]);

  const handleAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAvatarData(dataUrl);
      setAvatarPreview(dataUrl);
    } catch (err: any) {
      setError(err.message || 'Unable to read avatar image');
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarData('');
    setAvatarPreview('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const body: Record<string, unknown> = {
        name: form.name,
        birthday: form.birthday || null,
      };
      if (avatarData !== undefined) {
        body.avatar_data = avatarData;
      }

      const res = await fetch(`${API_BASE}/api/user/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to update profile');
        return;
      }

      setSession((current) => current ? {
        ...current,
        name: data.user?.name ?? current.name,
        birthday: data.user?.birthday ?? null,
        avatar_url: data.user?.avatar_url ?? null,
      } : current);
      setAvatarPreview(data.user?.avatar_url || '');
      setAvatarData(undefined);
      setMessage('Profile updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Unable to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <UserPortalScaffold
      title="Edit Profile"
      description="Update your full name, birthday, and avatar from a dedicated profile settings page."
      actions={<UserLogoutButton />}
    >
      {loading || !session ? (
        <UserPortalLoading label="Loading your profile settings..." />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center">
            <Link to={`/${session.uuid}`} className="ui-button-secondary inline-flex items-center gap-2 no-underline">
              <ArrowLeft className="h-4 w-4" />
              Back to Account Center
            </Link>
          </div>

          <div className="ui-card p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Profile Details</p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Update your full name, birthday, and avatar</h3>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">Changes here use your current session directly. No extra password prompt.</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                {error ? <div className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div> : null}
                {message ? <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm text-[var(--text-primary)]">{message}</div> : null}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Full Name</label>
                  <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Birthday (Optional)</label>
                  <input type="date" value={form.birthday} onChange={(event) => setForm((current) => ({ ...current, birthday: event.target.value }))} />
                </div>
                <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} className="ui-button-primary inline-flex items-center gap-2" disabled={saving}>
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Profile'}
                </motion.button>
              </div>

              <div className="ui-card-subtle flex flex-col items-center justify-center gap-4 p-5">
                {avatarPreview ? (
                  <img src={avatarPreview} alt={`${session.name || session.username} avatar preview`} className="h-28 w-28 rounded-full object-cover ring-1 ring-[var(--border)]" />
                ) : (
                  <div className="ui-logo-badge h-28 w-28">
                    <UserCircle2 className="h-10 w-10" />
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <label className="ui-button-secondary inline-flex cursor-pointer items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload Avatar
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                  </label>
                  <button type="button" className="ui-button-secondary" onClick={handleRemoveAvatar}>
                    Remove Avatar
                  </button>
                </div>
                <p className="text-center text-sm text-[var(--text-secondary)]">
                  Avatar images are stored in secure object storage and exposed through your optional `avatar_url`.
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </UserPortalScaffold>
  );
}
