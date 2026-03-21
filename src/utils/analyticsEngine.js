// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Analytics Engine
// Weighting, opponent reconstruction, trends, training suggestions
// ============================================================================

import { INVERSE_MAP, DEFAULT_WEIGHTS, RESULT_FACTORS, TEAM_MAP, ROLE_CORE_FUNDAMENTALS, DEFAULT_FNC_CONFIG } from './constants';
import { areTeamNamesLikelySame, normalizeTeamNameForMatch } from './teamNameMatcher';

// ─── Date normalisation helper (DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD) ───────
function _normDate(d) {
  if (!d) return '';
  const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return String(d);
}

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
    attack: deduceOpponentAttack(team.defense, rallies, team.block),
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
    efficacy:   total > 0 ? serve5 / total : 0,                          // Efficacia = Azioni Vincenti / Totale
    efficiency: total > 0 ? (serve5 - serve1 - serve2) / total : 0,      // Efficienza = (Vincenti - Errori - Muri Subiti) / Totale
    mediaPond: total > 0 ? (serve1 + 2*serve2 + 3*serve3 + 4*serve4 + 5*serve5) / total : 0,
  };
}

function deduceOpponentAttack(ourDefense, rallies, ourBlock) {
  // Our D1 → their Attack 5, D2 → Attack 4, D3 → Attack 3, D4+D5 → Attack 2
  // Also include block contributions to attack deduction:
  // - Block errors → Attack 5
  // - Block exc/neg → Attack 2
  // - Block kill → Attack 1
  let attack5 = ourDefense.err || 0;   // D1
  const attack4 = ourDefense.neg || 0;   // D2
  const attack3 = ourDefense.exc || 0;   // D3
  let attack2 = (ourDefense.pos || 0) + (ourDefense.kill || 0); // D4 + D5

  // Add block contributions
  if (ourBlock) {
    attack5 += ourBlock.err || 0;        // block errors → opponent attack 5
    attack2 += (ourBlock.exc || 0) + (ourBlock.neg || 0); // block exc+neg → opponent attack 2
  }

  // Attack 1 = opponent attack errors
  // Count from rallies where "avv" is preceded by a touch action (not alone)
  let attack1 = rallies.filter(r => {
    if (r.quartine.length < 2) return false;
    const last = r.quartine[r.quartine.length - 1];
    const prev = r.quartine[r.quartine.length - 2];
    return last.type === 'opponent_error' && prev.type === 'action';
  }).length;

  // Add block kills to opponent attack 1
  if (ourBlock) {
    attack1 += ourBlock.kill || 0;       // block kills → opponent attack 1
  }

  const total = attack5 + attack4 + attack3 + attack2 + attack1;
  return {
    val5: attack5, val4: attack4, val3: attack3, val2: attack2, val1: attack1,
    total,
    efficacy:   total > 0 ? attack5 / total : 0,                           // Efficacia = Azioni Vincenti / Totale
    efficiency: total > 0 ? (attack5 - attack1 - attack2) / total : 0,     // Efficienza = (Vincenti - Errori - Muri Subiti) / Totale
    mediaPond: total > 0 ? (attack1 + 2*attack2 + 3*attack3 + 4*attack4 + 5*attack5) / total : 0,
  };
}

function deduceOpponentDefense(ourAttack) {
  // Our A5 → their Defense 1, A4 → Defense 2, A3 → Defense 3, A2 → Defense 4+5
  const v1 = ourAttack.kill || 0;
  const v2 = ourAttack.pos  || 0;
  const v3 = ourAttack.exc  || 0;
  const v45 = ourAttack.neg || 0;   // A2 → D4+5 (combined)
  const total = v1 + v2 + v3 + v45;
  // For val4+5 combined: estimate val4 = combined/3, val5 = 2*combined/3
  // Weighted contribution = 4*(combined/3) + 5*(2*combined/3) = (14/3)*combined
  return {
    val1: v1, val2: v2, val3: v3, 'val4+5': v45, total,
    mediaPond: total > 0 ? (v1 + 2*v2 + 3*v3 + (14/3)*v45) / total : 0,
  };
}

function deduceOpponentReception(ourServe) {
  // Our B5 → their Reception 1, B4 → Reception 2, B3 → Reception 3, B2 → Reception 4+5
  const v1 = ourServe.kill || 0;
  const v2 = ourServe.pos  || 0;
  const v3 = ourServe.exc  || 0;
  const v45 = ourServe.neg || 0;   // B2 → R4+5 (combined)
  const total = v1 + v2 + v3 + v45;
  // For val4+5 combined: estimate val4 = combined/3, val5 = 2*combined/3
  // Weighted contribution = 4*(combined/3) + 5*(2*combined/3) = (14/3)*combined
  return {
    val1: v1, val2: v2, val3: v3, 'val4+5': v45, total,
    mediaPond: total > 0 ? (v1 + 2*v2 + 3*v3 + (14/3)*v45) / total : 0,
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
  const numOrZero = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };
  const normalizeRate = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    if (Math.abs(numeric) <= 1) return numeric;
    return numeric / 100;
  };
  const deriveRateFromCounts = (data = {}, metric = 'efficacy') => {
    const tot = numOrZero(data?.tot);
    if (tot <= 0) return 0;
    const kill = numOrZero(data?.kill);
    const err = numOrZero(data?.err);
    const neg = numOrZero(data?.neg);
    if (metric === 'efficiency') return (kill - err - neg) / tot;
    return kill / tot;
  };

  return playerStats.map(p => {
    const recData = playerReception.find(r => r.number === p.number);
    const defData = playerDefense.find(d => d.number === p.number);
    const attackTot = numOrZero(p.attack?.tot);
    const serveTot = numOrZero(p.serve?.tot);
    const blockTot = numOrZero(p.block?.tot) || (
      numOrZero(p.block?.kill) + numOrZero(p.block?.pos) + numOrZero(p.block?.exc) + numOrZero(p.block?.neg) + numOrZero(p.block?.err)
    );
    const receptionTot = numOrZero(recData?.tot);
    const defenseTot = numOrZero(defData?.tot);
    const attackEfficacy = attackTot > 0 ? deriveRateFromCounts(p.attack, 'efficacy') : normalizeRate(p.attack?.efficacy);
    const attackEfficiency = attackTot > 0 ? deriveRateFromCounts(p.attack, 'efficiency') : normalizeRate(p.attack?.efficiency);
    const serveEfficacy = serveTot > 0 ? deriveRateFromCounts(p.serve, 'efficacy') : normalizeRate(p.serve?.efficacy);
    const serveEfficiency = serveTot > 0 ? deriveRateFromCounts(p.serve, 'efficiency') : normalizeRate(p.serve?.efficiency);
    const blockEfficacy = blockTot > 0 ? deriveRateFromCounts({ ...p.block, tot: blockTot }, 'efficacy') : normalizeRate(p.block?.efficacy);
    const blockEfficiency = blockTot > 0 ? deriveRateFromCounts({ ...p.block, tot: blockTot }, 'efficiency') : normalizeRate(p.block?.efficiency);
    const receptionEfficacy = receptionTot > 0 ? deriveRateFromCounts(recData, 'efficacy') : normalizeRate(recData?.efficacy);
    const receptionEfficiency = receptionTot > 0 ? deriveRateFromCounts(recData, 'efficiency') : normalizeRate(recData?.efficiency);
    const defenseEfficacy = defenseTot > 0 ? deriveRateFromCounts(defData, 'efficacy') : normalizeRate(defData?.efficacy);
    const defenseEfficiency = defenseTot > 0 ? deriveRateFromCounts(defData, 'efficiency') : normalizeRate(defData?.efficiency);

    const raw = {
      attack: { efficacy: attackEfficacy, efficiency: attackEfficiency, tot: attackTot },
      serve: { efficacy: serveEfficacy, efficiency: serveEfficiency, tot: serveTot },
      block: {
        efficacy: blockEfficacy,
        efficiency: blockEfficiency,
        tot: blockTot,
      },
      reception: { efficacy: receptionEfficacy, efficiency: receptionEfficiency, tot: receptionTot },
      defense: { efficacy: defenseEfficacy, efficiency: defenseEfficiency, tot: defenseTot },
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
        playerMap[ps.number] = { number: ps.number, name: ps.name, nickname: ps.nickname || '', matches: [] };
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
    player.matches.sort((a, b) => _normDate(a.date).localeCompare(_normDate(b.date)));

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

      const playedMatches = matchesWithData.filter(m => m.played);
      const validPlayedMatches = playedMatches.filter(
        m => Number.isFinite(m.raw?.[fund]?.efficacy) && Number.isFinite(m.weighted?.[fund]?.efficacy)
      );

      const rawValues = validPlayedMatches.map(m => m.raw[fund].efficacy);
      const weightedValues = validPlayedMatches.map(m => m.weighted[fund].efficacy);

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
        matchLabels: validPlayedMatches.map(m => ({ opponent: m.opponent, date: m.date, matchId: m.matchId, weight: m.matchWeight })),
        totalMatches: player.matches.length,
        playedMatches: validPlayedMatches.length,
      };
    }
  }

  return playerMap;
}

// ─── Generate training suggestions (role-aware) ───────────────────────────
export function generateTrainingSuggestions(playerTrends, teamStats, roster = []) {
  const suggestions = [];

  // Helper: display name for a player (nickname > name)
  const pDisplay = (player) => (player.nickname && player.nickname.trim()) ? player.nickname.trim() : (player.name || `#${player.number}`);

  // Build a lookup: playerNumber → role code (e.g., 'M1', 'C2', 'L1')
  const playerRoleMap = {};
  const playerNickMap = {};
  for (const p of roster) {
    if (p.number) {
      playerNickMap[p.number] = (p.nickname || '').trim() || (p.name || '').trim();
    }
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
            message = `${pDisplay(player)} (${roleLabel || '?'}): ${fundLabel(fund)} — il dato grezzo sembra ${trend.rawTrend === 'stable' ? 'stabile' : 'in miglioramento'} ma contestualizzando la difficoltà degli avversari affrontati emerge un calo reale del ${decline.toFixed(0)}% (ultime 3 partite: ${(recentAvg * 100).toFixed(1)}% vs precedente: ${(olderAvg * 100).toFixed(1)}%).${isCoreFund ? ' ⚠ Fondamentale CORE per il suo ruolo.' : ''}`;
          } else {
            // Both declining — show the actual segment comparison + last match for context
            const lastMatchNote = lastVal > recentAvg
              ? ` Ultima partita (${(lastVal * 100).toFixed(1)}%) sopra la media recente — monitorare.`
              : ` Ultima partita: ${(lastVal * 100).toFixed(1)}%.`;
            message = `${pDisplay(player)} (${roleLabel || '?'}): ${fundLabel(fund)} in calo (${decline.toFixed(0)}% nelle ultime 3 partite). Ultime 3: ${(recentAvg * 100).toFixed(1)}% vs precedente: ${(olderAvg * 100).toFixed(1)}%.${lastMatchNote}${isCoreFund ? ' ⚠ Fondamentale CORE per il suo ruolo.' : ''}`;
          }

          suggestions.push({
            type: 'player_decline',
            priority,
            player: pDisplay(player),
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
          player: pDisplay(player),
          playerNumber: num,
          role: roleLabel,
          roleCode,
          fundamental: fund,
          isCore: isCoreFund,
          message: `${pDisplay(player)} (${roleLabel}): ${fundLabel(fund)} — dato grezzo stabile ma il contesto avversari rivela un calo nascosto. Le ultime partite erano contro avversari più deboli che mascherano la flessione.${isCoreFund ? ' Fondamentale core: monitorare con attenzione.' : ''}`,
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
            message = `${pDisplay(player)} (${roleLabel}): ${fundLabel(fund)} — il dato grezzo non lo mostra chiaramente, ma contestualizzando gli avversari affrontati il miglioramento è del +${improvement.toFixed(0)}% (ultime 3: ${(recentAvgI * 100).toFixed(1)}% vs precedente: ${(olderAvgI * 100).toFixed(1)}%). Il lavoro in allenamento sta pagando.`;
          } else {
            message = `${pDisplay(player)} (${roleLabel}): ${fundLabel(fund)} in netto miglioramento (+${improvement.toFixed(0)}%). Ultime 3 partite: ${(recentAvgI * 100).toFixed(1)}% vs precedente: ${(olderAvgI * 100).toFixed(1)}%.`;
          }

          suggestions.push({
            type: 'player_improvement',
            priority: 1,
            player: pDisplay(player),
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
      const lastTot = Number(lastMatch.team?.[fund]?.tot || 0);
      const prevTot = Number(prevMatch.team?.[fund]?.tot || 0);
      if (lastTot <= 0 || prevTot <= 0) continue;
      const lastEff = Number(lastMatch.team?.[fund]?.efficacy);
      const prevEff = Number(prevMatch.team?.[fund]?.efficacy);
      if (!Number.isFinite(lastEff) || !Number.isFinite(prevEff)) continue;

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
  const safeRallies = Array.isArray(rallies) ? rallies : [];
  const chains = {
    sideOut: { total: 0, won: 0, lost: 0, byReceptionQuality: {} },
    breakPoint: { total: 0, won: 0, lost: 0 },
    transition: { total: 0, won: 0, lost: 0 },
    conversionByTouchQuality: {},
    playerInChains: {},
  };

  for (const rally of safeRallies) {
    const quartine = Array.isArray(rally?.quartine) ? rally.quartine : [];
    const phase = rally?.phase;
    const isPoint = rally?.isPoint === true;
    const isError = rally?.isError === true;
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
  const normalizeRate = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    if (Math.abs(numeric) <= 1) return numeric;
    return numeric / 100;
  };
  const deriveRateFromCounts = (data = {}, metric = 'efficacy') => {
    const tot = Number(data?.tot || 0);
    if (!Number.isFinite(tot) || tot <= 0) return 0;
    const kill = Number(data?.kill || 0) || 0;
    const err = Number(data?.err || 0) || 0;
    const neg = Number(data?.neg || 0) || 0;
    if (metric === 'efficiency') return (kill - err - neg) / tot;
    return kill / tot;
  };
  const collections = {
    attack: [], serve: [], reception: [], defense: [], block: [],
  };

  for (const match of allMatches) {
    const { playerStats, playerReception, playerDefense } = match.riepilogo || {};
    if (!playerStats) continue;

    for (const p of playerStats) {
      if ((p.attack?.tot || 0) > 0) collections.attack.push(deriveRateFromCounts(p.attack, 'efficacy'));
      if ((p.serve?.tot || 0) > 0) collections.serve.push(deriveRateFromCounts(p.serve, 'efficacy'));
      const blockTot = (p.block?.kill || 0) + (p.block?.pos || 0) + (p.block?.exc || 0) +
                       (p.block?.neg || 0) + (p.block?.err || 0);
      if (blockTot > 0) collections.block.push(deriveRateFromCounts({ ...(p.block || {}), tot: blockTot }, 'efficacy'));
    }
    for (const p of playerReception || []) {
      if ((p.tot || 0) > 0) collections.reception.push(deriveRateFromCounts(p, 'efficacy'));
    }
    for (const p of playerDefense || []) {
      if ((p.tot || 0) > 0) collections.defense.push(deriveRateFromCounts(p, 'efficacy'));
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
  const clean = normalizeTeamNameForMatch(opponentName);

  let found = standings.find(t => normalizeTeamNameForMatch(t.name) === clean);
  if (found) return found;

  found = standings.find(t => areTeamNamesLikelySame(t.name, opponentName));
  if (found) return found;

  if (teamMap) {
    for (const [shortName, fullName] of Object.entries(teamMap)) {
      if (areTeamNamesLikelySame(shortName, opponentName) || areTeamNamesLikelySame(fullName, opponentName)) {
        found = standings.find(t => (
          areTeamNamesLikelySame(t.name, fullName) ||
          areTeamNamesLikelySame(t.name, shortName)
        ));
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
      attack: `Lavorare sull'attacco con ${pDisplay(player)}. Come schiacciatrice, focus su palloni di qualità 3 (da bagher) e palloni staccati. Esercizi di attacco contro muro schierato e in situazione di rigiocata.`,
      reception: `Drill di ricezione per ${pDisplay(player)} con battute aggressive. Come banda è fondamentale: lavorare su float, salto e potenza. Esercizi in coppia con il libero.`,
      serve: `Sessione battuta per ${pDisplay(player)}. Valutare l'equilibrio aggressività/errori. Lavorare su variazione tattica: float corta, potenza lunga.`,
      defense: `Lavorare sulla difesa con ${pDisplay(player)}. Come schiacciatrice le toccherà difendere diagonale e attacchi da posto 2. Esercizi di reazione e posizionamento.`,
      block: `Muro per ${pDisplay(player)}: focus sulla chiusura in zona 4. Lavorare sul timing contro l'opposto avversario e sui fast centrali.`,
    },
    M2: null, // same as M1, will fallback
    // CENTRALE (C) — core: attacco (primo tempo), muro, battuta
    C1: {
      attack: `Lavorare sul timing del primo tempo con ${pDisplay(player)}. Esercizi di attacco rapido con la palleggiatrice, variando l'altezza e la velocità dell'alzata. Focus sulla lettura del muro avversario.`,
      block: `Drill di muro per ${pDisplay(player)}: lettura dell'alzata avversaria, spostamento laterale veloce, timing. Esercizi di muro a 2 con le bande.`,
      serve: `Sessione battuta per ${pDisplay(player)}. Come centrale la battuta è un'arma tattica: lavorare su precisione e variazione più che su potenza.`,
    },
    C2: null, // same as C1
    // OPPOSTO — core: attacco, muro, battuta
    O: {
      attack: `Lavorare sull'attacco con ${pDisplay(player)}. Come opposto è il terminale principale: focus su attacco da zona 2 e da seconda linea (pipe/zona 1). Palloni alti, staccati e situazioni di muro a 2.`,
      block: `Muro per ${pDisplay(player)} in zona 2: lettura dello schiacciatore avversario di posto 4. Timing e chiusura del varco.`,
      serve: `Battuta per ${pDisplay(player)}. Come opposto la battuta è un'arma importante: lavorare su potenza in salto e variazione tattica.`,
      defense: `Difesa secondaria per ${pDisplay(player)}. Come opposto non è il core ma deve saper difendere in zona 1: esercizi specifici ma senza sottrarre tempo all'attacco.`,
    },
    // PALLEGGIATRICE — core: difesa; secondary: battuta, muro
    P1: {
      defense: `Lavorare sulla difesa con ${pDisplay(player)}. Come palleggiatrice la difesa in seconda linea è fondamentale per la transizione. Esercizi di lettura e posizionamento in zona 1 e 6.`,
      block: `Muro per ${pDisplay(player)}: come palleggiatrice è l'anello tattico del muro. Lavorare sulla lettura e sul posizionamento, non serve altezza ma tempismo.`,
      serve: `Battuta per ${pDisplay(player)}. Come palleggiatrice la battuta è tattica: float precisa e variata. Non serve potenza ma efficacia nel mettere in difficoltà la ricezione avversaria.`,
    },
    P2: null,
    // LIBERO — core: ricezione, difesa (UNICI fondamentali possibili)
    L1: {
      reception: `Drill intensivi di ricezione per ${pDisplay(player)}. Come libero è IL fondamentale: battute aggressive, float, salto, da diverse posizioni. Lavorare sulla comunicazione con le bande e sul posizionamento.`,
      defense: `Lavorare sulla difesa con ${pDisplay(player)}. Come libero è fondamentale: esercizi di reazione su attacchi forti, lettura del muro, difesa su palle sporche e attacchi da seconda linea.`,
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
  return `Approfondire l'analisi su ${fundLabel(fund)} per ${pDisplay(player)} (${roleName}). Verificare se il calo è strutturale o contestuale.`;
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

function _formatChainAction(action) {
  if (!action) return '';
  if (action.type === 'opponent_error') return 'Errore avversario';
  if (action.type !== 'action') return '';
  const fundMap = { r: 'R', d: 'D', a: 'A', b: 'B', m: 'M' };
  const fund = fundMap[action.fundamental] || String(action.fundamental || '').toUpperCase();
  const player = action.player ? `#${action.player}` : '';
  return `${fund}${action.value}${player ? ` ${player}` : ''}`.trim();
}

function _buildChainDescription(quartine = [], inputKey = '', outputKey = '') {
  const seq = quartine.map(_formatChainAction).filter(Boolean).join(' → ');
  const pair = [inputKey, outputKey].filter(Boolean).join(' → ');
  if (pair && seq) return `${pair} · ${seq}`;
  return pair || seq || 'Sequenza non disponibile';
}

function _buildMatchLabel(match) {
  const opponent = match?.metadata?.opponent || 'Avversario';
  const date = match?.metadata?.date || '';
  return date ? `${opponent} (${date})` : opponent;
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
        sideOutDetails: { R3: [], R4: [], R5: [] },
        transition: { D3: {}, D4: {}, D5: {} },
        transitionDetails: { D3: [], D4: [], D5: [] },
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
                players[next.player].sideOutDetails[rKey].push({
                  sourceKey: rKey,
                  outcomeKey: aKey,
                  match: _buildMatchLabel(match),
                  set: rally.set || null,
                  score: `${rally.ourScore ?? 0}-${rally.theirScore ?? 0}`,
                  description: _buildChainDescription(quartine, rKey, aKey),
                });
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
                players[next.player].transitionDetails[dKey].push({
                  sourceKey: dKey,
                  outcomeKey: aKey,
                  match: _buildMatchLabel(match),
                  set: rally.set || null,
                  score: `${rally.ourScore ?? 0}-${rally.theirScore ?? 0}`,
                  description: _buildChainDescription(quartine, dKey, aKey),
                });
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

// ─── tactical roles and rotation logic ──────────────────────────────────────
const ROLE_SEQUENCE = ['P', 'B1', 'C2', 'O', 'B2', 'C1'];

/**
 * Identify tactical roles for a set based on initial lineup.
 */
export function identifyRolesPerSet(setRotations) {
  // We need P1 rotation to get the starting positions 1-6
  const p1 = setRotations.find(r => r.rotation === 1);
  if (!p1 || !p1.lineup) return null;

  const players = p1.lineup.split(',').map(s => s.trim());
  if (players.length !== 6) return null;

  const roles = {};
  ROLE_SEQUENCE.forEach((role, idx) => {
    roles[players[idx]] = role;
  });
  return roles;
}

/**
 * Returns mapping of players to positions (1-6) for a given rotation and phase.
 */
export function getPositionsFromRotation(rotationNum, lineup, phase = 'r') {
  if (!lineup) return {};
  const players = lineup.split(',').map(s => s.trim());
  if (players.length !== 6) return {};

  // Standard clock-wise rotation from P1
  // rotationNum: 1=P1, 2=P2, 3=P3, 4=P4, 5=P5, 6=P6
  // Each rotation shifts players clockwise: pos1→pos6, pos6→pos5, ...pos2→pos1
  // Shift count: P1=0, P6=1, P5=2, P4=3, P3=4, P2=5
  let shift = 0;
  if (rotationNum === 6) shift = 1;
  else if (rotationNum === 5) shift = 2;
  else if (rotationNum === 4) shift = 3;
  else if (rotationNum === 3) shift = 4;
  else if (rotationNum === 2) shift = 5;

  const rotatedPlayers = [...players];
  for (let i = 0; i < shift; i++) {
    const p = rotatedPlayers.shift();
    rotatedPlayers.push(p);
  }

  const pos = {
    1: rotatedPlayers[0],
    2: rotatedPlayers[1],
    3: rotatedPlayers[2],
    4: rotatedPlayers[3],
    5: rotatedPlayers[4],
    6: rotatedPlayers[5],
  };

  // P1 logic: fixed for rally based on starting phase
  if (rotationNum === 1) {
    if (phase === 'b') { // Service/Defense phase
      // Switch B1 (in 2) and O (in 4) to their specialized zones (B1=4, O=2)
      const p2 = pos[2];
      const p4 = pos[4];
      pos[2] = p4;
      pos[4] = p2;
    }
  } else {
    // Other rotations: generally switch to specialize after serve/receive
    // But for this analysis, we focus on the "incastro" (front row)
    // Most coaches switch B to 4 and O to 2.
    // We can implement a general auto-switch if we want to be hyper-precise
  }

  return pos;
}

// ─── 5. Rotational chain analysis ─────────────────────────────────────────
// Per rotation: side-out%, break-point%, transition (D→A in phase='b')%
export function analyzeRotationalChains(allMatches) {
  const rotations = {};
  const rolesStats = {
    B1: { attack: { total: 0, pts: 0 }, reception: { total: 0, exc: 0 } },
    B2: { attack: { total: 0, pts: 0 }, reception: { total: 0, exc: 0 } },
    C1: { attack: { total: 0, pts: 0 } },
    C2: { attack: { total: 0, pts: 0 } },
    O:  { attack: { total: 0, pts: 0 } },
    P:  { attack: { total: 0, pts: 0 } },
  };
  const attackerModeStats = {
    '2att': { sideOut: { total: 0, won: 0 }, breakPoint: { total: 0, won: 0 } },
    '3att': { sideOut: { total: 0, won: 0 }, breakPoint: { total: 0, won: 0 } },
  };

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
    const rolesBySet = {};
    (match.sets || []).forEach(s => {
      rolesBySet[s.number] = identifyRolesPerSet(s.rotations || []);
    });

    for (const rally of match.rallies || []) {
      const { quartine, phase, rotation, isPoint, set: setNum } = rally;
      if (!rotation || !quartine) continue;

      const k = ensure(rotation);
      const roles = rolesBySet[setNum];

      if (phase === 'r') {
        rotations[k].sideOut.total++;
        if (isPoint) rotations[k].sideOut.won++;
      } else {
        rotations[k].breakPoint.total++;
        if (isPoint) rotations[k].breakPoint.won++;

        const hasTransition = quartine.some((q, i) =>
          q.type === 'action' && q.fundamental === 'd' &&
          quartine.slice(i + 1).some(q2 => q2.type === 'action' && q2.fundamental === 'a')
        );
        if (hasTransition) {
          rotations[k].transition.total++;
          if (isPoint) rotations[k].transition.won++;
        }
      }

      // Attacker Mode: P1, P6, P5 = 3 attackers in front; P4, P3, P2 = 2 attackers + setter in front
      const mode = [1, 6, 5].includes(rotation) ? '3att' : '2att';
      if (phase === 'r') {
        attackerModeStats[mode].sideOut.total++;
        if (isPoint) attackerModeStats[mode].sideOut.won++;
      } else {
        attackerModeStats[mode].breakPoint.total++;
        if (isPoint) attackerModeStats[mode].breakPoint.won++;
      }

      // Role stats
      if (roles) {
        quartine.forEach(q => {
          if (q.type !== 'action' || !q.player) return;
          const r = roles[q.player];
          if (!r || !rolesStats[r]) return;

          if (q.fundamental === 'a') {
            rolesStats[r].attack.total++;
            if (q.value >= 4) rolesStats[r].attack.pts++;
          }
          if (q.fundamental === 'r' && rolesStats[r].reception) {
            rolesStats[r].reception.total++;
            if (q.value >= 4) rolesStats[r].reception.exc++;
          }
        });
      }
    }
  }

  // Compute final percentages per rotation
  for (const k of Object.keys(rotations)) {
    const r = rotations[k];
    r.sideOut.pct    = r.sideOut.total    > 0 ? r.sideOut.won    / r.sideOut.total    : null;
    r.breakPoint.pct = r.breakPoint.total > 0 ? r.breakPoint.won / r.breakPoint.total : null;
    r.transition.pct = r.transition.total > 0 ? r.transition.won / r.transition.total : null;
  }

  const validRots = Object.values(rotations).filter(r => r.sideOut.total >= 5);
  const avgSideOut    = validRots.length > 0 ? avg(validRots.map(r => r.sideOut.pct).filter(v => v !== null)) : null;
  const avgBreakPoint = validRots.length > 0 ? avg(validRots.map(r => r.breakPoint.pct).filter(v => v !== null)) : null;

  const finalizeMode = (m) => ({
    sideOut: m.sideOut.total > 0 ? m.sideOut.won / m.sideOut.total : 0,
    breakPoint: m.breakPoint.total > 0 ? m.breakPoint.won / m.breakPoint.total : 0,
    totals: { sideOut: m.sideOut.total, breakPoint: m.breakPoint.total }
  });

  const finalizeRole = (r) => ({
    attackEff: r.attack.total > 0 ? r.attack.pts / r.attack.total : 0,
    receptionExc: r.reception?.total > 0 ? r.reception.exc / r.reception.total : 0,
    totals: { attack: r.attack.total, reception: r.reception?.total || 0 }
  });

  return {
    rotations,
    avgSideOut,
    avgBreakPoint,
    attackerModes: {
      '2att': finalizeMode(attackerModeStats['2att']),
      '3att': finalizeMode(attackerModeStats['3att']),
    },
    rolePerformance: {
      B1: finalizeRole(rolesStats.B1),
      B2: finalizeRole(rolesStats.B2),
      C1: finalizeRole(rolesStats.C1),
      C2: finalizeRole(rolesStats.C2),
      O:  finalizeRole(rolesStats.O),
      P:  finalizeRole(rolesStats.P),
    }
  };
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
          chainData: {
            label: 'R5→A',
            values: r5,
            total: r5tot,
            wastePct: r5waste / r5tot,
            detailsByOutcome: (pd.sideOutDetails?.R5 || []).reduce((acc, item) => {
              const key = item.outcomeKey || 'A?';
              if (!acc[key]) acc[key] = [];
              acc[key].push(item);
              return acc;
            }, {}),
          },
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
          chainData: {
            label: 'R3→A',
            values: r3,
            total: r3tot,
            posPct: r3pos / r3tot,
            detailsByOutcome: (pd.sideOutDetails?.R3 || []).reduce((acc, item) => {
              const key = item.outcomeKey || 'A?';
              if (!acc[key]) acc[key] = [];
              acc[key].push(item);
              return acc;
            }, {}),
          },
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
          chainData: {
            label: 'D5→A',
            values: d5,
            total: d5tot,
            wastePct: d5waste / d5tot,
            detailsByOutcome: (pd.transitionDetails?.D5 || []).reduce((acc, item) => {
              const key = item.outcomeKey || 'A?';
              if (!acc[key]) acc[key] = [];
              acc[key].push(item);
              return acc;
            }, {}),
          },
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
          chainData: {
            label: 'D3→A',
            values: d3,
            total: d3tot,
            posPct: d3pos / d3tot,
            detailsByOutcome: (pd.transitionDetails?.D3 || []).reduce((acc, item) => {
              const key = item.outcomeKey || 'A?';
              if (!acc[key]) acc[key] = [];
              acc[key].push(item);
              return acc;
            }, {}),
          },
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

// ============================================================================
// TACTICAL LAB — Advanced Rotation Matchup Analysis
// ============================================================================

const ROLE_ORDER_P1 = ['P', 'B1', 'C2', 'O', 'B2', 'C1'];

/**
 * Get rotation metadata: front row composition, attacker mode, attack zones.
 */
export function getRotationMeta(rotNum) {
  // From P1 lineup [P, B1, C2, O, B2, C1] at positions [1,2,3,4,5,6]:
  // Clockwise rotation shifts by (rotNum-1) effectively.
  const shifted = [];
  for (let i = 0; i < 6; i++) {
    shifted.push(ROLE_ORDER_P1[(i + (rotNum === 1 ? 0 : rotNum === 6 ? 1 : rotNum === 5 ? 2 : rotNum === 4 ? 3 : rotNum === 3 ? 4 : 5)) % 6]);
  }
  // positions: shifted[0]=pos1, shifted[1]=pos2, ..., shifted[5]=pos6
  const frontRow = [
    { pos: 4, role: shifted[3] },
    { pos: 3, role: shifted[2] },
    { pos: 2, role: shifted[1] },
  ];
  const backRow = [
    { pos: 5, role: shifted[4] },
    { pos: 6, role: shifted[5] },
    { pos: 1, role: shifted[0] },
  ];
  const setterInFront = frontRow.some(p => p.role === 'P');
  const attackerCount = setterInFront ? 2 : 3;
  const mode = attackerCount === 3 ? '3att' : '2att';

  // Attack zones in reception (side-out)
  let attackZones;
  if (rotNum === 1) {
    // P1 special: O attacks from 4, B1 from 2, C2 from 3
    attackZones = { 4: 'O', 3: 'C2', 2: 'B1' };
  } else {
    // Standard: banda→4, centro→3, opposto→2
    attackZones = {};
    for (const p of frontRow) {
      if (p.role === 'P') continue;
      if (p.role === 'O') attackZones[2] = 'O';
      else if (p.role.startsWith('C')) attackZones[3] = p.role;
      else if (p.role.startsWith('B')) attackZones[4] = p.role;
    }
  }

  return { rotNum, frontRow, backRow, setterInFront, attackerCount, mode, attackZones, positions: shifted };
}

/**
 * Track opponent rotations through a match given starting rotations per set.
 * Returns rallies annotated with oppRotation field.
 */
export function trackOpponentRotations(rallies, oppStartPerSet) {
  if (!oppStartPerSet || Object.keys(oppStartPerSet).length === 0) return rallies;

  const bySet = {};
  for (const rally of rallies) {
    if (!bySet[rally.set]) bySet[rally.set] = [];
    bySet[rally.set].push(rally);
  }

  const annotated = [];
  for (const [setNumStr, setRallies] of Object.entries(bySet)) {
    const setNum = parseInt(setNumStr);
    let oppRot = oppStartPerSet[setNum];
    if (!oppRot) {
      // No opponent start rotation for this set — leave unannotated
      for (const r of setRallies) annotated.push({ ...r, oppRotation: null });
      continue;
    }

    for (const rally of setRallies) {
      const annotatedRally = { ...rally, oppRotation: oppRot };
      annotated.push(annotatedRally);

      // Opponent rotates when they win a side-out:
      // They were receiving (we were serving = phase 'b') and they scored (!isPoint)
      if (rally.phase === 'b' && !rally.isPoint) {
        oppRot = oppRot === 1 ? 6 : oppRot - 1; // next rotation in sequence
      }
    }
  }
  return annotated;
}

/**
 * Compute the matchup matrix: our rotation × opponent rotation.
 * Each cell contains: rallies count, our points, their points, net, phase breakdown.
 */
export function computeMatchupMatrix(annotatedRallies) {
  const matrix = {};
  for (let us = 1; us <= 6; us++) {
    matrix[us] = {};
    for (let them = 1; them <= 6; them++) {
      matrix[us][them] = {
        total: 0, ourPts: 0, theirPts: 0,
        sideOut: { total: 0, won: 0 },
        breakPoint: { total: 0, won: 0 },
      };
    }
  }

  const summary = {
    totalAnnotated: 0,
    bestMatchup: null,
    worstMatchup: null,
  };

  for (const rally of annotatedRallies) {
    const { rotation, oppRotation, phase, isPoint } = rally;
    if (!rotation || !oppRotation || rotation < 1 || rotation > 6 || oppRotation < 1 || oppRotation > 6) continue;

    summary.totalAnnotated++;
    const cell = matrix[rotation][oppRotation];
    cell.total++;
    if (isPoint) cell.ourPts++;
    else cell.theirPts++;

    if (phase === 'r') {
      cell.sideOut.total++;
      if (isPoint) cell.sideOut.won++;
    } else if (phase === 'b') {
      cell.breakPoint.total++;
      if (isPoint) cell.breakPoint.won++;
    }
  }

  // Find best/worst matchups
  let bestNet = -Infinity, worstNet = Infinity;
  for (let us = 1; us <= 6; us++) {
    for (let them = 1; them <= 6; them++) {
      const cell = matrix[us][them];
      if (cell.total < 2) continue;
      const net = cell.ourPts - cell.theirPts;
      if (net > bestNet) { bestNet = net; summary.bestMatchup = { us, them, ...cell }; }
      if (net < worstNet) { worstNet = net; summary.worstMatchup = { us, them, ...cell }; }
    }
  }

  return { matrix, summary };
}

/**
 * Compute detailed stats per our rotation: attack, reception, serve, defense
 * broken down by player, with point/error tracking.
 */
export function computeRotationDetailedStats(rallies, roles) {
  const stats = {};
  for (let r = 1; r <= 6; r++) {
    stats[r] = {
      sideOut: { total: 0, won: 0, rallies: [] },
      breakPoint: { total: 0, won: 0, rallies: [] },
      players: {},
      reception: { dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, total: 0 },
      attack: { dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, total: 0, byPlayer: {} },
      serve: { dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, total: 0 },
      defense: { dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, total: 0 },
      block: { dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, total: 0 },
      oppErrors: 0,
      scoreRuns: [],
    };
  }

  for (const rally of rallies) {
    const { rotation, phase, isPoint, quartine } = rally;
    if (!rotation || rotation < 1 || rotation > 6) continue;
    const rs = stats[rotation];

    if (phase === 'r') {
      rs.sideOut.total++;
      if (isPoint) rs.sideOut.won++;
    } else if (phase === 'b') {
      rs.breakPoint.total++;
      if (isPoint) rs.breakPoint.won++;
    }

    // Track score runs (consecutive points)
    rs.scoreRuns.push({ set: rally.set, ourScore: rally.ourScore, theirScore: rally.theirScore, isPoint, phase });

    if (!quartine) continue;
    for (const q of quartine) {
      if (q.type === 'opponent_error') {
        rs.oppErrors++;
        continue;
      }
      if (q.type !== 'action' || !q.fundamental || !q.value) continue;
      const f = q.fundamental;
      const v = q.value;

      // Aggregate by fundamental
      if (f === 'r' && rs.reception.dist[v] !== undefined) { rs.reception.dist[v]++; rs.reception.total++; }
      if (f === 'a' && rs.attack.dist[v] !== undefined) {
        rs.attack.dist[v]++;
        rs.attack.total++;
        // Track attack by player
        const pNum = q.player;
        if (pNum) {
          if (!rs.attack.byPlayer[pNum]) rs.attack.byPlayer[pNum] = { total: 0, pts: 0, err: 0, role: roles?.[pNum] || '' };
          rs.attack.byPlayer[pNum].total++;
          if (v >= 4) rs.attack.byPlayer[pNum].pts++;
          if (v === 1) rs.attack.byPlayer[pNum].err++;
        }
      }
      if (f === 'b' && rs.serve.dist[v] !== undefined) { rs.serve.dist[v]++; rs.serve.total++; }
      if (f === 'd' && rs.defense.dist[v] !== undefined) { rs.defense.dist[v]++; rs.defense.total++; }
      if (f === 'm' && rs.block.dist[v] !== undefined) { rs.block.dist[v]++; rs.block.total++; }
    }
  }

  return stats;
}

/**
 * Compute set-by-set flow: score progression annotated with rotations and matchups.
 */
export function computeSetFlow(rallies, oppStartPerSet) {
  const annotated = oppStartPerSet ? trackOpponentRotations(rallies, oppStartPerSet) : rallies;
  const bySet = {};

  for (const rally of annotated) {
    if (!bySet[rally.set]) bySet[rally.set] = [];
    bySet[rally.set].push({
      ourScore: rally.ourScore,
      theirScore: rally.theirScore,
      ourRot: rally.rotation,
      oppRot: rally.oppRotation || null,
      phase: rally.phase,
      isPoint: rally.isPoint,
      ourMode: [1, 6, 5].includes(rally.rotation) ? '3att' : '2att',
      oppMode: rally.oppRotation ? ([1, 6, 5].includes(rally.oppRotation) ? '3att' : '2att') : null,
    });
  }
  return bySet;
}

/**
 * Compute role comparison: B1 vs B2, C1 vs C2 performance across matches.
 */
export function computeRoleComparison(allMatches, roster = []) {
  const comparison = {
    B1: { attack: { total: 0, pts: 0, err: 0 }, reception: { total: 0, pos: 0, err: 0 }, serve: { total: 0, pts: 0, err: 0 } },
    B2: { attack: { total: 0, pts: 0, err: 0 }, reception: { total: 0, pos: 0, err: 0 }, serve: { total: 0, pts: 0, err: 0 } },
    C1: { attack: { total: 0, pts: 0, err: 0 }, block: { total: 0, pts: 0 }, serve: { total: 0, pts: 0, err: 0 } },
    C2: { attack: { total: 0, pts: 0, err: 0 }, block: { total: 0, pts: 0 }, serve: { total: 0, pts: 0, err: 0 } },
    O: { attack: { total: 0, pts: 0, err: 0 }, serve: { total: 0, pts: 0, err: 0 }, block: { total: 0, pts: 0 } },
  };

  // Build player→role map from roster
  const playerRoleMap = {};
  for (const p of roster) {
    if (p.number && p.role) playerRoleMap[p.number] = p.role.trim();
  }

  // Map scout role codes (M1→B1, M2→B2, etc.)
  const roleMapping = { M1: 'B1', M2: 'B2', C1: 'C1', C2: 'C2', O: 'O' };

  for (const match of allMatches) {
    for (const rally of match.rallies || []) {
      for (const q of rally.quartine || []) {
        if (q.type !== 'action' || !q.player || !q.value) continue;
        const rosterRole = playerRoleMap[q.player];
        const compRole = rosterRole ? roleMapping[rosterRole] : null;
        if (!compRole || !comparison[compRole]) continue;

        const f = q.fundamental;
        const v = q.value;

        if (f === 'a' && comparison[compRole].attack) {
          comparison[compRole].attack.total++;
          if (v >= 4) comparison[compRole].attack.pts++;
          if (v === 1) comparison[compRole].attack.err++;
        }
        if (f === 'r' && comparison[compRole].reception) {
          comparison[compRole].reception.total++;
          if (v >= 4) comparison[compRole].reception.pos++;
          if (v === 1) comparison[compRole].reception.err++;
        }
        if (f === 'b' && comparison[compRole].serve) {
          comparison[compRole].serve.total++;
          if (v >= 4) comparison[compRole].serve.pts++;
          if (v === 1) comparison[compRole].serve.err++;
        }
        if (f === 'm' && comparison[compRole].block) {
          comparison[compRole].block.total++;
          if (v === 5) comparison[compRole].block.pts++;
        }
      }
    }
  }

  return comparison;
}

/**
 * Compute phase-specific performance per rotation: how well we perform in
 * "our reception vs their serve" and "our serve vs their reception".
 */
export function computePhaseRotationStats(rallies, roles) {
  const phaseStats = {};
  for (let r = 1; r <= 6; r++) {
    phaseStats[r] = {
      // Our reception (SO): quality of our attack chain after receiving
      ourReception: {
        total: 0, won: 0,
        receptionQuality: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        attackAfterRec: { total: 0, pts: 0, err: 0 },
      },
      // Our serve (BP): quality of our serve + defense/transition chain
      ourServe: {
        total: 0, won: 0,
        serveQuality: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        blockPts: 0, transitionAttack: { total: 0, pts: 0, err: 0 },
      },
    };
  }

  for (const rally of rallies) {
    const { rotation, phase, isPoint, quartine } = rally;
    if (!rotation || rotation < 1 || rotation > 6 || !quartine) continue;
    const ps = phaseStats[rotation];

    if (phase === 'r') {
      ps.ourReception.total++;
      if (isPoint) ps.ourReception.won++;

      // Track reception and subsequent attack quality
      for (const q of quartine) {
        if (q.type !== 'action') continue;
        if (q.fundamental === 'r' && q.value >= 1 && q.value <= 5) {
          ps.ourReception.receptionQuality[q.value]++;
        }
        if (q.fundamental === 'a') {
          ps.ourReception.attackAfterRec.total++;
          if (q.value >= 4) ps.ourReception.attackAfterRec.pts++;
          if (q.value === 1) ps.ourReception.attackAfterRec.err++;
        }
      }
    } else if (phase === 'b') {
      ps.ourServe.total++;
      if (isPoint) ps.ourServe.won++;

      for (const q of quartine) {
        if (q.type !== 'action') continue;
        if (q.fundamental === 'b' && q.value >= 1 && q.value <= 5) {
          ps.ourServe.serveQuality[q.value]++;
        }
        if (q.fundamental === 'm' && q.value === 5) {
          ps.ourServe.blockPts++;
        }
        if (q.fundamental === 'a') {
          ps.ourServe.transitionAttack.total++;
          if (q.value >= 4) ps.ourServe.transitionAttack.pts++;
          if (q.value === 1) ps.ourServe.transitionAttack.err++;
        }
      }
    }
  }

  return phaseStats;
}

// ============================================================================
// SETTER DISTRIBUTION ANALYTICS
// Analisi della distribuzione del palleggiatore: chi attacca, cosa, quando
// ============================================================================

/**
 * Computes a comprehensive setter distribution analysis from rally quartine.
 *
 * Returns:
 * - byAttacker: per player/role — how many balls, quality breakdown, efficiency
 * - byInputQuality: distribution for each R3/R4/R5 and D3/D4/D5 → who gets the ball
 * - byPhase: side-out vs transition distribution
 * - byAttackNumber: 1st, 2nd, 3rd+ attack in rally
 * - byOurRotation: distribution per our rotation (front/back row context)
 * - byOppFrontRow: distribution vs opponent 2att/3att and specific front row roles
 * - byAttackerRow: front row vs back row attacker distribution
 * - tempo: first-tempo (centro) vs high-ball distribution by input quality
 */
export function analyzeSetterDistribution(allMatches, roster = []) {
  const ROLE_ORDER = ['P', 'B1', 'C2', 'O', 'B2', 'C1'];

  // ─── Helper: get role for player in a given set ──
  function getRolesForMatch(match) {
    const rolesBySet = {};
    (match.sets || []).forEach(s => {
      rolesBySet[s.number] = identifyRolesPerSet(s.rotations || []);
    });
    return rolesBySet;
  }

  // ─── Helper: determine if player is front row in given rotation ──
  function isPlayerFrontRow(playerRole, rotation) {
    if (!playerRole || !rotation) return null;
    const meta = getRotationMeta(rotation);
    return meta.frontRow.some(p => p.role === playerRole);
  }

  // ─── Helper: classify opponent front row ──
  function classifyOppFrontRow(oppRotation) {
    if (!oppRotation || oppRotation < 1 || oppRotation > 6) return null;
    const meta = getRotationMeta(oppRotation);
    // Opponent follows same ROLE_ORDER logic
    return {
      mode: meta.mode,           // '2att' or '3att'
      attackerCount: meta.attackerCount,
      frontRoles: meta.frontRow.map(p => p.role),
      hasOpposto: meta.frontRow.some(p => p.role === 'O'),
      hasBanda1: meta.frontRow.some(p => p.role === 'B1'),
      hasBanda2: meta.frontRow.some(p => p.role === 'B2'),
      hasCentro: meta.frontRow.some(p => p.role === 'C1' || p.role === 'C2'),
    };
  }

  // ─── Result structures ──
  const byAttacker = {};        // key: playerNumber
  const byInputQuality = {};    // key: R3, R4, R5, D3, D4, D5
  const byPhase = { sideOut: { total: 0, byAttacker: {} }, transition: { total: 0, byAttacker: {} } };
  const byAttackNumber = {};    // key: 1, 2, 3 (attack ordinal in rally)
  const byOurRotation = {};     // key: 1-6
  const byOppFrontRow = { '2att': { total: 0, byAttacker: {} }, '3att': { total: 0, byAttacker: {} } };
  const byOppSpecific = {};     // key: 'O_front' | 'B1_front' | 'B2_front' etc
  const byAttackerRow = { front: { total: 0, pts: 0, err: 0 }, back: { total: 0, pts: 0, err: 0 } };
  const tempo = {};             // key: inputQuality → { primo: count, alto: count }
  const byContext = {};         // key: `${rot}_${phase}_${inputKey}` → { total, byAttacker: { pNum: { total, pts, err, sumVal } } }

  for (const iq of ['R3', 'R4', 'R5', 'D3', 'D4', 'D5']) {
    byInputQuality[iq] = { total: 0, byAttacker: {}, avgAttackValue: 0, sumValue: 0 };
    tempo[iq] = { primo: 0, alto: 0 };
  }
  for (let r = 1; r <= 6; r++) {
    byOurRotation[r] = { total: 0, byAttacker: {}, mode: getRotationMeta(r).mode };
  }
  for (let n = 1; n <= 4; n++) {
    byAttackNumber[n] = { total: 0, pts: 0, err: 0, byAttacker: {} };
  }

  function ensureAttacker(pNum, role, name) {
    if (!byAttacker[pNum]) {
      byAttacker[pNum] = {
        name: name || _getPlayerName(pNum, roster),
        role: role || '',
        total: 0, pts: 0, err: 0, sumValue: 0,
        byInput: {},   // R3, R4, R5, D3, D4, D5
        byPhase: { sideOut: 0, transition: 0 },
        byAttackNum: { 1: 0, 2: 0, 3: 0 },
        frontRow: { total: 0, pts: 0, err: 0 },
        backRow: { total: 0, pts: 0, err: 0 },
      };
      for (const iq of ['R3', 'R4', 'R5', 'D3', 'D4', 'D5']) {
        byAttacker[pNum].byInput[iq] = { total: 0, pts: 0, err: 0 };
      }
    }
    // Update role if we have a better one
    if (role && !byAttacker[pNum].role) byAttacker[pNum].role = role;
  }

  function addToNestedByAttacker(obj, pNum, value) {
    if (!obj[pNum]) obj[pNum] = { total: 0, pts: 0, err: 0 };
    obj[pNum].total++;
    if (value >= 4) obj[pNum].pts++;
    if (value === 1) obj[pNum].err++;
  }

  // ─── Main loop ──
  for (const match of allMatches) {
    const rolesBySet = getRolesForMatch(match);

    // Annotate with opponent rotations if available
    const oppStartPerSet = {};
    (match.sets || []).forEach(s => {
      if (s.oppStartRotation) oppStartPerSet[s.number] = s.oppStartRotation;
    });
    const rallies = Object.keys(oppStartPerSet).length > 0
      ? trackOpponentRotations(match.rallies || [], oppStartPerSet)
      : (match.rallies || []);

    for (const rally of rallies) {
      const { quartine, phase, rotation, set: setNum } = rally;
      if (!quartine || quartine.length < 2) continue;

      const roles = rolesBySet[setNum];
      const oppRot = rally.oppRotation || null;
      const oppFront = classifyOppFrontRow(oppRot);

      // Find all R→A and D→A pairs in this rally
      let attackOrdinal = 0;

      // Scan for input actions (R or D) followed by attack (A)
      const inputActions = []; // collect all {idx, fundamental, value}
      for (let i = 0; i < quartine.length; i++) {
        const q = quartine[i];
        if (q.type !== 'action') continue;
        if ((q.fundamental === 'r' || q.fundamental === 'd') && q.value >= 3) {
          inputActions.push({ idx: i, fundamental: q.fundamental, value: q.value });
        }
      }

      // For each input action, find the next attack
      let lastProcessedAttackIdx = -1;
      for (const input of inputActions) {
        for (let j = input.idx + 1; j < quartine.length; j++) {
          const next = quartine[j];
          if (next.type !== 'action') continue;

          // Skip if we hit another R or D before finding an A
          if (next.fundamental === 'r' || next.fundamental === 'd') break;

          if (next.fundamental === 'a' && next.player && next.value) {
            // Only count if this is a new attack (not already processed)
            if (j > lastProcessedAttackIdx) {
              attackOrdinal++;
              lastProcessedAttackIdx = j;
            }

            const pNum = next.player;
            const aVal = next.value;
            const playerRole = roles?.[pNum] || '';
            const inputKey = `${input.fundamental === 'r' ? 'R' : 'D'}${input.value}`;
            const isFront = isPlayerFrontRow(playerRole, rotation);
            const attackNum = Math.min(attackOrdinal, 4); // cap at 4+

            ensureAttacker(pNum, playerRole, null);

            // ── 1. Global attacker stats ──
            byAttacker[pNum].total++;
            byAttacker[pNum].sumValue += aVal;
            if (aVal >= 4) byAttacker[pNum].pts++;
            if (aVal === 1) byAttacker[pNum].err++;

            // ── 2. By input quality (R3/R4/R5/D3/D4/D5) ──
            if (byInputQuality[inputKey]) {
              byInputQuality[inputKey].total++;
              byInputQuality[inputKey].sumValue += aVal;
              addToNestedByAttacker(byInputQuality[inputKey].byAttacker, pNum, aVal);
            }
            if (byAttacker[pNum].byInput[inputKey]) {
              byAttacker[pNum].byInput[inputKey].total++;
              if (aVal >= 4) byAttacker[pNum].byInput[inputKey].pts++;
              if (aVal === 1) byAttacker[pNum].byInput[inputKey].err++;
            }

            // ── 3. By phase ──
            if (phase === 'r') {
              byPhase.sideOut.total++;
              addToNestedByAttacker(byPhase.sideOut.byAttacker, pNum, aVal);
              byAttacker[pNum].byPhase.sideOut++;
            } else if (phase === 'b') {
              byPhase.transition.total++;
              addToNestedByAttacker(byPhase.transition.byAttacker, pNum, aVal);
              byAttacker[pNum].byPhase.transition++;
            }

            // ── 4. By attack number in rally ──
            if (byAttackNumber[attackNum]) {
              byAttackNumber[attackNum].total++;
              if (aVal >= 4) byAttackNumber[attackNum].pts++;
              if (aVal === 1) byAttackNumber[attackNum].err++;
              addToNestedByAttacker(byAttackNumber[attackNum].byAttacker, pNum, aVal);
            }
            byAttacker[pNum].byAttackNum[Math.min(attackOrdinal, 3)] =
              (byAttacker[pNum].byAttackNum[Math.min(attackOrdinal, 3)] || 0) + 1;

            // ── 5. By our rotation ──
            if (rotation >= 1 && rotation <= 6 && byOurRotation[rotation]) {
              byOurRotation[rotation].total++;
              addToNestedByAttacker(byOurRotation[rotation].byAttacker, pNum, aVal);
            }

            // ── 6. By opponent front row ──
            if (oppFront) {
              const oppMode = oppFront.mode;
              byOppFrontRow[oppMode].total++;
              addToNestedByAttacker(byOppFrontRow[oppMode].byAttacker, pNum, aVal);

              // Specific opponent front-row composition tracking
              for (const oppRole of oppFront.frontRoles) {
                const specKey = `${oppRole}_front`;
                if (!byOppSpecific[specKey]) byOppSpecific[specKey] = { total: 0, byAttacker: {} };
                byOppSpecific[specKey].total++;
                addToNestedByAttacker(byOppSpecific[specKey].byAttacker, pNum, aVal);
              }
            }

            // ── 7. Front row vs back row attacker ──
            if (isFront === true) {
              byAttackerRow.front.total++;
              if (aVal >= 4) byAttackerRow.front.pts++;
              if (aVal === 1) byAttackerRow.front.err++;
              byAttacker[pNum].frontRow.total++;
              if (aVal >= 4) byAttacker[pNum].frontRow.pts++;
              if (aVal === 1) byAttacker[pNum].frontRow.err++;
            } else if (isFront === false) {
              byAttackerRow.back.total++;
              if (aVal >= 4) byAttackerRow.back.pts++;
              if (aVal === 1) byAttackerRow.back.err++;
              byAttacker[pNum].backRow.total++;
              if (aVal >= 4) byAttacker[pNum].backRow.pts++;
              if (aVal === 1) byAttacker[pNum].backRow.err++;
            }

            // ── 8. Tempo analysis: centro = primo tempo, others = alto ──
            if (byInputQuality[inputKey]) {
              const isCentrale = playerRole === 'C1' || playerRole === 'C2';
              if (isCentrale && isFront) {
                tempo[inputKey].primo++;
              } else {
                tempo[inputKey].alto++;
              }
            }

            // ── 9. Context tracking: rotation × phase × inputQuality ──
            if (rotation >= 1 && rotation <= 6) {
              const phaseKey = phase === 'r' ? 'SO' : 'TR';
              const ctxKey = `${rotation}_${phaseKey}_${inputKey}`;
              if (!byContext[ctxKey]) byContext[ctxKey] = { rot: rotation, phase: phaseKey, input: inputKey, total: 0, byAttacker: {} };
              byContext[ctxKey].total++;
              if (!byContext[ctxKey].byAttacker[pNum]) byContext[ctxKey].byAttacker[pNum] = { total: 0, pts: 0, err: 0, sumVal: 0, role: playerRole };
              byContext[ctxKey].byAttacker[pNum].total++;
              byContext[ctxKey].byAttacker[pNum].sumVal += aVal;
              if (aVal >= 4) byContext[ctxKey].byAttacker[pNum].pts++;
              if (aVal === 1) byContext[ctxKey].byAttacker[pNum].err++;
            }

            break; // Only process first A after this R/D
          }
        }
      }
    }
  }

  // ─── Compute averages ──
  for (const iq of Object.keys(byInputQuality)) {
    const d = byInputQuality[iq];
    d.avgAttackValue = d.total > 0 ? d.sumValue / d.total : 0;
  }
  for (const pNum of Object.keys(byAttacker)) {
    const a = byAttacker[pNum];
    a.avgValue = a.total > 0 ? a.sumValue / a.total : 0;
    a.efficiency = a.total > 0 ? (a.pts - a.err) / a.total : 0;
    a.pctOfTotal = 0; // will be computed below
  }

  // Compute share of total distribution
  const grandTotal = Object.values(byAttacker).reduce((s, a) => s + a.total, 0);
  for (const pNum of Object.keys(byAttacker)) {
    byAttacker[pNum].pctOfTotal = grandTotal > 0 ? byAttacker[pNum].total / grandTotal : 0;
  }

  // ─── Compute per-rotation distribution percentages ──
  for (let r = 1; r <= 6; r++) {
    const rd = byOurRotation[r];
    rd.distribution = {};
    for (const [pNum, stats] of Object.entries(rd.byAttacker)) {
      rd.distribution[pNum] = {
        ...stats,
        pct: rd.total > 0 ? stats.total / rd.total : 0,
        role: byAttacker[pNum]?.role || '',
      };
    }
  }

  // ─── Build setter tendencies summary ──
  const tendencies = _buildSetterTendencies(byAttacker, byInputQuality, byPhase, byAttackNumber, tempo, grandTotal);

  return {
    byAttacker,
    byInputQuality,
    byPhase,
    byAttackNumber,
    byOurRotation,
    byOppFrontRow,
    byOppSpecific,
    byAttackerRow,
    tempo,
    byContext,
    grandTotal,
    tendencies,
  };
}

/**
 * Build human-readable setter tendency insights.
 */
function _buildSetterTendencies(byAttacker, byInputQuality, byPhase, byAttackNumber, tempo, grandTotal) {
  const insights = [];

  // 1. Most-fed attacker
  const attackerEntries = Object.entries(byAttacker)
    .filter(([, a]) => a.total >= 5)
    .sort((a, b) => b[1].total - a[1].total);

  if (attackerEntries.length > 0) {
    const [topNum, topA] = attackerEntries[0];
    insights.push({
      type: 'top_target',
      message: `Terminale preferito: ${topA.name} (${topA.role}) con ${(topA.pctOfTotal * 100).toFixed(0)}% dei palloni (${topA.total}/${grandTotal}), efficienza ${(topA.efficiency * 100).toFixed(0)}%.`,
      playerNumber: topNum,
      severity: topA.efficiency < 0.1 ? 'warning' : 'info',
    });
  }

  // 2. Under-used efficient attacker
  const underUsed = attackerEntries.find(([, a]) =>
    a.efficiency > 0.25 && a.pctOfTotal < 0.15 && a.total >= 5 && a.role !== 'P'
  );
  if (underUsed) {
    const [pNum, a] = underUsed;
    insights.push({
      type: 'under_used',
      message: `${a.name} (${a.role}) ha efficienza ${(a.efficiency * 100).toFixed(0)}% ma riceve solo ${(a.pctOfTotal * 100).toFixed(0)}% dei palloni. Possibile risorsa sotto-utilizzata.`,
      playerNumber: pNum,
      severity: 'opportunity',
    });
  }

  // 3. Over-fed inefficient attacker
  const overFed = attackerEntries.find(([, a]) =>
    a.efficiency < 0.05 && a.pctOfTotal > 0.25 && a.total >= 8
  );
  if (overFed) {
    const [pNum, a] = overFed;
    insights.push({
      type: 'over_fed',
      message: `${a.name} (${a.role}) riceve ${(a.pctOfTotal * 100).toFixed(0)}% dei palloni ma efficienza solo ${(a.efficiency * 100).toFixed(0)}%. Distribuzione troppo prevedibile?`,
      playerNumber: pNum,
      severity: 'warning',
    });
  }

  // 4. Primo tempo usage on good reception
  const r5Tempo = tempo['R5'];
  const r4Tempo = tempo['R4'];
  if (r5Tempo && (r5Tempo.primo + r5Tempo.alto) >= 5) {
    const primoRate = r5Tempo.primo / (r5Tempo.primo + r5Tempo.alto);
    if (primoRate < 0.15) {
      insights.push({
        type: 'low_primo_tempo',
        message: `Su R5 (palla perfetta), solo ${(primoRate * 100).toFixed(0)}% va al primo tempo. Il palleggiatore potrebbe sfruttare di più la centrale.`,
        severity: 'opportunity',
      });
    }
  }

  // 5. Distribution change in transition
  if (byPhase.sideOut.total >= 10 && byPhase.transition.total >= 5) {
    const soLeader = Object.entries(byPhase.sideOut.byAttacker).sort((a, b) => b[1].total - a[1].total)[0];
    const trLeader = Object.entries(byPhase.transition.byAttacker).sort((a, b) => b[1].total - a[1].total)[0];
    if (soLeader && trLeader && soLeader[0] !== trLeader[0]) {
      const soName = byAttacker[soLeader[0]]?.name || `#${soLeader[0]}`;
      const trName = byAttacker[trLeader[0]]?.name || `#${trLeader[0]}`;
      insights.push({
        type: 'phase_shift',
        message: `Cambio distribuzione per fase: in side-out preferisce ${soName}, in transizione preferisce ${trName}.`,
        severity: 'info',
      });
    }
  }

  // 6. Attack number deterioration
  if (byAttackNumber[1]?.total >= 10 && byAttackNumber[2]?.total >= 5) {
    const eff1 = byAttackNumber[1].total > 0 ? (byAttackNumber[1].pts - byAttackNumber[1].err) / byAttackNumber[1].total : 0;
    const eff2 = byAttackNumber[2].total > 0 ? (byAttackNumber[2].pts - byAttackNumber[2].err) / byAttackNumber[2].total : 0;
    if (eff1 - eff2 > 0.15) {
      insights.push({
        type: 'attack_deterioration',
        message: `Calo efficacia dal 1° al 2° attacco nel rally: ${(eff1 * 100).toFixed(0)}% → ${(eff2 * 100).toFixed(0)}%. La distribuzione sul 2° attacco potrebbe essere migliorata.`,
        severity: 'warning',
      });
    }
  }

  // 7. Front vs back row usage
  const { front, back } = { front: { total: 0, pts: 0, err: 0 }, back: { total: 0, pts: 0, err: 0 } };
  for (const a of Object.values(byAttacker)) {
    front.total += a.frontRow.total; front.pts += a.frontRow.pts; front.err += a.frontRow.err;
    back.total += a.backRow.total; back.pts += a.backRow.pts; back.err += a.backRow.err;
  }
  if (front.total + back.total >= 10) {
    const backPct = back.total / (front.total + back.total);
    const backEff = back.total > 0 ? (back.pts - back.err) / back.total : 0;
    const frontEff = front.total > 0 ? (front.pts - front.err) / front.total : 0;
    insights.push({
      type: 'row_balance',
      message: `Distribuzione 1ª linea ${(100 - backPct * 100).toFixed(0)}% (eff. ${(frontEff * 100).toFixed(0)}%) vs 2ª linea ${(backPct * 100).toFixed(0)}% (eff. ${(backEff * 100).toFixed(0)}%).`,
      severity: backEff < frontEff * 0.5 && backPct > 0.25 ? 'warning' : 'info',
    });
  }

  return insights;
}

// ─── Setter Diagnostics Engine ──────────────────────────────────────────────
// Cross-references distribution data with rotation context and player trends
// to produce actionable training recommendations.
//
// For each context (rotation × phase × input quality) where an attacker
// underperforms, it determines:
//   1. Was the setter's choice wrong? (another available player is better)
//   2. Is the player in a negative trend? (was better before → needs recovery)
//   3. Is the player growing but insufficient? (trending up but still low)
//   4. Structural skill deficit? (needs analytical/synthetic technique work)
// ────────────────────────────────────────────────────────────────────────────
export function buildSetterDiagnostics(sd, playerTrends = {}, roster = []) {
  if (!sd || !sd.byContext || sd.grandTotal < 10) return { diagnostics: [], contextMap: {} };

  const ROLE_ORDER = ['P', 'B1', 'C2', 'O', 'B2', 'C1'];
  const MIN_CTX_SAMPLE = 3;        // minimum attacks in a context to diagnose
  const LOW_EFF_THRESHOLD = 0.10;  // below 10% efficiency = problematic
  const GOOD_EFF_THRESHOLD = 0.25; // above 25% = solid
  const BETTER_ALTERNATIVE_GAP = 0.15; // 15pp gap to declare setter error

  const diagnostics = [];
  const contextMap = {};  // enriched context for UI

  // ─── Helper: get all attackers available in a rotation ──
  function getAvailableAttackers(rotation) {
    const meta = getRotationMeta(rotation);
    const available = [];
    // Front row attackers (exclude setter)
    for (const p of meta.frontRow) {
      if (p.role !== 'P') available.push({ ...p, row: 'front' });
    }
    // Back row attackers (exclude setter and libero zones)
    for (const p of meta.backRow) {
      if (p.role !== 'P' && p.role !== 'L') available.push({ ...p, row: 'back' });
    }
    return available;
  }

  // ─── Helper: find playerNumber by role from sd.byAttacker ──
  function findPlayerByRole(role) {
    for (const [pNum, a] of Object.entries(sd.byAttacker)) {
      if (a.role === role) return pNum;
    }
    return null;
  }

  // ─── Helper: get attack trend for a player ──
  function getAttackTrend(pNum) {
    const pt = playerTrends[pNum];
    if (!pt || !pt.trends?.attack) return null;
    const t = pt.trends.attack;
    return {
      direction: t.weightedTrend || t.rawTrend || 'stable',
      recentAvg: t.weightedRecentAvg ?? t.rawRecentAvg ?? null,
      olderAvg: t.weightedOlderAvg ?? t.rawOlderAvg ?? null,
      overall: t.weightedAvg ?? t.rawAvg ?? null,
      matchCount: t.playedMatches || 0,
    };
  }

  const phaseLabel = { SO: 'Side-out', TR: 'Transizione' };
  const inputLabel = { R3: 'Ric. scarsa (bagher)', R4: 'Ric. media', R5: 'Ric. perfetta', D3: 'Dif. scarsa', D4: 'Dif. media', D5: 'Dif. perfetta' };

  // ─── Analyze each context ──
  for (const [ctxKey, ctx] of Object.entries(sd.byContext)) {
    if (ctx.total < MIN_CTX_SAMPLE) continue;

    const { rot, phase, input } = ctx;
    const availableRoles = getAvailableAttackers(rot);

    // Build efficiency per attacker in this context
    const attackerStats = [];
    for (const [pNum, stats] of Object.entries(ctx.byAttacker)) {
      if (stats.total < 2) continue;
      const eff = stats.total > 0 ? (stats.pts - stats.err) / stats.total : 0;
      const avgVal = stats.total > 0 ? stats.sumVal / stats.total : 0;
      const pShare = ctx.total > 0 ? stats.total / ctx.total : 0;
      attackerStats.push({ pNum, ...stats, eff, avgVal, share: pShare, name: sd.byAttacker[pNum]?.name || `#${pNum}`, role: stats.role || sd.byAttacker[pNum]?.role || '' });
    }

    if (attackerStats.length === 0) continue;

    // Sort by share (who gets most balls in this context)
    attackerStats.sort((a, b) => b.share - a.share);

    // Enrich context map for UI
    contextMap[ctxKey] = {
      rot, phase, input, total: ctx.total,
      attackers: attackerStats,
      availableRoles,
      phaseLabel: phaseLabel[phase] || phase,
      inputLabel: inputLabel[input] || input,
    };

    // ─── Diagnostic logic for each main recipient in this context ──
    for (const attacker of attackerStats) {
      if (attacker.total < 2) continue;
      if (attacker.eff >= GOOD_EFF_THRESHOLD) continue; // performing well, no issue

      // This attacker has low efficiency in this context
      // Step 1: Is there a BETTER alternative in the same rotation?
      const alternatives = attackerStats.filter(a => a.pNum !== attacker.pNum && a.total >= 2 && a.eff > attacker.eff + BETTER_ALTERNATIVE_GAP);

      // Also check available roles that AREN'T being used in this context but have good overall stats on this input quality
      const unusedAlternatives = [];
      for (const avail of availableRoles) {
        const altPNum = findPlayerByRole(avail.role);
        if (!altPNum || altPNum === attacker.pNum) continue;
        if (attackerStats.some(a => a.pNum === altPNum)) continue; // already in context stats
        // Check this player's global efficiency on this input quality
        const globalInput = sd.byAttacker[altPNum]?.byInput?.[input];
        if (globalInput && globalInput.total >= 3) {
          const altEff = globalInput.total > 0 ? (globalInput.pts - globalInput.err) / globalInput.total : 0;
          if (altEff > attacker.eff + BETTER_ALTERNATIVE_GAP) {
            unusedAlternatives.push({
              pNum: altPNum,
              name: sd.byAttacker[altPNum]?.name || `#${altPNum}`,
              role: avail.role,
              row: avail.row,
              globalEff: altEff,
              globalTotal: globalInput.total,
            });
          }
        }
      }

      // Step 2: Check player trend
      const trend = getAttackTrend(attacker.pNum);

      // ─── Classify the diagnostic ──
      if (alternatives.length > 0 || unusedAlternatives.length > 0) {
        // SETTER CHOICE ISSUE: there's a better player available
        const bestAlt = alternatives.length > 0
          ? { ...alternatives[0], source: 'same_context' }
          : { pNum: unusedAlternatives[0].pNum, name: unusedAlternatives[0].name, role: unusedAlternatives[0].role, eff: unusedAlternatives[0].globalEff, total: unusedAlternatives[0].globalTotal, source: 'global_input' };

        diagnostics.push({
          type: 'setter_wrong_choice',
          severity: 'critical',
          ctxKey,
          rotation: rot,
          phase,
          inputQuality: input,
          attacker: { pNum: attacker.pNum, name: attacker.name, role: attacker.role, eff: attacker.eff, total: attacker.total, share: attacker.share },
          alternative: bestAlt,
          allAlternatives: [...alternatives.map(a => ({ ...a, source: 'same_context' })), ...unusedAlternatives.map(a => ({ ...a, eff: a.globalEff, source: 'global_input' }))],
          training: {
            setter: `In P${rot} ${phaseLabel[phase]} su ${inputLabel[input]}: il palleggiatore sceglie ${attacker.name} (${attacker.role}, eff. ${(attacker.eff * 100).toFixed(0)}%) ma ${bestAlt.name} (${bestAlt.role}) ha eff. ${(bestAlt.eff * 100).toFixed(0)}%. Drill situazionale: simulare P${rot} con ${inputLabel[input].toLowerCase()}, insegnare a leggere chi è in condizione migliore.`,
            player: attacker.eff < LOW_EFF_THRESHOLD
              ? `${attacker.name}: tecnica analitica su attacco da ${inputLabel[input].toLowerCase()} — efficienza ${(attacker.eff * 100).toFixed(0)}% su ${attacker.total} palloni in P${rot} ${phaseLabel[phase]}.`
              : null,
          },
        });
      } else if (attacker.eff < LOW_EFF_THRESHOLD) {
        // No better alternative — it's a PLAYER SKILL issue
        let subType = 'player_skill_deficit';
        let trendNote = '';

        if (trend) {
          if (trend.direction === 'declining') {
            subType = 'player_skill_declining';
            const drop = trend.olderAvg !== null && trend.recentAvg !== null
              ? ((trend.olderAvg - trend.recentAvg) * 100).toFixed(0)
              : null;
            trendNote = drop ? ` Trend negativo: calo di ${drop}pp nelle ultime 3 partite.` : ' Trend in calo.';
          } else if (trend.direction === 'improving') {
            subType = 'player_skill_growing';
            trendNote = ' Trend in crescita ma ancora insufficiente.';
          }
        }

        diagnostics.push({
          type: subType,
          severity: subType === 'player_skill_declining' ? 'warning' : 'moderate',
          ctxKey,
          rotation: rot,
          phase,
          inputQuality: input,
          attacker: { pNum: attacker.pNum, name: attacker.name, role: attacker.role, eff: attacker.eff, total: attacker.total, share: attacker.share },
          trend: trend ? { direction: trend.direction, recentAvg: trend.recentAvg, olderAvg: trend.olderAvg } : null,
          training: {
            setter: null, // setter choice is correct, no setter drill
            player: `${attacker.name} (${attacker.role}): ${subType === 'player_skill_declining' ? 'recupero performance' : subType === 'player_skill_growing' ? 'consolidamento crescita' : 'tecnica analitica e sintetica'} su attacco da ${inputLabel[input].toLowerCase()} in P${rot} ${phaseLabel[phase]}.${trendNote} Eff. ${(attacker.eff * 100).toFixed(0)}% su ${attacker.total} pall.`,
          },
        });
      }
    }
  }

  // ─── Sort diagnostics: critical first, then by sample size ──
  diagnostics.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, moderate: 2 };
    const sa = sevOrder[a.severity] ?? 3;
    const sb = sevOrder[b.severity] ?? 3;
    if (sa !== sb) return sa - sb;
    return b.attacker.total - a.attacker.total;
  });

  return { diagnostics, contextMap };
}
