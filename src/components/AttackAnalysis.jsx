import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const ATTACK_QUALITY = ['A5', 'A4', 'A3', 'A2', 'A1'];
const ATTACK_COL_LABELS = {
  A5: 'A5 Punto', A4: 'A4 Freeball', A3: 'A3 Bagher↑', A2: 'A2 Pall↑', A1: 'A1 Errore',
};
const ATTACK_COL_COLORS = {
  A5: '#a3e635', A4: '#166534', A3: '#facc15', A2: '#f97316', A1: '#ef4444',
};
const RD_KEYS = ['R5', 'R4', 'R3', 'D5', 'D4', 'D3'];
const RD_LABELS = {
  R5: 'Ric. 5', R4: 'Ric. 4', R3: 'Ric. 3',
  D5: 'Dif. 5', D4: 'Dif. 4', D3: 'Dif. 3',
};
const TREND_TOUCH_OPTIONS = [
  { id: 'R5', label: 'R5' },
  { id: 'R4', label: 'R4' },
  { id: 'R3', label: 'R3' },
  { id: 'D5', label: 'D5' },
  { id: 'D4', label: 'D4' },
  { id: 'D3', label: 'D3' },
  { id: 'AGG3', label: '3' },
  { id: 'AGG4', label: '4' },
  { id: 'AGG5', label: '5' },
];

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
  for (const key of RD_KEYS) {
    const tracked = ATTACK_QUALITY.reduce((s, aq) => s + result[key][aq], 0);
    result[key].other = Math.max(0, result[key].total - tracked);
  }
  return result;
}

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
          if (ATTACK_QUALITY.includes(aq)) players[pNum][key][aq]++; else players[pNum][key].other++;
        } else {
          players[pNum][key].other++;
        }
      }
    }
  }
  return players;
}

function pct(num, den) {
  if (!den || den === 0) return null;
  return (num / den * 100);
}

function mergeRdaRows(rows = []) {
  return rows.reduce((acc, row) => ({
    total: (acc.total || 0) + (row?.total || 0),
    A1: (acc.A1 || 0) + (row?.A1 || 0),
    A2: (acc.A2 || 0) + (row?.A2 || 0),
    A3: (acc.A3 || 0) + (row?.A3 || 0),
    A4: (acc.A4 || 0) + (row?.A4 || 0),
    A5: (acc.A5 || 0) + (row?.A5 || 0),
    other: (acc.other || 0) + (row?.other || 0),
  }), { total: 0, A1: 0, A2: 0, A3: 0, A4: 0, A5: 0, other: 0 });
}

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

export default function AttackAnalysis({ analytics, matches, allPlayers }) {
  const [convPlayerFilter, setConvPlayerFilter] = useState(null);
  const [trendTouchKey, setTrendTouchKey] = useState('R5');
  const [hoveredSeriesKey, setHoveredSeriesKey] = useState('');

  if (!analytics || matches.length === 0) {
    return (
      <div className="max-w-6xl mx-auto">
        <h2 className="text-xl font-bold text-white mb-2">Analisi Attacco</h2>
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-sm">
          <div className="text-4xl mb-3">⚔</div>
          <p>Carica partite per analizzare la conversione in attacco.</p>
        </div>
      </div>
    );
  }

  const sortedSources = useMemo(() => (
    [...(analytics.matchAnalytics || [])]
      .sort((a, b) => (a.match.metadata?.date || '').localeCompare(b.match.metadata?.date || ''))
  ), [analytics]);

  const rdaTeamData = useMemo(() => computeRdaTable(sortedSources), [sortedSources]);
  const rdaPlayerData = useMemo(() => computeRdaByPlayer(sortedSources), [sortedSources]);

  const convPlayers = useMemo(() => {
    const normalizeNum = (v) => String(v || '').replace(/^0+/, '') || '0';
    return Object.keys(rdaPlayerData)
      .map(rawKey => {
        const normalized = normalizeNum(rawKey);
        const p = (allPlayers || []).find(pl => normalizeNum(pl.number) === normalized);
        const nick = (p?.nickname || '').trim();
        const surname = (p?.surname || p?.name || '').trim();
        return {
          key: rawKey,
          sortNum: Number(normalized) || 0,
          label: nick
            ? `#${rawKey} ${nick}`
            : surname
              ? `#${rawKey} ${surname}`
              : `#${rawKey}`,
        };
      })
      .sort((a, b) => a.sortNum - b.sortNum);
  }, [rdaPlayerData, allPlayers]);

  const activeRdaData = (convPlayerFilter !== null && rdaPlayerData[convPlayerFilter])
    ? rdaPlayerData[convPlayerFilter]
    : rdaTeamData;

  const trendData = useMemo(() => (
    sortedSources.map((ma, idx) => {
      const labelBase = (ma.match.metadata?.opponent || `Match ${idx + 1}`).substring(0, 12);
      const date = ma.match.metadata?.date || '';
      const pointLabel = date ? `${labelBase} · ${date}` : labelBase;
      let sourceData = computeRdaTable([ma]);
      if (convPlayerFilter !== null) {
        const perPlayer = computeRdaByPlayer([ma]);
        sourceData = perPlayer[convPlayerFilter] || {};
      }
      let row = sourceData[trendTouchKey] || {};
      if (trendTouchKey === 'AGG3') row = mergeRdaRows([sourceData.R3, sourceData.D3]);
      if (trendTouchKey === 'AGG4') row = mergeRdaRows([sourceData.R4, sourceData.D4]);
      if (trendTouchKey === 'AGG5') row = mergeRdaRows([sourceData.R5, sourceData.D5]);
      const total = row.total || 0;
      const values = {};
      for (const aq of ATTACK_QUALITY) {
        const p = pct(row[aq] || 0, total);
        values[aq] = p !== null ? +p.toFixed(1) : null;
      }
      return {
        label: pointLabel,
        total,
        ...values,
      };
    })
  ), [sortedSources, convPlayerFilter, trendTouchKey]);

  const trendSeries = ATTACK_QUALITY.filter(aq => trendData.some(d => d[aq] !== null));

  const renderTrendTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const rows = payload.filter(item => item?.value !== null && item?.value !== undefined);
    if (!rows.length) return null;
    const total = rows[0]?.payload?.total || 0;
    const highlighted = hoveredSeriesKey || rows[0]?.dataKey || '';
    return (
      <div className="rounded-lg border border-white/10 bg-slate-900/95 p-3 text-[11px]">
        <div className="text-white font-semibold mb-1">{label}</div>
        <div className="space-y-1">
          {rows.map((item) => {
            const key = item.dataKey;
            const isActive = key === highlighted;
            return (
              <div
                key={key}
                className={`rounded px-1.5 py-1 ${
                  isActive ? 'bg-white/10 ring-1 ring-white/20' : ''
                }`}
              >
                <span style={{ color: ATTACK_COL_COLORS[key] }} className="font-semibold">
                  {ATTACK_COL_LABELS[key]}
                </span>
                <span className="text-gray-300"> · tot {total} : </span>
                <span style={{ color: ATTACK_COL_COLORS[key] }} className="font-semibold">
                  {Number(item.value).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Analisi Attacco</h2>
        <p className="text-sm text-gray-400">
          Conversione da ricezione/difesa ad attacco efficace e andamento nel tempo.
        </p>
      </div>

      <div className="glass-card p-5">
        <div className="flex items-start justify-between mb-1 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-300">
              Conversione Ricezione/Difesa → Attacco
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Qualità dell'attacco successivo a un tocco di ricezione o difesa di buona qualità (3–5).
            </p>
          </div>
        </div>

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
              key={p.key}
              onClick={() => setConvPlayerFilter(convPlayerFilter === p.key ? null : p.key)}
              className={`px-2.5 py-1 rounded text-[10px] transition-all ${
                convPlayerFilter === p.key
                  ? 'bg-sky-500/20 text-sky-400 font-medium'
                  : 'bg-white/[0.03] text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

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

              <tr className="border-b border-white/[0.05]">
                <td colSpan={8} className="py-1" />
              </tr>

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
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-300">Andamento Dinamico Conversione</h3>
            <p className="text-[10px] text-gray-500">Trend per partita dei valori A5/A4/A3/A2/A1.</p>
          </div>
          <div className="flex gap-1 flex-wrap">
            {TREND_TOUCH_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setTrendTouchKey(opt.id)}
                className={`px-2 py-1 rounded text-[10px] transition-all ${
                  trendTouchKey === opt.id
                    ? 'bg-amber-500/20 text-amber-400 font-medium'
                    : 'bg-white/[0.03] text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData} onMouseLeave={() => setHoveredSeriesKey('')}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} interval="preserveStartEnd" minTickGap={30} />
            <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={renderTrendTooltip} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => ATTACK_COL_LABELS[v]} />
            {trendSeries.map(aq => (
              <Line
                key={aq}
                type="monotone"
                dataKey={aq}
                stroke={ATTACK_COL_COLORS[aq]}
                strokeWidth={hoveredSeriesKey === aq ? 2.8 : 2}
                onMouseEnter={() => setHoveredSeriesKey(aq)}
                dot={(props) => {
                  const { cx, cy, value } = props;
                  if (value === null || value === undefined) return null;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={hoveredSeriesKey === aq ? 4 : 2.5}
                      fill={ATTACK_COL_COLORS[aq]}
                      stroke="rgba(255,255,255,0.8)"
                      strokeWidth={hoveredSeriesKey === aq ? 1.4 : 0.8}
                      onMouseEnter={() => setHoveredSeriesKey(aq)}
                      onTouchStart={() => setHoveredSeriesKey(aq)}
                    />
                  );
                }}
                activeDot={{
                  r: 5,
                  onMouseEnter: () => setHoveredSeriesKey(aq),
                  onTouchStart: () => setHoveredSeriesKey(aq),
                }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
