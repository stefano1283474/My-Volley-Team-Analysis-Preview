import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ReferenceLine } from 'recharts';
import { COLORS } from '../utils/constants';
import {
  getPositionsFromRotation,
  identifyRolesPerSet,
  analyzeRotationalChains,
  getRotationMeta,
  trackOpponentRotations,
  computeMatchupMatrix,
  computeRotationDetailedStats,
  computeSetFlow,
  computeRoleComparison,
  computePhaseRotationStats,
} from '../utils/analyticsEngine';

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLE_COLORS = {
  P: '#60a5fa', B1: '#f59e0b', B2: '#fbbf24', O: '#f97316', C1: '#34d399', C2: '#6ee7b7',
};
const ROLE_LABELS = {
  P: 'Palleggiatrice', B1: 'Banda 1', B2: 'Banda 2', O: 'Opposto', C1: 'Centrale 1', C2: 'Centrale 2',
};
const ROLE_DESCRIPTIONS = {
  B1: 'Attaccante principale da posto 4. Punto di riferimento offensivo, riceve, difende. Generalmente la più alta tra le bande, con maggiore potenza in attacco.',
  B2: 'Specialista ricezione-attacco. Miglior ricevitrice della squadra dopo il libero. Gioca in diagonale col palleggiatore, priorità alla fase di ricezione e alla continuità.',
  C1: 'Centrale primario. Attacco di primo tempo, muro centrale. Generalmente più alta e con maggiore varietà di attacco rapido.',
  C2: 'Centrale secondario. Primo tempo veloce, muro. Spesso più rapida e mobile, usata per variazioni tattiche.',
  O: 'Terminale offensivo. Attacca da posto 2 (e da seconda linea). Massimo volume di attacchi, non riceve.',
};

// ─── Micro components ─────────────────────────────────────────────────────────
function StatBox({ label, value, sub, color = 'text-amber-400', small = false }) {
  return (
    <div className="bg-white/[0.03] rounded-lg p-2.5 border border-white/5">
      <div className="text-[8px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`${small ? 'text-sm' : 'text-lg'} font-mono font-black ${color}`}>{value}</div>
      {sub && <div className="text-[8px] text-gray-600">{sub}</div>}
    </div>
  );
}

function QualityBar({ dist, total, label, colorScale }) {
  if (total === 0) return <div className="text-[9px] text-gray-600 italic">{label}: nessun dato</div>;
  const colors = colorScale || { 5: '#22c55e', 4: '#84cc16', 3: '#eab308', 2: '#f97316', 1: '#ef4444' };
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[9px] text-gray-400 font-medium uppercase">{label}</span>
        <span className="text-[9px] text-gray-500 font-mono">{total} azioni</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
        {[5, 4, 3, 2, 1].map(v => {
          const pct = (dist[v] || 0) / total * 100;
          if (pct === 0) return null;
          return <div key={v} style={{ width: `${pct}%`, backgroundColor: colors[v] }} title={`Val ${v}: ${dist[v]} (${pct.toFixed(0)}%)`} />;
        })}
      </div>
      <div className="flex justify-between text-[7px] text-gray-600">
        <span>5: {dist[5]||0}</span><span>4: {dist[4]||0}</span><span>3: {dist[3]||0}</span><span>2: {dist[2]||0}</span><span>1: {dist[1]||0}</span>
      </div>
    </div>
  );
}

function RotBadge({ rot, isActive, onClick, soPct, bpPct, phase }) {
  const meta = getRotationMeta(rot);
  const pct = phase === 'r' ? soPct : bpPct;
  return (
    <button
      onClick={() => onClick(rot)}
      className={`rounded-xl border p-2 flex flex-col items-center justify-between transition-all ${
        isActive
          ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-inner shadow-amber-500/10'
          : 'bg-white/5 border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300'
      }`}
    >
      <span className="text-xs font-black">P{rot}</span>
      <div className={`text-[8px] px-1.5 py-0.5 rounded-full ${meta.mode === '3att' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
        {meta.attackerCount} att
      </div>
      <div className="text-center mt-1">
        <div className={`text-[11px] font-mono font-bold ${isActive ? 'text-amber-300' : 'text-gray-500'}`}>
          {pct != null ? `${pct.toFixed(0)}%` : '-'}
        </div>
        <div className="text-[7px] opacity-40 uppercase">{phase === 'r' ? 'SO' : 'BP'}</div>
      </div>
    </button>
  );
}

// ─── Tactical Board (enhanced) ────────────────────────────────────────────────
function TacticalBoard({ rotation, lineup, phase, roles, compact = false }) {
  const positions = useMemo(() => getPositionsFromRotation(rotation, lineup, phase), [rotation, lineup, phase]);
  const meta = getRotationMeta(rotation);

  const getRoleBadge = (posNum) => {
    const pNum = positions[posNum];
    return roles ? (roles[pNum] || pNum || '') : (pNum || '');
  };

  const isFrontRow = (posNum) => [2, 3, 4].includes(posNum);
  const size = compact ? 200 : 300;
  const scale = compact ? 0.67 : 1;

  const coords = {
    1: { x: 160, y: 240 }, 6: { x: 100, y: 240 }, 5: { x: 40, y: 240 },
    2: { x: 160, y: 150 }, 3: { x: 100, y: 150 }, 4: { x: 40, y: 150 },
  };

  return (
    <div className={`relative ${compact ? 'w-full max-w-[250px]' : 'w-full max-w-[400px]'} mx-auto aspect-[2/3] bg-slate-900/50 rounded-xl border border-white/10 overflow-hidden`}>
      <svg viewBox="0 0 200 300" className="w-full h-full">
        <rect x="20" y="20" width="160" height="260" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
        <line x1="20" y1="100" x2="180" y2="100" stroke="rgba(255,255,255,0.4)" strokeWidth="3" />
        <line x1="20" y1="180" x2="180" y2="180" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 4" />
        <text x="100" y="95" textAnchor="middle" className="fill-gray-600 text-[8px] uppercase">Rete</text>
        <text x="100" y="175" textAnchor="middle" className="fill-gray-700 text-[6px]">Linea 3m</text>

        {/* Attack zone labels */}
        {!compact && meta.attackZones && Object.entries(meta.attackZones).map(([pos, role]) => (
          <text key={pos} x={pos === '4' ? 40 : pos === '3' ? 100 : 160} y={130} textAnchor="middle"
            className="fill-amber-500/40 text-[7px] font-bold">
            Z{pos}→{role}
          </text>
        ))}

        {Object.entries(coords).map(([posNum, c]) => {
          const num = parseInt(posNum);
          const role = getRoleBadge(num);
          const isFront = isFrontRow(num);
          const pNum = positions[num];
          const roleColor = ROLE_COLORS[role] || (isFront ? '#f59e0b' : '#3b82f6');

          return (
            <g key={posNum}>
              <circle cx={c.x} cy={c.y} r={compact ? 14 : 18}
                fill={isFront ? `${roleColor}22` : 'rgba(59,130,246,0.1)'}
                stroke={isFront ? roleColor : '#3b82f6'} strokeWidth="1.5" />
              <text x={c.x} y={c.y - (compact ? 2 : 4)} textAnchor="middle"
                className={`fill-white font-bold ${compact ? 'text-[8px]' : 'text-[10px]'}`}>{role}</text>
              <text x={c.x} y={c.y + (compact ? 6 : 8)} textAnchor="middle"
                className={`fill-gray-400 ${compact ? 'text-[6px]' : 'text-[8px]'}`}>#{pNum}</text>
              {!compact && (
                <text x={c.x + 15} y={c.y - 12} textAnchor="middle"
                  className="fill-gray-500 text-[7px] font-mono">{posNum}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-full border border-white/10">
        <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">P{rotation}</span>
        <span className={`ml-1.5 text-[8px] font-bold ${meta.mode === '3att' ? 'text-green-400' : 'text-blue-400'}`}>
          {meta.attackerCount} att
        </span>
      </div>
      <div className="absolute bottom-2 right-2 text-[8px] text-gray-500 uppercase tracking-widest font-medium">
        {phase === 'r' ? 'Side-Out' : 'Transition'}
      </div>
    </div>
  );
}

// ─── Matchup Matrix Component ─────────────────────────────────────────────────
function MatchupMatrixView({ matrixData }) {
  if (!matrixData || !matrixData.matrix) {
    return <div className="text-center text-gray-500 text-sm py-8">Imposta le rotazioni avversarie per visualizzare gli incastri</div>;
  }

  const { matrix, summary } = matrixData;

  const getCellColor = (cell) => {
    if (cell.total === 0) return 'bg-white/[0.02]';
    const net = cell.ourPts - cell.theirPts;
    if (net > 1) return 'bg-green-500/15 border-green-500/20';
    if (net > 0) return 'bg-green-500/8';
    if (net === 0) return 'bg-yellow-500/8';
    if (net > -2) return 'bg-red-500/8';
    return 'bg-red-500/15 border-red-500/20';
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr>
              <th className="py-2 px-2 text-gray-500 text-left font-bold">NOI ↓ / AVV →</th>
              {[1, 2, 3, 4, 5, 6].map(them => {
                const oppMeta = getRotationMeta(them);
                return (
                  <th key={them} className="py-2 px-1 text-center">
                    <div className="text-gray-400 font-bold">P{them}</div>
                    <div className={`text-[7px] ${oppMeta.mode === '3att' ? 'text-green-500' : 'text-blue-500'}`}>{oppMeta.attackerCount}att</div>
                  </th>
                );
              })}
              <th className="py-2 px-2 text-gray-500 text-center font-bold">TOT</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6].map(us => {
              const ourMeta = getRotationMeta(us);
              let rowTotal = 0, rowPts = 0, rowLost = 0;
              for (let t = 1; t <= 6; t++) {
                rowTotal += matrix[us][t].total;
                rowPts += matrix[us][t].ourPts;
                rowLost += matrix[us][t].theirPts;
              }
              return (
                <tr key={us} className="border-t border-white/5">
                  <td className="py-2 px-2">
                    <span className="font-bold text-amber-400">P{us}</span>
                    <span className={`ml-1 text-[7px] ${ourMeta.mode === '3att' ? 'text-green-500' : 'text-blue-500'}`}>{ourMeta.attackerCount}att</span>
                  </td>
                  {[1, 2, 3, 4, 5, 6].map(them => {
                    const cell = matrix[us][them];
                    if (cell.total === 0) {
                      return <td key={them} className="py-1.5 px-1 text-center text-gray-700">-</td>;
                    }
                    const net = cell.ourPts - cell.theirPts;
                    return (
                      <td key={them} className={`py-1.5 px-1 text-center rounded ${getCellColor(cell)} border border-transparent`}>
                        <div className={`font-bold ${net > 0 ? 'text-green-400' : net < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                          {net > 0 ? '+' : ''}{net}
                        </div>
                        <div className="text-[7px] text-gray-500">{cell.ourPts}-{cell.theirPts} ({cell.total})</div>
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-2 text-center">
                    <div className={`font-bold ${rowPts - rowLost > 0 ? 'text-green-400' : rowPts - rowLost < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {rowPts - rowLost > 0 ? '+' : ''}{rowPts - rowLost}
                    </div>
                    <div className="text-[7px] text-gray-500">{rowPts}-{rowLost}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Best / Worst matchup summary */}
      <div className="grid grid-cols-2 gap-3">
        {summary.bestMatchup && (
          <div className="bg-green-500/5 rounded-lg p-3 border border-green-500/10">
            <div className="text-[8px] text-green-400 uppercase font-bold mb-1">Miglior Incastro</div>
            <div className="text-sm font-bold text-white">
              P{summary.bestMatchup.us} vs P{summary.bestMatchup.them}
            </div>
            <div className="text-[10px] text-green-300">
              +{summary.bestMatchup.ourPts - summary.bestMatchup.theirPts} ({summary.bestMatchup.ourPts}-{summary.bestMatchup.theirPts} in {summary.bestMatchup.total} azioni)
            </div>
          </div>
        )}
        {summary.worstMatchup && (
          <div className="bg-red-500/5 rounded-lg p-3 border border-red-500/10">
            <div className="text-[8px] text-red-400 uppercase font-bold mb-1">Peggior Incastro</div>
            <div className="text-sm font-bold text-white">
              P{summary.worstMatchup.us} vs P{summary.worstMatchup.them}
            </div>
            <div className="text-[10px] text-red-300">
              {summary.worstMatchup.ourPts - summary.worstMatchup.theirPts} ({summary.worstMatchup.ourPts}-{summary.worstMatchup.theirPts} in {summary.worstMatchup.total} azioni)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Set Flow Timeline ────────────────────────────────────────────────────────
function SetFlowTimeline({ setFlow, setNum }) {
  const data = setFlow?.[setNum];
  if (!data || data.length === 0) return null;

  const chartData = data.map((r, i) => ({
    idx: i,
    delta: (r.ourScore || 0) - (r.theirScore || 0),
    ourScore: r.ourScore,
    theirScore: r.theirScore,
    ourRot: r.ourRot,
    oppRot: r.oppRot,
    isPoint: r.isPoint,
    phase: r.phase,
    ourMode: r.ourMode,
  }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Set {setNum} — Andamento</h4>
        <span className="text-[9px] text-gray-500">
          ({data[data.length - 1]?.ourScore || 0}-{data[data.length - 1]?.theirScore || 0})
        </span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
          <XAxis dataKey="idx" tick={false} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} domain={['auto', 'auto']} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
          <Tooltip
            contentStyle={{ background: 'rgba(17,24,39,0.95)', border: 'none', borderRadius: 8, fontSize: 10 }}
            formatter={(val, name) => [`${val}`, 'Differenza']}
            labelFormatter={(idx) => {
              const d = chartData[idx];
              if (!d) return '';
              return `${d.ourScore}-${d.theirScore} | Noi: P${d.ourRot}${d.oppRot ? ` vs Avv: P${d.oppRot}` : ''} | ${d.phase === 'r' ? 'Ricezione' : 'Battuta'}`;
            }}
          />
          <Line type="monotone" dataKey="delta" stroke="#f59e0b" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>

      {/* Rotation band markers */}
      <div className="flex gap-0.5 h-4 rounded overflow-hidden">
        {chartData.map((d, i) => (
          <div
            key={i}
            className="flex-1 flex items-center justify-center"
            style={{
              backgroundColor: d.isPoint ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
              borderLeft: i > 0 && chartData[i - 1]?.ourRot !== d.ourRot ? '2px solid rgba(255,255,255,0.3)' : 'none',
            }}
            title={`P${d.ourRot} ${d.phase === 'r' ? 'SO' : 'BP'} ${d.ourScore}-${d.theirScore}`}
          >
            {(i === 0 || chartData[i - 1]?.ourRot !== d.ourRot) && (
              <span className="text-[6px] text-white/60 font-bold">P{d.ourRot}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Role Comparison Component ────────────────────────────────────────────────
function RoleComparisonView({ comparison }) {
  if (!comparison) return null;

  const renderBar = (label, val1, val2, name1, name2) => {
    if (val1 == null && val2 == null) return null;
    const v1 = val1 ?? 0, v2 = val2 ?? 0;
    const max = Math.max(v1, v2, 1);
    return (
      <div className="space-y-1">
        <div className="text-[9px] text-gray-500 font-medium">{label}</div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-amber-400 w-6">{name1}</span>
            <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500/60 rounded-full" style={{ width: `${(v1 / max) * 100}%` }} />
            </div>
            <span className="text-[9px] text-white font-mono w-10 text-right">{(v1 * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-blue-400 w-6">{name2}</span>
            <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${(v2 / max) * 100}%` }} />
            </div>
            <span className="text-[9px] text-white font-mono w-10 text-right">{(v2 * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    );
  };

  const eff = (stats) => stats.total > 0 ? stats.pts / stats.total : null;
  const errR = (stats) => stats.total > 0 ? stats.err / stats.total : null;

  return (
    <div className="space-y-6">
      {/* B1 vs B2 */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <h4 className="text-sm font-bold text-white">Banda 1 vs Banda 2</h4>
          <div className="flex gap-2">
            <span className="text-[8px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">B1</span>
            <span className="text-[8px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">B2</span>
          </div>
        </div>
        <div className="text-[9px] text-gray-500 leading-relaxed mb-3">
          <strong className="text-amber-400">B1</strong>: {ROLE_DESCRIPTIONS.B1}<br />
          <strong className="text-blue-400">B2</strong>: {ROLE_DESCRIPTIONS.B2}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {renderBar('Efficienza Attacco', eff(comparison.B1.attack), eff(comparison.B2.attack), 'B1', 'B2')}
          {renderBar('Ricezione Positiva', eff(comparison.B1.reception), eff(comparison.B2.reception), 'B1', 'B2')}
          {renderBar('Efficienza Battuta', eff(comparison.B1.serve), eff(comparison.B2.serve), 'B1', 'B2')}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="bg-white/[0.02] rounded-lg p-2 border border-white/5">
            <div className="text-[8px] text-gray-500 uppercase">B1 Errori Attacco</div>
            <div className="text-sm font-mono text-red-400">{comparison.B1.attack.err} / {comparison.B1.attack.total}</div>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-2 border border-white/5">
            <div className="text-[8px] text-gray-500 uppercase">B2 Errori Attacco</div>
            <div className="text-sm font-mono text-red-400">{comparison.B2.attack.err} / {comparison.B2.attack.total}</div>
          </div>
        </div>
      </div>

      {/* C1 vs C2 */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <h4 className="text-sm font-bold text-white">Centrale 1 vs Centrale 2</h4>
          <div className="flex gap-2">
            <span className="text-[8px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">C1</span>
            <span className="text-[8px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-400">C2</span>
          </div>
        </div>
        <div className="text-[9px] text-gray-500 leading-relaxed mb-3">
          <strong className="text-emerald-400">C1</strong>: {ROLE_DESCRIPTIONS.C1}<br />
          <strong className="text-teal-400">C2</strong>: {ROLE_DESCRIPTIONS.C2}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {renderBar('Efficienza Attacco', eff(comparison.C1.attack), eff(comparison.C2.attack), 'C1', 'C2')}
          {renderBar('Muro Punto', comparison.C1.block.total > 0 ? comparison.C1.block.pts / comparison.C1.block.total : null, comparison.C2.block.total > 0 ? comparison.C2.block.pts / comparison.C2.block.total : null, 'C1', 'C2')}
          {renderBar('Efficienza Battuta', eff(comparison.C1.serve), eff(comparison.C2.serve), 'C1', 'C2')}
        </div>
      </div>

      {/* Opposto */}
      <div className="glass-card p-5 space-y-3">
        <h4 className="text-sm font-bold text-white">Opposto</h4>
        <div className="text-[9px] text-gray-500 leading-relaxed mb-2">{ROLE_DESCRIPTIONS.O}</div>
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="Att. Eff%" value={comparison.O.attack.total > 0 ? `${(comparison.O.attack.pts / comparison.O.attack.total * 100).toFixed(0)}%` : '-'} sub={`${comparison.O.attack.pts}/${comparison.O.attack.total}`} color="text-orange-400" small />
          <StatBox label="Battuta Eff%" value={comparison.O.serve.total > 0 ? `${(comparison.O.serve.pts / comparison.O.serve.total * 100).toFixed(0)}%` : '-'} sub={`${comparison.O.serve.pts}/${comparison.O.serve.total}`} color="text-orange-400" small />
          <StatBox label="Muro Punto" value={`${comparison.O.block.pts}`} sub={`su ${comparison.O.block.total}`} color="text-orange-400" small />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RotationAnalysis({ analytics, matches, allPlayers, dataMode = 'raw' }) {
  const [activeTab, setActiveTab] = useState('statistics');
  const [tacticalSubTab, setTacticalSubTab] = useState('incastri'); // incastri | rotation | roles
  const [viewMode, setViewMode] = useState('match');
  const [selectedMatchIdx, setSelectedMatchIdx] = useState(-1);
  const [tacticalRot, setTacticalRot] = useState(1);
  const [tacticalPhase, setTacticalPhase] = useState('r');
  const [oppStartRotations, setOppStartRotations] = useState({});
  const [selectedSet, setSelectedSet] = useState(0); // 0 = all sets

  if (!analytics || matches.length === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl font-bold text-white mb-2">Analisi Rotazioni</h2>
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-sm">
          <div className="text-4xl mb-3">{'\u27F3'}</div>
          <p>Carica partite per analizzare le rotazioni.</p>
        </div>
      </div>
    );
  }

  const { matchAnalytics, chainData } = analytics;
  const resolvedIdx = selectedMatchIdx === -1 || selectedMatchIdx >= matchAnalytics.length
    ? matchAnalytics.length - 1 : selectedMatchIdx;

  const selectedMA = useMemo(() => {
    if (viewMode === 'aggregate') return null;
    return matchAnalytics[resolvedIdx] || null;
  }, [viewMode, resolvedIdx, matchAnalytics]);

  // Auto-populate opponent starting rotations from parsed Excel data (A6 per set)
  // Manual overrides are preserved: only auto-fill if user hasn't set a value for that set
  const [manualOppOverrides, setManualOppOverrides] = useState({});

  const parsedOppStartRotations = useMemo(() => {
    if (!selectedMA) return {};
    const parsed = {};
    for (const s of selectedMA.match.sets || []) {
      if (s.oppStartRotation) {
        parsed[s.number] = s.oppStartRotation;
      }
    }
    return parsed;
  }, [selectedMA]);

  // Merge: manual overrides take precedence over parsed values
  useEffect(() => {
    const merged = { ...parsedOppStartRotations, ...manualOppOverrides };
    // Only update if actually different
    const currentStr = JSON.stringify(oppStartRotations);
    const mergedStr = JSON.stringify(merged);
    if (currentStr !== mergedStr) {
      setOppStartRotations(merged);
    }
  }, [parsedOppStartRotations, manualOppOverrides]);

  const currentRotationalChains = useMemo(() => {
    if (viewMode === 'aggregate') return chainData?.rotationalChains || {};
    if (!selectedMA) return {};
    return analyzeRotationalChains([selectedMA.match]);
  }, [viewMode, selectedMA, chainData]);

  // Aggregate rotation data
  const aggregateRotData = useMemo(() => {
    const rotations = {};
    for (let r = 1; r <= 6; r++) {
      rotations[r] = { rotation: `P${r}`, sideOutTotal: 0, sideOutWon: 0, breakTotal: 0, breakWon: 0, totalPoints: 0, totalActions: 0 };
    }
    for (const ma of matchAnalytics) {
      for (const rally of ma.match.rallies || []) {
        const rot = rally.rotation;
        if (!rot || rot < 1 || rot > 6) continue;
        if (rally.phase === 'r') { rotations[rot].sideOutTotal++; if (rally.isPoint) rotations[rot].sideOutWon++; }
        else if (rally.phase === 'b') { rotations[rot].breakTotal++; if (rally.isPoint) rotations[rot].breakWon++; }
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
      rotations[r] = { rotation: `P${r}`, sideOutTotal: 0, sideOutWon: 0, breakTotal: 0, breakWon: 0, lineup: '' };
    }
    for (const rally of selectedMA.match.rallies || []) {
      const rot = rally.rotation;
      if (!rot || rot < 1 || rot > 6) continue;
      if (rally.phase === 'r') { rotations[rot].sideOutTotal++; if (rally.isPoint) rotations[rot].sideOutWon++; }
      else { rotations[rot].breakTotal++; if (rally.isPoint) rotations[rot].breakWon++; }
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

  const roles = useMemo(() => {
    if (!selectedMA) return null;
    return identifyRolesPerSet(selectedMA.match.riepilogo?.rotations || []);
  }, [selectedMA]);

  const activeLineup = useMemo(() => {
    if (!selectedMA) return '';
    const rotEntry = selectedMA.match.riepilogo?.rotations?.find(r => r.rotation === 1);
    return rotEntry?.lineup || '';
  }, [selectedMA]);

  // ── Tactical Lab computed data ──
  const currentRallies = useMemo(() => {
    if (viewMode === 'aggregate') {
      return matchAnalytics.flatMap(ma => ma.match.rallies || []);
    }
    return selectedMA?.match.rallies || [];
  }, [viewMode, selectedMA, matchAnalytics]);

  const filteredRallies = useMemo(() => {
    if (selectedSet === 0) return currentRallies;
    return currentRallies.filter(r => r.set === selectedSet);
  }, [currentRallies, selectedSet]);

  const annotatedRallies = useMemo(() => {
    if (Object.keys(oppStartRotations).length === 0) return filteredRallies;
    return trackOpponentRotations(filteredRallies, oppStartRotations);
  }, [filteredRallies, oppStartRotations]);

  const matchupMatrix = useMemo(() => {
    const hasOppData = annotatedRallies.some(r => r.oppRotation);
    if (!hasOppData) return null;
    return computeMatchupMatrix(annotatedRallies);
  }, [annotatedRallies]);

  const rotDetailedStats = useMemo(() => {
    return computeRotationDetailedStats(filteredRallies, roles);
  }, [filteredRallies, roles]);

  const setFlow = useMemo(() => {
    return computeSetFlow(currentRallies, Object.keys(oppStartRotations).length > 0 ? oppStartRotations : null);
  }, [currentRallies, oppStartRotations]);

  const phaseRotStats = useMemo(() => {
    return computePhaseRotationStats(filteredRallies, roles);
  }, [filteredRallies, roles]);

  const roleComparison = useMemo(() => {
    const allMatches = viewMode === 'aggregate'
      ? matchAnalytics.map(ma => ma.match)
      : selectedMA ? [selectedMA.match] : [];
    const roster = selectedMA?.match.roster || matchAnalytics[0]?.match.roster || [];
    return computeRoleComparison(allMatches, roster);
  }, [viewMode, selectedMA, matchAnalytics]);

  const availableSets = useMemo(() => {
    const sets = new Set(currentRallies.map(r => r.set));
    return [...sets].sort();
  }, [currentRallies]);

  // Handler for opponent rotation input (manual overrides)
  const handleOppRotChange = useCallback((setNum, value) => {
    const v = parseInt(value);
    if (v >= 1 && v <= 6) {
      setManualOppOverrides(prev => ({ ...prev, [setNum]: v }));
    } else if (value === '' || value === '0') {
      // Clear manual override — will fall back to parsed value if available
      setManualOppOverrides(prev => {
        const next = { ...prev };
        delete next[setNum];
        return next;
      });
      // Also clear from oppStartRotations if there's no parsed fallback
      if (!parsedOppStartRotations[setNum]) {
        setOppStartRotations(prev => {
          const next = { ...prev };
          delete next[setNum];
          return next;
        });
      }
    }
  }, [parsedOppStartRotations]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Tabs ── */}
      <div className="flex border-b border-white/10 mb-2">
        {[
          { key: 'statistics', label: 'Analisi Rotazioni' },
          { key: 'tactical', label: 'Tactical Lab' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-6 py-3 text-sm font-medium transition-all relative ${
              activeTab === tab.key ? 'text-amber-400' : 'text-gray-400 hover:text-white'
            }`}>
            {tab.label}
            {activeTab === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400" />}
          </button>
        ))}
      </div>

      {/* ── Global Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">
            {activeTab === 'statistics' ? 'Analisi Statistica' : 'Tactical Lab'}
          </h2>
          <p className="text-sm text-gray-400">
            {viewMode === 'aggregate'
              ? `Aggregato su ${matches.length} partite`
              : `vs ${selectedMA?.match.metadata?.opponent || 'N/D'} — ${selectedMA?.match.metadata?.date || ''}`}
          </p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setViewMode('match')}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all ${viewMode === 'match' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-gray-400 border border-transparent'}`}>
            Singola Partita
          </button>
          <button onClick={() => setViewMode('aggregate')}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all ${viewMode === 'aggregate' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-gray-400 border border-transparent'}`}>
            Aggregato
          </button>
        </div>
      </div>

      {/* ── Match selector ── */}
      {viewMode === 'match' && matchAnalytics.length > 1 && (
        <div className="glass-card p-3">
          <div className="flex gap-1.5 flex-wrap">
            {matchAnalytics.map((ma, idx) => (
              <button key={idx} onClick={() => setSelectedMatchIdx(idx)}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] transition-all ${
                  idx === resolvedIdx
                    ? 'bg-amber-500/20 text-amber-400 font-medium border border-amber-500/30'
                    : 'bg-white/[0.03] text-gray-400 border border-white/5 hover:text-white'
                }`}>
                {(ma.match.metadata?.opponent || 'N/D').substring(0, 12)}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'statistics' ? (
        /* ════════════════════════════════════════════════════════════════════════
           STATISTICS TAB (unchanged)
           ════════════════════════════════════════════════════════════════════════ */
        <div className="space-y-6">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4 text-center">Efficienza Side-Out vs Break-Point</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={currentRotData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="rotation" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: 'none', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="sideOutPct" name="Side-Out %" fill={COLORS.raw} radius={[4, 4, 0, 0]} />
                <Bar dataKey="breakPct" name="Break-Point %" fill={COLORS.positive} radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-300">Dettaglio Numerico</h3>
              <div className="text-[10px] text-gray-500 italic">P1: P in 1, P2: P in 2...</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.02] text-gray-500 text-left uppercase tracking-wider">
                    <th className="py-3 px-4 font-medium">Rotazione</th>
                    {viewMode === 'match' && <th className="py-3 px-4 font-medium">Formazione</th>}
                    <th className="py-3 px-4 text-center font-medium">SO %</th>
                    <th className="py-3 px-4 text-center font-medium">BP %</th>
                    <th className="py-3 px-4 text-center font-medium">Vinte/Tot</th>
                    <th className="py-3 px-4 text-center font-medium">Modo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {currentRotData.map(r => {
                    const rotNum = parseInt(r.rotation.replace('P', ''));
                    const meta = getRotationMeta(rotNum);
                    return (
                      <tr key={r.rotation} className="hover:bg-white/[0.01] transition-colors">
                        <td className="py-3 px-4 font-bold text-amber-400">{r.rotation}</td>
                        {viewMode === 'match' && (
                          <td className="py-3 px-4 text-gray-400 font-mono text-[10px]">{r.lineup}</td>
                        )}
                        <td className={`py-3 px-4 text-center font-mono font-bold ${r.sideOutPct > 50 ? 'text-green-400' : 'text-amber-400'}`}>
                          {r.sideOutPct.toFixed(0)}%
                        </td>
                        <td className={`py-3 px-4 text-center font-mono font-bold ${r.breakPct > 40 ? 'text-green-400' : 'text-amber-400'}`}>
                          {r.breakPct.toFixed(0)}%
                        </td>
                        <td className="py-3 px-4 text-center text-gray-500">
                          {r.sideOutWon + r.breakWon} / {r.sideOutTotal + r.breakTotal}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full ${meta.mode === '3att' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'}`}>
                            {meta.attackerCount} attaccanti
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ════════════════════════════════════════════════════════════════════════
           TACTICAL LAB (completely new)
           ════════════════════════════════════════════════════════════════════════ */
        <div className="space-y-6">
          {/* Sub-tabs */}
          <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1">
            {[
              { key: 'incastri', label: 'Incastri & Flusso' },
              { key: 'rotation', label: 'Analisi Rotazione' },
              { key: 'roles', label: 'Confronto Ruoli' },
            ].map(st => (
              <button key={st.key} onClick={() => setTacticalSubTab(st.key)}
                className={`flex-1 px-3 py-2 rounded-md text-[11px] font-bold transition-all uppercase tracking-wider ${
                  tacticalSubTab === st.key
                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                    : 'text-gray-400 hover:text-white'
                }`}>
                {st.label}
              </button>
            ))}
          </div>

          {/* Set filter */}
          {availableSets.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 uppercase font-bold">Set:</span>
              <div className="flex gap-1">
                <button onClick={() => setSelectedSet(0)}
                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${selectedSet === 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-500'}`}>
                  Tutti
                </button>
                {availableSets.map(s => (
                  <button key={s} onClick={() => setSelectedSet(s)}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${selectedSet === s ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-500'}`}>
                    Set {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── INCASTRI & FLUSSO ─── */}
          {tacticalSubTab === 'incastri' && (
            <div className="space-y-6">
              {/* Opponent rotation setup */}
              <div className="glass-card p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${Object.keys(oppStartRotations).length > 0 ? 'bg-green-400' : 'bg-purple-400 animate-pulse'}`} />
                  <h3 className="text-sm font-bold text-white">Rotazione di Partenza Avversaria</h3>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  {Object.keys(parsedOppStartRotations).length > 0
                    ? 'Rotazioni avversarie lette automaticamente dal file scout (cella A6 per set). Puoi sovrascrivere manualmente se necessario.'
                    : 'Rotazioni non trovate nel file scout. Inserisci manualmente la rotazione di partenza avversaria per ogni set. Il sistema traccerà automaticamente le rotazioni basandosi sulle cambio-palla.'}
                </p>
                <div className="flex gap-3 flex-wrap">
                  {availableSets.map(setNum => {
                    const isParsed = !!parsedOppStartRotations[setNum];
                    const isManualOverride = !!manualOppOverrides[setNum];
                    return (
                      <div key={setNum} className={`flex items-center gap-2 rounded-lg p-2 border ${
                        isParsed && !isManualOverride
                          ? 'bg-green-500/5 border-green-500/15'
                          : isManualOverride
                          ? 'bg-amber-500/5 border-amber-500/15'
                          : 'bg-white/[0.03] border-white/5'
                      }`}>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-gray-400 font-bold">Set {setNum}:</span>
                          {isParsed && !isManualOverride && (
                            <span className="text-[7px] text-green-500">da file</span>
                          )}
                          {isManualOverride && (
                            <span className="text-[7px] text-amber-500">manuale</span>
                          )}
                        </div>
                        <select
                          value={oppStartRotations[setNum] || ''}
                          onChange={e => handleOppRotChange(setNum, e.target.value)}
                          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        >
                          <option value="">-</option>
                          {[1, 2, 3, 4, 5, 6].map(r => (
                            <option key={r} value={r}>P{r}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
                {Object.keys(oppStartRotations).length > 0 && (
                  <div className="text-[9px] text-green-400 flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                    Tracciamento avversario attivo per {Object.keys(oppStartRotations).length} set
                    {Object.keys(parsedOppStartRotations).length > 0 && (
                      <span className="text-gray-500 ml-1">
                        ({Object.keys(parsedOppStartRotations).length} da file, {Object.keys(manualOppOverrides).length} manuali)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Matchup Matrix */}
              <div className="glass-card p-5 space-y-4">
                <h3 className="text-sm font-bold text-white">Matrice Incastri (Noi vs Avversario)</h3>
                <p className="text-[9px] text-gray-500 leading-relaxed">
                  Ogni cella mostra il bilancio punti (nostri - loro) nell'incastro specifico.
                  Verde = favorevole, Rosso = sfavorevole. Tra parentesi: punti nostri - punti loro (totale azioni).
                </p>
                <MatchupMatrixView matrixData={matchupMatrix} />
              </div>

              {/* Attacker Mode Comparison */}
              <div className="glass-card p-5 space-y-4">
                <h3 className="text-sm font-bold text-white">3 Attaccanti vs 2 Attaccanti</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-500/5 rounded-xl p-4 border border-green-500/10">
                    <div className="text-[9px] text-green-400 uppercase font-bold mb-2">3 Attaccanti (P1, P6, P5)</div>
                    <div className="text-[9px] text-gray-500 mb-3">Palleggiatore in seconda linea. Massimo potenziale offensivo con 3 terminali in prima linea.</div>
                    <div className="grid grid-cols-2 gap-2">
                      <StatBox label="Side-Out" value={`${Math.round((currentRotationalChains.attackerModes?.['3att']?.sideOut || 0) * 100)}%`}
                        sub={`${currentRotationalChains.attackerModes?.['3att']?.totals?.sideOut || 0} azioni`} color="text-green-400" small />
                      <StatBox label="Break-Point" value={`${Math.round((currentRotationalChains.attackerModes?.['3att']?.breakPoint || 0) * 100)}%`}
                        sub={`${currentRotationalChains.attackerModes?.['3att']?.totals?.breakPoint || 0} azioni`} color="text-green-400" small />
                    </div>
                  </div>
                  <div className="bg-blue-500/5 rounded-xl p-4 border border-blue-500/10">
                    <div className="text-[9px] text-blue-400 uppercase font-bold mb-2">2 Attaccanti (P4, P3, P2)</div>
                    <div className="text-[9px] text-gray-500 mb-3">Palleggiatore in prima linea. 2 terminali offensivi + setter che partecipa a muro.</div>
                    <div className="grid grid-cols-2 gap-2">
                      <StatBox label="Side-Out" value={`${Math.round((currentRotationalChains.attackerModes?.['2att']?.sideOut || 0) * 100)}%`}
                        sub={`${currentRotationalChains.attackerModes?.['2att']?.totals?.sideOut || 0} azioni`} color="text-blue-400" small />
                      <StatBox label="Break-Point" value={`${Math.round((currentRotationalChains.attackerModes?.['2att']?.breakPoint || 0) * 100)}%`}
                        sub={`${currentRotationalChains.attackerModes?.['2att']?.totals?.breakPoint || 0} azioni`} color="text-blue-400" small />
                    </div>
                  </div>
                </div>
              </div>

              {/* Set Flow */}
              <div className="glass-card p-5 space-y-4">
                <h3 className="text-sm font-bold text-white">Flusso Partita per Set</h3>
                <p className="text-[9px] text-gray-500">
                  Andamento del punteggio (differenza) con indicazione delle rotazioni.
                  La barra inferiore mostra la sequenza delle rotazioni (verde = punto nostro, rosso = punto avversario).
                </p>
                {availableSets.map(setNum => (
                  <SetFlowTimeline key={setNum} setFlow={setFlow} setNum={setNum} />
                ))}
              </div>
            </div>
          )}

          {/* ─── ANALISI ROTAZIONE ─── */}
          {tacticalSubTab === 'rotation' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Left: Controls + Stats */}
                <div className="space-y-6">
                  {/* Phase toggle */}
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white">Seleziona Rotazione</h3>
                    <div className="flex bg-white/5 rounded-lg p-1">
                      {[{ k: 'r', l: 'Ricezione (SO)' }, { k: 'b', l: 'Battuta (BP)' }].map(p => (
                        <button key={p.k} onClick={() => setTacticalPhase(p.k)}
                          className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all uppercase ${
                            tacticalPhase === p.k ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-gray-400 hover:text-white'
                          }`}>
                          {p.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rotation selector grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 6, 5, 4, 3, 2].map(num => {
                      const rotStat = currentRotData.find(d => d.rotation === `P${num}`);
                      return (
                        <RotBadge key={num} rot={num} isActive={tacticalRot === num} onClick={setTacticalRot}
                          soPct={rotStat?.sideOutPct} bpPct={rotStat?.breakPct} phase={tacticalPhase} />
                      );
                    })}
                  </div>

                  {/* Phase stats for selected rotation */}
                  {(() => {
                    const ps = phaseRotStats[tacticalRot];
                    if (!ps) return null;
                    const isReception = tacticalPhase === 'r';
                    const phaseData = isReception ? ps.ourReception : ps.ourServe;
                    const pct = phaseData.total > 0 ? (phaseData.won / phaseData.total * 100) : 0;

                    return (
                      <div className="glass-card p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                            {isReception ? 'Nostra Ricezione vs Loro Battuta' : 'Nostra Battuta vs Loro Ricezione'}
                          </h4>
                          <div className={`text-lg font-black font-mono ${pct > 50 ? 'text-green-400' : pct > 35 ? 'text-amber-400' : 'text-red-400'}`}>
                            {pct.toFixed(0)}%
                          </div>
                        </div>
                        <div className="text-[9px] text-gray-500">{phaseData.won}/{phaseData.total} azioni vinte</div>

                        {isReception ? (
                          <div className="space-y-3">
                            <QualityBar dist={phaseData.receptionQuality} total={Object.values(phaseData.receptionQuality).reduce((a, b) => a + b, 0)} label="Distribuzione Ricezione" />
                            <div className="grid grid-cols-3 gap-2">
                              <StatBox label="Att. dopo Ric." value={phaseData.attackAfterRec.total > 0 ? `${(phaseData.attackAfterRec.pts / phaseData.attackAfterRec.total * 100).toFixed(0)}%` : '-'}
                                sub={`${phaseData.attackAfterRec.pts}/${phaseData.attackAfterRec.total}`} color="text-amber-400" small />
                              <StatBox label="Punti Attacco" value={phaseData.attackAfterRec.pts} color="text-green-400" small />
                              <StatBox label="Errori Attacco" value={phaseData.attackAfterRec.err} color="text-red-400" small />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <QualityBar dist={phaseData.serveQuality} total={Object.values(phaseData.serveQuality).reduce((a, b) => a + b, 0)} label="Distribuzione Battuta" />
                            <div className="grid grid-cols-3 gap-2">
                              <StatBox label="Muro Punto" value={phaseData.blockPts} color="text-yellow-400" small />
                              <StatBox label="Trans. Att." value={phaseData.transitionAttack.total > 0 ? `${(phaseData.transitionAttack.pts / phaseData.transitionAttack.total * 100).toFixed(0)}%` : '-'}
                                sub={`${phaseData.transitionAttack.pts}/${phaseData.transitionAttack.total}`} color="text-amber-400" small />
                              <StatBox label="Err. Trans." value={phaseData.transitionAttack.err} color="text-red-400" small />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Front row info card */}
                  {(() => {
                    const meta = getRotationMeta(tacticalRot);
                    return (
                      <div className="glass-card p-4 space-y-3">
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Composizione Prima Linea</h4>
                        <div className="grid grid-cols-3 gap-2">
                          {meta.frontRow.map(fp => (
                            <div key={fp.pos} className="bg-white/[0.03] rounded-lg p-2 border border-white/5 text-center">
                              <div className="text-[8px] text-gray-600 uppercase">Posto {fp.pos}</div>
                              <div className="text-sm font-bold" style={{ color: ROLE_COLORS[fp.role] || '#fff' }}>{fp.role}</div>
                              <div className="text-[8px] text-gray-500">{ROLE_LABELS[fp.role] || ''}</div>
                            </div>
                          ))}
                        </div>
                        {tacticalRot === 1 && tacticalPhase === 'r' && (
                          <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/10">
                            <div className="text-[9px] text-purple-400 font-bold mb-1">Caso Speciale P1 Ricezione</div>
                            <div className="text-[9px] text-purple-200/70 leading-relaxed">
                              In P1 ricezione, l'Opposto attacca da posto 4 (sinistra) e la Banda 1 da posto 2 (destra).
                              Il palleggiatore penetra da posto 1 verso rete. Le posizioni d'attacco sono invertite rispetto
                              alla specializzazione standard.
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Right: Court + Attack breakdown */}
                <div className="space-y-4">
                  <TacticalBoard rotation={tacticalRot} lineup={activeLineup} phase={tacticalPhase} roles={roles} />

                  {/* Attack breakdown per player in this rotation */}
                  {(() => {
                    const rs = rotDetailedStats[tacticalRot];
                    if (!rs) return null;
                    const attackByPlayer = Object.entries(rs.attack.byPlayer)
                      .sort((a, b) => b[1].total - a[1].total);
                    if (attackByPlayer.length === 0) return null;

                    return (
                      <div className="glass-card p-4 space-y-3">
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Attacchi in P{tacticalRot}</h4>
                        <div className="space-y-2">
                          {attackByPlayer.map(([pNum, stats]) => {
                            const eff = stats.total > 0 ? (stats.pts / stats.total * 100) : 0;
                            const errPct = stats.total > 0 ? (stats.err / stats.total * 100) : 0;
                            return (
                              <div key={pNum} className="flex items-center gap-3 bg-white/[0.02] rounded-lg p-2 border border-white/5">
                                <div className="w-16">
                                  <div className="text-[10px] font-bold text-white">#{pNum}</div>
                                  <div className="text-[8px] text-gray-500">{stats.role || ''}</div>
                                </div>
                                <div className="flex-1">
                                  <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
                                    <div className="bg-green-500" style={{ width: `${eff}%` }} />
                                    <div className="bg-red-500" style={{ width: `${errPct}%` }} />
                                  </div>
                                </div>
                                <div className="text-right w-20">
                                  <div className="text-[10px] font-mono font-bold text-amber-400">{eff.toFixed(0)}%</div>
                                  <div className="text-[7px] text-gray-500">{stats.pts}pt / {stats.err}err / {stats.total}tot</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Fundamental quality distributions */}
                  {(() => {
                    const rs = rotDetailedStats[tacticalRot];
                    if (!rs) return null;
                    return (
                      <div className="glass-card p-4 space-y-3">
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Qualit{'\u00e0'} Fondamentali in P{tacticalRot}</h4>
                        <QualityBar dist={rs.attack.dist} total={rs.attack.total} label="Attacco" />
                        <QualityBar dist={rs.reception.dist} total={rs.reception.total} label="Ricezione" />
                        <QualityBar dist={rs.serve.dist} total={rs.serve.total} label="Battuta" />
                        <QualityBar dist={rs.defense.dist} total={rs.defense.total} label="Difesa" />
                        <QualityBar dist={rs.block.dist} total={rs.block.total} label="Muro" />
                        {rs.oppErrors > 0 && (
                          <div className="text-[9px] text-gray-500 mt-1">
                            Errori avversari in questa rotazione: <span className="text-green-400 font-bold">{rs.oppErrors}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Tactical Insight */}
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Tactical Insight</span>
                </div>
                <p className="text-xs text-blue-100/70 leading-relaxed">
                  {(() => {
                    const meta = getRotationMeta(tacticalRot);
                    const selStat = currentRotData.find(d => d.rotation === `P${tacticalRot}`);
                    const pct = selStat ? (tacticalPhase === 'r' ? selStat.sideOutPct : selStat.breakPct) : null;
                    const pctStr = pct != null ? `${Math.round(pct)}%` : 'N/D';
                    const phaseLabel = tacticalPhase === 'r' ? 'Side-Out' : 'Break-Point';

                    let insight = `In P${tacticalRot}, ${phaseLabel} al ${pctStr}. `;
                    if (meta.mode === '3att') {
                      insight += `Configurazione a 3 attaccanti in prima linea (${meta.frontRow.filter(p => p.role !== 'P').map(p => p.role).join(', ')}). `;
                      if (tacticalRot === 1 && tacticalPhase === 'r') {
                        insight += `ATTENZIONE: In P1 ricezione, l'Opposto gioca da posto 4 e la Banda 1 da posto 2 (posizioni invertite rispetto alla specializzazione).`;
                      } else {
                        insight += `Massimo potenziale offensivo: tutti e 3 i terminali possono attaccare in prima linea.`;
                      }
                    } else {
                      insight += `Configurazione a 2 attaccanti (${meta.frontRow.filter(p => p.role !== 'P').map(p => p.role).join(', ')}) con il palleggiatore in prima linea. `;
                      insight += `Il palleggiatore partecipa al muro ma il potenziale offensivo è ridotto. Attenzione ai matchup a muro avversario.`;
                    }
                    return insight;
                  })()}
                </p>
              </div>
            </div>
          )}

          {/* ─── CONFRONTO RUOLI ─── */}
          {tacticalSubTab === 'roles' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">Confronto Ruoli Tattici</span>
                </div>
                <p className="text-[10px] text-indigo-200/60 leading-relaxed">
                  Analisi comparativa delle performance per ruolo tattico.
                  Il confronto B1/B2 e C1/C2 aiuta a valutare l'equilibrio tra specializzazione offensiva e difensiva
                  e a identificare tendenze utili per le scelte tattiche dell'allenatore.
                </p>
              </div>

              <RoleComparisonView comparison={roleComparison} />

              {/* Role performance from rotational chains */}
              <div className="glass-card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Performance per Ruolo (da Catene)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/[0.02] text-gray-500 text-left">
                        <th className="py-3 px-6 font-bold uppercase tracking-widest text-[10px]">Ruolo</th>
                        <th className="py-3 px-6 font-bold text-center">Eff. Attacco</th>
                        <th className="py-3 px-6 font-bold text-center">Ric. Pos%</th>
                        <th className="py-3 px-6 font-bold text-right">Vol. (Att / Ric)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {Object.entries(currentRotationalChains.rolePerformance || {}).map(([role, stats]) => (
                        <tr key={role} className="hover:bg-white/[0.01]">
                          <td className="py-4 px-6">
                            <div className="font-black text-base" style={{ color: ROLE_COLORS[role] || '#fff' }}>{role}</div>
                            <div className="text-[10px] text-gray-500 italic">{ROLE_LABELS[role] || ''}</div>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="text-lg font-mono font-black text-amber-400">
                              {Math.round(stats.attackEff * 100)}%
                            </div>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="text-lg font-mono font-black text-blue-400">
                              {role === 'P' || role.startsWith('C') ? '-' : `${Math.round(stats.receptionExc * 100)}%`}
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right font-mono text-gray-400">
                            {stats.totals.attack} / {stats.totals.reception}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
