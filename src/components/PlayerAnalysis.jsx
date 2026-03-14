// ============================================================================
// PLAYER ANALYSIS — Analisi individuale per giocatrice
// Storico, Rotazioni, Fasi, Suggerimenti
// ============================================================================
import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, ReferenceLine,
} from 'recharts';
import { ROLE_CORE_FUNDAMENTALS } from '../utils/constants';

// ─── Shared config ────────────────────────────────────────────────────────────
const FUND_CONFIG = {
  attack:    { key: 'a', label: 'Attacco',   color: '#f43f5e' },
  serve:     { key: 'b', label: 'Battuta',   color: '#8b5cf6' },
  reception: { key: 'r', label: 'Ricezione', color: '#0ea5e9' },
  defense:   { key: 'd', label: 'Difesa',    color: '#10b981' },
  block:     { key: 'm', label: 'Muro',      color: '#f59e0b' },
};

const FUND_FROM_KEY = { a: 'attack', b: 'serve', r: 'reception', d: 'defense', m: 'block' };

function trendArrow(trend) {
  if (trend === 'up')   return { icon: '↑', color: '#a3e635' };
  if (trend === 'down') return { icon: '↓', color: '#fb7185' };
  return { icon: '→', color: '#94a3b8' };
}

function fmtEff(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
}

const TOOLTIP_STYLE = {
  background: '#111827',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: 11,
};

// ─── Player selector grid ─────────────────────────────────────────────────────
function PlayerGrid({ players, selected, onSelect }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {players.map(p => {
        const active = selected?.number === p.number;
        return (
          <button
            key={p.number}
            onClick={() => onSelect(p)}
            className={`rounded-lg p-2 text-left transition-all border ${
              active
                ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:bg-white/10'
            }`}
          >
            <div className="text-[10px] text-gray-500 mb-0.5">#{p.number}</div>
            <div className="font-semibold text-xs leading-tight truncate">{p.name || 'N/A'}</div>
            {p.role && (
              <div className="text-[10px] mt-0.5" style={{ color: active ? '#fbbf24' : '#6b7280' }}>
                {ROLE_CORE_FUNDAMENTALS[p.role]?.label || p.role}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Storico tab ─────────────────────────────────────────────────────────────
function StoricoTab({ playerTrend, roleCode }) {
  const roleFunds = ROLE_CORE_FUNDAMENTALS[roleCode] || {
    core: ['attack', 'serve', 'reception', 'defense', 'block'],
    secondary: [],
    excluded: [],
  };
  const fundsToShow = [...roleFunds.core, ...roleFunds.secondary];

  if (!playerTrend?.trends) {
    return (
      <p className="text-gray-500 text-sm text-center py-10">
        Nessun dato storico disponibile.
      </p>
    );
  }

  const shown = fundsToShow.filter(f => {
    const t = playerTrend.trends[f];
    return t && t.playedMatches > 0;
  });

  if (!shown.length) {
    return (
      <p className="text-gray-500 text-sm text-center py-10">
        Nessun fondamentale con dati sufficienti.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {shown.map(fund => {
        const cfg = FUND_CONFIG[fund];
        if (!cfg) return null;
        const t = playerTrend.trends[fund];

        const chartData = t.matchLabels.map((m, i) => ({
          match: (m.opponent || '').split(' ').slice(-1)[0] || `G${i + 1}`,
          raw: Number.isFinite(t.raw[i]) ? +(t.raw[i] * 100).toFixed(1) : null,
          weighted: Number.isFinite(t.weighted[i]) ? +(t.weighted[i] * 100).toFixed(1) : null,
          rolling: t.rollingRaw[i] != null ? +(t.rollingRaw[i] * 100).toFixed(1) : null,
        }));

        const trend = trendArrow(t.rawTrend);

        return (
          <div key={fund} className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
              <span className="font-semibold text-sm text-white">{cfg.label}</span>
              <span className="text-sm font-bold" style={{ color: trend.color }}>{trend.icon}</span>
              <span className="text-[10px] text-gray-400 ml-auto flex gap-3">
                <span>⌀ Raw <span className="text-sky-400">{fmtEff(t.rawAvg)}</span></span>
                <span>⌀ Pesato <span className="text-amber-400">{fmtEff(t.weightedAvg)}</span></span>
              </span>
            </div>

            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={chartData} margin={{ top: 2, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="match" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} unit="%" />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`${v}%`, n]} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                <Line
                  type="monotone" dataKey="raw" stroke="#38bdf8" strokeWidth={1.5}
                  dot={{ r: 2, fill: '#38bdf8' }} name="Raw" connectNulls
                />
                <Line
                  type="monotone" dataKey="weighted" stroke="#f59e0b" strokeWidth={1.5}
                  dot={{ r: 2, fill: '#f59e0b' }} name="Pesato" connectNulls
                />
                {chartData.some(d => d.rolling != null) && (
                  <Line
                    type="monotone" dataKey="rolling" stroke="#a3e635" strokeWidth={1}
                    dot={false} strokeDasharray="4 2" name="Media Mobile" connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>

            <div className="text-[10px] text-gray-600 mt-1.5">
              {t.playedMatches} partite con dati su {t.totalMatches} totali
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Rotazioni tab ────────────────────────────────────────────────────────────
function RotazioniTab({ matches, playerNumber, roleCode }) {
  const { data, fundsToShow } = useMemo(() => {
    const rotMap = {};

    for (const m of matches) {
      for (const rally of m.rallies || []) {
        const rot = rally.rotation;
        if (!rot || rot < 1 || rot > 6) continue;
        if (!rotMap[rot]) rotMap[rot] = {};

        for (const token of rally.quartine || []) {
          if (token.type !== 'action') continue;
          if (String(token.player) !== String(playerNumber)) continue;
          const fund = FUND_FROM_KEY[token.fundamental];
          if (!fund) continue;
          if (!rotMap[rot][fund]) rotMap[rot][fund] = { sum: 0, count: 0 };
          rotMap[rot][fund].sum += token.value || 0;
          rotMap[rot][fund].count += 1;
        }
      }
    }

    const rows = Object.entries(rotMap)
      .sort(([a], [b]) => +a - +b)
      .map(([rot, fundMap]) => {
        const row = { rotation: `Rot ${rot}` };
        for (const [fund, { sum, count }] of Object.entries(fundMap)) {
          row[fund] = count > 0 ? +(sum / count).toFixed(2) : null;
        }
        return row;
      });

    const roleCfg = ROLE_CORE_FUNDAMENTALS[roleCode] || { core: [], secondary: [] };
    const toShow = [...(roleCfg.core || []), ...(roleCfg.secondary || [])].filter(f =>
      rows.some(r => r[f] != null)
    );

    return { data: rows, fundsToShow: toShow };
  }, [matches, playerNumber, roleCode]);

  if (!data.length) {
    return <p className="text-gray-500 text-sm text-center py-10">Nessun dato per rotazione.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">Media valore fondamentale per rotazione (scala 1–5)</p>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="rotation" tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis domain={[0, 5]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
          {fundsToShow.map(fund => (
            <Bar
              key={fund}
              dataKey={fund}
              name={FUND_CONFIG[fund]?.label || fund}
              fill={FUND_CONFIG[fund]?.color || '#94a3b8'}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/10">
              <th className="text-left py-1 pr-2">Rot</th>
              {fundsToShow.map(f => (
                <th key={f} className="py-1 px-1 text-center" style={{ color: FUND_CONFIG[f]?.color }}>
                  {FUND_CONFIG[f]?.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.rotation} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-1.5 pr-2 font-medium text-gray-300">{row.rotation}</td>
                {fundsToShow.map(f => (
                  <td key={f} className="py-1.5 px-1 text-center text-gray-200">
                    {row[f] != null ? row[f].toFixed(2) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Fasi tab (side-out vs break-point) ──────────────────────────────────────
function FasiTab({ matches, playerNumber, roleCode }) {
  const data = useMemo(() => {
    const phases = { r: {}, b: {} };

    for (const m of matches) {
      for (const rally of m.rallies || []) {
        const phase = rally.phase;
        if (phase !== 'r' && phase !== 'b') continue;

        for (const token of rally.quartine || []) {
          if (token.type !== 'action') continue;
          if (String(token.player) !== String(playerNumber)) continue;
          const fund = FUND_FROM_KEY[token.fundamental];
          if (!fund) continue;
          if (!phases[phase][fund]) phases[phase][fund] = { sum: 0, count: 0 };
          phases[phase][fund].sum += token.value || 0;
          phases[phase][fund].count += 1;
        }
      }
    }

    const roleCfg = ROLE_CORE_FUNDAMENTALS[roleCode] || { core: [], secondary: [] };
    const fundsToShow = [...(roleCfg.core || []), ...(roleCfg.secondary || [])];

    return fundsToShow
      .map(fund => {
        const so = phases.r[fund];
        const bp = phases.b[fund];
        return {
          fund,
          label: FUND_CONFIG[fund]?.label || fund,
          color: FUND_CONFIG[fund]?.color || '#94a3b8',
          sideOut:    so ? +(so.sum / so.count).toFixed(2) : null,
          breakPt:    bp ? +(bp.sum / bp.count).toFixed(2) : null,
          sideOutN:   so?.count || 0,
          breakPtN:   bp?.count || 0,
        };
      })
      .filter(d => d.sideOut != null || d.breakPt != null);
  }, [matches, playerNumber, roleCode]);

  if (!data.length) {
    return <p className="text-gray-500 text-sm text-center py-10">Nessun dato per fase di gioco.</p>;
  }

  const chartData = data.map(d => ({
    name: d.label,
    'Side-out': d.sideOut,
    'Break-point': d.breakPt,
  }));

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">Media valore fondamentale per fase (scala 1–5)</p>

      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis domain={[0, 5]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="Side-out"    fill="#0ea5e9" radius={[2, 2, 0, 0]} />
          <Bar dataKey="Break-point" fill="#f59e0b" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      <div className="space-y-2">
        {data.map(d => {
          const delta = d.sideOut != null && d.breakPt != null ? d.breakPt - d.sideOut : null;
          return (
            <div key={d.fund} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <span className="font-medium text-xs text-white w-16 flex-shrink-0">{d.label}</span>
              <div className="flex gap-3 text-xs flex-1">
                <span>
                  <span className="text-gray-500">Side: </span>
                  <span className="text-sky-400">{d.sideOut?.toFixed(2) ?? '—'}</span>
                  <span className="text-gray-600 text-[10px] ml-0.5">({d.sideOutN})</span>
                </span>
                <span>
                  <span className="text-gray-500">Break: </span>
                  <span className="text-amber-400">{d.breakPt?.toFixed(2) ?? '—'}</span>
                  <span className="text-gray-600 text-[10px] ml-0.5">({d.breakPtN})</span>
                </span>
              </div>
              {delta != null && (
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: delta > 0 ? '#a3e635' : delta < 0 ? '#fb7185' : '#94a3b8' }}
                >
                  {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(delta).toFixed(2)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Suggerimenti tab ─────────────────────────────────────────────────────────
function SuggerimentiTab({ suggestions }) {
  if (!suggestions?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <p className="text-3xl">✅</p>
        <p className="text-sm text-gray-400">Nessuna priorità di allenamento rilevata.</p>
      </div>
    );
  }

  const SEV = {
    high:   { bg: 'bg-red-500/15',   border: 'border-red-500/30',   badge: '#ef4444', text: 'Alta'  },
    medium: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', badge: '#f59e0b', text: 'Media' },
    low:    { bg: 'bg-sky-500/15',   border: 'border-sky-500/30',   badge: '#0ea5e9', text: 'Bassa' },
  };

  const sorted = [...suggestions].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  return (
    <div className="space-y-3">
      {sorted.map((s, i) => {
        const sc = SEV[s.severity] || SEV.low;
        const fundCfg = Object.values(FUND_CONFIG).find(f => f.key === s.fundamental);
        return (
          <div key={i} className={`rounded-xl p-3 border ${sc.bg} ${sc.border}`}>
            <div className="flex items-center gap-2 mb-1.5">
              {fundCfg && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: fundCfg.color }} />
              )}
              <span className="text-xs font-semibold text-white">{fundCfg?.label || s.fundamental}</span>
              <span
                className="ml-auto text-[10px] px-1.5 py-0.5 rounded text-white font-semibold"
                style={{ background: sc.badge }}
              >
                {sc.text}
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{s.message}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sub-tab bar ──────────────────────────────────────────────────────────────
const PLAYER_TABS = [
  { id: 'storico',      label: 'Storico',   icon: '📈' },
  { id: 'rotazioni',    label: 'Rotazioni', icon: '🔄' },
  { id: 'fasi',         label: 'Fasi',      icon: '⚡' },
  { id: 'suggerimenti', label: 'Consigli',  icon: '💡' },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function PlayerAnalysis({ analytics, matches = [], roster = [] }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [activeTab, setActiveTab] = useState('storico');

  // Build player list from playerTrends + roster
  const players = useMemo(() => {
    const trends = analytics?.playerTrends || {};
    const rosterMap = {};
    for (const p of roster) {
      if (p.number) rosterMap[String(p.number)] = p;
    }

    return Object.values(trends)
      .map(pt => {
        const rp = rosterMap[String(pt.number)];
        return {
          number: pt.number,
          name:   pt.name || rp?.name || `#${pt.number}`,
          role:   rp?.role || null,
        };
      })
      .sort((a, b) => +a.number - +b.number);
  }, [analytics, roster]);

  const playerTrend = selectedPlayer
    ? analytics?.playerTrends?.[selectedPlayer.number]
    : null;

  const playerSuggestions = useMemo(() => {
    if (!selectedPlayer || !analytics?.trainingSuggestions) return [];
    return analytics.trainingSuggestions.filter(
      s => String(s.playerNumber) === String(selectedPlayer.number)
    );
  }, [selectedPlayer, analytics]);

  if (!players.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 select-none">
        <p className="text-3xl opacity-20">★</p>
        <p className="text-sm text-gray-600 italic">Nessun dato player disponibile</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Player grid */}
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
          Seleziona giocatrice
        </p>
        <PlayerGrid
          players={players}
          selected={selectedPlayer}
          onSelect={p => {
            setSelectedPlayer(p);
            setActiveTab('storico');
          }}
        />
      </div>

      {/* Detail panel */}
      {selectedPlayer && (
        <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <span className="text-amber-400 font-bold text-sm">#{selectedPlayer.number}</span>
            <span className="font-semibold text-white text-sm">{selectedPlayer.name}</span>
            {selectedPlayer.role && (
              <span className="text-xs text-gray-400">
                · {ROLE_CORE_FUNDAMENTALS[selectedPlayer.role]?.label || selectedPlayer.role}
              </span>
            )}
            <span className="text-[10px] text-gray-500 ml-auto">
              {(() => {
                const trends = playerTrend?.trends;
                if (!trends) return '—';
                const first = Object.values(trends)[0];
                return first ? `${first.totalMatches} partite` : '—';
              })()}
            </span>
          </div>

          {/* Sub-tab nav */}
          <div className="flex border-b border-white/10">
            {PLAYER_TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2 text-[11px] flex flex-col items-center gap-0.5 transition-colors relative
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
          <div className="p-4">
            {activeTab === 'storico' && (
              <StoricoTab playerTrend={playerTrend} roleCode={selectedPlayer.role} />
            )}
            {activeTab === 'rotazioni' && (
              <RotazioniTab
                matches={matches}
                playerNumber={selectedPlayer.number}
                roleCode={selectedPlayer.role}
              />
            )}
            {activeTab === 'fasi' && (
              <FasiTab
                matches={matches}
                playerNumber={selectedPlayer.number}
                roleCode={selectedPlayer.role}
              />
            )}
            {activeTab === 'suggerimenti' && (
              <SuggerimentiTab suggestions={playerSuggestions} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
