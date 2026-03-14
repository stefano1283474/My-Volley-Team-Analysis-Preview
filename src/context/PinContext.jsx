// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Pin Context
// Gestisce la dashboard config (grafici pinnati) in modo condiviso tra
// tutti i componenti dell'app, senza prop-drilling profondo.
// ============================================================================

import React, { createContext, useContext } from 'react';

const PinContext = createContext(null);

/**
 * PinProvider — va wrappato intorno all'area principale dell'app in App.jsx.
 * Espone:
 *   dashboardConfig : string[]   — array ordinato degli ID grafico pinnati
 *   isPinned(id)    : boolean    — true se il grafico è nella dashboard
 *   togglePin(id)   : void       — aggiunge / rimuove dalla dashboard
 *   moveChart(id,d) : void       — sposta il grafico di d posizioni (±1)
 */
export function PinProvider({ dashboardConfig, onConfigChange, children }) {
  const isPinned = (id) => (dashboardConfig || []).includes(id);

  const togglePin = (id) => {
    const current = dashboardConfig || [];
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    onConfigChange?.(next);
  };

  const moveChart = (id, direction) => {
    const current = dashboardConfig || [];
    const idx = current.indexOf(id);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= current.length) return;
    const next = [...current];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    onConfigChange?.(next);
  };

  return (
    <PinContext.Provider value={{ dashboardConfig, isPinned, togglePin, moveChart }}>
      {children}
    </PinContext.Provider>
  );
}

/** Hook per usare il context nelle componenti figlie */
export function usePin() {
  return useContext(PinContext);
}
