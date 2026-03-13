import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend,
} from 'recharts';

// ─── Constants ───────────────────────────────────────────────────────────────

const TRAINING_PLAN_STORAGE_KEY = 'vpa_train_page_config';
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

const DRILL_LIBRARY = [
  // --- ATTACCO ---
  { id: 'att_1', title: 'Rincorsa da Rete', techArea: 'attacco', axis: 'criticita', desc: 'Rincorsa specifica per transizione d→a. Partenza da posizione di muro.' },
  { id: 'att_2', title: 'Attacco su Palla Alta', techArea: 'attacco', axis: 'criticita', desc: 'Gestione del colpo su palle non perfette. Focus su mani-fuori e pallonetto.' },
  { id: 'att_3', title: 'Combinazioni Veloci', techArea: 'attacco', axis: 'crescita', desc: 'Sincronizzazione 1° e 2° tempo. Focus su bande e centrali.' },
  { id: 'att_4', title: 'Direzioni d\'Attacco', techArea: 'attacco', axis: 'gara', desc: 'Attacco su zone specifiche del campo avversario in base allo scouting.' },
  
  // --- RICEZIONE ---
  { id: 'rec_1', title: 'Ricezione zona 1/6', techArea: 'reception', axis: 'criticita', desc: 'Spostamento laterale e piano di rimbalzo su battute lunghe.' },
  { id: 'rec_2', title: 'Conflitto Bande', techArea: 'reception', axis: 'criticita', desc: 'Comunicazione e responsabilità sulle palle di conflitto.' },
  { id: 'rec_3', title: 'Ricezione d\'Attacco', techArea: 'reception', axis: 'crescita', desc: 'Gestione della ricezione su battute aggressive (jump o float tesa).' },
  
  // --- DIFESA ---
  { id: 'def_1', title: 'Difesa su Parallela', techArea: 'defense', axis: 'criticita', desc: 'Posizionamento in zona 1 e 5 per copertura lungo riga.' },
  { id: 'def_2', title: 'Copertura Attacco', techArea: 'defense', axis: 'crescita', desc: 'Reattività sulle palle murate. Posizionamento a semicerchio.' },
  { id: 'def_3', title: 'Transizione D→A Continua', techArea: 'defense', axis: 'gara', desc: 'Serie di 3 palle: difesa, attacco, rincorsa, nuova difesa.' },

  // --- MURO ---
  { id: 'blk_1', title: 'Muro Lettura', techArea: 'block', axis: 'crescita', desc: 'Osservazione dell\'alzatore e tempo di salto sui centrali.' },
  { id: 'blk_2', title: 'Muro Op-Banda', techArea: 'block', axis: 'gara', desc: 'Sostentamento del muro a due su palla alta esterna.' },

  // --- BATTUTA ---
  { id: 'srv_1', title: 'Battuta a Zona', techArea: 'serve', axis: 'gara', desc: 'Mirare ai "conflitti" o alle giocatrici meno efficaci in ricezione.' },
  { id: 'srv_2', title: 'Serie di Consistenza', techArea: 'serve', axis: 'fisico', desc: '10 battute consecutive senza errori a velocità costante.' },
];

const fundLabel = { attack: 'Attacco', serve: 'Battuta', reception: 'Ricezione', defense: 'Difesa', block: 'Muro' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function statusCls(s) {
  return s === 'critical' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 
         s === 'warning' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 
         s === 'good' ? 'text-green-400 bg-green-500/10 border-green-500/20' : 
         'text-gray-500 bg-white/5 border-white/8';
}

function statusIco(s) {
  return s === 'critical' ? '▼' : s === 'warning' ? '~' : s === 'good' ? '▲' : '—';
}

function roleCls(r) {
  return r === 'O' ? 'text-red-400' : (r === 'B1' || r === 'B2') ? 'text-sky-400' : (r === 'C1' || r === 'C2') ? 'text-amber-400' : 'text-purple-400';
}

function axisCls(a) {
  return a === 'criticita' ? 'bg-red-500/15 text-red-400' : a === 'crescita' ? 'bg-green-500/15 text-green-400' : a === 'gara' ? 'bg-purple-500/15 text-purple-400' : 'bg-rose-500/15 text-rose-400';
}

function axisLabel(a) {
  return a === 'criticita' ? 'Criticità' : a === 'crescita' ? 'Crescita' : a === 'gara' ? 'Gara' : 'Fisico';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TrainPage({ 
  analytics, 
  matches, 
  calendar = [], 
  standings = [], 
  ownerTeamName = '', 
  allPlayers = [], 
  onOpenOpponentComment 
}) {
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
      byOurRotation: isPlainObject(rawSd.byOurRotation) ? rawSd.byOurRotation : {},
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
  const [tab, setTab] = useState('cockpit'); // Renamed panoramica to cockpit
  const [targetPosition, setTargetPosition] = useState(() => Number(stored.current.targetPosition) || 3);
  const [coachNotes, setCoachNotes] = useState(() => stored.current.coachNotes || '');
  const [sessionCustomizations, setSessionCustomizations] = useState(() => stored.current.sessionCustomizations || {});
  const [editingSessionId, setEditingSessionId] = useState(null);
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

  const DEF_PRIO = { criticita: 30, crescita: 20, gara: 35, fisico: 15 };
  const [prio, setPrio] = useState(() => {
    const s = stored.current.prio;
    return (s && typeof s.criticita === 'number') ? s : DEF_PRIO;
  });
  
  const [selectedFund, setSelectedFund] = useState('attack');
  const [selectedPlayerNumber, setSelectedPlayerNumber] = useState('');
  const [selectedFocusAxis, setSelectedFocusAxis] = useState('all');

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
      schedule: trainingSchedule, preferRefinement, targetPosition, coachNotes, sessionNotes, prio, sessionCustomizations
    })); } catch {}
  }, [trainingSchedule, preferRefinement, targetPosition, coachNotes, sessionNotes, prio, sessionCustomizations]);

  // ─── Schedule computations ──
  const scheduleRows = useMemo(() => TRAINING_DAYS.map(day => ({ day, cfg: trainingSchedule[day.id] || { enabled: false, duration: 2, sessions: 1 } })), [trainingSchedule]);
  const activeDays = scheduleRows.filter(({ cfg }) => cfg.enabled && cfg.sessions > 0);
  const totalSessions = activeDays.reduce((s, { cfg }) => s + cfg.sessions, 0);
  const totalHours = activeDays.reduce((s, { cfg }) => s + cfg.duration * cfg.sessions, 0);

  const sessionSlots = useMemo(() => {
    const slots = [];
    for (const { day, cfg } of activeDays) {
      for (let i = 0; i < cfg.sessions; i++) {
        const id = `${day.id}-${i + 1}`;
        slots.push({ id, dayId: day.id, dayLabel: day.label, jsDay: day.jsDay, duration: cfg.duration, sessionIdx: i + 1, daySessions: cfg.sessions });
      }
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

  const nextOpp = useMemo(() => {
    if (!nextMatch) return null;
    const oppName = normalizeTeamName(nextMatch.home) === ownerUpper ? nextMatch.away : nextMatch.home;
    const pastVs = past.filter(m => normalizeTeamName(m.home) === normalizeTeamName(oppName) || normalizeTeamName(m.away) === normalizeTeamName(oppName));
    const scoutVs = matchAnalytics.filter(ma => { const o = normalizeTeamName(ma.match?.metadata?.opponent || ''); return o === normalizeTeamName(oppName) || o.includes(normalizeTeamName(oppName).substring(0, 8)); });
    const oppStanding = standings?.find(t => { const n = normalizeTeamName(t.name); return n === normalizeTeamName(oppName) || n.includes(normalizeTeamName(oppName).substring(0, 8)); });
    return { oppName, pastVs, scoutVs, oppStanding, played: pastVs.length > 0 };
  }, [nextMatch, ownerUpper, past, matchAnalytics, standings]);

  // ─── Suggested priorities ──
  const suggestedPrio = useMemo(() => {
    let critScore = 0, crscScore = 0, garaScore = 0, fisScore = 0;
    const reasons = { criticita: [], crescita: [], gara: [], fisico: [] };

    const criticalSugg = allSuggestions.filter(s => s.priority >= 4).length;
    if (criticalSugg > 0) { critScore += Math.min(criticalSugg * 8, 35); reasons.criticita.push(`${criticalSugg} segnali critici`); }
    
    const improvingPlayers = Object.values(playerTrends).filter(p => Object.values(p.trends || {}).some(t => t.rawTrend === 'improving')).length;
    if (improvingPlayers > 0) { crscScore += Math.min(improvingPlayers * 5, 20); reasons.crescita.push(`${improvingPlayers} giocatrici in crescita`); }

    if (daysToMatch !== null && daysToMatch <= 3) { garaScore += 25; reasons.gara.push(`Gara tra ${daysToMatch}gg`); }
    
    fisScore = 15; reasons.fisico.push('Mantenimento base');

    const rawTotal = (critScore + crscScore + garaScore + fisScore) || 1;
    const normalize = v => Math.round(v / rawTotal * 100 / 5) * 5;
    let suggested = { criticita: normalize(critScore), crescita: normalize(crscScore), gara: normalize(garaScore), fisico: normalize(fisScore) };
    const sum = Object.values(suggested).reduce((s, v) => s + v, 0);
    if (sum !== 100) { const biggest = Object.keys(suggested).reduce((a, b) => suggested[a] >= suggested[b] ? a : b); suggested[biggest] += 100 - sum; }
    return { values: suggested, reasons };
  }, [allSuggestions, playerTrends, daysToMatch]);

  // ─── Training Blocks ──
  const focusBlocks = useMemo(() => {
    const blocks = [];
    const hasR5Waste = declines.some(s => s.type === 'r_to_a_waste');
    const hasTransGap = declines.some(s => s.type === 'side_out_vs_transition_gap');
    
    blocks.push({ title: 'Side-out R→A', axis: hasR5Waste ? 'criticita' : 'crescita',
      desc: 'Ricezione positiva → Alzata → Attacco',
      drills: ['Ricezione + attacco rapido', 'Side-out a rotazione'] });
    
    blocks.push({ title: 'Transizione D→A', axis: hasTransGap ? 'criticita' : 'crescita',
      desc: 'Difesa → Rincorsa corta → Attacco',
      drills: ['Difesa-attacco continuo', 'Rincorsa corta da rete'] });
    
    blocks.push({ title: 'Tattica Gara', axis: 'gara',
      desc: 'Studio avversario e sistemi di gioco',
      drills: ['6vs6 situazionale', 'Muro-difesa su avversario'] });
    
    blocks.push({ title: 'Condizione Fisica', axis: 'fisico',
      desc: 'Prevenzione e potenziamento',
      drills: ['Core stability', 'Pliometria specifica'] });

    return blocks;
  }, [declines]);

  // ─── Planned sessions allocation ──
  const assignedSessions = useMemo(() => {
    const n = sessionSlots.length;
    if (n === 0 || focusBlocks.length === 0) return [];
    const result = [];
    for (let i = 0; i < n; i++) {
      // Simple rotation for now, matched with priority weights in a more complex impl
      result.push(focusBlocks[i % focusBlocks.length]);
    }
    return result;
  }, [sessionSlots, focusBlocks]);

  const planned = useMemo(() => sessionSlots.map((slot, idx) => {
    const custom = sessionCustomizations[slot.id];
    const baseBlock = assignedSessions[idx] || focusBlocks[0];
    
    // Override focus if customized
    const focus = custom?.focusTitle ? {
      title: custom.focusTitle,
      axis: custom.axis || baseBlock.axis,
      desc: custom.desc || baseBlock.desc,
      drills: custom.drills || baseBlock.drills,
      techArea: custom.techArea
    } : baseBlock;

    const mins = Math.round(slot.duration * 60);
    const warmup = custom?.times?.warmup ?? Math.round(mins * 0.15);
    const cooldown = custom?.times?.cooldown ?? 5;
    const tech = custom?.times?.tech ?? Math.round((mins - warmup - cooldown) * 0.3);
    const tact = custom?.times?.tact ?? Math.round((mins - warmup - cooldown) * 0.4);
    const game = custom?.times?.game ?? (mins - warmup - cooldown - tech - tact);
    
    return { 
      ...slot, 
      focus, 
      customized: !!custom,
      playerTags: custom?.playerTags || [],
      structure: { warmup, tech, tact, game, cooldown, total: mins } 
    };
  }), [sessionSlots, assignedSessions, focusBlocks, sessionCustomizations]);

  // ─── Render Helpers ──
  const TABS = [
    { k: 'cockpit', l: 'The Cockpit', icon: '🚀' },
    { k: 'scheduler', l: 'Weekly Schedule', icon: '📅' },
    { k: 'focus', l: 'Priorities', icon: '🎯' },
    { k: 'sessions', l: 'Sessions Detail', icon: '📝' },
    { k: 'roadmap', l: 'Matches Roadmap', icon: '🛤️' },
  ];

  const handleUpdateCustomization = (sessionId, patch) => {
    setSessionCustomizations(prev => ({
      ...prev,
      [sessionId]: { ...(prev[sessionId] || {}), ...patch }
    }));
  };

  const handleResetSession = (sessionId) => {
    setSessionCustomizations(prev => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  };

  const fmtDate = d => new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(d);
  const updateDay = (id, patch) => setTrainingSchedule(prev => ({ ...prev, [id]: { ...(prev[id] || { enabled: false, duration: 2, sessions: 1 }), ...patch } }));

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      
      {/* ─── COCKPIT HEADER ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5 border-l-4 border-amber-500 flex flex-col justify-center">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Next Match</div>
          {nextMatch ? (
            <div className="mt-2">
              <div className="text-2xl font-black text-white">{nextOpp.oppName}</div>
              <div className="text-xs text-amber-400 font-bold">{daysToMatch} giorni rimanenti · {fmtDate(nextMatch.kickoff)}</div>
            </div>
          ) : <div className="text-xs text-gray-500 mt-2">Nessun match in arrivo</div>}
        </div>

        <div className="glass-card p-5 border-l-4 border-sky-500 flex flex-col justify-center">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Target Objective</div>
          {standingGap ? (
            <div className="mt-2">
              <div className="text-2xl font-black text-white">{standingGap.target}° Posto</div>
              <div className="text-xs text-sky-400 font-bold">Gap: {standingGap.diff} pt · {standingGap.remaining} gare rimaste</div>
            </div>
          ) : <div className="text-xs text-gray-500 mt-2">Target non impostato</div>}
        </div>

        <div className="glass-card p-5 border-l-4 border-green-500 flex flex-col justify-center">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Training Volume</div>
          <div className="mt-2 text-2xl font-black text-white">{totalHours.toFixed(1)}h / sett</div>
          <div className="text-xs text-green-400 font-bold">{totalSessions} sedute pianificate</div>
        </div>
      </div>

      {/* ─── TAB NAVIGATION ─── */}
      <div className="flex gap-2 p-1 bg-white/[0.03] rounded-2xl border border-white/5 overflow-x-auto no-scrollbar">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex-1 min-w-[120px] px-4 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${tab === t.k ? 'bg-white/10 text-white shadow-xl border border-white/10' : 'text-gray-500 hover:text-gray-300'}`}>
            <span>{t.icon}</span>
            <span>{t.l}</span>
          </button>
        ))}
      </div>

      {/* ─── TAB CONTENT ─── */}
      <div className="min-h-[400px]">
        
        {tab === 'cockpit' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,350px] gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-6">
              {/* Fundamental Status */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-tighter">Team Health State</h3>
                <div className="grid grid-cols-5 gap-3">
                  {Object.entries(fundLabel).map(([key, label]) => {
                    const status = allSuggestions.some(s => s.fundamental === key && s.priority >= 4) ? 'critical' : 
                                   allSuggestions.some(s => s.fundamental === key && s.priority === 3) ? 'warning' : 'good';
                    return (
                      <div key={key} className={`p-4 rounded-2xl border text-center ${statusCls(status)}`}>
                        <div className="text-xl mb-1">{statusIco(status)}</div>
                        <div className="text-[9px] font-black uppercase">{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Priorities List */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-tighter">Critical Focus Areas</h3>
                <div className="space-y-3">
                  {declines.slice(0, 4).map((s, idx) => (
                    <div key={idx} className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 font-black text-xs">P{s.priority}</div>
                      <div className="flex-1">
                        <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">{s.fundamental}</div>
                        <div className="text-xs text-white font-bold">{s.message}</div>
                        <div className="text-[10px] text-sky-400 mt-1">→ {s.action}</div>
                      </div>
                    </div>
                  ))}
                  {declines.length === 0 && <div className="text-center py-10 text-gray-500 text-xs">Nessuna criticità rilevata dai dati</div>}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Coach Quick Notes */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-tighter">Coach Logbook</h3>
                <textarea 
                  value={coachNotes} 
                  onChange={e => setCoachNotes(e.target.value)} 
                  className="w-full h-40 bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/30 resize-none"
                  placeholder="Annota infortuni, morale team o osservazioni tattiche..."
                />
              </div>
              
              {/* Mini Standings Navigator */}
              <div className="glass-card p-6 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-tighter">Target Tracker</h3>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 font-bold">Imposta Obiettivo Position:</span>
                  <select value={targetPosition} onChange={e => setTargetPosition(Number(e.target.value))} className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white">
                    {Array.from({ length: 14 }, (_, i) => <option key={i+1} value={i+1}>{i+1}° Posto</option>)}
                  </select>
                </div>
                {standingGap && (
                  <div className={`p-4 rounded-xl border ${standingGap.diff <= 0 ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                    <div className="text-[10px] font-black uppercase mb-1">Gap Analysis</div>
                    <div className="text-xs leading-relaxed">
                      {standingGap.diff <= 0 ? `Obiettivo raggiunto! Sei sopra il target.` : `Ti mancano ${standingGap.diff} punti per raggiungere il ${standingGap.targetName}.`}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'scheduler' && (
          <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-sm font-black text-white uppercase tracking-tighter mb-6">Weekly Training Architect</h3>
            <div className="space-y-4">
              {scheduleRows.map(({ day, cfg }) => (
                <div key={day.id} className={`grid grid-cols-1 md:grid-cols-[200px,1fr,150px,150px] gap-4 items-center p-4 rounded-2xl border transition-all ${cfg.enabled ? 'bg-white/[0.04] border-white/10' : 'bg-transparent border-white/5 opacity-50'}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={!!cfg.enabled} onChange={e => updateDay(day.id, { enabled: e.target.checked })} className="w-5 h-5 rounded accent-sky-500" />
                    <span className="text-sm font-black text-white uppercase">{day.label}</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden flex-1">
                    {cfg.enabled && <div className="h-full bg-sky-500/40" style={{ width: `${(cfg.duration * cfg.sessions / 9) * 100}%` }} />}
                  </div>
                  <select value={cfg.duration} disabled={!cfg.enabled} onChange={e => updateDay(day.id, { duration: Number(e.target.value) })} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white">
                    {DURATION_OPTIONS.map(v => <option key={v} value={v}>{v} Ore</option>)}
                  </select>
                  <select value={cfg.sessions} disabled={!cfg.enabled} onChange={e => updateDay(day.id, { sessions: Number(e.target.value) })} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white">
                    {SESSIONS_OPTIONS.map(v => <option key={v} value={v}>{v} Sedute</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'focus' && (
          <div className="glass-card p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-tighter">Priority Mixer</h3>
                <p className="text-[10px] text-gray-500 mt-1 uppercase">Sposta i cursori per bilanciare il carico di lavoro settimanale</p>
              </div>
              <button onClick={() => setPrio(suggestedPrio.values)} className="px-4 py-2 rounded-xl bg-sky-500/20 text-sky-400 text-[10px] font-black border border-sky-500/20 hover:bg-sky-500/30 transition-all">APPLICA SUGGERIMENTI DATI</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                {[
                  { k: 'criticita', l: 'Criticità / Trend', c: 'text-red-400', bar: 'bg-red-500/40' },
                  { k: 'crescita', l: 'Crescita / Skill', c: 'text-green-400', bar: 'bg-green-500/40' },
                  { k: 'gara', l: 'Preparazione Gara', c: 'text-purple-400', bar: 'bg-purple-500/40' },
                  { k: 'fisico', l: 'Fisico', c: 'text-rose-400', bar: 'bg-rose-500/40' },
                ].map(ax => (
                  <div key={ax.k} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-white uppercase">{ax.l}</span>
                      <span className={`text-sm font-black ${ax.c}`}>{prio[ax.k]}%</span>
                    </div>
                    <input type="range" min={0} max={100} step={5} value={prio[ax.k]} onChange={e => adjustPrio(ax.k, Number(e.target.value))} className={`w-full h-2 rounded-full appearance-none cursor-pointer bg-white/5`} />
                  </div>
                ))}
              </div>

              <div className="flex flex-col justify-center items-center p-8 bg-white/[0.02] rounded-3xl border border-white/5">
                <div className="w-full h-8 rounded-2xl overflow-hidden flex mb-6">
                  {prio.criticita > 0 && <div className="bg-red-500/50" style={{ width: `${prio.criticita}%` }} />}
                  {prio.crescita > 0 && <div className="bg-green-500/50" style={{ width: `${prio.crescita}%` }} />}
                  {prio.gara > 0 && <div className="bg-purple-500/50" style={{ width: `${prio.gara}%` }} />}
                  {prio.fisico > 0 && <div className="bg-rose-500/50" style={{ width: `${prio.fisico}%` }} />}
                </div>
                <div className="space-y-2 w-full">
                  <div className="text-[10px] font-black text-gray-500 uppercase mb-2">Perché questi valori?</div>
                  {suggestedPrio.reasons.criticita.concat(suggestedPrio.reasons.gara).slice(0, 4).map((r, i) => (
                    <div key={i} className="text-[10px] text-gray-400 flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-sky-500/50" /> {r}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'sessions' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {editingSessionId && (
              <SessionEditor 
                session={planned.find(s => s.id === editingSessionId)}
                allPlayers={allPlayers}
                onClose={() => setEditingSessionId(null)}
                onUpdate={(patch) => handleUpdateCustomization(editingSessionId, patch)}
                onReset={() => handleResetSession(editingSessionId)}
              />
            )}

            {planned.length > 0 ? planned.map((row, idx) => (
              <div key={idx} 
                onClick={() => setEditingSessionId(row.id)}
                className={`glass-card overflow-hidden transition-all cursor-pointer hover:border-sky-500/30 group ${row.customized ? 'ring-1 ring-amber-500/30' : ''}`}
              >
                <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.03] flex flex-col items-center justify-center border border-white/5">
                      <div className="text-[8px] text-gray-500 font-black uppercase">{row.dayLabel.slice(0, 3)}</div>
                      <div className="text-sm font-black text-white">{row.sessionIdx}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-2">
                         Seduta {idx + 1}
                         {row.customized && <span className="text-amber-500 font-black text-[8px] border border-amber-500/30 px-1 rounded">CUSTOM</span>}
                      </div>
                      <div className="text-xl font-black text-white uppercase mt-1 group-hover:text-sky-400 transition-colors">{row.focus.title}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${axisCls(row.focus.axis)}`}>{axisLabel(row.focus.axis)}</span>
                    <span className="text-[10px] text-gray-500 font-black">{row.duration} ORE</span>
                    <div className="text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">✎</div>
                  </div>
                </div>
                {/* Session Dashboard Layout */}
                <div className="p-6 grid grid-cols-1 lg:grid-cols-[1.5fr,1fr] gap-8">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="text-[10px] text-gray-500 font-black uppercase">Session Roadmap</div>
                      <div className="flex h-12 rounded-2xl overflow-hidden border border-white/10 shadow-lg">
                        <div className="bg-sky-500/20 border-r border-white/5 flex items-center justify-center" style={{ width: `${row.structure.warmup/row.structure.total*100}%` }}>
                          <span className="text-[9px] font-black text-sky-400">{row.structure.warmup}'</span>
                        </div>
                        <div className="bg-amber-500/20 border-r border-white/5 flex items-center justify-center" style={{ width: `${row.structure.tech/row.structure.total*100}%` }}>
                          <span className="text-[9px] font-black text-amber-400">{row.structure.tech}'</span>
                        </div>
                        <div className="bg-purple-500/20 border-r border-white/5 flex items-center justify-center" style={{ width: `${row.structure.tact/row.structure.total*100}%` }}>
                          <span className="text-[9px] font-black text-purple-400">{row.structure.tact}'</span>
                        </div>
                        <div className="bg-green-500/20 border-r border-white/5 flex items-center justify-center" style={{ width: `${row.structure.game/row.structure.total*100}%` }}>
                          <span className="text-[9px] font-black text-green-400">{row.structure.game}'</span>
                        </div>
                        <div className="bg-gray-500/20 flex items-center justify-center" style={{ width: `${row.structure.cooldown/row.structure.total*100}%` }}>
                          <span className="text-[9px] font-black text-gray-400">{row.structure.cooldown}'</span>
                        </div>
                      </div>
                      <div className="flex gap-3 flex-wrap">
                        {[{l:'Warmup', c:'bg-sky-500'}, {l:'Tecnica', c:'bg-amber-500'}, {l:'Tattica', c:'bg-purple-500'}, {l:'6vs6', c:'bg-green-500'}, {l:'CoolDown', c:'bg-gray-500'}].map(s => (
                          <div key={s.l} className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.02] rounded-lg border border-white/5">
                            <div className={`w-1.5 h-1.5 rounded-full ${s.c}`} />
                            <span className="text-[8px] text-gray-400 font-black uppercase">{s.l}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {row.playerTags && row.playerTags.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] text-gray-500 font-black uppercase">Focus Players</div>
                        <div className="flex gap-2 flex-wrap">
                          {row.playerTags.map(pNum => {
                            const p = allPlayers.find(ap => ap.number === pNum);
                            return (
                              <div key={pNum} className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center gap-2">
                                <span className="text-[9px] font-black text-amber-500">#{pNum}</span>
                                <span className="text-[10px] text-amber-200 font-bold">{p?.name || 'Player'}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="text-[10px] text-gray-500 font-black uppercase">Drills & Exercises</div>
                    <div className="grid grid-cols-1 gap-2">
                      {row.focus.drills.map((d, i) => (
                        <div key={i} className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl text-xs text-gray-200 flex items-start gap-4 hover:bg-white/[0.05] transition-all">
                          <span className="w-6 h-6 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400 font-black text-[10px]">{i+1}</span>
                          <div className="flex-1">
                            <div className="font-bold">{typeof d === 'string' ? d : d.title}</div>
                            {d.desc && <div className="text-[10px] text-gray-500 mt-1 italic">{d.desc}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )) : <div className="text-center py-20 text-gray-500 text-sm">Abilita almeno una seduta nello Scheduler per generare il piano.</div>}
          </div>
        )}

        {tab === 'roadmap' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {upcoming.map((m, idx) => {
              const oppName = normalizeTeamName(m.home) === ownerUpper ? m.away : m.home;
              const standing = standings?.find(t => normalizeTeamName(t.name) === normalizeTeamName(oppName));
              const isEasy = standing && ourStanding && standing.rank > ourStanding.rank + 3;
              const isHard = standing && ourStanding && standing.rank < ourStanding.rank - 3;
              
              return (
                <div key={idx} className={`glass-card p-6 border-t-4 ${isHard ? 'border-red-500' : isEasy ? 'border-green-500' : 'border-sky-500'} space-y-4`}>
                    <div className="flex justify-between items-start">
                        <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Giornata {m.giornata || '?'}</div>
                        <div className="text-[10px] font-black text-gray-400">{fmtDate(m.kickoff)}</div>
                    </div>
                    <div>
                        <div className="text-xl font-black text-white truncate">{oppName}</div>
                        <div className="text-[10px] font-bold text-gray-500 mt-1 uppercase">@{m.campo || 'Palazzetto'}</div>
                    </div>
                    <div className="flex gap-2">
                        {standing && <span className="px-2 py-0.5 rounded bg-white/5 text-[9px] text-gray-400 font-bold">{standing.rank}° Classifica</span>}
                        {standing && <span className="px-2 py-0.5 rounded bg-white/5 text-[9px] text-gray-400 font-bold">{standing.pts} Punti</span>}
                    </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  );
}
