// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Dataset Manager
// I dati vengono salvati/letti esclusivamente da Firestore.
// ============================================================================

import React, { useState, useRef, useEffect, useMemo } from 'react';

export default function DatasetManager({
  matches, calendar, standings,
  ownerTeamName = '',
  readOnly = false,
  isSharedMode = false,
  shareInfo = null,
  shareUrl = '',
  onCreateShareLink,
  onUpdateShareReaders,
  onUpload, onDelete,
  onClearArchive,
  isLoading,
  uploadProgress = [],
}) {
  const [dragOver, setDragOver] = useState(false);
  const [readerEmail, setReaderEmail] = useState('');
  const [allowedReaders, setAllowedReaders] = useState([]);
  const [shareBusy, setShareBusy] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const fileRef = useRef(null);
  const completedUploads = uploadProgress.filter(item => item.status === 'done').length;
  const failedUploads = uploadProgress.filter(item => item.status === 'error').length;
  const normalizeTeamName = (name) => String(name || '').trim().toUpperCase();
  const ownerTeamUpper = normalizeTeamName(ownerTeamName);
  const isOwnerTeam = (teamName) => {
    const teamUpper = normalizeTeamName(teamName);
    if (!ownerTeamUpper || !teamUpper) return false;
    return teamUpper === ownerTeamUpper || teamUpper.includes(ownerTeamUpper) || ownerTeamUpper.includes(teamUpper);
  };

  useEffect(() => {
    setAllowedReaders(shareInfo?.allowedEmails || []);
  }, [shareInfo]);

  const addReader = async () => {
    if (!onUpdateShareReaders || !readerEmail.trim()) return;
    const normalized = readerEmail.trim().toLowerCase();
    if (allowedReaders.includes(normalized)) {
      setReaderEmail('');
      return;
    }
    const next = [...allowedReaders, normalized];
    setAllowedReaders(next);
    setReaderEmail('');
    setShareBusy(true);
    try {
      const updated = await onUpdateShareReaders(next);
      setAllowedReaders(updated?.allowedEmails || next);
    } finally {
      setShareBusy(false);
    }
  };

  const removeReader = async (email) => {
    if (!onUpdateShareReaders) return;
    const next = allowedReaders.filter(e => e !== email);
    setAllowedReaders(next);
    setShareBusy(true);
    try {
      const updated = await onUpdateShareReaders(next);
      setAllowedReaders(updated?.allowedEmails || next);
    } finally {
      setShareBusy(false);
    }
  };

  const handleCreateShare = async () => {
    if (!onCreateShareLink) return;
    setShareBusy(true);
    try {
      await onCreateShareLink();
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); } catch {}
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onUpload(files);
  };

  const handleChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length) onUpload(files);
    e.target.value = '';
  };

  const handleClearArchive = async () => {
    if (!onClearArchive || readOnly || archiveBusy) return;
    const confirmed = window.confirm('Confermi la pulizia totale dell’archivio dati? Verranno eliminate tutte le partite e tutto il calendario.');
    if (!confirmed) return;
    setArchiveBusy(true);
    try {
      await onClearArchive();
    } finally {
      setArchiveBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Gestione Archivio</h2>
        <p className="text-sm text-gray-400">
          Carica i file scout (.xlsm/.xlsx) e il calendario (.csv). I dati vengono
          salvati automaticamente su <span className="text-amber-400 font-medium">Database in Cloud</span> e
          sono disponibili da qualsiasi dispositivo.
        </p>
      </div>

      {/* Cloud database status badge */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px]"
        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-green-400 font-medium">Database in Cloud sincronizzato</span>
        <span className="text-gray-500 ml-1">— nessun dato viene salvato in locale</span>
      </div>

      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm text-gray-200 font-medium">Condivisione dataset (sola lettura)</p>
            <p className="text-[11px] text-gray-500">
              {isSharedMode
                ? 'Stai visualizzando un dataset condiviso in sola lettura.'
                : 'Genera un link e autorizza account Google specifici alla sola lettura.'}
            </p>
          </div>
          {!readOnly && (
            <button
              onClick={handleCreateShare}
              disabled={shareBusy}
              className="px-3 py-1.5 rounded-lg text-xs bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 transition-colors disabled:opacity-60"
            >
              {shareInfo?.token ? 'Rigenera/Recupera Link' : 'Crea Link'}
            </button>
          )}
        </div>

        {shareInfo?.token && (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300"
              />
              <button
                onClick={handleCopyShareUrl}
                className="px-3 py-2 rounded-lg text-xs bg-white/5 text-gray-300 hover:bg-white/10"
              >
                Copia
              </button>
            </div>

            {!readOnly && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={readerEmail}
                    onChange={(e) => setReaderEmail(e.target.value)}
                    placeholder="email Google autorizzata"
                    className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300"
                  />
                  <button
                    onClick={addReader}
                    disabled={shareBusy || !readerEmail.trim()}
                    className="px-3 py-2 rounded-lg text-xs bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 disabled:opacity-60"
                  >
                    Aggiungi
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {allowedReaders.length === 0 && (
                    <span className="text-[11px] text-gray-500">Nessun lettore autorizzato.</span>
                  )}
                  {allowedReaders.map(email => (
                    <span key={email} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-white/[0.04] text-gray-300 border border-white/10">
                      {email}
                      <button
                        onClick={() => removeReader(email)}
                        className="text-gray-500 hover:text-red-400"
                        title="Rimuovi"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {!readOnly ? (
        <div
          className={`drop-zone p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${
            dragOver ? 'drag-over' : ''
          } ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="text-4xl">{isLoading ? '⏳' : '📂'}</div>
          <p className="text-sm text-gray-300 text-center">
            {isLoading ? (
              <span className="text-amber-400 font-medium">
                Elaborazione file in corso… ({completedUploads}/{uploadProgress.length || 0})
              </span>
            ) : (
              <span className="text-amber-400 font-medium">Clicca o trascina</span>
            )} i file qui
          </p>
          <p className="text-xs text-gray-500">
            Formati supportati: .xlsm, .xlsx (scout gara), .csv (calendario)
          </p>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".xlsm,.xlsx,.csv"
            className="hidden"
            onChange={handleChange}
          />
        </div>
      ) : (
        <div className="glass-card p-4 text-xs text-sky-300 border border-sky-500/20">
          Modalità sola lettura: upload, cancellazione e salvataggi su Database in Cloud sono disabilitati.
        </div>
      )}

      {uploadProgress.length > 0 && (
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">Avanzamento import e salvataggio</h3>
            <div className="text-[11px] text-gray-500">
              {completedUploads} completati · {failedUploads} errori · {uploadProgress.length} totali
            </div>
          </div>

          <div className="space-y-2">
            {uploadProgress.map(item => {
              const isDone = item.status === 'done';
              const isError = item.status === 'error';
              const statusColor = isDone
                ? 'text-green-400'
                : isError
                  ? 'text-red-400'
                  : 'text-amber-400';
              const barColor = isDone
                ? 'bg-green-500'
                : isError
                  ? 'bg-red-500'
                  : 'bg-amber-500';

              return (
                <div key={item.id} className="p-3 rounded-lg bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-200 truncate">{item.fileName}</p>
                      <p className={`text-[11px] ${statusColor}`}>{item.phase}</p>
                    </div>
                    <div className="text-[11px] font-mono text-gray-400">{item.progress}%</div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full ${barColor} transition-all duration-300`}
                      style={{ width: `${Math.max(0, Math.min(100, item.progress || 0))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-gray-500 truncate">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Loaded Matches */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <span className="text-amber-400">⚡</span>
            Partite su Database in Cloud ({matches.length})
          </h3>
          {!readOnly && (
            <button
              onClick={handleClearArchive}
              disabled={archiveBusy}
              className="px-3 py-1.5 rounded-lg text-xs bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-60"
            >
              {archiveBusy ? 'Pulizia in corso…' : 'Pulizia totale archivio'}
            </button>
          )}
        </div>
        {matches.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">
            Nessuna partita su Database in Cloud. Carica un file .xlsm o .xlsx per iniziare.
          </p>
        ) : (
          <div className="space-y-2">
            {matches
              .sort((a, b) => (a.metadata.date || '').localeCompare(b.metadata.date || ''))
              .map(m => {
                const setsWon  = (m.sets || []).filter(s => s.won).length;
                const setsLost = (m.sets || []).filter(s => !s.won).length;
                const won = setsWon > setsLost;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold
                        ${won ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {setsWon}-{setsLost}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">vs {m.metadata.opponent || 'N/D'}</p>
                        <p className="text-[11px] text-gray-500">
                          {m.metadata.date || 'Data N/D'} · {m.metadata.homeAway || ''} ·{' '}
                          {(m.sets || []).map(s => `${s.ourScore}-${s.theirScore}`).join(', ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-gray-600">{m.rallies?.length || 0} rally</span>
                      {/* Cloud database badge */}
                      <span className="text-[9px] text-green-600 font-mono">FS</span>
                      {!readOnly && (
                        <button
                          onClick={() => onDelete(m.id)}
                          className="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1"
                          title="Elimina da Database in Cloud"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

export function CalendarSection({ calendar = [], standings = [], ownerTeamName = '' }) {
  const normalizeTeamName = (name) => String(name || '').trim().toUpperCase();
  const ownerUpper = normalizeTeamName(ownerTeamName);

  const allTeams = useMemo(() => {
    const set = new Set();
    (calendar || []).forEach(m => {
      if (m.home) set.add(m.home);
      if (m.away) set.add(m.away);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [calendar]);

  const ownerTeamResolved = useMemo(() => (
    allTeams.find(t => {
      const teamUpper = normalizeTeamName(t);
      return teamUpper === ownerUpper || teamUpper.includes(ownerUpper) || ownerUpper.includes(teamUpper);
    }) || ''
  ), [allTeams, ownerUpper]);

  const orderedTeams = useMemo(() => {
    if (!ownerTeamResolved) return allTeams;
    return [ownerTeamResolved, ...allTeams.filter(t => t !== ownerTeamResolved)];
  }, [allTeams, ownerTeamResolved]);

  const [activeTeam, setActiveTeam] = useState('');

  useEffect(() => {
    if (orderedTeams.length === 0) {
      setActiveTeam('');
      return;
    }
    if (ownerTeamResolved) {
      setActiveTeam(ownerTeamResolved);
      return;
    }
    if (!activeTeam || !orderedTeams.includes(activeTeam)) {
      setActiveTeam(orderedTeams[0]);
    }
  }, [orderedTeams, ownerTeamResolved, activeTeam]);

  const selectedTeam = activeTeam || orderedTeams[0] || '';

  const teamMatches = useMemo(() => (
    (calendar || [])
      .filter(m => m.home === selectedTeam || m.away === selectedTeam)
      .sort((a, b) => {
        const gDiff = (a.giornata || 0) - (b.giornata || 0);
        if (gDiff !== 0) return gDiff;
        return String(a.data || '').localeCompare(String(b.data || ''));
      })
  ), [calendar, selectedTeam]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Calendiario</h2>
        <p className="text-sm text-gray-400">
          Classifica e calendario completo per tutte le squadre del CSV.
        </p>
      </div>

      {standings.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <span className="text-amber-400">🏆</span>
            Classifica ({standings.length} squadre)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-white/5">
                  <th className="text-left py-2 px-2">#</th>
                  <th className="text-left py-2 px-2">Squadra</th>
                  <th className="text-center py-2 px-1">Pt</th>
                  <th className="text-center py-2 px-1">G</th>
                  <th className="text-center py-2 px-1">V</th>
                  <th className="text-center py-2 px-1">S</th>
                  <th className="text-center py-2 px-1">SV</th>
                  <th className="text-center py-2 px-1">SS</th>
                  <th className="text-center py-2 px-1">QS</th>
                </tr>
              </thead>
              <tbody>
                {standings.map(t => {
                  const teamUpper = normalizeTeamName(t.name);
                  const isUs = ownerUpper && (teamUpper === ownerUpper || teamUpper.includes(ownerUpper) || ownerUpper.includes(teamUpper));
                  return (
                    <tr key={t.name} className={`border-b border-white/[0.03] ${isUs ? 'bg-amber-500/5' : ''}`}>
                      <td className="py-1.5 px-2 font-mono font-bold text-gray-400">{t.rank}</td>
                      <td className={`py-1.5 px-2 ${isUs ? 'text-amber-400 font-semibold' : 'text-gray-200'}`}>{t.name}</td>
                      <td className="text-center py-1.5 px-1 font-bold text-white">{t.pts}</td>
                      <td className="text-center py-1.5 px-1 text-gray-400">{t.matches}</td>
                      <td className="text-center py-1.5 px-1 text-green-400">{t.w}</td>
                      <td className="text-center py-1.5 px-1 text-red-400">{t.l}</td>
                      <td className="text-center py-1.5 px-1 text-gray-400">{t.sw}</td>
                      <td className="text-center py-1.5 px-1 text-gray-400">{t.sl}</td>
                      <td className="text-center py-1.5 px-1 text-gray-400">{t.sl > 0 ? (t.sw / t.sl).toFixed(2) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <span className="text-amber-400">📅</span>
          Calendario completo ({calendar.filter(m => m.played).length} giocate / {calendar.length} totali)
        </h3>

        {orderedTeams.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">Nessun calendario caricato.</p>
        ) : (
          <>
            <div className="flex gap-1 p-1 rounded-xl flex-wrap mb-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {orderedTeams.map(team => (
                <button
                  key={team}
                  onClick={() => setActiveTeam(team)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedTeam === team
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {team}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-white/5">
                    <th className="text-left py-2 px-2">G</th>
                    <th className="text-left py-2 px-2">Data</th>
                    <th className="text-left py-2 px-2">Ora</th>
                    <th className="text-left py-2 px-2">Casa</th>
                    <th className="text-left py-2 px-2">Ospite</th>
                    <th className="text-left py-2 px-2">Campo</th>
                    <th className="text-left py-2 px-2">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {teamMatches.map((m, idx) => (
                    <tr key={`${m.giornata}-${m.home}-${m.away}-${idx}`} className="border-b border-white/[0.03]">
                      <td className="py-1.5 px-2 text-gray-400 font-mono">{m.giornata || '—'}</td>
                      <td className="py-1.5 px-2 text-gray-300">{m.data || '—'}</td>
                      <td className="py-1.5 px-2 text-gray-400">{m.ora || '—'}</td>
                      <td className={`py-1.5 px-2 ${m.home === selectedTeam ? 'text-amber-400 font-semibold' : 'text-gray-300'}`}>{m.home}</td>
                      <td className={`py-1.5 px-2 ${m.away === selectedTeam ? 'text-amber-400 font-semibold' : 'text-gray-300'}`}>{m.away}</td>
                      <td className="py-1.5 px-2 text-gray-500">{m.venue || '—'}</td>
                      <td className={`py-1.5 px-2 ${m.played ? 'text-gray-300 font-mono' : 'text-sky-400'}`}>
                        {m.played ? `${m.setsHome}-${m.setsAway}` : 'Da giocare'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
