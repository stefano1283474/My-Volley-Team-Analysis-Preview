import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area } from 'recharts';
import { COLORS } from '../utils/constants';

export default function TeamTrends({ analytics, matches, standings }) {
  if (!analytics || matches.length < 2) {
    return (
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl font-bold text-white mb-2">Trend Squadra</h2>
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-sm">
          <div className="text-4xl mb-3">↗</div>
          <p>Servono almeno 2 partite per calcolare i trend.</p>
        </div>
      </div>
    );
  }

  const { matchAnalytics } = analytics;

  // Build timeline data
  const timelineData = useMemo(() => {
    return matchAnalytics
      .sort((a, b) => (a.match.metadata.date || '').localeCompare(b.match.metadata.date || ''))
      .map((ma, i) => {
        const team = ma.match.riepilogo?.team;
        const w = ma.matchWeight.final;
        const fw = ma.fundWeights;
        return {
          label: (ma.match.metadata.opponent || '').substring(0, 10),
          date: ma.match.metadata.date || `Match ${i + 1}`,
          weight: w,
          // Raw
          attRaw: (team?.attack?.efficacy || 0) * 100,
          serRaw: (team?.serve?.efficacy || 0) * 100,
          recRaw: (team?.reception?.efficacy || 0) * 100,
          defRaw: (team?.defense?.efficacy || 0) * 100,
          // Weighted
          attWei: (team?.attack?.efficacy || 0) * w * (fw.a || 1) * 100,
          serWei: (team?.serve?.efficacy || 0) * w * (fw.b || 1) * 100,
          recWei: (team?.reception?.efficacy || 0) * w * (fw.r || 1) * 100,
          defWei: (team?.defense?.efficacy || 0) * w * (fw.d || 1) * 100,
          // Chain stats
          sideOut: (ma.chains.sideOut.pct || 0) * 100,
          breakPoint: (ma.chains.breakPoint.pct || 0) * 100,
        };
      });
  }, [matchAnalytics]);

  // Compute team "power index" trend
  const powerData = timelineData.map((d, i) => ({
    ...d,
    powerRaw: (d.attRaw + d.serRaw + d.recRaw + d.defRaw) / 4,
    powerWeighted: (d.attWei + d.serWei + d.recWei + d.defWei) / 4,
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Trend Squadra</h2>
        <p className="text-sm text-gray-400">
          Andamento nel tempo su {matches.length} partite. Il dato contestualizzato tiene conto della forza degli avversari affrontati.
        </p>
      </div>

      {/* Power Index */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">
          Indice di Forza Squadra: <span className="text-sky-400">Dato</span> vs <span className="text-amber-400">Contestualizzato</span>
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={powerData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
            <Area type="monotone" dataKey="powerRaw" name="Dato" stroke={COLORS.raw} fill={COLORS.raw} fillOpacity={0.1} strokeWidth={2} />
            <Area type="monotone" dataKey="powerWeighted" name="Contestualizzato" stroke={COLORS.weighted} fill={COLORS.weighted} fillOpacity={0.1} strokeWidth={2} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-gray-500 mt-2">
          Se il dato contestualizzato sale ma il dato è stabile → stai migliorando davvero (nonostante avversari più forti).
          Se il dato sale ma il contestualizzato scende → il miglioramento è illusorio (avversari più deboli).
        </p>
      </div>

      {/* Per-fundamental trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FundTrendChart data={timelineData} rawKey="attRaw" weiKey="attWei" title="Attacco" color="#f43f5e" />
        <FundTrendChart data={timelineData} rawKey="serRaw" weiKey="serWei" title="Battuta" color="#8b5cf6" />
        <FundTrendChart data={timelineData} rawKey="recRaw" weiKey="recWei" title="Ricezione" color="#0ea5e9" />
        <FundTrendChart data={timelineData} rawKey="defRaw" weiKey="defWei" title="Difesa" color="#10b981" />
      </div>

      {/* Side-out and Break trends */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Side-Out e Break-Point %</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={timelineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
            <Line type="monotone" dataKey="sideOut" name="Side-Out %" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="breakPoint" name="Break-Point %" stroke="#a3e635" strokeWidth={2} dot={{ r: 3 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Context weight trend */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Peso Contesto nel Tempo</h3>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={timelineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0.5, 1.5]} />
            <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
            <Area type="monotone" dataKey="weight" name="Peso" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-gray-500 mt-2">
          Pesi medi alti = hai affrontato avversari forti o contesti difficili. Utile per contestualizzare il rendimento.
        </p>
      </div>
    </div>
  );
}

function FundTrendChart({ data, rawKey, weiKey, title, color }) {
  return (
    <div className="glass-card p-4">
      <h4 className="text-xs font-semibold mb-3" style={{ color }}>
        {title}
      </h4>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 8 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 8 }} />
          <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }} />
          <Line type="monotone" dataKey={rawKey} name="Dato" stroke={COLORS.raw} strokeWidth={1.5} dot={{ r: 2 }} opacity={0.5} />
          <Line type="monotone" dataKey={weiKey} name="Contestualizzato" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
