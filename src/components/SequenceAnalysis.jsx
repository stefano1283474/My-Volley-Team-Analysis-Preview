// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Coach Brain (Chain Analysis)
// Analisi delle catene di gioco dalle quartine scout
// KPI: R/D→A conversion, side-out vs transizione, battuta→difesa,
//       rally lunghi, analisi rotazionale
// ============================================================================

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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

const TRAINING_PLAN_STORAGE_KEY = 'vpa_chain_training_plan_config';
const TRAINING_DAYS = [
  { id: 'monday', label: 'Lunedì', jsDay: 1 },
  { id: 'tuesday', label: 'Martedì', jsDay: 2 },
  { id: 'wednesday', label: 'Mercoledì', jsDay: 3 },
  { id: 'thursday', label: 'Giovedì', jsDay: 4 },
  { id: 'friday', label: 'Venerdì', jsDay: 5 },
  { id: 'saturday', label: 'Sabato', jsDay: 6 },
  { id: 'sunday', label: 'Domenica', jsDay: 0 },
];
const DURATION_OPTIONS = [1, 1.5, 2, 2.5, 3];
const SESSIONS_OPTIONS = [1, 2, 3];

function normalizeTeamName(name) {
  return String(name || '').trim().toUpperCase();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createDefaultTrainingSchedule() {
  return TRAINING_DAYS.reduce((acc, day) => {
    const enabled = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(day.id);
    acc[day.id] = { enabled, duration: 2, sessions: 1 };
    return acc;
  }, {});
}

function parseCalendarDate(dateValue) {
  const raw = String(dateValue || '').trim();
  if (!raw) return null;
  const slash = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = Number(slash[3]);
    const d = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const dash = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dash) {
    const year = Number(dash[1]);
    const month = Number(dash[2]);
    const day = Number(dash[3]);
    const d = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseMatchKickoff(dateValue, timeValue) {
  const base = parseCalendarDate(dateValue);
  if (!base) return null;
  const timeRaw = String(timeValue || '').trim();
  if (!timeRaw) return base;
  const cleaned = timeRaw.replace('.', ':');
  const [hStr, mStr = '0'] = cleaned.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isFinite(h) && Number.isFinite(m)) {
    base.setHours(h, m, 0, 0);
  }
  return base;
}

function weekdayRank(jsDay) {
  return jsDay === 0 ? 7 : jsDay;
}

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

function applyCapFilter(suggestions, enabled, minPriority, maxPriority) {
  if (!enabled) return suggestions;
  const minP = Number.isFinite(Number(minPriority)) ? Number(minPriority) : 1;
  const maxP = Number.isFinite(Number(maxPriority)) ? Number(maxPriority) : 5;
  return (suggestions || []).filter(s => {
    const p = Number(s?.priority);
    if (!Number.isFinite(p)) return true;
    return p >= minP && p <= maxP;
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SequenceAnalysis({
  chainData,
  chainSuggestions,
  matches,
  dataMode = 'raw',
  capFilterEnabled = false,
  onToggleCapFilter = () => {},
  capMinPriority = 2,
  capMaxPriority = 4,
  onCapMinChange = () => {},
  onCapMaxChange = () => {},
}) {
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

  const baseSuggestions = chainSuggestions || [];
  const suggestions = useMemo(
    () => applyCapFilter(baseSuggestions, capFilterEnabled, capMinPriority, capMaxPriority),
    [baseSuggestions, capFilterEnabled, capMinPriority, capMaxPriority]
  );

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">Coach Brain</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
              NUOVO
            </span>
          </div>
          <button
            onClick={onToggleCapFilter}
            className={`text-[10px] px-2.5 py-1 rounded border transition-all ${
              capFilterEnabled
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                : 'bg-white/[0.03] text-gray-400 border-white/10 hover:text-gray-200'
            }`}
          >
            CAP {capFilterEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <p className="text-sm text-gray-400">
          {matches.length} partite · analisi delle catene di gioco dalle quartine scout ·{' '}
          <span className={suggestions.filter(s => s.priority >= 4).length > 0 ? 'text-red-400' : 'text-green-400'}>
            {suggestions.filter(s => s.priority >= 4).length} segnali ad alta priorità
          </span>
          {' · '}
          <span className="text-green-400">{suggestions.filter(s => s.priority === 1).length} punti di forza</span>
        </p>
        {dataMode === 'weighted' && (
          <p className="text-[10px] text-amber-400/70 mt-0.5">
            ⚖ Le catene di gioco sono analisi evento: i percentuali non variano con la pesatura del contesto.
          </p>
        )}
        <p className="text-[11px] text-gray-600 mt-0.5">
          KPI basati su R→A (side-out), D→A (transizione), catena battuta→difesa, rally lunghi e analisi per rotazione.
        </p>
        {capFilterEnabled && (
          <p className="text-[11px] text-amber-300/80 mt-0.5">
            Filtro CAP attivo: incluse solo priorità da P{capMinPriority} a P{capMaxPriority}.
          </p>
        )}
        <div className={`mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 ${capFilterEnabled ? '' : 'opacity-60'}`}>
          <label className="glass-card px-3 py-2 block">
            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
              <span>CAP basso</span>
              <span className="text-gray-300 font-mono">P{capMinPriority}</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={capMinPriority}
              onChange={(e) => onCapMinChange(Number(e.target.value))}
              disabled={!capFilterEnabled}
              className="w-full accent-amber-400"
            />
          </label>
          <label className="glass-card px-3 py-2 block">
            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
              <span>CAP alto</span>
              <span className="text-gray-300 font-mono">P{capMaxPriority}</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={capMaxPriority}
              onChange={(e) => onCapMaxChange(Number(e.target.value))}
              disabled={!capFilterEnabled}
              className="w-full accent-amber-400"
            />
          </label>
        </div>
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

export function ChainTrainingPlan({ analytics, matches, calendar = [], standings = [], ownerTeamName = '', allPlayers = [], onOpenOpponentComment }) {
  const chainSuggestions = analytics?.chainSuggestions || [];
  const trainingSuggestions = analytics?.trainingSuggestions || [];
  const playerTrends = analytics?.playerTrends || {};
  const chainData = analytics?.chainData || {};
  const matchAnalytics = analytics?.matchAnalytics || [];
  const rawSd = analytics?.setterDistribution;
  const sd = useMemo(() => {
    if (!isPlainObject(rawSd)) return null;
    return {
      ...rawSd,
      grandTotal: Number(rawSd.grandTotal) || 0,
      tendencies: Array.isArray(rawSd.tendencies) ? rawSd.tendencies : [],
      byAttacker: isPlainObject(rawSd.byAttacker) ? rawSd.byAttacker : {},
      byAttackerRow: {
        front: isPlainObject(rawSd.byAttackerRow?.front) ? rawSd.byAttackerRow.front : { total: 0, pts: 0, err: 0 },
        back: isPlainObject(rawSd.byAttackerRow?.back) ? rawSd.byAttackerRow.back : { total: 0, pts: 0, err: 0 },
      },
      byInputQuality: isPlainObject(rawSd.byInputQuality) ? rawSd.byInputQuality : {},
      tempo: isPlainObject(rawSd.tempo) ? rawSd.tempo : {},
      byPhase: isPlainObject(rawSd.byPhase) ? rawSd.byPhase : {},
      byRotation: isPlainObject(rawSd.byRotation) ? rawSd.byRotation : {},
      vsOpponent: isPlainObject(rawSd.vsOpponent) ? rawSd.vsOpponent : {},
    };
  }, [rawSd]);
  const rawSdDiag = analytics?.setterDiagnostics;
  const sdDiag = useMemo(() => ({
    diagnostics: Array.isArray(rawSdDiag?.diagnostics) ? rawSdDiag.diagnostics : [],
    contextMap: isPlainObject(rawSdDiag?.contextMap) ? rawSdDiag.contextMap : {},
  }), [rawSdDiag]);

  const allSuggestions = useMemo(() => {
    const merged = [...chainSuggestions, ...trainingSuggestions];
    merged.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return merged;
  }, [chainSuggestions, trainingSuggestions]);

  const declines = allSuggestions.filter(s => s.priority >= 3);
  const strengths = allSuggestions.filter(s => s.priority === 1);

  // ─── Persistent state ──
  const stored = useRef((() => { try { return JSON.parse(localStorage.getItem(TRAINING_PLAN_STORAGE_KEY) || '{}'); } catch { return {}; } })());
  const [tab, setTab] = useState('panoramica');
  const [targetPosition, setTargetPosition] = useState(() => Number(stored.current.targetPosition) || 3);
  const [coachNotes, setCoachNotes] = useState(() => stored.current.coachNotes || '');
  const [sessionNotes, setSessionNotes] = useState(() => stored.current.sessionNotes || {});
  const [preferRefinement, setPreferRefinement] = useState(() => stored.current.preferRefinement !== false);
  const [trainingSchedule, setTrainingSchedule] = useState(() => {
    const defaults = createDefaultTrainingSchedule();
    try {
      const merged = { ...defaults };
      for (const day of TRAINING_DAYS) {
        const row = stored.current?.schedule?.[day.id];
        if (!row) continue;
        merged[day.id] = { enabled: !!row.enabled,
          duration: DURATION_OPTIONS.includes(Number(row.duration)) ? Number(row.duration) : defaults[day.id].duration,
          sessions: SESSIONS_OPTIONS.includes(Number(row.sessions)) ? Number(row.sessions) : defaults[day.id].sessions };
      }
      return merged;
    } catch { return defaults; }
  });

  // ─── Focus priorities (4 axes sum to 100) ──
  const DEF_PRIO = { criticita: 30, crescita: 20, gara: 35, fisico: 15 };
  const hadStoredPrio = useRef(!!(stored.current.prio && typeof stored.current.prio.criticita === 'number'));
  const appliedSuggested = useRef(false);
  const [prio, setPrio] = useState(() => {
    const s = stored.current.prio;
    return (s && typeof s.criticita === 'number') ? s : DEF_PRIO;
  });
  const [distView, setDistView] = useState('diagnosi');
  const [diagFilter, setDiagFilter] = useState('all');
  const [selectedFund, setSelectedFund] = useState('attack');
  const [selectedPlayerNumber, setSelectedPlayerNumber] = useState('');
  const [selectedFocusAxis, setSelectedFocusAxis] = useState('all');
  const fundLabel = { attack: 'Attacco', serve: 'Battuta', reception: 'Ricezione', defense: 'Difesa', block: 'Muro' };

  const adjustPrio = useCallback((axis, raw) => {
    setPrio(prev => {
      const val = Math.max(0, Math.min(100, Math.round(raw)));
      const diff = val - prev[axis];
      if (diff === 0) return prev;
      const others = Object.keys(prev).filter(k => k !== axis);
      const othersSum = others.reduce((s, k) => s + prev[k], 0);
      const next = { ...prev, [axis]: val };
      if (othersSum === 0) { others.forEach(k => { next[k] = Math.max(0, Math.round(-diff / others.length)); }); }
      else {
        let rem = -diff;
        others.forEach((k, i) => {
          if (i === others.length - 1) { next[k] = Math.max(0, prev[k] + rem); }
          else { const p = Math.round(rem * prev[k] / othersSum); next[k] = Math.max(0, prev[k] + p); rem -= p; }
        });
      }
      const sum = Object.values(next).reduce((s, v) => s + v, 0);
      if (sum !== 100) { const big = Object.keys(next).reduce((a, b) => next[a] >= next[b] ? a : b); next[big] += 100 - sum; }
      return next;
    });
  }, []);

  // ─── Persist ──
  useEffect(() => {
    try { localStorage.setItem(TRAINING_PLAN_STORAGE_KEY, JSON.stringify({
      schedule: trainingSchedule, preferRefinement, targetPosition, coachNotes, sessionNotes, prio,
    })); } catch {}
  }, [trainingSchedule, preferRefinement, targetPosition, coachNotes, sessionNotes, prio]);

  // ─── Schedule computations ──
  const scheduleRows = useMemo(() => TRAINING_DAYS.map(day => ({ day, cfg: trainingSchedule[day.id] || { enabled: false, duration: 2, sessions: 1 } })), [trainingSchedule]);
  const activeDays = scheduleRows.filter(({ cfg }) => cfg.enabled && cfg.sessions > 0);
  const totalSessions = activeDays.reduce((s, { cfg }) => s + cfg.sessions, 0);
  const totalHours = activeDays.reduce((s, { cfg }) => s + cfg.duration * cfg.sessions, 0);

  const sessionSlots = useMemo(() => {
    const slots = [];
    for (const { day, cfg } of activeDays) {
      for (let i = 0; i < cfg.sessions; i++) slots.push({ dayId: day.id, dayLabel: day.label, jsDay: day.jsDay, duration: cfg.duration, sessionIdx: i + 1, daySessions: cfg.sessions });
    }
    return slots;
  }, [activeDays]);

  // ─── Calendar / matches ──
  const ownerUpper = normalizeTeamName(ownerTeamName);
  const isOwner = useCallback(m => {
    if (!ownerUpper) return true;
    const h = normalizeTeamName(m.home), a = normalizeTeamName(m.away);
    return h === ownerUpper || a === ownerUpper || h.includes(ownerUpper) || a.includes(ownerUpper) || ownerUpper.includes(h) || ownerUpper.includes(a);
  }, [ownerUpper]);

  const upcoming = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return (calendar || []).filter(m => !m.played && isOwner(m))
      .map(m => { const k = parseMatchKickoff(m.data, m.ora); return k ? { ...m, kickoff: k } : null; })
      .filter(Boolean).filter(m => m.kickoff >= now).sort((a, b) => a.kickoff - b.kickoff);
  }, [calendar, isOwner]);

  const past = useMemo(() => (calendar || []).filter(m => m.played && isOwner(m))
    .map(m => { const k = parseMatchKickoff(m.data, m.ora); return k ? { ...m, kickoff: k } : null; })
    .filter(Boolean).sort((a, b) => b.kickoff - a.kickoff), [calendar, isOwner]);

  const nextMatch = upcoming[0] || null;
  const daysToMatch = nextMatch ? Math.max(0, Math.round((nextMatch.kickoff - new Date()) / 864e5)) : null;

  // ─── Standings ──
  const ourStanding = useMemo(() => {
    if (!standings?.length || !ownerUpper) return null;
    return standings.find(t => { const n = normalizeTeamName(t.name); return n === ownerUpper || n.includes(ownerUpper) || ownerUpper.includes(n); });
  }, [standings, ownerUpper]);

  const standingGap = useMemo(() => {
    if (!ourStanding || !standings?.length || targetPosition < 1) return null;
    const target = standings[targetPosition - 1];
    if (!target) return null;
    return { current: ourStanding.rank, target: targetPosition, diff: target.pts - ourStanding.pts, targetName: target.name, remaining: upcoming.length };
  }, [ourStanding, standings, targetPosition, upcoming]);

  // ─── Next opponent scouting ──
  const nextOpp = useMemo(() => {
    if (!nextMatch) return null;
    const oppName = normalizeTeamName(nextMatch.home) === ownerUpper ? nextMatch.away : nextMatch.home;
    const pastVs = past.filter(m => normalizeTeamName(m.home) === normalizeTeamName(oppName) || normalizeTeamName(m.away) === normalizeTeamName(oppName));
    const scoutVs = matchAnalytics.filter(ma => { const o = normalizeTeamName(ma.match?.metadata?.opponent || ''); return o === normalizeTeamName(oppName) || o.includes(normalizeTeamName(oppName).substring(0, 8)); });
    const oppStanding = standings?.find(t => { const n = normalizeTeamName(t.name); return n === normalizeTeamName(oppName) || n.includes(normalizeTeamName(oppName).substring(0, 8)); });
    return { oppName, pastVs, scoutVs, oppStanding, played: pastVs.length > 0 };
  }, [nextMatch, ownerUpper, past, matchAnalytics, standings]);

  // ─── Fund priorities from data ──
  const fundStatus = useMemo(() => {
    const fs = { attack: 'stable', serve: 'stable', reception: 'stable', defense: 'stable', block: 'stable' };
    for (const s of allSuggestions) {
      const f = s.fundamental;
      if (!f || !fs[f]) continue;
      if (s.priority >= 4) fs[f] = 'critical';
      else if (s.priority >= 3 && fs[f] !== 'critical') fs[f] = 'warning';
      else if (s.priority === 1 && fs[f] === 'stable') fs[f] = 'good';
    }
    return fs;
  }, [allSuggestions]);

  const fundStats = useMemo(() => {
    const funds = ['attack', 'serve', 'reception', 'defense', 'block'];
    const byFund = {};
    for (const fund of funds) {
      let playersWithData = 0;
      let rawSum = 0;
      let weightedSum = 0;
      let declining = 0;
      let improving = 0;
      for (const p of Object.values(playerTrends || {})) {
        const t = p?.trends?.[fund];
        if (!t || (t.playedMatches || 0) < 1) continue;
        playersWithData += 1;
        rawSum += Number(t.rawAvg || 0) * 100;
        weightedSum += Number(t.weightedAvg || 0) * 100;
        if (t.rawTrend === 'declining') declining += 1;
        if (t.rawTrend === 'improving') improving += 1;
      }
      byFund[fund] = {
        playersWithData,
        rawAvgPct: playersWithData > 0 ? rawSum / playersWithData : 0,
        weightedAvgPct: playersWithData > 0 ? weightedSum / playersWithData : 0,
        decliningPct: playersWithData > 0 ? (declining / playersWithData) * 100 : 0,
        improvingPct: playersWithData > 0 ? (improving / playersWithData) * 100 : 0,
      };
    }
    return byFund;
  }, [playerTrends]);

  const selectedFundStats = fundStats[selectedFund] || {
    playersWithData: 0, rawAvgPct: 0, weightedAvgPct: 0, decliningPct: 0, improvingPct: 0,
  };

  const selectedFundChartData = useMemo(() => ([
    { label: 'Media grezza', value: selectedFundStats.rawAvgPct, color: '#38bdf8' },
    { label: 'Media pesata', value: selectedFundStats.weightedAvgPct, color: '#f59e0b' },
    { label: 'In calo', value: selectedFundStats.decliningPct, color: '#f87171' },
    { label: 'In crescita', value: selectedFundStats.improvingPct, color: '#4ade80' },
  ]), [selectedFundStats]);

  // ─── Player cards ──
  const playerCards = useMemo(() => {
    const cards = [];
    for (const [pNum, pData] of Object.entries(playerTrends)) {
      if (!pData?.trends) continue;
      const player = allPlayers.find(p => p.number === pNum) || { number: pNum, name: pData.name || `#${pNum}`, role: '' };
      const declining = [], improving = [], stable = [];
      for (const [fund, t] of Object.entries(pData.trends)) {
        if (t.playedMatches < 2) continue;
        const trend = t.rawTrend || 'stable';
        if (trend === 'declining') declining.push({ fund, ...t });
        else if (trend === 'improving') improving.push({ fund, ...t });
        else stable.push({ fund, ...t });
      }
      const pSugg = allSuggestions.filter(s => s.playerNumber === pNum);
      const sdData = sd?.byAttacker?.[pNum] || null;
      if (declining.length > 0 || improving.length > 0 || pSugg.length > 0 || (sdData && sdData.total >= 3)) {
        cards.push({ player, declining, improving, stable, suggestions: pSugg, sdData });
      }
    }
    cards.sort((a, b) => b.declining.length - a.declining.length || b.suggestions.length - a.suggestions.length);
    return cards;
  }, [playerTrends, allPlayers, allSuggestions, sd]);

  const selectedPlayerDetails = useMemo(() => {
    const pNum = selectedPlayerNumber || playerCards[0]?.player?.number || '';
    if (!pNum) return null;
    const pData = playerTrends?.[pNum];
    if (!pData?.trends) return null;
    const funds = ['attack', 'serve', 'reception', 'defense', 'block'];
    const chartData = funds.map(f => {
      const t = pData.trends[f];
      return {
        fund: fundLabel[f],
        season: t && (t.playedMatches || 0) >= 1 ? Number(t.rawAvg || 0) * 100 : null,
        recent: t && (t.playedMatches || 0) >= 2 ? Number(t.rawRecentAvg || 0) * 100 : null,
        weighted: t && (t.playedMatches || 0) >= 1 ? Number(t.weightedAvg || 0) * 100 : null,
      };
    });
    const card = playerCards.find(c => c.player.number === pNum) || null;
    return { pNum, chartData, card };
  }, [selectedPlayerNumber, playerCards, playerTrends, fundLabel]);

  // ─── Suggested priorities (data-driven) ──
  const [showPrioInfo, setShowPrioInfo] = useState(false);
  const suggestedPrio = useMemo(() => {
    // Scoring factors for each axis
    let critScore = 0, crscScore = 0, garaScore = 0, fisScore = 0;
    const reasons = { criticita: [], crescita: [], gara: [], fisico: [] };

    // 1. Criticità: declines, setter diagnostics, weak rotations
    const criticalSugg = allSuggestions.filter(s => s.priority >= 4).length;
    const moderateSugg = allSuggestions.filter(s => s.priority === 3).length;
    if (criticalSugg > 0) {
      critScore += Math.min(criticalSugg * 8, 35);
      reasons.criticita.push(`${criticalSugg} segnali ad alta priorità nei trend`);
    }
    if (moderateSugg > 0) {
      critScore += Math.min(moderateSugg * 3, 12);
    }
    // Setter diagnostics
    const setterIssues = sdDiag.diagnostics.filter(d => d.type === 'setter_wrong_choice').length;
    const skillDeficits = sdDiag.diagnostics.filter(d => d.type !== 'setter_wrong_choice').length;
    if (setterIssues > 0) {
      critScore += Math.min(setterIssues * 5, 15);
      reasons.criticita.push(`${setterIssues} scelte del palleggiatore da correggere`);
    }
    if (skillDeficits > 0) {
      critScore += Math.min(skillDeficits * 4, 12);
      reasons.criticita.push(`${skillDeficits} deficit tecnici attaccanti`);
    }
    // Declining players
    const decliningPlayers = playerCards.filter(c => c.declining.length > 0).length;
    if (decliningPlayers > 0) {
      critScore += Math.min(decliningPlayers * 4, 16);
      reasons.criticita.push(`${decliningPlayers} giocatrici con trend in calo`);
    }

    // 2. Crescita: improving trends, under-used attackers, strengths
    const improvingPlayers = playerCards.filter(c => c.improving.length > 0).length;
    if (improvingPlayers > 0) {
      crscScore += Math.min(improvingPlayers * 5, 20);
      reasons.crescita.push(`${improvingPlayers} giocatrici con trend in miglioramento`);
    }
    const strengthSugg = allSuggestions.filter(s => s.priority === 1).length;
    if (strengthSugg > 0) {
      crscScore += Math.min(strengthSugg * 3, 12);
      reasons.crescita.push(`${strengthSugg} punti di forza da valorizzare`);
    }
    const underUsed = sd?.tendencies?.filter(t => t.type === 'under_used').length || 0;
    if (underUsed > 0) {
      crscScore += 8;
      reasons.crescita.push(`Attaccante sotto-utilizzata con alta efficienza`);
    }

    // 3. Gara: based on upcoming opponents difficulty
    // Evaluate next 3 opponents vs standings
    const oppDifficulties = [];
    for (let i = 0; i < Math.min(3, upcoming.length); i++) {
      const m = upcoming[i];
      const oppName = normalizeTeamName(m.home) === ownerUpper ? m.away : m.home;
      const oppStanding = standings?.find(t => {
        const n = normalizeTeamName(t.name);
        return n === normalizeTeamName(oppName) || n.includes(normalizeTeamName(oppName).substring(0, 6));
      });
      const ourRank = ourStanding?.rank || 999;
      const oppRank = oppStanding?.rank || 999;
      // Difficulty: harder if opponent is higher ranked (lower rank number)
      const harder = oppRank < ourRank;
      const much_harder = oppRank < ourRank && (ourRank - oppRank) >= 3;
      oppDifficulties.push({ idx: i, name: oppName, oppRank, harder, much_harder, days: Math.max(0, Math.round((m.kickoff - new Date()) / 864e5)) });
    }

    // Strategic analysis: should we focus on the hardest upcoming match?
    let focusMatchIdx = 0; // default: focus on next match
    let strategicReason = '';

    if (oppDifficulties.length >= 3) {
      const d = oppDifficulties;
      // If match 3 is much harder but matches 1-2 are easy, consider sacrificing
      if (d[2]?.much_harder && !d[0]?.harder && !d[1]?.harder) {
        focusMatchIdx = 2;
        strategicReason = `Le prime 2 partite sono accessibili (${d[0].name}, ${d[1].name}). Conviene concentrare la preparazione sulla 3ª partita (${d[2].name}, posizione ${d[2].oppRank}) in ${d[2].days} giorni.`;
      }
      // If match 2 is much harder and match 1 is easy
      else if (d[1]?.much_harder && !d[0]?.harder) {
        focusMatchIdx = 1;
        strategicReason = `La 1ª partita è accessibile (${d[0].name}). Focus sulla 2ª partita (${d[1].name}, posizione ${d[1].oppRank}) in ${d[1].days} giorni.`;
      }
    }

    const focusOpp = oppDifficulties[focusMatchIdx];
    if (focusOpp) {
      if (focusOpp.harder || focusOpp.much_harder) {
        garaScore += focusOpp.much_harder ? 35 : 22;
        reasons.gara.push(`Prossimo avversario chiave: ${focusOpp.name} (pos. ${focusOpp.oppRank}) tra ${focusOpp.days}gg`);
      } else {
        garaScore += 12;
        reasons.gara.push(`Avversario accessibile: ${focusOpp.name} (pos. ${focusOpp.oppRank})`);
      }
      if (strategicReason) reasons.gara.push(strategicReason);
    }
    // Closeness in standings (need points to reach target)
    if (standingGap && standingGap.diff > 0 && standingGap.remaining <= 5) {
      garaScore += 10;
      reasons.gara.push(`${standingGap.diff} punti dal target (pos. ${standingGap.target}) con ${standingGap.remaining} partite restanti`);
    }
    // Days to match: more gara weight if match is close
    if (daysToMatch !== null && daysToMatch <= 3) {
      garaScore += 10;
      reasons.gara.push(`Partita imminente: ${daysToMatch} giorni`);
    }

    // 4. Fisico: baseline + extra if season is long or many matches upcoming
    fisScore = 10; // baseline always present
    reasons.fisico.push('Base mantenimento fisico e prevenzione infortuni');
    if (upcoming.length >= 5) {
      fisScore += 5;
      reasons.fisico.push(`${upcoming.length} partite ancora da giocare`);
    }

    // ─── Normalize to 100% ──
    const rawTotal = critScore + crscScore + garaScore + fisScore;
    if (rawTotal === 0) return { values: { criticita: 30, crescita: 20, gara: 35, fisico: 15 }, reasons, strategic: strategicReason, focusMatchIdx };
    const normalize = v => Math.round(v / rawTotal * 100 / 5) * 5; // round to 5%
    let suggested = {
      criticita: normalize(critScore),
      crescita: normalize(crscScore),
      gara: normalize(garaScore),
      fisico: normalize(fisScore),
    };
    // Ensure sum = 100
    const sum = Object.values(suggested).reduce((s, v) => s + v, 0);
    if (sum !== 100) {
      const biggest = Object.keys(suggested).reduce((a, b) => suggested[a] >= suggested[b] ? a : b);
      suggested[biggest] += 100 - sum;
    }
    // Ensure minimum 5% per axis
    for (const k of Object.keys(suggested)) {
      if (suggested[k] < 5) {
        const diff = 5 - suggested[k];
        suggested[k] = 5;
        const biggest = Object.keys(suggested).filter(x => x !== k).reduce((a, b) => suggested[a] >= suggested[b] ? a : b);
        suggested[biggest] -= diff;
      }
    }

    return { values: suggested, reasons, strategic: strategicReason, focusMatchIdx };
  }, [allSuggestions, sdDiag, playerCards, upcoming, standings, ourStanding, ownerUpper, standingGap, daysToMatch, sd]);

  // Auto-apply suggested priorities on first data load if no stored values exist
  useEffect(() => {
    if (!hadStoredPrio.current && !appliedSuggested.current && suggestedPrio.values) {
      const sv = suggestedPrio.values;
      // Only apply if different from default (meaning data actually influenced the values)
      if (sv.criticita !== DEF_PRIO.criticita || sv.crescita !== DEF_PRIO.crescita || sv.gara !== DEF_PRIO.gara || sv.fisico !== DEF_PRIO.fisico) {
        setPrio(sv);
        appliedSuggested.current = true;
      }
    }
  }, [suggestedPrio]);

  // ─── Setter distribution summary ──
  const sdTop = useMemo(() => {
    if (!sd?.byAttacker) return [];
    return Object.entries(sd.byAttacker).filter(([, a]) => a.total >= 3).sort((a, b) => b[1].total - a[1].total);
  }, [sd]);

  const diagCounts = useMemo(() => ({
    all: sdDiag.diagnostics.length,
    setter_wrong_choice: sdDiag.diagnostics.filter(d => d.type === 'setter_wrong_choice').length,
    player_skill_declining: sdDiag.diagnostics.filter(d => d.type === 'player_skill_declining').length,
    player_skill_deficit_group: sdDiag.diagnostics.filter(d => d.type === 'player_skill_deficit' || d.type === 'player_skill_growing').length,
  }), [sdDiag]);

  const filteredDiagnostics = useMemo(() => {
    if (diagFilter === 'all') return sdDiag.diagnostics;
    if (diagFilter === 'player_skill_deficit_group') {
      return sdDiag.diagnostics.filter(d => d.type === 'player_skill_deficit' || d.type === 'player_skill_growing');
    }
    return sdDiag.diagnostics.filter(d => d.type === diagFilter);
  }, [sdDiag, diagFilter]);

  // ─── Focus blocks (tagged by axis) ──
  const focusBlocks = useMemo(() => {
    const blocks = [];
    const hasR5Waste = declines.some(s => s.type === 'r_to_a_waste');
    const hasTransGap = declines.some(s => s.type === 'side_out_vs_transition_gap');
    const hasServeDef = declines.some(s => s.type === 'serve_defense_break');
    const hasRallyLong = declines.some(s => s.type?.includes('rally_length'));
    const hasRotWeak = declines.some(s => s.type === 'rotation_chain_weakness');
    const weakRot = declines.find(s => s.type === 'rotation_chain_weakness')?.rotation;
    const r5P = [...new Set(declines.filter(s => s.type === 'r_to_a_waste').map(s => s.player))].slice(0, 3);
    const trP = [...new Set(declines.filter(s => s.type === 'side_out_vs_transition_gap').map(s => s.player))].slice(0, 3);

    blocks.push({ title: 'Side-out', axis: hasR5Waste ? 'criticita' : 'crescita', cat: 'tecnico', int: 'alta',
      desc: hasR5Waste && r5P.length ? `Conversione R5→A per ${r5P.join(', ')}` : 'Catena ricezione→alzata→attacco su palla positiva',
      drills: ['Ricezione + attacco su palla positiva (R4/R5)', 'Side-out a rotazione con punteggio', 'Alzate mirate + attacco variato'] });
    blocks.push({ title: 'Transizione D→A', axis: hasTransGap ? 'criticita' : 'crescita', cat: 'tecnico', int: 'alta',
      desc: hasTransGap && trP.length ? `Rincorsa corta per ${trP.join(', ')}` : 'Difesa→alzata→attacco in break-point',
      drills: ['Difesa + rincorsa corta + attacco', 'Transizione 3vs3 con difesa obbligata', 'Rally continui da difesa'] });
    blocks.push({ title: 'Break-point', axis: 'gara', cat: 'tattico', int: 'media',
      desc: hasServeDef ? 'Battuta aggressiva + organizzazione difensiva' : 'Pressione al servizio e letture muro-difesa',
      drills: ['Battuta mirata + posizionamento muro-difesa', 'Servizio tattico + transizione', '6vs6 da break-point'] });
    blocks.push({ title: 'Preparazione gara', axis: 'gara', cat: 'tattico', int: 'variabile',
      desc: hasRotWeak && weakRot ? `Focus P${weakRot} + set a obiettivo` : 'Rotazioni chiave e situazioni di gioco',
      drills: ['6vs6 con partenze per rotazione', 'Set con obiettivi di sistema', 'Finali set sotto pressione'] });
    blocks.push({ title: 'Lavoro individuale', axis: 'criticita', cat: 'tecnico', int: 'media',
      desc: 'Drill personalizzati per fondamentali in calo',
      drills: ['Tecnica individuale su fondamentale specifico', 'Ripetizioni mirate ad alta intensità', 'Analisi video + correzione'] });
    // Setter distribution
    const dW = sd?.tendencies?.filter(t => t.severity === 'warning') || [];
    const dO = sd?.tendencies?.filter(t => t.severity === 'opportunity') || [];
    if (dW.length > 0 || dO.length > 0) {
      blocks.push({ title: 'Distribuzione palleggiatore', axis: dW.length ? 'criticita' : 'crescita', cat: 'tattico', int: 'media',
        desc: (dW[0] || dO[0])?.message || 'Lavoro sulla distribuzione',
        drills: ['Alzata differenziata R3/R4/R5 con scelta', 'Transizione con variazione terminale', dO.length ? 'Sfruttare terminale sotto-utilizzato' : 'Lettura muro avversario'] });
    }
    // Physical
    blocks.push({ title: 'Resistenza / Intensità', axis: 'fisico', cat: 'fisico', int: 'alta',
      desc: hasRallyLong ? 'Rally lunghi in calo: resistenza specifica' : 'Mantenimento condizione fisica',
      drills: ['Circuito funzionale con salti', 'Rally lunghi 6vs6 senza stop', 'Reazione e agilità'] });
    blocks.push({ title: 'Forza / Prevenzione', axis: 'fisico', cat: 'fisico', int: 'media',
      desc: 'Rinforzo muscolare e prevenzione infortuni',
      drills: ['Pliometria specifica per ruolo', 'Core stability + arti inferiori', 'Stretching attivo e mobilità'] });
    if (strengths.length > 0) {
      blocks.push({ title: 'Valorizzazione punti forza', axis: 'crescita', cat: 'tecnico', int: 'media',
        desc: strengths[0].action || strengths[0].message || 'Consolidare i punti di forza',
        drills: ['Situazioni che esaltano i punti forza', 'Varianti tattiche per consolidare', 'Pressione su sistema di successo'] });
    }
    return blocks;
  }, [declines, strengths, sd]);

  // ─── Priority-weighted session assignment ──
  const assignedSessions = useMemo(() => {
    const n = sessionSlots.length;
    if (n === 0 || focusBlocks.length === 0) return [];
    // Group blocks by axis, sort by prio weight
    const axisPool = {};
    for (const b of focusBlocks) {
      if ((prio[b.axis] || 0) <= 0) continue;
      if (!axisPool[b.axis]) axisPool[b.axis] = [];
      axisPool[b.axis].push(b);
    }
    const axes = Object.keys(axisPool).sort((a, b) => (prio[b] || 0) - (prio[a] || 0));
    const totalW = axes.reduce((s, a) => s + (prio[a] || 0), 0);
    // Allocate session counts per axis
    let used = 0;
    const counts = {};
    axes.forEach((a, i) => {
      if (i === axes.length - 1) counts[a] = Math.max(0, n - used);
      else { counts[a] = Math.max(0, Math.round(n * (prio[a] || 0) / Math.max(1, totalW))); used += counts[a]; }
    });
    // Build ordered block list
    const result = [];
    for (const a of axes) { const pool = axisPool[a]; for (let i = 0; i < (counts[a] || 0); i++) result.push(pool[i % pool.length]); }
    return result;
  }, [sessionSlots, focusBlocks, prio]);

  // Pre-match index
  const preMatchIdx = useMemo(() => {
    if (!nextMatch || sessionSlots.length === 0) return -1;
    const mRank = weekdayRank(nextMatch.kickoff.getDay());
    let best = -1, bestR = -1;
    sessionSlots.forEach((s, i) => { const r = weekdayRank(s.jsDay); if (r < mRank && r >= bestR) { bestR = r; best = i; } });
    if (best >= 0) return best;
    let fb = -1, fbR = -1;
    sessionSlots.forEach((s, i) => { const r = weekdayRank(s.jsDay); if (r >= fbR) { fbR = r; fb = i; } });
    return fb;
  }, [nextMatch, sessionSlots]);

  const planned = useMemo(() => sessionSlots.map((slot, idx) => {
    const block = assignedSessions[idx] || focusBlocks[idx % Math.max(1, focusBlocks.length)] || { title: '—', desc: '', drills: [], cat: '', int: '', axis: '' };
    const isPre = idx === preMatchIdx;
    const mins = Math.round(slot.duration * 60);
    const cooldown = 5;
    const fW = prio.fisico / 100;
    const warmup = Math.max(10, Math.round(mins * (0.12 + fW * 0.05)));
    const workingMins = Math.max(15, mins - warmup - cooldown);
    const phys = block.axis === 'fisico' ? Math.max(8, Math.round(workingMins * 0.25)) : Math.max(0, Math.round(workingMins * fW * 0.12));
    const residual = Math.max(8, workingMins - phys);
    const tech = Math.max(8, Math.round(residual * Math.max(0.2, (prio.criticita + prio.crescita) / 200)));
    const tact = Math.max(8, Math.round(residual * Math.max(0.2, prio.gara / 100)));
    const game = Math.max(6, workingMins - phys - tech - tact);
    let desc = block.desc, focus = block;
    if (isPre && nextMatch && preferRefinement) {
      const opp = normalizeTeamName(nextMatch.home) === ownerUpper ? nextMatch.away : nextMatch.home;
      desc = `Rifinitura pre-gara vs ${opp}: side-out sicurezza, battuta mirata, finali set`;
      focus = { ...block, title: 'Rifinitura pre-gara', cat: 'tattico', int: 'bassa', axis: 'gara' };
    }
    return { ...slot, desc, focus, isPre, structure: { warmup, phys, tech, tact, game, cooldown, total: mins },
      note: sessionNotes[`${slot.dayId}-${idx}`] || '' };
  }), [sessionSlots, assignedSessions, focusBlocks, preMatchIdx, nextMatch, preferRefinement, ownerUpper, sessionNotes, prio]);

  // Medium term plan
  const mediumPlan = useMemo(() => {
    const blocks = [];
    for (let i = 0; i < Math.min(upcoming.length, 6); i++) {
      const m = upcoming[i];
      const prev = i > 0 ? upcoming[i - 1] : (past[0] || null);
      const gap = prev ? Math.round((m.kickoff - (prev.kickoff || new Date())) / 864e5) : 7;
      const sess = Math.max(1, Math.min(totalSessions, Math.floor(gap * totalSessions / 7)));
      const opp = normalizeTeamName(m.home) === ownerUpper ? m.away : m.home;
      const oppS = standings?.find(t => normalizeTeamName(t.name).includes(normalizeTeamName(opp).substring(0, 8)));
      const played = past.some(p => normalizeTeamName(p.home) === normalizeTeamName(opp) || normalizeTeamName(p.away) === normalizeTeamName(opp));
      blocks.push({ match: m, opp, oppS, gap, sess, played, giornata: m.giornata });
    }
    return blocks;
  }, [upcoming, past, totalSessions, ownerUpper, standings]);

  // ─── Helpers ──
  const fmtDate = d => { try { return new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(d); } catch { return ''; } };
  const updateDay = (id, patch) => setTrainingSchedule(prev => ({ ...prev, [id]: { ...(prev[id] || { enabled: false, duration: 2, sessions: 1 }), ...patch } }));
  const statusCls = s => s === 'critical' ? 'text-red-400 bg-red-500/10 border-red-500/20' : s === 'warning' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : s === 'good' ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-gray-500 bg-white/5 border-white/8';
  const statusIco = s => s === 'critical' ? '▼' : s === 'warning' ? '~' : s === 'good' ? '▲' : '—';
  const roleCls = r => r === 'O' ? 'text-red-400' : (r === 'B1' || r === 'B2') ? 'text-sky-400' : (r === 'C1' || r === 'C2') ? 'text-amber-400' : 'text-purple-400';
  const axisCls = a => a === 'criticita' ? 'bg-red-500/15 text-red-400' : a === 'crescita' ? 'bg-green-500/15 text-green-400' : a === 'gara' ? 'bg-purple-500/15 text-purple-400' : 'bg-rose-500/15 text-rose-400';
  const axisLabel = a => a === 'criticita' ? 'Criticità' : a === 'crescita' ? 'Crescita' : a === 'gara' ? 'Gara' : 'Fisico';
  const axisBarCls = a => a === 'criticita' ? 'bg-red-500/40' : a === 'crescita' ? 'bg-green-500/40' : a === 'gara' ? 'bg-purple-500/40' : 'bg-rose-500/40';

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  const TABS = [
    { k: 'panoramica', l: 'Stato attuale Team' },
    { k: 'focus', l: 'Definisci Priorità' },
    { k: 'giocatrici', l: 'Stato Giocatrici' },
    { k: 'settimana', l: 'Programmazione settimana' },
    { k: 'distribuzione', l: 'Stato di attacco' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-4">

      {/* ═══ COMMAND BAR ═══ */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-black text-white tracking-tight">Training Plan</h2>
            <p className="text-[10px] text-gray-500">{matches.length} partite · {totalSessions} sedute/sett. · {totalHours.toFixed(1).replace('.', ',')}h</p>
          </div>
          {nextMatch && (
            <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-4 py-2 border border-white/5">
              <div className="text-center">
                <div className="text-2xl font-black text-amber-400">{daysToMatch}</div>
                <div className="text-[7px] text-gray-500 uppercase font-bold">giorni</div>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <div className="text-[10px] text-gray-400">Prossima gara</div>
                <button
                  onClick={() => onOpenOpponentComment?.(nextOpp?.oppName)}
                  className={`text-xs font-bold ${onOpenOpponentComment ? 'text-sky-300 hover:text-sky-200 underline decoration-dotted underline-offset-2' : 'text-white'}`}
                >
                  {nextOpp?.oppName || '?'}
                </button>
                <div className="text-[9px] text-gray-500">{fmtDate(nextMatch.kickoff)}{nextMatch.ora ? ` · ${nextMatch.ora}` : ''}</div>
              </div>
              {nextOpp?.oppStanding && (
                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-400">{nextOpp.oppStanding.rank}° class.</span>
              )}
            </div>
          )}
          {/* Mini priority bar */}
          <div className="flex h-3 w-48 rounded-full overflow-hidden gap-px">
            {prio.criticita > 0 && <div className="bg-red-500/50 transition-all" style={{ width: `${prio.criticita}%` }} />}
            {prio.crescita > 0 && <div className="bg-green-500/50 transition-all" style={{ width: `${prio.crescita}%` }} />}
            {prio.gara > 0 && <div className="bg-purple-500/50 transition-all" style={{ width: `${prio.gara}%` }} />}
            {prio.fisico > 0 && <div className="bg-rose-500/50 transition-all" style={{ width: `${prio.fisico}%` }} />}
          </div>
        </div>
      </div>

      {/* ═══ TAB BAR ═══ */}
      <div className="flex gap-1 bg-white/[0.02] rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex-1 min-w-[90px] px-3 py-2 rounded-lg text-[10px] font-bold transition-all tracking-wide ${tab === t.k ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-gray-500 hover:text-white hover:bg-white/[0.04]'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TAB 1: PANORAMICA
          ═══════════════════════════════════════════════════════════════ */}
      {tab === 'panoramica' && (
        <div className="space-y-4">
          {/* Row 1: Fund status + Standings */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-4">
            {/* Fundamental health */}
            <div className="glass-card p-4 space-y-3">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stato Fondamentali</div>
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(fundStatus).map(([f, s]) => (
                  <button
                    key={f}
                    onClick={() => setSelectedFund(f)}
                    className={`rounded-xl p-2.5 border text-center transition-all ${statusCls(s)} ${selectedFund === f ? 'ring-1 ring-white/40' : 'hover:bg-white/[0.05]'}`}
                  >
                    <div className="text-base font-black">{statusIco(s)}</div>
                    <div className="text-[8px] font-bold uppercase mt-1">{fundLabel[f]}</div>
                  </button>
                ))}
              </div>
              <div className="glass-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold text-white">Dettaglio {fundLabel[selectedFund]}</div>
                  <div className="text-[8px] text-gray-500">{selectedFundStats.playersWithData} giocatrici con dati</div>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={selectedFundChartData} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 9 }} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                      formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Valore']}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {selectedFundChartData.map((e) => (
                        <Cell key={e.label} fill={e.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Top criticità inline */}
              {declines.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  <div className="text-[9px] font-bold text-red-400">Top criticità</div>
                  {declines.slice(0, 3).map((s, i) => (
                    <div key={i} className="text-[9px] text-gray-400 bg-white/[0.02] rounded-lg p-2 border border-white/5">
                      <span className="text-red-400 font-bold mr-1">P{s.priority}</span>
                      {s.player && <span className="text-white font-bold mr-1">{s.player}</span>}
                      {s.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Standings + target */}
            <div className="glass-card p-4 space-y-3">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Classifica</div>
              {ourStanding && (
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-black text-white">{ourStanding.rank}°</div>
                  <div><div className="text-xs text-gray-300">{ourStanding.pts} punti</div><div className="text-[9px] text-gray-500">{ourStanding.w}V {ourStanding.l}S</div></div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="text-[9px] text-gray-500 font-bold">Obiettivo:</label>
                <select value={targetPosition} onChange={e => setTargetPosition(Number(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[10px] text-white">
                  {Array.from({ length: standings?.length || 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}°</option>)}
                </select>
              </div>
              {standingGap && (
                <div className={`text-[9px] px-3 py-2 rounded-lg border ${standingGap.diff <= 0 ? 'bg-green-500/5 border-green-500/15 text-green-400' : 'bg-amber-500/5 border-amber-500/15 text-amber-400'}`}>
                  {standingGap.diff <= 0 ? `Obiettivo raggiunto! +${Math.abs(standingGap.diff)} punti sopra.` : `Servono ${standingGap.diff} pt. Restano ${standingGap.remaining} partite.`}
                </div>
              )}
              {nextOpp && (
                <div className="mt-2 space-y-1">
                  <div className="text-[9px] text-gray-500 font-bold">Prossimo avversario</div>
                  <div className="text-[9px] text-gray-300">
                    {nextOpp.played ? <span className="text-green-400">Già affrontata ({nextOpp.pastVs.length}x){nextOpp.scoutVs.length > 0 ? ` · ${nextOpp.scoutVs.length} scout` : ''}</span>
                      : <span className="text-blue-400">Prima volta — prep. generica</span>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Setter distribution mini + Coach notes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Setter summary */}
            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Distribuzione Palleggiatore</div>
                {sd && <button onClick={() => setTab('distribuzione')} className="text-[8px] text-sky-400 hover:text-sky-300">dettagli →</button>}
              </div>
              {sdTop.length > 0 ? (
                <>
                  <div className="space-y-1.5">
                    {sdTop.slice(0, 5).map(([pNum, a]) => (
                      <div key={pNum} className="flex items-center gap-2">
                        <span className="text-[9px] text-gray-300 w-20 truncate">#{pNum} {a.name}</span>
                        <span className={`text-[7px] font-bold w-6 ${roleCls(a.role)}`}>{a.role}</span>
                        <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-500/30 rounded-full" style={{ width: `${Math.max(3, a.pctOfTotal * 100)}%` }} />
                        </div>
                        <span className="text-[8px] text-sky-400 font-bold w-8 text-right">{(a.pctOfTotal * 100).toFixed(0)}%</span>
                        <span className={`text-[8px] font-bold w-10 text-right ${a.efficiency >= 0.25 ? 'text-green-400' : a.efficiency >= 0.1 ? 'text-amber-400' : 'text-red-400'}`}>{(a.efficiency * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                  {sd?.tendencies?.filter(t => t.severity === 'warning').slice(0, 1).map((t, i) => (
                    <div key={i} className="text-[8px] text-amber-400 bg-amber-500/5 rounded px-2 py-1 border border-amber-500/10">⚠ {t.message}</div>
                  ))}
                  {sdDiag.diagnostics.length > 0 && (
                    <button onClick={() => { setTab('distribuzione'); setDistView('diagnosi'); }} className="w-full text-left text-[8px] bg-red-500/5 rounded px-2 py-1.5 border border-red-500/10 hover:bg-red-500/10 transition-colors">
                      <span className="text-red-400 font-bold">🎯 {sdDiag.diagnostics.filter(d => d.type === 'setter_wrong_choice').length} scelte palleggiatore</span>
                      <span className="text-amber-400 font-bold ml-2">📉 {sdDiag.diagnostics.filter(d => d.type !== 'setter_wrong_choice').length} skill attaccanti</span>
                      <span className="text-gray-500 ml-2">→ vedi diagnosi</span>
                    </button>
                  )}
                </>
              ) : <p className="text-[9px] text-gray-600">Dati insufficienti</p>}
            </div>
            {/* Coach notes */}
            <div className="glass-card p-4 space-y-2">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Note Allenatore</div>
              <p className="text-[8px] text-gray-600">Condizione fisica, mentale, infortuni, osservazioni.</p>
              <textarea value={coachNotes} onChange={e => setCoachNotes(e.target.value)} rows={4} placeholder="Es: #12 rientro infortunio, evitare muro. Squadra mentalmente fragile..."
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-[10px] text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-amber-500/30" />
            </div>
          </div>

          {/* Row 3: Medium term timeline */}
          {mediumPlan.length > 0 && (
            <div className="glass-card p-4 space-y-3">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Prossime Partite</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {mediumPlan.map((b, i) => (
                  <div key={i} className="flex-shrink-0 w-48 bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] text-gray-500 font-bold">G{b.giornata}</span>
                      <span className="text-[8px] text-gray-500">{fmtDate(b.match.kickoff)}</span>
                    </div>
                    <div className="text-[10px] font-bold text-white truncate">{b.opp}</div>
                    <div className="flex gap-1 flex-wrap">
                      {b.oppS && <span className="text-[7px] px-1 py-0.5 rounded-full bg-white/5 text-gray-400">{b.oppS.rank}°</span>}
                      {b.played && <span className="text-[7px] px-1 py-0.5 rounded-full bg-green-500/10 text-green-400">scout</span>}
                      {b.gap <= 4 && <span className="text-[7px] px-1 py-0.5 rounded-full bg-amber-500/10 text-amber-400">ravv.</span>}
                    </div>
                    <div className="text-[8px] text-gray-500">{b.gap}gg · ~{b.sess} sedute</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 2: FOCUS & PRIORITÀ
          ═══════════════════════════════════════════════════════════════ */}
      {tab === 'focus' && (
        <div className="space-y-4">
          {/* Info dialog */}
          {showPrioInfo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPrioInfo(false)}>
              <div className="max-w-lg w-full mx-4 bg-gray-900 border border-white/10 rounded-2xl p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-white">Valori Suggeriti — Motivazione</div>
                  <button onClick={() => setShowPrioInfo(false)} className="text-gray-500 hover:text-white text-lg">✕</button>
                </div>
                {['criticita', 'crescita', 'gara', 'fisico'].map(k => {
                  const labels = { criticita: { l: 'Criticità / Trend', ic: '🔧', c: 'text-red-400' }, crescita: { l: 'Crescita / Skill', ic: '📈', c: 'text-green-400' }, gara: { l: 'Preparazione Gara', ic: '🎯', c: 'text-purple-400' }, fisico: { l: 'Fisico', ic: '💪', c: 'text-rose-400' } };
                  const lb = labels[k];
                  return (
                    <div key={k} className="bg-white/[0.03] border border-white/5 rounded-xl p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-white">{lb.ic} {lb.l}</span>
                        <span className={`text-sm font-black ${lb.c}`}>{suggestedPrio.values[k]}%</span>
                      </div>
                      {(suggestedPrio.reasons[k] || []).map((r, i) => (
                        <div key={i} className="text-[9px] text-gray-400 pl-2 border-l-2 border-white/5">• {r}</div>
                      ))}
                      {(suggestedPrio.reasons[k] || []).length === 0 && <div className="text-[9px] text-gray-600">Nessun fattore rilevante rilevato</div>}
                    </div>
                  );
                })}
                {suggestedPrio.strategic && (
                  <div className="bg-purple-500/5 border border-purple-500/10 rounded-xl p-3">
                    <div className="text-[9px] font-bold text-purple-400 mb-1">🧠 Analisi Strategica Calendario</div>
                    <p className="text-[9px] text-gray-300">{suggestedPrio.strategic}</p>
                  </div>
                )}
                <button onClick={() => { setPrio(suggestedPrio.values); setShowPrioInfo(false); }}
                  className="w-full py-2 rounded-lg bg-sky-500/20 text-sky-400 text-xs font-bold hover:bg-sky-500/30 transition-colors border border-sky-500/20">
                  Applica Valori Suggeriti
                </button>
              </div>
            </div>
          )}

          {/* Priority sliders */}
          <div className="glass-card p-5 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Priorità Allenamento</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPrio(suggestedPrio.values)}
                    className="text-[8px] px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-400 font-bold border border-sky-500/20 hover:bg-sky-500/25 transition-all flex items-center gap-1">
                    Usa Suggeriti
                  </button>
                  <button onClick={() => setShowPrioInfo(true)}
                    className="w-5 h-5 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-sky-400 hover:border-sky-500/30 flex items-center justify-center text-[10px] font-bold transition-all" title="Perché questi valori?">
                    i
                  </button>
                </div>
              </div>
              <p className="text-[8px] text-gray-600 mt-0.5">Regola i cursori per decidere come distribuire il tempo. Il totale è sempre 100%.</p>
            </div>
            {[
              { k: 'criticita', l: 'Criticità / Trend', ic: '🔧', c: '#ef4444', d: 'Risolvere debolezze rilevate: catene, rotazioni, distribuzione' },
              { k: 'crescita', l: 'Crescita / Skill', ic: '📈', c: '#22c55e', d: 'Valorizzare punti di forza emergenti' },
              { k: 'gara', l: 'Preparazione Gara', ic: '🎯', c: '#a855f7', d: 'Tattica avversario: break-point, side-out, rotazioni' },
              { k: 'fisico', l: 'Fisico / Condizionamento', ic: '💪', c: '#f43f5e', d: 'Resistenza, forza, prevenzione' },
            ].map(ax => (
              <div key={ax.k} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{ax.ic}</span>
                    <span className="text-[10px] font-bold text-white">{ax.l}</span>
                    {prio[ax.k] !== suggestedPrio.values[ax.k] && (
                      <span className="text-[7px] text-gray-600">(suggerito: {suggestedPrio.values[ax.k]}%)</span>
                    )}
                  </div>
                  <span className="text-base font-black" style={{ color: ax.c }}>{prio[ax.k]}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={prio[ax.k]}
                  onChange={e => adjustPrio(ax.k, Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{ background: `linear-gradient(to right, ${ax.c} ${prio[ax.k]}%, rgba(255,255,255,0.05) ${prio[ax.k]}%)` }} />
                <p className="text-[8px] text-gray-600">{ax.d}</p>
              </div>
            ))}

            {/* Summary bar */}
            <div className="flex h-6 rounded-full overflow-hidden gap-0.5 mt-2">
              {prio.criticita > 0 && (
                <button
                  onClick={() => setSelectedFocusAxis(v => v === 'criticita' ? 'all' : 'criticita')}
                  className={`bg-red-500/40 flex items-center justify-center transition-all ${selectedFocusAxis === 'criticita' ? 'ring-1 ring-red-300/70' : ''}`}
                  style={{ width: `${prio.criticita}%` }}
                >
                  <span className="text-[7px] text-red-200 font-bold">{prio.criticita}%</span>
                </button>
              )}
              {prio.crescita > 0 && (
                <button
                  onClick={() => setSelectedFocusAxis(v => v === 'crescita' ? 'all' : 'crescita')}
                  className={`bg-green-500/40 flex items-center justify-center transition-all ${selectedFocusAxis === 'crescita' ? 'ring-1 ring-green-300/70' : ''}`}
                  style={{ width: `${prio.crescita}%` }}
                >
                  <span className="text-[7px] text-green-200 font-bold">{prio.crescita}%</span>
                </button>
              )}
              {prio.gara > 0 && (
                <button
                  onClick={() => setSelectedFocusAxis(v => v === 'gara' ? 'all' : 'gara')}
                  className={`bg-purple-500/40 flex items-center justify-center transition-all ${selectedFocusAxis === 'gara' ? 'ring-1 ring-purple-300/70' : ''}`}
                  style={{ width: `${prio.gara}%` }}
                >
                  <span className="text-[7px] text-purple-200 font-bold">{prio.gara}%</span>
                </button>
              )}
              {prio.fisico > 0 && (
                <button
                  onClick={() => setSelectedFocusAxis(v => v === 'fisico' ? 'all' : 'fisico')}
                  className={`bg-rose-500/40 flex items-center justify-center transition-all ${selectedFocusAxis === 'fisico' ? 'ring-1 ring-rose-300/70' : ''}`}
                  style={{ width: `${prio.fisico}%` }}
                >
                  <span className="text-[7px] text-rose-200 font-bold">{prio.fisico}%</span>
                </button>
              )}
            </div>

            {/* Strategic insight if present */}
            {suggestedPrio.strategic && (
              <div className="bg-purple-500/5 border border-purple-500/10 rounded-xl p-2.5 text-[8px] text-purple-300">
                🧠 {suggestedPrio.strategic}
              </div>
            )}

            {/* Presets */}
            <div className="flex gap-2 flex-wrap">
              <span className="text-[8px] text-gray-500 self-center">Presets:</span>
              {[
                { l: 'Equilibrato', v: { criticita: 30, crescita: 20, gara: 35, fisico: 15 } },
                { l: 'Focus gara', v: { criticita: 15, crescita: 10, gara: 55, fisico: 20 } },
                { l: 'Recupero', v: { criticita: 50, crescita: 15, gara: 20, fisico: 15 } },
                { l: 'Crescita', v: { criticita: 15, crescita: 45, gara: 20, fisico: 20 } },
                { l: 'Fisico', v: { criticita: 10, crescita: 10, gara: 15, fisico: 65 } },
                { l: 'Pre-stagione', v: { criticita: 10, crescita: 30, gara: 10, fisico: 50 } },
              ].map(p => (
                <button key={p.l} onClick={() => setPrio(p.v)}
                  className="text-[8px] px-2 py-1 rounded-full border border-white/10 text-gray-400 hover:text-white hover:border-sky-500/30 transition-all">{p.l}</button>
              ))}
            </div>
          </div>

          {/* Drill blocks */}
          <div className="glass-card p-5 space-y-3">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Blocchi di Lavoro</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {focusBlocks.map((b, i) => {
                const active = (prio[b.axis] || 0) > 0;
                const highlighted = selectedFocusAxis === 'all' || selectedFocusAxis === b.axis;
                return (
                  <div key={i} className={`bg-white/[0.02] border rounded-lg p-3 space-y-1 transition-all ${active ? 'border-white/5' : 'border-white/[0.02] opacity-30'} ${highlighted ? 'opacity-100 ring-1 ring-white/15' : 'opacity-35'}`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-bold text-white">{b.title}</span>
                      <span className={`text-[6px] px-1.5 py-0.5 rounded-full font-bold ${axisCls(b.axis)}`}>{axisLabel(b.axis)}</span>
                    </div>
                    <p className="text-[8px] text-gray-400">{b.desc}</p>
                    {b.drills.map((d, j) => <div key={j} className="text-[7px] text-gray-600">· {d}</div>)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 3: DISTRIBUZIONE PALLEGGIATORE
          ═══════════════════════════════════════════════════════════════ */}
      {tab === 'distribuzione' && (
        <div className="space-y-4">
          {(!sd || sd.grandTotal === 0) ? (
            <div className="glass-card p-8 text-center"><p className="text-sm text-gray-500">Dati insufficienti per la distribuzione.</p></div>
          ) : (<>
            {/* Insights */}
            {sd.tendencies?.length > 0 && (
              <div className="glass-card p-4 space-y-1.5">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Insight Distribuzione ({sd.grandTotal} palloni)</div>
                {sd.tendencies.map((t, i) => (
                  <div key={i} className={`text-[9px] px-3 py-1.5 rounded-lg border ${t.severity === 'warning' ? 'bg-amber-500/5 border-amber-500/15 text-amber-400' : t.severity === 'opportunity' ? 'bg-green-500/5 border-green-500/15 text-green-400' : 'bg-white/[0.02] border-white/5 text-gray-300'}`}>
                    {t.severity === 'warning' ? '⚠ ' : t.severity === 'opportunity' ? '💡 ' : 'ℹ '}{t.message}
                  </div>
                ))}
              </div>
            )}

            {/* Sub-nav */}
            <div className="flex gap-1 bg-white/[0.02] rounded-lg p-1 flex-wrap">
              {[{ k: 'diagnosi', l: 'Diagnosi' }, { k: 'chi', l: 'Chi Attacca' }, { k: 'cosa', l: 'Cosa (Qualità)' }, { k: 'quando', l: 'Quando (Fase)' }, { k: 'rotazione', l: 'Per Rotazione' }, { k: 'avv', l: 'Vs Avversario' }].map(v => (
                <button key={v.k} onClick={() => setDistView(v.k)}
                  className={`flex-1 min-w-[80px] px-2 py-1.5 rounded-md text-[9px] font-bold transition-all ${distView === v.k ? 'bg-sky-500 text-black' : 'text-gray-500 hover:text-white'}`}>{v.l}</button>
              ))}
            </div>

            {/* DIAGNOSI */}
            {distView === 'diagnosi' && (
              <div className="space-y-4">
                {sdDiag.diagnostics.length === 0 ? (
                  <div className="glass-card p-6 text-center">
                    <div className="text-2xl mb-2">✅</div>
                    <p className="text-sm text-gray-400">Nessuna criticità rilevata nella distribuzione.</p>
                    <p className="text-[9px] text-gray-600 mt-1">Le scelte del palleggiatore risultano coerenti con le capacità dei terminali. Servono almeno 3 attacchi per contesto (rotazione × fase × qualità input) per generare diagnosi.</p>
                  </div>
                ) : (<>
                  {/* Summary counts */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { l: 'Tutti', t: 'all', c: 'violet', ic: '📋', cnt: diagCounts.all },
                      { l: 'Scelta Palleggiatore', t: 'setter_wrong_choice', c: 'red', ic: '🎯', cnt: diagCounts.setter_wrong_choice },
                      { l: 'Trend Negativo', t: 'player_skill_declining', c: 'amber', ic: '📉', cnt: diagCounts.player_skill_declining },
                      { l: 'Deficit Tecnico', t: 'player_skill_deficit_group', c: 'sky', ic: '🔧', cnt: diagCounts.player_skill_deficit_group },
                    ].map(({ l, t, c, ic, cnt }) => {
                      const isActive = diagFilter === t;
                      return (
                        <button
                          key={t}
                          onClick={() => { setDistView('diagnosi'); setDiagFilter(t); }}
                          className={`glass-card p-3 text-center border-t-2 transition-all ${isActive ? 'ring-1 ring-white/30 bg-white/[0.04]' : 'hover:bg-white/[0.03]'} border-${c}-500/30`}
                        >
                          <div className="text-lg">{ic}</div>
                          <div className={`text-xl font-black text-${c}-400`}>{cnt}</div>
                          <div className="text-[8px] text-gray-500 font-bold">{l}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Diagnostic cards */}
                  {filteredDiagnostics.length === 0 ? (
                    <div className="glass-card p-5 text-center">
                      <p className="text-xs text-gray-400">Nessun contenuto per il filtro selezionato.</p>
                    </div>
                  ) : filteredDiagnostics.map((diag, i) => {
                    const isSetterIssue = diag.type === 'setter_wrong_choice';
                    const borderColor = isSetterIssue ? 'border-red-500/30' : diag.type === 'player_skill_declining' ? 'border-amber-500/30' : 'border-sky-500/30';
                    const tagColor = isSetterIssue ? 'bg-red-500/15 text-red-400' : diag.type === 'player_skill_declining' ? 'bg-amber-500/15 text-amber-400' : 'bg-sky-500/15 text-sky-400';
                    const tagLabel = isSetterIssue ? 'SCELTA PALLEGGIATORE' : diag.type === 'player_skill_declining' ? 'TREND NEGATIVO' : diag.type === 'player_skill_growing' ? 'IN CRESCITA MA INSUFFICIENTE' : 'DEFICIT TECNICO';

                    return (
                      <div key={i} className={`glass-card p-4 space-y-3 border-l-2 ${borderColor}`}>
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded ${tagColor}`}>{tagLabel}</span>
                            <div className="text-[10px] text-white font-bold mt-1.5">
                              P{diag.rotation} · {diag.phase === 'SO' ? 'Side-out' : 'Transizione'} · {diag.inputQuality}
                            </div>
                          </div>
                          <span className="text-[8px] text-gray-500">{diag.attacker.total} pall.</span>
                        </div>

                        {/* Attacker vs Alternative */}
                        {isSetterIssue && diag.alternative && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-2">
                              <div className="text-[7px] text-red-400/70 font-bold">SCELTA ATTUALE</div>
                              <div className="text-[10px] text-white font-bold mt-0.5">{diag.attacker.name} <span className={`text-[8px] ${roleCls(diag.attacker.role)}`}>{diag.attacker.role}</span></div>
                              <div className="text-[9px] text-red-400 font-bold">Eff. {(diag.attacker.eff * 100).toFixed(0)}%</div>
                              <div className="text-[7px] text-gray-500">{(diag.attacker.share * 100).toFixed(0)}% dei palloni</div>
                            </div>
                            <div className="bg-green-500/5 border border-green-500/10 rounded-lg p-2">
                              <div className="text-[7px] text-green-400/70 font-bold">ALTERNATIVA MIGLIORE</div>
                              <div className="text-[10px] text-white font-bold mt-0.5">{diag.alternative.name} <span className={`text-[8px] ${roleCls(diag.alternative.role)}`}>{diag.alternative.role}</span></div>
                              <div className="text-[9px] text-green-400 font-bold">Eff. {(diag.alternative.eff * 100).toFixed(0)}%</div>
                              <div className="text-[7px] text-gray-500">{diag.alternative.source === 'same_context' ? 'Stesso contesto' : 'Da dati globali su ' + diag.inputQuality}</div>
                            </div>
                          </div>
                        )}

                        {/* Trend info for player issues */}
                        {!isSetterIssue && diag.trend && (
                          <div className="flex items-center gap-3 bg-white/[0.02] rounded-lg p-2">
                            <span className="text-base">{diag.trend.direction === 'declining' ? '📉' : diag.trend.direction === 'improving' ? '📈' : '➡'}</span>
                            <div>
                              <div className="text-[10px] text-white font-bold">{diag.attacker.name} <span className={`text-[8px] ${roleCls(diag.attacker.role)}`}>{diag.attacker.role}</span></div>
                              <div className="text-[8px] text-gray-400">
                                Eff. contesto: <span className={diag.attacker.eff < 0.10 ? 'text-red-400 font-bold' : 'text-amber-400'}>{(diag.attacker.eff * 100).toFixed(0)}%</span>
                                {diag.trend.olderAvg != null && diag.trend.recentAvg != null && (
                                  <span className="ml-2">Trend att.: {(diag.trend.olderAvg * 100).toFixed(0)}% → {(diag.trend.recentAvg * 100).toFixed(0)}%</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Training prescription */}
                        <div className="space-y-1.5">
                          {diag.training?.setter && (
                            <div className="bg-red-500/[0.04] border border-red-500/10 rounded-lg p-2.5">
                              <div className="text-[7px] text-red-400/70 font-bold uppercase mb-0.5">🎯 Lavoro Palleggiatore</div>
                              <p className="text-[9px] text-gray-300 leading-relaxed">{diag.training?.setter}</p>
                            </div>
                          )}
                          {diag.training?.player && (
                            <div className="bg-sky-500/[0.04] border border-sky-500/10 rounded-lg p-2.5">
                              <div className="text-[7px] text-sky-400/70 font-bold uppercase mb-0.5">🔧 Lavoro Tecnico Attaccante</div>
                              <p className="text-[9px] text-gray-300 leading-relaxed">{diag.training?.player}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Context summary */}
                  <div className="glass-card p-3">
                    <div className="text-[8px] text-gray-500">
                      Analisi su {Object.keys(sdDiag.contextMap).length} contesti (rotazione × fase × qualità input) con almeno 3 palloni.
                      {sdDiag.diagnostics.filter(d => d.type === 'setter_wrong_choice').length > 0 && (
                        <span className="text-red-400 font-bold ml-1">{sdDiag.diagnostics.filter(d => d.type === 'setter_wrong_choice').length} situazioni richiedono lavoro situazionale del palleggiatore.</span>
                      )}
                    </div>
                  </div>
                </>)}
              </div>
            )}

            {/* CHI ATTACCA */}
            {distView === 'chi' && (
              <div className="space-y-4">
                <div className="glass-card p-4 space-y-3">
                  <div className="text-[10px] font-bold text-white">Distribuzione Palloni</div>
                  {sdTop.map(([pNum, a]) => (
                    <div key={pNum} className="grid grid-cols-[110px,1fr,45px,50px] items-center gap-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold text-white">#{pNum}</span>
                        <span className="text-[8px] text-gray-400 truncate">{a.name}</span>
                        <span className={`text-[7px] font-bold ${roleCls(a.role)}`}>{a.role}</span>
                      </div>
                      <div className="h-4 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-sky-500/30 rounded-full flex items-center justify-end pr-1" style={{ width: `${Math.max(4, a.pctOfTotal * 100)}%` }}><span className="text-[6px] text-sky-200 font-bold">{(a.pctOfTotal * 100).toFixed(0)}%</span></div></div>
                      <span className="text-[8px] text-gray-500 text-right">{a.total}</span>
                      <span className={`text-[8px] font-bold text-right ${a.efficiency >= 0.25 ? 'text-green-400' : a.efficiency >= 0.1 ? 'text-amber-400' : 'text-red-400'}`}>eff {(a.efficiency * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[{ l: '1ª Linea', d: sd.byAttackerRow.front, c: 'sky' }, { l: '2ª Linea', d: sd.byAttackerRow.back, c: 'amber' }].map(({ l, d, c }) => {
                    const tot = sd.byAttackerRow.front.total + sd.byAttackerRow.back.total;
                    return (
                      <div key={l} className={`glass-card p-3 text-center bg-${c}-500/[0.03]`}>
                        <div className="text-xl font-black text-white">{tot > 0 ? (d.total / tot * 100).toFixed(0) : 0}%</div>
                        <div className="text-[9px] text-gray-400 font-bold">{l}</div>
                        <div className="text-[8px] text-gray-500">{d.total} pall. · eff {d.total > 0 ? ((d.pts - d.err) / d.total * 100).toFixed(0) : 0}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* COSA (Qualità) */}
            {distView === 'cosa' && (
              <div className="space-y-4">
                {[{ label: 'Ricezione → Attacco (Side-out)', keys: ['R3', 'R4', 'R5'], color: 'sky' },
                  { label: 'Difesa → Attacco (Transizione)', keys: ['D3', 'D4', 'D5'], color: 'orange' }].map(section => (
                  <div key={section.label} className="glass-card p-4 space-y-3">
                    <div className={`text-[10px] font-bold text-${section.color}-400`}>{section.label}</div>
                    {section.keys.map(iq => {
                      const data = sd.byInputQuality[iq];
                      if (!data || data.total === 0) return null;
                      const atks = Object.entries(data.byAttacker).sort((a, b) => b[1].total - a[1].total);
                      const qLabel = iq.endsWith('5') ? 'Palleggio vicino a rete' : iq.endsWith('4') ? 'Palleggio staccato' : 'Attacco da bagher';
                      const tempoData = sd.tempo[iq];
                      return (
                        <div key={iq} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-black ${iq.endsWith('5') ? 'text-green-400' : iq.endsWith('4') ? 'text-amber-400' : 'text-red-400'}`}>{iq}</span>
                              <span className="text-[8px] text-gray-500">{qLabel}</span>
                            </div>
                            <span className="text-[8px] text-gray-500">{data.total} pall. · avg A={data.avgAttackValue.toFixed(1)}</span>
                          </div>
                          {tempoData && (tempoData.primo + tempoData.alto) > 0 && (
                            <div className="text-[7px] text-gray-500">1° tempo: <span className="text-amber-400 font-bold">{tempoData.primo}</span> | Palla alta: <span className="text-sky-400">{tempoData.alto}</span> ({((tempoData.primo / (tempoData.primo + tempoData.alto)) * 100).toFixed(0)}% 1°T)</div>
                          )}
                          {atks.slice(0, 4).map(([pNum, stats]) => {
                            const pctV = (stats.total / data.total * 100);
                            const effV = stats.total > 0 ? ((stats.pts - stats.err) / stats.total * 100) : 0;
                            return (
                              <div key={pNum} className="grid grid-cols-[90px,1fr,40px,40px] items-center gap-1">
                                <span className="text-[8px] text-gray-300">#{pNum} {sd.byAttacker[pNum]?.name || ''} <span className={`font-bold ${roleCls(sd.byAttacker[pNum]?.role)}`}>{sd.byAttacker[pNum]?.role}</span></span>
                                <div className="h-2.5 bg-white/5 rounded-full overflow-hidden"><div className={`h-full bg-${section.color}-500/30 rounded-full`} style={{ width: `${Math.max(2, pctV)}%` }} /></div>
                                <span className="text-[7px] text-gray-400 text-right">{pctV.toFixed(0)}%</span>
                                <span className={`text-[7px] font-bold text-right ${effV >= 25 ? 'text-green-400' : effV >= 10 ? 'text-amber-400' : 'text-red-400'}`}>{effV.toFixed(0)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* QUANDO */}
            {distView === 'quando' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[{ l: 'Side-out', d: sd.byPhase.sideOut, c: 'sky' }, { l: 'Transizione', d: sd.byPhase.transition, c: 'orange' }].map(({ l, d, c }) => {
                    const topA = Object.entries(d.byAttacker || {}).sort((a, b) => b[1].total - a[1].total).slice(0, 4);
                    return (
                      <div key={l} className="glass-card p-4 space-y-2">
                        <div className={`text-xs font-bold text-${c}-400`}>{l}</div>
                        <div className="text-xl font-black text-white">{d.total}</div>
                        {topA.map(([pNum, stats]) => (
                          <div key={pNum} className="flex items-center justify-between text-[8px]">
                            <span className="text-gray-300">{sd.byAttacker[pNum]?.name} <span className={`font-bold ${roleCls(sd.byAttacker[pNum]?.role)}`}>{sd.byAttacker[pNum]?.role}</span></span>
                            <span className={`font-bold text-${c}-400`}>{d.total > 0 ? (stats.total / d.total * 100).toFixed(0) : 0}%</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                {/* Attack number */}
                <div className="glass-card p-4 space-y-3">
                  <div className="text-[10px] font-bold text-white">Per Numero Attacco nel Rally</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map(n => {
                      const d = sd.byAttackNumber[n];
                      if (!d) return null;
                      const eff = d.total > 0 ? ((d.pts - d.err) / d.total * 100) : 0;
                      return (
                        <div key={n} className={`bg-white/[0.02] border border-white/5 rounded-xl p-2.5 text-center ${d.total === 0 ? 'opacity-30' : ''}`}>
                          <div className="text-base font-black text-white">{n === 4 ? '4+' : n}°</div>
                          <div className="text-[8px] text-gray-400">{d.total} att.</div>
                          {d.total > 0 && <div className={`text-[9px] font-bold ${eff >= 25 ? 'text-green-400' : eff >= 10 ? 'text-amber-400' : 'text-red-400'}`}>{eff.toFixed(0)}%</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* SO vs Trans delta table */}
                {sdTop.length > 0 && (
                  <div className="glass-card p-4 space-y-2">
                    <div className="text-[10px] font-bold text-white">Delta Distribuzione SO vs Transizione</div>
                    <table className="w-full text-[8px]">
                      <thead><tr className="text-gray-500 border-b border-white/5"><th className="text-left py-1">Giocatrice</th><th className="text-center">%SO</th><th className="text-center">%Trans</th><th className="text-center">Delta</th></tr></thead>
                      <tbody>
                        {sdTop.slice(0, 6).map(([pNum, a]) => {
                          const soP = sd.byPhase.sideOut.total > 0 ? (a.byPhase.sideOut / sd.byPhase.sideOut.total * 100) : 0;
                          const trP = sd.byPhase.transition.total > 0 ? (a.byPhase.transition / sd.byPhase.transition.total * 100) : 0;
                          const d = trP - soP;
                          return (
                            <tr key={pNum} className="border-b border-white/[0.03]">
                              <td className="py-1 text-white font-bold">{a.name} <span className={roleCls(a.role)}>{a.role}</span></td>
                              <td className="text-center text-sky-400">{soP.toFixed(0)}%</td>
                              <td className="text-center text-orange-400">{trP.toFixed(0)}%</td>
                              <td className={`text-center font-bold ${Math.abs(d) > 10 ? (d > 0 ? 'text-orange-400' : 'text-sky-400') : 'text-gray-500'}`}>{d > 0 ? '+' : ''}{d.toFixed(0)}pp</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* PER ROTAZIONE */}
            {distView === 'rotazione' && (
              <div className="glass-card p-4 space-y-3">
                <div className="text-[10px] font-bold text-white">Distribuzione per Rotazione</div>
                <p className="text-[7px] text-gray-600">P1/P6/P5 = 3att in 1ª linea. P2/P3/P4 = 2att + palleggiatrice.</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {[1, 2, 3, 4, 5, 6].map(rot => {
                    const rd = sd.byOurRotation[rot];
                    if (!rd || rd.total === 0) return null;
                    const top = Object.entries(rd.distribution || {}).sort((a, b) => b[1].total - a[1].total).slice(0, 4);
                    return (
                      <div key={rot} className="bg-white/[0.02] border border-white/5 rounded-lg p-2.5 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-white">P{rot}</span>
                          <span className={`text-[7px] px-1 py-0.5 rounded-full font-bold ${rd.mode === '3att' ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'}`}>{rd.mode}</span>
                          <span className="text-[8px] text-gray-500 ml-auto">{rd.total}</span>
                        </div>
                        {top.map(([pNum, st]) => (
                          <div key={pNum} className="flex items-center gap-1">
                            <span className="text-[7px] text-gray-300 w-14 truncate">{sd.byAttacker[pNum]?.name}</span>
                            <span className={`text-[6px] font-bold w-5 ${roleCls(st.role)}`}>{st.role}</span>
                            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-sky-500/30 rounded-full" style={{ width: `${Math.max(3, (st.pct || 0) * 100)}%` }} /></div>
                            <span className="text-[7px] text-gray-400 w-7 text-right">{((st.pct || 0) * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VS AVVERSARIO */}
            {distView === 'avv' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {['2att', '3att'].map(mode => {
                    const d = sd.byOppFrontRow[mode];
                    if (!d || d.total === 0) return <div key={mode} className="glass-card p-3 text-center opacity-30"><div className="text-gray-600">{mode} — no data</div></div>;
                    const topA = Object.entries(d.byAttacker || {}).sort((a, b) => b[1].total - a[1].total).slice(0, 4);
                    return (
                      <div key={mode} className="glass-card p-4 space-y-2">
                        <div className={`text-sm font-black ${mode === '3att' ? 'text-green-400' : 'text-amber-400'}`}>Avv. {mode === '3att' ? '3 Att.' : '2 Att.'}</div>
                        <p className="text-[7px] text-gray-600">{mode === '3att' ? 'Opposto avv. in 1ª linea (muro alto)' : 'Palleggiatore avv. in 1ª linea (muro debole zona 2)'}</p>
                        <div className="text-[8px] text-gray-500">{d.total} palloni</div>
                        {topA.map(([pNum, stats]) => (
                          <div key={pNum} className="flex items-center justify-between text-[8px]">
                            <span className="text-gray-300">{sd.byAttacker[pNum]?.name} <span className={`font-bold ${roleCls(sd.byAttacker[pNum]?.role)}`}>{sd.byAttacker[pNum]?.role}</span></span>
                            <span className="text-gray-400">{(d.total > 0 ? stats.total / d.total * 100 : 0).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                {Object.keys(sd.byOppSpecific || {}).length > 0 && (
                  <div className="glass-card p-4 space-y-3">
                    <div className="text-[10px] font-bold text-white">Per Ruolo Avversario a Muro</div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {Object.entries(sd.byOppSpecific).filter(([, d]) => d.total >= 3).sort((a, b) => b[1].total - a[1].total).map(([specKey, d]) => {
                        const oppRole = specKey.replace('_front', '');
                        const roleLbl = { P: 'Palleggiatrice', B1: 'Banda 1', B2: 'Banda 2', C1: 'Centro 1', C2: 'Centro 2', O: 'Opposto' };
                        const topA = Object.entries(d.byAttacker || {}).sort((a, b) => b[1].total - a[1].total).slice(0, 3);
                        return (
                          <div key={specKey} className="bg-white/[0.02] border border-white/5 rounded-lg p-2 space-y-1">
                            <span className={`text-[9px] font-bold ${roleCls(oppRole)}`}>{roleLbl[oppRole] || oppRole} a muro</span>
                            <span className="text-[7px] text-gray-500 ml-1">({d.total})</span>
                            {topA.map(([pNum, stats]) => (
                              <div key={pNum} className="flex justify-between text-[7px]"><span className="text-gray-300">{sd.byAttacker[pNum]?.name}</span><span className="text-gray-400">{(d.total > 0 ? stats.total / d.total * 100 : 0).toFixed(0)}%</span></div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>)}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 4: SETTIMANA
          ═══════════════════════════════════════════════════════════════ */}
      {tab === 'settimana' && (
        <div className="space-y-4">
          {/* Schedule config (collapsible) */}
          <details className="glass-card p-4 group">
            <summary className="flex items-center justify-between cursor-pointer">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Configurazione Settimanale</span>
              <span className="text-[9px] text-gray-500">{totalSessions} sedute · {totalHours.toFixed(1).replace('.', ',')}h</span>
            </summary>
            <div className="space-y-2 mt-3">
              {scheduleRows.map(({ day, cfg }) => (
                <div key={day.id} className="grid grid-cols-[160px,1fr,1fr] gap-2 items-center bg-white/[0.02] border border-white/5 rounded-lg px-3 py-1.5">
                  <label className="flex items-center gap-2 text-[10px] text-gray-200">
                    <input type="checkbox" checked={!!cfg.enabled} onChange={e => updateDay(day.id, { enabled: e.target.checked })} className="accent-sky-500" />{day.label}
                  </label>
                  <select value={cfg.duration} disabled={!cfg.enabled} onChange={e => updateDay(day.id, { duration: Number(e.target.value) })}
                    className="bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-[10px] text-gray-200 disabled:opacity-40">
                    {DURATION_OPTIONS.map(v => <option key={v} value={v}>{String(v).replace('.', ',')}h</option>)}
                  </select>
                  <select value={cfg.sessions} disabled={!cfg.enabled} onChange={e => updateDay(day.id, { sessions: Number(e.target.value) })}
                    className="bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-[10px] text-gray-200 disabled:opacity-40">
                    {SESSIONS_OPTIONS.map(v => <option key={v} value={v}>{v} sed.</option>)}
                  </select>
                </div>
              ))}
              <label className="flex items-center gap-2 text-[9px] text-gray-300 mt-2">
                <input type="checkbox" checked={preferRefinement} onChange={e => setPreferRefinement(e.target.checked)} className="accent-amber-500" />
                Ultima seduta = rifinitura pre-gara
              </label>
            </div>
          </details>

          {/* Planned sessions */}
          <div className="space-y-2">
            {planned.length > 0 ? planned.map((row, idx) => (
              <div key={`${row.dayId}-${idx}`} className={`glass-card p-4 space-y-2 ${row.isPre ? 'ring-1 ring-amber-500/30' : ''}`}>
                {/* Header */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{row.dayLabel}</span>
                    <span className="text-[9px] text-gray-500">Sed. {row.sessionIdx}/{row.daySessions} · {String(row.duration).replace('.', ',')}h</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold ${axisCls(row.focus.axis)}`}>{axisLabel(row.focus.axis)}</span>
                    {row.isPre && <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">PRE-GARA</span>}
                  </div>
                </div>
                {/* Focus + desc */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-sky-400">{row.focus.title}</span>
                  <span className={`text-[7px] px-1 py-0.5 rounded-full ${row.focus.int === 'alta' ? 'bg-red-500/10 text-red-400' : row.focus.int === 'media' ? 'bg-amber-500/10 text-amber-400' : 'bg-green-500/10 text-green-400'}`}>{row.focus.int}</span>
                </div>
                <p className="text-[9px] text-gray-400">{row.desc}</p>
                {/* Time bar */}
                <div className="flex gap-0.5 h-4 rounded-full overflow-hidden">
                  <div className="bg-sky-500/30 flex items-center justify-center" style={{ width: `${row.structure.warmup / row.structure.total * 100}%` }}><span className="text-[6px] text-sky-300 font-bold">{row.structure.warmup}'</span></div>
                  {row.structure.phys > 0 && <div className="bg-rose-500/30 flex items-center justify-center" style={{ width: `${row.structure.phys / row.structure.total * 100}%` }}><span className="text-[6px] text-rose-300 font-bold">{row.structure.phys}'</span></div>}
                  <div className="bg-amber-500/30 flex items-center justify-center" style={{ width: `${row.structure.tech / row.structure.total * 100}%` }}><span className="text-[6px] text-amber-300 font-bold">{row.structure.tech}'</span></div>
                  <div className="bg-purple-500/30 flex items-center justify-center" style={{ width: `${row.structure.tact / row.structure.total * 100}%` }}><span className="text-[6px] text-purple-300 font-bold">{row.structure.tact}'</span></div>
                  <div className="bg-green-500/30 flex items-center justify-center" style={{ width: `${row.structure.game / row.structure.total * 100}%` }}><span className="text-[6px] text-green-300 font-bold">{row.structure.game}'</span></div>
                  <div className="bg-cyan-500/30 flex items-center justify-center" style={{ width: `${row.structure.cooldown / row.structure.total * 100}%` }}><span className="text-[6px] text-cyan-300 font-bold">{row.structure.cooldown}'</span></div>
                </div>
                <div className="flex gap-2 text-[6px] text-gray-600 flex-wrap">
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-sky-500/40 inline-block" />Riscald.</span>
                  {row.structure.phys > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500/40 inline-block" />Fisico</span>}
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500/40 inline-block" />Tecn.</span>
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-500/40 inline-block" />Tatt.</span>
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500/40 inline-block" />6vs6</span>
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500/40 inline-block" />Defatic.</span>
                </div>
                {/* Note */}
                <input type="text" value={sessionNotes[`${row.dayId}-${idx}`] || ''} onChange={e => setSessionNotes(p => ({ ...p, [`${row.dayId}-${idx}`]: e.target.value }))}
                  placeholder="Note per questa seduta..." className="w-full bg-white/[0.02] border border-white/5 rounded px-2 py-1 text-[8px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-sky-500/30" />
              </div>
            )) : <div className="glass-card p-5 text-center text-[10px] text-gray-500">Configura le sedute per generare il piano.</div>}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 5: GIOCATRICI
          ═══════════════════════════════════════════════════════════════ */}
      {tab === 'giocatrici' && (
        <div className="space-y-3">
          {selectedPlayerDetails && (
            <div className="glass-card p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-bold text-white">
                  Evidenza dati giocatrice {selectedPlayerDetails.card?.player?.name || `#${selectedPlayerDetails.pNum}`}
                </div>
                <button
                  onClick={() => setSelectedPlayerNumber('')}
                  className="text-[8px] px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.05]"
                >
                  Reset
                </button>
              </div>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={selectedPlayerDetails.chartData} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="fund" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 9 }} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v, n) => [v == null ? 'N/D' : `${Number(v).toFixed(1)}%`, ({
                      season: 'Media stagione',
                      recent: 'Media recente',
                      weighted: 'Media pesata',
                    }[n] || n)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="season" name="season" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="recent" name="recent" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="weighted" name="weighted" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {playerCards.length > 0 ? playerCards.map(({ player, declining, improving, stable, suggestions: pS, sdData }) => (
            <button
              key={player.number}
              onClick={() => setSelectedPlayerNumber(player.number)}
              className={`glass-card p-4 space-y-2.5 w-full text-left transition-all ${selectedPlayerDetails?.pNum === player.number ? 'ring-1 ring-sky-400/40 bg-sky-500/[0.03]' : 'hover:bg-white/[0.03]'}`}
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white">{player.number}</div>
                <div>
                  <div className="text-sm font-bold text-white">{player.name || player.fullName || `#${player.number}`}</div>
                  <div className="text-[8px] text-gray-500">{player.role || 'N/D'}</div>
                </div>
                <div className="ml-auto flex gap-1">
                  {declining.length > 0 && <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/15">{declining.length} in calo</span>}
                  {improving.length > 0 && <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/15">{improving.length} in crescita</span>}
                </div>
              </div>
              {/* Trend chips */}
              <div className="flex gap-1.5 flex-wrap">
                {declining.map(d => <div key={d.fund} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/5 border border-red-500/10 text-[8px]"><span className="text-red-400 font-bold">▼</span><span className="text-red-300">{fundLabel[d.fund]}</span>{d.rawRecentAvg != null && <span className="text-red-400/60 font-mono">{(d.rawRecentAvg * 100).toFixed(0)}%</span>}</div>)}
                {improving.map(d => <div key={d.fund} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/5 border border-green-500/10 text-[8px]"><span className="text-green-400 font-bold">▲</span><span className="text-green-300">{fundLabel[d.fund]}</span></div>)}
                {stable.map(d => <div key={d.fund} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/5 text-[8px]"><span className="text-gray-500">—</span><span className="text-gray-500">{fundLabel[d.fund]}</span></div>)}
              </div>
              {/* Setter distribution */}
              {sdData && sdData.total >= 2 && (
                <div className="bg-purple-500/[0.04] border border-purple-500/10 rounded-lg p-2 flex gap-4 text-[8px] text-gray-400 flex-wrap">
                  <span className="text-purple-400 font-bold text-[7px] uppercase">Distribuzione</span>
                  <span>Pall: <span className="text-white font-bold">{sdData.total}</span> ({(sdData.pctOfTotal * 100).toFixed(0)}%)</span>
                  <span>Eff: <span className={`font-bold ${sdData.efficiency >= 0.25 ? 'text-green-400' : sdData.efficiency >= 0.1 ? 'text-amber-400' : 'text-red-400'}`}>{(sdData.efficiency * 100).toFixed(0)}%</span></span>
                  <span>SO: {sdData.byPhase.sideOut} · Trans: {sdData.byPhase.transition}</span>
                  {sdData.frontRow.total > 0 && <span>1ªL: {sdData.frontRow.total}</span>}
                  {sdData.backRow.total > 0 && <span>2ªL: {sdData.backRow.total}</span>}
                </div>
              )}
              {/* Suggestions */}
              {pS.length > 0 && (
                <div className="space-y-1">
                  {pS.slice(0, 3).map((s, i) => (
                    <div key={i} className="text-[8px] text-gray-400 bg-white/[0.02] rounded p-1.5 border border-white/5">
                      <span className={`font-bold mr-1 ${s.priority >= 4 ? 'text-red-400' : s.priority >= 3 ? 'text-amber-400' : 'text-green-400'}`}>
                        {s.priority >= 4 ? 'PRIORITÀ' : s.priority >= 3 ? 'ATTENZIONE' : 'OK'}
                      </span>
                      {s.action || s.message}
                    </div>
                  ))}
                </div>
              )}
            </button>
          )) : <div className="glass-card p-5 text-center text-[10px] text-gray-500">Servono almeno 2 partite per le schede giocatrici.</div>}
        </div>
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

// ─── Setter Distribution Section ─────────────────────────────────────────────

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
