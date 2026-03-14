// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — useLongPress Hook
// Rileva long-press su un elemento (touch + mouse).
// Restituisce { handlers, wrapClick } per integrarlo con onClick esistenti.
// ============================================================================

import { useRef, useCallback } from 'react';

const DEFAULT_THRESHOLD = 600; // ms

/**
 * Hook per rilevare long-press.
 *
 * @param {() => void} onLongPress  — callback eseguita allo scattare del long-press
 * @param {number}     [threshold]  — ms di attesa prima di rilevare long-press (default 600)
 *
 * @returns {{
 *   handlers: {
 *     onMouseDown:  (e: MouseEvent)  => void,
 *     onMouseUp:    (e: MouseEvent)  => void,
 *     onMouseLeave: (e: MouseEvent)  => void,
 *     onTouchStart: (e: TouchEvent)  => void,
 *     onTouchEnd:   (e: TouchEvent)  => void,
 *   },
 *   wrapClick: (handler: Function) => (e: Event) => void
 * }}
 *
 * Uso:
 *   const { handlers, wrapClick } = useLongPress(() => setShowPicker(true));
 *   <button {...handlers} onClick={wrapClick(handleNormalClick)}>Pesati</button>
 */
export function useLongPress(onLongPress, threshold = DEFAULT_THRESHOLD) {
  const timerRef    = useRef(null);
  const firedRef    = useRef(false);   // true se il long-press è già scattato

  // Avvia il timer
  const start = useCallback((e) => {
    // Solo click primario (tasto sinistro)
    if (e.type === 'mousedown' && e.button !== 0) return;
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress(e);
    }, threshold);
  }, [onLongPress, threshold]);

  // Cancella il timer
  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handlers = {
    onMouseDown:  start,
    onMouseUp:    cancel,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd:   cancel,
  };

  /**
   * Wrappa un onClick esistente: lo esegue solo se il long-press NON è scattato.
   * Senza questo, dopo il long-press scatterebbe anche il click normale.
   */
  const wrapClick = useCallback(
    (handler) => (e) => {
      if (firedRef.current) {
        firedRef.current = false; // reset per prossima interazione
        return;
      }
      handler?.(e);
    },
    []
  );

  return { handlers, wrapClick };
}
