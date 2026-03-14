import React, { useState, useMemo } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar } from 'recharts';
import { COLORS } from '../utils/constants';
import { applyFNCToEfficacy } from '../utils/analyticsEngine';
import { useProfile } from '../context/ProfileContext';

export default function PlayerCard({ analytics, allPlayers, matches, selectedPlayer, onSelectPlayer, fncConfig, baselines, dataMode = 'raw' }) {
  const { canSeeMetric } = useProfile();
  // showWeighted: visibile se profilo Pro+ E modo include pesato (weighted o both)
  const showWeighted = canSeeMetric('mediaPond') && dataMode !== 'raw';
  const [selectedFund, setSelectedFund] = useState('attack');

  if (!analytics) {
    return <EmptyState message="Carica partite per vedere le schede giocatrici." />;
  }

  const { playerTrends, matchAnalytics } = analytics;

  // Player selector
  const activePlayers = allPlayers.filter(p => {
    const trend = playerTrends[p.number];
    return trend && trend.matches.length > 0;
  });

  const currentPlayer = selectedPlayer
    ? playerTrends[selectedPlayer]
    : activePlayers.length > 0
      ? playerTrends[activePlayers[0].number]
      : null;

  const currentRoster = allPlayers.find(p => p.number === (currentPlayer?.number));

  if (!currentPlayer) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <h2 className="text-xl font-bold text-white">Schede Giocatrici</h2>
        <p className="text-sm text-gray-400">Seleziona una giocatrice o carica più partite.</p>
        <PlayerGrid players={activePlayers} trends={playerTrends} onSelect={onSelectPlayer} />
      </div>
    );
  }

  // Radar data: average raw vs weighted per fundamental, with optional FNC normalization
  const RADAR_FUNDS = [
    { key: 'attack',    label: 'Attacco' },
    { key: 'serve',     label: 'Battuta' },
    { key: 'reception', label: 'Ricezione' },
    { key: 'defense',   label: 'Difesa' },
    { key: 'block',     label: 'Muro' },
  ];
  const radarData = RADAR_FUNDS.map(({ key, label }) => {
    const rawAvg = currentPlayer.trends[key]?.rawAvg || 0;
    const weiAvg = currentPlayer.trends[key]?.weightedAvg || 0;
    const rawFnc = fncConfig && baselines ? applyFNCToEfficacy(rawAvg, key, baselines, fncConfig) : rawAvg;
    const weiFnc = fncConfig && baselines ? applyFNCToEfficacy(weiAvg, key, baselines, fncConfig) : weiAvg;
    return {
      fund: label,
      raw: Math.max(0, rawFnc * 100),
      weighted: Math.max(0, weiFnc * 100),
    };
  });

  // Trend line data — null quando il giocatore non ha azioni in quel fondamentale
  // (null crea un gap nella linea senza connettere i punti non giocati)
  const trendData = currentPlayer.matches.map((m) => {
    const played = (m.raw[selectedFund]?.tot || 0) > 0;
    return {
      match:    (m.opponent || '').substring(0, 8),
      date:     m.date,
      raw:      played ? +(( m.raw[selectedFund].efficacy      || 0) * 100).toFixed(1) : null,
      weighted: played ? +((m.weighted[selectedFund]?.efficacy || 0) * 100).toFixed(1) : null,
      weight:   m.matchWeight,
      played,
    };
  });

  // Per-match bar comparison
  const matchBarData = currentPlayer.matches.map(m => ({
    opponent: (m.opponent || '').substring(0, 10),
    attRaw: (m.raw.attack?.efficacy || 0) * 100,
    attWei: (m.weighted.attack?.efficacy || 0) * 100,
    recRaw: (m.raw.reception?.efficacy || 0) * 100,
    recWei: (m.weighted.reception?.efficacy || 0) * 100,
    serRaw: (m.raw.serve?.efficacy || 0) * 100,
    serWei: (m.weighted.serve?.efficacy || 0) * 100,
    defRaw: (m.raw.defense?.efficacy || 0) * 100,
    defWei: (m.weighted.defense?.efficacy || 0) * 100,
  }));

  const funds = [
    { key: 'attack', label: 'Attacco', color: '#f43f5e' },
    { key: 'serve', label: 'Battuta', color: '#8b5cf6' },
    { key: 'reception', label: 'Ricezione', color: '#0ea5e9' },
    { key: 'defense', label: 'Difesa', color: '#10b981' },
    { key: 'block', label: 'Muro', color: '#f59e0b' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Player selector */}
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-xl font-bold text-white">Scheda Giocatrice</h2>
        <div className="flex gap-1 flex-wrap">
          {activePlayers.map(p => (
            <button
              key={p.number}
              onClick={() => onSelectPlayer(p.number)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                currentPlayer.number === p.number
                  ? 'bg-amber-500/20 text-amber-400 font-medium'
                  : 'bg-white/[0.03] text-gray-400 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              #{p.number} {p.surname}
            </button>
          ))}
        </div>
      </div>

      {/* Player Header */}
      <div className="glass-card-accent p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-amber-500/20 flex items-center justify-center text-xl font-bold text-amber-400 font-mono">
            #{currentPlayer.number}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{currentPlayer.name}</h3>
            <p className="text-xs text-gray-400">
              {currentRoster?.role || ''} · {currentPlayer.matches.length} partite analizzate
            </p>
          </div>
          <div className="ml-auto flex gap-3">
            {funds.map(f => {
              const trend = currentPlayer.trends[f.key];
              return (
                <div key={f.key} className="text-center">
                  <p className="text-[9px] text-gray-500">{f.label}</p>
                  <p className={`badge ${
                    trend?.weightedTrend === 'improving' ? 'badge-up' :
                    trend?.weightedTrend === 'declining' ? 'badge-down' : 'badge-neutral'
                  }`}>
                    {trend?.weightedTrend === 'improving' ? '↑' : trend?.weightedTrend === 'declining' ? '↓' : '—'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Radar + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-300">
              Profilo: <span className="text-sky-400">Grezzo</span> vs <span className="text-amber-400">Rielaborato</span>
            </h3>
            {fncConfig?.enabled && (
              <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                📐 FNC {(fncConfig.weight * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="fund" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <PolarRadiusAxis
                tick={{ fill: '#6b7280', fontSize: 9 }}
                domain={[
                  Math.max(0, Math.floor(Math.min(...radarData.flatMap(d => [d.raw, d.weighted])) / 5) * 5 - 5),
                  Math.ceil(Math.max(...radarData.flatMap(d => [d.raw, d.weighted])) / 5) * 5 + 5,
                ]}
                tickCount={5}
                tickFormatter={v => `${v}%`}
              />
              <Radar name="Grezzo" dataKey="raw" stroke={COLORS.raw} fill={COLORS.raw} fillOpacity={0.2} strokeWidth={2.5} />
              <Radar name="Rielaborato" dataKey="weighted" stroke={COLORS.weighted} fill={COLORS.weighted} fillOpacity={0.2} strokeWidth={2.5} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Fundamental KPIs */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Medie Stagionali</h3>
          <div className="space-y-3">
            {funds.map(f => {
              const trend = currentPlayer.trends[f.key];
              if (!trend) return null;
              const delta = trend.weightedAvg - trend.rawAvg;
              return (
                <div key={f.key} className="flex items-center gap-3">
                  <span className="text-xs w-20" style={{ color: f.color }}>{f.label}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-sky-400 font-mono w-16">{(trend.rawAvg * 100).toFixed(1)}%</span>
                      {showWeighted && (
                        <>
                          <span className="text-gray-600">→</span>
                          <span className="text-amber-400 font-mono w-16">{(trend.weightedAvg * 100).toFixed(1)}%</span>
                          <span className={`font-mono text-[10px] ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ({delta >= 0 ? '+' : ''}{(delta * 100).toFixed(1)})
                          </span>
                        </>
                      )}
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full mt-1 flex">
                      <div className="h-full rounded-full bg-sky-400/40" style={{ width: `${Math.max(2, Math.abs(trend.rawAvg) * 100)}%` }} />
                      {showWeighted && (
                        <div className="h-full rounded-full bg-amber-400/60 -ml-1" style={{ width: `${Math.max(2, Math.abs(trend.weightedAvg) * 100)}%` }} />
                      )}
                    </div>
                  </div>
                  <span className={`badge ${
                    trend.weightedTrend === 'improving' ? 'badge-up' :
                    trend.weightedTrend === 'declining' ? 'badge-down' : 'badge-neutral'
                  }`}>
                    {trend.weightedTrend === 'improving' ? '↑ Migliora' :
                     trend.weightedTrend === 'declining' ? '↓ Cala' : '— Stabile'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Trend Line */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-300">Andamento nel Tempo</h3>
          <div className="flex gap-1">
            {funds.map(f => (
              <button
                key={f.key}
                onClick={() => setSelectedFund(f.key)}
                className={`px-2.5 py-1 rounded text-[10px] transition-all ${
                  selectedFund === f.key
                    ? 'text-white font-medium'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                style={selectedFund === f.key ? { background: f.color + '30', color: f.color } : {}}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="match" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
            {dataMode !== 'weighted' && (
              <Line type="monotone" dataKey="raw" name="Grezzo" stroke={COLORS.raw} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
            )}
            {dataMode !== 'raw' && (
              <Line type="monotone" dataKey="weighted" name="Rielaborato" stroke={COLORS.weighted} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
            )}
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Per-match detail */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Dettaglio per Partita</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-white/5">
                <th className="text-left py-2 px-2">Avversario</th>
                <th className="text-left py-2 px-2">Data</th>
                <th className="text-center py-2 px-1">Peso</th>
                <th className="text-center py-2 px-1" colSpan={showWeighted ? 2 : 1}>Attacco</th>
                <th className="text-center py-2 px-1" colSpan={showWeighted ? 2 : 1}>Battuta</th>
                <th className="text-center py-2 px-1" colSpan={showWeighted ? 2 : 1}>Ricezione</th>
                <th className="text-center py-2 px-1" colSpan={showWeighted ? 2 : 1}>Difesa</th>
              </tr>
              <tr className="text-[9px] text-gray-600 border-b border-white/[0.03]">
                <th></th><th></th><th></th>
                <th className="text-center text-sky-400/60">G</th>{showWeighted && <th className="text-center text-amber-400/60">R</th>}
                <th className="text-center text-sky-400/60">G</th>{showWeighted && <th className="text-center text-amber-400/60">R</th>}
                <th className="text-center text-sky-400/60">G</th>{showWeighted && <th className="text-center text-amber-400/60">R</th>}
                <th className="text-center text-sky-400/60">G</th>{showWeighted && <th className="text-center text-amber-400/60">R</th>}
              </tr>
            </thead>
            <tbody>
              {currentPlayer.matches.map((m, i) => (
                <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                  <td className="py-1.5 px-2 text-gray-200">{m.opponent}</td>
                  <td className="py-1.5 px-2 text-gray-500">{m.date}</td>
                  <td className="text-center py-1.5 px-1 font-mono text-amber-400">{m.matchWeight.toFixed(2)}</td>
                  <td className="text-center py-1.5 px-1 font-mono text-sky-400">{(m.raw.attack?.efficacy * 100 || 0).toFixed(0)}</td>
                  {showWeighted && <td className="text-center py-1.5 px-1 font-mono text-amber-400">{(m.weighted.attack?.efficacy * 100 || 0).toFixed(0)}</td>}
                  <td className="text-center py-1.5 px-1 font-mono text-sky-400">{(m.raw.serve?.efficacy * 100 || 0).toFixed(0)}</td>
                  {showWeighted && <td className="text-center py-1.5 px-1 font-mono text-amber-400">{(m.weighted.serve?.efficacy * 100 || 0).toFixed(0)}</td>}
                  <td className="text-center py-1.5 px-1 font-mono text-sky-400">{(m.raw.reception?.efficacy * 100 || 0).toFixed(0)}</td>
                  {showWeighted && <td className="text-center py-1.5 px-1 font-mono text-amber-400">{(m.weighted.reception?.efficacy * 100 || 0).toFixed(0)}</td>}
                  <td className="text-center py-1.5 px-1 font-mono text-sky-400">{(m.raw.defense?.efficacy * 100 || 0).toFixed(0)}</td>
                  {showWeighted && <td className="text-center py-1.5 px-1 font-mono text-amber-400">{(m.weighted.defense?.efficacy * 100 || 0).toFixed(0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PlayerGrid({ players, trends, onSelect }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {players.map(p => {
        const t = trends[p.number];
        return (
          <button
            key={p.number}
            onClick={() => onSelect(p.number)}
            className="glass-card p-4 hover:bg-white/[0.04] transition-colors text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-amber-400">#{p.number}</span>
              <span className="text-sm font-medium text-white">{p.surname}</span>
            </div>
            <p className="text-[10px] text-gray-500">{p.role} · {t?.matches.length || 0} partite</p>
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-sm">
      <div className="text-4xl mb-3">★</div>
      <p>{message}</p>
    </div>
  );
}
