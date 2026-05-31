import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Shield, Key, Trash2, Edit2, Copy, LogOut, CheckCircle2 } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { startRegistration } from '@simplewebauthn/browser';

const API_BASE = '';

export default function PasskeyManage() {
    const { uuid } = useParams();
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [bindToken, setBindToken] = useState(sessionStorage.getItem(`bind_token_${uuid}`) || '');
    const [passkeys, setPasskeys] = useState<any[]>([]);
    const [loadingKeys, setLoadingKeys] = useState(false);

    useEffect(() => {
        if (bindToken) {
            fetchPasskeys();
        }
    }, [bindToken]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/api/users/${uuid}/verify-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Verify failed');
            sessionStorage.setItem(`bind_token_${uuid}`, data.bind_token);
            setBindToken(data.bind_token);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem(`bind_token_${uuid}`);
        setBindToken('');
        setPasskeys([]);
    };

    const authFetch = async (path: string, options: any = {}) => {
        const res = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: { ...options.headers, 'Authorization': `Bearer ${bindToken}`, 'Content-Type': 'application/json' }
        });
        if (res.status === 401) handleLogout();
        return res;
    };

    const fetchPasskeys = async () => {
        setLoadingKeys(true);
        try {
            const res = await authFetch(`/api/passkey/${uuid}/list`);
            if (res.ok) {
                const data = await res.json();
                setPasskeys(data);
            }
        } finally {
            setLoadingKeys(false);
        }
    };

    const addPasskey = async () => {
        if (passkeys.length >= 5) {
            return alert('最多只能添加 5 个通行密钥 (Maximum 5 passkeys allowed)');
        }
        setError('');
        try {
            const resp = await authFetch('/api/passkey/generate-registration-options', { method: 'POST' });
            const options = await resp.json();
            if (!resp.ok) throw new Error(options.error || 'Failed to get options');

            const attResp = await startRegistration({ optionsJSON: options });

            const verifyResp = await authFetch('/api/passkey/verify-registration', {
                method: 'POST',
                body: JSON.stringify(attResp)
            });
            const verification = await verifyResp.json();
            if (verifyResp.ok && verification.verified) {
                alert('通行密钥添加成功！(Passkey added successfully)');
                fetchPasskeys();
            } else {
                throw new Error(verification.error || 'Verification failed');
            }
        } catch (err: any) {
            console.error(err);
            setError('添加失败: ' + (err.message || err.toString()));
        }
    };

    const renamePasskey = async (id: string, currentName: string) => {
        const newName = prompt('重命名 (Rename passkey):', currentName);
        if (!newName || newName === currentName) return;
        const res = await authFetch(`/api/passkey/${uuid}/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName })
        });
        if (res.ok) fetchPasskeys();
    };

    const deletePasskey = async (id: string) => {
        if (!confirm('确定删除此通行密钥吗？(Are you sure?)')) return;
        const res = await authFetch(`/api/passkey/${uuid}/${id}`, { method: 'DELETE' });
        if (res.ok) fetchPasskeys();
    };

    if (!bindToken) {
        return (
            <div className="fixed inset-0 bg-[#0B0F19] flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/5 border border-white/10 p-8 rounded-3xl max-w-md w-full backdrop-blur-md">
                    <div className="flex justify-center mb-6">
                        <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                            <Shield className="w-10 h-10 text-white" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-center text-white mb-2">验证身份 / Verify Identity</h2>
                    <p className="text-indigo-300/70 text-center mb-6">请输入密码以管理您的通行密钥。Please enter password to manage passkeys.</p>
                    <form onSubmit={handleLogin} className="space-y-4">
                        {error && <div className="text-red-400 bg-red-500/10 p-3 rounded-xl text-center text-sm">{error}</div>}
                        <input
                            type="password" required placeholder="Password"
                            className="w-full bg-black/40 border border-indigo-500/30 text-indigo-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            value={password} onChange={e => setPassword(e.target.value)}
                        />
                        <button disabled={loading} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-500 transition-colors">
                            {loading ? 'Verifying...' : '验证 (Verify)'}
                        </button>
                    </form>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0B0F19] text-white p-4 md:p-8">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 flex items-center gap-3">
                        <Key className="w-8 h-8 text-indigo-400" />
                        通行密钥管理 (Passkeys)
                    </h1>
                    <button onClick={handleLogout} className="text-red-400 hover:bg-red-500/20 p-2 rounded-xl flex items-center gap-2 transition-colors">
                        <LogOut className="w-5 h-5" /> 退出
                    </button>
                </div>

                <div className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-3xl backdrop-blur-sm shadow-xl">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-xl font-semibold">您的通行密钥</h2>
                            <p className="text-white/50 text-sm mt-1">您最多可以添加 5 个设备或应用作为通行密钥进行免密登录。</p>
                        </div>
                        <button
                            onClick={addPasskey}
                            disabled={passkeys.length >= 5}
                            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-medium shadow-lg transition-transform hover:scale-105 active:scale-95"
                        >
                            + 添加通行密钥
                        </button>
                    </div>

                    {error && <div className="text-red-400 bg-red-500/10 p-3 rounded-xl text-center text-sm mb-6">{error}</div>}

                    {loadingKeys ? (
                        <div className="text-center py-10 opacity-50 animate-pulse">Loading...</div>
                    ) : passkeys.length === 0 ? (
                        <div className="text-center py-10 border-2 border-dashed border-white/10 rounded-2xl">
                            <Key className="w-12 h-12 text-white/20 mx-auto mb-4" />
                            <p className="text-white/50">暂无通行密钥 (No passkeys found)</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {passkeys.map(key => (
                                <div key={key.id} className="flex items-center justify-between bg-black/40 border border-white/5 p-4 rounded-2xl hover:border-indigo-500/30 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-indigo-500/20 text-indigo-300 rounded-xl">
                                            <Key className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">{key.name}</h3>
                                            <p className="text-xs text-white/40 mt-0.5">Added: {new Date(key.created_at).toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => renamePasskey(key.id, key.name)} className="p-2 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => deletePasskey(key.id)} className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <div className="text-right text-xs text-white/30 mt-4">
                                {passkeys.length} / 5 Passkeys used
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
