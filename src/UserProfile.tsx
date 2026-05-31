import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Copy, Check, Eye, EyeOff, ArrowLeft, Github, ImagePlus, KeyRound } from 'lucide-react';
import { useParams, Navigate, Link } from 'react-router-dom';

const API_BASE = '';

function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to read avatar image'));
        reader.readAsDataURL(file);
    });
}

export default function UserProfile({ usernameOverride }: { usernameOverride?: string }) {
    const params = useParams();
    const username = usernameOverride || params.username;
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const [users, setUsers] = useState<any[]>([]);
    const [isLogged] = useState(!!localStorage.getItem('sso_admin_auth'));
    const authHeader = localStorage.getItem('sso_admin_auth') || '';

    const [editInfo, setEditInfo] = useState({ name: '', cookie_expiry_days: 7, birthday: '' });
    const [newPassword, setNewPassword] = useState('');
    const [showPasswordInput, setShowPasswordInput] = useState(false);
    const [showPlainPassword, setShowPlainPassword] = useState(false);
    const [copied, setCopied] = useState(false);
    const [copiedGithub, setCopiedGithub] = useState(false);
    const [copiedPasskey, setCopiedPasskey] = useState(false);
    const [avatarData, setAvatarData] = useState<string | undefined>(undefined);
    const [avatarPreview, setAvatarPreview] = useState('');

    React.useEffect(() => {
        if (isLogged) {
            fetch(`${API_BASE}/admin/users`, {
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }
            })
                .then(res => res.json())
                .then(data => {
                    setUsers(data);
                    const u = data.find((x: any) => x.username === username);
                    if (u) {
                        setEditInfo({ name: u.name, cookie_expiry_days: u.cookie_expiry_days, birthday: u.birthday || '' });
                        setAvatarPreview(u.avatar_url || '');
                        setAvatarData(undefined);
                    }
                });
        }
    }, [username, isLogged, authHeader]);

    if (!isLogged) {
        return <Navigate to="/" />;
    }

    const user = users.find(u => u.username === username);

    const handleAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const dataUrl = await readFileAsDataUrl(file);
            setAvatarData(dataUrl);
            setAvatarPreview(dataUrl);
        } catch (err: any) {
            setMessage(err.message || 'Unable to read avatar image');
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const handleRemoveAvatar = () => {
        setAvatarData('');
        setAvatarPreview('');
    };

    if (!user && users.length > 0) {
        return (
            <div className="min-h-screen bg-[#0B0F19] text-white flex items-center justify-center p-8">
                <div className="text-center">
                    <p className="text-2xl font-bold mb-4">User not found.</p>
                    <Link to="/" className="text-purple-400 hover:underline">← Back to Manager</Link>
                </div>
            </div>
        );
    }

    const handleUpdateInfo = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const body: Record<string, unknown> = {
            ...editInfo,
            username,
            birthday: editInfo.birthday || null,
        };
        if (avatarData !== undefined) {
            body.avatar_data = avatarData;
        }
        const res = await fetch(`${API_BASE}/admin/users/${user.uuid}`, {
            method: 'PUT',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            setMessage('Info updated successfully!');
            const r = await fetch(`${API_BASE}/admin/users`, { headers: { 'Authorization': authHeader } });
            if (r.ok) {
                const refreshed = await r.json();
                setUsers(refreshed);
                const updatedUser = refreshed.find((x: any) => x.username === username);
                if (updatedUser) {
                    setAvatarPreview(updatedUser.avatar_url || '');
                    setEditInfo({ name: updatedUser.name, cookie_expiry_days: updatedUser.cookie_expiry_days, birthday: updatedUser.birthday || '' });
                    setAvatarData(undefined);
                }
            }
            setTimeout(() => setMessage(''), 3000);
        }
        setLoading(false);
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPassword) return;
        setLoading(true);
        const res = await fetch(`${API_BASE}/admin/users/${user.uuid}/password`, {
            method: 'PUT',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });
        if (res.ok) {
            setMessage('Password updated successfully!');
            setNewPassword('');
            // Refresh user list to get updated password_plain
            const r = await fetch(`${API_BASE}/admin/users`, { headers: { 'Authorization': authHeader } });
            if (r.ok) setUsers(await r.json());
            setTimeout(() => setMessage(''), 3000);
        }
        setLoading(false);
    };

    const handleCopyLink = () => {
        const link = `${window.location.origin}/${user?.uuid}/change-password`;
        navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="min-h-screen bg-[#0B0F19] text-white p-4 md:p-8 pb-20">
            <div className="fixed top-0 left-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="w-full max-w-2xl mx-auto relative z-10 mt-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Link to="/" className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-white/70 hover:text-white border border-white/10">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                            <Shield className="text-purple-400 w-6 h-6 md:w-7 md:h-7 shrink-0" />
                            <span className="truncate">@{username}</span>
                        </h1>
                        <p className="text-white/40 text-sm mt-0.5">User Profile & Administration</p>
                    </div>
                </div>

                {message && (
                    <div className="mb-6 p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm font-medium">
                        {message}
                    </div>
                )}

                {/* Avatar Card */}
                <div className="mb-6 flex flex-col sm:flex-row items-center sm:items-start gap-6 bg-white/5 p-6 rounded-3xl border border-white/10 text-center sm:text-left">
                    {avatarPreview ? (
                        <img src={avatarPreview} alt={`${user?.name || user?.username} avatar`} className="w-20 h-20 rounded-full object-cover shadow-lg shadow-purple-500/20 shrink-0" />
                    ) : (
                        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-3xl font-bold shadow-lg shadow-purple-500/20 shrink-0">
                            {user?.name?.[0]?.toUpperCase() || '?'}
                        </div>
                    )}
                    <div className="flex-1 w-full min-w-0">
                        <p className="text-white/40 text-xs mb-1">Avatar placeholder · feature reserved</p>
                        <h3 className="text-xl font-bold truncate">{user?.name}</h3>
                        <p className="text-white/30 text-xs font-mono mt-1 mb-2 truncate">{user?.uuid}</p>
                        <p className="text-white/45 text-sm mb-3">Birthday: {user?.birthday || 'Not set'}</p>

                        {user?.github_id ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium">
                                <Github className="w-3.5 h-3.5" /> Bound to GitHub ({user.github_id})
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-white/50 border border-white/10 text-xs font-medium">
                                <Github className="w-3.5 h-3.5" /> No GitHub Bound
                            </div>
                        )}

                        {/* Password reveal area */}
                        <div className="relative mt-3">
                            <div className="bg-black/30 border border-white/10 rounded-xl px-4 pr-12 py-3 flex items-center gap-3">
                                <span className="text-white/40 text-xs shrink-0 font-semibold tracking-widest">PASS</span>
                                <span className={`text-sm font-mono transition-all ${showPlainPassword ? 'text-emerald-300' : 'text-white/50 tracking-[0.4em]'}`}>
                                    {showPlainPassword
                                        ? (user?.password_plain || '(not recorded — overwrite to save)')
                                        : '••••••••'}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPlainPassword(!showPlainPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-lg transition-colors text-purple-300/60 hover:text-purple-300"
                                title="Reveal plaintext password"
                            >
                                {showPlainPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Two-column forms */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Edit Info */}
                    <form onSubmit={handleUpdateInfo} className="bg-white/5 border border-white/10 p-6 rounded-3xl space-y-4">
                        <h3 className="font-semibold text-base mb-4 text-white/80">Edit Information</h3>
                        <div>
                            <label className="text-xs text-white/40 block mb-1.5 font-medium uppercase tracking-wider">Full Name</label>
                            <input
                                type="text" required value={editInfo.name}
                                onChange={e => setEditInfo({ ...editInfo, name: e.target.value })}
                                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white placeholder-white/30"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-white/40 block mb-1.5 font-medium uppercase tracking-wider">Session Expiry (Days)</label>
                            <input
                                type="number" required value={editInfo.cookie_expiry_days}
                                onChange={e => setEditInfo({ ...editInfo, cookie_expiry_days: Number(e.target.value) })}
                                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-white/40 block mb-1.5 font-medium uppercase tracking-wider">Birthday</label>
                            <input
                                type="date" value={editInfo.birthday}
                                onChange={e => setEditInfo({ ...editInfo, birthday: e.target.value })}
                                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white"
                            />
                        </div>
                        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                            <label className="text-xs text-white/40 block font-medium uppercase tracking-wider">Avatar</label>
                            <div className="flex items-center gap-4">
                                {avatarPreview ? (
                                    <img src={avatarPreview} alt={`${user?.name || user?.username} avatar preview`} className="w-14 h-14 rounded-full object-cover" />
                                ) : (
                                    <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-white/40 font-semibold">
                                        {user?.name?.[0]?.toUpperCase() || '?'}
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10">
                                        <ImagePlus className="w-4 h-4" />
                                        Upload
                                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleRemoveAvatar}
                                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl shadow-lg shadow-purple-500/20 transition-all text-sm mt-2">
                            {loading ? 'Saving...' : 'Update Info'}
                        </motion.button>
                    </form>

                    {/* Reset Password */}
                    <form onSubmit={handleUpdatePassword} className="bg-white/5 border border-white/10 p-6 rounded-3xl space-y-4">
                        <h3 className="font-semibold text-base mb-4 text-white/80">Reset Password</h3>
                        <p className="text-xs text-white/40 leading-relaxed">
                            Admin override: sets a new password directly. The plaintext will be recorded for admin viewing.
                        </p>
                        <div className="relative">
                            <input
                                type={showPasswordInput ? 'text' : 'password'}
                                placeholder="New Password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none pr-12 transition-all text-white placeholder-white/30"
                            />
                            <button type="button" onClick={() => setShowPasswordInput(!showPasswordInput)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-white/40 hover:text-white transition-colors">
                                {showPasswordInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all text-sm">
                            Overwrite Password
                        </motion.button>

                        <div className="pt-4 border-t border-white/10">
                            <motion.button type="button" onClick={handleCopyLink}
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                className="w-full flex items-center justify-center gap-2 bg-emerald-600/80 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all text-sm">
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copied ? 'Copied!' : 'Copy Self-Service Link'}
                            </motion.button>
                        </div>
                    </form>
                </div>

                {/* SSO Integrations */}
                <div className="mt-6 bg-white/5 border border-white/10 p-6 rounded-3xl space-y-6">
                    <div>
                        <h3 className="font-semibold text-base mb-2 text-white/80 flex items-center gap-2"><Github className="w-5 h-5" /> GitHub SSO Binding</h3>
                        <p className="text-sm text-white/60 mb-4">
                            Allow this user to log in using their GitHub account. Send them the binding link.
                        </p>
                        <div className="md:w-1/2">
                            <motion.button type="button" onClick={() => {
                                const link = `${window.location.origin}/${user?.uuid}/sso-binding`;
                                navigator.clipboard.writeText(link);
                                setCopiedGithub(true);
                                setTimeout(() => setCopiedGithub(false), 2000);
                            }}
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                className="w-full flex items-center justify-center gap-2 bg-[#171515] hover:bg-[#201e1e] text-white font-semibold py-3 rounded-xl shadow-lg transition-all text-sm border border-white/10">
                                {copiedGithub ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copiedGithub ? 'Copied Bind Link!' : 'Copy GitHub Bind Link'}
                            </motion.button>
                        </div>
                    </div>

                    <div className="border-t border-white/10 pt-6">
                        <h3 className="font-semibold text-base mb-2 text-white/80 flex items-center gap-2"><KeyRound className="w-5 h-5 text-indigo-400" /> Passkey (WebAuthn) Management</h3>
                        <p className="text-sm text-white/60 mb-4">
                            Allow this user to set up Passkeys for passwordless secure login.
                        </p>
                        <div className="md:w-1/2">
                            <motion.button type="button" onClick={() => {
                                const link = `${window.location.origin}/${user?.uuid}/passkey`;
                                navigator.clipboard.writeText(link);
                                setCopiedPasskey(true);
                                setTimeout(() => setCopiedPasskey(false), 2000);
                            }}
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                className="w-full flex items-center justify-center gap-2 bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 hover:text-white font-semibold py-3 rounded-xl shadow-lg transition-all text-sm border border-indigo-500/30">
                                {copiedPasskey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copiedPasskey ? 'Copied Passkey Link!' : 'Copy Passkey Manage Link'}
                            </motion.button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
