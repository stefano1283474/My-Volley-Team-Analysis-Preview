// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Charts Explorer
// Galleria completa dei grafici con pin per dashboard personalizzata
// ============================================================================

import React, { useState, useMemo, useEffect } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from 'recharts';
import { COLORS } from '../utils/constants';

// ─── Constants ────────────────────────────────────────────────────────────────

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
const FUND_TOKEN_MAP = {
  attack: 'a',
  serve: 'b',
  reception: 'r',
  defense: 'd',
  block: 'm',
};
const ROLE_GROUPS = [
  { id: 'all', label: 'Tutti' },
  { id: 'M',   label: 'Banda' },
  { id: 'C',   label: 'Centrale' },
  { id: 'O',   label: 'Opposto' },
  { id: 'P',   label: 'Palleggiatrice' },
  { id: 'L',   label: 'Libero' },
];
const CHART_TOOLTIP_STYLE = {
  background: 'rgba(17,24,39,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, fontSize: 11,
};

// ─── Chart Catalog ────────────────────────────────────────────────────────────

export const CHART_CATALOG = [
  // Squadra
  { id: 'radar_team',        label: 'Profilo Squadra',        category: 'squadra', icon: '🔷', desc: 'Radar fondamentali: dato grezzo vs contestualizzato' },
  { id: 'bar_match_weight',  label: 'Peso Contesto',          category: 'squadra', icon: '⚖',  desc: 'Peso specifico per partita in base al contesto e all\'avversario' },
  { id: 'bar_sideout_bp',    label: 'Side-Out / Break-Point', category: 'squadra', icon: '📊', desc: 'Confronto Side-Out % e Break-Point % per ogni partita' },
  { id: 'top_performers',    label: 'Top Performer',          category: 'squadra', icon: '★',  desc: 'Giocatrici con la miglior performance ponderata stagionale' },
  // Trend
  { id: 'trend_section',     label: 'Andamento Stagionale',   category: 'trend',   icon: '📈', desc: 'Trend di squadra, per fondamentale e per giocatrice nel tempo' },
  // Ranking — Globale
  { id: 'ranking_global',    label: 'Ranking Globale',        category: 'ranking', icon: '🏆', desc: 'Classifica per performance media su tutti i fondamentali' },
  // Ranking — per fondamentale
  { id: 'ranking_attack',    label: 'Ranking Attacco',        category: 'ranking', icon: '⚔',  desc: 'Chi attacca meglio? Efficacia e contestualizzazione' },
  { id: 'ranking_serve',     label: 'Ranking Battuta',        category: 'ranking', icon: '🎯', desc: 'Classifica delle battitrici per efficacia/efficienza' },
  { id: 'ranking_reception', label: 'Ranking Ricezione',      category: 'ranking', icon: '🤲', desc: 'Chi riceve meglio? Classifica ricevitori' },
  { id: 'ranking_defense',   label: 'Ranking Difesa',         category: 'ranking', icon: '🛡',  desc: 'Classifica difensori per efficacia/efficienza' },
  { id: 'ranking_block',     label: 'Ranking Muro',           category: 'ranking', icon: '🧱', desc: 'Chi mura meglio? Classifica per il fondamentale muro' },
];

export const DEFAULT_DASHBOARD_CONFIG = [
  'radar_team', 'bar_sideout_bp', 'trend_section', 'top_performers',
];

const CATEGORIES = [
  { id: 'trend',   label: 'Trend Stagionale',   icon: '📈' },
  { id: 'ranking', label: 'Ranking Giocatrici', icon: '🏆' },
  { id: 'all',     label: 'Tutti',             icon: '⬡' },
  { id: 'squadra', label: 'Squadra',            icon: '🏐' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChartsExplorer({
  analytics, matches, standings, dashboardConfig, onConfigChange, onSelectPlayer, dataMode = 'raw',
}) {
  const [activeCategory, setActiveCategory] = useState('all');
  const matchAnalytics = analytics?.matchAnalytics || [];
  const playerTrends = analytics?.playerTrends || null;

  const sortedMA = useMemo(() =>
    [...matchAnalytics].sort((a, b) =>
      (a.match.metadata.date || '').localeCompare(b.match.metadata.date || '')
    ), [matchAnalytics]);

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
    raw:      Math.max(0, teamAvg[f].raw      * 100),
    weighted: Math.max(0, teamAvg[f].weighted * 100),
  }));

  const matchBarData = sortedMA.map(ma => {
    const setsWon  = (ma.match.sets || []).filter(s => s.won).length;
    const setsLost = (ma.match.sets || []).filter(s => !s.won).length;
    return {
      opponent:   (ma.match.metadata.opponent || '').substring(0, 12),
      weight:     ma.matchWeight.final,
      sideOut:    (ma.chains.sideOut.pct * 100)    || 0,
      breakPoint: (ma.chains.breakPoint.pct * 100) || 0,
      result:     `${setsWon}-${setsLost}`,
      won:        setsWon > setsLost,
    };
  });

  const teamTrendData = useMemo(() => sortedMA.map(ma => {
    const vals = FUNDS.map(f => ma.match.riepilogo?.team?.[f]?.efficacy || 0).filter(v => v > 0);
    const raw  = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length * 100 : 0;
    return {
      label:    (ma.match.metadata.opponent || 'N/D').substring(0, 10),
      date:     ma.match.metadata.date || '',
      raw:      +raw.toFixed(1),
      weighted: +(raw * ma.matchWeight.final).toFixed(1),
    };
  }), [sortedMA]);

  const fundTrendData = useMemo(() => sortedMA.map(ma => {
    const row  = { label: (ma.match.metadata.opponent || 'N/D').substring(0, 10) };
    const vals = [];
    for (const f of FUNDS) {
      const eff = (ma.match.riepilogo?.team?.[f]?.efficacy || 0) * 100;
      row[f] = +eff.toFixed(1);
      if (eff > 0) vals.push(eff);
    }
    row.avg = vals.length > 0 ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
    return row;
  }), [sortedMA]);

  const rosterRoleMap = useMemo(() => {
    const map = {};
    for (const m of matches) {
      for (const p of m.roster || []) {
        if (p.number && !map[p.number]) map[p.number] = { name: p.name, roleCode: p.role || '' };
      }
    }
    return map;
  }, [matches]);

  const playerList = useMemo(() => {
    if (!playerTrends) return [];
    return Object.values(playerTrends)
      .filter(p => p.matches.length >= 2)
      .map(p => ({ ...p, roleCode: rosterRoleMap[p.number]?.roleCode || '' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [playerTrends, rosterRoleMap]);

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

  const toggleChart = (chartId) => {
    if (dashboardConfig.includes(chartId)) {
      onConfigChange(dashboardConfig.filter(id => id !== chartId));
    } else {
      onConfigChange([...dashboardConfig, chartId]);
    }
  };

  const sharedProps = {
    sortedMA, radarData, matchBarData, teamTrendData, fundTrendData,
    playerList, playerTrends, topPerformers, rosterRoleMap, onSelectPlayer, dataMode,
  };

  const chartsByCategory = CATEGORIES.slice(1).map(cat => ({
    ...cat,
    charts: CHART_CATALOG.filter(c => c.category === cat.id),
  }));

  const visibleCharts = activeCategory === 'all'
    ? CHART_CATALOG
    : CHART_CATALOG.filter(c => c.category === activeCategory);

  if (!analytics || matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-gray-500 text-sm">
        <div className="text-5xl mb-4">📊</div>
        <p>Carica le partite nella sezione <strong>Dati</strong> per esplorare i grafici.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">Grafici</h2>
          <p className="text-sm text-gray-400">
            Esplora tutti i grafici disponibili. Usa{' '}
            <span className="text-amber-400 font-medium">+ Dashboard</span>{' '}
            per aggiungere un grafico alla tua vista personalizzata.
          </p>
        </div>
        <div className="text-right text-xs">
          <span className="text-amber-400 font-bold text-lg">{dashboardConfig.length}</span>
          <span className="text-gray-500 ml-1">grafici in dashboard</span>
        </div>
      </div>

      {/* ── Category Filter ─────────────────────────────────────────────── */}
      <div
        className="flex gap-1 p-1 rounded-2xl flex-wrap"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeCategory === cat.id
                ? 'bg-amber-500/15 text-amber-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <span>{cat.icon}</span> {cat.label}
          </button>
        ))}
      </div>

      {/* ── Charts ──────────────────────────────────────────────────────── */}
      {activeCategory === 'all' ? (
        <div className="space-y-10">
          {chartsByCategory.map(cat => (
            <div key={cat.id}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-base">{cat.icon}</span>
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{cat.label}</h3>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {cat.charts.map(meta => (
                  <ChartCard
                    key={meta.id}
                    meta={meta}
                    isPinned={dashboardConfig.includes(meta.id)}
                    onTogglePin={() => toggleChart(meta.id)}
                  >
                    <ChartRenderer chartId={meta.id} props={sharedProps} />
                  </ChartCard>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {visibleCharts.map(meta => (
            <ChartCard
              key={meta.id}
              meta={meta}
              isPinned={dashboardConfig.includes(meta.id)}
              onTogglePin={() => toggleChart(meta.id)}
            >
              <ChartRenderer chartId={meta.id} props={sharedProps} />
            </ChartCard>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chart Card Wrapper ───────────────────────────────────────────────────────

function ChartCard({ meta, isPinned, onTogglePin, children }) {
  return (
    <div className="glass-card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <span>{meta.icon}</span> {meta.label}
          </h3>
          <p className="text-[10px] text-gray-500 mt-0.5">{meta.desc}</p>
        </div>
        <button
          onClick={onTogglePin}
          className={`flex-shrink-0 flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-all ${
            isPinned
              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
              : 'text-gray-500 border-white/10 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/20'
          }`}
          title={isPinned ? 'Rimuovi dalla dashboard' : 'Aggiungi alla dashboard'}
        >
          {isPinned ? '📌 In Dashboard' : '+ Dashboard'}
        </button>
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─── Chart Renderer (dispatch) ───────────────────────────────────────────────

function ChartRenderer({ chartId, props }) {
  const {
    sortedMA, radarData, matchBarData, teamTrendData, fundTrendData,
    playerList, playerTrends, topPerformers, rosterRoleMap, onSelectPlayer, dataMode,
  } = props;

  switch (chartId) {
    case 'radar_team':
      return <ExRadarTeam radarData={radarData} />;
    case 'bar_match_weight':
      return <ExMatchWeight matchBarData={matchBarData} />;
    case 'bar_sideout_bp':
      return <ExSideOutBP matchBarData={matchBarData} />;
    case 'top_performers':
      return <ExTopPerformers topPerformers={topPerformers} onSelectPlayer={onSelectPlayer} />;
    case 'trend_section':
      return (
        <ExTrendSection
          sortedMA={sortedMA}
          teamTrendData={teamTrendData}
          fundTrendData={fundTrendData}
          playerList={playerList}
          playerTrends={playerTrends}
        />
      );
    case 'ranking_global':
    case 'ranking_attack':
    case 'ranking_serve':
    case 'ranking_reception':
    case 'ranking_defense':
    case 'ranking_block': {
      const fund = chartId === 'ranking_global' ? 'global' : chartId.replace('ranking_', '');
      return (
        <PlayerRankingChart
          fund={fund}
          playerTrends={playerTrends}
          rosterRoleMap={rosterRoleMap}
          matchAnalytics={sortedMA}
          dataMode={dataMode}
        />
      );
    }
    default:
      return <EmptyChart label="Grafico non disponibile." />;
  }
}

// ─── Existing Charts (adapted) ────────────────────────────────────────────────

function ExRadarTeam({ radarData }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={radarData}>
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis dataKey="fund" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fill: '#6b7280', fontSize: 9 }} domain={[0, 'auto']} />
        <Radar name="Dato" dataKey="raw" stroke={COLORS.raw} fill={COLORS.raw} fillOpacity={0.15} strokeWidth={2} />
        <Radar name="Contestualizzato" dataKey="weighted" stroke={COLORS.weighted} fill={COLORS.weighted} fillOpacity={0.15} strokeWidth={2} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function ExMatchWeight({ matchBarData }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={matchBarData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="opponent" tick={{ fill: '#9ca3af', fontSize: 9 }} angle={-30} textAnchor="end" height={50} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0.5, 1.5]} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={val => [val.toFixed(3), 'Peso']} />
        <Bar dataKey="weight" name="Peso" fill={COLORS.weighted} radius={[4, 4, 0, 0]}
          label={{ fill: '#9ca3af', fontSize: 9, position: 'top', formatter: v => v.toFixed(2) }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ExSideOutBP({ matchBarData }) {
  return (
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
  );
}

function ExTopPerformers({ topPerformers, onSelectPlayer }) {
  if (!topPerformers?.length) return <EmptyChart label="Nessun dato disponibile." />;
  return (
    <div className="grid grid-cols-2 gap-2">
      {topPerformers.map(p => (
        <button
          key={p.number}
          onClick={() => onSelectPlayer?.(p.number)}
          className="p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-amber-400">#{p.number}</span>
            <span className="text-sm font-medium text-white truncate">{p.name}</span>
          </div>
          <div className="flex gap-3 text-[10px]">
            <div>
              <span className="text-gray-500">Dato</span>
              <span className="ml-1 text-sky-400">{(p.overallRaw * 100).toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-gray-500">Peso</span>
              <span className="ml-1 text-amber-400">{(p.overallWeighted * 100).toFixed(1)}%</span>
            </div>
          </div>
          <div className="flex gap-1 mt-1.5">
            {Object.entries(p.trends).map(([fund, trend]) => (
              <span key={fund} className={`badge ${
                trend.weightedTrend === 'improving' ? 'badge-up' :
                trend.weightedTrend === 'declining' ? 'badge-down' : 'badge-neutral'
              }`}>{fund.charAt(0).toUpperCase()}</span>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

function ExTrendSection({ sortedMA, teamTrendData, fundTrendData, playerList, playerTrends }) {
  const [activeTab, setActiveTab] = useState('team');
  const tabs = [
    { id: 'team',        label: 'Squadra',         icon: '⬡' },
    { id: 'fundamental', label: 'Fondamentali',     icon: '◈' },
    { id: 'player',      label: 'Per Giocatrice',   icon: '★' },
  ];
  return (
    <div className="space-y-3">
      <div
        className="flex gap-1 p-0.5 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
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
            <span>{t.icon}</span> <span>{t.label}</span>
          </button>
        ))}
      </div>
      {activeTab === 'team'        && <CTeamTrendChart   data={teamTrendData} />}
      {activeTab === 'fundamental' && <CFundTrendChart   data={fundTrendData} />}
      {activeTab === 'player'      && (
        <CPlayerTrendChart
          playerList={playerList}
          playerTrends={playerTrends}
          sortedMA={sortedMA}
        />
      )}
    </div>
  );
}

// ─── New: Player Ranking Chart ────────────────────────────────────────────────

function PlayerRankingChart({ fund, playerTrends, rosterRoleMap, matchAnalytics = [], dataMode = 'raw' }) {
  const [metric,     setMetric]     = useState('avg');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedFund, setSelectedFund] = useState(fund || 'global');
  const [selectedBar, setSelectedBar] = useState(null);

  useEffect(() => {
    setSelectedFund(fund || 'global');
  }, [fund]);

  useEffect(() => {
    setMetric(dataMode === 'weighted' ? 'weighted' : 'raw');
  }, [dataMode]);

  const touchAggregation = useMemo(() => {
    const activeFunds = selectedFund === 'global' ? FUNDS : [selectedFund];
    const activeTokens = new Set(activeFunds.map(f => FUND_TOKEN_MAP[f]));
    const byPlayer = {};
    let teamWeightedTotal = 0;

    for (const ma of matchAnalytics || []) {
      const match = ma?.match;
      const weightMatch = ma?.matchWeight?.final || 1;
      const fundWeights = ma?.fundWeights || {};
      const opponent = match?.metadata?.opponent || 'Avversario N/D';
      const date = match?.metadata?.date || '';

      for (const rally of match?.rallies || []) {
        const set = rally?.set || 0;
        const score = `${rally?.ourScore ?? 0}-${rally?.theirScore ?? 0}`;
        for (const q of rally?.quartine || []) {
          if (q?.type !== 'action') continue;
          const token = (q.fundamental || '').toLowerCase();
          if (!activeTokens.has(token)) continue;
          const fundKey = Object.keys(FUND_TOKEN_MAP).find(k => FUND_TOKEN_MAP[k] === token);
          if (!fundKey) continue;
          const baseValue = Number(q.value || 0);
          const fundW = fundWeights[token] || 1;
          const weightedValue = baseValue * weightMatch * fundW;
          const pNum = String(q.player || '');
          if (!pNum) continue;
          if (!byPlayer[pNum]) {
            byPlayer[pNum] = { weightedTotal: 0, touches: [] };
          }
          byPlayer[pNum].weightedTotal += weightedValue;
          byPlayer[pNum].touches.push({
            opponent,
            date,
            set,
            score,
            fundamental: fundKey,
            rawValue: baseValue,
            matchWeight: weightMatch,
            fundWeight: fundW,
            weightedValue,
          });
          teamWeightedTotal += weightedValue;
        }
      }
    }

    return { byPlayer, teamWeightedTotal };
  }, [matchAnalytics, selectedFund]);

  const rankingData = useMemo(() => {
    if (!playerTrends) return [];
    const formatMatchLabel = (m) => {
      const opp = (m?.opponent || 'Avv. N/D').toString();
      const date = (m?.date || '').toString();
      return date ? `${opp} · ${date}` : opp;
    };
    return Object.values(playerTrends)
      .filter(p => p.matches.length >= 1)
      .map(p => {
        const role = rosterRoleMap?.[p.number]?.roleCode || '';
        let raw = 0, weighted = 0;
        let metricBreakdown = [];

        if (selectedFund === 'global') {
          const tVals = Object.values(p.trends);
          if (tVals.length === 0) return null;
          raw      = tVals.reduce((s, t) => s + (t.rawAvg      || 0), 0) / tVals.length * 100;
          weighted = tVals.reduce((s, t) => s + (t.weightedAvg || 0), 0) / tVals.length * 100;
          metricBreakdown = FUNDS
            .map(f => ({
              label: FUND_LABELS[f],
              raw: ((p.trends[f]?.rawAvg || 0) * 100),
              weighted: ((p.trends[f]?.weightedAvg || 0) * 100),
            }))
            .filter(x => x.raw > 0 || x.weighted > 0);
        } else {
          const t = p.trends[selectedFund];
          if (!t) return null;
          raw      = (t.rawAvg      || 0) * 100;
          weighted = (t.weightedAvg || 0) * 100;
          metricBreakdown = (t.matchLabels || []).map((m, i) => ({
            label: formatMatchLabel(m),
            raw: ((t.raw?.[i] || 0) * 100),
            weighted: ((t.weighted?.[i] || 0) * 100),
          }));
        }
        const pAgg = touchAggregation.byPlayer[String(p.number)] || { weightedTotal: 0, touches: [] };
        const teamTotal = touchAggregation.teamWeightedTotal || 0;
        const avg = teamTotal > 0 ? (pAgg.weightedTotal / teamTotal) * 100 : 0;
        const contribMatches = selectedFund === 'global'
          ? [...new Set((p.matches || []).map(formatMatchLabel))]
          : [...new Set((p.trends[selectedFund]?.matchLabels || []).map(formatMatchLabel))];

        return {
          name:     (p.name || '').substring(0, 16),
          number:   p.number,
          role,
          raw:      +raw.toFixed(1),
          weighted: +weighted.toFixed(1),
          avg:      +avg.toFixed(1),
          matches:  p.matches.length,
          contribMatches,
          weightedTotal: pAgg.weightedTotal,
          teamWeightedTotal: teamTotal,
          touches: pAgg.touches,
          metricBreakdown,
        };
      })
      .filter(Boolean)
      .filter(p => (metric === 'raw' ? p.raw : metric === 'weighted' ? p.weighted : p.avg) > 0)
      .filter(p => roleFilter === 'all' || p.role.startsWith(roleFilter))
      .sort((a, b) =>
        metric === 'raw'
          ? b.raw - a.raw
          : metric === 'weighted'
            ? b.weighted - a.weighted
            : b.avg - a.avg
      )
      .slice(0, 12);
  }, [playerTrends, selectedFund, metric, roleFilter, rosterRoleMap, touchAggregation]);

  const barColor = selectedFund === 'global' ? '#f59e0b' : (FUND_COLORS[selectedFund] || '#38bdf8');
  const metricLabel = metric === 'raw'
    ? 'Efficacia %'
    : metric === 'weighted'
      ? 'Efficienza (Contesto) %'
      : 'Valore medio %';
  const metricValue = (row) => (
    metric === 'raw'
      ? row.raw
      : metric === 'weighted'
        ? row.weighted
        : row.avg
  );

  return (
    <div className="space-y-3">

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">

        {/* Metric toggle */}
        <div
          className="flex gap-0.5 p-0.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {[
            { id: 'raw',      label: 'Efficacia',   icon: '📊' },
            { id: 'weighted', label: 'Efficienza',  icon: '⚖'  },
            { id: 'avg',      label: 'Valore medio %', icon: '∿' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={`flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md transition-all ${
                metric === m.id
                  ? 'bg-amber-500/20 text-amber-400 font-medium'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* Role filter */}
        <div className="flex gap-1 flex-wrap">
          {ROLE_GROUPS.map(rg => (
            <button
              key={rg.id}
              onClick={() => setRoleFilter(rg.id)}
              className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all ${
                roleFilter === rg.id
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'text-gray-500 border-white/[0.08] hover:text-gray-300'
              }`}
            >
              {rg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ranking Bar Chart */}
      {rankingData.length === 0 ? (
        <EmptyChart label="Nessun dato per il filtro selezionato." />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, rankingData.length * 30 + 20)}>
          <BarChart
            layout="vertical"
            data={rankingData}
            margin={{ left: 0, right: 40, top: 4, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="rgba(255,255,255,0.04)"
            />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fill: '#6b7280', fontSize: 9 }}
              tickFormatter={v => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fill: '#9ca3af', fontSize: 10 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload;
                const list = row.contribMatches || [];
                return (
                  <div
                    className="rounded-lg border border-white/10 p-3 text-[11px]"
                    style={{ background: 'rgba(17,24,39,0.96)', maxWidth: 300 }}
                  >
                    <div className="text-white font-semibold mb-1">{row.name}</div>
                    <div className="text-gray-300 mb-2">
                      {metricLabel}: <span className="text-amber-300">{metricValue(row).toFixed(1)}%</span> · {list.length} partite
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {list.map((m, i) => (
                        <div key={`${row.number}_${i}`} className="text-gray-400">• {m}</div>
                      ))}
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey={metric}
              fill={barColor}
              radius={[0, 4, 4, 0]}
              onClick={(entry) => {
                const row = entry?.payload || null;
                if (row) setSelectedBar(row);
              }}
              label={{
                position: 'right',
                fill: '#6b7280',
                fontSize: 9,
                formatter: v => v > 0 ? `${v.toFixed(1)}%` : '',
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className="flex flex-wrap gap-1 pt-1">
        <button
          onClick={() => setSelectedFund('global')}
          className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all ${
            selectedFund === 'global'
              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              : 'text-gray-500 border-white/[0.08] hover:text-gray-300'
          }`}
        >
          Tutti
        </button>
        {FUNDS.map(f => (
          <button
            key={f}
            onClick={() => setSelectedFund(f)}
            className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all ${
              selectedFund === f
                ? 'font-medium'
                : ''
            }`}
            style={{
              borderColor: selectedFund === f ? `${FUND_COLORS[f]}80` : 'rgba(255,255,255,0.08)',
              color: selectedFund === f ? FUND_COLORS[f] : '#6b7280',
              background: selectedFund === f ? `${FUND_COLORS[f]}22` : 'transparent',
            }}
          >
            {FUND_ICONS[f]} {FUND_LABELS[f]}
          </button>
        ))}
      </div>

      {selectedBar && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-xl border border-white/10 bg-slate-900/95">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div>
                <div className="text-white font-semibold">{selectedBar.name}</div>
                <div className="text-xs text-gray-400">
                  {metricLabel}: <span className="text-amber-300">{metricValue(selectedBar).toFixed(1)}%</span> · Tocchi {selectedBar.touches?.length || 0}
                </div>
              </div>
              <button
                onClick={() => setSelectedBar(null)}
                className="px-2 py-1 text-xs rounded bg-white/5 hover:bg-white/10 text-gray-300"
              >
                Chiudi
              </button>
            </div>
            <div className="overflow-auto max-h-[70vh]">
              <div className="px-4 py-3 border-b border-white/10">
                <div className="text-[11px] text-gray-300 mb-2">
                  {metric === 'raw' && 'Calcolo Efficacia %: media semplice delle efficacie per partita filtrata.'}
                  {metric === 'weighted' && 'Calcolo Efficienza (Contesto) %: media semplice delle efficienze contestualizzate per partita filtrata.'}
                  {metric === 'avg' && 'Calcolo Valore medio %: somma valori pesati giocatrice / somma valori pesati squadra (filtri attivi).'}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-gray-400 border-b border-white/10">
                        <th className="text-left py-1.5 px-2">{selectedFund === 'global' ? 'Fondamentale' : 'Partita'}</th>
                        <th className="text-center py-1.5 px-2">Efficacia %</th>
                        <th className="text-center py-1.5 px-2">Efficienza %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedBar.metricBreakdown || []).map((b, i) => (
                        <tr key={`${selectedBar.number}_break_${i}`} className="border-b border-white/[0.04]">
                          <td className="py-1.5 px-2 text-gray-300">{b.label}</td>
                          <td className="py-1.5 px-2 text-center text-cyan-300">{b.raw.toFixed(1)}%</td>
                          <td className="py-1.5 px-2 text-center text-violet-300">{b.weighted.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-white/10">
                    <th className="text-left px-3 py-2">Partita</th>
                    <th className="text-center px-2 py-2">Set</th>
                    <th className="text-center px-2 py-2">Punteggio</th>
                    <th className="text-center px-2 py-2">Fond.</th>
                    <th className="text-center px-2 py-2">Valore</th>
                    <th className="text-center px-2 py-2">x Peso</th>
                    <th className="text-center px-2 py-2">Valore pesato</th>
                    <th className="text-center px-2 py-2">% su squadra</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedBar.touches || []).map((t, idx) => {
                    const pct = selectedBar.teamWeightedTotal > 0
                      ? (t.weightedValue / selectedBar.teamWeightedTotal) * 100
                      : 0;
                    return (
                      <tr key={`${selectedBar.number}_${idx}`} className="border-b border-white/[0.04]">
                        <td className="px-3 py-1.5 text-gray-300">{t.opponent} · {t.date}</td>
                        <td className="px-2 py-1.5 text-center text-gray-300">{t.set || '-'}</td>
                        <td className="px-2 py-1.5 text-center text-gray-400">{t.score}</td>
                        <td className="px-2 py-1.5 text-center" style={{ color: FUND_COLORS[t.fundamental] || '#9ca3af' }}>
                          {FUND_LABELS[t.fundamental] || t.fundamental}
                        </td>
                        <td className="px-2 py-1.5 text-center text-white font-semibold">{t.rawValue}</td>
                        <td className="px-2 py-1.5 text-center text-gray-400">{(t.matchWeight * t.fundWeight).toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-center text-cyan-300">{t.weightedValue.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-center text-amber-300">{pct.toFixed(2)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trend sub-components ─────────────────────────────────────────────────────

function CTeamTrendChart({ data }) {
  if (!data || data.length < 2) return <EmptyChart label="Servono almeno 2 partite." />;
  const avgRaw = data.reduce((s, d) => s + d.raw, 0) / data.length;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={['auto', 'auto']}
          tickFormatter={v => `${v.toFixed(0)}%`} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(val, name) => [`${val.toFixed(1)}%`, name]} />
        <ReferenceLine y={avgRaw} stroke="rgba(148,163,184,0.3)" strokeDasharray="4 4"
          label={{ value: `media ${avgRaw.toFixed(1)}%`, fill: '#6b7280', fontSize: 9, position: 'insideTopRight' }} />
        <Line type="monotone" dataKey="raw" name="Dato grezzo" stroke={COLORS.raw}
          strokeWidth={2.5} dot={{ r: 4, fill: COLORS.raw }} activeDot={{ r: 6 }} />
        <Line type="monotone" dataKey="weighted" name="Contestualizzato" stroke={COLORS.weighted}
          strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: COLORS.weighted }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function CFundTrendChart({ data }) {
  const [visibleFunds, setVisibleFunds] = useState(new Set(FUNDS));
  const toggleFund = (f) => setVisibleFunds(prev => {
    const next = new Set(prev);
    if (next.has(f)) { if (next.size > 1) next.delete(f); } else next.add(f);
    return next;
  });
  if (!data || data.length < 2) return <EmptyChart label="Servono almeno 2 partite." />;
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {FUNDS.map(f => {
          const active = visibleFunds.has(f);
          return (
            <button key={f} onClick={() => toggleFund(f)}
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-all ${active ? 'opacity-100' : 'opacity-35'}`}
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
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={['auto', 'auto']}
            tickFormatter={v => `${v.toFixed(0)}%`} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(val, name) => [`${val?.toFixed(1) ?? '—'}%`, name]} />
          <Line type="monotone" dataKey="avg" name="Media" stroke="rgba(148,163,184,0.4)"
            strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
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

function CPlayerTrendChart({ playerList, playerTrends, sortedMA }) {
  const [selectedNum,  setSelectedNum]  = useState(() => playerList[0]?.number || null);
  const [selectedFund, setSelectedFund] = useState('attack');
  const [roleFilter,   setRoleFilter]   = useState('all');

  const filteredPlayers = useMemo(() =>
    playerList.filter(p => roleFilter === 'all' || p.roleCode.startsWith(roleFilter)),
    [playerList, roleFilter]
  );

  const effectiveNum = filteredPlayers.find(p => p.number === selectedNum)
    ? selectedNum
    : filteredPlayers[0]?.number || null;

  const chartData = useMemo(() => {
    if (!effectiveNum || !playerTrends?.[effectiveNum]) return [];
    const pData    = playerTrends[effectiveNum];
    const fundData = pData.trends[selectedFund];
    if (!fundData || !fundData.matchLabels) return [];
    return fundData.matchLabels.map((ml, i) => {
      const ma      = sortedMA.find(m => m.match.id === ml.matchId);
      const teamEff = (ma?.match.riepilogo?.team?.[selectedFund]?.efficacy || 0) * 100;
      return {
        label:  (ml.opponent || '').substring(0, 10),
        player: +((fundData.raw[i] || 0) * 100).toFixed(1),
        team:   +teamEff.toFixed(1),
      };
    });
  }, [effectiveNum, selectedFund, playerTrends, sortedMA]);

  const selectedPlayerData = effectiveNum ? playerTrends[effectiveNum] : null;
  const playerAvg  = selectedPlayerData?.trends[selectedFund]?.rawAvg  ?? 0;
  const playerTrnd = selectedPlayerData?.trends[selectedFund]?.rawTrend ?? 'stable';

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 flex-wrap">
          {ROLE_GROUPS.map(rg => (
            <button key={rg.id} onClick={() => setRoleFilter(rg.id)}
              className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all ${
                roleFilter === rg.id
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'text-gray-500 border-white/[0.08] hover:text-gray-300'
              }`}
            >
              {rg.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {FUNDS.map(f => (
            <button key={f} onClick={() => setSelectedFund(f)}
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg border transition-all ${
                selectedFund === f ? 'opacity-100 font-medium' : 'opacity-50 hover:opacity-75'
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

      {/* Player selector */}
      {filteredPlayers.length === 0 ? (
        <p className="text-xs text-gray-600 italic">Nessuna giocatrice con dati sufficienti.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {filteredPlayers.map(p => {
            const trend = p.trends[selectedFund];
            const tDir  = trend?.rawTrend || 'stable';
            return (
              <button key={p.number} onClick={() => setSelectedNum(p.number)}
                className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg border transition-all ${
                  effectiveNum === p.number
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'text-gray-400 border-white/[0.08] hover:text-gray-200'
                }`}
              >
                <span className="font-mono opacity-70">#{p.number}</span>
                <span>{p.name}</span>
                <span className={tDir === 'improving' ? 'text-green-400' : tDir === 'declining' ? 'text-red-400' : 'text-gray-500'}>
                  {tDir === 'improving' ? '↑' : tDir === 'declining' ? '↓' : '~'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Chart */}
      {chartData.length < 2 ? (
        <EmptyChart label={
          effectiveNum
            ? `Dati insufficienti per ${FUND_LABELS[selectedFund]}.`
            : 'Seleziona una giocatrice.'
        } />
      ) : (
        <div>
          <div className="flex items-center gap-3 mb-2 text-[10px]">
            <span className="text-white font-semibold">#{effectiveNum} {selectedPlayerData?.name}</span>
            <span className="text-gray-500">
              Media: <span style={{ color: FUND_COLORS[selectedFund] }}>{(playerAvg * 100).toFixed(1)}%</span>
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${
              playerTrnd === 'improving' ? 'bg-green-500/15 text-green-400' :
              playerTrnd === 'declining' ? 'bg-red-500/15 text-red-400' :
              'bg-white/5 text-gray-500'
            }`}>
              {playerTrnd === 'improving' ? '📈 Crescita' : playerTrnd === 'declining' ? '📉 Calo' : '→ Stabile'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={['auto', 'auto']}
                tickFormatter={v => `${v.toFixed(0)}%`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(val, name) => [`${val?.toFixed(1) ?? '—'}%`, name]} />
              <Line type="monotone" dataKey="player"
                name={selectedPlayerData?.name || 'Giocatrice'}
                stroke={FUND_COLORS[selectedFund]} strokeWidth={2.5}
                dot={{ r: 4, fill: FUND_COLORS[selectedFund] }} activeDot={{ r: 6 }} connectNulls />
              <Line type="monotone" dataKey="team" name="Media squadra"
                stroke="rgba(148,163,184,0.5)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function EmptyChart({ label }) {
  return (
    <div className="h-24 flex items-center justify-center text-xs text-gray-600">{label}</div>
  );
}
