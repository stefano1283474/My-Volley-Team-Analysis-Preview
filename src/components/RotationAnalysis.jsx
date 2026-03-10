import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { COLORS } from '../utils/constants';

// Attack quality labels (columns in conversion table)
const ATTACK_QUALITY = ['A5', 'A4', 'A3', 'A2', 'A1'];
const ATTACK_COL_LABELS = {
  A5: 'A5 Punto', A4: 'A4 Freeball', A3: 'A3 Bagher↑', A2: 'A2 Pall↑', A1: 'A1 Errore',
};
const ATTACK_COL_COLORS = {
  A5: '#a3e635', A4: '#0ea5e9', A3: '#f59e0b', A2: '#8b5cf6', A1: '#fb7185',
};

// R/D source keys to show in conversion table
const RD_KEYS = ['R5', 'R4', 'R3', 'D5', 'D4', 'D3'];
const RD_LABELS = {
  R5: 'Ric. 5', R4: 'Ric. 4', R3: 'Ric. 3',
  D5: 'Dif. 5', D4: 'Dif. 4', D3: 'Dif. 3',
};
const RD_SECTION_COLORS = {
  R5: '#0ea5e9', R4: '#0ea5e9', R3: '#0ea5e9',
  D5: '#10b981', D4: '#10b981', D3: '#10b981',
};

// Build team-level R/D → A conversion table from matchAnalytics sources
function computeRdaTable(sources) {
  const result = {};
  for (const key of RD_KEYS) {
    result[key] = { total: 0, A1: 0, A2: 0, A3: 0, A4: 0, A5: 0, other: 0 };
  }
  for (const src of sources) {
    const cbtq = src.chains?.conversionByTouchQuality || {};
    for (const key of RD_KEYS) {
      if (!cbtq[key]) continue;
      const entry = cbtq[key];
      result[key].total += entry.total || 0;
      const na = entry.nextActions || {};
      for (const aq of ATTACK_QUALITY) {
        result[key][aq] = (result[key][aq] || 0) + (na[aq] || 0);
      }
    }
  }
  // Fill 'other' = total - sum of tracked attacks
  for (const key of RD_KEYS) {
    const tracked = ATTACK_QUALITY.reduce((s, aq) => s + result[key][aq], 0);
    result[key].other = Math.max(0, result[key].total - tracked);
  }
  return result;
}

// Build per-player R/D → A conversion by iterating raw quartine
function computeRdaByPlayer(sources) {
  const players = {};
  for (const src of sources) {
    for (const rally of src.match?.rallies || []) {
      const { quartine } = rally;
      if (!quartine || quartine.length < 2) continue;
      for (let i = 0; i < quartine.length - 1; i++) {
        const curr = quartine[i];
        const next = quartine[i + 1];
        if (curr.type !== 'action') continue;
        const fund = (curr.fundamental || '').toLowerCase();
        const val = curr.value;
        // Only R3+ and D3+
        if (!['r', 'd'].includes(fund) || val < 3) continue;
        const pNum = curr.player;
        if (!pNum) continue;
        if (!players[pNum]) players[pNum] = {};
        const key = `${fund.toUpperCase()}${val}`;
        if (!players[pNum][key]) {
          players[pNum][key] = { total: 0, A1: 0, A2: 0, A3: 0, A4: 0, A5: 0, other: 0 };
        }
        players[pNum][key].total++;
        if (next.type === 'action' && (next.fundamental || '').toUpperCase() === 'A') {
          const aq = `A${next.value}`;
          if (ATTACK_QUALITY.includes(aq)) {
            players[pNum][key][aq]++;
          } else {
            players[pNum][key].other++;
          }
        } else {
          players[pNum][key].other++;
        }
      }
    }
  }
  return players;
}

// Percent helper (safe)
function pct(num, den) {
  if (!den || den === 0) return null;
  return (num / den * 100);
}

// Cell color based on value (A5 = higher is better, A1 = lower is better)
function cellColor(aq, value) {
  if (value === null) return 'text-gray-600';
  if (aq === 'A5' || aq === 'A4') {
    return value >= 40 ? 'text-green-400' : value >= 20 ? 'text-amber-400' : 'text-gray-400';
  }
  if (aq === 'A1') {
    return value >= 20 ? 'text-red-400' : value >= 10 ? 'text-amber-400' : 'text-gray-400';
  }
  return 'text-gray-300';
}

export default function RotationAnalysis({ analytics, matches, allPlayers }) {
  const [viewMode, setViewMode] = useState('match');       // 'match' | 'aggregate'
  const [selectedMatchIdx, setSelectedMatchIdx] = useState(-1); // -1 = last match
  const [convPlayerFilter, setConvPlayerFilter] = useState(null); // null = team view

  if (!analytics || matches.length === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl font-bold text-white mb-2">Analisi Rotazioni</h2>
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-sm">
          <div className="text-4xl mb-3">⟳</div>
          <p>Carica partite per analizzare le rotazioni.</p>
        </div>
      </div>
    );
  }

  const { matchAnalytics } = analytics;

  // Resolve the active single match
  const resolvedIdx = selectedMatchIdx === -1 || selectedMatchIdx >= matchAnalytics.length
    ? matchAnalytics.length - 1
    : selectedMatchIdx;

  const selectedMA = useMemo(() => {
    if (viewMode === 'aggregate') return null;
    return matchAnalytics[resolvedIdx] || null;
  }, [viewMode, resolvedIdx, matchAnalytics]);

  // Sources for conversion calculations
  const convSources = useMemo(
    () => viewMode === 'aggregate' ? matchAnalytics : (selectedMA ? [selectedMA] : []),
    [viewMode, matchAnalytics, selectedMA]
  );

  // Aggregate rotation data
  const aggregateRotData = useMemo(() => {
    const rotations = {};
    for (let r = 1; r <= 6; r++) {
      rotations[r] = {
        rotation: `P${r}`,
        sideOutTotal: 0, sideOutWon: 0,
        breakTotal: 0, breakWon: 0,
        totalPoints: 0, totalActions: 0,
      };
    }
    for (const ma of matchAnalytics) {
      for (const rally of ma.match.rallies || []) {
        const rot = rally.rotation;
        if (!rot || rot < 1 || rot > 6) continue;
        if (rally.phase === 'r') {
          rotations[rot].sideOutTotal++;
          if (rally.isPoint) rotations[rot].sideOutWon++;
        } else if (rally.phase === 'b') {
          rotations[rot].breakTotal++;
          if (rally.isPoint) rotations[rot].breakWon++;
        }
        rotations[rot].totalActions++;
        if (rally.isPoint) rotations[rot].totalPoints++;
      }
    }
    return Object.values(rotations).map(r => ({
      ...r,
      sideOutPct: r.sideOutTotal > 0 ? (r.sideOutWon / r.sideOutTotal * 100) : 0,
      breakPct: r.breakTotal > 0 ? (r.breakWon / r.breakTotal * 100) : 0,
      pointPct: r.totalActions > 0 ? (r.totalPoints / r.totalActions * 100) : 0,
    }));
  }, [matchAnalytics]);

  // Per-match rotation data
  const matchRotData = useMemo(() => {
    if (!selectedMA) return [];
    const rotations = {};
    for (let r = 1; r <= 6; r++) {
      rotations[r] = {
        rotation: `P${r}`, sideOutTotal: 0, sideOutWon: 0,
        breakTotal: 0, breakWon: 0, lineup: '',
      };
    }
    for (const rally of selectedMA.match.rallies || []) {
      const rot = rally.rotation;
      if (!rot || rot < 1 || rot > 6) continue;
      if (rally.phase === 'r') {
        rotations[rot].sideOutTotal++;
        if (rally.isPoint) rotations[rot].sideOutWon++;
      } else {
        rotations[rot].breakTotal++;
        if (rally.isPoint) rotations[rot].breakWon++;
      }
    }
    const riepilogoRots = selectedMA.match.riepilogo?.rotations || [];
    for (const rr of riepilogoRots) {
      if (rotations[rr.rotation]) rotations[rr.rotation].lineup = rr.lineup;
    }
    return Object.values(rotations).map(r => ({
      ...r,
      sideOutPct: r.sideOutTotal > 0 ? (r.sideOutWon / r.sideOutTotal * 100) : 0,
      breakPct: r.breakTotal > 0 ? (r.breakWon / r.breakTotal * 100) : 0,
    }));
  }, [selectedMA]);

  // R/D → A conversion: team level
  const rdaTeamData = useMemo(() => computeRdaTable(convSources), [convSources]);

  // R/D → A conversion: per player
  const rdaPlayerData = useMemo(() => computeRdaByPlayer(convSources), [convSources]);

  // Players with R/D data (for filter buttons)
  const convPlayers = useMemo(() => {
    return Object.keys(rdaPlayerData)
      .map(num => {
        const p = (allPlayers || []).find(pl => pl.number === +num);
        return { number: +num, label: p ? `#${p.number} ${p.surname}` : `#${num}` };
      })
      .sort((a, b) => a.number - b.number);
  }, [rdaPlayerData, allPlayers]);

  // Active conversion table data
  const activeRdaData = (convPlayerFilter !== null && rdaPlayerData[convPlayerFilter])
    ? rdaPlayerData[convPlayerFilter]
    : rdaTeamData;

  const currentRotData = viewMode === 'aggregate' ? aggregateRotData : matchRotData;

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Analisi Rotazioni</h2>
          <p className="text-sm text-gray-400">
            {viewMode === 'aggregate'
              ? `Aggregato su ${matches.length} partite`
              : `vs ${selectedMA?.match.metadata?.opponent || 'N/D'} — ${selectedMA?.match.metadata?.date || ''}`}
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('match')}
            className={`px-3 py-1.5 rounded-lg text-xs ${viewMode === 'match' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-400'}`}
          >
            Singola Partita
          </button>
          <button
            onClick={() => setViewMode('aggregate')}
            className={`px-3 py-1.5 rounded-lg text-xs ${viewMode === 'aggregate' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-400'}`}
          >
            Aggregato
          </button>
        </div>
      </div>

      {/* ── Match selector (single-match mode only) ── */}
      {viewMode === 'match' && matchAnalytics.length > 1 && (
        <div className="glass-card p-3">
          <p className="text-[10px] text-gray-500 mb-2">Seleziona partita:</p>
          <div className="flex gap-1.5 flex-wrap">
            {matchAnalytics.map((ma, idx) => {
              const isActive = idx === resolvedIdx;
              const opp = (ma.match.metadata?.opponent || 'N/D').substring(0, 12);
              const date = ma.match.metadata?.date || '';
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedMatchIdx(idx)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] transition-all ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-400 font-medium'
                      : 'bg-white/[0.03] text-gray-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  {opp}
                  {date && <span className="text-gray-500 ml-1">{date}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Rotation bar chart ── */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Side-Out % e Break-Point % per Rotazione</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={currentRotData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="rotation" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="sideOutPct" name="Side-Out %" fill={COLORS.raw} radius={[4, 4, 0, 0]} />
            <Bar dataKey="breakPct" name="Break-Point %" fill={COLORS.positive} radius={[4, 4, 0, 0]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Rotation detail table ── */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Dettaglio Rotazioni</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/5">
              <th className="text-left py-2 px-2">Rot.</th>
              {viewMode === 'match' && <th className="text-left py-2 px-2">Lineup</th>}
              <th className="text-center py-2 px-2">SO Won</th>
              <th className="text-center py-2 px-2">SO Tot</th>
              <th className="text-center py-2 px-2">SO %</th>
              <th className="text-center py-2 px-2">BP Won</th>
              <th className="text-center py-2 px-2">BP Tot</th>
              <th className="text-center py-2 px-2">BP %</th>
            </tr>
          </thead>
          <tbody>
            {currentRotData.map(r => (
              <tr key={r.rotation} className="border-b border-white/[0.03]">
                <td className="py-2 px-2 font-mono font-bold text-amber-400">{r.rotation}</td>
                {viewMode === 'match' && (
                  <td className="py-2 px-2 text-gray-400 text-[10px]">{r.lineup}</td>
                )}
                <td className="text-center py-2 px-2 text-gray-300">{r.sideOutWon}</td>
                <td className="text-center py-2 px-2 text-gray-500">{r.sideOutTotal}</td>
                <td className={`text-center py-2 px-2 font-mono font-bold ${r.sideOutPct > 55 ? 'text-green-400' : r.sideOutPct > 45 ? 'text-amber-400' : 'text-red-400'}`}>
                  {r.sideOutPct.toFixed(0)}%
                </td>
                <td className="text-center py-2 px-2 text-gray-300">{r.breakWon}</td>
                <td className="text-center py-2 px-2 text-gray-500">{r.breakTotal}</td>
                <td className={`text-center py-2 px-2 font-mono font-bold ${r.breakPct > 45 ? 'text-green-400' : r.breakPct > 35 ? 'text-amber-400' : 'text-red-400'}`}>
                  {r.breakPct.toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── R/D → A Conversion Table ── */}
      <div className="glass-card p-5">
        <div className="flex items-start justify-between mb-1 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-300">
              Conversione Ricezione/Difesa → Attacco
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Qualità dell'attacco successivo a un tocco di ricezione o difesa di buona qualità (3–5).
              Indica l'efficacia nella costruzione del gioco.
            </p>
          </div>
        </div>

        {/* Player filter */}
        <div className="flex gap-1 flex-wrap mb-4 mt-3">
          <button
            onClick={() => setConvPlayerFilter(null)}
            className={`px-2.5 py-1 rounded text-[10px] transition-all ${
              convPlayerFilter === null
                ? 'bg-amber-500/20 text-amber-400 font-medium'
                : 'bg-white/[0.03] text-gray-400 hover:text-white'
            }`}
          >
            👥 Squadra
          </button>
          {convPlayers.map(p => (
            <button
              key={p.number}
              onClick={() => setConvPlayerFilter(convPlayerFilter === p.number ? null : p.number)}
              className={`px-2.5 py-1 rounded text-[10px] transition-all ${
                convPlayerFilter === p.number
                  ? 'bg-sky-500/20 text-sky-400 font-medium'
                  : 'bg-white/[0.03] text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Conversion table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-white/5">
                <th className="text-left py-2 px-3 text-gray-400">Qualità tocco</th>
                <th className="text-center py-2 px-2 text-gray-500">Totale</th>
                {ATTACK_QUALITY.map(aq => (
                  <th key={aq} className="text-center py-2 px-2" style={{ color: ATTACK_COL_COLORS[aq] }}>
                    {ATTACK_COL_LABELS[aq]}
                  </th>
                ))}
                <th className="text-center py-2 px-2 text-gray-600">Altro</th>
              </tr>
            </thead>
            <tbody>
              {/* Reception rows */}
              {['R5', 'R4', 'R3'].map((key, i) => {
                const row = activeRdaData[key] || {};
                const total = row.total || 0;
                return (
                  <tr
                    key={key}
                    className={`border-b border-white/[0.03] ${i === 0 ? 'border-t border-sky-400/10' : ''}`}
                  >
                    <td className="py-2 px-3">
                      <span className="font-mono font-bold text-sky-400">{key}</span>
                      <span className="text-gray-500 ml-2">{RD_LABELS[key]}</span>
                    </td>
                    <td className="text-center py-2 px-2 font-mono text-gray-400">{total}</td>
                    {ATTACK_QUALITY.map(aq => {
                      const p = pct(row[aq] || 0, total);
                      return (
                        <td key={aq} className={`text-center py-2 px-2 font-mono font-medium ${cellColor(aq, p)}`}>
                          {p !== null ? `${p.toFixed(0)}%` : '—'}
                          {total > 0 && <span className="text-gray-600 text-[9px] block">{row[aq] || 0}</span>}
                        </td>
                      );
                    })}
                    <td className="text-center py-2 px-2 font-mono text-gray-600 text-[10px]">
                      {total > 0 ? `${pct(row.other || 0, total).toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                );
              })}

              {/* Divider row */}
              <tr className="border-b border-white/[0.05]">
                <td colSpan={8} className="py-1" />
              </tr>

              {/* Defense rows */}
              {['D5', 'D4', 'D3'].map((key, i) => {
                const row = activeRdaData[key] || {};
                const total = row.total || 0;
                return (
                  <tr
                    key={key}
                    className={`border-b border-white/[0.03] ${i === 0 ? 'border-t border-green-400/10' : ''}`}
                  >
                    <td className="py-2 px-3">
                      <span className="font-mono font-bold text-emerald-400">{key}</span>
                      <span className="text-gray-500 ml-2">{RD_LABELS[key]}</span>
                    </td>
                    <td className="text-center py-2 px-2 font-mono text-gray-400">{total}</td>
                    {ATTACK_QUALITY.map(aq => {
                      const p = pct(row[aq] || 0, total);
                      return (
                        <td key={aq} className={`text-center py-2 px-2 font-mono font-medium ${cellColor(aq, p)}`}>
                          {p !== null ? `${p.toFixed(0)}%` : '—'}
                          {total > 0 && <span className="text-gray-600 text-[9px] block">{row[aq] || 0}</span>}
                        </td>
                      );
                    })}
                    <td className="text-center py-2 px-2 font-mono text-gray-600 text-[10px]">
                      {total > 0 ? `${pct(row.other || 0, total).toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-3 flex gap-4 flex-wrap">
          {ATTACK_QUALITY.map(aq => (
            <span key={aq} className="text-[9px] flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: ATTACK_COL_COLORS[aq] }} />
              <span className="text-gray-500">{ATTACK_COL_LABELS[aq]}</span>
            </span>
          ))}
          <span className="text-[9px] text-gray-600 ml-auto italic">
            "Altro" = successivo non è un attacco
          </span>
        </div>
      </div>

    </div>
  );
}
