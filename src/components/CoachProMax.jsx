// ============================================================================
// COACH PROMAX — Sezione Analitica Avanzata per Allenatori
// ============================================================================

import { useMemo, useState, useCallback } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  CartesianGrid, ReferenceLine, Cell, LineChart, Line,
} from 'recharts';
import { computeCoachProMax, mediaPonderata, positionOnScale } from '../utils/coachProMaxEngine';
import { playerDisplayName, playerLabel } from '../utils/playerUtils';

// ─── Styling ─────────────────────────────────────────────────────────────────
const S = {
  card:       'bg-[#111827] border border-white/6 rounded-xl p-4',
  cardInner:  'bg-[#0d1117] border border-white/5 rounded-lg p-3',
  header:     'text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3',
  label:      'text-[11px] text-gray-500 uppercase tracking-wider',
  value:      'text-sm font-mono text-gray-200',
  badge:      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold',
  positive:   'bg-emerald-500/15 text-emerald-400',
  negative:   'bg-red-500/15 text-red-400',
  neutral:    'bg-gray-500/15 text-gray-400',
  amber:      'bg-amber-500/15 text-amber-400',
  insight:    'bg-[#0d1117] border border-amber-500/10 rounded-xl p-4 mb-4',
  bullet:     'text-[13px] text-gray-300 leading-relaxed',
  bulletBad:  'text-[13px] text-red-300/90 leading-relaxed',
  bulletGood: 'text-[13px] text-emerald-300/90 leading-relaxed',
};

const FUND_LABELS = { attack: 'Attacco', serve: 'Battuta', reception: 'Ricezione', defense: 'Difesa', block: 'Muro' };
const FUND_COLORS = { attack: '#f59e0b', serve: '#3b82f6', reception: '#10b981', defense: '#8b5cf6', block: '#ef4444' };
const FUND_ORDER = ['attack', 'serve', 'reception', 'defense'];
const ROLE_LABELS = { S: 'Schiacciatori', C: 'Centrali', P: 'Palleggiatori', L: 'Liberi', O: 'Opposti' };
const ROLE_FUND_MAP = { S: 'attack', C: 'attack', P: 'defense', L: 'reception', O: 'attack' };
const PLAYER_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function fmt(v, d = 2) { return v != null ? Number(v).toFixed(d) : '—'; }
function fmtPct(v) { return v != null ? `${Number(v).toFixed(1)}%` : '—'; }

function deltaTag(delta) {
  if (delta == null || Math.abs(delta) < 0.01) return <span className={`${S.badge} ${S.neutral}`}>= 0</span>;
  const pos = delta > 0;
  return <span className={`${S.badge} ${pos ? S.positive : S.negative}`}>{pos ? '▲' : '▼'} {Math.abs(delta).toFixed(3)}</span>;
}

function scaleTag(pos) {
  if (pos == null) return null;
  const p = Number(pos);
  const cls = p >= 2 ? S.positive : p <= -2 ? S.negative : p > 0 ? S.amber : S.neutral;
  return <span className={`${S.badge} ${cls}`}>{p > 0 ? '+' : ''}{p.toFixed(1)}</span>;
}

// ─── Collapsible match selector ──────────────────────────────────────────────
function MatchSelector({ analyses, selected, onSelect, label = 'Seleziona Partita' }) {
  const [open, setOpen] = useState(true);
  const cur = analyses[selected];
  return (
    <div className={S.card}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between"
      >
        <h3 className={`${S.header} mb-0`}>{label}</h3>
        <div className="flex items-center gap-2">
          {!open && cur && (
            <span className="text-xs text-amber-400 font-medium">
              {cur.opponent}{cur.date ? ` (${cur.date})` : ''} — {cur.result || ''}
            </span>
          )}
          <svg className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="flex flex-wrap gap-2 mt-3">
          {analyses.map((ma, i) => (
            <button
              key={ma.matchId || i}
              onClick={() => { onSelect(i); setOpen(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                i === selected
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10'
              }`}
            >
              {ma.opponent || `Partita ${i + 1}`}
              {ma.date ? <span className="ml-1 opacity-60">({ma.date})</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Insight box (list of bullet points) ─────────────────────────────────────
function InsightBox({ items, title }) {
  if (!items || !items.length) return null;
  return (
    <div className={S.insight}>
      {title && <h4 className="text-xs font-semibold text-amber-400/80 uppercase tracking-widest mb-2">{title}</h4>}
      <ul className="space-y-1.5 list-none">
        {items.map((it, i) => (
          <li key={i} className={it.type === 'good' ? S.bulletGood : it.type === 'bad' ? S.bulletBad : S.bullet}>
            <span className="mr-1.5">{it.type === 'good' ? '✅' : it.type === 'bad' ? '⚠️' : '•'}</span>
            {it.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Helper: generate profilo insights from analysis data ────────────────────
function buildProfiloInsights(a, current) {
  if (!a) return [];
  const items = [];
  // Over/under opponent
  for (const f of FUND_ORDER) {
    const oa = a.oppAnalysis?.[f];
    if (!oa) continue;
    const abs = Math.abs(oa.delta);
    if (abs < 0.05) continue;
    const over = oa.delta > 0;
    items.push({
      type: over ? 'bad' : 'good',
      text: `${FUND_LABELS[f]} avversario: ${over ? 'sopra' : 'sotto'} la media campionato di ${abs.toFixed(3)} (scala ${oa.scalePosition != null ? (oa.scalePosition > 0 ? '+' : '') + oa.scalePosition.toFixed(1) : '?'})`,
    });
  }
  // Attack generation
  if (a.attackGenerationFromRcv != null) {
    const rcvGood = a.attackGenerationFromRcv >= 70;
    items.push({
      type: rcvGood ? 'good' : 'bad',
      text: `Generazione attacco da ricezione: ${fmtPct(a.attackGenerationFromRcv)}${rcvGood ? '' : ' — margine di miglioramento'}`,
    });
  }
  if (a.attackGenerationFromDef != null) {
    const defGood = a.attackGenerationFromDef >= 60;
    items.push({
      type: defGood ? 'good' : 'bad',
      text: `Generazione attacco da difesa: ${fmtPct(a.attackGenerationFromDef)}${defGood ? '' : ' — margine di miglioramento'}`,
    });
  }
  // Error balance
  if (a.errorBalance != null && Math.abs(a.errorBalance) >= 2) {
    items.push({
      type: a.errorBalance > 0 ? 'bad' : 'good',
      text: `Bilancio errori: ${a.errorBalance > 0 ? '+' : ''}${a.errorBalance} (team ${a.teamErrors} vs avv. ${a.oppErrors})`,
    });
  }
  return items;
}

// ─── Helper: generate coeff insights per player/role ─────────────────────────
function buildCoeffInsights(transf, roster) {
  if (!transf?.playerCoefficients) return [];
  const items = [];
  const INPUT_KEYS = ['R3', 'R4', 'R5', 'D3', 'D4', 'D5'];

  // Build player flat list with role info
  const rosterMap = {};
  for (const p of (roster || [])) {
    const num = String(p.number || '').padStart(2, '0');
    rosterMap[num] = p;
  }

  // Collect all situations
  const situations = [];
  for (const [num, inputs] of Object.entries(transf.playerCoefficients)) {
    const pl = rosterMap[num];
    const role = String(pl?.role || '').toUpperCase() || '?';
    for (const key of INPUT_KEYS) {
      const d = inputs[key];
      if (!d || d.total < 2) continue;
      situations.push({ player: num, role, key, coeff: d.adjustedCoeff, total: d.total, avgOutput: d.avgOutput });
    }
  }
  if (!situations.length) return [];

  // Top 3 and bottom 3
  situations.sort((a, b) => b.coeff - a.coeff);
  const top3 = situations.slice(0, 3);
  const bot3 = situations.slice(-3).reverse();

  items.push({ type: null, text: 'Migliori 3 situazioni di trasformazione:' });
  for (const s of top3) {
    items.push({ type: 'good', text: `${playerLabel(s.player, roster)} (${s.role}) da ${s.key}: coeff. ${fmt(s.coeff)} su ${s.total} azioni (output medio ${s.avgOutput})` });
  }
  items.push({ type: null, text: 'Peggiori 3 situazioni di trasformazione:' });
  for (const s of bot3) {
    items.push({ type: 'bad', text: `${playerLabel(s.player, roster)} (${s.role}) da ${s.key}: coeff. ${fmt(s.coeff)} su ${s.total} azioni (output medio ${s.avgOutput})` });
  }

  // Per-role summary
  const roleAgg = {};
  for (const s of situations) {
    if (!roleAgg[s.role]) roleAgg[s.role] = { sum: 0, count: 0, total: 0 };
    roleAgg[s.role].sum += s.coeff * s.total;
    roleAgg[s.role].count++;
    roleAgg[s.role].total += s.total;
  }
  const roleSummary = Object.entries(roleAgg)
    .map(([r, a]) => ({ role: r, avg: a.total ? +(a.sum / a.total).toFixed(2) : 0, total: a.total }))
    .sort((a, b) => b.avg - a.avg);
  if (roleSummary.length > 1) {
    items.push({ type: null, text: 'Coefficiente medio per ruolo:' });
    for (const rs of roleSummary) {
      items.push({ type: rs.avg >= 3.5 ? 'good' : rs.avg < 3.0 ? 'bad' : null, text: `${rs.role}: Ø ${rs.avg} (${rs.total} azioni totali)` });
    }
  }

  return items;
}

// ─── Helper: generate setter insights ────────────────────────────────────────
function buildSetterInsights(setter, setterNum, data, roster) {
  const items = [];
  items.push({ type: null, text: `Attacchi totali serviti: ${data.totalAttacks}, output medio Ø ${data.avgOutput}, kill rate ${data.killRate}%` });

  // Best and worst fed attackers
  const attackers = Object.entries(data.attacksByPlayer)
    .map(([p, s]) => ({ player: p, ...s }))
    .filter(a => a.total >= 3)
    .sort((a, b) => b.avgOutput - a.avgOutput);
  if (attackers.length >= 2) {
    const best = attackers[0];
    const worst = attackers[attackers.length - 1];
    items.push({ type: 'good', text: `Miglior connessione: ${playerLabel(best.player, roster)} — Ø ${best.avgOutput} su ${best.total} attacchi (efficacia ${fmtPct(best.efficacy)})` });
    items.push({ type: 'bad', text: `Connessione più debole: ${playerLabel(worst.player, roster)} — Ø ${worst.avgOutput} su ${worst.total} attacchi (efficacia ${fmtPct(worst.efficacy)})` });
  }

  // Input quality analysis
  const inputEntries = Object.entries(data.attacksByInput).filter(([, d]) => d.total > 0);
  const bestInput = inputEntries.sort(([, a], [, b]) => (b.total ? b.sumOutput / b.total : 0) - (a.total ? a.sumOutput / a.total : 0))[0];
  if (bestInput) {
    const [k, d] = bestInput;
    items.push({ type: null, text: `Input più produttivo: ${k} → output medio ${d.total ? (d.sumOutput / d.total).toFixed(2) : '—'} su ${d.total} azioni` });
  }

  return items;
}

// ─── Helper: build return match insights ─────────────────────────────────────
function buildReturnInsights(pred, current) {
  if (!pred) return [];
  const items = [];
  for (const f of FUND_ORDER) {
    const p = pred[f];
    if (!p) continue;
    const oppOver = p.oppDelta > 0.05;
    const oppUnder = p.oppDelta < -0.05;
    const adj = p.expectedTeamAdjustment;
    if (oppOver) {
      items.push({ type: 'good', text: `${FUND_LABELS[f]}: l'avversario era sopra media di ${fmt(p.oppDelta, 3)} → atteso rientro, il nostro fondamentale potrebbe migliorare di ~${fmt(Math.abs(adj), 3)} (da ${fmt(p.teamActual, 3)} a ${fmt(p.expectedTeam, 3)})` });
    } else if (oppUnder) {
      items.push({ type: 'bad', text: `${FUND_LABELS[f]}: l'avversario era sotto media di ${fmt(Math.abs(p.oppDelta), 3)} → atteso rientro verso l'alto, il nostro fondamentale potrebbe peggiorare di ~${fmt(Math.abs(adj), 3)} (da ${fmt(p.teamActual, 3)} a ${fmt(p.expectedTeam, 3)})` });
    }
  }
  if (!items.length) {
    items.push({ type: null, text: 'L\'avversario ha giocato sostanzialmente in media — non si attendono scostamenti significativi nel ritorno.' });
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. PROFILO PARTITA
// ═══════════════════════════════════════════════════════════════════════════════
function ProfiloPartita({ cpx }) {
  const [selected, setSelected] = useState(0);
  const analyses = cpx?.matchAnalyses || [];
  if (!analyses.length) return <NoData msg="Nessuna partita caricata." />;

  const current = analyses[selected];
  const a = current?.analysis;
  const insights = useMemo(() => buildProfiloInsights(a, current), [a, current]);

  return (
    <div className="space-y-4">
      <MatchSelector analyses={analyses} selected={selected} onSelect={setSelected} />

      {a && (
        <>
          {/* Descriptive summary */}
          <InsightBox items={insights} title={`Evidenze — ${current.opponent} (${current.date})`} />

          {/* Over/Under Performance */}
          <div className={S.card}>
            <h3 className={S.header}>Over / Under Performance vs Media Campionato</h3>
            {a.oppRanking && (
              <p className="text-xs text-gray-500 mb-3">
                {a.oppName} — Posizione classifica: <span className="text-amber-400 font-semibold">{a.oppRanking.position}°</span> / {a.oppRanking.total}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {FUND_ORDER.map(fund => {
                const oa = a.oppAnalysis?.[fund];
                if (!oa) return null;
                return (
                  <div key={fund} className={S.cardInner}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold" style={{ color: FUND_COLORS[fund] }}>{FUND_LABELS[fund]}</span>
                      {scaleTag(oa.scalePosition)}
                    </div>
                    <div className="space-y-1">
                      <Row label="Avversario MP" value={fmt(oa.mediaPond, 3)} />
                      <Row label="Media Camp." value={fmt(oa.avgMediaPond, 3)} />
                      <Row label="Delta" value={deltaTag(oa.delta)} raw />
                      <Row label="Scala (-5/+5)" value={scaleTag(oa.scalePosition)} raw />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className={S.card}>
              <h3 className={S.header}>Generazione Attacco</h3>
              <Row label="Da Ricezione" value={fmtPct(a.attackGenerationFromRcv)} />
              <Row label="Da Difesa" value={fmtPct(a.attackGenerationFromDef)} />
            </div>
            <div className={S.card}>
              <h3 className={S.header}>Bilancio Errori</h3>
              <Row label="Errori Team" value={a.teamErrors} />
              <Row label="Errori Avversario" value={a.oppErrors} />
              <Row label="Bilancio" value={deltaTag(a.errorBalance)} raw />
            </div>
            <div className={S.card}>
              <h3 className={S.header}>Risultato</h3>
              <p className="text-lg font-bold text-white">{current.result || '—'}</p>
            </div>
          </div>

          <OverUnderChart analysis={a} />
        </>
      )}
    </div>
  );
}

function OverUnderChart({ analysis }) {
  if (!analysis?.oppAnalysis) return null;
  const data = FUND_ORDER.map(f => ({
    fund: FUND_LABELS[f],
    avversario: analysis.oppAnalysis[f]?.mediaPond || 0,
    media: analysis.oppAnalysis[f]?.avgMediaPond || 0,
  }));
  return (
    <div className={S.card}>
      <h3 className={S.header}>Avversario vs Media Campionato</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="fund" tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} domain={[0, 5]} />
          <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="avversario" name="Avversario" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          <Bar dataKey="media" name="Media Camp." fill="#6b7280" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. COEFFICIENTI
// ═══════════════════════════════════════════════════════════════════════════════
function CoefficienteTab({ cpx, roster }) {
  const transf = cpx?.transformationCoefficients;
  if (!transf?.playerCoefficients || !Object.keys(transf.playerCoefficients).length) {
    return <NoData msg="Nessun dato di trasformazione R/D → A disponibile." />;
  }

  const insights = useMemo(() => buildCoeffInsights(transf, roster), [transf, roster]);

  const players = useMemo(() =>
    Object.entries(transf.playerCoefficients)
      .map(([num, inputs]) => {
        let totalActions = 0, sumAdjusted = 0;
        for (const [, data] of Object.entries(inputs)) {
          totalActions += data.total;
          sumAdjusted += data.adjustedCoeff * data.total;
        }
        return { number: num, inputs, totalActions, avgCoeff: totalActions ? +(sumAdjusted / totalActions).toFixed(2) : 0 };
      })
      .sort((a, b) => b.avgCoeff - a.avgCoeff),
  [transf]);

  return (
    <div className="space-y-4">
      <InsightBox items={insights} title="Evidenze Coefficienti di Trasformazione" />

      <div className={S.card}>
        <h3 className={S.header}>Coefficiente di Trasformazione per Giocatore</h3>
        <p className="text-xs text-gray-500 mb-4">
          Capacità di trasformare ricezioni/difese (≥3) in attacchi efficaci, pesata per la qualità della difesa avversaria affrontata.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-white/5">
                <th className="text-left py-2 px-2">#</th>
                <th className="text-right py-2 px-2">Tot. Azioni</th>
                <th className="text-right py-2 px-2">Coeff. Medio</th>
                {['R3','R4','R5','D3','D4','D5'].map(k => <th key={k} className="text-right py-2 px-2">Da {k}</th>)}
              </tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.number} className="border-b border-white/3 hover:bg-white/3">
                  <td className="py-2 px-2 font-mono text-amber-400">{playerLabel(p.number, roster)}</td>
                  <td className="py-2 px-2 text-right text-gray-300">{p.totalActions}</td>
                  <td className="py-2 px-2 text-right font-semibold text-white">{fmt(p.avgCoeff)}</td>
                  {['R3','R4','R5','D3','D4','D5'].map(key => {
                    const d = p.inputs[key];
                    return (
                      <td key={key} className="py-2 px-2 text-right text-gray-400">
                        {d ? <span title={`${d.total} azioni, output medio ${d.avgOutput}`}>{fmt(d.adjustedCoeff)} <span className="text-gray-600">({d.total})</span></span> : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TeamTransfCard title="Da Ricezione (Team)" data={transf.teamTransf?.fromRcv} />
        <TeamTransfCard title="Da Difesa (Team)" data={transf.teamTransf?.fromDef} />
      </div>
    </div>
  );
}

function TeamTransfCard({ title, data }) {
  if (!data || !Object.keys(data).length) return null;
  const rows = Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, d]) => ({ key, total: d.total, avgAttack: d.total ? +(d.sumAttackEval / d.total).toFixed(2) : 0, distribution: d.byOutput || {} }));
  return (
    <div className={S.card}>
      <h3 className={S.header}>{title}</h3>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.key} className="flex items-center justify-between">
            <span className="text-xs font-mono text-amber-400 w-10">{r.key}</span>
            <span className="text-xs text-gray-400">{r.total} azioni</span>
            <span className="text-xs font-semibold text-white">Ø {r.avgAttack}</span>
            <div className="flex gap-1">
              {Object.entries(r.distribution).sort(([a], [b]) => b.localeCompare(a)).map(([k, v]) => (
                <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500">{k}:{v}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PALLEGGIATORE
// ═══════════════════════════════════════════════════════════════════════════════
function PalleggiatoreTab({ cpx, roster }) {
  const sa = cpx?.setterAttribution;
  const setterEntries = useMemo(() => {
    if (!sa?.setterMap) return [];
    return Object.entries(sa.setterMap).filter(([, d]) => d.totalAttacks > 0);
  }, [sa]);

  const [activeSetter, setActiveSetter] = useState(null);

  // Auto-select first setter
  const effectiveSetter = activeSetter || (setterEntries[0]?.[0] ?? null);

  if (!setterEntries.length) {
    return <NoData msg="Nessun dato di attribuzione palleggiatore disponibile. Serve un roster con ruoli P e rally con servizi dei palleggiatori." />;
  }

  const currentData = setterEntries.find(([k]) => k === effectiveSetter)?.[1];
  const insights = useMemo(
    () => currentData ? buildSetterInsights(effectiveSetter, effectiveSetter, currentData, roster) : [],
    [effectiveSetter, currentData, roster],
  );

  return (
    <div className="space-y-4">
      {/* Setter pills */}
      <div className="flex items-center gap-3">
        {setterEntries.map(([setter, data]) => (
          <button
            key={setter}
            onClick={() => setActiveSetter(setter)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              setter === effectiveSetter
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10'
            }`}
          >
            {playerLabel(setter, roster)}
            <span className="ml-2 text-[10px] opacity-60">{data.totalAttacks} att.</span>
          </button>
        ))}
      </div>

      {currentData && (
        <>
          {/* Descriptive insights */}
          <InsightBox items={insights} title={`Analisi — ${playerLabel(effectiveSetter, roster)}`} />

          {/* Stats tables */}
          <div className={S.card}>
            <h3 className={S.header}>
              Distribuzione per Attaccante — {playerLabel(effectiveSetter, roster)}
              <span className="ml-3 text-gray-500 normal-case tracking-normal">
                Ø output {currentData.avgOutput} — Kill rate {currentData.killRate}%
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-white/5">
                    <th className="text-left py-1.5 px-2">Giocatrice</th>
                    <th className="text-right py-1.5 px-2">Tot</th>
                    <th className="text-right py-1.5 px-2">Ø Output</th>
                    <th className="text-right py-1.5 px-2">Kills</th>
                    <th className="text-right py-1.5 px-2">Errori</th>
                    <th className="text-right py-1.5 px-2">Efficacia</th>
                    <th className="text-right py-1.5 px-2">Efficienza</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(currentData.attacksByPlayer)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([player, stats]) => (
                      <tr key={player} className="border-b border-white/3 hover:bg-white/3">
                        <td className="py-1.5 px-2 font-mono text-amber-400">{playerLabel(player, roster)}</td>
                        <td className="py-1.5 px-2 text-right text-gray-300">{stats.total}</td>
                        <td className="py-1.5 px-2 text-right text-white font-semibold">{stats.avgOutput}</td>
                        <td className="py-1.5 px-2 text-right text-emerald-400">{stats.kills}</td>
                        <td className="py-1.5 px-2 text-right text-red-400">{stats.errors}</td>
                        <td className="py-1.5 px-2 text-right text-gray-300">{fmtPct(stats.efficacy)}</td>
                        <td className="py-1.5 px-2 text-right text-gray-400">{fmtPct(stats.efficiency)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={S.card}>
            <h3 className={S.header}>Qualità Input → Output</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {Object.entries(currentData.attacksByInput)
                .filter(([, d]) => d.total > 0)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, d]) => (
                  <div key={key} className={S.cardInner}>
                    <div className="text-xs font-mono text-amber-400 mb-1">{key}</div>
                    <div className="text-sm font-semibold text-white">{(d.sumOutput / d.total).toFixed(2)}</div>
                    <div className="text-[10px] text-gray-600">{d.total} azioni</div>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. RUOLI — con andamentale per partita
// ═══════════════════════════════════════════════════════════════════════════════
function RuoliTab({ cpx, matches, roster }) {
  const rc = cpx?.roleComparisons;
  if (!rc?.comparisons || !Object.keys(rc.comparisons).length) {
    return <NoData msg="Nessun confronto ruoli disponibile. Serve un roster con ruoli assegnati (S, C, L, P)." />;
  }

  // Build per-match trend data for each role group
  const trendData = useMemo(() => {
    if (!rc?.roleGroups || !matches?.length) return {};
    const result = {};
    for (const [group, players] of Object.entries(rc.roleGroups)) {
      if (!players.length) continue;
      const playerNums = players.map(p => p.number);
      const primaryFund = ROLE_FUND_MAP[group] || 'attack';

      const series = matches.map(m => {
        const date = String(m?.metadata?.date || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
        const opp = String(m?.metadata?.opponent || '').split(' ').slice(0, 2).join(' ');
        const label = opp || date;
        const point = { match: label };

        for (const pNum of playerNums) {
          const pStats = (m?.riepilogo?.playerStats || []).find(ps => String(ps.number || '').padStart(2, '0') === pNum);
          if (pStats?.[primaryFund]) {
            // Usa il soprannome come chiave per il grafico
            const key = playerLabel(pNum, roster);
            point[key] = mediaPonderata(pStats[primaryFund]);
          }
        }
        return point;
      });
      // Chiavi per le linee del grafico
      const playerKeys = playerNums.map(n => playerLabel(n, roster));
      result[group] = { series, playerNums, playerKeys, primaryFund };
    }
    return result;
  }, [rc, matches, roster]);

  return (
    <div className="space-y-4">
      {rc.comparisons.S && <RoleComparisonCard comp={rc.comparisons.S} type="S" trend={trendData.S} />}
      {rc.comparisons.C && <RoleComparisonCard comp={rc.comparisons.C} type="C" trend={trendData.C} />}
      {rc.comparisons.L && <RoleComparisonCard comp={rc.comparisons.L} type="L" trend={trendData.L} />}
      {rc.comparisons.P && <RoleComparisonCard comp={rc.comparisons.P} type="P" trend={trendData.P} />}
    </div>
  );
}

function RoleComparisonCard({ comp, type, trend }) {
  const fundCols = type === 'S'
    ? ['attack', 'reception', 'defense', 'serve']
    : type === 'C' ? ['attack', 'block', 'serve']
    : type === 'L' ? ['reception', 'defense']
    : ['defense', 'serve', 'block'];

  return (
    <div className={S.card}>
      <h3 className={S.header}>{comp.label}</h3>
      <p className="text-xs text-gray-500 mb-3">{comp.description}</p>

      {type === 'S' && comp.s1Candidate && comp.s2Candidate && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <CandidateCard label="S1 (Attacco)" player={comp.s1Candidate} accent="amber" />
          <CandidateCard label="S2 (2a Linea)" player={comp.s2Candidate} accent="blue" />
        </div>
      )}
      {type === 'L' && comp.liberoRicezione && comp.liberoDifesa && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <CandidateCard label="Libero Ricezione" player={comp.liberoRicezione} accent="emerald" />
          <CandidateCard label="Libero Difesa" player={comp.liberoDifesa} accent="purple" />
        </div>
      )}

      {/* Player table */}
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/5">
              <th className="text-left py-2 px-2">#</th>
              <th className="text-left py-2 px-2">Nome</th>
              <th className="text-left py-2 px-2">Ruolo</th>
              <th className="text-right py-2 px-2">Partite</th>
              {fundCols.map(f => <th key={f} className="text-right py-2 px-2" style={{ color: FUND_COLORS[f] }}>{FUND_LABELS[f]} MP</th>)}
              {fundCols.map(f => <th key={`${f}_eff`} className="text-right py-2 px-2 text-gray-600">{FUND_LABELS[f]} Eff%</th>)}
            </tr>
          </thead>
          <tbody>
            {(comp.players || []).map(p => (
              <tr key={p.number} className="border-b border-white/3 hover:bg-white/3">
                <td className="py-2 px-2 font-mono text-amber-400">#{p.number}</td>
                <td className="py-2 px-2 text-gray-300">{playerDisplayName(p) || '—'}</td>
                <td className="py-2 px-2 text-gray-500">{p.role}</td>
                <td className="py-2 px-2 text-right text-gray-400">{p.matchCount || 0}</td>
                {fundCols.map(f => <td key={f} className="py-2 px-2 text-right font-semibold text-white">{p[f]?.mediaPond != null ? fmt(p[f].mediaPond, 3) : '—'}</td>)}
                {fundCols.map(f => <td key={`${f}_eff`} className="py-2 px-2 text-right text-gray-500">{p[f]?.efficacy != null ? fmtPct(p[f].efficacy) : '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Trend chart per-match */}
      {trend?.series?.length > 1 && (
        <div className="mt-2">
          <h4 className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">
            Andamentale {FUND_LABELS[trend.primaryFund]} — Media Ponderata per partita
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend.series} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="match" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-25} textAnchor="end" height={50} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} domain={[1, 5]} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={3} stroke="#4b5563" strokeDasharray="5 5" />
              {(trend.playerKeys || trend.playerNums.map(n => `#${n}`)).map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={key}
                  stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Radar chart */}
      {comp.players?.length >= 2 && (
        <RoleRadarChart players={comp.players} fundCols={fundCols} />
      )}
    </div>
  );
}

function CandidateCard({ label, player, accent }) {
  const colors = {
    amber: 'border-amber-500/30 bg-amber-500/5', blue: 'border-blue-500/30 bg-blue-500/5',
    emerald: 'border-emerald-500/30 bg-emerald-500/5', purple: 'border-purple-500/30 bg-purple-500/5',
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[accent] || colors.amber}`}>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-semibold text-white">#{player.number} {playerDisplayName(player)}</div>
    </div>
  );
}

const RADAR_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

function RoleRadarChart({ players, fundCols }) {
  const data = fundCols.map(f => {
    const entry = { fund: FUND_LABELS[f] };
    players.forEach((p, i) => { entry[`p${i}`] = p[f]?.mediaPond || 0; });
    return entry;
  });
  return (
    <div className="mt-4">
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={data}>
          <PolarGrid stroke="#1e293b" />
          <PolarAngleAxis dataKey="fund" tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <PolarRadiusAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0, 5]} />
          {players.map((p, i) => (
            <Radar key={p.number} name={`#${p.number} ${playerDisplayName(p)}`} dataKey={`p${i}`}
              stroke={RADAR_COLORS[i % RADAR_COLORS.length]} fill={RADAR_COLORS[i % RADAR_COLORS.length]} fillOpacity={0.1} />
          ))}
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. PREPARAZIONE RITORNO
// ═══════════════════════════════════════════════════════════════════════════════
function PrepRitornoTab({ cpx }) {
  const [selected, setSelected] = useState(0);
  const analyses = cpx?.matchAnalyses || [];
  if (!analyses.length) return <NoData msg="Nessuna partita caricata." />;

  const current = analyses[selected];
  const pred = current?.returnPrediction;
  const insights = useMemo(() => buildReturnInsights(pred, current), [pred, current]);

  return (
    <div className="space-y-4">
      <MatchSelector analyses={analyses} selected={selected} onSelect={setSelected} label="Seleziona Partita di Andata" />

      {pred && (
        <>
          <InsightBox items={insights} title={`Preparazione Ritorno vs ${current.opponent}`} />

          <div className={S.card}>
            <h3 className={S.header}>Predizione Gara di Ritorno vs {current.opponent}</h3>
            <p className="text-xs text-gray-500 mb-4">
              Se l'avversario tornasse ai suoi valori medi di campionato, come cambierebbe il quadro per il nostro team?
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {FUND_ORDER.map(fund => {
                const p = pred[fund];
                if (!p) return null;
                return (
                  <div key={fund} className={S.cardInner}>
                    <div className="text-xs font-semibold mb-2" style={{ color: FUND_COLORS[fund] }}>{FUND_LABELS[fund]}</div>
                    <div className="space-y-1.5">
                      <div>
                        <span className={S.label}>Avversario Andata</span>
                        <div className="flex items-center gap-2">
                          <span className={S.value}>{fmt(p.oppActual, 3)}</span>
                          {deltaTag(p.oppDelta)}
                        </div>
                      </div>
                      <div>
                        <span className={S.label}>Team Andata</span>
                        <div className="flex items-center gap-2">
                          <span className={S.value}>{fmt(p.teamActual, 3)}</span>
                          {deltaTag(p.teamDelta)}
                        </div>
                      </div>
                      <div className="pt-1 border-t border-white/5">
                        <span className={S.label}>Stima Ritorno Team</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-amber-400">{fmt(p.expectedTeam, 3)}</span>
                          <span className="text-[10px] text-gray-600">(adj: {p.expectedTeamAdjustment > 0 ? '+' : ''}{fmt(p.expectedTeamAdjustment, 3)})</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <ReturnChart pred={pred} />
          </div>
        </>
      )}
    </div>
  );
}

function ReturnChart({ pred }) {
  if (!pred) return null;
  const data = FUND_ORDER.map(f => ({ fund: FUND_LABELS[f], andata: pred[f]?.teamActual || 0, ritorno: pred[f]?.expectedTeam || 0 }));
  return (
    <div className="mt-4">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="fund" tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} domain={[0, 5]} />
          <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="andata" name="Andata" fill="#6b7280" radius={[4, 4, 0, 0]} />
          <Bar dataKey="ritorno" name="Stima Ritorno" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Shared helpers ──────────────────────────────────────────────────────────
function Row({ label, value, raw = false }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={S.label}>{label}</span>
      {raw ? value : <span className={S.value}>{value}</span>}
    </div>
  );
}

function NoData({ msg }) {
  return (
    <div className={`${S.card} flex items-center justify-center py-12`}>
      <p className="text-sm text-gray-500">{msg}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function CoachProMax({ matches, standings, analytics, activeSubTab }) {
  const roster = useMemo(() => {
    const map = {};
    for (const m of (matches || [])) {
      for (const p of (m.roster || [])) {
        if (p.number && !map[p.number]) map[p.number] = p;
      }
    }
    return Object.values(map);
  }, [matches]);

  const cpx = useMemo(() => {
    if (!matches?.length) return null;
    return computeCoachProMax(matches, roster, standings);
  }, [matches, roster, standings]);

  const tab = activeSubTab || 'profilo';

  if (!matches?.length) {
    return <NoData msg="Carica almeno una partita per accedere alle analisi Coach ProMax." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Coach ProMax</h2>
          <p className="text-xs text-gray-500">Analisi avanzata per la preparazione tattica</p>
        </div>
      </div>

      {tab === 'profilo' && <ProfiloPartita cpx={cpx} />}
      {tab === 'coefficienti' && <CoefficienteTab cpx={cpx} roster={roster} />}
      {tab === 'palleggiatore' && <PalleggiatoreTab cpx={cpx} roster={roster} />}
      {tab === 'ruoli' && <RuoliTab cpx={cpx} matches={matches} roster={roster} />}
      {tab === 'ritorno' && <PrepRitornoTab cpx={cpx} />}
    </div>
  );
}
