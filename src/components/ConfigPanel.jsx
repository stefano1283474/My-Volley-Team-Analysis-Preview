// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Config Panel
// Gestione centralizzata di: pesi partita, FNC, profili
// ============================================================================

import React, { useState, useMemo } from 'react';
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
  opponentStrength:    { label: 'Forza Avversario (classifica)', short: 'Forza Avv.', icon: '🏆', desc: 'Avversario 1° in classifica → bonus massimo al contesto. Ultimo in classifica → penalizzazione.' },
  opponentPerformance: { label: 'Performance Avversario (errori)', short: 'Perf. Avv.', icon: '📉', desc: 'Ha giocato sopra o sotto il suo standard? Confronto errori in questa partita vs media campionato.' },
  setCompetitiveness:  { label: 'Competitività dei Set (parziali)', short: 'Competit. Set', icon: '⚡', desc: 'Set combattuti (25-23) pesano più di set a senso unico (25-15). Indica intensità del gioco.' },
  matchResult:         { label: 'Risultato Partita', short: 'Risultato', icon: '🎯', desc: 'Vittoria 3-2 sotto pressione vale più di 3-0 facile. Sconfitta 2-3 valorizza il combattere fino in fondo.' },
  chainContext:        { label: 'Complessità Rally (catene)', short: 'Complessità', icon: '🔗', desc: 'Rally lunghi → avversario organizzato → contesto più impegnativo. Influenza entro ±50%.' },
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

// ─── SliderRow ────────────────────────────────────────────────────────────────

function SliderRow({ label, desc, icon, value, min = 0, max = 0.5, step = 0.01, format, onChange, disabled, compact }) {
  const pct = format ? format(value) : `±${(value * 100).toFixed(0)}%`;
  return (
    <div className={`space-y-0.5 ${disabled ? 'opacity-40 pointer-events-none' : ''}`} title={compact && desc ? desc : undefined}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-sm">{icon}</span>}
          <label className="text-sm text-gray-200 font-medium">{label}</label>
        </div>
        <span className="text-[11px] font-mono text-amber-400 min-w-[3rem] text-right">{pct}</span>
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
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500">Baseline dal dataset caricato</p>
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
      const fncAvg = applyFNCToEfficacy(rawAvg, f, baselines, fncConfig);

      return {
        fund: fundLabels[f],
        raw: +(rawAvg * 100).toFixed(1),
        fnc: +(fncAvg * 100).toFixed(1),
      };
    });
  }, [analytics, baselines, fncConfig]);

  if (!radarData) return null;

  const domainMax = Math.ceil(Math.max(...radarData.flatMap(d => [d.raw, d.fnc]), 70) / 10) * 10;

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-gray-400">Preview radar: media squadra grezzo vs. FNC</p>
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
    <div className="space-y-2">
      <p className="text-[11px] text-gray-400">Peso contesto per partita (verde = facile, rosso = difficile)</p>
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
    <div className="space-y-2">
      <p className="text-[11px] text-gray-400">Impatto FNC per partita (positivo = scala rialzata, negativo = scala ridotta)</p>
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
    </div>
  );
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
  const [activeSection, setActiveSection] = useState('weights'); // 'weights' | 'fnc' | 'preview'

  const totalWeightImpact = Object.values(weights).reduce((s, v) => s + v, 0);

  const handleWeightChange = (key, value) => {
    onWeightsChange(prev => ({ ...prev, [key]: value }));
  };

  const handleFncChange = (key, value) => {
    onFncConfigChange(prev => ({ ...prev, [key]: value }));
  };

  const tabs = [
    { id: 'weights', label: 'Pesi Partita', icon: '⚖' },
    { id: 'fnc', label: 'Normalizzazione FNC', icon: '📐' },
    { id: 'preview', label: 'Preview Live', icon: '👁' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Config — Pesi & Profili</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Tutti i grafici, suggerimenti e dati si aggiornano in tempo reale al variare dei parametri.
          </p>
        </div>
        {hasUnsavedChanges && (
          <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
            Modifiche non salvate *
          </span>
        )}
      </div>

      {/* Profile Manager */}
      <div className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <span>🗂</span> Profili Salvati
        </h3>
        <ProfileManager
          profiles={savedProfiles}
          activeId={activeProfileId}
          onLoad={onProfileLoad}
          onSave={onProfileSave}
          onDelete={onProfileDelete}
          onReset={onProfileReset}
          hasUnsavedChanges={hasUnsavedChanges}
        />
      </div>

      {/* Sub-tabs */}
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

      {/* ── Sezione Pesi Partita ── */}
      {activeSection === 'weights' && (
        <div className="space-y-3">

          {/* 1 — Grafico a linee: performance grezza vs. pesata */}
          <div className="glass-card px-4 pt-3 pb-2">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Performance squadra — grezza vs. pesata
              </h3>
              <span className="text-[10px] text-gray-600">
                <span className="text-sky-400">━</span> grezza &nbsp;
                <span className="text-amber-400">╌</span> pesata
              </span>
            </div>
            {analytics?.matchAnalytics?.length > 0
              ? <RawVsWeightedChart analytics={analytics} />
              : <p className="text-xs text-gray-600 italic py-3">Carica partite per vedere il grafico.</p>}
          </div>

          {/* 2 — Grafico a barre: peso di contesto per partita */}
          <div className="glass-card px-4 pt-3 pb-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Peso di contesto per partita
            </h3>
            {analytics?.matchAnalytics?.length > 0
              ? <WeightImpactChart analytics={analytics} />
              : <p className="text-xs text-gray-600 italic py-3">Carica partite per vedere il grafico.</p>}
          </div>

          {/* 3 — Slider dei pesi */}
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300">5 Fattori del Coefficiente di Contesto</h3>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-gray-600">Passa il cursore per la descrizione</span>
                <button
                  onClick={() => onWeightsChange({ ...DEFAULT_WEIGHTS })}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 rounded hover:bg-white/5"
                >
                  ↺ Reset
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-3">
              {Object.entries(WEIGHT_LABELS).map(([key, meta]) => (
                <SliderRow
                  key={key}
                  label={meta.short || meta.label}
                  desc={meta.desc}
                  icon={meta.icon}
                  value={weights[key] || 0}
                  min={0}
                  max={0.5}
                  step={0.01}
                  onChange={v => handleWeightChange(key, v)}
                  compact
                />
              ))}
            </div>
            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-gray-600">CC = 1 + Σ(w_i × F_i), clampato in [0.5, 1.5]</span>
              <span className={`text-sm font-mono font-bold ${totalWeightImpact > 0.6 ? 'text-amber-400' : 'text-green-400'}`}>
                escursione max ±{(totalWeightImpact * 100).toFixed(0)}%
              </span>
            </div>
          </div>

        </div>
      )}

      {/* ── Sezione FNC ── */}
      {activeSection === 'fnc' && (
        <div className="space-y-4">
          <div className="glass-card px-4 pt-3 pb-2">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Performance squadra — grezza vs. normalizzata FNC
              </h3>
              <span className="text-[10px] text-gray-600">
                <span className="text-sky-400">━</span> grezza &nbsp;
                <span className="text-amber-400">╌</span> FNC
              </span>
            </div>
            {analytics?.matchAnalytics?.length > 0 && baselines
              ? <FncRawVsNormalizedChart analytics={analytics} baselines={baselines} fncConfig={fncConfig} />
              : <p className="text-xs text-gray-600 italic py-3">Carica partite per vedere il grafico.</p>}
          </div>

          <div className="glass-card px-4 pt-3 pb-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Delta normalizzazione FNC per partita
            </h3>
            {analytics?.matchAnalytics?.length > 0 && baselines
              ? <FncDeltaChart analytics={analytics} baselines={baselines} fncConfig={fncConfig} />
              : <p className="text-xs text-gray-600 italic py-3">Carica partite per vedere il grafico.</p>}
          </div>

          {/* Riga 1: controlli + radar preview */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* FNC controls */}
            <div className="glass-card p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                📐 Coefficiente di Normalizzazione Fondamentale
              </h3>

              {/* Enable / Disable toggle */}
              <div className="flex items-center justify-between py-2 border border-white/8 rounded-lg px-3">
                <div>
                  <p className="text-sm text-gray-200 font-medium">FNC Abilitato</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Normalizza le scale di Ricezione/Difesa rispetto ad Attacco/Battuta/Muro
                    per confronti cross-fondamentale corretti.
                  </p>
                </div>
                <button
                  onClick={() => handleFncChange('enabled', !fncConfig.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    fncConfig.enabled ? 'bg-amber-500' : 'bg-gray-700'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    fncConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <SliderRow
                label="Peso FNC (intensità normalizzazione)"
                desc="0% = scala grezza invariata; 100% = completamente normalizzato. 60% è un buon punto di partenza."
                icon="⚖"
                value={fncConfig.weight}
                min={0}
                max={1}
                step={0.05}
                format={v => `${(v * 100).toFixed(0)}%`}
                onChange={v => handleFncChange('weight', v)}
                disabled={!fncConfig.enabled}
              />

              {/* Mode selector */}
              <div className={`space-y-2 ${!fncConfig.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                <p className="text-sm text-gray-200 font-medium">Modalità normalizzazione</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'relative', label: 'Relativa', icon: '📏', desc: 'Rescala la media di ogni fondamentale alla stessa media globale. Più intuitiva.' },
                    { id: 'zscore',   label: 'Z-Score',  icon: '📊', desc: 'Esprime ogni valore in deviazioni standard dalla media del fondamentale. Più rigorosa statisticamente.' },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => handleFncChange('mode', m.id)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        fncConfig.mode === m.id
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                          : 'bg-white/3 border-white/8 text-gray-400 hover:bg-white/8'
                      }`}
                    >
                      <div className="flex items-center gap-1 text-sm font-medium mb-1">
                        <span>{m.icon}</span> {m.label}
                      </div>
                      <p className="text-[10px] leading-relaxed">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => onFncConfigChange({ ...DEFAULT_FNC_CONFIG })}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 rounded hover:bg-white/5"
              >
                ↺ Reset FNC default
              </button>
            </div>

            {/* FNC Preview Radar — feedback visivo immediato dell'effetto FNC */}
            <div className="glass-card p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-300">Effetto FNC — Radar media squadra</h3>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Mostra in tempo reale come cambiano le scale dei fondamentali con i parametri FNC correnti.
                  <span className="text-sky-400"> Blu</span> = valori grezzi &nbsp;·&nbsp;
                  <span className="text-amber-400"> Arancio</span> = dopo FNC.
                </p>
              </div>
              {analytics?.matchAnalytics?.length > 0 && baselines ? (
                <FNCPreviewRadar analytics={analytics} baselines={baselines} fncConfig={fncConfig} />
              ) : (
                <div className="flex items-center justify-center h-48 text-gray-600 text-xs italic">
                  Carica almeno 3 partite per vedere l'effetto FNC.
                </div>
              )}
              {!fncConfig.enabled && (
                <p className="text-[10px] text-amber-500/70 text-center">
                  ⚠ FNC disabilitato — i valori Blu e Arancio coincidono.
                </p>
              )}
            </div>
          </div>

          {/* Riga 2: baseline table (larghezza piena) */}
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Baseline del campionato (dal dataset)</h3>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div>
                {baselines ? (
                  <BaselinesTable baselines={baselines} />
                ) : (
                  <p className="text-xs text-gray-500 italic">
                    Carica almeno 3 partite per calcolare le baseline.
                  </p>
                )}
              </div>
              <div className="text-[10px] text-gray-500 space-y-1.5 leading-relaxed">
                <p className="text-amber-400 text-[11px] font-medium">Perché le scale sono diverse?</p>
                <p>
                  <span className="text-sky-400">Ricezione/Difesa:</span> nella formula entrano sia R4 che R5 come positivi,
                  gli errori (R1) sono rari → media intrinsecamente alta (~50-55%).
                </p>
                <p>
                  <span className="text-sky-400">Attacco/Battuta/Muro:</span> conta solo il valore estremo (kill vs errore).
                  La maggior parte delle azioni è neutra → media intrinsecamente bassa (10-30%).
                </p>
                <p className="text-amber-400/70 pt-1 border-t border-white/5">
                  Senza FNC, un radar con Ricezione=40% e Attacco=40% è fuorviante:
                  Attacco al 40% è eccellente, Ricezione al 40% è sotto la media.
                  L'FNC corregge questo bias riallineando tutte le scale sulla media globale.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sezione Preview Live — Sintesi effetto combinato CC + FNC ── */}
      {activeSection === 'preview' && (
        <div className="space-y-4">

          {/* Banner esplicativo */}
          <div className="glass-card px-4 py-3 border border-amber-500/15">
            <p className="text-xs text-amber-300 font-medium mb-1">👁 Preview Live — Effetto combinato dei due sistemi</p>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Questa vista mostra come i due sistemi di correzione agiscono <em>insieme</em> sui dati.
              Il <span className="text-amber-400">Coefficiente di Contesto (CC)</span> rivaluta le performance in base alla difficoltà della partita.
              Il <span className="text-amber-400">FNC</span> corregge il bias di scala tra fondamentali diversi.
              I grafici qui rispecchiano i parametri correnti di entrambi i tab — variano in tempo reale.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Grafico 1: performance grezza vs pesata (effetto CC) */}
            <div className="glass-card px-4 pt-3 pb-2">
              <div className="mb-2">
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                  Effetto CC — Performance grezza vs. pesata per contesto
                </h3>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Come i pesi partita modificano la performance media squadra in ogni match.
                  <span className="text-sky-400"> Blu</span> = grezza ·
                  <span className="text-amber-400"> Tratteggio</span> = pesata CC.
                </p>
              </div>
              {analytics?.matchAnalytics?.length > 0
                ? <RawVsWeightedChart analytics={analytics} />
                : <p className="text-xs text-gray-600 italic py-6 text-center">Carica partite per vedere il grafico.</p>}
            </div>

            {/* Grafico 2: peso di contesto per partita */}
            <div className="glass-card px-4 pt-3 pb-2">
              <div className="mb-2">
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                  Peso di contesto (CC) per partita
                </h3>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  CC {'>'} 1.0 = partita difficile (performance rivalutate) ·
                  CC {'<'} 1.0 = partita facile (performance ridimensionate).
                  <span className="text-green-400"> Verde</span> = facile ·
                  <span className="text-red-400"> Rosso</span> = difficile.
                </p>
              </div>
              {analytics?.matchAnalytics?.length > 0
                ? <WeightImpactChart analytics={analytics} />
                : <p className="text-xs text-gray-600 italic py-6 text-center">Carica partite per vedere il grafico.</p>}
            </div>

            {/* Grafico 3: radar FNC (effetto FNC) */}
            <div className="glass-card p-4 xl:col-span-2">
              <div className="mb-2">
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                  Effetto FNC — Radar fondamentali (media stagione)
                </h3>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Visualizza il riallineamento delle scale prodotto dall'FNC sulla media di stagione.
                  <span className="text-sky-400"> Blu</span> = valori grezzi ·
                  <span className="text-amber-400"> Arancio</span> = dopo FNC.
                  {!fncConfig.enabled && <span className="text-amber-500/70"> (FNC disabilitato — le due linee coincidono)</span>}
                </p>
              </div>
              {analytics?.matchAnalytics?.length > 0 && baselines
                ? <FNCPreviewRadar analytics={analytics} baselines={baselines} fncConfig={fncConfig} />
                : <p className="text-xs text-gray-600 italic py-6 text-center">Carica almeno 3 partite per vedere la preview FNC.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Formula recap */}
      <div className="glass-card p-4 text-[10px] text-gray-500 space-y-1 leading-relaxed">
        <p className="text-xs text-gray-400 font-medium mb-2">Note tecniche</p>
        <p>• CC formula: <span className="font-mono text-amber-400/80">CC = 1 + Σ(w_i × F_i)</span>, ogni F_i in [-1, +1], CC clampato in [0.5, 1.5].</p>
        <p>• FNC relativo: <span className="font-mono text-amber-400/80">E_display = E_raw × [(1-w) + w × (µ_global/µ_fund)]</span></p>
        <p>• FNC z-score: <span className="font-mono text-amber-400/80">E_display = (1-w)×E_raw + w×[µ_global + z×σ_global]</span>, con z=(E_raw-µ_fund)/σ_fund</p>
        <p>• Il FNC agisce solo sulla <em>visualizzazione</em> (radar, confronti cross-fondamentale). I trend single-fondamentale usano sempre la scala grezza.</p>
        <p>• Le baseline vengono ricalcolate solo quando cambiano le partite caricate, non quando cambiano i pesi o il FNC.</p>
      </div>
    </div>
  );
}
