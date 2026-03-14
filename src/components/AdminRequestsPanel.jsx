import React, { useMemo, useState } from 'react';

const PROFILE_OPTIONS = [
  { value: 'base', label: 'Base' },
  { value: 'pro', label: 'Pro' },
  { value: 'promax', label: 'Pro Max' },
];

function formatTimestamp(ts) {
  const date = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
  if (!date || Number.isNaN(date.getTime())) return 'Mai';
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default function AdminRequestsPanel({ requests, onResolveRequest, isSaving }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [textFilter, setTextFilter] = useState('');
  const filterNorm = textFilter.trim().toLowerCase();
  const all = Array.isArray(requests) ? requests : [];

  const metrics = useMemo(() => ({
    total: all.length,
    pending: all.filter(r => r.status === 'pending').length,
    approved: all.filter(r => r.status === 'approved').length,
    rejected: all.filter(r => r.status === 'rejected').length,
  }), [all]);

  const rows = useMemo(() => all.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (!filterNorm) return true;
    return String(r.email || '').toLowerCase().includes(filterNorm)
      || String(r.displayName || '').toLowerCase().includes(filterNorm)
      || String(r.message || '').toLowerCase().includes(filterNorm);
  }), [all, statusFilter, filterNorm]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3"><p className="text-[11px] text-gray-500">Totali</p><p className="text-xl text-gray-100 font-semibold">{metrics.total}</p></div>
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3"><p className="text-[11px] text-amber-300/80">In attesa</p><p className="text-xl text-amber-300 font-semibold">{metrics.pending}</p></div>
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3"><p className="text-[11px] text-emerald-300/80">Approvate</p><p className="text-xl text-emerald-300 font-semibold">{metrics.approved}</p></div>
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3"><p className="text-[11px] text-red-300/80">Rifiutate</p><p className="text-xl text-red-300 font-semibold">{metrics.rejected}</p></div>
      </div>
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 flex flex-col md:flex-row gap-2 md:items-center">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm text-gray-200"
        >
          <option value="all">Tutti gli stati</option>
          <option value="pending">In attesa</option>
          <option value="approved">Approvate</option>
          <option value="rejected">Rifiutate</option>
        </select>
        <input
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
          placeholder="Filtra per utente, email o testo"
          className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm text-gray-200 placeholder:text-gray-500"
        />
      </div>
      <div className="rounded-xl border border-white/10 bg-slate-900/30 overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr className="border-b border-white/10 bg-slate-900/60">
              <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Utente</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Da</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">A</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Messaggio</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Stato</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Richiesta</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Risoluzione</th>
              <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isPending = r.status === 'pending';
              return (
                <tr key={`${r.uid}_${r.requestedAt?.seconds || r.requestedAt || ''}`} className="border-b border-white/5 last:border-b-0">
                  <td className="px-4 py-3 text-sm text-gray-200">
                    <div>{r.displayName || 'Account Google'}</div>
                    <div className="text-xs text-gray-500">{r.email || 'Email non disponibile'}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">{PROFILE_OPTIONS.find(p => p.value === r.currentProfile)?.label || 'Pro'}</td>
                  <td className="px-4 py-3 text-sm text-gray-100">{PROFILE_OPTIONS.find(p => p.value === r.targetProfile)?.label || 'Pro'}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{r.message || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-md border text-xs ${r.status === 'approved' ? 'border-emerald-400/40 text-emerald-300 bg-emerald-500/10' : r.status === 'rejected' ? 'border-red-400/40 text-red-300 bg-red-500/10' : 'border-amber-400/40 text-amber-300 bg-amber-500/10'}`}>
                      {r.status === 'approved' ? 'Approvata' : r.status === 'rejected' ? 'Rifiutata' : 'In attesa'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{formatTimestamp(r.requestedAt)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    <div>{formatTimestamp(r.resolvedAt)}</div>
                    {r.resolverEmail ? <div>{r.resolverEmail}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <button onClick={() => onResolveRequest(r, 'approved')} disabled={isSaving || !isPending} className="px-2.5 py-1.5 rounded-md text-xs border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">Approva</button>
                      <button onClick={() => onResolveRequest(r, 'rejected')} disabled={isSaving || !isPending} className="px-2.5 py-1.5 rounded-md text-xs border border-red-400/40 text-red-300 hover:bg-red-500/10 disabled:opacity-50">Rifiuta</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">Nessuna richiesta trovata.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
