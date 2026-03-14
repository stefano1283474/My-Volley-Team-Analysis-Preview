import React, { useMemo, useState } from 'react';

const PROFILE_OPTIONS = [
  { value: 'base', label: 'Base' },
  { value: 'pro', label: 'Pro' },
  { value: 'promax', label: 'Pro Max' },
];

const ROLE_OPTIONS = [
  { value: 'user', label: 'Utente' },
  { value: 'admin', label: 'Admin' },
];

function formatTimestamp(ts) {
  const date = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
  if (!date || Number.isNaN(date.getTime())) return 'Mai';
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function sectionCountersToRows(sectionCounters = {}) {
  return Object.entries(sectionCounters)
    .map(([section, count]) => ({ section, count: Number(count || 0) }))
    .sort((a, b) => b.count - a.count);
}

function UserDetailsDialog({ user, usage, request, onClose }) {
  if (!user) return null;
  const usageRows = sectionCountersToRows(usage?.sectionCounters || {});
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-100">{user.displayName || 'Account Google'}</h3>
            <p className="text-xs text-gray-400">{user.email || 'Email non disponibile'}</p>
          </div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded-md border border-white/10 text-gray-300 hover:bg-white/5">
            Chiudi
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl border border-white/10 bg-slate-800/40 p-4 space-y-2">
            <h4 className="text-xs uppercase tracking-wide text-gray-500">Accesso account</h4>
            <p className="text-gray-200">Ruolo: <span className="text-amber-300">{user.role || 'user'}</span></p>
            <p className="text-gray-200">Profilo: <span className="text-sky-300">{PROFILE_OPTIONS.find(p => p.value === user.assignedProfile)?.label || 'Pro'}</span></p>
            <p className="text-gray-400">Creato: {formatTimestamp(user.createdAt)}</p>
            <p className="text-gray-400">Ultimo accesso: {formatTimestamp(user.lastLoginAt)}</p>
            <p className="text-gray-400">Ultimo aggiornamento: {formatTimestamp(user.updatedAt)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-800/40 p-4 space-y-2">
            <h4 className="text-xs uppercase tracking-wide text-gray-500">Utilizzo applicazione</h4>
            <p className="text-gray-200">Login totali: <span className="text-emerald-300">{usage?.loginCount || 0}</span></p>
            <p className="text-gray-400">Primo login: {formatTimestamp(usage?.firstLoginAt)}</p>
            <p className="text-gray-400">Ultimo seen: {formatTimestamp(usage?.lastSeenAt)}</p>
            <p className="text-gray-400">Ultima sezione: {usage?.lastSection || 'N/D'}</p>
            <p className="text-gray-400 break-all">Versione app: {usage?.lastAppVersion || 'N/D'}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-800/40 p-4 space-y-2 md:col-span-2">
            <h4 className="text-xs uppercase tracking-wide text-gray-500">Distribuzione utilizzi per sezione</h4>
            {usageRows.length === 0 ? (
              <p className="text-xs text-gray-500">Nessun dato disponibile.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {usageRows.map((row) => (
                  <div key={row.section} className="flex items-center justify-between text-xs rounded-lg border border-white/10 px-2.5 py-1.5">
                    <span className="text-gray-300">{row.section}</span>
                    <span className="text-sky-300">{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-800/40 p-4 space-y-2 md:col-span-2">
            <h4 className="text-xs uppercase tracking-wide text-gray-500">Richiesta upgrade più recente</h4>
            {!request ? (
              <p className="text-xs text-gray-500">Nessuna richiesta trovata.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <p className="text-gray-300">Stato: {request.status || 'N/D'}</p>
                <p className="text-gray-300">Target: {PROFILE_OPTIONS.find(p => p.value === request.targetProfile)?.label || request.targetProfile || 'N/D'}</p>
                <p className="text-gray-400">Richiesta: {formatTimestamp(request.requestedAt)}</p>
                <p className="text-gray-400">Risolta: {formatTimestamp(request.resolvedAt)}</p>
                <p className="text-gray-400 sm:col-span-2">Messaggio: {request.message || '—'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPanel({
  users,
  requests,
  usageStats,
  currentUserEmail,
  onRefresh,
  onUpdateProfile,
  onUpdateRole,
  isSaving,
}) {
  const [filter, setFilter] = useState('');
  const [selectedUserUid, setSelectedUserUid] = useState('');
  const filterNorm = filter.trim().toLowerCase();

  const usageByUid = useMemo(() => {
    const map = new Map();
    (Array.isArray(usageStats) ? usageStats : []).forEach((row) => map.set(row.uid, row));
    return map;
  }, [usageStats]);

  const requestsByUid = useMemo(() => {
    const map = new Map();
    (Array.isArray(requests) ? requests : []).forEach((row) => {
      if (!map.has(row.uid)) map.set(row.uid, row);
    });
    return map;
  }, [requests]);

  const rows = useMemo(() => {
    const normalized = Array.isArray(users) ? users : [];
    if (!filterNorm) return normalized;
    return normalized.filter((u) =>
      String(u.email || '').toLowerCase().includes(filterNorm) ||
      String(u.displayName || '').toLowerCase().includes(filterNorm)
    );
  }, [users, filterNorm]);

  const selectedUser = rows.find((u) => u.uid === selectedUserUid) || (Array.isArray(users) ? users.find((u) => u.uid === selectedUserUid) : null);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-100">Gestione utenti Google</h3>
            <p className="text-xs text-gray-400 mt-1">Assegna ruolo e profilo applicativo ad ogni account.</p>
          </div>
          <button
            onClick={onRefresh}
            disabled={isSaving}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 text-gray-200 hover:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Aggiorna elenco
          </button>
        </div>
        <div className="mt-4">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtra per nome o email"
            className="w-full px-3 py-2 rounded-lg bg-slate-800/70 border border-white/10 text-sm text-gray-200 placeholder:text-gray-500 outline-none focus:border-amber-500/50"
          />
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/60">
                <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Utente</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Email</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Ruolo</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Profilo</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Ultimo accesso</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Login</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Ultima sezione</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isCurrentAdmin = String(u.email || '').toLowerCase() === String(currentUserEmail || '').toLowerCase();
                const usage = usageByUid.get(u.uid);
                return (
                  <tr key={u.uid} className="border-b border-white/5 last:border-b-0">
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => setSelectedUserUid(u.uid)}
                        className="text-left text-amber-300 hover:text-amber-200 underline-offset-2 hover:underline"
                      >
                        {u.displayName || 'Account Google'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{u.email || 'Email non disponibile'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role || 'user'}
                        onChange={(e) => onUpdateRole(u, e.target.value)}
                        disabled={isSaving || isCurrentAdmin}
                        className="w-full max-w-[160px] px-2.5 py-1.5 rounded-md bg-slate-800 border border-white/10 text-sm text-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.assignedProfile || 'pro'}
                        onChange={(e) => onUpdateProfile(u, e.target.value)}
                        disabled={isSaving}
                        className="w-full max-w-[160px] px-2.5 py-1.5 rounded-md bg-slate-800 border border-white/10 text-sm text-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {PROFILE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{formatTimestamp(u.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-sm text-sky-300">{usage?.loginCount || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{usage?.lastSection || 'N/D'}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    Nessun utente trovato con il filtro selezionato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedUser && (
        <UserDetailsDialog
          user={selectedUser}
          usage={usageByUid.get(selectedUser.uid)}
          request={requestsByUid.get(selectedUser.uid)}
          onClose={() => setSelectedUserUid('')}
        />
      )}
    </div>
  );
}
