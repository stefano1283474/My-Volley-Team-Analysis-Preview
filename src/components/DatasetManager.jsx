// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Dataset Manager
// I dati vengono salvati/letti esclusivamente da Firestore.
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';

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
  isLoading,
  uploadProgress = [],
}) {
  const [dragOver, setDragOver] = useState(false);
  const [readerEmail, setReaderEmail] = useState('');
  const [allowedReaders, setAllowedReaders] = useState([]);
  const [shareBusy, setShareBusy] = useState(false);
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Gestione Dati</h2>
        <p className="text-sm text-gray-400">
          Carica i file scout (.xlsm/.xlsx) e il calendario (.csv). I dati vengono
          salvati automaticamente su <span className="text-amber-400 font-medium">Firebase Firestore</span> e
          sono disponibili da qualsiasi dispositivo.
        </p>
      </div>

      {/* Firestore status badge */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px]"
        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-green-400 font-medium">Firestore sincronizzato</span>
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
          Modalità sola lettura: upload, cancellazione e salvataggi su Firestore sono disabilitati.
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
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <span className="text-amber-400">⚡</span>
          Partite su Firestore ({matches.length})
        </h3>
        {matches.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">
            Nessuna partita su Firestore. Carica un file .xlsm o .xlsx per iniziare.
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
                      {/* Firestore badge */}
                      <span className="text-[9px] text-green-600 font-mono">FS</span>
                      {!readOnly && (
                        <button
                          onClick={() => onDelete(m.id)}
                          className="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1"
                          title="Elimina da Firestore"
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

      {/* Standings */}
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
                  const isUs = isOwnerTeam(t.name);
                  return (
                    <tr key={t.name}
                      className={`border-b border-white/[0.03] ${isUs ? 'bg-amber-500/5' : ''}`}>
                      <td className="py-1.5 px-2 font-mono font-bold text-gray-400">{t.rank}</td>
                      <td className={`py-1.5 px-2 ${isUs ? 'text-amber-400 font-semibold' : 'text-gray-200'}`}>
                        {t.name}
                      </td>
                      <td className="text-center py-1.5 px-1 font-bold text-white">{t.pts}</td>
                      <td className="text-center py-1.5 px-1 text-gray-400">{t.matches}</td>
                      <td className="text-center py-1.5 px-1 text-green-400">{t.w}</td>
                      <td className="text-center py-1.5 px-1 text-red-400">{t.l}</td>
                      <td className="text-center py-1.5 px-1 text-gray-400">{t.sw}</td>
                      <td className="text-center py-1.5 px-1 text-gray-400">{t.sl}</td>
                      <td className="text-center py-1.5 px-1 text-gray-400">
                        {t.sl > 0 ? (t.sw / t.sl).toFixed(2) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calendar Preview */}
      {calendar.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <span className="text-amber-400">📅</span>
            Calendario ({calendar.filter(m => m.played).length} giocate / {calendar.length} totali)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
            {calendar
              .filter(m => isOwnerTeam(m.home) || isOwnerTeam(m.away))
              .sort((a, b) => a.giornata - b.giornata)
              .map((m, i) => {
                const isHome = isOwnerTeam(m.home);
                return (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-white/[0.02] text-[11px]">
                    <span className="text-gray-500 w-6">G{m.giornata}</span>
                    <span className={`flex-1 ${isHome ? 'text-amber-400' : 'text-gray-300'}`}>
                      {isHome ? m.away : m.home}
                    </span>
                    <span className="text-gray-500">{isHome ? 'casa' : 'trasf.'}</span>
                    {m.played ? (
                      <span className="font-mono text-gray-300">{m.setsHome}-{m.setsAway}</span>
                    ) : (
                      <span className="text-gray-600">da giocare</span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
