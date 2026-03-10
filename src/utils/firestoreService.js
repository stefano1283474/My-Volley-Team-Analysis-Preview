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

function datasetsCol(userId) {
  return collection(db, ROOT, userId, 'datasets');
}

function matchDocRef(userId, matchId) {
  return doc(db, ROOT, userId, 'datasets', matchId);
}

function calendarDocRef(userId) {
  return doc(db, ROOT, userId, 'datasets', CALENDAR_DOC_ID);
}

// ─── Utility: strip undefined fields (Firestore non li accetta) ──────────────

function sanitize(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v)));
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

// ─── Suggestion reviews (coach annotations) ──────────────────────────────────

const REVIEWS_DOC_ID = '__suggestion_reviews__';

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
