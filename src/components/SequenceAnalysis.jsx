// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Coach Brain (Chain Analysis)
// Analisi delle catene di gioco dalle quartine scout
// KPI: R/D→A conversion, side-out vs transizione, battuta→difesa,
//       rally lunghi, analisi rotazionale
// ============================================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend,
} from 'recharts';
import { COLORS } from '../utils/constants';

// ─── Constants ───────────────────────────────────────────────────────────────

const CHAIN_TABS = [
  { id: 'suggestions', label: 'Suggerimenti',      icon: '💡', tooltip: 'Segnali di allenamento generati automaticamente dalle catene di gioco: aree critiche e punti di forza' },
  { id: 'matrix',      label: 'Matrice R/D→A',     icon: '🔢', tooltip: 'Matrice di conversione: come ogni attaccante trasforma la qualità di ricezione/difesa in efficacia d\'attacco (ITA)' },
  { id: 'sideout',     label: 'Side-out / Trans.',  icon: '🔄', tooltip: 'Confronto efficacia attacco in fase di ricezione (side-out, rincorsa lunga) vs fase di difesa (transizione, rincorsa corta)' },
  { id: 'rotations',   label: 'Rotazioni',          icon: '⟳', tooltip: 'Side-out e break-point per ogni rotazione: individua le rotazioni deboli rispetto alla media squadra' },
  { id: 'serve_def',   label: 'Battuta → Difesa',   icon: '🎯', tooltip: 'Come la qualità della nostra battuta (B1–B5) influenza la qualità della difesa successiva degli avversari' },
  { id: 'rally_len',   label: 'Rally Lunghi',       icon: '⏱', tooltip: 'Efficacia attacco per durata del rally: individua cali di rendimento fisico o mentale nei rally prolungati (5+ azioni)' },
];

const PRIORITY_COLORS = {
  5: { bg: 'bg-red-500/10',    border: 'border-red-500/20',    text: 'text-red-400',    label: 'Critico'    },
  4: { bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  text: 'text-amber-400',  label: 'Importante' },
  3: { bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  text: 'text-amber-400',  label: 'Moderato'   },
  2: { bg: 'bg-sky-500/10',    border: 'border-sky-500/20',    text: 'text-sky-400',    label: 'Monitorare' },
  1: { bg: 'bg-green-500/10',  border: 'border-green-500/20',  text: 'text-green-400',  label: 'Positivo'   },
};

const CHAIN_TYPE_LABELS = {
  r_to_a:          { icon: '⬆ R→A',   color: 'text-sky-400',    badge: 'bg-sky-500/15 text-sky-400' },
  d_to_a:          { icon: '🔁 D→A',   color: 'text-orange-400', badge: 'bg-orange-500/15 text-orange-400' },
  transition_gap:  { icon: '⚡ Trans.', color: 'text-amber-400',  badge: 'bg-amber-500/15 text-amber-400' },
  serve_defense:   { icon: '🎯 B→D',   color: 'text-purple-400', badge: 'bg-purple-500/15 text-purple-400' },
  rally_length:    { icon: '⏱ Rally',  color: 'text-blue-400',   badge: 'bg-blue-500/15 text-blue-400' },
  rotation:        { icon: '⟳ Rot.',   color: 'text-teal-400',   badge: 'bg-teal-500/15 text-teal-400' },
};

// ─── Heatmap cell color ───────────────────────────────────────────────────────
// inputKey = 'R3'/'R4'/'R5'/'D3'/'D4'/'D5', outputKey = 'A1'..'A5'
function cellHeatColor(inputKey, outputKey, count, total) {
  if (!count || !total) return 'bg-white/3 text-gray-700';
  const pct = count / total;
  const inputVal = parseInt(inputKey[1]);
  const outputVal = parseInt(outputKey[1]);

  // High input + low output = BAD (red)
  if (inputVal >= 4 && outputVal <= 2) {
    if (pct > 0.25) return 'bg-red-500/30 text-red-300 font-bold';
    if (pct > 0.12) return 'bg-red-500/15 text-red-400';
    return 'bg-red-500/6 text-red-500/70';
  }
  // Low input + high output = GREAT (green)
  if (inputVal <= 3 && outputVal >= 4) {
    if (pct > 0.30) return 'bg-green-500/30 text-green-300 font-bold';
    if (pct > 0.15) return 'bg-green-500/15 text-green-400';
    return 'bg-green-500/6 text-green-500/70';
  }
  // High output regardless = good
  if (outputVal >= 4) {
    if (pct > 0.40) return 'bg-green-500/20 text-green-300 font-semibold';
    if (pct > 0.20) return 'bg-green-500/10 text-green-400';
    return 'bg-white/5 text-gray-300';
  }
  // Mid range
  if (pct > 0.35) return 'bg-white/10 text-gray-200 font-semibold';
  if (pct > 0.15) return 'bg-white/6 text-gray-300';
  return 'bg-white/3 text-gray-500';
}

function pct(v) { return v !== null && v !== undefined ? `${Math.round(v * 100)}%` : '—'; }
function pctN(v) { return v !== null && v !== undefined ? Math.round(v * 100) : null; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function totalInMatrix(m) {
  return Object.values(m).reduce((s, v) => s + v, 0);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SequenceAnalysis({ chainData, chainSuggestions, matches }) {
  const [activeTab, setActiveTab] = useState('suggestions');

  if (!chainData || matches.length < 2) {
    return (
      <div className="max-w-4xl mx-auto">
        <h2 className="text-xl font-bold text-white mb-2">Coach Brain</h2>
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-sm">
          <div className="text-4xl mb-3">⛓</div>
          <p>Serve almeno 2 partite per generare l'analisi delle catene di gioco.</p>
        </div>
      </div>
    );
  }

  const suggestions = chainSuggestions || [];

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-bold text-white">Coach Brain</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
            NUOVO
          </span>
        </div>
        <p className="text-sm text-gray-400">
          {matches.length} partite · analisi delle catene di gioco dalle quartine scout ·{' '}
          <span className={suggestions.filter(s => s.priority >= 4).length > 0 ? 'text-red-400' : 'text-green-400'}>
            {suggestions.filter(s => s.priority >= 4).length} segnali ad alta priorità
          </span>
          {' · '}
          <span className="text-green-400">{suggestions.filter(s => s.priority === 1).length} punti di forza</span>
        </p>
        <p className="text-[11px] text-gray-600 mt-0.5">
          KPI basati su R→A (side-out), D→A (transizione), catena battuta→difesa, rally lunghi e analisi per rotazione.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl flex-wrap"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {CHAIN_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.tooltip}
            className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-sky-500/15 text-sky-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Views */}
      {activeTab === 'suggestions' && (
        <SuggestionsView suggestions={suggestions} />
      )}
      {activeTab === 'matrix' && (
        <MatrixView rdToA={chainData.rdToA} />
      )}
      {activeTab === 'sideout' && (
        <SideOutView sideOutVsTransition={chainData.sideOutVsTransition} />
      )}
      {activeTab === 'rotations' && (
        <RotationsView rotationalChains={chainData.rotationalChains} />
      )}
      {activeTab === 'serve_def' && (
        <ServeDefView serveDefense={chainData.serveDefense} />
      )}
      {activeTab === 'rally_len' && (
        <RallyLengthView rallyLength={chainData.rallyLength} />
      )}
    </div>
  );
}

// ─── Suggerimenti View ────────────────────────────────────────────────────────

function SuggestionsView({ suggestions }) {
  const [typeFilter, setTypeFilter] = useState('all');

  const TYPE_FILTERS = [
    { id: 'all',            label: 'Tutti',           tooltip: 'Mostra tutti i segnali identificati dalle catene di gioco' },
    { id: 'negative',       label: 'Da lavorare',     tooltip: 'Segnali con priorità ≥ 3: aree che richiedono intervento specifico in allenamento' },
    { id: 'positive',       label: 'Punti di forza',  tooltip: 'Situazioni in cui la squadra o singole giocatrici eccellono — da valorizzare in gara' },
    { id: 'r_to_a',         label: 'R→A',             tooltip: 'Segnali sulla catena ricezione → alzata → attacco (fase side-out, rincorsa lunga da zona 1/6/5)' },
    { id: 'd_to_a',         label: 'D→A',             tooltip: 'Segnali sulla catena difesa → alzata → attacco (break-point, rincorsa corta da rete o da zona)' },
    { id: 'transition_gap', label: 'Transizione',     tooltip: 'Segnali sul gap di efficacia tra attacchi da ricezione (side-out) e da difesa (transizione) — > 20pp scarto' },
    { id: 'rotation',       label: 'Rotazioni',       tooltip: 'Segnali sulle rotazioni con side-out significativamente sotto la media squadra (> 14pp di scarto)' },
  ];

  const filtered = suggestions.filter(s => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'negative') return s.priority >= 3;
    if (typeFilter === 'positive') return s.priority === 1;
    return s.chainType === typeFilter;
  });

  const declines     = filtered.filter(s => s.priority >= 3);
  const improvements = filtered.filter(s => s.priority === 1);

  if (suggestions.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-sm text-gray-400">
          Nessun segnale significativo rilevato nelle catene di gioco. Dati insufficienti o performance equilibrate.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {TYPE_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setTypeFilter(f.id)}
            title={f.tooltip}
            className={`px-3 py-1 rounded-full text-xs transition-all border ${
              typeFilter === f.id
                ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                : 'text-gray-500 border-white/8 hover:text-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {declines.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-amber-400">
            ⚠ Aree di Intervento ({declines.length})
          </h3>
          {declines.map((s, i) => <ChainSuggestionCard key={i} s={s} />)}
        </div>
      )}

      {improvements.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-green-400 mt-2">
            ✦ Punti di Forza ({improvements.length})
          </h3>
          {improvements.map((s, i) => <ChainSuggestionCard key={i} s={s} />)}
        </div>
      )}

      {filtered.length === 0 && (
        <FilterEmptyState typeFilter={typeFilter} />
      )}

      {/* Weekly plan based on chain suggestions */}
      {typeFilter === 'all' && declines.length > 0 && (
        <ChainWeeklyPlan suggestions={declines} />
      )}
    </div>
  );
}

// Contextual empty state for each filter pill
const FILTER_EMPTY_MESSAGES = {
  transition_gap: {
    icon: '✓',
    title: 'Nessun gap critico side-out / transizione',
    body: 'Tutte le attaccanti hanno uno scarto inferiore al 20% tra efficacia in side-out ed efficacia in transizione. Le giocatrici mantengono un rendimento equilibrato nei due regimi di attacco — un segnale positivo.',
    hint: '→ Vai alla tab "Side-out / Trans." per il dettaglio comparativo per attaccante.',
    color: 'text-green-400',
    borderColor: 'border-green-500/20',
  },
  rotation: {
    icon: '✓',
    title: 'Nessuna rotazione significativamente sotto la media',
    body: 'Tutte le 6 rotazioni si trovano entro il margine normale dalla media squadra (< 14pp di scarto). Non ci sono rotazioni critiche che richiedano un intervento immediato.',
    hint: '→ Vai alla tab "Rotazioni" per vedere il dettaglio side-out e break-point per ogni rotazione.',
    color: 'text-green-400',
    borderColor: 'border-green-500/20',
  },
  r_to_a: {
    icon: 'ℹ',
    title: 'Nessun segnale R→A rilevato',
    body: 'Nessuna attaccante supera le soglie di alert sulle catene ricezione → attacco: nessuno spreca le ricezioni perfette (R5) in modo significativo, e nessuna trasforma le ricezioni difficili (R3) in modo eccezionale.',
    hint: '→ Vai alla tab "Matrice R/D→A" per il dettaglio completo per giocatrice.',
    color: 'text-sky-400',
    borderColor: 'border-sky-500/20',
  },
  d_to_a: {
    icon: 'ℹ',
    title: 'Nessun segnale D→A rilevato',
    body: 'Nessuna attaccante supera le soglie di alert sulle catene difesa → attacco: le conversioni D3→A e D5→A rientrano nella norma.',
    hint: '→ Vai alla tab "Matrice R/D→A" → Transizione (D→A) per il dettaglio.',
    color: 'text-orange-400',
    borderColor: 'border-orange-500/20',
  },
  default: {
    icon: '—',
    title: 'Nessun segnale con questo filtro',
    body: 'Non sono stati identificati segnali significativi per questa categoria con i dati attuali.',
    hint: 'Prova il filtro "Tutti" per vedere tutti i segnali disponibili.',
    color: 'text-gray-400',
    borderColor: 'border-white/10',
  },
};

function FilterEmptyState({ typeFilter }) {
  const cfg = FILTER_EMPTY_MESSAGES[typeFilter] || FILTER_EMPTY_MESSAGES.default;
  return (
    <div className={`glass-card p-5 border-l-2 ${cfg.borderColor}`}>
      <div className="flex items-start gap-3">
        <span className={`text-xl mt-0.5 flex-shrink-0 ${cfg.color}`}>{cfg.icon}</span>
        <div>
          <p className={`text-sm font-semibold mb-1 ${cfg.color}`}>{cfg.title}</p>
          <p className="text-xs text-gray-400 leading-relaxed mb-2">{cfg.body}</p>
          <p className="text-[11px] text-gray-500 italic">{cfg.hint}</p>
        </div>
      </div>
    </div>
  );
}

function ChainSuggestionCard({ s }) {
  const [expanded, setExpanded] = useState(false);
  const [showInlineDetails, setShowInlineDetails] = useState(false);
  const [selectedOutcomeKey, setSelectedOutcomeKey] = useState('');
  const color = PRIORITY_COLORS[s.priority] || PRIORITY_COLORS[2];
  const chainLabel = CHAIN_TYPE_LABELS[s.chainType] || {};
  const hasDetails = Object.values(s.chainData?.detailsByOutcome || {}).some(list => Array.isArray(list) && list.length > 0);

  return (
    <div className={`rounded-xl p-4 border ${color.border} ${color.bg}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Tags */}
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            {s.playerNumber && (
              <span className="text-[10px] font-mono text-sky-400">#{s.playerNumber}</span>
            )}
            {s.role && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{s.role}</span>
            )}
            <span className={`badge ${color.bg} ${color.text}`}>{color.label}</span>
            {chainLabel.badge && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${chainLabel.badge}`}>
                {chainLabel.icon}
              </span>
            )}
            {s.rotation && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400">
                Rotazione {s.rotation}
              </span>
            )}
          </div>

          {/* Message */}
          <p className="text-sm text-gray-200 leading-relaxed">{s.message}</p>

          {/* Action */}
          {s.action && (
            <p className="text-xs text-gray-400 mt-2 flex gap-1">
              <span className="text-sky-400 flex-shrink-0">→</span>
              {s.action}
            </p>
          )}

          {/* Chain data detail toggle */}
          {s.chainData && (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => {
                  setExpanded(v => {
                    const next = !v;
                    if (!next) {
                      setShowInlineDetails(false);
                      setSelectedOutcomeKey('');
                    }
                    return next;
                  });
                }}
                title="Espandi per vedere i dati numerici della catena di gioco alla base di questo segnale"
                className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
              >
                <span>{expanded ? '▼' : '▶'}</span>
                <span>{expanded ? 'Nascondi dettaglio' : 'Vedi dati catena'}</span>
              </button>
              {hasDetails && (
                <button
                  onClick={() => {
                    setExpanded(true);
                    setShowInlineDetails(v => !v);
                    setSelectedOutcomeKey('');
                  }}
                  className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
                >
                  <span>{showInlineDetails ? '▼' : '▶'}</span>
                  <span>{showInlineDetails ? 'Nascondi dettagli' : 'Dettagli'}</span>
                </button>
              )}
            </div>
          )}

          {expanded && s.chainData && (
            <ChainDataDetail
              cd={s.chainData}
              chainType={s.chainType}
              showDetails={showInlineDetails}
              selectedOutcomeKey={selectedOutcomeKey}
              onSelectOutcomeKey={(key) => {
                setExpanded(true);
                setShowInlineDetails(true);
                setSelectedOutcomeKey(key);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ChainDataDetail({ cd, chainType, showDetails = false, selectedOutcomeKey = '', onSelectOutcomeKey = null }) {
  const detailRefs = useRef({});
  useEffect(() => {
    if (chainType !== 'r_to_a' && chainType !== 'd_to_a') return;
    if (!showDetails || !selectedOutcomeKey) return;
    const el = detailRefs.current[selectedOutcomeKey];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [chainType, showDetails, selectedOutcomeKey]);

  if (chainType === 'r_to_a' || chainType === 'd_to_a') {
    const entries = Object.entries(cd.values || {}).sort(([a], [b]) => b.localeCompare(a));
    const tot = cd.total || 1;
    const detailsByOutcome = cd.detailsByOutcome || {};

    return (
      <div className="mt-2 pt-2 border-t border-white/5">
        <p className="text-[10px] text-gray-500 mb-1">{cd.label} — distribuzione ({tot} attacchi)</p>
        <div className="flex gap-2 flex-wrap">
          {entries.map(([aKey, cnt]) => (
            <button
              key={aKey}
              type="button"
              onClick={() => onSelectOutcomeKey && onSelectOutcomeKey(aKey)}
              className="text-center"
              style={{ outline: 'none' }}
              disabled={!detailsByOutcome[aKey]?.length}
              title={detailsByOutcome[aKey]?.length ? `Apri dettagli ${aKey}` : `Nessun dettaglio ${aKey}`}
            >
              <div className={`text-xs px-2 py-0.5 rounded font-semibold ${cellHeatColor(
                cd.label?.split('→')[0] || 'R5', aKey, cnt, tot
              )} ${selectedOutcomeKey === aKey ? 'ring-1 ring-sky-400/60' : ''} ${detailsByOutcome[aKey]?.length ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
                {aKey}: {cnt}
              </div>
              <div className="text-[9px] text-gray-600">{Math.round(cnt/tot*100)}%</div>
            </button>
          ))}
        </div>
        {showDetails && (
          <div className="mt-2 space-y-2">
            {entries.map(([aKey]) => {
              const details = detailsByOutcome[aKey] || [];
              if (!details.length) return null;
              return (
                <div
                  key={aKey}
                  ref={(el) => { if (el) detailRefs.current[aKey] = el; }}
                  className={`rounded-lg border bg-black/20 overflow-hidden ${selectedOutcomeKey === aKey ? 'border-sky-400/60 ring-1 ring-sky-400/30' : 'border-white/10'}`}
                >
                  <div className="px-2 py-1 text-[10px] font-semibold text-gray-300 bg-white/[0.03] border-b border-white/10">
                    {aKey} · {details.length} rally
                  </div>
                  <div className="max-h-44 overflow-y-auto divide-y divide-white/5">
                    {details.map((d, idx) => (
                      <div key={`${aKey}-${idx}`} className="px-2 py-1.5 text-[10px] text-gray-300">
                        <p className="text-gray-400">{d.match} · Set {d.set || '-'} · {d.score}</p>
                        <p className="text-gray-500">{d.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  if (chainType === 'transition_gap') {
    return (
      <div className="mt-2 pt-2 border-t border-white/5 flex gap-6 text-xs">
        <div>
          <span className="text-gray-500">Side-out:</span>{' '}
          <span className="text-sky-400 font-semibold">{pct(cd.sideOut?.efficacy)}</span>
          <span className="text-gray-600 ml-1">({cd.sideOut?.total} att.)</span>
        </div>
        <div>
          <span className="text-gray-500">Transizione:</span>{' '}
          <span className="text-orange-400 font-semibold">{pct(cd.transition?.efficacy)}</span>
          <span className="text-gray-600 ml-1">({cd.transition?.total} att.)</span>
        </div>
        <div>
          <span className="text-gray-500">Gap:</span>{' '}
          <span className={cd.gap > 0 ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>
            {cd.gap > 0 ? '+' : ''}{Math.round(cd.gap * 100)}pp
          </span>
        </div>
      </div>
    );
  }
  return null;
}

// ─── Matrice R/D → A ──────────────────────────────────────────────────────────

function MatrixView({ rdToA }) {
  const [sortBy, setSortBy] = useState('totalAttacks');

  if (!rdToA || Object.keys(rdToA).length === 0) {
    return <EmptyState msg="Nessun dato sufficiente per la matrice di conversione." />;
  }

  const players = Object.entries(rdToA)
    .filter(([, p]) => p.totalAttacks >= 6)
    .sort(([, a], [, b]) => {
      if (sortBy === 'itaNet') return b.itaNet - a.itaNet;
      if (sortBy === 'itaNeg') return b.itaNegative - a.itaNegative;
      return b.totalAttacks - a.totalAttacks;
    });

  if (players.length === 0) {
    return <EmptyState msg="Dati insufficienti: servono almeno 6 attacchi per ogni attaccante analizzata." />;
  }

  const R_KEYS = ['R5', 'R4', 'R3'];
  const D_KEYS = ['D5', 'D4', 'D3'];
  const A_KEYS = ['A5', 'A4', 'A3', 'A2', 'A1'];

  return (
    <div className="space-y-5">
      {/* Sort & Legend */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Ordina per:</span>
          {[
            ['totalAttacks','Attacchi tot.','Ordina per volume totale di attacchi analizzati per attaccante'],
            ['itaNet',      'ITA netto',    'ITA netto = (conversioni positive − negative) / totale attacchi. Misura la capacità di trasformare la qualità R/D in efficacia d\'attacco'],
            ['itaNeg',      'Sprechi',      'Ordina per maggior numero di sprechi: chi trasforma più spesso palle facili (R5/D5) in attacchi negativi (A1/A2)'],
          ].map(([k,l,tip]) => (
            <button key={k} onClick={() => setSortBy(k)} title={tip}
              className={`text-[11px] px-2 py-0.5 rounded transition-all border ${sortBy===k ? 'border-sky-500/30 bg-sky-500/10 text-sky-400' : 'border-white/8 text-gray-500 hover:text-gray-300'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">Spreco (alto→basso)</span>
          <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">Trasforma (basso→alto)</span>
        </div>
      </div>

      {players.map(([pNum, pd]) => (
        <PlayerMatrixCard key={pNum} pNum={pNum} pd={pd} rKeys={R_KEYS} dKeys={D_KEYS} aKeys={A_KEYS} />
      ))}

      <div className="glass-card p-4">
        <p className="text-xs text-gray-400 font-semibold mb-1">Legenda ITA (Indice di Trasformazione Attaccante)</p>
        <p className="text-[11px] text-gray-500">
          <span className="text-green-400 font-semibold">ITA positivo</span>: trasforma palle difficili (R3/D3) in attacchi efficaci (A4/A5). &nbsp;
          <span className="text-red-400 font-semibold">ITA negativo</span>: spreca palle perfette (R5/D5) in attacchi falliti (A1/A2). &nbsp;
          ITA netto = (positivi − negativi) / totale attacchi.
        </p>
      </div>
    </div>
  );
}

function PlayerMatrixCard({ pNum, pd, rKeys, dKeys, aKeys }) {
  const [showTransition, setShowTransition] = useState(false);
  const source = showTransition ? pd.transition : pd.sideOut;
  const keys = showTransition ? dKeys : rKeys;
  const prefix = showTransition ? 'D' : 'R';

  const itaColor = pd.itaNet > 0.05 ? 'text-green-400' : pd.itaNet < -0.05 ? 'text-red-400' : 'text-gray-400';

  return (
    <div className="glass-card p-4">
      {/* Player header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-sky-400">#{pNum}</span>
          <span className="text-sm font-semibold text-white">{pd.name}</span>
          <span className="text-[10px] text-gray-500">{pd.totalAttacks} attacchi analizzati</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-500">
            ITA netto: <span className={`font-semibold ${itaColor}`}>
              {pd.itaNet > 0 ? '+' : ''}{Math.round(pd.itaNet * 100)}%
            </span>
            <span className="text-gray-600 ml-1">
              ({pd.itaPositive}↑ / {pd.itaNegative}↓)
            </span>
          </span>
          <div className="flex rounded-lg overflow-hidden border border-white/10 text-[10px]">
            <button
              onClick={() => setShowTransition(false)}
              title="Mostra la matrice degli attacchi in fase side-out: ricezione → alzata → attacco (rincorsa lunga da zona 1/6/5)"
              className={`px-2 py-0.5 transition-all ${!showTransition ? 'bg-sky-500/20 text-sky-400' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Side-out (R→A)
            </button>
            <button
              onClick={() => setShowTransition(true)}
              title="Mostra la matrice degli attacchi in fase di transizione: difesa → alzata → attacco (rincorsa corta da rete o da zona)"
              className={`px-2 py-0.5 transition-all ${showTransition ? 'bg-orange-500/20 text-orange-400' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Transizione (D→A)
            </button>
          </div>
        </div>
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr>
              <th className="text-left text-gray-500 pr-3 pb-1.5 font-medium w-16">
                {prefix}↓ / A→
              </th>
              {aKeys.map(a => (
                <th key={a} className="text-center pb-1.5 font-medium text-gray-400 px-1 min-w-[52px]">
                  <span>{a}</span>
                  <div className="text-[9px] text-gray-600 font-normal">
                    {a === 'A5' ? 'punto' : a === 'A4' ? 'freeball' : a === 'A3' ? 'bagher' : a === 'A2' ? 'palleggio' : 'errore'}
                  </div>
                </th>
              ))}
              <th className="text-center pb-1.5 font-medium text-gray-500 px-1">TOT</th>
            </tr>
          </thead>
          <tbody>
            {keys.map(rKey => {
              const row = source[rKey] || {};
              const rowTotal = totalInMatrix(row);
              const desc = rKey[1] === '5' ? 'vicino' : rKey[1] === '4' ? 'staccato' : 'bagher';
              return (
                <tr key={rKey}>
                  <td className="pr-3 py-1 text-gray-400 font-medium">
                    {rKey}
                    <div className="text-[9px] text-gray-600">{desc}</div>
                  </td>
                  {aKeys.map(aKey => {
                    const cnt = row[aKey] || 0;
                    return (
                      <td key={aKey} className="px-1 py-1 text-center">
                        {rowTotal > 0 && cnt > 0 ? (
                          <div className={`rounded px-1 py-0.5 text-[11px] ${cellHeatColor(rKey, aKey, cnt, rowTotal)}`}>
                            {cnt}
                            <div className="text-[9px]">{Math.round(cnt/rowTotal*100)}%</div>
                          </div>
                        ) : (
                          <div className="text-gray-700 text-center">—</div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-1 py-1 text-center text-gray-500 font-semibold">
                    {rowTotal > 0 ? rowTotal : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Side-out vs Transizione View ─────────────────────────────────────────────

function SideOutView({ sideOutVsTransition }) {
  if (!sideOutVsTransition || Object.keys(sideOutVsTransition).length === 0) {
    return <EmptyState msg="Nessun dato sufficiente per il confronto side-out / transizione." />;
  }

  const players = Object.entries(sideOutVsTransition)
    .filter(([, p]) => p.totalAttacks >= 8 && p.sideOut.total >= 4 && p.transition.total >= 4)
    .sort(([, a], [, b]) => (b.gap || 0) - (a.gap || 0));

  if (players.length === 0) {
    return <EmptyState msg="Dati insufficienti: servono almeno 4 attacchi per ogni fase per ogni attaccante." />;
  }

  // Chart data
  const chartData = players.map(([pNum, pd]) => ({
    name: pd.name,
    sideOut: pctN(pd.sideOut.efficacy),
    transizione: pctN(pd.transition.efficacy),
    gap: pctN(pd.gap),
  }));

  const avgSO = players.reduce((s, [, p]) => s + (p.sideOut.efficacy || 0), 0) / players.length;
  const avgTR = players.reduce((s, [, p]) => s + (p.transition.efficacy || 0), 0) / players.length;

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Media Side-out" value={pct(avgSO)} color="text-sky-400" sub="Tutti gli attaccanti" />
        <StatTile label="Media Transizione" value={pct(avgTR)} color="text-orange-400" sub="Tutti gli attaccanti" />
        <StatTile label="Gap Medio" value={`${Math.round((avgSO - avgTR) * 100)}pp`}
          color={avgSO > avgTR ? 'text-amber-400' : 'text-green-400'}
          sub={avgSO > avgTR ? 'Side-out predomina' : 'Transizione predomina'} />
      </div>

      {/* Bar chart */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Confronto per attaccante</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barSize={14} barGap={2} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
              formatter={(val, name) => [`${val}%`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
            <ReferenceLine y={Math.round(avgSO * 100)} stroke="#38bdf8" strokeDasharray="4 4" strokeOpacity={0.4} />
            <ReferenceLine y={Math.round(avgTR * 100)} stroke="#fb923c" strokeDasharray="4 4" strokeOpacity={0.4} />
            <Bar dataKey="sideOut" name="Side-out" fill="#38bdf8" radius={[3, 3, 0, 0]} />
            <Bar dataKey="transizione" name="Transizione" fill="#fb923c" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Player rows */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Dettaglio per attaccante</h3>
        {players.map(([pNum, pd]) => {
          const gapAbs = Math.abs(pd.gap || 0);
          const gapColor = (pd.gap || 0) > 0.20 ? 'text-red-400'
            : (pd.gap || 0) < -0.15 ? 'text-green-400'
            : 'text-gray-400';
          const soW = pctN(pd.sideOut.efficacy) || 0;
          const trW = pctN(pd.transition.efficacy) || 0;
          const maxW = Math.max(soW, trW, 1);

          return (
            <div key={pNum} className="glass-card p-3">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-sky-400">#{pNum}</span>
                  <span className="text-sm font-semibold text-white">{pd.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-gray-500">
                    Side-out: <span className="text-sky-400 font-semibold">{pct(pd.sideOut.efficacy)}</span>
                    <span className="text-gray-600 ml-1">({pd.sideOut.total})</span>
                  </span>
                  <span className="text-gray-500">
                    Trans.: <span className="text-orange-400 font-semibold">{pct(pd.transition.efficacy)}</span>
                    <span className="text-gray-600 ml-1">({pd.transition.total})</span>
                  </span>
                  <span className={`font-semibold ${gapColor}`}>
                    {(pd.gap || 0) > 0 ? '▲' : '▼'} {Math.round(gapAbs * 100)}pp
                  </span>
                </div>
              </div>
              {/* Bar visualization */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-20">Side-out</span>
                  <div className="flex-1 h-3 rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-sky-500/60 transition-all"
                      style={{ width: `${(soW / maxW) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-sky-400 w-8 text-right">{soW}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-20">Transizione</span>
                  <div className="flex-1 h-3 rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-orange-500/60 transition-all"
                      style={{ width: `${(trW / maxW) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-orange-400 w-8 text-right">{trW}%</span>
                </div>
              </div>
              {gapAbs > 0.20 && (
                <p className="text-[10px] text-amber-400 mt-1.5">
                  {(pd.gap || 0) > 0
                    ? `⚠ Gap significativo: ${Math.round((pd.gap||0)*100)}pp in meno in transizione → lavorare sulla rincorsa da rete.`
                    : `✦ Più forte in transizione: valorizzare nei break-point.`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <InfoBox text="Side-out = attacchi su fase ricezione (partenza da linea di fondo). Transizione = attacchi su fase battuta dopo aver difeso (partenza da rete o difesa corta). Le due fasi richiedono meccaniche di rincorsa completamente diverse." />
    </div>
  );
}

// ─── Rotazioni View ───────────────────────────────────────────────────────────

function RotationsView({ rotationalChains }) {
  if (!rotationalChains || Object.keys(rotationalChains.rotations || {}).length === 0) {
    return <EmptyState msg="Nessun dato rotazionale sufficiente." />;
  }

  const { rotations, avgSideOut, avgBreakPoint } = rotationalChains;
  const sortedRots = Object.values(rotations).sort((a, b) => a.rotation - b.rotation);

  // Chart data
  const chartData = sortedRots.map(r => ({
    name: `Rot. ${r.rotation}`,
    sideOut: pctN(r.sideOut.pct),
    breakPoint: pctN(r.breakPoint.pct),
    transizione: pctN(r.transition.pct),
    soTot: r.sideOut.total,
    bpTot: r.breakPoint.total,
  }));

  return (
    <div className="space-y-5">
      {/* Averages */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Media Side-out" value={pct(avgSideOut)} color="text-sky-400" sub="Tutte le rotazioni" />
        <StatTile label="Media Break-point" value={pct(avgBreakPoint)} color="text-amber-400" sub="Tutte le rotazioni" />
      </div>

      {/* Bar chart */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Side-out e Break-point per rotazione</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barSize={16} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
              formatter={(val, name) => [`${val !== null ? val + '%' : '—'}`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
            {avgSideOut !== null && (
              <ReferenceLine y={Math.round(avgSideOut * 100)} stroke="#38bdf8" strokeDasharray="4 4" strokeOpacity={0.5} />
            )}
            {avgBreakPoint !== null && (
              <ReferenceLine y={Math.round(avgBreakPoint * 100)} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5} />
            )}
            <Bar dataKey="sideOut" name="Side-out" radius={[3,3,0,0]}>
              {chartData.map((entry, i) => {
                const pctVal = entry.sideOut;
                const avg = pctN(avgSideOut);
                const isWeak = avg !== null && pctVal !== null && pctVal < avg - 10;
                return <Cell key={i} fill={isWeak ? '#f87171' : '#38bdf8'} opacity={0.7} />;
              })}
            </Bar>
            <Bar dataKey="breakPoint" name="Break-point" fill="#f59e0b" radius={[3,3,0,0]} opacity={0.7} />
          </BarChart>
        </ResponsiveContainer>
        {avgSideOut !== null && (
          <p className="text-[10px] text-gray-500 mt-1">Linee trattegiate = media squadra. Barre rosse = rotazioni significativamente sotto media.</p>
        )}
      </div>

      {/* Rotation detail cards */}
      <div className="grid grid-cols-2 gap-3">
        {sortedRots.map(r => {
          const isWeak = avgSideOut !== null && r.sideOut.pct !== null && r.sideOut.pct < avgSideOut - 0.12;
          const isStrong = avgSideOut !== null && r.sideOut.pct !== null && r.sideOut.pct > avgSideOut + 0.12;
          return (
            <div key={r.rotation}
              className={`glass-card p-3 border ${isWeak ? 'border-red-500/20' : isStrong ? 'border-green-500/20' : 'border-white/5'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-white">Rotazione {r.rotation}</span>
                {isWeak && <span className="text-[10px] text-red-400 font-semibold">⚠ Debole</span>}
                {isStrong && <span className="text-[10px] text-green-400 font-semibold">✦ Forte</span>}
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Side-out</span>
                  <span className={`font-semibold ${isWeak ? 'text-red-400' : isStrong ? 'text-green-400' : 'text-sky-400'}`}>
                    {pct(r.sideOut.pct)}
                  </span>
                  <span className="text-gray-600">{r.sideOut.total} rally</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Break-point</span>
                  <span className="text-amber-400 font-semibold">{pct(r.breakPoint.pct)}</span>
                  <span className="text-gray-600">{r.breakPoint.total} rally</span>
                </div>
                {r.transition.total > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Transizione</span>
                    <span className="text-orange-400 font-semibold">{pct(r.transition.pct)}</span>
                    <span className="text-gray-600">{r.transition.total} azioni</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <InfoBox text="Side-out: % punti vinti quando si riceve. Break-point: % punti vinti quando si serve. Transizione: % punti vinti dopo una catena difesa→attacco in fase break-point. Le rotazioni rosse richiedono drill specifici con la configurazione di campo reale." />
    </div>
  );
}

// ─── Battuta → Difesa View ────────────────────────────────────────────────────

function ServeDefView({ serveDefense }) {
  if (!serveDefense || !serveDefense.byServe) {
    return <EmptyState msg="Nessun dato sufficiente per l'analisi battuta→difesa." />;
  }

  const { byServe, goodServeDefenseScore } = serveDefense;

  const chartData = ['B1','B2','B3','B4','B5'].map(key => {
    const s = byServe[key] || {};
    return {
      name: key,
      serveLabel: key === 'B5' ? 'Ace' : key === 'B4' ? 'Freeball' : key === 'B3' ? 'Bagher' : key === 'B2' ? 'Palleggio' : 'Errore',
      tot: s.total || 0,
      defRagg: s.defTotal || 0,
      defPos: pctN(s.defPosPct),
      defPosPct: s.defPosPct,
    };
  }).filter(d => d.tot > 0);

  const b4 = byServe['B4'] || {};
  const b5 = byServe['B5'] || {};
  const b1 = byServe['B1'] || {};
  const b2 = byServe['B2'] || {};

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          label="Difesa su battute aggressive (B4/B5)"
          value={goodServeDefenseScore !== null ? pct(goodServeDefenseScore) : '—'}
          color={goodServeDefenseScore !== null && goodServeDefenseScore >= 0.4 ? 'text-green-400' : 'text-amber-400'}
          sub={goodServeDefenseScore !== null && goodServeDefenseScore < 0.4 ? '⚠ Da migliorare' : 'Nella norma'}
        />
        <StatTile
          label="Battute B4/B5 totali"
          value={String((b4.total || 0) + (b5.total || 0))}
          color="text-sky-400"
          sub="Battute aggressive"
        />
        <StatTile
          label="Battute B1/B2 (errore/debole)"
          value={String((b1.total || 0) + (b2.total || 0))}
          color="text-red-400"
          sub="Battute poco efficaci"
        />
      </div>

      {/* Bar chart */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-white mb-1">Difesa positiva (D4/D5) per qualità battuta precedente</h3>
        <p className="text-[11px] text-gray-500 mb-3">
          Mostra: dato le nostre battute di un certo livello, qual è la % di difese positive nella risposta avversaria.
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickFormatter={(v) => chartData.find(d => d.name === v)?.serveLabel || v} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
              formatter={(val, name, props) => {
                const d = props?.payload;
                return [`${val !== null ? val + '%' : '—'} (su ${d?.defRagg || 0} difese)`, 'Difesa D4/D5'];
              }}
            />
            <Bar dataKey="defPos" name="Difesa D4/D5 %" radius={[4,4,0,0]}>
              {chartData.map((entry, i) => {
                const isGoodServe = entry.name === 'B4' || entry.name === 'B5';
                const isLow = entry.defPosPct !== null && entry.defPosPct < 0.35;
                return <Cell key={i} fill={isGoodServe && isLow ? '#f87171' : isGoodServe ? '#34d399' : '#6366f1'} opacity={0.8} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table detail */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Dettaglio per livello di battuta</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/5">
              <th className="text-left pb-2 font-medium">Battuta</th>
              <th className="text-left pb-2 font-medium">Significato</th>
              <th className="text-right pb-2 font-medium">Totale rally</th>
              <th className="text-right pb-2 font-medium">Difese raggiunte</th>
              <th className="text-right pb-2 font-medium">Difesa D4/D5</th>
              <th className="text-right pb-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {['B5','B4','B3','B2','B1'].map(key => {
              const s = byServe[key] || {};
              const isKey = key === 'B4' || key === 'B5';
              return (
                <tr key={key} className={`border-b border-white/3 ${isKey ? 'bg-white/[0.02]' : ''}`}>
                  <td className="py-2 font-semibold text-white">{key}</td>
                  <td className="py-2 text-gray-400">
                    {key==='B5'?'Ace (punto diretto)':key==='B4'?'Avv. da bagher':key==='B3'?'Avv. da palleggio (mediocre)':key==='B2'?'Avv. da palleggio (buono)':'Errore'}
                  </td>
                  <td className="py-2 text-right text-gray-300">{s.total || 0}</td>
                  <td className="py-2 text-right text-gray-300">
                    {s.defTotal || 0}
                    {s.total > 0 && <span className="text-gray-600 ml-1">({pct(s.defReachedPct)})</span>}
                  </td>
                  <td className={`py-2 text-right font-semibold ${
                    s.defPosPct === null ? 'text-gray-600'
                    : isKey && s.defPosPct < 0.4 ? 'text-red-400'
                    : s.defPosPct >= 0.5 ? 'text-green-400'
                    : 'text-gray-300'
                  }`}>
                    {s.defPosPct !== null ? pct(s.defPosPct) : '—'}
                  </td>
                  <td className="py-2 text-right text-gray-500">
                    {isKey && s.defPosPct !== null && s.defPosPct < 0.4 ? '⚠ bassa' :
                     isKey ? '✓ ok' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <InfoBox text="L'analisi misura: dopo una nostra battuta di livello X, con che % la nostra difesa successiva è positiva (D4/D5)? Su B4/B5 l'avversario riceve male e attacca in modo prevedibile — la nostra difesa dovrebbe essere più alta. Un valore basso su B4/B5 segnala un problema di posizionamento difensivo post-battuta." />
    </div>
  );
}

// ─── Rally Lunghi View ────────────────────────────────────────────────────────

function RallyLengthView({ rallyLength }) {
  if (!rallyLength) {
    return <EmptyState msg="Nessun dato sufficiente per l'analisi dei rally lunghi." />;
  }

  const { team, players } = rallyLength;

  const teamChartData = [
    { name: 'Corto (1-2)', val: pctN(team.short.pct), tot: team.short.total },
    { name: 'Medio (3-4)', val: pctN(team.medium.pct), tot: team.medium.total },
    { name: 'Lungo (5+)', val: pctN(team.long.pct), tot: team.long.total },
  ];

  const playerRows = Object.entries(players || {})
    .filter(([, p]) => (p.medium?.total || 0) >= 5 && (p.long?.total || 0) >= 3)
    .sort(([, a], [, b]) => (b.drop || 0) - (a.drop || 0));

  return (
    <div className="space-y-5">
      {/* Team chart */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-white mb-1">Squadra: efficacia attacco per lunghezza rally</h3>
        <p className="text-[11px] text-gray-500 mb-3">% attacchi positivi (A4/A5) in base alla durata del rally</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={teamChartData} barSize={40}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} domain={[0, 100]} unit="%" />
            <Tooltip
              contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
              formatter={(val, name, props) => [`${val}% (${props.payload.tot} att.)`, 'Efficacia']}
            />
            <Bar dataKey="val" name="Efficacia A4/A5" radius={[4,4,0,0]}>
              {teamChartData.map((entry, i) => (
                <Cell key={i} fill={i === 2 ? '#f59e0b' : '#38bdf8'} opacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Team stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Rally corti (1-2 az.)" value={pct(team.short.pct)} color="text-sky-400"
          sub={`${team.short.total} attacchi`} />
        <StatTile label="Rally medi (3-4 az.)" value={pct(team.medium.pct)} color="text-blue-400"
          sub={`${team.medium.total} attacchi`} />
        <StatTile label="Rally lunghi (5+ az.)" value={pct(team.long.pct)} color="text-amber-400"
          sub={`${team.long.total} attacchi`} />
      </div>

      {/* Player breakdown */}
      {playerRows.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white">Dettaglio per attaccante (calo nei rally lunghi)</h3>
          {playerRows.map(([pNum, pd]) => {
            const drop = pd.drop || 0;
            const dropColor = drop > 0.25 ? 'text-red-400' : drop > 0.12 ? 'text-amber-400' : 'text-green-400';
            return (
              <div key={pNum} className="glass-card p-3">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-sky-400">#{pNum}</span>
                    <span className="text-sm font-semibold text-white">{pd.name}</span>
                  </div>
                  <span className={`text-xs font-semibold ${dropColor}`}>
                    Calo rally lunghi: {drop > 0 ? '-' : '+'}{Math.abs(Math.round(drop * 100))}pp
                  </span>
                </div>
                <div className="flex gap-4 text-xs flex-wrap">
                  {[['Corti', pd.short, 'text-sky-400'], ['Medi', pd.medium, 'text-blue-400'], ['Lunghi', pd.long, 'text-amber-400']].map(([label, data, color]) => (
                    data && data.total > 0 && (
                      <div key={label}>
                        <span className="text-gray-500">{label}: </span>
                        <span className={`font-semibold ${color}`}>{pct(data.pct)}</span>
                        <span className="text-gray-600 ml-1">({data.total})</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <InfoBox text="Rally corti (1-2 azioni): esplosività e reazione immediata. Rally medi (3-4): condizioni standard. Rally lunghi (5+ azioni): resistenza fisica e mentale. Un calo significativo nei rally lunghi indica necessità di drill di durata e mantenimento tecnica sotto fatica." />
    </div>
  );
}

// ─── Chain Weekly Plan ────────────────────────────────────────────────────────

function ChainWeeklyPlan({ suggestions }) {
  // Build a smarter weekly plan from chain suggestions
  const hasTransitionGap  = suggestions.some(s => s.type === 'side_out_vs_transition_gap');
  const hasR5Waste        = suggestions.some(s => s.type === 'r_to_a_waste');
  const hasD5Waste        = suggestions.some(s => s.type === 'd_to_a_waste');
  const hasServeDef       = suggestions.some(s => s.type === 'serve_defense_break');
  const hasRallyLong      = suggestions.some(s => s.type === 'rally_length_fatigue' || s.type === 'rally_length_fatigue_team');
  const hasRotWeak        = suggestions.some(s => s.type === 'rotation_chain_weakness');
  const weakRot           = suggestions.find(s => s.type === 'rotation_chain_weakness')?.rotation;

  const r5Players  = [...new Set(suggestions.filter(s => s.type === 'r_to_a_waste').map(s => s.player))].slice(0, 3);
  const trPlayers  = [...new Set(suggestions.filter(s => s.type === 'side_out_vs_transition_gap').map(s => s.player))].slice(0, 3);

  const plan = [
    {
      day: 'Lunedì',
      desc: trPlayers.length > 0
        ? `Tecnica individuale: ${trPlayers.join(', ')} → drill di rincorsa corta da rete (partenza da posizione di muro). Automatizzare il primo passo di rincorsa in transizione.`
        : `Tecnica individuale per ruolo: centrali → primo tempo + muro; bande → ricezione + attacco; libero → ricezione + difesa.`,
    },
    {
      day: 'Martedì',
      desc: hasRotWeak && weakRot
        ? `Side-out su rotazione ${weakRot} (la più debole): simulare la configurazione reale in campo, lavorare sulla catena ricezione → alzata → attacco con le giocatrici di quella rotazione. Poi side-out generale.`
        : hasR5Waste && r5Players.length > 0
          ? `Side-out con focus su ricezione R5 → attacco: ${r5Players.join(', ')} devono sfruttare meglio le alzate alte. Drill: R5 simulata → colpo variato. Poi side-out generico.`
          : `Side-out e cambiopalla: catena ricezione → alzata → attacco. Lavorare sulla coerenza della catena.`,
    },
    {
      day: 'Mercoledì',
      desc: hasServeDef
        ? `Break-point con focus battuta + posizionamento difensivo: dopo B4/B5, tutto il sistema difensivo si orienta prima che l'attacco avversario parta (attacco prevedibile). Drill: battuta → lettura immediata → difesa.`
        : hasD5Waste
          ? `Break-point: battuta aggressiva + transizione D→A. Chi difende entra in rincorsa immediata. Focus sul collegamento difesa → attacco per chi ha calo in D5→A.`
          : `Break-point: battuta a zona + muro a 2 + difesa. Centrali: muro lettura. Opposto: muro zona 2.`,
    },
    {
      day: 'Giovedì',
      desc: hasRallyLong
        ? `Rally lunghi: regola "punto solo dopo 5+ scambi". Mantieni l'intensità tecnica sotto fatica. Poi analisi tattica avversario della prossima gara.`
        : `Preparazione tattica avversario: rotazioni critiche, set simulati. Focus sulle sequenze identificate dall'analisi delle catene.`,
    },
    {
      day: 'Venerdì',
      desc: `Attivazione pre-gara. Set brevi con focus sulle catene corrette: R→A per chi ha sprechi, D→A per chi ha gap transizione. Ogni attaccante lavora sulla propria debolezza specifica.`,
    },
  ];

  return (
    <div className="glass-card-accent p-5">
      <h3 className="text-sm font-semibold text-sky-400 mb-3">💡 Piano Settimana — Basato sulle Catene</h3>
      <div className="space-y-2 text-xs text-gray-300">
        {plan.map(({ day, desc }) => (
          <div key={day} className="flex gap-2">
            <span className="text-sky-400 font-bold w-24 flex-shrink-0">{day}</span>
            <span>{desc}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 mt-3 pt-2 border-t border-white/5">
        Piano generato automaticamente dalle debolezze identificate nelle catene di gioco. Si aggiorna ad ogni nuova partita.
      </p>
    </div>
  );
}

// ─── Small Reusable Components ────────────────────────────────────────────────

function StatTile({ label, value, color, sub }) {
  return (
    <div className="glass-card p-3">
      <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function InfoBox({ text }) {
  return (
    <div className="glass-card p-3 border-l-2 border-sky-500/30">
      <p className="text-[11px] text-gray-500">{text}</p>
    </div>
  );
}

function EmptyState({ msg }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 text-gray-500 text-sm">
      <div className="text-3xl mb-2">⛓</div>
      <p>{msg}</p>
    </div>
  );
}
