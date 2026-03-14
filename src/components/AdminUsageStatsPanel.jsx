import React, { useMemo } from 'react';

function toMs(ts) {
  const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
  if (!d || Number.isNaN(d.getTime())) return 0;
  return d.getTime();
}

export default function AdminUsageStatsPanel({ users, usageStats }) {
  const rows = Array.isArray(usageStats) ? usageStats : [];
  const usersRows = Array.isArray(users) ? users : [];

  const data = useMemo(() => {
    const now = Date.now();
    const active24h = rows.filter((r) => now - toMs(r.lastSeenAt) <= 24 * 60 * 60 * 1000).length;
    const totalLogins = rows.reduce((sum, r) => sum + Math.max(0, Number(r.loginCount || 0)), 0);
    const avgLogins = rows.length > 0 ? totalLogins / rows.length : 0;
    const sections = {};
    rows.forEach((r) => {
      Object.entries(r.sectionCounters || {}).forEach(([k, v]) => {
        sections[k] = Math.max(0, Number(sections[k] || 0)) + Math.max(0, Number(v || 0));
      });
    });
    const topSections = Object.entries(sections).map(([section, count]) => ({ section, count })).sort((a, b) => b.count - a.count).slice(0, 8);
    const topUsers = [...rows].sort((a, b) => (b.loginCount || 0) - (a.loginCount || 0)).slice(0, 10);
    return { active24h, totalLogins, avgLogins, topSections, topUsers };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3"><p className="text-[11px] text-gray-500">Utenti censiti</p><p className="text-xl text-gray-100 font-semibold">{usersRows.length}</p></div>
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3"><p className="text-[11px] text-gray-500">Utenti con telemetria</p><p className="text-xl text-gray-100 font-semibold">{rows.length}</p></div>
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3"><p className="text-[11px] text-emerald-300/80">Attivi ultime 24h</p><p className="text-xl text-emerald-300 font-semibold">{data.active24h}</p></div>
        <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3"><p className="text-[11px] text-sky-300/80">Login medi per utente</p><p className="text-xl text-sky-300 font-semibold">{data.avgLogins.toFixed(1)}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-slate-900/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 bg-slate-900/60"><h3 className="text-sm font-semibold text-gray-100">Sezioni più utilizzate</h3></div>
          <div className="p-4 space-y-2">
            {data.topSections.length === 0 ? <p className="text-xs text-gray-500">Nessun dato ancora disponibile.</p> : data.topSections.map((item) => (
              <div key={item.section} className="flex items-center justify-between text-xs rounded-lg border border-white/10 px-2.5 py-1.5">
                <span className="text-gray-300">{item.section}</span>
                <span className="text-amber-300">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 bg-slate-900/60"><h3 className="text-sm font-semibold text-gray-100">Top utenti per login</h3></div>
          <div className="p-4 space-y-2">
            {data.topUsers.length === 0 ? <p className="text-xs text-gray-500">Nessun dato ancora disponibile.</p> : data.topUsers.map((item) => (
              <div key={item.uid} className="flex items-center justify-between text-xs rounded-lg border border-white/10 px-2.5 py-1.5">
                <span className="text-gray-300">{item.displayName || item.email || item.uid}</span>
                <span className="text-sky-300">{item.loginCount || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
