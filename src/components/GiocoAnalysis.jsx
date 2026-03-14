// ============================================================================
// GIOCO ANALYSIS v2 — Tab Gioco nella sezione Analisi
// Trasformazione pesata R/D → A con coefficiente difesa avversaria
// ============================================================================

import { useMemo, useState, useCallback } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  LineChart, Line, CartesianGrid, ReferenceLine, ScatterChart, Scatter,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Cell,
} from 'recharts';

import {
  analyzeAttackerTransformation,
  computeTransformationScale,
  computePlayerScalePositions,
  analyzeOpponentDefenseContext,
  computeTransformationSummary,
  INPUT_KEYS_ALL,
  INPUT_RECEPTION,
  INPUT_DEFENSE,
  attackValColor,
  coeffColor,
  scaleColor,
  scaleLabel,
  valueToScale,
  inputKeyLabel,
} from '../utils/giocoEngine';

// ─── Stili costanti ────────────────────────────────────────────────────────────
const S = {
  card:   'bg-[#111827] border border-white/6 rounded-xl',
  header: 'text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3',
};

// ─── Hook: ordinamento colonne ────────────────────────────────────────────────
function useSortable(initial = null, initialDir = 'desc') {
  const [sortKey, setSortKey] = useState(initial);
  const [sortDir, setSortDir] = useState(initialDir);

  const toggle = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); return key; }
      setSortDir('desc');
      return key;
    });
  }, []);

  const sort = useCallback((arr, accessor) => {
    if (!sortKey) return arr;
    return [...arr].sort((a, b) => {
      const va = accessor ? accessor(a, sortKey) : a[sortKey];
      const vb = accessor ? accessor(b, sortKey) : b[sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      return sortDir === 'desc' ? (vb > va ? 1 : -1) : (va > vb ? 1 : -1);
    });
  }, [sortKey, sortDir]);

  return { sortKey, sortDir, toggle, sort };
}

// ─── Intestazione colonna ordinabile ─────────────────────────────────────────
function SortTh({ label, colKey, sortKey, sortDir, onSort, className = '' }) {
  const active = sortKey === colKey;
  return (
    <th className={`py-2 px-2 cursor-pointer select-none whitespace-nowrap group ${className}`}
        onClick={() => onSort(colKey)}>
      <span className={`flex items-center gap-1 justify-center ${active ? 'text-amber-400' : 'text-gray-500 group-hover:text-gray-300'}`}>
        {label}
        <span className="text-[9px] leading-none">{active ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}</span>
      </span>
    </th>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = '#f59e0b' }) {
  return (
    <div className={`${S.card} p-4 flex flex-col gap-1`}>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-bold font-mono" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

// ─── Sub-tab bar ──────────────────────────────────────────────────────────────
function SubTabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 mb-4 flex-wrap">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
            ${active === t.id
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-white/5 text-gray-400 hover:text-gray-200 border border-transparent'}`}>
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ message = 'Nessun dato disponibile' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
      <span className="text-4xl opacity-30">🏐</span>
      <p className="text-sm italic text-center max-w-xs">{message}</p>
    </div>
  );
}

// ─── Tooltip Recharts ─────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a2035] border border-white/10 rounded-lg p-2.5 text-xs shadow-xl">
      <p className="font-semibold text-gray-200 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-mono font-bold">
            {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

// ─── Cella heatmap ────────────────────────────────────────────────────────────
function HeatCell({ count, pct, isTotal = false, isMeta = false, children }) {
  if (isMeta) return (
    <td className="text-center py-1 px-2 border border-white/5 text-xs">{children}</td>
  );
  if (isTotal) return (
    <td className="text-center py-1 px-2 font-bold text-gray-300 text-xs border border-white/5">{count}</td>
  );
  if (!count || count === 0)
    return <td className="text-center py-1 px-2 text-gray-700 border border-white/5 text-[11px]">—</td>;
  const baseColor = pct >= 0.4 ? '34,197,94' : pct >= 0.2 ? '234,179,8' : pct >= 0.05 ? '249,115,22' : '239,68,68';
  const opacity   = Math.max(0.08, Math.min(0.85, pct * 2));
  return (
    <td className="text-center py-1 px-2 border border-white/5 text-[11px] font-mono"
        style={{ background: `rgba(${baseColor},${opacity})`, color: pct > 0.35 ? '#fff' : '#e5e7eb' }}>
      {(pct * 100).toFixed(0)}%
      <span className="text-[9px] opacity-60 ml-0.5">({count})</span>
    </td>
  );
}

// ─── Matrice di trasformazione ────────────────────────────────────────────────
// Mostra distribuzione A1-A5 + rawAvg + weightedAvg per ogni input key
function TransformationMatrix({ matrix, title }) {
  const rows = INPUT_KEYS_ALL.filter(k => matrix[k]?.total > 0);
  if (rows.length === 0)
    return <p className="text-xs text-gray-600 italic py-4 text-center">Nessun dato di trasformazione</p>;

  return (
    <div>
      {title && <p className={S.header}>{title}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left py-1 px-2 text-gray-500 font-medium text-[11px]">Input ↓ / Output →</th>
              {[1, 2, 3, 4, 5].map(v => (
                <th key={v} className="text-center py-1 px-2 font-semibold text-[11px]"
                    style={{ color: attackValColor(v) }}>A{v}</th>
              ))}
              <th className="text-center py-1 px-2 text-gray-400 font-medium text-[11px]">Tot</th>
              <th className="text-center py-1 px-2 text-sky-400 font-medium text-[11px]">⌀ Raw</th>
              <th className="text-center py-1 px-2 text-amber-400 font-medium text-[11px]">⌀ Pesato</th>
              <th className="text-center py-1 px-2 text-green-400 font-medium text-[11px]">% A5</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(key => {
              const rec = matrix[key];
              const delta = rec.weightedAvg - rec.rawAvg;
              return (
                <tr key={key} className="border-t border-white/5 hover:bg-white/3">
                  <td className="py-1.5 px-2 font-semibold text-gray-300 whitespace-nowrap text-[11px]">
                    <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                          style={{ background: key.startsWith('R') ? '#0ea5e9' : '#10b981' }} />
                    {key}
                    <span className="text-gray-600 ml-1 font-normal text-[10px]">
                      {key.startsWith('R') ? '(Ric.)' : '(Dif.)'}
                    </span>
                  </td>
                  {[1, 2, 3, 4, 5].map(v => (
                    <HeatCell key={v} count={rec[`A${v}`]}
                      pct={rec.total > 0 ? rec[`A${v}`] / rec.total : 0} />
                  ))}
                  <HeatCell count={rec.total} isTotal />
                  <td className="text-center py-1 px-2 font-mono text-[11px] border border-white/5 text-sky-400">
                    {rec.rawAvg.toFixed(2)}
                  </td>
                  <td className="text-center py-1 px-2 font-mono font-bold text-[11px] border border-white/5"
                      style={{ color: attackValColor(Math.round(rec.weightedAvg)) }}>
                    {rec.weightedAvg.toFixed(2)}
                    {Math.abs(delta) >= 0.01 && (
                      <span className="text-[9px] ml-0.5" style={{ color: delta > 0 ? '#22c55e' : '#ef4444' }}>
                        {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="text-center py-1 px-2 font-bold font-mono text-[11px] border border-white/5"
                      style={{ color: rec.pctA5 >= 0.35 ? '#22c55e' : rec.pctA5 >= 0.15 ? '#eab308' : '#ef4444' }}>
                    {(rec.pctA5 * 100).toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">
        <span className="text-sky-400">⌀ Raw</span> = media grezza valore A.&nbsp;
        <span className="text-amber-400">⌀ Pesato</span> = valore corretto per qualità difensiva avversaria (coeff. ±25%).&nbsp;
        Delta in verde/rosso = effetto del coefficiente.
      </p>
    </div>
  );
}

// ─── Gauge scala -5/+5 ────────────────────────────────────────────────────────
function ScaleGauge({ scalePos }) {
  if (scalePos === null || scalePos === undefined)
    return <span className="text-gray-600 text-xs">—</span>;
  const clamped = Math.max(-5, Math.min(5, scalePos));
  const pct = ((clamped + 5) / 10) * 100;
  const color = scaleColor(clamped);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[9px] text-gray-600 font-mono">
        <span>-5</span><span>0</span><span>+5</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-white/10 overflow-hidden">
        <div className="absolute inset-0 rounded-full"
             style={{ background: 'linear-gradient(to right,#ef4444,#f97316,#eab308,#84cc16,#22c55e)' }} />
        <div className="absolute top-0 h-full w-0.5 bg-white shadow-md"
             style={{ left: `${pct}%`, transform: 'translateX(-50%)' }} />
      </div>
      <p className="text-lg font-bold font-mono text-center" style={{ color }}>
        {scaleLabel(scalePos)}
      </p>
    </div>
  );
}

// ─── Filtro input ─────────────────────────────────────────────────────────────
function InputFilterBar({ value, onChange }) {
  const opts = [['all', 'Tutti'], ...INPUT_KEYS_ALL.map(k => [k, k])];
  return (
    <div className="flex gap-1 flex-wrap items-center">
      <span className="text-[11px] text-gray-500 mr-1">Input:</span>
      {opts.map(([id, lbl]) => (
        <button key={id} onClick={() => onChange(id)}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors border
            ${value === id
              ? (id.startsWith('R') ? 'bg-sky-500/25 text-sky-300 border-sky-500/40'
                : id.startsWith('D') ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                : 'bg-amber-500/25 text-amber-300 border-amber-500/40')
              : 'text-gray-500 border-white/10 hover:text-gray-300'}`}>
          {lbl}
        </button>
      ))}
    </div>
  );
}

// ─── Badge coefficiente ───────────────────────────────────────────────────────
function CoeffBadge({ coeff }) {
  if (coeff == null) return <span className="text-gray-600 text-[11px]">—</span>;
  const color = coeffColor(coeff);
  const label = coeff >= 1.005 ? `+${((coeff - 1) * 100).toFixed(0)}%` : coeff <= 0.995 ? `-${((1 - coeff) * 100).toFixed(0)}%` : '=';
  return (
    <span className="font-mono font-bold text-[11px]" style={{ color }}>
      ×{coeff.toFixed(2)} <span className="text-[9px]">({label})</span>
    </span>
  );
}

// =============================================================================
// SQUADRA VIEW
// =============================================================================
function SquadraView({ transformData, scale, summary }) {
  const [inputFilter, setInputFilter] = useState('all');

  if (!transformData) return <EmptyState />;
  const hasData = INPUT_KEYS_ALL.some(k => transformData.teamMatrix[k].total > 0);
  if (!hasData)
    return <EmptyState message="Nessun evento R/D → A trovato. Input validi: R3/R4/R5 (fase ricezione) e D3/D4/D5 (fase difesa)." />;

  const filteredKeys = inputFilter === 'all' ? INPUT_KEYS_ALL
    : inputFilter === 'rice' ? INPUT_RECEPTION
    : inputFilter === 'dif'  ? INPUT_DEFENSE
    : INPUT_KEYS_ALL;

  const barData = filteredKeys
    .filter(k => transformData.teamMatrix[k].total >= 2)
    .map(k => {
      const rec = transformData.teamMatrix[k];
      const sp  = scale[k]?.valid ? valueToScale(rec.weightedAvg, scale[k]) : null;
      return {
        name: k,
        '⌀ Raw':      +rec.rawAvg.toFixed(2),
        '⌀ Pesato':   +rec.weightedAvg.toFixed(2),
        '% A5':       +(rec.pctA5 * 100).toFixed(1),
        scalePos:     sp !== null ? +sp.toFixed(1) : null,
        fill:         k.startsWith('R') ? '#0ea5e9' : '#10b981',
        total:        rec.total,
      };
    });

  const scaleData = barData.filter(d => d.scalePos !== null).map(d => ({
    name: d.name,
    'Posizione scala': d.scalePos,
    fill: scaleColor(d.scalePos),
  }));

  return (
    <div className="space-y-5">
      {/* KPI */}
      {summary && summary.totalAttacks > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="⌀ Pesato da Ricezione"
            value={summary.recWeightedAvg.toFixed(2)}
            sub={`raw: ${summary.recRawAvg.toFixed(2)} · ${summary.recTotal} az.`}
            color="#0ea5e9" />
          <KpiCard label="⌀ Pesato da Difesa"
            value={summary.defWeightedAvg.toFixed(2)}
            sub={`raw: ${summary.defRawAvg.toFixed(2)} · ${summary.defTotal} az.`}
            color="#10b981" />
          <KpiCard label="Miglior conversione"
            value={summary.bestConversion?.key || '—'}
            sub={summary.bestConversion
              ? `pesato ${summary.bestConversion.weightedAvg.toFixed(2)} · A5: ${(summary.bestConversion.pctA5 * 100).toFixed(0)}%`
              : ''}
            color="#22c55e" />
          <KpiCard label="Conversione da migliorare"
            value={summary.worstConversion?.key || '—'}
            sub={summary.worstConversion
              ? `pesato ${summary.worstConversion.weightedAvg.toFixed(2)} · A5: ${(summary.worstConversion.pctA5 * 100).toFixed(0)}%`
              : ''}
            color="#ef4444" />
        </div>
      )}

      {/* Matrice */}
      <div className={`${S.card} p-4`}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className={S.header} style={{ margin: 0 }}>Matrice di Trasformazione — Squadra</p>
          <div className="flex gap-1 text-[11px]">
            {[['all', 'Tutti'], ['rice', 'Ricezione'], ['dif', 'Difesa']].map(([id, lbl]) => (
              <button key={id} onClick={() => setInputFilter(id)}
                className={`px-2 py-0.5 rounded ${inputFilter === id ? 'bg-amber-500/20 text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <TransformationMatrix matrix={transformData.teamMatrix} />
      </div>

      {/* Bar chart raw vs pesato */}
      {barData.length > 0 && (
        <div className={`${S.card} p-4`}>
          <p className={S.header}>⌀ Valore Attacco — Raw vs Pesato per Input</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} margin={{ top: 4, right: 12, bottom: 4, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis domain={[1, 5]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Bar dataKey="⌀ Raw"    fill="#38bdf8" radius={[3,3,0,0]} opacity={0.6} />
              <Bar dataKey="⌀ Pesato" fill="#f59e0b" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Scala */}
      {scaleData.length >= 2 && (
        <div className={`${S.card} p-4`}>
          <p className={S.header}>Posizione Scala (−5 → +5) — Basata su ⌀ Pesato</p>
          <p className="text-[11px] text-gray-600 mb-2">
            0 = media storica pesata. +5 = partita migliore, −5 = peggiore.
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={scaleData} margin={{ top: 4, right: 12, bottom: 4, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis domain={[-5, 5]} ticks={[-5,-3,-1,0,1,3,5]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <Tooltip content={<ChartTip />} />
              <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
              <Bar dataKey="Posizione scala" radius={[3,3,0,0]}>
                {scaleData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PLAYER VIEW
// =============================================================================
function PlayerView({ transformData, scale, scalePositions }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [inputFilter, setInputFilter]       = useState('all');
  const { sortKey, sortDir, toggle, sort }  = useSortable('overall');

  if (!transformData?.players) return <EmptyState />;

  const filteredKeys = inputFilter === 'rice' ? INPUT_RECEPTION
    : inputFilter === 'dif'  ? INPUT_DEFENSE
    : INPUT_KEYS_ALL;

  const rawRows = Object.values(transformData.players)
    .filter(p => INPUT_KEYS_ALL.some(k => p.matrix[k].total >= 2))
    .map(p => {
      const sp  = scalePositions?.[p.number];
      const row = {
        number: p.number, name: p.name, role: p.role,
        overall: sp?.overallScalePos ?? null,
        totalAttacks: sp?.totalAttacks ?? 0,
      };
      for (const k of INPUT_KEYS_ALL) {
        const rec = p.matrix[k];
        row[`raw_${k}`]      = rec?.total >= 2 ? rec.rawAvg : null;
        row[`wgt_${k}`]      = rec?.total >= 2 ? rec.weightedAvg : null;
        row[`sp_${k}`]       = sp?.positions?.[k]?.scalePos ?? null;
        row[`n_${k}`]        = rec?.total ?? 0;
      }
      return row;
    });

  const tableRows = sort(rawRows, (row, key) => {
    if (key === 'name') return row.name;
    if (key === 'overall') return row.overall;
    if (key === 'totalAttacks') return row.totalAttacks;
    return row[`wgt_${key}`];
  });

  if (tableRows.length === 0)
    return <EmptyState message="Nessun player con dati sufficienti (min. 2 attacchi per tipo di input R3/R4/R5/D3/D4/D5)" />;

  const activePlayer   = selectedPlayer ? transformData.players[selectedPlayer] : null;
  const activeScalePos = selectedPlayer ? scalePositions?.[selectedPlayer] : null;

  const radarData = filteredKeys.map(k => ({
    key: k,
    raw:    activePlayer?.matrix[k]?.total >= 2 ? +activePlayer.matrix[k].rawAvg.toFixed(2) : 0,
    pesato: activePlayer?.matrix[k]?.total >= 2 ? +activePlayer.matrix[k].weightedAvg.toFixed(2) : 0,
    fullMark: 5,
  }));

  return (
    <div className="space-y-5">
      <InputFilterBar value={inputFilter} onChange={setInputFilter} />

      <div className={`${S.card} p-4`}>
        <p className={S.header}>Capacità di Trasformazione per Player</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <SortTh label="Player"      colKey="name"        sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-left" />
                <SortTh label="Ruolo"       colKey="role"        sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-left" />
                {filteredKeys.map(k => (
                  <SortTh key={k} label={k} colKey={k} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                ))}
                <SortTh label="Scala ov."   colKey="overall"      sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="Tot att."    colKey="totalAttacks"  sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              </tr>
            </thead>
            <tbody>
              {tableRows.map(row => (
                <tr key={row.number}
                    className={`border-t border-white/5 cursor-pointer transition-colors
                      ${selectedPlayer === row.number ? 'bg-amber-500/10' : 'hover:bg-white/3'}`}
                    onClick={() => setSelectedPlayer(selectedPlayer === row.number ? null : row.number)}>
                  <td className="py-2 px-2 font-semibold text-gray-200">#{row.number} {row.name}</td>
                  <td className="py-2 px-2 text-gray-500 text-[11px]">{row.role || '—'}</td>
                  {filteredKeys.map(k => {
                    const wgt = row[`wgt_${k}`];
                    const raw = row[`raw_${k}`];
                    const sp  = row[`sp_${k}`];
                    const n   = row[`n_${k}`];
                    if (wgt === null) return <td key={k} className="py-2 px-2 text-center text-gray-700">—</td>;
                    const delta = wgt - raw;
                    return (
                      <td key={k} className="py-2 px-1 text-center">
                        <span className="font-mono font-bold text-xs" style={{ color: attackValColor(Math.round(wgt)) }}>
                          {wgt.toFixed(2)}
                        </span>
                        {Math.abs(delta) >= 0.01 && (
                          <span className="block text-[9px] font-mono" style={{ color: delta > 0 ? '#22c55e' : '#f97316' }}>
                            {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                          </span>
                        )}
                        {sp !== null && (
                          <span className="block text-[9px] font-mono" style={{ color: scaleColor(sp) }}>
                            {scaleLabel(sp)}
                          </span>
                        )}
                        <span className="block text-[9px] text-gray-700">({n})</span>
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-center">
                    {row.overall !== null
                      ? <span className="font-mono font-bold text-sm" style={{ color: scaleColor(row.overall) }}>{scaleLabel(row.overall)}</span>
                      : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="py-2 px-2 text-center text-gray-400 font-mono">{row.totalAttacks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-600 mt-2">
          Clicca player per i dettagli. Cella = ⌀ pesato | delta vs raw | posizione scala | (n). Min. 2 azioni per input.
        </p>
      </div>

      {/* Dettaglio player */}
      {activePlayer && activeScalePos && (
        <div className={`${S.card} p-4`}>
          <p className={S.header}>
            #{activePlayer.number} {activePlayer.name}
            {activePlayer.role && <span className="text-gray-600 ml-2 normal-case font-normal text-[11px]">({activePlayer.role})</span>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Radar raw vs pesato */}
            <div>
              <p className="text-[11px] text-gray-500 mb-1">⌀ Raw vs ⌀ Pesato per Input</p>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#ffffff15" />
                  <PolarAngleAxis dataKey="key" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: '#9ca3af', fontSize: 9 }} tickCount={4} />
                  <Radar name="⌀ Raw"    dataKey="raw"    stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.15} />
                  <Radar name="⌀ Pesato" dataKey="pesato" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            {/* Scale per input */}
            <div>
              <p className="text-[11px] text-gray-500 mb-2">Posizione Scala per Input (basata su ⌀ Pesato)</p>
              <div className="space-y-2.5">
                {filteredKeys.map(k => {
                  const pos = activeScalePos.positions?.[k];
                  if (!pos?.total || pos.total < 2) return null;
                  return (
                    <div key={k} className="bg-white/4 rounded-lg p-2.5">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-semibold text-gray-300">{k}</span>
                        <span className="text-[10px] text-gray-500">
                          {pos.total} att. · raw {pos.rawAvg?.toFixed(2)} · pesato <span className="text-amber-400">{pos.weightedAvg?.toFixed(2)}</span>
                        </span>
                      </div>
                      <ScaleGauge scalePos={pos.scalePos} />
                      <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                        <span style={{ color: '#22c55e' }}>A5: {pos.pctA5 !== undefined ? (pos.pctA5*100).toFixed(0) : '—'}%</span>
                        <span style={{ color: '#ef4444' }}>A1: {pos.pctA1 !== undefined ? (pos.pctA1*100).toFixed(0) : '—'}%</span>
                      </div>
                    </div>
                  );
                }).filter(Boolean)}
                <div className="bg-amber-500/8 rounded-lg p-2.5 border border-amber-500/20">
                  <p className="text-[11px] font-semibold text-amber-400 mb-1.5">Scala Overall</p>
                  <ScaleGauge scalePos={activeScalePos.overallScalePos} />
                </div>
              </div>
            </div>
          </div>

          {/* Evoluzione per partita */}
          {activePlayer.perMatch.length >= 2 && (
            <div className="mt-4">
              <p className="text-[11px] text-gray-500 mb-2">Evoluzione per Partita (⌀ Pesato)</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart
                  data={activePlayer.perMatch.map(pm => {
                    let tot = 0, raw = 0, wgt = 0;
                    for (const k of INPUT_KEYS_ALL) {
                      const rec = pm.matrix[k];
                      if (rec?.total >= 1) { tot += rec.total; raw += rec.rawAvg * rec.total; wgt += rec.weightedAvg * rec.total; }
                    }
                    return {
                      opp:    (pm.opponent || '?').substring(0, 8),
                      raw:    tot > 0 ? +(raw/tot).toFixed(2) : null,
                      pesato: tot > 0 ? +(wgt/tot).toFixed(2) : null,
                      coeff:  pm.coeff,
                    };
                  }).filter(d => d.pesato !== null)}
                  margin={{ top: 4, right: 12, bottom: 4, left: -15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="opp" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis domain={[1,5]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <Tooltip content={<ChartTip />} />
                  <ReferenceLine y={3} stroke="#ffffff20" strokeDasharray="4 4" />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="raw"    name="⌀ Raw"    stroke="#38bdf8" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="5 2" connectNulls />
                  <Line type="monotone" dataKey="pesato" name="⌀ Pesato" stroke="#f59e0b" strokeWidth={2}   dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-4">
            <TransformationMatrix matrix={activePlayer.matrix} title={`Matrice — ${activePlayer.name}`} />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PER PARTITA VIEW
// =============================================================================
function PerPartitaView({ transformData, scale }) {
  const [inputFilter, setInputFilter] = useState('R5');
  const { sortKey, sortDir, toggle, sort } = useSortable('date');

  if (!transformData?.perMatch?.length) return <EmptyState />;
  const hasData = transformData.perMatch.some(pm => INPUT_KEYS_ALL.some(k => pm.matrix[k].total > 0));
  if (!hasData) return <EmptyState message="Nessun evento di trasformazione nelle partite caricate" />;

  const rawRows = transformData.perMatch.map(pm => {
    const row = { matchId: pm.matchId, opponent: pm.opponent, date: pm.date, coeff: pm.coeff };
    let tot = 0, rawS = 0, wgtS = 0;
    for (const k of INPUT_KEYS_ALL) {
      const rec = pm.matrix[k];
      row[`raw_${k}`] = rec?.total >= 1 ? rec.rawAvg : null;
      row[`wgt_${k}`] = rec?.total >= 1 ? rec.weightedAvg : null;
      row[`n_${k}`]   = rec?.total || 0;
      if (rec?.total >= 1) { tot += rec.total; rawS += rec.rawAvg * rec.total; wgtS += rec.weightedAvg * rec.total; }
    }
    row.overallRaw = tot > 0 ? rawS / tot : null;
    row.overallWgt = tot > 0 ? wgtS / tot : null;
    row.totalEvents = pm.totalEvents;
    row.actualAvgOppD = pm.actualAvgOppD;
    row.expectedOppD  = pm.expectedOppD;
    return row;
  });

  const tableRows = sort(rawRows, (row, key) => {
    if (key === 'opponent') return row.opponent;
    if (key === 'date')     return row.date;
    if (key === 'coeff')    return row.coeff;
    if (key === 'overall')  return row.overallWgt;
    if (key === 'total')    return row.totalEvents;
    return row[`wgt_${key}`];
  });

  const lineData = [...tableRows].sort((a, b) => a.date.localeCompare(b.date))
    .filter(r => r.overallWgt !== null)
    .map(r => ({
      opp:           r.opponent.substring(0, 8),
      '⌀ Raw':       r.overallRaw !== null ? +r.overallRaw.toFixed(2) : null,
      '⌀ Pesato':    +r.overallWgt.toFixed(2),
      Coefficiente:  +r.coeff.toFixed(3),
    }));

  return (
    <div className="space-y-5">
      <div className={`${S.card} p-3`}>
        <InputFilterBar value={inputFilter} onChange={setInputFilter} />
      </div>

      {/* Andamento per partita */}
      {lineData.length >= 2 && (
        <div className={`${S.card} p-4`}>
          <p className={S.header}>Andamento ⌀ Pesato per Partita</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={lineData} margin={{ top: 4, right: 30, bottom: 4, left: -15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="opp" tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <YAxis yAxisId="val" domain={[1,5]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <YAxis yAxisId="coeff" orientation="right" domain={[0.7,1.3]} tick={{ fill: '#a855f7', fontSize: 9 }}
                tickFormatter={v => `×${v.toFixed(2)}`} />
              <Tooltip content={<ChartTip />} />
              <ReferenceLine yAxisId="val" y={3} stroke="#ffffff20" strokeDasharray="4 4" />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Line yAxisId="val"   type="monotone" dataKey="⌀ Raw"      stroke="#38bdf8" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="5 2" connectNulls />
              <Line yAxisId="val"   type="monotone" dataKey="⌀ Pesato"   stroke="#f59e0b" strokeWidth={2}   dot={{ r: 3 }} connectNulls />
              <Line yAxisId="coeff" type="monotone" dataKey="Coefficiente" stroke="#a855f7" strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="3 2" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabella per partita */}
      <div className={`${S.card} p-4`}>
        <p className={S.header}>Tabella Riepilogativa per Partita</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <SortTh label="Avversario"  colKey="opponent" sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-left" />
                <SortTh label="Data"        colKey="date"     sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-left" />
                <SortTh label="Coeff. ±25%" colKey="coeff"    sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="D avv. eff." colKey="actualD"  sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="D avv. att." colKey="expectD"  sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                {INPUT_KEYS_ALL.map(k => (
                  <SortTh key={k} label={k} colKey={k} sortKey={sortKey} sortDir={sortDir} onSort={toggle}
                          className={inputFilter === k ? 'bg-amber-500/5' : ''} />
                ))}
                <SortTh label="⌀ Gen." colKey="overall" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="n att."  colKey="total"  sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              </tr>
            </thead>
            <tbody>
              {tableRows.map(row => (
                <tr key={row.matchId} className="border-t border-white/5 hover:bg-white/3">
                  <td className="py-2 px-2 font-semibold text-gray-200">{row.opponent}</td>
                  <td className="py-2 px-2 text-gray-500">{(row.date || '').substring(0, 10)}</td>
                  <td className="py-2 px-2 text-center"><CoeffBadge coeff={row.coeff} /></td>
                  <td className="py-2 px-2 text-center font-mono text-[11px] text-gray-400">
                    {row.actualAvgOppD != null ? row.actualAvgOppD.toFixed(2) : '—'}
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-[11px] text-gray-600">
                    {row.expectedOppD != null ? row.expectedOppD.toFixed(2) : '—'}
                  </td>
                  {INPUT_KEYS_ALL.map(k => {
                    const wgt = row[`wgt_${k}`];
                    const raw = row[`raw_${k}`];
                    const n   = row[`n_${k}`];
                    const sp  = wgt !== null && scale?.[k]?.valid ? valueToScale(wgt, scale[k]) : null;
                    if (wgt === null)
                      return <td key={k} className={`py-2 px-1 text-center text-gray-700 ${inputFilter === k ? 'bg-amber-500/5' : ''}`}>—</td>;
                    const delta = wgt - raw;
                    return (
                      <td key={k} className={`py-2 px-1 text-center ${inputFilter === k ? 'bg-amber-500/5' : ''}`}>
                        <span className="font-mono font-bold" style={{ color: attackValColor(Math.round(wgt)) }}>{wgt.toFixed(1)}</span>
                        {Math.abs(delta) >= 0.01 && (
                          <span className="block text-[9px] font-mono" style={{ color: delta > 0 ? '#22c55e' : '#f97316' }}>
                            {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                          </span>
                        )}
                        {sp !== null && <span className="block text-[9px] font-mono" style={{ color: scaleColor(sp) }}>{scaleLabel(sp)}</span>}
                        <span className="block text-[9px] text-gray-700">({n})</span>
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-center font-mono font-bold"
                      style={{ color: row.overallWgt != null ? attackValColor(Math.round(row.overallWgt)) : '#6b7280' }}>
                    {row.overallWgt != null ? row.overallWgt.toFixed(2) : '—'}
                  </td>
                  <td className="py-2 px-2 text-center text-gray-400 font-mono">{row.totalEvents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 p-3 bg-white/3 rounded-lg text-[10px] text-gray-600 leading-relaxed">
          <span className="text-purple-400 font-semibold">Coeff. ±25%</span>: derivato da (D avv. effettiva − D avv. attesa per classifica) / range.
          &nbsp;&gt;1 = avversario ha difeso meglio del previsto → i tuoi attacchi valgono di più.
          &nbsp;<span className="text-gray-400">D avv. eff.</span> = media D implicita dai tuoi A in quella partita.
          &nbsp;<span className="text-gray-400">D avv. att.</span> = D attesa da classifica/punti.
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// AVVERSARIO VIEW
// =============================================================================
function AvversarioView({ oppDefContext }) {
  const { sortKey, sortDir, toggle, sort } = useSortable('date');

  if (!oppDefContext?.perMatch?.length) return <EmptyState message="Nessun dato sulla difesa avversaria" />;
  const { perMatch, leagueBenchmarkD } = oppDefContext;
  const hasData = perMatch.some(pm => pm.avgImpliedD !== null && pm.total > 0);
  if (!hasData)
    return <EmptyState message="Nessuna difesa avversaria calcolabile. Verifica che ci siano attacchi A2/A3/A4/A5 nelle partite." />;

  const defChartData = perMatch.filter(pm => pm.avgImpliedD !== null).map(pm => ({
    opp:          pm.opponent.substring(0, 8),
    'D eff.':     +pm.avgImpliedD.toFixed(2),
    'D attesa':   pm.expectedOppD != null ? +pm.expectedOppD.toFixed(2) : null,
    fill:         pm.avgImpliedD >= (leagueBenchmarkD || 0) ? '#ef4444' : '#22c55e',
  }));

  const deltaData = perMatch.filter(pm => pm.deltaVsExpected !== null).map(pm => ({
    opp:                pm.opponent.substring(0, 8),
    'Δ vs atteso':      +pm.deltaVsExpected.toFixed(2),
    fill:               pm.deltaVsExpected >= 0 ? '#ef4444' : '#22c55e',
  }));

  const coeffData = perMatch.filter(pm => pm.coeff != null).map(pm => ({
    opp:         pm.opponent.substring(0, 8),
    Coefficiente: +pm.coeff.toFixed(3),
    fill:         coeffColor(pm.coeff),
  }));

  const rawRows = perMatch.map(pm => ({ ...pm }));
  const tableRows = sort(rawRows, (row, key) => row[key]);

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="D media implicita (benchmark)"
          value={leagueBenchmarkD != null ? leagueBenchmarkD.toFixed(2) : '—'}
          sub={`su ${oppDefContext.totalAttacks} attacchi totali`}
          color="#6b7280" />
        <KpiCard label="Avversario più debole vs noi"
          value={(() => { const b = perMatch.filter(p => p.avgImpliedD != null).sort((a,b) => a.avgImpliedD - b.avgImpliedD)[0]; return b ? b.avgImpliedD.toFixed(2) : '—'; })()}
          sub={(() => { const b = perMatch.filter(p => p.avgImpliedD != null).sort((a,b) => a.avgImpliedD - b.avgImpliedD)[0]; return b?.opponent || ''; })()}
          color="#22c55e" />
        <KpiCard label="Avversario più forte vs noi"
          value={(() => { const w = perMatch.filter(p => p.avgImpliedD != null).sort((a,b) => b.avgImpliedD - a.avgImpliedD)[0]; return w ? w.avgImpliedD.toFixed(2) : '—'; })()}
          sub={(() => { const w = perMatch.filter(p => p.avgImpliedD != null).sort((a,b) => b.avgImpliedD - a.avgImpliedD)[0]; return w?.opponent || ''; })()}
          color="#ef4444" />
      </div>

      {/* D effettiva vs attesa */}
      {defChartData.length >= 2 && (
        <div className={`${S.card} p-4`}>
          <p className={S.header}>D Avversaria Implicita — Effettiva vs Attesa da Classifica</p>
          <p className="text-[11px] text-gray-600 mb-2">
            Verde = hanno difeso peggio del benchmark (meglio per noi). Rosso = hanno difeso meglio.
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={defChartData} margin={{ top: 4, right: 12, bottom: 4, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="opp" tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <YAxis domain={[0, 5]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              {leagueBenchmarkD != null && (
                <ReferenceLine y={leagueBenchmarkD} stroke="#6b7280" strokeDasharray="6 3"
                  label={{ value: `Benchmark ${leagueBenchmarkD.toFixed(2)}`, fill: '#6b7280', fontSize: 9, position: 'insideTopRight' }} />
              )}
              <Bar dataKey="D eff." radius={[3,3,0,0]}>
                {defChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
              <Line dataKey="D attesa" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 2" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Delta vs atteso */}
      {deltaData.length >= 2 && (
        <div className={`${S.card} p-4`}>
          <p className={S.header}>Δ Difesa Avversaria vs Attesa (sovra/sotto performance)</p>
          <p className="text-[11px] text-gray-600 mb-2">
            Verde = hanno difeso PEGGIO delle aspettative per il loro rank → vantaggio per noi.
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={deltaData} margin={{ top: 4, right: 12, bottom: 4, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="opp" tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <Tooltip content={<ChartTip />} />
              <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
              <Bar dataKey="Δ vs atteso" radius={[3,3,0,0]}>
                {deltaData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Coefficiente per partita */}
      {coeffData.length >= 2 && (
        <div className={`${S.card} p-4`}>
          <p className={S.header}>Coefficiente di Ponderazione Applicato per Partita</p>
          <p className="text-[11px] text-gray-600 mb-2">
            Verde &gt;1 = i tuoi attacchi sono valorizzati (avversario più tosto del previsto). Rosso &lt;1 = scontati.
          </p>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={coeffData} margin={{ top: 4, right: 12, bottom: 4, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="opp" tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <YAxis domain={[0.7, 1.3]} tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `×${v.toFixed(2)}`} />
              <Tooltip content={<ChartTip />} />
              <ReferenceLine y={1} stroke="#6b7280" strokeDasharray="4 4" />
              <Bar dataKey="Coefficiente" radius={[3,3,0,0]}>
                {coeffData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabella dettaglio */}
      <div className={`${S.card} p-4`}>
        <p className={S.header}>Dettaglio per Partita</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <SortTh label="Avversario"   colKey="opponent"      sortKey={sortKey} sortDir={sortDir} onSort={toggle} className="text-left" />
                <SortTh label="Rank"         colKey="oppRank"       sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="Punti"        colKey="oppPoints"     sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="D eff."       colKey="avgImpliedD"   sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="D attesa"     colKey="expectedOppD"  sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="Δ vs att."    colKey="deltaVsExpected" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="Coeff."       colKey="coeff"         sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="% Kill (A5)"  colKey="killRate"      sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
                <SortTh label="n att."       colKey="total"         sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              </tr>
            </thead>
            <tbody>
              {tableRows.map(pm => {
                const dvsExp = pm.deltaVsExpected;
                return (
                  <tr key={pm.matchId} className="border-t border-white/5 hover:bg-white/3">
                    <td className="py-2 px-2 font-semibold text-gray-200">{pm.opponent}</td>
                    <td className="py-2 px-2 text-center text-gray-400">{pm.oppRank ?? '—'}</td>
                    <td className="py-2 px-2 text-center text-gray-400">{pm.oppPoints ?? '—'}</td>
                    <td className="py-2 px-2 text-center font-mono font-bold"
                        style={{ color: pm.avgImpliedD != null ? attackValColor(Math.round(pm.avgImpliedD)) : '#6b7280' }}>
                      {pm.avgImpliedD != null ? pm.avgImpliedD.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-gray-500">
                      {pm.expectedOppD != null ? pm.expectedOppD.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-bold"
                        style={{ color: dvsExp == null ? '#6b7280' : dvsExp <= 0 ? '#22c55e' : '#ef4444' }}>
                      {dvsExp != null ? (dvsExp > 0 ? '+' : '') + dvsExp.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 px-2 text-center"><CoeffBadge coeff={pm.coeff} /></td>
                    <td className="py-2 px-2 text-center font-mono" style={{ color: '#22c55e' }}>
                      {pm.total > 0 ? (pm.killRate * 100).toFixed(0) + '%' : '—'}
                    </td>
                    <td className="py-2 px-2 text-center text-gray-400 font-mono">{pm.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 p-3 bg-white/3 rounded-lg text-[10px] text-gray-600 leading-relaxed">
          <span className="text-gray-400 font-semibold">D eff.</span> = media D implicita dai tuoi A in quella partita (A5→D1, A4→D2, A3→D3, A2→D4.5).
          &nbsp;<span className="text-gray-400 font-semibold">D attesa</span> = D attesa per quell'avversario in base ai punti in classifica.
          &nbsp;<span className="text-gray-400 font-semibold">Δ negativo (verde)</span> = hanno difeso peggio del previsto → vantaggio tuo.
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENTE PRINCIPALE
// =============================================================================
const SUB_TABS = [
  { id: 'squadra',    label: 'Squadra',    icon: '🛡' },
  { id: 'player',     label: 'Player',     icon: '★'  },
  { id: 'partite',    label: 'Partite',    icon: '📅' },
  { id: 'avversario', label: 'Avversario', icon: '🎯' },
];

export default function GiocoAnalysis({ matches = [], standings = [], roster = [] }) {
  const [subTab, setSubTab] = useState('squadra');

  const transformData = useMemo(
    () => analyzeAttackerTransformation(matches, roster, standings),
    [matches, roster, standings]
  );
  const scale = useMemo(
    () => transformData ? computeTransformationScale(transformData) : {},
    [transformData]
  );
  const scalePositions = useMemo(
    () => transformData ? computePlayerScalePositions(transformData, scale) : {},
    [transformData, scale]
  );
  const summary = useMemo(
    () => transformData ? computeTransformationSummary(transformData) : null,
    [transformData]
  );
  const oppDefContext = useMemo(
    () => analyzeOpponentDefenseContext(matches, standings),
    [matches, standings]
  );

  if (!matches.length)
    return <div className="p-4"><EmptyState message="Carica le partite per visualizzare l'analisi del gioco" /></div>;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-100">Analisi del Gioco</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Trasformazione R/D → A pesata per qualità difensiva avversaria · Coefficiente ±25% da classifica
        </p>
      </div>

      <SubTabBar tabs={SUB_TABS} active={subTab} onChange={setSubTab} />

      {subTab === 'squadra'    && <SquadraView    transformData={transformData} scale={scale} summary={summary} />}
      {subTab === 'player'     && <PlayerView     transformData={transformData} scale={scale} scalePositions={scalePositions} />}
      {subTab === 'partite'    && <PerPartitaView  transformData={transformData} scale={scale} />}
      {subTab === 'avversario' && <AvversarioView  oppDefContext={oppDefContext} />}
    </div>
  );
}
