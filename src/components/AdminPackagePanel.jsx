// ============================================================================
// AdminPackagePanel — Gestione assegnazione Sezioni / Tab ai Pacchetti
//
// L'admin può decidere quale pacchetto (Base, Pro, Pro Max) include ciascuna
// sezione e ciascun sub-tab dell'app. I valori di default sono quelli
// hardcoded in SECTIONS / SECTION_TABS ma possono essere sovrascritti.
// La configurazione viene salvata su Firestore in users/_admin/content/package_config.
// ============================================================================

import React, { useState, useMemo, useCallback, useEffect } from 'react';

const PROFILES = [
  { id: 'base',   label: 'Base',    color: '#2563EB', bg: 'bg-blue-500/15',   border: 'border-blue-500/30',   text: 'text-blue-400'   },
  { id: 'pro',    label: 'Pro',     color: '#7C3AED', bg: 'bg-violet-500/15', border: 'border-violet-500/30', text: 'text-violet-400' },
  { id: 'promax', label: 'Pro Max', color: '#DC2626', bg: 'bg-red-500/15',    border: 'border-red-500/30',    text: 'text-red-400'    },
];
const PROFILE_ORDER = { base: 0, pro: 1, promax: 2 };

/**
 * Props:
 *   sections         — SECTIONS array (id, label, icon, minProfile)
 *   sectionTabs      — SECTION_TABS object { sectionId: [ { id, label, minProfile } ] }
 *   adminSectionIds  — array di id sezioni admin (da escludere)
 *   packageConfig    — { sections: {}, tabs: {} } — config corrente da Firestore
 *   onSave           — (config) => Promise<void>
 */
export default function AdminPackagePanel({
  sections = [],
  sectionTabs = {},
  adminSectionIds = [],
  packageConfig,
  onSave,
}) {
  // ─── Stato locale (copia editabile della config) ────────────────────────
  const [localSections, setLocalSections] = useState({});
  const [localTabs, setLocalTabs]         = useState({});
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [expandedSection, setExpandedSection] = useState(null);

  // Inizializza dallo stato props
  useEffect(() => {
    setLocalSections(packageConfig?.sections || {});
    setLocalTabs(packageConfig?.tabs || {});
  }, [packageConfig]);

  // Sezioni utente (escluse admin)
  const userSections = useMemo(
    () => sections.filter(s => !adminSectionIds.includes(s.id)),
    [sections, adminSectionIds],
  );

  // Risolvi il minProfile effettivo (override locale > hardcoded)
  const getEffectiveProfile = useCallback((sectionId, tabId) => {
    if (tabId) {
      const key = `${sectionId}__${tabId}`;
      if (localTabs[key]) return localTabs[key];
      // default dal SECTION_TABS hardcoded
      const tabs = sectionTabs[sectionId] || [];
      const tab = tabs.find(t => t.id === tabId);
      return tab?.minProfile || 'base';
    }
    if (localSections[sectionId]) return localSections[sectionId];
    const sec = sections.find(s => s.id === sectionId);
    return sec?.minProfile || 'base';
  }, [localSections, localTabs, sections, sectionTabs]);

  // ─── Handlers ──────────────────────────────────────────────────────────
  const handleSectionProfileChange = useCallback((sectionId, profile) => {
    setLocalSections(prev => ({ ...prev, [sectionId]: profile }));
    setSaved(false);
  }, []);

  const handleTabProfileChange = useCallback((sectionId, tabId, profile) => {
    const key = `${sectionId}__${tabId}`;
    setLocalTabs(prev => ({ ...prev, [key]: profile }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({ sections: localSections, tabs: localTabs });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('[AdminPackagePanel] save error:', err);
    } finally {
      setSaving(false);
    }
  }, [onSave, localSections, localTabs]);

  const handleReset = useCallback(() => {
    setLocalSections({});
    setLocalTabs({});
    setSaved(false);
  }, []);

  // Conta modifiche rispetto ai default
  const changeCount = useMemo(() => {
    return Object.keys(localSections).length + Object.keys(localTabs).length;
  }, [localSections, localTabs]);

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-100">Configurazione Pacchetti</h2>
          <p className="text-xs text-gray-500 mt-1">
            Assegna ogni sezione e sub-tab a un pacchetto. Le modifiche sovrascrivono i valori predefiniti dell'app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {changeCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              {changeCount} modific{changeCount === 1 ? 'a' : 'he'}
            </span>
          )}
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 transition-colors"
          >
            Ripristina default
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs rounded-lg font-medium transition-colors bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-60"
          >
            {saving ? 'Salvataggio…' : saved ? 'Salvato ✓' : 'Salva Configurazione'}
          </button>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 py-2">
        {PROFILES.map(p => (
          <div key={p.id} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${p.bg} ${p.border} border`} />
            <span className={`text-xs font-medium ${p.text}`}>{p.label}</span>
          </div>
        ))}
        <span className="text-[10px] text-gray-600 ml-2">
          Un pacchetto superiore include sempre i contenuti di quelli inferiori
        </span>
      </div>

      {/* Sezioni */}
      <div className="space-y-2">
        {userSections.map(section => {
          const tabs = sectionTabs[section.id] || [];
          const sectionProfile = getEffectiveProfile(section.id);
          const isExpanded = expandedSection === section.id;
          const isOverridden = !!localSections[section.id];
          const defaultProfile = section.minProfile || 'base';

          return (
            <div
              key={section.id}
              className="rounded-xl border border-white/6 bg-[#111827] overflow-hidden"
            >
              {/* Section row */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Expand toggle (only if has tabs) */}
                <button
                  onClick={() => tabs.length > 0 && setExpandedSection(prev => prev === section.id ? null : section.id)}
                  className={`w-5 h-5 flex items-center justify-center rounded text-gray-500 transition-transform ${
                    tabs.length > 0 ? 'hover:bg-white/5 cursor-pointer' : 'opacity-30 cursor-default'
                  }`}
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Section name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{section.label}</span>
                    <span className="text-[10px] text-gray-600 font-mono">{section.id}</span>
                    {isOverridden && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        modificato
                      </span>
                    )}
                  </div>
                  {tabs.length > 0 && (
                    <span className="text-[10px] text-gray-600">
                      {tabs.length} sub-tab
                    </span>
                  )}
                </div>

                {/* Default badge */}
                <span className="text-[10px] text-gray-600 mr-2">
                  default: {PROFILES.find(p => p.id === defaultProfile)?.label || defaultProfile}
                </span>

                {/* Profile selector */}
                <ProfileSelector
                  value={sectionProfile}
                  onChange={(p) => handleSectionProfileChange(section.id, p)}
                />
              </div>

              {/* Tabs (expanded) */}
              {isExpanded && tabs.length > 0 && (
                <div className="border-t border-white/5 bg-[#0d1117]">
                  {tabs.map(tab => {
                    const tabProfile = getEffectiveProfile(section.id, tab.id);
                    const tabKey = `${section.id}__${tab.id}`;
                    const isTabOverridden = !!localTabs[tabKey];
                    const tabDefault = tab.minProfile || 'base';

                    return (
                      <div
                        key={tab.id}
                        className="flex items-center gap-3 px-4 py-2.5 border-b border-white/3 last:border-b-0"
                      >
                        <div className="w-5" /> {/* indent spacer */}
                        <div className="w-px h-4 bg-white/10" /> {/* vertical line */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-300">{tab.label}</span>
                            <span className="text-[10px] text-gray-600 font-mono">{tab.id}</span>
                            {isTabOverridden && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                modificato
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-600 mr-2">
                          default: {PROFILES.find(p => p.id === tabDefault)?.label || tabDefault}
                        </span>
                        <ProfileSelector
                          value={tabProfile}
                          onChange={(p) => handleTabProfileChange(section.id, tab.id, p)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Riepilogo rapido */}
      <SummaryTable
        sections={userSections}
        sectionTabs={sectionTabs}
        getEffectiveProfile={getEffectiveProfile}
      />
    </div>
  );
}

// ─── ProfileSelector: toggle 3 pacchetti inline ───────────────────────────────
function ProfileSelector({ value, onChange }) {
  return (
    <div className="flex items-center rounded-lg border border-white/8 overflow-hidden">
      {PROFILES.map(p => {
        const isActive = value === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={`px-3 py-1 text-[11px] font-medium transition-all ${
              isActive
                ? `${p.bg} ${p.text} ${p.border}`
                : 'text-gray-600 hover:text-gray-400 hover:bg-white/3'
            }`}
            title={`Assegna a pacchetto ${p.label}`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── SummaryTable: riepilogo rapido per pacchetto ─────────────────────────────
function SummaryTable({ sections, sectionTabs, getEffectiveProfile }) {
  const summary = useMemo(() => {
    const result = { base: [], pro: [], promax: [] };
    for (const s of sections) {
      const p = getEffectiveProfile(s.id);
      result[p]?.push({ label: s.label, type: 'section' });

      const tabs = sectionTabs[s.id] || [];
      for (const t of tabs) {
        const tp = getEffectiveProfile(s.id, t.id);
        // Solo se il tab ha un livello diverso dalla sezione
        if (tp !== p) {
          result[tp]?.push({ label: `${s.label} › ${t.label}`, type: 'tab' });
        }
      }
    }
    return result;
  }, [sections, sectionTabs, getEffectiveProfile]);

  return (
    <div className="rounded-xl border border-white/6 bg-[#111827] p-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Riepilogo per Pacchetto
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PROFILES.map(p => (
          <div key={p.id} className="space-y-1">
            <div className={`text-xs font-semibold ${p.text} mb-2`}>
              {p.label}
              <span className="ml-1 text-gray-600 font-normal">
                ({summary[p.id]?.length || 0} elementi esclusivi)
              </span>
            </div>
            {(summary[p.id] || []).length === 0 ? (
              <p className="text-[10px] text-gray-600 italic">Nessun elemento esclusivo</p>
            ) : (
              (summary[p.id] || []).map((item, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${p.bg}`} />
                  <span className={`text-[11px] ${item.type === 'tab' ? 'text-gray-500' : 'text-gray-300'}`}>
                    {item.label}
                  </span>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-600 mt-3">
        Ogni pacchetto include anche tutti i contenuti dei pacchetti inferiori (Base ⊂ Pro ⊂ Pro Max).
      </p>
    </div>
  );
}
