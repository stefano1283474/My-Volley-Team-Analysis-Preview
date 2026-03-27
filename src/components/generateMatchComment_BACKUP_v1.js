function generateMatchComment(selectedMatchMA, selectedOppAgg, seasonTeamAvg, seasonAgg, activeOpponent, lineMode = 'attitude', matchAnalytics = [], standings = null) {
  if (!selectedMatchMA || !selectedOppAgg) return null;

  const match = selectedMatchMA.match;
  const team = match?.riepilogo?.team;
  const oppName = match?.metadata?.opponent || 'Avversario';

  if (!team) return null;

  // Pre-compute attitude values using the correct formulas (matching computeAggregatedScout)
  // so that when lineMode === 'attitude', teamMetricPct uses proper AI Score formulas
  const attitudeValues = computeAttitude(match);

  const safeN = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const toPct = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  };

  // metricLabel used in comment text (e.g. "efficienza", "efficacia", "AI Score", ...)
  const metricLabel = {
    efficienza: 'efficienza',
    efficacia:  'efficacia',
    attitude:   'AI Score',
    mediaPond:  'media ponderata',
    mediaPct:   'Media %',
  }[lineMode] || 'efficienza';

  // teamMetricPct: computes the selected metric for our team's raw data
  // fundKey determines formula symmetry with computeAggregatedScout
  const teamMetricPct = (data, metric = null, fundKey = null) => {
    const resolvedMetric = metric ?? lineMode;
    if (!data || typeof data !== 'object') return null;
    const total = Number(data.tot || 0);
    const kill = Number(data.kill || 0);
    const pos  = Number(data.pos  || 0);
    const err = Number(data.err || 0);
    const neg = Number(data.neg || 0);
    if (Number.isFinite(total) && total > 0) {
      const isDefRec = fundKey === 'defense' || fundKey === 'reception';
      if (resolvedMetric === 'efficacy' || resolvedMetric === 'efficacia') {
        return isDefRec ? ((kill + pos) / total) * 100 : (kill / total) * 100;
      }
      if (resolvedMetric === 'mediaPct') {
        // (kill − err) / tot for serve/attack; (kill+pos − err) / tot for def/rec
        return isDefRec
          ? ((kill + pos - err) / total) * 100
          : ((kill - err) / total) * 100;
      }
      if (resolvedMetric === 'mediaPond') {
        // 1–5 weighted average
        const exc = Number(data.exc || 0);
        const mp = (1*err + 2*neg + 3*exc + 4*pos + 5*kill) / total;
        return Number.isFinite(mp) ? mp : null;
      }
      if (resolvedMetric === 'attitude') {
        // Use pre-computed attitude from computeAttitude() which mirrors
        // the opponent formulas in computeAggregatedScout:
        //   Serve:     (B5+B4)/tot
        //   Attack:    context-aware weighted from rally quartine
        //   Defense:   (D5+D4+D3)/tot
        //   Reception: (R5+R4+R3)/tot
        if (attitudeValues && Number.isFinite(attitudeValues[fundKey])) {
          return attitudeValues[fundKey] * 100;
        }
        // Fallback if computeAttitude returned null for this fundamental:
        // use the attitude-equivalent formulas directly from raw data
        const exc = Number(data.exc || 0);
        return isDefRec
          ? ((kill + pos + exc) / total) * 100
          : ((kill + pos) / total) * 100;
      }
      // default: efficiency
      // defense/reception = (D4+D5 − D1)/tot; serve/attack = (B5/A5 − B1/A1 − B2/A2)/tot
      return isDefRec
        ? ((kill + pos - err) / total) * 100
        : ((kill - err - neg) / total) * 100;
    }
    return toPct(data?.[resolvedMetric]);
  };

  // oppMetricPct: returns opponent value for the selected metric from agg data
  const oppMetricPct = (oppData, fundKey) => {
    if (!oppData) return null;
    if (lineMode === 'efficacia' || lineMode === 'efficacy') return toPct(oppData.efficacy);
    if (lineMode === 'mediaPct') {
      const isDefRec = fundKey === 'defense' || fundKey === 'reception';
      if (isDefRec) {
        const t = oppData.total || 0;
        return t > 0 ? ((oppData['val4+5'] - oppData.val1) / t) * 100 : null;
      }
      const t = oppData.total || 0;
      return t > 0 ? ((oppData.val5 - oppData.val1) / t) * 100 : null;
    }
    if (lineMode === 'mediaPond') return toPct(oppData.mediaPond);
    if (lineMode === 'attitude') return toPct(oppData.attitude); // already 0-1 → toPct gives 0-100
    // default: efficiency
    return toPct(oppData.efficiency);
  };
  const sections = [];

  // ─── SECTION 1: RISULTATO ─────────────────────────────────────────────────
  const sets = match?.sets || [];
  const setsWon = sets.filter(s => s.won).length;
  const setsLost = sets.filter(s => !s.won).length;
  const won = setsWon > setsLost;
  const setsDetail = sets.map(s => `${s.ourScore}-${s.theirScore}`).join(' / ');
  const resultItems = [];

  resultItems.push({
    text: `${won ? 'Vittoria' : 'Sconfitta'} ${setsWon}-${setsLost} contro ${oppName}${setsDetail ? ` (${setsDetail})` : ''}.`,
    positive: won,
    tooltip: sets.length > 0 ? {
      label: 'Dettaglio set',
      values: sets.map(s => `Set ${s.number}: ${s.ourScore}-${s.theirScore} (${s.won ? 'vinto' : 'perso'})`)
    } : null
  });

  // Competitive sets
  const tightSets = sets.filter(s => Math.abs((s.ourScore || 0) - (s.theirScore || 0)) <= 3);
  if (tightSets.length > 0) {
    resultItems.push({
      text: `Set combattut${tightSets.length === 1 ? 'o' : 'i'}: ${tightSets.map(s => `Set ${s.number} (${s.ourScore}-${s.theirScore})`).join(', ')}.`,
      positive: null,
      tooltip: null
    });
  }

  sections.push({ id: 'result', title: 'Risultato', color: 'indigo', items: resultItems });

  // ─── SECTION 2: ANALISI FONDAMENTALI ─────────────────────────────────────
  const fundDefs = [
    { key: 'attack',    label: 'Attacco',   abbrev: 'A' },
    { key: 'serve',     label: 'Battuta',   abbrev: 'B' },
    { key: 'reception', label: 'Ricezione', abbrev: 'R' },
    { key: 'defense',   label: 'Difesa',    abbrev: 'D' },
  ];

  const fundGaps = [];
  for (const fd of fundDefs) {
    const ourData = team?.[fd.key];
    const oppData = selectedOppAgg?.[fd.key];
    if (!ourData || !oppData) continue;

    // Primary metric (selected by user via lineMode)
    const ourEff = teamMetricPct(ourData, null, fd.key);
    const oppEff = oppMetricPct(oppData, fd.key);
    // Secondary metrics always shown in tooltip
    const ourEfficiency = teamMetricPct(ourData, 'efficiency', fd.key);
    const oppEfficiency = toPct(oppData.efficiency);
    const ourEfficacy = teamMetricPct(ourData, 'efficacy', fd.key);
    const oppEfficacy = toPct(oppData.efficacy);
    const seasonAvg = seasonTeamAvg?.[fd.key];

    if (ourEff !== null && oppEff !== null) {
      const gap = ourEff - oppEff;
      const isMediaPond = lineMode === 'mediaPond';
      const valFmt = (v) => isMediaPond ? Number(v).toFixed(2) : `${Number(v).toFixed(1)}%`;
      const tooltipVals = [
        `${metricLabel.charAt(0).toUpperCase() + metricLabel.slice(1)} Noi: ${valFmt(ourEff)} | Avv.: ${valFmt(oppEff)}`,
        `Differenza: ${gap > 0 ? '+' : ''}${isMediaPond ? gap.toFixed(2) : gap.toFixed(1) + '%'}`,
      ];
      // Always show efficiency + efficacy as reference in tooltip
      if (ourEfficiency !== null && oppEfficiency !== null) {
        tooltipVals.push(`Efficienza Noi: ${ourEfficiency.toFixed(1)}% | Avv.: ${oppEfficiency.toFixed(1)}%`);
      }
      if (ourEfficacy !== null && oppEfficacy !== null) {
        tooltipVals.push(`Efficacia Noi: ${ourEfficacy.toFixed(1)}% | Avv.: ${oppEfficacy.toFixed(1)}%`);
      }
      if (seasonAvg?.efficiency !== null && Number.isFinite(seasonAvg?.efficiency)) {
        tooltipVals.push(`Nostra media stagionale (eff.): ${Number(seasonAvg.efficiency).toFixed(1)}%`);
      }
      // Raw counts
      if (ourData.kill !== undefined) {
        tooltipVals.push(`Noi: ${ourData.kill}k / ${ourData.err || 0}e / ${ourData.tot}tot`);
      }
      if (fd.key === 'defense' || fd.key === 'reception') {
        if (oppData['val4+5'] !== undefined) {
          tooltipVals.push(`Avv.: ${oppData['val4+5']}pos / ${oppData.val1}e / ${oppData.total}tot`);
        }
      } else if (oppData.val5 !== undefined) {
        tooltipVals.push(`Avv.: ${oppData.val5}k / ${oppData.val1}e / ${oppData.total}tot`);
      }
      fundGaps.push({ ...fd, ourEff, oppEff, gap, ourEfficacy, oppEfficacy, tooltipVals });
    }
  }

  fundGaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  const isMediaPondComment = lineMode === 'mediaPond';
  // Thresholds: mediaPond uses 0.3/0.15/0.05 (1–5 scale); others use 15/8/2 (%)
  const threshBig  = isMediaPondComment ? 0.30 : 15;
  const threshMed  = isMediaPondComment ? 0.15 : 8;
  const threshSm   = isMediaPondComment ? 0.05 : 2;
  const gapFmt = (v) => isMediaPondComment ? (v > 0 ? '+' : '') + v.toFixed(2) : (v > 0 ? '+' : '') + v.toFixed(1) + '%';

  const fundItems = [];
  for (const fg of fundGaps) {
    let qualifier = '';
    if (Math.abs(fg.gap) >= threshBig) qualifier = 'netto vantaggio';
    else if (Math.abs(fg.gap) >= threshMed) qualifier = 'vantaggio significativo';
    else if (Math.abs(fg.gap) >= threshSm) qualifier = 'lieve vantaggio';
    else qualifier = 'equilibrio';

    let text = '';
    // Check if absolute efficacy tells a different story than the selected metric
    const absConflict = fg.ourEfficacy !== null && fg.oppEfficacy !== null
      && ((fg.gap < -threshSm && fg.ourEfficacy > fg.oppEfficacy + 3)
        || (fg.gap > threshSm && fg.oppEfficacy > fg.ourEfficacy + 3));

    if (fg.gap > threshSm) {
      text = `${fg.label}: ${qualifier} nostro (${gapFmt(fg.gap)} ${metricLabel}) — ${
        fg.key === 'attack' ? 'abbiamo attaccato meglio dell\'avversario' :
        fg.key === 'serve'  ? 'la nostra battuta ha creato più problemi' :
        fg.key === 'reception' ? 'ricezione più solida rispetto all\'avversario' :
        'difesa più efficiente dell\'avversario'
      }.`;
      if (absConflict) {
        text += ` (Nota: efficacia grezza avversaria ${fg.oppEfficacy.toFixed(1)}% vs nostra ${fg.ourEfficacy.toFixed(1)}% — il ${metricLabel} pesa fattori contestuali oltre il dato grezzo.)`;
      }
    } else if (fg.gap < -threshSm) {
      qualifier = qualifier.replace('vantaggio', 'svantaggio');
      if (absConflict) {
        // Our absolute efficacy was better but AI Score says worse → clarify
        text = `${fg.label}: ${qualifier} nel ${metricLabel} (${gapFmt(fg.gap)}) — ${
          fg.key === 'attack' ? `l'avversario ha ottenuto un ${metricLabel} superiore, ma in efficacia grezza noi ${fg.ourEfficacy.toFixed(1)}% vs loro ${fg.oppEfficacy.toFixed(1)}%` :
          fg.key === 'serve'  ? `la battuta di ${oppName} ha un ${metricLabel} superiore, ma efficacia grezza noi ${fg.ourEfficacy.toFixed(1)}% vs loro ${fg.oppEfficacy.toFixed(1)}%` :
          fg.key === 'reception' ? `la ricezione avversaria ha un ${metricLabel} superiore, ma efficacia grezza noi ${fg.ourEfficacy.toFixed(1)}% vs loro ${fg.oppEfficacy.toFixed(1)}%` :
          `la difesa di ${oppName} ha un ${metricLabel} superiore, ma efficacia grezza noi ${fg.ourEfficacy.toFixed(1)}% vs loro ${fg.oppEfficacy.toFixed(1)}%`
        }.`;
      } else {
        text = `${fg.label}: ${qualifier} (${gapFmt(fg.gap)} ${metricLabel}) — ${
          fg.key === 'attack' ? `l'avversario ha attaccato meglio di noi` :
          fg.key === 'serve'  ? `la battuta di ${oppName} più incisiva della nostra` :
          fg.key === 'reception' ? `la ricezione avversaria ha retto meglio della nostra` :
          `la difesa di ${oppName} più solida della nostra`
        }.`;
      }
    } else {
      text = `${fg.label}: sostanziale ${qualifier} tra le due squadre (${gapFmt(fg.gap)}).`;
    }

    fundItems.push({
      text,
      positive: fg.gap > threshSm ? true : fg.gap < -threshSm ? false : null,
      highlight: Math.abs(fg.gap) >= threshMed,
      tooltip: { label: `${fg.label} — Dati`, values: fg.tooltipVals }
    });
  }

  if (fundItems.length > 0) {
    sections.push({ id: 'fundamentals', title: 'Analisi Fondamentali', color: 'violet', items: fundItems });
  }

  // ─── SECTION 3: ANALISI PER ROTAZIONE ────────────────────────────────────
  const rotItems = [];
  const riepilogoRotations = match?.riepilogo?.rotations || [];
  const giocoData = match?.gioco;

  // Per-rotation points balance from Riepilogo
  if (riepilogoRotations.length > 0) {
    const rotWithBalance = riepilogoRotations
      .map(r => ({
        ...r,
        made: safeN(r.pointsMade?.total),
        lost: safeN(r.pointsLost?.total),
        total: safeN(r.totalPoints?.total),
        balance: safeN(r.pointsMade?.total) - safeN(r.pointsLost?.total),
        ratio: safeN(r.totalPoints?.total) > 0
          ? safeN(r.pointsMade?.total) / safeN(r.totalPoints?.total)
          : 0
      }))
      .filter(r => r.total > 0)
      .sort((a, b) => b.ratio - a.ratio);

    if (rotWithBalance.length >= 2) {
      const best = rotWithBalance[0];
      const worst = rotWithBalance[rotWithBalance.length - 1];

      rotItems.push({
        text: `Rotazione P${best.rotation} più efficace nel gioco (${best.made} punti fatti / ${best.lost} persi, bilancio ${best.balance > 0 ? '+' : ''}${best.balance}).`,
        positive: true,
        tooltip: {
          label: `P${best.rotation} — Punti`,
          values: [
            `Punti fatti: ${best.made} (${(best.ratio * 100).toFixed(0)}%)`,
            `Punti persi: ${best.lost}`,
            `Totale palloni giocati: ${best.total}`,
            `Bilancio: ${best.balance > 0 ? '+' : ''}${best.balance}`,
            best.lineup ? `Formazione: ${best.lineup}` : null,
          ].filter(Boolean)
        }
      });

      rotItems.push({
        text: `Rotazione P${worst.rotation} più critica (${worst.made} punti fatti / ${worst.lost} persi, bilancio ${worst.balance > 0 ? '+' : ''}${worst.balance}).`,
        positive: false,
        tooltip: {
          label: `P${worst.rotation} — Punti`,
          values: [
            `Punti fatti: ${worst.made} (${(worst.ratio * 100).toFixed(0)}%)`,
            `Punti persi: ${worst.lost}`,
            `Totale palloni giocati: ${worst.total}`,
            `Bilancio: ${worst.balance > 0 ? '+' : ''}${worst.balance}`,
            worst.lineup ? `Formazione: ${worst.lineup}` : null,
          ].filter(Boolean)
        }
      });
    }
  }

  // Reception by rotation from Gioco sheet
  if (giocoData?.receptionByRotation?.length > 0) {
    const recByRot = giocoData.receptionByRotation
      .filter(r => safeN(r.total) > 0)
      .map(r => ({
        ...r,
        perfPos: (safeN(r.R5) + safeN(r.R4)),
        perfPosPct: safeN(r.total) > 0 ? (safeN(r.R5) + safeN(r.R4)) / safeN(r.total) * 100 : 0,
        errPct: safeN(r.total) > 0 ? safeN(r.R1) / safeN(r.total) * 100 : 0,
      }))
      .sort((a, b) => b.perfPosPct - a.perfPosPct);

    if (recByRot.length >= 1) {
      const bestRec = recByRot[0];
      const worstRec = recByRot[recByRot.length - 1];

      rotItems.push({
        text: `Ricezione più efficace in ${bestRec.rotation}: ${bestRec.perfPosPct.toFixed(0)}% perf./pos. (${safeN(bestRec.R5)}×R5 + ${safeN(bestRec.R4)}×R4 su ${safeN(bestRec.total)} ric.).`,
        positive: true,
        tooltip: {
          label: `Ricezione ${bestRec.rotation}`,
          values: [
            `R5 (perfetta): ${safeN(bestRec.R5)}`,
            `R4 (positiva): ${safeN(bestRec.R4)}`,
            `R3 (neutra): ${safeN(bestRec.R3)}`,
            `R2 (negativa): ${safeN(bestRec.R2)}`,
            `R1 (errore): ${safeN(bestRec.R1)}`,
            `Totale: ${safeN(bestRec.total)}`,
            `% perf./pos.: ${bestRec.perfPosPct.toFixed(1)}%`,
          ]
        }
      });

      if (recByRot.length >= 2 && worstRec.rotation !== bestRec.rotation) {
        rotItems.push({
          text: `Ricezione più difficoltosa in ${worstRec.rotation}: solo ${worstRec.perfPosPct.toFixed(0)}% perf./pos., ${worstRec.errPct.toFixed(0)}% errori (${safeN(worstRec.R1)} err su ${safeN(worstRec.total)} ric.).`,
          positive: false,
          tooltip: {
            label: `Ricezione ${worstRec.rotation}`,
            values: [
              `R5 (perfetta): ${safeN(worstRec.R5)}`,
              `R4 (positiva): ${safeN(worstRec.R4)}`,
              `R3 (neutra): ${safeN(worstRec.R3)}`,
              `R2 (negativa): ${safeN(worstRec.R2)}`,
              `R1 (errore): ${safeN(worstRec.R1)}`,
              `Totale: ${safeN(worstRec.total)}`,
              `% perf./pos.: ${worstRec.perfPosPct.toFixed(1)}%`,
            ]
          }
        });
      }
    }
  }

  // Serving/receiving rotation matchups from rally data
  const rallies = match?.rallies || [];
  if (rallies.length > 0) {
    const servingByRot = {};
    const receivingByRot = {};

    for (const r of rallies) {
      if (!r.rotation) continue;
      const rotKey = `P${r.rotation}`;
      if (r.phase === 'b') {
        if (!servingByRot[rotKey]) servingByRot[rotKey] = { total: 0, won: 0 };
        servingByRot[rotKey].total++;
        if (r.isPoint) servingByRot[rotKey].won++;
      } else if (r.phase === 'r') {
        if (!receivingByRot[rotKey]) receivingByRot[rotKey] = { total: 0, won: 0 };
        receivingByRot[rotKey].total++;
        if (r.isPoint) receivingByRot[rotKey].won++;
      }
    }

    const servArr = Object.entries(servingByRot)
      .map(([rot, d]) => ({ rot, ...d, pct: d.total > 0 ? d.won / d.total * 100 : 0 }))
      .filter(d => d.total >= 3)
      .sort((a, b) => b.pct - a.pct);

    const recArr = Object.entries(receivingByRot)
      .map(([rot, d]) => ({ rot, ...d, pct: d.total > 0 ? d.won / d.total * 100 : 0 }))
      .filter(d => d.total >= 3)
      .sort((a, b) => b.pct - a.pct);

    if (servArr.length >= 1) {
      const bestServ = servArr[0];
      const worstServ = servArr[servArr.length - 1];

      rotItems.push({
        text: `Incastro favorevole al servizio: nostra rotazione ${bestServ.rot} → ${bestServ.won}/${bestServ.total} punti (${bestServ.pct.toFixed(0)}% break point). La battuta ha messo in difficoltà la ricezione avversaria in questa fase.`,
        positive: true,
        tooltip: {
          label: `Break point — rotazione ${bestServ.rot}`,
          values: [
            `Punti conquistati: ${bestServ.won} / ${bestServ.total}`,
            `% break point: ${bestServ.pct.toFixed(1)}%`,
            `Fase: noi al servizio (BP)`,
            ...servArr.slice(0, 4).map(d => `${d.rot}: ${d.won}/${d.total} (${d.pct.toFixed(0)}%)`),
          ]
        }
      });

      if (servArr.length >= 2 && worstServ.pct < 45 && worstServ.rot !== bestServ.rot) {
        rotItems.push({
          text: `Incastro critico al servizio: nostra rotazione ${worstServ.rot} → solo ${worstServ.won}/${worstServ.total} punti (${worstServ.pct.toFixed(0)}% BP). ${oppName} ha gestito bene la nostra battuta in questa rotazione.`,
          positive: false,
          tooltip: {
            label: `Break point critico — rotazione ${worstServ.rot}`,
            values: [
              `Punti conquistati: ${worstServ.won} / ${worstServ.total}`,
              `% break point: ${worstServ.pct.toFixed(1)}%`,
              `Fase: noi al servizio (BP)`,
            ]
          }
        });
      }
    }

    if (recArr.length >= 1) {
      const bestRec = recArr[0];
      const worstRec = recArr[recArr.length - 1];

      if (bestRec.pct >= 55) {
        rotItems.push({
          text: `Side-out efficace: nostra rotazione in ricezione ${bestRec.rot} → ${bestRec.won}/${bestRec.total} punti (${bestRec.pct.toFixed(0)}%). Buona risposta alla battuta di ${oppName} in questa fase.`,
          positive: true,
          tooltip: {
            label: `Side-out — rotazione ${bestRec.rot}`,
            values: [
              `Punti: ${bestRec.won} / ${bestRec.total}`,
              `% SO: ${bestRec.pct.toFixed(1)}%`,
              `Fase: noi in ricezione (SO)`,
              ...recArr.slice(0, 4).map(d => `${d.rot}: ${d.won}/${d.total} (${d.pct.toFixed(0)}%)`),
            ]
          }
        });
      }

      if (recArr.length >= 2 && worstRec.pct < 45 && worstRec.rot !== bestRec.rot) {
        rotItems.push({
          text: `Side-out difficoltoso: nostra rotazione ${worstRec.rot} in ricezione → solo ${worstRec.won}/${worstRec.total} punti (${worstRec.pct.toFixed(0)}%). La battuta di ${oppName} ha creato problemi in questa rotazione.`,
          positive: false,
          tooltip: {
            label: `Side-out critico — rotazione ${worstRec.rot}`,
            values: [
              `Punti: ${worstRec.won} / ${worstRec.total}`,
              `% SO: ${worstRec.pct.toFixed(1)}%`,
              `Fase: noi in ricezione (SO)`,
            ]
          }
        });
      }
    }

    // ─── NEW: Tactical Role & Attacker Configuration Analysis ───
    const rc = analyzeRotationalChains([match]);
    if (rc.rolePerformance?.B1 && rc.rolePerformance?.B2) {
      const b1 = rc.rolePerformance.B1;
      const b2 = rc.rolePerformance.B2;
      const attGap = (b1.attackEff - b2.attackEff) * 100;
      if (Math.abs(attGap) >= 10) {
        rotItems.push({
          text: `Profilo tattico bande: ${attGap > 0 ? 'B1' : 'B2'} ha dominato in attacco (${Math.round(Math.max(b1.attackEff, b2.attackEff)*100)}% eff.), mentre ${attGap > 0 ? 'B2' : 'B1'} ha garantito equilibrio ${b2.receptionExc > 0.3 ? 'in ricezione' : ''}.`,
          positive: true,
          tooltip: {
             label: 'Confronto B1 vs B2 (Attacco)',
             values: [
               `B1: ${Math.round(b1.attackEff*100)}% eff. / ${b1.totals.attack} att.`,
               `B2: ${Math.round(b2.attackEff*100)}% eff. / ${b2.totals.attack} att.`,
               `Delta: ${attGap > 0 ? '+' : ''}${Math.round(attGap)}% per B1`,
             ]
          }
        });
      }
    }

    const att3 = rc.attackerModes?.['3att']?.sideOut || 0;
    const att2 = rc.attackerModes?.['2att']?.sideOut || 0;
    if (att3 > att2 + 0.15) {
      rotItems.push({
        text: `Configurazione offensiva: Netto vantaggio con 3 attaccanti in prima linea (${Math.round(att3*100)}% SO) rispetto a 2 (${Math.round(att2*100)}%). Sfruttare maggiormente le rotazioni P1/P6/P5.`,
        positive: true,
        tooltip: {
          label: 'Efficacia Side-Out per configurazione',
          values: [
            `3 Attaccanti (P1, P6, P5): ${Math.round(att3*100)}%`,
            `2 Attaccanti (P2, P3, P4): ${Math.round(att2*100)}%`,
          ]
        }
      });
    }
  }

  if (rotItems.length > 0) {
    sections.push({ id: 'rotations', title: 'Incastri di Rotazione', color: 'amber', items: rotItems });
  }

  // ─── SECTION 4: CATENA DEL GIOCO ─────────────────────────────────────────
  const chainItems = [];

  if (giocoData?.attackFromReception) {
    const afr = giocoData.attackFromReception;

    const calcChain = (data) => {
      if (!data || data.length === 0) return null;
      const totalAtt = data.reduce((s, d) => s + safeN(d.attacks), 0);
      if (totalAtt === 0) return null;
      const totalKills = data.reduce((s, d) => {
        const m = String(d.pointsStr || '').match(/(\d+)/);
        return s + (m ? parseInt(m[1]) : 0);
      }, 0);
      return {
        totalAtt, totalKills,
        killPct: totalAtt > 0 ? totalKills / totalAtt * 100 : 0,
        roles: data.filter(d => d.role && d.attacks > 0).map(d => `${d.role}: ${d.attacks} att.`),
      };
    };

    const chainR5 = calcChain(afr.R5);
    const chainR4 = calcChain(afr.R4);
    const chainR3 = calcChain(afr.R3);

    if (chainR5 && chainR5.totalAtt > 0) {
      chainItems.push({
        text: `Da ricezione perfetta (R5): ${chainR5.totalKills} kill su ${chainR5.totalAtt} attacchi → kill rate ${chainR5.killPct.toFixed(0)}%. ${chainR5.killPct >= 40 ? 'Ottima conversione da ottima ricezione.' : chainR5.killPct >= 28 ? 'Conversione nella norma.' : 'Margine di miglioramento nella finalizzazione.'}`,
        positive: chainR5.killPct >= 35,
        tooltip: {
          label: 'Attacco da R5 (ricezione perfetta)',
          values: [
            `Kill: ${chainR5.totalKills} / ${chainR5.totalAtt} attacchi`,
            `Kill rate: ${chainR5.killPct.toFixed(1)}%`,
            ...chainR5.roles,
          ]
        }
      });
    }

    if (chainR4 && chainR4.totalAtt > 0) {
      chainItems.push({
        text: `Da ricezione positiva (R4): ${chainR4.totalKills} kill su ${chainR4.totalAtt} attacchi → kill rate ${chainR4.killPct.toFixed(0)}%.`,
        positive: chainR4.killPct >= 28,
        tooltip: {
          label: 'Attacco da R4 (ricezione positiva)',
          values: [
            `Kill: ${chainR4.totalKills} / ${chainR4.totalAtt} attacchi`,
            `Kill rate: ${chainR4.killPct.toFixed(1)}%`,
            ...chainR4.roles,
          ]
        }
      });
    }

    if (chainR5 && chainR4 && chainR5.totalAtt > 0 && chainR4.totalAtt > 0) {
      const delta = chainR5.killPct - chainR4.killPct;
      if (Math.abs(delta) >= 8) {
        // A positive delta (R5 > R4) is physiological — it's expected that better reception leads to better attack.
        // Only flag as truly negative (▼) if the drop is extreme (>25%), otherwise neutral or positive.
        const isExcessiveDrop = delta > 25;
        chainItems.push({
          text: `Impatto qualità ricezione sull'attacco: ${Math.abs(delta).toFixed(0)}% di differenza tra R5 e R4 → ${
            delta > 0
              ? (isExcessiveDrop
                ? 'calo significativo dalla ricezione imprecisa, la qualità della palla di prima influisce molto sull\'efficacia offensiva'
                : 'calo fisiologico dalla ricezione imprecisa, impatto nella norma')
              : 'l\'attacco mantiene efficienza anche da ricezione non perfetta'
          }.`,
          positive: delta <= 0 ? true : (isExcessiveDrop ? false : null),
          tooltip: {
            label: 'Delta R5→R4 (attacco)',
            values: [
              `Kill rate da R5: ${chainR5.killPct.toFixed(1)}%`,
              `Kill rate da R4: ${chainR4.killPct.toFixed(1)}%`,
              `Differenza: ${delta > 0 ? '-' : '+'}${Math.abs(delta).toFixed(1)}% da R4`,
            ]
          }
        });
      }
    }

    if (chainR3 && chainR3.totalAtt > 0) {
      chainItems.push({
        text: `Da ricezione neutra (R3): ${chainR3.totalKills} kill su ${chainR3.totalAtt} attacchi (${chainR3.killPct.toFixed(0)}%). ${chainR3.killPct < 20 ? 'Elevata difficoltà nella costruzione da ricezione neutra.' : 'Buona gestione anche in condizioni di ricezione imperfetta.'}`,
        positive: chainR3.killPct >= 20,
        tooltip: {
          label: 'Attacco da R3 (ricezione neutra)',
          values: [
            `Kill: ${chainR3.totalKills} / ${chainR3.totalAtt} attacchi`,
            `Kill rate: ${chainR3.killPct.toFixed(1)}%`,
            ...chainR3.roles,
          ]
        }
      });
    }
  }

  // Side-out vs break-point overall from rallies
  if (rallies.length > 0) {
    const soRallies = rallies.filter(r => r.phase === 'r');
    const bpRallies = rallies.filter(r => r.phase === 'b');
    const soWon = soRallies.filter(r => r.isPoint).length;
    const bpWon = bpRallies.filter(r => r.isPoint).length;
    const soPct = soRallies.length > 0 ? soWon / soRallies.length * 100 : null;
    const bpPct = bpRallies.length > 0 ? bpWon / bpRallies.length * 100 : null;

    if (soPct !== null && bpPct !== null && soRallies.length >= 5 && bpRallies.length >= 5) {
      const soBetter = soPct > bpPct;
      chainItems.push({
        text: `Fase dominante: ${soBetter ? 'side-out in ricezione' : 'break point al servizio'} (${Math.max(soPct, bpPct).toFixed(0)}% punti vinti). La fase ${soBetter ? 'al servizio' : 'in ricezione'} è risultata più critica (${Math.min(soPct, bpPct).toFixed(0)}%).`,
        positive: null,
        tooltip: {
          label: 'Side-out vs Break-point',
          values: [
            `Side-out (in ric.): ${soWon}/${soRallies.length} = ${soPct.toFixed(1)}%`,
            `Break-point (al serv.): ${bpWon}/${bpRallies.length} = ${bpPct.toFixed(1)}%`,
            `Fase dominante: ${soBetter ? 'SO' : 'BP'}`,
          ]
        }
      });
    }
  }

  if (chainItems.length > 0) {
    sections.push({ id: 'chain', title: 'Catena del Gioco', color: 'emerald', items: chainItems });
  }

  // ─── SECTION: PERFORMANCE CONTESTUALE (Team e Avversario vs media) ──────
  const perfItems = [];

  // Helper: compute a single fundamental metric for a given raw-data object
  const metricFromRaw = (data, fundKey) => {
    if (!data || typeof data !== 'object') return null;
    const total = Number(data.tot || 0);
    if (!Number.isFinite(total) || total <= 0) return null;
    return teamMetricPct(data, null, fundKey);
  };

  // Map lineMode → seasonTeamAvg property
  const perfAvgKey = { efficienza: 'efficiency', efficacia: 'efficacy', mediaPond: 'mediaPond', mediaPct: 'mediaPct', attitude: 'attitude' }[lineMode] || 'efficiency';

  // --- Nostra squadra vs media stagionale ---
  if (seasonTeamAvg) {
    const teamDeltas = [];
    for (const fd of fundDefs) {
      const matchVal = metricFromRaw(team?.[fd.key], fd.key);
      const avgVal = seasonTeamAvg?.[fd.key]?.[perfAvgKey];
      if (matchVal !== null && Number.isFinite(avgVal)) {
        teamDeltas.push({ ...fd, matchVal, avgVal, delta: matchVal - avgVal });
      }
    }
    if (teamDeltas.length > 0) {
      const overPerf = teamDeltas.filter(d => d.delta > (isMediaPondComment ? 0.1 : 3));
      const underPerf = teamDeltas.filter(d => d.delta < -(isMediaPondComment ? 0.1 : 3));
      if (overPerf.length > 0 || underPerf.length > 0) {
        const avgDelta = teamDeltas.reduce((s, d) => s + d.delta, 0) / teamDeltas.length;
        const overallLabel = avgDelta > (isMediaPondComment ? 0.05 : 2) ? 'sopra la media stagionale' : avgDelta < -(isMediaPondComment ? 0.05 : 2) ? 'sotto la media stagionale' : 'in linea con la media stagionale';
        perfItems.push({
          text: `La nostra squadra ha giocato complessivamente ${overallLabel}.${overPerf.length > 0 ? ` Sopra media in: ${overPerf.map(d => d.label).join(', ')}.` : ''}${underPerf.length > 0 ? ` Sotto media in: ${underPerf.map(d => d.label).join(', ')}.` : ''}`,
          positive: avgDelta > 0,
          tooltip: {
            label: `Nostra squadra vs media stagionale (${metricLabel})`,
            values: teamDeltas.map(d => `${d.label}: ${isMediaPondComment ? d.matchVal.toFixed(2) : d.matchVal.toFixed(1) + '%'} vs media ${isMediaPondComment ? d.avgVal.toFixed(2) : d.avgVal.toFixed(1) + '%'} (${d.delta > 0 ? '+' : ''}${isMediaPondComment ? d.delta.toFixed(2) : d.delta.toFixed(1) + '%'})`)
          }
        });
      }
    }
  }

  // --- Avversario vs sua media stagionale ---
  if (seasonAgg && selectedOppAgg) {
    const oppFundKeys = [
      { key: 'serve', label: 'Battuta' },
      { key: 'attack', label: 'Attacco' },
      { key: 'defense', label: 'Difesa' },
      { key: 'reception', label: 'Ricezione' },
    ];
    const oppAvgMetricKey = lineMode === 'efficacia' || lineMode === 'efficacy' ? 'efficacy'
      : lineMode === 'mediaPond' ? 'mediaPond'
      : lineMode === 'mediaPct' ? 'mediaPct'
      : lineMode === 'attitude' ? 'attitude'
      : 'efficiency';
    const oppDeltas = [];
    for (const fd of oppFundKeys) {
      const matchOpp = selectedOppAgg?.[fd.key]?.[oppAvgMetricKey];
      const seasonOpp = seasonAgg?.[fd.key]?.[oppAvgMetricKey];
      if (Number.isFinite(matchOpp) && Number.isFinite(seasonOpp)) {
        const mV = toPct(matchOpp);
        const sV = toPct(seasonOpp);
        if (mV !== null && sV !== null) {
          oppDeltas.push({ ...fd, matchVal: isMediaPondComment ? matchOpp : mV, avgVal: isMediaPondComment ? seasonOpp : sV, delta: (isMediaPondComment ? matchOpp : mV) - (isMediaPondComment ? seasonOpp : sV) });
        }
      }
    }
    if (oppDeltas.length > 0) {
      const avgOppDelta = oppDeltas.reduce((s, d) => s + d.delta, 0) / oppDeltas.length;
      const oppOverall = avgOppDelta > (isMediaPondComment ? 0.05 : 2) ? 'ha sovra-performato' : avgOppDelta < -(isMediaPondComment ? 0.05 : 2) ? 'ha sotto-performato' : 'ha giocato in linea con la sua media';
      const oppOver = oppDeltas.filter(d => d.delta > (isMediaPondComment ? 0.1 : 3));
      const oppUnder = oppDeltas.filter(d => d.delta < -(isMediaPondComment ? 0.1 : 3));
      perfItems.push({
        text: `${oppName} ${oppOverall} rispetto alla propria media stagionale.${oppOver.length > 0 ? ` Sopra media in: ${oppOver.map(d => d.label).join(', ')}.` : ''}${oppUnder.length > 0 ? ` Sotto media in: ${oppUnder.map(d => d.label).join(', ')}.` : ''}`,
        positive: avgOppDelta < 0, // opponent under-performing is positive for us
        tooltip: {
          label: `${oppName} vs media stagionale (${metricLabel})`,
          values: oppDeltas.map(d => `${d.label}: ${isMediaPondComment ? d.matchVal.toFixed(2) : d.matchVal.toFixed(1) + '%'} vs media ${isMediaPondComment ? d.avgVal.toFixed(2) : d.avgVal.toFixed(1) + '%'} (${d.delta > 0 ? '+' : ''}${isMediaPondComment ? d.delta.toFixed(2) : d.delta.toFixed(1) + '%'})`)
        }
      });
    }
  }

  if (perfItems.length > 0) {
    sections.push({ id: 'performance', title: 'Performance Contestuale', color: 'cyan', items: perfItems });
  }

  // ─── SECTION: AVVERSARIO VS STIMA CLASSIFICA ──────────────────────────
  const stimaItems = [];
  if (standings && standings.length >= 2 && matchAnalytics.length > 0) {
    const expectedMP = computeExpectedMP(standings, matchAnalytics);
    const oppClean = oppName.replace(/^\([AR]\)\s*/i, '').trim();
    const expectedForOpp = expectedMP[oppName] || expectedMP[oppClean] ||
      Object.entries(expectedMP).find(([k]) => areTeamNamesLikelySame(k, oppClean))?.[1];

    if (expectedForOpp) {
      const oppFunds = [
        { key: 'serve', label: 'Battuta', oppKey: 'serve' },
        { key: 'attack', label: 'Attacco', oppKey: 'attack' },
        { key: 'defense', label: 'Difesa', oppKey: 'defense' },
        { key: 'reception', label: 'Ricezione', oppKey: 'reception' },
      ];
      const deltas = [];
      for (const fd of oppFunds) {
        const estimated = expectedForOpp[fd.key];
        const actual = selectedOppAgg?.[fd.oppKey]?.mediaPond;
        if (Number.isFinite(estimated) && Number.isFinite(actual)) {
          deltas.push({ ...fd, estimated, actual, delta: actual - estimated });
        }
      }
      if (deltas.length > 0) {
        const overEst = deltas.filter(d => d.delta > 0.1);
        const underEst = deltas.filter(d => d.delta < -0.1);
        const avgDelta = deltas.reduce((s, d) => s + d.delta, 0) / deltas.length;
        const overallLabel = avgDelta > 0.05 ? 'sopra la stima di classifica' : avgDelta < -0.05 ? 'sotto la stima di classifica' : 'in linea con la stima';

        stimaItems.push({
          text: `${oppName} ha giocato complessivamente ${overallLabel}.${overEst.length > 0 ? ` Sopra stima in: ${overEst.map(d => `${d.label} (+${d.delta.toFixed(2)} MP)`).join(', ')}.` : ''}${underEst.length > 0 ? ` Sotto stima in: ${underEst.map(d => `${d.label} (${d.delta.toFixed(2)} MP)`).join(', ')}.` : ''}`,
          positive: avgDelta < 0, // opponent below estimated is good for us
          tooltip: {
            label: `${oppName} — Stima vs Reale (Media Ponderata)`,
            values: deltas.map(d => `${d.label}: reale ${d.actual.toFixed(2)} vs stimato ${d.estimated.toFixed(2)} (${d.delta > 0 ? '+' : ''}${d.delta.toFixed(2)})`)
          }
        });

        // Detail: which fundamentals the opponent over/under-performed
        for (const d of deltas) {
          if (Math.abs(d.delta) >= 0.15) {
            const isOver = d.delta > 0;
            stimaItems.push({
              text: `${d.label} avversaria: ${isOver ? 'sopra' : 'sotto'} la stima di classifica di ${Math.abs(d.delta).toFixed(2)} MP — ${isOver ? 'prestazione superiore alle attese, attenzione per il ritorno' : 'prestazione inferiore alle attese, possibile miglioramento futuro'}.`,
              positive: !isOver,
              tooltip: { label: `${d.label} — dettaglio`, values: [`Reale: ${d.actual.toFixed(2)} MP`, `Stimato: ${d.estimated.toFixed(2)} MP`, `Delta: ${d.delta > 0 ? '+' : ''}${d.delta.toFixed(2)}`] }
            });
          }
        }
      }
    }
  }
  if (stimaItems.length > 0) {
    sections.push({ id: 'oppEstimate', title: 'Avversario vs Stima Classifica', color: 'orange', items: stimaItems });
  }

  // ─── SECTION: CONFRONTO CROSS-FONDAMENTALI ────────────────────────────
  const crossItems = [];
  {
    // Battuta Avv vs Ricezione Team e viceversa
    const crossPairs = [
      { ourKey: 'reception', oppKey: 'serve', ourLabel: 'Ricezione Team', oppLabel: 'Battuta Avversario', narrative: 'battuta avversaria vs nostra ricezione' },
      { ourKey: 'serve', oppKey: 'reception', ourLabel: 'Battuta Team', oppLabel: 'Ricezione Avversario', narrative: 'nostra battuta vs ricezione avversaria' },
      { ourKey: 'defense', oppKey: 'attack', ourLabel: 'Difesa Team', oppLabel: 'Attacco Avversario', narrative: 'attacco avversario vs nostra difesa' },
      { ourKey: 'attack', oppKey: 'defense', ourLabel: 'Attacco Team', oppLabel: 'Difesa Avversario', narrative: 'nostro attacco vs difesa avversaria' },
    ];

    for (const cp of crossPairs) {
      const ourMatchVal = metricFromRaw(team?.[cp.ourKey], cp.ourKey);
      const ourAvg = seasonTeamAvg?.[cp.ourKey]?.[perfAvgKey];
      const oppMatchVal = oppMetricPct(selectedOppAgg?.[cp.oppKey], cp.oppKey);
      const oppAvg = seasonAgg?.[cp.oppKey]?.[lineMode === 'efficacia' ? 'efficacy' : lineMode === 'mediaPond' ? 'mediaPond' : lineMode === 'attitude' ? 'attitude' : 'efficiency'];
      const oppAvgPct = toPct(oppAvg);

      if (ourMatchVal !== null && oppMatchVal !== null) {
        const ourDelta = (ourAvg !== null && Number.isFinite(ourAvg)) ? ourMatchVal - ourAvg : null;
        const oppDelta = (oppAvgPct !== null && Number.isFinite(oppAvgPct)) ? oppMatchVal - (isMediaPondComment ? oppAvg : oppAvgPct) : null;

        let assessment = '';
        if (ourDelta !== null && oppDelta !== null) {
          // Use ±3% threshold (or ±0.1 for mediaPond), aligned with PERFORMANCE CONTESTUALE individual thresholds
          const ourBetter = ourDelta > (isMediaPondComment ? 0.1 : 3);
          const ourWorse = ourDelta < -(isMediaPondComment ? 0.1 : 3);
          const oppBetter = oppDelta > (isMediaPondComment ? 0.1 : 3);
          const oppWorse = oppDelta < -(isMediaPondComment ? 0.1 : 3);

          if (cp.ourKey === 'reception' || cp.ourKey === 'defense') {
            // We are the defending side
            if (oppBetter && ourWorse) assessment = `Incastro sfavorevole: ${cp.oppLabel} sopra la propria media stagionale e ${cp.ourLabel} sotto la propria media stagionale.`;
            else if (oppWorse && ourBetter) assessment = `Incastro favorevole: ${cp.oppLabel} sotto la propria media stagionale e ${cp.ourLabel} sopra la propria media stagionale.`;
            else if (oppBetter && !ourWorse) assessment = `${cp.oppLabel} sopra la propria media stagionale, ma ${cp.ourLabel} ha retto.`;
            else if (ourWorse && !oppBetter) assessment = `${cp.ourLabel} sotto la propria media stagionale nonostante ${cp.oppLabel} nella norma.`;
          } else {
            // We are the attacking side
            if (ourBetter && oppWorse) assessment = `Incastro favorevole: ${cp.ourLabel} sopra la propria media stagionale e ${cp.oppLabel} sotto la propria.`;
            else if (ourWorse && oppBetter) assessment = `Incastro sfavorevole: ${cp.ourLabel} sotto la propria media stagionale contro ${cp.oppLabel} sopra la propria.`;
            else if (ourBetter && !oppWorse) assessment = `${cp.ourLabel} sopra media, ha superato ${cp.oppLabel} nella norma.`;
            else if (ourWorse && !oppBetter) assessment = `${cp.ourLabel} sotto la propria media stagionale nonostante ${cp.oppLabel} nella norma.`;
          }
        }

        if (assessment) {
          const valFmt = (v) => isMediaPondComment ? Number(v).toFixed(2) : `${Number(v).toFixed(1)}%`;
          crossItems.push({
            text: `${cp.narrative.charAt(0).toUpperCase() + cp.narrative.slice(1)}: ${assessment}`,
            positive: assessment.includes('favorevole') || (assessment.includes('sopra media') && !assessment.includes('sfavorevole')),
            tooltip: {
              label: cp.narrative,
              values: [
                `${cp.ourLabel}: ${valFmt(ourMatchVal)}${ourDelta !== null ? ` (vs media: ${ourDelta > 0 ? '+' : ''}${isMediaPondComment ? ourDelta.toFixed(2) : ourDelta.toFixed(1) + '%'})` : ''}`,
                `${cp.oppLabel}: ${valFmt(oppMatchVal)}${oppDelta !== null ? ` (vs media: ${oppDelta > 0 ? '+' : ''}${isMediaPondComment ? oppDelta.toFixed(2) : oppDelta.toFixed(1) + '%'})` : ''}`,
              ]
            }
          });
        }
      }
    }
  }
  if (crossItems.length > 0) {
    sections.push({ id: 'crossFund', title: 'Confronto Cross-Fondamentali', color: 'fuchsia', items: crossItems });
  }

  // ─── SECTION: PROTAGONISTI DELLA PARTITA ────────────────────────────────
  const playerItems = [];

  // Gather player data: merge playerStats, playerReception, playerDefense
  const pStats = match?.riepilogo?.playerStats || [];
  const pRec = match?.riepilogo?.playerReception || [];
  const pDef = match?.riepilogo?.playerDefense || [];
  const roster = match?.roster || [];

  // Compute player season averages from matchAnalytics
  const playerSeasonAvg = {};
  if (matchAnalytics.length > 1) {
    const playerAccum = {}; // { playerNumber: { serve: [], attack: [], defense: [], reception: [] } }
    for (const ma of matchAnalytics) {
      if (ma.match?.id === match?.id) continue; // exclude current match for comparison
      const ps = ma.match?.riepilogo?.playerStats || [];
      const pr = ma.match?.riepilogo?.playerReception || [];
      const pd = ma.match?.riepilogo?.playerDefense || [];
      for (const p of ps) {
        if (!p.number) continue;
        if (!playerAccum[p.number]) playerAccum[p.number] = { name: p.name, serve: [], attack: [], defense: [], reception: [] };
        const pn = playerAccum[p.number];
        // compute metric for each fundamental
        const sv = p.serve; const at = p.attack;
        if (sv?.tot > 0) pn.serve.push(teamMetricPct(sv, null, 'serve'));
        if (at?.tot > 0) pn.attack.push(teamMetricPct(at, null, 'attack'));
      }
      for (const p of pr) {
        if (!p.number || !playerAccum[p.number]) {
          if (p.number && !playerAccum[p.number]) playerAccum[p.number] = { name: p.name, serve: [], attack: [], defense: [], reception: [] };
          else continue;
        }
        if (p.tot > 0) playerAccum[p.number].reception.push(teamMetricPct(p, null, 'reception'));
      }
      for (const p of pd) {
        if (!p.number || !playerAccum[p.number]) {
          if (p.number && !playerAccum[p.number]) playerAccum[p.number] = { name: p.name, serve: [], attack: [], defense: [], reception: [] };
          else continue;
        }
        if (p.tot > 0) playerAccum[p.number].defense.push(teamMetricPct(p, null, 'defense'));
      }
    }
    // Compute averages
    for (const [num, acc] of Object.entries(playerAccum)) {
      const avg = {};
      for (const f of ['serve', 'attack', 'defense', 'reception']) {
        const vals = acc[f].filter(v => v !== null && Number.isFinite(v));
        avg[f] = vals.length >= 2 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      }
      avg.name = acc.name;
      playerSeasonAvg[num] = avg;
    }
  }

  // Build per-player performance scores for this match
  const playerPerf = [];
  for (const p of pStats) {
    if (!p.number) continue;
    const recData = pRec.find(r => r.number === p.number);
    const defData = pDef.find(d => d.number === p.number);
    const avg = playerSeasonAvg[p.number];
    const rosterEntry = roster.find(r => r.number === p.number);
    const role = rosterEntry?.role || '';
    const nick = rosterEntry?.nickname || (p.name || '').trim().split(/\s+/)[0] || p.number;
    const deltas = [];

    const fundMap = [
      { key: 'serve', label: 'Battuta', data: p.serve },
      { key: 'attack', label: 'Attacco', data: p.attack },
      { key: 'reception', label: 'Ricezione', data: recData },
      { key: 'defense', label: 'Difesa', data: defData },
    ];

    for (const fm of fundMap) {
      const matchVal = fm.data?.tot > 0 ? teamMetricPct(fm.data, null, fm.key) : null;
      const avgVal = avg?.[fm.key];
      if (matchVal !== null && avgVal !== null && Number.isFinite(avgVal)) {
        deltas.push({ key: fm.key, label: fm.label, matchVal, avgVal, delta: matchVal - avgVal, tot: fm.data?.tot || 0 });
      }
    }

    const significantDeltas = deltas.filter(d => d.tot >= 3); // at least 3 actions
    const avgDelta = significantDeltas.length > 0 ? significantDeltas.reduce((s, d) => s + d.delta, 0) / significantDeltas.length : 0;
    const totalActions = fundMap.reduce((s, fm) => s + (fm.data?.tot || 0), 0);

    playerPerf.push({ number: p.number, name: p.name, nick, role, deltas: significantDeltas, avgDelta, totalActions, points: p.points });
  }

  // Sort by average delta to find best/worst performers
  const rankedPlayers = playerPerf.filter(p => p.deltas.length > 0 && p.totalActions >= 5).sort((a, b) => b.avgDelta - a.avgDelta);

  if (rankedPlayers.length > 0) {
    // Best player
    const best = rankedPlayers[0];
    if (best.avgDelta > (isMediaPondComment ? 0.05 : 1)) {
      const bestFunds = best.deltas.filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta);
      playerItems.push({
        text: `Best performer: ${best.nick} (#${best.number}) — ha giocato ${isMediaPondComment ? 'significativamente' : best.avgDelta > (isMediaPondComment ? 0.3 : 10) ? 'molto' : ''} sopra la propria media${bestFunds.length > 0 ? `, soprattutto in ${bestFunds.slice(0, 2).map(d => d.label.toLowerCase()).join(' e ')}` : ''}.`,
        positive: true,
        tooltip: {
          label: `${best.nick} — dettaglio performance`,
          values: best.deltas.map(d => `${d.label}: ${isMediaPondComment ? d.matchVal.toFixed(2) : d.matchVal.toFixed(1) + '%'} vs media ${isMediaPondComment ? d.avgVal.toFixed(2) : d.avgVal.toFixed(1) + '%'} (${d.delta > 0 ? '+' : ''}${isMediaPondComment ? d.delta.toFixed(2) : d.delta.toFixed(1) + '%'})`)
        }
      });
    }

    // Worst player
    const worst = rankedPlayers[rankedPlayers.length - 1];
    if (worst.avgDelta < -(isMediaPondComment ? 0.05 : 1) && worst.number !== best.number) {
      const worstFunds = worst.deltas.filter(d => d.delta < 0).sort((a, b) => a.delta - b.delta);
      playerItems.push({
        text: `Sottotono: ${worst.nick} (#${worst.number}) — ha giocato sotto la propria media${worstFunds.length > 0 ? `, in particolare in ${worstFunds.slice(0, 2).map(d => d.label.toLowerCase()).join(' e ')}` : ''}. Fondamentale da monitorare.`,
        positive: false,
        tooltip: {
          label: `${worst.nick} — dettaglio performance`,
          values: worst.deltas.map(d => `${d.label}: ${isMediaPondComment ? d.matchVal.toFixed(2) : d.matchVal.toFixed(1) + '%'} vs media ${isMediaPondComment ? d.avgVal.toFixed(2) : d.avgVal.toFixed(1) + '%'} (${d.delta > 0 ? '+' : ''}${isMediaPondComment ? d.delta.toFixed(2) : d.delta.toFixed(1) + '%'})`)
        }
      });
    }

    // Per-fundamental MVP
    const fundMVPs = {};
    for (const fd of fundDefs) {
      const candidates = playerPerf.filter(p => {
        const d = p.deltas.find(dd => dd.key === fd.key);
        return d && d.tot >= 3;
      });
      if (candidates.length >= 2) {
        const sorted = candidates.sort((a, b) => {
          const da = a.deltas.find(d => d.key === fd.key);
          const db = b.deltas.find(d => d.key === fd.key);
          return (db?.matchVal || 0) - (da?.matchVal || 0);
        });
        fundMVPs[fd.key] = sorted[0];
      }
    }
    const mvpEntries = Object.entries(fundMVPs).filter(([, p]) => p);
    if (mvpEntries.length > 0) {
      playerItems.push({
        text: `Migliori per fondamentale: ${mvpEntries.map(([key, p]) => {
          const fd = fundDefs.find(f => f.key === key);
          const d = p.deltas.find(dd => dd.key === key);
          return `${fd.label}: ${p.nick} (${isMediaPondComment ? d?.matchVal?.toFixed(2) : d?.matchVal?.toFixed(1) + '%'})`;
        }).join('; ')}.`,
        positive: null,
        tooltip: {
          label: 'MVP per fondamentale',
          values: mvpEntries.map(([key, p]) => {
            const fd = fundDefs.find(f => f.key === key);
            const d = p.deltas.find(dd => dd.key === key);
            return `${fd.label}: ${p.nick} #${p.number} — ${isMediaPondComment ? d?.matchVal?.toFixed(2) : d?.matchVal?.toFixed(1) + '%'} (media: ${isMediaPondComment ? d?.avgVal?.toFixed(2) : d?.avgVal?.toFixed(1) + '%'})`;
          })
        }
      });
    }
  }

  // Per-fundamental player impact: who moved the needle most in each fundamental
  if (rankedPlayers.length >= 2) {
    for (const fd of fundDefs) {
      const playersWithFund = rankedPlayers.filter(p => {
        const d = p.deltas.find(dd => dd.key === fd.key);
        return d && d.tot >= 3 && Math.abs(d.delta) > (isMediaPondComment ? 0.15 : 5);
      });
      if (playersWithFund.length === 0) continue;

      const overPerf = playersWithFund.filter(p => p.deltas.find(d => d.key === fd.key).delta > 0).sort((a, b) => {
        return b.deltas.find(d => d.key === fd.key).delta - a.deltas.find(d => d.key === fd.key).delta;
      });
      const underPerf = playersWithFund.filter(p => p.deltas.find(d => d.key === fd.key).delta < 0).sort((a, b) => {
        return a.deltas.find(d => d.key === fd.key).delta - b.deltas.find(d => d.key === fd.key).delta;
      });

      const parts = [];
      if (overPerf.length > 0) parts.push(`sopra media: ${overPerf.slice(0, 2).map(p => { const d = p.deltas.find(dd => dd.key === fd.key); return `${p.nick} (${d.delta > 0 ? '+' : ''}${isMediaPondComment ? d.delta.toFixed(2) : d.delta.toFixed(1) + '%'})`; }).join(', ')}`);
      if (underPerf.length > 0) parts.push(`sotto media: ${underPerf.slice(0, 2).map(p => { const d = p.deltas.find(dd => dd.key === fd.key); return `${p.nick} (${d.delta > 0 ? '+' : ''}${isMediaPondComment ? d.delta.toFixed(2) : d.delta.toFixed(1) + '%'})`; }).join(', ')}`);

      if (parts.length > 0) {
        playerItems.push({
          text: `Incidenza su ${fd.label}: ${parts.join('; ')}.`,
          positive: overPerf.length >= underPerf.length,
          tooltip: {
            label: `Impatto player su ${fd.label}`,
            values: [...overPerf, ...underPerf].slice(0, 5).map(p => {
              const d = p.deltas.find(dd => dd.key === fd.key);
              return `${p.nick} (#${p.number}, ${p.role}): ${isMediaPondComment ? d.matchVal.toFixed(2) : d.matchVal.toFixed(1) + '%'} vs media ${isMediaPondComment ? d.avgVal.toFixed(2) : d.avgVal.toFixed(1) + '%'} → ${d.delta > 0 ? '+' : ''}${isMediaPondComment ? d.delta.toFixed(2) : d.delta.toFixed(1) + '%'}`;
            })
          }
        });
      }
    }
  }

  if (playerItems.length > 0) {
    sections.push({ id: 'players', title: 'Protagonisti della Partita', color: 'sky', items: playerItems });
  }

  // ─── SECTION: INCASTRI ROTAZIONE VS AVVERSARIO ────────────────────────
  const oppRotItems = [];
  {
    const oppStartPerSet = {};
    const setsData = match?.sets || [];
    for (const s of setsData) {
      if (s.oppStartRotation >= 1 && s.oppStartRotation <= 6) {
        oppStartPerSet[s.number] = s.oppStartRotation;
      }
    }
    const hasOppRotation = Object.keys(oppStartPerSet).length > 0;

    if (hasOppRotation && rallies.length > 0) {
      // Full matchup matrix when opponent rotation data is available
      const annotated = trackOpponentRotations(rallies, oppStartPerSet);
      const { matrix, summary } = computeMatchupMatrix(annotated);

      if (summary.totalAnnotated > 10) {
        if (summary.bestMatchup) {
          const bm = summary.bestMatchup;
          const net = bm.ourPts - bm.theirPts;
          oppRotItems.push({
            text: `Incastro favorevole Team: nostra P${bm.us} vs loro P${bm.them} → ${bm.ourPts} pts vs ${bm.theirPts} (netto ${net > 0 ? '+' : ''}${net}). ${bm.breakPoint.total > 0 ? `BP: ${bm.breakPoint.won}/${bm.breakPoint.total} (${(bm.breakPoint.won/bm.breakPoint.total*100).toFixed(0)}%).` : ''} ${bm.sideOut.total > 0 ? `SO: ${bm.sideOut.won}/${bm.sideOut.total} (${(bm.sideOut.won/bm.sideOut.total*100).toFixed(0)}%).` : ''}`,
            positive: true,
            tooltip: {
              label: `Matchup P${bm.us} vs P${bm.them}`,
              values: [`Totale rally: ${bm.total}`, `Punti nostri: ${bm.ourPts}`, `Punti loro: ${bm.theirPts}`, `Netto: ${net > 0 ? '+' : ''}${net}`,
                bm.breakPoint.total > 0 ? `BP: ${bm.breakPoint.won}/${bm.breakPoint.total}` : null,
                bm.sideOut.total > 0 ? `SO: ${bm.sideOut.won}/${bm.sideOut.total}` : null].filter(Boolean)
            }
          });
        }

        if (summary.worstMatchup && summary.worstMatchup !== summary.bestMatchup) {
          const wm = summary.worstMatchup;
          const net = wm.ourPts - wm.theirPts;
          oppRotItems.push({
            text: `Incastro sfavorevole Team: nostra P${wm.us} vs loro P${wm.them} → ${wm.ourPts} pts vs ${wm.theirPts} (netto ${net > 0 ? '+' : ''}${net}). Questo incastro ha favorito ${oppName}.`,
            positive: false,
            tooltip: {
              label: `Matchup P${wm.us} vs P${wm.them}`,
              values: [`Totale rally: ${wm.total}`, `Punti nostri: ${wm.ourPts}`, `Punti loro: ${wm.theirPts}`, `Netto: ${net > 0 ? '+' : ''}${net}`,
                wm.breakPoint.total > 0 ? `BP: ${wm.breakPoint.won}/${wm.breakPoint.total}` : null,
                wm.sideOut.total > 0 ? `SO: ${wm.sideOut.won}/${wm.sideOut.total}` : null].filter(Boolean)
            }
          });
        }

        // Analyze serve-vs-receive across rotations (aggregated over opponent rotations)
        const serveBP = {};
        const recvSO = {};
        for (let us = 1; us <= 6; us++) {
          let bpW = 0, bpT = 0, soW = 0, soT = 0;
          for (let them = 1; them <= 6; them++) {
            const cell = matrix[us][them];
            bpW += cell.breakPoint.won; bpT += cell.breakPoint.total;
            soW += cell.sideOut.won; soT += cell.sideOut.total;
          }
          if (bpT >= 3) serveBP[us] = { won: bpW, total: bpT, pct: bpW / bpT * 100 };
          if (soT >= 3) recvSO[us] = { won: soW, total: soT, pct: soW / soT * 100 };
        }

        const bpArr = Object.entries(serveBP).map(([r, d]) => ({ rot: `P${r}`, ...d })).sort((a, b) => b.pct - a.pct);
        const soArr = Object.entries(recvSO).map(([r, d]) => ({ rot: `P${r}`, ...d })).sort((a, b) => b.pct - a.pct);

        if (bpArr.length >= 2) {
          const bestBP = bpArr[0];
          const worstBP = bpArr[bpArr.length - 1];
          if (bestBP.pct - worstBP.pct > 15) {
            oppRotItems.push({
              text: `Battuta vs Ricezione avversaria: migliore resa in ${bestBP.rot} (${bestBP.pct.toFixed(0)}% BP), peggiore in ${worstBP.rot} (${worstBP.pct.toFixed(0)}% BP). Delta ${(bestBP.pct - worstBP.pct).toFixed(0)}%.`,
              positive: null,
              tooltip: { label: 'Break Point per rotazione al servizio', values: bpArr.map(d => `${d.rot}: ${d.won}/${d.total} = ${d.pct.toFixed(1)}%`) }
            });
          }
        }

        if (soArr.length >= 2) {
          const bestSO = soArr[0];
          const worstSO = soArr[soArr.length - 1];
          if (bestSO.pct - worstSO.pct > 15) {
            oppRotItems.push({
              text: `Ricezione Team vs Battuta avversaria: migliore side-out in ${bestSO.rot} (${bestSO.pct.toFixed(0)}% SO), peggiore in ${worstSO.rot} (${worstSO.pct.toFixed(0)}% SO). Battuta di ${oppName} più pericolosa quando noi in ${worstSO.rot}.`,
              positive: null,
              tooltip: { label: 'Side-Out per rotazione in ricezione', values: soArr.map(d => `${d.rot}: ${d.won}/${d.total} = ${d.pct.toFixed(1)}%`) }
            });
          }
        }
      }
    } else if (rallies.length > 0) {
      // Fallback: use our own rotation data from rallies when opponent rotation is unknown
      const rotBP = {};
      const rotSO = {};
      for (const r of rallies) {
        if (!r.rotation || r.rotation < 1 || r.rotation > 6) continue;
        const rot = r.rotation;
        if (r.phase === 'b') {
          if (!rotBP[rot]) rotBP[rot] = { won: 0, total: 0 };
          rotBP[rot].total++;
          if (r.isPoint) rotBP[rot].won++;
        } else if (r.phase === 'r') {
          if (!rotSO[rot]) rotSO[rot] = { won: 0, total: 0 };
          rotSO[rot].total++;
          if (r.isPoint) rotSO[rot].won++;
        }
      }

      const bpArr = Object.entries(rotBP).filter(([, d]) => d.total >= 3).map(([rot, d]) => ({ rot: `P${rot}`, ...d, pct: d.won / d.total * 100 })).sort((a, b) => b.pct - a.pct);
      const soArr = Object.entries(rotSO).filter(([, d]) => d.total >= 3).map(([rot, d]) => ({ rot: `P${rot}`, ...d, pct: d.won / d.total * 100 })).sort((a, b) => b.pct - a.pct);

      if (bpArr.length >= 2) {
        const bestBP = bpArr[0];
        const worstBP = bpArr[bpArr.length - 1];
        if (bestBP.pct - worstBP.pct > 10) {
          oppRotItems.push({
            text: `Resa al servizio per rotazione: migliore in ${bestBP.rot} (${bestBP.pct.toFixed(0)}% BP, ${bestBP.won}/${bestBP.total}), peggiore in ${worstBP.rot} (${worstBP.pct.toFixed(0)}% BP, ${worstBP.won}/${worstBP.total}). Delta ${(bestBP.pct - worstBP.pct).toFixed(0)}%.`,
            positive: bestBP.pct > 50,
            tooltip: { label: 'Break Point per rotazione al servizio', values: bpArr.map(d => `${d.rot}: ${d.won}/${d.total} = ${d.pct.toFixed(1)}%`) }
          });
        }
      }

      if (soArr.length >= 2) {
        const bestSO = soArr[0];
        const worstSO = soArr[soArr.length - 1];
        if (bestSO.pct - worstSO.pct > 10) {
          oppRotItems.push({
            text: `Side-out per rotazione in ricezione: migliore in ${bestSO.rot} (${bestSO.pct.toFixed(0)}% SO, ${bestSO.won}/${bestSO.total}), peggiore in ${worstSO.rot} (${worstSO.pct.toFixed(0)}% SO, ${worstSO.won}/${worstSO.total}). Delta ${(bestSO.pct - worstSO.pct).toFixed(0)}%.`,
            positive: bestSO.pct > 55,
            tooltip: { label: 'Side-Out per rotazione in ricezione', values: soArr.map(d => `${d.rot}: ${d.won}/${d.total} = ${d.pct.toFixed(1)}%`) }
          });
        }
      }

      // Overall BP and SO comparison
      const totalBP = Object.values(rotBP).reduce((s, d) => ({ won: s.won + d.won, total: s.total + d.total }), { won: 0, total: 0 });
      const totalSO = Object.values(rotSO).reduce((s, d) => ({ won: s.won + d.won, total: s.total + d.total }), { won: 0, total: 0 });
      if (totalBP.total > 0 && totalSO.total > 0) {
        const bpPct = totalBP.won / totalBP.total * 100;
        const soPct = totalSO.won / totalSO.total * 100;
        const phase = soPct > bpPct ? 'side-out' : 'break-point';
        oppRotItems.push({
          text: `Fase dominante: ${phase} (SO: ${soPct.toFixed(0)}%, BP: ${bpPct.toFixed(0)}%). ${soPct > 60 ? 'Eccellente cambio palla.' : soPct < 45 ? 'Difficoltà in ricezione-attacco.' : 'Side-out nella norma.'} ${bpPct > 50 ? 'Ottima pressione al servizio.' : bpPct < 35 ? 'Battuta poco incisiva.' : 'Break-point nella norma.'}`,
          positive: (soPct > 55 && bpPct > 40),
          tooltip: { label: 'Resa per fase', values: [`Side-Out: ${totalSO.won}/${totalSO.total} = ${soPct.toFixed(1)}%`, `Break-Point: ${totalBP.won}/${totalBP.total} = ${bpPct.toFixed(1)}%`] }
        });
      }
    }
  }
  if (oppRotItems.length > 0) {
    sections.push({ id: 'oppRotMatchup', title: 'Incastri Rotazione vs Avversario', color: 'lime', items: oppRotItems });
  }

  // ─── SECTION: CAPACITÀ DI TRASFORMAZIONE ──────────────────────────────
  const transfItems = [];
  {
    const gioco = match?.gioco;
    const atkFromRec = gioco?.attackFromReception || {};
    const atkFromDef = gioco?.attackFromDefense || {};

    // Team transformation: from poor reception/defense → attack effectiveness
    const calcGroupKR = (entries) => {
      if (!entries || entries.length === 0) return null;
      const totAtt = entries.reduce((s, e) => s + (e.attacks || 0), 0);
      if (totAtt === 0) return null;
      const totPts = entries.reduce((s, e) => { const p = e.pointsStr?.split('-'); return s + (parseInt(p?.[0]) || 0); }, 0);
      const totErr = entries.reduce((s, e) => { const p = e.pointsStr?.split('-'); return s + (parseInt(p?.[1]) || 0); }, 0);
      return { attacks: totAtt, pts: totPts, errs: totErr, killRate: totPts / totAtt * 100, errRate: totErr / totAtt * 100 };
    };

    const recR5 = calcGroupKR(atkFromRec.R5);
    const recR4 = calcGroupKR(atkFromRec.R4);
    const recR3 = calcGroupKR(atkFromRec.R3);
    const defD5 = calcGroupKR(atkFromDef?.D5);
    const defD4 = calcGroupKR(atkFromDef?.D4);
    const defD3 = calcGroupKR(atkFromDef?.D3);

    // Transformation from poor receptions vs good receptions — try R5 vs R3, fallback to R5 vs R4
    const recPoor = (recR3 && recR3.attacks >= 2) ? recR3 : (recR4 && recR4.attacks >= 2) ? recR4 : null;
    const recPoorLabel = (recR3 && recR3.attacks >= 2) ? 'R3' : (recR4 && recR4.attacks >= 2) ? 'R4' : null;
    if (recR5 && recPoor && recR5.attacks >= 3) {
      const deltaKR = recR5.killRate - recPoor.killRate;
      transfItems.push({
        text: `Trasformazione in side-out: da R5 kill rate ${recR5.killRate.toFixed(0)}% → da ${recPoorLabel} kill rate ${recPoor.killRate.toFixed(0)}%. ${Math.abs(deltaKR) < 10 ? 'Ottima capacità di trasformazione anche da ricezione imprecisa.' : deltaKR > 25 ? 'Forte dipendenza dalla qualità della ricezione: con palla imprecisa l\'attacco perde molto.' : 'Calo fisiologico dalla ricezione imprecisa.'}`,
        positive: deltaKR < 15,
        tooltip: {
          label: 'Conversione attacco per qualità ricezione',
          values: [
            `Da R5: ${recR5.pts}/${recR5.attacks} = ${recR5.killRate.toFixed(1)}%`,
            recR4 ? `Da R4: ${recR4.pts}/${recR4.attacks} = ${recR4.killRate.toFixed(1)}%` : null,
            recR3 ? `Da R3: ${recR3.pts}/${recR3.attacks} = ${recR3.killRate.toFixed(1)}%` : null,
            `Delta R5→${recPoorLabel}: ${deltaKR.toFixed(1)}%`,
          ].filter(Boolean)
        }
      });
    } else if (recR5 && recR5.attacks >= 5 && !recPoor) {
      // Only R5 data available — show standalone conversion rate
      transfItems.push({
        text: `Conversione da ricezione perfetta (R5): kill rate ${recR5.killRate.toFixed(0)}% su ${recR5.attacks} attacchi (${recR5.pts} punti, ${recR5.errs} errori). ${recR5.killRate > 55 ? 'Ottima conversione dalla palla alta.' : recR5.killRate > 40 ? 'Conversione nella norma.' : 'Conversione sotto le attese dalla palla perfetta.'}`,
        positive: recR5.killRate > 50,
        tooltip: {
          label: 'Conversione da R5',
          values: [
            `R5: ${recR5.pts}/${recR5.attacks} = ${recR5.killRate.toFixed(1)}%`,
            recR4 ? `R4: ${recR4.pts}/${recR4.attacks} = ${recR4.killRate.toFixed(1)}%` : null,
            recR3 ? `R3: ${recR3.pts}/${recR3.attacks} = ${recR3.killRate.toFixed(1)}%` : null,
          ].filter(Boolean)
        }
      });
    }

    // Transformation in transition (from defense) — try D5 vs D3, fallback to D5 vs D4
    const defPoor = (defD3 && defD3.attacks >= 2) ? defD3 : (defD4 && defD4.attacks >= 2) ? defD4 : null;
    const defPoorLabel = (defD3 && defD3.attacks >= 2) ? 'D3' : (defD4 && defD4.attacks >= 2) ? 'D4' : null;
    if (defD5 && defPoor && defD5.attacks >= 2) {
      const deltaDef = defD5.killRate - defPoor.killRate;
      transfItems.push({
        text: `Trasformazione in transizione: da difesa perfetta (D5) kill rate ${defD5.killRate.toFixed(0)}% → da ${defPoorLabel} kill rate ${defPoor.killRate.toFixed(0)}%. ${Math.abs(deltaDef) < 15 ? 'Buona gestione del contrattacco anche da difese difficili.' : 'Contrattacco efficace soprattutto da difese pulite.'}`,
        positive: deltaDef < 20,
        tooltip: {
          label: 'Conversione attacco per qualità difesa',
          values: [
            `Da D5: ${defD5.pts}/${defD5.attacks} = ${defD5.killRate.toFixed(1)}%`,
            defD4 ? `Da D4: ${defD4.pts}/${defD4.attacks} = ${defD4.killRate.toFixed(1)}%` : null,
            defD3 ? `Da D3: ${defD3.pts}/${defD3.attacks} = ${defD3.killRate.toFixed(1)}%` : null,
          ].filter(Boolean)
        }
      });
    } else if (defD5 && defD5.attacks >= 3 && !defPoor) {
      transfItems.push({
        text: `Conversione da difesa perfetta (D5): kill rate ${defD5.killRate.toFixed(0)}% su ${defD5.attacks} attacchi in transizione. ${defD5.killRate > 40 ? 'Buon contrattacco dalla difesa pulita.' : 'Contrattacco da migliorare anche da difese precise.'}`,
        positive: defD5.killRate > 35,
        tooltip: {
          label: 'Conversione da D5',
          values: [
            `D5: ${defD5.pts}/${defD5.attacks} = ${defD5.killRate.toFixed(1)}%`,
            defD4 ? `D4: ${defD4.pts}/${defD4.attacks} = ${defD4.killRate.toFixed(1)}%` : null,
            defD3 ? `D3: ${defD3.pts}/${defD3.attacks} = ${defD3.killRate.toFixed(1)}%` : null,
          ].filter(Boolean)
        }
      });
    }

    // Per-role transformation analysis: which attacker converts best from poor passes
    const roleTransf = {};
    for (const recKey of ['R5', 'R4', 'R3']) {
      for (const entry of (atkFromRec[recKey] || [])) {
        if (!entry.role || entry.attacks < 2) continue;
        if (!roleTransf[entry.role]) roleTransf[entry.role] = {};
        const pParts = entry.pointsStr?.split('-');
        roleTransf[entry.role][recKey] = {
          attacks: entry.attacks,
          pts: parseInt(pParts?.[0]) || 0,
          errs: parseInt(pParts?.[1]) || 0,
          killRate: entry.attacks > 0 ? (parseInt(pParts?.[0]) || 0) / entry.attacks * 100 : 0,
        };
      }
    }

    // Find attackers who maintain kill rate from R3 (good transformers)
    const goodTransformers = [];
    const poorTransformers = [];
    for (const [role, data] of Object.entries(roleTransf)) {
      if (data.R5 && data.R3 && data.R5.attacks >= 2 && data.R3.attacks >= 2) {
        const delta = data.R5.killRate - data.R3.killRate;
        if (delta < 10) goodTransformers.push({ role, r5KR: data.R5.killRate, r3KR: data.R3.killRate, delta });
        else if (delta > 25) poorTransformers.push({ role, r5KR: data.R5.killRate, r3KR: data.R3.killRate, delta });
      }
    }
    if (goodTransformers.length > 0) {
      transfItems.push({
        text: `Migliori trasformatori da ricezione imprecisa: ${goodTransformers.map(t => `${t.role} (R3→${t.r3KR.toFixed(0)}%, delta solo ${t.delta.toFixed(0)}%)`).join(', ')}. Questi terminali mantengono efficacia anche con palla difficile.`,
        positive: true,
        tooltip: { label: 'Trasformatori efficaci', values: goodTransformers.map(t => `${t.role}: da R5 ${t.r5KR.toFixed(0)}%, da R3 ${t.r3KR.toFixed(0)}%, delta ${t.delta.toFixed(0)}%`) }
      });
    }
    if (poorTransformers.length > 0) {
      transfItems.push({
        text: `Attaccanti in difficoltà con palla imprecisa: ${poorTransformers.map(t => `${t.role} (R3→${t.r3KR.toFixed(0)}%, calo di ${t.delta.toFixed(0)}%)`).join(', ')}. Il palleggiatore dovrebbe limitare le scelte su questi terminali quando la ricezione è neutra.`,
        positive: false,
        tooltip: { label: 'Trasformatori in difficoltà', values: poorTransformers.map(t => `${t.role}: da R5 ${t.r5KR.toFixed(0)}%, da R3 ${t.r3KR.toFixed(0)}%, delta ${t.delta.toFixed(0)}%`) }
      });
    }
  }
  if (transfItems.length > 0) {
    sections.push({ id: 'transformation', title: 'Capacità di Trasformazione', color: 'purple', items: transfItems });
  }

  // ─── SECTION: ANALISI PALLEGGIATORE ─────────────────────────────────────
  const setterItems = [];

  // Identifica il palleggiatore dalla logica P1: chi serve in rotazione P1 (fase 'b')
  // è il palleggiatore. Questa è l'unica logica affidabile, indipendente dal ruolo nel roster.
  const matchRallies = match?.rallies || [];
  const setterNumsFromP1 = new Set();
  for (const rl of matchRallies) {
    if (rl.rotation === 1 && rl.phase === 'b') {
      // Prova rally.server, fallback alla prima azione di battuta nella quartina
      let srv = rl.server ? String(rl.server).padStart(2, '0') : null;
      if (!srv) {
        const srvToken = (rl.quartine || []).find(t => t.type === 'action' && String(t.fundamental || '').toLowerCase() === 'b');
        if (srvToken?.player) srv = String(srvToken.player).padStart(2, '0');
      }
      if (srv) setterNumsFromP1.add(srv);
    }
  }
  // Fallback: se non ci sono rally P1-b (dati incompleti), usa il roster + playerStats
  let setters;
  if (setterNumsFromP1.size > 0) {
    setters = roster.filter(r => setterNumsFromP1.has(String(r.number).padStart(2, '0')));
  } else {
    const allSettersRoster = roster.filter(r => /^P\d?$/i.test(r.role) || /palleggiator/i.test(r.role));
    setters = allSettersRoster.filter(s => {
      const ps = pStats.find(p => String(p.number) === String(s.number));
      if (!ps) return false;
      const fKeys = ['serve', 'attack', 'defense', 'reception', 'block'];
      return fKeys.some(fk => ps[fk] && ps[fk].tot > 0);
    });
  }
  const gioco = match?.gioco;

  if (setters.length > 0 && gioco) {
    const setter = setters[0]; // primary setter
    const setterNick = setter.nickname || (setter.name || setter.surname || '').trim().split(/\s+/)[0] || '#' + setter.number;

    // Attack distribution analysis from gioco data
    const atkFromRec = gioco.attackFromReception || {};
    const atkFromDef = gioco.attackFromDefense || {};

    // Collect attack distribution per role
    const roleAttacks = {};
    const allAtkEntries = [...(atkFromRec.R5 || []), ...(atkFromRec.R4 || []), ...(atkFromRec.R3 || []),
                           ...(atkFromDef.D5 || []), ...(atkFromDef.D4 || []), ...(atkFromDef.D3 || [])];
    for (const entry of allAtkEntries) {
      if (!entry.role) continue;
      if (!roleAttacks[entry.role]) roleAttacks[entry.role] = { attacks: 0, pts: 0, errs: 0 };
      roleAttacks[entry.role].attacks += entry.attacks || 0;
      // Parse pointsStr "12-3" → pts=12, errs=3
      if (entry.pointsStr) {
        const parts = entry.pointsStr.split('-');
        roleAttacks[entry.role].pts += parseInt(parts[0]) || 0;
        roleAttacks[entry.role].errs += parseInt(parts[1]) || 0;
      }
    }

    const totalDistributed = Object.values(roleAttacks).reduce((s, r) => s + r.attacks, 0);

    if (totalDistributed > 0) {
      // Distribution analysis
      const roleEntries = Object.entries(roleAttacks)
        .filter(([, v]) => v.attacks > 0)
        .sort((a, b) => b[1].attacks - a[1].attacks);

      const topAttacker = roleEntries[0];
      const topPct = ((topAttacker[1].attacks / totalDistributed) * 100).toFixed(0);
      const isBalanced = roleEntries.length >= 3 && (topAttacker[1].attacks / totalDistributed) < 0.40;
      // If only 1 role exists (e.g. all attacks coded as generic "ATT"), this is a data limitation
      const isSingleGenericRole = roleEntries.length === 1 && /^ATT$/i.test(topAttacker[0]);

      // Setter distribution text
      let distribText;
      if (isSingleGenericRole) {
        distribText = `Regia di ${setterNick}: ${totalDistributed} palloni distribuiti. Dati di distribuzione per ruolo non disponibili (tutti gli attacchi classificati come ruolo generico "${topAttacker[0]}").`;
      } else if (isBalanced) {
        distribText = `Regia di ${setterNick}: ${totalDistributed} palloni distribuiti. Distribuzione equilibrata tra i terminali.`;
      } else {
        distribText = `Regia di ${setterNick}: ${totalDistributed} palloni distribuiti. Distribuzione polarizzata su ${topAttacker[0]} (${topPct}%).`;
      }
      setterItems.push({
        text: distribText,
        positive: isSingleGenericRole ? null : isBalanced,
        tooltip: {
          label: `Distribuzione attacco (${setterNick})`,
          values: roleEntries.map(([role, data]) => {
            const pct = ((data.attacks / totalDistributed) * 100).toFixed(0);
            const killRate = data.attacks > 0 ? ((data.pts / data.attacks) * 100).toFixed(0) : '0';
            return `${role}: ${data.attacks} attacchi (${pct}%) → ${data.pts} pts, kill rate ${killRate}%`;
          })
        }
      });

      // Attacker efficiency by role — who benefited most from the setter's choices
      const attackerEfficiency = roleEntries
        .filter(([, v]) => v.attacks >= 3)
        .map(([role, data]) => ({ role, attacks: data.attacks, killRate: data.attacks > 0 ? (data.pts / data.attacks) * 100 : 0, errRate: data.attacks > 0 ? (data.errs / data.attacks) * 100 : 0 }))
        .sort((a, b) => b.killRate - a.killRate);

      if (attackerEfficiency.length >= 2) {
        const bestTerminal = attackerEfficiency[0];
        const worstTerminal = attackerEfficiency[attackerEfficiency.length - 1];
        setterItems.push({
          text: `Terminale più efficace: ${bestTerminal.role} (kill rate ${bestTerminal.killRate.toFixed(0)}% su ${bestTerminal.attacks} attacchi). ${worstTerminal.killRate < 25 && worstTerminal.attacks >= 5 ? `Attenzione: ${worstTerminal.role} in difficoltà (kill rate ${worstTerminal.killRate.toFixed(0)}%).` : ''}`,
          positive: bestTerminal.killRate >= 30,
          tooltip: {
            label: 'Efficacia per terminale d\'attacco',
            values: attackerEfficiency.map(a => `${a.role}: kill rate ${a.killRate.toFixed(1)}%, err ${a.errRate.toFixed(1)}% (${a.attacks} att.)`)
          }
        });
      }
    }

    // Setter's own technical performance (defense, serve, block from their playerStats)
    const setterPS = pStats.find(p => p.number === setter.number);
    const setterDef = pDef.find(p => p.number === setter.number);
    const setterAvg = playerSeasonAvg[setter.number];

    if (setterPS || setterDef) {
      const setterTech = [];
      if (setterDef?.tot > 0) {
        const defVal = teamMetricPct(setterDef, null, 'defense');
        const defAvg = setterAvg?.defense;
        if (defVal !== null) {
          const cmp = defAvg !== null && Number.isFinite(defAvg) ? (defVal > defAvg + 3 ? '(sopra media)' : defVal < defAvg - 3 ? '(sotto media)' : '(in media)') : '';
          setterTech.push(`Difesa: ${isMediaPondComment ? defVal.toFixed(2) : defVal.toFixed(1) + '%'} ${cmp}`);
        }
      }
      if (setterPS?.serve?.tot > 0) {
        const srvVal = teamMetricPct(setterPS.serve, null, 'serve');
        const srvAvg = setterAvg?.serve;
        if (srvVal !== null) {
          const cmp = srvAvg !== null && Number.isFinite(srvAvg) ? (srvVal > srvAvg + 3 ? '(sopra media)' : srvVal < srvAvg - 3 ? '(sotto media)' : '(in media)') : '';
          setterTech.push(`Battuta: ${isMediaPondComment ? srvVal.toFixed(2) : srvVal.toFixed(1) + '%'} ${cmp}`);
        }
      }
      if (setterTech.length > 0) {
        setterItems.push({
          text: `Tecnica ${setterNick}: ${setterTech.join('; ')}.`,
          positive: null,
          tooltip: {
            label: `${setterNick} — performance tecnica individuale`,
            values: setterTech
          }
        });
      }
    }

    // Quality of sets: analyze R5 → attack distribution specifically
    const r5Attacks = atkFromRec.R5 || [];
    const r4Attacks = atkFromRec.R4 || [];
    const r5Total = r5Attacks.reduce((s, e) => s + (e.attacks || 0), 0);
    const r5Pts = r5Attacks.reduce((s, e) => { const p = e.pointsStr?.split('-'); return s + (parseInt(p?.[0]) || 0); }, 0);
    const r4Total = r4Attacks.reduce((s, e) => s + (e.attacks || 0), 0);
    const r4Pts = r4Attacks.reduce((s, e) => { const p = e.pointsStr?.split('-'); return s + (parseInt(p?.[0]) || 0); }, 0);

    if (r5Total >= 3 && r4Total >= 3) {
      const r5KR = (r5Pts / r5Total * 100).toFixed(0);
      const r4KR = (r4Pts / r4Total * 100).toFixed(0);
      const delta = r5Pts / r5Total * 100 - r4Pts / r4Total * 100;
      setterItems.push({
        text: `Conversione in attacco: da ricezione perfetta (R5) kill rate ${r5KR}% (${r5Total} att.), da ricezione positiva (R4) kill rate ${r4KR}% (${r4Total} att.). ${Math.abs(delta) > 15 ? `Il calo di ${Math.abs(delta).toFixed(0)}% suggerisce che la regia dipende molto dalla qualità della ricezione.` : 'Buona capacità di mantenere qualità anche con palla meno precisa.'}`,
        positive: delta <= 15,
        tooltip: {
          label: 'Conversione attacco per qualità ricezione',
          values: [
            `Da R5: ${r5Pts} pts su ${r5Total} att. = ${r5KR}%`,
            `Da R4: ${r4Pts} pts su ${r4Total} att. = ${r4KR}%`,
            `Delta: ${delta.toFixed(1)}%`,
          ]
        }
      });
    }
  }

  // ─── Setter: rotation-specific distribution choices ───
  if (rallies.length > 0 && setters.length > 0) {
    // Group rallies by rotation and phase, then analyze attacker role choices
    const rotChoices = {};
    for (const r of rallies) {
      if (!r.rotation || !r.attackRole) continue;
      const key = `P${r.rotation}-${r.phase === 'r' ? 'SO' : 'BP'}`;
      if (!rotChoices[key]) rotChoices[key] = {};
      if (!rotChoices[key][r.attackRole]) rotChoices[key][r.attackRole] = { total: 0, pts: 0 };
      rotChoices[key][r.attackRole].total++;
      if (r.isPoint) rotChoices[key][r.attackRole].pts++;
    }

    // Find rotation+phase where a chosen role underperformed while another had better historical stats
    const rotChoiceItems = [];
    for (const [rotPhase, roles] of Object.entries(rotChoices)) {
      const roleArr = Object.entries(roles)
        .filter(([, d]) => d.total >= 2)
        .map(([role, d]) => ({ role, ...d, killRate: d.pts / d.total * 100 }))
        .sort((a, b) => b.total - a.total);

      if (roleArr.length >= 2) {
        const mostUsed = roleArr[0];
        const alternatives = roleArr.slice(1).filter(r => r.killRate > mostUsed.killRate + 10 && r.total >= 2);
        if (alternatives.length > 0 && mostUsed.killRate < 30) {
          rotChoiceItems.push({
            rotPhase,
            mostUsed,
            better: alternatives[0],
          });
        }
      }
    }

    if (rotChoiceItems.length > 0) {
      for (const item of rotChoiceItems.slice(0, 3)) {
        setterItems.push({
          text: `In ${item.rotPhase}: il terminale più usato (${item.mostUsed.role}, ${item.mostUsed.total} att., ${item.mostUsed.killRate.toFixed(0)}% KR) ha reso meno di ${item.better.role} (${item.better.total} att., ${item.better.killRate.toFixed(0)}% KR). Valutare distribuzione alternativa.`,
          positive: false,
          tooltip: {
            label: `Scelta attaccante in ${item.rotPhase}`,
            values: [
              `${item.mostUsed.role}: ${item.mostUsed.pts}/${item.mostUsed.total} = ${item.mostUsed.killRate.toFixed(1)}%`,
              `${item.better.role}: ${item.better.pts}/${item.better.total} = ${item.better.killRate.toFixed(1)}%`,
              `Suggerimento: redistribuire palloni verso ${item.better.role} in questa configurazione`,
            ]
          }
        });
      }
    }

    // Historical setter comparison: check if in past matches, in same rotation/phase, another role was better
    if (matchAnalytics.length > 1) {
      const historicalRoleKR = {};
      for (const ma of matchAnalytics) {
        if (ma.match?.id === match?.id) continue;
        const histRallies = ma.match?.rallies || [];
        for (const r of histRallies) {
          if (!r.rotation || !r.attackRole) continue;
          const key = `P${r.rotation}-${r.phase === 'r' ? 'SO' : 'BP'}`;
          if (!historicalRoleKR[key]) historicalRoleKR[key] = {};
          if (!historicalRoleKR[key][r.attackRole]) historicalRoleKR[key][r.attackRole] = { total: 0, pts: 0 };
          historicalRoleKR[key][r.attackRole].total++;
          if (r.isPoint) historicalRoleKR[key][r.attackRole].pts++;
        }
      }

      // Compare current match role choice vs historical alternative
      const histSuggestions = [];
      for (const [rotPhase, currentRoles] of Object.entries(rotChoices)) {
        const currentArr = Object.entries(currentRoles).filter(([, d]) => d.total >= 3).sort((a, b) => b[1].total - a[1].total);
        if (currentArr.length === 0) continue;
        const [mostUsedRole, mostUsedData] = currentArr[0];
        const currentKR = mostUsedData.total > 0 ? mostUsedData.pts / mostUsedData.total * 100 : 0;

        const histRoles = historicalRoleKR[rotPhase] || {};
        for (const [hRole, hData] of Object.entries(histRoles)) {
          if (hRole === mostUsedRole || hData.total < 5) continue;
          const hKR = hData.pts / hData.total * 100;
          if (hKR > currentKR + 15 && currentKR < 30) {
            histSuggestions.push({ rotPhase, usedRole: mostUsedRole, usedKR: currentKR, altRole: hRole, altKR: hKR, altTotal: hData.total });
          }
        }
      }

      if (histSuggestions.length > 0) {
        const top = histSuggestions.sort((a, b) => (b.altKR - b.usedKR) - (a.altKR - a.usedKR))[0];
        setterItems.push({
          text: `Storico regia: in ${top.rotPhase} il terminale ${top.usedRole} (${top.usedKR.toFixed(0)}% KR oggi) ha storicamente reso meno di ${top.altRole} (${top.altKR.toFixed(0)}% KR su ${top.altTotal} att. nello storico). Considerare questo dato per la prossima gara.`,
          positive: null,
          tooltip: {
            label: `Confronto storico in ${top.rotPhase}`,
            values: [`Oggi: ${top.usedRole} = ${top.usedKR.toFixed(1)}%`, `Storico: ${top.altRole} = ${top.altKR.toFixed(1)}% (${top.altTotal} att.)`]
          }
        });
      }
    }
  }

  if (setterItems.length > 0) {
    sections.push({ id: 'setter', title: 'Analisi Regia', color: 'teal', items: setterItems });
  }

  // ─── SECTION: SINTESI PER L'ALLENATORE ─────────────────────────────────
  const synthItems = [];

  // Map lineMode → property key in seasonTeamAvg (same scale as fg.ourEff)
  const seasonAvgKey = {
    efficienza: 'efficiency',
    efficacia:  'efficacy',
    mediaPond:  'mediaPond',
    mediaPct:   'mediaPct',
    attitude:   'attitude',
  }[lineMode] || 'efficiency';

  // Threshold for "below season average": mediaPond uses 0.2 (1–5 scale), all % metrics use 5
  const belowAvgThresh = isMediaPondComment ? 0.2 : 5;

  // Decisive fundamental
  if (fundGaps.length > 0) {
    const decisive = fundGaps[0];
    if (Math.abs(decisive.gap) >= threshSm) {
      const isOurAdv = decisive.gap > 0;
      synthItems.push({
        text: `Fondamentale chiave: ${decisive.label}${isOurAdv
          ? `. La nostra superiorità in ${decisive.label.toLowerCase()} (${gapFmt(decisive.gap)} ${metricLabel}) è stata un fattore determinante ${won ? 'per la vittoria' : 'che ha limitato il passivo'}.`
          : `. Lo svantaggio in ${decisive.label.toLowerCase()} (${gapFmt(decisive.gap)} ${metricLabel}) ha penalizzato il rendimento globale.`
        }`,
        positive: isOurAdv === won,
        tooltip: {
          label: `${decisive.label} — confronto`,
          values: decisive.tooltipVals
        }
      });
    }
  }

  // Phase decisive
  if (rallies.length >= 10) {
    const soRallies = rallies.filter(r => r.phase === 'r');
    const bpRallies = rallies.filter(r => r.phase === 'b');
    const soPct = soRallies.length > 0 ? soRallies.filter(r => r.isPoint).length / soRallies.length * 100 : null;
    const bpPct = bpRallies.length > 0 ? bpRallies.filter(r => r.isPoint).length / bpRallies.length * 100 : null;

    if (soPct !== null && bpPct !== null) {
      const delta = Math.abs(soPct - bpPct);
      if (delta >= 8) {
        const weakPhase = soPct < bpPct ? 'side-out' : 'break-point';
        const weakPct = Math.min(soPct, bpPct);
        synthItems.push({
          text: `Fase critica: ${weakPhase} (${weakPct.toFixed(0)}% punti). ${
            weakPhase === 'side-out'
              ? `Difficoltà nel costruire il punto dopo la ricezione: lavorare su qualità ricezione e attacco in fast-break.`
              : `Difficoltà nel pressare con la battuta e gestire l'attacco avversario dopo il servizio.`
          }`,
          positive: false,
          tooltip: {
            label: 'Analisi di fase',
            values: [
              `Side-out %: ${soPct.toFixed(1)}%`,
              `Break-point %: ${bpPct.toFixed(1)}%`,
              `Fase critica: ${weakPhase}`,
            ]
          }
        });
      }
    }
  }

  // Compare with season average — use the same metric as the selected lineMode
  if (seasonTeamAvg && fundGaps.length > 0) {
    const belowAvg = fundGaps.filter(fg => {
      const avg = seasonTeamAvg?.[fg.key]?.[seasonAvgKey];
      return Number.isFinite(avg) && Number.isFinite(fg.ourEff) && fg.ourEff < avg - belowAvgThresh;
    });
    if (belowAvg.length > 0) {
      const valFmt = (v) => isMediaPondComment ? Number(v).toFixed(2) : `${Number(v).toFixed(0)}%`;
      synthItems.push({
        text: `Sotto la media stagionale (${metricLabel}) in: ${belowAvg.map(fg => {
          const avg = seasonTeamAvg[fg.key][seasonAvgKey];
          return `${fg.label} (${valFmt(fg.ourEff)} vs media ${valFmt(avg)})`;
        }).join(', ')}.`,
        positive: false,
        tooltip: {
          label: `Confronto con media stagionale (${metricLabel})`,
          values: belowAvg.map(fg => {
            const avg = seasonTeamAvg[fg.key][seasonAvgKey];
            return `${fg.label}: partita ${valFmt(fg.ourEff)} / media ${valFmt(avg)}`;
          })
        }
      });
    }
  }

  if (synthItems.length > 0) {
    sections.push({ id: 'synthesis', title: "Sintesi — Chiave di Lettura", color: 'rose', items: synthItems });
  }

  return sections.length > 0 ? sections : null;
}
