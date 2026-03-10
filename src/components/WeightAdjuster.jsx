import React from 'react';
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

  // Show impact preview if analytics available
  const matchPreviews = analytics?.matchAnalytics?.slice(0, 3) || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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

      {/* Weight sliders */}
      <div className="glass-card p-6 space-y-6">
        {Object.entries(WEIGHT_LABELS).map(([key, meta]) => {
          const val = weights[key] || 0;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-200 font-medium">{meta.label}</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-amber-400">±{(val * 100).toFixed(0)}%</span>
                  <span className="text-[10px] text-gray-500">max</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mb-2">{meta.desc}</p>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-gray-600 w-8">0%</span>
                <input
                  type="range"
                  min="0"
                  max="0.5"
                  step="0.01"
                  value={val}
                  onChange={(e) => handleSliderChange(key, parseFloat(e.target.value))}
                  className="flex-1"
                />
                <span className="text-[10px] text-gray-600 w-8">50%</span>
              </div>
            </div>
          );
        })}

        {/* Total */}
        <div className="pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Escursione Massima Teorica</span>
            <span className={`text-sm font-mono font-bold ${totalWeight > 0.6 ? 'text-amber-400' : 'text-green-400'}`}>
              ±{(totalWeight * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            In pratica lo scostamento tipico sarà ±{(totalWeight * 50).toFixed(0)}% perché è raro che tutti i fattori siano al massimo contemporaneamente.
          </p>
        </div>
      </div>

      {/* Live Preview */}
      {matchPreviews.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            Anteprima Impatto sui Pesi
          </h3>
          <p className="text-[10px] text-gray-500 mb-3">
            Come cambierebbe il peso delle ultime partite con questi parametri.
          </p>
          <div className="space-y-2">
            {matchPreviews.map(ma => {
              const m = ma.match;
              const setsWon = (m.sets || []).filter(s => s.won).length;
              const setsLost = (m.sets || []).filter(s => !s.won).length;
              return (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-mono ${setsWon > setsLost ? 'text-green-400' : 'text-red-400'}`}>
                      {setsWon}-{setsLost}
                    </span>
                    <span className="text-sm text-gray-200">vs {m.metadata.opponent}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-[9px] text-gray-500">Peso</p>
                      <p className="text-sm font-mono text-amber-400">{ma.matchWeight.final.toFixed(3)}</p>
                    </div>
                    <div className="w-20 h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${((ma.matchWeight.final - 0.5) / 1.0) * 100}%`,
                          background: ma.matchWeight.final > 1
                            ? 'linear-gradient(90deg, #a3e635, #10b981)'
                            : 'linear-gradient(90deg, #fb7185, #f59e0b)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
