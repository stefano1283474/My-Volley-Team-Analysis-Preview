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
//
// Gestione ruoli:
//   Unica sorgente di verità → volley_team_analysis_6_0_users/{uid}.role
//   Valori: 'admin' | 'user'
//   Bootstrap admin: peraimodel@gmail.com ottiene role='admin' al primo login
//   (se il documento non esiste ancora). Logins successivi non sovrascrivono il ruolo.
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
const USERS_ACCESS_COLLECTION = 'volley_team_analysis_6_0_users';
const PROFILE_VALUES = ['base', 'pro', 'promax'];
// Email di bootstrap: ottiene role='admin' automaticamente al PRIMO login.
// Logins successivi non sovrascrivono il ruolo (già nel documento).
const BOOTSTRAP_ADMIN_EMAIL = 'peraimodel@gmail.com';

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

function usersAccessCol() {
  return collection(db, USERS_ACCESS_COLLECTION);
}

function userAccessDocRef(uid) {
  return doc(db, USERS_ACCESS_COLLECTION, uid);
}

// ─── Utility: strip undefined fields (Firestore non li accetta) ──────────────

function sanitize(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v)));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeAssignedProfile(profile) {
  return PROFILE_VALUES.includes(profile) ? profile : 'pro';
}

function normalizeUserRole(role) {
  return role === 'admin' ? 'admin' : 'user';
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
  const normalized = buildNormalizedShareState(data, resolvedOwnerUid, data.ownerEmail || '');
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
    return { granted: false, reason: 'suspended', ownerUid: resolvedOwnerUid, ownerEmail: data.ownerEmail || '' };
  }

  if (!isOwner && !isAllowedViewer) {
    return { granted: false, reason: 'forbidden', ownerUid: resolvedOwnerUid, ownerEmail: data.ownerEmail || '' };
  }

  const role = isOwner ? 'owner' : 'observer';
  const canWrite = isOwner || writerEmails.includes(viewerEmail);
  const permission = canWrite ? 'write' : 'read';

  return {
    granted: true,
    ownerUid: resolvedOwnerUid,
    ownerEmail: data.ownerEmail || '',
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
 * Crea o aggiorna il documento utente in volley_team_analysis_6_0_users/{uid}.
 *
 * Logica ruolo (unica sorgente di verità = users/{uid}.role):
 *  - Se il documento NON esiste ancora (primo login):
 *      · BOOTSTRAP_ADMIN_EMAIL → role='admin', assignedProfile='promax'
 *      · tutti gli altri       → role='user',  assignedProfile='pro'
 *  - Se il documento ESISTE GIÀ:
 *      · il ruolo viene preservato (non sovrascritto)
 *      · viene aggiornato solo lastLoginAt + dati anagrafici (displayName, photoURL)
 */
export async function ensureUserAccessRecord(user) {
  if (!user?.uid) return null;
  const uid = user.uid;
  const email = normalizeEmail(user.email);
  const ref = userAccessDocRef(uid);

  let snap = null;
  try { snap = await getDoc(ref); } catch {}

  const isNewUser = !snap?.exists();
  const currentData = snap?.exists() ? snap.data() : {};

  // Ruolo: preservato se il documento esiste, altrimenti bootstrap
  const existingRole = normalizeUserRole(currentData.role);
  const bootstrapRole = email === BOOTSTRAP_ADMIN_EMAIL ? 'admin' : 'user';
  const role = isNewUser ? bootstrapRole : existingRole;

  // Profilo: preservato se esiste; bootstrap admin → promax, altri → pro
  const existingProfile = normalizeAssignedProfile(currentData.assignedProfile || 'pro');
  const bootstrapProfile = bootstrapRole === 'admin' ? 'promax' : 'pro';
  const assignedProfile = isNewUser ? bootstrapProfile : existingProfile;

  const payload = sanitize({
    uid,
    email,
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    role,
    assignedProfile,
    createdAt: currentData?.createdAt || serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  try {
    await setDoc(ref, payload, { merge: true });
  } catch {}

  return { uid, email, displayName: user.displayName || '', photoURL: user.photoURL || '', role, assignedProfile };
}

export async function loadCurrentUserAccess(uid) {
  if (!uid) return null;
  const snap = await getDoc(userAccessDocRef(uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid,
    email: normalizeEmail(data.email),
    displayName: data.displayName || '',
    photoURL: data.photoURL || '',
    role: normalizeUserRole(data.role),
    assignedProfile: normalizeAssignedProfile(data.assignedProfile),
    lastLoginAt: data.lastLoginAt || null,
  };
}

export async function loadAllUsersAccess() {
  const snap = await getDocs(usersAccessCol());
  const users = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    users.push({
      uid: d.id,
      email: normalizeEmail(data.email),
      displayName: data.displayName || '',
      photoURL: data.photoURL || '',
      role: normalizeUserRole(data.role),
      assignedProfile: normalizeAssignedProfile(data.assignedProfile),
      lastLoginAt: data.lastLoginAt || null,
    });
  });
  return users.sort((a, b) => {
    const byEmail = (a.email || '').localeCompare(b.email || '');
    if (byEmail !== 0) return byEmail;
    return (a.uid || '').localeCompare(b.uid || '');
  });
}

export async function updateUserAssignedProfile(uid, assignedProfile) {
  if (!uid) throw new Error('Utente non valido');
  const normalizedProfile = normalizeAssignedProfile(assignedProfile);
  await setDoc(userAccessDocRef(uid), sanitize({
    assignedProfile: normalizedProfile,
    updatedAt: serverTimestamp(),
  }), { merge: true });
}

/**
 * Aggiorna il ruolo di un utente in volley_team_analysis_6_0_users/{uid}.
 * Unica sorgente di verità: il campo role nel documento utente.
 * Promuovendo ad admin → assignedProfile forzato a 'promax'.
 */
export async function updateUserRole(uid, role) {
  if (!uid) throw new Error('Utente non valido');
  const normalizedRole = normalizeUserRole(role);

  const payload = sanitize({
    role: normalizedRole,
    ...(normalizedRole === 'admin' ? { assignedProfile: 'promax' } : {}),
    updatedAt: serverTimestamp(),
  });

  await setDoc(userAccessDocRef(uid), payload, { merge: true });
}
