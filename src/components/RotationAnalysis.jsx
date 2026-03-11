import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { COLORS } from '../utils/constants';

export default function RotationAnalysis({ analytics, matches, allPlayers, dataMode = 'raw' }) {
  const [viewMode, setViewMode] = useState('match');       // 'match' | 'aggregate'
  const [selectedMatchIdx, setSelectedMatchIdx] = useState(-1); // -1 = last match

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
          {dataMode === 'weighted' && (
            <p className="text-[10px] text-amber-400/70 mt-0.5">
              ⚖ I dati di rotazione (SO%/BP%) sono conteggi evento e non variano con la pesatura.
            </p>
          )}
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

    </div>
  );
}
