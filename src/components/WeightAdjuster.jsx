import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
  LineChart, Line, Legend,
} from 'recharts';
import { DEFAULT_WEIGHTS } from '../utils/constants';

const WEIGHT_LABELS = {
  opponentStrength: { label: 'Forza Avversario (Classifica)', desc: 'Quanto la posizione in classifica dell\'avversario incide sul peso. Avversario 1° → bonus, ultimo → penalizzazione.' },
  opponentPerformance: { label: 'Performance Avversario (Errori)', desc: 'Se l\'avversario ha giocato sopra o sotto il suo livello (confrontando i suoi errori con la media campionato).' },
  setCompetitiveness: { label: 'Competitività Set (Parziali)', desc: 'Set combattuti (25-23) aumentano il peso, set dominati (25-15) lo riducono.' },
  matchResult: { label: 'Risultato Partita', desc: 'Una vittoria 3-2 sotto pressione vale di più di un 3-0 comodo. Una sconfitta 2-3 vale più di un 0-3.' },
  chainContext: { label: 'Complessità Rally', desc: 'Rally lunghi e complessi indicano avversario organizzato e gioco più difficile.' },
};

export default function WeightAdjuster({ weights, onWeightsChange, analytics, matches }) {
  const totalWeight = Object.values(weights).reduce((s, v) => s + v, 0);

  const handleReset = () => onWeightsChange({ ...DEFAULT_WEIGHTS });

  const handleSliderChange = (key, value) => {
    onWeightsChange(prev => ({ ...prev, [key]: value }));
  };

  const chartData = useMemo(() => {
    const rows = analytics?.matchAnalytics || [];
    const fundamentals = ['attack', 'serve', 'reception', 'defense', 'block'];
    return [...rows]
      .sort((a, b) => (a.match.metadata?.date || '').localeCompare(b.match.metadata?.date || ''))
      .map(ma => {
        const rawValues = fundamentals
          .map(f => ma.match.riepilogo?.team?.[f]?.efficacy || 0)
          .filter(v => v > 0);
        const rawTeam = rawValues.length > 0
          ? (rawValues.reduce((s, v) => s + v, 0) / rawValues.length) * 100
          : 0;
        const weight = ma.matchWeight?.final || 1;
        return {
          id: ma.match.id,
          opponent: (ma.match.metadata?.opponent || 'N/D').substring(0, 14),
          date: ma.match.metadata?.date || '',
          weight,
          rawTeam: +rawTeam.toFixed(1),
          weightedTeam: +(rawTeam * weight).toFixed(1),
        };
      });
  }, [analytics]);

  const getWeightColor = (weight) => {
    const ratio = Math.max(0, Math.min(1, (weight - 0.5) / 1));
    const hue = (1 - ratio) * 120;
    return `hsl(${hue}, 82%, 48%)`;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Regolazione Pesi</h2>
          <p className="text-sm text-gray-400">
            Regola l'incidenza di ogni fattore sulla pesatura. Il peso totale massimo è ±{(totalWeight * 100).toFixed(0)}%.
          </p>
        </div>
        <button
          onClick={handleReset}
          className="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          Reset Default
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-4">
        {chartData.length > 0 && (
          <div className="glass-card p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-300">
                Incidenza Pesi per Partita (live)
              </h3>
              <p className="text-[10px] text-gray-500">
                Verde = peso più basso, rosso = peso più alto.
              </p>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="opponent"
                    tick={{ fill: '#6b7280', fontSize: 9 }}
                    angle={-18}
                    textAnchor="end"
                    interval={0}
                    height={36}
                  />
                  <YAxis
                    domain={[0.5, 1.5]}
                    tick={{ fill: '#6b7280', fontSize: 9 }}
                    tickFormatter={(v) => v.toFixed(2)}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(17,24,39,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(value) => [Number(value).toFixed(3), 'Peso']}
                    labelFormatter={(label, payload) => {
                      const date = payload?.[0]?.payload?.date;
                      return date ? `${label} · ${date}` : label;
                    }}
                  />
                  <ReferenceLine y={1} stroke="rgba(245,158,11,0.7)" strokeDasharray="4 3" />
                  <Bar dataKey="weight" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell key={entry.id} fill={getWeightColor(entry.weight)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 mb-1">
                Scostamento performance squadra: grezzo vs pesato
              </p>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="opponent" hide />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} tickFormatter={(v) => `${v.toFixed(0)}%`} width={34} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(17,24,39,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                      labelFormatter={(label, payload) => {
                        const date = payload?.[0]?.payload?.date;
                        return date ? `${label} · ${date}` : label;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="rawTeam"
                      name="Team grezzo"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="weightedTeam"
                      name="Team pesato"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        <div className="glass-card p-4 space-y-3">
          {Object.entries(WEIGHT_LABELS).map(([key, meta]) => {
            const val = weights[key] || 0;
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-200 font-medium">{meta.label}</label>
                  <span className="text-[11px] font-mono text-amber-400">±{(val * 100).toFixed(0)}%</span>
                </div>
                <p className="text-[10px] text-gray-500 mb-1 hidden 2xl:block">{meta.desc}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-600 w-7">0%</span>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.01"
                    value={val}
                    onChange={(e) => handleSliderChange(key, parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-[9px] text-gray-600 w-7 text-right">50%</span>
                </div>
              </div>
            );
          })}

          <div className="pt-2 border-t border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Escursione Massima Teorica</span>
              <span className={`text-sm font-mono font-bold ${totalWeight > 0.6 ? 'text-amber-400' : 'text-green-400'}`}>
                ±{(totalWeight * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              Scostamento tipico atteso ±{(totalWeight * 50).toFixed(0)}%.
            </p>
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Come funziona la pesatura</h3>
        <div className="text-xs text-gray-400 space-y-2 leading-relaxed">
          <p>
            Il peso finale è calcolato come: <span className="font-mono text-amber-400">CC = 1 + Σ(peso_i × fattore_i)</span>
          </p>
          <p>
            Ogni fattore è normalizzato tra -1 e +1. Il contributo massimo di ogni fattore è definito dal suo slider.
            Un peso finale {'>'}1.0 significa contesto difficile (le performance vengono rivalutate), {'<'}1.0 significa contesto facile (le performance vengono ridimensionate).
          </p>
          <p>
            Il peso viene poi applicato per fondamentale: un avversario con un servizio forte aumenterà il peso specifico della ricezione, indipendentemente dagli altri fondamentali.
          </p>
          <p className="text-amber-400/80 font-medium">
            💡 Consiglio: se il peso calcolato non corrisponde a quello che hai visto in campo, aggiusta gli slider finché la lettura ti convince. Tu conosci il gioco meglio dell'algoritmo.
          </p>
        </div>
      </div>
    </div>
  );
}
