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
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export default function AdminUsersPanel({
  users,
  currentUserEmail,
  onRefresh,
  onUpdateProfile,
  onUpdateRole,
  isSaving,
}) {
  const [filter, setFilter] = useState('');
  const filterNorm = filter.trim().toLowerCase();

  const rows = useMemo(() => {
    const normalized = Array.isArray(users) ? users : [];
    if (!filterNorm) return normalized;
    return normalized.filter((u) => {
      const email = String(u.email || '').toLowerCase();
      const name = String(u.displayName || '').toLowerCase();
      return email.includes(filterNorm) || name.includes(filterNorm);
    });
  }, [users, filterNorm]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-gray-100">Gestione utenti Google</h2>
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
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/60">
                <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Utente</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Email</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Ruolo</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Profilo</th>
                <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 px-4 py-3">Ultimo accesso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isCurrentAdmin = String(u.email || '').toLowerCase() === String(currentUserEmail || '').toLowerCase();
                return (
                  <tr key={u.uid} className="border-b border-white/5 last:border-b-0">
                    <td className="px-4 py-3 text-sm text-gray-200">{u.displayName || 'Account Google'}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{u.email || 'Email non disponibile'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role || 'user'}
                        onChange={(e) => onUpdateRole(u, e.target.value)}
                        disabled={isSaving || isCurrentAdmin}
                        className="w-full max-w-[160px] px-2.5 py-1.5 rounded-md bg-slate-800 border border-white/10 text-sm text-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.assignedProfile || 'pro'}
                        onChange={(e) => onUpdateProfile(u, e.target.value)}
                        disabled={isSaving}
                        className="w-full max-w-[160px] px-2.5 py-1.5 rounded-md bg-slate-800 border border-white/10 text-sm text-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {PROFILE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{formatTimestamp(u.lastLoginAt)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    Nessun utente trovato con il filtro selezionato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
