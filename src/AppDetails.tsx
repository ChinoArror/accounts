import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Save, Activity, Settings, User } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';

export default function AppDetails() {
    const { appId } = useParams<{ appId: string }>();
    const navigate = useNavigate();

    const [appData, setAppData] = useState<any>(null);
    const [users, setUsers] = useState<any[]>([]);
    const [permissions, setPermissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit form state
    const [displayName, setDisplayName] = useState('');
    const [callbackUrl, setCallbackUrl] = useState('');
    const [useAgentLimit, setUseAgentLimit] = useState(false);

    // Stats state
    const [statsData, setStatsData] = useState<any>(null);
    const [selectedUser, setSelectedUser] = useState<string>('all');
    const [loadingStats, setLoadingStats] = useState(false);

    const API_BASE = '';
    const authHeader = localStorage.getItem('sso_admin_auth') || '';

    const authFetch = async (path: string, options: any = {}) => {
        return fetch(`${API_BASE}${path}`, {
            ...options,
            headers: { ...options.headers, 'Authorization': authHeader, 'Content-Type': 'application/json' }
        });
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [appRes, pRes, uRes] = await Promise.all([
                authFetch('/admin/apps'),
                authFetch('/admin/permissions'),
                authFetch('/admin/users')
            ]);

            if (appRes.ok && pRes.ok && uRes.ok) {
                const apps = await appRes.json();
                const perms = await pRes.json();
                const usrs = await uRes.json();

                const currentApp = apps.find((a: any) => a.app_id === appId);
                if (currentApp) {
                    setAppData(currentApp);
                    setDisplayName(currentApp.app_name);
                    setCallbackUrl(currentApp.callback_url || '');
                    setUseAgentLimit(currentApp.use_agent_limit === 1);
                }

                setPermissions(perms.filter((p: any) => p.app_id === appId));
                setUsers(usrs);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        setLoadingStats(true);
        try {
            const res = await authFetch(`/admin/stats/quota?app_id=${encodeURIComponent(appId || '')}`);
            if (res.ok) {
                const data = await res.json();
                setStatsData(data);
            } else {
                const err = await res.json().catch(() => ({}));
                console.error('Failed to fetch quota stats:', err);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingStats(false);
        }
    };

    useEffect(() => {
        if (authHeader) {
            fetchData();
        } else {
            navigate('/');
        }
    }, [appId, authHeader]);

    useEffect(() => {
        if (appData?.use_agent_limit) {
            fetchStats();
        }
    }, [appData]);

    const handleSave = async () => {
        if (!appData) return;
        const res = await authFetch(`/admin/apps/${appId}`, {
            method: 'PUT',
            body: JSON.stringify({
                app_name: displayName,
                callback_url: callbackUrl,
                secret_key: appData.secret_key, // keep the same
                use_agent_limit: useAgentLimit
            })
        });
        if (res.ok) {
            alert('Saved successfully!');
            fetchData();
        } else {
            alert('Failed to save');
        }
    };

    const chartData = useMemo(() => {
        if (!statsData) return { data: [], userIds: [] };
        // SQL API returns: { data: [ {day: "2024-03-01", uuid: "...", total_tokens: 123} ] }
        const rows: { day: string; uuid: string; total_tokens: number }[] = statsData?.data || [];

        // Group by Day (day from SQL is already YYYY-MM-DD in UTC; shift to UTC+8 means
        // events before 00:00 UTC will appear on the previous day in UTC+8. For simplicity
        // we use the day as returned since it already reflects per-day aggregation.)
        const grouped: Record<string, Record<string, any>> = {};
        const uids = new Set<string>();

        rows.forEach((row) => {
            const uuid = row.uuid || 'unknown';
            if (selectedUser !== 'all' && uuid !== selectedUser) return;

            uids.add(uuid);
            const dateKey = row.day; // "YYYY-MM-DD"

            if (!grouped[dateKey]) grouped[dateKey] = { date: dateKey };
            grouped[dateKey][uuid] = (grouped[dateKey][uuid] || 0) + (row.total_tokens || 0);
        });

        const arr = Object.values(grouped).sort((a, b) => (a.date as string).localeCompare(b.date as string));

        return { data: arr, userIds: Array.from(uids) };
    }, [statsData, selectedUser]);

    if (loading) {
        return <div className="p-8 text-white">Loading...</div>;
    }

    if (!appData) {
        return <div className="p-8 text-white">App not found.</div>;
    }

    const useLimit = appData.use_agent_limit === 1;

    // Add random colors for chart lines
    const colors = ['#8b5cf6', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];

    return (
        <div className="min-h-screen bg-[#0B0F19] text-white p-4 md:p-8 lg:p-12 overflow-y-auto w-full relative">
            <div className="absolute top-0 left-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />

            <div className="max-w-6xl mx-auto relative z-10 space-y-8">
                <button onClick={() => navigate('/')} className="flex items-center gap-2 text-purple-300 hover:text-white transition-colors">
                    <ArrowLeft className="w-5 h-5" /> Back to Dashboard
                </button>

                <header className="bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400">
                            App Configuration
                        </h1>
                        <p className="text-purple-200/60 font-mono mt-1 flex items-center gap-2">
                            ID: {appData.app_id}
                            {useAgentLimit && <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded text-xs">Agent Limit Enabled</span>}
                        </p>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={handleSave}
                        className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-lg transition-all"
                    >
                        <Save className="w-5 h-5" /> Save Changes
                    </motion.button>
                </header>

                {/* Edit Form */}
                <div className="bg-white/5 backdrop-blur-lg border border-white/10 p-6 xl:p-8 rounded-3xl">
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2"><Settings className="w-5 h-5 text-purple-400" /> App Details</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-2">Display Name</label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-2">Callback URL</label>
                            <input
                                type="text"
                                value={callbackUrl}
                                onChange={e => setCallbackUrl(e.target.value)}
                                className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-white/70 mb-2">Secret Key</label>
                            <div className="w-full bg-black/50 border border-white/5 rounded-xl px-4 py-3 text-white/40 select-none">
                                ••••••••••••••••••••••••••••••••
                            </div>
                            <p className="text-xs text-white/40 mt-2">Secret key is hidden for security reasons.</p>
                        </div>
                        <div className="md:col-span-2 pt-2 border-t border-white/10 mt-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={useAgentLimit}
                                        onChange={e => setUseAgentLimit(e.target.checked)}
                                        className="w-5 h-5 accent-emerald-500 rounded focus:ring-emerald-500 focus:ring-2 bg-black/50 border-white/10"
                                    />
                                </div>
                                <div>
                                    <span className="text-sm font-medium text-emerald-300">开启 Agent 用量限制 (Enable Agent Limits)</span>
                                    <p className="text-xs text-white/40 mt-0.5">Toggle quota tracking, limits, and charting for API requests coming through this app.</p>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                {useAgentLimit && (
                    <>
                        {/* Chart Section */}
                        <div className="bg-white/5 backdrop-blur-lg border border-white/10 p-6 xl:p-8 rounded-3xl">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                                <h2 className="text-xl font-semibold flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-400" /> Agent Usage Monitor (Tokens)</h2>

                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-white/50">Filter user:</span>
                                    <select
                                        className="bg-black/30 border border-white/10 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
                                        value={selectedUser}
                                        onChange={(e) => setSelectedUser(e.target.value)}
                                    >
                                        <option value="all">All Users</option>
                                        {users.map((u: any) => (
                                            <option key={u.uuid} value={u.uuid}>{u.name} (@{u.username})</option>
                                        ))}
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                            </div>

                            {loadingStats ? (
                                <div className="h-72 flex items-center justify-center text-white/50 animate-pulse">Loading chart data...</div>
                            ) : chartData.data.length === 0 ? (
                                <div className="h-72 flex items-center justify-center text-white/50 bg-black/20 rounded-xl border border-white/5">No usage data found for this app.</div>
                            ) : (
                                <div className="h-80 w-full mt-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData.data}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" vertical={false} />
                                            <XAxis dataKey="date" stroke="#ffffff50" tick={{ fill: '#ffffff80', fontSize: 13 }} tickMargin={12} />
                                            <YAxis stroke="#ffffff50" tick={{ fill: '#ffffff80', fontSize: 13 }} tickMargin={12} />
                                            <RechartsTooltip
                                                contentStyle={{ backgroundColor: '#0B0F19', borderColor: '#ffffff20', borderRadius: '12px' }}
                                                itemStyle={{ color: '#fff' }}
                                            />
                                            <Legend wrapperStyle={{ paddingTop: '20px' }} />

                                            {selectedUser === 'all' ? (
                                                chartData.userIds.map((uid, idx) => {
                                                    const uObj = users.find((u: any) => u.uuid === uid);
                                                    const name = uid === 'admin' ? 'Admin' : uObj ? uObj.name : uid;
                                                    return <Line key={uid} type="monotone" dataKey={uid} name={name} stroke={colors[idx % colors.length]} strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                                })
                                            ) : (
                                                <Line type="monotone" dataKey={selectedUser} name={selectedUser === 'admin' ? 'Admin' : users.find((u: any) => u.uuid === selectedUser)?.name || selectedUser} stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                            )}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>

                        {/* User Limits Grid */}
                        <div className="bg-white/5 backdrop-blur-lg border border-white/10 p-6 xl:p-8 rounded-3xl">
                            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2"><User className="w-5 h-5 text-blue-400" /> Remaining Tokens</h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* Admin is always UNLIMITED */}
                                <div className="bg-black/30 border border-white/5 p-5 rounded-2xl flex justify-between items-center group hover:border-blue-500/30 transition-colors">
                                    <div>
                                        <div className="font-semibold text-white">Admin</div>
                                        <div className="text-xs text-white/40 mt-1">@admin</div>
                                    </div>
                                    <div className="text-xl font-bold text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                                        Unlimited
                                    </div>
                                </div>

                                {permissions.map((p: any) => {
                                    const u = users.find((u: any) => u.uuid === p.uuid);
                                    if (!u) return null;

                                    const remainingTokens = p.daily_token_limit
                                        ? Math.max(0, p.daily_token_limit - (p.used_tokens_today || 0))
                                        : 'Not Set';

                                    return (
                                        <div key={p.uuid} className="bg-black/30 border border-white/5 p-5 rounded-2xl flex justify-between items-center group hover:border-blue-500/30 transition-colors">
                                            <div>
                                                <div className="font-semibold text-white truncate max-w-[120px]">{u.name}</div>
                                                <div className="text-xs text-white/40 mt-1 truncate max-w-[120px]">@{u.username}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-xl font-bold ${typeof remainingTokens === 'number' && remainingTokens === 0 ? 'text-red-400' : 'text-blue-300'}`}>
                                                    {remainingTokens}
                                                </div>
                                                {typeof remainingTokens === 'number' && <div className="text-[10px] text-white/30 uppercase tracking-wide">Left Today</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {permissions.length === 0 && (
                                <div className="text-center py-6 text-white/40 text-sm">No regular users have permission to use this app yet.</div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
