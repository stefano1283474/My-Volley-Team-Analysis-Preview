// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Firestore Service
// Tutti i dati sono archiviati in Firestore sotto la SOLA root collection "users".
//
// Struttura percorso principale:
//   users/{userEmail}/teams/{teamId}/matches/{matchId}   ← dati partita
//   users/{userEmail}/teams/{teamId}/calendar/current     ← calendario + classifica
//   users/{userEmail}/shared_access/config                ← condivisione accessi
//   users/{userEmail}/news/posts                          ← bacheca
//   users/{userEmail}/offers/list                         ← offerte
//   users/{userEmail}/usage/log                           ← tracking utilizzo
//   users/_admin/content/global                           ← contenuto admin
//   users/_global_tokens/share_tokens/{token}             ← token condivisione
//
// Ogni documento match ha { _type: 'match', ...matchData }
//
// Gestione ruoli/pacchetto:
//   Unica sorgente di verità → users/{usermail}
//   Campi discriminanti: role, pacchetto
// ============================================================================

import {
  doc, collection,
  setDoc, getDoc, getDocs, deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { computeStatsFromMVSMatch } from './dataParser';

// ─── Path helpers ────────────────────────────────────────────────────────────

const MVS_USERS_ROOT = 'users';
// ── Consolidamento: tutte le collection sotto users/ ──
// Legacy root collection (non più usate, mantenute per backward compat in lettura):
const LEGACY_SHARED_ACCESS_COLLECTION = 'volley_team_analysis_6_0_shared_access';
const LEGACY_SHARE_TOKENS_COLLECTION = 'volley_team_analysis_6_0_share_tokens';
const LEGACY_USER_USAGE_COLLECTION = 'volley_team_analysis_6_0_user_usage';
const PROFILE_VALUES = ['base', 'pro', 'promax'];
// Email di bootstrap: ottiene role='admin' automaticamente al PRIMO login.
// Logins successivi non sovrascrivono il ruolo (già nel documento).
const BOOTSTRAP_ADMIN_EMAIL = 'peraimodel@gmail.com';

function resolveTeamId(teamId) {
  const explicit = String(teamId || '').trim();
  if (explicit) return explicit.replace(/\//g, '_');
  try {
    const saved = String(localStorage.getItem('vpa_owner_team') || '').trim();
    if (saved) return saved.replace(/\//g, '_');
  } catch {}
  return 'team_default';
}

function teamsCol(userId) {
  return collection(db, MVS_USERS_ROOT, userId, 'teams');
}

function teamDocRef(userId, teamId) {
  return doc(db, MVS_USERS_ROOT, userId, 'teams', resolveTeamId(teamId));
}

function teamMatchesCol(userId, teamId) {
  return collection(teamDocRef(userId, teamId), 'matches');
}

function teamCalendarDocRef(userId, teamId) {
  return doc(teamDocRef(userId, teamId), 'calendar', 'current');
}

function legacyUserCalendarDocRef(userId, teamId) {
  return doc(db, MVS_USERS_ROOT, userId, 'calendari', resolveTeamId(teamId));
}

function matchDocRef(userId, matchId, teamId) {
  return doc(teamMatchesCol(userId, teamId), matchId);
}

function shareAccessDocRef(ownerUid) {
  // Nuovo path: users/{ownerUid}/shared_access/config
  return doc(db, MVS_USERS_ROOT, ownerUid, 'shared_access', 'config');
}
function legacyShareAccessDocRef(ownerUid) {
  return doc(db, LEGACY_SHARED_ACCESS_COLLECTION, ownerUid);
}

function shareTokenDocRef(token) {
  // Nuovo path: users/{ownerUid}/share_tokens/{token}
  // Nota: i token devono ora essere sotto l'utente che li crea.
  // Per retrocompatibilità in lettura, si controlla anche il vecchio path.
  return doc(db, MVS_USERS_ROOT, '_global_tokens', 'share_tokens', token);
}
function legacyShareTokenDocRef(token) {
  return doc(db, LEGACY_SHARE_TOKENS_COLLECTION, token);
}

function usersRootCol() {
  return collection(db, MVS_USERS_ROOT);
}

function profileDocIdFromEmail(email) {
  return normalizeEmail(email);
}

function userProfileDocRefByEmail(email) {
  return doc(db, MVS_USERS_ROOT, profileDocIdFromEmail(email));
}

function userUsageCol() {
  // Nuovo: sub-collection sotto ogni utente
  // Per admin listing, si itera su users/{uid}/usage/log
  return collection(db, MVS_USERS_ROOT);
}

function userUsageDocRef(uid) {
  // Nuovo path: users/{uid}/usage/log
  return doc(db, MVS_USERS_ROOT, uid, 'usage', 'log');
}
function legacyUserUsageDocRef(uid) {
  return doc(db, LEGACY_USER_USAGE_COLLECTION, uid);
}

// ─── Utility: strip undefined fields (Firestore non li accetta) ──────────────

function sanitize(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(item => sanitize(item));
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if ((value.constructor?.name || '') !== 'Object') return value;

  const out = {};
  Object.entries(value).forEach(([k, v]) => {
    out[k] = sanitize(v);
  });
  return out;
}

function timestampToMs(ts) {
  const date = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
  if (!date || Number.isNaN(date.getTime())) return 0;
  return date.getTime();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function emailDocIdVariants(email) {
  const raw = String(email || '').trim();
  const lower = raw.toLowerCase();
  const rawDotSafe = raw.replace(/\./g, '_');
  const lowerDotSafe = lower.replace(/\./g, '_');
  return [...new Set([raw, lower, rawDotSafe, lowerDotSafe].filter(Boolean))];
}

function normalizeAssignedProfile(profile) {
  const text = String(profile || '').trim().toLowerCase();
  if (text === 'promax' || text === 'pro max') return 'promax';
  if (text === 'pro') return 'pro';
  if (text === 'base') return 'base';
  return 'base';
}

function normalizePacchetto(pacchetto) {
  const normalized = normalizeAssignedProfile(pacchetto);
  if (normalized === 'promax') return 'Promax';
  if (normalized === 'pro') return 'Pro';
  return 'Base';
}

function profileFromPacchetto(pacchetto) {
  const text = String(pacchetto || '').trim().toLowerCase();
  if (text === 'promax' || text === 'pro max') return 'promax';
  if (text === 'pro') return 'pro';
  return 'base';
}

function normalizeMembership(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'mvs' || normalized === 'both') return normalized;
  return 'mvta';
}

function normalizeAppProfile(raw = {}, fallbackRole = 'user', fallbackProfile = 'base') {
  const role = normalizeUserRole(raw.role || fallbackRole);
  if (role === 'admin') {
    return {
      role: 'admin',
      assignedProfile: 'promax',
      pacchetto: 'Promax',
      enabled: raw.enabled === true,
    };
  }
  const assignedProfile = normalizeAssignedProfile(raw.assignedProfile || profileFromPacchetto(raw.pacchetto) || fallbackProfile);
  return {
    role,
    assignedProfile,
    pacchetto: normalizePacchetto(raw.pacchetto || assignedProfile),
    enabled: raw.enabled === true,
  };
}

function computeMembership(apps = {}) {
  const mvtaEnabled = apps?.mvta?.enabled !== false;
  const mvsEnabled = apps?.mvs?.enabled === true;
  if (mvtaEnabled && mvsEnabled) return 'both';
  if (mvsEnabled) return 'mvs';
  return 'mvta';
}

function normalizeUserRole(role) {
  return role === 'admin' ? 'admin' : 'user';
}

function normalizeRequestStatus(status) {
  return ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending';
}

async function resolveUserEmail({ uid = '', email = '' } = {}) {
  const rawEmail = String(email || '').trim();
  const normalizedEmail = normalizeEmail(rawEmail);
  const normalizedUid = String(uid || '').trim();
  try {
    const snap = await getDocs(usersRootCol());
    const directVariants = new Set(emailDocIdVariants(rawEmail));
    const matches = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {};
      const docId = String(docSnap.id || '').trim();
      const docUid = String(data.uid || '').trim();
      const docEmailNorm = normalizeEmail(data.email || docId);
      let score = 0;
      if (normalizedUid && docUid && docUid === normalizedUid) score += 100;
      if (normalizedEmail && docEmailNorm && docEmailNorm === normalizedEmail) score += 60;
      if (directVariants.has(docId)) score += 40;
      if (data?.apps?.mvta?.enabled === true || data?.role || data?.assignedProfile || data?.pacchetto) score += 10;
      if (score > 0) {
        matches.push({ id: docId, score });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    if (matches.length > 0) return matches[0].id;
  } catch {}
  if (normalizedEmail) return normalizedEmail;
  if (rawEmail) return normalizeEmail(rawEmail);
  return normalizedUid || '';
}

async function resolveTeamOwnerId(userId = '') {
  const raw = String(userId || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) return await resolveUserEmail({ email: raw });
  return await resolveUserEmail({ uid: raw });
}

function normalizeMatchType(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function normalizeHomeAway(value, fallbackIsHome = true) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'away' || raw === 'trasferta') return 'away';
  if (raw === 'home' || raw === 'casa') return 'home';
  return fallbackIsHome ? 'home' : 'away';
}

function normalizeRosterPlayer(player = {}) {
  const surname = String(player?.surname || player?.lastName || '').trim();
  const name = String(player?.name || player?.firstName || player?.playerName || '').trim();
  const numberRaw = player?.number ?? player?.shirtNumber ?? player?.num;
  const number = numberRaw == null ? null : String(numberRaw).replace(/^'+/, '').trim();
  const nickname = String(player?.nickname || player?.nick || '').trim();
  const role = String(player?.role || player?.position || '').trim();
  const fullName = String(player?.fullName || `${surname}${name ? ` ${name}` : ''}`).trim();
  return { number, surname, name, nickname, role, fullName };
}

function deriveSetScoreFromMVS(setValue = {}) {
  const state = setValue?.state || {};
  const meta = setValue?.meta || {};
  const summary = setValue?.summary || {};
  const ourScore = Number(
    state?.homeScore ??
    state?.myScore ??
    meta?.myScore ??
    summary?.home ??
    0
  ) || 0;
  const theirScore = Number(
    state?.awayScore ??
    state?.theirScore ??
    meta?.theirScore ??
    summary?.away ??
    0
  ) || 0;
  return { ourScore, theirScore };
}

function normalizeSetsForMVTA(rawMatch = {}) {
  const src = rawMatch?.sets;
  if (Array.isArray(src)) {
    return src
      .map((setItem, index) => {
        const number = Number(setItem?.number || index + 1) || (index + 1);
        const ourScore = Number(setItem?.ourScore ?? setItem?.home ?? setItem?.myScore ?? 0) || 0;
        const theirScore = Number(setItem?.theirScore ?? setItem?.away ?? setItem?.opponentScore ?? 0) || 0;
        return {
          number,
          ourScore,
          theirScore,
          margin: Number(setItem?.margin ?? (ourScore - theirScore)) || 0,
          won: typeof setItem?.won === 'boolean' ? setItem.won : ourScore > theirScore,
          oppStartRotation: setItem?.oppStartRotation ?? null,
          ourStartRotation: setItem?.ourStartRotation ?? null,
        };
      })
      .filter((setItem) => (setItem.ourScore + setItem.theirScore) > 0);
  }
  if (src && typeof src === 'object') {
    return Object.keys(src)
      .sort((a, b) => Number(a) - Number(b))
      .map((setKey, index) => {
        const setValue = src[setKey] || {};
        const number = Number(setKey) || (index + 1);
        const { ourScore, theirScore } = deriveSetScoreFromMVS(setValue);
        return {
          number,
          ourScore,
          theirScore,
          margin: ourScore - theirScore,
          won: ourScore > theirScore,
          oppStartRotation: null,
          ourStartRotation: null,
        };
      })
      .filter((setItem) => (setItem.ourScore + setItem.theirScore) > 0);
  }
  return [];
}

function extractActionsBySet(rawMatch = {}) {
  if (rawMatch?.actionsBySet && typeof rawMatch.actionsBySet === 'object') {
    return rawMatch.actionsBySet;
  }
  const src = rawMatch?.sets;
  if (!src) return {};
  // Supporta sia formato oggetto {1: {actions:[...]}, 2: ...} sia array [{actions:[...]}, ...]
  if (Array.isArray(src)) {
    const out = {};
    src.forEach((setItem, index) => {
      const key = String(setItem?.number || (index + 1));
      const actions = setItem?.actions;
      if (Array.isArray(actions) && actions.length > 0) out[key] = actions;
    });
    return out;
  }
  if (typeof src !== 'object') return {};
  const out = {};
  Object.keys(src).forEach((key) => {
    const actions = src[key]?.actions;
    if (Array.isArray(actions) && actions.length > 0) out[key] = actions;
  });
  return out;
}

function hasUsableAggregatedStats(match = {}) {
  const team = match?.riepilogo?.team;
  if (!team || typeof team !== 'object') return false;
  const fundamentals = ['attack', 'serve', 'reception', 'defense', 'block'];
  const totalActions = fundamentals.reduce((sum, key) => {
    const tot = Number(team?.[key]?.tot || 0);
    return sum + (Number.isFinite(tot) ? tot : 0);
  }, 0);
  return totalActions > 0;
}

function hasUsableGiocoData(match = {}) {
  const gioco = match?.gioco;
  if (!gioco || typeof gioco !== 'object') return false;
  if (Array.isArray(gioco.rotationStats) && gioco.rotationStats.length > 0) return true;
  if (gioco.overview && typeof gioco.overview === 'object' && Object.keys(gioco.overview).length > 0) return true;
  if (gioco.attackFromReception && typeof gioco.attackFromReception === 'object' && Object.keys(gioco.attackFromReception).length > 0) return true;
  if (gioco.attackFromDefense && typeof gioco.attackFromDefense === 'object' && Object.keys(gioco.attackFromDefense).length > 0) return true;
  if (Array.isArray(gioco.receptionByRotation) && gioco.receptionByRotation.length > 0) return true;
  return false;
}

function hasUsableGiriDiRiceData(match = {}) {
  const giri = match?.giriDiRice;
  if (!giri || typeof giri !== 'object') return false;
  const serveRot = Array.isArray(giri.serveRotations) ? giri.serveRotations.length : 0;
  const receiveRot = Array.isArray(giri.receiveRotations) ? giri.receiveRotations.length : 0;
  return serveRot > 0 || receiveRot > 0;
}

function hasUsableRallies(match = {}) {
  return Array.isArray(match?.rallies) && match.rallies.length > 0;
}

function normalizeRiepilogoPlayerBlocks(riepilogo = {}) {
  const playerStats = Array.isArray(riepilogo?.playerStats) ? riepilogo.playerStats : [];
  if (playerStats.length === 0) return riepilogo;
  const normalizedPlayers = playerStats.map((player) => {
    const block = player?.block || {};
    const kill = Number(block.kill || 0) || 0;
    const pos = Number(block.pos || 0) || 0;
    const exc = Number(block.exc || 0) || 0;
    const neg = Number(block.neg || 0) || 0;
    const err = Number(block.err || 0) || 0;
    const tot = Number(block.tot);
    const safeTot = Number.isFinite(tot) && tot > 0 ? tot : (kill + pos + exc + neg + err);
    const efficacy = Number(block.efficacy);
    const efficiency = Number(block.efficiency);
    return {
      ...player,
      block: {
        ...block,
        kill,
        pos,
        exc,
        neg,
        err,
        tot: safeTot,
        efficacy: Number.isFinite(efficacy) ? efficacy : (safeTot > 0 ? +((kill / safeTot) * 100).toFixed(1) : 0),
        efficiency: Number.isFinite(efficiency) ? efficiency : (safeTot > 0 ? +(((kill - err) / safeTot) * 100).toFixed(1) : 0),
      },
    };
  });
  return { ...riepilogo, playerStats: normalizedPlayers };
}

function buildMetadataFromMVS(rawMatch = {}, sets = []) {
  const myTeam = String(rawMatch?.myTeam || rawMatch?.homeTeam || '').trim();
  const explicitOpp = String(rawMatch?.opponentTeam || '').trim();
  const homeTeam = String(rawMatch?.homeTeam || '').trim();
  const awayTeam = String(rawMatch?.awayTeam || '').trim();
  const fallbackIsHome = myTeam ? (myTeam === homeTeam || !awayTeam) : true;
  const homeAway = normalizeHomeAway(rawMatch?.homeAway, fallbackIsHome);
  const opponent = explicitOpp || (homeAway === 'home' ? awayTeam : homeTeam);
  const wins = sets.filter((setItem) => setItem.won).length;
  const losses = Math.max(0, sets.length - wins);
  const computedResult = sets.length ? `${wins}-${losses}` : '';
  return {
    teamName: myTeam,
    myTeam,
    opponent,
    date: String(rawMatch?.date || rawMatch?.matchDate || '').trim(),
    matchType: normalizeMatchType(rawMatch?.matchType || rawMatch?.eventType || ''),
    homeAway,
    phase: String(rawMatch?.phase || rawMatch?.matchPhase || '').trim(),
    location: String(rawMatch?.location || '').trim(),
    result: String(rawMatch?.finalResult || computedResult).trim(),
  };
}

function normalizeMatchFromFirestore(data = {}, docId = '') {
  const { _type, _updatedAt, ...rawMatch } = data || {};
  const hasMetadata = rawMatch?.metadata && typeof rawMatch.metadata === 'object';
  const sets = normalizeSetsForMVTA(rawMatch);
  const rosterSource = Array.isArray(rawMatch?.roster) && rawMatch.roster.length
    ? rawMatch.roster
    : (Array.isArray(rawMatch?.players) ? rawMatch.players : []);
  const roster = rosterSource.map((player) => normalizeRosterPlayer(player));

  const baseMatch = {
    ...rawMatch,
    id: rawMatch?.id || docId,
    roster,
    metadata: hasMetadata
      ? { ...(rawMatch.metadata || {}), matchType: normalizeMatchType(rawMatch?.metadata?.matchType) }
      : buildMetadataFromMVS(rawMatch, sets),
    sets,
  };

  const actionsBySet = extractActionsBySet(rawMatch);
  const hasActions = Object.values(actionsBySet).some((items) => Array.isArray(items) && items.length > 0);

  // Se ci sono azioni grezze, ricalcola SEMPRE dal motore (v2.0 — no bridging, no dati pre-calcolati)
  // Questo garantisce che il motore corretto venga sempre usato e non si ereditino
  // stats corrotte calcolate da versioni precedenti o dall'Excel.
  if (hasActions) {
    try {
      const computed = computeStatsFromMVSMatch(actionsBySet, roster);
      return {
        updatedAt: _updatedAt,
        match: {
          ...baseMatch,
          riepilogo: normalizeRiepilogoPlayerBlocks(computed?.riepilogo || {}),
          gioco: computed?.gioco || null,
          giriDiRice: computed?.giriDiRice || null,
          rallies: Array.isArray(computed?.rallies) ? computed.rallies : [],
        },
      };
    } catch (err) {
      console.error('[normalizeMatch] Engine error, returning base match:', err);
      return { match: baseMatch, updatedAt: _updatedAt };
    }
  }

  // Fallback: nessuna azione grezza disponibile (match importati solo con stats pre-calcolate)
  return {
    match: {
      ...baseMatch,
      riepilogo: normalizeRiepilogoPlayerBlocks(baseMatch?.riepilogo || {}),
    },
    updatedAt: _updatedAt,
  };
}

// ─── Match operations ────────────────────────────────────────────────────────

/**
 * Salva (crea o sovrascrive) una partita su Firestore.
 * @param {string} userId
 * @param {object} match  — oggetto parseMatchFile()
 */
export async function saveMatch(userId, match, teamId = '') {
  const ownerId = await resolveTeamOwnerId(userId);
  const nextMatch = { ...match };
  if (nextMatch?.metadata?.matchType) {
    nextMatch.metadata = {
      ...nextMatch.metadata,
      matchType: normalizeMatchType(nextMatch.metadata.matchType),
    };
  }
  const ref = matchDocRef(ownerId, match.id, teamId);
  const payload = sanitize({
    _type: 'match',
    _updatedAt: serverTimestamp(),
    ...nextMatch,
  });
  await setDoc(ref, payload);
}

/**
 * Elimina una partita da Firestore.
 * @param {string} userId
 * @param {string} matchId
 */
export async function deleteMatchFromFirestore(userId, matchId, teamId = '') {
  const ownerId = await resolveTeamOwnerId(userId);
  const ref = matchDocRef(ownerId, matchId, teamId);
  await deleteDoc(ref);
}

/**
 * Carica tutte le partite dell'utente da Firestore.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function loadAllMatches(userId, teamId = '') {
  const ownerId = await resolveTeamOwnerId(userId);
  const byKey = new Map();

  // Normalizza data per dedup: DD/MM/YYYY → YYYY-MM-DD
  const normDateForKey = (d) => {
    const s = String(d || '').trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return s.toLowerCase();
  };

  const collectNormalized = (data, docId) => {
    if (!isLikelyMatchDocument(data)) return;
    const normalized = normalizeMatchFromFirestore(data, docId);
    const normalizedMatch = normalized.match;
    const opponent = String(normalizedMatch?.metadata?.opponent || '').trim().toLowerCase();
    const date = normDateForKey(normalizedMatch?.metadata?.date);
    const homeAway = String(normalizedMatch?.metadata?.homeAway || '').trim().toLowerCase();
    const setsKey = (normalizedMatch?.sets || [])
      .map((s) => `${s?.ourScore ?? ''}-${s?.theirScore ?? ''}`)
      .join('|');
    const key = opponent && date
      ? `${date}__${opponent}__${homeAway}__${setsKey}`
      : `doc:${docId}`;
    const current = byKey.get(key);
    if (!current || timestampToMs(normalized.updatedAt) >= current.updatedAtMs) {
      byKey.set(key, { match: normalizedMatch, updatedAtMs: timestampToMs(normalized.updatedAt) });
    }
  };

  const collectFromSnapshot = (snap) => {
    snap.forEach((d) => collectNormalized(d.data(), d.id));
  };

  const resolvedTeam = String(teamId || '').trim();
  if (resolvedTeam) {
    const snap = await getDocs(teamMatchesCol(ownerId, resolvedTeam));
    collectFromSnapshot(snap);
  } else {
    const teamsSnap = await getDocs(teamsCol(ownerId));
    const allTeamIds = [];
    teamsSnap.forEach((teamDoc) => allTeamIds.push(teamDoc.id));
    await Promise.all(allTeamIds.map(async (tid) => {
      const snap = await getDocs(teamMatchesCol(ownerId, tid));
      collectFromSnapshot(snap);
    }));
  }

  return Array.from(byKey.values()).map((item) => item.match);
}

export async function loadOwnerTeams(userId = '') {
  const ownerId = await resolveTeamOwnerId(userId);
  if (!ownerId) return [];
  const snap = await getDocs(teamsCol(ownerId));
  const teams = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    teams.push({
      id: docSnap.id,
      name: String(data.name || data.teamName || docSnap.id || '').trim(),
      teamName: String(data.teamName || '').trim(),
      clubName: String(data.clubName || '').trim(),
      playersCount: Array.isArray(data.players) ? data.players.length : 0,
      _updatedAt: data._updatedAt || data.updatedAt || null,
    });
  });
  return teams.sort((a, b) => a.name.localeCompare(b.name));
}


function isLikelyMatchDocument(data = {}) {
  if (!data || typeof data !== 'object') return false;
  const typeText = String(data?._type || data?.type || '').trim().toLowerCase();
  if (typeText === 'match' || typeText === 'partita') return true;
  if (data?.metadata && typeof data.metadata === 'object') return true;
  if (data?.actionsBySet && typeof data.actionsBySet === 'object') return true;
  const sets = data?.sets;
  if (Array.isArray(sets) && sets.length > 0) return true;
  if (sets && typeof sets === 'object' && Object.keys(sets).length > 0) return true;
  const hasTeams = Boolean(String(data?.myTeam || data?.homeTeam || data?.awayTeam || data?.opponentTeam || '').trim());
  const hasDate = Boolean(String(data?.date || data?.matchDate || '').trim());
  return hasTeams && hasDate;
}

// ─── Calendar / Standings operations ─────────────────────────────────────────

/**
 * Salva il calendario e la classifica su Firestore.
 * @param {string} userId
 * @param {object[]} calendar
 * @param {object[]} standings
 */
export async function saveCalendar(userId, calendar, standings, teamId = '') {
  const ownerId = await resolveTeamOwnerId(userId);
  const teamRef = teamDocRef(ownerId, teamId);
  const calendarRef = teamCalendarDocRef(ownerId, teamId);
  const payload = sanitize({
    _updatedAt: serverTimestamp(),
    calendar,
    standings,
  });
  await Promise.all([
    setDoc(calendarRef, payload, { merge: true }),
    setDoc(teamRef, sanitize({ _updatedAt: serverTimestamp() }), { merge: true }),
  ]);
}

/**
 * Carica calendario e classifica da Firestore.
 * @param {string} userId
 * @returns {Promise<{ calendar: object[], standings: object[] } | null>}
 */
export async function loadCalendar(userId, teamId = '') {
  const ownerId = await resolveTeamOwnerId(userId);
  const calendarRef = teamCalendarDocRef(ownerId, teamId);
  const calendarSnap = await getDoc(calendarRef);
  if (calendarSnap.exists()) {
    const data = calendarSnap.data() || {};
    return {
      calendar: Array.isArray(data.calendar) ? data.calendar : [],
      standings: Array.isArray(data.standings) ? data.standings : [],
    };
  }

  const teamRef = teamDocRef(ownerId, teamId);
  const teamSnap = await getDoc(teamRef);
  if (teamSnap.exists()) {
    const data = teamSnap.data() || {};
    if (Array.isArray(data.calendar) || Array.isArray(data.standings)) {
      return {
        calendar: Array.isArray(data.calendar) ? data.calendar : [],
        standings: Array.isArray(data.standings) ? data.standings : [],
      };
    }
  }

  const legacyRef = legacyUserCalendarDocRef(ownerId, teamId);
  const legacySnap = await getDoc(legacyRef);
  if (!legacySnap.exists()) return null;
  const data = legacySnap.data() || {};
  return {
    calendar: Array.isArray(data.calendar) ? data.calendar : [],
    standings: Array.isArray(data.standings) ? data.standings : [],
  };
}

export async function clearArchiveData(userId, teamId = '') {
  const ownerId = await resolveTeamOwnerId(userId);
  const col = teamMatchesCol(ownerId, teamId);
  const snap = await getDocs(col);
  const tasks = [];
  snap.forEach((d) => tasks.push(deleteDoc(d.ref)));
  tasks.push(setDoc(teamCalendarDocRef(ownerId, teamId), sanitize({
    _updatedAt: serverTimestamp(),
    calendar: [],
    standings: [],
  }), { merge: true }));
  tasks.push(setDoc(teamDocRef(ownerId, teamId), sanitize({
    _updatedAt: serverTimestamp(),
    calendar: [],
    standings: [],
    reviews: {},
  }), { merge: true }));
  tasks.push(deleteDoc(legacyUserCalendarDocRef(ownerId, teamId)).catch(() => {}));
  await Promise.all(tasks);
}

// ─── Suggestion reviews (coach annotations) ──────────────────────────────────

const REVIEWS_DOC_ID = 'suggestion_reviews';

/**
 * Salva le revisioni dell'allenatore su Firestore.
 * @param {string} userId
 * @param {Record<string, 'visto'|'da_valutare'>} reviews  — { [suggestionKey]: status }
 */
export async function saveSuggestionReviews(userId, reviews, teamId = '') {
  const ownerId = await resolveTeamOwnerId(userId);
  const ref = teamDocRef(ownerId, teamId);
  await setDoc(ref, sanitize({
    _updatedAt: serverTimestamp(),
    reviews,
  }), { merge: true });
}

/**
 * Carica le revisioni dell'allenatore da Firestore.
 * @param {string} userId
 * @returns {Promise<Record<string, 'visto'|'da_valutare'>>}
 */
export async function loadSuggestionReviews(userId, teamId = '') {
  const ownerId = await resolveTeamOwnerId(userId);
  const ref = teamDocRef(ownerId, teamId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  return snap.data()?.reviews || {};
}

function normalizeAllowedEmails(allowedEmails = []) {
  return [...new Set(allowedEmails.map(normalizeEmail).filter(Boolean))];
}

function normalizeShareMembers(members = [], ownerEmail = '', ownerUid = '') {
  const normalizedOwnerEmail = normalizeEmail(ownerEmail);
  const owner = {
    email: normalizedOwnerEmail,
    role: 'owner',
    permission: 'write',
    status: 'active',
    uid: ownerUid || '',
  };
  const map = new Map();
  for (const member of members || []) {
    const email = normalizeEmail(member?.email);
    if (!email || email === normalizedOwnerEmail) continue;
    const role = member?.role === 'owner' ? 'owner' : 'observer';
    const permission = member?.permission === 'write' ? 'write' : 'read';
    const status = member?.status === 'suspended' ? 'suspended' : 'active';
    map.set(email, { email, role: role === 'owner' ? 'observer' : role, permission, status });
  }
  const observers = [...map.values()].sort((a, b) => a.email.localeCompare(b.email));
  return [owner, ...observers];
}

function deriveShareLists(shareMembers = []) {
  const observers = shareMembers.filter(member => member.role !== 'owner');
  const activeObservers = observers.filter(member => member.status !== 'suspended');
  const allowedEmails = activeObservers.map(member => member.email);
  const writerEmails = activeObservers.filter(member => member.permission === 'write').map(member => member.email);
  return { allowedEmails, writerEmails };
}

function buildNormalizedShareState(data = {}, ownerUid = '', ownerEmail = '') {
  const normalizedOwnerUid = data.ownerUid || ownerUid || '';
  const normalizedOwnerEmail = normalizeEmail(data.ownerEmail || ownerEmail);
  const legacyAllowedEmails = normalizeAllowedEmails(data.allowedEmails || []);
  const hasExplicitMembers = Array.isArray(data.shareMembers);
  const sourceMembers = hasExplicitMembers && data.shareMembers.length > 0
    ? data.shareMembers
    : legacyAllowedEmails.map(email => ({
      email,
      role: 'observer',
      permission: 'read',
      status: 'active',
    }));
  const shareMembers = normalizeShareMembers(sourceMembers, normalizedOwnerEmail, normalizedOwnerUid);
  const { allowedEmails, writerEmails } = deriveShareLists(shareMembers);
  const publicAccess = data.publicAccess === true || (!hasExplicitMembers && legacyAllowedEmails.length === 0);
  const enabled = data.enabled !== false;
  return {
    ownerUid: normalizedOwnerUid,
    ownerEmail: normalizedOwnerEmail,
    shareMembers,
    allowedEmails,
    writerEmails,
    publicAccess,
    enabled,
  };
}

export async function getOrCreateShareLink(ownerUid, ownerEmail) {
  const ref = shareAccessDocRef(ownerUid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    const token = data.shareToken || crypto.randomUUID().replace(/-/g, '');
    const normalized = buildNormalizedShareState(data, ownerUid, ownerEmail);
    await setDoc(ref, sanitize({
      ownerUid: normalized.ownerUid,
      shareToken: token,
      ownerEmail: normalized.ownerEmail,
      shareMembers: normalized.shareMembers,
      allowedEmails: normalized.allowedEmails,
      writerEmails: normalized.writerEmails,
      publicAccess: normalized.publicAccess,
      enabled: normalized.enabled,
      updatedAt: serverTimestamp(),
    }), { merge: true });
    await setDoc(shareTokenDocRef(token), sanitize({
      ownerUid: normalized.ownerUid,
      enabled: normalized.enabled,
      updatedAt: serverTimestamp(),
    }), { merge: true });
    return {
      token,
      ownerUid: normalized.ownerUid,
      ownerEmail: normalized.ownerEmail,
      shareMembers: normalized.shareMembers,
      allowedEmails: normalized.allowedEmails,
      writerEmails: normalized.writerEmails,
      publicAccess: normalized.publicAccess,
      enabled: normalized.enabled,
    };
  }

  const token = crypto.randomUUID().replace(/-/g, '');
  const normalizedOwnerEmail = normalizeEmail(ownerEmail);
  const shareMembers = normalizeShareMembers([], normalizedOwnerEmail, ownerUid);
  const payload = sanitize({
    ownerUid,
    shareToken: token,
    ownerEmail: normalizedOwnerEmail,
    shareMembers,
    allowedEmails: [],
    writerEmails: [],
    publicAccess: false,
    enabled: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(ref, payload);
  await setDoc(shareTokenDocRef(token), sanitize({
    ownerUid,
    enabled: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  return {
    token,
    ownerUid,
    ownerEmail: normalizedOwnerEmail,
    shareMembers,
    allowedEmails: [],
    writerEmails: [],
    publicAccess: false,
    enabled: true,
  };
}

export async function loadShareLinkForOwner(ownerUid) {
  const ref = shareAccessDocRef(ownerUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const token = data.shareToken || '';
  const normalized = buildNormalizedShareState(data, ownerUid, data.ownerEmail || '');
  return {
    token,
    ownerUid: normalized.ownerUid,
    ownerEmail: normalized.ownerEmail,
    shareMembers: normalized.shareMembers,
    allowedEmails: normalized.allowedEmails,
    writerEmails: normalized.writerEmails,
    publicAccess: normalized.publicAccess,
    enabled: normalized.enabled,
  };
}

export async function updateShareMembers(token, ownerUid, shareMembers = []) {
  const ref = shareAccessDocRef(ownerUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Link di condivisione non trovato');
  const current = snap.data();
  const currentOwnerUid = current.ownerUid || ownerUid;
  const currentToken = current.shareToken || token;
  if (currentOwnerUid !== ownerUid || currentToken !== token) throw new Error('Non autorizzato');
  const currentOwnerEmail = normalizeEmail(current.ownerEmail || '');
  const normalizedMembers = normalizeShareMembers(shareMembers, currentOwnerEmail, currentOwnerUid);
  const { allowedEmails, writerEmails } = deriveShareLists(normalizedMembers);
  const enabled = current.enabled !== false;
  await setDoc(ref, sanitize({
    ...current,
    ownerUid: currentOwnerUid,
    shareToken: currentToken,
    ownerEmail: currentOwnerEmail,
    shareMembers: normalizedMembers,
    allowedEmails,
    writerEmails,
    publicAccess: false,
    enabled,
    updatedAt: serverTimestamp(),
  }), { merge: true });
  await setDoc(shareTokenDocRef(currentToken), sanitize({
    ownerUid: currentOwnerUid,
    enabled,
    updatedAt: serverTimestamp(),
  }), { merge: true });
  return {
    token: currentToken,
    ownerUid: currentOwnerUid,
    ownerEmail: currentOwnerEmail,
    shareMembers: normalizedMembers,
    allowedEmails,
    writerEmails,
    publicAccess: false,
    enabled,
  };
}

export async function resolveSharedAccess(token, user) {
  if (!token || !user) {
    return { granted: false, reason: 'missing_context' };
  }
  let tokenSnap = await getDoc(shareTokenDocRef(token));
  // Fallback: legacy root collection per i token
  if (!tokenSnap.exists()) {
    tokenSnap = await getDoc(legacyShareTokenDocRef(token));
  }
  if (!tokenSnap.exists()) {
    return { granted: false, reason: 'not_found' };
  }
  const tokenData = tokenSnap.data();
  const tokenEnabled = tokenData.enabled !== false;
  if (!tokenEnabled || !tokenData.ownerUid) {
    return { granted: false, reason: 'disabled' };
  }
  let snap = await getDoc(shareAccessDocRef(tokenData.ownerUid));
  // Fallback: legacy root collection per share access
  if (!snap.exists()) {
    snap = await getDoc(legacyShareAccessDocRef(tokenData.ownerUid));
  }
  if (!snap.exists()) {
    return { granted: false, reason: 'not_found' };
  }
  const data = snap.data();
  const shareEnabled = data.enabled !== false;
  if (!shareEnabled) {
    return { granted: false, reason: 'disabled' };
  }
  const resolvedOwnerUid = data.ownerUid || tokenData.ownerUid;
  if (!resolvedOwnerUid) {
    return { granted: false, reason: 'disabled' };
  }
  const viewerEmail = normalizeEmail(user.email);
  const isOwner = resolvedOwnerUid === user.uid;
  const normalized = buildNormalizedShareState(data, resolvedOwnerUid, data.ownerEmail || '');
  const resolvedOwnerEmail = normalized.ownerEmail || await resolveUserEmail({ uid: resolvedOwnerUid });
  const allowedEmails = normalized.allowedEmails;
  const writerEmails = normalized.writerEmails;
  const shareMembers = normalized.shareMembers;
  const publicAccess = normalized.publicAccess;
  const memberByEmail = new Map(shareMembers.map(member => [member.email, member]));
  const viewerMember = memberByEmail.get(viewerEmail);

  // allowedEmails vuoto = link pubblico: chiunque abbia il link può accedere.
  // allowedEmails non vuoto = accesso ristretto alla lista.
  const isPublicLink = publicAccess === true;
  const isAllowedViewer = isPublicLink || allowedEmails.includes(viewerEmail);

  if (!isOwner && viewerMember?.status === 'suspended') {
    return { granted: false, reason: 'suspended', ownerUid: resolvedOwnerUid, ownerEmail: resolvedOwnerEmail };
  }

  if (!isOwner && !isAllowedViewer) {
    return { granted: false, reason: 'forbidden', ownerUid: resolvedOwnerUid, ownerEmail: resolvedOwnerEmail };
  }

  const role = isOwner ? 'owner' : 'observer';
  const canWrite = isOwner || writerEmails.includes(viewerEmail);
  const permission = canWrite ? 'write' : 'read';

  return {
    granted: true,
    ownerUid: resolvedOwnerUid,
    ownerEmail: resolvedOwnerEmail,
    token,
    isOwner,
    role,
    permission,
    canWrite,
    shareMembers,
    allowedEmails,
    writerEmails,
    publicAccess,
    isPublicLink,
  };
}

/**
 * Crea o aggiorna il documento utente in users/{usermail}.
 *
 * Logica ruolo (unica sorgente di verità = users/{usermail}.role):
 *  - Se il documento NON esiste ancora (primo login):
 *      · BOOTSTRAP_ADMIN_EMAIL → role='admin', assignedProfile='promax'
 *      · tutti gli altri       → role='user',  assignedProfile='base'
 *  - Se il documento ESISTE GIÀ:
 *      · il ruolo viene preservato (non sovrascritto)
 *      · viene aggiornato solo lastLoginAt + dati anagrafici (displayName, photoURL)
 */
export async function ensureUserAccessRecord(user) {
  if (!user?.uid) return null;
  const uid = user.uid;
  const rawEmail = String(user.email || '').trim();
  const email = normalizeEmail(rawEmail);
  if (!rawEmail) return null;
  const resolvedDocId = await resolveUserEmail({ uid, email: rawEmail });
  const ref = userProfileDocRefByEmail(resolvedDocId);

  let snap = null;
  try { snap = await getDoc(ref); } catch {}

  const isNewUser = !snap?.exists();
  const currentData = snap?.exists() ? snap.data() : {};

  // Ruolo: preservato se il documento esiste, altrimenti bootstrap
  const currentApps = currentData.apps || {};
  const currentMvta = normalizeAppProfile(
    currentApps.mvta || {},
    currentData.role,
    currentData.assignedProfile || profileFromPacchetto(currentData.pacchetto)
  );
  const currentMvs = normalizeAppProfile(
    currentApps.mvs || {},
    'user',
    'base'
  );
  const legacyMembership = normalizeMembership(currentData.appMembership);
  const legacyMvsEnabled = legacyMembership === 'mvs' || legacyMembership === 'both';
  const existingRole = normalizeUserRole(currentMvta.role || currentData.role);
  const bootstrapRole = email === BOOTSTRAP_ADMIN_EMAIL ? 'admin' : 'user';
  const role = isNewUser ? bootstrapRole : existingRole;

  // Profilo: preservato se esiste; bootstrap admin → promax, altri → base
  const existingProfile = normalizeAssignedProfile(currentMvta.assignedProfile || currentData.assignedProfile || profileFromPacchetto(currentData.pacchetto));
  const bootstrapProfile = bootstrapRole === 'admin' ? 'promax' : 'base';
  const assignedProfile = isNewUser ? bootstrapProfile : existingProfile;
  const pacchetto = normalizePacchetto(assignedProfile);
  const apps = {
    mvta: {
      enabled: true,
      role,
      assignedProfile,
      pacchetto,
    },
    mvs: {
      enabled: isNewUser ? true : (currentMvs.enabled === true || legacyMvsEnabled),
      role: currentMvs.role,
      assignedProfile: currentMvs.assignedProfile,
      pacchetto: currentMvs.pacchetto,
    },
  };
  const appMembership = computeMembership(apps);

  const payload = sanitize({
    uid,
    email,
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    appMembership,
    apps,
    role,
    pacchetto,
    assignedProfile,
    createdAt: currentData?.createdAt || serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  try {
    await setDoc(ref, payload, { merge: true });
  } catch {}

  return { uid, email, displayName: user.displayName || '', photoURL: user.photoURL || '', role, assignedProfile, pacchetto, appMembership, apps };
}

export async function loadCurrentUserAccess(uid, email = '') {
  const resolvedDocId = await resolveUserEmail({ uid, email });
  if (!resolvedDocId) return null;
  const snap = await getDoc(userProfileDocRefByEmail(resolvedDocId));
  if (!snap.exists()) return null;
  const data = snap.data();
  const apps = data.apps || {};
  const hasLegacyMvta = Boolean(data.role || data.assignedProfile || data.pacchetto);
  const mvta = normalizeAppProfile(
    { ...(apps.mvta || {}), enabled: apps.mvta?.enabled === true || hasLegacyMvta },
    data.role,
    data.assignedProfile || profileFromPacchetto(data.pacchetto)
  );
  const assignedProfile = mvta.assignedProfile;
  return {
    uid: data.uid || uid || '',
    email: normalizeEmail(data.email || resolvedDocId),
    displayName: data.displayName || '',
    photoURL: data.photoURL || '',
    appMembership: normalizeMembership(data.appMembership || computeMembership({ mvta, mvs: apps.mvs || {} })),
    apps: {
      mvta,
      mvs: normalizeAppProfile(apps.mvs || {}, 'user', 'base'),
    },
    role: mvta.role,
    pacchetto: mvta.pacchetto,
    assignedProfile,
    lastLoginAt: data.lastLoginAt || null,
  };
}

export async function loadAllUsersAccess() {
  const snap = await getDocs(usersRootCol());
  const usersByKey = new Map();
  snap.forEach((d) => {
    const data = d.data() || {};
    const apps = data.apps || {};
    const hasLegacyMvta = Boolean(data.role || data.assignedProfile || data.pacchetto);
    const mvta = normalizeAppProfile(
      { ...(apps.mvta || {}), enabled: apps.mvta?.enabled === true || hasLegacyMvta },
      data.role,
      data.assignedProfile || profileFromPacchetto(data.pacchetto)
    );
    const mvs = normalizeAppProfile(apps.mvs || {}, 'user', 'base');
    const appMembership = normalizeMembership(data.appMembership || computeMembership({ mvta, mvs }));
    if (mvta.enabled !== true) return;
    const email = normalizeEmail(data.email || d.id);
    if (!email) return;
    const user = {
      uid: data.uid || email,
      email,
      displayName: data.displayName || '',
      photoURL: data.photoURL || '',
      appMembership,
      apps: { mvta, mvs },
      role: mvta.role,
      pacchetto: mvta.pacchetto,
      assignedProfile: mvta.assignedProfile,
      lastLoginAt: data.lastLoginAt || null,
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
    };
    const key = user.email;
    const prev = usersByKey.get(key);
    if (!prev) {
      usersByKey.set(key, user);
      return;
    }
    const prevTs = timestampToMs(prev.lastLoginAt);
    const curTs = timestampToMs(user.lastLoginAt);
    if (curTs > prevTs) {
      usersByKey.set(key, user);
      return;
    }
    if (curTs === prevTs && prev.role !== 'admin' && user.role === 'admin') {
      usersByKey.set(key, user);
    }
  });
  return Array.from(usersByKey.values()).sort((a, b) => {
    const byEmail = (a.email || '').localeCompare(b.email || '');
    if (byEmail !== 0) return byEmail;
    return (a.uid || '').localeCompare(b.uid || '');
  });
}

export async function submitProfileUpgradeRequest({
  uid,
  email,
  displayName = '',
  currentProfile = 'base',
  targetProfile = 'pro',
  message = '',
}) {
  if (!uid) throw new Error('Utente non valido');
  const fallbackEmail = normalizeEmail(email);
  const userDocId = fallbackEmail || await resolveUserEmail({ uid, email });
  if (!userDocId) throw new Error('Documento utente non trovato');
  const userSnap = await getDoc(userProfileDocRefByEmail(userDocId));
  const userData = userSnap.exists() ? (userSnap.data() || {}) : {};
  const existingMvta = normalizeAppProfile(
    userData?.apps?.mvta || {},
    userData?.role,
    userData?.assignedProfile || profileFromPacchetto(userData?.pacchetto)
  );
  const currentRole = normalizeUserRole(existingMvta?.role || userData?.role);
  if (currentRole === 'admin') throw new Error('Gli utenti admin non possono inviare richieste upgrade');
  const current = normalizeAssignedProfile(currentProfile);
  const target = normalizeAssignedProfile(targetProfile);
  if (!['pro', 'promax'].includes(target)) throw new Error('Profilo richiesto non valido');
  await setDoc(userProfileDocRefByEmail(userDocId), sanitize({
    uid,
    email: fallbackEmail || normalizeEmail(userData?.email || userDocId),
    apps: {
      mvta: {
        ...existingMvta,
        enabled: true,
        upgradeRequest: {
          uid,
          email: fallbackEmail || normalizeEmail(userData?.email || userDocId),
          userDocId,
          currentProfile: current,
          targetProfile: target,
          message: String(message || '').trim(),
          status: 'pending',
          requestedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          resolvedAt: null,
          resolverUid: '',
          resolverEmail: '',
        },
      },
    },
    displayName: displayName || '',
    updatedAt: serverTimestamp(),
  }), { merge: true });
}

function normalizeUpgradeRequest(raw = {}, fallback = {}) {
  const normalized = raw && typeof raw === 'object' ? raw : {};
  const uid = String(normalized.uid || fallback.uid || '').trim();
  const email = normalizeEmail(normalized.email || fallback.email || '');
  const userDocId = normalizeEmail(normalized.userDocId || fallback.userDocId || email);
  if (!uid) return null;
  return {
    uid,
    email,
    userDocId,
    displayName: fallback.displayName || '',
    currentProfile: normalizeAssignedProfile(normalized.currentProfile || fallback.currentProfile),
    targetProfile: normalizeAssignedProfile(normalized.targetProfile),
    message: normalized.message || '',
    status: normalizeRequestStatus(normalized.status),
    requestedAt: normalized.requestedAt || null,
    updatedAt: normalized.updatedAt || null,
    resolvedAt: normalized.resolvedAt || null,
    resolverUid: normalized.resolverUid || '',
    resolverEmail: normalizeEmail(normalized.resolverEmail),
  };
}

export async function loadMyProfileUpgradeRequest(uid, email = '') {
  if (!uid && !email) return null;
  const resolvedDocId = normalizeEmail(email) || await resolveUserEmail({ uid, email });
  if (!resolvedDocId) return null;
  const snap = await getDoc(userProfileDocRefByEmail(resolvedDocId));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  const role = normalizeUserRole(data?.apps?.mvta?.role || data?.role);
  if (role === 'admin') return null;
  const fallbackProfile = normalizeAssignedProfile(data?.assignedProfile || data?.apps?.mvta?.assignedProfile);
  return normalizeUpgradeRequest(data?.apps?.mvta?.upgradeRequest, {
    uid: data?.uid || uid || '',
    email: data?.email || resolvedDocId,
    userDocId: snap.id,
    displayName: data?.displayName || '',
    currentProfile: fallbackProfile,
  });
}

export async function loadAllProfileUpgradeRequests() {
  const snap = await getDocs(usersRootCol());
  const requests = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const role = normalizeUserRole(data?.apps?.mvta?.role || data?.role);
    if (role === 'admin') return;
    const fallbackProfile = normalizeAssignedProfile(data?.assignedProfile || data?.apps?.mvta?.assignedProfile);
    const request = normalizeUpgradeRequest(data?.apps?.mvta?.upgradeRequest, {
      uid: data?.uid || '',
      email: data?.email || d.id,
      userDocId: d.id,
      displayName: data?.displayName || '',
      currentProfile: fallbackProfile,
    });
    if (request) requests.push(request);
  });
  return requests.sort((a, b) => timestampToMs(b.requestedAt) - timestampToMs(a.requestedAt));
}

export async function resolveProfileUpgradeRequest(uid, decision, resolver = {}) {
  if (!uid) throw new Error('Richiesta non valida');
  const status = decision === 'approved' ? 'approved' : 'rejected';
  const targetDocId = await resolveUserEmail({ uid });
  if (!targetDocId) throw new Error('Documento utente non trovato');
  const userSnap = await getDoc(userProfileDocRefByEmail(targetDocId));
  if (!userSnap.exists()) throw new Error('Utente non trovato');
  const userData = userSnap.data() || {};
  const fallbackProfile = normalizeAssignedProfile(userData?.assignedProfile || userData?.apps?.mvta?.assignedProfile);
  const currentRequest = normalizeUpgradeRequest(userData?.apps?.mvta?.upgradeRequest, {
    uid: userData?.uid || uid,
    email: userData?.email || targetDocId,
    userDocId: targetDocId,
    displayName: userData?.displayName || '',
    currentProfile: fallbackProfile,
  });
  if (!currentRequest) throw new Error('Richiesta non trovata');
  const target = normalizeAssignedProfile(currentRequest.targetProfile);
  const existingMvta = normalizeAppProfile(
    userData?.apps?.mvta || {},
    userData?.role,
    userData?.assignedProfile || profileFromPacchetto(userData?.pacchetto)
  );
  const nextMvta = {
    ...existingMvta,
    enabled: true,
    ...(status === 'approved' && ['pro', 'promax'].includes(target)
      ? { assignedProfile: target, pacchetto: normalizePacchetto(target) }
      : {}),
    upgradeRequest: {
      ...currentRequest,
      status,
      updatedAt: serverTimestamp(),
      resolvedAt: serverTimestamp(),
      resolverUid: resolver.uid || '',
      resolverEmail: normalizeEmail(resolver.email),
    },
  };
  const payload = sanitize({
    uid: userData?.uid || uid,
    email: normalizeEmail(userData?.email || targetDocId),
    apps: { mvta: nextMvta },
    ...(status === 'approved' && ['pro', 'promax'].includes(target)
      ? { assignedProfile: target, pacchetto: normalizePacchetto(target) }
      : {}),
    updatedAt: serverTimestamp(),
  });
  await setDoc(userProfileDocRefByEmail(targetDocId), payload, { merge: true });
}

export async function updateUserAssignedProfile(uid, assignedProfile, email = '') {
  if (!uid && !email) throw new Error('Utente non valido');
  const targetEmail = await resolveUserEmail({ uid, email });
  if (!targetEmail) throw new Error('Email utente non trovata');
  const existingSnap = await getDoc(userProfileDocRefByEmail(targetEmail));
  const existing = existingSnap.exists() ? (existingSnap.data() || {}) : {};
  const existingMvs = normalizeAppProfile(existing?.apps?.mvs || {}, 'user', 'base');
  const existingRole = normalizeUserRole(existing?.apps?.mvta?.role || existing?.role);
  const normalizedProfile = existingRole === 'admin'
    ? 'promax'
    : normalizeAssignedProfile(assignedProfile);
  const pacchetto = normalizePacchetto(normalizedProfile);
  const nextApps = {
    mvta: {
      enabled: true,
      assignedProfile: normalizedProfile,
      pacchetto,
    },
    mvs: existingMvs,
  };
  await setDoc(userProfileDocRefByEmail(targetEmail), sanitize({
    uid: uid || '',
    email: targetEmail,
    appMembership: computeMembership(nextApps),
    apps: nextApps,
    pacchetto,
    assignedProfile: normalizedProfile,
    updatedAt: serverTimestamp(),
  }), { merge: true });
}

// ─── Team News (Bacheca) ──────────────────────────────────────────────────────

const LEGACY_NEWS_COLLECTION = 'volley_team_analysis_6_0_news';

function newsDocRef(ownerUid) {
  // Nuovo path: users/{ownerUid}/news/posts
  return doc(db, MVS_USERS_ROOT, ownerUid, 'news', 'posts');
}
function legacyNewsDocRef(ownerUid) {
  return doc(db, LEGACY_NEWS_COLLECTION, ownerUid);
}

/**
 * Carica i post della bacheca per un dataset owner.
 * Restituisce un array di post ordinati per eventDate / createdAt.
 */
export async function loadTeamNews(ownerUid) {
  if (!ownerUid) return [];
  try {
    // Prova nuovo path sotto users/
    const snap = await getDoc(newsDocRef(ownerUid));
    if (snap.exists()) return snap.data()?.posts || [];
    // Fallback: legacy root collection
    const legacySnap = await getDoc(legacyNewsDocRef(ownerUid));
    if (legacySnap.exists()) return legacySnap.data()?.posts || [];
    return [];
  } catch (err) {
    if (err?.code !== 'permission-denied') {
      console.error('[News] loadTeamNews:', err);
    }
    return [];
  }
}

/**
 * Salva l'intero array di post della bacheca.
 * Sovrascrive il documento con il nuovo array.
 */
export async function saveTeamNews(ownerUid, posts) {
  if (!ownerUid) throw new Error('ownerUid mancante');
  await setDoc(newsDocRef(ownerUid), sanitize({ posts, updatedAt: serverTimestamp() }));
}

// ─── Team Offerte ─────────────────────────────────────────────────────────────

const LEGACY_OFFERS_COLLECTION = 'volley_team_analysis_6_0_offers';

function offersDocRef(ownerUid) {
  // Nuovo path: users/{ownerUid}/offers/list
  return doc(db, MVS_USERS_ROOT, ownerUid, 'offers', 'list');
}
function legacyOffersDocRef(ownerUid) {
  return doc(db, LEGACY_OFFERS_COLLECTION, ownerUid);
}

/**
 * Carica le offerte per un dataset owner.
 * Restituisce un array di offerte.
 */
export async function loadTeamOffers(ownerUid) {
  if (!ownerUid) return [];
  try {
    const snap = await getDoc(offersDocRef(ownerUid));
    if (snap.exists()) return snap.data()?.offers || [];
    // Fallback: legacy root collection
    const legacySnap = await getDoc(legacyOffersDocRef(ownerUid));
    if (legacySnap.exists()) return legacySnap.data()?.offers || [];
    return [];
  } catch (err) {
    if (err?.code !== 'permission-denied') {
      console.error('[Offers] loadTeamOffers:', err);
    }
    return [];
  }
}

/**
 * Salva l'intero array di offerte.
 * Sovrascrive il documento con il nuovo array.
 */
export async function saveTeamOffers(ownerUid, offers) {
  if (!ownerUid) throw new Error('ownerUid mancante');
  await setDoc(offersDocRef(ownerUid), sanitize({ offers, updatedAt: serverTimestamp() }));
}

// ─── User role management ─────────────────────────────────────────────────────

/**
 * Aggiorna il ruolo di un utente in users/{usermail}.
 * Unica sorgente di verità: il campo role nel documento utente.
 * Promuovendo ad admin → assignedProfile forzato a 'promax'.
 */
export async function updateUserRole(uid, role, email = '') {
  if (!uid && !email) throw new Error('Utente non valido');
  const targetEmail = await resolveUserEmail({ uid, email });
  if (!targetEmail) throw new Error('Email utente non trovata');
  const existingSnap = await getDoc(userProfileDocRefByEmail(targetEmail));
  const existing = existingSnap.exists() ? (existingSnap.data() || {}) : {};
  const existingMvs = normalizeAppProfile(existing?.apps?.mvs || {}, 'user', 'base');
  const normalizedRole = normalizeUserRole(role);
  const nextApps = {
    mvta: {
      enabled: true,
      role: normalizedRole,
      ...(normalizedRole === 'admin' ? { assignedProfile: 'promax', pacchetto: 'Promax' } : {}),
    },
    mvs: existingMvs,
  };

  const payload = sanitize({
    uid: uid || '',
    email: targetEmail,
    appMembership: computeMembership(nextApps),
    apps: nextApps,
    role: normalizedRole,
    ...(normalizedRole === 'admin'
      ? { assignedProfile: 'promax', pacchetto: 'Promax' }
      : {}),
    updatedAt: serverTimestamp(),
  });

  await setDoc(userProfileDocRefByEmail(targetEmail), payload, { merge: true });
}

export async function migrateAdminsToProMax() {
  const snap = await getDocs(usersRootCol());
  let updated = 0;
  for (const d of snap.docs) {
    const data = d.data() || {};
    const role = normalizeUserRole(data?.apps?.mvta?.role || data?.role);
    if (role !== 'admin') continue;
    const mvtaCurrent = data?.apps?.mvta || {};
    const assigned = normalizeAssignedProfile(
      mvtaCurrent.assignedProfile || data?.assignedProfile || profileFromPacchetto(mvtaCurrent.pacchetto || data?.pacchetto)
    );
    const pacchetto = normalizePacchetto(mvtaCurrent.pacchetto || data?.pacchetto);
    if (assigned === 'promax' && pacchetto === 'Promax') continue;
    const nextMvta = {
      ...mvtaCurrent,
      enabled: true,
      role: 'admin',
      assignedProfile: 'promax',
      pacchetto: 'Promax',
    };
    const nextApps = {
      ...(data?.apps || {}),
      mvta: nextMvta,
    };
    const payload = sanitize({
      role: 'admin',
      assignedProfile: 'promax',
      pacchetto: 'Promax',
      apps: nextApps,
      appMembership: computeMembership(nextApps),
      updatedAt: serverTimestamp(),
    });
    await setDoc(userProfileDocRefByEmail(d.id), payload, { merge: true });
    updated += 1;
  }
  return updated;
}

export async function recordUserLoginUsage(user, access = {}, context = {}) {
  if (!user?.uid) return;
  const uid = user.uid;
  const ref = userUsageDocRef(uid);
  let existing = {};
  try {
    let snap = await getDoc(ref);
    if (!snap.exists()) snap = await getDoc(legacyUserUsageDocRef(uid));
    existing = snap.exists() ? (snap.data() || {}) : {};
  } catch {}

  const loginCount = Math.max(0, Number(existing.loginCount || 0)) + 1;
  const payload = sanitize({
    uid,
    email: normalizeEmail(user.email),
    displayName: user.displayName || '',
    role: normalizeUserRole(access.role),
    assignedProfile: normalizeAssignedProfile(access.assignedProfile || 'base'),
    firstLoginAt: existing.firstLoginAt || serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    loginCount,
    lastSection: String(context.section || existing.lastSection || ''),
    lastAppVersion: String(context.appVersion || existing.lastAppVersion || ''),
    lastUserAgent: String(context.userAgent || existing.lastUserAgent || ''),
    sectionCounters: existing.sectionCounters || {},
    updatedAt: serverTimestamp(),
  });
  await setDoc(ref, payload, { merge: true });
}

export async function recordUserSectionUsage(uid, sectionId) {
  if (!uid || !sectionId) return;
  const ref = userUsageDocRef(uid);
  let existing = {};
  try {
    const snap = await getDoc(ref);
    existing = snap.exists() ? (snap.data() || {}) : {};
  } catch {}
  const counters = { ...(existing.sectionCounters || {}) };
  counters[sectionId] = Math.max(0, Number(counters[sectionId] || 0)) + 1;
  await setDoc(ref, sanitize({
    uid,
    sectionCounters: counters,
    lastSection: sectionId,
    lastSeenAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }), { merge: true });
}

export async function loadAllUserUsageStats() {
  const snap = await getDocs(userUsageCol());
  const rows = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    rows.push({
      uid: d.id,
      email: normalizeEmail(data.email),
      displayName: data.displayName || '',
      role: normalizeUserRole(data.role),
      assignedProfile: normalizeAssignedProfile(data.assignedProfile || 'base'),
      loginCount: Math.max(0, Number(data.loginCount || 0)),
      lastSection: data.lastSection || '',
      sectionCounters: data.sectionCounters || {},
      firstLoginAt: data.firstLoginAt || null,
      lastLoginAt: data.lastLoginAt || null,
      lastSeenAt: data.lastSeenAt || null,
      lastAppVersion: data.lastAppVersion || '',
      lastUserAgent: data.lastUserAgent || '',
      updatedAt: data.updatedAt || null,
    });
  });
  return rows.sort((a, b) => timestampToMs(b.lastSeenAt) - timestampToMs(a.lastSeenAt));
}

// ─── Admin Content globale (Sistema posts + Offerte con visibilità) ───────────
//
// Documento: volley_team_analysis_6_0_admin_content/global
//   { posts: [...], offers: [...], updatedAt }
//
// visibility shape: { mode: 'all'|'profiles'|'users', profiles?: string[], userIds?: string[] }
//   'all'      → tutti gli utenti autenticati
//   'profiles' → utenti con assignedProfile in vis.profiles
//   'users'    → utenti con uid in vis.userIds

const LEGACY_ADMIN_CONTENT_COLLECTION = 'volley_team_analysis_6_0_admin_content';
const ADMIN_CONTENT_DOC_ID = 'global';

function adminContentRef() {
  // Nuovo path: users/_admin/content/global
  return doc(db, MVS_USERS_ROOT, '_admin', 'content', ADMIN_CONTENT_DOC_ID);
}
function legacyAdminContentRef() {
  return doc(db, LEGACY_ADMIN_CONTENT_COLLECTION, ADMIN_CONTENT_DOC_ID);
}

export async function loadAdminContent() {
  try {
    const snap = await getDoc(adminContentRef());
    if (snap.exists()) {
      const data = snap.data() || {};
      return {
        posts:  Array.isArray(data.posts)  ? data.posts  : [],
        offers: Array.isArray(data.offers) ? data.offers : [],
      };
    }
    // Fallback: legacy root collection
    const legacySnap = await getDoc(legacyAdminContentRef());
    if (legacySnap.exists()) {
      const data = legacySnap.data() || {};
      return {
        posts:  Array.isArray(data.posts)  ? data.posts  : [],
        offers: Array.isArray(data.offers) ? data.offers : [],
      };
    }
    return { posts: [], offers: [] };
  } catch (err) {
    if (err?.code !== 'permission-denied') {
      console.error('[AdminContent] loadAdminContent:', err);
    }
    return { posts: [], offers: [] };
  }
}

export async function saveAdminPosts(posts) {
  await setDoc(adminContentRef(), sanitize({ posts, updatedAt: serverTimestamp() }), { merge: true });
}

export async function saveAdminOffers(offers) {
  await setDoc(adminContentRef(), sanitize({ offers, updatedAt: serverTimestamp() }), { merge: true });
}

/**
 * Restituisce true se l'item (post o offerta) è visibile all'utente.
 * Se isAdmin=true, restituisce sempre true.
 */
export function isAdminContentVisibleToUser(item, userUid, userProfile, isAdmin) {
  if (isAdmin) return true;
  const vis = item?.visibility;
  if (!vis || vis.mode === 'all') return true;
  if (vis.mode === 'profiles') {
    return Array.isArray(vis.profiles) && vis.profiles.includes(userProfile);
  }
  if (vis.mode === 'users') {
    return Array.isArray(vis.userIds) && vis.userIds.includes(userUid);
  }
  return true;
}

// ============================================================================
// 11. CONFIGURAZIONE PACCHETTI (Admin)
// ============================================================================
// Documento: users/_admin/content/package_config
//   {
//     sections: { [sectionId]: 'base'|'pro'|'promax' },
//     tabs:     { [sectionId__tabId]: 'base'|'pro'|'promax' },
//     updatedAt,
//   }
// Se un sectionId/tabId non è presente, si usa il minProfile hardcoded di default.

const PACKAGE_CONFIG_DOC_ID = 'package_config';

function packageConfigRef() {
  return doc(db, MVS_USERS_ROOT, '_admin', 'content', PACKAGE_CONFIG_DOC_ID);
}

/**
 * Carica la configurazione pacchetti da Firestore.
 * Restituisce { sections: {}, tabs: {} } (vuoto se non esiste).
 */
export async function loadPackageConfig() {
  try {
    const snap = await getDoc(packageConfigRef());
    if (snap.exists()) {
      const data = snap.data() || {};
      return {
        sections: data.sections && typeof data.sections === 'object' ? data.sections : {},
        tabs:     data.tabs     && typeof data.tabs     === 'object' ? data.tabs     : {},
      };
    }
    return { sections: {}, tabs: {} };
  } catch (err) {
    if (err?.code !== 'permission-denied') {
      console.error('[PackageConfig] loadPackageConfig:', err);
    }
    return { sections: {}, tabs: {} };
  }
}

/**
 * Salva la configurazione pacchetti su Firestore.
 * @param {{ sections: Object, tabs: Object }} config
 */
export async function savePackageConfig(config) {
  const payload = sanitize({
    sections: config?.sections || {},
    tabs:     config?.tabs     || {},
    updatedAt: serverTimestamp(),
  });
  await setDoc(packageConfigRef(), payload, { merge: false });
}
