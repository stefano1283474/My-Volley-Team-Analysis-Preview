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

  const match = {
    id: crypto.randomUUID(),
    fileName,
    metadata: parseMetadata(wb),
    roster: parseRoster(wb),
    sets: parseSets(wb),
    riepilogo: parseRiepilogo(wb),
    gioco: parseGioco(wb),
    giriDiRice: parseGiriDiRice(wb),
    rallies: parseAllRallies(wb),
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
    date = dateRaw.toISOString().split('T')[0];
  } else if (typeof dateRaw === 'string') {
    date = dateRaw;
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
