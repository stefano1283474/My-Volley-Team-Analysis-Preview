// ============================================================================
// TEAM ANALYSIS — Analisi squadra (GEAS Volley)
// Storico, Rotazioni, Fasi, Fondamentali
// ============================================================================
import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';

// ─── Shared config ────────────────────────────────────────────────────────────
const FUND_CONFIG = {
  attack:    { key: 'a', label: 'Attacco',   color: '#f43f5e' },
  serve:     { key: 'b', label: 'Battuta',   color: '#8b5cf6' },
  reception: { key: 'r', label: 'Ricezione', color: '#0ea5e9' },
  defense:   { key: 'd', label: 'Difesa',    color: '#10b981' },
  block:     { key: 'm', label: 'Muro',      color: '#f59e0b' },
};

const FUND_FROM_KEY = { a: 'attack', b: 'serve', r: 'reception', d: 'defense', m: 'block' };

const TOOLTIP_STYLE = {
  background: '#111827',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: 11,
};

function shortOpp(name) {
  if (!name) return '?';
  const parts = name.split(' ');
  return parts[parts.length - 1];
}

function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
}

// ─── Compute efficacy from raw counts (same formula as MatchReport.getMatchTeamValue)
// attack/serve/block: kill/tot  |  reception/defense: (kill+pos)/tot
// Using raw counts avoids relying on Excel's pre-computed cell values (which use a
// different signed formula) and keeps the metric consistent across pages.
function calcEfficacy(data, isPassFund) {
  if (!data) return null;
  const tot = data.tot || 0;
  if (tot <= 0) return null;
  const num = isPassFund
    ? (data.kill || 0) + (data.pos || 0)   // reception / defense
    : (data.kill || 0);                     // attack / serve / block
  const v = num / tot;
  return Number.isFinite(v) ? +(v * 100).toFixed(1) : null;
}

// ─── Storico tab ─────────────────────────────────────────────────────────────
function TeamStoricoTab({ matches }) {
  const chartData = useMemo(() => {
    return matches
      .filter(m => m.riepilogo?.team)
      .map((m, i) => {
        const t = m.riepilogo.team;
        const opp = shortOpp(m.metadata?.opponent) || `G${i + 1}`;
        return {
          match:     opp,
          attack:    calcEfficacy(t.attack,    false),
          serve:     calcEfficacy(t.serve,     false),
          reception: calcEfficacy(t.reception, true),
          defense:   calcEfficacy(t.defense,   true),
          block:     calcEfficacy(t.block,     false),
        };
      });
  }, [matches]);

  if (!chartData.length) {
    return <p className="text-gray-500 text-sm text-center py-10">Nessun dato storico.</p>;
  }

  // Season averages
  const avgs = {};
  for (const fund of Object.keys(FUND_CONFIG)) {
    const vals = chartData.map(d => d[fund]).filter(v => v != null);
    avgs[fund] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-400">Efficacia fondamentali per partita (%)</p>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="match" tick={{ fontSize: 9, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} unit="%" />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, n) => [v != null ? `${v}%` : '—', n]}
          />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
          {Object.entries(FUND_CONFIG).map(([fund, cfg]) => (
            <Line
              key={fund}
              type="monotone"
              dataKey={fund}
              name={cfg.label}
              stroke={cfg.color}
              strokeWidth={1.5}
              dot={{ r: 2, fill: cfg.color }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Season summary cards */}
      <div className="grid grid-cols-5 gap-2">
        {Object.entries(FUND_CONFIG).map(([fund, cfg]) => {
          const avg = avgs[fund];
          return (
            <div key={fund} className="bg-white/5 rounded-xl p-2.5 border border-white/10 text-center">
              <div className="text-[10px] text-gray-500 mb-1">{cfg.label}</div>
              <div
                className="text-sm font-bold"
                style={{ color: avg != null ? cfg.color : '#4b5563' }}
              >
                {avg != null ? (avg >= 0 ? '+' : '') + avg.toFixed(1) + '%' : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Rotazioni tab ────────────────────────────────────────────────────────────
function TeamRotazioniTab({ matches }) {
  const data = useMemo(() => {
    const rotMap = {};

    for (const m of matches) {
      for (const rot of m.riepilogo?.rotations || []) {
        const r = rot.rotation;
        if (!r) continue;
        if (!rotMap[r]) rotMap[r] = { pointsMade: 0, pointsLost: 0, totalPoints: 0 };
        rotMap[r].pointsMade   += rot.pointsMade   || 0;
        rotMap[r].pointsLost   += rot.pointsLost   || 0;
        rotMap[r].totalPoints  += rot.totalPoints  || 0;
      }
    }

    return Object.entries(rotMap)
      .sort(([a], [b]) => +a - +b)
      .map(([rot, d]) => ({
        rotation: `Rot ${rot}`,
        fatti:    d.pointsMade,
        subiti:   d.pointsLost,
        diff:     d.pointsMade - d.pointsLost,
        eff:      d.totalPoints > 0
          ? +((d.pointsMade / d.totalPoints) * 100).toFixed(1)
          : 0,
      }));
  }, [matches]);

  if (!data.length) {
    return <p className="text-gray-500 text-sm text-center py-10">Nessun dato rotazioni.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">Punti per rotazione — stagione cumulata</p>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="rotation" tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="fatti"  name="Punti Fatti"  fill="#a3e635" radius={[2, 2, 0, 0]} />
          <Bar dataKey="subiti" name="Punti Subiti" fill="#fb7185" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Efficacy bar */}
      <div className="space-y-1.5">
        {data.map(row => (
          <div key={row.rotation} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-12 flex-shrink-0">{row.rotation}</span>
            <div className="flex-1 bg-white/5 rounded-full h-4 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0, row.eff))}%`,
                  background: row.eff >= 55 ? '#a3e635' : row.eff >= 45 ? '#f59e0b' : '#fb7185',
                }}
              />
            </div>
            <span
              className="text-xs font-semibold w-10 text-right"
              style={{ color: row.eff >= 55 ? '#a3e635' : row.eff >= 45 ? '#f59e0b' : '#fb7185' }}
            >
              {row.eff}%
            </span>
            <span className="text-[10px] text-gray-500 w-12 text-right">
              {row.diff >= 0 ? '+' : ''}{row.diff}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Fasi tab ─────────────────────────────────────────────────────────────────
function TeamFasiTab({ matches }) {
  const { phases, fundPhase, chartData } = useMemo(() => {
    const phases = { r: { pts: 0, tot: 0 }, b: { pts: 0, tot: 0 } };
    const fundPhase = {};
    for (const fund of Object.keys(FUND_CONFIG)) {
      fundPhase[fund] = { r: { sum: 0, n: 0 }, b: { sum: 0, n: 0 } };
    }

    for (const m of matches) {
      for (const rally of m.rallies || []) {
        const ph = rally.phase;
        if (ph !== 'r' && ph !== 'b') continue;

        phases[ph].tot += 1;
        if (rally.isPoint) phases[ph].pts += 1;

        for (const token of rally.quartine || []) {
          if (token.type !== 'action') continue;
          const fund = FUND_FROM_KEY[token.fundamental];
          if (!fund) continue;
          fundPhase[fund][ph].sum += token.value || 0;
          fundPhase[fund][ph].n   += 1;
        }
      }
    }

    const chartData = Object.entries(fundPhase).map(([fund, data]) => ({
      fund: FUND_CONFIG[fund]?.label || fund,
      color: FUND_CONFIG[fund]?.color,
      'Side-out':    data.r.n > 0 ? +(data.r.sum / data.r.n).toFixed(2) : null,
      'Break-point': data.b.n > 0 ? +(data.b.sum / data.b.n).toFixed(2) : null,
      soN: data.r.n,
      bpN: data.b.n,
    }));

    return { phases, fundPhase, chartData };
  }, [matches]);

  const soRate = phases.r.tot > 0 ? (phases.r.pts / phases.r.tot * 100).toFixed(1) : null;
  const bpRate = phases.b.tot > 0 ? (phases.b.pts / phases.b.tot * 100).toFixed(1) : null;

  const visible = chartData.filter(d => d['Side-out'] != null || d['Break-point'] != null);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3 border border-sky-500/30 bg-sky-500/10 text-center">
          <div className="text-xs text-gray-400 mb-1">🏐 Side-out</div>
          <div className="text-2xl font-bold text-sky-400">
            {soRate != null ? `${soRate}%` : '—'}
          </div>
          <div className="text-[10px] text-gray-500">
            {phases.r.pts}/{phases.r.tot} rally
          </div>
        </div>
        <div className="rounded-xl p-3 border border-amber-500/30 bg-amber-500/10 text-center">
          <div className="text-xs text-gray-400 mb-1">⚡ Break-point</div>
          <div className="text-2xl font-bold text-amber-400">
            {bpRate != null ? `${bpRate}%` : '—'}
          </div>
          <div className="text-[10px] text-gray-500">
            {phases.b.pts}/{phases.b.tot} rally
          </div>
        </div>
      </div>

      {visible.length > 0 && (
        <>
          <p className="text-xs text-gray-400">Media fondamentale per fase (scala 1–5)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={visible} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="fund" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Side-out"    fill="#0ea5e9" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Break-point" fill="#f59e0b" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="space-y-1.5">
            {visible.map(d => {
              const delta = d['Side-out'] != null && d['Break-point'] != null
                ? d['Break-point'] - d['Side-out'] : null;
              return (
                <div key={d.fund} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-white font-medium w-16">{d.fund}</span>
                  <span className="text-gray-500">Side:</span>
                  <span className="text-sky-400">{d['Side-out']?.toFixed(2) ?? '—'}</span>
                  <span className="text-gray-600 text-[10px]">({d.soN})</span>
                  <span className="text-gray-500 ml-1">Break:</span>
                  <span className="text-amber-400">{d['Break-point']?.toFixed(2) ?? '—'}</span>
                  <span className="text-gray-600 text-[10px]">({d.bpN})</span>
                  {delta != null && (
                    <span
                      className="ml-auto font-semibold text-[10px]"
                      style={{ color: delta > 0.1 ? '#a3e635' : delta < -0.1 ? '#fb7185' : '#94a3b8' }}
                    >
                      {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(delta).toFixed(2)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Fondamentali tab ─────────────────────────────────────────────────────────
const PASS_FUNDS = new Set(['reception', 'defense']);

function TeamFondamentaliTab({ matches }) {
  const data = useMemo(() => {
    // Accumulate raw counts per fundamental across all matches
    const acc = {};
    for (const fund of Object.keys(FUND_CONFIG)) {
      acc[fund] = { kill: 0, pos: 0, err: 0, tot: 0, count: 0 };
    }

    for (const m of matches) {
      const t = m.riepilogo?.team;
      if (!t) continue;
      const map = {
        attack: t.attack, serve: t.serve,
        reception: t.reception, defense: t.defense, block: t.block,
      };
      for (const [fund, stats] of Object.entries(map)) {
        if (!stats || !(stats.tot > 0)) continue;
        acc[fund].kill  += stats.kill  || 0;
        acc[fund].pos   += stats.pos   || 0;
        acc[fund].err   += stats.err   || 0;
        acc[fund].tot   += stats.tot   || 0;
        acc[fund].count += 1;
      }
    }

    // Compute efficacy from raw cumulative counts (same formula as MatchReport)
    return Object.entries(acc).map(([fund, d]) => {
      const isPass = PASS_FUNDS.has(fund);
      let efficacy = null, efficiency = null;
      if (d.tot > 0) {
        const num = isPass ? (d.kill + d.pos) : d.kill;
        efficacy   = num / d.tot;
        efficiency = (num - d.err) / d.tot;
      }
      return {
        fund,
        label:      FUND_CONFIG[fund]?.label,
        color:      FUND_CONFIG[fund]?.color,
        efficacy,
        efficiency,
        matches:    d.count,
      };
    });
  }, [matches]);

  const radarData = data
    .filter(d => d.efficacy != null)
    .map(d => ({
      subject:   d.label,
      Efficacia: +(d.efficacy * 100).toFixed(1),
    }));

  return (
    <div className="space-y-5">
      {radarData.length >= 3 && (
        <div>
          <p className="text-xs text-gray-400 mb-2">Profilo fondamentali — stagione</p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                tick={{ fontSize: 7, fill: '#4b5563' }}
              />
              <Radar
                name="Efficacia %"
                dataKey="Efficacia"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.18}
                strokeWidth={1.5}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={v => [`${v}%`, 'Efficacia']}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="space-y-2">
        {data.map(d => (
          <div
            key={d.fund}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10"
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className="font-medium text-sm text-white w-20 flex-shrink-0">{d.label}</span>

            {/* Efficacy bar — efficacy = kill(+pos)/tot ∈ [0,1], efficiency = (kill+pos−err)/tot ∈ [-1,1] */}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                  {d.efficacy != null && (
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, d.efficacy * 100))}%`,
                        background: d.efficacy >= 0.4 ? '#a3e635' : d.efficacy >= 0.25 ? '#f59e0b' : '#fb7185',
                      }}
                    />
                  )}
                </div>
                <span
                  className="text-xs font-semibold w-14 text-right"
                  style={{
                    color: d.efficacy != null
                      ? (d.efficacy >= 0.4 ? '#a3e635' : d.efficacy >= 0.25 ? '#f59e0b' : '#fb7185')
                      : '#4b5563',
                  }}
                >
                  {d.efficacy != null ? (d.efficacy * 100).toFixed(1) + '%' : '—'}
                </span>
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Effic. {d.efficiency != null
                  ? (d.efficiency >= 0 ? '+' : '') + (d.efficiency * 100).toFixed(1) + '%'
                  : '—'}
                {' · '}
                {d.matches} gare
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-tab bar ──────────────────────────────────────────────────────────────
const TEAM_TABS = [
  { id: 'storico',      label: 'Storico',      icon: '📈' },
  { id: 'rotazioni',    label: 'Rotazioni',    icon: '🔄' },
  { id: 'fasi',         label: 'Fasi',         icon: '⚡' },
  { id: 'fondamentali', label: 'Fondamentali', icon: '🎯' },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function TeamAnalysis({ matches = [] }) {
  const [activeTab, setActiveTab] = useState('storico');

  const validMatches = useMemo(
    () => matches.filter(m => m.riepilogo),
    [matches]
  );

  if (!validMatches.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 select-none">
        <p className="text-3xl opacity-20">🛡</p>
        <p className="text-sm text-gray-600 italic">Nessun dato squadra disponibile</p>
      </div>
    );
  }

  // Season win/loss from sets
  const record = useMemo(() => {
    let w = 0, l = 0;
    for (const m of validMatches) {
      const sets = m.sets || [];
      // Field is `theirScore` (not `opponentScore`) — see dataParser.js line 184
      const ourSets = sets.filter(s => (s.ourScore || 0) > (s.theirScore || 0)).length;
      const oppSets = sets.length - ourSets;
      if (ourSets > oppSets) w++; else l++;
    }
    return { w, l };
  }, [validMatches]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white/5 rounded-xl px-4 py-3 border border-white/10 flex items-center gap-3">
        <span className="text-amber-400 text-xl">🛡</span>
        <div>
          <div className="text-sm font-semibold text-white">GEAS Volley ASD</div>
          <div className="text-xs text-gray-400">
            {validMatches.length} partite · {record.w}V–{record.l}S
          </div>
        </div>
      </div>

      {/* Sub-tab nav */}
      <div className="flex rounded-xl border border-white/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {TEAM_TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-[11px] flex flex-col items-center gap-0.5 transition-colors relative
                ${active ? 'text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-amber-400 rounded-t" />
              )}
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div>
        {activeTab === 'storico'      && <TeamStoricoTab      matches={validMatches} />}
        {activeTab === 'rotazioni'    && <TeamRotazioniTab    matches={validMatches} />}
        {activeTab === 'fasi'         && <TeamFasiTab         matches={validMatches} />}
        {activeTab === 'fondamentali' && <TeamFondamentaliTab matches={validMatches} />}
      </div>
    </div>
  );
}
