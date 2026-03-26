// ============================================================================
// COACH PROMAX ENGINE — Analisi Approfondita per Allenatori
//
// Funzionalità:
//   1. Profilo Avversario Medio (benchmark campionato)
//   2. Scala -5/+5 per posizionamento fondamentali
//   3. Over/Under Performance (Team e Avversario)
//   4. Coefficiente di Trasformazione Contestuale (R/D → A pesato per difficoltà)
//   5. Attribuzione Palleggiatore da rotazioni
//   6. Confronto Ruoli (S1/S2, C1/C2, L1/L2, P titolare)
//   7. Media Ponderata per fondamentale
//   8. Cap filter per escludere outlier statistici
// ============================================================================

import { ROLE_CORE_FUNDAMENTALS } from './constants';
import { areTeamNamesLikelySame } from './teamNameMatcher';

// ─── Helper: Normalizzazione ruoli ────────────────────────────────────────
// MVS salva ruoli come singola lettera (P, S, O, C, L)
// I documenti analitici usano formato lungo (P1, P2, M1, M2, C1, C2, L1, L2)
// S in MVS corrisponde a M (Schiacciatrice/Martello) nei constants
// Questa funzione mappa il ruolo alla categoria corretta
function normalizeRoleGroup(role) {
  const r = String(role || '').toUpperCase().trim();
  // Formato lungo
  if (r === 'M1' || r === 'M2' || r === 'S1' || r === 'S2') return 'S';
  if (r === 'C1' || r === 'C2') return 'C';
  if (r === 'P1' || r === 'P2') return 'P';
  if (r === 'L1' || r === 'L2') return 'L';
  if (r === 'O')  return 'O';
  // Formato breve (singola lettera da MVS)
  if (r === 'S' || r === 'M') return 'S';
  if (r === 'C') return 'C';
  if (r === 'P') return 'P';
  if (r === 'L') return 'L';
  return '';
}

function isSetterRole(role) {
  const r = String(role || '').toUpperCase().trim();
  return r === 'P' || r === 'P1' || r === 'P2';
}

// ─── Helper: identifica il palleggiatore dalla rotazione P1 in battuta ──────
// In pallavolo, quando la squadra è in rotazione P1 e serve (fase 'b'),
// chi batte È il palleggiatore. Questa è l'unica logica affidabile per
// identificare il palleggiatore, indipendentemente dal ruolo assegnato nel roster.
function _getServerFromRally(rally) {
  // Prova rally.server (dal parser DataVolley, colonna R)
  if (rally.server) return String(rally.server).padStart(2, '0');
  // Fallback: cerca la prima azione di battuta nella quartina
  const q = rally.quartine || rally.quartine || [];
  const serve = q.find(t => t.type === 'action' && String(t.fundamental || '').toLowerCase() === 'b');
  if (serve?.player) return String(serve.player).padStart(2, '0');
  return null;
}

/**
 * Identifica i numeri dei palleggiatori basandosi sulla logica P1:
 * chi serve quando la squadra è in rotazione P1 (fase 'b') è il palleggiatore.
 * @param {Array|Object} matches - Un singolo match o array di match
 * @returns {Set<string>} - Set di numeri giocatore (padded a 2 cifre)
 */
export function identifySettersFromP1Serve(matches) {
  const setterNums = new Set();
  const matchList = Array.isArray(matches) ? matches : [matches];
  for (const match of matchList) {
    for (const rally of (match?.rallies || [])) {
      if (rally.rotation === 1 && rally.phase === 'b') {
        const server = _getServerFromRally(rally);
        if (server) setterNums.add(server);
      }
    }
  }
  return setterNums;
}

/**
 * Attribuisce il palleggiatore a ogni rally basandosi sulla logica P1.
 * Algoritmo:
 * - Scansiona i rally per set in ordine
 * - Quando incontra rotazione P1 fase 'b': chi serve è il palleggiatore
 * - Tutti i rally precedenti (dall'ultimo P1-b o inizio set) vengono attribuiti retroattivamente
 * - Se il set finisce senza nuovo P1-b, i rally pendenti ereditano l'ultimo palleggiatore noto
 * @param {Array} rallies - Array di rally del match
 * @returns {Array} - Rally arricchiti con campo .setterNum
 */
export function attributeSetterToRallies(rallies) {
  if (!rallies || !rallies.length) return [];

  // Raggruppa rally per set
  const rallyPerSet = {};
  for (const r of rallies) {
    const s = r.set || 1;
    if (!rallyPerSet[s]) rallyPerSet[s] = [];
    rallyPerSet[s].push(r);
  }

  let lastKnownSetter = null; // Persiste tra set

  for (const setNum of Object.keys(rallyPerSet).sort((a, b) => a - b)) {
    const setRallies = rallyPerSet[setNum];
    let pendingRallies = [];
    let currentSetter = null;

    for (const rally of setRallies) {
      pendingRallies.push(rally);

      if (rally.rotation === 1 && rally.phase === 'b') {
        const server = _getServerFromRally(rally);
        if (server) {
          currentSetter = server;
          lastKnownSetter = server;
          // Attribuisci retroattivamente tutti i rally pendenti
          for (const pr of pendingRallies) {
            pr.setterNum = currentSetter;
          }
          pendingRallies = [];
        }
      }
    }

    // Fine del set: eredita dall'ultimo palleggiatore noto
    if (pendingRallies.length > 0) {
      const setter = currentSetter || lastKnownSetter;
      if (setter) {
        for (const pr of pendingRallies) {
          pr.setterNum = setter;
        }
      }
    }
  }

  return rallies;
}

// ─── Helper: Media Ponderata su scala 1-5 ─────────────────────────────────
// Calcola (5×kill + 4×pos + 3×exc + 2×neg + 1×err) / tot
export function mediaPonderata(stat) {
  if (!stat || !stat.tot) return 0;
  return +(
    (5 * (stat.kill || 0) + 4 * (stat.pos || 0) + 3 * (stat.exc || 0) +
     2 * (stat.neg || 0) + 1 * (stat.err || 0)) / stat.tot
  ).toFixed(3);
}

// Per opponent R/D dove val4+5 sono combinati, stima val4 = tot/3, val5 = 2*tot/3
export function mediaPonderataOppCombined(v1, v2, v3, v45) {
  const tot = v1 + v2 + v3 + v45;
  if (!tot) return 0;
  const est4 = Math.round(v45 / 3);
  const est5 = v45 - est4;
  return +((5 * est5 + 4 * est4 + 3 * v3 + 2 * v2 + 1 * v1) / tot).toFixed(3);
}

// ─── 1. Profilo Avversario Medio ──────────────────────────────────────────
// Aggrega i dati di tutti gli avversari incontrati in una competizione
// per creare un benchmark ("avversario medio")
export function buildAverageOpponentProfile(matches) {
  const agg = {
    attack:    { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
    serve:     { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
    reception: { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
    defense:   { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
  };
  let matchCount = 0;

  for (const m of matches) {
    const opp = m?.riepilogo?.opponent;
    if (!opp) continue;
    matchCount++;
    for (const fund of ['attack', 'serve', 'reception', 'defense']) {
      const s = opp[fund];
      if (!s) continue;
      agg[fund].kill += s.kill || 0;
      agg[fund].pos  += s.pos || 0;
      agg[fund].exc  += s.exc || 0;
      agg[fund].neg  += s.neg || 0;
      agg[fund].err  += s.err || 0;
      agg[fund].tot  += s.tot || 0;
    }
  }

  const profile = {};
  for (const fund of ['attack', 'serve', 'reception', 'defense']) {
    profile[fund] = {
      ...agg[fund],
      mediaPond: mediaPonderata(agg[fund]),
      efficacy:  agg[fund].tot ? +((agg[fund].kill / agg[fund].tot) * 100).toFixed(1) : 0,
      efficiency: agg[fund].tot ? +(((agg[fund].kill - agg[fund].err) / agg[fund].tot) * 100).toFixed(1) : 0,
    };
  }

  return { profile, matchCount };
}

// ─── 2. Scala -5/+5 per fondamentale ─────────────────────────────────────
// Calcola gli step della scala basandosi su min/max media ponderata
// tra tutti gli avversari. Lo zero è la media tra il più debole e il più forte.
export function buildFundamentalScale(matches) {
  const oppProfiles = [];

  // Raggruppa partite per avversario
  const byOpponent = {};
  // Helper: extract round prefix (A)/(R) from a key/name
  function _roundPrefix(s) { const m = s.match(/^\([ar]\) /i); return m ? m[0].toUpperCase() : ''; }
  for (const m of matches) {
    const oppName = String(m?.metadata?.opponent || '').trim();
    if (!oppName || !m?.riepilogo?.opponent) continue;
    // Normalizza nome avversario
    let key = oppName.toLowerCase();
    let found = false;
    for (const k of Object.keys(byOpponent)) {
      // Never merge (A) with (R) or prefixed with non-prefixed
      if (_roundPrefix(k) !== _roundPrefix(key)) continue;
      if (areTeamNamesLikelySame(k, key)) { key = k; found = true; break; }
    }
    if (!byOpponent[key]) byOpponent[key] = { name: oppName, matches: [] };
    byOpponent[key].matches.push(m);
  }

  for (const [key, data] of Object.entries(byOpponent)) {
    const { profile } = buildAverageOpponentProfile(data.matches);
    oppProfiles.push({ name: data.name, key, profile, matchCount: data.matches.length });
  }

  const scales = {};
  for (const fund of ['attack', 'serve', 'reception', 'defense']) {
    const values = oppProfiles
      .filter(o => o.profile[fund]?.tot > 0)
      .map(o => o.profile[fund].mediaPond);

    if (values.length < 2) {
      scales[fund] = { min: 0, max: 0, step: 0, zero: 0, valid: false };
      continue;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const step = (max - min) / 10;
    const zero = min + 5 * step; // punto medio

    scales[fund] = { min, max, step, zero, valid: true };
  }

  return { scales, oppProfiles };
}

// Posiziona un valore sulla scala -5/+5
export function positionOnScale(value, scale) {
  if (!scale || !scale.valid || scale.step === 0) return 0;
  return +((value - scale.zero) / scale.step).toFixed(2);
}

// ─── 3. Over/Under Performance ───────────────────────────────────────────
// Confronta la performance in una specifica partita con il profilo medio
// e (se disponibile) con il valore stimato basato sulla classifica
export function analyzeOverUnderPerformance(match, avgOppProfile, scales, standings, rankingScale) {
  const opp = match?.riepilogo?.opponent;
  const team = match?.riepilogo?.team;
  if (!opp || !team) return null;

  const oppName = String(match?.metadata?.opponent || '').trim();

  // Posizione in classifica dell'avversario (se disponibile)
  const oppRanking = findTeamRanking(oppName, standings);

  // Stima per fondamentale basata sul rank
  const estimatedByRank = (oppRanking && rankingScale)
    ? estimateFundamentalByRank(oppRanking.position, oppRanking.total, rankingScale)
    : null;

  const oppAnalysis = {};
  const teamAnalysis = {};

  for (const fund of ['attack', 'serve', 'reception', 'defense']) {
    // Avversario: confronto con media
    const oppMP = mediaPonderata(opp[fund]);
    const avgMP = avgOppProfile?.profile?.[fund]?.mediaPond || 0;
    const scale = scales?.[fund];

    const estimated    = estimatedByRank?.[fund]?.estimated ?? null;
    const rankScalePos = estimatedByRank?.[fund]?.scalePos  ?? null;

    oppAnalysis[fund] = {
      mediaPond: oppMP,
      avgMediaPond: avgMP,
      delta: +(oppMP - avgMP).toFixed(3),
      scalePosition: positionOnScale(oppMP, scale),
      avgScalePosition: positionOnScale(avgMP, scale),
      isOverPerforming: oppMP > avgMP,
      // Stima basata su classifica
      estimated,
      rankScalePos,
      deltaVsEstimated: estimated !== null ? +(oppMP - estimated).toFixed(3) : null,
      isOverVsEstimated: estimated !== null ? oppMP > estimated : null,
    };

    // Team: confronto con propria media
    const teamMP = mediaPonderata(team[fund]);
    teamAnalysis[fund] = {
      mediaPond: teamMP,
    };
  }

  return { oppName, oppRanking, oppAnalysis, teamAnalysis };
}

// ─── 4. Coefficiente di Trasformazione Contestuale ───────────────────────
// Per ogni attaccante: capacità di trasformare R/D in A, pesata per
// la difficoltà dell'avversario
export function computeTransformationCoefficients(matches, scales, roster) {
  // Per-player: matrice [inputQuality][outputQuality] con contesto avversario
  const playerTransf = {};
  const teamTransf = { fromRcv: {}, fromDef: {} };

  // Costruisce set di numeri palleggiatori (da escludere dagli attaccanti)
  // Logica P1: chi serve in rotazione P1 è il palleggiatore
  const globalSetterNums = identifySettersFromP1Serve(matches);
  // Fallback: se non ci sono rally P1-b, usa il roster
  if (globalSetterNums.size === 0) {
    (roster || [])
      .filter(p => isSetterRole(p.role))
      .forEach(p => globalSetterNums.add(String(p.number || '').padStart(2, '0')));
  }

  for (const match of matches) {
    const opp = match?.riepilogo?.opponent;
    const oppDefMP = opp?.defense ? mediaPonderata(opp.defense) : 0;
    const defScale = scales?.defense;
    const oppDefPosition = positionOnScale(oppDefMP, defScale);

    // Palleggiatori identificati dalla logica P1 per questa partita
    const matchSetterNums = identifySettersFromP1Serve([match]);
    const allSetters = new Set([...globalSetterNums, ...matchSetterNums]);

    // Analizza rally per rally
    const rallies = match?.rallies || [];
    for (const rally of rallies) {
      const q = rally?.quartine || [];
      if (!q.length) continue;

      let lastInputType = null; // 'r' o 'd'
      let lastInputEval = 0;

      for (const token of q) {
        if (token.type !== 'action') continue;
        const f = String(token.fundamental || '').toLowerCase();
        const e = Number(token.value || token.evaluation || 0);
        const player = String(token.player || '');
        const playerPad = player.padStart(2, '0');

        if (f === 'r' && e >= 3) {
          lastInputType = 'r';
          lastInputEval = e;
        } else if (f === 'd' && e >= 3) {
          lastInputType = 'd';
          lastInputEval = e;
        } else if (f === 'a' && lastInputType && lastInputEval >= 3) {
          // Escludi attacchi dei palleggiatori
          if (allSetters.has(playerPad)) { lastInputType = null; lastInputEval = 0; continue; }
          // Registra trasformazione
          const key = `${lastInputType.toUpperCase()}${lastInputEval}`;
          const aKey = `A${e}`;

          if (!playerTransf[player]) playerTransf[player] = {};
          if (!playerTransf[player][key]) playerTransf[player][key] = { total: 0, byOutput: {}, oppDefPositions: [] };
          playerTransf[player][key].total++;
          playerTransf[player][key].byOutput[aKey] = (playerTransf[player][key].byOutput[aKey] || 0) + 1;
          playerTransf[player][key].oppDefPositions.push(oppDefPosition);

          // Aggregato team
          const bucket = lastInputType === 'r' ? teamTransf.fromRcv : teamTransf.fromDef;
          if (!bucket[key]) bucket[key] = { total: 0, byOutput: {}, sumAttackEval: 0 };
          bucket[key].total++;
          bucket[key].byOutput[aKey] = (bucket[key].byOutput[aKey] || 0) + 1;
          bucket[key].sumAttackEval += e;

          lastInputType = null;
          lastInputEval = 0;
        } else if (f === 'b' || f === 'm') {
          lastInputType = null;
          lastInputEval = 0;
        }
      }
    }
  }

  // Calcola coefficiente per ogni player
  const playerCoefficients = {};
  for (const [player, inputs] of Object.entries(playerTransf)) {
    playerCoefficients[player] = {};
    for (const [inputKey, data] of Object.entries(inputs)) {
      const avgOppDef = data.oppDefPositions.length
        ? +(data.oppDefPositions.reduce((a, b) => a + b, 0) / data.oppDefPositions.length).toFixed(2)
        : 0;
      // Media ponderata dell'output d'attacco
      let sumWeighted = 0;
      for (const [aKey, count] of Object.entries(data.byOutput)) {
        const aVal = Number(aKey.replace('A', ''));
        sumWeighted += aVal * count;
      }
      const avgOutput = data.total ? +(sumWeighted / data.total).toFixed(2) : 0;
      // Coefficiente = output medio, aggiustato per contesto avversario
      // Un output 3.5 contro avversario a +2 vale di più di 3.5 contro avversario a -2
      const adjustedCoeff = +(avgOutput + avgOppDef * 0.2).toFixed(2);

      playerCoefficients[player][inputKey] = {
        total: data.total,
        avgOutput,
        avgOppDefPosition: avgOppDef,
        adjustedCoeff,
        distribution: data.byOutput,
      };
    }
  }

  return { playerCoefficients, teamTransf };
}

// ─── 5. Attribuzione Palleggiatore ───────────────────────────────────────
// Determina quale palleggiatore ha servito gli attaccanti basandosi sulla
// logica P1: chi serve quando la squadra è in rotazione P1 (fase 'b')
// è il palleggiatore. Retroattivamente tutti i rally dal giro precedente
// vengono attribuiti a quel palleggiatore.
export function attributeSetterToAttacks(matches, roster) {
  const setterMap = {}; // { setterNumber: { attacks: [...], totals } }

  // Identifica palleggiatori dalla logica P1 (chi serve in P1)
  const setterNumsSet = identifySettersFromP1Serve(matches);

  // Fallback al roster se non ci sono rally con P1-b (es. dati incompleti)
  if (setterNumsSet.size === 0) {
    const rosterSetters = (roster || []).filter(p => isSetterRole(p.role))
      .map(p => String(p.number || '').padStart(2, '0'));
    rosterSetters.forEach(s => setterNumsSet.add(s));
  }

  const setters = [...setterNumsSet];
  if (setters.length === 0) return { setterMap: {}, setters: [] };

  for (const match of matches) {
    const rallies = match?.rallies || [];
    if (!rallies.length) continue;

    // Attribuisci il palleggiatore a ogni rally con la logica P1
    attributeSetterToRallies(rallies);

    // Raggruppa rally per palleggiatore attribuito
    const segmentsBySetterObj = {};
    for (const rally of rallies) {
      const s = rally.setterNum;
      if (!s) continue;
      if (!segmentsBySetterObj[s]) segmentsBySetterObj[s] = [];
      segmentsBySetterObj[s].push(rally);
    }

    // Analizza attacchi per ogni palleggiatore
    for (const [setterNum, setterRallies] of Object.entries(segmentsBySetterObj)) {
      if (!setterMap[setterNum]) {
        setterMap[setterNum] = {
          attacksServed: [],
          totalAttacks: 0,
          attacksByPlayer: {},
          attacksByInput: { R3: { total: 0, sumOutput: 0 }, R4: { total: 0, sumOutput: 0 }, R5: { total: 0, sumOutput: 0 },
                           D3: { total: 0, sumOutput: 0 }, D4: { total: 0, sumOutput: 0 }, D5: { total: 0, sumOutput: 0 } },
        };
      }

      for (const rally of setterRallies) {
        const q = rally?.quartine || [];
        let lastInput = null;
        let lastInputEval = 0;

        for (const token of q) {
          if (token.type !== 'action') continue;
          const f = String(token.fundamental || '').toLowerCase();
          const e = Number(token.value || token.evaluation || 0);
          const player = String(token.player || '').padStart(2, '0');

          if (f === 'r' && e >= 3) { lastInput = 'R'; lastInputEval = e; }
          else if (f === 'd' && e >= 3) { lastInput = 'D'; lastInputEval = e; }
          else if (f === 'a' && lastInput && lastInputEval >= 3) {
            // Questo attacco è stato gestito dal palleggiatore attribuito al rally
            // Escludiamo attacchi dei palleggiatori stessi
            if (setterNumsSet.has(player)) { lastInput = null; continue; }
            const inputKey = `${lastInput}${lastInputEval}`;
            setterMap[setterNum].totalAttacks++;

            if (!setterMap[setterNum].attacksByPlayer[player]) {
              setterMap[setterNum].attacksByPlayer[player] = { total: 0, sumOutput: 0, kills: 0, errors: 0 };
            }
            setterMap[setterNum].attacksByPlayer[player].total++;
            setterMap[setterNum].attacksByPlayer[player].sumOutput += e;
            if (e === 5) setterMap[setterNum].attacksByPlayer[player].kills++;
            if (e === 1) setterMap[setterNum].attacksByPlayer[player].errors++;

            if (setterMap[setterNum].attacksByInput[inputKey]) {
              setterMap[setterNum].attacksByInput[inputKey].total++;
              setterMap[setterNum].attacksByInput[inputKey].sumOutput += e;
            }

            setterMap[setterNum].attacksServed.push({
              attacker: player,
              input: inputKey,
              output: e,
              rotation: rally.rotation || 0,
              set: rally.set || 0,
            });

            lastInput = null;
            lastInputEval = 0;
          } else if (f === 'b' || f === 'm') {
            lastInput = null;
            lastInputEval = 0;
          }
        }
      }
    }
  }

  // Calcola metriche per setter
  for (const [setter, data] of Object.entries(setterMap)) {
    data.avgOutput = data.totalAttacks
      ? +(data.attacksServed.reduce((s, a) => s + a.output, 0) / data.totalAttacks).toFixed(2)
      : 0;
    data.killRate = data.totalAttacks
      ? +(data.attacksServed.filter(a => a.output === 5).length / data.totalAttacks * 100).toFixed(1)
      : 0;

    // Per attacker: calcola efficacia
    for (const [player, stats] of Object.entries(data.attacksByPlayer)) {
      stats.avgOutput = stats.total ? +(stats.sumOutput / stats.total).toFixed(2) : 0;
      stats.efficacy = stats.total ? +(stats.kills / stats.total * 100).toFixed(1) : 0;
      stats.efficiency = stats.total ? +((stats.kills - stats.errors) / stats.total * 100).toFixed(1) : 0;
    }
  }

  return { setterMap, setters };
}

// ─── 6. Confronto Ruoli ──────────────────────────────────────────────────
export function compareRoles(matches, roster) {
  const roleGroups = {
    S: [], // Schiacciatori (M1, M2)
    C: [], // Centrali (C1, C2)
    P: [], // Palleggiatori (P1, P2)
    L: [], // Liberi (L1, L2)
    O: [], // Opposto
  };

  for (const player of (roster || [])) {
    const rawRole = String(player.role || '').toUpperCase().trim();
    const group = normalizeRoleGroup(rawRole);
    const num = String(player.number || '').padStart(2, '0');
    const entry = { number: num, name: `${player.surname || ''} ${player.name || ''}`.trim(), role: rawRole, roleGroup: group };

    if (group === 'S') roleGroups.S.push(entry);
    else if (group === 'C') roleGroups.C.push(entry);
    else if (group === 'P') roleGroups.P.push(entry);
    else if (group === 'L') roleGroups.L.push(entry);
    else if (group === 'O') roleGroups.O.push(entry);
  }

  // Aggrega stats per player su tutte le partite
  const playerAgg = {};
  for (const m of matches) {
    const players = m?.riepilogo?.playerStats || [];
    for (const p of players) {
      const num = String(p.number || '').padStart(2, '0');
      if (!playerAgg[num]) {
        playerAgg[num] = {
          attack: { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
          serve: { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
          block: { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
          reception: { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
          defense: { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
          matchCount: 0,
        };
      }
      playerAgg[num].matchCount++;
      for (const fund of ['attack', 'serve', 'block', 'reception', 'defense']) {
        const s = p[fund];
        if (!s) continue;
        playerAgg[num][fund].kill += s.kill || 0;
        playerAgg[num][fund].pos  += s.pos || 0;
        playerAgg[num][fund].exc  += s.exc || 0;
        playerAgg[num][fund].neg  += s.neg || 0;
        playerAgg[num][fund].err  += s.err || 0;
        playerAgg[num][fund].tot  += s.tot || 0;
      }
    }
  }

  const comparisons = {};

  // S1 vs S2: chi attacca meglio vs chi riceve/difende meglio
  if (roleGroups.S.length >= 2) {
    const sPlayers = roleGroups.S.map(p => {
      const agg = playerAgg[p.number] || {};
      return {
        ...p,
        attack: { ...agg.attack, mediaPond: mediaPonderata(agg.attack), efficacy: agg.attack.tot ? +((agg.attack.kill / agg.attack.tot) * 100).toFixed(1) : 0 },
        reception: { ...agg.reception, mediaPond: mediaPonderata(agg.reception) },
        defense: { ...agg.defense, mediaPond: mediaPonderata(agg.defense) },
        serve: { ...agg.serve, mediaPond: mediaPonderata(agg.serve) },
        matchCount: agg.matchCount || 0,
      };
    });
    // S1 = maggiore abilità in attacco; S2 = maggiore qualità in fondamentali di 2a linea
    sPlayers.sort((a, b) => (b.attack.mediaPond || 0) - (a.attack.mediaPond || 0));
    comparisons.S = {
      label: 'Schiacciatori S1 vs S2',
      description: 'S1: attacco primario | S2: fondamentali di 2a linea (ricezione/difesa)',
      players: sPlayers,
      s1Candidate: sPlayers[0],
      s2Candidate: sPlayers.length > 1
        ? sPlayers.slice(1).sort((a, b) =>
            ((b.reception.mediaPond || 0) + (b.defense.mediaPond || 0)) -
            ((a.reception.mediaPond || 0) + (a.defense.mediaPond || 0))
          )[0]
        : null,
    };
  }

  // C1 vs C2
  if (roleGroups.C.length >= 2) {
    const cPlayers = roleGroups.C.map(p => {
      const agg = playerAgg[p.number] || {};
      return {
        ...p,
        attack: { ...agg.attack, mediaPond: mediaPonderata(agg.attack), efficacy: agg.attack.tot ? +((agg.attack.kill / agg.attack.tot) * 100).toFixed(1) : 0 },
        block: { ...agg.block, mediaPond: mediaPonderata(agg.block), efficacy: agg.block.tot ? +((agg.block.kill / agg.block.tot) * 100).toFixed(1) : 0 },
        serve: { ...agg.serve, mediaPond: mediaPonderata(agg.serve) },
        matchCount: agg.matchCount || 0,
      };
    });
    // C1 = abile in attacco e apertura gioco; C2 = abile in muro e primo tempo davanti
    cPlayers.sort((a, b) => (b.attack.mediaPond || 0) - (a.attack.mediaPond || 0));
    comparisons.C = {
      label: 'Centrali C1 vs C2',
      description: 'C1: attacco/apertura gioco (palle dietro, fast) | C2: muro/primo tempo davanti',
      players: cPlayers,
    };
  }

  // L1 vs L2: libero di ricezione vs libero di difesa
  if (roleGroups.L.length >= 2) {
    const lPlayers = roleGroups.L.map(p => {
      const agg = playerAgg[p.number] || {};
      return {
        ...p,
        reception: { ...agg.reception, mediaPond: mediaPonderata(agg.reception), efficacy: agg.reception.tot ? +((agg.reception.kill / agg.reception.tot) * 100).toFixed(1) : 0 },
        defense: { ...agg.defense, mediaPond: mediaPonderata(agg.defense), efficacy: agg.defense.tot ? +((agg.defense.kill / agg.defense.tot) * 100).toFixed(1) : 0 },
        matchCount: agg.matchCount || 0,
      };
    });
    const rcvBest = [...lPlayers].sort((a, b) => (b.reception.mediaPond || 0) - (a.reception.mediaPond || 0))[0];
    const defBest = [...lPlayers].sort((a, b) => (b.defense.mediaPond || 0) - (a.defense.mediaPond || 0))[0];
    comparisons.L = {
      label: 'Liberi L1 vs L2',
      description: 'Libero di Ricezione vs Libero di Difesa',
      players: lPlayers,
      liberoRicezione: rcvBest,
      liberoDifesa: defBest,
    };
  }

  // P1 vs P2: palleggiatore titolare
  if (roleGroups.P.length >= 2) {
    comparisons.P = {
      label: 'Palleggiatori P1 vs P2',
      description: 'Confronto tecnica e regia (richiede dati setter attribution)',
      players: roleGroups.P.map(p => {
        const agg = playerAgg[p.number] || {};
        return {
          ...p,
          defense: { ...agg.defense, mediaPond: mediaPonderata(agg.defense) },
          serve: { ...agg.serve, mediaPond: mediaPonderata(agg.serve) },
          block: { ...agg.block, mediaPond: mediaPonderata(agg.block) },
          matchCount: agg.matchCount || 0,
        };
      }),
    };
  }

  return { comparisons, roleGroups, playerAgg };
}

// ─── 7. Profilo Partita Completo (per Coach ProMax) ──────────────────────
// Analisi approfondita di una singola partita
export function analyzeMatch(match, avgOppProfile, scales, standings, rankingScale) {
  if (!match?.riepilogo) return null;

  const overUnder = analyzeOverUnderPerformance(match, avgOppProfile, scales, standings, rankingScale);

  // Capacità di generare attacco da R/D (esclusi eval 1-2)
  const team = match.riepilogo.team || {};
  const attackGenerationFromRcv = team.reception?.tot
    ? +(((team.reception.kill || 0) + (team.reception.pos || 0) + (team.reception.exc || 0)) / team.reception.tot * 100).toFixed(1)
    : 0;
  const attackGenerationFromDef = team.defense?.tot
    ? +(((team.defense.kill || 0) + (team.defense.pos || 0) + (team.defense.exc || 0)) / team.defense.tot * 100).toFixed(1)
    : 0;

  // Indice errori (esclusa difesa, come da documenti)
  const teamErrors = (team.attack?.err || 0) + (team.serve?.err || 0) + (team.block?.err || 0) + (team.reception?.err || 0);
  const oppErrors = match.riepilogo.opponent
    ? (match.riepilogo.opponent.attack?.err || 0) + (match.riepilogo.opponent.serve?.err || 0)
    : 0;

  return {
    ...overUnder,
    attackGenerationFromRcv,
    attackGenerationFromDef,
    teamErrors,
    oppErrors,
    errorBalance: teamErrors - oppErrors,
  };
}

// ─── 8. Preparazione Gara di Ritorno ─────────────────────────────────────
// Predice performance attesa normalizzando per over/under performance
export function predictReturnMatch(match, avgOppProfile, teamAvgProfile, scales) {
  if (!match?.riepilogo) return null;

  const opp = match.riepilogo.opponent || {};
  const team = match.riepilogo.team || {};
  const predictions = {};

  for (const fund of ['attack', 'serve', 'reception', 'defense']) {
    const oppMP = mediaPonderata(opp[fund]);
    const avgOppMP = avgOppProfile?.profile?.[fund]?.mediaPond || 0;
    const teamMP = mediaPonderata(team[fund]);
    const teamAvgMP = teamAvgProfile?.[fund]?.mediaPond || 0;

    // Se l'avversario torna ai suoi valori medi, il delta si normalizza
    const oppDelta = oppMP - avgOppMP;
    const teamDelta = teamMP - teamAvgMP;

    predictions[fund] = {
      oppActual: oppMP,
      oppAvg: avgOppMP,
      oppDelta: +oppDelta.toFixed(3),
      teamActual: teamMP,
      teamAvg: teamAvgMP,
      teamDelta: +teamDelta.toFixed(3),
      // Stima: se avversario torna alla media, il nostro fondamentale
      // corrispondente dovrebbe migliorare/peggiorare di conseguenza
      expectedTeamAdjustment: +(-oppDelta * 0.5).toFixed(3),
      expectedTeam: +(teamMP - oppDelta * 0.5).toFixed(3),
    };
  }

  return predictions;
}

// ─── 9. Team Average Profile ─────────────────────────────────────────────
// Profilo medio del Team su tutte le partite
export function buildTeamAverageProfile(matches) {
  const agg = {
    attack:    { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
    serve:     { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
    block:     { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
    reception: { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
    defense:   { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 },
  };

  for (const m of matches) {
    const t = m?.riepilogo?.team;
    if (!t) continue;
    for (const fund of Object.keys(agg)) {
      const s = t[fund];
      if (!s) continue;
      for (const k of ['kill', 'pos', 'exc', 'neg', 'err', 'tot']) {
        agg[fund][k] += s[k] || 0;
      }
    }
  }

  const profile = {};
  for (const fund of Object.keys(agg)) {
    profile[fund] = {
      ...agg[fund],
      mediaPond: mediaPonderata(agg[fund]),
      efficacy:  agg[fund].tot ? +((agg[fund].kill / agg[fund].tot) * 100).toFixed(1) : 0,
      efficiency: agg[fund].tot ? +(((agg[fund].kill - agg[fund].err) / agg[fund].tot) * 100).toFixed(1) : 0,
    };
  }

  return profile;
}

// ─── 10. Cap Filter ──────────────────────────────────────────────────────
// Filtra player/statistiche con volumi sotto/sopra soglia
export function applyCapFilter(playerStats, minActions = 5, maxActions = Infinity) {
  return playerStats.filter(p => {
    const tot = (p.attack?.tot || 0) + (p.serve?.tot || 0) + (p.block?.tot || 0) +
                (p.reception?.tot || 0) + (p.defense?.tot || 0);
    return tot >= minActions && tot <= maxActions;
  });
}

// ─── 11. Scala basata su Ranking Classifica ──────────────────────────────
// Calcola VMPC (valore media primo classificato), VMUC (ultimo) e VMMC (medio)
// partendo dai profili avversari già computati e dalla classifica.
// Step: 5 step da VMMC→VMPC e 5 step da VMMC→VMUC.
export function buildRankingScale(oppProfiles, standings) {
  const FUNDS = ['attack', 'serve', 'reception', 'defense'];

  if (!standings || standings.length < 2 || !oppProfiles || !oppProfiles.length) {
    return { rankingScale: null, rankedOppProfiles: [] };
  }

  // Join profili avversari con classifica
  const rankedProfiles = oppProfiles
    .map(op => {
      const standing = standings.find(s =>
        areTeamNamesLikelySame(String(s.name || ''), String(op.name || ''))
      );
      return { ...op, rank: standing?.rank || null, totalTeams: standings.length };
    })
    .filter(op => op.rank !== null);

  if (rankedProfiles.length < 2) {
    return { rankingScale: null, rankedOppProfiles: rankedProfiles };
  }

  rankedProfiles.sort((a, b) => a.rank - b.rank);

  const bestRanked  = rankedProfiles[0];                           // miglior rank affrontato
  const worstRanked = rankedProfiles[rankedProfiles.length - 1];   // peggior rank affrontato

  const rankingScale = {};
  for (const fund of FUNDS) {
    const vmpc = +(bestRanked.profile[fund]?.mediaPond || 0);
    const vmuc = +(worstRanked.profile[fund]?.mediaPond || 0);

    // VMMC: media ponderata per numero partite su tutti gli avversari affrontati
    let totalMatches = 0;
    let sumMP = 0;
    for (const op of rankedProfiles) {
      const mc = op.matchCount || 1;
      sumMP += (op.profile[fund]?.mediaPond || 0) * mc;
      totalMatches += mc;
    }
    const vmmc = totalMatches ? +(sumMP / totalMatches).toFixed(3) : 0;

    const stepUp   = vmpc > vmmc ? +((vmpc - vmmc) / 5).toFixed(4) : 0;
    const stepDown = vmmc > vmuc ? +((vmmc - vmuc) / 5).toFixed(4) : 0;

    rankingScale[fund] = {
      vmpc,                                   // team migliore (tra affrontati)
      vmuc,                                   // team peggiore (tra affrontati)
      vmmc,                                   // team medio
      stepUp,                                 // valore 1 step verso l'alto
      stepDown,                               // valore 1 step verso il basso
      bestRankAmongPlayed:  bestRanked.rank,
      worstRankAmongPlayed: worstRanked.rank,
    };
  }

  return { rankingScale, rankedOppProfiles: rankedProfiles };
}

// Stima il valore per fondamentale di un avversario dato il suo rank
// rank=1 → scalePos=+5 (VMPC); rank=N → scalePos=-5 (VMUC)
export function estimateFundamentalByRank(rank, totalTeams, rankingScale) {
  if (!rank || !totalTeams || !rankingScale) return null;

  const scalePos = totalTeams > 1
    ? +(5 - (rank - 1) * 10 / (totalTeams - 1)).toFixed(2)
    : 0;

  const result = {};
  for (const fund of ['attack', 'serve', 'reception', 'defense']) {
    const sc = rankingScale[fund];
    if (!sc) { result[fund] = { estimated: 0, scalePos }; continue; }

    let estimated;
    if (scalePos >= 0) {
      estimated = +(sc.vmmc + (scalePos / 5) * (sc.vmpc - sc.vmmc)).toFixed(3);
    } else {
      estimated = +(sc.vmmc + (scalePos / 5) * (sc.vmmc - sc.vmuc)).toFixed(3);
    }
    result[fund] = { estimated, scalePos };
  }
  return result;
}

// ─── Helper: trova ranking squadra nella classifica ──────────────────────
function findTeamRanking(teamName, standings) {
  if (!standings || !Array.isArray(standings) || !teamName) return null;
  const name = teamName.toLowerCase();
  for (let i = 0; i < standings.length; i++) {
    const sName = String(standings[i]?.team || standings[i]?.squadra || '').toLowerCase();
    if (sName.includes(name) || name.includes(sName) || areTeamNamesLikelySame(sName, name)) {
      return { position: i + 1, total: standings.length, data: standings[i] };
    }
  }
  return null;
}

// ─── Master: calcola tutto per Coach ProMax ──────────────────────────────
export function computeCoachProMax(matches, roster, standings) {
  if (!matches || !matches.length) return null;

  const avgOpp = buildAverageOpponentProfile(matches);
  const { scales, oppProfiles } = buildFundamentalScale(matches);
  const { rankingScale, rankedOppProfiles } = buildRankingScale(oppProfiles, standings);
  const teamAvg = buildTeamAverageProfile(matches);
  const transf = computeTransformationCoefficients(matches, scales, roster);
  const setterAttrib = attributeSetterToAttacks(matches, roster);
  const roles = compareRoles(matches, roster);

  // Per-match analysis
  const matchAnalyses = matches.map(m => {
    // Calcola il risultato dai set (più affidabile di metadata.result che può essere "0-0")
    const setsWon  = (m.sets || []).filter(s => s.won).length;
    const setsLost = (m.sets || []).filter(s => !s.won).length;
    const computedResult = (m.sets || []).length > 0 ? `${setsWon}-${setsLost}` : '';
    return {
      matchId: m.id,
      opponent: m?.metadata?.opponent || '',
      date: m?.metadata?.date || '',
      result: computedResult || m?.metadata?.result || '',
      analysis: analyzeMatch(m, avgOpp, scales, standings, rankingScale),
      returnPrediction: predictReturnMatch(m, avgOpp, teamAvg, scales),
    };
  });

  return {
    avgOpponentProfile: avgOpp,
    teamAverageProfile: teamAvg,
    scales,
    oppProfiles,
    rankingScale,
    rankedOppProfiles,
    transformationCoefficients: transf,
    setterAttribution: setterAttrib,
    roleComparisons: roles,
    matchAnalyses,
  };
}
