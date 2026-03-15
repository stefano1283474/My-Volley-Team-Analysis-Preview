// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — NewsBacheca
// Bacheca news divisa in 5 tab:
//   Campionato · Squadra · Player · Sistema · Offerte
// ============================================================================

import React, { useState, useCallback, useMemo, useEffect } from 'react';

// ─── Costanti ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'campionato', label: 'Campionato', icon: '🏆' },
  { id: 'squadra',    label: 'Squadra',    icon: '🏐' },
  { id: 'player',     label: 'Player',     icon: '★'  },
  { id: 'sistema',    label: 'Sistema',    icon: '📋' },
  { id: 'offerte',    label: 'Offerte',    icon: '🏷️' },
];

// ─── Costanti Offerte ─────────────────────────────────────────────────────────

const OFFER_CATEGORIES = {
  abbonamento: { label: 'Abbonamento', icon: '🔄', color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/25'    },
  corso:       { label: 'Corso',       icon: '📚', color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/25' },
  evento:      { label: 'Evento',      icon: '🎟️', color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/25' },
  servizio:    { label: 'Servizio',    icon: '⚙️', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  promozione:  { label: 'Promozione',  icon: '🎁', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25'  },
  altro:       { label: 'Altro',       icon: '📌', color: 'text-gray-300',    bg: 'bg-white/[0.04]',   border: 'border-white/10'      },
};

const MAX_OFFER_DESC = 600;

const FUNDS = ['attack', 'serve', 'reception', 'defense', 'block'];

const FUND_LABELS = {
  attack: 'Attacco', serve: 'Battuta', reception: 'Ricezione',
  defense: 'Difesa', block: 'Muro',
};
const FUND_ICONS = {
  attack: '⚔️', serve: '🎯', reception: '🤲', defense: '🛡️', block: '🧱',
};

const NEWS_STYLES = {
  success: { color: 'text-emerald-400', bg: 'bg-emerald-500/10',  border: 'border-emerald-500/20' },
  warning: { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20'  },
  danger:  { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20'    },
  info:    { color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20'    },
  event:   { color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
  neutral: { color: 'text-gray-300',    bg: 'bg-white/[0.03]',   border: 'border-white/8'       },
};

const SISTEMA_TYPES = {
  avviso:        { label: 'Avviso',        icon: '⚠️', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25'  },
  info:          { label: 'Info',          icon: 'ℹ️', color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/25'    },
  risultato:     { label: 'Risultato',     icon: '🏐', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  evento:        { label: 'Evento',        icon: '📅', color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/25' },
  comunicazione: { label: 'Comunicazione', icon: '📢', color: 'text-gray-300',    bg: 'bg-white/[0.04]',   border: 'border-white/10'      },
};

const MAX_TEXT = 500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatDate(isoDate) {
  if (!isoDate) return null;
  try {
    const d = new Date(isoDate + 'T12:00:00');
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return isoDate; }
}

function sortPosts(posts) {
  return [...posts].sort((a, b) => {
    const aH = !!a.eventDate; const bH = !!b.eventDate;
    if (aH && bH) return a.eventDate.localeCompare(b.eventDate);
    if (aH && !bH) return -1;
    if (!aH && bH) return 1;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

const normTeam = (n) => String(n || '').trim().toUpperCase();
function sameTeam(a, b) {
  const na = normTeam(a); const nb = normTeam(b);
  return !!(na && nb && (na === nb || na.includes(nb) || nb.includes(na)));
}

function pad(s, len) {
  return String(s).padEnd(len);
}

// ─── Auto-gen: Campionato ─────────────────────────────────────────────────────

function genCampionatoNews(standings, calendar, teamName) {
  if (!teamName || !standings?.length) return [];
  const news = [];
  const team = standings.find(t => sameTeam(t.name, teamName));
  if (!team) return [];

  const leader = standings[0];
  const gap = leader.pts - team.pts;
  const pos = team.rank;

  // 1. Posizione in classifica
  news.push({
    id: 'pos',
    type: gap === 0 ? 'success' : gap <= 3 ? 'warning' : 'info',
    icon: pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '📊',
    title: `${pos}° posto in classifica · ${team.pts} pt`,
    summary: gap === 0
      ? `In testa alla classifica con ${team.pts} punti (${team.w}V–${team.l}P).`
      : `${gap} punt${gap === 1 ? 'o' : 'i'} dal leader ${leader.name} (${leader.pts} pt).`,
    detail: [
      `Bilancio: ${team.w} vinte / ${team.l} perse`,
      `Set: ${team.sw}–${team.sl}  (ratio ${team.sl > 0 ? (team.sw / team.sl).toFixed(2) : '∞'})`,
      gap > 0 ? `Distanza da ${leader.name}: ${gap} pt` : '🏆 Prima posizione!',
      `Partite giocate: ${(team.w || 0) + (team.l || 0)}`,
    ],
    action: null,
  });

  // 2. Rivali diretti ±2 posizioni
  const rivals = standings.filter(
    t => !sameTeam(t.name, teamName) && Math.abs(t.rank - pos) > 0 && Math.abs(t.rank - pos) <= 2
  );
  if (rivals.length > 0) {
    news.push({
      id: 'rivals',
      type: 'info',
      icon: '🎯',
      title: `${rivals.length} rivali diretti in classifica`,
      summary: rivals
        .map(r => `${r.rank}° ${r.name.substring(0, 15)} (${team.pts - r.pts >= 0 ? '+' : ''}${team.pts - r.pts} pt)`)
        .join('  ·  '),
      detail: rivals.map(r => {
        const diff = team.pts - r.pts;
        return `${r.rank}°  ${pad(r.name, 20)}  ${r.pts} pt  (${diff >= 0 ? '+' : ''}${diff} vs noi)`;
      }),
      action: null,
    });
  }

  // Calendario del team
  const teamCal = (calendar || []).filter(c => sameTeam(c.home, teamName) || sameTeam(c.away, teamName));
  const played  = teamCal.filter(c => c.played).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const upcoming = teamCal.filter(c => !c.played).sort((a, b) => (a.data || '').localeCompare(b.data || ''));

  // 3. Forma recente (ultime ≤5 gare)
  if (played.length >= 2) {
    const last = played.slice(0, Math.min(5, played.length));
    const results = last.map(c => {
      const isH = sameTeam(c.home, teamName);
      const oS = isH ? (c.setsHome ?? 0) : (c.setsAway ?? 0);
      const aS = isH ? (c.setsAway ?? 0) : (c.setsHome ?? 0);
      return { won: oS > aS, opp: isH ? c.away : c.home, score: `${oS}–${aS}`, home: isH };
    });
    const wins = results.filter(r => r.won).length;
    const icons = results.map(r => r.won ? '🟢' : '🔴').join(' ');
    const ratio = wins / results.length;
    news.push({
      id: 'form',
      type: ratio >= 0.6 ? 'success' : ratio <= 0.3 ? 'danger' : 'neutral',
      icon: '📈',
      title: `Forma recente: ${wins}/${results.length} vittorie  ${icons}`,
      summary: `Ultime ${results.length} gare disputate in campionato.`,
      detail: results.map(r => `${r.won ? '✅' : '❌'}  ${pad(r.score, 6)}  vs  ${r.opp}  ${r.home ? '(casa)' : '(trasf.)'}`),
      action: null,
    });
  }

  // 4. Ultima partita in calendario
  if (played.length > 0) {
    const last = played[0];
    const isH = sameTeam(last.home, teamName);
    const oS = isH ? (last.setsHome ?? 0) : (last.setsAway ?? 0);
    const aS = isH ? (last.setsAway ?? 0) : (last.setsHome ?? 0);
    const opp = isH ? last.away : last.home;
    const won = oS > aS;
    news.push({
      id: 'last_cal',
      type: won ? 'success' : 'warning',
      icon: won ? '✅' : '❌',
      title: `Ultimo risultato: ${won ? 'Vittoria' : 'Sconfitta'} ${oS}–${aS} vs ${opp}`,
      summary: `Giornata ${last.giornata}${last.data ? '  ·  ' + formatDate(last.data) : ''}`,
      detail: [
        `${teamName}  ${oS} — ${aS}  ${opp}`,
        isH ? 'Gara in casa' : 'Gara in trasferta',
        last.data ? `Data: ${formatDate(last.data)}` : '',
        last.giornata ? `Giornata: ${last.giornata}` : '',
      ].filter(Boolean),
      action: null,
    });
  }

  // 5. Prossima partita
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const isH = sameTeam(next.home, teamName);
    const opp = isH ? next.away : next.home;
    news.push({
      id: 'next',
      type: 'event',
      icon: '📅',
      title: `Prossima gara: ${isH ? '🏠 Casa' : '✈️ Trasferta'}  vs  ${opp}`,
      summary: `Giornata ${next.giornata}${next.data ? '  ·  ' + formatDate(next.data) : ''}${next.ora ? '  ore ' + next.ora : ''}`,
      detail: [
        `Avversario: ${opp}`,
        isH ? 'Gara in casa' : 'Gara in trasferta',
        next.data ? `Data: ${formatDate(next.data)}` : 'Data da confermare',
        next.ora ? `Orario: ${next.ora}` : '',
        next.venue ? `Palazzetto: ${next.venue}` : '',
        `Giornata: ${next.giornata}`,
      ].filter(Boolean),
      action: null,
    });
  }

  return news;
}

// ─── Auto-gen: Squadra ────────────────────────────────────────────────────────

function genSquadraNews(sortedMA) {
  if (!sortedMA?.length) return [];
  const news = [];

  // 1. Ultima partita analizzata
  const last = sortedMA[sortedMA.length - 1];
  const sW = (last.match.sets || []).filter(s => s.won).length;
  const sL = (last.match.sets || []).filter(s => !s.won).length;
  const won = sW > sL;
  const so = ((last.chains?.sideOut?.pct || 0) * 100).toFixed(0);
  const bp = ((last.chains?.breakPoint?.pct || 0) * 100).toFixed(0);

  news.push({
    id: 'last_match',
    type: won ? 'success' : 'warning',
    icon: won ? '🏆' : '⚠️',
    title: `Ultima gara: ${won ? 'Vittoria' : 'Sconfitta'} ${sW}–${sL} vs ${last.match.metadata.opponent}`,
    summary: `Side-Out ${so}%  ·  Break-Point ${bp}%${last.match.metadata.date ? '  ·  ' + last.match.metadata.date : ''}`,
    detail: [
      `Risultato: ${sW}–${sL} vs ${last.match.metadata.opponent}`,
      `Side-Out: ${so}%   Break-Point: ${bp}%`,
      `Peso partita: ${(last.matchWeight?.final || 0).toFixed(2)}`,
      last.match.metadata.date ? `Data: ${last.match.metadata.date}` : '',
    ].filter(Boolean),
    action: { label: 'Apri report partita', type: 'selectMatch', payload: last.match },
  });

  // 2. Trend di forma (ultimi 3 vs media stagione)
  if (sortedMA.length >= 3) {
    const avgs = sortedMA.map(ma => {
      const vals = FUNDS.map(f => ma.match.riepilogo?.team?.[f]?.efficacy || 0).filter(v => v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    const season  = avgs.reduce((a, b) => a + b, 0) / avgs.length;
    const recent3 = avgs.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const delta   = recent3 - season;
    const dStr = `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`;

    news.push({
      id: 'trend',
      type: delta >= 0.015 ? 'success' : delta <= -0.015 ? 'danger' : 'neutral',
      icon: delta >= 0.015 ? '📈' : delta <= -0.015 ? '📉' : '➡️',
      title: `Trend di forma: ${delta >= 0.015 ? '↑ In crescita' : delta <= -0.015 ? '↓ In calo' : '→ Stabile'} (${dStr})`,
      summary: `Media ultimi 3 match: ${(recent3 * 100).toFixed(1)}%  vs  stagionale ${(season * 100).toFixed(1)}%.`,
      detail: [
        `Media stagionale: ${(season * 100).toFixed(1)}%`,
        `Media ultimi 3 match: ${(recent3 * 100).toFixed(1)}%`,
        `Variazione: ${dStr}`,
        `Campione: ${sortedMA.length} partite`,
      ],
      action: null,
    });
  }

  // 3. Classifica fondamentali
  const fundAvgs = FUNDS.map(f => {
    const vals = sortedMA.map(ma => ma.match.riepilogo?.team?.[f]?.efficacy || 0).filter(v => v > 0);
    return { f, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 };
  }).filter(fa => fa.avg > 0).sort((a, b) => b.avg - a.avg);

  if (fundAvgs.length >= 2) {
    const best  = fundAvgs[0];
    const worst = fundAvgs[fundAvgs.length - 1];
    news.push({
      id: 'funds',
      type: 'info',
      icon: '📊',
      title: `Fondamentali: 💪 ${FUND_LABELS[best.f]}  /  ⚠️ ${FUND_LABELS[worst.f]}`,
      summary: `Punto di forza: ${FUND_LABELS[best.f]} ${(best.avg * 100).toFixed(1)}%  ·  Critico: ${FUND_LABELS[worst.f]} ${(worst.avg * 100).toFixed(1)}%`,
      detail: fundAvgs.map((fa, i) =>
        `${i === 0 ? '💪' : i === fundAvgs.length - 1 ? '⚠️' : '  '}  ${FUND_ICONS[fa.f]}  ${pad(FUND_LABELS[fa.f], 12)}  ${(fa.avg * 100).toFixed(1)}%`
      ),
      action: null,
    });
  }

  return news;
}

// ─── Auto-gen: Player ─────────────────────────────────────────────────────────

function genPlayerNews(playerTrends) {
  if (!playerTrends || !Object.keys(playerTrends).length) return [];

  const players = Object.values(playerTrends)
    .filter(p => p.matches.length >= 2)
    .map(p => {
      const tEntries = Object.entries(p.trends || {});
      if (!tEntries.length) return { ...p, avgDelta: 0, avgRecent: 0 };
      const deltas  = tEntries.map(([, t]) => (t.rawRecentAvg || 0) - (t.rawOlderAvg || 0));
      const avgDelta  = deltas.reduce((s, d) => s + d, 0) / deltas.length;
      const avgRecent = tEntries.map(([, t]) => t.rawRecentAvg || 0).reduce((s, v) => s + v, 0) / tEntries.length;
      return { ...p, avgDelta, avgRecent };
    })
    .sort((a, b) => b.avgDelta - a.avgDelta);

  if (!players.length) return [];

  const news = [];
  // Top 3 best-trending (positive delta)
  players.slice(0, 3).filter(p => p.avgDelta >= 0).forEach(p => {
    news.push({
      id: `top_${p.number}`,
      type: 'success',
      icon: '⬆️',
      title: `#${p.number} ${p.name}  +${(p.avgDelta * 100).toFixed(1)}% tendenza recente`,
      summary: `Media recente: ${(p.avgRecent * 100).toFixed(1)}%  ·  In miglioramento rispetto alla media stagionale.`,
      detail: Object.entries(p.trends || {}).map(([f, t]) => {
        const d = (t.rawRecentAvg || 0) - (t.rawOlderAvg || 0);
        return `${FUND_ICONS[f] || '·'}  ${pad(FUND_LABELS[f] || f, 12)}  ${(t.rawRecentAvg * 100).toFixed(1)}%  (${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%)`;
      }),
      action: { label: `Apri scheda ${p.name}`, type: 'selectPlayer', payload: p },
    });
  });

  // Top 3 worst-trending (negative delta) — reversed so worst comes first
  const worst3 = [...players].reverse().slice(0, 3).filter(p => p.avgDelta < 0);
  worst3.forEach(p => {
    news.push({
      id: `bot_${p.number}`,
      type: 'warning',
      icon: '⬇️',
      title: `#${p.number} ${p.name}  ${(p.avgDelta * 100).toFixed(1)}% tendenza recente`,
      summary: `Media recente: ${(p.avgRecent * 100).toFixed(1)}%  ·  In calo rispetto alla media stagionale.`,
      detail: Object.entries(p.trends || {}).map(([f, t]) => {
        const d = (t.rawRecentAvg || 0) - (t.rawOlderAvg || 0);
        return `${FUND_ICONS[f] || '·'}  ${pad(FUND_LABELS[f] || f, 12)}  ${(t.rawRecentAvg * 100).toFixed(1)}%  (${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%)`;
      }),
      action: { label: `Apri scheda ${p.name}`, type: 'selectPlayer', payload: p },
    });
  });

  return news;
}

// ─── AutoNewsCard ─────────────────────────────────────────────────────────────

function AutoNewsCard({ item, onAction }) {
  const [open, setOpen] = useState(false);
  const s = NEWS_STYLES[item.type] || NEWS_STYLES.neutral;

  return (
    <button
      className={`w-full rounded-xl border ${s.border} ${s.bg} p-3.5 text-left transition-all hover:brightness-110 active:scale-[0.99]`}
      onClick={() => setOpen(v => !v)}
    >
      <div className="flex items-start gap-2.5">
        <span className="text-sm mt-0.5 flex-shrink-0">{item.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-[12px] font-semibold ${s.color} leading-snug`}>{item.title}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{item.summary}</p>
          {open && (item.detail?.length > 0 || item.action) && (
            <div className="mt-2 pt-2 border-t border-white/5 space-y-0.5">
              {item.detail?.map((line, i) => (
                <p key={i} className="text-[10px] text-gray-500 font-mono leading-relaxed whitespace-pre">{line}</p>
              ))}
              {item.action && onAction && (
                <button
                  className={`mt-2 inline-flex items-center gap-1 text-[10px] px-3 py-1 rounded-lg border ${s.border} ${s.color} ${s.bg} hover:brightness-125 transition-all font-medium`}
                  onClick={(e) => { e.stopPropagation(); onAction(item.action); }}
                >
                  {item.action.label} →
                </button>
              )}
            </div>
          )}
        </div>
        <span className={`text-[9px] ${s.color} opacity-40 flex-shrink-0 mt-1`}>{open ? '▲' : '▼'}</span>
      </div>
    </button>
  );
}

// ─── EmptyState / NoTeamPrompt ────────────────────────────────────────────────

function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
      <span className="text-3xl opacity-50">{icon}</span>
      <p className="text-xs text-gray-500 max-w-xs">{text}</p>
    </div>
  );
}

function NoTeamPrompt({ onScrollToStandings }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-5 flex flex-col items-center text-center gap-3">
      <div className="text-3xl">🏐</div>
      <div>
        <p className="text-sm font-semibold text-white mb-1">Nessuna squadra selezionata</p>
        <p className="text-xs text-gray-500 max-w-xs">
          Identifica la tua squadra nella classifica per visualizzare le news.
        </p>
      </div>
      {onScrollToStandings && (
        <button
          onClick={onScrollToStandings}
          className="text-xs px-4 py-2 rounded-xl bg-sky-500/15 text-sky-300 border border-sky-500/25 hover:bg-sky-500/25 transition-all font-medium"
        >
          → Vai alla classifica
        </button>
      )}
    </div>
  );
}

function NoCalendarPrompt({ onOpenDataImport, onScrollToStandings }) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-400/30 bg-amber-500/5 p-5 flex flex-col items-center text-center gap-3">
      <div className="text-3xl">🗓️</div>
      <div>
        <p className="text-sm font-semibold text-amber-200 mb-1">Calendario campionato non importato</p>
        <p className="text-xs text-gray-400 max-w-md">
          Per attivare le news del campionato devi prima importare il file CSV del calendario.
          Vai in <span className="text-gray-200 font-medium">Sistema → Dati</span>, carica il calendario e poi torna in questa sezione.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onOpenDataImport && (
          <button
            onClick={onOpenDataImport}
            className="text-xs px-4 py-2 rounded-xl bg-amber-500/15 text-amber-200 border border-amber-500/35 hover:bg-amber-500/25 transition-all font-medium"
          >
            → Importa campionato
          </button>
        )}
        {onScrollToStandings && (
          <button
            onClick={onScrollToStandings}
            className="text-xs px-4 py-2 rounded-xl bg-white/[0.04] text-gray-300 border border-white/15 hover:bg-white/[0.08] transition-all font-medium"
          >
            → Apri classifica
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Visibilità (Sistema + Offerte) ──────────────────────────────────────────

const VIS_MODES = [
  { id: 'all',      label: '🌐 Tutti',             desc: 'Visibile a tutti gli utenti' },
  { id: 'profiles', label: '🎫 Per profilo',        desc: 'Solo utenti con profilo selezionato' },
  { id: 'users',    label: '👤 Utenti specifici',   desc: 'Solo utenti selezionati manualmente' },
];

const PROFILE_LABELS = { base: 'Base', pro: 'Pro', promax: 'Pro Max' };
const PROFILE_BADGE_STYLE = {
  base:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  pro:    'bg-violet-500/10 text-violet-400 border-violet-500/20',
  promax: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function VisibilitySelector({ visMode, setVisMode, visProfiles, setVisProfiles, visUserIds, setVisUserIds, allUsers }) {
  const toggleProfile = (p) =>
    setVisProfiles(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const toggleUser = (uid) =>
    setVisUserIds(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]);

  return (
    <div className="space-y-2 pt-1">
      <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">👁 Visibilità</div>
      <div className="flex gap-1.5 flex-wrap">
        {VIS_MODES.map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => setVisMode(m.id)}
            className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
              visMode === m.id
                ? 'bg-purple-500/15 border-purple-500/30 text-purple-300 font-bold'
                : 'border-white/8 text-gray-500 hover:text-gray-300'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {visMode === 'profiles' && (
        <div className="flex gap-1.5 flex-wrap pl-2">
          {['base', 'pro', 'promax'].map(p => (
            <button
              key={p}
              type="button"
              onClick={() => toggleProfile(p)}
              className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                visProfiles.includes(p)
                  ? `${PROFILE_BADGE_STYLE[p]} font-bold`
                  : 'border-white/8 text-gray-500 hover:text-gray-300'
              }`}
            >
              {PROFILE_LABELS[p]}
            </button>
          ))}
          {visProfiles.length === 0 && (
            <span className="text-[10px] text-amber-400/80">⚠ Seleziona almeno un profilo</span>
          )}
        </div>
      )}
      {visMode === 'users' && (
        <div className="pl-2 space-y-1 max-h-28 overflow-y-auto">
          {allUsers.length === 0 && (
            <div className="text-[10px] text-gray-600">Nessun utente disponibile</div>
          )}
          {allUsers.map(u => (
            <label key={u.uid} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={visUserIds.includes(u.uid)}
                onChange={() => toggleUser(u.uid)}
                className="rounded border-white/20 bg-white/[0.04] accent-purple-400"
              />
              <span className="text-[11px] text-gray-300 group-hover:text-white transition-colors truncate">
                {u.email || u.displayName || u.uid}
              </span>
              {u.assignedProfile && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${PROFILE_BADGE_STYLE[u.assignedProfile] || 'bg-white/5 text-gray-400 border-white/10'}`}>
                  {PROFILE_LABELS[u.assignedProfile] || u.assignedProfile}
                </span>
              )}
            </label>
          ))}
          {visUserIds.length === 0 && allUsers.length > 0 && (
            <div className="text-[10px] text-amber-400/80">⚠ Seleziona almeno un utente</div>
          )}
        </div>
      )}
    </div>
  );
}

function buildVisibility(visMode, visProfiles, visUserIds) {
  if (visMode === 'profiles') return { mode: 'profiles', profiles: visProfiles };
  if (visMode === 'users')    return { mode: 'users',    userIds:  visUserIds  };
  return { mode: 'all' };
}

function VisibilityBadge({ visibility }) {
  if (!visibility || visibility.mode === 'all') return null;
  if (visibility.mode === 'profiles') {
    const labels = (visibility.profiles || []).map(p => PROFILE_LABELS[p] || p).join(', ');
    return (
      <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
        🎫 {labels || '–'}
      </span>
    );
  }
  if (visibility.mode === 'users') {
    const count = (visibility.userIds || []).length;
    return (
      <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
        👤 {count} {count === 1 ? 'utente' : 'utenti'}
      </span>
    );
  }
  return null;
}

// ─── Sistema: PostForm ────────────────────────────────────────────────────────

export function PostForm({ onSave, onCancel, authorEmail, allUsers = [] }) {
  const [type, setType]         = useState('info');
  const [text, setText]         = useState('');
  const [eventDate, setED]      = useState('');
  const [saving, setSaving]     = useState(false);
  const [visMode, setVisMode]   = useState('all');
  const [visProfiles, setVP]    = useState([]);
  const [visUserIds, setVU]     = useState([]);

  const submit = async () => {
    if (!text.trim()) return;
    if (visMode === 'profiles' && visProfiles.length === 0) return;
    if (visMode === 'users'    && visUserIds.length  === 0) return;
    setSaving(true);
    try {
      await onSave({
        id: newId(), type,
        text: text.trim().slice(0, MAX_TEXT),
        eventDate: eventDate || null,
        createdAt: new Date().toISOString(),
        authorEmail: authorEmail || '',
        visibility: buildVisibility(visMode, visProfiles, visUserIds),
      });
      setText(''); setED(''); setType('info'); setVisMode('all'); setVP([]); setVU([]);
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(SISTEMA_TYPES).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setType(key)}
            className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
              type === key
                ? `${meta.bg} ${meta.border} ${meta.color} font-bold`
                : 'border-white/8 text-gray-500 hover:text-gray-300'
            }`}
          >
            {meta.icon} {meta.label}
          </button>
        ))}
      </div>
      <div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value.slice(0, MAX_TEXT))}
          placeholder="Scrivi il messaggio…"
          rows={3}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-white/20"
        />
        <div className="text-right text-[9px] text-gray-600 mt-0.5">{text.length}/{MAX_TEXT}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 whitespace-nowrap">📅 Data evento (opz.)</span>
        <input
          type="date"
          value={eventDate}
          onChange={e => setED(e.target.value)}
          className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-white/20"
        />
        {eventDate && (
          <button onClick={() => setED('')} className="text-[10px] text-gray-500 hover:text-gray-300">✕</button>
        )}
      </div>
      <VisibilitySelector
        visMode={visMode} setVisMode={setVisMode}
        visProfiles={visProfiles} setVisProfiles={setVP}
        visUserIds={visUserIds} setVisUserIds={setVU}
        allUsers={allUsers}
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-300 transition-colors">
          Annulla
        </button>
        <button
          onClick={submit}
          disabled={!text.trim() || saving || (visMode === 'profiles' && visProfiles.length === 0) || (visMode === 'users' && visUserIds.length === 0)}
          className="text-xs px-4 py-1.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium"
        >
          {saving ? 'Salvo…' : 'Pubblica'}
        </button>
      </div>
    </div>
  );
}

// ─── Sistema: PostCard ────────────────────────────────────────────────────────

export function PostCard({ post, canEdit, onDelete }) {
  const meta = SISTEMA_TYPES[post.type] || SISTEMA_TYPES.comunicazione;
  const dateStr    = formatDate(post.eventDate);
  const createdStr = post.createdAt
    ? new Date(post.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const today      = new Date().toISOString().slice(0, 10);
  const isUpcoming = post.eventDate && post.eventDate >= today;
  const isPast     = post.eventDate && post.eventDate < today;

  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} p-3.5 relative group`}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.border} ${meta.bg} ${meta.color}`}>
          {meta.icon} {meta.label}
        </span>
        {dateStr && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            isUpcoming ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
              : isPast  ? 'border-white/10 bg-white/[0.03] text-gray-500 line-through'
              : 'border-white/10 text-gray-400'
          }`}>
            📅 {dateStr}
          </span>
        )}
        {canEdit && <VisibilityBadge visibility={post.visibility} />}
        {canEdit && (
          <button
            onClick={() => onDelete(post.id)}
            className="ml-auto opacity-0 group-hover:opacity-100 text-[10px] text-gray-600 hover:text-red-400 transition-all px-1.5 py-0.5 rounded"
            title="Elimina post"
          >
            ✕
          </button>
        )}
      </div>
      <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{post.text}</p>
      <div className="flex items-center gap-2 mt-2 text-[9px] text-gray-600">
        <span>{post.authorEmail || 'Anonimo'}</span>
        {createdStr && <span>· {createdStr}</span>}
      </div>
    </div>
  );
}

// ─── Offerte: OfferForm (admin) ───────────────────────────────────────────────

export function OfferForm({ onSave, onCancel, authorEmail, allUsers = [] }) {
  const [category,   setCat]      = useState('promozione');
  const [title,      setTitle]    = useState('');
  const [desc,       setDesc]     = useState('');
  const [price,      setPrice]    = useState('');
  const [validUntil, setValid]    = useState('');
  const [saving,     setSaving]   = useState(false);
  const [visMode,    setVisMode]  = useState('all');
  const [visProfiles, setVP]      = useState([]);
  const [visUserIds,  setVU]      = useState([]);

  const submit = async () => {
    if (!title.trim() || !desc.trim()) return;
    if (visMode === 'profiles' && visProfiles.length === 0) return;
    if (visMode === 'users'    && visUserIds.length  === 0) return;
    setSaving(true);
    try {
      await onSave({
        id: newId(),
        category,
        title: title.trim().slice(0, 100),
        description: desc.trim().slice(0, MAX_OFFER_DESC),
        price: price.trim() || null,
        validUntil: validUntil || null,
        active: true,
        createdAt: new Date().toISOString(),
        authorEmail: authorEmail || '',
        visibility: buildVisibility(visMode, visProfiles, visUserIds),
      });
      setTitle(''); setDesc(''); setPrice(''); setValid(''); setCat('promozione');
      setVisMode('all'); setVP([]); setVU([]);
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
      {/* Categoria */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(OFFER_CATEGORIES).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setCat(key)}
            className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
              category === key
                ? `${meta.bg} ${meta.border} ${meta.color} font-bold`
                : 'border-white/8 text-gray-500 hover:text-gray-300'
            }`}
          >
            {meta.icon} {meta.label}
          </button>
        ))}
      </div>
      {/* Titolo */}
      <input
        value={title}
        onChange={e => setTitle(e.target.value.slice(0, 100))}
        placeholder="Titolo dell'offerta *"
        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20"
      />
      {/* Descrizione */}
      <div>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value.slice(0, MAX_OFFER_DESC))}
          placeholder="Descrizione dell'offerta *"
          rows={3}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-white/20"
        />
        <div className="text-right text-[9px] text-gray-600 mt-0.5">{desc.length}/{MAX_OFFER_DESC}</div>
      </div>
      {/* Prezzo + Scadenza */}
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="💰 Prezzo (es. €29/mese) — opz."
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-1">
          <span className="text-[10px] text-gray-500 whitespace-nowrap">📅 Scade il</span>
          <input
            type="date"
            value={validUntil}
            onChange={e => setValid(e.target.value)}
            className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/20"
          />
          {validUntil && (
            <button onClick={() => setValid('')} className="text-[10px] text-gray-500 hover:text-gray-300">✕</button>
          )}
        </div>
      </div>
      <VisibilitySelector
        visMode={visMode} setVisMode={setVisMode}
        visProfiles={visProfiles} setVisProfiles={setVP}
        visUserIds={visUserIds} setVisUserIds={setVU}
        allUsers={allUsers}
      />
      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-300 transition-colors">
          Annulla
        </button>
        <button
          onClick={submit}
          disabled={!title.trim() || !desc.trim() || saving || (visMode === 'profiles' && visProfiles.length === 0) || (visMode === 'users' && visUserIds.length === 0)}
          className="text-xs px-4 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium"
        >
          {saving ? 'Salvo…' : 'Pubblica offerta'}
        </button>
      </div>
    </div>
  );
}

// ─── Offerte: OfferCard ───────────────────────────────────────────────────────
// canEdit=true  → vista admin: badge categoria + delete hover
// canEdit=false → vista user: presentazione rich con price badge prominente

export function OfferCard({ offer, canEdit, onDelete }) {
  const cat     = OFFER_CATEGORIES[offer.category] || OFFER_CATEGORIES.altro;
  const today   = new Date().toISOString().slice(0, 10);
  const expired = !!(offer.validUntil && offer.validUntil < today);
  const daysLeft = offer.validUntil
    ? Math.ceil((new Date(offer.validUntil + 'T23:59:59') - new Date()) / 86400000)
    : null;

  if (canEdit) {
    // ── Admin view: compact list row ─────────────────────────────────────────
    return (
      <div className={`rounded-xl border ${cat.border} ${cat.bg} p-3.5 relative group flex items-start gap-3 ${expired ? 'opacity-50' : ''}`}>
        <span className="text-xl flex-shrink-0 mt-0.5">{cat.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cat.border} ${cat.bg} ${cat.color}`}>
              {cat.label}
            </span>
            {offer.price && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {offer.price}
              </span>
            )}
            {expired && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                Scaduta
              </span>
            )}
            {offer.validUntil && !expired && daysLeft !== null && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                daysLeft <= 3
                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                  : daysLeft <= 7
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                {daysLeft <= 0 ? 'Scade oggi' : `Scade tra ${daysLeft}gg`}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-white leading-snug">{offer.title}</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed line-clamp-2">{offer.description}</p>
          {canEdit && <div className="mt-1"><VisibilityBadge visibility={offer.visibility} /></div>}
        </div>
        {canEdit && onDelete && (
          <button
            onClick={() => onDelete(offer.id)}
            className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-600 hover:text-red-400 transition-all px-1.5 py-0.5 rounded flex-shrink-0"
            title="Elimina offerta"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  // ── User view: rich card ──────────────────────────────────────────────────
  return (
    <div className={`rounded-2xl border ${cat.border} overflow-hidden transition-all ${expired ? 'opacity-40' : 'hover:brightness-105'}`}>
      {/* Colored top stripe */}
      <div className={`h-1 w-full ${cat.bg.replace('/10', '/40')}`} />
      <div className="p-4 space-y-2.5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cat.border} ${cat.bg} ${cat.color} flex items-center gap-1`}>
              {cat.icon} {cat.label}
            </span>
            {expired && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                ⏰ Scaduta
              </span>
            )}
          </div>
          {offer.price && (
            <span className="text-sm font-black text-amber-300 bg-amber-500/15 border border-amber-500/30 px-3 py-0.5 rounded-xl flex-shrink-0">
              {offer.price}
            </span>
          )}
        </div>
        {/* Title */}
        <p className="text-base font-bold text-white leading-snug">{offer.title}</p>
        {/* Description */}
        <p className="text-sm text-gray-300 leading-relaxed">{offer.description}</p>
        {/* Footer */}
        {(offer.validUntil || offer.authorEmail) && (
          <div className="flex items-center justify-between pt-1.5 border-t border-white/5 flex-wrap gap-1.5">
            {offer.validUntil && (
              <span className={`text-[10px] font-medium px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                expired
                  ? 'border-red-500/20 bg-red-500/5 text-red-400'
                  : daysLeft !== null && daysLeft <= 7
                    ? 'border-amber-500/20 bg-amber-500/5 text-amber-400'
                    : 'border-white/10 bg-white/[0.03] text-gray-400'
              }`}>
                📅 {expired ? 'Scaduta il' : daysLeft !== null && daysLeft <= 7 ? `Scade tra ${daysLeft}gg ·` : 'Valida fino al'} {formatDate(offer.validUntil)}
              </span>
            )}
            <span className="text-[9px] text-gray-600 ml-auto">Pubblicato da {offer.authorEmail || 'admin'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── NewsBacheca principale ───────────────────────────────────────────────────

/**
 * Props:
 *   standings          : array
 *   calendar           : array
 *   analytics          : object { matchAnalytics, playerTrends }
 *   ownerTeamName      : string | null
 *   posts              : array (Sistema posts)
 *   onPostsChange      : (posts) => Promise<void>
 *   canEdit            : boolean
 *   authorEmail        : string
 *   onScrollToStandings: () => void
 *   onSelectMatch      : (match) => void
 *   onSelectPlayer     : (player) => void
 */
export default function NewsBacheca({
  standings = [],
  calendar = [],
  analytics = null,
  ownerTeamName = null,
  posts = [],
  onPostsChange,
  canEdit = false,       // mantenuto per retrocompat (non usato per create/delete qui)
  authorEmail = '',
  offers = [],
  onOffersChange,
  unreadByTab = {},
  onTabViewed,
  onScrollToStandings,
  onOpenDataImport,
  onSelectMatch,
  onSelectPlayer,
}) {
  const [activeTab, setActiveTab] = useState('campionato');

  const matchAnalytics = analytics?.matchAnalytics || [];
  const playerTrends   = analytics?.playerTrends   || {};

  const sortedMA = useMemo(() =>
    [...matchAnalytics].sort((a, b) =>
      (a.match.metadata.date || '').localeCompare(b.match.metadata.date || '')
    ), [matchAnalytics]);

  const campNews    = useMemo(() => genCampionatoNews(standings, calendar, ownerTeamName), [standings, calendar, ownerTeamName]);
  const squadraNews = useMemo(() => genSquadraNews(sortedMA), [sortedMA]);
  const playerNews  = useMemo(() => genPlayerNews(playerTrends), [playerTrends]);
  const sortedPosts = useMemo(() => sortPosts(posts), [posts]);

  const hasTeam = !!ownerTeamName;
  const hasCalendar = Array.isArray(calendar) && calendar.length > 0;

  const handleAction = useCallback((action) => {
    if (!action) return;
    if (action.type === 'selectMatch'    && onSelectMatch)      onSelectMatch(action.payload);
    if (action.type === 'selectPlayer'   && onSelectPlayer)     onSelectPlayer(action.payload);
    if (action.type === 'scrollStandings' && onScrollToStandings) onScrollToStandings();
  }, [onSelectMatch, onSelectPlayer, onScrollToStandings]);

  // Nota: create/delete di posts e offerte avviene esclusivamente da AdminContentPanel.
  // NewsBacheca è view-only per tutti (incluso admin).


  // Sorted offers: active first (by validUntil asc), expired last
  const sortedOffers = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const active  = offers.filter(o => !o.validUntil || o.validUntil >= today)
      .sort((a, b) => (a.validUntil || '9999').localeCompare(b.validUntil || '9999'));
    const expired = offers.filter(o => o.validUntil && o.validUntil < today)
      .sort((a, b) => b.validUntil.localeCompare(a.validUntil));
    return [...active, ...expired];
  }, [offers]);

  const sistemaBadge = posts.length;
  const offerteBadge = offers.filter(o => { const t = new Date().toISOString().slice(0, 10); return !o.validUntil || o.validUntil >= t; }).length;
  const activeUnread = Number(unreadByTab?.[activeTab] || 0);

  useEffect(() => {
    if (activeUnread <= 0) return;
    if (typeof onTabViewed !== 'function') return;
    onTabViewed(activeTab);
  }, [activeTab, activeUnread, onTabViewed]);

  return (
    <div className="glass-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📰</span>
          <h2 className="text-sm font-black text-white uppercase tracking-tighter">News</h2>
          {ownerTeamName && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/25 font-medium">
              {ownerTeamName}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (typeof onTabViewed === 'function') onTabViewed(activeTab);
          }}
          disabled={activeUnread <= 0}
          title={activeUnread > 0 ? 'Segna lette le notifiche del tab corrente' : 'Nessuna notifica non letta nel tab corrente'}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-white/12 text-[13px] text-gray-300 hover:text-white hover:bg-white/8 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Segna lette notifiche tab"
        >
          ✓
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/[0.03] border border-white/8">
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          const badge  = tab.id === 'sistema' ? sistemaBadge : tab.id === 'offerte' ? offerteBadge : 0;
          const unread = Number(unreadByTab?.[tab.id] || 0);
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (typeof onTabViewed === 'function') onTabViewed(tab.id);
              }}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                active
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {unread > 0 ? (
                <span className="text-[9px] min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white font-bold inline-flex items-center justify-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : badge > 0 && (
                <span className="text-[8px] px-1 py-0.5 rounded-full bg-white/10 text-gray-400 font-normal">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="space-y-3">

        {/* ── CAMPIONATO ── */}
        {activeTab === 'campionato' && (
          !hasCalendar
            ? <NoCalendarPrompt onOpenDataImport={onOpenDataImport} onScrollToStandings={onScrollToStandings} />
            : !hasTeam
            ? <NoTeamPrompt onScrollToStandings={onScrollToStandings} />
            : campNews.length === 0
              ? <EmptyState icon="🏆" text="Carica il calendario per visualizzare le news del campionato." />
              : campNews.map(item => <AutoNewsCard key={item.id} item={item} onAction={handleAction} />)
        )}

        {/* ── SQUADRA ── */}
        {activeTab === 'squadra' && (
          !hasTeam
            ? <NoTeamPrompt onScrollToStandings={onScrollToStandings} />
            : squadraNews.length === 0
              ? <EmptyState icon="🏐" text="Analizza almeno una partita per visualizzare le news della squadra." />
              : squadraNews.map(item => <AutoNewsCard key={item.id} item={item} onAction={handleAction} />)
        )}

        {/* ── PLAYER ── */}
        {activeTab === 'player' && (
          !hasTeam
            ? <NoTeamPrompt onScrollToStandings={onScrollToStandings} />
            : playerNews.length === 0
              ? <EmptyState icon="★" text="Analizza almeno 2 partite per visualizzare i trend dei giocatori." />
              : playerNews.map(item => <AutoNewsCard key={item.id} item={item} onAction={handleAction} />)
        )}

        {/* ── SISTEMA ── */}
        {activeTab === 'sistema' && (
          <>
            {sortedPosts.length === 0 && (
              <div className="text-center py-6 text-gray-600 text-xs">
                Nessun post nella bacheca.
              </div>
            )}
            {sortedPosts.map(post => (
              <PostCard key={post.id} post={post} canEdit={false} onDelete={null} />
            ))}
          </>
        )}

        {/* ── OFFERTE ── */}
        {activeTab === 'offerte' && (
          <>
            {sortedOffers.length === 0 && (
              <EmptyState icon="🏷️" text="Nessuna offerta disponibile al momento." />
            )}
            {sortedOffers.length > 0 && (
              <div className="space-y-3">
                {sortedOffers.map(offer => (
                  <OfferCard key={offer.id} offer={offer} canEdit={false} onDelete={null} />
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
