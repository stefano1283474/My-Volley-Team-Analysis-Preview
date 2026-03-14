// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Profile Context
// Gestisce il profilo utente attivo (base | pro | promax) e le autorizzazioni
// associate in modo condiviso tra tutti i componenti dell'app.
// ============================================================================

import React, { createContext, useContext, useState, useCallback } from 'react';

const ProfileContext = createContext(null);

/**
 * Ordine numerico dei profili — usato per confronti >=
 * base=0, pro=1, promax=2
 */
export const PROFILE_ORDER = { base: 0, pro: 1, promax: 2 };

/**
 * Metadati per la UI
 */
export const PROFILE_META = {
  base: {
    label: 'Base',
    icon: '👤',
    color: 'text-gray-600 dark:text-gray-400',
    badgeClass: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    description: 'Efficacia + Efficienza',
  },
  pro: {
    label: 'Pro',
    icon: '⭐',
    color: 'text-blue-600 dark:text-blue-400',
    badgeClass: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
    description: 'Base + Media Ponderata',
  },
  promax: {
    label: 'Pro Max',
    icon: '🚀',
    color: 'text-purple-600 dark:text-purple-400',
    badgeClass: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300',
    description: 'Pro + AI Score + Esercizi & Drills',
  },
};

/**
 * Quali metriche sono visibili per ogni profilo
 * (ogni livello include quelle dei livelli inferiori)
 */
export const PROFILE_METRICS = {
  base:   ['efficacy', 'efficiency'],
  pro:    ['efficacy', 'efficiency', 'mediaPond'],
  promax: ['efficacy', 'efficiency', 'mediaPond', 'aiScore'],
};

/**
 * ProfileProvider — va wrappato intorno all'area principale dell'app in App.jsx.
 *
 * Props:
 *   activeProfile          : 'base' | 'pro' | 'promax'
 *   onProfileChange        : (profile: string) => void
 *   savedProfiles          : Array<{ id, name, matchWeights, fncConfig }>
 *   activeWeightProfileId  : string   — id del profilo peso attivo
 *   onWeightProfileChange  : (id: string) => void
 *
 * Espone (via useProfile()):
 *   activeProfile          : string        — profilo corrente
 *   profileAllows(min)     : boolean       — true se activeProfile >= min
 *   canSeeMetric(metric)   : boolean       — true se la metrica è accessibile
 *   allowedMetrics         : string[]      — elenco metriche accessibili
 *   setProfile(p)          : void          — cambia profilo (chiama onProfileChange)
 *   savedProfiles          : array         — pesature salvate
 *   activeWeightProfileId  : string        — id pesatura attiva
 *   setWeightProfile(id)   : void          — cambia pesatura (chiama onWeightProfileChange)
 */
export function ProfileProvider({
  activeProfile = 'base',
  onProfileChange,
  savedProfiles = [],
  activeWeightProfileId = 'default',
  onWeightProfileChange,
  children,
}) {
  /**
   * Controlla se il profilo corrente è almeno pari a `minProfile`.
   * @param {string} minProfile — 'base' | 'pro' | 'promax'
   * @returns {boolean}
   */
  const profileAllows = useCallback(
    (minProfile) => {
      const current = PROFILE_ORDER[activeProfile] ?? 0;
      const required = PROFILE_ORDER[minProfile] ?? 0;
      return current >= required;
    },
    [activeProfile]
  );

  /**
   * Controlla se una specifica metrica è accessibile.
   * @param {string} metric — es. 'efficacy', 'efficiency', 'mediaPond', 'aiScore'
   * @returns {boolean}
   */
  const canSeeMetric = useCallback(
    (metric) => (PROFILE_METRICS[activeProfile] || []).includes(metric),
    [activeProfile]
  );

  /** Array ordinato delle metriche accessibili per il profilo corrente */
  const allowedMetrics = PROFILE_METRICS[activeProfile] || ['efficacy', 'efficiency'];

  const setProfile = useCallback(
    (p) => {
      if (PROFILE_ORDER[p] !== undefined) {
        onProfileChange?.(p);
      }
    },
    [onProfileChange]
  );

  const setWeightProfile = useCallback(
    (id) => { onWeightProfileChange?.(id); },
    [onWeightProfileChange]
  );

  return (
    <ProfileContext.Provider
      value={{
        activeProfile, profileAllows, canSeeMetric, allowedMetrics, setProfile,
        savedProfiles, activeWeightProfileId, setWeightProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

/** Hook per usare il context nelle componenti figlie */
export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    // Fallback graceful se usato fuori dal provider (non dovrebbe mai accadere in prod)
    return {
      activeProfile: 'base',
      profileAllows: (min) => min === 'base',
      canSeeMetric: (m) => ['efficacy', 'efficiency'].includes(m),
      allowedMetrics: ['efficacy', 'efficiency'],
      setProfile: () => {},
      savedProfiles: [],
      activeWeightProfileId: 'default',
      setWeightProfile: () => {},
    };
  }
  return ctx;
}
