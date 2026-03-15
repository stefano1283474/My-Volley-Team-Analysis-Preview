// ============================================================================
// MATCH-STATS — Riepilogo statistiche per partita (tutte le gare filtrate)
// ============================================================================
import { useState, useMemo } from 'react';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pct(v) {
  if (v == null || !Number.isFinite(v) || v === 0) return '—';
  return (v * 100).toFixed(1) + '%';
}
function pctNum(v) {
  if (v == null || !Number.isFinite(v)) return null;
  return v * 100;
}
function eff(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = (v * 100).toFixed(1) + '%';
  return (v >= 0 ? '+' : '') + s;
}
function num(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return Number(v);
}
function effColor(v) {
  if (v == null || !Number.isFinite(v)) return 'text-gray-500';
  if (v >= 0.20) return 'text-emerald-400';
  if (v >= 0.05) return 'text-amber-400';
  if (v >= 0)    return 'text-yellow-500';
  return 'text-red-400';
}
function killPctColor(v) {
  if (v == null || !Number.isFinite(v)) return 'text-gray-500';
  if (v >= 0.45) return 'text-emerald-400';
  if (v >= 0.30) return 'text-amber-400';
  return 'text-yellow-500';
}
function recPctColor(v) {
  if (v == null || !Number.isFinite(v)) return 'text-gray-500';
  if (v >= 0.50) return 'text-emerald-400';
  if (v >= 0.35) return 'text-amber-400';
  return 'text-yellow-500';
}

function buildMatchRow(match) {
  const meta = match.metadata || {};
  const sets = match.sets || [];
  const setsWon  = sets.filter(s => s.won).length;
  const setsLost = sets.filter(s => !s.won).length;
  const won = setsWon > setsLost;
  const score = sets.length > 0 ? `${setsWon}-${setsLost}` : '—';
  const setDetail = sets.map(s => `${s.ourScore}-${s.theirScore}`).join(' ');

  const r = match.riepilogo;
  const t = r?.team || {};
  const att  = t.attack    || {};
  const ser  = t.serve     || {};
  const rec  = t.reception || {};
  const def  = t.defense   || {};
  const blk  = t.block     || {};
  const opp  = r?.opponent || {};
  const oa   = opp.attack  || {};
  const os   = opp.serve   || {};

  // Kill% = kill/tot; Eff% = efficacy (already ratio)
  const attKillPct = att.tot > 0 ? att.kill / att.tot : null;
  const serAcePct  = ser.tot > 0 ? ser.kill / ser.tot : null;
  const recPosPct  = rec.tot > 0 ? (rec.kill + rec.pos + rec.exc) / rec.tot : null;

  const oaKillPct  = oa.tot  > 0 ? oa.kill  / oa.tot  : null;
  const osAcePct   = os.tot  > 0 ? os.kill  / os.tot  : null;

  return {
    id: match.id,
    date: meta.date || '',
    opponent: meta.opponent || '—',
    matchType: meta.matchType || '—',
    homeAway: meta.homeAway || '—',
    phase: meta.phase || '',
    score,
    setDetail,
    won,
    setsWon,
    setsLost,
    hasData: !!r,
    // Our team
    att_kill: att.kill, att_err: att.err, att_tot: att.tot,
    att_killPct: attKillPct, att_eff: att.efficacy,
    ser_kill: ser.kill, ser_err: ser.err, ser_tot: ser.tot,
    ser_acePct: serAcePct, ser_eff: ser.efficacy,
    rec_tot: rec.tot, rec_err: rec.err,
    rec_posPct: recPosPct, rec_eff: rec.efficacy,
    blk_kill: blk.kill, blk_err: blk.err,
    def_tot: def.tot, def_eff: def.efficacy,
    pts_made: r?.totalPointsMade, pts_err: r?.totalErrors,
    // Opponent
    opp_att_kill: oa.kill, opp_att_tot: oa.tot, opp_att_killPct: oaKillPct, opp_att_eff: oa.efficacy,
    opp_ser_kill: os.kill, opp_ser_tot: os.tot, opp_ser_acePct: osAcePct, opp_ser_eff: os.efficacy,
  };
}

// Average of an array of numbers (skipping nulls)
function avg(arr) {
  const valid = arr.filter(v => v != null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}
function sum(arr) {
  const valid = arr.filter(v => v != null && Number.isFinite(Number(v)));
  if (valid.length === 0) return null;
  return valid.reduce((s, v) => s + Number(v), 0);
}

// Column group definitions
const COL_GROUPS = [
  {
    id: 'attacco', label: 'ATTACCO', color: '#f43f5e', bg: 'rgba(244,63,94,0.08)',
    cols: [
      { key: 'att_kill',    label: 'Kill',   title: 'Punti d\'attacco diretti',       fmt: num,     colorFn: null },
      { key: 'att_tot',     label: 'Tot',    title: 'Tentativi d\'attacco totali',     fmt: num,     colorFn: null },
      { key: 'att_err',     label: 'Err',    title: 'Errori in attacco',               fmt: num,     colorFn: null },
      { key: 'att_killPct', label: '%Kill',  title: 'Kill%: kill/tot',                fmt: pct,     colorFn: killPctColor },
      { key: 'att_eff',     label: 'Eff%',   title: 'Efficacia: (kill-err)/tot',       fmt: eff,     colorFn: effColor },
    ],
  },
  {
    id: 'battuta', label: 'BATTUTA', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)',
    cols: [
      { key: 'ser_kill',   label: 'Ace',    title: 'Ace (battute punto)',              fmt: num,     colorFn: null },
      { key: 'ser_tot',    label: 'Tot',    title: 'Battute totali',                   fmt: num,     colorFn: null },
      { key: 'ser_err',    label: 'Err',    title: 'Errori in battuta',                fmt: num,     colorFn: null },
      { key: 'ser_acePct', label: '%Ace',   title: 'Ace%: ace/tot',                    fmt: pct,     colorFn: killPctColor },
      { key: 'ser_eff',    label: 'Eff%',   title: 'Efficacia battuta',                fmt: eff,     colorFn: effColor },
    ],
  },
  {
    id: 'ricezione', label: 'RICEZIONE', color: '#0ea5e9', bg: 'rgba(14,165,233,0.08)',
    cols: [
      { key: 'rec_tot',    label: 'Tot',    title: 'Ricezioni totali',                 fmt: num,     colorFn: null },
      { key: 'rec_err',    label: 'Err',    title: 'Errori in ricezione',              fmt: num,     colorFn: null },
      { key: 'rec_posPct', label: '%Pos',   title: 'Ricezione positiva (kill+pos+exc)/tot', fmt: pct, colorFn: recPctColor },
      { key: 'rec_eff',    label: 'Eff%',   title: 'Efficacia ricezione',              fmt: eff,     colorFn: effColor },
    ],
  },
  {
    id: 'muro', label: 'MURO', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',
    cols: [
      { key: 'blk_kill',   label: 'Kill',   title: 'Muri punto',                       fmt: num,     colorFn: null },
      { key: 'blk_err',    label: 'Err',    title: 'Errori a muro (fallo di mano)',     fmt: num,     colorFn: null },
    ],
  },
  {
    id: 'difesa', label: 'DIFESA', color: '#10b981', bg: 'rgba(16,185,129,0.08)',
    cols: [
      { key: 'def_tot',    label: 'Tot',    title: 'Difese totali',                    fmt: num,     colorFn: null },
      { key: 'def_eff',    label: 'Eff%',   title: 'Efficacia difesa',                 fmt: eff,     colorFn: effColor },
    ],
  },
  {
    id: 'punti', label: 'PUNTI', color: '#94a3b8', bg: 'rgba(148,163,184,0.06)',
    cols: [
      { key: 'pts_made',   label: 'Fatti',  title: 'Punti totali fatti dalla squadra', fmt: num,     colorFn: null },
      { key: 'pts_err',    label: 'Err',    title: 'Errori totali',                    fmt: num,     colorFn: null },
    ],
  },
];

const OPP_COL_GROUPS = [
  {
    id: 'opp_attacco', label: 'ATT. AVVERSARIO', color: '#f43f5e', bg: 'rgba(244,63,94,0.06)',
    cols: [
      { key: 'opp_att_kill',    label: 'Kill',   fmt: num,  colorFn: null },
      { key: 'opp_att_tot',     label: 'Tot',    fmt: num,  colorFn: null },
      { key: 'opp_att_killPct', label: '%Kill',  fmt: pct,  colorFn: killPctColor },
      { key: 'opp_att_eff',     label: 'Eff%',   fmt: eff,  colorFn: effColor },
    ],
  },
  {
    id: 'opp_battuta', label: 'BAT. AVVERSARIO', color: '#8b5cf6', bg: 'rgba(139,92,246,0.06)',
    cols: [
      { key: 'opp_ser_kill',   label: 'Ace',    fmt: num,  colorFn: null },
      { key: 'opp_ser_tot',    label: 'Tot',    fmt: num,  colorFn: null },
      { key: 'opp_ser_acePct', label: '%Ace',   fmt: pct,  colorFn: killPctColor },
      { key: 'opp_ser_eff',    label: 'Eff%',   fmt: eff,  colorFn: effColor },
    ],
  },
];

function normDate(d) {
  if (!d) return '';
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : String(d);
}
function displayDate(d) {
  if (!d) return '—';
  const iso = normDate(d);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function MatchStats({ matches }) {
  const [sortKey, setSortKey] = useState('date');
  const [sortAsc, setSortAsc] = useState(true);
  const [showOpp, setShowOpp] = useState(false);
  const [expandSetDetail, setExpandSetDetail] = useState(null); // matchId

  const rows = useMemo(() => matches.map(buildMatchRow), [matches]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === 'date') { va = normDate(va); vb = normDate(vb); }
      if (va == null && vb == null) return 0;
      if (va == null) return sortAsc ? 1 : -1;
      if (vb == null) return sortAsc ? -1 : 1;
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
  }, [rows, sortKey, sortAsc]);

  // Totals / averages row
  const totals = useMemo(() => {
    const keys = [
      'att_kill','att_tot','att_err','att_killPct','att_eff',
      'ser_kill','ser_tot','ser_err','ser_acePct','ser_eff',
      'rec_tot','rec_err','rec_posPct','rec_eff',
      'blk_kill','blk_err',
      'def_tot','def_eff',
      'pts_made','pts_err',
      'opp_att_kill','opp_att_tot','opp_att_killPct','opp_att_eff',
      'opp_ser_kill','opp_ser_tot','opp_ser_acePct','opp_ser_eff',
    ];
    const pctKeys = new Set(['att_killPct','att_eff','ser_acePct','ser_eff','rec_posPct','rec_eff','def_eff','opp_att_killPct','opp_att_eff','opp_ser_acePct','opp_ser_eff']);
    const result = {};
    for (const k of keys) {
      const vals = rows.map(r => r[k]);
      result[k] = pctKeys.has(k) ? avg(vals) : sum(vals);
    }
    return result;
  }, [rows]);

  const wins = rows.filter(r => r.won).length;

  function handleSort(key) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  // All visible column groups
  const visibleGroups = showOpp ? [...COL_GROUPS, ...OPP_COL_GROUPS] : COL_GROUPS;

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center select-none">
        <p className="text-4xl opacity-20">📊</p>
        <p className="text-sm font-medium text-gray-400">Nessuna partita nel filtro corrente</p>
        <p className="text-xs text-gray-600">Modifica il filtro in Sistema › Tipologia Gare</p>
      </div>
    );
  }

  const thCls = (key) =>
    `px-2 py-1.5 text-center cursor-pointer select-none whitespace-nowrap transition-colors hover:text-white text-[10px] font-semibold uppercase tracking-wide
    ${sortKey === key ? 'text-amber-300' : 'text-gray-500'}`;

  const tdCls = 'px-2 py-2 text-center text-xs whitespace-nowrap';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Match Stats</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {matches.length} partite · <span className="text-emerald-400">{wins}V</span>{' '}<span className="text-red-400">{matches.length - wins}S</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOpp(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
              ${showOpp
                ? 'bg-red-500/15 text-red-300 border-red-500/30'
                : 'text-gray-400 hover:text-gray-200 border-white/10 hover:border-white/20 hover:bg-white/5'}`}
          >
            {showOpp ? '◀ Nascondi avversario' : '▶ Mostra avversario'}
          </button>
          <button
            onClick={() => exportCSV(sorted, visibleGroups)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-all"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/8" style={{ background: 'rgba(10,14,26,0.7)' }}>
        <table className="w-full border-collapse" style={{ minWidth: 900 }}>
          <thead>
            {/* Group header row */}
            <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
              {/* Fixed info columns */}
              <th colSpan={6} className="px-3 py-1 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider border-b border-white/5">
                Partita
              </th>
              {visibleGroups.map(g => (
                <th
                  key={g.id}
                  colSpan={g.cols.length}
                  className="px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wider border-b border-white/5 border-l border-white/5"
                  style={{ color: g.color, background: g.bg }}
                >
                  {g.label}
                </th>
              ))}
            </tr>

            {/* Column headers */}
            <tr style={{ background: 'rgba(0,0,0,0.25)' }}>
              {/* Info headers */}
              {[
                { key: 'date',      label: 'Data' },
                { key: 'opponent',  label: 'Avversario' },
                { key: 'matchType', label: 'Tipo' },
                { key: 'homeAway',  label: 'Sede' },
                { key: 'score',     label: 'Set' },
                { key: 'won',       label: 'Ris.' },
              ].map(({ key, label }) => (
                <th key={key} onClick={() => handleSort(key)}
                  className={thCls(key) + ' border-b border-white/5 text-left pl-3'}>
                  {label}{sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                </th>
              ))}

              {/* Stat column headers */}
              {visibleGroups.map((g, gi) =>
                g.cols.map((col, ci) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    title={col.title || col.label}
                    className={thCls(col.key) + ' border-b border-white/5' + (ci === 0 ? ' border-l border-white/5' : '')}
                    style={{ background: ci === 0 ? g.bg : undefined }}
                  >
                    {col.label}{sortKey === col.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                  </th>
                ))
              )}
            </tr>
          </thead>

          <tbody>
            {sorted.map((row, idx) => (
              <>
                <tr
                  key={row.id}
                  className={`border-b border-white/4 transition-colors hover:bg-white/3
                    ${idx % 2 === 0 ? '' : 'bg-white/[0.015]'}`}
                >
                  {/* Date */}
                  <td className={tdCls + ' pl-3 text-left text-gray-400 text-[11px] font-mono'}>
                    {displayDate(row.date)}
                  </td>
                  {/* Opponent */}
                  <td className={tdCls + ' text-left text-gray-200 font-medium max-w-[140px] truncate'}>
                    <span title={row.opponent}>{row.opponent}</span>
                  </td>
                  {/* Type */}
                  <td className={tdCls + ' text-gray-500 text-[11px]'}>
                    {row.matchType !== '—' ? (
                      <span className="px-1.5 py-0.5 rounded bg-white/5 text-gray-400 text-[10px]">
                        {row.matchType}
                      </span>
                    ) : '—'}
                  </td>
                  {/* Home/Away */}
                  <td className={tdCls + ' text-[11px]'}>
                    {row.homeAway === 'Casa'
                      ? <span className="text-sky-400">🏠</span>
                      : row.homeAway === 'Trasferta'
                      ? <span className="text-amber-400">✈</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  {/* Set score */}
                  <td className={tdCls + ' font-mono text-[11px] text-gray-300'}>
                    <button
                      className="hover:text-white transition-colors"
                      title={row.setDetail || 'Nessun dettaglio'}
                      onClick={() => setExpandSetDetail(prev => prev === row.id ? null : row.id)}
                    >
                      {row.score}
                    </button>
                  </td>
                  {/* Result */}
                  <td className={tdCls}>
                    <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${row.won ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-400'}`}>
                      {row.won ? 'V' : 'S'}
                    </span>
                  </td>

                  {/* Stat cells */}
                  {visibleGroups.map((g, gi) =>
                    g.cols.map((col, ci) => {
                      const val = row[col.key];
                      const display = row.hasData ? col.fmt(val) : '—';
                      const colorCls = row.hasData && col.colorFn ? col.colorFn(val) : 'text-gray-300';
                      return (
                        <td
                          key={col.key}
                          className={tdCls + ' ' + colorCls + (ci === 0 ? ' border-l border-white/4' : '')}
                          style={ci === 0 ? { background: g.bg } : undefined}
                        >
                          {display}
                        </td>
                      );
                    })
                  )}
                </tr>

                {/* Set detail expansion row */}
                {expandSetDetail === row.id && row.setDetail && (
                  <tr key={row.id + '_detail'} className="bg-white/[0.02]">
                    <td colSpan={99} className="px-4 py-2 text-xs text-gray-400 font-mono border-b border-white/4">
                      <span className="text-gray-600 mr-2">Set per set:</span>
                      {row.setDetail.split(' ').map((s, i) => {
                        const [a, b] = s.split('-').map(Number);
                        const wonSet = a > b;
                        return (
                          <span key={i} className={`mr-3 font-semibold ${wonSet ? 'text-emerald-400' : 'text-red-400'}`}>
                            S{i+1}: {s}
                          </span>
                        );
                      })}
                    </td>
                  </tr>
                )}
              </>
            ))}

            {/* Totals / averages row */}
            {rows.length > 0 && (
              <tr className="border-t-2 border-white/10 font-semibold" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <td colSpan={4} className="px-3 py-2 text-xs text-gray-400 text-left">
                  Media / Totale ({rows.length} gare)
                </td>
                <td className="px-2 py-2 text-center text-xs text-gray-400">
                  {wins}V {rows.length - wins}S
                </td>
                <td className="px-2 py-2 text-center text-xs">
                  <span className="text-emerald-400 font-bold">{rows.length > 0 ? Math.round(wins/rows.length*100) : 0}%</span>
                </td>

                {visibleGroups.map((g) =>
                  g.cols.map((col, ci) => {
                    const val = totals[col.key];
                    const display = col.fmt(val);
                    const colorCls = col.colorFn ? col.colorFn(val) : 'text-gray-300';
                    return (
                      <td
                        key={col.key}
                        className={tdCls + ' ' + colorCls + (ci === 0 ? ' border-l border-white/8' : '')}
                        style={ci === 0 ? { background: g.bg } : undefined}
                      >
                        {display}
                      </td>
                    );
                  })
                )}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-gray-600 pt-1">
        <span>Kill% = kill/tot attacchi · Ace% = ace/tot battute · Pos% = (kill+pos+exc)/tot ricezioni</span>
        <span>Eff% = (kill − errori) / tot</span>
        <span>Clicca sul punteggio set per espandere il dettaglio per set</span>
      </div>
    </div>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(rows, groups) {
  const infoHeaders = ['Data','Avversario','Tipo','Sede','Set','Risultato'];
  const statHeaders = groups.flatMap(g => g.cols.map(c => `${g.label} ${c.label}`));
  const headers = [...infoHeaders, ...statHeaders];

  function raw(val, col) {
    if (val == null || !Number.isFinite(val)) return '';
    if (col.fmt === pct)  return (val * 100).toFixed(1);
    if (col.fmt === eff)  return (val * 100).toFixed(1);
    return val;
  }

  const csvRows = rows.map(row => {
    const info = [
      row.date, row.opponent, row.matchType, row.homeAway, row.score, row.won ? 'V' : 'S',
    ];
    const stats = groups.flatMap(g => g.cols.map(col => raw(row[col.key], col)));
    return [...info, ...stats];
  });

  const csvContent = [headers, ...csvRows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'match-stats.csv'; a.click();
  URL.revokeObjectURL(url);
}
