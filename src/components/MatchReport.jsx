import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line } from 'recharts';
import { COLORS } from '../utils/constants';
import { analyzeRotationalChains } from '../utils/analyticsEngine';

const ALL_OPPONENTS_ID = '__all_opponents__';
const ALL_PLAYERS_ID = '__all_players__';

export default function MatchReport({ analytics, matches, standings, selectedMatch, onSelectMatch, weights, dataMode = 'raw', externalScoutOpponent = '', externalOpenCommentTick = 0 }) {
  const [activeSet, setActiveSet] = useState(null);
  const matchAnalytics = analytics?.matchAnalytics || [];
  const opponents = useMemo(() => (
    [...new Set(
      (matchAnalytics || [])
        .map(ma => ma?.match?.metadata?.opponent || '')
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b))
  ), [matchAnalytics]);
  const [selectedScoutOpponent, setSelectedScoutOpponent] = useState(ALL_OPPONENTS_ID);
  const [selectedScoutMatchId, setSelectedScoutMatchId] = useState('');
  useEffect(() => {
    if (!externalScoutOpponent) return;
    setSelectedScoutOpponent(externalScoutOpponent);
  }, [externalScoutOpponent]);
  const activeScoutOpponent = (
    selectedScoutOpponent === ALL_OPPONENTS_ID || opponents.includes(selectedScoutOpponent)
  ) ? selectedScoutOpponent : (opponents[0] || ALL_OPPONENTS_ID);
  const selectedOpponentMatches = useMemo(() => (
    (matchAnalytics || [])
      .filter(ma => (
        activeScoutOpponent === ALL_OPPONENTS_ID
          ? true
          : (ma?.match?.metadata?.opponent || '') === activeScoutOpponent
      ))
      .sort((a, b) => (b.match.metadata?.date || '').localeCompare(a.match.metadata?.date || ''))
  ), [matchAnalytics, activeScoutOpponent]);
  const activeScoutMatchId = selectedOpponentMatches.some(ma => ma?.match?.id === selectedScoutMatchId)
    ? selectedScoutMatchId
    : (selectedOpponentMatches[0]?.match?.id || '');
  const selectedOpponentMA = selectedOpponentMatches.find(ma => ma?.match?.id === activeScoutMatchId) || null;

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
          selectedMatchId={activeScoutMatchId}
          onSelectMatchId={setSelectedScoutMatchId}
          selectedMatchMA={selectedOpponentMA}
          selectedOpponentMatches={selectedOpponentMatches}
          dataMode={dataMode}
          forceOpenCommentTick={externalOpenCommentTick}
        />
        <OpponentSelectedDetailsPanel
          ma={selectedOpponentMA}
          allMatchesVsOpponent={selectedOpponentMatches}
          onSelectMatch={onSelectMatch}
          matchAnalytics={matchAnalytics}
          selectedOpponent={activeScoutOpponent}
          dataMode={dataMode}
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
// ─── Opponent Attack Attitude (derived from OUR quartine) ────────────────────
// We infer the opponent's attack context and result from our own recorded actions:
//
//   Context (what action gave them the ball):
//     b2 → their R4/R5 (easy receive)      → E bucket (c=1.0)
//     b3 → their R3   (medium receive)     → H bucket (c=2.0)
//     a2 → their D4/D5 (easy dig)          → E bucket
//     a3 → their D3   (hard dig)           → H bucket
//     d2 → their freeball (our poor dig)   → F bucket (c=0.5)
//     r2 → their freeball (our poor recv)  → F bucket
//     all others (b1/b4/b5/a1/a4/a5) → no opponent attack → skip
//
//   Result (from our next recorded action):
//     d1               → their kill  → pts++
//     opponent_error at end of rally → their error → errs++
//     d2/d3/d4/d5      → neutral
//
// Returns raw { H, E, F } bucket counts for aggregation across matches.
function computeOpponentAttackBuckets(match) {
  const H = { pts: 0, errs: 0, tot: 0 };
  const E = { pts: 0, errs: 0, tot: 0 };
  const F = { pts: 0, errs: 0, tot: 0 };

  // Find nearest preceding non-setter action before index i in array q
  const prevAction = (q, idx) => {
    for (let j = idx - 1; j >= 0; j--) {
      const a = q[j];
      if (a.type === 'action' && a.fundamental !== 'e') return a;
    }
    return null;
  };

  // Map our preceding action to the opponent attack context bucket
  const classifyBucket = (prev) => {
    if (!prev) return null;
    const f = prev.fundamental, v = prev.value;
    if (f === 'b') {
      if (v === 2) return E;   // easy serve  → their R4/R5
      if (v === 3) return H;   // medium serve → their R3
      return null;             // b1/b4/b5 → no opponent attack
    }
    if (f === 'a') {
      if (v === 2) return E;   // our neg attack → their D4/D5
      if (v === 3) return H;   // our poor attack → their D3
      return null;             // a1/a4/a5 → no opponent attack
    }
    if (f === 'd' && v === 2) return F;  // our poor dig → freeball to them
    if (f === 'r' && v === 2) return F;  // our poor recv → freeball to them
    return null;
  };

  for (const rally of match?.rallies || []) {
    const q = rally.quartine || [];
    if (q.length === 0) continue;

    // ── Case A: our defense (d) = they just attacked ─────────────────────────
    for (let i = 0; i < q.length; i++) {
      const act = q[i];
      if (act.type !== 'action' || act.fundamental !== 'd') continue;

      const bucket = classifyBucket(prevAction(q, i));
      if (!bucket) continue;

      bucket.tot++;
      if (act.value === 1) bucket.pts++;   // d1 = their kill
      // d2/d3/d4/d5 → they attacked but we got it → neutral
    }

    // ── Case B: opponent_error at END of rally (length > 1) = their atk error ─
    const last = q[q.length - 1];
    if (last?.type === 'opponent_error' && q.length > 1) {
      const bucket = classifyBucket(prevAction(q, q.length - 1));
      if (bucket) {
        bucket.tot++;
        bucket.errs++;  // their attack went out / into net
      }
    }
    // (length === 1 and opponent_error → serve error → not counted here)
  }

  return { H, E, F };
}

function computeAggregatedScout(matchAnalytics) {
  const agg = {
    serve:     { val5: 0, val4: 0, val3: 0, val2: 0, val1: 0, total: 0 },
    attack:    { val5: 0, val4: 0, val3: 0, val2: 0, val1: 0, total: 0 },
    defense:   { 'val4+5': 0, val3: 0, val2: 0, val1: 0, total: 0 },
    reception: { 'val4+5': 0, val3: 0, val2: 0, val1: 0, total: 0 },
    matchCount: 0,
  };

  // Accumulate raw attack-attitude buckets across all matches for proper weighting
  const atkBuckets = {
    H: { pts: 0, errs: 0, tot: 0 },
    E: { pts: 0, errs: 0, tot: 0 },
    F: { pts: 0, errs: 0, tot: 0 },
  };

  for (const ma of matchAnalytics) {
    const o = ma.oppStats?.deduced;
    if (!o) continue;
    agg.matchCount++;

    // Accumulate opponent attack attitude buckets from this match's quartine
    const b = computeOpponentAttackBuckets(ma.match);
    atkBuckets.H.pts  += b.H.pts;  atkBuckets.H.errs  += b.H.errs;  atkBuckets.H.tot  += b.H.tot;
    atkBuckets.E.pts  += b.E.pts;  atkBuckets.E.errs  += b.E.errs;  atkBuckets.E.tot  += b.E.tot;
    atkBuckets.F.pts  += b.F.pts;  atkBuckets.F.errs  += b.F.errs;  atkBuckets.F.tot  += b.F.tot;

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

  // ── Standard formulas (aligned with Federvolley/DataVolley definitions) ──────
  // Efficacia  = azioni positive / totale            (quante volte ho fatto bene)
  // Efficienza = (azioni positive - errori) / totale (netto errori)
  //
  //   Battuta:   Efficacia = B5/Tot          Efficienza = (B5-B1)/Tot
  //   Attacco:   Efficacia = A5/Tot          Efficienza = (A5-A1)/Tot
  //   Difesa:    Efficacia = (D5+D4)/Tot     Efficienza = (D5+D4-D1)/Tot
  //   Ricezione: Efficacia = (R5+R4)/Tot     Efficienza = (R5+R4-R1)/Tot

  const t = agg.serve.total;
  agg.serve.efficacy   = t > 0 ? agg.serve.val5 / t : 0;
  agg.serve.efficiency = t > 0 ? (agg.serve.val5 - agg.serve.val1) / t : 0;

  const ta = agg.attack.total;
  agg.attack.efficacy   = ta > 0 ? agg.attack.val5 / ta : 0;
  agg.attack.efficiency = ta > 0 ? (agg.attack.val5 - agg.attack.val1) / ta : 0;

  // defense/reception: val4 e val5 sono aggregati in val4+5
  const td = agg.defense.total;
  agg.defense.efficacy   = td > 0 ? agg.defense['val4+5'] / td : 0;
  agg.defense.efficiency = td > 0 ? (agg.defense['val4+5'] - agg.defense.val1) / td : 0;

  const tr = agg.reception.total;
  agg.reception.efficacy   = tr > 0 ? agg.reception['val4+5'] / tr : 0;
  agg.reception.efficiency = tr > 0 ? (agg.reception['val4+5'] - agg.reception.val1) / tr : 0;

  // block: not currently deduced from opponent, leave as undefined
  agg.block = { efficacy: null, efficiency: null };

  // ── Opponent Attitude ────────────────────────────────────────────────────────
  // Serve:     (B4+B5)/tot   — % serves creating difficulty or ace
  // Attack:    context-aware weighted formula derived from OUR rally quartine
  //              H(c=2.0): our b3→their R3, our a3→their D3
  //              E(c=1.0): our b2→their R4/R5, our a2→their D4/D5
  //              F(c=0.5): our d2/r2 → freeball to them
  //            Σ c*(pts−errs) / Σ c*tot
  // Defense:   (D4+5+D3)/tot — % attackable digs
  // Reception: (R4+5+R3)/tot — % attackable receptions
  agg.serve.attitude     = t  > 0 ? (agg.serve.val5 + agg.serve.val4) / t  : 0;
  const cH = 2.0, cE = 1.0, cF = 0.5;
  const atkDenom = cH * atkBuckets.H.tot + cE * atkBuckets.E.tot + cF * atkBuckets.F.tot;
  agg.attack.attitude = atkDenom > 0
    ? (cH * (atkBuckets.H.pts - atkBuckets.H.errs) +
       cE * (atkBuckets.E.pts - atkBuckets.E.errs) +
       cF * (atkBuckets.F.pts - atkBuckets.F.errs)) / atkDenom
    : 0;
  agg.defense.attitude   = td > 0 ? (agg.defense['val4+5'] + agg.defense.val3) / td : 0;
  agg.reception.attitude = tr > 0 ? (agg.reception['val4+5'] + agg.reception.val3) / tr : 0;

  // ── Media Ponderata ──────────────────────────────────────────────────────────
  // Weighted average of outcome values on the 1–5 scale.
  // Serve/Attack: all individual values available → standard weighted average.
  // Defense/Reception: val4 and val5 are combined → estimate:
  //   val4_est = combined/3, val5_est = 2*combined/3
  //   Weight contribution = 4*(combined/3) + 5*(2*combined/3) = (14/3)*combined
  agg.serve.mediaPond = t > 0
    ? (agg.serve.val1 + 2*agg.serve.val2 + 3*agg.serve.val3 + 4*agg.serve.val4 + 5*agg.serve.val5) / t
    : 0;
  agg.attack.mediaPond = ta > 0
    ? (agg.attack.val1 + 2*agg.attack.val2 + 3*agg.attack.val3 + 4*agg.attack.val4 + 5*agg.attack.val5) / ta
    : 0;
  agg.defense.mediaPond = td > 0
    ? (agg.defense.val1 + 2*agg.defense.val2 + 3*agg.defense.val3 + (14/3)*agg.defense['val4+5']) / td
    : 0;
  agg.reception.mediaPond = tr > 0
    ? (agg.reception.val1 + 2*agg.reception.val2 + 3*agg.reception.val3 + (14/3)*agg.reception['val4+5']) / tr
    : 0;
  agg.block.mediaPond = null; // block not deduced

  return agg;
}

function roundValue(value) {
  return Number.isFinite(value) ? +value.toFixed(1) : null;
}

function avgValue(values = []) {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// ─── Attitude Metric ──────────────────────────────────────────────────────────
// A qualitative performance index per fundamental, distinct from DataVolley
// efficacy/efficiency. Reflects the team's capacity to create positive outcomes
// weighted by situational difficulty.
//
//   Battuta:   (B4 + B5) / tot_B             → % serves creating difficulty or ace
//   Ricezione: (R3 + R4 + R5) / tot_R        → % attackable receptions
//   Difesa:    (D3 + D4 + D5) / tot_D        → % attackable digs
//   Attacco:   context-aware weighted formula from rally quartine
//     Buckets (preceding non-set action in rally chain):
//       H — hard (R3 or D3):              coefficient c=2.0
//       E — easy (R4/R5 or D4/D5):        coefficient c=1.0
//       F — freeball (our B4 or A4 → opp gave freeball back): c=0.5
//     Formula: Σ c_b*(pts_b − errs_b) / Σ c_b*tot_b
//     Range ≈ −1 to +1 (multiplied ×100 for display as %)
function computeAttitude(match) {
  const team = match?.riepilogo?.team;
  if (!team) return null;

  // ── Battuta: (B5 + B4) / total ───────────────────────────────────────────
  const sv = team.serve;
  const serveAtt = sv && sv.tot > 0
    ? ((sv.kill || 0) + (sv.pos || 0)) / sv.tot
    : null;

  // ── Ricezione: (R3 + R4 + R5) / total ────────────────────────────────────
  const rc = team.reception;
  const recAtt = rc && rc.tot > 0
    ? ((rc.kill || 0) + (rc.pos || 0) + (rc.exc || 0)) / rc.tot
    : null;

  // ── Difesa: (D3 + D4 + D5) / total ───────────────────────────────────────
  const df = team.defense;
  const defAtt = df && df.tot > 0
    ? ((df.kill || 0) + (df.pos || 0) + (df.exc || 0)) / df.tot
    : null;

  // ── Attacco: context-aware formula from rally quartine ────────────────────
  const H = { pts: 0, errs: 0, tot: 0 };   // hard:     R3 or D3      (c=2.0)
  const E = { pts: 0, errs: 0, tot: 0 };   // easy:     R4/R5 or D4/D5 (c=1.0)
  const F = { pts: 0, errs: 0, tot: 0 };   // freeball: our B4 or A4  (c=0.5)

  for (const rally of match?.rallies || []) {
    const q = rally.quartine || [];
    for (let i = 0; i < q.length; i++) {
      const act = q[i];
      if (act.type !== 'action' || act.fundamental !== 'a') continue;

      // Find nearest preceding non-setter action in rally chain
      let prevFund = null, prevVal = null;
      for (let j = i - 1; j >= 0; j--) {
        const prev = q[j];
        if (prev.type === 'action' && prev.fundamental !== 'e') {
          prevFund = prev.fundamental;
          prevVal  = prev.value;
          break;
        }
      }

      let bucket = null;
      if      (prevFund === 'r' && prevVal === 3)                    bucket = H;  // R3
      else if (prevFund === 'd' && prevVal === 3)                    bucket = H;  // D3
      else if (prevFund === 'r' && (prevVal === 4 || prevVal === 5)) bucket = E;  // R4/R5
      else if (prevFund === 'd' && (prevVal === 4 || prevVal === 5)) bucket = E;  // D4/D5
      else if ((prevFund === 'b' && prevVal === 4) ||
               (prevFund === 'a' && prevVal === 4))                  bucket = F;  // B4/A4 → freeball
      if (!bucket) continue;

      bucket.tot++;
      if (act.value === 5)      bucket.pts++;
      else if (act.value === 1) bucket.errs++;
    }
  }

  const cH = 2.0, cE = 1.0, cF = 0.5;
  const denom = cH * H.tot + cE * E.tot + cF * F.tot;
  const attackAtt = denom > 0
    ? (cH * (H.pts - H.errs) + cE * (E.pts - E.errs) + cF * (F.pts - F.errs)) / denom
    : null;

  return { serve: serveAtt, reception: recAtt, defense: defAtt, attack: attackAtt, block: null };
}

function computeTeamFundAverages(matchAnalytics) {
  const acc = {
    serve:     { efficacy: [], efficiency: [], attitude: [], mediaPond: [] },
    attack:    { efficacy: [], efficiency: [], attitude: [], mediaPond: [] },
    defense:   { efficacy: [], efficiency: [], attitude: [], mediaPond: [] },
    reception: { efficacy: [], efficiency: [], attitude: [], mediaPond: [] },
    block:     { efficacy: [], efficiency: [], attitude: [], mediaPond: [] },
  };
  for (const ma of matchAnalytics || []) {
    const team = ma?.match?.riepilogo?.team;
    if (!team) continue;
    const blockTotal = (team.block?.kill || 0) + (team.block?.pos || 0) + (team.block?.exc || 0) + (team.block?.neg || 0) + (team.block?.err || 0);
    const mappings = [
      ['serve', team.serve, team.serve?.tot || 0],
      ['attack', team.attack, team.attack?.tot || 0],
      ['defense', team.defense, team.defense?.tot || 0],
      ['reception', team.reception, team.reception?.tot || 0],
      ['block', team.block, blockTotal],
    ];
    for (const [key, data, total] of mappings) {
      if (!data || total <= 0) continue;
      // Compute from raw counts using standard Federvolley/DataVolley definitions:
      //   Efficacia  = positive / total      (quante volte ho fatto bene)
      //   Efficienza = (positive - err) / total  (netto errori)
      // defense & reception: positive = kill(5) + pos(4); others: positive = kill(5) only
      let effcy, effncy;
      if (key === 'defense' || key === 'reception') {
        const pos45 = (data.kill || 0) + (data.pos || 0);
        effcy  = pos45 / total;
        effncy = (pos45 - (data.err || 0)) / total;
      } else {
        effcy  = (data.kill || 0) / total;
        effncy = ((data.kill || 0) - (data.err || 0)) / total;
      }
      acc[key].efficacy.push(effcy * 100);
      acc[key].efficiency.push(effncy * 100);
      // Media Ponderata — our team has all individual values (kill=5, pos=4, exc=3, neg=2, err=1)
      const mpRaw = (1*(data.err||0) + 2*(data.neg||0) + 3*(data.exc||0) + 4*(data.pos||0) + 5*(data.kill||0)) / total;
      acc[key].mediaPond.push((mpRaw / 5) * 100); // normalize to 0–100 for chart parity
    }
    // Attitude per match
    const att = computeAttitude(ma?.match);
    if (att) {
      if (Number.isFinite(att.serve))     acc.serve.attitude.push(att.serve * 100);
      if (Number.isFinite(att.attack))    acc.attack.attitude.push(att.attack * 100);
      if (Number.isFinite(att.defense))   acc.defense.attitude.push(att.defense * 100);
      if (Number.isFinite(att.reception)) acc.reception.attitude.push(att.reception * 100);
    }
  }
  return Object.fromEntries(
    Object.entries(acc).map(([k, v]) => [k, {
      efficacy:   roundValue(avgValue(v.efficacy)),
      efficiency:  roundValue(avgValue(v.efficiency)),
      attitude:   roundValue(avgValue(v.attitude)),
      mediaPond:  roundValue(avgValue(v.mediaPond)),
    }])
  );
}

function getMatchTeamValue(selectedMatchMA, key, metric) {
  const team = selectedMatchMA?.match?.riepilogo?.team;
  const data = team?.[key];
  if (!data || !data.tot || data.tot <= 0) return null;
  const tot = data.tot;
  let value;
  if (metric === 'mediaPond') {
    // Our team has full individual values: err=1, neg=2, exc=3, pos=4, kill=5
    const mp = (1*(data.err||0) + 2*(data.neg||0) + 3*(data.exc||0) + 4*(data.pos||0) + 5*(data.kill||0)) / tot;
    return Number.isFinite(mp) ? roundValue((mp / 5) * 100) : null;
  }
  if (key === 'defense' || key === 'reception') {
    const pos45 = (data.kill || 0) + (data.pos || 0);
    value = metric === 'efficacy' ? pos45 / tot : (pos45 - (data.err || 0)) / tot;
  } else {
    const kill = data.kill || 0;
    value = metric === 'efficacy' ? kill / tot : (kill - (data.err || 0)) / tot;
  }
  return Number.isFinite(value) ? roundValue(value * 100) : null;
}

function buildPlayerCatalog(matchAnalytics) {
  const map = new Map();
  for (const ma of matchAnalytics || []) {
    for (const p of ma?.playerStats || []) {
      if (!p?.number || map.has(p.number)) continue;
      map.set(p.number, { number: p.number, name: p.name || `#${p.number}` });
    }
  }
  return [...map.values()].sort((a, b) => a.number.localeCompare(b.number));
}

function hasFundData(playerStats, key, metric) {
  return !!playerStats?.raw?.[key] && playerStats.raw[key].tot > 0 && Number.isFinite(playerStats.raw[key][metric]);
}

function buildPlayerSeries(matchAnalytics, selectedMatchMA, playerNumber) {
  const fundRows = [
    { key: 'serve', label: 'Battuta' },
    { key: 'attack', label: 'Attacco' },
    { key: 'defense', label: 'Difesa' },
    { key: 'reception', label: 'Ricezione' },
    { key: 'block', label: 'Muro' },
  ];
  const byDateDesc = [...(matchAnalytics || [])].sort((a, b) => (b?.match?.metadata?.date || '').localeCompare(a?.match?.metadata?.date || ''));
  const selectedPlayerStats = (selectedMatchMA?.playerStats || []).find(p => p.number === playerNumber) || null;
  return fundRows.map(({ key, label }) => {
    const matchEfficacy = hasFundData(selectedPlayerStats, key, 'efficacy')
      ? selectedPlayerStats.raw[key].efficacy * 100
      : null;
    const matchEfficiency = hasFundData(selectedPlayerStats, key, 'efficiency')
      ? selectedPlayerStats.raw[key].efficiency * 100
      : null;
    const allEfficacy = [];
    const last3Efficacy = [];
    const allEfficiency = [];
    const last3Efficiency = [];
    for (const ma of byDateDesc) {
      const ps = (ma?.playerStats || []).find(p => p.number === playerNumber);
      if (hasFundData(ps, key, 'efficacy')) {
        const val = ps.raw[key].efficacy * 100;
        allEfficacy.push(val);
        if (last3Efficacy.length < 3) last3Efficacy.push(val);
      }
      if (hasFundData(ps, key, 'efficiency')) {
        const val = ps.raw[key].efficiency * 100;
        allEfficiency.push(val);
        if (last3Efficiency.length < 3) last3Efficiency.push(val);
      }
    }
    return {
      fund: label,
      matchEfficacy: roundValue(matchEfficacy),
      avgAllEfficacy: roundValue(avgValue(allEfficacy)),
      avgLast3Efficacy: roundValue(avgValue(last3Efficacy)),
      matchEfficiency: roundValue(matchEfficiency),
      avgAllEfficiency: roundValue(avgValue(allEfficiency)),
      avgLast3Efficiency: roundValue(avgValue(last3Efficiency)),
    };
  });
}

function AggregatedScoutPanel({
  matchAnalytics,
  selectedOpponent,
  onSelectOpponent,
  selectedMatchId,
  onSelectMatchId,
  selectedMatchMA,
  selectedOpponentMatches = [],
  dataMode = 'raw',
  forceOpenCommentTick = 0,
}) {
  const [lineMode, setLineMode] = useState('attitude');
  const [showAttitudeInfo, setShowAttitudeInfo] = useState(false);
  // Close Attitude info dialog on Escape key
  useEffect(() => {
    if (!showAttitudeInfo) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowAttitudeInfo(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAttitudeInfo]);
  // Nota: dataMode (grezzi/pesati) NON influisce sulla modalità del grafico avversario.
  // I dati avversari sono sempre dati grezzi dedotti dallo scout; la scelta Efficacia/Efficienza/
  // Valori medi è indipendente e controllata dai pulsanti manuali.
  const agg = useMemo(() => computeAggregatedScout(matchAnalytics), [matchAnalytics]);
  const opponents = useMemo(() => (
    [...new Set(
      (matchAnalytics || [])
        .map(ma => ma?.match?.metadata?.opponent || '')
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b))
  ), [matchAnalytics]);
  const activeOpponent = (
    selectedOpponent === ALL_OPPONENTS_ID || opponents.includes(selectedOpponent)
  ) ? selectedOpponent : (opponents[0] || ALL_OPPONENTS_ID);
  const selectedOppAgg = useMemo(() => {
    if (!activeOpponent) return null;
    if (activeOpponent === ALL_OPPONENTS_ID) return agg;
    const filtered = (matchAnalytics || []).filter(
      ma => (ma?.match?.metadata?.opponent || '') === activeOpponent
    );
    return computeAggregatedScout(filtered);
  }, [matchAnalytics, activeOpponent, agg]);
  const seasonTeamAvg = useMemo(() => computeTeamFundAverages(matchAnalytics), [matchAnalytics]);
  const latestMatchMA = useMemo(() => (
    [...(matchAnalytics || [])]
      .sort((a, b) => (b?.match?.metadata?.date || '').localeCompare(a?.match?.metadata?.date || ''))[0] || null
  ), [matchAnalytics]);
  const cardsAgg = selectedOppAgg || agg;
  const opponentHeaderLabel = activeOpponent === ALL_OPPONENTS_ID ? 'All Opponent' : (activeOpponent || 'Avversario');

  if (agg.matchCount === 0) return null;

  return (
    <div className="glass-card overflow-hidden">
      <div className="w-full flex items-center justify-between px-5 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-purple-400 text-sm">●</span>
            <span className="text-sm font-semibold text-gray-300">{opponentHeaderLabel}</span>
          </div>
          {activeOpponent !== ALL_OPPONENTS_ID && selectedMatchMA?.match?.metadata?.date && (
            <div className="mt-1.5 text-sm font-semibold text-gray-300">
              {selectedMatchMA.match.metadata.date}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLineMode('efficacia')}
            className={`text-[10px] px-2 py-1 rounded border ${lineMode === 'efficacia' ? 'bg-sky-500/20 text-sky-300 border-sky-400/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}
          >
            Efficacia
          </button>
          <button
            onClick={() => setLineMode('efficienza')}
            className={`text-[10px] px-2 py-1 rounded border ${lineMode === 'efficienza' ? 'bg-sky-500/20 text-sky-300 border-sky-400/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}
          >
            Efficienza
          </button>
          <button
            onClick={() => setLineMode('attitude')}
            className={`text-[10px] px-2 py-1 rounded border ${lineMode === 'attitude' ? 'bg-sky-500/20 text-sky-300 border-sky-400/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}
          >
            AI Score
          </button>
          <button
            onClick={() => setLineMode('mediaPond')}
            className={`text-[10px] px-2 py-1 rounded border ${lineMode === 'mediaPond' ? 'bg-violet-500/20 text-violet-300 border-violet-400/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}
          >
            Media Pond.
          </button>
          {/* Info icon for AI Score explanation */}
          <button
            onClick={() => setShowAttitudeInfo(true)}
            title="Come viene calcolato l'AI Score?"
            className="ml-0.5 w-4 h-4 rounded-full border border-sky-400/50 text-sky-400 hover:bg-sky-400/10 flex items-center justify-center flex-shrink-0"
            style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1 }}
          >
            i
          </button>
        </div>
      </div>

      {/* ── AI Score Info Dialog ─────────────────────────────────────────── */}
      {showAttitudeInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowAttitudeInfo(false)}
        >
          <div
            className="relative bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl w-full max-w-xl mx-8 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div>
                <h2 className="text-base font-bold text-sky-300">Parametro AI Score</h2>
                <p className="text-xs text-gray-400 mt-0.5">Indice qualitativo di prestazione per fondamentale</p>
              </div>
              <button
                onClick={() => setShowAttitudeInfo(false)}
                className="text-gray-400 hover:text-white text-xl font-light leading-none"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5 text-xs text-gray-300">

              {/* Intro */}
              <p className="text-gray-400 leading-relaxed">
                L'<span className="text-sky-300 font-semibold">AI Score</span> misura la <em>capacità di creare valore</em> in ogni fondamentale, distinta dall'Efficacia (netta: eccellenze meno errori) e dall'Efficienza (include i positivi). Per Battuta, Ricezione e Difesa usa percentuali semplici; per l'Attacco usa una formula contestuale pesata che tiene conto di <em>quanto fosse difficile</em> la situazione.
              </p>

              {/* Battuta */}
              <div>
                <h3 className="text-white font-semibold mb-1.5">🏐 Battuta</h3>
                <div className="bg-white/5 rounded-lg px-4 py-2.5 font-mono text-sky-200 text-center text-sm">
                  (B4 + B5) / Totale
                </div>
                <p className="mt-1.5 text-gray-400 leading-relaxed">
                  Percentuale di battute che creano difficoltà reale: <span className="text-white">B4</span> = battuta che mette in difficoltà (ricezione difficile), <span className="text-white">B5</span> = ace. Esclude le battute con ricezione comoda o gli errori diretti.
                </p>
              </div>

              {/* Ricezione e Difesa */}
              <div>
                <h3 className="text-white font-semibold mb-1.5">🛡️ Ricezione &amp; Difesa</h3>
                <div className="bg-white/5 rounded-lg px-4 py-2.5 font-mono text-sky-200 text-center text-sm">
                  (val3 + val4 + val5) / Totale
                </div>
                <p className="mt-1.5 text-gray-400 leading-relaxed">
                  Percentuale di ricezioni/difese <em>attaccabili</em> (almeno bagher che consente un'alzata usabile). Esclude gli errori diretti (val1) e i passaggi inutilizzabili (val2).
                </p>
              </div>

              {/* Attacco — nostra squadra */}
              <div>
                <h3 className="text-white font-semibold mb-2">⚡ Attacco — nostra squadra</h3>
                <p className="text-gray-400 mb-2 leading-relaxed">
                  Formula contestuale derivata dalle <span className="text-white">quartine di rally</span>. Ogni attacco viene classificato in un bucket in base all'azione che lo ha preceduto, poi pesato per difficoltà:
                </p>
                <table className="w-full text-[11px] border-collapse mb-2">
                  <thead>
                    <tr className="text-gray-400 border-b border-white/10">
                      <th className="text-left py-1.5 pr-3">Bucket</th>
                      <th className="text-left py-1.5 pr-3">Azione precedente</th>
                      <th className="text-left py-1.5 pr-3">Contesto</th>
                      <th className="text-right py-1.5">Peso c</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <tr>
                      <td className="py-1.5 pr-3 font-semibold text-orange-300">H — Hard</td>
                      <td className="py-1.5 pr-3">R3 oppure D3</td>
                      <td className="py-1.5 pr-3 text-gray-400">Ricezione/difesa difficile</td>
                      <td className="py-1.5 text-right font-mono text-orange-300">2.0</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-3 font-semibold text-sky-300">E — Easy</td>
                      <td className="py-1.5 pr-3">R4/R5 oppure D4/D5</td>
                      <td className="py-1.5 pr-3 text-gray-400">Ricezione/difesa comoda</td>
                      <td className="py-1.5 text-right font-mono text-sky-300">1.0</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-3 font-semibold text-green-300">F — Freeball</td>
                      <td className="py-1.5 pr-3">B4 oppure A4 avversario</td>
                      <td className="py-1.5 pr-3 text-gray-400">Palla alta regalata</td>
                      <td className="py-1.5 text-right font-mono text-green-300">0.5</td>
                    </tr>
                  </tbody>
                </table>
                <div className="bg-white/5 rounded-lg px-4 py-2.5 font-mono text-sky-200 text-sm text-center">
                  Σ c·(kill − errori) / Σ c·totale
                </div>
                <p className="mt-1.5 text-gray-400 leading-relaxed">
                  Le situazioni difficili (H) pesano il doppio rispetto alle facili (E) e quattro volte le palle alte (F). Il risultato può essere negativo se gli errori superano i punti.
                </p>
              </div>

              {/* Attacco — avversario */}
              <div>
                <h3 className="text-white font-semibold mb-2">🔍 Attacco — avversario <span className="text-gray-400 font-normal text-[10px]">(dedotto dalle nostre azioni)</span></h3>
                <p className="text-gray-400 mb-2 leading-relaxed">
                  Non avendo le quartine avversarie, il contesto e il risultato degli attacchi avversari vengono <span className="text-white">dedotti dal nostro scout</span>:
                </p>
                <table className="w-full text-[11px] border-collapse mb-2">
                  <thead>
                    <tr className="text-gray-400 border-b border-white/10">
                      <th className="text-left py-1.5 pr-3">Nostra azione precedente</th>
                      <th className="text-left py-1.5 pr-3">→ Contesto avversario</th>
                      <th className="text-right py-1.5">Bucket</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <tr>
                      <td className="py-1.5 pr-3">B3 (battuta media)</td>
                      <td className="py-1.5 pr-3 text-gray-400">loro R3 difficile</td>
                      <td className="py-1.5 text-right text-orange-300 font-semibold">H</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-3">B2 (battuta facile)</td>
                      <td className="py-1.5 pr-3 text-gray-400">loro R4/R5 comoda</td>
                      <td className="py-1.5 text-right text-sky-300 font-semibold">E</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-3">A3 (nostro attacco scarso)</td>
                      <td className="py-1.5 pr-3 text-gray-400">loro D3 difficile</td>
                      <td className="py-1.5 text-right text-orange-300 font-semibold">H</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-3">A2 (nostro attacco negativo)</td>
                      <td className="py-1.5 pr-3 text-gray-400">loro D4/D5 comoda</td>
                      <td className="py-1.5 text-right text-sky-300 font-semibold">E</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-3">D2 / R2 (nostra difesa/ric. scarsa)</td>
                      <td className="py-1.5 pr-3 text-gray-400">freeball a loro</td>
                      <td className="py-1.5 text-right text-green-300 font-semibold">F</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-gray-400 leading-relaxed">
                  Il <span className="text-white">risultato</span> dell'attacco avversario si deduce dalla nostra azione successiva: <span className="text-white">D1</span> = loro kill, <span className="text-white">Avv a fine rally</span> = loro errore in attacco. Le azioni B1/B4/B5 e A1/A4/A5 non generano attacco avversario e vengono escluse.
                </p>
              </div>

            </div>{/* end body */}

            {/* Footer */}
            <div className="px-6 py-3 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setShowAttitudeInfo(false)}
                className="text-xs px-4 py-1.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30 hover:bg-sky-500/30"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

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
          selectedMatchMA={selectedMatchMA}
          seasonTeamAvg={seasonTeamAvg}
          latestMatchMA={latestMatchMA}
          lineMode={lineMode}
          forceOpenCommentTick={forceOpenCommentTick}
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

function OpponentSelectedDetailsPanel({ ma, allMatchesVsOpponent = [], onSelectMatch, matchAnalytics = [], selectedOpponent = '', dataMode = 'raw' }) {
  if (!ma) return null;
  const [playerLineMode, setPlayerLineMode] = useState('efficacia');
  // Nota: dataMode non influisce sul grafico giocatrici avversarie (dati sempre grezzi da scout).
  const [selectedPlayerNumber, setSelectedPlayerNumber] = useState('');
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
  const seasonOppAgg = useMemo(() => computeAggregatedScout(matchAnalytics), [matchAnalytics]);
  const selectedOppAgg = useMemo(() => {
    if (!selectedOpponent || selectedOpponent === ALL_OPPONENTS_ID) return seasonOppAgg;
    return computeAggregatedScout((matchAnalytics || []).filter(
      item => (item?.match?.metadata?.opponent || '') === selectedOpponent
    ));
  }, [matchAnalytics, selectedOpponent, seasonOppAgg]);
  const selectedOppName = selectedOpponent === ALL_OPPONENTS_ID || !selectedOpponent
    ? 'Tutte le squadre'
    : selectedOpponent;
  const fundRows = [
    { key: 'serve', label: 'Battuta' },
    { key: 'attack', label: 'Attacco' },
    { key: 'defense', label: 'Difesa' },
    { key: 'reception', label: 'Ricezione' },
    { key: 'block', label: 'Muro' },
  ];
  const getAggValue = (agg, key) => {
    const fund = agg?.[key];
    if (!fund) return null;
    if (playerLineMode === 'attitude') {
      // Use pre-computed opponent attitude from computeAggregatedScout
      return Number.isFinite(fund.attitude) ? roundValue(fund.attitude * 100) : null;
    }
    if (playerLineMode === 'mediaPond') {
      return Number.isFinite(fund.mediaPond) ? roundValue((fund.mediaPond / 5) * 100) : null;
    }
    const metric = playerLineMode === 'efficienza' ? fund.efficiency : fund.efficacy;
    return Number.isFinite(metric) ? roundValue(metric * 100) : null;
  };
  const playerCharts = useMemo(() => (
    (ma?.playerStats || [])
      .filter(p => ['serve', 'attack', 'defense', 'reception', 'block'].some(f => (p?.raw?.[f]?.tot || 0) > 0))
      .map(p => {
        const baseSeries = buildPlayerSeries(matchAnalytics, ma, p.number);
        return {
          player: p,
          data: fundRows.map(({ key, label }) => {
            const row = baseSeries.find(r => r.fund === label) || {};
            // Attitude at player level: falls back to efficacy (per-player rally chain analysis
            // would require filtering quartine by player number — not yet implemented)
            const matchVal = playerLineMode === 'efficienza'
              ? row.matchEfficiency
              : row.matchEfficacy;
            const last3Val = playerLineMode === 'efficienza'
              ? row.avgLast3Efficiency
              : row.avgLast3Efficacy;
            return {
              fund: label,
              oppSel: getAggValue(selectedOppAgg, key),
              oppAll: getAggValue(seasonOppAgg, key),
              playerMatch: matchVal,
              playerLast3: last3Val,
            };
          }),
        };
      })
  ), [ma, matchAnalytics, playerLineMode, selectedOppAgg, seasonOppAgg]);
  const playerOptions = playerCharts.map(item => ({
    number: item.player.number,
    nick: (item.player.name || '').trim().split(/\s+/)[0].slice(0, 10),
    data: item.data,
  }));
  const activePlayerNumber = playerOptions.some(p => p.number === selectedPlayerNumber)
    ? selectedPlayerNumber
    : (playerOptions[0]?.number || '');
  const activePlayerData = playerOptions.find(p => p.number === activePlayerNumber) || null;

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

      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-gray-300">Confronto per Giocatrice</h4>
          <div className="flex items-center gap-1">
            <button onClick={() => setPlayerLineMode('efficacia')} className={`text-[10px] px-2 py-1 rounded border ${playerLineMode === 'efficacia' ? 'bg-sky-500/20 text-sky-300 border-sky-400/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}>Efficacia</button>
            <button onClick={() => setPlayerLineMode('efficienza')} className={`text-[10px] px-2 py-1 rounded border ${playerLineMode === 'efficienza' ? 'bg-sky-500/20 text-sky-300 border-sky-400/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}>Efficienza</button>
            <button onClick={() => setPlayerLineMode('attitude')} className={`text-[10px] px-2 py-1 rounded border ${playerLineMode === 'attitude' ? 'bg-sky-500/20 text-sky-300 border-sky-400/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}>AI Score</button>
            <button onClick={() => setPlayerLineMode('mediaPond')} className={`text-[10px] px-2 py-1 rounded border ${playerLineMode === 'mediaPond' ? 'bg-violet-500/20 text-violet-300 border-violet-400/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}>Media Pond.</button>
          </div>
        </div>
        <div className="glass-card p-3">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {playerOptions.map(p => (
              <button
                key={p.number}
                onClick={() => setSelectedPlayerNumber(p.number)}
                className={`text-[10px] px-2 py-1 rounded-full border transition-all ${
                  p.number === activePlayerNumber
                    ? 'bg-sky-500/20 text-sky-300 border-sky-400/40'
                    : 'bg-white/[0.03] text-gray-400 border-white/10 hover:text-gray-200'
                }`}
              >
                {p.number} {p.nick}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-300 mb-2 font-semibold">
            {activePlayerData ? `${activePlayerData.number} ${activePlayerData.nick}` : 'Nessuna giocatrice'}
          </p>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={activePlayerData?.data || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="fund" tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                formatter={(v, n) => [v === null || v === undefined ? 'N/D' : `${Number(v).toFixed(1)}%`, ({
                  oppSel: `Media ${selectedOppName}`,
                  oppAll: 'Media tutte le squadre',
                  playerMatch: 'Media giocatrice in questa partita',
                  playerLast3: 'Media ultime 3 gare giocatrice',
                }[n] || n)]}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="oppSel" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} name="oppSel" />
              <Line type="monotone" dataKey="oppAll" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} name="oppAll" />
              <Line type="monotone" dataKey="playerMatch" stroke="#f59e0b" strokeWidth={2.2} dot={{ r: 3.2 }} name="playerMatch" />
              <Line type="monotone" dataKey="playerLast3" stroke="#22d3ee" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} name="playerLast3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function generateMatchComment(selectedMatchMA, selectedOppAgg, seasonTeamAvg, activeOpponent) {
  if (!selectedMatchMA || !selectedOppAgg) return null;

  const match = selectedMatchMA.match;
  const team = match?.riepilogo?.team;
  const oppName = match?.metadata?.opponent || 'Avversario';

  if (!team) return null;

  const safeN = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const sections = [];

  // ─── SECTION 1: RISULTATO ─────────────────────────────────────────────────
  const sets = match?.sets || [];
  const setsWon = sets.filter(s => s.won).length;
  const setsLost = sets.filter(s => !s.won).length;
  const won = setsWon > setsLost;
  const setsDetail = sets.map(s => `${s.ourScore}-${s.theirScore}`).join(' / ');
  const resultItems = [];

  resultItems.push({
    text: `${won ? 'Vittoria' : 'Sconfitta'} ${setsWon}-${setsLost} contro ${oppName}${setsDetail ? ` (${setsDetail})` : ''}.`,
    positive: won,
    tooltip: sets.length > 0 ? {
      label: 'Dettaglio set',
      values: sets.map(s => `Set ${s.number}: ${s.ourScore}-${s.theirScore} (${s.won ? 'vinto' : 'perso'})`)
    } : null
  });

  // Competitive sets
  const tightSets = sets.filter(s => Math.abs((s.ourScore || 0) - (s.theirScore || 0)) <= 3);
  if (tightSets.length > 0) {
    resultItems.push({
      text: `Set combattut${tightSets.length === 1 ? 'o' : 'i'}: ${tightSets.map(s => `Set ${s.number} (${s.ourScore}-${s.theirScore})`).join(', ')}.`,
      positive: null,
      tooltip: null
    });
  }

  sections.push({ id: 'result', title: 'Risultato', color: 'indigo', items: resultItems });

  // ─── SECTION 2: ANALISI FONDAMENTALI ─────────────────────────────────────
  const fundDefs = [
    { key: 'attack',    label: 'Attacco',   abbrev: 'A' },
    { key: 'serve',     label: 'Battuta',   abbrev: 'B' },
    { key: 'reception', label: 'Ricezione', abbrev: 'R' },
    { key: 'defense',   label: 'Difesa',    abbrev: 'D' },
  ];

  const fundGaps = [];
  for (const fd of fundDefs) {
    const ourData = team?.[fd.key];
    const oppData = selectedOppAgg?.[fd.key];
    if (!ourData || !oppData) continue;

    const ourEff = Number.isFinite(ourData.efficiency) ? ourData.efficiency * 100 : null;
    const oppEff = Number.isFinite(oppData.efficiency) ? oppData.efficiency * 100 : null;
    const ourEfficacy = Number.isFinite(ourData.efficacy) ? ourData.efficacy * 100 : null;
    const oppEfficacy = Number.isFinite(oppData.efficacy) ? oppData.efficacy * 100 : null;
    const seasonAvg = seasonTeamAvg?.[fd.key];

    if (ourEff !== null && oppEff !== null) {
      const gap = ourEff - oppEff;
      const tooltipVals = [
        `Efficienza Noi: ${ourEff.toFixed(1)}% | Avv.: ${oppEff.toFixed(1)}%`,
        `Differenza: ${gap > 0 ? '+' : ''}${gap.toFixed(1)}%`,
      ];
      if (ourEfficacy !== null && oppEfficacy !== null) {
        tooltipVals.push(`Efficacia Noi: ${ourEfficacy.toFixed(1)}% | Avv.: ${oppEfficacy.toFixed(1)}%`);
      }
      if (seasonAvg?.efficiency !== null && Number.isFinite(seasonAvg?.efficiency)) {
        tooltipVals.push(`Nostra media stagionale: ${Number(seasonAvg.efficiency).toFixed(1)}%`);
      }
      // Add raw counts from our team
      if (ourData.kill !== undefined) {
        tooltipVals.push(`Noi: ${ourData.kill}k / ${ourData.err || 0}e / ${ourData.tot}tot`);
      }
      // Add raw counts from opponent aggregated
      // Defense & Reception use 'val4+5' combined key; Attack & Serve have separate val5/val4
      if (fd.key === 'defense' || fd.key === 'reception') {
        if (oppData['val4+5'] !== undefined) {
          tooltipVals.push(`Avv.: ${oppData['val4+5']}pos / ${oppData.val1}e / ${oppData.total}tot`);
        }
      } else if (oppData.val5 !== undefined) {
        tooltipVals.push(`Avv.: ${oppData.val5}k / ${oppData.val1}e / ${oppData.total}tot`);
      }
      fundGaps.push({ ...fd, ourEff, oppEff, gap, ourEfficacy, oppEfficacy, tooltipVals });
    }
  }

  fundGaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  const fundItems = [];
  for (const fg of fundGaps) {
    let qualifier = '';
    if (Math.abs(fg.gap) >= 15) qualifier = 'netto vantaggio';
    else if (Math.abs(fg.gap) >= 8) qualifier = 'vantaggio significativo';
    else if (Math.abs(fg.gap) >= 3) qualifier = 'lieve vantaggio';
    else qualifier = 'equilibrio';

    let text = '';
    if (fg.gap > 2) {
      text = `${fg.label}: ${qualifier} nostro (+${fg.gap.toFixed(1)}% efficienza) — ${
        fg.key === 'attack' ? 'abbiamo attaccato meglio dell\'avversario' :
        fg.key === 'serve'  ? 'la nostra battuta ha creato più problemi' :
        fg.key === 'reception' ? 'ricezione più solida rispetto all\'avversario' :
        'difesa più efficiente dell\'avversario'
      }.`;
    } else if (fg.gap < -2) {
      qualifier = qualifier.replace('vantaggio', 'svantaggio');
      text = `${fg.label}: ${qualifier} (${fg.gap.toFixed(1)}% efficienza) — ${
        fg.key === 'attack' ? `l'attacco avversario ci ha superati` :
        fg.key === 'serve'  ? `la battuta di ${oppName} più incisiva della nostra` :
        fg.key === 'reception' ? `la ricezione avversaria ha retto meglio della nostra` :
        `la difesa di ${oppName} più solida della nostra`
      }.`;
    } else {
      text = `${fg.label}: sostanziale ${qualifier} tra le due squadre (${fg.gap > 0 ? '+' : ''}${fg.gap.toFixed(1)}%).`;
    }

    fundItems.push({
      text,
      positive: fg.gap > 2 ? true : fg.gap < -2 ? false : null,
      highlight: Math.abs(fg.gap) >= 8,
      tooltip: { label: `${fg.label} — Dati`, values: fg.tooltipVals }
    });
  }

  if (fundItems.length > 0) {
    sections.push({ id: 'fundamentals', title: 'Analisi Fondamentali', color: 'violet', items: fundItems });
  }

  // ─── SECTION 3: ANALISI PER ROTAZIONE ────────────────────────────────────
  const rotItems = [];
  const riepilogoRotations = match?.riepilogo?.rotations || [];
  const giocoData = match?.gioco;

  // Per-rotation points balance from Riepilogo
  if (riepilogoRotations.length > 0) {
    const rotWithBalance = riepilogoRotations
      .map(r => ({
        ...r,
        made: safeN(r.pointsMade?.total),
        lost: safeN(r.pointsLost?.total),
        total: safeN(r.totalPoints?.total),
        balance: safeN(r.pointsMade?.total) - safeN(r.pointsLost?.total),
        ratio: safeN(r.totalPoints?.total) > 0
          ? safeN(r.pointsMade?.total) / safeN(r.totalPoints?.total)
          : 0
      }))
      .filter(r => r.total > 0)
      .sort((a, b) => b.ratio - a.ratio);

    if (rotWithBalance.length >= 2) {
      const best = rotWithBalance[0];
      const worst = rotWithBalance[rotWithBalance.length - 1];

      rotItems.push({
        text: `Rotazione P${best.rotation} più efficace nel gioco (${best.made} punti fatti / ${best.lost} persi, bilancio ${best.balance > 0 ? '+' : ''}${best.balance}).`,
        positive: true,
        tooltip: {
          label: `P${best.rotation} — Punti`,
          values: [
            `Punti fatti: ${best.made} (${(best.ratio * 100).toFixed(0)}%)`,
            `Punti persi: ${best.lost}`,
            `Totale palloni giocati: ${best.total}`,
            `Bilancio: ${best.balance > 0 ? '+' : ''}${best.balance}`,
            best.lineup ? `Formazione: ${best.lineup}` : null,
          ].filter(Boolean)
        }
      });

      rotItems.push({
        text: `Rotazione P${worst.rotation} più critica (${worst.made} punti fatti / ${worst.lost} persi, bilancio ${worst.balance > 0 ? '+' : ''}${worst.balance}).`,
        positive: false,
        tooltip: {
          label: `P${worst.rotation} — Punti`,
          values: [
            `Punti fatti: ${worst.made} (${(worst.ratio * 100).toFixed(0)}%)`,
            `Punti persi: ${worst.lost}`,
            `Totale palloni giocati: ${worst.total}`,
            `Bilancio: ${worst.balance > 0 ? '+' : ''}${worst.balance}`,
            worst.lineup ? `Formazione: ${worst.lineup}` : null,
          ].filter(Boolean)
        }
      });
    }
  }

  // Reception by rotation from Gioco sheet
  if (giocoData?.receptionByRotation?.length > 0) {
    const recByRot = giocoData.receptionByRotation
      .filter(r => safeN(r.total) > 0)
      .map(r => ({
        ...r,
        perfPos: (safeN(r.R5) + safeN(r.R4)),
        perfPosPct: safeN(r.total) > 0 ? (safeN(r.R5) + safeN(r.R4)) / safeN(r.total) * 100 : 0,
        errPct: safeN(r.total) > 0 ? safeN(r.R1) / safeN(r.total) * 100 : 0,
      }))
      .sort((a, b) => b.perfPosPct - a.perfPosPct);

    if (recByRot.length >= 1) {
      const bestRec = recByRot[0];
      const worstRec = recByRot[recByRot.length - 1];

      rotItems.push({
        text: `Ricezione più efficace in ${bestRec.rotation}: ${bestRec.perfPosPct.toFixed(0)}% perf./pos. (${safeN(bestRec.R5)}×R5 + ${safeN(bestRec.R4)}×R4 su ${safeN(bestRec.total)} ric.).`,
        positive: true,
        tooltip: {
          label: `Ricezione ${bestRec.rotation}`,
          values: [
            `R5 (perfetta): ${safeN(bestRec.R5)}`,
            `R4 (positiva): ${safeN(bestRec.R4)}`,
            `R3 (neutra): ${safeN(bestRec.R3)}`,
            `R2 (negativa): ${safeN(bestRec.R2)}`,
            `R1 (errore): ${safeN(bestRec.R1)}`,
            `Totale: ${safeN(bestRec.total)}`,
            `% perf./pos.: ${bestRec.perfPosPct.toFixed(1)}%`,
          ]
        }
      });

      if (recByRot.length >= 2 && worstRec.rotation !== bestRec.rotation) {
        rotItems.push({
          text: `Ricezione più difficoltosa in ${worstRec.rotation}: solo ${worstRec.perfPosPct.toFixed(0)}% perf./pos., ${worstRec.errPct.toFixed(0)}% errori (${safeN(worstRec.R1)} err su ${safeN(worstRec.total)} ric.).`,
          positive: false,
          tooltip: {
            label: `Ricezione ${worstRec.rotation}`,
            values: [
              `R5 (perfetta): ${safeN(worstRec.R5)}`,
              `R4 (positiva): ${safeN(worstRec.R4)}`,
              `R3 (neutra): ${safeN(worstRec.R3)}`,
              `R2 (negativa): ${safeN(worstRec.R2)}`,
              `R1 (errore): ${safeN(worstRec.R1)}`,
              `Totale: ${safeN(worstRec.total)}`,
              `% perf./pos.: ${worstRec.perfPosPct.toFixed(1)}%`,
            ]
          }
        });
      }
    }
  }

  // Serving/receiving rotation matchups from rally data
  const rallies = match?.rallies || [];
  if (rallies.length > 0) {
    const servingByRot = {};
    const receivingByRot = {};

    for (const r of rallies) {
      if (!r.rotation) continue;
      const rotKey = `P${r.rotation}`;
      if (r.phase === 'b') {
        if (!servingByRot[rotKey]) servingByRot[rotKey] = { total: 0, won: 0 };
        servingByRot[rotKey].total++;
        if (r.isPoint) servingByRot[rotKey].won++;
      } else if (r.phase === 'r') {
        if (!receivingByRot[rotKey]) receivingByRot[rotKey] = { total: 0, won: 0 };
        receivingByRot[rotKey].total++;
        if (r.isPoint) receivingByRot[rotKey].won++;
      }
    }

    const servArr = Object.entries(servingByRot)
      .map(([rot, d]) => ({ rot, ...d, pct: d.total > 0 ? d.won / d.total * 100 : 0 }))
      .filter(d => d.total >= 3)
      .sort((a, b) => b.pct - a.pct);

    const recArr = Object.entries(receivingByRot)
      .map(([rot, d]) => ({ rot, ...d, pct: d.total > 0 ? d.won / d.total * 100 : 0 }))
      .filter(d => d.total >= 3)
      .sort((a, b) => b.pct - a.pct);

    if (servArr.length >= 1) {
      const bestServ = servArr[0];
      const worstServ = servArr[servArr.length - 1];

      rotItems.push({
        text: `Incastro favorevole al servizio: nostra rotazione ${bestServ.rot} → ${bestServ.won}/${bestServ.total} punti (${bestServ.pct.toFixed(0)}% break point). La battuta ha messo in difficoltà la ricezione avversaria in questa fase.`,
        positive: true,
        tooltip: {
          label: `Break point — rotazione ${bestServ.rot}`,
          values: [
            `Punti conquistati: ${bestServ.won} / ${bestServ.total}`,
            `% break point: ${bestServ.pct.toFixed(1)}%`,
            `Fase: noi al servizio (BP)`,
            ...servArr.slice(0, 4).map(d => `${d.rot}: ${d.won}/${d.total} (${d.pct.toFixed(0)}%)`),
          ]
        }
      });

      if (servArr.length >= 2 && worstServ.pct < 45 && worstServ.rot !== bestServ.rot) {
        rotItems.push({
          text: `Incastro critico al servizio: nostra rotazione ${worstServ.rot} → solo ${worstServ.won}/${worstServ.total} punti (${worstServ.pct.toFixed(0)}% BP). ${oppName} ha gestito bene la nostra battuta in questa rotazione.`,
          positive: false,
          tooltip: {
            label: `Break point critico — rotazione ${worstServ.rot}`,
            values: [
              `Punti conquistati: ${worstServ.won} / ${worstServ.total}`,
              `% break point: ${worstServ.pct.toFixed(1)}%`,
              `Fase: noi al servizio (BP)`,
            ]
          }
        });
      }
    }

    if (recArr.length >= 1) {
      const bestRec = recArr[0];
      const worstRec = recArr[recArr.length - 1];

      if (bestRec.pct >= 55) {
        rotItems.push({
          text: `Side-out efficace: nostra rotazione in ricezione ${bestRec.rot} → ${bestRec.won}/${bestRec.total} punti (${bestRec.pct.toFixed(0)}%). Buona risposta alla battuta di ${oppName} in questa fase.`,
          positive: true,
          tooltip: {
            label: `Side-out — rotazione ${bestRec.rot}`,
            values: [
              `Punti: ${bestRec.won} / ${bestRec.total}`,
              `% SO: ${bestRec.pct.toFixed(1)}%`,
              `Fase: noi in ricezione (SO)`,
              ...recArr.slice(0, 4).map(d => `${d.rot}: ${d.won}/${d.total} (${d.pct.toFixed(0)}%)`),
            ]
          }
        });
      }

      if (recArr.length >= 2 && worstRec.pct < 45 && worstRec.rot !== bestRec.rot) {
        rotItems.push({
          text: `Side-out difficoltoso: nostra rotazione ${worstRec.rot} in ricezione → solo ${worstRec.won}/${worstRec.total} punti (${worstRec.pct.toFixed(0)}%). La battuta di ${oppName} ha creato problemi in questa rotazione.`,
          positive: false,
          tooltip: {
            label: `Side-out critico — rotazione ${worstRec.rot}`,
            values: [
              `Punti: ${worstRec.won} / ${worstRec.total}`,
              `% SO: ${worstRec.pct.toFixed(1)}%`,
              `Fase: noi in ricezione (SO)`,
            ]
          }
        });
      }
    }

    // ─── NEW: Tactical Role & Attacker Configuration Analysis ───
    const rc = analyzeRotationalChains([match]);
    if (rc.rolePerformance?.B1 && rc.rolePerformance?.B2) {
      const b1 = rc.rolePerformance.B1;
      const b2 = rc.rolePerformance.B2;
      const attGap = (b1.attackEff - b2.attackEff) * 100;
      if (Math.abs(attGap) >= 10) {
        rotItems.push({
          text: `Profilo tattico bande: ${attGap > 0 ? 'B1' : 'B2'} ha dominato in attacco (${Math.round(Math.max(b1.attackEff, b2.attackEff)*100)}% eff.), mentre ${attGap > 0 ? 'B2' : 'B1'} ha garantito equilibrio ${b2.receptionExc > 0.3 ? 'in ricezione' : ''}.`,
          positive: true,
          tooltip: {
             label: 'Confronto B1 vs B2 (Attacco)',
             values: [
               `B1: ${Math.round(b1.attackEff*100)}% eff. / ${b1.totals.attack} att.`,
               `B2: ${Math.round(b2.attackEff*100)}% eff. / ${b2.totals.attack} att.`,
               `Delta: ${attGap > 0 ? '+' : ''}${Math.round(attGap)}% per B1`,
             ]
          }
        });
      }
    }

    const att3 = rc.attackerModes?.['3att']?.sideOut || 0;
    const att2 = rc.attackerModes?.['2att']?.sideOut || 0;
    if (att3 > att2 + 0.15) {
      rotItems.push({
        text: `Configurazione offensiva: Netto vantaggio con 3 attaccanti in prima linea (${Math.round(att3*100)}% SO) rispetto a 2 (${Math.round(att2*100)}%). Sfruttare maggiormente le rotazioni P1/P6/P5.`,
        positive: true,
        tooltip: {
          label: 'Efficacia Side-Out per configurazione',
          values: [
            `3 Attaccanti (P1, P6, P5): ${Math.round(att3*100)}%`,
            `2 Attaccanti (P2, P3, P4): ${Math.round(att2*100)}%`,
          ]
        }
      });
    }
  }

  if (rotItems.length > 0) {
    sections.push({ id: 'rotations', title: 'Incastri di Rotazione', color: 'amber', items: rotItems });
  }

  // ─── SECTION 4: CATENA DEL GIOCO ─────────────────────────────────────────
  const chainItems = [];

  if (giocoData?.attackFromReception) {
    const afr = giocoData.attackFromReception;

    const calcChain = (data) => {
      if (!data || data.length === 0) return null;
      const totalAtt = data.reduce((s, d) => s + safeN(d.attacks), 0);
      if (totalAtt === 0) return null;
      const totalKills = data.reduce((s, d) => {
        const m = String(d.pointsStr || '').match(/(\d+)/);
        return s + (m ? parseInt(m[1]) : 0);
      }, 0);
      return {
        totalAtt, totalKills,
        killPct: totalAtt > 0 ? totalKills / totalAtt * 100 : 0,
        roles: data.filter(d => d.role && d.attacks > 0).map(d => `${d.role}: ${d.attacks} att.`),
      };
    };

    const chainR5 = calcChain(afr.R5);
    const chainR4 = calcChain(afr.R4);
    const chainR3 = calcChain(afr.R3);

    if (chainR5 && chainR5.totalAtt > 0) {
      chainItems.push({
        text: `Da ricezione perfetta (R5): ${chainR5.totalKills} kill su ${chainR5.totalAtt} attacchi → kill rate ${chainR5.killPct.toFixed(0)}%. ${chainR5.killPct >= 40 ? 'Ottima conversione da ottima ricezione.' : chainR5.killPct >= 28 ? 'Conversione nella norma.' : 'Margine di miglioramento nella finalizzazione.'}`,
        positive: chainR5.killPct >= 35,
        tooltip: {
          label: 'Attacco da R5 (ricezione perfetta)',
          values: [
            `Kill: ${chainR5.totalKills} / ${chainR5.totalAtt} attacchi`,
            `Kill rate: ${chainR5.killPct.toFixed(1)}%`,
            ...chainR5.roles,
          ]
        }
      });
    }

    if (chainR4 && chainR4.totalAtt > 0) {
      chainItems.push({
        text: `Da ricezione positiva (R4): ${chainR4.totalKills} kill su ${chainR4.totalAtt} attacchi → kill rate ${chainR4.killPct.toFixed(0)}%.`,
        positive: chainR4.killPct >= 28,
        tooltip: {
          label: 'Attacco da R4 (ricezione positiva)',
          values: [
            `Kill: ${chainR4.totalKills} / ${chainR4.totalAtt} attacchi`,
            `Kill rate: ${chainR4.killPct.toFixed(1)}%`,
            ...chainR4.roles,
          ]
        }
      });
    }

    if (chainR5 && chainR4 && chainR5.totalAtt > 0 && chainR4.totalAtt > 0) {
      const delta = chainR5.killPct - chainR4.killPct;
      if (Math.abs(delta) >= 8) {
        chainItems.push({
          text: `Impatto qualità ricezione sull'attacco: ${Math.abs(delta).toFixed(0)}% di differenza tra R5 e R4 → ${
            delta > 0
              ? 'la qualità della palla di prima influisce sensibilmente sull\'efficacia offensiva'
              : 'l\'attacco mantiene efficienza anche da ricezione non perfetta'
          }.`,
          positive: delta <= 0,
          tooltip: {
            label: 'Delta R5→R4 (attacco)',
            values: [
              `Kill rate da R5: ${chainR5.killPct.toFixed(1)}%`,
              `Kill rate da R4: ${chainR4.killPct.toFixed(1)}%`,
              `Differenza: ${delta > 0 ? '-' : '+'}${Math.abs(delta).toFixed(1)}% da R4`,
            ]
          }
        });
      }
    }

    if (chainR3 && chainR3.totalAtt > 0) {
      chainItems.push({
        text: `Da ricezione neutra (R3): ${chainR3.totalKills} kill su ${chainR3.totalAtt} attacchi (${chainR3.killPct.toFixed(0)}%). ${chainR3.killPct < 20 ? 'Elevata difficoltà nella costruzione da ricezione neutra.' : 'Buona gestione anche in condizioni di ricezione imperfetta.'}`,
        positive: chainR3.killPct >= 20,
        tooltip: {
          label: 'Attacco da R3 (ricezione neutra)',
          values: [
            `Kill: ${chainR3.totalKills} / ${chainR3.totalAtt} attacchi`,
            `Kill rate: ${chainR3.killPct.toFixed(1)}%`,
            ...chainR3.roles,
          ]
        }
      });
    }
  }

  // Side-out vs break-point overall from rallies
  if (rallies.length > 0) {
    const soRallies = rallies.filter(r => r.phase === 'r');
    const bpRallies = rallies.filter(r => r.phase === 'b');
    const soWon = soRallies.filter(r => r.isPoint).length;
    const bpWon = bpRallies.filter(r => r.isPoint).length;
    const soPct = soRallies.length > 0 ? soWon / soRallies.length * 100 : null;
    const bpPct = bpRallies.length > 0 ? bpWon / bpRallies.length * 100 : null;

    if (soPct !== null && bpPct !== null && soRallies.length >= 5 && bpRallies.length >= 5) {
      const soBetter = soPct > bpPct;
      chainItems.push({
        text: `Fase dominante: ${soBetter ? 'side-out in ricezione' : 'break point al servizio'} (${Math.max(soPct, bpPct).toFixed(0)}% punti vinti). La fase ${soBetter ? 'al servizio' : 'in ricezione'} è risultata più critica (${Math.min(soPct, bpPct).toFixed(0)}%).`,
        positive: null,
        tooltip: {
          label: 'Side-out vs Break-point',
          values: [
            `Side-out (in ric.): ${soWon}/${soRallies.length} = ${soPct.toFixed(1)}%`,
            `Break-point (al serv.): ${bpWon}/${bpRallies.length} = ${bpPct.toFixed(1)}%`,
            `Fase dominante: ${soBetter ? 'SO' : 'BP'}`,
          ]
        }
      });
    }
  }

  if (chainItems.length > 0) {
    sections.push({ id: 'chain', title: 'Catena del Gioco', color: 'emerald', items: chainItems });
  }

  // ─── SECTION 5: SINTESI PER L'ALLENATORE ─────────────────────────────────
  const synthItems = [];

  // Decisive fundamental
  if (fundGaps.length > 0) {
    const decisive = fundGaps[0];
    if (Math.abs(decisive.gap) >= 4) {
      const isOurAdv = decisive.gap > 0;
      synthItems.push({
        text: `Fondamentale chiave: ${decisive.label}${isOurAdv
          ? `. La nostra superiorità in ${decisive.label.toLowerCase()} (+${decisive.gap.toFixed(1)}% eff.) è stata un fattore determinante ${won ? 'per la vittoria' : 'che ha limitato il passivo'}.`
          : `. Lo svantaggio in ${decisive.label.toLowerCase()} (${decisive.gap.toFixed(1)}%) ha penalizzato il rendimento globale.`
        }`,
        positive: isOurAdv === won,
        tooltip: {
          label: `${decisive.label} — confronto`,
          values: decisive.tooltipVals
        }
      });
    }
  }

  // Phase decisive
  if (rallies.length >= 10) {
    const soRallies = rallies.filter(r => r.phase === 'r');
    const bpRallies = rallies.filter(r => r.phase === 'b');
    const soPct = soRallies.length > 0 ? soRallies.filter(r => r.isPoint).length / soRallies.length * 100 : null;
    const bpPct = bpRallies.length > 0 ? bpRallies.filter(r => r.isPoint).length / bpRallies.length * 100 : null;

    if (soPct !== null && bpPct !== null) {
      const delta = Math.abs(soPct - bpPct);
      if (delta >= 8) {
        const weakPhase = soPct < bpPct ? 'side-out' : 'break-point';
        const weakPct = Math.min(soPct, bpPct);
        synthItems.push({
          text: `Fase critica: ${weakPhase} (${weakPct.toFixed(0)}% punti). ${
            weakPhase === 'side-out'
              ? `Difficoltà nel costruire il punto dopo la ricezione: lavorare su qualità ricezione e attacco in fast-break.`
              : `Difficoltà nel pressare con la battuta e gestire l'attacco avversario dopo il servizio.`
          }`,
          positive: false,
          tooltip: {
            label: 'Analisi di fase',
            values: [
              `Side-out %: ${soPct.toFixed(1)}%`,
              `Break-point %: ${bpPct.toFixed(1)}%`,
              `Fase critica: ${weakPhase}`,
            ]
          }
        });
      }
    }
  }

  // Compare with season average
  if (seasonTeamAvg && fundGaps.length > 0) {
    const belowAvg = fundGaps.filter(fg => {
      const avg = seasonTeamAvg?.[fg.key]?.efficiency;
      return Number.isFinite(avg) && fg.ourEff < avg - 5;
    });
    if (belowAvg.length > 0) {
      synthItems.push({
        text: `Sotto la media stagionale in: ${belowAvg.map(fg => {
          const avg = seasonTeamAvg[fg.key].efficiency;
          return `${fg.label} (${fg.ourEff.toFixed(0)}% vs media ${Number(avg).toFixed(0)}%)`;
        }).join(', ')}.`,
        positive: false,
        tooltip: {
          label: 'Confronto con media stagionale',
          values: belowAvg.map(fg => `${fg.label}: partita ${fg.ourEff.toFixed(1)}% / media ${Number(seasonTeamAvg[fg.key].efficiency).toFixed(1)}%`)
        }
      });
    }
  }

  if (synthItems.length > 0) {
    sections.push({ id: 'synthesis', title: "Sintesi — Chiave di Lettura", color: 'rose', items: synthItems });
  }

  return sections.length > 0 ? sections : null;
}

function OpponentScoutComparisonChart({
  seasonAgg,
  selectedOppAgg,
  selectedMatchMA,
  seasonTeamAvg,
  latestMatchMA,
  opponents,
  activeOpponent,
  onSelectOpponent,
  lineMode = 'efficacia',
  forceOpenCommentTick = 0,
}) {
  const [showNoi, setShowNoi] = useState(true);
  const [showNoiMedi, setShowNoiMedi] = useState(false);
  const [showNoiOra, setShowNoiOra] = useState(false);
  const [showCommento, setShowCommento] = useState(false);
  useEffect(() => {
    if (!forceOpenCommentTick) return;
    if (!selectedMatchMA) return;
    setShowCommento(true);
  }, [forceOpenCommentTick, selectedMatchMA]);
  const metricKey = lineMode === 'efficienza' ? 'efficiency' : 'efficacy';
  const selectedOppName = activeOpponent === ALL_OPPONENTS_ID ? 'Tutte le squadre' : activeOpponent;

  // For opponent lines: read pre-computed attitude/mediaPond or standard metric
  const getFundMetric = (fundData) => {
    if (!fundData) return null;
    if (lineMode === 'attitude') {
      return Number.isFinite(fundData.attitude) ? roundValue(fundData.attitude * 100) : null;
    }
    if (lineMode === 'mediaPond') {
      // mediaPond stored on 1–5 scale; normalize to 0–100 for chart parity
      return Number.isFinite(fundData.mediaPond) ? roundValue((fundData.mediaPond / 5) * 100) : null;
    }
    return Number.isFinite(fundData[metricKey]) ? roundValue(fundData[metricKey] * 100) : null;
  };

  // For "Noi medi" line: season average (includes attitude/mediaPond from computeTeamFundAverages)
  const getTeamAvgMetric = (teamData) => {
    if (!teamData) return null;
    if (lineMode === 'attitude') {
      return Number.isFinite(teamData.attitude) ? teamData.attitude : null;
    }
    if (lineMode === 'mediaPond') {
      // Already stored as 0–100 normalized in computeTeamFundAverages
      return Number.isFinite(teamData.mediaPond) ? teamData.mediaPond : null;
    }
    return lineMode === 'efficienza' ? teamData.efficiency : teamData.efficacy;
  };

  // For "Noi" and "Noi ora" lines: compute from match data
  const getTeamMatchMetric = (ma, key) => {
    if (!ma) return null;
    if (lineMode === 'attitude') {
      const att = computeAttitude(ma?.match);
      if (!att) return null;
      const v = att[key];
      return Number.isFinite(v) ? roundValue(v * 100) : null;
    }
    if (lineMode === 'mediaPond') {
      return getMatchTeamValue(ma, key, 'mediaPond');
    }
    return getMatchTeamValue(ma, key, metricKey);
  };

  const chartData = useMemo(() => (
    [
      {
        fund: 'Battuta',
        oppSel: getFundMetric(selectedOppAgg?.serve),
        oppAll: getFundMetric(seasonAgg?.serve),
        noi: getTeamMatchMetric(selectedMatchMA, 'serve'),
        noiMedi: getTeamAvgMetric(seasonTeamAvg?.serve),
        noiOra: getTeamMatchMetric(latestMatchMA, 'serve'),
      },
      {
        fund: 'Attacco',
        oppSel: getFundMetric(selectedOppAgg?.attack),
        oppAll: getFundMetric(seasonAgg?.attack),
        noi: getTeamMatchMetric(selectedMatchMA, 'attack'),
        noiMedi: getTeamAvgMetric(seasonTeamAvg?.attack),
        noiOra: getTeamMatchMetric(latestMatchMA, 'attack'),
      },
      {
        fund: 'Difesa',
        oppSel: getFundMetric(selectedOppAgg?.defense),
        oppAll: getFundMetric(seasonAgg?.defense),
        noi: getTeamMatchMetric(selectedMatchMA, 'defense'),
        noiMedi: getTeamAvgMetric(seasonTeamAvg?.defense),
        noiOra: getTeamMatchMetric(latestMatchMA, 'defense'),
      },
      {
        fund: 'Ricezione',
        oppSel: getFundMetric(selectedOppAgg?.reception),
        oppAll: getFundMetric(seasonAgg?.reception),
        noi: getTeamMatchMetric(selectedMatchMA, 'reception'),
        noiMedi: getTeamAvgMetric(seasonTeamAvg?.reception),
        noiOra: getTeamMatchMetric(latestMatchMA, 'reception'),
      },
      {
        fund: 'Muro',
        oppSel: getFundMetric(selectedOppAgg?.block),
        oppAll: getFundMetric(seasonAgg?.block),
        noi: getTeamMatchMetric(selectedMatchMA, 'block'),
        noiMedi: getTeamAvgMetric(seasonTeamAvg?.block),
        noiOra: getTeamMatchMetric(latestMatchMA, 'block'),
      },
    ]
  ), [selectedOppAgg, seasonAgg, lineMode, selectedMatchMA, seasonTeamAvg, latestMatchMA]);
  if (!chartData.length) return null;

  const modeTitle = {
    efficacia:  'Confronto squadre (efficacia)',
    efficienza: 'Confronto squadre (efficienza)',
    attitude:   'Confronto squadre (AI Score)',
    mediaPond:  'Confronto squadre (media ponderata)',
  }[lineMode] || 'Confronto squadre';

  return (
    <>
    <div className="glass-card p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
          {modeTitle}
        </h4>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1 bg-slate-900/60 border border-white/10 rounded-md p-1">
          <button
            onClick={() => setShowNoi(v => !v)}
            className={`text-[9px] px-2 py-1 rounded border ${showNoi ? 'bg-amber-500/20 text-amber-300 border-amber-400/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}
          >
            Noi
          </button>
          <button
            onClick={() => setShowNoiMedi(v => !v)}
            className={`text-[9px] px-2 py-1 rounded border ${showNoiMedi ? 'bg-sky-500/20 text-sky-300 border-sky-400/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}
          >
            Noi medi
          </button>
          <button
            onClick={() => setShowNoiOra(v => !v)}
            className={`text-[9px] px-2 py-1 rounded border ${showNoiOra ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' : 'bg-white/[0.03] text-gray-400 border-white/10'}`}
          >
            Noi ora
          </button>
        </div>
      <div className="relative">
      <button
        onClick={() => setShowCommento(true)}
        className={`absolute top-2 right-2 z-10 text-[9px] px-2 py-1 rounded border ${showCommento ? 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40' : 'bg-slate-900/70 text-gray-300 border-white/10 hover:text-white'}`}
      >
        Commento
      </button>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="fund" tick={{ fill: '#9ca3af', fontSize: 10 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
            formatter={(v, n) => [v === null || v === undefined ? 'N/D' : `${Number(v).toFixed(1)}%`, ({
              oppSel: `Media ${selectedOppName}`,
              oppAll: 'Media tutte le squadre',
              noi: 'Noi',
              noiMedi: 'Noi medi',
              noiOra: 'Noi ora',
            }[n] || n)]}
          />
          <Legend
            verticalAlign="top"
            align="left"
            height={36}
            wrapperStyle={{ fontSize: 10 }}
            formatter={(v) => ({
              oppSel: `Media ${selectedOppName}`,
              oppAll: 'Media tutte le squadre',
              noi: 'Noi',
              noiMedi: 'Noi medi',
              noiOra: 'Noi ora',
            }[v] || v)}
          />
          <Line type="monotone" dataKey="oppSel" stroke="#a855f7" strokeWidth={2.2} dot={{ r: 3.2, fill: '#a855f7' }} activeDot={{ r: 4.5 }} name="oppSel" />
          <Line type="monotone" dataKey="oppAll" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: '#94a3b8' }} activeDot={{ r: 4.5 }} name="oppAll" />
          {showNoi && (
            <Line type="monotone" dataKey="noi" stroke="#f59e0b" strokeWidth={2.1} dot={{ r: 3.1, fill: '#f59e0b' }} activeDot={{ r: 4.2 }} name="noi" />
          )}
          {showNoiMedi && (
            <Line type="monotone" dataKey="noiMedi" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: '#38bdf8' }} activeDot={{ r: 4.2 }} name="noiMedi" />
          )}
          {showNoiOra && (
            <Line type="monotone" dataKey="noiOra" stroke="#34d399" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3, fill: '#34d399' }} activeDot={{ r: 4.2 }} name="noiOra" />
          )}
        </LineChart>
      </ResponsiveContainer>
      </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <button
          onClick={() => onSelectOpponent(ALL_OPPONENTS_ID)}
          className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
            activeOpponent === ALL_OPPONENTS_ID
              ? 'bg-violet-500/20 text-violet-300 border-violet-400/40'
              : 'bg-white/[0.03] text-gray-400 border-white/10 hover:text-gray-200'
          }`}
        >
          Tutte le squadre
        </button>
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
    {showCommento && selectedMatchMA && (
      <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-2 sm:p-6 overflow-y-auto">
        <button
          onClick={() => setShowCommento(false)}
          className="absolute inset-0 bg-black/70"
          aria-label="Chiudi dialog commento"
        />
        <div className="relative mt-14 sm:mt-0 w-full max-w-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[85vh] overflow-y-auto rounded-xl border border-indigo-500/25 bg-slate-950/95 backdrop-blur-sm shadow-2xl">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-slate-900/90">
            <h5 className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">Analisi Partita</h5>
            <button
              onClick={() => setShowCommento(false)}
              className="text-[11px] px-2 py-1 rounded border bg-white/[0.03] text-gray-300 border-white/10 hover:text-white"
            >
              Chiudi
            </button>
          </div>
          <div className="p-4">
            <CommentoPanel
              selectedMatchMA={selectedMatchMA}
              selectedOppAgg={selectedOppAgg}
              seasonTeamAvg={seasonTeamAvg}
              activeOpponent={activeOpponent}
            />
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function InfoTooltip({ label, values }) {
  return (
    <span className="relative group inline-flex items-center align-middle">
      <span className="text-sky-400 cursor-help ml-1 text-[10px] font-bold leading-none">ⓘ</span>
      <span className="hidden group-hover:block absolute z-50 bottom-full left-0 mb-1.5 min-w-[190px] max-w-[260px] bg-slate-900 border border-white/20 rounded-lg p-2.5 text-[10px] shadow-2xl pointer-events-none">
        {label && <span className="block font-semibold text-white mb-1.5 border-b border-white/10 pb-1">{label}</span>}
        {(values || []).map((v, i) => (
          <span key={i} className="block text-gray-400 leading-relaxed">{v}</span>
        ))}
      </span>
    </span>
  );
}

function CommentoPanel({ selectedMatchMA, selectedOppAgg, seasonTeamAvg, activeOpponent }) {
  const sections = generateMatchComment(selectedMatchMA, selectedOppAgg, seasonTeamAvg, activeOpponent);

  if (!sections) {
    return <p className="text-xs text-gray-400 italic">Dati insufficienti per generare un'analisi completa.</p>;
  }

  const colorMap = {
    indigo:  { title: 'text-indigo-300',  border: 'border-indigo-500/20',  bg: 'bg-indigo-500/5'  },
    violet:  { title: 'text-violet-300',  border: 'border-violet-500/20',  bg: 'bg-violet-500/5'  },
    amber:   { title: 'text-amber-300',   border: 'border-amber-500/20',   bg: 'bg-amber-500/5'   },
    emerald: { title: 'text-emerald-300', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
    rose:    { title: 'text-rose-300',    border: 'border-rose-500/20',    bg: 'bg-rose-500/5'    },
  };

  return (
    <div className="space-y-2.5">
      {sections.map((section) => {
        const c = colorMap[section.color] || colorMap.indigo;
        return (
          <div key={section.id} className={`rounded-lg border ${c.border} ${c.bg} p-2.5`}>
            <h6 className={`text-[9px] font-bold uppercase tracking-widest ${c.title} mb-2`}>
              {section.title}
            </h6>
            <div className="space-y-1.5">
              {section.items.map((item, idx) => (
                <p key={idx} className={`text-[11px] leading-relaxed ${
                  item.positive === true  ? 'text-gray-200' :
                  item.positive === false ? 'text-gray-400' :
                  'text-gray-300'
                } ${item.highlight ? 'font-medium' : ''}`}>
                  {item.positive === true  && <span className="text-emerald-400 mr-1 text-[10px]">▲</span>}
                  {item.positive === false && <span className="text-rose-400 mr-1 text-[10px]">▼</span>}
                  {item.text}
                  {item.tooltip && (
                    <InfoTooltip label={item.tooltip.label} values={item.tooltip.values} />
                  )}
                </p>
              ))}
            </div>
          </div>
        );
      })}
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
