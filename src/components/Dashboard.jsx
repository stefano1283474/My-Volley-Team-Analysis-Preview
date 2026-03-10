// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Dashboard
// Panoramica con grafici di trend: squadra / fondamentale / giocatrice
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from 'recharts';
import { COLORS } from '../utils/constants';

// ─── Constants ───────────────────────────────────────────────────────────────

const FUNDS = ['attack', 'serve', 'reception', 'defense', 'block'];

const FUND_LABELS = {
  attack: 'Attacco', serve: 'Battuta', reception: 'Ricezione',
  defense: 'Difesa', block: 'Muro',
};
const FUND_ICONS = {
  attack: '⚔', serve: '🎯', reception: '🤲', defense: '🛡', block: '🧱',
};
const FUND_COLORS = {
  attack: '#f43f5e', serve: '#8b5cf6', reception: '#0ea5e9',
  defense: '#10b981', block: '#f59e0b',
};

const ROLE_MAP = {
  M1: 'Banda 1', M2: 'Banda 2', C1: 'Centrale 1', C2: 'Centrale 2',
  P1: 'Palleggiatrice 1', P2: 'Palleggiatrice 2',
  O: 'Opposto', L1: 'Libero 1', L2: 'Libero 2',
};

const ROLE_GROUPS = [
  { id: 'all', label: 'Tutti i ruoli' },
  { id: 'M',   label: 'Banda (M)' },
  { id: 'C',   label: 'Centrale (C)' },
  { id: 'O',   label: 'Opposto (O)' },
  { id: 'P',   label: 'Palleggiatrice (P)' },
  { id: 'L',   label: 'Libero (L)' },
];

const CHART_TOOLTIP_STYLE = {
  background: 'rgba(17,24,39,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: 11,
};

// ─── Main Dashboard component ─────────────────────────────────────────────────

export default function Dashboard({ analytics, matches, standings, weights, onSelectMatch, onSelectPlayer, dashboardConfig, onOpenGrafici }) {
  const [referenceTeam, setReferenceTeam] = useState(() => {
    try { return localStorage.getItem('vpa_reference_team') || null; } catch { return null; }
  });

  const handleReferenceTeamChange = (teamName) => {
    const next = referenceTeam === teamName ? null : teamName;
    setReferenceTeam(next);
    try { localStorage.setItem('vpa_reference_team', next || ''); } catch {}
  };

  if (!analytics || matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500 text-sm">
        <div className="text-5xl mb-4">🏐</div>
        <p>Carica partite e calendario nella sezione <strong>Dati</strong> per vedere la dashboard.</p>
      </div>
    );
  }

  // showChart: se dashboardConfig è definito, mostra solo i grafici selezionati
  const showChart = (id) => !dashboardConfig || dashboardConfig.includes(id);

  const { matchAnalytics, playerTrends } = analytics;

  // ─── Sort matches by date ─────────────────────────────────────────────────
  const sortedMA = useMemo(() =>
    [...matchAnalytics].sort((a, b) =>
      (a.match.metadata.date || '').localeCompare(b.match.metadata.date || '')
    ), [matchAnalytics]);

  // ─── KPI data ────────────────────────────────────────────────────────────
  const teamAvg = useMemo(() => {
    const avg = {};
    for (const f of FUNDS) {
      const rawVals = sortedMA.map(ma => ma.match.riepilogo?.team?.[f]?.efficacy || 0).filter(v => v > 0);
      avg[f] = {
        raw: rawVals.length > 0 ? rawVals.reduce((s, v) => s + v, 0) / rawVals.length : 0,
        weighted: rawVals.length > 0
          ? sortedMA.reduce((s, ma) => {
              const eff = ma.match.riepilogo?.team?.[f]?.efficacy || 0;
              return s + eff * ma.matchWeight.final * (ma.fundWeights[f === 'block' ? 'm' : f.charAt(0)] || 1);
            }, 0) / rawVals.length
          : 0,
      };
    }
    return avg;
  }, [sortedMA]);

  const radarData = FUNDS.map(f => ({
    fund: FUND_LABELS[f],
    raw: Math.max(0, teamAvg[f].raw * 100),
    weighted: Math.max(0, teamAvg[f].weighted * 100),
  }));

  const matchBarData = sortedMA.map(ma => {
    const setsWon  = (ma.match.sets || []).filter(s => s.won).length;
    const setsLost = (ma.match.sets || []).filter(s => !s.won).length;
    return {
      opponent:   (ma.match.metadata.opponent || '').substring(0, 12),
      weight:     ma.matchWeight.final,
      sideOut:    (ma.chains.sideOut.pct * 100) || 0,
      breakPoint: (ma.chains.breakPoint.pct * 100) || 0,
      result:     `${setsWon}-${setsLost}`,
      won:        setsWon > setsLost,
    };
  });

  // ─── Trend chart data ─────────────────────────────────────────────────────

  // Team overall trend: average of all fundamentals per match
  const teamTrendData = useMemo(() => sortedMA.map(ma => {
    const vals = FUNDS.map(f => ma.match.riepilogo?.team?.[f]?.efficacy || 0).filter(v => v > 0);
    const raw = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length * 100 : 0;
    return {
      label:    (ma.match.metadata.opponent || 'N/D').substring(0, 10),
      date:     ma.match.metadata.date || '',
      raw:      +raw.toFixed(1),
      weighted: +(raw * ma.matchWeight.final).toFixed(1),
    };
  }), [sortedMA]);

  // Per-fundamental trend: one value per fund per match + overall average
  const fundTrendData = useMemo(() => sortedMA.map(ma => {
    const row = { label: (ma.match.metadata.opponent || 'N/D').substring(0, 10) };
    const vals = [];
    for (const f of FUNDS) {
      const eff = (ma.match.riepilogo?.team?.[f]?.efficacy || 0) * 100;
      row[f] = +eff.toFixed(1);
      if (eff > 0) vals.push(eff);
    }
    row.avg = vals.length > 0 ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
    return row;
  }), [sortedMA]);

  // Roster role map
  const rosterRoleMap = useMemo(() => {
    const map = {};
    for (const m of matches) {
      for (const p of m.roster || []) {
        if (p.number && !map[p.number]) map[p.number] = { name: p.name, roleCode: p.role || '' };
      }
    }
    return map;
  }, [matches]);

  // Player list for selector
  const playerList = useMemo(() => {
    if (!playerTrends) return [];
    return Object.values(playerTrends)
      .filter(p => p.matches.length >= 2)
      .map(p => ({ ...p, roleCode: rosterRoleMap[p.number]?.roleCode || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [playerTrends, rosterRoleMap]);

  // Top performers
  const topPerformers = useMemo(() => {
    if (!playerTrends) return [];
    return Object.values(playerTrends)
      .filter(p => p.matches.length >= 1)
      .map(p => ({
        ...p,
        overallWeighted: Object.values(p.trends).reduce((s, t) => s + t.weightedAvg, 0) / 5,
        overallRaw:      Object.values(p.trends).reduce((s, t) => s + t.rawAvg, 0) / 5,
      }))
      .sort((a, b) => b.overallWeighted - a.overallWeighted)
      .slice(0, 6);
  }, [playerTrends]);

  const ourStanding = standings.find(t => t.name.toUpperCase().includes('GEAS'));

  // Grafici visibili in base alla config
  const anyChartVisible = !dashboardConfig || dashboardConfig.length > 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Dashboard Squadra</h2>
          <p className="text-sm text-gray-400">Panoramica basata su {matches.length} partite analizzate.</p>
        </div>
        {onOpenGrafici && (
          <button
            onClick={onOpenGrafici}
            className="flex items-center gap-2 text-xs text-amber-400 hover:text-amber-300 transition-colors px-3 py-2 rounded-lg hover:bg-amber-500/10 border border-amber-500/20"
          >
            <span>📊</span>
            <span>Personalizza Dashboard</span>
            {dashboardConfig && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15">
                {dashboardConfig.length} grafici
              </span>
            )}
          </button>
        )}
      </div>

      {/* ── Standings Widget ─────────────────────────────────────────────── */}
      {standings && standings.length > 0 && (
        <StandingsWidget
          standings={standings}
          ourTeam={ourStanding}
          referenceTeam={referenceTeam}
          onReferenceTeamChange={handleReferenceTeamChange}
          matchAnalytics={sortedMA}
        />
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          label="Posizione"
          value={ourStanding ? `${ourStanding.rank}°` : '—'}
          sub={ourStanding ? `${ourStanding.pts} punti` : ''}
          color="#f59e0b"
        />
        <KPICard
          label="Side-Out %"
          value={sortedMA.length > 0
            ? `${(sortedMA.reduce((s, ma) => s + ma.chains.sideOut.pct, 0) / sortedMA.length * 100).toFixed(1)}%`
            : '—'}
          sub="media stagionale"
          color="#38bdf8"
        />
        <KPICard
          label="Break Point %"
          value={sortedMA.length > 0
            ? `${(sortedMA.reduce((s, ma) => s + ma.chains.breakPoint.pct, 0) / sortedMA.length * 100).toFixed(1)}%`
            : '—'}
          sub="media stagionale"
          color="#a3e635"
        />
        <KPICard
          label="Peso Medio"
          value={sortedMA.length > 0
            ? (sortedMA.reduce((s, ma) => s + ma.matchWeight.final, 0) / sortedMA.length).toFixed(2)
            : '—'}
          sub="contesto partite"
          color="#8b5cf6"
        />
      </div>

      {/* ── Avviso dashboard vuota ────────────────────────────────────────── */}
      {dashboardConfig && dashboardConfig.length === 0 && (
        <div className="glass-card p-8 flex flex-col items-center gap-4 text-center">
          <div className="text-4xl">📊</div>
          <div>
            <p className="text-sm font-medium text-gray-300 mb-1">La tua dashboard è vuota</p>
            <p className="text-xs text-gray-500">
              Vai nella tab <strong className="text-amber-400">Grafici</strong> per scegliere quali grafici visualizzare qui.
            </p>
          </div>
          {onOpenGrafici && (
            <button
              onClick={onOpenGrafici}
              className="px-4 py-2 rounded-lg text-sm font-medium text-amber-400 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
            >
              Apri Grafici →
            </button>
          )}
        </div>
      )}

      {/* ── TREND CHARTS ─────────────────────────────────────────────────── */}
      {showChart('trend_section') && (
        <TrendSection
          sortedMA={sortedMA}
          teamTrendData={teamTrendData}
          fundTrendData={fundTrendData}
          playerList={playerList}
          playerTrends={playerTrends}
        />
      )}

      {/* ── RADAR + PESO ─────────────────────────────────────────────────── */}
      {(showChart('radar_team') || showChart('bar_match_weight')) && (
        <div className={`grid gap-4 ${
          showChart('radar_team') && showChart('bar_match_weight')
            ? 'grid-cols-1 lg:grid-cols-2'
            : 'grid-cols-1 lg:grid-cols-1 max-w-2xl'
        }`}>
          {/* Team Radar */}
          {showChart('radar_team') && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">
                Profilo Squadra: <span className="text-sky-400">Grezzo</span> vs <span className="text-amber-400">Rielaborato</span>
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="fund" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <PolarRadiusAxis
                    tick={{ fill: '#6b7280', fontSize: 9 }}
                    domain={[
                      Math.max(0, Math.floor(Math.min(...radarData.flatMap(d => [d.raw, d.weighted])) / 5) * 5 - 5),
                      Math.ceil(Math.max(...radarData.flatMap(d => [d.raw, d.weighted])) / 5) * 5 + 5,
                    ]}
                    tickCount={5}
                    tickFormatter={v => `${v}%`}
                  />
                  <Radar name="Grezzo" dataKey="raw" stroke={COLORS.raw} fill={COLORS.raw} fillOpacity={0.15} strokeWidth={2} />
                  <Radar name="Rielaborato" dataKey="weighted" stroke={COLORS.weighted} fill={COLORS.weighted} fillOpacity={0.15} strokeWidth={2} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Match Weights Bar */}
          {showChart('bar_match_weight') && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Peso Contesto per Partita</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={matchBarData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="opponent" tick={{ fill: '#9ca3af', fontSize: 9 }} angle={-30} textAnchor="end" height={50} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0.5, 1.5]} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(val, name) => [val.toFixed(3), name]} />
                  <Bar dataKey="weight" name="Peso" fill={COLORS.weighted} radius={[4, 4, 0, 0]}
                    label={{ fill: '#9ca3af', fontSize: 9, position: 'top', formatter: v => v.toFixed(2) }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Side-Out vs Break-Point */}
      {showChart('bar_sideout_bp') && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Side-Out vs Break-Point % per Partita</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={matchBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="opponent" tick={{ fill: '#9ca3af', fontSize: 9 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0, 100]} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="sideOut"    name="Side-Out %"    fill={COLORS.raw}      radius={[4, 4, 0, 0]} />
              <Bar dataKey="breakPoint" name="Break-Point %" fill={COLORS.positive} radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Performers */}
      {showChart('top_performers') && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            <span className="text-amber-400">★</span> Top Performer
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {topPerformers.map(p => (
              <button
                key={p.number}
                onClick={() => onSelectPlayer(p.number)}
                className="p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-amber-400">#{p.number}</span>
                  <span className="text-sm font-medium text-white">{p.name}</span>
                </div>
                <div className="flex gap-3 text-[10px]">
                  <div>
                    <span className="text-gray-500">Grezzo</span>
                    <span className="ml-1 text-sky-400">{(p.overallRaw * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Rielab.</span>
                    <span className="ml-1 text-amber-400">{(p.overallWeighted * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="flex gap-1 mt-1.5">
                  {Object.entries(p.trends).map(([fund, trend]) => (
                    <span key={fund} className={`badge ${
                      trend.weightedTrend === 'improving' ? 'badge-up' :
                      trend.weightedTrend === 'declining' ? 'badge-down' : 'badge-neutral'
                    }`}>
                      {fund.charAt(0).toUpperCase()}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Match list */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Partite Analizzate</h3>
        <div className="space-y-2">
          {sortedMA.map(ma => {
            const m       = ma.match;
            const setsWon  = (m.sets || []).filter(s => s.won).length;
            const setsLost = (m.sets || []).filter(s => !s.won).length;
            const won      = setsWon > setsLost;
            return (
              <button
                key={m.id}
                onClick={() => onSelectMatch(m)}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${
                    won ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                  }`}>
                    {setsWon}-{setsLost}
                  </div>
                  <div>
                    <p className="text-sm text-white">vs {m.metadata.opponent}</p>
                    <p className="text-[10px] text-gray-500">{m.metadata.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <p className="text-gray-500">Peso</p>
                    <p className="text-amber-400 font-mono">{ma.matchWeight.final.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500">SO%</p>
                    <p className="text-sky-400 font-mono">{(ma.chains.sideOut.pct * 100).toFixed(0)}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500">BP%</p>
                    <p className="text-green-400 font-mono">{(ma.chains.breakPoint.pct * 100).toFixed(0)}%</p>
                  </div>
                  <span className="text-gray-600">→</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Trend Section ────────────────────────────────────────────────────────────

function TrendSection({ sortedMA, teamTrendData, fundTrendData, playerList, playerTrends }) {
  const [activeTab, setActiveTab] = useState('team'); // 'team' | 'fundamental' | 'player'

  const tabs = [
    { id: 'team',        label: 'Squadra',          icon: '⬡' },
    { id: 'fundamental', label: 'Per Fondamentale',  icon: '◈' },
    { id: 'player',      label: 'Per Giocatrice',    icon: '★' },
  ];

  return (
    <div className="glass-card p-5 space-y-4">
      {/* Header + tab switcher */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">📈 Andamento Stagionale</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Visualizzazione cronologica delle performance ({sortedMA.length} partite)
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 py-1 px-3 rounded-lg text-xs font-medium transition-all ${
                activeTab === t.id
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'team' && <TeamTrendChart data={teamTrendData} />}
      {activeTab === 'fundamental' && <FundTrendChart data={fundTrendData} />}
      {activeTab === 'player' && (
        <PlayerTrendChart
          playerList={playerList}
          playerTrends={playerTrends}
          sortedMA={sortedMA}
        />
      )}
    </div>
  );
}

// ─── Team Overall Trend Chart ─────────────────────────────────────────────────

function TeamTrendChart({ data }) {
  if (!data || data.length < 2) {
    return <EmptyChart label="Servono almeno 2 partite per il grafico di andamento." />;
  }
  const avgRaw = data.reduce((s, d) => s + d.raw, 0) / data.length;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-3 text-[11px] text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 rounded" style={{ background: COLORS.raw }} />
          Grezzo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 rounded" style={{ background: COLORS.weighted }} />
          Rielaborato (×peso partita)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-gray-500" />
          Media stagionale
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={['auto', 'auto']}
            tickFormatter={v => `${v.toFixed(0)}%`} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(val, name) => [`${val.toFixed(1)}%`, name]} />
          <ReferenceLine y={avgRaw} stroke="rgba(148,163,184,0.3)" strokeDasharray="4 4"
            label={{ value: `media ${avgRaw.toFixed(1)}%`, fill: '#6b7280', fontSize: 9, position: 'insideTopRight' }} />
          <Line type="monotone" dataKey="raw" name="Grezzo" stroke={COLORS.raw}
            strokeWidth={2.5} dot={{ r: 4, fill: COLORS.raw }} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="weighted" name="Rielaborato" stroke={COLORS.weighted}
            strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: COLORS.weighted }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Per-Fundamental Trend Chart ─────────────────────────────────────────────

function FundTrendChart({ data }) {
  const [visibleFunds, setVisibleFunds] = useState(new Set(FUNDS));

  const toggleFund = (f) =>
    setVisibleFunds(prev => {
      const next = new Set(prev);
      if (next.has(f)) { if (next.size > 1) next.delete(f); }
      else next.add(f);
      return next;
    });

  if (!data || data.length < 2) {
    return <EmptyChart label="Servono almeno 2 partite per il grafico di andamento." />;
  }

  return (
    <div>
      {/* Fund toggles */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FUNDS.map(f => {
          const active = visibleFunds.has(f);
          return (
            <button
              key={f}
              onClick={() => toggleFund(f)}
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                active ? 'opacity-100' : 'opacity-35'
              }`}
              style={{
                borderColor: FUND_COLORS[f] + '55',
                color: active ? FUND_COLORS[f] : '#6b7280',
                background: active ? FUND_COLORS[f] + '18' : 'transparent',
              }}
            >
              {FUND_ICONS[f]} {FUND_LABELS[f]}
            </button>
          );
        })}
        <button
          onClick={() => setVisibleFunds(new Set(FUNDS))}
          className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-gray-500 hover:text-gray-300 transition-colors"
        >
          tutti
        </button>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="inline-block w-3 border-t border-dashed border-gray-500" />
          media
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={['auto', 'auto']}
            tickFormatter={v => `${v.toFixed(0)}%`} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(val, name) => [`${val?.toFixed(1) ?? '—'}%`, name]} />
          {/* Average reference line */}
          <Line type="monotone" dataKey="avg" name="Media" stroke="rgba(148,163,184,0.4)"
            strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
          {/* One line per fundamental */}
          {FUNDS.filter(f => visibleFunds.has(f)).map(f => (
            <Line key={f} type="monotone" dataKey={f} name={FUND_LABELS[f]}
              stroke={FUND_COLORS[f]} strokeWidth={2}
              dot={{ r: 3, fill: FUND_COLORS[f] }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Per-Player Trend Chart ───────────────────────────────────────────────────

function PlayerTrendChart({ playerList, playerTrends, sortedMA }) {
  const [selectedNum,   setSelectedNum]   = useState(() => playerList[0]?.number || null);
  const [selectedFund,  setSelectedFund]  = useState('attack');
  const [roleFilter,    setRoleFilter]    = useState('all');

  // Filter player list by role
  const filteredPlayers = useMemo(() =>
    playerList.filter(p => roleFilter === 'all' || p.roleCode.startsWith(roleFilter)),
    [playerList, roleFilter]
  );

  // Auto-correct selectedNum if it's been filtered out
  const effectiveNum = filteredPlayers.find(p => p.number === selectedNum)
    ? selectedNum
    : filteredPlayers[0]?.number || null;

  // Build chart data
  const chartData = useMemo(() => {
    if (!effectiveNum || !playerTrends?.[effectiveNum]) return [];
    const pData    = playerTrends[effectiveNum];
    const fundData = pData.trends[selectedFund];
    if (!fundData || !fundData.matchLabels) return [];

    return fundData.matchLabels.map((ml, i) => {
      const ma       = sortedMA.find(m => m.match.id === ml.matchId);
      const teamEff  = (ma?.match.riepilogo?.team?.[selectedFund]?.efficacy || 0) * 100;
      const playerEff = (fundData.raw[i] || 0) * 100;
      return {
        label:  (ml.opponent || '').substring(0, 10),
        player: +playerEff.toFixed(1),
        team:   +teamEff.toFixed(1),
      };
    });
  }, [effectiveNum, selectedFund, playerTrends, sortedMA]);

  const selectedPlayerData = effectiveNum ? playerTrends[effectiveNum] : null;
  const playerAvg  = selectedPlayerData?.trends[selectedFund]?.rawAvg  ?? 0;
  const playerTrnd = selectedPlayerData?.trends[selectedFund]?.rawTrend ?? 'stable';

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex flex-wrap gap-3 items-start">

        {/* Role filter */}
        <div>
          <p className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wide">Ruolo</p>
          <div className="flex gap-1 flex-wrap">
            {ROLE_GROUPS.map(rg => (
              <button
                key={rg.id}
                onClick={() => { setRoleFilter(rg.id); }}
                className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${
                  roleFilter === rg.id
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : 'text-gray-500 border-white/8 hover:text-gray-300'
                }`}
              >
                {rg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fundamental filter */}
        <div>
          <p className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wide">Fondamentale</p>
          <div className="flex gap-1 flex-wrap">
            {FUNDS.map(f => (
              <button
                key={f}
                onClick={() => setSelectedFund(f)}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-all ${
                  selectedFund === f
                    ? 'opacity-100 font-medium'
                    : 'opacity-50 hover:opacity-75'
                }`}
                style={{
                  borderColor: FUND_COLORS[f] + (selectedFund === f ? 'aa' : '33'),
                  color: FUND_COLORS[f],
                  background: selectedFund === f ? FUND_COLORS[f] + '18' : 'transparent',
                }}
              >
                {FUND_ICONS[f]} {FUND_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Player selector */}
      <div>
        <p className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wide">
          Giocatrice ({filteredPlayers.length})
        </p>
        {filteredPlayers.length === 0 ? (
          <p className="text-xs text-gray-600 italic">Nessuna giocatrice per questo ruolo con dati sufficienti.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {filteredPlayers.map(p => {
              const trend = p.trends[selectedFund];
              const tDir  = trend?.rawTrend || 'stable';
              return (
                <button
                  key={p.number}
                  onClick={() => setSelectedNum(p.number)}
                  className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${
                    effectiveNum === p.number
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                      : 'text-gray-400 border-white/8 hover:text-gray-200 hover:border-white/15'
                  }`}
                >
                  <span className="font-mono text-[10px] opacity-70">#{p.number}</span>
                  <span className="font-medium">{p.name}</span>
                  {p.roleCode && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-gray-500">{p.roleCode}</span>
                  )}
                  <span className={`text-[10px] ${
                    tDir === 'improving' ? 'text-green-400' :
                    tDir === 'declining' ? 'text-red-400' : 'text-gray-500'
                  }`}>
                    {tDir === 'improving' ? '↑' : tDir === 'declining' ? '↓' : '~'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Chart */}
      {chartData.length < 2 ? (
        <EmptyChart label={
          effectiveNum
            ? `${selectedPlayerData?.name} non ha abbastanza dati per ${FUND_LABELS[selectedFund]}.`
            : 'Seleziona una giocatrice.'
        } />
      ) : (
        <div>
          {/* Player summary */}
          <div className="flex items-center gap-4 mb-3 text-[11px]">
            <span className="text-white font-semibold">
              #{effectiveNum} {selectedPlayerData?.name}
            </span>
            <span className="text-gray-500">
              Media {FUND_LABELS[selectedFund]}: <span style={{ color: FUND_COLORS[selectedFund] }}>{(playerAvg * 100).toFixed(1)}%</span>
            </span>
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
              playerTrnd === 'improving' ? 'bg-green-500/15 text-green-400' :
              playerTrnd === 'declining' ? 'bg-red-500/15 text-red-400' :
              'bg-white/5 text-gray-500'
            }`}>
              {playerTrnd === 'improving' ? '📈 In crescita' :
               playerTrnd === 'declining' ? '📉 In calo' : '→ Stabile'}
            </span>
          </div>

          <div className="flex items-center gap-4 mb-2 text-[10px] text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded inline-block" style={{ background: FUND_COLORS[selectedFund] }} />
              {selectedPlayerData?.name}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded inline-block" style={{ background: 'rgba(148,163,184,0.5)' }} />
              Media squadra
            </span>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={['auto', 'auto']}
                tickFormatter={v => `${v.toFixed(0)}%`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(val, name) => [`${val?.toFixed(1) ?? '—'}%`, name]} />
              <Line
                type="monotone" dataKey="player"
                name={selectedPlayerData?.name || 'Giocatrice'}
                stroke={FUND_COLORS[selectedFund]}
                strokeWidth={2.5}
                dot={{ r: 4, fill: FUND_COLORS[selectedFund] }}
                activeDot={{ r: 6 }}
                connectNulls
              />
              <Line
                type="monotone" dataKey="team"
                name="Media squadra"
                stroke="rgba(148,163,184,0.5)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Standings Widget ─────────────────────────────────────────────────────────

function StandingsWidget({ standings, ourTeam, referenceTeam, onReferenceTeamChange, matchAnalytics }) {
  const [expanded, setExpanded] = useState(false);

  const visibleTeams = expanded ? standings : standings.slice(0, 12);

  // Compute our rank delta vs reference team
  const refStanding = referenceTeam ? standings.find(t => t.name === referenceTeam) : null;
  const ourRank = ourTeam?.rank || null;
  const refRank = refStanding?.rank || null;
  const rankDelta = (ourRank && refRank) ? ourRank - refRank : null;

  // Which teams were we opponents of (to show match results)
  const opponentNames = new Set(
    (matchAnalytics || []).map(ma => ma.match.metadata?.opponent?.trim().toUpperCase())
  );

  return (
    <div className="glass-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-300">🏆 Classifica</h3>
          {refStanding && (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/25">
                📌 {refStanding.name.substring(0, 18)}
              </span>
              {rankDelta !== null && (
                <span className={`text-[10px] font-mono ${
                  rankDelta < 0 ? 'text-red-400' : rankDelta > 0 ? 'text-green-400' : 'text-gray-400'
                }`}>
                  {rankDelta < 0 ? `▲ ${Math.abs(rankDelta)} sopra di noi` :
                   rankDelta > 0 ? `▼ ${rankDelta} sotto di noi` : '= stessa posizione'}
                </span>
              )}
            </div>
          )}
        </div>
        <p className="text-[10px] text-gray-500">
          Clicca una squadra per impostarla come riferimento scout
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-600 border-b border-white/[0.04] text-[10px]">
              <th className="text-left py-1.5 px-2 w-6">#</th>
              <th className="text-left py-1.5 px-2">Squadra</th>
              <th className="text-center py-1.5 px-2">Pt</th>
              <th className="text-center py-1.5 px-2">G</th>
              <th className="text-center py-1.5 px-2">V</th>
              <th className="text-center py-1.5 px-2">P</th>
              <th className="text-center py-1.5 px-2">SW</th>
              <th className="text-center py-1.5 px-2">SL</th>
            </tr>
          </thead>
          <tbody>
            {visibleTeams.map(t => {
              const isOurs = ourTeam && t.name === ourTeam.name;
              const isRef = referenceTeam && t.name === referenceTeam;
              const isOpponent = opponentNames.has(t.name.toUpperCase());

              return (
                <tr
                  key={t.name}
                  onClick={() => onReferenceTeamChange(t.name)}
                  className={`border-b border-white/[0.02] cursor-pointer transition-colors ${
                    isOurs
                      ? 'bg-amber-500/[0.08] hover:bg-amber-500/[0.12]'
                      : isRef
                        ? 'bg-purple-500/[0.10] hover:bg-purple-500/[0.15]'
                        : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <td className={`py-1.5 px-2 font-mono font-bold text-center ${
                    t.rank <= 3 ? 'text-amber-400' : 'text-gray-500'
                  }`}>
                    {t.rank}
                  </td>
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1.5">
                      {isRef && <span className="text-purple-400 text-[9px]">📌</span>}
                      {isOurs && <span className="text-amber-400 text-[9px]">★</span>}
                      <span className={`font-medium ${
                        isOurs ? 'text-amber-400' :
                        isRef  ? 'text-purple-300' :
                        isOpponent ? 'text-gray-200' : 'text-gray-400'
                      }`}>
                        {t.name.length > 22 ? t.name.substring(0, 22) + '…' : t.name}
                      </span>
                      {isOpponent && !isOurs && (
                        <span className="text-[8px] text-gray-600 ml-0.5">già affrontata</span>
                      )}
                    </div>
                  </td>
                  <td className={`text-center py-1.5 px-2 font-mono font-bold ${
                    isOurs ? 'text-amber-400' : isRef ? 'text-purple-300' : 'text-gray-300'
                  }`}>{t.pts}</td>
                  <td className="text-center py-1.5 px-2 text-gray-500">{t.matches || (t.w + t.l)}</td>
                  <td className="text-center py-1.5 px-2 text-green-400">{t.w}</td>
                  <td className="text-center py-1.5 px-2 text-red-400">{t.l}</td>
                  <td className="text-center py-1.5 px-2 text-gray-400">{t.sw}</td>
                  <td className="text-center py-1.5 px-2 text-gray-500">{t.sl}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {standings.length > 12 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 text-[10px] text-gray-500 hover:text-gray-300 transition-colors w-full text-center"
        >
          {expanded ? '▲ Mostra meno' : `▼ Mostra tutte (${standings.length} squadre)`}
        </button>
      )}

      {refStanding && (
        <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center gap-3 text-[10px] text-gray-500">
          <span className="text-purple-400">ℹ</span>
          <span>
            I pesi delle partite riflettono la forza relativa dell'avversario. Squadre in alto in classifica danno peso maggiore alle vittorie;
            sconfitte contro squadre più forti pesano meno negativamente.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyChart({ label }) {
  return (
    <div className="h-32 flex items-center justify-center text-xs text-gray-600">
      {label}
    </div>
  );
}

function KPICard({ label, value, sub, color }) {
  return (
    <div className="glass-card p-4">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold font-mono" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}
