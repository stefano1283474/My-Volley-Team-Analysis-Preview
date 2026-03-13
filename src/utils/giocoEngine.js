// ============================================================================
// GIOCO ENGINE v2 — Capacità di Trasformazione Pesata
//
// PRINCIPI FONDAMENTALI (da SCALE_DESCRIPTIONS + INVERSE_MAP in constants.js):
//
// ─ Input validi ─────────────────────────────────────────────────────────────
//   R3/R4/R5 e D3/D4/D5 SOLTANTO.
//   R2 = "Nessuna azione d'attacco" = abbiamo dato freeball all'avversario.
//   Il token 'a' successivo a un R2 o D2 appartiene ALL'AVVERSARIO che attacca
//   la nostra freeball, NON al nostro team. Includerli è un errore logico.
//
// ─ Il valore A codifica già la risposta difensiva avversaria ─────────────────
//   (INVERSE_MAP.a da constants.js: a → d)
//     A5 → D avversaria = 1  (kill: non l'hanno toccata)
//     A4 → D avversaria = 2  (freeball: non riescono ad attaccare)
//     A3 → D avversaria = 3  (attaccano da bagher)
//     A2 → D avversaria = 4.5 (attaccano da palleggio organizzato)
//     A1 → nostro errore (nessuna difesa avversaria misurabile)
//
// ─ Coefficiente di ponderazione ±25% ─────────────────────────────────────────
//   Per ogni partita:
//     1. avgOppD_effettiva = media dei D impliciti da tutti i nostri A (≠ A1)
//     2. avgOppD_attesa    = funzione dei punti in classifica dell'avversario
//     3. delta             = (effettiva − attesa) / range
//     4. coeff             = 1 + 0.25 × clamp(delta, −1, +1)
//
//   Se l'avversario ha difeso MEGLIO del previsto → coeff > 1 → i nostri A
//   valgono di più (li abbiamo ottenuti contro una difesa superiore alle attese).
//   Se l'avversario ha difeso PEGGIO del previsto → coeff < 1 → i nostri A
//   valgono di meno (l'avversario era più debole del previsto).
//
//   Il valore pesato = attackValue × coeff  (A1 non viene pesato: è sempre errore)
// ============================================================================

import { findOpponentStanding } from './analyticsEngine';
import { TEAM_MAP } from './constants';

// ─── Input validi ─────────────────────────────────────────────────────────────
const INPUT_KEYS           = ['R3', 'R4', 'R5', 'D3', 'D4', 'D5'];
const INPUT_KEYS_RECEPTION = ['R3', 'R4', 'R5'];
const INPUT_KEYS_DEFENSE   = ['D3', 'D4', 'D5'];

// ─── INVERSE_MAP A → D avversaria implicita ──────────────────────────────────
// Fonte: constants.js INVERSE_MAP.a
const A_TO_OPP_D = { 5: 1, 4: 2, 3: 3, 2: 4.5 };
// A1 = nostro errore, non ha D avversaria → assente dalla mappa

// ─── D attesa per l'avversario basata sui punti in classifica ─────────────────
// I punti discriminano meglio del rank in caso di squadre con stessa posizione.
// Mappa lineare: squadra con più punti → attesa difesa più alta (ci difende meglio)
//   punti_max → expectedD = 4.5  (attacco organizzato → le migliori ci difendono bene)
//   punti_min → expectedD = 1.5  (freeball → le peggiori ci danno punti facili)
function computeExpectedOppD(oppPoints, allStandings) {
  if (oppPoints == null || !allStandings?.length) return 2.75; // baseline neutro
  const pts    = allStandings.map(s => s.pts ?? 0);
  const maxPts = Math.max(...pts);
  const minPts = Math.min(...pts);
  if (maxPts === minPts) return 2.75;
  const norm = (oppPoints - minPts) / (maxPts - minPts); // 0=ultima, 1=prima
  return 1.5 + norm * 3.0; // range [1.5, 4.5]
}

// ─── Coefficiente partita ─────────────────────────────────────────────────────
function computeMatchCoefficient(actualAvgOppD, expectedOppD) {
  if (actualAvgOppD == null || expectedOppD == null) return 1.0;
  const range   = 3.0; // distanza massima nella scala D (1.5 ÷ 4.5)
  const delta   = (actualAvgOppD - expectedOppD) / range;
  const clamped = Math.max(-1, Math.min(1, delta));
  return 1.0 + 0.25 * clamped; // [0.75, 1.25]
}

// ─── Record vuoto ────────────────────────────────────────────────────────────
function emptyRecord() {
  return {
    A1: 0, A2: 0, A3: 0, A4: 0, A5: 0,
    total: 0,
    weightedSum: 0,
    rawAvg: 0,
    weightedAvg: 0,
    pctA5: 0,
    pctA4A5: 0,
    pctA1: 0,
  };
}

function makeMatrix() {
  const m = {};
  for (const k of INPUT_KEYS) m[k] = emptyRecord();
  return m;
}

function finalizeRecord(rec) {
  if (!rec || rec.total === 0) return rec || emptyRecord();
  const rawSum = rec.A1 * 1 + rec.A2 * 2 + rec.A3 * 3 + rec.A4 * 4 + rec.A5 * 5;
  rec.rawAvg      = rawSum / rec.total;
  rec.weightedAvg = rec.weightedSum / rec.total;
  rec.pctA5       = rec.A5 / rec.total;
  rec.pctA4A5     = (rec.A4 + rec.A5) / rec.total;
  rec.pctA1       = rec.A1 / rec.total;
  return rec;
}

// ─── Estrazione eventi da UN rally ───────────────────────────────────────────
// Restituisce array di { playerNumber, attackValue, inputFund, inputVal, oppImpliedD }
//
// REGOLA CRITICA: se il primo token 'r' ha value < 3 (R1/R2) in fase 'r',
// o il primo token 'd' ha value < 3 (D1/D2) in fase 'b', la sequenza si
// interrompe — non c'è un nostro attacco successivo.
function extractTransformationEvents(rally) {
  const events = [];
  const q = rally.quartine;
  if (!q || q.length < 2) return events;
  const { phase } = rally;

  if (phase === 'r') {
    for (let i = 0; i < q.length; i++) {
      const curr = q[i];
      if (curr.type !== 'action' || curr.fundamental !== 'r' || !curr.value) continue;

      // R1/R2 = freeball all'avversario: il prossimo 'a' è LORO, non nostro → stop
      if (curr.value < 3) break;

      // R3/R4/R5: cerco il prossimo token 'a' (nostro attacco)
      for (let j = i + 1; j < q.length; j++) {
        const next = q[j];
        if (next.type !== 'action' || next.fundamental !== 'a' || !next.player || !next.value) continue;
        events.push({
          playerNumber: next.player,
          attackValue:  next.value,
          inputFund:    'r',
          inputVal:     curr.value,
          oppImpliedD:  A_TO_OPP_D[next.value] ?? null,
        });
        break;
      }
      break; // solo prima 'r' per rally (convenzione side-out)
    }
  }

  if (phase === 'b') {
    for (let i = 0; i < q.length; i++) {
      const curr = q[i];
      if (curr.type !== 'action' || curr.fundamental !== 'd' || !curr.value) continue;

      // D1/D2 = freeball all'avversario → stop
      if (curr.value < 3) break;

      // D3/D4/D5: cerco il prossimo token 'a' (nostro attacco)
      for (let j = i + 1; j < q.length; j++) {
        const next = q[j];
        if (next.type !== 'action' || next.fundamental !== 'a' || !next.player || !next.value) continue;
        events.push({
          playerNumber: next.player,
          attackValue:  next.value,
          inputFund:    'd',
          inputVal:     curr.value,
          oppImpliedD:  A_TO_OPP_D[next.value] ?? null,
        });
        break;
      }
      break; // solo prima 'd' per rally
    }
  }

  return events;
}

// ─── Analisi principale ───────────────────────────────────────────────────────
export function analyzeAttackerTransformation(allMatches, roster = [], standings = []) {
  if (!allMatches?.length) return null;

  // Costruisco la mappa roster: numero → { name, role }
  const rosterMap = {};
  for (const m of allMatches) {
    for (const p of m.roster || []) {
      if (!rosterMap[p.number]) {
        rosterMap[p.number] = {
          name: p.surname
            ? `${p.surname}${p.name ? ' ' + p.name[0] + '.' : ''}`
            : (p.name || `#${p.number}`),
          role: p.role || '',
        };
      }
    }
  }

  const teamMatrix = makeMatrix();
  const playerData = {};
  const perMatch   = [];

  for (const match of allMatches) {
    const rallies   = match.rallies || [];
    const oppName   = match.metadata?.opponent || '';
    const oppStand  = findOpponentStanding(oppName, standings, TEAM_MAP);
    const oppPoints = oppStand?.pts ?? null;

    // ── Passo 1: estrai tutti gli eventi della partita ─────────────────────
    const matchEvents = [];
    for (const rally of rallies) {
      matchEvents.push(...extractTransformationEvents(rally));
    }

    // ── Passo 2: media D implicita avversaria in questa partita ────────────
    // Usa solo gli attacchi non-errore (A1 = nostro errore, non D avversaria)
    const validForD = matchEvents.filter(e => e.oppImpliedD !== null);
    const actualAvgOppD = validForD.length > 0
      ? validForD.reduce((s, e) => s + e.oppImpliedD, 0) / validForD.length
      : null;

    // ── Passo 3: D attesa per l'avversario ─────────────────────────────────
    const expectedOppD = computeExpectedOppD(oppPoints, standings);

    // ── Passo 4: coefficiente di ponderazione per questa partita ──────────
    const coeff = computeMatchCoefficient(actualAvgOppD, expectedOppD);

    // ── Passo 5: aggrega negli oggetti matrix ──────────────────────────────
    const matchMatrix        = makeMatrix();
    const matchPlayerTouches = {};

    for (const ev of matchEvents) {
      const inputKey = `${ev.inputFund.toUpperCase()}${ev.inputVal}`;
      const aKey     = `A${ev.attackValue}`;
      const pNum     = ev.playerNumber;
      // A1 = errore nostro: il valore non viene pesato (è sempre 1)
      const wVal     = ev.attackValue > 1 ? ev.attackValue * coeff : 1;

      // Team matrix
      if (teamMatrix[inputKey] && aKey in teamMatrix[inputKey]) {
        teamMatrix[inputKey][aKey]++;
        teamMatrix[inputKey].total++;
        teamMatrix[inputKey].weightedSum += wVal;
      }

      // Match matrix
      if (matchMatrix[inputKey] && aKey in matchMatrix[inputKey]) {
        matchMatrix[inputKey][aKey]++;
        matchMatrix[inputKey].total++;
        matchMatrix[inputKey].weightedSum += wVal;
      }

      // Player overall matrix
      if (!playerData[pNum]) {
        playerData[pNum] = {
          number:   pNum,
          name:     rosterMap[pNum]?.name || `#${pNum}`,
          role:     rosterMap[pNum]?.role || '',
          matrix:   makeMatrix(),
          perMatch: [],
        };
      }
      const pm = playerData[pNum].matrix;
      if (pm[inputKey] && aKey in pm[inputKey]) {
        pm[inputKey][aKey]++;
        pm[inputKey].total++;
        pm[inputKey].weightedSum += wVal;
      }

      // Player per-match touches
      if (!matchPlayerTouches[pNum]) matchPlayerTouches[pNum] = {};
      if (!matchPlayerTouches[pNum][inputKey]) matchPlayerTouches[pNum][inputKey] = emptyRecord();
      const mpt = matchPlayerTouches[pNum][inputKey];
      if (aKey in mpt) { mpt[aKey]++; mpt.total++; mpt.weightedSum += wVal; }
    }

    // Finalizza matrice partita
    for (const k of INPUT_KEYS) finalizeRecord(matchMatrix[k]);

    // Salva per-match per ogni player
    for (const [pNum, touches] of Object.entries(matchPlayerTouches)) {
      if (playerData[pNum]) {
        const finalized = {};
        for (const [k, rec] of Object.entries(touches)) finalized[k] = finalizeRecord(rec);
        playerData[pNum].perMatch.push({
          matchId:  match.id,
          opponent: oppName || '?',
          date:     match.metadata?.date || '',
          matrix:   finalized,
          coeff,
        });
      }
    }

    // Riepilogo partita
    const allTotal  = INPUT_KEYS.reduce((s, k) => s + matchMatrix[k].total, 0);
    const allRawSum = INPUT_KEYS.reduce((s, k) => s + matchMatrix[k].rawAvg * matchMatrix[k].total, 0);
    const allWgtSum = INPUT_KEYS.reduce((s, k) => s + matchMatrix[k].weightedAvg * matchMatrix[k].total, 0);

    perMatch.push({
      matchId:       match.id,
      opponent:      oppName || '?',
      date:          match.metadata?.date || '',
      matrix:        matchMatrix,
      rawAvg:        allTotal > 0 ? allRawSum / allTotal : 0,
      weightedAvg:   allTotal > 0 ? allWgtSum / allTotal : 0,
      totalEvents:   allTotal,
      coeff,
      actualAvgOppD,
      expectedOppD,
      oppPoints,
      oppRank:       oppStand?.rank  ?? null,
      oppWins:       oppStand?.w     ?? null,
      oppLosses:     oppStand?.l     ?? null,
    });
  }

  // Finalizza team e player
  for (const k of INPUT_KEYS) finalizeRecord(teamMatrix[k]);
  for (const pData of Object.values(playerData)) {
    for (const k of INPUT_KEYS) finalizeRecord(pData.matrix[k]);
  }

  perMatch.sort((a, b) => a.date.localeCompare(b.date));

  return { teamMatrix, players: playerData, perMatch, rosterMap };
}

// ─── Scala -5/+5 (basata su weightedAvg per partita) ─────────────────────────
export function computeTransformationScale(transformationData) {
  if (!transformationData?.perMatch) return {};
  const scale = {};
  for (const inputKey of INPUT_KEYS) {
    const vals = transformationData.perMatch
      .map(pm => pm.matrix[inputKey])
      .filter(rec => rec && rec.total >= 2)
      .map(rec => rec.weightedAvg);
    if (vals.length < 2) { scale[inputKey] = { valid: false }; continue; }
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const step   = (maxVal - minVal) / 10;
    const zero   = minVal + 5 * step;
    scale[inputKey] = { min: minVal, max: maxVal, step, zero, valid: step > 0 };
  }
  return scale;
}

export function valueToScale(value, scaleEntry) {
  if (!scaleEntry?.valid) return null;
  const { zero, step } = scaleEntry;
  if (step === 0) return 0;
  return Math.max(-5, Math.min(5, (value - zero) / step));
}

// ─── Posizioni scala per player ───────────────────────────────────────────────
export function computePlayerScalePositions(transformationData, scale) {
  if (!transformationData?.players || !scale) return {};
  const result = {};
  for (const [pNum, pData] of Object.entries(transformationData.players)) {
    result[pNum] = { number: pNum, name: pData.name, role: pData.role, positions: {} };
    for (const inputKey of INPUT_KEYS) {
      const rec = pData.matrix[inputKey];
      if (!rec || rec.total < 2) {
        result[pNum].positions[inputKey] = { rawAvg: null, weightedAvg: null, scalePos: null, total: rec?.total || 0 };
        continue;
      }
      result[pNum].positions[inputKey] = {
        rawAvg:      rec.rawAvg,
        weightedAvg: rec.weightedAvg,
        scalePos:    valueToScale(rec.weightedAvg, scale[inputKey]),
        total:       rec.total,
        pctA5:       rec.pctA5,
        pctA4A5:     rec.pctA4A5,
        pctA1:       rec.pctA1,
      };
    }
    // Scala overall pesata
    let wSum = 0, wTot = 0;
    for (const inputKey of INPUT_KEYS) {
      const pos = result[pNum].positions[inputKey];
      if (pos.scalePos !== null && pos.total > 0) {
        wSum += pos.scalePos * pos.total;
        wTot += pos.total;
      }
    }
    result[pNum].overallScalePos = wTot > 0 ? wSum / wTot : null;
    result[pNum].totalAttacks    = wTot;
  }
  return result;
}

// ─── Contesto difesa avversaria (ora coerente con engine principale) ──────────
// Usa gli stessi eventi e la stessa logica del motore principale.
export function analyzeOpponentDefenseContext(allMatches, standings = []) {
  if (!allMatches?.length) return null;

  const perMatch           = [];
  const allImpliedDValues  = [];

  for (const match of allMatches) {
    const oppName   = match.metadata?.opponent || '';
    const oppStand  = findOpponentStanding(oppName, standings, TEAM_MAP);
    const oppPoints = oppStand?.pts ?? null;

    const events    = [];
    for (const rally of match.rallies || []) {
      events.push(...extractTransformationEvents(rally));
    }

    const impliedDs = events
      .filter(e => e.oppImpliedD !== null)
      .map(e => e.oppImpliedD);

    allImpliedDValues.push(...impliedDs);

    const total        = impliedDs.length;
    const avgImpliedD  = total > 0 ? impliedDs.reduce((s, v) => s + v, 0) / total : null;

    // Distribuzione per valore A (non D, poiché leggiamo A dal dataset)
    const distrib = { A1: 0, A2: 0, A3: 0, A4: 0, A5: 0 };
    for (const ev of events) distrib[`A${ev.attackValue}`] = (distrib[`A${ev.attackValue}`] || 0) + 1;

    const killRate    = events.length > 0 ? (distrib.A5 || 0) / events.length : 0;
    const freeballRate = events.length > 0 ? (distrib.A4 || 0) / events.length : 0;
    const expectedOppD = computeExpectedOppD(oppPoints, standings);

    perMatch.push({
      matchId:      match.id,
      opponent:     oppName || '?',
      date:         match.metadata?.date || '',
      avgImpliedD,
      expectedOppD,
      killRate,
      freeballRate,
      distrib,
      total:        events.length,
      oppRank:      oppStand?.rank   ?? null,
      oppPoints,
      oppWins:      oppStand?.w      ?? null,
      oppLosses:    oppStand?.l      ?? null,
    });
  }

  const leagueBenchmarkD = allImpliedDValues.length > 0
    ? allImpliedDValues.reduce((s, v) => s + v, 0) / allImpliedDValues.length
    : null;

  for (const pm of perMatch) {
    if (pm.avgImpliedD !== null && leagueBenchmarkD !== null) {
      pm.deltaVsBenchmark = pm.avgImpliedD - leagueBenchmarkD;
    } else {
      pm.deltaVsBenchmark = null;
    }
    if (pm.avgImpliedD !== null && pm.expectedOppD !== null) {
      pm.deltaVsExpected = pm.avgImpliedD - pm.expectedOppD;
      // delta > 0: avversario ha difeso meglio del previsto (per noi è peggio)
      // delta < 0: avversario ha difeso peggio del previsto (per noi è meglio)
    } else {
      pm.deltaVsExpected = null;
    }
    // Coefficiente della partita
    const range = 3.0;
    const delta = pm.deltaVsExpected != null ? pm.deltaVsExpected / range : 0;
    pm.coeff = 1.0 + 0.25 * Math.max(-1, Math.min(1, delta));
  }

  perMatch.sort((a, b) => a.date.localeCompare(b.date));

  return {
    perMatch,
    leagueBenchmarkD,
    totalAttacks: allImpliedDValues.length,
  };
}

// ─── Riepilogo KPI ────────────────────────────────────────────────────────────
export function computeTransformationSummary(transformationData) {
  if (!transformationData?.teamMatrix) return null;
  const tm = transformationData.teamMatrix;

  const recTotal  = INPUT_KEYS_RECEPTION.reduce((s, k) => s + tm[k].total, 0);
  const recRawW   = INPUT_KEYS_RECEPTION.reduce((s, k) => s + tm[k].rawAvg * tm[k].total, 0);
  const recWgtW   = INPUT_KEYS_RECEPTION.reduce((s, k) => s + tm[k].weightedAvg * tm[k].total, 0);
  const defTotal  = INPUT_KEYS_DEFENSE.reduce((s, k) => s + tm[k].total, 0);
  const defRawW   = INPUT_KEYS_DEFENSE.reduce((s, k) => s + tm[k].rawAvg * tm[k].total, 0);
  const defWgtW   = INPUT_KEYS_DEFENSE.reduce((s, k) => s + tm[k].weightedAvg * tm[k].total, 0);

  const entries = INPUT_KEYS
    .map(k => ({ key: k, rawAvg: tm[k].rawAvg, weightedAvg: tm[k].weightedAvg, pctA5: tm[k].pctA5, total: tm[k].total }))
    .filter(e => e.total >= 2)
    .sort((a, b) => b.weightedAvg - a.weightedAvg);

  return {
    recRawAvg:      recTotal > 0 ? recRawW / recTotal : 0,
    recWeightedAvg: recTotal > 0 ? recWgtW / recTotal : 0,
    recTotal,
    defRawAvg:      defTotal > 0 ? defRawW / defTotal : 0,
    defWeightedAvg: defTotal > 0 ? defWgtW / defTotal : 0,
    defTotal,
    totalAttacks:   recTotal + defTotal,
    bestConversion:  entries[0]  || null,
    worstConversion: entries[entries.length - 1] || null,
    entries,
  };
}

// ─── Esportazioni ─────────────────────────────────────────────────────────────
export const INPUT_KEYS_ALL  = INPUT_KEYS;
export const INPUT_RECEPTION = INPUT_KEYS_RECEPTION;
export const INPUT_DEFENSE   = INPUT_KEYS_DEFENSE;

export function inputKeyLabel(k) {
  const labels = {
    R3: 'R3 — Attacco da bagher',
    R4: 'R4 — Soluzioni limitate',
    R5: 'R5 — Tutte le soluzioni',
    D3: 'D3 — Attacco da bagher',
    D4: 'D4 — Buona difesa',
    D5: 'D5 — Difesa perfetta',
  };
  return labels[k] || k;
}

export function attackValLabel(v) {
  const labels = {
    1: 'A1 — Errore',
    2: 'A2 — Avv. attacca (palleggio)',
    3: 'A3 — Avv. attacca (bagher)',
    4: 'A4 — Freeball avversario',
    5: 'A5 — Punto diretto (kill)',
  };
  return labels[v] || `A${v}`;
}

export function attackValColor(val) {
  const c = { 1: '#ef4444', 2: '#f97316', 3: '#eab308', 4: '#84cc16', 5: '#22c55e' };
  return c[val] || '#6b7280';
}

export function coeffColor(coeff) {
  if (coeff >= 1.15) return '#22c55e';
  if (coeff >= 1.05) return '#84cc16';
  if (coeff >= 0.95) return '#eab308';
  if (coeff >= 0.85) return '#f97316';
  return '#ef4444';
}

export function scaleColor(scalePos) {
  if (scalePos === null || scalePos === undefined) return '#6b7280';
  if (scalePos >= 3)  return '#22c55e';
  if (scalePos >= 1)  return '#84cc16';
  if (scalePos >= -1) return '#eab308';
  if (scalePos >= -3) return '#f97316';
  return '#ef4444';
}

export function scaleLabel(v) {
  if (v === null || v === undefined) return '—';
  const s = Math.abs(v).toFixed(1);
  return v > 0 ? `+${s}` : v < 0 ? `-${s}` : '0.0';
}
