import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area } from 'recharts';
import { COLORS } from '../utils/constants';
import { analyzeRotationalChains } from '../utils/analyticsEngine';

// Normalise DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD for correct chronological sort
function _normDate(d) {
  if (!d) return '';
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return String(d);
}

export default function TeamTrends({ analytics, matches, standings, dataMode = 'raw' }) {
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
      .sort((a, b) => _normDate(a.match.metadata.date).localeCompare(_normDate(b.match.metadata.date)))
      .map((ma, i) => {
        const team = ma.match.riepilogo?.team;
        const w = ma.matchWeight.final;
        const fw = ma.fundWeights;
        
        // Role-specific data for this match
        const rc = analyzeRotationalChains([ma.match]);
        
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
          // Role Performance
          b1Att: (rc.rolePerformance?.B1?.attackEff || 0) * 100,
          b2Att: (rc.rolePerformance?.B2?.attackEff || 0) * 100,
          b1Rec: (rc.rolePerformance?.B1?.receptionExc || 0) * 100,
          b2Rec: (rc.rolePerformance?.B2?.receptionExc || 0) * 100,
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
          Andamento nel tempo su {matches.length} partite.
        </p>
      </div>

      {/* Power Index */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">
          Indice di Forza Squadra:{' '}
          {dataMode === 'weighted'
            ? <span className="text-amber-400">Contestualizzato</span>
            : <span className="text-sky-400">Dato Grezzo</span>}
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={powerData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
            {dataMode !== 'weighted' && (
              <Area type="monotone" dataKey="powerRaw" name="Dato" stroke={COLORS.raw} fill={COLORS.raw} fillOpacity={0.1} strokeWidth={2} />
            )}
            {dataMode !== 'raw' && (
              <Area type="monotone" dataKey="powerWeighted" name="Contestualizzato" stroke={COLORS.weighted} fill={COLORS.weighted} fillOpacity={0.1} strokeWidth={2} />
            )}
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Role Comparison Trends (B1 vs B2) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-5">
           <h3 className="text-sm font-semibold text-gray-300 mb-4">Trend Efficienza Attacco: B1 vs B2</h3>
           <ResponsiveContainer width="100%" height={220}>
             <LineChart data={timelineData}>
               <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
               <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} />
               <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0, 100]} />
               <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: 'none', borderRadius: 8, fontSize: 11 }} />
               <Line type="monotone" dataKey="b1Att" name="B1 (Attaccante)" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} />
               <Line type="monotone" dataKey="b2Att" name="B2 (Ricevitore)" stroke="#fcd34d" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
               <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
             </LineChart>
           </ResponsiveContainer>
           <p className="text-[10px] text-gray-500 mt-2 italic">B1 dovrebbe mantenere efficienza più alta e costante.</p>
        </div>

        <div className="glass-card p-5">
           <h3 className="text-sm font-semibold text-gray-300 mb-4">Trend Ricezione Eccellente: B1 vs B2</h3>
           <ResponsiveContainer width="100%" height={220}>
             <LineChart data={timelineData}>
               <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
               <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} />
               <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0, 100]} />
               <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: 'none', borderRadius: 8, fontSize: 11 }} />
               <Line type="monotone" dataKey="b2Rec" name="B2 (Specialista)" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4 }} />
               <Line type="monotone" dataKey="b1Rec" name="B1" stroke="#bae6fd" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
               <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
             </LineChart>
           </ResponsiveContainer>
           <p className="text-[10px] text-gray-500 mt-2 italic">B2 dovrebbe essere il pilastro della ricezione.</p>
        </div>
      </div>

      {/* Per-fundamental trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FundTrendChart data={timelineData} rawKey="attRaw" weiKey="attWei" title="Attacco Squadra" color="#f43f5e" dataMode={dataMode} />
        <FundTrendChart data={timelineData} rawKey="serRaw" weiKey="serWei" title="Battuta Squadra" color="#8b5cf6" dataMode={dataMode} />
        <FundTrendChart data={timelineData} rawKey="recRaw" weiKey="recWei" title="Ricezione Squadra" color="#0ea5e9" dataMode={dataMode} />
        <FundTrendChart data={timelineData} rawKey="defRaw" weiKey="defWei" title="Difesa Squadra" color="#10b981" dataMode={dataMode} />
      </div>

      {/* Side-out and Break trends */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Side-Out e Break-Point %</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={timelineData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: 'none', borderRadius: 8, fontSize: 11 }} />
            <Line type="monotone" dataKey="sideOut" name="Side-Out %" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="breakPoint" name="Break-Point %" stroke="#a3e635" strokeWidth={2} dot={{ r: 3 }} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function FundTrendChart({ data, rawKey, weiKey, title, color, dataMode = 'raw' }) {
  const activeKey   = dataMode === 'weighted' ? weiKey : rawKey;
  const activeName  = dataMode === 'weighted' ? 'Contestualizzato' : 'Dato';
  const activeColor = dataMode === 'weighted' ? color : COLORS.raw;
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
          <Tooltip contentStyle={{ background: 'rgba(17,24,39,0.95)', border: 'none', borderRadius: 8, fontSize: 10 }} />
          <Line type="monotone" dataKey={activeKey} name={activeName} stroke={activeColor} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
