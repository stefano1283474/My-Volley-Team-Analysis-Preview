// ============================================================================
// MATCH-STATS — Riepilogo statistiche + tabelle per avversario e per player
// ============================================================================
import { useState, useMemo } from 'react';

// ─── Formatters ──────────────────────────────────────────────────────────────
function fPct(v)  { if (v == null || !Number.isFinite(v) || v === 0) return '—'; return (v * 100).toFixed(1) + '%'; }
function fEff(v)  { if (v == null || !Number.isFinite(v)) return '—'; return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%'; }
function fNum(v)  { if (v == null || !Number.isFinite(Number(v))) return '—'; return Number(v); }
function fInt(v)  { const n = Number(v); return Number.isFinite(n) && n !== 0 ? n : '—'; }
function fVM(v)   { if (v == null || !Number.isFinite(v)) return '—'; return v.toFixed(2); }
function fDelta(v){ if (v == null || !Number.isFinite(v)) return '—'; return (v >= 0 ? '+' : '') + v.toFixed(2); }

function effColor(v) {
  if (v == null || !Number.isFinite(v)) return 'text-gray-500';
  if (v >= 0.20) return 'text-emerald-400';
  if (v >= 0.05) return 'text-amber-400';
  if (v >= 0)    return 'text-yellow-500';
  return 'text-red-400';
}
function killColor(v) {
  if (v == null || !Number.isFinite(v)) return 'text-gray-500';
  if (v >= 0.45) return 'text-emerald-400';
  if (v >= 0.30) return 'text-amber-400';
  return 'text-yellow-500';
}
function recColor(v) {
  if (v == null || !Number.isFinite(v)) return 'text-gray-500';
  if (v >= 0.50) return 'text-emerald-400';
  if (v >= 0.35) return 'text-amber-400';
  return 'text-yellow-500';
}
function vmColor(v) {
  if (v == null || !Number.isFinite(v)) return 'text-gray-500';
  if (v >= 4.0) return 'text-emerald-400';
  if (v >= 3.0) return 'text-amber-400';
  if (v >= 2.0) return 'text-yellow-500';
  return 'text-red-400';
}
function deltaColor(v) {
  if (v == null || !Number.isFinite(v)) return 'text-gray-500';
  if (v > 0.05)  return 'text-emerald-400';
  if (v > -0.05) return 'text-gray-400';
  return 'text-red-400';
}
function coeffColor(c) {
  if (c == null || !Number.isFinite(c)) return 'text-gray-500';
  if (c <= -3) return 'text-red-400';
  if (c <= 0)  return 'text-amber-400';
  if (c <= 3)  return 'text-emerald-400';
  return 'text-green-300 font-bold';
}

function normDate(d) {
  if (!d) return '';
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : String(d);
}
function displayDate(d) {
  if (!d) return '—';
  const iso = normDate(d);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}` : d;
}

// ─── Quality-weighted mean on 1–5 scale (5=kill best, 1=err worst) ──────────
// This is the "valore medio" formula: Σ(qualità_i × count_i) / Σcount_i
function valoreMedio(kill, pos, exc, neg, err) {
  const tot = (kill||0)+(pos||0)+(exc||0)+(neg||0)+(err||0);
  if (tot === 0) return null;
  return (5*(kill||0) + 4*(pos||0) + 3*(exc||0) + 2*(neg||0) + 1*(err||0)) / tot;
}

// ─── Fundamental configuration ────────────────────────────────────────────────
const FUND_CFG = {
  attack: {
    label: 'Attacco',   color: '#f43f5e', bg: 'rgba(244,63,94,0.10)',
    killLabel: 'Kill',  pctLabel: '%Kill', hasTot: true, colorFn: killColor,
  },
  serve: {
    label: 'Battuta',   color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)',
    killLabel: 'Ace',   pctLabel: '%Ace',  hasTot: true, colorFn: killColor,
  },
  block: {
    label: 'Muro',      color: '#f59e0b', bg: 'rgba(245,158,11,0.10)',
    killLabel: 'Kill',  pctLabel: null,   hasTot: false, colorFn: null,
  },
  reception: {
    label: 'Ricezione', color: '#0ea5e9', bg: 'rgba(14,165,233,0.10)',
    killLabel: '+',     pctLabel: '%Pos',  hasTot: true, colorFn: recColor,
  },
  defense: {
    label: 'Difesa',    color: '#10b981', bg: 'rgba(16,185,129,0.10)',
    killLabel: '+',     pctLabel: null,   hasTot: true, colorFn: null,
  },
};
const FUND_ORDER = ['attack', 'serve', 'reception', 'defense', 'block'];
const OPPONENT_FUNDS = ['attack', 'serve', 'reception', 'defense'];

// ─── Build match-weight lookup map from analytics ─────────────────────────────
function buildMatchWeightMap(analytics) {
  if (!analytics?.matchAnalytics) return {};
  const map = {};
  for (const entry of analytics.matchAnalytics) {
    const matchId = entry.match?.id;
    if (!matchId) continue;
    map[matchId] = {
      weight:      entry.matchWeight?.final ?? 1,
      fundWeights: entry.fundWeights || {},
      playerStats: entry.playerStats || [],
    };
  }
  return map;
}

// ─── Forecast coefficient (rank 1 = -5 hardest, rank N = +5 easiest) ─────────
function forecastCoeff(rank, N) {
  if (!rank || !N || N <= 1) return null;
  const c = Math.round(5 * (2 * (rank - 1) / (N - 1) - 1));
  return Math.max(-5, Math.min(5, c));
}

// ─── Find opponent rank in standings (fuzzy name match) ───────────────────────
function findOpponentRank(standings, opponentName) {
  if (!standings?.length || !opponentName) return null;
  const norm = (s) => String(s || '').trim().toUpperCase();
  const oppNorm = norm(opponentName);
  const found = standings.find(s => {
    const sn = norm(s.name);
    return sn === oppNorm || sn.includes(oppNorm) || oppNorm.includes(sn);
  });
  return found ? { rank: found.rank, pts: found.pts } : null;
}

// ─── Extract raw counts for a fundamental from a single match ────────────────
// Returns { kill, pos, exc, neg, err, tot } or null if no data
function extractFundCounts(match, fund) {
  const r = match?.riepilogo;
  if (!r) return null;
  const t = r.team?.[fund];
  if (!t || !t.tot) return null;
  return { kill: t.kill||0, pos: t.pos||0, exc: t.exc||0, neg: t.neg||0, err: t.err||0, tot: t.tot||0 };
}

// ─── Extract player rows for a fundamental from a single match ────────────────
function extractFundRows(match, fund, matchWeightMap) {
  const r = match?.riepilogo;
  if (!r) return [];
  const mwEntry = matchWeightMap?.[match.id];
  const getWeightedEff = (number, name) => {
    if (!mwEntry?.playerStats?.length) return null;
    const ps = mwEntry.playerStats.find(p => p.number === number || p.name === name);
    return ps?.weighted?.[fund]?.efficacy ?? null;
  };
  let rows = [];
  if (fund === 'reception') {
    rows = (r.playerReception || []).map(p => ({
      number: p.number, name: p.name,
      kill: p.kill, pos: p.pos, exc: p.exc, neg: p.neg, err: p.err,
      tot: p.tot, pct: p.pct, efficacy: p.efficacy, efficiency: p.efficiency,
    }));
  } else if (fund === 'defense') {
    rows = (r.playerDefense || []).map(p => ({
      number: p.number, name: p.name,
      kill: p.kill, pos: p.pos, exc: p.exc, neg: p.neg, err: p.err,
      tot: p.tot, pct: p.pct, efficacy: p.efficacy, efficiency: p.efficiency,
    }));
  } else {
    rows = (r.playerStats || []).map(p => {
      const s = p[fund] || {};
      return {
        number: p.number, name: p.name,
        kill: s.kill, pos: s.pos, exc: s.exc, neg: s.neg, err: s.err,
        tot: s.tot, pct: s.pct, efficacy: s.efficacy, efficiency: s.efficiency,
      };
    });
  }
  return rows.map(row => ({
    ...row,
    weightedEff: getWeightedEff(row.number, row.name),
  }));
}

// ─── Aggregate player rows across multiple matches ────────────────────────────
function aggregateFundRows(matches, fund, matchWeightMap) {
  const map = {};
  for (const m of matches) {
    const rows = extractFundRows(m, fund, matchWeightMap);
    for (const r of rows) {
      const key = r.number || r.name;
      if (!key) continue;
      if (!map[key]) map[key] = {
        number: r.number, name: r.name,
        kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0, weightedEffVals: [],
      };
      const p = map[key];
      p.kill += r.kill||0; p.pos += r.pos||0; p.exc += r.exc||0;
      p.neg  += r.neg ||0; p.err += r.err||0; p.tot += r.tot||0;
      if (r.weightedEff != null && Number.isFinite(r.weightedEff)) p.weightedEffVals.push(r.weightedEff);
    }
  }
  return Object.values(map).map(p => {
    const tot = p.tot || 0;
    const efficacy   = tot > 0 ? p.kill / tot : null;                              // Efficacia = Azioni Vincenti / Totale
    const efficiency = tot > 0 ? (p.kill - p.err - (p.neg||0)) / tot : null;       // Efficienza = (Vincenti - Errori - Muri Subiti) / Totale
    const cfg = FUND_CFG[fund];
    let pct = null;
    if (cfg.hasTot && tot > 0) pct = fund === 'reception' ? (p.kill + p.pos + p.exc) / tot : p.kill / tot;
    const blkEff = fund === 'block' && tot > 0
      ? p.kill / tot : null;  // Efficacia muro = Kill / Totale
    const weightedEff = p.weightedEffVals.length > 0
      ? p.weightedEffVals.reduce((s, v) => s + v, 0) / p.weightedEffVals.length : null;
    return { ...p, efficacy: fund==='block'?blkEff:efficacy, efficiency: fund==='block'?null:efficiency, pct, weightedEff };
  }).filter(p => (p.kill||0)+(p.pos||0)+(p.exc||0)+(p.neg||0)+(p.err||0)+(p.tot||0) > 0)
    .sort((a, b) => (a.number||'').localeCompare(b.number||''));
}

// ─── Build per-opponent TABLE rows (Tabelle section) ─────────────────────────
// Aggregates raw counts per opponent; computes valore medio (1–5 scale)
function buildOpponentTableData(matches, fund, standings) {
  const N = standings?.length || 0;
  const oppMap = {};
  // Also accumulate totals across ALL matches for "campionato" baseline
  const camp = { kill:0, pos:0, exc:0, neg:0, err:0 };

  for (const m of matches) {
    const oppName = m.metadata?.opponent;
    if (!oppName) continue;
    const c = extractFundCounts(m, fund);
    if (!c || c.tot === 0) continue;

    if (!oppMap[oppName]) oppMap[oppName] = { name:oppName, kill:0, pos:0, exc:0, neg:0, err:0, tot:0, matchCount:0 };
    const o = oppMap[oppName];
    o.kill+=c.kill; o.pos+=c.pos; o.exc+=c.exc; o.neg+=c.neg; o.err+=c.err; o.tot+=c.tot; o.matchCount++;
    camp.kill+=c.kill; camp.pos+=c.pos; camp.exc+=c.exc; camp.neg+=c.neg; camp.err+=c.err;
  }

  const valCamp = valoreMedio(camp.kill, camp.pos, camp.exc, camp.neg, camp.err);

  return Object.values(oppMap).map(o => {
    const tot = o.tot;
    const efficacy   = tot > 0 ? o.kill / tot : null;                          // Efficacia = Azioni Vincenti / Totale
    const efficiency = tot > 0 ? (o.kill - o.err - o.neg) / tot : null;        // Efficienza = (Vincenti - Errori - Muri Subiti) / Totale
    const valMedio   = valoreMedio(o.kill, o.pos, o.exc, o.neg, o.err);
    const deltaCamp  = (valMedio!=null && valCamp!=null) ? valMedio - valCamp : null;
    const si         = findOpponentRank(standings, o.name);
    const coeff      = si ? forecastCoeff(si.rank, N) : null;
    // Proiezione: starting from league avg, adjusted by difficulty coefficient
    // coeff=-5 → reduce by 0.5 quality points; coeff=+5 → increase by 0.5
    const proiezione = (valCamp!=null && coeff!=null) ? Math.max(1, Math.min(5, valCamp + coeff * 0.1)) : null;
    const deltaProiez= (valMedio!=null && proiezione!=null) ? valMedio - proiezione : null;
    return {
      name: o.name, matchCount: o.matchCount,
      kill: o.kill, pos: o.pos, exc: o.exc, neg: o.neg, err: o.err, tot,
      killPct: tot>0?o.kill/tot:null, posPct: tot>0?o.pos/tot:null,
      excPct:  tot>0?o.exc/tot:null,  negPct:  tot>0?o.neg/tot:null, errPct: tot>0?o.err/tot:null,
      efficacy, efficiency, valMedio, valCamp, deltaCamp, coeff, proiezione, deltaProiez,
      rank: si?.rank ?? null,
    };
  }).sort((a,b) => {
    if (a.rank!=null && b.rank!=null) return a.rank - b.rank;
    if (a.rank!=null) return -1; if (b.rank!=null) return 1;
    return a.name.localeCompare(b.name);
  });
}

// ─── Build per-player TABLE rows (Tabelle section) ───────────────────────────
// Aggregates raw counts per player; computes valore medio (1–5 scale)
function buildPlayerTableData(matches, fund) {
  const playerMap = {};
  // Also accumulate totals across ALL players for "squadra" baseline
  const squadra = { kill:0, pos:0, exc:0, neg:0, err:0 };

  for (const m of matches) {
    const r = m?.riepilogo;
    if (!r) continue;
    let playerList = [];
    if (fund === 'reception') playerList = r.playerReception || [];
    else if (fund === 'defense') playerList = r.playerDefense || [];
    else playerList = (r.playerStats || []).map(p => {
      const s = p[fund] || {};
      return { number: p.number, name: p.name, kill:s.kill, pos:s.pos, exc:s.exc, neg:s.neg, err:s.err, tot:s.tot };
    });

    for (const p of playerList) {
      const key = p.number || p.name;
      if (!key) continue;
      const kill=p.kill||0, pos=p.pos||0, exc=p.exc||0, neg=p.neg||0, err=p.err||0, tot=p.tot||0;
      if (kill+pos+exc+neg+err === 0) continue;
      if (!playerMap[key]) playerMap[key] = { number:p.number, name:p.name, kill:0, pos:0, exc:0, neg:0, err:0, tot:0 };
      const entry = playerMap[key];
      entry.kill+=kill; entry.pos+=pos; entry.exc+=exc; entry.neg+=neg; entry.err+=err; entry.tot+=tot;
      squadra.kill+=kill; squadra.pos+=pos; squadra.exc+=exc; squadra.neg+=neg; squadra.err+=err;
    }
  }

  const valSquadra = valoreMedio(squadra.kill, squadra.pos, squadra.exc, squadra.neg, squadra.err);

  return Object.values(playerMap).map(p => {
    const tot = p.tot;
    const efficacy   = tot > 0 ? p.kill / tot : null;                                          // Efficacia = Azioni Vincenti / Totale
    const efficiency = (fund !== 'block' && tot > 0) ? (p.kill - p.err - p.neg) / tot : null; // Efficienza = (Vincenti - Errori - Muri Subiti) / Totale
    const valMedio   = valoreMedio(p.kill, p.pos, p.exc, p.neg, p.err);
    const deltaSquadra = (valMedio!=null && valSquadra!=null) ? valMedio - valSquadra : null;
    return {
      number: p.number, name: p.name,
      kill: p.kill, pos: p.pos, exc: p.exc, neg: p.neg, err: p.err, tot,
      killPct: tot>0?p.kill/tot:null, posPct: tot>0?p.pos/tot:null,
      excPct:  tot>0?p.exc/tot:null,  negPct:  tot>0?p.neg/tot:null, errPct: tot>0?p.err/tot:null,
      efficacy, efficiency, valMedio, valSquadra, deltaSquadra,
    };
  }).filter(p => p.tot > 0)
    .sort((a,b) => (a.number||'').localeCompare(b.number||''));
}

// ─── Build match summary rows ─────────────────────────────────────────────────
function buildMatchRow(match) {
  const meta = match.metadata || {};
  const sets = match.sets || [];
  const setsWon  = sets.filter(s => s.won).length;
  const setsLost = sets.filter(s => !s.won).length;
  const won = setsWon > setsLost;
  const score = sets.length > 0 ? `${setsWon}-${setsLost}` : '—';
  const setDetail = sets.map(s => `${s.ourScore}-${s.theirScore}`).join(' ');
  const r = match.riepilogo;
  const t = r?.team || {};
  const att = t.attack||{}, ser = t.serve||{}, rec = t.reception||{}, def = t.defense||{}, blk = t.block||{};
  const opp = r?.opponent || {};
  const oa = opp.attack||{}, os = opp.serve||{};
  return {
    id: match.id, date: meta.date||'', opponent: meta.opponent||'—',
    matchType: meta.matchType||'—', homeAway: meta.homeAway||'—', hasData: !!r,
    score, setDetail, won, setsWon, setsLost,
    att_kill: att.kill, att_err: att.err, att_tot: att.tot,
    att_killPct: att.tot>0?att.kill/att.tot:null, att_eff: att.efficacy,
    ser_kill: ser.kill, ser_err: ser.err, ser_tot: ser.tot,
    ser_acePct: ser.tot>0?ser.kill/ser.tot:null, ser_eff: ser.efficacy,
    rec_tot: rec.tot, rec_err: rec.err,
    rec_posPct: rec.tot>0?(rec.kill+rec.pos+rec.exc)/rec.tot:null, rec_eff: rec.efficacy,
    blk_kill: blk.kill, blk_err: blk.err,
    def_tot: def.tot, def_eff: def.efficacy,
    pts_made: r?.totalPointsMade, pts_err: r?.totalErrors,
    opp_att_kill: oa.kill, opp_att_tot: oa.tot,
    opp_att_killPct: oa.tot>0?oa.kill/oa.tot:null, opp_att_eff: oa.efficacy,
    opp_ser_kill: os.kill, opp_ser_tot: os.tot,
    opp_ser_acePct: os.tot>0?os.kill/os.tot:null, opp_ser_eff: os.efficacy,
  };
}

function avg(arr) {
  const v = arr.filter(x => x != null && Number.isFinite(x));
  return v.length ? v.reduce((s,x)=>s+x,0)/v.length : null;
}
function sumArr(arr) {
  const v = arr.filter(x => x != null && Number.isFinite(Number(x)));
  return v.length ? v.reduce((s,x)=>s+Number(x),0) : null;
}

// ─── Column groups for summary table ─────────────────────────────────────────
const COL_GROUPS = [
  { id:'attacco',   label:'ATTACCO',  color:'#f43f5e', bg:'rgba(244,63,94,0.08)',  cols:[
    {key:'att_kill',    label:'Kill', fmt:fNum, colorFn:null},
    {key:'att_tot',     label:'Tot',  fmt:fNum, colorFn:null},
    {key:'att_err',     label:'Err',  fmt:fNum, colorFn:null},
    {key:'att_killPct', label:'%Kill',     fmt:fPct, colorFn:killColor},
    {key:'att_eff',     label:'Efficacia', fmt:fEff, colorFn:effColor},
  ]},
  { id:'battuta',   label:'BATTUTA',  color:'#8b5cf6', bg:'rgba(139,92,246,0.08)', cols:[
    {key:'ser_kill',    label:'Ace',       fmt:fNum, colorFn:null},
    {key:'ser_tot',     label:'Tot',       fmt:fNum, colorFn:null},
    {key:'ser_err',     label:'Err',       fmt:fNum, colorFn:null},
    {key:'ser_acePct',  label:'%Ace',      fmt:fPct, colorFn:killColor},
    {key:'ser_eff',     label:'Efficacia', fmt:fEff, colorFn:effColor},
  ]},
  { id:'ricezione', label:'RICEZIONE',color:'#0ea5e9', bg:'rgba(14,165,233,0.08)', cols:[
    {key:'rec_tot',     label:'Tot',       fmt:fNum, colorFn:null},
    {key:'rec_err',     label:'Err',       fmt:fNum, colorFn:null},
    {key:'rec_posPct',  label:'%Pos',      fmt:fPct, colorFn:recColor},
    {key:'rec_eff',     label:'Efficacia', fmt:fEff, colorFn:effColor},
  ]},
  { id:'muro',      label:'MURO',     color:'#f59e0b', bg:'rgba(245,158,11,0.08)', cols:[
    {key:'blk_kill',    label:'Kill', fmt:fNum, colorFn:null},
    {key:'blk_err',     label:'Err',  fmt:fNum, colorFn:null},
  ]},
  { id:'difesa',    label:'DIFESA',   color:'#10b981', bg:'rgba(16,185,129,0.08)',cols:[
    {key:'def_tot',     label:'Tot',       fmt:fNum, colorFn:null},
    {key:'def_eff',     label:'Efficacia', fmt:fEff, colorFn:effColor},
  ]},
  { id:'punti',     label:'PUNTI',    color:'#94a3b8', bg:'rgba(148,163,184,0.06)',cols:[
    {key:'pts_made',    label:'Fatti',fmt:fNum, colorFn:null},
    {key:'pts_err',     label:'Err',  fmt:fNum, colorFn:null},
  ]},
];
const OPP_GROUPS = [
  { id:'opp_att', label:'ATT. AVV.', color:'#f43f5e', bg:'rgba(244,63,94,0.06)', cols:[
    {key:'opp_att_kill',    label:'Kill', fmt:fNum, colorFn:null},
    {key:'opp_att_tot',     label:'Tot',  fmt:fNum, colorFn:null},
    {key:'opp_att_killPct', label:'%Kill',     fmt:fPct, colorFn:killColor},
    {key:'opp_att_eff',     label:'Efficacia', fmt:fEff, colorFn:effColor},
  ]},
  { id:'opp_ser', label:'BAT. AVV.', color:'#8b5cf6', bg:'rgba(139,92,246,0.06)', cols:[
    {key:'opp_ser_kill',    label:'Ace',       fmt:fNum, colorFn:null},
    {key:'opp_ser_tot',     label:'Tot',       fmt:fNum, colorFn:null},
    {key:'opp_ser_acePct',  label:'%Ace',      fmt:fPct, colorFn:killColor},
    {key:'opp_ser_eff',     label:'Efficacia', fmt:fEff, colorFn:effColor},
  ]},
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function MatchStats({ matches, analytics, standings }) {
  // ── Section 1: Summary table state ──────────────────────────────────────────
  const [sortKey,  setSortKey]  = useState('date');
  const [sortAsc,  setSortAsc]  = useState(true);
  const [showOpp,  setShowOpp]  = useState(false);
  const [expandId, setExpandId] = useState(null);

  // ── Section 2: Player fundamental tables state ───────────────────────────────
  const [playerMatchId, setPlayerMatchId] = useState('all');
  const [activeFund,    setActiveFund]    = useState('attack');

  // ── Section 3: Opponent comparison state ────────────────────────────────────
  const [activeOppFund, setActiveOppFund] = useState('attack');

  // ── Section 4: Tabelle state ─────────────────────────────────────────────────
  const [tableFund,     setTableFund]     = useState('attack');
  const [tableMatchId,  setTableMatchId]  = useState('all');

  // ── Derived ──────────────────────────────────────────────────────────────────
  const matchWeightMap = useMemo(() => buildMatchWeightMap(analytics), [analytics]);
  const rows = useMemo(() => matches.map(buildMatchRow), [matches]);

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === 'date') { va = normDate(va); vb = normDate(vb); }
    if (va == null && vb == null) return 0;
    if (va == null) return sortAsc ? 1 : -1;
    if (vb == null) return sortAsc ? -1 : 1;
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortAsc ? va - vb : vb - va;
  }), [rows, sortKey, sortAsc]);

  const totals = useMemo(() => {
    const pctKeys = new Set(['att_killPct','att_eff','ser_acePct','ser_eff','rec_posPct','rec_eff','def_eff','opp_att_killPct','opp_att_eff','opp_ser_acePct','opp_ser_eff']);
    const allKeys = [...COL_GROUPS, ...OPP_GROUPS].flatMap(g => g.cols.map(c => c.key));
    const result = {};
    for (const k of allKeys) result[k] = pctKeys.has(k) ? avg(rows.map(r => r[k])) : sumArr(rows.map(r => r[k]));
    return result;
  }, [rows]);

  const playerRows = useMemo(() => {
    const target = playerMatchId === 'all' ? matches : matches.filter(m => m.id === playerMatchId);
    if (target.length === 0) return [];
    return aggregateFundRows(target, activeFund, matchWeightMap);
  }, [matches, playerMatchId, activeFund, matchWeightMap]);

  const opponentRows = useMemo(() => {
    const N = standings?.length || 0;
    const oppMap = {};
    for (const m of matches) {
      const oppName = m.metadata?.opponent; if (!oppName) continue;
      const c = extractFundCounts(m, activeOppFund); if (!c || c.tot === 0) continue;
      if (!oppMap[oppName]) oppMap[oppName] = { name:oppName, kill:0, pos:0, exc:0, neg:0, err:0, tot:0, matchCount:0 };
      const o = oppMap[oppName];
      o.kill+=c.kill; o.pos+=c.pos; o.exc+=c.exc; o.neg+=c.neg; o.err+=c.err; o.tot+=c.tot; o.matchCount++;
    }
    const allEffs = Object.values(oppMap).map(o => o.tot>0?(o.kill-o.err)/o.tot:null).filter(v=>v!=null&&Number.isFinite(v));
    const campionato = allEffs.length > 0 ? allEffs.reduce((s,v)=>s+v,0)/allEffs.length : null;
    return Object.values(oppMap).map(o => {
      const si = findOpponentRank(standings, o.name);
      const coeff = si ? forecastCoeff(si.rank, N) : null;
      return {
        name: o.name, matchCount: o.matchCount,
        weightedAvg: valoreMedio(o.kill, o.pos, o.exc, o.neg, o.err),
        campionato, coeff, rank: si?.rank??null,
      };
    }).sort((a,b) => {
      if (a.rank!=null && b.rank!=null) return a.rank-b.rank;
      if (a.rank!=null) return -1; if (b.rank!=null) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [matches, activeOppFund, standings]);

  // Tabelle section data
  const tableOppRows = useMemo(() =>
    buildOpponentTableData(matches, tableFund, standings||[]),
  [matches, tableFund, standings]);

  const tablePlayerMatches = useMemo(() =>
    tableMatchId === 'all' ? matches : matches.filter(m => m.id === tableMatchId),
  [matches, tableMatchId]);

  const tablePlayerRows = useMemo(() =>
    buildPlayerTableData(tablePlayerMatches, tableFund),
  [tablePlayerMatches, tableFund]);

  const wins = rows.filter(r => r.won).length;
  const visibleGroups = showOpp ? [...COL_GROUPS, ...OPP_GROUPS] : COL_GROUPS;

  function handleSort(key) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const playerTotals = useMemo(() => {
    if (!playerRows.length) return null;
    const t = { kill:0, pos:0, exc:0, neg:0, err:0, tot:0 };
    for (const r of playerRows) {
      t.kill+=r.kill||0; t.pos+=r.pos||0; t.exc+=r.exc||0;
      t.neg+=r.neg||0; t.err+=r.err||0; t.tot+=r.tot||0;
    }
    const cfg = FUND_CFG[activeFund];
    const eff   = t.tot>0?t.kill/t.tot:null;                                // Efficacia = Azioni Vincenti / Totale
    const effic = t.tot>0?(t.kill-t.err-t.neg)/t.tot:null;                  // Efficienza = (Vincenti - Errori - Muri Subiti) / Totale
    let pct=null;
    if (cfg.hasTot && t.tot>0) pct = activeFund==='reception'?(t.kill+t.pos+t.exc)/t.tot:t.kill/t.tot;
    const blkEff = activeFund==='block'&&t.tot>0?t.kill/t.tot:null;         // Efficacia muro = Kill / Totale
    return { ...t, efficacy:activeFund==='block'?blkEff:eff, efficiency:activeFund==='block'?null:effic, pct, weightedEff:null };
  }, [playerRows, activeFund]);

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center select-none">
        <p className="text-4xl opacity-20">📊</p>
        <p className="text-sm font-medium text-gray-400">Nessuna partita nel filtro corrente</p>
        <p className="text-xs text-gray-600">Modifica il filtro in Sistema › Tipologia Gare</p>
      </div>
    );
  }

  const thBase = (key) => `px-2 py-1.5 text-center cursor-pointer select-none whitespace-nowrap transition-colors hover:text-white text-[10px] font-semibold uppercase tracking-wide ${sortKey===key?'text-amber-300':'text-gray-500'}`;
  const tdBase = 'px-2 py-2 text-center text-xs whitespace-nowrap';
  const cfg = FUND_CFG[activeFund];

  return (
    <div className="space-y-10">

      {/* ══ Section 1: Summary table ══════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-white">Match Stats</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {matches.length} partite · <span className="text-emerald-400">{wins}V</span>{' '}<span className="text-red-400">{matches.length-wins}S</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowOpp(v=>!v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${showOpp?'bg-red-500/15 text-red-300 border-red-500/30':'text-gray-400 hover:text-gray-200 border-white/10 hover:bg-white/5'}`}>
              {showOpp?'◀ Nascondi avv.':'▶ Mostra avv.'}
            </button>
            <button onClick={() => exportCSV(sorted, visibleGroups)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-all">
              ↓ CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/8" style={{ background:'rgba(10,14,26,0.7)' }}>
          <table className="w-full border-collapse" style={{ minWidth:900 }}>
            <thead>
              <tr style={{ background:'rgba(0,0,0,0.3)' }}>
                <th colSpan={6} className="px-3 py-1 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider border-b border-white/5">Partita</th>
                {visibleGroups.map(g => (
                  <th key={g.id} colSpan={g.cols.length}
                    className="px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wider border-b border-white/5 border-l border-white/5"
                    style={{ color:g.color, background:g.bg }}>{g.label}</th>
                ))}
              </tr>
              <tr style={{ background:'rgba(0,0,0,0.25)' }}>
                {[{key:'date',label:'Data'},{key:'opponent',label:'Avversario'},{key:'matchType',label:'Tipo'},{key:'homeAway',label:'Sede'},{key:'score',label:'Set'},{key:'won',label:'Ris.'}].map(({key,label}) => (
                  <th key={key} onClick={() => handleSort(key)}
                    className={thBase(key)+' border-b border-white/5 text-left pl-3'}>
                    {label}{sortKey===key?(sortAsc?' ↑':' ↓'):''}
                  </th>
                ))}
                {visibleGroups.map(g => g.cols.map((col,ci) => (
                  <th key={col.key} onClick={() => handleSort(col.key)}
                    className={thBase(col.key)+' border-b border-white/5'+(ci===0?' border-l border-white/5':'')}
                    style={ci===0?{background:g.bg}:undefined}>
                    {col.label}{sortKey===col.key?(sortAsc?' ↑':' ↓'):''}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, idx) => (
                <>
                  <tr key={row.id}
                    className={`border-b border-white/4 transition-colors hover:bg-white/[0.03] ${idx%2===0?'':'bg-white/[0.015]'}`}>
                    <td className={tdBase+' pl-3 text-left text-gray-400 text-[11px] font-mono'}>{displayDate(row.date)}</td>
                    <td className={tdBase+' text-left text-gray-200 font-medium max-w-[130px]'}>
                      <span title={row.opponent} className="block truncate">{row.opponent}</span>
                    </td>
                    <td className={tdBase+' text-[10px]'}>
                      {row.matchType!=='—'?<span className="px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{row.matchType}</span>:'—'}
                    </td>
                    <td className={tdBase+' text-[11px]'}>
                      {row.homeAway==='Casa'?<span className="text-sky-400">🏠</span>:row.homeAway==='Trasferta'?<span className="text-amber-400">✈</span>:<span className="text-gray-600">—</span>}
                    </td>
                    <td className={tdBase+' font-mono text-[11px] text-gray-300'}>
                      <button className="hover:text-white transition-colors" title={row.setDetail||'—'}
                        onClick={() => setExpandId(prev=>prev===row.id?null:row.id)}>{row.score}</button>
                    </td>
                    <td className={tdBase}>
                      <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${row.won?'bg-emerald-500/15 text-emerald-300':'bg-red-500/15 text-red-400'}`}>
                        {row.won?'V':'S'}
                      </span>
                    </td>
                    {visibleGroups.map(g => g.cols.map((col,ci) => {
                      const val = row[col.key];
                      return (
                        <td key={col.key} className={tdBase+' '+(row.hasData&&col.colorFn?col.colorFn(val):'text-gray-300')+(ci===0?' border-l border-white/4':'')}
                          style={ci===0?{background:g.bg}:undefined}>
                          {row.hasData?col.fmt(val):'—'}
                        </td>
                      );
                    }))}
                  </tr>
                  {expandId===row.id && row.setDetail && (
                    <tr key={row.id+'_d'} className="bg-white/[0.02]">
                      <td colSpan={99} className="px-4 py-2 text-xs text-gray-400 font-mono border-b border-white/4">
                        <span className="text-gray-600 mr-2">Set per set:</span>
                        {row.setDetail.split(' ').map((s,i)=>{
                          const [a,b]=s.split('-').map(Number);
                          return <span key={i} className={`mr-3 font-semibold ${a>b?'text-emerald-400':'text-red-400'}`}>S{i+1}: {s}</span>;
                        })}
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {rows.length > 0 && (
                <tr className="border-t-2 border-white/10 font-semibold" style={{ background:'rgba(255,255,255,0.04)' }}>
                  <td colSpan={4} className="px-3 py-2 text-xs text-gray-400 text-left">Media / Totale ({rows.length} gare)</td>
                  <td className="px-2 py-2 text-center text-xs text-gray-400">{wins}V {rows.length-wins}S</td>
                  <td className="px-2 py-2 text-center text-xs">
                    <span className="text-emerald-400 font-bold">{Math.round(wins/rows.length*100)}%</span>
                  </td>
                  {visibleGroups.map(g => g.cols.map((col,ci) => {
                    const val = totals[col.key];
                    return (
                      <td key={col.key} className={tdBase+' '+(col.colorFn?col.colorFn(val):'text-gray-300')+(ci===0?' border-l border-white/8':'')}
                        style={ci===0?{background:g.bg}:undefined}>
                        {col.fmt(val)}
                      </td>
                    );
                  }))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-gray-600">Kill%=kill/tot · Ace%=ace/tot · Pos%=(kill+pos+exc)/tot · Efficacia=kill/tot · Efficienza=(kill−err−neg)/tot</div>
      </div>

      {/* ══ Section 2: Per-player fundamental tables ══════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">👤</span>
          <h2 className="text-base font-semibold text-white">Statistiche per Giocatrice</h2>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Partita</p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setPlayerMatchId('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${playerMatchId==='all'?'bg-amber-500/20 text-amber-300 border-amber-500/40':'text-gray-500 hover:text-gray-300 border-white/10 hover:bg-white/5'}`}>
              Tutte ({matches.length})
            </button>
            {[...matches].sort((a,b)=>normDate(a.metadata?.date).localeCompare(normDate(b.metadata?.date))).map(m=>{
              const sets=m.sets||[]; const sw=sets.filter(s=>s.won).length; const sl=sets.filter(s=>!s.won).length;
              const isActive=playerMatchId===m.id;
              return (
                <button key={m.id} onClick={() => setPlayerMatchId(m.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all flex items-center gap-1.5 ${isActive?'bg-amber-500/20 text-amber-300 border-amber-500/40':'text-gray-500 hover:text-gray-300 border-white/10 hover:bg-white/5'}`}>
                  <span className="font-mono">{displayDate(m.metadata?.date)}</span>
                  <span className="text-gray-600 max-w-[70px] truncate" title={m.metadata?.opponent}>{(m.metadata?.opponent||'').split(' ').pop()}</span>
                  <span className={`text-[10px] font-bold ${sw>sl?'text-emerald-400':'text-red-400'}`}>{sw}-{sl}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Fondamentale</p>
          <div className="flex flex-wrap gap-1.5">
            {FUND_ORDER.map(fund => {
              const c=FUND_CFG[fund]; const isActive=activeFund===fund;
              return (
                <button key={fund} onClick={() => setActiveFund(fund)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${isActive?'border-current':'border-white/10 text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                  style={isActive?{color:c.color,background:c.bg,borderColor:c.color+'60'}:undefined}>
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
        {playerRows.length===0?(
          <div className="flex items-center justify-center h-32 rounded-xl border border-white/8 text-sm text-gray-600" style={{background:'rgba(10,14,26,0.5)'}}>
            Nessun dato disponibile per questo fondamentale
          </div>
        ):(
          <PlayerFundTable rows={playerRows} totals={playerTotals} fund={activeFund} cfg={cfg} hasWeightedEff={!!analytics} />
        )}
      </div>

      {/* ══ Section 3: Opponent comparison (valore medio) ════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🆚</span>
          <div>
            <h2 className="text-base font-semibold text-white">Confronto per Avversario</h2>
            <p className="text-xs text-gray-500 mt-0.5">Valore medio · Media campionato · Coefficiente di previsione</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {OPPONENT_FUNDS.map(fund => {
            const c=FUND_CFG[fund]; const isActive=activeOppFund===fund;
            return (
              <button key={fund} onClick={() => setActiveOppFund(fund)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${isActive?'border-current':'border-white/10 text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                style={isActive?{color:c.color,background:c.bg,borderColor:c.color+'60'}:undefined}>
                {c.label}
              </button>
            );
          })}
        </div>
        {opponentRows.length===0?(
          <div className="flex items-center justify-center h-32 rounded-xl border border-white/8 text-sm text-gray-600" style={{background:'rgba(10,14,26,0.5)'}}>
            Nessun dato disponibile
          </div>
        ):(
          <OpponentFundTable rows={opponentRows} fund={activeOppFund} />
        )}
        <div className="text-[10px] text-gray-600 space-y-0.5">
          <p>Val.Medio = (5×Kill+4×Pos+3×Exc+2×Neg+1×Err)/(Kill+Pos+Exc+Neg+Err) — scala 1–5</p>
          <p>Coeff. Prev. = scala −5→+5 basata su classifica · <span className="text-red-400">≤−3</span> <span className="text-amber-400">−2/0</span> <span className="text-emerald-400">+1/+3</span> <span className="text-green-300">≥+4</span></p>
        </div>
      </div>

      {/* ══ Section 4: Tabelle ════════════════════════════════════════════════ */}
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <div>
            <h2 className="text-base font-semibold text-white">Tabelle</h2>
            <p className="text-xs text-gray-500 mt-0.5">Frequenze · Valore medio ponderato · Proiezione</p>
          </div>
        </div>

        {/* Fund selector shared between both sub-tables */}
        <div className="space-y-1">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Fondamentale</p>
          <div className="flex flex-wrap gap-1.5">
            {FUND_ORDER.map(fund => {
              const c=FUND_CFG[fund]; const isActive=tableFund===fund;
              return (
                <button key={fund} onClick={() => setTableFund(fund)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${isActive?'border-current':'border-white/10 text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                  style={isActive?{color:c.color,background:c.bg,borderColor:c.color+'60'}:undefined}>
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ─ 4a. Tabella per Avversario ─────────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <span style={{color:FUND_CFG[tableFund].color}}>●</span> Tabella Avversario — {FUND_CFG[tableFund].label}
          </h3>
          {tableOppRows.length===0?(
            <div className="flex items-center justify-center h-24 rounded-xl border border-white/8 text-sm text-gray-600" style={{background:'rgba(10,14,26,0.5)'}}>
              Nessun dato disponibile
            </div>
          ):(
            <OpponentFullTable rows={tableOppRows} fund={tableFund} />
          )}
        </div>

        {/* ─ 4b. Tabella per Player ─────────────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <span style={{color:FUND_CFG[tableFund].color}}>●</span> Tabella Player — {FUND_CFG[tableFund].label}
          </h3>

          {/* Match selector for player table */}
          <div className="space-y-1">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Partita</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setTableMatchId('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${tableMatchId==='all'?'bg-amber-500/20 text-amber-300 border-amber-500/40':'text-gray-500 hover:text-gray-300 border-white/10 hover:bg-white/5'}`}>
                Tutte ({matches.length})
              </button>
              {[...matches].sort((a,b)=>normDate(a.metadata?.date).localeCompare(normDate(b.metadata?.date))).map(m=>{
                const sets=m.sets||[]; const sw=sets.filter(s=>s.won).length; const sl=sets.filter(s=>!s.won).length;
                const isActive=tableMatchId===m.id;
                return (
                  <button key={m.id} onClick={() => setTableMatchId(m.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all flex items-center gap-1.5 ${isActive?'bg-amber-500/20 text-amber-300 border-amber-500/40':'text-gray-500 hover:text-gray-300 border-white/10 hover:bg-white/5'}`}>
                    <span className="font-mono">{displayDate(m.metadata?.date)}</span>
                    <span className="text-gray-600 max-w-[70px] truncate" title={m.metadata?.opponent}>{(m.metadata?.opponent||'').split(' ').pop()}</span>
                    <span className={`text-[10px] font-bold ${sw>sl?'text-emerald-400':'text-red-400'}`}>{sw}-{sl}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {tablePlayerRows.length===0?(
            <div className="flex items-center justify-center h-24 rounded-xl border border-white/8 text-sm text-gray-600" style={{background:'rgba(10,14,26,0.5)'}}>
              Nessun dato disponibile
            </div>
          ):(
            <PlayerFullTable rows={tablePlayerRows} fund={tableFund} />
          )}
        </div>

        {/* Legend */}
        <div className="text-[10px] text-gray-600 space-y-0.5">
          <p>Val.Medio = (5×Kill+4×Pos+3×Exc+2×Neg+1×Err)/Tot — scala 1(peggio)→5(meglio)</p>
          <p>Proiezione = Media Camp. + Coeff×0.1 — stima del valore atteso per la prossima gara</p>
          <p>Δ Camp. = Val.Medio avversario − Media Camp. · Δ Proiez. = Val.Medio − Proiezione</p>
        </div>
      </div>

    </div>
  );
}

// ─── Section 2: Per-player fundamental table ──────────────────────────────────
function PlayerFundTable({ rows, totals, fund, cfg, hasWeightedEff }) {
  const [sortKey, setSortKey] = useState('number');
  const [sortAsc, setSortAsc] = useState(true);
  const sorted = useMemo(() => [...rows].sort((a,b) => {
    let va=a[sortKey], vb=b[sortKey];
    if (va==null&&vb==null) return 0; if (va==null) return sortAsc?1:-1; if (vb==null) return sortAsc?-1:1;
    if (typeof va==='string') return sortAsc?va.localeCompare(vb):vb.localeCompare(va);
    return sortAsc?va-vb:vb-va;
  }), [rows, sortKey, sortAsc]);
  function handleSort(key) { if (sortKey===key) setSortAsc(a=>!a); else { setSortKey(key); setSortAsc(true); } }
  const thCls = (key) => `px-2 py-2 text-center cursor-pointer select-none whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide transition-colors hover:text-white border-b border-white/8 ${sortKey===key?'text-amber-300':'text-gray-500'}`;
  const tdCls = 'px-2 py-2 text-center text-xs whitespace-nowrap border-b border-white/4';
  const cols = [
    { key:'kill',  label:cfg.killLabel, fmt:fInt, colorFn:null },
    { key:'pos',   label:'+',           fmt:fInt, colorFn:null },
    { key:'exc',   label:'!',           fmt:fInt, colorFn:null },
    { key:'neg',   label:'−',           fmt:fInt, colorFn:null },
    { key:'err',   label:'Err',         fmt:fInt, colorFn:null },
    ...(cfg.hasTot?[{key:'tot',label:'Tot',fmt:fInt,colorFn:null}]:[]),
    ...(cfg.pctLabel?[{key:'pct',label:cfg.pctLabel,fmt:fPct,colorFn:cfg.colorFn}]:[]),
    { key:'efficacy',  label:'Efficacia',  fmt:fEff, colorFn:effColor },
    ...(fund!=='block'?[{key:'efficiency',label:'Efficienza',fmt:fEff,colorFn:effColor}]:[]),
    ...(hasWeightedEff?[{key:'weightedEff',label:'Eff% Pes.',fmt:fEff,colorFn:effColor}]:[]),
  ];
  const derivedCols = cols.slice(5);
  return (
    <div className="overflow-x-auto rounded-xl border border-white/8" style={{background:'rgba(10,14,26,0.7)'}}>
      <table className="w-full border-collapse" style={{minWidth:500}}>
        <thead>
          <tr style={{background:'rgba(0,0,0,0.3)'}}>
            <th colSpan={2} className="px-3 py-1 text-left text-[10px] text-gray-600 uppercase tracking-wider border-b border-white/5">Giocatrice</th>
            <th colSpan={5} className="px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wider border-b border-white/5 border-l border-white/5" style={{color:cfg.color,background:cfg.bg}}>5 Valori</th>
            {derivedCols.map(col => (
              <th key={col.key} className="px-2 py-1 text-center text-[10px] text-gray-500 uppercase border-b border-white/5">{col.label}</th>
            ))}
          </tr>
          <tr style={{background:'rgba(0,0,0,0.2)'}}>
            <th onClick={()=>handleSort('number')} className={thCls('number')+' text-left pl-3'}>#</th>
            <th onClick={()=>handleSort('name')} className={thCls('name')+' text-left'}>Nome</th>
            {cols.map((col,ci) => (
              <th key={col.key} onClick={()=>handleSort(col.key)} className={thCls(col.key)+(ci===0?' border-l border-white/8':'')} style={ci<5?{background:cfg.bg}:undefined}>
                {col.label}{sortKey===col.key?(sortAsc?' ↑':' ↓'):''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row,idx) => (
            <tr key={row.number||row.name} className={`transition-colors hover:bg-white/[0.03] ${idx%2===0?'':'bg-white/[0.015]'}`}>
              <td className={tdCls+' pl-3 text-left font-mono text-gray-400 text-[11px]'}>{row.number||'—'}</td>
              <td className={tdCls+' text-left text-gray-200 font-medium min-w-[120px]'}>{row.name||'—'}</td>
              {cols.map((col,ci) => {
                const val=row[col.key];
                return (
                  <td key={col.key} className={tdCls+' '+(col.colorFn?col.colorFn(val):'text-gray-300')+(ci===0?' border-l border-white/8':'')} style={ci<5?{background:cfg.bg+'80'}:undefined}>
                    {col.fmt(val)}
                  </td>
                );
              })}
            </tr>
          ))}
          {totals && (
            <tr className="border-t-2 border-white/10 font-semibold" style={{background:'rgba(255,255,255,0.04)'}}>
              <td colSpan={2} className="px-3 py-2 text-xs text-gray-400 text-left border-b border-white/5">SQUADRA</td>
              {cols.map((col,ci) => {
                const val=col.key==='weightedEff'?null:totals[col.key];
                return (
                  <td key={col.key} className={'px-2 py-2 text-center text-xs font-bold whitespace-nowrap border-b border-white/5 '+(col.colorFn?col.colorFn(val):'text-gray-200')+(ci===0?' border-l border-white/8':'')} style={ci<5?{background:cfg.bg}:undefined}>
                    {col.key==='weightedEff'?'—':col.fmt(val)}
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section 3: Opponent comparison table (valore medio + coeff) ──────────────
function OpponentFundTable({ rows, fund }) {
  const cfg = FUND_CFG[fund];
  const thCls = 'px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-white/8 whitespace-nowrap';
  const tdCls = 'px-3 py-2.5 text-center text-xs whitespace-nowrap border-b border-white/4';
  return (
    <div className="overflow-x-auto rounded-xl border border-white/8" style={{background:'rgba(10,14,26,0.7)'}}>
      <table className="w-full border-collapse" style={{minWidth:480}}>
        <thead>
          <tr style={{background:'rgba(0,0,0,0.3)'}}>
            <th colSpan={2} className="px-3 py-1 text-left text-[10px] text-gray-600 uppercase border-b border-white/5">Avversario</th>
            <th className="px-3 py-1 text-center text-[10px] font-bold uppercase border-b border-white/5 border-l border-white/5" style={{color:cfg.color,background:cfg.bg}}>Val.Medio</th>
            <th className="px-3 py-1 text-center text-[10px] text-gray-500 uppercase border-b border-white/5">Media Camp.</th>
            <th className="px-3 py-1 text-center text-[10px] text-gray-500 uppercase border-b border-white/5">Coeff.</th>
          </tr>
          <tr style={{background:'rgba(0,0,0,0.2)'}}>
            <th className={thCls+' text-left pl-4'}>Avversario</th>
            <th className={thCls}>N.Gare</th>
            <th className={thCls+' border-l border-white/8'} style={{color:cfg.color}}>Val.Medio</th>
            <th className={thCls}>Media Camp.</th>
            <th className={thCls}>Coeff.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row,idx) => (
            <tr key={row.name} className={`transition-colors hover:bg-white/[0.03] ${idx%2===0?'':'bg-white/[0.015]'}`}>
              <td className={tdCls+' pl-4 text-left text-gray-200 font-medium min-w-[140px]'}>{row.name}</td>
              <td className={tdCls+' text-gray-400 font-mono text-[11px]'}>{row.matchCount}</td>
              <td className={tdCls+' border-l border-white/8 font-semibold '+vmColor(row.weightedAvg)}>{fVM(row.weightedAvg)}</td>
              <td className={tdCls+' '+vmColor(row.campionato)}>{fVM(row.campionato)}</td>
              <td className={tdCls}>
                {row.coeff!=null?(
                  <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-[12px] font-bold ${coeffColor(row.coeff)}`}
                    style={{background:row.coeff<=-3?'rgba(248,113,113,0.10)':row.coeff<=0?'rgba(251,191,36,0.10)':row.coeff<=3?'rgba(52,211,153,0.10)':'rgba(134,239,172,0.12)'}}>
                    {row.coeff>=0?'+':''}{row.coeff}
                  </span>
                ):<span className="text-gray-600 text-[11px]">n/d</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section 4a: Full opponent table with frequencies + valore medio ──────────
function OpponentFullTable({ rows, fund }) {
  const cfg = FUND_CFG[fund];
  const [sortKey, setSortKey] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);
  const sorted = useMemo(() => [...rows].sort((a,b) => {
    let va=a[sortKey], vb=b[sortKey];
    if (va==null&&vb==null) return 0; if (va==null) return sortAsc?1:-1; if (vb==null) return sortAsc?-1:1;
    if (typeof va==='string') return sortAsc?va.localeCompare(vb):vb.localeCompare(va);
    return sortAsc?va-vb:vb-va;
  }), [rows, sortKey, sortAsc]);
  function hs(key) { if (sortKey===key) setSortAsc(a=>!a); else { setSortKey(key); setSortAsc(true); } }
  const thCls = (key) => `px-2 py-2 text-center cursor-pointer select-none whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide transition-colors hover:text-white border-b border-white/8 ${sortKey===key?'text-amber-300':'text-gray-500'}`;
  const tdCls = 'px-2 py-2.5 text-center text-xs whitespace-nowrap border-b border-white/4';
  const valLabel = cfg.killLabel;
  return (
    <div className="overflow-x-auto rounded-xl border border-white/8" style={{background:'rgba(10,14,26,0.7)'}}>
      <table className="w-full border-collapse" style={{minWidth:900}}>
        <thead>
          <tr style={{background:'rgba(0,0,0,0.3)'}}>
            <th colSpan={3} className="px-3 py-1 text-left text-[10px] text-gray-600 uppercase border-b border-white/5">Avversario</th>
            <th colSpan={10} className="px-2 py-1 text-center text-[10px] font-bold uppercase border-b border-white/5 border-l border-white/5" style={{color:cfg.color,background:cfg.bg}}>Frequenze + %</th>
            <th colSpan={2} className="px-2 py-1 text-center text-[10px] text-gray-500 uppercase border-b border-white/5">Eff.</th>
            <th colSpan={4} className="px-2 py-1 text-center text-[10px] text-amber-400/80 uppercase border-b border-white/5 font-bold">Valore Medio</th>
            <th colSpan={2} className="px-2 py-1 text-center text-[10px] text-gray-500 uppercase border-b border-white/5">Proiezione</th>
          </tr>
          <tr style={{background:'rgba(0,0,0,0.2)'}}>
            <th onClick={()=>hs('name')}       className={thCls('name')+' text-left pl-3'}>Avversario{sortKey==='name'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('matchCount')} className={thCls('matchCount')}>Gare{sortKey==='matchCount'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('tot')}        className={thCls('tot')}>Tot{sortKey==='tot'?(sortAsc?' ↑':' ↓'):''}</th>
            {/* Frequencies */}
            {[['kill',valLabel],['pos','+'],['exc','!'],['neg','−'],['err','Err']].map(([k,l])=>(
              <th key={k} onClick={()=>hs(k)} className={thCls(k)+(k==='kill'?' border-l border-white/8':'')} style={k==='kill'?{background:cfg.bg}:undefined}>
                {l}{sortKey===k?(sortAsc?' ↑':' ↓'):''}
              </th>
            ))}
            {/* Percentages */}
            {[['killPct',valLabel+'%'],['posPct','+%'],['excPct','!%'],['negPct','−%'],['errPct','Err%']].map(([k,l])=>(
              <th key={k} onClick={()=>hs(k)} className={thCls(k)}>
                {l}{sortKey===k?(sortAsc?' ↑':' ↓'):''}
              </th>
            ))}
            <th onClick={()=>hs('efficacy')}   className={thCls('efficacy')}>Efficacia{sortKey==='efficacy'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('efficiency')} className={thCls('efficiency')}>Efficienza{sortKey==='efficiency'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('valMedio')}   className={thCls('valMedio')+' text-amber-400/90'}>Val.Med.{sortKey==='valMedio'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('valCamp')}    className={thCls('valCamp')}>Med.Camp.{sortKey==='valCamp'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('deltaCamp')}  className={thCls('deltaCamp')}>Δ Camp.{sortKey==='deltaCamp'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('coeff')}      className={thCls('coeff')}>Coeff.{sortKey==='coeff'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('proiezione')} className={thCls('proiezione')}>Proiez.{sortKey==='proiezione'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('deltaProiez')}className={thCls('deltaProiez')}>Δ Proiez.{sortKey==='deltaProiez'?(sortAsc?' ↑':' ↓'):''}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row,idx) => (
            <tr key={row.name} className={`transition-colors hover:bg-white/[0.03] ${idx%2===0?'':'bg-white/[0.015]'}`}>
              <td className={tdCls+' pl-3 text-left text-gray-200 font-medium min-w-[130px]'}>{row.name}</td>
              <td className={tdCls+' text-gray-400 font-mono text-[11px]'}>{row.matchCount}</td>
              <td className={tdCls+' text-gray-400 font-mono text-[11px]'}>{row.tot}</td>
              {[['kill','killPct'],['pos','posPct'],['exc','excPct'],['neg','negPct'],['err','errPct']].map(([k,pk],ci)=>(
                <>
                  <td key={k} className={tdCls+' text-gray-300'+(ci===0?' border-l border-white/8':'')} style={ci===0?{background:cfg.bg+'80'}:undefined}>{fInt(row[k])}</td>
                  <td key={pk} className={tdCls+' text-gray-500'}>{fPct(row[pk])}</td>
                </>
              ))}
              <td className={tdCls+' '+effColor(row.efficacy)}>{fEff(row.efficacy)}</td>
              <td className={tdCls+' '+effColor(row.efficiency)}>{fEff(row.efficiency)}</td>
              <td className={tdCls+' font-semibold text-base '+vmColor(row.valMedio)}>{fVM(row.valMedio)}</td>
              <td className={tdCls+' '+vmColor(row.valCamp)}>{fVM(row.valCamp)}</td>
              <td className={tdCls+' font-medium '+deltaColor(row.deltaCamp)}>{fDelta(row.deltaCamp)}</td>
              <td className={tdCls}>
                {row.coeff!=null?(
                  <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-[11px] font-bold ${coeffColor(row.coeff)}`}
                    style={{background:row.coeff<=-3?'rgba(248,113,113,0.10)':row.coeff<=0?'rgba(251,191,36,0.10)':row.coeff<=3?'rgba(52,211,153,0.10)':'rgba(134,239,172,0.12)'}}>
                    {row.coeff>=0?'+':''}{row.coeff}
                  </span>
                ):<span className="text-gray-600 text-[11px]">n/d</span>}
              </td>
              <td className={tdCls+' '+vmColor(row.proiezione)}>{fVM(row.proiezione)}</td>
              <td className={tdCls+' font-medium '+deltaColor(row.deltaProiez)}>{fDelta(row.deltaProiez)}</td>
            </tr>
          ))}
          {/* Totals row */}
          {sorted.length>0 && (()=>{
            const tk=sorted.reduce((s,r)=>s+(r.kill||0),0);
            const tp=sorted.reduce((s,r)=>s+(r.pos||0),0);
            const te=sorted.reduce((s,r)=>s+(r.exc||0),0);
            const tn=sorted.reduce((s,r)=>s+(r.neg||0),0);
            const terr=sorted.reduce((s,r)=>s+(r.err||0),0);
            const tt=sorted.reduce((s,r)=>s+(r.tot||0),0);
            const teff= tt>0?(tk-terr)/tt:null;
            const teffic=tt>0?(tk+tp-tn-terr)/tt:null;
            const tVM=valoreMedio(tk,tp,te,tn,terr);
            return (
              <tr className="border-t-2 border-white/10 font-semibold" style={{background:'rgba(255,255,255,0.04)'}}>
                <td colSpan={3} className="px-3 py-2 text-xs text-gray-400 text-left">TOTALE / MEDIA ({sorted.length} avv.)</td>
                {[tk,tp,te,tn,terr].map((v,ci)=>(
                  <>
                    <td key={'sum'+ci} className={'px-2 py-2 text-center text-xs text-gray-200 border-b border-white/5'+(ci===0?' border-l border-white/8':'')} style={ci===0?{background:cfg.bg}:undefined}>{v}</td>
                    <td key={'pct'+ci} className="px-2 py-2 text-center text-xs text-gray-500 border-b border-white/5">{tt>0?fPct(v/tt):'—'}</td>
                  </>
                ))}
                <td className={'px-2 py-2 text-center text-xs border-b border-white/5 '+effColor(teff)}>{fEff(teff)}</td>
                <td className={'px-2 py-2 text-center text-xs border-b border-white/5 '+effColor(teffic)}>{fEff(teffic)}</td>
                <td className={'px-2 py-2 text-center text-sm font-bold border-b border-white/5 '+vmColor(tVM)}>{fVM(tVM)}</td>
                <td colSpan={5} className="px-2 py-2 text-center text-xs text-gray-600 border-b border-white/5">—</td>
              </tr>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section 4b: Full player table with frequencies + valore medio ────────────
function PlayerFullTable({ rows, fund }) {
  const cfg = FUND_CFG[fund];
  const [sortKey, setSortKey] = useState('number');
  const [sortAsc, setSortAsc] = useState(true);
  const sorted = useMemo(() => [...rows].sort((a,b) => {
    let va=a[sortKey], vb=b[sortKey];
    if (va==null&&vb==null) return 0; if (va==null) return sortAsc?1:-1; if (vb==null) return sortAsc?-1:1;
    if (typeof va==='string') return sortAsc?va.localeCompare(vb):vb.localeCompare(va);
    return sortAsc?va-vb:vb-va;
  }), [rows, sortKey, sortAsc]);
  function hs(key) { if (sortKey===key) setSortAsc(a=>!a); else { setSortKey(key); setSortAsc(true); } }
  const thCls = (key) => `px-2 py-2 text-center cursor-pointer select-none whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide transition-colors hover:text-white border-b border-white/8 ${sortKey===key?'text-amber-300':'text-gray-500'}`;
  const tdCls = 'px-2 py-2.5 text-center text-xs whitespace-nowrap border-b border-white/4';
  const valLabel = cfg.killLabel;
  return (
    <div className="overflow-x-auto rounded-xl border border-white/8" style={{background:'rgba(10,14,26,0.7)'}}>
      <table className="w-full border-collapse" style={{minWidth:820}}>
        <thead>
          <tr style={{background:'rgba(0,0,0,0.3)'}}>
            <th colSpan={3} className="px-3 py-1 text-left text-[10px] text-gray-600 uppercase border-b border-white/5">Player</th>
            <th colSpan={10} className="px-2 py-1 text-center text-[10px] font-bold uppercase border-b border-white/5 border-l border-white/5" style={{color:cfg.color,background:cfg.bg}}>Frequenze + %</th>
            <th colSpan={2} className="px-2 py-1 text-center text-[10px] text-gray-500 uppercase border-b border-white/5">Eff.</th>
            <th colSpan={3} className="px-2 py-1 text-center text-[10px] text-amber-400/80 uppercase border-b border-white/5 font-bold">Valore Medio</th>
          </tr>
          <tr style={{background:'rgba(0,0,0,0.2)'}}>
            <th onClick={()=>hs('number')} className={thCls('number')+' text-left pl-3'}>#</th>
            <th onClick={()=>hs('name')}   className={thCls('name')+' text-left'}>Nome</th>
            <th onClick={()=>hs('tot')}    className={thCls('tot')}>Tot</th>
            {[['kill',valLabel],['pos','+'],['exc','!'],['neg','−'],['err','Err']].map(([k,l])=>(
              <th key={k} onClick={()=>hs(k)} className={thCls(k)+(k==='kill'?' border-l border-white/8':'')} style={k==='kill'?{background:cfg.bg}:undefined}>
                {l}{sortKey===k?(sortAsc?' ↑':' ↓'):''}
              </th>
            ))}
            {[['killPct',valLabel+'%'],['posPct','+%'],['excPct','!%'],['negPct','−%'],['errPct','Err%']].map(([k,l])=>(
              <th key={k} onClick={()=>hs(k)} className={thCls(k)}>{l}{sortKey===k?(sortAsc?' ↑':' ↓'):''}</th>
            ))}
            <th onClick={()=>hs('efficacy')}    className={thCls('efficacy')}>Efficacia{sortKey==='efficacy'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('efficiency')}  className={thCls('efficiency')}>Efficienza{sortKey==='efficiency'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('valMedio')}    className={thCls('valMedio')+' text-amber-400/90'}>Val.Med.{sortKey==='valMedio'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('valSquadra')}  className={thCls('valSquadra')}>Media Squadra{sortKey==='valSquadra'?(sortAsc?' ↑':' ↓'):''}</th>
            <th onClick={()=>hs('deltaSquadra')}className={thCls('deltaSquadra')}>Δ Squadra{sortKey==='deltaSquadra'?(sortAsc?' ↑':' ↓'):''}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row,idx) => (
            <tr key={row.number||row.name} className={`transition-colors hover:bg-white/[0.03] ${idx%2===0?'':'bg-white/[0.015]'}`}>
              <td className={tdCls+' pl-3 text-left font-mono text-gray-400 text-[11px]'}>{row.number||'—'}</td>
              <td className={tdCls+' text-left text-gray-200 font-medium min-w-[110px]'}>{row.name||'—'}</td>
              <td className={tdCls+' text-gray-400 font-mono text-[11px]'}>{row.tot}</td>
              {[['kill','killPct'],['pos','posPct'],['exc','excPct'],['neg','negPct'],['err','errPct']].map(([k,pk],ci)=>(
                <>
                  <td key={k} className={tdCls+' text-gray-300'+(ci===0?' border-l border-white/8':'')} style={ci===0?{background:cfg.bg+'80'}:undefined}>{fInt(row[k])}</td>
                  <td key={pk} className={tdCls+' text-gray-500'}>{fPct(row[pk])}</td>
                </>
              ))}
              <td className={tdCls+' '+effColor(row.efficacy)}>{fEff(row.efficacy)}</td>
              <td className={tdCls+' '+effColor(row.efficiency)}>{fund==='block'?'—':fEff(row.efficiency)}</td>
              <td className={tdCls+' font-semibold text-base '+vmColor(row.valMedio)}>{fVM(row.valMedio)}</td>
              <td className={tdCls+' '+vmColor(row.valSquadra)}>{fVM(row.valSquadra)}</td>
              <td className={tdCls+' font-medium '+deltaColor(row.deltaSquadra)}>{fDelta(row.deltaSquadra)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(rows, groups) {
  const infoHeaders = ['Data','Avversario','Tipo','Sede','Set','Risultato'];
  const statHeaders = groups.flatMap(g => g.cols.map(c => `${g.label} ${c.label}`));
  const headers = [...infoHeaders, ...statHeaders];
  function raw(val, col) {
    if (val == null || !Number.isFinite(val)) return '';
    if (col.fmt === fPct || col.fmt === fEff) return (val * 100).toFixed(1);
    return val;
  }
  const csvRows = rows.map(row => {
    const info = [row.date, row.opponent, row.matchType, row.homeAway, row.score, row.won?'V':'S'];
    const stats = groups.flatMap(g => g.cols.map(col => raw(row[col.key], col)));
    return [...info, ...stats];
  });
  const content = [headers, ...csvRows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff'+content], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='match-stats.csv'; a.click();
  URL.revokeObjectURL(url);
}
