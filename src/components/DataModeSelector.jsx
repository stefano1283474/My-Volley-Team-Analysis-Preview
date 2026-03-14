// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — DataModeSelector
// Toggle a 3 stati: Grezzi | Pesati | Entrambi
// Long-press su "Pesati" → picker in-place per selezionare il profilo di peso
// ============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLongPress } from '../hooks/useLongPress';
import { useProfile } from '../context/ProfileContext';

/**
 * DataModeSelector — Selettore del modo dati.
 *
 * Props:
 *   mode       : 'raw' | 'weighted' | 'both'    — modo corrente
 *   onChange   : (mode: string) => void          — callback cambio modo
 *   compact    : boolean                         — layout compatto (per ChartWrapper inline)
 *   className  : string                          — classe CSS aggiuntiva
 *   hideEntrambi : boolean                       — nasconde il tasto Entrambi (es. in dashboard card)
 */
export default function DataModeSelector({
  mode = 'raw',
  onChange,
  compact = false,
  className = '',
  hideEntrambi = false,
}) {
  const { savedProfiles, activeWeightProfileId, setWeightProfile, canSeeMetric } = useProfile();
  const canSeeWeighted = canSeeMetric('mediaPond');

  // Picker popover
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);

  // Chiudi picker cliccando fuori
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [pickerOpen]);

  // Long-press su "Pesati" → apre picker
  const { handlers: lpHandlers, wrapClick: lpWrap } = useLongPress(() => {
    if (canSeeWeighted) setPickerOpen(v => !v);
  }, 600);

  const handleWeightedClick = useCallback(() => {
    // Se profilo non ha accesso, non fa nulla
    if (!canSeeWeighted) return;
    onChange('weighted');
  }, [canSeeWeighted, onChange]);

  // Stili pulsanti
  const baseBtn = compact
    ? 'text-[9px] px-1.5 py-0.5 rounded transition-all'
    : 'text-[10px] px-2 py-1 rounded-md transition-all';

  const activeRaw     = 'bg-sky-500/20 text-sky-300';
  const activeWeight  = 'bg-amber-500/20 text-amber-300';
  const activeBoth    = 'bg-emerald-500/20 text-emerald-300';
  const inactive      = 'text-gray-400 hover:text-gray-200';
  const disabled      = 'text-gray-600 cursor-not-allowed opacity-40';

  const activeWeightProfile = savedProfiles.find(p => p.id === activeWeightProfileId);

  return (
    <div className={`relative flex items-center ${className}`}>
      {/* Toggle group */}
      <div className={`flex items-center gap-0.5 p-0.5 rounded-lg border border-white/10 bg-white/[0.03] ${compact ? 'gap-0' : 'gap-1'}`}>
        {/* Grezzi */}
        <button
          onClick={() => onChange('raw')}
          className={`${baseBtn} ${mode === 'raw' ? activeRaw : inactive}`}
          title="Dati grezzi"
        >
          Grezzi
        </button>

        {/* Pesati — con long-press */}
        <div className="relative" ref={pickerRef}>
          <button
            {...lpHandlers}
            onClick={lpWrap(handleWeightedClick)}
            className={`${baseBtn} ${
              !canSeeWeighted
                ? disabled
                : mode === 'weighted'
                  ? activeWeight
                  : inactive
            }`}
            title={
              !canSeeWeighted
                ? 'Disponibile con profilo Pro'
                : 'Dati pesati · tieni premuto per scegliere la pesatura'
            }
          >
            Pesati
            {canSeeWeighted && mode === 'weighted' && activeWeightProfile && activeWeightProfile.id !== 'default' && (
              <span className="ml-1 text-[8px] text-amber-400/70 font-medium">
                {activeWeightProfile.name}
              </span>
            )}
          </button>

          {/* Picker popover */}
          {pickerOpen && canSeeWeighted && (
            <div className="absolute top-full mt-1 right-0 z-50 min-w-[160px] rounded-xl border border-white/10 bg-gray-900 shadow-xl p-1.5 space-y-0.5">
              <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest px-2 pb-1 border-b border-white/5 mb-1">
                Pesatura
              </div>
              {savedProfiles.length === 0 ? (
                <div className="text-[10px] text-gray-500 px-2 py-1">Nessuna pesatura salvata</div>
              ) : (
                savedProfiles.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setWeightProfile(p.id);
                      // Se non siamo già in weighted/both, passa a weighted
                      if (mode === 'raw') onChange('weighted');
                      setPickerOpen(false);
                    }}
                    className={`w-full text-left text-[10px] px-2 py-1.5 rounded-lg transition-all ${
                      p.id === activeWeightProfileId
                        ? 'bg-amber-500/20 text-amber-300 font-bold'
                        : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="mr-1">{p.id === 'default' ? '⚖️' : '📐'}</span>
                    {p.name}
                    {p.id === activeWeightProfileId && (
                      <span className="ml-1 text-[8px] text-amber-500">✓</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Entrambi */}
        {!hideEntrambi && (
          <button
            onClick={() => {
              if (!canSeeWeighted) return;
              onChange('both');
            }}
            className={`${baseBtn} ${
              !canSeeWeighted
                ? disabled
                : mode === 'both'
                  ? activeBoth
                  : inactive
            }`}
            title={
              !canSeeWeighted
                ? 'Disponibile con profilo Pro'
                : 'Mostra sia dati grezzi che pesati'
            }
          >
            Entrambi
          </button>
        )}
      </div>
    </div>
  );
}
