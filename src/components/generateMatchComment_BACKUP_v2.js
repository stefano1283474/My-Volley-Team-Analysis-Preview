function generateMatchComment(selectedMatchMA, selectedOppAgg, seasonTeamAvg, seasonAgg, activeOpponent, lineMode = 'attitude', matchAnalytics = [], standings = null) {
  if (!selectedMatchMA || !selectedOppAgg) return null;

  const match = selectedMatchMA.match;
  const team = match?.riepilogo?.team;
  const oppName = match?.metadata?.opponent || 'Avversario';
  if (!team) return null;

  const attitudeValues = computeAttitude(match);
  const safeN = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const toPct = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  };

  const metricLabel = { efficienza:'efficienza', efficacia:'efficacia', attitude:'AI Score', mediaPond:'media ponderata', mediaPct:'Media %' }[lineMode] || 'efficienza';
  const isMP = lineMode === 'mediaPond';
  const threshBig = isMP ? 0.30 : 15;
  const threshMed = isMP ? 0.15 : 8;
  const threshSm  = isMP ? 0.05 : 2;
  const gapFmt = (v) => isMP ? (v>0?'+':'')+v.toFixed(2) : (v>0?'+':'')+v.toFixed(1)+'%';
  const valFmt = (v) => isMP ? Number(v).toFixed(2) : `${Number(v).toFixed(1)}%`;

  const teamMetricPct = (data, metric, fundKey) => {
    const m = metric ?? lineMode;
    if (!data || typeof data !== 'object') return null;
    const total = Number(data.tot || 0);
    const kill = Number(data.kill || 0);
    const pos  = Number(data.pos  || 0);
    const err  = Number(data.err  || 0);
    const neg  = Number(data.neg  || 0);
    if (Number.isFinite(total) && total > 0) {
      const dr = fundKey === 'defense' || fundKey === 'reception';
      if (m === 'efficacy' || m === 'efficacia') return dr ? ((kill+pos)/total)*100 : (kill/total)*100;
      if (m === 'mediaPct') return dr ? ((kill+pos-err)/total)*100 : ((kill-err)/total)*100;
      if (m === 'mediaPond') { const exc=Number(data.exc||0); const mp=(1*err+2*neg+3*exc+4*pos+5*kill)/total; return Number.isFinite(mp)?mp:null; }
      if (m === 'attitude') {
        if (attitudeValues && Number.isFinite(attitudeValues[fundKey])) return attitudeValues[fundKey]*100;
        const exc=Number(data.exc||0); return dr?((kill+pos+exc)/total)*100:((kill+pos)/total)*100;
      }
      return dr ? ((kill+pos-err)/total)*100 : ((kill-err-neg)/total)*100;
    }
    return toPct(data?.[m]);
  };

  const oppMetricPct = (oppData, fundKey) => {
    if (!oppData) return null;
    if (lineMode === 'efficacia' || lineMode === 'efficacy') return toPct(oppData.efficacy);
    if (lineMode === 'mediaPct') {
      const dr = fundKey==='defense'||fundKey==='reception'; const t=oppData.total||0;
      return t>0 ? (dr ? ((oppData['val4+5']-oppData.val1)/t)*100 : ((oppData.val5-oppData.val1)/t)*100) : null;
    }
    if (lineMode === 'mediaPond') return toPct(oppData.mediaPond);
    if (lineMode === 'attitude') return toPct(oppData.attitude);
    return toPct(oppData.efficiency);
  };

  const metricFromRaw = (data, fundKey) => {
    if (!data||typeof data!=='object') return null;
    if (!Number.isFinite(Number(data.tot||0))||Number(data.tot||0)<=0) return null;
    return teamMetricPct(data, null, fundKey);
  };

  const perfAvgKey = { efficienza:'efficiency', efficacia:'efficacy', mediaPond:'mediaPond', mediaPct:'mediaPct', attitude:'attitude' }[lineMode]||'efficiency';
  const oppAvgKey  = perfAvgKey === 'efficiency' ? 'efficiency' : perfAvgKey;

  const sections = [];
  const fundDefs = [
    { key:'attack',    label:'Attacco',   abbrev:'A' },
    { key:'serve',     label:'Battuta',   abbrev:'B' },
    { key:'reception', label:'Ricezione', abbrev:'R' },
    { key:'defense',   label:'Difesa',    abbrev:'D' },
  ];

  // ── Pre-compute fund gaps ──
  const fundGaps = [];
  for (const fd of fundDefs) {
    const ourData = team?.[fd.key];
    const oppData = selectedOppAgg?.[fd.key];
    if (!ourData||!oppData) continue;
    const ourEff = teamMetricPct(ourData, null, fd.key);
    const oppEff = oppMetricPct(oppData, fd.key);
    if (ourEff===null||oppEff===null) continue;
    const gap = ourEff - oppEff;
    const seasonAvgVal = seasonTeamAvg?.[fd.key]?.[perfAvgKey];
    const vsAvgDelta = Number.isFinite(seasonAvgVal) ? ourEff - seasonAvgVal : null;
    const ourEfficacy = teamMetricPct(ourData, 'efficacy', fd.key);
    const oppEfficacy = toPct(oppData.efficacy);
    const tooltipVals = [
      `${metricLabel.charAt(0).toUpperCase()+metricLabel.slice(1)} Noi: ${valFmt(ourEff)} | Avv.: ${valFmt(oppEff)}`,
      `Differenza: ${gapFmt(gap)}`,
    ];
    const ourEff2 = teamMetricPct(ourData,'efficiency',fd.key); const oppEff2=toPct(oppData.efficiency);
    if (ourEff2!==null&&oppEff2!==null) tooltipVals.push(`Efficienza Noi: ${ourEff2.toFixed(1)}% | Avv.: ${oppEff2.toFixed(1)}%`);
    if (ourEfficacy!==null&&oppEfficacy!==null) tooltipVals.push(`Efficacia Noi: ${ourEfficacy.toFixed(1)}% | Avv.: ${oppEfficacy.toFixed(1)}%`);
    if (Number.isFinite(seasonTeamAvg?.[fd.key]?.efficiency)) tooltipVals.push(`Nostra media stag.(eff.): ${seasonTeamAvg[fd.key].efficiency.toFixed(1)}%`);
    if (ourData.kill!==undefined) tooltipVals.push(`Noi: ${ourData.kill}k / ${ourData.err||0}e / ${ourData.tot}tot`);
    fundGaps.push({ ...fd, ourEff, oppEff, gap, ourEfficacy, oppEfficacy, vsAvgDelta, seasonAvgVal, tooltipVals });
  }
  fundGaps.sort((a,b) => Math.abs(b.gap)-Math.abs(a.gap));

  // ── Pre-compute rally data ──
  const rallies = match?.rallies || [];
  const soRallies = rallies.filter(r=>r.phase==='r');
  const bpRallies = rallies.filter(r=>r.phase==='b');
  const soWon = soRallies.filter(r=>r.isPoint).length;
  const bpWon = bpRallies.filter(r=>r.isPoint).length;
  const soPct = soRallies.length>0 ? soWon/soRallies.length*100 : null;
  const bpPct = bpRallies.length>0 ? bpWon/bpRallies.length*100 : null;

  const sets = match?.sets || [];
  const setsWon  = sets.filter(s=>s.won).length;
  const setsLost = sets.filter(s=>!s.won).length;
  const won = setsWon > setsLost;
  const setsDetail = sets.map(s=>`${s.ourScore}-${s.theirScore}`).join(' / ');
  const tightSets = sets.filter(s=>Math.abs((s.ourScore||0)-(s.theirScore||0))<=3);

  const pesoContesto = match?.metadata?.pesoContesto || {};
  const matchWeight  = Number(match?.metadata?.weight || 1);
  const isHeavy = matchWeight >= 1.2;
  const isLight = matchWeight <= 0.85;

  // ═══════════════════════════════════════════════════════
  // 1. CONTESTO E RISULTATO
  // ═══════════════════════════════════════════════════════
  {
    const items = [];
    items.push({
      text: `${won?'Vittoria':'Sconfitta'} ${setsWon}-${setsLost} contro ${oppName}${setsDetail?` (${setsDetail})`:''}. ${setsLost===0?'Prestazione dominante — tre set chiusi senza cedere un set.':setsWon===0?'Partita da analizzare in profondità: tre set ceduti.':`${setsWon} set vinti su ${setsWon+setsLost}.`}`,
      positive: won,
      tooltip: sets.length>0 ? { label:'Dettaglio set', values: sets.map(s=>`Set ${s.number}: ${s.ourScore}-${s.theirScore} (${s.won?'vinto':'perso'})`) } : null
    });

    if (tightSets.length>0) {
      items.push({
        text: `Set combattut${tightSets.length===1?'o':'i'} (distacco ≤3 pt): ${tightSets.map(s=>`Set ${s.number} (${s.ourScore}-${s.theirScore})`).join(', ')}. ${tightSets.every(s=>s.won)?'Vinti tutti: solidità mentale nei finali di set.':tightSets.every(s=>!s.won)?'Persi tutti: da migliorare la tenuta nei momenti decisivi.':'Risultato misto nei set equilibrati.'}`,
        positive: tightSets.every(s=>s.won) ? true : tightSets.every(s=>!s.won) ? false : null,
        tooltip: null
      });
    }

    if (Number.isFinite(matchWeight) && matchWeight !== 1) {
      const pesoLabel = isHeavy?'alta (partita importante)':isLight?'ridotta (partita meno impegnativa)':'nella norma';
      const factors = [];
      if (Number(pesoContesto.forzaAvv||0) > 0.3) factors.push('avversario sopra media');
      if (Number(pesoContesto.setCombattuti||0) > 0.3) factors.push('set combattuti');
      if (Number(pesoContesto.complessitaRally||0) > 0.3) factors.push('rally complessi');
      items.push({
        text: `Peso partita: ${matchWeight.toFixed(3)} — rilevanza ${pesoLabel}.${factors.length>0?` Fattori: ${factors.join(', ')}.':''} ${isHeavy?'Il risultato va letto in questo contesto di maggiore difficoltà.':isLight?'Prestazione su partita di peso inferiore alla media stagionale.':''}`,
        positive: null,
        tooltip: {
          label:'Peso partita',
          values: [
            `Peso totale: ${matchWeight.toFixed(3)}`,
            pesoContesto.forzaAvv!==undefined?`Forza avv.: ${Number(pesoContesto.forzaAvv).toFixed(3)}`:null,
            pesoContesto.performanceAvv!==undefined?`Perf. avv.: ${Number(pesoContesto.performanceAvv).toFixed(3)}`:null,
            pesoContesto.setCombattuti!==undefined?`Set combattuti: ${Number(pesoContesto.setCombattuti).toFixed(3)}`:null,
            pesoContesto.complessitaRally!==undefined?`Complessità rally: ${Number(pesoContesto.complessitaRally).toFixed(3)}`:null,
          ].filter(Boolean)
        }
      });
    }

    sections.push({ id:'result', title:'Contesto e Risultato', color:'indigo', items });
  }

  // ═══════════════════════════════════════════════════════
  // 2. LETTURA DEI FONDAMENTALI (con interdipendenze pallavolistiche)
  // ═══════════════════════════════════════════════════════
  {
    const items = [];
    // Interdipendenza: quale fondamentale avversario "spiega" il nostro
    const interDep = {
      reception: { oppKey:'serve',     dir:'passivo' },
      defense:   { oppKey:'attack',    dir:'passivo' },
      attack:    { oppKey:'defense',   dir:'attivo'  },
      serve:     { oppKey:'reception', dir:'attivo'  },
    };

    for (const fg of fundGaps) {
      let qualifier = Math.abs(fg.gap)>=threshBig?'netto vantaggio':Math.abs(fg.gap)>=threshMed?'vantaggio significativo':Math.abs(fg.gap)>=threshSm?'lieve vantaggio':'equilibrio';

      const dep = interDep[fg.key];
      const oppCtxVal = dep ? oppMetricPct(selectedOppAgg?.[dep.oppKey], dep.oppKey) : null;
      const oppCtxSeason = dep ? toPct(seasonAgg?.[dep.oppKey]?.[oppAvgKey]) : null;
      const oppCtxDelta = (oppCtxVal!==null && Number.isFinite(oppCtxSeason)) ? oppCtxVal - oppCtxSeason : null;

      let text = '';
      if (fg.gap > threshSm) {
        text = `${fg.label}: ${qualifier} nostro (${gapFmt(fg.gap)} ${metricLabel}).`;
        if (fg.vsAvgDelta!==null) text += ` Siamo ${fg.vsAvgDelta>0?'sopra':'sotto'} la nostra media stagionale di ${Math.abs(fg.vsAvgDelta).toFixed(isMP?2:1)}${isMP?'':'%'}.`;
        if (oppCtxDelta!==null) {
          if (fg.key==='reception' && oppCtxDelta>threshSm) text += ` Nonostante la battuta avversaria sopra media (${gapFmt(oppCtxDelta)}): ottima solidità ricettiva.`;
          else if (fg.key==='reception' && oppCtxDelta<-threshSm) text += ` Favorito da una battuta avversaria sotto la propria media (${gapFmt(oppCtxDelta)}).`;
          else if (fg.key==='defense' && oppCtxDelta>threshSm) text += ` Ottima difesa contro un attacco avversario sopra la propria media (${gapFmt(oppCtxDelta)}).`;
          else if (fg.key==='attack' && oppCtxDelta>threshSm) text += ` Particolarmente significativo: la difesa avversaria era sopra media (${gapFmt(oppCtxDelta)}).`;
        }
      } else if (fg.gap < -threshSm) {
        qualifier = qualifier.replace('vantaggio','svantaggio');
        text = `${fg.label}: ${qualifier} (${gapFmt(fg.gap)} ${metricLabel}).`;
        if (fg.vsAvgDelta!==null) text += ` Siamo ${fg.vsAvgDelta>0?'sopra':'sotto'} la nostra media stagionale di ${Math.abs(fg.vsAvgDelta).toFixed(isMP?2:1)}${isMP?'':'%'}.`;
        if (oppCtxDelta!==null) {
          if (fg.key==='reception' && oppCtxDelta>threshSm) text += ` La battuta avversaria era sopra media (${gapFmt(oppCtxDelta)}): spiega in parte la difficoltà ricettiva.`;
          else if (fg.key==='defense'  && oppCtxDelta>threshSm) text += ` L'attacco avversario era sopra media (${gapFmt(oppCtxDelta)}): la difesa ha fronteggiato una pressione superiore al solito.`;
          else if (fg.key==='attack'   && oppCtxDelta<-threshSm) text += ` Da attendersi di più: la difesa avversaria era sotto media (${gapFmt(oppCtxDelta)}).`;
          else if (fg.key==='serve'    && oppCtxDelta<-threshSm) text += ` La ricezione avversaria era sotto media (${gapFmt(oppCtxDelta)}): la battuta non ha sfruttato questa fragilità.`;
        }
      } else {
        text = `${fg.label}: sostanziale ${qualifier} tra le due squadre (${gapFmt(fg.gap)}).`;
      }

      items.push({
        text, positive: fg.gap>threshSm?true:fg.gap<-threshSm?false:null,
        highlight: Math.abs(fg.gap)>=threshMed,
        tooltip: { label:`${fg.label} — Dati`, values:fg.tooltipVals }
      });
    }

    if (items.length>0) sections.push({ id:'fundamentals', title:'Lettura dei Fondamentali', color:'violet', items });
  }

  // ═══════════════════════════════════════════════════════
  // 3. CATENA DEL GIOCO
  // ═══════════════════════════════════════════════════════
  {
    const items = [];
    const giocoData = match?.gioco;
    const atkFromRec = giocoData?.attackFromReception || {};
    const atkFromDef = giocoData?.attackFromDefense   || {};

    const calcGKR = (entries) => {
      if (!entries||entries.length===0) return null;
      const tot = entries.reduce((s,e)=>s+safeN(e.attacks),0);
      if (tot===0) return null;
      let pts=0,errs=0;
      for (const e of entries) { const p=String(e.pointsStr||'').split('-'); pts+=parseInt(p[0])||0; errs+=parseInt(p[1])||0; }
      return { totAtt:tot, totKills:pts, totErrs:errs, killRate:pts/tot*100, errRate:errs/tot*100,
               roles: entries.filter(e=>e.role&&e.attacks>0).map(e=>`${e.role}: ${e.attacks} att.`) };
    };

    const recR5 = calcGKR(atkFromRec.R5);
    const recR4 = calcGKR(atkFromRec.R4);
    const recR3 = calcGKR(atkFromRec.R3);

    // Chain A: Battuta avv → Ricezione nostra (narrative header)
    const ourRecVal  = metricFromRaw(team?.reception, 'reception');
    const oppSrvVal  = oppMetricPct(selectedOppAgg?.serve, 'serve');
    const ourRecSea  = seasonTeamAvg?.reception?.[perfAvgKey];
    const oppSrvSea  = toPct(seasonAgg?.serve?.[oppAvgKey]);
    const recAboveAvg = (ourRecVal!==null && Number.isFinite(ourRecSea)) ? ourRecVal-ourRecSea : null;
    const srvAboveAvg = (oppSrvVal!==null && Number.isFinite(oppSrvSea)) ? oppSrvVal-oppSrvSea : null;

    if (ourRecVal!==null && oppSrvVal!==null) {
      let txt = `Catena Battuta Avv.→Ricezione: battuta ${oppName} ${valFmt(oppSrvVal)}${srvAboveAvg!==null?` (${gapFmt(srvAboveAvg)} vs loro media)`:''}  →  nostra ricezione ${valFmt(ourRecVal)}${recAboveAvg!==null?` (${gapFmt(recAboveAvg)} vs nostra media)`:''}. `;
      if (srvAboveAvg!==null && recAboveAvg!==null) {
        if (srvAboveAvg>threshSm && recAboveAvg>0)      txt += 'Ottima ricezione nonostante battuta avversaria sopra media.';
        else if (srvAboveAvg<-threshSm && recAboveAvg>threshSm) txt += 'Battuta avversaria sotto media ha facilitato la nostra ricezione.';
        else if (srvAboveAvg>threshSm && recAboveAvg<-threshSm) txt += 'La battuta avversaria sopra media ha messo in difficoltà la nostra ricezione.';
      }
      items.push({ text:txt, positive:recAboveAvg!==null?recAboveAvg>0:null,
        tooltip:{ label:'Battuta Avv → Ricezione', values:[
          `Battuta ${oppName}: ${valFmt(oppSrvVal)}${srvAboveAvg!==null?` (vs media: ${gapFmt(srvAboveAvg)})`:''}`,
          `Ricezione nostra: ${valFmt(ourRecVal)}${recAboveAvg!==null?` (vs media: ${gapFmt(recAboveAvg)})`:''}`,
        ]}
      });
    }

    // R5/R4/R3 kill-rate chain (1° tocco → 3° tocco)
    const chainParts = [];
    if (recR5&&recR5.totAtt>0) chainParts.push(`R5→${recR5.killRate.toFixed(0)}% kill (${recR5.totKills}/${recR5.totAtt})`);
    if (recR4&&recR4.totAtt>0) chainParts.push(`R4→${recR4.killRate.toFixed(0)}% kill (${recR4.totKills}/${recR4.totAtt})`);
    if (recR3&&recR3.totAtt>0) chainParts.push(`R3→${recR3.killRate.toFixed(0)}% kill (${recR3.totKills}/${recR3.totAtt})`);
    if (chainParts.length>0) {
      const drop = (recR5&&recR3) ? recR5.killRate-recR3.killRate : (recR5&&recR4) ? recR5.killRate-recR4.killRate : null;
      let dropNarr = '';
      if (drop!==null) {
        if (drop>30)      dropNarr = ` Forte dipendenza dal primo tocco: calo di ${drop.toFixed(0)}% con ricezione imperfetta — semplificare le scelte con palla neutra.`;
        else if (drop>15) dropNarr = ` Calo fisiologico (${drop.toFixed(0)}%) con ricezione imprecisa: nella norma.`;
        else              dropNarr = ` Ottima resilienza offensiva: kill rate quasi invariata anche con ricezione non perfetta.`;
      }
      items.push({ text:`Impatto 1° tocco sull'attacco (catena ricezione→attacco): ${chainParts.join('  →  ')}.${dropNarr}`,
        positive: recR5?recR5.killRate>=35:null,
        tooltip:{ label:'Kill rate per qualità ricezione', values:[
          recR5?`Da R5 (perfetta): ${recR5.totKills}/${recR5.totAtt} = ${recR5.killRate.toFixed(1)}%`:null,
          recR4?`Da R4 (positiva): ${recR4.totKills}/${recR4.totAtt} = ${recR4.killRate.toFixed(1)}%`:null,
          recR3?`Da R3 (neutra):   ${recR3.totKills}/${recR3.totAtt} = ${recR3.killRate.toFixed(1)}%`:null,
          drop!==null?`Calo R5→${recR3?'R3':'R4'}: ${drop.toFixed(1)}%`:null,
        ].filter(Boolean)}
      });
    }

    // Chain B: Battuta nostra → Ricezione avv
    const ourSrvVal = metricFromRaw(team?.serve,'serve');
    const oppRecVal = oppMetricPct(selectedOppAgg?.reception,'reception');
    const ourSrvSea = seasonTeamAvg?.serve?.[perfAvgKey];
    const oppRecSea = toPct(seasonAgg?.reception?.[oppAvgKey]);
    const srvOurAbove = (ourSrvVal!==null && Number.isFinite(ourSrvSea)) ? ourSrvVal-ourSrvSea : null;
    const recOppAbove = (oppRecVal!==null && Number.isFinite(oppRecSea)) ? oppRecVal-oppRecSea : null;

    if (ourSrvVal!==null && oppRecVal!==null) {
      let txt = `Catena Battuta Nostra→Ricezione Avv.: nostra battuta ${valFmt(ourSrvVal)}${srvOurAbove!==null?` (${gapFmt(srvOurAbove)} vs nostra media)`:''}  →  ricezione ${oppName} ${valFmt(oppRecVal)}${recOppAbove!==null?` (${gapFmt(recOppAbove)} vs loro media)`:''}. `;
      if (srvOurAbove!==null && recOppAbove!==null) {
        if (srvOurAbove>threshSm && recOppAbove<-threshSm)  txt += 'Effetto pressione dimostrato: la nostra battuta sopra media ha degradato la loro ricezione.';
        else if (srvOurAbove>threshSm && recOppAbove>0)     txt += `Nonostante la nostra battuta sopra media, ${oppName} ha ricevuto bene.`;
        else if (srvOurAbove<-threshSm)                      txt += 'La nostra battuta sotto media non ha creato la pressione attesa.';
      }
      items.push({ text:txt,
        positive: (srvOurAbove!==null&&srvOurAbove>0&&recOppAbove!==null&&recOppAbove<0)?true:null,
        tooltip:{ label:'Battuta Nostra → Ricezione Avv.', values:[
          `Nostra battuta: ${valFmt(ourSrvVal)}${srvOurAbove!==null?` (vs media: ${gapFmt(srvOurAbove)})`:''}`,
          `Ricezione ${oppName}: ${valFmt(oppRecVal)}${recOppAbove!==null?` (vs media: ${gapFmt(recOppAbove)})`:''}`,
        ]}
      });
    }

    // Chain C: Attacco avv → Difesa nostra
    const oppAtkVal = oppMetricPct(selectedOppAgg?.attack,'attack');
    const ourDefVal = metricFromRaw(team?.defense,'defense');
    const oppAtkSea = toPct(seasonAgg?.attack?.[oppAvgKey]);
    const ourDefSea = seasonTeamAvg?.defense?.[perfAvgKey];
    const atkOppAbove = (oppAtkVal!==null && Number.isFinite(oppAtkSea)) ? oppAtkVal-oppAtkSea : null;
    const defOurAbove = (ourDefVal!==null && Number.isFinite(ourDefSea)) ? ourDefVal-ourDefSea : null;

    if (oppAtkVal!==null && ourDefVal!==null) {
      let txt = `Catena Attacco Avv.→Difesa Nostra: attacco ${oppName} ${valFmt(oppAtkVal)}${atkOppAbove!==null?` (${gapFmt(atkOppAbove)} vs loro media)`:''}  →  nostra difesa ${valFmt(ourDefVal)}${defOurAbove!==null?` (${gapFmt(defOurAbove)} vs nostra media)`:''}. `;
      if (atkOppAbove!==null && defOurAbove!==null) {
        if (atkOppAbove>threshSm && defOurAbove>0)      txt += 'Ottima risposta difensiva contro un attacco avversario sopra media.';
        else if (atkOppAbove<-threshSm && defOurAbove>0) txt += 'Difesa facilitata da un attacco avversario sotto media.';
        else if (atkOppAbove>threshSm && defOurAbove<-threshSm) txt += 'La difesa ha faticato contro un attacco avversario particolarmente efficace.';
      }
      items.push({ text:txt, positive:defOurAbove!==null?defOurAbove>0:null,
        tooltip:{ label:'Attacco Avv. → Difesa Nostra', values:[
          `Attacco ${oppName}: ${valFmt(oppAtkVal)}${atkOppAbove!==null?` (vs media: ${gapFmt(atkOppAbove)})`:''}`,
          `Nostra difesa: ${valFmt(ourDefVal)}${defOurAbove!==null?` (vs media: ${gapFmt(defOurAbove)})`:''}`,
        ]}
      });
    }

    // Phase dominance
    if (soPct!==null && bpPct!==null && soRallies.length>=5 && bpRallies.length>=5) {
      const domPhase  = soPct>bpPct?'side-out':'break-point';
      const weakPhase = soPct>bpPct?'break-point':'side-out';
      const delta = Math.abs(soPct-bpPct);
      items.push({ text:`Fase dominante: ${domPhase} (${Math.max(soPct,bpPct).toFixed(0)}%). ${delta>=15?`Netto squilibrio verso la fase ${domPhase}.`:delta>=8?`Leggero predominio in ${domPhase}.`:'Equilibrio tra le due fasi.'} La fase ${weakPhase} è risultata più critica (${Math.min(soPct,bpPct).toFixed(0)}%).`,
        positive: null,
        tooltip:{ label:'Side-out vs Break-point', values:[`SO: ${soWon}/${soRallies.length} = ${soPct.toFixed(1)}%`,`BP: ${bpWon}/${bpRallies.length} = ${bpPct.toFixed(1)}%`]}
      });
    }

    if (items.length>0) sections.push({ id:'chain', title:'Catena del Gioco', color:'emerald', items });
  }

  // ═══════════════════════════════════════════════════════
  // 4. CONVERSIONE DAL PRIMO TOCCO
  // ═══════════════════════════════════════════════════════
  {
    const items = [];
    const giocoData = match?.gioco;
    const atkFromRec = giocoData?.attackFromReception || {};
    const atkFromDef = giocoData?.attackFromDefense   || {};

    const calcGKR = (entries) => {
      if (!entries||entries.length===0) return null;
      const tot=entries.reduce((s,e)=>s+safeN(e.attacks),0); if(!tot) return null;
      let pts=0,errs=0;
      for(const e of entries){const p=String(e.pointsStr||'').split('-');pts+=parseInt(p[0])||0;errs+=parseInt(p[1])||0;}
      return {totAtt:tot,totKills:pts,totErrs:errs,killRate:pts/tot*100};
    };

    // Transformer analysis: who maintains kill rate from imperfect reception?
    const roleConv = {};
    for (const rk of ['R5','R4','R3']) {
      for (const entry of (atkFromRec[rk]||[])) {
        if (!entry.role||!entry.attacks) continue;
        if (!roleConv[entry.role]) roleConv[entry.role]={};
        const p=String(entry.pointsStr||'').split('-');
        roleConv[entry.role][rk]={ attacks:entry.attacks, pts:parseInt(p[0])||0, kr:entry.attacks>0?(parseInt(p[0])||0)/entry.attacks*100:0 };
      }
    }

    const transformers = [];
    for (const [role,data] of Object.entries(roleConv)) {
      const good = data.R5;
      const imp  = data.R3 || data.R4;
      const impLbl = data.R3?'R3':'R4';
      if (good&&imp&&good.attacks>=2&&imp.attacks>=2) {
        transformers.push({ role, r5KR:good.killRate, impKR:imp.killRate, impLbl, delta:good.killRate-imp.killRate, r5Att:good.attacks, impAtt:imp.attacks });
      }
    }

    if (transformers.length>0) {
      const good = transformers.filter(t=>t.delta<10).sort((a,b)=>b.impKR-a.impKR);
      const poor = transformers.filter(t=>t.delta>25).sort((a,b)=>b.delta-a.delta);
      if (good.length>0) items.push({ text:`Trasformatori efficaci da ricezione imperfetta: ${good.map(t=>`${t.role} (${t.impLbl}→${t.impKR.toFixed(0)}% kill, calo solo ${t.delta.toFixed(0)}%)`).join(', ')}. Valorizzarli anche con palla neutra.`,
        positive:true, tooltip:{ label:'Attaccanti da primo tocco imperfetto', values:good.map(t=>`${t.role}: R5=${t.r5KR.toFixed(0)}% (${t.r5Att}att), ${t.impLbl}=${t.impKR.toFixed(0)}% (${t.impAtt}att)`) }
      });
      if (poor.length>0) items.push({ text:`Terminali dipendenti dalla qualità ricezione: ${poor.map(t=>`${t.role} (calo ${t.delta.toFixed(0)}% da R5 a ${t.impLbl})`).join(', ')}. Con palla neutra il palleggiatore dovrebbe privilegiare altri terminali.`,
        positive:false, tooltip:{ label:'Dipendenti dal primo tocco', values:poor.map(t=>`${t.role}: R5=${t.r5KR.toFixed(0)}%, ${t.impLbl}=${t.impKR.toFixed(0)}%, calo=${t.delta.toFixed(0)}%`) }
      });
    }

    // Setter distribution from imperfect (R3/R4) — scelte con palla difficile
    const r3r4entries = [...(atkFromRec.R3||[]),...(atkFromRec.R4||[])];
    const roleImp = {};
    for (const e of r3r4entries) {
      if (!e.role) continue;
      if (!roleImp[e.role]) roleImp[e.role]={attacks:0,pts:0};
      roleImp[e.role].attacks += e.attacks||0;
      const p=String(e.pointsStr||'').split('-'); roleImp[e.role].pts+=parseInt(p[0])||0;
    }
    const totImp = Object.values(roleImp).reduce((s,v)=>s+v.attacks,0);
    if (totImp>=5) {
      const arr = Object.entries(roleImp).filter(([,v])=>v.attacks>=2)
        .map(([role,d])=>({role,...d,kr:d.attacks>0?d.pts/d.attacks*100:0}))
        .sort((a,b)=>b.kr-a.kr);
      if (arr.length>=2) {
        const best=arr[0], worst=arr[arr.length-1];
        const warn = worst.attacks>=4&&worst.kr<25 ? ` ⚠ ${worst.role} usato ${worst.attacks} volte con palla difficile ma KR solo ${worst.kr.toFixed(0)}%: redistribuire.` : '';
        items.push({ text:`Scelte regia con 1° tocco imperfetto (R3/R4 — ${totImp} att. totali): miglior conversione ${best.role} (KR ${best.kr.toFixed(0)}%); peggiore ${worst.role} (KR ${worst.kr.toFixed(0)}%).${warn}`,
          positive:best.kr>=30, tooltip:{ label:'Distribuzione da R3/R4', values:arr.map(r=>`${r.role}: ${r.attacks} att. → KR ${r.kr.toFixed(0)}%`) }
        });
      }
    }

    // Defense → counter-attack
    const defD5=calcGKR(atkFromDef?.D5), defD4=calcGKR(atkFromDef?.D4), defD3=calcGKR(atkFromDef?.D3);
    const defParts=[];
    if(defD5&&defD5.totAtt>0) defParts.push(`D5→${defD5.killRate.toFixed(0)}%`);
    if(defD4&&defD4.totAtt>0) defParts.push(`D4→${defD4.killRate.toFixed(0)}%`);
    if(defD3&&defD3.totAtt>0) defParts.push(`D3→${defD3.killRate.toFixed(0)}%`);
    if (defParts.length>0) {
      const defRef=defD5; const defImp=defD3||defD4; const defImpLbl=defD3?'D3':'D4';
      const defDrop = (defRef&&defImp) ? defRef.killRate-defImp.killRate : null;
      items.push({ text:`Conversione in contrattacco (difesa→attacco): ${defParts.join('  →  ')}.${defDrop!==null?` ${Math.abs(defDrop)<15?'Buona gestione anche da difese difficili.':defDrop>20?`Calo di ${defDrop.toFixed(0)}% dalla difesa imperfetta: il contrattacco dipende dalla qualità del primo tocco difensivo.`:''}':''}`,
        positive:defD5?defD5.killRate>=35:null,
        tooltip:{ label:'Contrattacco per qualità difesa', values:[defD5?`D5: ${defD5.totKills}/${defD5.totAtt}=${defD5.killRate.toFixed(1)}%`:null, defD4?`D4: ${defD4.totKills}/${defD4.totAtt}=${defD4.killRate.toFixed(1)}%`:null, defD3?`D3: ${defD3.totKills}/${defD3.totAtt}=${defD3.killRate.toFixed(1)}%`:null].filter(Boolean) }
      });
    }

    if (items.length>0) sections.push({ id:'conversion', title:'Conversione dal Primo Tocco', color:'teal', items });
  }

  // ═══════════════════════════════════════════════════════
  // 5. ANALISI REGIA
  // ═══════════════════════════════════════════════════════
  {
    const items = [];
    const giocoData  = match?.gioco;
    const atkFromRec = giocoData?.attackFromReception||{};
    const atkFromDef = giocoData?.attackFromDefense||{};
    const pStats = match?.riepilogo?.playerStats||[];
    const pDef   = match?.riepilogo?.playerDefense||[];
    const roster = match?.roster||[];
    const matchRallies = match?.rallies||[];

    // Identify setter from P1-phase rallies
    const setterNums = new Set();
    for (const rl of matchRallies) {
      if (rl.rotation===1 && rl.phase==='b') {
        let srv = rl.server?String(rl.server).padStart(2,'0'):null;
        if (!srv) { const t=(rl.quartine||[]).find(t=>t.type==='action'&&String(t.fundamental||'').toLowerCase()==='b'); if(t?.player) srv=String(t.player).padStart(2,'0'); }
        if (srv) setterNums.add(srv);
      }
    }
    let setters = setterNums.size>0
      ? roster.filter(r=>setterNums.has(String(r.number).padStart(2,'0')))
      : roster.filter(r=>/^P\d?$/i.test(r.role)||/palleggiator/i.test(r.role)).filter(s=>pStats.find(p=>String(p.number)===String(s.number)));

    if (setters.length>0 && giocoData) {
      const setter = setters[0];
      const sNick = setter.nickname||(setter.name||setter.surname||'').trim().split(/\s+/)[0]||'#'+setter.number;

      const roleAtt={};
      const allEntries=[...(atkFromRec.R5||[]),...(atkFromRec.R4||[]),...(atkFromRec.R3||[]),...(atkFromDef.D5||[]),...(atkFromDef.D4||[]),...(atkFromDef.D3||[])];
      for (const e of allEntries) {
        if (!e.role) continue;
        if (!roleAtt[e.role]) roleAtt[e.role]={attacks:0,pts:0,errs:0};
        roleAtt[e.role].attacks+=e.attacks||0;
        const p=String(e.pointsStr||'').split('-'); roleAtt[e.role].pts+=parseInt(p[0])||0; roleAtt[e.role].errs+=parseInt(p[1])||0;
      }
      const totDist = Object.values(roleAtt).reduce((s,r)=>s+r.attacks,0);

      if (totDist>0) {
        const roleEntries = Object.entries(roleAtt).filter(([,v])=>v.attacks>0).sort((a,b)=>b[1].attacks-a[1].attacks);
        const top = roleEntries[0];
        const topPct = ((top[1].attacks/totDist)*100).toFixed(0);
        const isBalanced = roleEntries.length>=3 && (top[1].attacks/totDist)<0.40;
        const isSingleGen = roleEntries.length===1 && /^ATT$/i.test(top[0]);

        items.push({
          text: isSingleGen ? `Regia di ${sNick}: ${totDist} palloni distribuiti (dati per ruolo non disponibili).`
            : isBalanced   ? `Regia di ${sNick}: ${totDist} palloni distribuiti in modo equilibrato tra i terminali — gestione versatile delle opzioni offensive.`
            :                `Regia di ${sNick}: ${totDist} palloni distribuiti. Gioco polarizzato su ${top[0]} (${topPct}% dei palloni).`,
          positive: isSingleGen?null:isBalanced,
          tooltip:{ label:`Distribuzione (${sNick})`, values:roleEntries.map(([role,d])=>`${role}: ${d.attacks}att (${((d.attacks/totDist)*100).toFixed(0)}%) → KR ${(d.attacks>0?(d.pts/d.attacks*100):0).toFixed(0)}%`) }
        });

        // Attacker efficiency
        const attEff = roleEntries.filter(([,v])=>v.attacks>=3)
          .map(([role,d])=>({role,attacks:d.attacks,kr:d.attacks>0?d.pts/d.attacks*100:0,err:d.attacks>0?d.errs/d.attacks*100:0}))
          .sort((a,b)=>b.kr-a.kr);
        if (attEff.length>=2) {
          const best=attEff[0], worst=attEff[attEff.length-1];
          items.push({ text:`Efficacia per terminale: ${best.role} KR ${best.kr.toFixed(0)}% (${best.attacks}att)${worst.kr<25&&worst.attacks>=5?`; ⚠ ${worst.role} in difficoltà KR ${worst.kr.toFixed(0)}% (${worst.attacks}att) — valutare redistribuzione`:'.'  }`,
            positive:best.kr>=30, tooltip:{ label:"Efficacia per terminale", values:attEff.map(a=>`${a.role}: KR ${a.kr.toFixed(1)}%, err ${a.err.toFixed(1)}% (${a.attacks}att)`) }
          });
        }
      }

      // Setter technical performance
      const setterPS  = pStats.find(p=>p.number===setter.number);
      const setterDef = pDef.find(p=>p.number===setter.number);
      const tech=[];
      if (setterDef?.tot>0) { const v=teamMetricPct(setterDef,null,'defense'); if(v!==null) tech.push(`Difesa: ${valFmt(v)}`); }
      if (setterPS?.serve?.tot>0) { const v=teamMetricPct(setterPS.serve,null,'serve'); if(v!==null) tech.push(`Battuta: ${valFmt(v)}`); }
      if (tech.length>0) items.push({ text:`Performance tecnica ${sNick}: ${tech.join('; ')}.`, positive:null, tooltip:{label:`${sNick} — tecnica`,values:tech} });

      // Rotation-specific suboptimal choices
      if (matchRallies.length>0) {
        const rotChoices={};
        for (const r of matchRallies) {
          if (!r.rotation||!r.attackRole) continue;
          const k=`P${r.rotation}-${r.phase==='r'?'SO':'BP'}`;
          if (!rotChoices[k]) rotChoices[k]={};
          if (!rotChoices[k][r.attackRole]) rotChoices[k][r.attackRole]={total:0,pts:0};
          rotChoices[k][r.attackRole].total++;
          if (r.isPoint) rotChoices[k][r.attackRole].pts++;
        }
        const subopt=[];
        for (const [rp,roles] of Object.entries(rotChoices)) {
          const arr=Object.entries(roles).filter(([,d])=>d.total>=2).map(([role,d])=>({role,...d,kr:d.pts/d.total*100})).sort((a,b)=>b.total-a.total);
          if (arr.length>=2) {
            const mu=arr[0], alt=arr.slice(1).find(r=>r.kr>mu.kr+10&&r.total>=2);
            if (alt&&mu.kr<30) subopt.push({rp,mu,alt});
          }
        }
        for (const it of subopt.slice(0,2)) {
          items.push({ text:`In ${it.rp}: terminale più usato ${it.mu.role} (${it.mu.total}att, KR ${it.mu.kr.toFixed(0)}%) ha reso meno di ${it.alt.role} (${it.alt.total}att, KR ${it.alt.kr.toFixed(0)}%). Scelta potenzialmente subottimale.`,
            positive:false, tooltip:{label:`Scelta in ${it.rp}`,values:[`${it.mu.role}: ${it.mu.pts}/${it.mu.total}=KR ${it.mu.kr.toFixed(1)}%`,`${it.alt.role}: ${it.alt.pts}/${it.alt.total}=KR ${it.alt.kr.toFixed(1)}%`]}
          });
        }
      }
    }

    if (items.length>0) sections.push({ id:'setter', title:'Analisi Regia', color:'purple', items });
  }

  // ═══════════════════════════════════════════════════════
  // 6. INCASTRI DI ROTAZIONE
  // ═══════════════════════════════════════════════════════
  {
    const items = [];
    const giocoData = match?.gioco;
    const riepilogoRotations = match?.riepilogo?.rotations||[];

    if (riepilogoRotations.length>0) {
      const rots = riepilogoRotations.map(r=>({...r,
        made:safeN(r.pointsMade?.total), lost:safeN(r.pointsLost?.total), total:safeN(r.totalPoints?.total),
        balance:safeN(r.pointsMade?.total)-safeN(r.pointsLost?.total),
        ratio:safeN(r.totalPoints?.total)>0?safeN(r.pointsMade?.total)/safeN(r.totalPoints?.total):0
      })).filter(r=>r.total>0).sort((a,b)=>b.ratio-a.ratio);

      if (rots.length>=2) {
        const best=rots[0], worst=rots[rots.length-1];
        items.push({ text:`Rotazione più produttiva: P${best.rotation} (${best.made} fatti / ${best.lost} persi, bilancio ${best.balance>0?'+':''}${best.balance}, ratio ${(best.ratio*100).toFixed(0)}%).`, positive:true,
          tooltip:{label:`P${best.rotation}`,values:[`Punti fatti: ${best.made}`,`Punti persi: ${best.lost}`,`Bilancio: ${best.balance>0?'+':''}${best.balance}`, best.lineup?`Formazione: ${best.lineup}`:null].filter(Boolean)}
        });
        items.push({ text:`Rotazione più critica: P${worst.rotation} (${worst.made} fatti / ${worst.lost} persi, bilancio ${worst.balance>0?'+':''}${worst.balance}). Da analizzare.`, positive:false,
          tooltip:{label:`P${worst.rotation}`,values:[`Punti fatti: ${worst.made}`,`Punti persi: ${worst.lost}`,`Bilancio: ${worst.balance>0?'+':''}${worst.balance}`, worst.lineup?`Formazione: ${worst.lineup}`:null].filter(Boolean)}
        });
      }
    }

    if (giocoData?.receptionByRotation?.length>0) {
      const rbr = giocoData.receptionByRotation.filter(r=>safeN(r.total)>0)
        .map(r=>({...r, pp:(safeN(r.R5)+safeN(r.R4))/safeN(r.total)*100, errPct:safeN(r.R1)/safeN(r.total)*100}))
        .sort((a,b)=>b.pp-a.pp);
      if (rbr.length>=2) {
        const b=rbr[0], w=rbr[rbr.length-1];
        items.push({ text:`Ricezione migliore in ${b.rotation}: ${b.pp.toFixed(0)}% R4+R5 — ottima piattaforma per il gioco offensivo.`, positive:true,
          tooltip:{label:`Ricezione ${b.rotation}`,values:[`R5: ${safeN(b.R5)}`,`R4: ${safeN(b.R4)}`,`R3: ${safeN(b.R3)}`,`R1 (err): ${safeN(b.R1)}`,`Totale: ${safeN(b.total)}`]}
        });
        if (w.rotation!==b.rotation) items.push({ text:`Ricezione più difficoltosa in ${w.rotation}: ${w.pp.toFixed(0)}% R4+R5 (${w.errPct.toFixed(0)}% errori). Costruzione complessa da questa rotazione.`, positive:false,
          tooltip:{label:`Ricezione ${w.rotation}`,values:[`R5: ${safeN(w.R5)}`,`R4: ${safeN(w.R4)}`,`R3: ${safeN(w.R3)}`,`R1 (err): ${safeN(w.R1)}`,`Totale: ${safeN(w.total)}`]}
        });
      }
    }

    if (rallies.length>0) {
      const srvByRot={}, recByRot={};
      for (const r of rallies) {
        if (!r.rotation) continue;
        const k=`P${r.rotation}`;
        if (r.phase==='b') { if(!srvByRot[k]) srvByRot[k]={total:0,won:0}; srvByRot[k].total++; if(r.isPoint) srvByRot[k].won++; }
        else if (r.phase==='r') { if(!recByRot[k]) recByRot[k]={total:0,won:0}; recByRot[k].total++; if(r.isPoint) recByRot[k].won++; }
      }
      const sA=Object.entries(srvByRot).map(([rot,d])=>({rot,...d,pct:d.total>0?d.won/d.total*100:0})).filter(d=>d.total>=3).sort((a,b)=>b.pct-a.pct);
      const rA=Object.entries(recByRot).map(([rot,d])=>({rot,...d,pct:d.total>0?d.won/d.total*100:0})).filter(d=>d.total>=3).sort((a,b)=>b.pct-a.pct);

      if (sA.length>=1) {
        items.push({ text:`Break-point migliore: rotazione ${sA[0].rot} → ${sA[0].won}/${sA[0].total} BP (${sA[0].pct.toFixed(0)}%).`, positive:true, tooltip:{label:'BP per rotazione',values:sA.slice(0,6).map(d=>`${d.rot}: ${d.won}/${d.total} (${d.pct.toFixed(0)})%`)} });
        if (sA.length>=2 && sA[sA.length-1].pct<45) { const w=sA[sA.length-1]; items.push({ text:`Break-point critico: rotazione ${w.rot} → solo ${w.won}/${w.total} BP (${w.pct.toFixed(0)}%).`, positive:false, tooltip:{label:`BP critico — ${w.rot}`,values:[`${w.won}/${w.total}=${w.pct.toFixed(1)}%`]} }); }
      }
      if (rA.length>=1 && rA[0].pct>=55) {
        items.push({ text:`Side-out efficace in ${rA[0].rot}: ${rA[0].won}/${rA[0].total} (${rA[0].pct.toFixed(0)}%).`, positive:true, tooltip:{label:'SO per rotazione',values:rA.slice(0,6).map(d=>`${d.rot}: ${d.won}/${d.total} (${d.pct.toFixed(0)})%`)} });
      }
      if (rA.length>=2 && rA[rA.length-1].pct<45 && rA[rA.length-1].rot!==rA[0].rot) { const w=rA[rA.length-1]; items.push({ text:`Side-out difficoltoso in ${w.rot}: ${w.won}/${w.total} (${w.pct.toFixed(0)}%). La battuta di ${oppName} ha creato problemi.`, positive:false, tooltip:{label:`SO critico — ${w.rot}`,values:[`${w.won}/${w.total}=${w.pct.toFixed(1)}%`]} }); }

      // B1 vs B2
      const rc = analyzeRotationalChains([match]);
      if (rc.rolePerformance?.B1 && rc.rolePerformance?.B2) {
        const b1=rc.rolePerformance.B1, b2=rc.rolePerformance.B2;
        const gap=(b1.attackEff-b2.attackEff)*100;
        if (Math.abs(gap)>=10) items.push({ text:`Profilo bande: ${gap>0?'B1':'B2'} superiore in attacco (${Math.round(Math.max(b1.attackEff,b2.attackEff)*100)}% eff. vs ${Math.round(Math.min(b1.attackEff,b2.attackEff)*100)}%). Il palleggiatore dovrebbe prediligere il terminale più efficace.`, positive:true, tooltip:{label:'B1 vs B2',values:[`B1: ${Math.round(b1.attackEff*100)}% / ${b1.totals.attack}att`,`B2: ${Math.round(b2.attackEff*100)}% / ${b2.totals.attack}att`]} });
      }

      // Matchup matrix
      const oppStart={};
      for (const s of sets) { if(s.oppStartRotation>=1&&s.oppStartRotation<=6) oppStart[s.number]=s.oppStartRotation; }
      if (Object.keys(oppStart).length>0) {
        const ann = trackOpponentRotations(rallies, oppStart);
        const { summary } = computeMatchupMatrix(ann);
        if (summary.totalAnnotated>10) {
          if (summary.bestMatchup) {
            const bm=summary.bestMatchup, net=bm.ourPts-bm.theirPts;
            items.push({ text:`Incastro favorevole: P${bm.us} vs loro P${bm.them} → netto ${net>0?'+':''}${net}.${bm.breakPoint.total>0?` BP: ${bm.breakPoint.won}/${bm.breakPoint.total} (${(bm.breakPoint.won/bm.breakPoint.total*100).toFixed(0)}%).`:''}`, positive:true, tooltip:{label:`Matchup P${bm.us} vs P${bm.them}`,values:[`Totale: ${bm.total}`,`Netto: ${net>0?'+':''}${net}`]} });
          }
          if (summary.worstMatchup && summary.worstMatchup!==summary.bestMatchup) {
            const wm=summary.worstMatchup, net=wm.ourPts-wm.theirPts;
            items.push({ text:`Incastro sfavorevole: P${wm.us} vs loro P${wm.them} → netto ${net>0?'+':''}${net}. Questo incastro ha favorito ${oppName}.`, positive:false, tooltip:{label:`Matchup P${wm.us} vs P${wm.them}`,values:[`Totale: ${wm.total}`,`Netto: ${net>0?'+':''}${net}`]} });
          }
        }
      }
    }

    if (items.length>0) sections.push({ id:'rotations', title:'Incastri di Rotazione', color:'amber', items });
  }

  // ═══════════════════════════════════════════════════════
  // 7. PROTAGONISTI DELLA PARTITA
  // ═══════════════════════════════════════════════════════
  {
    const items = [];
    const pStats = match?.riepilogo?.playerStats||[];
    const pRec   = match?.riepilogo?.playerReception||[];
    const pDef   = match?.riepilogo?.playerDefense||[];
    const roster = match?.roster||[];

    // Season averages per player (excluding current match)
    const pAvg = {};
    if (matchAnalytics.length>1) {
      const acc={};
      for (const ma of matchAnalytics) {
        if (ma.match?.id===match?.id) continue;
        const ps=ma.match?.riepilogo?.playerStats||[], pr=ma.match?.riepilogo?.playerReception||[], pd=ma.match?.riepilogo?.playerDefense||[];
        for (const p of ps) {
          if (!p.number) continue;
          if (!acc[p.number]) acc[p.number]={serve:[],attack:[],defense:[],reception:[]};
          if (p.serve?.tot>0) acc[p.number].serve.push(teamMetricPct(p.serve,null,'serve'));
          if (p.attack?.tot>0) acc[p.number].attack.push(teamMetricPct(p.attack,null,'attack'));
        }
        for (const p of pr) { if (!p.number) continue; if (!acc[p.number]) acc[p.number]={serve:[],attack:[],defense:[],reception:[]}; if(p.tot>0) acc[p.number].reception.push(teamMetricPct(p,null,'reception')); }
        for (const p of pd) { if (!p.number) continue; if (!acc[p.number]) acc[p.number]={serve:[],attack:[],defense:[],reception:[]}; if(p.tot>0) acc[p.number].defense.push(teamMetricPct(p,null,'defense')); }
      }
      for (const [num,a] of Object.entries(acc)) {
        const avg={};
        for (const f of ['serve','attack','defense','reception']) { const vals=a[f].filter(v=>v!==null&&Number.isFinite(v)); avg[f]=vals.length>=2?vals.reduce((s,v)=>s+v,0)/vals.length:null; }
        pAvg[num]=avg;
      }
    }

    const playerPerf=[];
    for (const p of pStats) {
      if (!p.number) continue;
      const recData=pRec.find(r=>r.number===p.number), defData=pDef.find(d=>d.number===p.number);
      const avg=pAvg[p.number];
      const re=roster.find(r=>r.number===p.number);
      const nick=re?.nickname||(p.name||'').trim().split(/\s+/)[0]||p.number;
      const deltas=[];
      for (const fm of [{key:'serve',label:'Battuta',data:p.serve},{key:'attack',label:'Attacco',data:p.attack},{key:'reception',label:'Ricezione',data:recData},{key:'defense',label:'Difesa',data:defData}]) {
        const mv=fm.data?.tot>0?teamMetricPct(fm.data,null,fm.key):null;
        const av=avg?.[fm.key];
        if (mv!==null&&av!==null&&Number.isFinite(av)) deltas.push({key:fm.key,label:fm.label,matchVal:mv,avgVal:av,delta:mv-av,tot:fm.data?.tot||0});
      }
      const sd=deltas.filter(d=>d.tot>=3);
      const avgDelta=sd.length>0?sd.reduce((s,d)=>s+d.delta,0)/sd.length:0;
      const totAct=deltas.reduce((s,fm)=>s+(fm.tot||0),0);
      playerPerf.push({number:p.number,name:p.name,nick,deltas:sd,avgDelta,totalActions:totAct,points:p.points});
    }

    const ranked=playerPerf.filter(p=>p.deltas.length>0&&p.totalActions>=5).sort((a,b)=>b.avgDelta-a.avgDelta);
    if (ranked.length>0) {
      const best=ranked[0];
      const isBreakout = best.avgDelta>(isMP?0.2:10);
      if (best.avgDelta>(isMP?0.05:1)) {
        const bf=best.deltas.filter(d=>d.delta>0).sort((a,b)=>b.delta-a.delta);
        items.push({ text:`${isBreakout?'🌟 Breakout':'Best performer'}: ${best.nick} (#${best.number}) — ${isBreakout?'prestazione nettamente sopra il suo livello stagionale':'sopra la sua media'}${bf.length>0?`, in particolare in ${bf.slice(0,2).map(d=>d.label.toLowerCase()).join(' e ')}`:''}.`,
          positive:true, tooltip:{label:`${best.nick} — dettaglio`,values:best.deltas.map(d=>`${d.label}: ${valFmt(d.matchVal)} vs media ${valFmt(d.avgVal)} (${d.delta>0?'+':''}${isMP?d.delta.toFixed(2):d.delta.toFixed(1)+'%'})`)}
        });
      }
      const worst=ranked[ranked.length-1];
      if (worst.avgDelta<-(isMP?0.05:1) && worst.number!==best.number) {
        const wf=worst.deltas.filter(d=>d.delta<0).sort((a,b)=>a.delta-b.delta);
        items.push({ text:`Sotto tono: ${worst.nick} (#${worst.number}) — sotto la propria media${wf.length>0?`, soprattutto in ${wf.slice(0,2).map(d=>d.label.toLowerCase()).join(' e ')}`:''}.`,
          positive:false, tooltip:{label:`${worst.nick} — dettaglio`,values:worst.deltas.map(d=>`${d.label}: ${valFmt(d.matchVal)} vs media ${valFmt(d.avgVal)} (${d.delta>0?'+':''}${isMP?d.delta.toFixed(2):d.delta.toFixed(1)+'%'})`)}
        });
      }
      // Per-fundamental MVP
      const mvps={};
      for (const fd of fundDefs) {
        const cands=playerPerf.filter(p=>p.deltas.find(d=>d.key===fd.key&&d.tot>=3));
        if (cands.length>=2) mvps[fd.key]=cands.sort((a,b)=>{const da=a.deltas.find(d=>d.key===fd.key),db=b.deltas.find(d=>d.key===fd.key);return (db?.matchVal||0)-(da?.matchVal||0);})[0];
      }
      const me=Object.entries(mvps).filter(([,p])=>p);
      if (me.length>0) items.push({ text:`Migliori per fondamentale: ${me.map(([k,p])=>{const fd=fundDefs.find(f=>f.key===k),d=p.deltas.find(dd=>dd.key===k);return `${fd.label}: ${p.nick} (${valFmt(d?.matchVal)})`;}).join('; ')}.`,
        positive:null, tooltip:{label:'MVP per fondamentale',values:me.map(([k,p])=>{const fd=fundDefs.find(f=>f.key===k),d=p.deltas.find(dd=>dd.key===k);return `${fd.label}: ${p.nick} #${p.number} — ${valFmt(d?.matchVal)} (media: ${valFmt(d?.avgVal)})`;})}
      });
    }

    if (items.length>0) sections.push({ id:'players', title:'Protagonisti della Partita', color:'sky', items });
  }

  // ═══════════════════════════════════════════════════════
  // 8. PERFORMANCE CONTESTUALE
  // ═══════════════════════════════════════════════════════
  {
    const items = [];

    if (seasonTeamAvg) {
      const td=[];
      for (const fd of fundDefs) {
        const mv=metricFromRaw(team?.[fd.key],fd.key), av=seasonTeamAvg?.[fd.key]?.[perfAvgKey];
        if (mv!==null && Number.isFinite(av)) td.push({...fd,matchVal:mv,avgVal:av,delta:mv-av});
      }
      if (td.length>0) {
        const over=td.filter(d=>d.delta>(isMP?0.1:3)), under=td.filter(d=>d.delta<-(isMP?0.1:3));
        if (over.length>0||under.length>0) {
          const avg=td.reduce((s,d)=>s+d.delta,0)/td.length;
          const lbl=avg>(isMP?0.05:2)?'sopra la media stagionale':avg<-(isMP?0.05:2)?'sotto la media stagionale':'in linea con la media';
          const ctx=isHeavy&&avg>0?' (notevole: su partita ad alto peso)':isHeavy&&avg<0?' (parzialmente giustificato dal peso elevato della partita)':'';
          items.push({ text:`Nostra squadra ${lbl}${ctx}.${over.length>0?` Sopra media: ${over.map(d=>d.label).join(', ')}.`:''}${under.length>0?` Sotto media: ${under.map(d=>d.label).join(', ')}.`:''}`, positive:avg>0,
            tooltip:{label:`Nostra squadra vs media (${metricLabel})`,values:td.map(d=>`${d.label}: ${valFmt(d.matchVal)} vs media ${valFmt(d.avgVal)} (${d.delta>0?'+':''}${isMP?d.delta.toFixed(2):d.delta.toFixed(1)+'%'})`)}
          });
        }
      }
    }

    if (seasonAgg && selectedOppAgg) {
      const od=[];
      for (const fd of fundDefs) {
        const mo=selectedOppAgg?.[fd.key]?.[oppAvgKey], so=seasonAgg?.[fd.key]?.[oppAvgKey];
        if (Number.isFinite(mo)&&Number.isFinite(so)) {
          const mv=toPct(mo),sv=toPct(so);
          if (mv!==null&&sv!==null) od.push({...fd,matchVal:isMP?mo:mv,avgVal:isMP?so:sv,delta:(isMP?mo:mv)-(isMP?so:sv)});
        }
      }
      if (od.length>0) {
        const avg=od.reduce((s,d)=>s+d.delta,0)/od.length;
        const lbl=avg>(isMP?0.05:2)?'ha sovra-performato':avg<-(isMP?0.05:2)?'ha sotto-performato':'ha giocato in linea con la sua media';
        const over=od.filter(d=>d.delta>(isMP?0.1:3)), under=od.filter(d=>d.delta<-(isMP?0.1:3));
        items.push({ text:`${oppName} ${lbl} rispetto alla propria media stagionale.${over.length>0?` Sopra media: ${over.map(d=>d.label).join(', ')}.`:''}${under.length>0?` Sotto media: ${under.map(d=>d.label).join(', ')}.`:''}`, positive:avg<0,
          tooltip:{label:`${oppName} vs media`,values:od.map(d=>`${d.label}: ${valFmt(d.matchVal)} vs media ${valFmt(d.avgVal)} (${d.delta>0?'+':''}${isMP?d.delta.toFixed(2):d.delta.toFixed(1)+'%'})`)}
        });
      }
    }

    if (items.length>0) sections.push({ id:'performance', title:'Performance Contestuale', color:'cyan', items });
  }

  // ═══════════════════════════════════════════════════════
  // 9. AVVERSARIO VS STIMA CLASSIFICA
  // ═══════════════════════════════════════════════════════
  if (standings && standings.length>=2 && matchAnalytics.length>0) {
    const items = [];
    const expectedMP = computeExpectedMP(standings, matchAnalytics);
    const oppClean = oppName.replace(/^\([AR]\)\s*/i,'').trim();
    const expOpp = expectedMP[oppName]||expectedMP[oppClean]||Object.entries(expectedMP).find(([k])=>areTeamNamesLikelySame(k,oppClean))?.[1];
    if (expOpp) {
      const deltas=[];
      for (const fd of [{key:'serve',label:'Battuta'},{key:'attack',label:'Attacco'},{key:'defense',label:'Difesa'},{key:'reception',label:'Ricezione'}]) {
        const est=expOpp[fd.key], act=selectedOppAgg?.[fd.key]?.mediaPond;
        if (Number.isFinite(est)&&Number.isFinite(act)) deltas.push({...fd,estimated:est,actual:act,delta:act-est});
      }
      if (deltas.length>0) {
        const avg=deltas.reduce((s,d)=>s+d.delta,0)/deltas.length;
        const lbl=avg>0.05?'sopra la stima di classifica':avg<-0.05?'sotto la stima di classifica':'in linea con la stima';
        const over=deltas.filter(d=>d.delta>0.1), under=deltas.filter(d=>d.delta<-0.1);
        items.push({ text:`${oppName} ha giocato complessivamente ${lbl}.${over.length>0?` Sopra stima: ${over.map(d=>`${d.label} (+${d.delta.toFixed(2)}MP)`).join(', ')}.`:''}${under.length>0?` Sotto stima: ${under.map(d=>`${d.label} (${d.delta.toFixed(2)}MP)`).join(', ')}.`:''}`, positive:avg<0,
          tooltip:{label:`${oppName} — Stima vs Reale (MP)`,values:deltas.map(d=>`${d.label}: reale ${d.actual.toFixed(2)} vs stimato ${d.estimated.toFixed(2)} (${d.delta>0?'+':''}${d.delta.toFixed(2)})`)}
        });
        for (const d of deltas.filter(x=>Math.abs(x.delta)>=0.15)) {
          items.push({ text:`${d.label} avversaria ${d.delta>0?'sopra':'sotto'} la stima di ${Math.abs(d.delta).toFixed(2)} MP — ${d.delta>0?'prestazione superiore alle attese: attenzione in caso di rivincita':'prestazione inferiore alle attese'}.`, positive:d.delta<0,
            tooltip:{label:d.label,values:[`Reale: ${d.actual.toFixed(2)} MP`,`Stimato: ${d.estimated.toFixed(2)} MP`]}
          });
        }
      }
    }
    if (items.length>0) sections.push({ id:'oppEstimate', title:'Avversario vs Stima Classifica', color:'orange', items });
  }

  // ═══════════════════════════════════════════════════════
  // 10. DIPENDENZE TRA SQUADRE
  // ═══════════════════════════════════════════════════════
  {
    const items = [];
    const pairs = [
      { ourKey:'reception', oppKey:'serve',    ourLbl:'Ricezione Nostra',  oppLbl:`Battuta ${oppName}`,    causal:`Battuta avversaria → nostra ricezione` },
      { ourKey:'serve',     oppKey:'reception', ourLbl:'Battuta Nostra',   oppLbl:`Ricezione ${oppName}`,  causal:`Nostra battuta → ricezione avversaria` },
      { ourKey:'defense',   oppKey:'attack',   ourLbl:'Difesa Nostra',     oppLbl:`Attacco ${oppName}`,    causal:`Attacco avversario → nostra difesa` },
      { ourKey:'attack',    oppKey:'defense',  ourLbl:'Attacco Nostro',    oppLbl:`Difesa ${oppName}`,     causal:`Nostro attacco → difesa avversaria` },
    ];
    for (const cp of pairs) {
      const ourMV=metricFromRaw(team?.[cp.ourKey],cp.ourKey);
      const ourAv=seasonTeamAvg?.[cp.ourKey]?.[perfAvgKey];
      const oppMV=oppMetricPct(selectedOppAgg?.[cp.oppKey],cp.oppKey);
      const oppAv=toPct(seasonAgg?.[cp.oppKey]?.[oppAvgKey]);
      if (ourMV===null||oppMV===null) continue;
      const ourD=(Number.isFinite(ourAv))?ourMV-ourAv:null;
      const oppD=(Number.isFinite(oppAv))?oppMV-oppAv:null;
      if (ourD===null||oppD===null) continue;
      const thr=isMP?0.1:3;
      const uB=ourD>thr, uW=ourD<-thr, oB=oppD>thr, oW=oppD<-thr;
      let assessment='';
      if (cp.ourKey==='reception'||cp.ourKey==='defense') {
        if (oB&&uB)  assessment=`Notevole: nonostante ${cp.oppLbl} sopra media (${gapFmt(oppD)}), ${cp.ourLbl} sopra media (${gapFmt(ourD)}). Solidità eccezionale.`;
        else if(oB&&uW) assessment=`Incastro sfavorevole: ${cp.oppLbl} sopra media (${gapFmt(oppD)}), ${cp.ourLbl} sotto media (${gapFmt(ourD)}).`;
        else if(oW&&uB) assessment=`Incastro favorevole: ${cp.oppLbl} sotto media (${gapFmt(oppD)}), ${cp.ourLbl} sopra media (${gapFmt(ourD)}).`;
        else if(oB&&!uW) assessment=`${cp.oppLbl} sopra media (${gapFmt(oppD)}) ma ${cp.ourLbl} ha retto bene.`;
        else if(uW&&!oB) assessment=`${cp.ourLbl} sotto media (${gapFmt(ourD)}) nonostante ${cp.oppLbl} nella norma.`;
      } else {
        if (uB&&oW)  assessment=`Incastro favorevole: ${cp.ourLbl} sopra media (${gapFmt(ourD)}), ${cp.oppLbl} sotto media (${gapFmt(oppD)}). Doppio vantaggio offensivo.`;
        else if(uB&&oB) assessment=`${cp.ourLbl} sopra media (${gapFmt(ourD)}) nonostante ${cp.oppLbl} sopra media: eccellente prestazione offensiva.`;
        else if(uW&&oB) assessment=`Incastro sfavorevole: ${cp.ourLbl} sotto media (${gapFmt(ourD)}), ${cp.oppLbl} sopra media (${gapFmt(oppD)}).`;
        else if(uB&&!oW) assessment=`${cp.ourLbl} sopra media (${gapFmt(ourD)}) — ha prevalso su un ${cp.oppLbl} nella norma.`;
        else if(uW&&!oB) assessment=`${cp.ourLbl} sotto media (${gapFmt(ourD)}) nonostante ${cp.oppLbl} nella norma.`;
      }
      if (assessment) {
        items.push({ text:`${cp.causal}: ${assessment}`, positive:assessment.includes('favorevole')||assessment.includes('Notevole')||(assessment.includes('sopra media')&&!assessment.includes('sfavorevole')),
          tooltip:{label:cp.causal,values:[`${cp.ourLbl}: ${valFmt(ourMV)} (vs media: ${gapFmt(ourD)})`,`${cp.oppLbl}: ${valFmt(oppMV)} (vs media: ${gapFmt(oppD)})`]}
        });
      }
    }
    if (items.length>0) sections.push({ id:'crossFund', title:'Dipendenze tra Squadre', color:'fuchsia', items });
  }

  // ═══════════════════════════════════════════════════════
  // 11. SINTESI — CHIAVE DI LETTURA
  // ═══════════════════════════════════════════════════════
  {
    const items = [];
    const seasonAvgKey = { efficienza:'efficiency', efficacia:'efficacy', mediaPond:'mediaPond', mediaPct:'mediaPct', attitude:'attitude' }[lineMode]||'efficiency';
    const belowThresh = isMP?0.2:5;

    if (fundGaps.length>0) {
      const dec=fundGaps[0];
      if (Math.abs(dec.gap)>=threshSm) {
        const adv=dec.gap>0;
        let txt=`Fondamentale chiave: ${dec.label}${adv?`. Superiorità in ${dec.label.toLowerCase()} (${gapFmt(dec.gap)} ${metricLabel}) — fattore determinante ${won?'per la vittoria':'che ha limitato il passivo'}.`:`. Svantaggio in ${dec.label.toLowerCase()} (${gapFmt(dec.gap)} ${metricLabel}) — ha penalizzato il rendimento globale.`}`;
        if (dec.vsAvgDelta!==null) txt+=` Rispetto alla nostra media stagionale: ${dec.vsAvgDelta>0?'sopra':'sotto'} di ${Math.abs(dec.vsAvgDelta).toFixed(isMP?2:1)}${isMP?'':'%'}.`;
        items.push({ text:txt, positive:adv===won, tooltip:{label:`${dec.label} — confronto`,values:dec.tooltipVals} });
      }
    }

    if (soPct!==null&&bpPct!==null&&soRallies.length>=5&&bpRallies.length>=5) {
      const delta=Math.abs(soPct-bpPct);
      if (delta>=8) {
        const wp=soPct<bpPct?'side-out':'break-point', wv=Math.min(soPct,bpPct);
        items.push({ text:`Fase critica: ${wp} (${wv.toFixed(0)}%). ${wp==='side-out'?'Lavorare su qualità ricezione e attacco da palla imprecisa.':'Lavorare su efficacia battuta e difesa in break-point.'}`, positive:false,
          tooltip:{label:'Analisi di fase',values:[`SO: ${soPct.toFixed(1)}%`,`BP: ${bpPct.toFixed(1)}%`]}
        });
      }
    }

    // Breakout
    const pStats2=match?.riepilogo?.playerStats||[], roster2=match?.roster||[];
    const playerPerfSynth=[];
    if (matchAnalytics.length>1) {
      const acc2={};
      for (const ma of matchAnalytics) {
        if(ma.match?.id===match?.id) continue;
        const ps=ma.match?.riepilogo?.playerStats||[];
        for(const p of ps){if(!p.number)continue;if(!acc2[p.number])acc2[p.number]={attack:[]};if(p.attack?.tot>0)acc2[p.number].attack.push(teamMetricPct(p.attack,null,'attack'));}
      }
      for (const p of pStats2) {
        if(!p.number||!p.attack?.tot) continue;
        const re=roster2.find(r=>r.number===p.number);
        const nick=re?.nickname||(p.name||'').trim().split(/\s+/)[0]||p.number;
        const mv=teamMetricPct(p.attack,null,'attack');
        const vals=(acc2[p.number]?.attack||[]).filter(v=>v!==null&&Number.isFinite(v));
        const av=vals.length>=2?vals.reduce((s,v)=>s+v,0)/vals.length:null;
        if(mv!==null&&av!==null) playerPerfSynth.push({nick,number:p.number,delta:mv-av,attacks:p.attack.tot,matchVal:mv,avgVal:av});
      }
    }
    const topBreakout=playerPerfSynth.filter(p=>p.attacks>=3).sort((a,b)=>b.delta-a.delta)[0];
    if (topBreakout&&topBreakout.delta>(isMP?0.2:10)) {
      items.push({ text:`Protagonista: ${topBreakout.nick} (#${topBreakout.number}) — prestazione in attacco nettamente sopra la propria media (${valFmt(topBreakout.matchVal)} vs ${valFmt(topBreakout.avgVal)}). Indicatore di crescita individuale.`, positive:true,
        tooltip:{label:`${topBreakout.nick} — breakout`,values:[`Attacco: ${valFmt(topBreakout.matchVal)} vs media ${valFmt(topBreakout.avgVal)}`,`Delta: ${topBreakout.delta>0?'+':''}${isMP?topBreakout.delta.toFixed(2):topBreakout.delta.toFixed(1)+'%'}`]}
      });
    }

    if (seasonTeamAvg&&fundGaps.length>0) {
      const below=fundGaps.filter(fg=>{const av=seasonTeamAvg?.[fg.key]?.[seasonAvgKey];return Number.isFinite(av)&&Number.isFinite(fg.ourEff)&&fg.ourEff<av-belowThresh;});
      if (below.length>0) items.push({ text:`Sotto la media stagionale in: ${below.map(fg=>{const av=seasonTeamAvg[fg.key][seasonAvgKey];return `${fg.label} (${valFmt(fg.ourEff)} vs media ${valFmt(av)})`;}).join(', ')}.`, positive:false,
        tooltip:{label:`Fondamentali sotto media`,values:below.map(fg=>{const av=seasonTeamAvg[fg.key][seasonAvgKey];return `${fg.label}: ${valFmt(fg.ourEff)} / media ${valFmt(av)}`;})}
      });
    }

    if (items.length>0) sections.push({ id:'synthesis', title:'Sintesi — Chiave di Lettura', color:'rose', items });
  }

  return sections.length>0 ? sections : null;
}
