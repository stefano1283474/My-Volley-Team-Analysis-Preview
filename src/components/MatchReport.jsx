import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line } from 'recharts';
import { COLORS } from '../utils/constants';

export default function MatchReport({ analytics, matches, standings, selectedMatch, onSelectMatch, weights }) {
  const [activeSet, setActiveSet] = useState(null);
  const matchAnalytics = analytics?.matchAnalytics || [];
  const opponents = useMemo(() => (
    [...new Set(
      (matchAnalytics || [])
        .map(ma => ma?.match?.metadata?.opponent || '')
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b))
  ), [matchAnalytics]);
  const [selectedScoutOpponent, setSelectedScoutOpponent] = useState('');
  const activeScoutOpponent = opponents.includes(selectedScoutOpponent) ? selectedScoutOpponent : (opponents[0] || '');
  const selectedOpponentMatches = useMemo(() => (
    (matchAnalytics || [])
      .filter(ma => (ma?.match?.metadata?.opponent || '') === activeScoutOpponent)
      .sort((a, b) => (b.match.metadata?.date || '').localeCompare(a.match.metadata?.date || ''))
  ), [matchAnalytics, activeScoutOpponent]);
  const selectedOpponentMA = selectedOpponentMatches[0] || null;

  if (!analytics || matches.length === 0) {
    return <EmptyState message="Carica almeno una partita per vedere il report." />;
  }

  // If no match selected, show list
  if (!selectedMatch) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <h2 className="text-xl font-bold text-white">Report Partite</h2>
        <p className="text-sm text-gray-400">Seleziona una partita per il report dettagliato.</p>
        <AggregatedScoutPanel
          matchAnalytics={matchAnalytics}
          selectedOpponent={activeScoutOpponent}
          onSelectOpponent={setSelectedScoutOpponent}
        />
        <OpponentSelectedDetailsPanel
          ma={selectedOpponentMA}
          allMatchesVsOpponent={selectedOpponentMatches}
          onSelectMatch={onSelectMatch}
        />
      </div>
    );
  }

  const ma = analytics.matchAnalytics.find(a => a.match.id === selectedMatch.id);
  if (!ma) return <EmptyState message="Partita non trovata nell'analisi." />;

  const { match, matchWeight, report, chains, playerStats, oppStats, fundWeights } = ma;
  const setsWon = (match.sets || []).filter(s => s.won).length;
  const setsLost = (match.sets || []).filter(s => !s.won).length;

  // Player stats comparison data
  const playerCompData = playerStats
    .filter(p => (p.raw.attack.tot > 0 || p.raw.serve.tot > 0 || p.raw.reception.tot > 0 || p.raw.defense.tot > 0))
    .map(p => ({
      name: p.name,
      attRaw: (p.raw.attack.efficacy * 100),
      attWeighted: (p.weighted.attack.efficacy * 100),
      serRaw: (p.raw.serve.efficacy * 100),
      serWeighted: (p.weighted.serve.efficacy * 100),
      recRaw: (p.raw.reception.efficacy * 100),
      recWeighted: (p.weighted.reception.efficacy * 100),
      defRaw: (p.raw.defense.efficacy * 100),
      defWeighted: (p.weighted.defense.efficacy * 100),
    }));

  // Weight breakdown data
  const weightBreakdown = Object.entries(matchWeight.components).map(([key, val]) => ({
    name: {
      opponentStrength: 'Forza Avv.',
      opponentPerformance: 'Performance Avv.',
      setCompetitiveness: 'Set Combattuti',
      matchResult: 'Risultato',
      chainContext: 'Complessità Rally',
    }[key] || key,
    value: val.value,
    contribution: val.contribution,
    weight: val.weight,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Back button + Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => onSelectMatch(null)}
          className="text-gray-400 hover:text-white text-sm">← Torna alla lista</button>
      </div>

      {/* Match Header */}
      <div className="glass-card-accent p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-white">
              vs {match.metadata.opponent || 'N/D'}
            </h2>
            <p className="text-xs text-gray-400">
              {match.metadata.date} · {match.metadata.homeAway} · {match.metadata.matchType}
            </p>
          </div>
          <div className={`text-3xl font-bold font-mono ${setsWon > setsLost ? 'text-green-400' : 'text-red-400'}`}>
            {setsWon}-{setsLost}
          </div>
        </div>

        {/* Set scores */}
        <div className="flex gap-2 mb-4">
          {(match.sets || []).map(s => (
            <div key={s.number}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono ${s.won ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              Set {s.number}: {s.ourScore}-{s.theirScore}
            </div>
          ))}
        </div>

        {/* Report summary */}
        <p className="text-sm text-gray-200 leading-relaxed">{report.summary}</p>
        <p className="text-sm text-gray-300 mt-2 leading-relaxed">{report.oppAssessment}</p>
      </div>

      {/* Weight Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            Peso Contesto: <span className="text-amber-400 font-mono">{matchWeight.final.toFixed(3)}</span>
          </h3>
          <div className="space-y-2">
            {weightBreakdown.map(wb => (
              <div key={wb.name} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-32">{wb.name}</span>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.abs(wb.contribution) * 200 + 2}%`,
                      background: wb.contribution >= 0
                        ? `linear-gradient(90deg, rgba(163,230,53,0.4), rgba(163,230,53,0.8))`
                        : `linear-gradient(90deg, rgba(251,113,133,0.4), rgba(251,113,133,0.8))`,
                    }}
                  />
                </div>
                <span className={`text-xs font-mono w-14 text-right ${wb.contribution >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {wb.contribution >= 0 ? '+' : ''}{wb.contribution.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-white/5 text-xs text-gray-500">
            Peso {'>'} 1.0 = contesto difficile (performance rivalutate) · Peso {'<'} 1.0 = contesto facile (performance ridimensionate)
          </div>
        </div>

        {/* Per-fundamental weights */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Peso per Fondamentale</h3>
          <div className="space-y-3">
            {Object.entries(fundWeights).map(([key, val]) => {
              const labels = { a: 'Attacco', b: 'Battuta', r: 'Ricezione', d: 'Difesa', m: 'Muro' };
              const colors = { a: '#f43f5e', b: '#8b5cf6', r: '#0ea5e9', d: '#10b981', m: '#f59e0b' };
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs w-20" style={{ color: colors[key] }}>{labels[key]}</span>
                  <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden relative">
                    <div className="absolute inset-0 flex items-center justify-center text-[9px] text-gray-400 z-10">
                      {val.toFixed(2)}
                    </div>
                    <div className="h-full rounded-full" style={{ width: `${(val / 1.5) * 100}%`, background: colors[key], opacity: 0.4 }} />
                  </div>
                  <span className={`text-[10px] font-mono ${val > 1.05 ? 'text-green-400' : val < 0.95 ? 'text-red-400' : 'text-gray-400'}`}>
                    {val > 1.05 ? '↑ più difficile' : val < 0.95 ? '↓ più facile' : '≈ nella media'}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] text-gray-500">
            Basato sullo scout dedotto dell'avversario confrontato con la media del campionato.
          </p>
        </div>
      </div>

      {/* Key Findings */}
      {(report.keyFindings.length > 0 || report.concerns.length > 0) && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Lettura della Partita</h3>
          <div className="space-y-2">
            {report.keyFindings.map((f, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-sky-400 mt-0.5">●</span>
                <span className="text-gray-300">{f}</span>
              </div>
            ))}
            {report.concerns.map((c, i) => (
              <div key={`c-${i}`} className="flex gap-2 text-xs">
                <span className="text-amber-400 mt-0.5">⚠</span>
                <span className="text-amber-200/80">{c}</span>
              </div>
            ))}
          </div>

          {/* Side-out and break stats */}
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/5">
            <div>
              <p className="text-[10px] text-gray-500 uppercase">Side-Out (Ricezione)</p>
              <p className="text-lg font-bold font-mono text-sky-400">{(chains.sideOut.pct * 100).toFixed(1)}%</p>
              <p className="text-[10px] text-gray-500">{chains.sideOut.won}/{chains.sideOut.total} azioni vinte</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase">Break-Point (Battuta)</p>
              <p className="text-lg font-bold font-mono text-green-400">{(chains.breakPoint.pct * 100).toFixed(1)}%</p>
              <p className="text-[10px] text-gray-500">{chains.breakPoint.won}/{chains.breakPoint.total} azioni vinte</p>
            </div>
          </div>

          {/* Side-out by reception quality */}
          {Object.keys(chains.sideOut.byReceptionQuality).length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-xs text-gray-400 mb-2">Side-Out per qualità di ricezione:</p>
              <div className="flex gap-3">
                {['R5', 'R4', 'R3', 'R2', 'R1'].map(rKey => {
                  const data = chains.sideOut.byReceptionQuality[rKey];
                  if (!data) return null;
                  const pct = data.total > 0 ? (data.won / data.total * 100) : 0;
                  return (
                    <div key={rKey} className="text-center">
                      <p className="text-[10px] text-gray-500">{rKey}</p>
                      <p className={`text-sm font-mono font-bold ${pct > 60 ? 'text-green-400' : pct > 40 ? 'text-amber-400' : 'text-red-400'}`}>
                        {pct.toFixed(0)}%
                      </p>
                      <p className="text-[9px] text-gray-600">{data.won}/{data.total}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Player comparison */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">
          Performance Giocatrici: <span className="text-sky-400">Dato</span> vs <span className="text-amber-400">Contestualizzato</span>
        </h3>
        <ResponsiveContainer width="100%" height={Math.max(250, playerCompData.length * 35)}>
          <BarChart data={playerCompData} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} domain={[-50, 80]} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} width={75} />
            <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="attRaw" name="Att. Dato" fill={COLORS.raw} opacity={0.5} />
            <Bar dataKey="attWeighted" name="Att. Contestualizzato" fill={COLORS.weighted} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Opponent deduced stats */}
      {oppStats && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            <span className="text-purple-400">●</span> Scout Dedotto Avversario
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <DetailedOppStatCard title="Battuta" data={oppStats.deduced.serve} type="serve" />
            <DetailedOppStatCard title="Attacco" data={oppStats.deduced.attack} type="attack" />
            <DetailedOppStatCard title="Difesa" data={oppStats.deduced.defense} type="defense" />
            <DetailedOppStatCard title="Ricezione" data={oppStats.deduced.reception} type="reception" />
          </div>
          <div className="mt-3 flex gap-4 text-xs text-gray-500">
            <span>Errori avversari totali: {oppStats.oppErrors.total}</span>
            <span>Di cui battuta: {oppStats.oppErrors.serveErrors}</span>
            <span>Di cui attacco: {oppStats.oppErrors.attackErrors}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detailed Opponent Stat Card ──────────────────────────────────────────
function DetailedOppStatCard({ title, data, type }) {
  const isServeOrAttack = type === 'serve' || type === 'attack';
  const total = data.total || 0;
  const pct = (v) => total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '0.0%';

  // Compute efficacy if not present (defense/reception don't have it set)
  let efficacy = data.efficacy;
  if (efficacy === undefined || efficacy === 0) {
    if (isServeOrAttack) {
      efficacy = total > 0 ? ((data.val5 || 0) - (data.val1 || 0)) / total : 0;
    } else {
      // For defense/reception: (val4+5 - val1) / total  analogous to (R5+R4-R1)/tot
      efficacy = total > 0 ? ((data['val4+5'] || 0) - (data.val1 || 0)) / total : 0;
    }
  }

  const cols = isServeOrAttack
    ? [
        { label: '5', value: data.val5 || 0 },
        { label: '4', value: data.val4 || 0 },
        { label: '3', value: data.val3 || 0 },
        { label: '2', value: data.val2 || 0 },
        { label: '1', value: data.val1 || 0 },
      ]
    : [
        { label: '4+5', value: data['val4+5'] || 0 },
        { label: '3',   value: data.val3 || 0 },
        { label: '2',   value: data.val2 || 0 },
        { label: '1',   value: data.val1 || 0 },
      ];

  const gridCols = `repeat(${cols.length + 1}, 1fr)`;

  return (
    <div className="p-3 rounded-lg bg-white/[0.03]">
      <p className="text-[10px] text-purple-400 uppercase tracking-wider mb-1">{title}</p>
      <div className="flex items-baseline gap-2 mb-3">
        <p className={`text-lg font-mono font-bold ${efficacy >= 0.1 ? 'text-green-400' : efficacy >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
          {(efficacy * 100).toFixed(1)}%
        </p>
        <p className="text-[10px] text-gray-600">Tot: {total}</p>
      </div>

      {/* Breakdown grid: header / counts / percentages */}
      <div className="grid text-center gap-x-1 gap-y-0.5" style={{ gridTemplateColumns: gridCols }}>
        {/* Labels row */}
        {cols.map(col => (
          <div key={`lbl-${col.label}`} className="text-[9px] text-gray-500 font-mono pb-0.5 border-b border-white/5">{col.label}</div>
        ))}
        <div className="text-[9px] text-gray-500 font-mono pb-0.5 border-b border-white/5">Tot</div>

        {/* Counts row */}
        {cols.map(col => (
          <div key={`cnt-${col.label}`} className="text-[11px] font-mono text-white mt-1">{col.value}</div>
        ))}
        <div className="text-[11px] font-mono text-white mt-1">{total}</div>

        {/* Percentages row */}
        {cols.map(col => (
          <div key={`pct-${col.label}`} className="text-[9px] font-mono text-gray-400">{pct(col.value)}</div>
        ))}
        <div className="text-[9px] font-mono text-gray-400">100%</div>
      </div>

      {/* Aggregates section — only for defense and reception */}
      {!isServeOrAttack && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <p className="text-[9px] text-gray-500">Val 3</p>
              <p className="text-[10px] font-mono text-sky-400">{data.val3 || 0}</p>
              <p className="text-[9px] text-gray-400">{pct(data.val3 || 0)}</p>
            </div>
            <div>
              <p className="text-[9px] text-gray-500">Val 4+5</p>
              <p className="text-[10px] font-mono text-green-400">{data['val4+5'] || 0}</p>
              <p className="text-[9px] text-gray-400">{pct(data['val4+5'] || 0)}</p>
            </div>
            <div>
              <p className="text-[9px] text-gray-500">Val 3+4+5</p>
              <p className="text-[10px] font-mono text-amber-400">{(data.val3 || 0) + (data['val4+5'] || 0)}</p>
              <p className="text-[9px] text-gray-400">{pct((data.val3 || 0) + (data['val4+5'] || 0))}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aggregated Scout Panel (all matches) ─────────────────────────────────
function computeAggregatedScout(matchAnalytics) {
  const agg = {
    serve:     { val5: 0, val4: 0, val3: 0, val2: 0, val1: 0, total: 0 },
    attack:    { val5: 0, val4: 0, val3: 0, val2: 0, val1: 0, total: 0 },
    defense:   { 'val4+5': 0, val3: 0, val2: 0, val1: 0, total: 0 },
    reception: { 'val4+5': 0, val3: 0, val2: 0, val1: 0, total: 0 },
    matchCount: 0,
  };

  for (const ma of matchAnalytics) {
    const o = ma.oppStats?.deduced;
    if (!o) continue;
    agg.matchCount++;

    const s = o.serve;
    if (s && s.total > 0) {
      agg.serve.val5 += s.val5 || 0;
      agg.serve.val4 += s.val4 || 0;
      agg.serve.val3 += s.val3 || 0;
      agg.serve.val2 += s.val2 || 0;
      agg.serve.val1 += s.val1 || 0;
      agg.serve.total += s.total;
    }

    const a = o.attack;
    if (a && a.total > 0) {
      agg.attack.val5 += a.val5 || 0;
      agg.attack.val4 += a.val4 || 0;
      agg.attack.val3 += a.val3 || 0;
      agg.attack.val2 += a.val2 || 0;
      agg.attack.val1 += a.val1 || 0;
      agg.attack.total += a.total;
    }

    const d = o.defense;
    if (d) {
      agg.defense['val4+5'] += d['val4+5'] || 0;
      agg.defense.val3 += d.val3 || 0;
      agg.defense.val2 += d.val2 || 0;
      agg.defense.val1 += d.val1 || 0;
      agg.defense.total += d.total || 0;
    }

    const r = o.reception;
    if (r) {
      agg.reception['val4+5'] += r['val4+5'] || 0;
      agg.reception.val3 += r.val3 || 0;
      agg.reception.val2 += r.val2 || 0;
      agg.reception.val1 += r.val1 || 0;
      agg.reception.total += r.total || 0;
    }
  }

  // Add computed efficacy
  const t = agg.serve.total;
  agg.serve.efficacy = t > 0 ? (agg.serve.val5 - agg.serve.val1) / t : 0;
  const ta = agg.attack.total;
  agg.attack.efficacy = ta > 0 ? (agg.attack.val5 - agg.attack.val1) / ta : 0;
  const td = agg.defense.total;
  agg.defense.efficacy = td > 0 ? (agg.defense['val4+5'] - agg.defense.val1) / td : 0;
  const tr = agg.reception.total;
  agg.reception.efficacy = tr > 0 ? (agg.reception['val4+5'] - agg.reception.val1) / tr : 0;

  return agg;
}

function AggregatedScoutPanel({ matchAnalytics, selectedOpponent, onSelectOpponent }) {
  const agg = useMemo(() => computeAggregatedScout(matchAnalytics), [matchAnalytics]);
  const opponents = useMemo(() => (
    [...new Set(
      (matchAnalytics || [])
        .map(ma => ma?.match?.metadata?.opponent || '')
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b))
  ), [matchAnalytics]);
  const activeOpponent = opponents.includes(selectedOpponent) ? selectedOpponent : (opponents[0] || '');
  const selectedOppAgg = useMemo(() => {
    if (!activeOpponent) return null;
    const filtered = (matchAnalytics || []).filter(
      ma => (ma?.match?.metadata?.opponent || '') === activeOpponent
    );
    return computeAggregatedScout(filtered);
  }, [matchAnalytics, activeOpponent]);
  const cardsAgg = selectedOppAgg || agg;

  if (agg.matchCount === 0) return null;

  return (
    <div className="glass-card overflow-hidden">
      <div className="w-full flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-purple-400 text-sm">●</span>
          <span className="text-sm font-semibold text-gray-300">Scout Dedotto Avversario — Media Stagione</span>
          <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">{agg.matchCount} partite</span>
        </div>
      </div>

      <div className="px-5 pb-5 border-t border-white/5">
        <p className="text-[10px] text-gray-500 mt-3 mb-3">
          Dati aggregati di tutte le partite — usa come riferimento per confrontare la singola partita.
        </p>
        <OpponentScoutComparisonChart
          seasonAgg={agg}
          opponents={opponents}
          activeOpponent={activeOpponent}
          onSelectOpponent={onSelectOpponent}
          selectedOppAgg={selectedOppAgg}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <DetailedOppStatCard title="Battuta" data={cardsAgg.serve} type="serve" />
          <DetailedOppStatCard title="Attacco" data={cardsAgg.attack} type="attack" />
          <DetailedOppStatCard title="Difesa" data={cardsAgg.defense} type="defense" />
          <DetailedOppStatCard title="Ricezione" data={cardsAgg.reception} type="reception" />
        </div>
      </div>
    </div>
  );
}

function OpponentSelectedDetailsPanel({ ma, allMatchesVsOpponent = [], onSelectMatch }) {
  if (!ma) return null;
  const { match, matchWeight, report, fundWeights } = ma;
  const setsWon = (match.sets || []).filter(s => s.won).length;
  const setsLost = (match.sets || []).filter(s => !s.won).length;
  const won = setsWon > setsLost;
  const weightBreakdown = Object.entries(matchWeight.components || {}).map(([key, val]) => ({
    name: {
      opponentStrength: 'Forza Avv.',
      opponentPerformance: 'Performance Avv.',
      setCompetitiveness: 'Set Combattuti',
      matchResult: 'Risultato',
      chainContext: 'Complessità Rally',
    }[key] || key,
    contribution: val?.contribution || 0,
  }));

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Scheda avversaria selezionata</h3>
          <p className="text-[10px] text-gray-500">
            Mostra l'ultima partita disponibile contro questo avversario ({allMatchesVsOpponent.length} partite nel dataset).
          </p>
        </div>
        <button
          onClick={() => onSelectMatch(match)}
          className="text-xs px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
        >
          Apri report completo
        </button>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold font-mono ${won ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
              {setsWon}-{setsLost}
            </div>
            <div>
              <p className="text-2xl font-bold text-white">vs {match.metadata?.opponent || 'N/D'}</p>
              <p className="text-sm text-gray-400">{match.metadata?.date || ''} · {match.metadata?.homeAway || ''}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-mono font-bold text-amber-400">{matchWeight.final.toFixed(2)}</p>
            <p className="text-sm text-gray-500">peso contesto</p>
          </div>
        </div>
      </div>

      <div className="glass-card-accent p-4">
        <div className="flex gap-2 mb-2 flex-wrap">
          {(match.sets || []).map(s => (
            <div key={s.number} className={`px-2.5 py-1 rounded text-[11px] font-mono ${s.won ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              Set {s.number}: {s.ourScore}-{s.theirScore}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-300">{report.summary}</p>
        <p className="text-xs text-gray-400 mt-1">{report.oppAssessment}{match.metadata?.matchType ? ` · ${match.metadata.matchType}` : ''}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="glass-card p-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">
            Peso Contesto: <span className="text-amber-400 font-mono">{matchWeight.final.toFixed(3)}</span>
          </h4>
          <div className="space-y-1.5">
            {weightBreakdown.map(wb => (
              <div key={wb.name} className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 w-28">{wb.name}</span>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.abs(wb.contribution) * 200 + 2}%`,
                      background: wb.contribution >= 0
                        ? 'linear-gradient(90deg, rgba(163,230,53,0.4), rgba(163,230,53,0.8))'
                        : 'linear-gradient(90deg, rgba(251,113,133,0.4), rgba(251,113,133,0.8))',
                    }}
                  />
                </div>
                <span className={`text-[11px] font-mono w-12 text-right ${wb.contribution >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {wb.contribution >= 0 ? '+' : ''}{wb.contribution.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Peso per Fondamentale</h4>
          <div className="space-y-2">
            {Object.entries(fundWeights || {}).map(([key, val]) => {
              const labels = { a: 'Attacco', b: 'Battuta', r: 'Ricezione', d: 'Difesa', m: 'Muro' };
              const colors = { a: '#f43f5e', b: '#8b5cf6', r: '#0ea5e9', d: '#10b981', m: '#f59e0b' };
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs w-20" style={{ color: colors[key] }}>{labels[key]}</span>
                  <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden relative">
                    <div className="absolute inset-0 flex items-center justify-center text-[9px] text-gray-300 z-10">{val.toFixed(2)}</div>
                    <div className="h-full rounded-full" style={{ width: `${(val / 1.5) * 100}%`, background: colors[key], opacity: 0.45 }} />
                  </div>
                  <span className={`text-[10px] font-mono ${val > 1.05 ? 'text-green-400' : val < 0.95 ? 'text-red-400' : 'text-gray-400'}`}>
                    {val > 1.05 ? '↑ diff.' : val < 0.95 ? '↓ facile' : '≈ media'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function OpponentScoutComparisonChart({ seasonAgg, opponents, activeOpponent, onSelectOpponent, selectedOppAgg }) {
  const chartData = useMemo(() => {
    if (!selectedOppAgg || !seasonAgg) return [];
    return [
      { fund: 'Battuta', opp: (selectedOppAgg.serve?.efficacy || 0) * 100, avg: (seasonAgg.serve?.efficacy || 0) * 100 },
      { fund: 'Attacco', opp: (selectedOppAgg.attack?.efficacy || 0) * 100, avg: (seasonAgg.attack?.efficacy || 0) * 100 },
      { fund: 'Difesa', opp: (selectedOppAgg.defense?.efficacy || 0) * 100, avg: (seasonAgg.defense?.efficacy || 0) * 100 },
      { fund: 'Ricezione', opp: (selectedOppAgg.reception?.efficacy || 0) * 100, avg: (seasonAgg.reception?.efficacy || 0) * 100 },
    ].map(r => ({ ...r, opp: +r.opp.toFixed(1), avg: +r.avg.toFixed(1) }));
  }, [selectedOppAgg, seasonAgg]);

  if (!opponents.length || !chartData.length) return null;

  return (
    <div className="glass-card p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
          Confronto Scout Avversario vs Media Avversari
        </h4>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="fund" tick={{ fill: '#9ca3af', fontSize: 10 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
            formatter={(v, n) => [`${Number(v).toFixed(1)}%`, n === 'opp' ? activeOpponent : 'Media avversari']}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            wrapperStyle={{ fontSize: 11 }}
            formatter={(v) => (v === 'opp' ? activeOpponent : 'Media avversari')}
          />
          <Line
            type="monotone"
            dataKey="opp"
            stroke="#a855f7"
            strokeWidth={2.3}
            dot={{ r: 3.5, fill: '#a855f7' }}
            activeDot={{ r: 5 }}
            name="opp"
          />
          <Line
            type="monotone"
            dataKey="avg"
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={{ r: 3, fill: '#94a3b8' }}
            activeDot={{ r: 4.5 }}
            name="avg"
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {opponents.map(o => (
          <button
            key={o}
            onClick={() => onSelectOpponent(o)}
            className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
              activeOpponent === o
                ? 'bg-violet-500/20 text-violet-300 border-violet-400/40'
                : 'bg-white/[0.03] text-gray-400 border-white/10 hover:text-gray-200'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-sm">
      <div className="text-4xl mb-3">📊</div>
      <p>{message}</p>
    </div>
  );
}
