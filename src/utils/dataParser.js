// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Data Parser
// Parses .xlsm/.xlsx match files and .csv calendar/standings
// ============================================================================

import * as XLSX from 'xlsx';
import * as PapaRaw from 'papaparse';
const Papa = PapaRaw.default ?? PapaRaw;
import { OUR_TEAM, TEAM_MAP, TEAM_MAP_REVERSE } from './constants';

// ─── CSV Calendar Parser ───────────────────────────────────────────────────
export function parseCalendarCSV(csvText) {
  const parsed = Papa.parse(csvText, {
    delimiter: ';',
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const matches = parsed.data
    .filter(row => row.OSPITANTE && row.OSPITE)
    .map(row => {
      const setsHome = parseInt(row.SET1) || 0;
      const setsAway = parseInt(row.SET2) || 0;
      const sets = [];
      for (let i = 1; i <= 5; i++) {
        const p1 = parseInt(row[`PNT1_${i}`]) || 0;
        const p2 = parseInt(row[`PNT2_${i}`]) || 0;
        if (p1 > 0 || p2 > 0) {
          sets.push({ home: p1, away: p2 });
        }
      }
      return {
        giornata: parseInt(row.GIORNATA) || 0,
        data: row.DATA || '',
        ora: row.ORA || '',
        home: row.OSPITANTE.trim(),
        away: row.OSPITE.trim(),
        setsHome,
        setsAway,
        sets,
        played: setsHome > 0 || setsAway > 0,
        venue: row.DENOMINAZIONE || '',
      };
    });

  return matches;
}

// ─── Standings Calculator from CSV ─────────────────────────────────────────
export function computeStandings(calendarMatches) {
  const teams = {};

  calendarMatches.filter(m => m.played).forEach(m => {
    if (!teams[m.home]) teams[m.home] = { name: m.home, pts: 0, w: 0, l: 0, sw: 0, sl: 0, pw: 0, pl: 0, matches: 0 };
    if (!teams[m.away]) teams[m.away] = { name: m.away, pts: 0, w: 0, l: 0, sw: 0, sl: 0, pw: 0, pl: 0, matches: 0 };

    const h = teams[m.home];
    const a = teams[m.away];

    h.matches++; a.matches++;
    h.sw += m.setsHome; h.sl += m.setsAway;
    a.sw += m.setsAway; a.sl += m.setsHome;

    m.sets.forEach(s => {
      h.pw += s.home; h.pl += s.away;
      a.pw += s.away; a.pl += s.home;
    });

    const homeWin = m.setsHome > m.setsAway;
    if (homeWin) {
      h.w++; a.l++;
      h.pts += (m.setsHome === 3 && m.setsAway <= 1) ? 3 : 2;
      a.pts += (m.setsAway === 2) ? 1 : 0;
    } else {
      a.w++; h.l++;
      a.pts += (m.setsAway === 3 && m.setsHome <= 1) ? 3 : 2;
      h.pts += (m.setsHome === 2) ? 1 : 0;
    }
  });

  const sorted = Object.values(teams).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const aRatio = a.sl > 0 ? a.sw / a.sl : a.sw;
    const bRatio = b.sl > 0 ? b.sw / b.sl : b.sw;
    if (bRatio !== aRatio) return bRatio - aRatio;
    const aPR = a.pl > 0 ? a.pw / a.pl : a.pw;
    const bPR = b.pl > 0 ? b.pw / b.pl : b.pw;
    return bPR - aPR;
  });

  return sorted.map((t, i) => ({ ...t, rank: i + 1 }));
}

// ─── XLSM/XLSX Match File Parser ───────────────────────────────────────────
export function parseMatchFile(buffer, fileName) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  const roster     = parseRoster(wb);
  let riepilogo    = parseRiepilogo(wb);
  let gioco        = parseGioco(wb);
  let giriDiRice   = parseGiriDiRice(wb);
  let rallies      = parseAllRallies(wb);

  // Se mancano i fogli formula (es. file .xlsx senza Riepilogo/Gioco/Giri di Rice),
  // calcola le statistiche a partire dai dati grezzi nei fogli Set.
  const needsStatsCompute = !riepilogo || !gioco || !giriDiRice;
  const needsRallyFix = !needsStatsCompute && rallies.length > 0 &&
                        rallies.every(r => !r.isPoint && !r.isError && r.rotation === 0);

  if (needsStatsCompute || needsRallyFix) {
    try {
      const actionsBySet = buildActionsBySet(wb);
      const hasEntries = Object.keys(actionsBySet).some(k =>
        actionsBySet[k] && actionsBySet[k].length > 0
      );
      if (hasEntries) {
        const computed = computeStatsFromActionsBySet(actionsBySet, roster);
        if (needsStatsCompute) {
          if (!riepilogo  && computed.riepilogo)   riepilogo  = computed.riepilogo;
          if (!gioco      && computed.gioco)        gioco      = computed.gioco;
          if (!giriDiRice && computed.giriDiRice)   giriDiRice = computed.giriDiRice;
        }
        if (computed.rallies && computed.rallies.length > 0) {
          rallies = computed.rallies;
        }
      }
    } catch (computeErr) {
      console.warn('[dataParser] Errore nel calcolo statistiche da dati grezzi:', computeErr);
    }
  }

  const match = {
    id: crypto.randomUUID(),
    fileName,
    metadata: parseMetadata(wb),
    roster,
    sets: parseSets(wb),
    riepilogo,
    gioco,
    giriDiRice,
    rallies,
  };

  return match;
}

// ─── Parse metadata from 'El. Gioc.' sheet ─────────────────────────────────
function parseMetadata(wb) {
  const ws = wb.Sheets['El. Gioc.'];
  if (!ws) return {};

  const teamName = getCellValue(ws, 'C1') || '';
  const opponent = getCellValue(ws, 'D20') || '';
  const dateRaw = getCellValue(ws, 'D21');
  const matchType = getCellValue(ws, 'D22') || '';
  const homeAway = getCellValue(ws, 'D23') || '';
  const phase = getCellValue(ws, 'D24') || '';

  let date = '';
  if (dateRaw instanceof Date) {
    date = dateRaw.toISOString().split('T')[0]; // YYYY-MM-DD
  } else if (typeof dateRaw === 'string') {
    const raw = dateRaw.trim();
    // Normalize DD/MM/YYYY → YYYY-MM-DD for correct chronological sorting
    const dmyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) {
      date = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    } else {
      date = raw;
    }
  }

  return { teamName, opponent, date, matchType, homeAway, phase };
}

// ─── Parse roster from 'El. Gioc.' sheet ───────────────────────────────────
function parseRoster(wb) {
  const ws = wb.Sheets['El. Gioc.'];
  if (!ws) return [];

  const players = [];
  for (let row = 3; row <= 16; row++) {
    const num = getCellValue(ws, `B${row}`);
    const surname = getCellValue(ws, `C${row}`);
    const name = getCellValue(ws, `D${row}`);
    const nickname = getCellValue(ws, `E${row}`);
    const role = getCellValue(ws, `F${row}`);

    if (num && surname && String(surname).trim()) {
      players.push({
        number: String(num).padStart(2, '0'),
        surname: String(surname).trim(),
        name: String(name || '').trim(),
        nickname: String(nickname || '').trim(),
        role: String(role || '').trim(),
        fullName: `${String(surname).trim()} ${String(name || '').trim()}`.trim(),
      });
    }
  }
  return players;
}

// ─── Parse set scores ──────────────────────────────────────────────────────
function parseSets(wb) {
  const sets = [];
  for (let s = 1; s <= 5; s++) {
    const sheetName = `Set ${s}`;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const ourScore = getCellValue(ws, 'C12');
    const theirScore = getCellValue(ws, 'E12');

    // Starting rotations per set: A6 = opponent, A7 = our team
    const oppStartRotRaw = getCellValue(ws, 'A6');
    const ourStartRotRaw = getCellValue(ws, 'A7');
    const oppStartRotation = oppStartRotRaw ? (Number(oppStartRotRaw) || null) : null;
    const ourStartRotation = ourStartRotRaw ? (Number(ourStartRotRaw) || null) : null;

    if (ourScore && Number(ourScore) > 0) {
      sets.push({
        number: s,
        ourScore: Number(ourScore),
        theirScore: Number(theirScore) || 0,
        margin: Number(ourScore) - (Number(theirScore) || 0),
        won: Number(ourScore) > (Number(theirScore) || 0),
        oppStartRotation: (oppStartRotation >= 1 && oppStartRotation <= 6) ? oppStartRotation : null,
        ourStartRotation: (ourStartRotation >= 1 && ourStartRotation <= 6) ? ourStartRotation : null,
      });
    }
  }
  return sets;
}

// ─── Parse Riepilogo (match summary) sheet ─────────────────────────────────
function parseRiepilogo(wb) {
  const ws = wb.Sheets['Riepilogo'];
  if (!ws) return null;

  // Parse player stats: rows 8-21
  const playerStats = [];
  for (let row = 8; row <= 21; row++) {
    const num = getCellValue(ws, `A${row}`);
    const name = getCellValue(ws, `B${row}`);
    if (!num || !name || name === '--') continue;

    const player = {
      number: String(num).padStart(2, '0'),
      name: String(name).trim(),
      attack: {
        kill: n(getCellValue(ws, `C${row}`)),
        pos: n(getCellValue(ws, `D${row}`)),
        exc: n(getCellValue(ws, `E${row}`)),
        neg: n(getCellValue(ws, `F${row}`)),
        err: n(getCellValue(ws, `G${row}`)),
        tot: n(getCellValue(ws, `H${row}`)),
        pct: n(getCellValue(ws, `I${row}`)),
        efficacy: n(getCellValue(ws, `J${row}`)),
        efficiency: n(getCellValue(ws, `K${row}`)),
      },
      serve: {
        kill: n(getCellValue(ws, `M${row}`)),
        pos: n(getCellValue(ws, `N${row}`)),
        exc: n(getCellValue(ws, `O${row}`)),
        neg: n(getCellValue(ws, `P${row}`)),
        err: n(getCellValue(ws, `Q${row}`)),
        tot: n(getCellValue(ws, `R${row}`)),
        pct: n(getCellValue(ws, `S${row}`)),
        efficacy: n(getCellValue(ws, `T${row}`)),
        efficiency: n(getCellValue(ws, `U${row}`)),
      },
      block: {
        kill: n(getCellValue(ws, `W${row}`)),
        pos: n(getCellValue(ws, `X${row}`)),
        exc: n(getCellValue(ws, `Y${row}`)),
        neg: n(getCellValue(ws, `Z${row}`)),
        err: n(getCellValue(ws, `AA${row}`)),
        efficacy: n(getCellValue(ws, `AB${row}`)),
        efficiency: n(getCellValue(ws, `AC${row}`)),
      },
      points: {
        made: n(getCellValue(ws, `AE${row}`)),
        madePct: n(getCellValue(ws, `AF${row}`)),
        errors: n(getCellValue(ws, `AG${row}`)),
        errorsPct: n(getCellValue(ws, `AH${row}`)),
        balance: n(getCellValue(ws, `AI${row}`)),
      },
    };
    playerStats.push(player);
  }

  // Team totals: row 22
  const teamAttack = {
    kill: n(getCellValue(ws, 'C22')), pos: n(getCellValue(ws, 'D22')),
    exc: n(getCellValue(ws, 'E22')), neg: n(getCellValue(ws, 'F22')),
    err: n(getCellValue(ws, 'G22')), tot: n(getCellValue(ws, 'H22')),
    efficacy: n(getCellValue(ws, 'J22')), efficiency: n(getCellValue(ws, 'K22')),
  };
  const teamServe = {
    kill: n(getCellValue(ws, 'M22')), pos: n(getCellValue(ws, 'N22')),
    exc: n(getCellValue(ws, 'O22')), neg: n(getCellValue(ws, 'P22')),
    err: n(getCellValue(ws, 'Q22')), tot: n(getCellValue(ws, 'R22')),
    efficacy: n(getCellValue(ws, 'T22')), efficiency: n(getCellValue(ws, 'U22')),
  };
  const teamBlock = {
    kill: n(getCellValue(ws, 'W22')), pos: n(getCellValue(ws, 'X22')),
    exc: n(getCellValue(ws, 'Y22')), neg: n(getCellValue(ws, 'Z22')),
    err: n(getCellValue(ws, 'AA22')),
    efficacy: n(getCellValue(ws, 'AB22')), efficiency: n(getCellValue(ws, 'AC22')),
  };

  // Opponent totals: row 24
  const oppAttack = {
    kill: n(getCellValue(ws, 'C24')), pos: n(getCellValue(ws, 'D24')),
    exc: n(getCellValue(ws, 'E24')), neg: n(getCellValue(ws, 'F24')),
    err: n(getCellValue(ws, 'G24')), tot: n(getCellValue(ws, 'H24')),
    efficacy: n(getCellValue(ws, 'J24')), efficiency: n(getCellValue(ws, 'K24')),
  };
  const oppServe = {
    kill: n(getCellValue(ws, 'M24')), pos: n(getCellValue(ws, 'N24')),
    exc: n(getCellValue(ws, 'O24')), neg: n(getCellValue(ws, 'P24')),
    err: n(getCellValue(ws, 'Q24')), tot: n(getCellValue(ws, 'R24')),
    efficacy: n(getCellValue(ws, 'T24')), efficiency: n(getCellValue(ws, 'U24')),
  };

  // Reception & Defense: rows 29-42
  const playerReception = [];
  const playerDefense = [];
  for (let row = 29; row <= 42; row++) {
    const num = getCellValue(ws, `A${row}`);
    const name = getCellValue(ws, `B${row}`);
    if (!num || !name || name === '--') continue;

    playerReception.push({
      number: String(num).padStart(2, '0'),
      name: String(name).trim(),
      kill: n(getCellValue(ws, `C${row}`)),
      pos: n(getCellValue(ws, `D${row}`)),
      exc: n(getCellValue(ws, `E${row}`)),
      neg: n(getCellValue(ws, `F${row}`)),
      err: n(getCellValue(ws, `G${row}`)),
      tot: n(getCellValue(ws, `H${row}`)),
      pct: n(getCellValue(ws, `I${row}`)),
      efficacy: n(getCellValue(ws, `J${row}`)),
      efficiency: n(getCellValue(ws, `K${row}`)),
    });

    playerDefense.push({
      number: String(num).padStart(2, '0'),
      name: String(name).trim(),
      kill: n(getCellValue(ws, `M${row}`)),
      pos: n(getCellValue(ws, `N${row}`)),
      exc: n(getCellValue(ws, `O${row}`)),
      neg: n(getCellValue(ws, `P${row}`)),
      err: n(getCellValue(ws, `Q${row}`)),
      tot: n(getCellValue(ws, `R${row}`)),
      pct: n(getCellValue(ws, `S${row}`)),
      efficacy: n(getCellValue(ws, `T${row}`)),
      efficiency: n(getCellValue(ws, `U${row}`)),
    });
  }

  // Team reception/defense totals: row 43
  const teamReception = {
    kill: n(getCellValue(ws, 'C43')), pos: n(getCellValue(ws, 'D43')),
    exc: n(getCellValue(ws, 'E43')), neg: n(getCellValue(ws, 'F43')),
    err: n(getCellValue(ws, 'G43')), tot: n(getCellValue(ws, 'H43')),
    efficacy: n(getCellValue(ws, 'J43')), efficiency: n(getCellValue(ws, 'K43')),
  };
  const teamDefense = {
    kill: n(getCellValue(ws, 'M43')), pos: n(getCellValue(ws, 'N43')),
    exc: n(getCellValue(ws, 'O43')), neg: n(getCellValue(ws, 'P43')),
    err: n(getCellValue(ws, 'Q43')), tot: n(getCellValue(ws, 'R43')),
    efficacy: n(getCellValue(ws, 'T43')), efficiency: n(getCellValue(ws, 'U43')),
  };

  // Opponent reception/defense: row 47
  const oppReception = {
    pos: n(getCellValue(ws, 'D47')), exc: n(getCellValue(ws, 'E47')),
    neg: n(getCellValue(ws, 'F47')), err: n(getCellValue(ws, 'G47')),
    tot: n(getCellValue(ws, 'H47')),
    efficacy: n(getCellValue(ws, 'J47')), efficiency: n(getCellValue(ws, 'K47')),
  };
  const oppDefense = {
    pos: n(getCellValue(ws, 'N47')), exc: n(getCellValue(ws, 'O47')),
    neg: n(getCellValue(ws, 'P47')), err: n(getCellValue(ws, 'Q47')),
    tot: n(getCellValue(ws, 'R47')),
    efficacy: n(getCellValue(ws, 'T47')), efficiency: n(getCellValue(ws, 'U47')),
  };

  // Points summary: row 28-29 area
  const totalPointsMade = n(getCellValue(ws, 'AH28')) || 0;
  const totalErrors = n(getCellValue(ws, 'AJ28')) || 0;

  // Rotation analysis: rows 51-56
  const rotations = [];
  for (let row = 51; row <= 56; row++) {
    const rotNum = n(getCellValue(ws, `AG${row}`));
    const lineup = getCellValue(ws, `AH${row}`) || '';
    const totPts = getCellValue(ws, `AD${row}`);
    const ptsMade = getCellValue(ws, `AE${row}`);
    const ptsLost = getCellValue(ws, `AF${row}`);

    if (rotNum) {
      rotations.push({
        rotation: rotNum,
        lineup: String(lineup).trim(),
        totalPoints: parsePointString(totPts),
        pointsMade: parsePointString(ptsMade),
        pointsLost: parsePointString(ptsLost),
      });
    }
  }

  return {
    playerStats,
    playerReception,
    playerDefense,
    team: { attack: teamAttack, serve: teamServe, block: teamBlock, reception: teamReception, defense: teamDefense },
    opponent: { attack: oppAttack, serve: oppServe, reception: oppReception, defense: oppDefense },
    rotations,
    totalPointsMade,
    totalErrors,
  };
}

// ─── Parse Gioco (game analysis) sheet ─────────────────────────────────────
function parseGioco(wb) {
  const ws = wb.Sheets['Gioco'];
  if (!ws) return null;

  // Overall stats by fundamental: rows 3-4
  const overview = {};
  const fundOrder = ['attack', 'serve', 'reception', 'defense'];
  const colPairs = [[5, 6], [9, 10], [13, 14], [17, 18]];

  for (let i = 0; i < 4; i++) {
    const posStr = getCellValue(ws, cellRef(colPairs[i][0], 3));
    const negStr = getCellValue(ws, cellRef(colPairs[i][0], 4));
    overview[fundOrder[i]] = {
      posRatio: parseRatioString(posStr),
      negRatio: parseRatioString(negStr),
      posPct: n(getCellValue(ws, cellRef(colPairs[i][1], 3))),
      negPct: n(getCellValue(ws, cellRef(colPairs[i][1], 4))),
    };
  }

  // Per-rotation stats: rows 5-16
  const rotationStats = [];
  for (let r = 0; r < 6; r++) {
    const posRow = 5 + r * 2;
    const negRow = 6 + r * 2;
    const rotNum = n(getCellValue(ws, `B${posRow}`));

    const rot = { rotation: rotNum, fundamentals: {} };
    for (let i = 0; i < 4; i++) {
      const posStr = getCellValue(ws, cellRef(colPairs[i][0], posRow));
      const negStr = getCellValue(ws, cellRef(colPairs[i][0], negRow));
      rot.fundamentals[fundOrder[i]] = {
        posRatio: parseRatioString(posStr),
        negRatio: parseRatioString(negStr),
        posPct: n(getCellValue(ws, cellRef(colPairs[i][1], posRow))),
        negPct: n(getCellValue(ws, cellRef(colPairs[i][1], negRow))),
      };
    }
    rotationStats.push(rot);
  }

  // Attack from reception distribution: rows 45-51 (R5, R4, R3 columns)
  const attackFromReception = {
    R5: parseAttackDistribution(ws, 2, 3, 4, [45, 50]),
    R4: parseAttackDistribution(ws, 5, 6, 7, [45, 50]),
    R3: parseAttackDistribution(ws, 8, 9, 10, [45, 50]),
  };

  // Attack from defense distribution: rows 55-60 (D5, D4, D3 columns)
  const attackFromDefense = {
    D5: parseAttackDistribution(ws, 2, 3, 4, [54, 60]),
    D4: parseAttackDistribution(ws, 5, 6, 7, [54, 60]),
    D3: parseAttackDistribution(ws, 8, 9, 10, [54, 60]),
  };

  // Reception distribution by rotation: rows 45-51, cols 20-26
  const receptionByRotation = [];
  for (let row = 45; row <= 50; row++) {
    const rotLabel = getCellValue(ws, `T${row}`);
    if (rotLabel && String(rotLabel).startsWith('P')) {
      receptionByRotation.push({
        rotation: String(rotLabel),
        R5: n(getCellValue(ws, `U${row}`)),
        R4: n(getCellValue(ws, `V${row}`)),
        R3: n(getCellValue(ws, `W${row}`)),
        R2: n(getCellValue(ws, `X${row}`)),
        R1: n(getCellValue(ws, `Y${row}`)),
        total: n(getCellValue(ws, `Z${row}`)),
      });
    }
  }

  return { overview, rotationStats, attackFromReception, attackFromDefense, receptionByRotation };
}

// ─── Parse Giri di Rice (rotation flow) sheet ───────────────────────────────
// Contains serve rotation stats (SP1-SP6) and receive rotation stats (RP1-RP6)
// plus the matchup pairs (our serve rotation ↔ opponent receive rotation)
function parseGiriDiRice(wb) {
  const ws = wb.Sheets['Giri di Rice'];
  if (!ws) return null;

  // Serve rotation stats: rows 4-9 (SP1-SP6)
  // Columns: B=B(break), C=A(attack), D=M(muro), E=Err, F=total, G=label, I=oppRotation
  const serveRotations = [];
  for (let row = 4; row <= 9; row++) {
    const label = getCellValue(ws, `G${row}`);
    if (!label || !String(label).startsWith('SP')) continue;
    const rotNum = parseInt(String(label).replace('SP', ''));
    const oppLabel = getCellValue(ws, `I${row}`);
    const oppRot = oppLabel ? parseInt(String(oppLabel).replace('RP', '')) : null;
    serveRotations.push({
      rotation: rotNum,
      breakPts: n(getCellValue(ws, `B${row}`)),
      attackPts: n(getCellValue(ws, `C${row}`)),
      blockPts: n(getCellValue(ws, `D${row}`)),
      errors: n(getCellValue(ws, `E${row}`)),
      total: n(getCellValue(ws, `F${row}`)),
      oppReceiveRotation: (oppRot >= 1 && oppRot <= 6) ? oppRot : null,
    });
  }

  // Receive rotation stats: rows 13-18 (RP1-RP6)
  // Columns: B=A(attack), C=M(muro), D=AvvS(opp serve err), E=AvvG, F=total, G=label, I=oppRotation
  const receiveRotations = [];
  for (let row = 13; row <= 18; row++) {
    const label = getCellValue(ws, `G${row}`);
    if (!label || !String(label).startsWith('RP')) continue;
    const rotNum = parseInt(String(label).replace('RP', ''));
    const oppLabel = getCellValue(ws, `I${row}`);
    const oppRot = oppLabel ? parseInt(String(oppLabel).replace('SP', '')) : null;
    receiveRotations.push({
      rotation: rotNum,
      attackPts: n(getCellValue(ws, `B${row}`)),
      blockPts: n(getCellValue(ws, `C${row}`)),
      oppServeErrors: n(getCellValue(ws, `D${row}`)),
      oppGiftPts: n(getCellValue(ws, `E${row}`)),
      total: n(getCellValue(ws, `F${row}`)),
      oppServeRotation: (oppRot >= 1 && oppRot <= 6) ? oppRot : null,
    });
  }

  return { serveRotations, receiveRotations };
}

// ─── Parse rally sequences from Set sheets ─────────────────────────────────
function parseAllRallies(wb) {
  const allRallies = [];

  for (let s = 1; s <= 5; s++) {
    const sheetName = `Set ${s}`;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // Check if set was played
    const score = getCellValue(ws, 'C12');
    if (!score || Number(score) === 0) continue;

    for (let row = 18; row <= 600; row++) {
      const actionStr = getCellValue(ws, `B${row}`);
      if (!actionStr || String(actionStr).trim() === '' || String(actionStr) === '0') continue;
      
      const strVal = String(actionStr).trim();
      if (strVal.length < 2) continue;

      // Parse the row data
      const ourScore = n(getCellValue(ws, `C${row}`));
      const theirScore = n(getCellValue(ws, `E${row}`));
      const pointDesc = getCellValue(ws, `G${row}`) || '';
      const errorDesc = getCellValue(ws, `H${row}`) || '';
      const rotation = n(getCellValue(ws, `O${row}`));
      const phase = getCellValue(ws, `N${row}`) || ''; // r=ricezione, b=battuta
      const server = getCellValue(ws, `R${row}`) || '';
      const receptionLine = getCellValue(ws, `S${row}`) || '';
      const attackLine = getCellValue(ws, `V${row}`) || '';
      const riceVal = getCellValue(ws, `W${row}`) || '';
      const attackRole = getCellValue(ws, `AC${row}`) || '';
      const distr1P = getCellValue(ws, `Y${row}`) || '';
      const ptRot = n(getCellValue(ws, `T${row}`));
      const erRot = n(getCellValue(ws, `U${row}`));

      // Parse quartine from action string
      const quartine = parseQuartine(strVal);

      const rally = {
        set: s,
        row,
        actionString: strVal,
        quartine,
        ourScore,
        theirScore,
        pointDesc: String(pointDesc).trim(),
        errorDesc: String(errorDesc).trim(),
        isPoint: ptRot === 1,
        isError: erRot === 1,
        rotation,
        phase, // 'r' = side-out (receiving), 'b' = break point (serving)
        server: String(server).trim(),
        receptionLine: String(receptionLine).trim(),
        attackLine: String(attackLine).trim(),
        riceVal: String(riceVal).trim(),
        attackRole: String(attackRole).trim(),
        distr1P: String(distr1P).trim(),
      };

      allRallies.push(rally);
    }
  }

  return allRallies;
}

// ─── Parse quartine string into structured actions ─────────────────────────
function parseQuartine(str) {
  if (!str) return [];

  const tokens = str.split(/\s+/).filter(t => t.length > 0);
  const actions = [];

  for (const token of tokens) {
    if (token.toLowerCase() === 'avv') {
      actions.push({ type: 'opponent_error', player: null, fundamental: null, value: null, raw: token });
      continue;
    }

    // Parse: [number][fundamental_letter][value]
    // e.g., "15r4" → player 15, ricezione, value 4
    // e.g., "03a5" → player 03, attacco, value 5
    const match = token.match(/^(\d{2})([abrdm])(\d)$/i);
    if (match) {
      actions.push({
        type: 'action',
        player: match[1],
        fundamental: match[2].toLowerCase(),
        value: parseInt(match[3]),
        raw: token,
      });
    }
  }

  return actions;
}

// ─── Fallback stats computation for .xlsx files (no formula sheets) ────────
// Determines rally outcome from parsed quartine tokens.
function determineOutcomeFromQuartine(quartine) {
  if (!quartine || !quartine.length) return 'continue';
  const last = quartine[quartine.length - 1];
  if (last.type === 'opponent_error') return 'home_point';
  if (last.value === 5) return 'home_point';
  if (last.value === 1) return 'away_point';
  return 'continue';
}

// Builds actionsBySet from raw Set-sheet column B strings, computing
// rotation, phase, and outcome algorithmically (mirrors xlsm-full-parser.js).
function buildActionsBySet(wb) {
  const actionsBySet = {};
  for (let s = 1; s <= 6; s++) {
    const ws = wb.Sheets['Set ' + s];
    if (!ws) continue;
    const finalScore = getCellValue(ws, 'C12');
    if (!finalScore || Number(finalScore) === 0) continue;
    const ourStartRot = Math.max(1, Math.min(6, n(getCellValue(ws, 'A7')) || 1));
    let ourRot = ourStartRot;
    let ourScore = 0, theirScore = 0;
    let phase = null;
    const entries = [];
    for (let row = 18; row <= 600; row++) {
      const rawCell = getCellValue(ws, 'B' + row);
      if (!rawCell || String(rawCell).trim() === '' || String(rawCell) === '0') break;
      const strVal = String(rawCell).trim();
      if (strVal.length < 2) continue;
      const quartine = parseQuartine(strVal);
      if (!quartine.length) continue;
      // Determine phase from first fundamental of rally
      if (phase === null) {
        phase = 'r';
        for (let i = 0; i < quartine.length; i++) {
          const f = quartine[i].fundamental;
          if (f === 'b') { phase = 'b'; break; }
          if (f === 'r') { phase = 'r'; break; }
        }
      }
      const outcome = determineOutcomeFromQuartine(quartine);
      const actions = quartine
        .filter(q => q.type === 'action')
        .map(q => ({ player: q.player, fundamental: q.fundamental, evaluation: q.value }));
      entries.push({
        result: { actions, result: outcome },
        rotation: ourRot,
        phase,
        ourScore,
        theirScore,
        actionString: strVal,
      });
      if (outcome === 'home_point') ourScore++;
      else if (outcome === 'away_point') theirScore++;
      // Update rotation and phase
      if (outcome === 'home_point') {
        if (phase === 'r') { ourRot = (ourRot % 6) + 1; } // side-out → rotate
        phase = 'b';
      } else if (outcome === 'away_point') {
        if (phase === 'b') { phase = 'r'; }
      }
    }
    if (entries.length > 0) { actionsBySet[s] = entries; }
  }
  return actionsBySet;
}

// ── Stat helpers (ES-module port of live-stats-computer.js) ─────────────────
function _mkStat()         { return { kill: 0, pos: 0, exc: 0, neg: 0, err: 0, tot: 0 }; }
function _addEval(stat, e) {
  stat.tot++;
  e = Number(e) || 0;
  if      (e === 5) stat.kill++;
  else if (e === 4) stat.pos++;
  else if (e === 3) stat.exc++;
  else if (e === 2) stat.neg++;
  else if (e === 1) stat.err++;
}
function _finalizeStat(s) {
  if (!s || !s.tot) return Object.assign({}, s || _mkStat(), { pct: 0, efficacy: 0, efficiency: 0 });
  return Object.assign({}, s, {
    pct:        +(( s.kill                  / s.tot) * 100).toFixed(1),
    efficacy:   +(( s.kill                  / s.tot) * 100).toFixed(1),   // Efficacia DataVolley = # / Tot × 100
    efficiency: +(((s.kill - s.err)         / s.tot) * 100).toFixed(1),   // Efficienza DataVolley = (# - =) / Tot × 100
  });
}
function _parseRot(raw) {
  if (!raw) return 0;
  const v = parseInt(String(raw).replace(/^[Pp]/i, ''), 10);
  return (v >= 1 && v <= 6) ? v : 0;
}
function _extractQuartineTokens(entry) {
  if (Array.isArray(entry?.quartine) && entry.quartine.length > 0) return entry.quartine;
  if (typeof entry === 'string') return parseQuartine(entry);
  const raw = String(entry?.actionString || entry?.action || '').trim();
  if (!raw) return [];
  return parseQuartine(raw);
}
function _extractActions(entry) {
  if (Array.isArray(entry?.result?.actions)) return entry.result.actions;
  if (Array.isArray(entry?.actions))         return entry.actions;
  const quartine = _extractQuartineTokens(entry);
  if (quartine.length > 0) {
    return quartine
      .filter((item) => item?.type === 'action')
      .map((item) => ({
        player: item?.player,
        fundamental: item?.fundamental,
        evaluation: item?.evaluation ?? item?.value,
      }));
  }
  return [];
}
function _extractOutcome(entry) {
  const r = String(entry?.result?.result || entry?.outcome || entry?.result || '').toLowerCase();
  if (r === 'home_point' || r === 'point') return 'home_point';
  if (r === 'away_point' || r === 'error') return 'away_point';
  if (entry?.isPoint === true) return 'home_point';
  if (entry?.isError === true) return 'away_point';
  const quartine = _extractQuartineTokens(entry);
  if (quartine.length > 0) return determineOutcomeFromQuartine(quartine);
  return 'continue';
}

/**
 * Computes riepilogo, gioco, giriDiRice and rallies from actionsBySet.
 * Pure ES-module equivalent of window.liveStatsComputer.computeStatsFromLiveScout,
 * used when formula sheets are absent (raw .xlsx files).
 */
function computeStatsFromActionsBySet(actionsBySet, roster) {
  // ── Roster map ──────────────────────────────────────────────────────────────
  const rosterMap = {};
  (Array.isArray(roster) ? roster : []).forEach(p => {
    const num = String(p.number || '').padStart(2, '0');
    if (num) rosterMap[num] = { surname: String(p.surname || '').trim(), name: String(p.name || '').trim() };
  });

  // ── Riepilogo accumulators ───────────────────────────────────────────────────
  const pMap   = {};
  const team   = { attack: _mkStat(), serve: _mkStat(), block: _mkStat(), reception: _mkStat(), defense: _mkStat() };
  const opp    = { attack: _mkStat(), serve: _mkStat(), reception: _mkStat(), defense: _mkStat() };
  const rotMap = {};
  let totalPointsMade = 0, totalErrors = 0;

  const getP = num => {
    const k = String(num || '').padStart(2, '0');
    if (!pMap[k]) {
      const info = rosterMap[k] || { surname: '', name: '' };
      pMap[k] = { number: k, surname: info.surname, name: info.name,
                  attack: _mkStat(), serve: _mkStat(), block: _mkStat(),
                  reception: _mkStat(), defense: _mkStat(),
                  pointsMade: 0, errors: 0 };
    }
    return pMap[k];
  };

  // ── Gioco accumulators ───────────────────────────────────────────────────────
  const giocoOverview = { attack: _mkStat(), serve: _mkStat(), reception: _mkStat(), defense: _mkStat() };
  const giocoRotStats = {};
  const arBuckets = { R5: _mkStat(), R4: _mkStat(), R3: _mkStat() };
  const adBuckets = { D5: _mkStat(), D4: _mkStat(), D3: _mkStat() };
  const recByRot  = {};
  const getGRS = r => {
    if (!giocoRotStats[r]) giocoRotStats[r] = { rotation: r, attack: _mkStat(), serve: _mkStat(), reception: _mkStat(), defense: _mkStat() };
    return giocoRotStats[r];
  };

  // ── Giri di Rice accumulators ────────────────────────────────────────────────
  const serveRot   = {};
  const receiveRot = {};
  const getSR = r => { if (!serveRot[r])   serveRot[r]   = { rotation: r, breakPts: 0, attackPts: 0, blockPts: 0, errors: 0, total: 0 };   return serveRot[r]; };
  const getRR = r => { if (!receiveRot[r]) receiveRot[r] = { rotation: r, attackPts: 0, blockPts: 0, oppServeErrors: 0, oppGiftPts: 0, total: 0 }; return receiveRot[r]; };

  // ── Rallies array ────────────────────────────────────────────────────────────
  const rallies = [];

  Object.entries(actionsBySet).forEach(([setNumStr, setActions]) => {
    if (!Array.isArray(setActions)) return;
    const setNum = Number(setNumStr) || 0;
    let lastRcvEval = null, lastDefEval = null, lastGRot = 0;
    let grCurrentPhase = null;
    let rallyOurScore = 0, rallyTheirScore = 0;
    let rallyPhase = 'r';

    setActions.forEach((entry, idx) => {
      const acts    = _extractActions(entry);
      const outcome = _extractOutcome(entry);
      const rot     = _parseRot(entry?.rotation) || lastGRot;
      lastGRot = rot;

      // ── Riepilogo ─────────────────────────────────────────────────────────
      if (rot) {
        if (!rotMap[rot]) rotMap[rot] = { rotation: rot, totalPoints: 0, pointsMade: 0, pointsLost: 0 };
        rotMap[rot].totalPoints++;
        if (outcome === 'home_point') rotMap[rot].pointsMade++;
        if (outcome === 'away_point') rotMap[rot].pointsLost++;
      }
      if (outcome === 'home_point') totalPointsMade++;
      if (outcome === 'away_point') totalErrors++;

      // ── Ricostruzione avversario contestuale ─────────────────────────────
      // La logica segue le regole specifiche della pallavolo:
      //   R1→oppB5, R2→oppB4, R3→oppB3, R4→oppB2, R5→oppB2 (R4/R5 entrambi B2)
      //   D1→oppA5, D2→oppA4, D3→oppA3, D4→oppA2, D5→oppA2 (D4/D5 entrambi A2)
      //   A dipende dalla fase (se preceduto da R → oppD, se preceduto da D → oppA)
      //   B2/B3 e M2/M3 dipendono da cosa segue (la difesa/ricezione successiva)
      const _oppMapRtoB = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 2 };
      const _oppMapDtoA = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 2 };
      // Per B e M seguiti da difesa, la ricostruzione dipende dal follow-up
      // B2 + D5/D4 → oppR4/R5 + oppA2; B2 + D3 → oppR4 + oppA3; B2 + D2 → oppR4 + oppA4; B2 + D1 → oppR4 + oppA5
      // B3 + D5/D4 → oppR3 + oppA2; B3 + D3 → oppR3 + oppA3; B3 + D2 → oppR3 + oppA4; B3 + D1 → oppR3 + oppA5
      // B4 → oppR2 (freeball); B5 → oppR1
      // M2/M3 analogo ma con oppD invece di oppR
      function _oppServeFollowUp(bEval, nextDefEval) {
        const rcvEval = bEval === 2 ? 4 : 3; // B2→oppR4, B3→oppR3
        if (nextDefEval >= 4) return { rcv: rcvEval >= 4 ? 5 : rcvEval, atk: 2 };
        if (nextDefEval === 3) return { rcv: rcvEval, atk: 3 };
        if (nextDefEval === 2) return { rcv: rcvEval, atk: 4 };
        if (nextDefEval === 1) return { rcv: rcvEval, atk: 5 };
        return { rcv: rcvEval, atk: 2 }; // default
      }
      function _oppBlockFollowUp(mEval, nextDefEval) {
        const defEval = mEval === 2 ? 4 : 3; // M2→oppD4, M3→oppD3
        if (nextDefEval >= 4) return { def: defEval >= 4 ? 5 : defEval, atk: 2 };
        if (nextDefEval === 3) return { def: defEval, atk: 3 };
        if (nextDefEval === 2) return { def: defEval, atk: 4 };
        if (nextDefEval === 1) return { def: defEval, atk: 5 };
        return { def: defEval, atk: 2 };
      }

      // Prima passo: accumula statistiche Team (sempre corretto)
      // Secondo passo: ricostruzione avversario contestuale (usa look-ahead)
      let rallyPhaseCtx = null; // 'r' se ultimo fondamentale era ricezione, 'd' se difesa
      acts.forEach((act, ai) => {
        const f = String(act?.fundamental || '').toLowerCase();
        const e = Number(act?.evaluation !== undefined ? act.evaluation : (act?.value || 0));
        const p = getP(act?.player);
        // Look-ahead: prossimo token di difesa dopo B2/B3/M2/M3
        const nextAct = acts[ai + 1];
        const nextF = String(nextAct?.fundamental || '').toLowerCase();
        const nextE = Number(nextAct?.evaluation !== undefined ? nextAct.evaluation : (nextAct?.value || 0));

        switch (f) {
          case 'a':
            _addEval(p.attack,  e); _addEval(team.attack,  e);
            if (e === 5) p.pointsMade++;
            if (e === 1) p.errors++;
            // Opp reconstruction per attacco dipende dalla fase
            // Se preceduto da ricezione → opp defense (inversione specifica)
            // Se preceduto da difesa → opp attack (inversione specifica, ma questo
            //   copre "avversario difende il nostro attacco")
            // Mapping: A1→oppD5/oppA5, A2→oppD4/oppA4, A3→oppD3/oppA3, A4→oppD2/oppA2, A5→oppD1/oppA1
            // Ma con capping: A4 e A5 → oppD2 / oppA2 (come R4/R5→B2)
            {
              const oppE = e <= 1 ? 5 : e <= 2 ? 4 : e <= 3 ? 3 : 2; // A1→5, A2→4, A3→3, A4/A5→2
              if (rallyPhaseCtx === 'r') {
                _addEval(opp.defense, oppE);
              } else {
                _addEval(opp.defense, oppE);
              }
            }
            _addEval(giocoOverview.attack, e);
            if (rot) _addEval(getGRS(rot).attack, e);
            if (lastRcvEval !== null) {
              const rk = lastRcvEval >= 4 ? 'R5' : (lastRcvEval >= 3 ? 'R4' : 'R3');
              _addEval(arBuckets[rk], e); lastRcvEval = null;
            }
            if (lastDefEval !== null) {
              const dk = lastDefEval >= 4 ? 'D5' : (lastDefEval >= 3 ? 'D4' : 'D3');
              _addEval(adBuckets[dk], e); lastDefEval = null;
            }
            break;
          case 'b':
            _addEval(p.serve,   e); _addEval(team.serve,   e);
            if (e === 5) { p.pointsMade++; _addEval(opp.reception, 1); }  // B5 → oppR1 (ace)
            else if (e === 1) { p.errors++; }  // B1 = errore, punto regalato, no opp token
            else if (e === 4) { _addEval(opp.reception, 2); }  // B4 → oppR2 (freeball)
            else if (e === 2 || e === 3) {
              // B2/B3: ricostruzione contestuale basata sulla difesa successiva
              // Ricezione avversaria: B2→oppR4, B3→oppR3
              const oppRcv = e === 2 ? 4 : 3;
              _addEval(opp.reception, oppRcv);
              // L'attacco avversario successivo viene dedotto dal follow-up
              // ma solo se il prossimo token è 'd' (nostra difesa)
              if (nextF === 'd' && nextE > 0) {
                const fu = _oppServeFollowUp(e, nextE);
                _addEval(opp.attack, fu.atk);
              }
            }
            _addEval(giocoOverview.serve, e);
            if (rot) _addEval(getGRS(rot).serve, e);
            rallyPhaseCtx = null;
            break;
          case 'm':
            _addEval(p.block,   e); _addEval(team.block,   e);
            if (e === 5) { p.pointsMade++; _addEval(opp.attack, 1); }  // M5 → stuffblock → oppA1
            else if (e === 1) { p.errors++; _addEval(opp.attack, 5); }  // M1 → errore muro → oppA5
            else if (e === 4) { _addEval(opp.attack, 2); }  // M4 → oppA2 (freeball per noi)
            else if (e === 2 || e === 3) {
              // M2/M3: contestuale basato sulla difesa successiva
              if (nextF === 'd' && nextE > 0) {
                const fu = _oppBlockFollowUp(e, nextE);
                _addEval(opp.defense, fu.def);
                _addEval(opp.attack, fu.atk);
              } else {
                // Senza follow-up, stima conservativa
                const oppAtk = e === 2 ? 4 : 3;
                _addEval(opp.attack, oppAtk);
              }
            }
            break;
          case 'r':
            _addEval(p.reception, e); _addEval(team.reception, e);
            if (e === 1) p.errors++;
            // R→oppB: R1→B5, R2→B4, R3→B3, R4→B2, R5→B2
            _addEval(opp.serve, _oppMapRtoB[e] || 2);
            _addEval(giocoOverview.reception, e);
            if (rot) {
              _addEval(getGRS(rot).reception, e);
              if (!recByRot[rot]) recByRot[rot] = Object.assign({ rotation: rot }, _mkStat());
              _addEval(recByRot[rot], e);
            }
            lastRcvEval = e; lastDefEval = null;
            rallyPhaseCtx = 'r';
            break;
          case 'd':
            _addEval(p.defense, e); _addEval(team.defense, e);
            // D→oppA: D1→A5, D2→A4, D3→A3, D4→A2, D5→A2
            _addEval(opp.attack, _oppMapDtoA[e] || 2);
            _addEval(giocoOverview.defense, e);
            if (rot) _addEval(getGRS(rot).defense, e);
            lastDefEval = e; lastRcvEval = null;
            rallyPhaseCtx = 'd';
            break;
        }
      });

      // ── Giri di Rice ───────────────────────────────────────────────────────
      if (rot) {
        let phase = grCurrentPhase;
        for (let i = 0; i < acts.length; i++) {
          const f0 = String(acts[i]?.fundamental || '').toLowerCase();
          if (f0 === 'b') { phase = 'b'; break; }
          if (f0 === 'r') { phase = 'r'; break; }
        }
        if (phase === null) phase = 'r';
        grCurrentPhase = (outcome !== 'continue') ? (phase === 'b' ? 'r' : 'b') : phase;

        // Detect "avv" (punto regalato dall'avversario) — no action with eval 5 made the point
        const hasAvv = _extractQuartineTokens(entry).some(t => t?.type === 'avv') ||
          String(entry?.action || entry?.actionString || '').toLowerCase().includes('avv');

        if (phase === 'b') {
          const sr = getSR(rot); sr.total++;
          if (outcome === 'home_point') {
            let scored = false;
            for (let j = acts.length - 1; j >= 0; j--) {
              const fa = String(acts[j]?.fundamental || '').toLowerCase();
              const ea = Number(acts[j]?.evaluation !== undefined ? acts[j].evaluation : (acts[j]?.value || 0));
              if (fa === 'b' && ea === 5) { sr.breakPts++;  scored = true; break; }
              if (fa === 'a' && ea === 5) { sr.attackPts++; scored = true; break; }
              if (fa === 'm' && ea === 5) { sr.blockPts++;  scored = true; break; }
            }
            if (!scored) sr.breakPts++;  // punto non attribuibile → break point generico
          } else if (outcome === 'away_point') {
            sr.errors++;
          }
        } else {
          const rr = getRR(rot); rr.total++;
          if (outcome === 'home_point') {
            let scored = false;
            for (let j = acts.length - 1; j >= 0; j--) {
              const fa = String(acts[j]?.fundamental || '').toLowerCase();
              const ea = Number(acts[j]?.evaluation !== undefined ? acts[j].evaluation : (acts[j]?.value || 0));
              if (fa === 'a' && ea === 5) { rr.attackPts++; scored = true; break; }
              if (fa === 'm' && ea === 5) { rr.blockPts++;  scored = true; break; }
            }
            if (!scored && hasAvv) rr.oppServeErrors++;  // avv in ricezione = errore battuta avversario
            else if (!scored) rr.attackPts++;  // punto generico in ricezione → attacco
          } else if (outcome === 'away_point') {
            // In ricezione perdiamo il rally — errore nostro
            if (hasAvv) rr.oppGiftPts = (rr.oppGiftPts || 0);  // non incrementare, avv non ha senso qui
          }
        }
      }

      // ── Rallies ────────────────────────────────────────────────────────────
      if (acts.length) {
        const f0 = String(acts[0]?.fundamental || '').toLowerCase();
        if (f0 === 'b') rallyPhase = 'b';
        else if (f0 === 'r') rallyPhase = 'r';
      }
      const quartine = acts.map(act => {
        const player = String(act?.player || '').padStart(2, '0');
        const fund   = String(act?.fundamental || '').toLowerCase();
        const val    = Number(act?.evaluation !== undefined ? act.evaluation : (act?.value || 0));
        return { type: 'action', player, fundamental: fund, value: val, raw: player + fund + val };
      });
      rallies.push({
        set:          setNum,
        row:          idx + 1,
        quartine,
        ourScore:     rallyOurScore,
        theirScore:   rallyTheirScore,
        isPoint:      outcome === 'home_point',
        isError:      outcome === 'away_point',
        rotation:     rot || 0,
        phase:        rallyPhase,
        actionString: String(entry?.actionString || ''),
        pointDesc:    outcome === 'home_point' ? 'Punto' : '',
        errorDesc:    outcome === 'away_point' ? 'Errore' : '',
      });
      if (outcome === 'home_point')       rallyOurScore++;
      else if (outcome === 'away_point')  rallyTheirScore++;
      if (outcome !== 'continue') rallyPhase = outcome === 'home_point' ? 'b' : 'r';
    });
  });

  // ── Build riepilogo ─────────────────────────────────────────────────────────
  const playerStats = Object.values(pMap).map(p => {
    // Punti: att_kill + bat_kill + muro_kill (azioni vincenti dirette)
    const pointsMade = p.attack.kill + p.serve.kill + p.block.kill;
    // Errori: att_err + bat_err + muro_err + rice_err (come da Riepilogo Excel)
    const errorsTotal = p.attack.err + p.serve.err + p.block.err + p.reception.err;
    const totActions = p.attack.tot + p.serve.tot + p.block.tot;
    const blockStat = _finalizeStat(p.block);
    return {
      number: p.number,
      name:   (p.surname + (p.name ? ' ' + p.name : '')).trim() || p.number,
      attack: _finalizeStat(p.attack),
      serve:  _finalizeStat(p.serve),
      block: {
        kill: blockStat.kill,
        pos: blockStat.pos,
        exc: blockStat.exc,
        neg: blockStat.neg,
        err: blockStat.err,
        tot: blockStat.tot,
        efficacy: blockStat.efficacy,
        efficiency: blockStat.efficiency,
      },
      reception: _finalizeStat(p.reception),
      defense:   _finalizeStat(p.defense),
      points: {
        made:      pointsMade,
        madePct:   totActions ? +((pointsMade / totActions) * 100).toFixed(1) : 0,
        errors:    errorsTotal,
        errorsPct: totActions ? +((errorsTotal / totActions) * 100).toFixed(1) : 0,
        balance:   pointsMade - errorsTotal,
      },
    };
  });
  const playerReception = Object.values(pMap)
    .filter(p => p.reception.tot > 0)
    .map(p => Object.assign({ number: p.number, name: (p.surname + ' ' + p.name).trim() }, _finalizeStat(p.reception)));
  const playerDefense = Object.values(pMap)
    .filter(p => p.defense.tot > 0)
    .map(p => Object.assign({ number: p.number, name: (p.surname + ' ' + p.name).trim() }, _finalizeStat(p.defense)));

  const riepilogo = {
    playerStats, playerReception, playerDefense,
    team: {
      attack:    _finalizeStat(team.attack),    serve:     _finalizeStat(team.serve),
      block:     _finalizeStat(team.block),     reception: _finalizeStat(team.reception),
      defense:   _finalizeStat(team.defense),
    },
    opponent: {
      attack:    _finalizeStat(opp.attack),     serve:     _finalizeStat(opp.serve),
      reception: _finalizeStat(opp.reception),  defense:   _finalizeStat(opp.defense),
    },
    rotations: Object.values(rotMap),
    totalPointsMade, totalErrors,
  };

  // ── Build gioco ─────────────────────────────────────────────────────────────
  const attackFromReception = {};
  const attackFromDefense   = {};
  ['R5', 'R4', 'R3'].forEach(k => {
    const s = _finalizeStat(arBuckets[k]);
    attackFromReception[k] = [{ role: 'ATT', attacks: s.tot, pointsStr: s.kill + '/' + s.err }];
  });
  ['D5', 'D4', 'D3'].forEach(k => {
    const s = _finalizeStat(adBuckets[k]);
    attackFromDefense[k] = [{ role: 'ATT', attacks: s.tot, pointsStr: s.kill + '/' + s.err }];
  });
  const receptionByRotation = Object.values(recByRot).map(({ rotation: rt, ...rest }) =>
    Object.assign({ rotation: rt }, _finalizeStat(rest))
  );
  const gioco = {
    overview: {
      attack:    _finalizeStat(giocoOverview.attack),
      serve:     _finalizeStat(giocoOverview.serve),
      reception: _finalizeStat(giocoOverview.reception),
      defense:   _finalizeStat(giocoOverview.defense),
    },
    rotationStats: Object.values(giocoRotStats).map(rs => ({
      rotation: rs.rotation,
      fundamentals: {
        attack:    _finalizeStat(rs.attack),   serve:     _finalizeStat(rs.serve),
        reception: _finalizeStat(rs.reception), defense:  _finalizeStat(rs.defense),
      },
    })),
    attackFromReception, attackFromDefense, receptionByRotation,
  };

  // ── Build giriDiRice ────────────────────────────────────────────────────────
  const giriDiRice = {
    serveRotations:   Object.values(serveRot),
    receiveRotations: Object.values(receiveRot),
  };

  console.log('[dataParser] Statistiche calcolate da dati grezzi:',
    'playerStats:', riepilogo.playerStats.length,
    'rallies:', rallies.length,
    'rotazioni:', riepilogo.rotations.length
  );

  return { riepilogo, gioco, giriDiRice, rallies };
}

export function computeStatsFromMVSMatch(actionsBySet = {}, roster = []) {
  return computeStatsFromActionsBySet(actionsBySet, roster);
}

// ─── Parse Riepilogo_ALL.xlsx (aggregated stats) ───────────────────────────
export function parseRiepilogoAll(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const matches = {};

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const key = sheetName.trim();

    // Parse same structure as single-match Riepilogo
    const playerStats = [];
    for (let row = 8; row <= 21; row++) {
      const num = getCellValue(ws, `A${row}`);
      const name = getCellValue(ws, `B${row}`);
      if (!num || !name || name === '--') continue;

      playerStats.push({
        number: String(num).padStart(2, '0'),
        name: String(name).trim(),
        attack: {
          kill: n(getCellValue(ws, `C${row}`)), pos: n(getCellValue(ws, `D${row}`)),
          exc: n(getCellValue(ws, `E${row}`)), neg: n(getCellValue(ws, `F${row}`)),
          err: n(getCellValue(ws, `G${row}`)), tot: n(getCellValue(ws, `H${row}`)),
          efficacy: n(getCellValue(ws, `J${row}`)), efficiency: n(getCellValue(ws, `K${row}`)),
        },
        serve: {
          kill: n(getCellValue(ws, `M${row}`)), pos: n(getCellValue(ws, `N${row}`)),
          exc: n(getCellValue(ws, `O${row}`)), neg: n(getCellValue(ws, `P${row}`)),
          err: n(getCellValue(ws, `Q${row}`)), tot: n(getCellValue(ws, `R${row}`)),
          efficacy: n(getCellValue(ws, `T${row}`)), efficiency: n(getCellValue(ws, `U${row}`)),
        },
        block: {
          kill: n(getCellValue(ws, `W${row}`)), pos: n(getCellValue(ws, `X${row}`)),
          exc: n(getCellValue(ws, `Y${row}`)), neg: n(getCellValue(ws, `Z${row}`)),
          err: n(getCellValue(ws, `AA${row}`)),
          efficacy: n(getCellValue(ws, `AB${row}`)), efficiency: n(getCellValue(ws, `AC${row}`)),
        },
      });
    }

    // Reception and Defense: rows 29-42
    const playerReception = [];
    const playerDefense = [];
    for (let row = 29; row <= 42; row++) {
      const num = getCellValue(ws, `A${row}`);
      const name = getCellValue(ws, `B${row}`);
      if (!num || !name || name === '--') continue;

      playerReception.push({
        number: String(num).padStart(2, '0'), name: String(name).trim(),
        kill: n(getCellValue(ws, `C${row}`)), pos: n(getCellValue(ws, `D${row}`)),
        exc: n(getCellValue(ws, `E${row}`)), neg: n(getCellValue(ws, `F${row}`)),
        err: n(getCellValue(ws, `G${row}`)), tot: n(getCellValue(ws, `H${row}`)),
        efficacy: n(getCellValue(ws, `J${row}`)), efficiency: n(getCellValue(ws, `K${row}`)),
      });

      playerDefense.push({
        number: String(num).padStart(2, '0'), name: String(name).trim(),
        kill: n(getCellValue(ws, `M${row}`)), pos: n(getCellValue(ws, `N${row}`)),
        exc: n(getCellValue(ws, `O${row}`)), neg: n(getCellValue(ws, `P${row}`)),
        err: n(getCellValue(ws, `Q${row}`)), tot: n(getCellValue(ws, `R${row}`)),
        efficacy: n(getCellValue(ws, `T${row}`)), efficiency: n(getCellValue(ws, `U${row}`)),
      });
    }

    matches[key] = { sheetName: key, playerStats, playerReception, playerDefense };
  }

  return matches;
}

// ─── Utility helpers ───────────────────────────────────────────────────────
function getCellValue(ws, ref) {
  const cell = ws[ref];
  return cell ? cell.v : null;
}

function cellRef(col, row) {
  let s = '';
  let c = col;
  while (c > 0) {
    c--;
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26);
  }
  return s + row;
}

function n(val) {
  if (val === null || val === undefined || val === '' || val === '--') return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

function parsePointString(val) {
  if (!val) return { total: 0, pct: 0 };
  const str = String(val);
  const match = str.match(/(\d+)\s*\(?([\d.]+)%?\)?/);
  if (match) return { total: parseInt(match[1]), pct: parseFloat(match[2]) };
  return { total: parseInt(str) || 0, pct: 0 };
}

function parseRatioString(val) {
  if (!val) return { count: 0, total: 0 };
  const str = String(val);
  const match = str.match(/(\d+)\s*su\s*(\d+)/);
  if (match) return { count: parseInt(match[1]), total: parseInt(match[2]) };
  return { count: 0, total: 0 };
}

function parseAttackDistribution(ws, labelCol, attCol, ptCol, rowRange) {
  const data = [];
  for (let row = rowRange[0] + 1; row <= rowRange[1]; row++) {
    const role = getCellValue(ws, cellRef(labelCol, row));
    const attacks = getCellValue(ws, cellRef(attCol, row));
    const points = getCellValue(ws, cellRef(ptCol, row));
    if (role && String(role).includes(':')) {
      data.push({
        role: String(role).split(':')[0].trim(),
        attacks: n(attacks),
        pointsStr: String(points || ''),
      });
    }
  }
  return data;
}
