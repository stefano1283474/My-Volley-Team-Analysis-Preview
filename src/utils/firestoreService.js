// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Firestore Service
// Tutti i dati sono archiviati in Firestore, niente localStorage.
//
// Struttura percorso:
//   volley_team_analysis_6_0/{userId}/datasets/{docId}
//
// Documenti speciali:
//   calendar_meta → dati calendario + classifica
//
// Ogni documento match ha { _type: 'match', ...matchData }
// ============================================================================

import {
  doc, collection,
  setDoc, getDoc, getDocs, deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── Path helpers ────────────────────────────────────────────────────────────

const ROOT = 'volley_team_analysis_6_0';
const CALENDAR_DOC_ID = 'calendar_meta';
const SHARED_ACCESS_COLLECTION = 'volley_team_analysis_6_0_shared_access';
const SHARE_TOKENS_COLLECTION = 'volley_team_analysis_6_0_share_tokens';

function datasetsCol(userId) {
  return collection(db, ROOT, userId, 'datasets');
}

function matchDocRef(userId, matchId) {
  return doc(db, ROOT, userId, 'datasets', matchId);
}

function calendarDocRef(userId) {
  return doc(db, ROOT, userId, 'datasets', CALENDAR_DOC_ID);
}

function shareAccessDocRef(ownerUid) {
  return doc(db, SHARED_ACCESS_COLLECTION, ownerUid);
}

function shareTokenDocRef(token) {
  return doc(db, SHARE_TOKENS_COLLECTION, token);
}

// ─── Utility: strip undefined fields (Firestore non li accetta) ──────────────

function sanitize(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v)));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// ─── Match operations ────────────────────────────────────────────────────────

/**
 * Salva (crea o sovrascrive) una partita su Firestore.
 * @param {string} userId
 * @param {object} match  — oggetto parseMatchFile()
 */
export async function saveMatch(userId, match) {
  const ref = matchDocRef(userId, match.id);
  const payload = sanitize({
    _type: 'match',
    _updatedAt: serverTimestamp(),
    ...match,
  });
  await setDoc(ref, payload);
}

/**
 * Elimina una partita da Firestore.
 * @param {string} userId
 * @param {string} matchId
 */
export async function deleteMatchFromFirestore(userId, matchId) {
  const ref = matchDocRef(userId, matchId);
  await deleteDoc(ref);
}

/**
 * Carica tutte le partite dell'utente da Firestore.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function loadAllMatches(userId) {
  const col = datasetsCol(userId);
  const snap = await getDocs(col);
  const matches = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data._type === 'match') {
      // Rimuovi i campi interni prima di restituire
      const { _type, _updatedAt, ...match } = data;
      matches.push(match);
    }
  });
  return matches;
}

// ─── Calendar / Standings operations ─────────────────────────────────────────

/**
 * Salva il calendario e la classifica su Firestore.
 * @param {string} userId
 * @param {object[]} calendar
 * @param {object[]} standings
 */
export async function saveCalendar(userId, calendar, standings) {
  const ref = calendarDocRef(userId);
  const payload = sanitize({
    _type: 'calendar',
    _updatedAt: serverTimestamp(),
    calendar,
    standings,
  });
  await setDoc(ref, payload);
}

/**
 * Carica calendario e classifica da Firestore.
 * @param {string} userId
 * @returns {Promise<{ calendar: object[], standings: object[] } | null>}
 */
export async function loadCalendar(userId) {
  const ref = calendarDocRef(userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const { _type, _updatedAt, ...data } = snap.data();
  return data; // { calendar, standings }
}

export async function clearArchiveData(userId) {
  const col = datasetsCol(userId);
  const snap = await getDocs(col);
  const tasks = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data?._type === 'match' || data?._type === 'calendar') {
      tasks.push(deleteDoc(d.ref));
    }
  });
  await Promise.all(tasks);
}

// ─── Suggestion reviews (coach annotations) ──────────────────────────────────

const REVIEWS_DOC_ID = 'suggestion_reviews';

/**
 * Salva le revisioni dell'allenatore su Firestore.
 * @param {string} userId
 * @param {Record<string, 'visto'|'da_valutare'>} reviews  — { [suggestionKey]: status }
 */
export async function saveSuggestionReviews(userId, reviews) {
  const ref = doc(db, ROOT, userId, 'datasets', REVIEWS_DOC_ID);
  await setDoc(ref, sanitize({
    _type: 'suggestion_reviews',
    _updatedAt: serverTimestamp(),
    reviews,
  }));
}

/**
 * Carica le revisioni dell'allenatore da Firestore.
 * @param {string} userId
 * @returns {Promise<Record<string, 'visto'|'da_valutare'>>}
 */
export async function loadSuggestionReviews(userId) {
  const ref = doc(db, ROOT, userId, 'datasets', REVIEWS_DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  return snap.data().reviews || {};
}

function normalizeAllowedEmails(allowedEmails = []) {
  return [...new Set(allowedEmails.map(normalizeEmail).filter(Boolean))];
}

export async function getOrCreateShareLink(ownerUid, ownerEmail) {
  const ref = shareAccessDocRef(ownerUid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    const token = data.shareToken || crypto.randomUUID().replace(/-/g, '');
    const normalizedOwnerUid = data.ownerUid || ownerUid;
    const normalizedOwnerEmail = normalizeEmail(data.ownerEmail || ownerEmail);
    const enabled = data.enabled !== false;
    const normalizedEmails = normalizeAllowedEmails(data.allowedEmails || []);
    await setDoc(ref, sanitize({
      ownerUid: normalizedOwnerUid,
      shareToken: token,
      ownerEmail: normalizedOwnerEmail,
      allowedEmails: normalizedEmails,
      enabled,
      updatedAt: serverTimestamp(),
    }), { merge: true });
    await setDoc(shareTokenDocRef(token), sanitize({
      ownerUid: normalizedOwnerUid,
      enabled,
      updatedAt: serverTimestamp(),
    }), { merge: true });
    return {
      token,
      ownerUid: normalizedOwnerUid,
      ownerEmail: normalizedOwnerEmail,
      allowedEmails: normalizedEmails,
      enabled,
    };
  }

  const token = crypto.randomUUID().replace(/-/g, '');
  const payload = sanitize({
    ownerUid,
    shareToken: token,
    ownerEmail: normalizeEmail(ownerEmail),
    allowedEmails: [],
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
  return { token, ownerUid, ownerEmail: normalizeEmail(ownerEmail), allowedEmails: [], enabled: true };
}

export async function loadShareLinkForOwner(ownerUid) {
  const ref = shareAccessDocRef(ownerUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const token = data.shareToken || '';
  return {
    token,
    ownerUid: data.ownerUid || ownerUid,
    ownerEmail: data.ownerEmail || '',
    allowedEmails: normalizeAllowedEmails(data.allowedEmails || []),
    enabled: data.enabled !== false,
  };
}

export async function updateShareAllowedEmails(token, ownerUid, allowedEmails = []) {
  const ref = shareAccessDocRef(ownerUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Link di condivisione non trovato');
  const current = snap.data();
  const currentOwnerUid = current.ownerUid || ownerUid;
  const currentToken = current.shareToken || token;
  if (currentOwnerUid !== ownerUid || currentToken !== token) throw new Error('Non autorizzato');
  const normalizedEmails = normalizeAllowedEmails(allowedEmails);
  const enabled = current.enabled !== false;
  await setDoc(ref, sanitize({
    ...current,
    ownerUid: currentOwnerUid,
    shareToken: currentToken,
    allowedEmails: normalizedEmails,
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
    ownerEmail: current.ownerEmail || '',
    allowedEmails: normalizedEmails,
    enabled,
  };
}

export async function resolveSharedAccess(token, user) {
  if (!token || !user) {
    return { granted: false, reason: 'missing_context' };
  }
  const tokenSnap = await getDoc(shareTokenDocRef(token));
  if (!tokenSnap.exists()) {
    return { granted: false, reason: 'not_found' };
  }
  const tokenData = tokenSnap.data();
  const tokenEnabled = tokenData.enabled !== false;
  if (!tokenEnabled || !tokenData.ownerUid) {
    return { granted: false, reason: 'disabled' };
  }
  const snap = await getDoc(shareAccessDocRef(tokenData.ownerUid));
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
  const allowedEmails = normalizeAllowedEmails(data.allowedEmails || []);

  // allowedEmails vuoto = link pubblico: chiunque abbia il link può accedere.
  // allowedEmails non vuoto = accesso ristretto alla lista.
  const isPublicLink = allowedEmails.length === 0;
  const isAllowedViewer = isPublicLink || allowedEmails.includes(viewerEmail);

  if (!isOwner && !isAllowedViewer) {
    return { granted: false, reason: 'forbidden', ownerUid: resolvedOwnerUid, ownerEmail: data.ownerEmail || '' };
  }
  return {
    granted: true,
    ownerUid: resolvedOwnerUid,
    ownerEmail: data.ownerEmail || '',
    token,
    isOwner,
    allowedEmails,
    isPublicLink,
  };
}
