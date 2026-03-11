// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Analytics Engine
// Weighting, opponent reconstruction, trends, training suggestions
// ============================================================================

import { INVERSE_MAP, DEFAULT_WEIGHTS, RESULT_FACTORS, TEAM_MAP, ROLE_CORE_FUNDAMENTALS, DEFAULT_FNC_CONFIG } from './constants';

// ─── Reconstruct Opponent Stats from Our Data ──────────────────────────────
export function reconstructOpponent(match) {
  if (!match.riepilogo) return null;

  const { team, opponent } = match.riepilogo;
  const rallies = match.rallies || [];

  // Method 1: From Riepilogo aggregated data (already computed in file)
  const fromRiepilogo = {
    attack: opponent.attack,
    serve: opponent.serve,
    reception: opponent.reception,
    defense: opponent.defense,
  };

  // Method 2: Deduce from our stats using inverse mapping
  const deduced = {
    serve: deduceOpponentServe(team.reception, rallies),
    attack: deduceOpponentAttack(team.defense, rallies),
    defense: deduceOpponentDefense(team.attack),
    reception: deduceOpponentReception(team.serve),
  };

  // Method 3: Count opponent errors from rallies
  const oppErrors = countOpponentErrors(rallies);

  return { fromRiepilogo, deduced, oppErrors };
}

function deduceOpponentServe(ourReception, rallies) {
  // Our R1 → their Serve 5, R2 → Serve 4, R3 → Serve 3, R4 → Serve 2
  // "solo Avv" at start of rally (no preceding action) → their Serve 1 (error)
  const serve5 = ourReception.err || 0;   // R1
  const serve4 = ourReception.neg || 0;   // R2
  const serve3 = ourReception.exc || 0;   // R3
  const serve2 = ourReception.pos + ourReception.kill; // R4 + R5

  // Serve 1 = errors in serve (aces that went out, serve into net)
  // Count from rallies where first action is "avv" and it's a reception phase
  const serve1 = rallies.filter(r =>
    r.phase === 'r' &&
    r.quartine.length === 1 &&
    r.quartine[0].type === 'opponent_error'
  ).length;

  const total = serve5 + serve4 + serve3 + serve2 + serve1;
  return {
    val5: serve5, val4: serve4, val3: serve3, val2: serve2, val1: serve1,
    total,
    efficacy: total > 0 ? (serve5 - serve1) / total : 0,
    efficiency: total > 0 ? (serve5 + serve4 - serve1) / total : 0,
  };
}

function deduceOpponentAttack(ourDefense, rallies) {
  // Our D1 → their Attack 5, D2 → Attack 4, D3 → Attack 3, D4 → Attack 2
  const attack5 = ourDefense.err || 0;   // D1
  const attack4 = ourDefense.neg || 0;   // D2
  const attack3 = ourDefense.exc || 0;   // D3
  const attack2 = ourDefense.pos + ourDefense.kill; // D4 + D5

  // Attack 1 = opponent attack errors
  // Count from rallies where "avv" is preceded by a touch action (not alone)
  const attack1 = rallies.filter(r => {
    if (r.quartine.length < 2) return false;
    const last = r.quartine[r.quartine.length - 1];
    const prev = r.quartine[r.quartine.length - 2];
    return last.type === 'opponent_error' && prev.type === 'action';
  }).length;

  const total = attack5 + attack4 + attack3 + attack2 + attack1;
  return {
    val5: attack5, val4: attack4, val3: attack3, val2: attack2, val1: attack1,
    total,
    efficacy: total > 0 ? (attack5 - attack1) / total : 0,
    efficiency: total > 0 ? (attack5 + attack4 - attack1) / total : 0,
  };
}

function deduceOpponentDefense(ourAttack) {
  // Our A5 → their Defense 1, A4 → Defense 2, A3 → Defense 3, A2 → Defense 4+5
  return {
    val1: ourAttack.kill || 0,      // A5 → D1
    val2: ourAttack.pos || 0,       // A4 → D2 (freeball)
    val3: ourAttack.exc || 0,       // A3 → D3
    'val4+5': ourAttack.neg || 0,   // A2 → D4+5 (combined)
    total: (ourAttack.kill || 0) + (ourAttack.pos || 0) + (ourAttack.exc || 0) + (ourAttack.neg || 0),
  };
}

function deduceOpponentReception(ourServe) {
  // Our B5 → their Reception 1, B4 → Reception 2, B3 → Reception 3, B2 → Reception 4+5
  return {
    val1: ourServe.kill || 0,      // B5 → R1
    val2: ourServe.pos || 0,       // B4 → R2
    val3: ourServe.exc || 0,       // B3 → R3
    'val4+5': ourServe.neg || 0,   // B2 → R4+5 (combined)
    total: (ourServe.kill || 0) + (ourServe.pos || 0) + (ourServe.exc || 0) + (ourServe.neg || 0),
  };
}

function countOpponentErrors(rallies) {
  let serveErrors = 0;   // "solo Avv" in reception phase
  let attackErrors = 0;  // "Avv" preceded by a touch

  for (const r of rallies) {
    if (!r.isPoint) continue;
    const lastAction = r.quartine[r.quartine.length - 1];
    if (lastAction?.type !== 'opponent_error') continue;

    if (r.quartine.length === 1 || (r.quartine.length === 1 && r.phase === 'r')) {
      serveErrors++;
    } else {
      attackErrors++;
    }
  }
  return { serveErrors, attackErrors, total: serveErrors + attackErrors };
}

// ─── Compute Match Context Weight ──────────────────────────────────────────
export function computeMatchWeight(match, standings, allMatches, weights = DEFAULT_WEIGHTS) {
  const numTeams = standings.length || 12;
  const opponentName = match.metadata?.opponent || '';

  // 1. Opponent Strength Factor (from standings)
  const oppStanding = findOpponentInStandings(opponentName, standings);
  const oppRank = oppStanding?.rank || Math.ceil(numTeams / 2);
  const strengthFactor = normalizeToRange(
    (numTeams - oppRank) / (numTeams - 1),
    -1, 1
  );

  // 2. Opponent Performance Factor (did they play above/below their level?)
  const oppPerformanceFactor = computeOpponentPerformanceFactor(match, allMatches);

  // 3. Set Competitiveness Factor
  const setFactor = computeSetCompetitiveness(match.sets);

  // 4. Match Result Factor
  const resultFactor = computeMatchResultFactor(match.sets);

  // 5. Chain Context Factor (average rally difficulty)
  const chainFactor = computeChainContextFactor(match.rallies);

  // Combine with adjustable weights
  const rawWeight = 1 +
    weights.opponentStrength * strengthFactor +
    weights.opponentPerformance * oppPerformanceFactor +
    weights.setCompetitiveness * setFactor +
    weights.matchResult * resultFactor +
    weights.chainContext * chainFactor;

  // Clamp to reasonable range [0.5, 1.5]
  const finalWeight = Math.max(0.5, Math.min(1.5, rawWeight));

  return {
    final: finalWeight,
    components: {
      opponentStrength: { value: strengthFactor, weight: weights.opponentStrength, contribution: weights.opponentStrength * strengthFactor },
      opponentPerformance: { value: oppPerformanceFactor, weight: weights.opponentPerformance, contribution: weights.opponentPerformance * oppPerformanceFactor },
      setCompetitiveness: { value: setFactor, weight: weights.setCompetitiveness, contribution: weights.setCompetitiveness * setFactor },
      matchResult: { value: resultFactor, weight: weights.matchResult, contribution: weights.matchResult * resultFactor },
      chainContext: { value: chainFactor, weight: weights.chainContext, contribution: weights.chainContext * chainFactor },
    },
    oppRank,
    opponentName: oppStanding?.name || opponentName,
  };
}

// ─── Compute per-fundamental weights ───────────────────────────────────────
export function computeFundamentalWeights(match, allMatches, standings) {
  const oppStats = reconstructOpponent(match);
  if (!oppStats) return { a: 1, b: 1, r: 1, d: 1, m: 1 };

  // Build benchmark from all matches
  const benchmark = buildBenchmark(allMatches);

  const weights = {};

  // Reception weight: based on how strong opponent's serve was vs benchmark
  const oppServe = oppStats.deduced.serve;
  const benchServe = benchmark.serve;
  if (benchServe.efficacy !== 0) {
    weights.r = 1 + clamp((oppServe.efficacy - benchServe.efficacy) / Math.max(0.1, Math.abs(benchServe.efficacy)), -0.5, 0.5);
  } else {
    weights.r = 1;
  }

  // Defense weight: based on how strong opponent's attack was vs benchmark
  const oppAttack = oppStats.deduced.attack;
  const benchAttack = benchmark.attack;
  if (benchAttack.efficacy !== 0) {
    weights.d = 1 + clamp((oppAttack.efficacy - benchAttack.efficacy) / Math.max(0.1, Math.abs(benchAttack.efficacy)), -0.5, 0.5);
  } else {
    weights.d = 1;
  }

  // Attack weight: based on opponent's defense quality vs benchmark
  const oppDef = oppStats.deduced.defense;
  const benchDef = benchmark.defense;
  const oppDefQuality = oppDef.total > 0 ? (oppDef.val3 + oppDef['val4+5']) / oppDef.total : 0;
  const benchDefQuality = benchDef.total > 0 ? (benchDef.val3 + benchDef['val4+5']) / benchDef.total : 0;
  weights.a = 1 + clamp((oppDefQuality - benchDefQuality) * 2, -0.5, 0.5);

  // Serve weight: based on opponent's reception quality vs benchmark
  const oppRec = oppStats.deduced.reception;
  const benchRec = benchmark.reception;
  const oppRecQuality = oppRec.total > 0 ? (oppRec.val3 + oppRec['val4+5']) / oppRec.total : 0;
  const benchRecQuality = benchRec.total > 0 ? (benchRec.val3 + benchRec['val4+5']) / benchRec.total : 0;
  weights.b = 1 + clamp((oppRecQuality - benchRecQuality) * 2, -0.5, 0.5);

  // Block weight: proportional to opponent's attack quality
  weights.m = weights.d; // Block faces same attack as defense

  return weights;
}

// ─── Build benchmark averages from all loaded matches ──────────────────────
function buildBenchmark(allMatches) {
  const agg = {
    serve: { efficacy: 0, count: 0 },
    attack: { efficacy: 0, count: 0 },
    defense: { val3: 0, 'val4+5': 0, total: 0, count: 0 },
    reception: { val3: 0, 'val4+5': 0, total: 0, count: 0 },
  };

  for (const m of allMatches) {
    const opp = reconstructOpponent(m);
    if (!opp) continue;

    const s = opp.deduced.serve;
    if (s.total > 0) { agg.serve.efficacy += s.efficacy; agg.serve.count++; }

    const a = opp.deduced.attack;
    if (a.total > 0) { agg.attack.efficacy += a.efficacy; agg.attack.count++; }

    const d = opp.deduced.defense;
    agg.defense.val3 += d.val3 || 0;
    agg.defense['val4+5'] += d['val4+5'] || 0;
    agg.defense.total += d.total || 0;
    agg.defense.count++;

    const r = opp.deduced.reception;
    agg.reception.val3 += r.val3 || 0;
    agg.reception['val4+5'] += r['val4+5'] || 0;
    agg.reception.total += r.total || 0;
    agg.reception.count++;
  }

  return {
    serve: { efficacy: agg.serve.count > 0 ? agg.serve.efficacy / agg.serve.count : 0 },
    attack: { efficacy: agg.attack.count > 0 ? agg.attack.efficacy / agg.attack.count : 0 },
    defense: { val3: agg.defense.val3, 'val4+5': agg.defense['val4+5'], total: agg.defense.total },
    reception: { val3: agg.reception.val3, 'val4+5': agg.reception['val4+5'], total: agg.reception.total },
  };
}

// ─── Compute weighted player stats ─────────────────────────────────────────
export function computeWeightedPlayerStats(match, matchWeight, fundWeights) {
  if (!match.riepilogo) return [];

  const { playerStats, playerReception, playerDefense } = match.riepilogo;

  return playerStats.map(p => {
    const recData = playerReception.find(r => r.number === p.number);
    const defData = playerDefense.find(d => d.number === p.number);

    const raw = {
      attack: { efficacy: p.attack.efficacy, efficiency: p.attack.efficiency, tot: p.attack.tot },
      serve: { efficacy: p.serve.efficacy, efficiency: p.serve.efficiency, tot: p.serve.tot },
      block: {
        efficacy: p.block.efficacy,
        efficiency: p.block.efficiency,
        // tot = somma di tutte le azioni di muro: determina se la giocatrice ha giocato il fondamentale
        tot: (p.block.kill || 0) + (p.block.pos || 0) + (p.block.exc || 0) + (p.block.neg || 0) + (p.block.err || 0),
      },
      reception: { efficacy: recData?.efficacy || 0, efficiency: recData?.efficiency || 0, tot: recData?.tot || 0 },
      defense: { efficacy: defData?.efficacy || 0, efficiency: defData?.efficiency || 0, tot: defData?.tot || 0 },
    };

    const weighted = {
      attack: {
        efficacy: raw.attack.efficacy * matchWeight.final * (fundWeights.a || 1),
        efficiency: raw.attack.efficiency * matchWeight.final * (fundWeights.a || 1),
        tot: raw.attack.tot,
      },
      serve: {
        efficacy: raw.serve.efficacy * matchWeight.final * (fundWeights.b || 1),
        efficiency: raw.serve.efficiency * matchWeight.final * (fundWeights.b || 1),
        tot: raw.serve.tot,
      },
      block: {
        efficacy: raw.block.efficacy * matchWeight.final * (fundWeights.m || 1),
        efficiency: raw.block.efficiency * matchWeight.final * (fundWeights.m || 1),
        tot: raw.block.tot,
      },
      reception: {
        efficacy: raw.reception.efficacy * matchWeight.final * (fundWeights.r || 1),
        efficiency: raw.reception.efficiency * matchWeight.final * (fundWeights.r || 1),
        tot: raw.reception.tot,
      },
      defense: {
        efficacy: raw.defense.efficacy * matchWeight.final * (fundWeights.d || 1),
        efficiency: raw.defense.efficiency * matchWeight.final * (fundWeights.d || 1),
        tot: raw.defense.tot,
      },
    };

    return {
      number: p.number,
      name: p.name,
      points: p.points,
      raw,
      weighted,
      matchWeight: matchWeight.final,
    };
  });
}

// ─── Compute player trends across matches ──────────────────────────────────
export function computePlayerTrends(allMatchPlayerStats) {
  // allMatchPlayerStats: array of { matchId, date, opponent, playerStats: [...] }
  const playerMap = {};

  for (const matchData of allMatchPlayerStats) {
    for (const ps of matchData.playerStats) {
      if (!playerMap[ps.number]) {
        playerMap[ps.number] = { number: ps.number, name: ps.name, matches: [] };
      }
      playerMap[ps.number].matches.push({
        matchId: matchData.matchId,
        date: matchData.date,
        opponent: matchData.opponent,
        raw: ps.raw,
        weighted: ps.weighted,
        matchWeight: ps.matchWeight,
      });
    }
  }

  // Sort by date and compute trends
  for (const player of Object.values(playerMap)) {
    player.matches.sort((a, b) => a.date.localeCompare(b.date));

    // Compute rolling averages (window of 3)
    // IMPORTANT: exclude matches where the player had 0 total actions in a fundamental
    // (means they didn't play or didn't participate in that fundamental)
    player.trends = {};
    for (const fund of ['attack', 'serve', 'reception', 'defense', 'block']) {
      // Determine if player actually participated in this fundamental per match.
      // Exclude matches where tot === 0: la giocatrice non ha eseguito azioni
      // in quel fondamentale (non ha giocato, è uscita presto, o non era in campo).
      // Ora block ha anch'esso tot = kill+pos+exc+neg+err, quindi il controllo è uniforme.
      const matchesWithData = player.matches.map(m => {
        const fundData = m.raw[fund];
        const tot = fundData?.tot || 0;
        const played = tot > 0;
        return { ...m, played, tot };
      });

      // Only include matches where the player actually had actions
      const playedMatches = matchesWithData.filter(m => m.played);

      const rawValues = playedMatches.map(m => m.raw[fund]?.efficacy || 0);
      const weightedValues = playedMatches.map(m => m.weighted[fund]?.efficacy || 0);

      // Compute recent (last 3) vs older averages — used for accurate decline % in suggestions
      const getSegmentAvgs = (values) => {
        if (values.length < 4) return { recentAvg: avg(values), olderAvg: avg(values) };
        const recent = values.slice(-3);
        const older = values.slice(0, -3);
        return { recentAvg: avg(recent), olderAvg: avg(older) };
      };
      const rawSegs = getSegmentAvgs(rawValues);
      const wSegs   = getSegmentAvgs(weightedValues);

      player.trends[fund] = {
        raw: rawValues,
        weighted: weightedValues,
        rawAvg: avg(rawValues),
        weightedAvg: avg(weightedValues),
        rawTrend: computeTrendDirection(rawValues),
        weightedTrend: computeTrendDirection(weightedValues),
        // Segment averages for accurate trend messaging
        rawRecentAvg:      rawSegs.recentAvg,
        rawOlderAvg:       rawSegs.olderAvg,
        weightedRecentAvg: wSegs.recentAvg,
        weightedOlderAvg:  wSegs.olderAvg,
        rollingRaw: rollingAverage(rawValues, 3),
        rollingWeighted: rollingAverage(weightedValues, 3),
        // Keep track of which matches had data (for charts)
        matchLabels: playedMatches.map(m => ({ opponent: m.opponent, date: m.date, matchId: m.matchId, weight: m.matchWeight })),
        totalMatches: player.matches.length,
        playedMatches: playedMatches.length,
      };
    }
  }

  return playerMap;
}

// ─── Generate training suggestions (role-aware) ───────────────────────────
export function generateTrainingSuggestions(playerTrends, teamStats, roster = []) {
  const suggestions = [];

  // Build a lookup: playerNumber → role code (e.g., 'M1', 'C2', 'L1')
  const playerRoleMap = {};
  for (const p of roster) {
    if (p.number && p.role) {
      playerRoleMap[p.number] = p.role.trim();
    }
  }

  // Per-player suggestions — filtered by role core fundamentals
  for (const [num, player] of Object.entries(playerTrends)) {
    if (player.matches.length < 2) continue;

    const roleCode = playerRoleMap[num] || null;
    const roleConfig = roleCode ? ROLE_CORE_FUNDAMENTALS[roleCode] : null;

    for (const [fund, trend] of Object.entries(player.trends)) {
      // ─── ROLE FILTER: skip fundamentals excluded for this role ───
      if (roleConfig && roleConfig.excluded.includes(fund)) {
        continue;
      }

      // ─── PLAYED FILTER: must have actually played in >= 2 matches for this fund ───
      if (trend.playedMatches < 2) {
        continue;
      }

      const isCoreFund = roleConfig ? roleConfig.core.includes(fund) : true;
      const isSecondaryFund = roleConfig ? roleConfig.secondary.includes(fund) : false;
      const roleLabel = roleConfig ? roleConfig.label : '';

      // Build chart data for this suggestion (for expandable evidence chart)
      const chartData = (trend.matchLabels || []).map((ml, i) => ({
        label: (ml.opponent || '').substring(0, 10),
        date: ml.date,
        raw: (trend.raw[i] || 0) * 100,
        weighted: (trend.weighted[i] || 0) * 100,
      }));

      // Determine if raw and weighted tell different stories
      const rawWeightedDiverge = Math.abs(trend.rawAvg - trend.weightedAvg) > 0.03;
      const rawTrendDiffers = trend.rawTrend !== trend.weightedTrend;

      // ─── Declining trend ───
      if (trend.weightedTrend === 'declining' && trend.weightedOlderAvg !== 0) {
        // Decline % = how much the recent 3 matches dropped vs the earlier period
        const recentAvg = trend.weightedRecentAvg || 0;
        const olderAvg  = trend.weightedOlderAvg  || 0;
        const decline   = ((olderAvg - recentAvg) / Math.abs(olderAvg)) * 100; // always > 0 when trend is declining
        const lastVal   = trend.weighted[trend.weighted.length - 1] || 0;

        if (decline > 10) {
          let priority = Math.min(5, Math.ceil(decline / 10));
          if (isSecondaryFund) priority = Math.max(1, priority - 1);
          if (isCoreFund) priority = Math.min(5, priority + 1);

          // Smart message: mention "pesato" only if it diverges from raw
          let message;
          if (rawTrendDiffers && trend.rawTrend !== 'declining') {
            // Raw is stable/improving but weighted declines — context reveals hidden issue
            message = `${player.name} (${roleLabel || '?'}): ${fundLabel(fund)} — il dato grezzo sembra ${trend.rawTrend === 'stable' ? 'stabile' : 'in miglioramento'} ma contestualizzando la difficoltà degli avversari affrontati emerge un calo reale del ${decline.toFixed(0)}% (ultime 3 partite: ${(recentAvg * 100).toFixed(1)}% vs precedente: ${(olderAvg * 100).toFixed(1)}%).${isCoreFund ? ' ⚠ Fondamentale CORE per il suo ruolo.' : ''}`;
          } else {
            // Both declining — show the actual segment comparison + last match for context
            const lastMatchNote = lastVal > recentAvg
              ? ` Ultima partita (${(lastVal * 100).toFixed(1)}%) sopra la media recente — monitorare.`
              : ` Ultima partita: ${(lastVal * 100).toFixed(1)}%.`;
            message = `${player.name} (${roleLabel || '?'}): ${fundLabel(fund)} in calo (${decline.toFixed(0)}% nelle ultime 3 partite). Ultime 3: ${(recentAvg * 100).toFixed(1)}% vs precedente: ${(olderAvg * 100).toFixed(1)}%.${lastMatchNote}${isCoreFund ? ' ⚠ Fondamentale CORE per il suo ruolo.' : ''}`;
          }

          suggestions.push({
            type: 'player_decline',
            priority,
            player: player.name,
            playerNumber: num,
            role: roleLabel,
            roleCode,
            fundamental: fund,
            isCore: isCoreFund,
            message,
            action: getSuggestionAction(fund, decline, player, roleCode, roleConfig),
            chartData,
            showWeighted: rawWeightedDiverge, // only show weighted line if it tells a different story
          });
        }
      }

      // ─── Stable raw but declining weighted → context masking ───
      if (trend.rawTrend === 'stable' && trend.weightedTrend === 'declining' && isCoreFund) {
        suggestions.push({
          type: 'context_warning',
          priority: isCoreFund ? 3 : 2,
          player: player.name,
          playerNumber: num,
          role: roleLabel,
          roleCode,
          fundamental: fund,
          isCore: isCoreFund,
          message: `${player.name} (${roleLabel}): ${fundLabel(fund)} — dato grezzo stabile ma il contesto avversari rivela un calo nascosto. Le ultime partite erano contro avversari più deboli che mascherano la flessione.${isCoreFund ? ' Fondamentale core: monitorare con attenzione.' : ''}`,
          action: `Monitorare nelle prossime partite contro avversari forti. Inserire drill specifici in allenamento.`,
          chartData,
          showWeighted: true, // here the delta IS the point
        });
      }

      // ─── Improving trend ───
      if (trend.weightedTrend === 'improving' && trend.playedMatches >= 3) {
        // Use segment comparison for consistency with decline calculation
        const recentAvgI = trend.weightedRecentAvg || 0;
        const olderAvgI  = trend.weightedOlderAvg  || 0;
        const improvement = olderAvgI !== 0
          ? ((recentAvgI - olderAvgI) / Math.abs(olderAvgI)) * 100
          : 0;

        if (improvement > 15 && (isCoreFund || isSecondaryFund)) {
          let message;
          if (rawTrendDiffers && trend.rawTrend !== 'improving') {
            message = `${player.name} (${roleLabel}): ${fundLabel(fund)} — il dato grezzo non lo mostra chiaramente, ma contestualizzando gli avversari affrontati il miglioramento è del +${improvement.toFixed(0)}% (ultime 3: ${(recentAvgI * 100).toFixed(1)}% vs precedente: ${(olderAvgI * 100).toFixed(1)}%). Il lavoro in allenamento sta pagando.`;
          } else {
            message = `${player.name} (${roleLabel}): ${fundLabel(fund)} in netto miglioramento (+${improvement.toFixed(0)}%). Ultime 3 partite: ${(recentAvgI * 100).toFixed(1)}% vs precedente: ${(olderAvgI * 100).toFixed(1)}%.`;
          }

          suggestions.push({
            type: 'player_improvement',
            priority: 1,
            player: player.name,
            playerNumber: num,
            role: roleLabel,
            roleCode,
            fundamental: fund,
            isCore: isCoreFund,
            message,
            action: isCoreFund
              ? `Mantenere il focus attuale su ${fundLabel(fund)}. Come ${roleLabel}, è il suo fondamentale primario: consolidare il miglioramento.`
              : `Buon segnale su ${fundLabel(fund)}, fondamentale secondario per una ${roleLabel}. Mantenere senza sottrarre tempo ai core.`,
            chartData,
            showWeighted: rawWeightedDiverge,
          });
        }
      }
    }
  }

  // ─── Team-level suggestions ───
  if (teamStats && teamStats.length >= 2) {
    const lastMatch = teamStats[teamStats.length - 1];
    const prevMatch = teamStats[teamStats.length - 2];

    for (const fund of ['attack', 'serve', 'reception', 'defense']) {
      const lastEff = lastMatch.team?.[fund]?.efficacy || 0;
      const prevEff = prevMatch.team?.[fund]?.efficacy || 0;

      if (prevEff !== 0 && ((lastEff - prevEff) / Math.abs(prevEff)) < -0.15) {
        // Identify which roles should work on this fundamental
        const targetRoles = getTargetRolesForFundamental(fund);

        suggestions.push({
          type: 'team_decline',
          priority: 4,
          fundamental: fund,
          message: `Squadra: ${fundLabel(fund)} in calo significativo nell'ultima partita (${(lastEff * 100).toFixed(1)}% vs ${(prevEff * 100).toFixed(1)}% precedente).`,
          action: `Sessione specifica su ${fundLabel(fund)} per ${targetRoles}. Analizzare i video per identificare pattern di errore.`,
        });
      }
    }
  }

  // Sort: highest priority first, within same priority core fundamentals first
  suggestions.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.isCore && !b.isCore) return -1;
    if (!a.isCore && b.isCore) return 1;
    return 0;
  });

  return suggestions;
}

// ─── Analyze rally chains ──────────────────────────────────────────────────
export function analyzeRallyChains(rallies) {
  const chains = {
    sideOut: { total: 0, won: 0, lost: 0, byReceptionQuality: {} },
    breakPoint: { total: 0, won: 0, lost: 0 },
    transition: { total: 0, won: 0, lost: 0 },
    conversionByTouchQuality: {},
    playerInChains: {},
  };

  for (const rally of rallies) {
    const { quartine, phase, isPoint, isError } = rally;
    if (quartine.length === 0) continue;

    // Side-out analysis (phase = 'r')
    if (phase === 'r') {
      chains.sideOut.total++;
      if (isPoint) chains.sideOut.won++;
      if (isError) chains.sideOut.lost++;

      // By reception quality
      const firstAction = quartine[0];
      if (firstAction?.fundamental === 'r') {
        const rVal = `R${firstAction.value}`;
        if (!chains.sideOut.byReceptionQuality[rVal]) {
          chains.sideOut.byReceptionQuality[rVal] = { total: 0, won: 0, lost: 0 };
        }
        chains.sideOut.byReceptionQuality[rVal].total++;
        if (isPoint) chains.sideOut.byReceptionQuality[rVal].won++;
        if (isError) chains.sideOut.byReceptionQuality[rVal].lost++;
      }
    }

    // Break point analysis (phase = 'b')
    if (phase === 'b') {
      chains.breakPoint.total++;
      if (isPoint) chains.breakPoint.won++;
      if (isError) chains.breakPoint.lost++;
    }

    // Conversion analysis: what happens after each touch quality
    for (let i = 0; i < quartine.length - 1; i++) {
      const current = quartine[i];
      const next = quartine[i + 1];

      if (current.type !== 'action' || !current.fundamental || !current.value) continue;

      const key = `${current.fundamental.toUpperCase()}${current.value}`;
      if (!chains.conversionByTouchQuality[key]) {
        chains.conversionByTouchQuality[key] = { total: 0, nextActions: {} };
      }
      chains.conversionByTouchQuality[key].total++;

      if (next.type === 'action') {
        const nextKey = `${next.fundamental.toUpperCase()}${next.value}`;
        if (!chains.conversionByTouchQuality[key].nextActions[nextKey]) {
          chains.conversionByTouchQuality[key].nextActions[nextKey] = 0;
        }
        chains.conversionByTouchQuality[key].nextActions[nextKey]++;
      } else if (next.type === 'opponent_error') {
        if (!chains.conversionByTouchQuality[key].nextActions['AVV']) {
          chains.conversionByTouchQuality[key].nextActions['AVV'] = 0;
        }
        chains.conversionByTouchQuality[key].nextActions['AVV']++;
      }
    }

    // Track player contributions in chains
    for (const action of quartine) {
      if (action.type !== 'action') continue;
      const pNum = action.player;
      if (!chains.playerInChains[pNum]) {
        chains.playerInChains[pNum] = {
          pointContributions: 0, errorContributions: 0,
          lastTouchPoints: 0, lastTouchErrors: 0,
          byFundamental: {},
        };
      }
      const pc = chains.playerInChains[pNum];

      if (isPoint) pc.pointContributions++;
      if (isError) pc.errorContributions++;

      // Track if this player had the last touch
      const isLastTouch = quartine[quartine.length - 1] === action ||
        (quartine[quartine.length - 1].type === 'opponent_error' && quartine[quartine.length - 2] === action);

      if (isLastTouch && isPoint) pc.lastTouchPoints++;
      if (isLastTouch && isError) pc.lastTouchErrors++;

      // By fundamental
      const fKey = action.fundamental;
      if (!pc.byFundamental[fKey]) {
        pc.byFundamental[fKey] = { total: 0, distribution: {} };
      }
      pc.byFundamental[fKey].total++;
      const vKey = `${action.value}`;
      pc.byFundamental[fKey].distribution[vKey] = (pc.byFundamental[fKey].distribution[vKey] || 0) + 1;
    }
  }

  // Compute side-out and break-point percentages
  chains.sideOut.pct = chains.sideOut.total > 0 ? chains.sideOut.won / chains.sideOut.total : 0;
  chains.breakPoint.pct = chains.breakPoint.total > 0 ? chains.breakPoint.won / chains.breakPoint.total : 0;

  return chains;
}

// ─── Generate Match Report ─────────────────────────────────────────────────
export function generateMatchReport(match, matchWeight, standings) {
  const report = {
    summary: '',
    oppAssessment: '',
    keyFindings: [],
    rotationAnalysis: [],
    playerHighlights: [],
    concerns: [],
  };

  const opp = match.metadata?.opponent || 'Avversario';
  const sets = match.sets || [];
  const setsWon = sets.filter(s => s.won).length;
  const setsLost = sets.filter(s => !s.won).length;
  const won = setsWon > setsLost;
  const resultStr = `${setsWon}-${setsLost}`;

  // Weight breakdown
  const wc = matchWeight.components;

  // Summary
  if (won) {
    if (matchWeight.final > 1.15) {
      report.summary = `Vittoria ${resultStr} contro ${opp} in un contesto difficile (peso ${matchWeight.final.toFixed(2)}). Questa vittoria vale più del dato grezzo.`;
    } else if (matchWeight.final < 0.9) {
      report.summary = `Vittoria ${resultStr} contro ${opp} ma il contesto era favorevole (peso ${matchWeight.final.toFixed(2)}). Le performance grezze vanno ridimensionate.`;
    } else {
      report.summary = `Vittoria ${resultStr} contro ${opp} in un contesto nella norma (peso ${matchWeight.final.toFixed(2)}).`;
    }
  } else {
    if (matchWeight.final > 1.15) {
      report.summary = `Sconfitta ${resultStr} contro ${opp} ma il contesto era molto impegnativo (peso ${matchWeight.final.toFixed(2)}). Le performance delle atlete valgono più di quanto sembra.`;
    } else if (matchWeight.final < 0.9) {
      report.summary = `Sconfitta ${resultStr} contro ${opp} in un contesto relativamente agevole (peso ${matchWeight.final.toFixed(2)}). Serve analizzare cosa non ha funzionato.`;
    } else {
      report.summary = `Sconfitta ${resultStr} contro ${opp} in un contesto equilibrato (peso ${matchWeight.final.toFixed(2)}).`;
    }
  }

  // Opponent assessment
  const oppRank = matchWeight.oppRank;
  const numTeams = standings.length || 12;

  if (oppRank <= Math.ceil(numTeams / 3)) {
    if (wc.opponentPerformance.value > 0.3) {
      report.oppAssessment = `${opp} (${oppRank}° in classifica) è una squadra forte e ha giocato sopra il suo standard. Contesto molto impegnativo.`;
    } else if (wc.opponentPerformance.value < -0.3) {
      report.oppAssessment = `${opp} (${oppRank}° in classifica) è una squadra forte ma ha giocato sotto il suo livello. Attenzione: il ritorno potrebbe essere diverso.`;
    } else {
      report.oppAssessment = `${opp} (${oppRank}° in classifica) è una squadra forte e ha giocato alla sua media.`;
    }
  } else if (oppRank >= Math.ceil(numTeams * 2 / 3)) {
    if (wc.opponentPerformance.value > 0.3) {
      report.oppAssessment = `${opp} (${oppRank}° in classifica) è generalmente debole ma ha giocato bene contro di noi. Gli abbiamo consentito di sovraperformare.`;
    } else {
      report.oppAssessment = `${opp} (${oppRank}° in classifica) è nella parte bassa della classifica e ha giocato al suo livello.`;
    }
  } else {
    report.oppAssessment = `${opp} (${oppRank}° in classifica) è a metà classifica.`;
  }

  // Set analysis
  for (const set of sets) {
    const margin = Math.abs(set.margin);
    if (margin <= 3) {
      report.keyFindings.push(`Set ${set.number} molto combattuto (${set.ourScore}-${set.theirScore}): ogni azione ha avuto un peso elevato.`);
    } else if (margin >= 8) {
      report.keyFindings.push(`Set ${set.number} a senso unico (${set.ourScore}-${set.theirScore}): ${set.won ? 'dominio nostro' : 'dominio avversario'}.`);
    }
  }

  // Opponent errors analysis
  const oppData = reconstructOpponent(match);
  if (oppData) {
    const totalPoints = match.riepilogo?.totalPointsMade || 1;
    const giftedPct = oppData.oppErrors.total / totalPoints;
    if (giftedPct > 0.35) {
      report.concerns.push(`Il ${(giftedPct * 100).toFixed(0)}% dei nostri punti è stato regalato dall'avversario (errori non forzati). Le statistiche grezze sono gonfiate.`);
    }
  }

  return report;
}

// ─── Fundamental Normalization Coefficient (FNC) ───────────────────────────
// The FNC solves the cross-fundamental comparison problem:
// Reception/Defense naturally have higher efficacy ranges (~0.35-0.75)
// than Attack/Serve/Block (~0.10-0.50), so a radar chart or priority
// comparison across fundamentals is misleading without normalization.

/**
 * Compute per-fundamental baselines (mean + std) from all loaded matches.
 * These baselines are used by applyFNCToEfficacy for normalization.
 *
 * @param {Array} allMatches - array of parsed match objects
 * @returns {Object} baselines: { attack, serve, reception, defense, block, _global }
 */
export function computeFundamentalBaselines(allMatches) {
  const collections = {
    attack: [], serve: [], reception: [], defense: [], block: [],
  };

  for (const match of allMatches) {
    const { playerStats, playerReception, playerDefense } = match.riepilogo || {};
    if (!playerStats) continue;

    for (const p of playerStats) {
      if ((p.attack?.tot || 0) > 0) collections.attack.push(p.attack.efficacy || 0);
      if ((p.serve?.tot || 0) > 0) collections.serve.push(p.serve.efficacy || 0);
      const blockTot = (p.block?.kill || 0) + (p.block?.pos || 0) + (p.block?.exc || 0) +
                       (p.block?.neg || 0) + (p.block?.err || 0);
      if (blockTot > 0) collections.block.push(p.block?.efficacy || 0);
    }
    for (const p of playerReception || []) {
      if ((p.tot || 0) > 0) collections.reception.push(p.efficacy || 0);
    }
    for (const p of playerDefense || []) {
      if ((p.tot || 0) > 0) collections.defense.push(p.efficacy || 0);
    }
  }

  const baselines = {};
  const allValues = [];

  for (const [fund, vals] of Object.entries(collections)) {
    if (vals.length === 0) {
      baselines[fund] = { mean: 0, std: 0.1, count: 0, valid: false };
      continue;
    }
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    const std = Math.max(0.01, Math.sqrt(variance));
    baselines[fund] = { mean, std, count: vals.length, valid: vals.length >= 3 };
    allValues.push(...vals);
  }

  // Global stats (pooled across all fundamentals)
  if (allValues.length > 0) {
    const globalMean = allValues.reduce((s, v) => s + v, 0) / allValues.length;
    const globalVariance = allValues.reduce((s, v) => s + (v - globalMean) ** 2, 0) / allValues.length;
    baselines._global = { mean: globalMean, std: Math.max(0.01, Math.sqrt(globalVariance)) };
  } else {
    baselines._global = { mean: 0.30, std: 0.15 };
  }

  // Mean of per-fundamental means (for relative rescaling anchor)
  const fundMeans = Object.values(baselines).filter((b, _, arr) => b.valid !== false && b.mean !== undefined && !arr._global).map(b => b.mean);
  const validFunds = ['attack', 'serve', 'reception', 'defense', 'block'].filter(f => baselines[f]?.valid);
  const fundMeanValues = validFunds.map(f => baselines[f].mean);
  baselines._fundMean = fundMeanValues.length > 0
    ? fundMeanValues.reduce((s, v) => s + v, 0) / fundMeanValues.length
    : baselines._global.mean;

  return baselines;
}

/**
 * Apply the FNC to a raw efficacy value, returning a display-ready value
 * that can be compared across fundamentals.
 *
 * @param {number} rawEfficacy - raw efficacy value
 * @param {string} fund - 'attack'|'serve'|'reception'|'defense'|'block'
 * @param {Object} baselines - result of computeFundamentalBaselines
 * @param {Object} fncConfig - { enabled, weight, mode }
 * @returns {number} adjusted efficacy for display/comparison
 */
export function applyFNCToEfficacy(rawEfficacy, fund, baselines, fncConfig) {
  const cfg = fncConfig || DEFAULT_FNC_CONFIG;
  if (!cfg.enabled || !baselines || !baselines[fund]?.valid || cfg.weight === 0) {
    return rawEfficacy;
  }

  const { mean: µ_f, std: σ_f } = baselines[fund];
  const µ_anchor = baselines._fundMean || baselines._global?.mean || 0.30;
  const σ_global = baselines._global?.std || 0.15;
  const w = cfg.weight;

  if (cfg.mode === 'zscore') {
    // Z-score mode: express position relative to the fundamental's distribution,
    // then rescale to the global distribution for display.
    // z = (raw - µ_f) / σ_f  →  display = µ_anchor + z × σ_global
    const z = (rawEfficacy - µ_f) / σ_f;
    const zClamped = Math.max(-3, Math.min(3, z));
    const zNormalized = µ_anchor + zClamped * σ_global;
    return (1 - w) * rawEfficacy + w * zNormalized;
  } else {
    // Relative mode: rescale so all fundamentals share the same mean µ_anchor.
    // rescaledValue = rawEfficacy × (µ_anchor / µ_f)
    if (µ_f === 0) return rawEfficacy;
    const K = µ_anchor / µ_f;
    const rescaled = rawEfficacy * K;
    return (1 - w) * rawEfficacy + w * rescaled;
  }
}

/**
 * Compute FNC-adjusted z-score for priority weighting in training suggestions.
 * Returns how many standard deviations the value is from its fundamental mean.
 * Lower z-score (more negative) = higher training priority.
 *
 * @param {number} rawEfficacy
 * @param {string} fund
 * @param {Object} baselines
 * @returns {number} z-score (or 0 if baselines unavailable)
 */
export function computeFNCZScore(rawEfficacy, fund, baselines) {
  if (!baselines?.[fund]?.valid) return 0;
  const { mean: µ, std: σ } = baselines[fund];
  return (rawEfficacy - µ) / σ;
}

// ─── Helper functions ──────────────────────────────────────────────────────
function computeOpponentPerformanceFactor(match, allMatches) {
  if (!match.riepilogo || allMatches.length < 2) return 0;

  // Compare opponent's error rate in this match vs their average
  const oppData = reconstructOpponent(match);
  if (!oppData) return 0;

  const oppErrors = oppData.oppErrors.total;
  const totalRallies = match.rallies?.length || 1;
  const errorRate = oppErrors / totalRallies;

  // Get average error rate from all matches
  let totalAvgErrors = 0;
  let totalAvgRallies = 0;
  let count = 0;

  for (const m of allMatches) {
    if (m.id === match.id) continue;
    const oData = reconstructOpponent(m);
    if (!oData) continue;
    totalAvgErrors += oData.oppErrors.total;
    totalAvgRallies += m.rallies?.length || 0;
    count++;
  }

  if (count === 0 || totalAvgRallies === 0) return 0;

  const avgErrorRate = totalAvgErrors / totalAvgRallies;
  if (avgErrorRate === 0) return 0;

  // More errors than average → they played worse → easier for us → negative factor
  // Fewer errors → they played better → harder for us → positive factor
  return clamp((avgErrorRate - errorRate) / avgErrorRate, -1, 1);
}

function computeSetCompetitiveness(sets) {
  if (!sets || sets.length === 0) return 0;

  const maxMargin = 12; // realistic max margin
  const competitiveness = sets.map(s => {
    const margin = Math.abs(s.margin);
    return 1 - Math.min(margin / maxMargin, 1);
  });

  const avgComp = avg(competitiveness);
  return normalizeToRange(avgComp, -1, 1); // 0.5 is average
}

function computeMatchResultFactor(sets) {
  if (!sets || sets.length === 0) return 0;

  const setsWon = sets.filter(s => s.won).length;
  const setsLost = sets.filter(s => !s.won).length;
  const key = `${setsWon}-${setsLost}_${setsWon > setsLost ? 'win' : 'loss'}`;

  return RESULT_FACTORS[key]?.factor || 0;
}

function computeChainContextFactor(rallies) {
  if (!rallies || rallies.length === 0) return 0;

  // Average rally length indicates complexity of play
  const avgLength = avg(rallies.map(r => r.quartine.length));
  // Longer rallies = more complex play = harder context
  // Typical rally: 2-3 actions, complex: 5+
  return clamp((avgLength - 3) / 4, -0.5, 0.5);
}

function findOpponentInStandings(opponentName, standings) {
  return findOpponentStanding(opponentName, standings, TEAM_MAP);
}

// Fixed version that doesn't use require
export function findOpponentStanding(opponentName, standings, teamMap) {
  if (!opponentName || !standings) return null;
  const clean = opponentName.trim().toUpperCase();

  // Direct match
  let found = standings.find(t => t.name.toUpperCase() === clean);
  if (found) return found;

  // Partial match
  found = standings.find(t =>
    t.name.toUpperCase().includes(clean) || clean.includes(t.name.toUpperCase())
  );
  if (found) return found;

  // Via team map
  if (teamMap) {
    for (const [shortName, fullName] of Object.entries(teamMap)) {
      if (shortName.toUpperCase() === clean || fullName.toUpperCase() === clean) {
        found = standings.find(t =>
          t.name.toUpperCase().includes(fullName.toUpperCase()) ||
          t.name.toUpperCase().includes(shortName.toUpperCase())
        );
        if (found) return found;
      }
    }
  }

  return null;
}

function normalizeToRange(value, min, max) {
  return min + (value * (max - min));
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function avg(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function rollingAverage(arr, window) {
  return arr.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = arr.slice(start, i + 1);
    return avg(slice);
  });
}

function computeTrendDirection(values) {
  if (values.length < 3) return 'insufficient';
  const recent = values.slice(-3);
  const older = values.slice(0, -3);
  if (older.length === 0) return 'stable';

  const recentAvg = avg(recent);
  const olderAvg = avg(older);

  const change = olderAvg !== 0 ? (recentAvg - olderAvg) / Math.abs(olderAvg) : 0;

  if (change > 0.1) return 'improving';
  if (change < -0.1) return 'declining';
  return 'stable';
}

function fundLabel(fund) {
  const labels = { attack: 'Attacco', serve: 'Battuta', reception: 'Ricezione', defense: 'Difesa', block: 'Muro' };
  return labels[fund] || fund;
}

function getSuggestionAction(fund, decline, player, roleCode, roleConfig) {
  const roleName = roleConfig?.label || 'Giocatrice';

  // Role-specific training actions
  // NOTA: M = Schiacciatrice/Banda (Martello), C = Centrale — coerente con scout software
  const roleActions = {
    // SCHIACCIATRICE/BANDA (M) — tutti i fondamentali sono core
    M1: {
      attack: `Lavorare sull'attacco con ${player.name}. Come schiacciatrice, focus su palloni di qualità 3 (da bagher) e palloni staccati. Esercizi di attacco contro muro schierato e in situazione di rigiocata.`,
      reception: `Drill di ricezione per ${player.name} con battute aggressive. Come banda è fondamentale: lavorare su float, salto e potenza. Esercizi in coppia con il libero.`,
      serve: `Sessione battuta per ${player.name}. Valutare l'equilibrio aggressività/errori. Lavorare su variazione tattica: float corta, potenza lunga.`,
      defense: `Lavorare sulla difesa con ${player.name}. Come schiacciatrice le toccherà difendere diagonale e attacchi da posto 2. Esercizi di reazione e posizionamento.`,
      block: `Muro per ${player.name}: focus sulla chiusura in zona 4. Lavorare sul timing contro l'opposto avversario e sui fast centrali.`,
    },
    M2: null, // same as M1, will fallback
    // CENTRALE (C) — core: attacco (primo tempo), muro, battuta
    C1: {
      attack: `Lavorare sul timing del primo tempo con ${player.name}. Esercizi di attacco rapido con la palleggiatrice, variando l'altezza e la velocità dell'alzata. Focus sulla lettura del muro avversario.`,
      block: `Drill di muro per ${player.name}: lettura dell'alzata avversaria, spostamento laterale veloce, timing. Esercizi di muro a 2 con le bande.`,
      serve: `Sessione battuta per ${player.name}. Come centrale la battuta è un'arma tattica: lavorare su precisione e variazione più che su potenza.`,
    },
    C2: null, // same as C1
    // OPPOSTO — core: attacco, muro, battuta
    O: {
      attack: `Lavorare sull'attacco con ${player.name}. Come opposto è il terminale principale: focus su attacco da zona 2 e da seconda linea (pipe/zona 1). Palloni alti, staccati e situazioni di muro a 2.`,
      block: `Muro per ${player.name} in zona 2: lettura dello schiacciatore avversario di posto 4. Timing e chiusura del varco.`,
      serve: `Battuta per ${player.name}. Come opposto la battuta è un'arma importante: lavorare su potenza in salto e variazione tattica.`,
      defense: `Difesa secondaria per ${player.name}. Come opposto non è il core ma deve saper difendere in zona 1: esercizi specifici ma senza sottrarre tempo all'attacco.`,
    },
    // PALLEGGIATRICE — core: difesa; secondary: battuta, muro
    P1: {
      defense: `Lavorare sulla difesa con ${player.name}. Come palleggiatrice la difesa in seconda linea è fondamentale per la transizione. Esercizi di lettura e posizionamento in zona 1 e 6.`,
      block: `Muro per ${player.name}: come palleggiatrice è l'anello tattico del muro. Lavorare sulla lettura e sul posizionamento, non serve altezza ma tempismo.`,
      serve: `Battuta per ${player.name}. Come palleggiatrice la battuta è tattica: float precisa e variata. Non serve potenza ma efficacia nel mettere in difficoltà la ricezione avversaria.`,
    },
    P2: null,
    // LIBERO — core: ricezione, difesa (UNICI fondamentali possibili)
    L1: {
      reception: `Drill intensivi di ricezione per ${player.name}. Come libero è IL fondamentale: battute aggressive, float, salto, da diverse posizioni. Lavorare sulla comunicazione con le bande e sul posizionamento.`,
      defense: `Lavorare sulla difesa con ${player.name}. Come libero è fondamentale: esercizi di reazione su attacchi forti, lettura del muro, difesa su palle sporche e attacchi da seconda linea.`,
    },
    L2: null,
  };

  // Get the specific action for this role + fundamental
  const actions = roleActions[roleCode] || roleActions[roleCode?.replace(/\d/, '1')] || {};
  if (actions[fund]) return actions[fund];

  // Fallback: look at the same role-type (e.g., M2 → M1)
  const baseRole = roleCode ? roleCode.replace(/\d/, '1') : null;
  const fallbackActions = baseRole && roleActions[baseRole] ? roleActions[baseRole] : {};
  if (fallbackActions[fund]) return fallbackActions[fund];

  // Generic fallback
  return `Approfondire l'analisi su ${fundLabel(fund)} per ${player.name} (${roleName}). Verificare se il calo è strutturale o contestuale.`;
}

function getTargetRolesForFundamental(fund) {
  const targetMap = {
    attack: 'bande, opposto e centrali (primo tempo)',
    serve: 'tutte le giocatrici di ruolo (escluso libero)',
    reception: 'bande e libero (sistema di ricezione)',
    defense: 'libero, bande, palleggiatrice (difesa di squadra)',
    block: 'centrali, bande e opposto (sistema a muro)',
  };
  return targetMap[fund] || 'tutte le giocatrici coinvolte';
}

// ============================================================================
// CHAIN ANALYTICS — Analisi Sequenze di Gioco
// Funzioni per estrarre KPI avanzati dalle quartine dei rally
// ============================================================================

function _getPlayerName(playerNumber, roster) {
  const p = roster.find(r => r.number === playerNumber);
  if (!p) return `#${playerNumber}`;
  return (p.nickname && p.nickname.trim()) ? p.nickname.trim()
    : (p.surname && p.surname.trim()) ? p.surname.trim()
    : `#${playerNumber}`;
}

function _getRoleLabel(roleCode) {
  const labels = {
    M1: 'Schiacciatrice', M2: 'Schiacciatrice',
    C1: 'Centrale', C2: 'Centrale',
    O: 'Opposto',
    P1: 'Palleggiatrice', P2: 'Palleggiatrice',
    L1: 'Libero', L2: 'Libero',
  };
  return labels[roleCode] || '';
}

// ─── 1. R/D → A Conversion Matrix per player ─────────────────────────────
// Constructs the conversion matrix (input quality → attack quality) from rally quartine.
// Side-out (phase='r'): tracks R→A pairs. Transition (phase='b'): tracks D→A pairs.
export function analyzeRDtoAConversions(allMatches, roster = []) {
  const players = {};

  function ensure(pNum) {
    if (!players[pNum]) {
      players[pNum] = {
        name: _getPlayerName(pNum, roster),
        sideOut: { R3: {}, R4: {}, R5: {} },
        transition: { D3: {}, D4: {}, D5: {} },
        totalAttacks: 0,
        itaPositive: 0,
        itaNegative: 0,
        itaNet: 0,
      };
    }
  }

  for (const match of allMatches) {
    for (const rally of match.rallies || []) {
      const { quartine, phase } = rally;
      if (!quartine || quartine.length < 2) continue;

      // SIDE-OUT (phase='r'): find first R token → next A token (first attacker)
      if (phase === 'r') {
        for (let i = 0; i < quartine.length - 1; i++) {
          const curr = quartine[i];
          if (curr.type !== 'action' || curr.fundamental !== 'r' || !curr.value || curr.value < 3) continue;
          // Find next A in sequence
          for (let j = i + 1; j < quartine.length; j++) {
            const next = quartine[j];
            if (next.type === 'action' && next.fundamental === 'a' && next.player && next.value) {
              ensure(next.player);
              const rKey = `R${curr.value}`;
              if (players[next.player].sideOut[rKey] !== undefined) {
                const aKey = `A${next.value}`;
                players[next.player].sideOut[rKey][aKey] = (players[next.player].sideOut[rKey][aKey] || 0) + 1;
              }
              break;
            }
          }
          break; // only process first R per rally
        }
      }

      // TRANSITION (phase='b'): find D token → next A token
      if (phase === 'b') {
        let foundD = false;
        for (let i = 0; i < quartine.length - 1; i++) {
          const curr = quartine[i];
          if (curr.type !== 'action' || curr.fundamental !== 'd' || !curr.value || curr.value < 3) continue;
          foundD = true;
          for (let j = i + 1; j < quartine.length; j++) {
            const next = quartine[j];
            if (next.type === 'action' && next.fundamental === 'a' && next.player && next.value) {
              ensure(next.player);
              const dKey = `D${curr.value}`;
              if (players[next.player].transition[dKey] !== undefined) {
                const aKey = `A${next.value}`;
                players[next.player].transition[dKey][aKey] = (players[next.player].transition[dKey][aKey] || 0) + 1;
              }
              break;
            }
          }
          if (foundD) break; // only first D per rally
        }
      }
    }
  }

  // Compute ITA scores per player
  for (const pNum of Object.keys(players)) {
    const p = players[pNum];
    let positive = 0, negative = 0, total = 0;

    for (const rKey of ['R3', 'R4', 'R5']) {
      for (const [aKey, cnt] of Object.entries(p.sideOut[rKey])) {
        total += cnt;
        if (rKey === 'R3' && (aKey === 'A4' || aKey === 'A5')) positive += cnt;
        if (rKey === 'R5' && (aKey === 'A1' || aKey === 'A2')) negative += cnt;
      }
    }
    for (const dKey of ['D3', 'D4', 'D5']) {
      for (const [aKey, cnt] of Object.entries(p.transition[dKey])) {
        total += cnt;
        if (dKey === 'D3' && (aKey === 'A4' || aKey === 'A5')) positive += cnt;
        if (dKey === 'D5' && (aKey === 'A1' || aKey === 'A2')) negative += cnt;
      }
    }

    p.itaPositive = positive;
    p.itaNegative = negative;
    p.totalAttacks = total;
    p.itaNet = total > 0 ? (positive - negative) / total : 0;
  }

  return players;
}

// ─── 2. Side-out vs Transition attack efficiency per player ───────────────
export function analyzeSideOutVsTransition(allMatches, roster = []) {
  const players = {};

  function ensure(pNum) {
    if (!players[pNum]) {
      players[pNum] = {
        name: _getPlayerName(pNum, roster),
        sideOut:    { total: 0, effSum: 0, pts: 0 },
        transition: { total: 0, effSum: 0, pts: 0 },
        totalAttacks: 0,
      };
    }
  }

  for (const match of allMatches) {
    for (const rally of match.rallies || []) {
      const { quartine, phase } = rally;
      if (!quartine) continue;

      for (let i = 0; i < quartine.length; i++) {
        const action = quartine[i];
        if (action.type !== 'action' || action.fundamental !== 'a' || !action.player || !action.value) continue;

        const pNum = action.player;
        ensure(pNum);
        const v = action.value;

        if (phase === 'r') {
          // Side-out: attack following reception
          players[pNum].sideOut.total++;
          players[pNum].sideOut.effSum += v;
          if (v >= 4) players[pNum].sideOut.pts++;
        } else if (phase === 'b') {
          // Transition: check if there's a D action before this A in the same rally
          const hasPriorD = quartine.slice(0, i).some(q => q.type === 'action' && q.fundamental === 'd');
          if (hasPriorD) {
            players[pNum].transition.total++;
            players[pNum].transition.effSum += v;
            if (v >= 4) players[pNum].transition.pts++;
          } else {
            // Freeball / direct attack in break-point: classify with side-out
            players[pNum].sideOut.total++;
            players[pNum].sideOut.effSum += v;
            if (v >= 4) players[pNum].sideOut.pts++;
          }
        }
      }
    }
  }

  // Compute final metrics
  for (const pNum of Object.keys(players)) {
    const p = players[pNum];
    p.sideOut.efficacy    = p.sideOut.total    > 0 ? p.sideOut.effSum    / (p.sideOut.total    * 5) : null;
    p.transition.efficacy = p.transition.total > 0 ? p.transition.effSum / (p.transition.total * 5) : null;
    p.sideOut.posPct    = p.sideOut.total    > 0 ? p.sideOut.pts    / p.sideOut.total    : null;
    p.transition.posPct = p.transition.total > 0 ? p.transition.pts / p.transition.total : null;
    p.totalAttacks = p.sideOut.total + p.transition.total;

    if (p.sideOut.efficacy !== null && p.transition.efficacy !== null) {
      p.gap = p.sideOut.efficacy - p.transition.efficacy;
    } else {
      p.gap = null;
    }
  }

  return players;
}

// ─── 3. Serve → Defense chain quality ────────────────────────────────────
// For phase='b' rallies: group by our serve quality (B1-B5),
// then measure the subsequent defense (D) quality.
export function analyzeServeDefenseChain(allMatches) {
  const byServe = {};
  for (let v = 1; v <= 5; v++) {
    byServe[`B${v}`] = { total: 0, defTotal: 0, defPos: 0 };
  }

  for (const match of allMatches) {
    for (const rally of match.rallies || []) {
      const { quartine, phase } = rally;
      if (phase !== 'b' || !quartine || quartine.length === 0) continue;

      // Find first B token (our serve)
      const serveAction = quartine.find(q => q.type === 'action' && q.fundamental === 'b');
      if (!serveAction || !serveAction.value) continue;

      const bKey = `B${serveAction.value}`;
      if (!byServe[bKey]) continue;
      byServe[bKey].total++;

      // Find next D (our defense after opponent attacks)
      const serveIdx = quartine.indexOf(serveAction);
      const defAction = quartine.slice(serveIdx + 1).find(q => q.type === 'action' && q.fundamental === 'd');
      if (defAction && defAction.value) {
        byServe[bKey].defTotal++;
        if (defAction.value >= 4) byServe[bKey].defPos++;
      }
    }
  }

  // Compute percentages
  for (const key of Object.keys(byServe)) {
    const s = byServe[key];
    s.defPosPct       = s.defTotal > 0 ? s.defPos    / s.defTotal : null;
    s.defReachedPct   = s.total    > 0 ? s.defTotal  / s.total    : null;
  }

  // Score: quality of defense on aggressive serves (B4+B5)
  const b45DefTotal = (byServe['B4']?.defTotal || 0) + (byServe['B5']?.defTotal || 0);
  const b45DefPos   = (byServe['B4']?.defPos   || 0) + (byServe['B5']?.defPos   || 0);
  const goodServeDefenseScore = b45DefTotal > 0 ? b45DefPos / b45DefTotal : null;

  return { byServe, goodServeDefenseScore };
}

// ─── 4. Attack performance by rally length ────────────────────────────────
// short: 1-2 actions, medium: 3-4, long: 5+
export function analyzeRallyLengthPerformance(allMatches, roster = []) {
  const playerMap = {};
  const team = { short: {t:0,p:0}, medium: {t:0,p:0}, long: {t:0,p:0} };

  function ensure(pNum) {
    if (!playerMap[pNum]) {
      playerMap[pNum] = {
        name: _getPlayerName(pNum, roster),
        short:  { t: 0, p: 0 },
        medium: { t: 0, p: 0 },
        long:   { t: 0, p: 0 },
      };
    }
  }

  for (const match of allMatches) {
    for (const rally of match.rallies || []) {
      const { quartine } = rally;
      if (!quartine) continue;

      const actionCount = quartine.filter(q => q.type === 'action').length;
      const cat = actionCount <= 2 ? 'short' : actionCount <= 4 ? 'medium' : 'long';

      for (const action of quartine) {
        if (action.type !== 'action' || action.fundamental !== 'a' || !action.player || !action.value) continue;
        const pNum = action.player;
        ensure(pNum);
        const good = action.value >= 4 ? 1 : 0;
        playerMap[pNum][cat].t++;
        playerMap[pNum][cat].p += good;
        team[cat].t++;
        team[cat].p += good;
      }
    }
  }

  function finalize(obj) {
    return {
      short:  { total: obj.short.t,  pts: obj.short.p,  pct: obj.short.t  > 0 ? obj.short.p  / obj.short.t  : null },
      medium: { total: obj.medium.t, pts: obj.medium.p, pct: obj.medium.t > 0 ? obj.medium.p / obj.medium.t : null },
      long:   { total: obj.long.t,   pts: obj.long.p,   pct: obj.long.t   > 0 ? obj.long.p   / obj.long.t   : null },
    };
  }

  const players = {};
  for (const [pNum, raw] of Object.entries(playerMap)) {
    const fin = finalize(raw);
    const drop = (fin.medium.pct !== null && fin.long.pct !== null) ? fin.medium.pct - fin.long.pct : null;
    players[pNum] = { name: raw.name, ...fin, drop };
  }

  return { players, team: finalize(team) };
}

// ─── 5. Rotational chain analysis ─────────────────────────────────────────
// Per rotation: side-out%, break-point%, transition (D→A in phase='b')%
export function analyzeRotationalChains(allMatches) {
  const rotations = {};

  function ensure(rot) {
    const k = `R${rot}`;
    if (!rotations[k]) {
      rotations[k] = {
        rotation: rot,
        sideOut:    { total: 0, won: 0 },
        breakPoint: { total: 0, won: 0 },
        transition: { total: 0, won: 0 },
      };
    }
    return k;
  }

  for (const match of allMatches) {
    for (const rally of match.rallies || []) {
      const { quartine, phase, rotation, isPoint } = rally;
      if (!rotation || !quartine) continue;

      const k = ensure(rotation);

      if (phase === 'r') {
        rotations[k].sideOut.total++;
        if (isPoint) rotations[k].sideOut.won++;
      } else if (phase === 'b') {
        rotations[k].breakPoint.total++;
        if (isPoint) rotations[k].breakPoint.won++;

        // Transition: phase='b' rally that contains a D followed by an A
        const hasTransition = quartine.some((q, i) =>
          q.type === 'action' && q.fundamental === 'd' &&
          quartine.slice(i + 1).some(q2 => q2.type === 'action' && q2.fundamental === 'a')
        );
        if (hasTransition) {
          rotations[k].transition.total++;
          if (isPoint) rotations[k].transition.won++;
        }
      }
    }
  }

  // Compute percentages
  for (const k of Object.keys(rotations)) {
    const r = rotations[k];
    r.sideOut.pct    = r.sideOut.total    > 0 ? r.sideOut.won    / r.sideOut.total    : null;
    r.breakPoint.pct = r.breakPoint.total > 0 ? r.breakPoint.won / r.breakPoint.total : null;
    r.transition.pct = r.transition.total > 0 ? r.transition.won / r.transition.total : null;
  }

  const validRots = Object.values(rotations).filter(r => r.sideOut.total >= 5);
  const avgSideOut    = validRots.length > 0 ? avg(validRots.map(r => r.sideOut.pct).filter(v => v !== null)) : null;
  const avgBreakPoint = validRots.length > 0 ? avg(validRots.map(r => r.breakPoint.pct).filter(v => v !== null)) : null;

  return { rotations, avgSideOut, avgBreakPoint };
}

// ─── 6. Generate chain-based training suggestions ─────────────────────────
export function generateChainSuggestions(chainData, roster = []) {
  const sugg = [];
  const { rdToA, sideOutVsTransition, serveDefense, rallyLength, rotationalChains } = chainData || {};

  const playerRoleMap = {};
  for (const p of roster) {
    if (p.number && p.role) playerRoleMap[p.number] = p.role.trim();
  }

  const MIN_ATT = 8; // minimum attacks for meaningful analysis

  // ── R/D → A conversions ──────────────────────────────────────────────────
  if (rdToA) {
    for (const [pNum, pd] of Object.entries(rdToA)) {
      if (pd.totalAttacks < MIN_ATT) continue;
      const role = _getRoleLabel(playerRoleMap[pNum]);

      // R5 waste: perfect reception → bad attack
      const r5 = pd.sideOut['R5'] || {};
      const r5tot   = Object.values(r5).reduce((s, v) => s + v, 0);
      const r5waste = (r5['A1'] || 0) + (r5['A2'] || 0);
      if (r5tot >= 5 && r5waste / r5tot > 0.30) {
        sugg.push({
          type: 'r_to_a_waste', priority: 4, isChainSuggestion: true,
          player: pd.name, playerNumber: pNum, role, roleCode: playerRoleMap[pNum],
          fundamental: 'attack', isCore: true, chainType: 'r_to_a',
          message: `${pd.name} (${role || '?'}): spreca il ${Math.round(r5waste/r5tot*100)}% delle ricezioni perfette (R5) in attacchi poco efficaci (A1/A2). Su ${r5tot} ricezioni R5, ${r5waste} si sono concluse in errore o freeball. La qualità dell'alzata c'è, ma non viene sfruttata.`,
          action: `Analizzare il timing sull'alzata alta: su R5 la palleggiatrice offre le opzioni migliori. Drill: ricezione R5 simulata → attacco variato (diagonale stretta, palla corta, cambio di direzione). Analisi video su queste situazioni specifiche.`,
          chainData: { label: 'R5→A', values: r5, total: r5tot, wastePct: r5waste / r5tot },
        });
      }

      // R3 transformer: bagher reception → good attack (positive signal)
      const r3 = pd.sideOut['R3'] || {};
      const r3tot = Object.values(r3).reduce((s, v) => s + v, 0);
      const r3pos = (r3['A4'] || 0) + (r3['A5'] || 0);
      if (r3tot >= 5 && r3pos / r3tot > 0.35) {
        sugg.push({
          type: 'r3_to_a_transformer', priority: 1, isChainSuggestion: true,
          player: pd.name, playerNumber: pNum, role, roleCode: playerRoleMap[pNum],
          fundamental: 'attack', isCore: true, chainType: 'r_to_a',
          message: `${pd.name} (${role || '?'}): trasforma il ${Math.round(r3pos/r3tot*100)}% delle ricezioni da bagher (R3) in attacchi efficaci (A4/A5) — ${r3pos} su ${r3tot}. Punto di forza nascosto: mantiene efficacia anche su palla difficile.`,
          action: `Valorizzare in situazioni di R3 squadra: è la giocatrice che ha dimostrato di saperle gestire meglio. Mantenere il focus attuale.`,
          chainData: { label: 'R3→A', values: r3, total: r3tot, posPct: r3pos / r3tot },
        });
      }

      // D5 waste: perfect defense → bad attack
      const d5 = pd.transition['D5'] || {};
      const d5tot   = Object.values(d5).reduce((s, v) => s + v, 0);
      const d5waste = (d5['A1'] || 0) + (d5['A2'] || 0);
      if (d5tot >= 4 && d5waste / d5tot > 0.35) {
        sugg.push({
          type: 'd_to_a_waste', priority: 4, isChainSuggestion: true,
          player: pd.name, playerNumber: pNum, role, roleCode: playerRoleMap[pNum],
          fundamental: 'attack', isCore: true, chainType: 'd_to_a',
          message: `${pd.name} (${role || '?'}): in transizione, spreca il ${Math.round(d5waste/d5tot*100)}% delle difese di qualità (D5) in attacchi poco efficaci (A1/A2). La difesa è ottima ma l'attacco successivo non rende. Problema di rincorsa o timing da posizione a rete.`,
          action: `Drill di transizione: partenza da rete dopo muro (tocco o no), rincorsa corta su alzata alta. Esercizi 6vs6 con break-point: chi difende poi attacca immediatamente.`,
          chainData: { label: 'D5→A', values: d5, total: d5tot, wastePct: d5waste / d5tot },
        });
      }

      // D3 transformer in transition (positive)
      const d3 = pd.transition['D3'] || {};
      const d3tot = Object.values(d3).reduce((s, v) => s + v, 0);
      const d3pos = (d3['A4'] || 0) + (d3['A5'] || 0);
      if (d3tot >= 4 && d3pos / d3tot > 0.35) {
        sugg.push({
          type: 'd3_to_a_transformer', priority: 1, isChainSuggestion: true,
          player: pd.name, playerNumber: pNum, role, roleCode: playerRoleMap[pNum],
          fundamental: 'attack', isCore: true, chainType: 'd_to_a',
          message: `${pd.name} (${role || '?'}): eccellente in transizione difficile — trasforma il ${Math.round(d3pos/d3tot*100)}% delle difese da bagher (D3) in attacchi positivi (A4/A5). Attaccante affidabile anche nei break-point più difficili.`,
          action: `Consolidare. Privilegiare l'alzata verso questa giocatrice nei break-point da D3 di squadra.`,
          chainData: { label: 'D3→A', values: d3, total: d3tot, posPct: d3pos / d3tot },
        });
      }
    }
  }

  // ── Side-out vs Transition gap ────────────────────────────────────────────
  if (sideOutVsTransition) {
    for (const [pNum, pd] of Object.entries(sideOutVsTransition)) {
      if (pd.totalAttacks < MIN_ATT) continue;
      if (pd.sideOut.total < 5 || pd.transition.total < 5) continue;
      if (pd.gap === null) continue;
      const role = _getRoleLabel(playerRoleMap[pNum]);

      if (pd.gap > 0.20) {
        const prio = pd.gap > 0.30 ? 4 : 3;
        sugg.push({
          type: 'side_out_vs_transition_gap', priority: prio, isChainSuggestion: true,
          player: pd.name, playerNumber: pNum, role, roleCode: playerRoleMap[pNum],
          fundamental: 'attack', isCore: true, chainType: 'transition_gap',
          message: `${pd.name} (${role || '?'}): efficacia in side-out ${Math.round((pd.sideOut.efficacy||0)*100)}% vs transizione ${Math.round((pd.transition.efficacy||0)*100)}% — gap di ${Math.round(pd.gap*100)} punti percentuali. Attacca bene da ricezione ma fatica quando parte da rete o da difesa corta.`,
          action: `Drill di transizione specifici: partenza da rete, rincorsa corta su palla alta e media. 6vs6 con focus break-point: chi difende poi attacca immediatamente. Automatizzare il primo passo di rincorsa dalla posizione a rete.`,
          chainData: { sideOut: pd.sideOut, transition: pd.transition, gap: pd.gap },
        });
      } else if (pd.gap < -0.15) {
        sugg.push({
          type: 'transition_stronger', priority: 1, isChainSuggestion: true,
          player: pd.name, playerNumber: pNum, role, roleCode: playerRoleMap[pNum],
          fundamental: 'attack', isCore: true, chainType: 'transition_gap',
          message: `${pd.name} (${role || '?'}): più efficace in transizione (${Math.round((pd.transition.efficacy||0)*100)}%) che in side-out (${Math.round((pd.sideOut.efficacy||0)*100)}%). Attaccante da break-point: rende meglio partendo da rete o da difesa.`,
          action: `Valorizzare nei momenti di break-point. Analizzare perché il side-out è meno efficace: timing con la palleggiatrice? Scelta di colpo su alzata alta?`,
          chainData: { sideOut: pd.sideOut, transition: pd.transition, gap: pd.gap },
        });
      }
    }
  }

  // ── Serve → Defense chain ─────────────────────────────────────────────────
  if (serveDefense) {
    const b45tot = (serveDefense.byServe['B4']?.defTotal || 0) + (serveDefense.byServe['B5']?.defTotal || 0);
    if (b45tot >= 8 && serveDefense.goodServeDefenseScore !== null && serveDefense.goodServeDefenseScore < 0.40) {
      sugg.push({
        type: 'serve_defense_break', priority: 3, isChainSuggestion: true,
        fundamental: 'defense', chainType: 'serve_defense',
        message: `Squadra: dopo battute aggressive (B4/B5), la difesa successiva è positiva (D4/D5) solo nel ${Math.round(serveDefense.goodServeDefenseScore*100)}% dei casi. Le nostre buone battute non si traducono in un vantaggio difensivo.`,
        action: `Lavorare sul posizionamento difensivo post-battuta: su B4/B5 l'avversario riceve male e attacca in modo obbligato. Il sistema difensivo deve essere già orientato prima che l'attacco parta. Drill: battuta + lettura immediata e posizionamento.`,
        chainData: { byServe: serveDefense.byServe, score: serveDefense.goodServeDefenseScore },
      });
    }
  }

  // ── Rally length fatigue ──────────────────────────────────────────────────
  if (rallyLength) {
    // Team level
    const t = rallyLength.team;
    if (t.long.total >= 6 && t.medium.pct !== null && t.long.pct !== null && (t.medium.pct - t.long.pct) > 0.18) {
      sugg.push({
        type: 'rally_length_fatigue_team', priority: 3, isChainSuggestion: true,
        fundamental: 'attack', chainType: 'rally_length',
        message: `Squadra: efficacia attacco cala dal ${Math.round(t.medium.pct*100)}% (rally 3-4 azioni) al ${Math.round(t.long.pct*100)}% (rally lunghi 5+ azioni). Calo di ${Math.round((t.medium.pct - t.long.pct)*100)} punti percentuali nei rally prolungati.`,
        action: `Inserire drill di rally lungo (regola: punto solo dopo 5+ scambi). Aumentare la durata degli scambi in allenamento per simulare la pressione fisica e mentale dei rally prolungati.`,
        chainData: { team: t },
      });
    }
    // Per player
    for (const [pNum, pd] of Object.entries(rallyLength.players || {})) {
      if (!pd.long || pd.long.total < 5 || pd.medium.total < 5) continue;
      if (pd.drop === null || pd.drop < 0.25) continue;
      const role = _getRoleLabel(playerRoleMap[pNum]);
      sugg.push({
        type: 'rally_length_fatigue', priority: 3, isChainSuggestion: true,
        player: pd.name, playerNumber: pNum, role, roleCode: playerRoleMap[pNum],
        fundamental: 'attack', isCore: true, chainType: 'rally_length',
        message: `${pd.name} (${role || '?'}): calo del ${Math.round(pd.drop*100)}% nei rally lunghi (5+ azioni: ${Math.round(pd.long.pct*100)}% vs rally medi: ${Math.round(pd.medium.pct*100)}%). Segnale di calo fisico o mentale nei rally prolungati.`,
        action: `Drill di resistenza: attacchi ripetuti in serie, mantenimento della tecnica sotto fatica. Situazioni simulate di rally lungo con questa giocatrice come terminale finale.`,
        chainData: { short: pd.short, medium: pd.medium, long: pd.long, drop: pd.drop },
      });
    }
  }

  // ── Rotational chain weaknesses ───────────────────────────────────────────
  if (rotationalChains) {
    const { rotations, avgSideOut } = rotationalChains;
    if (avgSideOut !== null) {
      for (const [, rot] of Object.entries(rotations)) {
        if (rot.sideOut.total < 8 || rot.sideOut.pct === null) continue;
        if (rot.sideOut.pct < avgSideOut - 0.14) {
          sugg.push({
            type: 'rotation_chain_weakness', priority: 4, isChainSuggestion: true,
            fundamental: 'attack', chainType: 'rotation', rotation: rot.rotation,
            message: `Rotazione ${rot.rotation}: side-out al ${Math.round(rot.sideOut.pct*100)}% vs media squadra ${Math.round(avgSideOut*100)}%. In questa rotazione facciamo significativamente più fatica a chiudere il punto da ricezione.`,
            action: `Drill di side-out specifici per rotazione ${rot.rotation}: partire dalla configurazione reale in campo, simulare le battute più ricevute in quella posizione, lavorare sulla catena ricezione → alzata → attacco con le giocatrici effettivamente coinvolte.`,
            chainData: { rotation: rot.rotation, sideOut: rot.sideOut, avgSideOut },
          });
        }
      }
    }
  }

  // Sort: priority desc
  sugg.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.isCore && !b.isCore) return -1;
    if (!a.isCore && b.isCore) return 1;
    return 0;
  });

  return sugg;
}
