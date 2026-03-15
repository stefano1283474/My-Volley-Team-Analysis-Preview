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
  setDoc, getDoc, getDocs, deleteDoc, writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ─── Path helpers ────────────────────────────────────────────────────────────

const ROOT = 'volley_team_analysis_6_0';
const CALENDAR_DOC_ID = 'calendar_meta';
const SHARED_ACCESS_COLLECTION = 'volley_team_analysis_6_0_shared_access';
const SHARE_TOKENS_COLLECTION = 'volley_team_analysis_6_0_share_tokens';
const USERS_ACCESS_COLLECTION = 'volley_team_analysis_6_0_users';
const PROFILE_REQUESTS_COLLECTION = 'volley_team_analysis_6_0_profile_requests';
const USER_USAGE_COLLECTION = 'volley_team_analysis_6_0_user_usage';
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

function profileRequestsCol() {
  return collection(db, PROFILE_REQUESTS_COLLECTION);
}

function profileRequestDocRef(uid) {
  return doc(db, PROFILE_REQUESTS_COLLECTION, uid);
}

function userUsageCol() {
  return collection(db, USER_USAGE_COLLECTION);
}

function userUsageDocRef(uid) {
  return doc(db, USER_USAGE_COLLECTION, uid);
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

function normalizeAssignedProfile(profile) {
  return PROFILE_VALUES.includes(profile) ? profile : 'base';
}

function normalizeUserRole(role) {
  return role === 'admin' ? 'admin' : 'user';
}

function normalizeRequestStatus(status) {
  return ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending';
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
 *      · tutti gli altri       → role='user',  assignedProfile='base'
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

  // Profilo: preservato se esiste; bootstrap admin → promax, altri → base
  const existingProfile = normalizeAssignedProfile(currentData.assignedProfile || 'base');
  const bootstrapProfile = bootstrapRole === 'admin' ? 'promax' : 'base';
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
  const usersByKey = new Map();
  snap.forEach((d) => {
    const data = d.data() || {};
    const user = {
      uid: d.id,
      email: normalizeEmail(data.email),
      displayName: data.displayName || '',
      photoURL: data.photoURL || '',
      role: normalizeUserRole(data.role),
      assignedProfile: normalizeAssignedProfile(data.assignedProfile),
      lastLoginAt: data.lastLoginAt || null,
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
    };
    const key = user.email || `uid:${user.uid}`;
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
  const current = normalizeAssignedProfile(currentProfile);
  const target = normalizeAssignedProfile(targetProfile);
  if (!['pro', 'promax'].includes(target)) throw new Error('Profilo richiesto non valido');
  await setDoc(profileRequestDocRef(uid), sanitize({
    uid,
    email: normalizeEmail(email),
    displayName: displayName || '',
    currentProfile: current,
    targetProfile: target,
    message: String(message || '').trim(),
    status: 'pending',
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    resolvedAt: null,
    resolverUid: '',
    resolverEmail: '',
  }), { merge: true });
}

export async function loadMyProfileUpgradeRequest(uid) {
  if (!uid) return null;
  const snap = await getDoc(profileRequestDocRef(uid));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  return {
    uid: snap.id,
    email: normalizeEmail(data.email),
    displayName: data.displayName || '',
    currentProfile: normalizeAssignedProfile(data.currentProfile),
    targetProfile: normalizeAssignedProfile(data.targetProfile),
    message: data.message || '',
    status: normalizeRequestStatus(data.status),
    requestedAt: data.requestedAt || null,
    updatedAt: data.updatedAt || null,
    resolvedAt: data.resolvedAt || null,
    resolverUid: data.resolverUid || '',
    resolverEmail: data.resolverEmail || '',
  };
}

export async function loadAllProfileUpgradeRequests() {
  const snap = await getDocs(profileRequestsCol());
  const requests = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    requests.push({
      uid: d.id,
      email: normalizeEmail(data.email),
      displayName: data.displayName || '',
      currentProfile: normalizeAssignedProfile(data.currentProfile),
      targetProfile: normalizeAssignedProfile(data.targetProfile),
      message: data.message || '',
      status: normalizeRequestStatus(data.status),
      requestedAt: data.requestedAt || null,
      updatedAt: data.updatedAt || null,
      resolvedAt: data.resolvedAt || null,
      resolverUid: data.resolverUid || '',
      resolverEmail: data.resolverEmail || '',
    });
  });
  return requests.sort((a, b) => timestampToMs(b.requestedAt) - timestampToMs(a.requestedAt));
}

export async function resolveProfileUpgradeRequest(uid, decision, resolver = {}) {
  if (!uid) throw new Error('Richiesta non valida');
  const status = decision === 'approved' ? 'approved' : 'rejected';
  const reqSnap = await getDoc(profileRequestDocRef(uid));
  if (!reqSnap.exists()) throw new Error('Richiesta non trovata');
  const reqData = reqSnap.data() || {};
  const batch = writeBatch(db);

  batch.set(profileRequestDocRef(uid), sanitize({
    status,
    updatedAt: serverTimestamp(),
    resolvedAt: serverTimestamp(),
    resolverUid: resolver.uid || '',
    resolverEmail: normalizeEmail(resolver.email),
  }), { merge: true });

  if (status === 'approved') {
    const target = normalizeAssignedProfile(reqData.targetProfile);
    if (['pro', 'promax'].includes(target)) {
      batch.set(userAccessDocRef(uid), sanitize({
        assignedProfile: target,
        updatedAt: serverTimestamp(),
      }), { merge: true });
    }
  }

  await batch.commit();
}

export async function updateUserAssignedProfile(uid, assignedProfile) {
  if (!uid) throw new Error('Utente non valido');
  const normalizedProfile = normalizeAssignedProfile(assignedProfile);
  await setDoc(userAccessDocRef(uid), sanitize({
    assignedProfile: normalizedProfile,
    updatedAt: serverTimestamp(),
  }), { merge: true });
}

// ─── Team News (Bacheca) ──────────────────────────────────────────────────────

const NEWS_COLLECTION = 'volley_team_analysis_6_0_news';

function newsDocRef(ownerUid) {
  return doc(db, NEWS_COLLECTION, ownerUid);
}

/**
 * Carica i post della bacheca per un dataset owner.
 * Restituisce un array di post ordinati per eventDate / createdAt.
 */
export async function loadTeamNews(ownerUid) {
  if (!ownerUid) return [];
  try {
    const snap = await getDoc(newsDocRef(ownerUid));
    if (!snap.exists()) return [];
    return snap.data()?.posts || [];
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

const OFFERS_COLLECTION = 'volley_team_analysis_6_0_offers';

function offersDocRef(ownerUid) {
  return doc(db, OFFERS_COLLECTION, ownerUid);
}

/**
 * Carica le offerte per un dataset owner.
 * Restituisce un array di offerte.
 */
export async function loadTeamOffers(ownerUid) {
  if (!ownerUid) return [];
  try {
    const snap = await getDoc(offersDocRef(ownerUid));
    if (!snap.exists()) return [];
    return snap.data()?.offers || [];
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

export async function recordUserLoginUsage(user, access = {}, context = {}) {
  if (!user?.uid) return;
  const uid = user.uid;
  const ref = userUsageDocRef(uid);
  let existing = {};
  try {
    const snap = await getDoc(ref);
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

const ADMIN_CONTENT_COLLECTION = 'volley_team_analysis_6_0_admin_content';
const ADMIN_CONTENT_DOC_ID = 'global';

function adminContentRef() {
  return doc(db, ADMIN_CONTENT_COLLECTION, ADMIN_CONTENT_DOC_ID);
}

export async function loadAdminContent() {
  try {
    const snap = await getDoc(adminContentRef());
    if (!snap.exists()) return { posts: [], offers: [] };
    const data = snap.data() || {};
    return {
      posts:  Array.isArray(data.posts)  ? data.posts  : [],
      offers: Array.isArray(data.offers) ? data.offers : [],
    };
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
