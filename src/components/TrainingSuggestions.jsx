// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Training Suggestions
// Raggruppamento per Giocatrice / Fondamentale / Squadra
// Gruppi collassati di default, badge neg/pos cliccabili, 3 azioni di review
// Sistema di revisione: Visto / Da vedere / Ignora — persistito su Firestore
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { COLORS } from '../utils/constants';
import { useAuth } from '../context/AuthContext';
import { saveSuggestionReviews, loadSuggestionReviews } from '../utils/firestoreService';

// ─── Constants ───────────────────────────────────────────────────────────────

const PRIORITY_COLORS = {
  5: { bg: 'bg-red-500/10',    border: 'border-red-500/20',    text: 'text-red-400',    label: 'Critico'    },
  4: { bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  text: 'text-amber-400',  label: 'Importante' },
  3: { bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  text: 'text-amber-400',  label: 'Moderato'   },
  2: { bg: 'bg-sky-500/10',    border: 'border-sky-500/20',    text: 'text-sky-400',    label: 'Monitorare' },
  1: { bg: 'bg-green-500/10',  border: 'border-green-500/20',  text: 'text-green-400',  label: 'Positivo'   },
};

const TYPE_ICONS = {
  player_decline:    '📉',
  player_improvement:'📈',
  context_warning:   '⚠️',
  team_decline:      '🔻',
};

const FUND_LABELS = {
  attack: 'Attacco', serve: 'Battuta', reception: 'Ricezione',
  defense: 'Difesa', block: 'Muro',
};

const FUND_ICONS = {
  attack: '⚔', serve: '🎯', reception: '🤲', defense: '🛡', block: '🧱',
};

const VIEW_TABS = [
  { id: 'all',          label: 'Tutte',          icon: '≡' },
  { id: 'player',       label: 'Per Giocatrice', icon: '★' },
  { id: 'fundamental',  label: 'Per Fondamentale', icon: '◈' },
  { id: 'team',         label: 'Squadra',        icon: '⬡' },
];

const STATUS_FILTERS = [
  { id: 'all',          label: 'Tutti'       },
  { id: 'none',         label: 'Non visti'   },
  { id: 'da_valutare',  label: 'Da vedere'   },
  { id: 'visto',        label: 'Visti'       },
  { id: 'ignorato',     label: 'Ignorati'    },
];

// Tipi "negativi" (cali, avvisi) vs "positivi" (miglioramenti)
const isNegative = (s) => s.type === 'player_decline' || s.type === 'team_decline' || s.type === 'context_warning';
const isPositive = (s) => s.type === 'player_improvement';

// ─── Suggestion key — stable identifier for reviews ─────────────────────────
function suggKey(s) {
  return `${s.playerNumber || 'team'}_${s.fundamental || 'general'}_${s.type}`;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function TrainingSuggestions({ analytics, matches, readOnly = false, datasetOwnerUid = '', dataMode = 'raw' }) {
  const { user } = useAuth();

  const [activeView,    setActiveView]    = useState('all');
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [reviews,       setReviews]       = useState({});
  const [reviewsLoaded, setReviewsLoaded] = useState(false);

  const saveTimer = useRef(null);

  // ─── Load reviews from Firestore on mount ─────────────────────────────────
  useEffect(() => {
    if (!user || !datasetOwnerUid) return;
    loadSuggestionReviews(datasetOwnerUid)
      .then(data => { setReviews(data); setReviewsLoaded(true); })
      .catch(err => { console.error('[TrainingSuggestions] loadReviews:', err); setReviewsLoaded(true); });
  }, [user, datasetOwnerUid]);

  // ─── Persist reviews to Firestore (debounced 1.5s) ────────────────────────
  const persistReviews = useCallback((nextReviews) => {
    if (!user || !reviewsLoaded || readOnly || !datasetOwnerUid) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSuggestionReviews(datasetOwnerUid, nextReviews)
        .catch(err => console.error('[TrainingSuggestions] saveReviews:', err));
    }, 1500);
  }, [user, reviewsLoaded, readOnly, datasetOwnerUid]);

  // ─── Toggle review status (visto / da_valutare / ignorato) ───────────────
  const toggleReview = useCallback((key, status) => {
    if (readOnly) return;
    setReviews(prev => {
      const current = prev[key];
      const next = current === status ? undefined : status;
      const updated = { ...prev };
      if (next === undefined) delete updated[key]; else updated[key] = next;
      persistReviews(updated);
      return updated;
    });
  }, [persistReviews, readOnly]);

  // ─── Empty state ─────────────────────────────────────────────────────────
  if (!analytics || matches.length < 2) {
    return (
      <div className="max-w-4xl mx-auto">
        <h2 className="text-xl font-bold text-white mb-2">Suggerimenti Allenamento</h2>
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-sm">
          <div className="text-4xl mb-3">⚙</div>
          <p>Serve almeno 2 partite caricate per generare suggerimenti.</p>
        </div>
      </div>
    );
  }

  const { suggestions } = analytics;

  // ─── Apply status filter ──────────────────────────────────────────────────
  const filteredSuggestions = suggestions.filter(s => {
    if (statusFilter === 'all') return true;
    const k = suggKey(s);
    if (statusFilter === 'none')        return !reviews[k];
    if (statusFilter === 'da_valutare') return reviews[k] === 'da_valutare';
    if (statusFilter === 'visto')       return reviews[k] === 'visto';
    if (statusFilter === 'ignorato')    return reviews[k] === 'ignorato';
    return true;
  });

  // ─── Status counts ────────────────────────────────────────────────────────
  const counts = {
    none:        suggestions.filter(s => !reviews[suggKey(s)]).length,
    da_valutare: suggestions.filter(s => reviews[suggKey(s)] === 'da_valutare').length,
    visto:       suggestions.filter(s => reviews[suggKey(s)] === 'visto').length,
    ignorato:    suggestions.filter(s => reviews[suggKey(s)] === 'ignorato').length,
  };

  // ─── Grouped views ────────────────────────────────────────────────────────
  const byPlayer = groupBy(
    filteredSuggestions.filter(s => s.player),
    s => `${s.playerNumber}_${s.player}_${s.role}`
  );

  const byFundamental = groupBy(
    filteredSuggestions.filter(s => s.fundamental),
    s => s.fundamental
  );

  const teamSuggestions = filteredSuggestions.filter(s => s.type === 'team_decline');

  const cardProps = { reviews, toggleReview };

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Suggerimenti Allenamento</h2>
        <p className="text-sm text-gray-400">
          {matches.length} partite analizzate · {suggestions.length} suggerimenti ·{' '}
          <span className="text-green-400">{counts.visto} visti</span>
          {counts.da_valutare > 0 && <span className="text-amber-400"> · {counts.da_valutare} da vedere</span>}
          {counts.none > 0 && <span className="text-gray-500"> · {counts.none} non visti</span>}
        </p>
        {readOnly && (
          <p className="text-[11px] text-sky-300 mt-1">
            Modalità sola lettura: lo stato di revisione non è modificabile.
          </p>
        )}
        {dataMode === 'weighted' && (
          <p className="text-[11px] text-amber-400/70 mt-1">
            ⚖ I suggerimenti sono generati dall'analisi pesata: i trend e le soglie tengono conto del contesto delle partite.
          </p>
        )}
      </div>

      {/* View tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {VIEW_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
              activeView === tab.id
                ? 'bg-amber-500/15 text-amber-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map(f => {
          const cnt = f.id === 'all' ? suggestions.length : (counts[f.id] ?? 0);
          return (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all ${
                statusFilter === f.id
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'text-gray-500 border border-white/8 hover:text-gray-300'
              }`}
            >
              {f.label}
              <span className={`text-[10px] px-1 rounded ${statusFilter === f.id ? 'bg-amber-500/20 text-amber-400' : 'bg-white/8 text-gray-600'}`}>
                {cnt}
              </span>
            </button>
          );
        })}
      </div>

      {filteredSuggestions.length === 0 && (
        <div className="glass-card p-6 text-center">
          <p className="text-sm text-gray-400">
            {statusFilter === 'all'
              ? 'Nessun suggerimento significativo. Le performance sono stabili.'
              : `Nessun suggerimento con stato "${STATUS_FILTERS.find(f=>f.id===statusFilter)?.label}".`}
          </p>
        </div>
      )}

      {/* ── VIEW: TUTTE ─────────────────────────────────────────────────── */}
      {activeView === 'all' && <ViewAll suggestions={filteredSuggestions} {...cardProps} />}

      {/* ── VIEW: PER GIOCATRICE ─────────────────────────────────────────── */}
      {activeView === 'player' && (
        <div className="space-y-2">
          {Object.entries(byPlayer)
            .sort(([, a], [, b]) => maxPriority(b) - maxPriority(a))
            .map(([key, suggs]) => {
              const first = suggs[0];
              return (
                <PlayerGroup
                  key={key}
                  title={`#${first.playerNumber} ${first.player}`}
                  subtitle={first.role}
                  allSuggs={suggs}
                  {...cardProps}
                />
              );
            })}
          {Object.keys(byPlayer).length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">Nessun suggerimento per giocatrici con il filtro corrente.</p>
          )}
        </div>
      )}

      {/* ── VIEW: PER FONDAMENTALE ───────────────────────────────────────── */}
      {activeView === 'fundamental' && (
        <div className="space-y-2">
          {Object.entries(byFundamental)
            .sort(([, a], [, b]) => maxPriority(b) - maxPriority(a))
            .map(([fund, suggs]) => {
              const byP = groupBy(suggs.filter(s => s.player), s => `${s.playerNumber}_${s.player}`);
              const teamSuggs = suggs.filter(s => !s.player);
              return (
                <FundamentalGroup
                  key={fund}
                  fund={fund}
                  allSuggs={suggs}
                  byPlayer={byP}
                  teamSuggs={teamSuggs}
                  {...cardProps}
                />
              );
            })}
          {Object.keys(byFundamental).length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">Nessun suggerimento con il filtro corrente.</p>
          )}
        </div>
      )}

      {/* ── VIEW: SQUADRA ───────────────────────────────────────────────── */}
      {activeView === 'team' && (
        <div className="space-y-3">
          {teamSuggestions.length === 0 ? (
            <div className="glass-card p-6 text-center">
              <p className="text-sm text-gray-400">Nessun segnale di calo a livello di squadra al momento.</p>
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                🔻 Cali di Squadra ({teamSuggestions.length})
              </h3>
              {teamSuggestions.map((s, i) => (
                <SuggestionCard key={i} suggestion={s} {...cardProps} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Weekly plan — shown only in "tutte" view */}
      {activeView === 'all' && suggestions.length > 0 && (
        <div className="glass-card-accent p-5">
          <h3 className="text-sm font-semibold text-amber-400 mb-3">💡 Piano Settimana Tipo</h3>
          <div className="space-y-2 text-xs text-gray-300">
            {buildWeeklyPlan(
              suggestions.filter(s => s.type === 'player_decline' || s.type === 'team_decline'),
              suggestions.filter(s => s.type === 'context_warning')
            ).map(({ day, desc }) => (
              <div key={day} className="flex gap-2">
                <span className="text-amber-400 font-bold w-24 flex-shrink-0">{day}</span>
                <span>{desc}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-3 pt-2 border-t border-white/5">
            Il piano è filtrato per ruolo: non vengono suggeriti fondamentali estranei al core di ogni giocatrice.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── View: Tutte ─────────────────────────────────────────────────────────────

function ViewAll({ suggestions, reviews, toggleReview }) {
  const declines     = suggestions.filter(s => s.type === 'player_decline' || s.type === 'team_decline');
  const warnings     = suggestions.filter(s => s.type === 'context_warning');
  const improvements = suggestions.filter(s => s.type === 'player_improvement');

  return (
    <div className="space-y-6">
      {declines.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
            📉 Aree di Intervento ({declines.length})
          </h3>
          {declines.map((s, i) => <SuggestionCard key={i} suggestion={s} reviews={reviews} toggleReview={toggleReview} />)}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            ⚠️ Da Monitorare ({warnings.length})
          </h3>
          {warnings.map((s, i) => <SuggestionCard key={i} suggestion={s} reviews={reviews} toggleReview={toggleReview} />)}
        </div>
      )}
      {improvements.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-green-400 flex items-center gap-2">
            📈 Punti di Forza in Crescita ({improvements.length})
          </h3>
          {improvements.map((s, i) => <SuggestionCard key={i} suggestion={s} reviews={reviews} toggleReview={toggleReview} />)}
        </div>
      )}
    </div>
  );
}

// ─── NegPosBadges — badge cliccabili per neg/pos count ───────────────────────

function NegPosBadges({ negCount, posCount, activeFilter, onClickNeg, onClickPos }) {
  return (
    <div className="flex items-center gap-1.5">
      {negCount > 0 && (
        <button
          onClick={onClickNeg}
          title="Vedi suggerimenti negativi"
          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold transition-all ${
            activeFilter === 'neg'
              ? 'bg-red-500/30 text-red-300 ring-1 ring-red-500/40'
              : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
          }`}
        >
          <span>📉</span>
          <span>{negCount}</span>
        </button>
      )}
      {posCount > 0 && (
        <button
          onClick={onClickPos}
          title="Vedi suggerimenti positivi"
          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold transition-all ${
            activeFilter === 'pos'
              ? 'bg-green-500/30 text-green-300 ring-1 ring-green-500/40'
              : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
          }`}
        >
          <span>📈</span>
          <span>{posCount}</span>
        </button>
      )}
    </div>
  );
}

// ─── PlayerGroup: collassato di default, badge neg/pos cliccabili ────────────

function PlayerGroup({ title, subtitle, allSuggs, reviews, toggleReview }) {
  const [collapsed,    setCollapsed]    = useState(true);
  const [localFilter,  setLocalFilter]  = useState(null); // null | 'neg' | 'pos'

  const negSuggs  = allSuggs.filter(isNegative);
  const posSuggs  = allSuggs.filter(isPositive);

  const displaySuggs = localFilter === 'neg' ? negSuggs
                     : localFilter === 'pos' ? posSuggs
                     : allSuggs;

  const displayByFund = groupBy(displaySuggs, s => s.fundamental || 'general');
  const maxP  = maxPriority(allSuggs);
  const color = PRIORITY_COLORS[maxP] || PRIORITY_COLORS[2];

  const handleBadgeClick = (e, type) => {
    e.stopPropagation();
    setCollapsed(false);
    setLocalFilter(prev => prev === type ? null : type);
  };

  return (
    <div className={`glass-card border ${color.border}`}>
      {/* Player header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">★</span>
          <span className="text-sm font-semibold text-white">{title}</span>
          {subtitle && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{subtitle}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <NegPosBadges
            negCount={negSuggs.length}
            posCount={posSuggs.length}
            activeFilter={localFilter}
            onClickNeg={e => handleBadgeClick(e, 'neg')}
            onClickPos={e => handleBadgeClick(e, 'pos')}
          />
          <span className="text-gray-500 text-xs ml-1">{collapsed ? '▶' : '▼'}</span>
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-white/5">
          {/* Active filter indicator */}
          {localFilter && (
            <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.02]">
              <span className="text-[10px] text-gray-500">Filtro attivo:</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                localFilter === 'neg' ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'
              }`}>
                {localFilter === 'neg' ? '📉 Solo negativi' : '📈 Solo positivi'}
              </span>
              <button
                onClick={() => setLocalFilter(null)}
                className="text-[10px] text-gray-600 hover:text-gray-400 ml-auto"
              >
                ✕ Rimuovi filtro
              </button>
            </div>
          )}
          {Object.entries(displayByFund)
            .sort(([, a], [, b]) => maxPriority(b) - maxPriority(a))
            .map(([fund, suggs]) => (
              <FundSubSection
                key={fund}
                fund={fund}
                suggestions={suggs}
                reviews={reviews}
                toggleReview={toggleReview}
              />
            ))}
          {displaySuggs.length === 0 && (
            <p className="text-xs text-gray-600 px-4 py-3 text-center">Nessun suggerimento con il filtro attivo.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FundamentalGroup: collassato di default, badge neg/pos cliccabili ────────

function FundamentalGroup({ fund, allSuggs, byPlayer, teamSuggs, reviews, toggleReview }) {
  const [collapsed,   setCollapsed]   = useState(true);
  const [localFilter, setLocalFilter] = useState(null); // null | 'neg' | 'pos'

  const negSuggs = allSuggs.filter(isNegative);
  const posSuggs = allSuggs.filter(isPositive);

  const displaySuggs  = localFilter === 'neg' ? negSuggs
                      : localFilter === 'pos' ? posSuggs
                      : allSuggs;

  const displayByP    = groupBy(displaySuggs.filter(s => s.player), s => `${s.playerNumber}_${s.player}`);
  const displayTeam   = displaySuggs.filter(s => !s.player);

  const maxP  = maxPriority(allSuggs);
  const color = PRIORITY_COLORS[maxP] || PRIORITY_COLORS[2];

  const handleBadgeClick = (e, type) => {
    e.stopPropagation();
    setCollapsed(false);
    setLocalFilter(prev => prev === type ? null : type);
  };

  return (
    <div className={`glass-card border ${color.border}`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{FUND_ICONS[fund] || '◈'}</span>
          <span className="text-sm font-semibold text-white">{FUND_LABELS[fund] || fund}</span>
        </div>
        <div className="flex items-center gap-2">
          <NegPosBadges
            negCount={negSuggs.length}
            posCount={posSuggs.length}
            activeFilter={localFilter}
            onClickNeg={e => handleBadgeClick(e, 'neg')}
            onClickPos={e => handleBadgeClick(e, 'pos')}
          />
          <span className="text-gray-500 text-xs ml-1">{collapsed ? '▶' : '▼'}</span>
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-white/5">
          {localFilter && (
            <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.02]">
              <span className="text-[10px] text-gray-500">Filtro attivo:</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                localFilter === 'neg' ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'
              }`}>
                {localFilter === 'neg' ? '📉 Solo negativi' : '📈 Solo positivi'}
              </span>
              <button
                onClick={() => setLocalFilter(null)}
                className="text-[10px] text-gray-600 hover:text-gray-400 ml-auto"
              >
                ✕ Rimuovi filtro
              </button>
            </div>
          )}
          {displayTeam.length > 0 && (
            <PlayerSubSection
              playerLabel="Squadra"
              icon="⬡"
              suggestions={displayTeam}
              reviews={reviews}
              toggleReview={toggleReview}
            />
          )}
          {Object.entries(displayByP)
            .sort(([, a], [, b]) => maxPriority(b) - maxPriority(a))
            .map(([key, suggs]) => {
              const first = suggs[0];
              return (
                <PlayerSubSection
                  key={key}
                  playerLabel={`#${first.playerNumber} ${first.player}`}
                  roleLabel={first.role}
                  icon="★"
                  suggestions={suggs}
                  reviews={reviews}
                  toggleReview={toggleReview}
                />
              );
            })}
          {displaySuggs.length === 0 && (
            <p className="text-xs text-gray-600 px-4 py-3 text-center">Nessun suggerimento con il filtro attivo.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FundSubSection: all'interno di un PlayerGroup ────────────────────────────

function FundSubSection({ fund, suggestions, reviews, toggleReview }) {
  const [open, setOpen] = useState(false);
  const maxP  = maxPriority(suggestions);
  const color = PRIORITY_COLORS[maxP] || PRIORITY_COLORS[2];
  const negCnt = suggestions.filter(isNegative).length;
  const posCnt = suggestions.filter(isPositive).length;

  return (
    <div className="border-b border-white/[0.04] last:border-b-0">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{FUND_ICONS[fund] || '◈'}</span>
          <span className="text-xs font-medium text-gray-300">{FUND_LABELS[fund] || fund}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {negCnt > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-semibold">
              📉 {negCnt}
            </span>
          )}
          {posCnt > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 font-semibold">
              📈 {posCnt}
            </span>
          )}
          <span className="text-gray-600 text-[10px] ml-1">{open ? '▼' : '▶'}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2">
          {suggestions.map((s, i) => (
            <SuggestionCard key={i} suggestion={s} reviews={reviews} toggleReview={toggleReview} compact />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PlayerSubSection: all'interno di un FundamentalGroup ────────────────────

function PlayerSubSection({ playerLabel, roleLabel, icon, suggestions, reviews, toggleReview }) {
  const [open, setOpen] = useState(false);
  const maxP  = maxPriority(suggestions);
  const color = PRIORITY_COLORS[maxP] || PRIORITY_COLORS[2];
  const negCnt = suggestions.filter(isNegative).length;
  const posCnt = suggestions.filter(isPositive).length;

  return (
    <div className="border-b border-white/[0.04] last:border-b-0">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-medium text-gray-300">{playerLabel}</span>
          {roleLabel && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">{roleLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {negCnt > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-semibold">
              📉 {negCnt}
            </span>
          )}
          {posCnt > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 font-semibold">
              📈 {posCnt}
            </span>
          )}
          <span className="text-gray-600 text-[10px] ml-1">{open ? '▼' : '▶'}</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2">
          {suggestions.map((s, i) => (
            <SuggestionCard key={i} suggestion={s} reviews={reviews} toggleReview={toggleReview} compact />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Suggestion card ─────────────────────────────────────────────────────────

function SuggestionCard({ suggestion: s, reviews, toggleReview, compact = false }) {
  const [showChart, setShowChart] = useState(false);
  const color    = PRIORITY_COLORS[s.priority] || PRIORITY_COLORS[2];
  const icon     = TYPE_ICONS[s.type] || '●';
  const hasChart = s.chartData && s.chartData.length >= 2;
  const key      = suggKey(s);
  const status   = reviews[key]; // 'visto' | 'da_valutare' | 'ignorato' | undefined

  // Ignorati: semi-nascosti
  if (status === 'ignorato') {
    return (
      <div className="rounded-xl px-4 py-2.5 border border-white/5 bg-white/[0.02] opacity-40 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm flex-shrink-0">{icon}</span>
          <p className="text-xs text-gray-500 truncate">{s.message}</p>
        </div>
        <button
          onClick={() => toggleReview(key, 'ignorato')}
          title="Ripristina"
          className="flex-shrink-0 ml-3 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
        >
          ↩
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-xl p-4 border transition-all ${color.border} ${
      status === 'visto'
        ? 'bg-green-500/5 opacity-80'
        : status === 'da_valutare'
          ? 'bg-amber-500/5'
          : color.bg
    }`}>
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0">{icon}</span>

        <div className="flex-1 min-w-0">
          {/* Tags row */}
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            {s.playerNumber && (
              <span className="text-[10px] font-mono text-amber-400">#{s.playerNumber}</span>
            )}
            {s.role && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{s.role}</span>
            )}
            <span className={`badge ${color.bg} ${color.text}`}>{color.label}</span>
            {s.fundamental && (
              <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                {FUND_ICONS[s.fundamental]} {FUND_LABELS[s.fundamental] || s.fundamental}
              </span>
            )}
            {s.isCore && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-semibold">CORE</span>
            )}
          </div>

          {/* Message */}
          <p className={`text-gray-200 leading-relaxed ${compact ? 'text-xs' : 'text-sm'}`}>{s.message}</p>

          {/* Action */}
          {s.action && (
            <p className="text-xs text-gray-400 mt-2 flex gap-1">
              <span className="text-amber-400 flex-shrink-0">→</span>
              {s.action}
            </p>
          )}

          {/* Evidence chart toggle */}
          {hasChart && (
            <button
              onClick={() => setShowChart(v => !v)}
              className="mt-3 flex items-center gap-1.5 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
            >
              <span>{showChart ? '▼' : '▶'}</span>
              <span>{showChart ? 'Nascondi evidenza' : 'Mostra evidenza'}</span>
            </button>
          )}

          {showChart && hasChart && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <EvidenceChart data={s.chartData} showWeighted={s.showWeighted} fundamental={s.fundamental} />
            </div>
          )}
        </div>

        {/* Review buttons: Visto ✓ / Da vedere 🔖 / Ignora ✕ */}
        <div className="flex flex-col gap-1.5 flex-shrink-0 ml-1">
          <button
            onClick={() => toggleReview(key, 'visto')}
            title="Visto"
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all ${
              status === 'visto'
                ? 'bg-green-500/25 text-green-400 ring-1 ring-green-500/40'
                : 'bg-white/5 text-gray-600 hover:text-green-400 hover:bg-green-500/10'
            }`}
          >
            ✓
          </button>
          <button
            onClick={() => toggleReview(key, 'da_valutare')}
            title="Da vedere"
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all ${
              status === 'da_valutare'
                ? 'bg-amber-500/25 text-amber-400 ring-1 ring-amber-500/40'
                : 'bg-white/5 text-gray-600 hover:text-amber-400 hover:bg-amber-500/10'
            }`}
          >
            🔖
          </button>
          <button
            onClick={() => toggleReview(key, 'ignorato')}
            title="Ignora"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all bg-white/5 text-gray-600 hover:text-red-400 hover:bg-red-500/10"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Evidence chart ───────────────────────────────────────────────────────────

function EvidenceChart({ data, showWeighted, fundamental }) {
  const fundColors = {
    attack: '#f43f5e', serve: '#8b5cf6', reception: '#0ea5e9',
    defense: '#10b981', block: '#f59e0b',
  };
  const mainColor = fundColors[fundamental] || COLORS.raw;
  const rawAvg    = data.reduce((s, d) => s + d.raw, 0) / data.length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: mainColor }} />
          Efficacia %
        </span>
        {showWeighted && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 rounded" style={{ background: COLORS.weighted }} />
            Contestualizzata
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 border-t border-dashed border-gray-500" style={{ width: 12 }} />
          Media
        </span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 9 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
            formatter={(val, name) => [`${val.toFixed(1)}%`, name]}
          />
          <ReferenceLine y={rawAvg} stroke="rgba(148,163,184,0.3)" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="raw" name="Efficacia" stroke={mainColor} strokeWidth={2}
            dot={{ r: 3, fill: mainColor }} activeDot={{ r: 5 }} />
          {showWeighted && (
            <Line type="monotone" dataKey="weighted" name="Contestualizzata" stroke={COLORS.weighted}
              strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: COLORS.weighted }} activeDot={{ r: 5 }} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function maxPriority(suggestions) {
  return suggestions.reduce((max, s) => Math.max(max, s.priority || 1), 1);
}

function buildWeeklyPlan(declines, warnings) {
  const fundLabels = { attack: 'attacco', serve: 'battuta', reception: 'ricezione', defense: 'difesa', block: 'muro' };
  const plan = [];

  const coreDeclines = declines.filter(d => d.isCore);
  if (coreDeclines.length > 0) {
    const players = [...new Set(coreDeclines.map(d => `${d.player} (${d.role}: ${fundLabels[d.fundamental] || d.fundamental})`))].slice(0, 4);
    plan.push({ day: 'Lunedì', desc: `Lavoro individuale sui fondamentali core in calo: ${players.join(', ')}.` });
  } else {
    plan.push({ day: 'Lunedì', desc: 'Tecnica individuale per ruolo: centrali → primo tempo + muro; bande → ricezione + attacco; libero → ricezione + difesa.' });
  }

  const recNeeds = declines.some(d => d.fundamental === 'reception');
  plan.push({
    day: 'Martedì',
    desc: recNeeds
      ? 'Side-out con focus ricezione: drill bande + libero su battute aggressive. Esercizi R3→attacco da bagher.'
      : 'Side-out e cambiopalla: simulare catene ricezione→alzata→attacco. Lavoro su transizione.',
  });

  const serveNeeds = declines.some(d => d.fundamental === 'serve');
  plan.push({
    day: 'Mercoledì',
    desc: serveNeeds
      ? 'Battuta intensiva per chi batte (no libero). Focus precisione tattica. Break-point: battuta + muro + difesa.'
      : 'Break-point: battuta a zona + muro a 2 + difesa. Centrali: muro lettura. Opposto: muro zona 2.',
  });

  plan.push({ day: 'Giovedì', desc: 'Preparazione tattica avversario. Rotazioni critiche, set simulati. Focus sulle situazioni identificate dall\'analisi.' });
  plan.push({ day: 'Venerdì', desc: 'Attivazione pre-gara. Set brevi con focus sulle correzioni della settimana. Ogni ruolo lavora sul proprio core.' });

  return plan;
}
