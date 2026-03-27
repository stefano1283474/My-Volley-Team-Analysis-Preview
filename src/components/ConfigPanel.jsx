// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Config Panel
// Gestione centralizzata di: pesi partita, FNC, profili
// ============================================================================

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, Legend,
} from 'recharts';
import { DEFAULT_WEIGHTS, DEFAULT_FNC_CONFIG, DEFAULT_PROFILE } from '../utils/constants';
import { applyFNCToEfficacy } from '../utils/analyticsEngine';

// ─── Constants ────────────────────────────────────────────────────────────────

const WEIGHT_LABELS = {
  opponentStrength: {
    label: 'Forza Avversario (classifica)', short: 'Forza Avv.', icon: '🏆',
    desc: 'Avversario 1° in classifica → bonus massimo al contesto. Ultimo in classifica → penalizzazione.',
    detail: [
      { heading: 'Cosa misura', body: 'La posizione in classifica dell\'avversario al momento del match. Un avversario al 1° posto è considerato il contesto più difficile; l\'ultimo posto genera una penalizzazione sul coefficiente.' },
      { heading: 'Formula', body: 'F = ((posMax − posAvv) / (posMax − 1)) × 2 − 1   →  risultato in [−1, +1]\nDove posAvv è la sua posizione e posMax è l\'ultima (es. 10 su 10 squadre).' },
      { heading: 'Effetto sul CC', body: 'CC = 1 + Σ(w_i × F_i). Questo fattore entra come w_forza × F_forza. Con w = 0.25 e F = +1 (avversario 1°) contribuisce +0.25 al CC. Con F = −1 (ultimo) contribuisce −0.25.' },
    ],
  },
  opponentPerformance: {
    label: 'Performance Avversario (errori)', short: 'Perf. Avv.', icon: '📉',
    desc: 'Ha giocato sopra o sotto il suo standard? Confronto errori in questa partita vs media campionato.',
    detail: [
      { heading: 'Cosa misura', body: 'Quanti errori ha commesso l\'avversario in questa partita rispetto alla sua media stagionale. Se ha sbagliato più del solito, era in difficoltà — la nostra vittoria "pesa meno". Se ha sbagliato meno, era in forma — la partita è più significativa.' },
      { heading: 'Formula', body: 'F = (errMediaStagionale − errPartita) / errMediaStagionale   →  clampato in [−1, +1]\nF > 0: avversario era sotto la sua media (era in forma) → contesto difficile\nF < 0: avversario aveva più errori del solito → era in difficoltà' },
      { heading: 'Nota', body: 'Il dato degli errori avversari viene dedotto dai rally registrati nel match (azioni concluse con punto su loro errore).' },
    ],
  },
  setCompetitiveness: {
    label: 'Competitività dei Set (parziali)', short: 'Competit. Set', icon: '⚡',
    desc: 'Set combattuti (25-23) pesano più di set a senso unico (25-15). Indica intensità del gioco.',
    detail: [
      { heading: 'Cosa misura', body: 'Quanto sono stati combattuti i set dal punteggio finale. Set con margini stretti (25-23, 26-24) indicano una partita intensa e incerta; set netti (25-10) indicano dominanza.' },
      { heading: 'Formula', body: 'Per ogni set: margine = |pt_noi − pt_avv|; compScore = 1 − margine / maxMargine\nF = media compScore sui set − 0.5 → scalato in [−1, +1]\nSet 25-23 → margine 2 → alta competitività. Set 25-10 → margine 15 → bassa competitività.' },
      { heading: 'Effetto', body: 'Partite equilibrate (tutti i set combattuti) aumentano il CC, rendendo la performance in quel match più rappresentativa del livello reale della squadra.' },
    ],
  },
  matchResult: {
    label: 'Risultato Partita', short: 'Risultato', icon: '🎯',
    desc: 'Vittoria 3-2 sotto pressione vale più di 3-0 facile. Sconfitta 2-3 valorizza il combattere fino in fondo.',
    detail: [
      { heading: 'Cosa misura', body: 'Il risultato finale considerando quanti set sono stati disputati. Non è solo vittoria/sconfitta: conta la "distanza" dalla vittoria netta.' },
      { heading: 'Scala valori F', body: 'Vittoria 3-0 → F = +0.2  (dominio, ma contesto meno impegnativo)\nVittoria 3-1 → F = +0.5\nVittoria 3-2 → F = +1.0  (massimo: lottato fino al tie-break)\nSconfitta 2-3 → F = +0.5  (valorizza la resistenza)\nSconfitta 1-3 → F = −0.2\nSconfitta 0-3 → F = −1.0' },
      { heading: 'Logica', body: 'Un 3-2 in vittoria è un contesto più impegnativo di un 3-0: l\'avversario ci ha resistito per 5 set. Allo stesso modo, perdere 2-3 è valorizzato rispetto a 0-3.' },
    ],
  },
  chainContext: {
    label: 'Complessità Rally (catene)', short: 'Complessità', icon: '🔗',
    desc: 'Rally lunghi → avversario organizzato → contesto più impegnativo. Influenza entro ±50%.',
    detail: [
      { heading: 'Cosa misura', body: 'La lunghezza media dei rally (catene d\'azione) in questa partita rispetto alla media stagionale. Rally lunghi indicano un avversario con buona organizzazione difensiva che prolunga gli scambi.' },
      { heading: 'Formula', body: 'F = (lMediaPartita − lMediaStagionale) / lMediaStagionale   →  clampato in [−0.5, +0.5]\nIl range ristretto (±50%) è intenzionale: la complessità di gioco incide meno della forza avversario o del risultato.' },
      { heading: 'Effetto', body: 'Rally mediamente più lunghi del solito → CC leggermente superiore → la performance in quel match vale un po\' di più. Effetto massimo ±50% rispetto agli altri fattori.' },
    ],
  },
};

const FUND_LABELS = {
  attack:    { label: 'Attacco',   icon: '⚔',  color: '#f43f5e' },
  serve:     { label: 'Battuta',   icon: '🎯', color: '#8b5cf6' },
  reception: { label: 'Ricezione', icon: '🤲', color: '#0ea5e9' },
  defense:   { label: 'Difesa',    icon: '🛡', color: '#10b981' },
  block:     { label: 'Muro',      icon: '🧱', color: '#f59e0b' },
};

const TOOLTIP_STYLE = {
  background: 'rgba(17,24,39,0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  fontSize: 11,
};

// ─── InfoButton ───────────────────────────────────────────────────────────────
// detail = array of { heading, body } or a plain string

function InfoButton({ detail, label = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  if (!detail) return null;

  return (
    <div className="relative inline-flex flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(p => !p); }}
        aria-label={`Info: ${label}`}
        className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold leading-none select-none transition-colors ${
          open
            ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
            : 'bg-white/10 text-gray-500 hover:bg-white/20 hover:text-gray-200'
        }`}
      >i</button>
      {open && (
        <div
          className="absolute left-0 top-5 z-30 w-72 rounded-lg border border-white/10 bg-gray-900/98 shadow-2xl overflow-hidden"
          style={{ minWidth: 260 }}
        >
          {/* Title bar */}
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-white/8">
            <span className="text-[11px] font-semibold text-amber-300">{label}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-600 hover:text-gray-300 text-xs leading-none"
            >✕</button>
          </div>
          {/* Content */}
          <div className="px-3 py-2.5 space-y-2.5">
            {Array.isArray(detail)
              ? detail.map((item, i) => (
                  <div key={i}>
                    <p className="text-[10px] font-semibold text-sky-400 mb-0.5">{item.heading}</p>
                    <p className="text-[10px] text-gray-300 leading-relaxed whitespace-pre-line">{item.body}</p>
                  </div>
                ))
              : <p className="text-[10px] text-gray-300 leading-relaxed whitespace-pre-line">{detail}</p>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SliderRow ────────────────────────────────────────────────────────────────

function SliderRow({ label, desc, icon, value, min = 0, max = 0.5, step = 0.01, format, onChange, disabled, compact, info }) {
  const pct = format ? format(value) : `±${(value * 100).toFixed(0)}%`;
  return (
    <div className={`space-y-0.5 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon && <span className="text-sm flex-shrink-0">{icon}</span>}
          <label className="text-sm text-gray-200 font-medium truncate">{label}</label>
          <InfoButton detail={info} label={label} />
        </div>
        <span className="text-[11px] font-mono text-amber-400 min-w-[3rem] text-right flex-shrink-0">{pct}</span>
      </div>
      {desc && !compact && <p className="text-[10px] text-gray-500 leading-relaxed">{desc}</p>}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-gray-600 w-6">{(min * 100).toFixed(0)}%</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-amber-400"
        />
        <span className="text-[9px] text-gray-600 w-7 text-right">{(max * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ─── ProfileManager ───────────────────────────────────────────────────────────

function ProfileManager({ profiles, activeId, onLoad, onSave, onDelete, onReset, hasUnsavedChanges }) {
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    const name = newName.trim() || `Profilo ${profiles.length}`;
    onSave(name);
    setNewName('');
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {profiles.map(p => (
          <button
            key={p.id}
            onClick={() => onLoad(p.id)}
            className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
              activeId === p.id
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {p.id === 'default' ? '◉ ' : ''}{p.name}
            {activeId === p.id && hasUnsavedChanges ? ' *' : ''}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {saving ? (
          <>
            <input
              type="text"
              placeholder="Nome profilo…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setSaving(false); }}
              autoFocus
              className="px-2 py-1 text-xs bg-white/5 border border-white/15 rounded-lg text-white outline-none focus:border-amber-500/50 w-36"
            />
            <button onClick={handleSave} className="px-2 py-1 text-xs bg-green-500/20 text-green-300 hover:bg-green-500/30 rounded-lg transition-colors">
              Salva
            </button>
            <button onClick={() => setSaving(false)} className="px-2 py-1 text-xs bg-white/5 text-gray-400 hover:bg-white/10 rounded-lg transition-colors">
              Annulla
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setSaving(true)}
              className="px-2.5 py-1 text-xs bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              + Salva come…
            </button>
            {activeId !== 'default' && (
              <button
                onClick={() => onDelete(activeId)}
                className="px-2.5 py-1 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
              >
                Elimina
              </button>
            )}
            <button
              onClick={onReset}
              className="px-2.5 py-1 text-xs bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              ↺ Reset Default
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── BaselinesTable ───────────────────────────────────────────────────────────

function BaselinesTable({ baselines }) {
  const funds = ['attack', 'serve', 'reception', 'defense', 'block'];
  if (!baselines) return null;

  return (
    <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 text-[10px] uppercase tracking-wide border-b border-white/5">
              <th className="text-left pb-1 pr-3">Fondamentale</th>
              <th className="text-right pb-1 pr-3">Media (µ)</th>
              <th className="text-right pb-1 pr-3">Dev. Std (σ)</th>
              <th className="text-right pb-1">Osserv.</th>
            </tr>
          </thead>
          <tbody>
            {funds.map(f => {
              const b = baselines[f];
              const anchor = baselines._fundMean || 0.30;
              const K = b?.mean > 0 ? anchor / b.mean : 1;
              return (
                <tr key={f} className="border-b border-white/5">
                  <td className="py-1.5 pr-3 font-medium" style={{ color: FUND_LABELS[f].color }}>
                    {FUND_LABELS[f].icon} {FUND_LABELS[f].label}
                  </td>
                  <td className="text-right pr-3 font-mono text-gray-300">
                    {b?.valid ? `${(b.mean * 100).toFixed(1)}%` : <span className="text-gray-600">–</span>}
                  </td>
                  <td className="text-right pr-3 font-mono text-gray-400">
                    {b?.valid ? `±${(b.std * 100).toFixed(1)}%` : <span className="text-gray-600">–</span>}
                  </td>
                  <td className="text-right font-mono text-gray-600">
                    {b?.count || 0}
                  </td>
                </tr>
              );
            })}
            {baselines._fundMean !== undefined && (
              <tr className="border-t border-white/10">
                <td className="pt-1.5 pr-3 text-gray-400 italic text-[10px]">Media fondamentali</td>
                <td className="text-right pr-3 font-mono text-amber-400 text-[10px]">
                  {(baselines._fundMean * 100).toFixed(1)}%
                </td>
                <td className="text-right pr-3"></td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
  );
}

// ─── FNCPreviewRadar ──────────────────────────────────────────────────────────

function FNCPreviewRadar({ analytics, baselines, fncConfig }) {
  const radarData = useMemo(() => {
    if (!analytics?.matchAnalytics || !baselines) return null;

    const funds = ['attack', 'serve', 'reception', 'defense', 'block'];
    const fundLabels = { attack: 'Attacco', serve: 'Battuta', reception: 'Ricezione', defense: 'Difesa', block: 'Muro' };

    // Compute raw team averages
    const sortedMA = analytics.matchAnalytics;

    return funds.map(f => {
      const rawVals = sortedMA.map(ma => ma.match.riepilogo?.team?.[f]?.efficacy || 0).filter(v => v > 0);
      const rawAvg = rawVals.length > 0 ? rawVals.reduce((s, v) => s + v, 0) / rawVals.length : 0;
      // rawAvg è in scala 0-100; normalizza a 0-1 per l'FNC (baselines in scala 0-1)
      const fncAvg = applyFNCToEfficacy(rawAvg / 100, f, baselines, fncConfig);

      return {
        fund: fundLabels[f],
        raw: +rawAvg.toFixed(1),           // già in % (0-100)
        fnc: +(fncAvg * 100).toFixed(1),   // 0-1 → 0-100%
      };
    });
  }, [analytics, baselines, fncConfig]);

  if (!radarData) return null;

  const domainMax = Math.ceil(Math.max(...radarData.flatMap(d => [d.raw, d.fnc]), 70) / 10) * 10;

  return (
    <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <PolarGrid stroke="rgba(255,255,255,0.07)" />
            <PolarAngleAxis dataKey="fund" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <PolarRadiusAxis angle={90} domain={[0, domainMax]} tick={{ fill: '#6b7280', fontSize: 8 }} tickCount={4} />
            <Radar name="Grezzo" dataKey="raw" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.15} strokeWidth={1.5} dot={{ r: 2, fill: '#38bdf8' }} />
            <Radar name="FNC" dataKey="fnc" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2} dot={{ r: 2.5, fill: '#f59e0b' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
  );
}

// ─── WeightImpactChart ────────────────────────────────────────────────────────

function WeightImpactChart({ analytics }) {
  const chartData = useMemo(() => {
    if (!analytics?.matchAnalytics) return [];
    return [...analytics.matchAnalytics]
      .sort((a, b) => (a.match.metadata?.date || '').localeCompare(b.match.metadata?.date || ''))
      .map(ma => {
        const funds = ['attack', 'serve', 'reception', 'defense', 'block'];
        const rawVals = funds.map(f => ma.match.riepilogo?.team?.[f]?.efficacy || 0).filter(v => v > 0);
        const rawTeam = rawVals.length > 0 ? rawVals.reduce((s, v) => s + v, 0) / rawVals.length * 100 : 0;
        const w = ma.matchWeight?.final || 1;
        return {
          id: ma.match.id,
          opponent: (ma.match.metadata?.opponent || 'N/D').substring(0, 12),
          date: ma.match.metadata?.date || '',
          weight: w,
          raw: +rawTeam.toFixed(1),
          weighted: +(rawTeam * w).toFixed(1),
        };
      });
  }, [analytics]);

  if (chartData.length === 0) return null;

  const getWeightColor = (w) => {
    const ratio = Math.max(0, Math.min(1, (w - 0.5) / 1.0));
    return `hsl(${(1 - ratio) * 120}, 75%, 45%)`;
  };

  return (
    <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="opponent" tick={{ fill: '#6b7280', fontSize: 9 }} angle={-18} textAnchor="end" interval={0} height={34} />
            <YAxis domain={[0.5, 1.5]} tick={{ fill: '#6b7280', fontSize: 9 }} tickFormatter={v => v.toFixed(2)} width={32} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [Number(v).toFixed(3), 'Peso CC']}
              labelFormatter={(l, p) => p?.[0]?.payload?.date ? `${l} · ${p[0].payload.date}` : l} />
            <ReferenceLine y={1} stroke="rgba(245,158,11,0.6)" strokeDasharray="4 3" />
            <Bar dataKey="weight" radius={[3, 3, 0, 0]}>
              {chartData.map(e => <Cell key={e.id} fill={getWeightColor(e.weight)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
  );
}

// ─── RawVsWeightedChart ───────────────────────────────────────────────────────

function RawVsWeightedChart({ analytics }) {
  const chartData = useMemo(() => {
    if (!analytics?.matchAnalytics) return [];
    return [...analytics.matchAnalytics]
      .sort((a, b) => (a.match.metadata?.date || '').localeCompare(b.match.metadata?.date || ''))
      .map(ma => {
        const funds = ['attack', 'serve', 'reception', 'defense', 'block'];
        const rawVals = funds.map(f => ma.match.riepilogo?.team?.[f]?.efficacy || 0).filter(v => v > 0);
        const rawTeam = rawVals.length > 0 ? rawVals.reduce((s, v) => s + v, 0) / rawVals.length * 100 : 0;
        const w = ma.matchWeight?.final || 1;
        return {
          opponent: (ma.match.metadata?.opponent || 'N/D').substring(0, 10),
          raw: +rawTeam.toFixed(1),
          weighted: +(rawTeam * w).toFixed(1),
        };
      });
  }, [analytics]);

  if (chartData.length === 0) return null;

  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="opponent" tick={{ fill: '#6b7280', fontSize: 9 }} angle={-18} textAnchor="end" interval={0} height={30} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} width={28} tickFormatter={v => `${v}%`} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, n) => [`${Number(v).toFixed(1)}%`, n === 'raw' ? 'Grezza' : 'Pesata']}
          />
          <Line type="monotone" dataKey="raw" stroke="#38bdf8" strokeWidth={1.5} dot={{ r: 2, fill: '#38bdf8' }} name="raw" />
          <Line type="monotone" dataKey="weighted" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2, fill: '#f59e0b' }} strokeDasharray="5 3" name="weighted" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function FncRawVsNormalizedChart({ analytics, baselines, fncConfig }) {
  const chartData = useMemo(() => {
    if (!analytics?.matchAnalytics || !baselines) return [];
    const funds = ['attack', 'serve', 'reception', 'defense', 'block'];
    return [...analytics.matchAnalytics]
      .sort((a, b) => (a.match.metadata?.date || '').localeCompare(b.match.metadata?.date || ''))
      .map(ma => {
        const rawVals = funds.map(f => ma.match.riepilogo?.team?.[f]?.efficacy || 0).filter(v => v > 0);
        const fncVals = funds
          .map(f => {
            const raw = ma.match.riepilogo?.team?.[f]?.efficacy || 0;
            if (raw <= 0) return 0;
            return applyFNCToEfficacy(raw, f, baselines, fncConfig);
          })
          .filter(v => v > 0);
        const rawTeam = rawVals.length ? (rawVals.reduce((s, v) => s + v, 0) / rawVals.length) * 100 : 0;
        const fncTeam = fncVals.length ? (fncVals.reduce((s, v) => s + v, 0) / fncVals.length) * 100 : rawTeam;
        return {
          opponent: (ma.match.metadata?.opponent || 'N/D').substring(0, 10),
          raw: +rawTeam.toFixed(1),
          fnc: +fncTeam.toFixed(1),
        };
      });
  }, [analytics, baselines, fncConfig]);

  if (chartData.length === 0) return null;

  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="opponent" tick={{ fill: '#6b7280', fontSize: 9 }} angle={-18} textAnchor="end" interval={0} height={30} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} width={28} tickFormatter={v => `${v}%`} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, n) => [`${Number(v).toFixed(1)}%`, n === 'raw' ? 'Grezza' : 'Normalizzata FNC']}
          />
          <Line type="monotone" dataKey="raw" stroke="#38bdf8" strokeWidth={1.5} dot={{ r: 2, fill: '#38bdf8' }} name="raw" />
          <Line type="monotone" dataKey="fnc" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2, fill: '#f59e0b' }} strokeDasharray="5 3" name="fnc" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function FncDeltaChart({ analytics, baselines, fncConfig }) {
  const chartData = useMemo(() => {
    if (!analytics?.matchAnalytics || !baselines) return [];
    const funds = ['attack', 'serve', 'reception', 'defense', 'block'];
    return [...analytics.matchAnalytics]
      .sort((a, b) => (a.match.metadata?.date || '').localeCompare(b.match.metadata?.date || ''))
      .map(ma => {
        const rawVals = funds.map(f => ma.match.riepilogo?.team?.[f]?.efficacy || 0).filter(v => v > 0);
        const fncVals = funds
          .map(f => {
            const raw = ma.match.riepilogo?.team?.[f]?.efficacy || 0;
            if (raw <= 0) return 0;
            return applyFNCToEfficacy(raw, f, baselines, fncConfig);
          })
          .filter(v => v > 0);
        const rawTeam = rawVals.length ? (rawVals.reduce((s, v) => s + v, 0) / rawVals.length) * 100 : 0;
        const fncTeam = fncVals.length ? (fncVals.reduce((s, v) => s + v, 0) / fncVals.length) * 100 : rawTeam;
        const delta = fncTeam - rawTeam;
        return {
          id: ma.match.id,
          opponent: (ma.match.metadata?.opponent || 'N/D').substring(0, 12),
          date: ma.match.metadata?.date || '',
          delta: +delta.toFixed(2),
        };
      });
  }, [analytics, baselines, fncConfig]);

  if (chartData.length === 0) return null;

  return (
    <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="opponent" tick={{ fill: '#6b7280', fontSize: 9 }} angle={-18} textAnchor="end" interval={0} height={34} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} tickFormatter={v => `${v.toFixed(0)}%`} width={36} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={v => [`${Number(v).toFixed(2)} pp`, 'Delta FNC']}
              labelFormatter={(l, p) => p?.[0]?.payload?.date ? `${l} · ${p[0].payload.date}` : l}
            />
            <ReferenceLine y={0} stroke="rgba(148,163,184,0.45)" />
            <Bar dataKey="delta" radius={[3, 3, 0, 0]}>
              {chartData.map(e => <Cell key={e.id} fill={e.delta >= 0 ? '#f59e0b' : '#38bdf8'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
  );
}

// ─── Opponent MP coefficient helpers ─────────────────────────────────────────
// Build per-match opponent mediaPond data + grand averages, given oppWeights.
// oppWeights = { reception, attack, defense, serve } — sums to 1.
// oppIntensity amplifies the deviation of the coefficient from the neutral 1.0:
//   C_eff = 1 + intensity × (C_raw − 1)
//   0 → no effect   1 → unmodified C_raw   >1 → amplified   <1 → dampened
function buildOppCoeffData(analytics, oppWeights, oppIntensity = 1) {
  if (!analytics?.matchAnalytics?.length) return [];

  const mas = analytics.matchAnalytics;

  // Per-match raw mediaPond for each fundamental (from deduced opponent stats)
  const perMatch = mas.map(ma => ({
    ma,
    serve:     ma.oppStats?.deduced?.serve?.mediaPond     || 0,
    attack:    ma.oppStats?.deduced?.attack?.mediaPond    || 0,
    defense:   ma.oppStats?.deduced?.defense?.mediaPond   || 0,
    reception: ma.oppStats?.deduced?.reception?.mediaPond || 0,
  }));

  // Grand average per fundamental (exclude zero entries)
  const avg = (key) => {
    const vals = perMatch.map(d => d[key]).filter(v => v > 0);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 1;
  };
  const avgS = avg('serve');
  const avgA = avg('attack');
  const avgD = avg('defense');
  const avgR = avg('reception');

  return [...perMatch]
    .sort((a, b) => (a.ma.match.metadata?.date || '').localeCompare(b.ma.match.metadata?.date || ''))
    .map(({ ma, serve, attack, defense, reception }) => {
      // Ratio vs grand average (1.0 = average opponent)
      const rS = avgS > 0 ? serve     / avgS : 1;
      const rA = avgA > 0 ? attack    / avgA : 1;
      const rD = avgD > 0 ? defense   / avgD : 1;
      const rR = avgR > 0 ? reception / avgR : 1;

      // Weighted composite coefficient (raw, naturally close to 1.0)
      const coeffRaw = oppWeights.serve     * rS
                     + oppWeights.attack    * rA
                     + oppWeights.defense   * rD
                     + oppWeights.reception * rR;

      // Amplify the deviation from neutral: C_eff = 1 + intensity × (C_raw − 1)
      const coeff = 1 + oppIntensity * (coeffRaw - 1);

      // Raw team performance average (same as WeightImpactChart)
      const funds = ['attack', 'serve', 'reception', 'defense', 'block'];
      const rawVals = funds.map(f => ma.match.riepilogo?.team?.[f]?.efficacy || 0).filter(v => v > 0);
      const rawTeam = rawVals.length ? rawVals.reduce((s, v) => s + v, 0) / rawVals.length * 100 : 0;

      return {
        id:        ma.match.id,
        opponent:  (ma.match.metadata?.opponent || 'N/D').substring(0, 12),
        date:      ma.match.metadata?.date || '',
        coeffRaw:  +coeffRaw.toFixed(3),
        coeff:     +coeff.toFixed(3),
        raw:       +rawTeam.toFixed(1),
        weighted:  +(rawTeam * coeff).toFixed(1),
        // per-fundamental ratios for tooltip
        rS: +rS.toFixed(2), rA: +rA.toFixed(2), rD: +rD.toFixed(2), rR: +rR.toFixed(2),
      };
    });
}

// ─── OppCoeffImpactChart ──────────────────────────────────────────────────────
function OppCoeffImpactChart({ chartData }) {
  if (!chartData.length) return null;
  const getColor = (c) => {
    const ratio = Math.max(0, Math.min(1, (c - 0.5) / 1.0));
    return `hsl(${(1 - ratio) * 120}, 75%, 45%)`;
  };
  return (
    <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="opponent" tick={{ fill: '#6b7280', fontSize: 9 }} angle={-18} textAnchor="end" interval={0} height={34} />
            <YAxis domain={[0.5, 1.5]} tick={{ fill: '#6b7280', fontSize: 9 }} tickFormatter={v => v.toFixed(2)} width={32} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, n, p) => [Number(v).toFixed(3), 'Coeff. Avv.']}
              labelFormatter={(l, p) => {
                const d = p?.[0]?.payload;
                return d ? `${l} · ${d.date}` : l;
              }}
            />
            <ReferenceLine y={1} stroke="rgba(245,158,11,0.6)" strokeDasharray="4 3" />
            <Bar dataKey="coeff" radius={[3, 3, 0, 0]}>
              {chartData.map(e => <Cell key={e.id} fill={getColor(e.coeff)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
  );
}

// ─── OppRawVsWeightedOppChart ─────────────────────────────────────────────────
function OppRawVsWeightedOppChart({ chartData }) {
  if (!chartData.length) return null;
  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="opponent" tick={{ fill: '#6b7280', fontSize: 9 }} angle={-18} textAnchor="end" interval={0} height={30} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} width={28} tickFormatter={v => `${v}%`} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, n) => [`${Number(v).toFixed(1)}%`, n === 'raw' ? 'Grezza' : 'Pesata (avv.)']}
          />
          <Line type="monotone" dataKey="raw"      stroke="#38bdf8" strokeWidth={1.5} dot={{ r: 2, fill: '#38bdf8' }} name="raw" />
          <Line type="monotone" dataKey="weighted" stroke="#a78bfa" strokeWidth={1.5} dot={{ r: 2, fill: '#a78bfa' }} strokeDasharray="5 3" name="weighted" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Interlocked slider handler ───────────────────────────────────────────────
function adjustInterlocked(prev, key, newValue) {
  const clamped   = Math.max(0, Math.min(1, newValue));
  const oldValue  = prev[key];
  const delta     = clamped - oldValue;
  const otherKeys = Object.keys(prev).filter(k => k !== key);
  const otherTot  = otherKeys.reduce((s, k) => s + prev[k], 0);

  const next = { ...prev, [key]: clamped };
  if (otherTot > 1e-6) {
    otherKeys.forEach(k => {
      next[k] = Math.max(0, prev[k] - delta * (prev[k] / otherTot));
    });
  }
  // Renormalize so sum === exactly 1
  const total = Object.values(next).reduce((s, v) => s + v, 0);
  if (total > 1e-6) Object.keys(next).forEach(k => { next[k] = next[k] / total; });
  return next;
}

// ─── Main ConfigPanel ─────────────────────────────────────────────────────────

export default function ConfigPanel({
  weights,
  onWeightsChange,
  fncConfig,
  onFncConfigChange,
  analytics,
  baselines,
  savedProfiles,
  activeProfileId,
  onProfileLoad,
  onProfileSave,
  onProfileDelete,
  onProfileReset,
  hasUnsavedChanges,
}) {
  const [activeSection, setActiveSection] = useState('opp_weights'); // 'opp_weights' | 'weights' | 'fnc'

  // ── Opponent weights ─────────────────────────────────────────────────────────
  const [oppWeights, setOppWeights] = useState({ reception: 0.25, attack: 0.25, defense: 0.25, serve: 0.25 });
  const [oppIntensity, setOppIntensity] = useState(1);
  const [oppEnabled, setOppEnabled]     = useState(true);

  // ── Pesi Partita enabled ─────────────────────────────────────────────────────
  const [weightsEnabled, setWeightsEnabled] = useState(true);

  // ── Profile picker ───────────────────────────────────────────────────────────
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [savingProfile, setSavingProfile]         = useState(false);
  const [newProfileName, setNewProfileName]       = useState('');
  const profilePickerRef = useRef(null);

  // Close profile picker on outside click
  useEffect(() => {
    if (!showProfilePicker) return;
    const handler = (e) => {
      if (profilePickerRef.current && !profilePickerRef.current.contains(e.target)) {
        setShowProfilePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfilePicker]);

  const handleOppWeightChange = (key, newValue) => {
    setOppWeights(prev => adjustInterlocked(prev, key, newValue));
  };

  const oppChartData = useMemo(
    () => buildOppCoeffData(analytics, oppWeights, oppIntensity),
    [analytics, oppWeights, oppIntensity],
  );

  const totalWeightImpact = Object.values(weights).reduce((s, v) => s + v, 0);

  const handleWeightChange = (key, value) => {
    onWeightsChange(prev => ({ ...prev, [key]: value }));
  };

  const handleFncChange = (key, value) => {
    onFncConfigChange(prev => ({ ...prev, [key]: value }));
  };

  const handleProfileSave = () => {
    const name = newProfileName.trim() || `Profilo ${savedProfiles.length}`;
    onProfileSave(name);
    setNewProfileName('');
    setSavingProfile(false);
  };

  const tabs = [
    { id: 'opp_weights', label: 'Pesi Avversari', icon: '🎯' },
    { id: 'weights',     label: 'Pesi Partita',   icon: '⚖' },
    { id: 'fnc',         label: 'FNC',             icon: '📐' },
  ];

  const hasData    = analytics?.matchAnalytics?.length > 0;
  const hasFncData = hasData && !!baselines;

  // Chart label metadata per active section
  const chartMeta = {
    opp_weights: {
      barLabel:  'Coefficiente avversario',
      barInfo: [
        { heading: 'Cosa mostra', body: 'Il coefficiente avversario calcolato per ogni partita. Verde = avversario sotto la media del campionato (contesto più facile). Rosso = avversario sopra la media (contesto difficile). La linea tratteggiata a 1.0 è il valore neutro.' },
        { heading: 'Come si calcola', body: 'C_raw = Σ(w_f × ratio_f) dove ratio_f = MP_avv / MP_media_campionato\nC_eff = 1 + incidenza × (C_raw − 1)\nI pesi w_f sono gli slider sottostanti; l\'incidenza amplifica la deviazione dal neutro.' },
      ],
      lineLabel: 'Performance grezza vs. pesata (avv.)',
      lineInfo: [
        { heading: 'Cosa mostra', body: 'Confronto tra la performance grezza della squadra (blu) e la stessa performance moltiplicata per il coefficiente avversario (viola tratteggiato). La linea viola è la performance "contestualizzata".' },
        { heading: 'Interpretazione', body: 'Linea viola sopra la blu → la partita era contro un avversario forte (performance vale di più). Linea viola sotto → avversario debole (performance vale meno).' },
      ],
      lineLegends: [
        { color: '#38bdf8', dash: false, label: 'grezza' },
        { color: '#a78bfa', dash: true,  label: 'pesata avv.' },
      ],
    },
    weights: {
      barLabel:  'Peso di contesto',
      barInfo: [
        { heading: 'Cosa mostra', body: 'Il Coefficiente di Contesto (CC) calcolato per ogni partita. Verde = partita con contesto "facile" (CC < 1). Rosso = contesto difficile (CC > 1). La linea a 1.0 è il valore neutro.' },
        { heading: 'Come si calcola', body: 'CC = 1 + Σ(w_i × F_i) dove ogni F_i è un fattore contestuale in [-1, +1]: forza avversario, performance avversario, competitività set, risultato, complessità rally. CC clampato in [0.5, 1.5].' },
      ],
      lineLabel: 'Performance grezza vs. pesata',
      lineInfo: [
        { heading: 'Cosa mostra', body: 'Confronto tra efficacia grezza (blu) e efficacia pesata per il CC (arancio). La linea arancio è quella usata nella media stagionale ponderata.' },
        { heading: 'Interpretazione', body: 'Linea arancio sopra → la partita aveva un contesto difficile, quindi pesa di più nella media. Linea arancio sotto → contesto facile, pesa meno.' },
      ],
      lineLegends: [
        { color: '#38bdf8', dash: false, label: 'grezza' },
        { color: '#f59e0b', dash: true,  label: 'pesata' },
      ],
    },
    fnc: {
      barLabel:  'Delta FNC per partita',
      barInfo: [
        { heading: 'Cosa mostra', body: 'La differenza in punti percentuali tra efficacia normalizzata FNC ed efficacia grezza per ogni partita. Barre positive (arancio) → FNC alza la scala. Barre negative (blu) → FNC abbassa la scala.' },
        { heading: 'Perché accade', body: 'Il FNC rescala i fondamentali sulla media globale. Se in una partita erano presenti molti fondamentali con scala alta (ricezione/difesa), l\'FNC tende ad abbassare; se prevalevano fondamentali con scala bassa (attacco/battuta), tende ad alzare.' },
      ],
      lineLabel: 'Grezza vs. normalizzata FNC',
      lineInfo: [
        { heading: 'Cosa mostra', body: 'Confronto tra l\'efficacia media grezza (blu) e dopo normalizzazione FNC (arancio) per ogni partita. Mostra visivamente l\'impatto del FNC partita per partita.' },
        { heading: 'Interpretazione', body: 'Linee che si sovrappongono → FNC ha poco effetto (peso basso o fondamentali già allineati). Linee distanti → FNC sta correggendo in modo significativo le scale dei fondamentali.' },
      ],
      lineLegends: [
        { color: '#38bdf8', dash: false, label: 'grezza' },
        { color: '#f59e0b', dash: true,  label: 'FNC' },
      ],
    },
  };
  const cm = chartMeta[activeSection];

  const noDataMsg = <p className="text-xs text-gray-600 italic py-3 text-center">Carica partite per vedere il grafico.</p>;

  return (
    <div className="max-w-5xl mx-auto space-y-4">

      {/* ── Fixed top section ─────────────────────────────────────────────────── */}
      <div className="glass-card p-4 space-y-3 sticky top-0 z-20">

        {/* Header: title + profile icons */}
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Config — Pesi &amp; Profili</h2>

          {/* Profile management: 3 icon buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {hasUnsavedChanges && (
              <span className="text-[10px] text-amber-400 mr-1 self-center">*</span>
            )}

            {/* 📂 Open / load profile */}
            <div className="relative" ref={profilePickerRef}>
              <button
                onClick={() => { setShowProfilePicker(p => !p); setSavingProfile(false); }}
                title="Carica profilo"
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-base transition-colors ${
                  showProfilePicker
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent'
                }`}
              >
                📂
              </button>
              {showProfilePicker && (
                <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-white/10 rounded-lg shadow-xl z-30 min-w-[160px] overflow-hidden">
                  <div className="py-1">
                    {savedProfiles.length === 0 ? (
                      <p className="text-xs text-gray-500 px-3 py-2 italic">Nessun profilo salvato</p>
                    ) : savedProfiles.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { onProfileLoad(p.id); setShowProfilePicker(false); }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          activeProfileId === p.id
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        {p.id === 'default' ? '◉ ' : ''}{p.name}
                      </button>
                    ))}
                    {/* Delete active profile (not default) */}
                    {activeProfileId && activeProfileId !== 'default' && (
                      <div className="border-t border-white/5 mt-1 pt-1">
                        <button
                          onClick={() => { onProfileDelete(activeProfileId); setShowProfilePicker(false); }}
                          className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          🗑 Elimina attivo
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 💾 Save profile */}
            <div className="relative">
              {savingProfile ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="Nome…"
                    value={newProfileName}
                    onChange={e => setNewProfileName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleProfileSave();
                      if (e.key === 'Escape') setSavingProfile(false);
                    }}
                    autoFocus
                    className="px-2 py-1 text-xs bg-white/5 border border-white/15 rounded-lg text-white outline-none focus:border-amber-500/50 w-28"
                  />
                  <button
                    onClick={handleProfileSave}
                    className="w-6 h-6 flex items-center justify-center text-green-400 hover:text-green-300 text-sm font-bold"
                  >✓</button>
                  <button
                    onClick={() => setSavingProfile(false)}
                    className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 text-sm"
                  >✗</button>
                </div>
              ) : (
                <button
                  onClick={() => { setSavingProfile(true); setShowProfilePicker(false); }}
                  title="Salva profilo"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-base bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent transition-colors"
                >
                  💾
                </button>
              )}
            </div>

            {/* ↺ Reset to default */}
            <button
              onClick={onProfileReset}
              title="Reset default"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent transition-colors"
            >
              ↺
            </button>
          </div>
        </div>

        {/* Bar chart */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{cm.barLabel}</p>
            <InfoButton label={cm.barLabel} detail={cm.barInfo} />
          </div>
          {activeSection === 'opp_weights' && (oppChartData.length > 0 ? <OppCoeffImpactChart chartData={oppChartData} /> : noDataMsg)}
          {activeSection === 'weights'     && (hasData    ? <WeightImpactChart analytics={analytics} /> : noDataMsg)}
          {activeSection === 'fnc'         && (hasFncData ? <FncDeltaChart analytics={analytics} baselines={baselines} fncConfig={fncConfig} /> : noDataMsg)}
        </div>

        {/* Line chart */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{cm.lineLabel}</p>
              <InfoButton label={cm.lineLabel} detail={cm.lineInfo} />
            </div>
            <div className="flex items-center gap-2">
              {cm.lineLegends.map(l => (
                <span key={l.label} className="text-[10px] text-gray-600 flex items-center gap-0.5">
                  <span style={{ color: l.color }}>{l.dash ? '╌' : '━'}</span> {l.label}
                </span>
              ))}
            </div>
          </div>
          {activeSection === 'opp_weights' && (oppChartData.length > 0 ? <OppRawVsWeightedOppChart chartData={oppChartData} /> : noDataMsg)}
          {activeSection === 'weights'     && (hasData    ? <RawVsWeightedChart analytics={analytics} /> : noDataMsg)}
          {activeSection === 'fnc'         && (hasFncData ? <FncRawVsNormalizedChart analytics={analytics} baselines={baselines} fncConfig={fncConfig} /> : noDataMsg)}
        </div>

        {/* Intensity slider — only shown for Pesi Avversari */}
        {activeSection === 'opp_weights' && (
          <div className="pt-2 border-t border-white/5 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">⚡</span>
                <p className="text-xs font-semibold text-amber-300">Incidenza coefficiente avversario</p>
                <InfoButton label="Incidenza coefficiente avversario" detail={[
                  { heading: 'Cosa fa', body: 'Amplifica o riduce la deviazione del coefficiente avversario dal valore neutro (1.0). Agisce su tutti i fondamentali avversari contemporaneamente.' },
                  { heading: 'Formula', body: 'C_eff = 1 + incidenza × (C_raw − 1)\n\nA 0×: C_eff = 1 sempre → il coefficiente avversario non ha effetto sulla media ponderata.\nA 1×: C_eff = C_raw → effetto base senza amplificazione.\nA 2×: la deviazione dal neutro viene raddoppiata.\nA 5×: effetto massimo, le differenze tra avversari vengono molto amplificate.' },
                  { heading: 'Esempio pratico', body: 'C_raw = 1.15 (avversario 15% sopra media)\nA incidenza 1×: C_eff = 1.15\nA incidenza 2×: C_eff = 1 + 2×(0.15) = 1.30\nA incidenza 0.5×: C_eff = 1 + 0.5×(0.15) = 1.075' },
                  { heading: 'Consiglio', body: 'Partire da 1.0. Aumentare a 1.5–2.0 se si vuole che le differenze tra avversari forti e deboli abbiano un impatto più netto sulla media stagionale.' },
                ]} />
              </div>
              <span className="text-sm font-mono font-bold text-amber-300">{oppIntensity.toFixed(1)}×</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-600 w-4">0×</span>
              <input
                type="range" min={0} max={5} step={0.1}
                value={oppIntensity}
                onChange={e => setOppIntensity(parseFloat(e.target.value))}
                className="flex-1 accent-amber-400"
              />
              <span className="text-[9px] text-gray-600 w-4 text-right">5×</span>
            </div>
            <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-amber-400 transition-all duration-150"
                style={{ width: `${(oppIntensity / 5) * 100}%`, opacity: 0.7 }} />
            </div>
            {oppChartData.length > 0 && (() => {
              const coeffs = oppChartData.map(d => d.coeff);
              return (
                <p className="text-[10px] text-gray-500">
                  Range: <span className="font-mono text-sky-400">{Math.min(...coeffs).toFixed(3)}</span>
                  {' – '}
                  <span className="font-mono text-rose-400">{Math.max(...coeffs).toFixed(3)}</span>
                  {' '}· (1.0 = neutro)
                </p>
              );
            })()}
          </div>
        )}

      </div>
      {/* ── end fixed section ── */}

      {/* ── Tabs ──────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveSection(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              activeSection === t.id
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : 'bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/8'
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Pesi Avversari ───────────────────────────────────────────────── */}
      {activeSection === 'opp_weights' && (
        <div className="glass-card p-4 space-y-4">
          {/* Header: title + toggle + reset */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-300">Peso per fondamentale avversario</h3>
              <InfoButton label="Peso per fondamentale avversario" detail={[
                { heading: 'Come funzionano gli slider', body: 'Gli slider sono interlacciati: la somma è sempre 100%. Spostando uno slider gli altri si ridistribuiscono proporzionalmente, mantenendo il peso relativo tra loro.' },
                { heading: 'Effetto sul coefficiente', body: 'C_raw = w_ric·ratio_ric + w_att·ratio_att + w_dif·ratio_dif + w_ser·ratio_ser\nDove ratio_f = MP_avv_f / MP_media_campionato_f. Più peso assegni a un fondamentale, più la forza avversaria in quel fondamentale determina il coefficiente finale.' },
                { heading: 'Consiglio', body: 'Distribuzione uniforme (25% ciascuno) è un buon default. Personalizza se ritieni che certi fondamentali avversari siano più determinanti nella tua squadra (es. dare più peso alla ricezione se la tua battuta è il punto di forza).' },
              ]} />
              <button
                onClick={() => setOppEnabled(p => !p)}
                title={oppEnabled ? 'Disabilita' : 'Abilita'}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                  oppEnabled ? 'bg-amber-500' : 'bg-gray-700'
                }`}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                  oppEnabled ? 'translate-x-5' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <button
              onClick={() => { setOppWeights({ reception: 0.25, attack: 0.25, defense: 0.25, serve: 0.25 }); setOppIntensity(1); }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 rounded hover:bg-white/5"
            >
              ↺ Reset
            </button>
          </div>

          <div className={`space-y-4 ${!oppEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
            {[
              {
                key: 'reception', label: 'Ricezione avv.', icon: '🤲', color: '#0ea5e9',
                desc: 'Quanto pesa la qualità di ricezione dell\'avversario nel coefficiente.',
                detail: [
                  { heading: 'Cosa misura', body: 'La Media Ponderata (MP) di ricezione dell\'avversario in stagione, su scala 1–5 (Volley Scout). Indica quanto bene converte il primo tocco in palla giocabile.' },
                  { heading: 'Come entra nel calcolo', body: 'ratio_ric = MP_avv / MP_media_campionato\nSe l\'avversario ha una ricezione superiore alla media del campionato, ratio > 1 → la nostra battuta ha trovato un muro più solido → contesto più difficile.' },
                  { heading: 'Interazione con gli altri pesi', body: 'C_raw = w_ric·ratio_ric + w_att·ratio_att + w_dif·ratio_dif + w_ser·ratio_ser\nQuesto slider definisce quanto la ricezione avversaria pesa nella somma. Gli altri slider si ridistribuiscono automaticamente (somma = 100%).' },
                  { heading: 'Effetto finale', body: 'C_eff = 1 + incidenza × (C_raw − 1)\nC_eff > 1 → avversario mediamente sopra la media → la performance in questo match vale di più.' },
                ],
              },
              {
                key: 'attack', label: 'Attacco avv.', icon: '⚔', color: '#f43f5e',
                desc: 'Quanto pesa l\'efficacia offensiva dell\'avversario nel coefficiente.',
                detail: [
                  { heading: 'Cosa misura', body: 'La Media Ponderata (MP) di attacco dell\'avversario in stagione (scala 1–5). Indica la capacità di chiudere i rally con punti diretti.' },
                  { heading: 'Come entra nel calcolo', body: 'ratio_att = MP_avv / MP_media_campionato\nAvversari con alto attacco rendono la nostra difesa più impegnativa e aumentano il valore del contesto.' },
                  { heading: 'Nota tattica', body: 'Un avversario forte in attacco tende a sfruttare i sistemi di cambio-palla complessi. Rally più corti ma con azioni conclusive più difficili da difendere.' },
                ],
              },
              {
                key: 'defense', label: 'Difesa avv.', icon: '🛡', color: '#10b981',
                desc: 'Quanto pesa la solidità difensiva dell\'avversario nel coefficiente.',
                detail: [
                  { heading: 'Cosa misura', body: 'La Media Ponderata (MP) di difesa dell\'avversario in stagione (scala 1–5). Indica quanto copre il campo e recupera palle difficili.' },
                  { heading: 'Come entra nel calcolo', body: 'ratio_dif = MP_avv / MP_media_campionato\nUna difesa solida prolunga i rally, rende più difficili i punti diretti in attacco e indica una squadra organizzata.' },
                  { heading: 'Effetto', body: 'Avversario con alta difesa → C_raw più alto → i nostri fondamentali in questa partita vengono valutati in un contesto più impegnativo.' },
                ],
              },
              {
                key: 'serve', label: 'Servizio avv.', icon: '🎯', color: '#8b5cf6',
                desc: 'Quanto pesa l\'aggressività al servizio dell\'avversario nel coefficiente.',
                detail: [
                  { heading: 'Cosa misura', body: 'La Media Ponderata (MP) di servizio dell\'avversario in stagione (scala 1–5). Indica la pressione costante esercitata sulla nostra ricezione.' },
                  { heading: 'Come entra nel calcolo', body: 'ratio_ser = MP_avv / MP_media_campionato\nUn servizio aggressivo mette in difficoltà la ricezione, riduce le opzioni di primo tocco e rende il sistema offensivo meno fluido.' },
                  { heading: 'Interdipendenza', body: 'Il servizio è spesso correlato alla ricezione avversaria: chi serve bene la subisce di più. Abbassare il peso servizio a favore di ricezione può essere utile se si pensa che la ricezione catturi già questo effetto.' },
                ],
              },
            ].map(({ key, label, icon, color, desc, detail }) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{icon}</span>
                    <span className="text-sm font-medium" style={{ color }}>{label}</span>
                    <InfoButton detail={detail} label={label} />
                  </div>
                  <span className="text-[11px] font-mono font-bold" style={{ color }}>
                    {(oppWeights[key] * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-600 w-4">0%</span>
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={oppWeights[key]}
                    onChange={e => handleOppWeightChange(key, parseFloat(e.target.value))}
                    className="flex-1" style={{ accentColor: color }}
                  />
                  <span className="text-[9px] text-gray-600 w-8 text-right">100%</span>
                </div>
                <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-150"
                    style={{ width: `${(oppWeights[key] * 100).toFixed(1)}%`, background: color, opacity: 0.7 }} />
                </div>
              </div>
            ))}
          </div>

          <div className={`pt-2 border-t border-white/5 flex items-center justify-between ${!oppEnabled ? 'opacity-40' : ''}`}>
            <div className="flex items-center gap-3">
              {(['reception','attack','defense','serve']).map(k => {
                const colors = { reception: '#0ea5e9', attack: '#f43f5e', defense: '#10b981', serve: '#8b5cf6' };
                const labels = { reception: 'Ric.', attack: 'Att.', defense: 'Dif.', serve: 'Serv.' };
                return (
                  <div key={k} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors[k] }} />
                    <span className="text-[10px] font-mono text-gray-400">{labels[k]} {(oppWeights[k]*100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
            <span className="text-[10px] font-mono text-green-400">
              Σ = {(Object.values(oppWeights).reduce((s,v)=>s+v,0)*100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* ── Tab: Pesi Partita ────────────────────────────────────────────────── */}
      {activeSection === 'weights' && (
        <div className="glass-card p-4 space-y-3">
          {/* Header: title + toggle + reset */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-300">Coefficiente di Contesto</h3>
              <InfoButton label="5 Fattori del Coefficiente di Contesto" detail={[
                { heading: 'Cosa fa', body: 'Il Coefficiente di Contesto (CC) modifica il peso di ogni partita nella media stagionale in base a 5 fattori contestuali. CC > 1 = partita difficile (pesa di più). CC < 1 = partita facile (pesa meno).' },
                { heading: 'Formula', body: 'CC = 1 + Σ(w_i × F_i)\ndove ogni F_i ∈ [−1, +1] e CC viene clampato in [0.5, 1.5].\nOgni slider w_i controlla quanto quel fattore contribuisce alla variazione del CC.' },
                { heading: 'I 5 fattori', body: '🏆 Forza Avv.: posizione in classifica\n📉 Perf. Avv.: errori vs media stagionale\n⚡ Competit. Set: margini dei parziali\n🎯 Risultato: 3-2 vale più di 3-0\n🔗 Complessità: lunghezza media rally' },
              ]} />
              <button
                onClick={() => setWeightsEnabled(p => !p)}
                title={weightsEnabled ? 'Disabilita' : 'Abilita'}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                  weightsEnabled ? 'bg-amber-500' : 'bg-gray-700'
                }`}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                  weightsEnabled ? 'translate-x-5' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <button
              onClick={() => onWeightsChange({ ...DEFAULT_WEIGHTS })}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 rounded hover:bg-white/5"
            >
              ↺ Reset
            </button>
          </div>

          <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-3 ${!weightsEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
            {Object.entries(WEIGHT_LABELS).map(([key, meta]) => (
              <SliderRow
                key={key}
                label={meta.short || meta.label}
                icon={meta.icon}
                value={weights[key] || 0}
                min={0}
                max={0.5}
                step={0.01}
                onChange={v => handleWeightChange(key, v)}
                compact
                info={meta.detail}
              />
            ))}
          </div>

          <div className={`pt-2 border-t border-white/5 flex items-center justify-between ${!weightsEnabled ? 'opacity-40' : ''}`}>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-gray-600">CC = 1 + Σ(w·F)</span>
              <InfoButton label="Formula CC" detail={[
                { heading: 'Formula completa', body: 'CC = 1 + Σ(w_i × F_i)\nOgni F_i è un fattore normalizzato in [−1, +1]. Il risultato viene clampato in [0.5, 1.5].' },
                { heading: 'Escursione massima', body: 'L\'escursione visualizzata (es. ±100%) è la somma di tutti i pesi w_i. Indica il range teorico massimo che il CC può raggiungere sopra o sotto 1.0 se tutti i fattori fossero al massimo contemporaneamente.' },
                { heading: 'Esempio', body: 'Con tutti i pesi a 0.25 (totale 1.25): il CC può variare da 0.5 a 1.5 (clamp). Nella pratica i fattori si compensano e la variazione reale è molto più contenuta.' },
              ]} />
            </div>
            <span className={`text-sm font-mono font-bold ${totalWeightImpact > 0.6 ? 'text-amber-400' : 'text-green-400'}`}>
              ±{(totalWeightImpact * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* ── Tab: FNC ─────────────────────────────────────────────────────────── */}
      {activeSection === 'fnc' && (
        <div className="space-y-3">
          {/* Sliders + toggle + reset */}
          <div className="glass-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-300">FNC</h3>
                <InfoButton label="Coefficiente di Normalizzazione Fondamentale" detail={[
                  { heading: 'Perché esiste', body: 'Ricezione e Difesa hanno scale intrinseche più alte (50-55%) rispetto ad Attacco/Battuta/Muro (10-30%). Senza FNC un radar con Ricezione=40% e Attacco=40% è fuorviante: attacco al 40% è eccellente, ricezione al 40% è sotto media.' },
                  { heading: 'Cosa fa', body: 'Rescala ogni fondamentale sulla stessa media globale, rendendo i confronti cross-fondamentale corretti. Agisce solo sulla visualizzazione (radar, grafici). Le medie grezze non cambiano.' },
                  { heading: 'Modalità Relativa', body: 'E_display = E_raw × [(1−w) + w × (µ_global/µ_fund)]\nPiù intuitiva: ogni scala viene moltiplicata per il rapporto con la media globale.' },
                  { heading: 'Modalità Z-Score', body: 'E_display = (1−w)×E_raw + w×[µ_global + z×σ_global]\ndove z = (E_raw − µ_fund) / σ_fund\nPiù rigorosa: ogni valore viene espresso in deviazioni standard.' },
                ]} />
                <button
                  onClick={() => handleFncChange('enabled', !fncConfig.enabled)}
                  title={fncConfig.enabled ? 'Disabilita FNC' : 'Abilita FNC'}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                    fncConfig.enabled ? 'bg-amber-500' : 'bg-gray-700'
                  }`}
                >
                  <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                    fncConfig.enabled ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              <button
                onClick={() => onFncConfigChange({ ...DEFAULT_FNC_CONFIG })}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 rounded hover:bg-white/5"
              >
                ↺ Reset
              </button>
            </div>

            <div className={`space-y-4 ${!fncConfig.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
              <SliderRow
                label="Peso FNC"
                icon="⚖"
                value={fncConfig.weight}
                min={0}
                max={1}
                step={0.05}
                format={v => `${(v * 100).toFixed(0)}%`}
                onChange={v => handleFncChange('weight', v)}
                info={[
                  { heading: 'Cosa fa questo slider', body: 'Controlla quanto la normalizzazione FNC incide sui valori visualizzati. A 0% i grafici mostrano il valore grezzo (efficacia reale). A 100% tutti i fondamentali vengono riscalati sulla stessa media globale.' },
                  { heading: 'Perché normalizzare', body: 'Ricezione e Difesa hanno scale intrinseche diverse da Attacco/Battuta/Muro. Senza FNC, confrontare 40% di Ricezione con 40% di Attacco è fuorviante: l\'attacco al 40% è eccellente, la ricezione al 40% è sotto la media.' },
                  { heading: 'Modalità Relativa', body: 'E_display = E_raw × [(1−w) + w × (µ_global / µ_fund)]\nRescala ogni fondamentale proporzionalmente al rapporto tra media globale e media del fondamentale. Più intuitiva.' },
                  { heading: 'Modalità Z-Score', body: 'E_display = (1−w)×E_raw + w×[µ_global + z×σ_global]\ndove z = (E_raw − µ_fund) / σ_fund\nEsprime ogni valore in "quante deviazioni standard" dalla media del suo fondamentale. Più rigorosa statisticamente.' },
                  { heading: 'Consiglio', body: '60–70% è un buon punto di partenza. Valori più alti rendono il radar più "giusto" ma meno aderente ai dati reali.' },
                ]}
              />

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-gray-400 font-medium">Modalità</p>
                  <InfoButton label="Modalità di normalizzazione" detail={[
                    { heading: 'Relativa', body: 'E_display = E_raw × [(1−w) + w × (µ_global/µ_fund)]\nRescala proporzionalmente ogni fondamentale alla media globale. Più intuitiva e facile da interpretare.' },
                    { heading: 'Z-Score', body: 'E_display = (1−w)×E_raw + w×[µ_global + z×σ_global]\ndove z = (E_raw − µ_fund) / σ_fund\nEsprime ogni valore in "quante σ" dalla media del fondamentale. Più rigorosa statisticamente ma meno immediata.' },
                    { heading: 'Quale scegliere', body: 'Usa Relativa se vuoi mantenere i valori su scale percentuali leggibili. Usa Z-Score se vuoi un confronto statisticamente preciso tra fondamentali con distribuzioni molto diverse.' },
                  ]} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'relative', label: 'Relativa', icon: '📏' },
                    { id: 'zscore',   label: 'Z-Score',  icon: '📊' },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => handleFncChange('mode', m.id)}
                      className={`px-3 py-2 rounded-lg border text-left transition-all flex items-center gap-1.5 text-sm font-medium ${
                        fncConfig.mode === m.id
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                          : 'bg-white/3 border-white/8 text-gray-400 hover:bg-white/8'
                      }`}
                    >
                      <span>{m.icon}</span> {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Radar preview */}
          <div className="glass-card p-3 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Radar grezzo vs. FNC</h3>
              <InfoButton label="Radar grezzo vs. FNC" detail={[
                { heading: 'Cosa mostra', body: 'Il radar confronta la media stagionale grezza di ogni fondamentale (blu) con la stessa media dopo normalizzazione FNC (arancio). Mostra visivamente quanto il FNC stia correggendo le scale.' },
                { heading: 'Legenda', body: '━ Blu: scala grezza (efficacia reale, scale diverse per fondamentale)\n╌ Arancio: scala FNC (normalizzata sulla media globale, confrontabile)' },
                { heading: 'Interpretazione', body: 'Forma blu schiacciata in ricezione/difesa e arancio più "rotondo" → il FNC sta alzando le scale basse (attacco/battuta) e abbassando quelle alte (ricezione/difesa), rendendo il radar leggibile.' },
              ]} />
              {!fncConfig.enabled && (
                <span className="text-[9px] text-amber-500/70 ml-auto">⚠ FNC off</span>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><span className="text-sky-400">━</span> grezzo</span>
                <span className="text-[9px] text-gray-600 flex items-center gap-0.5"><span className="text-amber-400">╌</span> FNC</span>
              </div>
            </div>
            {hasFncData ? (
              <FNCPreviewRadar analytics={analytics} baselines={baselines} fncConfig={fncConfig} />
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-600 text-xs italic">
                Carica almeno 3 partite.
              </div>
            )}
          </div>

          {/* Baseline table */}
          <div className="glass-card p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Baseline campionato</h3>
              <InfoButton label="Baseline del campionato" detail={[
                { heading: 'Cosa sono', body: 'Media (µ) e deviazione standard (σ) di ogni fondamentale calcolate su tutte le partite caricate. Vengono usate dal FNC per la normalizzazione.' },
                { heading: 'Perché le scale sono diverse', body: 'Ricezione/Difesa: nella formula entrano R4 e R5 come positivi, gli errori (R1) sono rari → media alta (~50-55%).\nAttacco/Battuta/Muro: conta solo il kill. La maggior parte delle azioni è neutra → media bassa (10-30%).' },
                { heading: 'Uso da parte del FNC', body: 'Modalità Relativa: µ_fund entra nel rapporto µ_global/µ_fund per rescalare.\nModalità Z-Score: µ_fund e σ_fund entrano nella formula di standardizzazione.\nLe baseline si aggiornano solo quando cambiano le partite caricate.' },
              ]} />
            </div>
            {baselines
              ? <BaselinesTable baselines={baselines} />
              : <p className="text-xs text-gray-500 italic">Carica almeno 3 partite per calcolare le baseline.</p>
            }
          </div>
        </div>
      )}

      {/* ── Note tecniche (compact chip) ─────────────────────────────────────── */}
      <div className="flex justify-end pb-1">
        <div className="flex items-center gap-1 text-[10px] text-gray-600">
          <span>Note tecniche</span>
          <InfoButton label="Note tecniche" detail={[
            { heading: 'CC formula', body: 'CC = 1 + Σ(w_i × F_i)\nF_i ∈ [−1, +1], CC clampato in [0.5, 1.5].' },
            { heading: 'FNC Relativo', body: 'E_display = E_raw × [(1−w) + w × (µ_global/µ_fund)]' },
            { heading: 'FNC Z-Score', body: 'E_display = (1−w)×E_raw + w×[µ_global + z×σ_global]\ndove z = (E_raw − µ_fund) / σ_fund' },
            { heading: 'Nota importante', body: 'Il FNC agisce solo sulla visualizzazione (radar, grafici comparativi). I trend per singolo fondamentale usano sempre la scala grezza. Le baseline si ricalcolano solo al cambio delle partite caricate.' },
          ]} />
        </div>
      </div>

    </div>
  );
}
