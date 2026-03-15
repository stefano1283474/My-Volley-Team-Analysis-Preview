// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Main App
// Auth: Google Sign-In (Firebase Auth)
// Storage: Firestore esclusivamente — nessun dato in locale
// ============================================================================

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { parseMatchFile, parseCalendarCSV, computeStandings } from './utils/dataParser';
import {
  reconstructOpponent, computeMatchWeight, computeFundamentalWeights,
  computeWeightedPlayerStats, computePlayerTrends, generateTrainingSuggestions,
  analyzeRallyChains, generateMatchReport, findOpponentStanding,
  computeFundamentalBaselines,
  analyzeRDtoAConversions, analyzeSideOutVsTransition, analyzeServeDefenseChain,
  analyzeRallyLengthPerformance, analyzeRotationalChains, generateChainSuggestions,
  analyzeSetterDistribution,
  buildSetterDiagnostics,
} from './utils/analyticsEngine';
import { APP_NAME, APP_VERSION, DEFAULT_WEIGHTS, DEFAULT_FNC_CONFIG, DEFAULT_PROFILE, TEAM_MAP, FUNDAMENTALS, COLORS, SCALE_DESCRIPTIONS } from './utils/constants';
import {
  saveMatch,
  deleteMatchFromFirestore,
  clearArchiveData,
  loadAllMatches,
  saveCalendar,
  loadCalendar,
  getOrCreateShareLink,
  loadShareLinkForOwner,
  updateShareMembers,
  resolveSharedAccess,
  ensureUserAccessRecord,
  loadCurrentUserAccess,
  loadAllUsersAccess,
  updateUserAssignedProfile,
  updateUserRole,
  submitProfileUpgradeRequest,
  loadMyProfileUpgradeRequest,
  loadAllProfileUpgradeRequests,
  resolveProfileUpgradeRequest,
  recordUserLoginUsage,
  recordUserSectionUsage,
  loadAllUserUsageStats,
  loadTeamNews,
  saveTeamNews,
  loadTeamOffers,
  saveTeamOffers,
  loadAdminContent,
  saveAdminPosts,
  saveAdminOffers,
  isAdminContentVisibleToUser,
} from './utils/firestoreService';
import { useAuth } from './context/AuthContext';
import { PinProvider } from './context/PinContext';
import { ProfileProvider } from './context/ProfileContext';
import DataModeSelector from './components/DataModeSelector';

import Dashboard from './components/Dashboard';
import ChartsExplorer, { DEFAULT_DASHBOARD_CONFIG } from './components/ChartsExplorer';
import MatchReport from './components/MatchReport';
import PlayerCard from './components/PlayerCard';
import ConfigPanel from './components/ConfigPanel';
import DatasetManager, { CalendarSection } from './components/DatasetManager';
import TrainingSuggestions from './components/TrainingSuggestions';
import SequenceAnalysis, { ChainTrainingPlan } from './components/SequenceAnalysis';
import TeamTrends from './components/TeamTrends';
import RotationAnalysis from './components/RotationAnalysis';
import AttackAnalysis from './components/AttackAnalysis';
import LoginPage from './components/LoginPage';
import Glossary from './components/Glossary';
import TrainPage from './components/TrainPage';
import TeamAnalysis from './components/TeamAnalysis';
import GiocoAnalysis from './components/GiocoAnalysis';
import GuidePage from './components/GuidePage';
import AdminUsersPanel from './components/AdminUsersPanel';
import AdminRequestsPanel from './components/AdminRequestsPanel';
import AdminContentPanel from './components/AdminContentPanel';
import AdminUsageStatsPanel from './components/AdminUsageStatsPanel';
import MatchStats from './components/MatchStats';

// ─── Profile system ───────────────────────────────────────────────────────────
const PROFILE_ORDER = { base: 0, pro: 1, promax: 2 };
const PROFILE_META = {
  base:   { label: 'Base',    color: '#2563EB', bg: 'rgba(37,99,235,0.15)',  border: 'rgba(37,99,235,0.4)'  },
  pro:    { label: 'Pro',     color: '#7C3AED', bg: 'rgba(124,58,237,0.15)', border: 'rgba(124,58,237,0.4)' },
  promax: { label: 'Pro Max', color: '#DC2626', bg: 'rgba(220,38,38,0.15)',  border: 'rgba(220,38,38,0.4)'  },
};

// ─── Navigation structure ─────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'home',        label: 'Home',        icon: '🏠', minProfile: 'base' },
  { id: 'analisi',     label: 'Analisi',     icon: '🔬', minProfile: 'base' },
  { id: 'matchstats',  label: 'Match-stats', icon: '📋', minProfile: 'base' },
  { id: 'evidenze',    label: 'Evidenze',    icon: '📈', minProfile: 'pro'  },
  { id: 'training',    label: 'Training',    icon: '🏋️', minProfile: 'base' },
  { id: 'sistema',     label: 'Sistema',     icon: '⚙️', minProfile: 'base' },
  { id: 'admin_users',    label: 'Gestione Utenti',    icon: '🛡️', minProfile: 'base' },
  { id: 'admin_requests', label: 'Richieste Upgrade',  icon: '📨', minProfile: 'base' },
  { id: 'admin_content',  label: 'Bacheca & Offerte',  icon: '📋', minProfile: 'base' },
  { id: 'admin_stats',    label: 'Statistiche Utilizzo', icon: '📊', minProfile: 'base' },
];
const ADMIN_SECTION_IDS = ['admin', 'admin_users', 'admin_requests', 'admin_content', 'admin_stats'];

const SECTION_TABS = {
  analisi: [
    { id: 'partite',    label: 'Partite',    icon: '⚡', minProfile: 'base'   },
    { id: 'giocatrici', label: 'Giocatrici', icon: '★',  minProfile: 'base'   },
    { id: 'squadra',    label: 'Squadra',    icon: '🛡', minProfile: 'pro'    },
    { id: 'avversari',  label: 'Avversari',  icon: '🎯', minProfile: 'pro'    },
    { id: 'gioco',      label: 'Gioco',      icon: '🏐', minProfile: 'promax' },
  ],
  evidenze: [
    { id: 'suggerimenti', label: 'Suggerimenti', icon: '💡', minProfile: 'pro'    },
    { id: 'trend',        label: 'Trend',        icon: '↗',  minProfile: 'pro'    },
    { id: 'rotazioni',    label: 'Rotazioni',    icon: '⟳',  minProfile: 'pro'    },
    { id: 'attacco',      label: 'Attacco',      icon: '⚔', minProfile: 'pro'    },
    { id: 'catene',       label: 'Catene',       icon: '🧠', minProfile: 'promax' },
  ],
  training: [
    { id: 'suggerimenti', label: 'Suggerimenti', icon: '💡', minProfile: 'base'   },
    { id: 'settimana',    label: 'Settimana',    icon: '📅', minProfile: 'pro'    },
    { id: 'piano',        label: 'Piano',        icon: '🔗', minProfile: 'promax' },
  ],
  sistema: [
    { id: 'tipologia', label: 'Tipologia Gare', icon: '🏷', minProfile: 'base'   },
    { id: 'dati',      label: 'Dati',           icon: '☰',  minProfile: 'base'   },
    { id: 'guida',     label: 'Guida',          icon: '❓', minProfile: 'base'   },
    { id: 'glossario', label: 'Glossario',      icon: '📖', minProfile: 'base'   },
    { id: 'config',    label: 'Config',         icon: '🔧', minProfile: 'pro'    },
    { id: 'grafici',   label: 'Grafici',        icon: '📊', minProfile: 'promax' },
  ],
};

const getVisibleSectionIdsByProfile = (profile) =>
  SECTIONS
    .filter(section => PROFILE_ORDER[profile] >= PROFILE_ORDER[section.minProfile])
    .map(section => section.id);

const getVisibleTabIdsByProfile = (sectionId, profile) =>
  (SECTION_TABS[sectionId] || [])
    .filter(tab => PROFILE_ORDER[profile] >= PROFILE_ORDER[tab.minProfile])
    .map(tab => tab.id);

const normalizeTeamName = (name) => String(name || '').trim().toUpperCase();
const NEWS_SEEN_STORAGE_PREFIX = 'vpa_news_seen_v1_';
const NEWS_SEEN_MAX_KEYS = 1200;
const SIDEBAR_WIDTH_STORAGE_KEY = 'vpa_sidebar_width';
const SIDEBAR_WIDTH_MIN = 176;
const SIDEBAR_WIDTH_MAX = 420;
const SIDEBAR_WIDTH_DEFAULT = 176;

function getNewsSeenStorageKey(uid) {
  return `${NEWS_SEEN_STORAGE_PREFIX}${String(uid || '').trim()}`;
}

function normalizeSeenCategoryMap(value) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  Object.entries(value).forEach(([k, v]) => {
    if (!v || typeof v !== 'object') return;
    out[String(k)] = !!v;
  });
  return out;
}

function normalizeNewsSeenState(value) {
  const src = (value && typeof value === 'object') ? value : {};
  return {
    sistema: normalizeSeenCategoryMap(src.sistema),
    offerte: normalizeSeenCategoryMap(src.offerte),
  };
}

function readNewsSeenState(uid) {
  if (!uid) return normalizeNewsSeenState({});
  try {
    const raw = localStorage.getItem(getNewsSeenStorageKey(uid));
    return normalizeNewsSeenState(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeNewsSeenState({});
  }
}

function writeNewsSeenState(uid, state) {
  if (!uid) return;
  try {
    localStorage.setItem(getNewsSeenStorageKey(uid), JSON.stringify(normalizeNewsSeenState(state)));
  } catch {}
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return Number.isFinite(d?.getTime?.()) ? d.getTime() : 0;
  }
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function buildPostNotificationId(post) {
  const baseId = String(post?.id || post?.metaKey || '').trim();
  if (baseId) return `post:${baseId}`;
  const title = String(post?.title || post?.text || post?.summary || '').trim();
  const stamp = toMillis(post?.createdAt) || toMillis(post?.eventDate) || 0;
  return `post:${title}:${stamp}`;
}

function buildOfferNotificationId(offer) {
  const baseId = String(offer?.id || '').trim();
  if (baseId) return `offer:${baseId}`;
  const title = String(offer?.title || offer?.name || offer?.description || '').trim();
  const stamp = toMillis(offer?.createdAt) || toMillis(offer?.updatedAt) || toMillis(offer?.validUntil) || 0;
  return `offer:${title}:${stamp}`;
}

function applySeenForIds(prevMap, ids) {
  const next = { ...(prevMap || {}) };
  ids.forEach((id) => {
    const key = String(id || '').trim();
    if (!key) return;
    next[key] = true;
  });
  const keys = Object.keys(next);
  if (keys.length <= NEWS_SEEN_MAX_KEYS) return next;
  const trimmed = {};
  keys.slice(keys.length - NEWS_SEEN_MAX_KEYS).forEach((k) => { trimmed[k] = true; });
  return trimmed;
}

function findStandingTeamName(standings, teamName) {
  const clean = normalizeTeamName(teamName);
  if (!clean || !standings?.length) return '';
  const found = standings.find(t =>
    normalizeTeamName(t.name) === clean ||
    normalizeTeamName(t.name).includes(clean) ||
    clean.includes(normalizeTeamName(t.name))
  );
  return found?.name || '';
}

export default function App() {
  const { user, authLoading, signOut } = useAuth();
  const [shareToken] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('share') || '';
    } catch {
      return '';
    }
  });

  // ─── State ────────────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState(() => {
    try { return localStorage.getItem('vpa_active_section') || 'home'; } catch { return 'home'; }
  });
  const [activeSubTabs, setActiveSubTabs] = useState(() => {
    try {
      const saved = localStorage.getItem('vpa_active_subtabs');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [activeProfile, setActiveProfile] = useState(() => {
    try { return localStorage.getItem('vpa_active_profile') || 'pro'; } catch { return 'pro'; }
  });
  const [matches, setMatches]             = useState([]);
  const [calendar, setCalendar]           = useState([]);
  const [standings, setStandings]         = useState([]);
  const [weights, setWeights]             = useState(DEFAULT_WEIGHTS);
  const [dataMode, setDataMode]           = useState('raw');
  const [capFilterEnabled, setCapFilterEnabled] = useState(() => {
    try { return localStorage.getItem('vpa_cap_filter_enabled') === '1'; } catch { return false; }
  });
  const [capMinPriority, setCapMinPriority] = useState(() => {
    try {
      const v = Number(localStorage.getItem('vpa_cap_min_priority'));
      return Number.isFinite(v) ? Math.min(5, Math.max(1, Math.round(v))) : 2;
    } catch { return 2; }
  });
  const [capMaxPriority, setCapMaxPriority] = useState(() => {
    try {
      const v = Number(localStorage.getItem('vpa_cap_max_priority'));
      return Number.isFinite(v) ? Math.min(5, Math.max(1, Math.round(v))) : 4;
    } catch { return 4; }
  });

  // ── Match-type / home-away filter ─────────────────────────────────────────
  const [filterMatchType, setFilterMatchType] = useState(() => {
    try { return localStorage.getItem('vpa_filter_match_type') || 'Campionato'; } catch { return 'Campionato'; }
  });
  const [filterHomeAway, setFilterHomeAway] = useState(() => {
    try { return localStorage.getItem('vpa_filter_home_away') || 'all'; } catch { return 'all'; }
  });

  // ── FNC & Profile state ──────────────────────────────────────────────────
  const [fncConfig, setFncConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('vpa_fnc_config');
      return saved ? { ...DEFAULT_FNC_CONFIG, ...JSON.parse(saved) } : { ...DEFAULT_FNC_CONFIG };
    } catch { return { ...DEFAULT_FNC_CONFIG }; }
  });

  const [savedProfiles, setSavedProfiles] = useState(() => {
    try {
      const saved = localStorage.getItem('vpa_saved_profiles');
      const parsed = saved ? JSON.parse(saved) : [];
      // always include DEFAULT_PROFILE as first item
      if (!parsed.find(p => p.id === 'default')) {
        return [DEFAULT_PROFILE, ...parsed];
      }
      return parsed;
    } catch { return [DEFAULT_PROFILE]; }
  });

  const [activeProfileId, setActiveProfileId] = useState('default');

  // Detect unsaved changes vs active profile
  const hasUnsavedChanges = (() => {
    const activeProfile = savedProfiles.find(p => p.id === activeProfileId);
    if (!activeProfile) return false;
    const wMatch = JSON.stringify(weights) === JSON.stringify(activeProfile.matchWeights);
    const fMatch = JSON.stringify(fncConfig) === JSON.stringify(activeProfile.fncConfig);
    return !wMatch || !fMatch;
  })();

  // Persist fncConfig to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem('vpa_fnc_config', JSON.stringify(fncConfig)); } catch {}
  }, [fncConfig]);
  useEffect(() => {
    try { localStorage.setItem('vpa_cap_filter_enabled', capFilterEnabled ? '1' : '0'); } catch {}
  }, [capFilterEnabled]);
  useEffect(() => {
    try { localStorage.setItem('vpa_cap_min_priority', String(capMinPriority)); } catch {}
  }, [capMinPriority]);
  useEffect(() => {
    try { localStorage.setItem('vpa_cap_max_priority', String(capMaxPriority)); } catch {}
  }, [capMaxPriority]);

  const handleFncConfigChange = useCallback((updater) => {
    setFncConfig(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return next;
    });
  }, []);

  const handleProfileLoad = useCallback((profileId) => {
    const profile = savedProfiles.find(p => p.id === profileId);
    if (!profile) return;
    setWeights({ ...profile.matchWeights });
    setFncConfig({ ...profile.fncConfig });
    setActiveProfileId(profileId);
  }, [savedProfiles]);

  const handleProfileSave = useCallback((name) => {
    const id = `profile_${Date.now()}`;
    const newProfile = { id, name, matchWeights: { ...weights }, fncConfig: { ...fncConfig } };
    setSavedProfiles(prev => {
      const updated = [...prev, newProfile];
      try { localStorage.setItem('vpa_saved_profiles', JSON.stringify(updated)); } catch {}
      return updated;
    });
    setActiveProfileId(id);
  }, [weights, fncConfig]);

  const handleProfileDelete = useCallback((profileId) => {
    if (profileId === 'default') return;
    setSavedProfiles(prev => {
      const updated = prev.filter(p => p.id !== profileId);
      try { localStorage.setItem('vpa_saved_profiles', JSON.stringify(updated)); } catch {}
      return updated;
    });
    setActiveProfileId('default');
    handleProfileLoad('default');
  }, [handleProfileLoad]);

  const handleProfileReset = useCallback(() => {
    setWeights({ ...DEFAULT_WEIGHTS });
    setFncConfig({ ...DEFAULT_FNC_CONFIG });
    setActiveProfileId('default');
  }, []);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [matchReportIntent, setMatchReportIntent] = useState({ opponent: '', openCommentTick: 0 });
  const [isLoading, setIsLoading]         = useState(false);
  const [loadingMsg, setLoadingMsg]       = useState('');
  const [errorMsg, setErrorMsg]           = useState('');
  const [dataLoaded, setDataLoaded]       = useState(false); // Firestore loaded once
  const [uploadProgress, setUploadProgress] = useState([]);
  const [shareInfo, setShareInfo] = useState(null);
  const [sharedAccess, setSharedAccess] = useState(null);
  const [userAccess, setUserAccess] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsageStats, setAdminUsageStats] = useState([]);
  const [profileRequests, setProfileRequests] = useState([]);
  const [isAdminSaving, setIsAdminSaving] = useState(false);
  const [isRequestSaving, setIsRequestSaving] = useState(false);
  const [adminViewMode, setAdminViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem('vpa_admin_view_mode');
      return saved === 'user' ? 'user' : 'admin';
    } catch {
      return 'admin';
    }
  });
  const [myProfileRequest, setMyProfileRequest] = useState(null);
  const [requestTargetProfile, setRequestTargetProfile] = useState('pro');
  const [requestMessage, setRequestMessage] = useState('');
  const [isAccessReady, setIsAccessReady] = useState(false);
  const [newsSeenByCategory, setNewsSeenByCategory] = useState(() => normalizeNewsSeenState({}));
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const [isMobilePortrait, setIsMobilePortrait] = useState(() => {
    try {
      return window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches;
    } catch {
      return false;
    }
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const parsed = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
      if (!Number.isFinite(parsed)) return SIDEBAR_WIDTH_DEFAULT;
      return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(parsed)));
    } catch {
      return SIDEBAR_WIDTH_DEFAULT;
    }
  });
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [sidebarLabelOverflowMap, setSidebarLabelOverflowMap] = useState({});
  const swipeStartRef = useRef(null);
  const sidebarResizeStartRef = useRef(null);
  const lastTrackedSectionRef = useRef('');
  const [profileReveal, setProfileReveal] = useState({ sections: [], tabs: [] });
  const [ownerTeamName, setOwnerTeamName] = useState(() => {
    try { return localStorage.getItem('vpa_owner_team') || ''; } catch { return ''; }
  });

  // ─── Dashboard personalizzata — config persistita in localStorage ─────────
  const [dashboardConfig, setDashboardConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('vpa_dashboard_config');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_DASHBOARD_CONFIG;
  });

  const handleDashboardConfigChange = (newConfig) => {
    setDashboardConfig(newConfig);
    try { localStorage.setItem('vpa_dashboard_config', JSON.stringify(newConfig)); } catch {}
  };

  const isSharedMode = !!shareToken;
  const canEditDataset = !!user && (!isSharedMode || !!sharedAccess?.canWrite || !!sharedAccess?.isOwner);
  const canManageShare = !!user && (!isSharedMode || !!sharedAccess?.isOwner);
  const dataOwnerUid = isSharedMode ? (sharedAccess?.ownerUid || null) : (user?.uid || null);
  const shareUrl = shareInfo?.token
    ? `${window.location.origin}${window.location.pathname}?share=${shareInfo.token}`
    : '';
  const isAdmin = userAccess?.role === 'admin';
  const canUseAdminUi = isAdmin && adminViewMode === 'admin';
  const assignedProfile = userAccess?.assignedProfile || 'base';
  const availableUpgradeTargets = useMemo(
    () => Object.keys(PROFILE_META).filter(p => PROFILE_ORDER[p] > PROFILE_ORDER[assignedProfile]),
    [assignedProfile]
  );

  useEffect(() => {
    if (availableUpgradeTargets.length === 0) return;
    if (availableUpgradeTargets.includes(requestTargetProfile)) return;
    setRequestTargetProfile(availableUpgradeTargets[0]);
  }, [availableUpgradeTargets, requestTargetProfile]);

  // ─── Team News (bacheca) ──────────────────────────────────────────────────
  const [teamNews, setTeamNews] = useState([]);
  const toMs = useCallback((ts) => {
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
    if (!d || Number.isNaN(d.getTime())) return 0;
    return d.getTime();
  }, []);
  const formatItDateTime = useCallback((ts) => {
    const ms = toMs(ts);
    if (!ms) return '';
    try {
      return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms));
    } catch {
      return '';
    }
  }, [toMs]);
  const handleNewsChange = useCallback(async (newPosts) => {
    const ownerUid = isSharedMode ? (sharedAccess?.ownerUid || null) : (user?.uid || null);
    if (!ownerUid) return;
    setTeamNews(newPosts);
    try { await saveTeamNews(ownerUid, newPosts); } catch (err) {
      console.error('[App] saveTeamNews:', err);
    }
  }, [isSharedMode, sharedAccess, user]);

  const addSystemNotification = useCallback(async ({ metaKey, type = 'comunicazione', text }) => {
    if (!metaKey || !text) return;
    const ownerUid = isSharedMode ? (sharedAccess?.ownerUid || null) : (user?.uid || null);
    if (!ownerUid) return;
    const exists = teamNews.some((p) => p?.metaKey === metaKey);
    if (exists) return;
    const nextPost = {
      id: `sys_${metaKey}`,
      metaKey,
      type,
      text,
      eventDate: null,
      createdAt: new Date().toISOString(),
      authorEmail: 'sistema@auto',
    };
    const next = [...teamNews, nextPost];
    setTeamNews(next);
    try { await saveTeamNews(ownerUid, next); } catch (err) {
      console.error('[App] saveSystemNotification:', err);
    }
  }, [isSharedMode, sharedAccess, user, teamNews]);

  const profileLabel = useCallback((profile) => (
    profile === 'promax' ? 'Pro Max' : profile === 'pro' ? 'Pro' : 'Base'
  ), []);

  // ─── Team Offerte (legacy per-user — mantenuto per backward compat) ───────
  const [teamOffers, setTeamOffers] = useState([]);
  const handleOffersChange = useCallback(async (newOffers) => {
    const ownerUid = isSharedMode ? (sharedAccess?.ownerUid || null) : (user?.uid || null);
    if (!ownerUid) return;
    setTeamOffers(newOffers);
    try { await saveTeamOffers(ownerUid, newOffers); } catch (err) {
      console.error('[App] saveTeamOffers:', err);
    }
  }, [isSharedMode, sharedAccess, user]);

  // ─── Admin Content globale (Sistema posts + Offerte con visibilità) ───────
  const [adminPosts,  setAdminPosts]  = useState([]);
  const [adminOffers, setAdminOffers] = useState([]);

  // Carica admin content quando l'utente è autenticato
  useEffect(() => {
    if (!user?.uid) return;
    loadAdminContent().then(({ posts, offers }) => {
      setAdminPosts(posts   || []);
      setAdminOffers(offers || []);
    }).catch(err => console.warn('[App] loadAdminContent:', err));
  }, [user?.uid]);

  // Handler admin per posts (salva su admin_content/global)
  const handleAdminPostsChange = useCallback(async (newPosts) => {
    if (!isAdmin) return;
    setAdminPosts(newPosts);
    try { await saveAdminPosts(newPosts); } catch (err) {
      console.error('[App] saveAdminPosts:', err);
    }
  }, [isAdmin]);

  // Handler admin per offerte (salva su admin_content/global)
  const handleAdminOffersChange = useCallback(async (newOffers) => {
    if (!isAdmin) return;
    setAdminOffers(newOffers);
    try { await saveAdminOffers(newOffers); } catch (err) {
      console.error('[App] saveAdminOffers:', err);
    }
  }, [isAdmin]);

  // Posts filtrati per l'utente corrente (admin vede tutto)
  const filteredAdminPosts = useMemo(() =>
    adminPosts.filter(p => isAdminContentVisibleToUser(p, user?.uid, assignedProfile, isAdmin)),
  [adminPosts, user?.uid, assignedProfile, isAdmin]);

  // Offerte filtrate per l'utente corrente
  const filteredAdminOffers = useMemo(() =>
    adminOffers.filter(o => isAdminContentVisibleToUser(o, user?.uid, assignedProfile, isAdmin)),
  [adminOffers, user?.uid, assignedProfile, isAdmin]);

  // Posts totali per NewsBacheca = notifiche personali + posts admin filtrati
  const newsBachecaPosts = useMemo(() =>
    [...teamNews, ...filteredAdminPosts],
  [teamNews, filteredAdminPosts]);

  const newsSistemaIds = useMemo(
    () => newsBachecaPosts.map(buildPostNotificationId).filter(Boolean),
    [newsBachecaPosts]
  );
  const newsOfferteIds = useMemo(
    () => filteredAdminOffers.map(buildOfferNotificationId).filter(Boolean),
    [filteredAdminOffers]
  );

  useEffect(() => {
    setNewsSeenByCategory(readNewsSeenState(user?.uid || ''));
  }, [user?.uid]);

  const unreadNewsByCategory = useMemo(() => {
    const sistemaSeen = newsSeenByCategory?.sistema || {};
    const offerteSeen = newsSeenByCategory?.offerte || {};
    const sistema = newsSistemaIds.filter((id) => !sistemaSeen[id]).length;
    const offerte = newsOfferteIds.filter((id) => !offerteSeen[id]).length;
    return { sistema, offerte };
  }, [newsSeenByCategory, newsSistemaIds, newsOfferteIds]);

  const sectionUnreadCountMap = useMemo(() => ({
    home: (unreadNewsByCategory.sistema || 0) + (unreadNewsByCategory.offerte || 0),
  }), [unreadNewsByCategory]);

  useEffect(() => {
    if (!canUseAdminUi || isMobilePortrait) {
      setSidebarLabelOverflowMap({});
      return undefined;
    }
    const computeOverflow = () => {
      const nodes = Array.from(document.querySelectorAll('[data-sidebar-label-wrap]'));
      const next = {};
      nodes.forEach((wrap) => {
        const key = String(wrap.getAttribute('data-sidebar-label-wrap') || '').trim();
        if (!key) return;
        const textNode = wrap.querySelector('[data-sidebar-label-text]');
        if (!textNode) return;
        next[key] = textNode.scrollWidth > wrap.clientWidth + 1;
      });
      setSidebarLabelOverflowMap((prev) => {
        const prevKeys = Object.keys(prev || {});
        const nextKeys = Object.keys(next);
        if (prevKeys.length === nextKeys.length && nextKeys.every((k) => prev[k] === next[k])) return prev;
        return next;
      });
    };
    const rafId = requestAnimationFrame(computeOverflow);
    window.addEventListener('resize', computeOverflow);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', computeOverflow);
    };
  }, [canUseAdminUi, isMobilePortrait, sidebarWidth, activeSection, sectionUnreadCountMap]);

  const markNewsCategoryAsRead = useCallback((categoryId) => {
    if (!user?.uid) return;
    const category = String(categoryId || '').toLowerCase();
    if (category !== 'sistema' && category !== 'offerte') return;
    const ids = category === 'sistema' ? newsSistemaIds : newsOfferteIds;
    if (!ids.length) return;
    setNewsSeenByCategory((prev) => {
      const base = normalizeNewsSeenState(prev);
      const next = {
        ...base,
        [category]: applySeenForIds(base[category], ids),
      };
      writeNewsSeenState(user.uid, next);
      return next;
    });
  }, [user?.uid, newsSistemaIds, newsOfferteIds]);

  useEffect(() => {
    if (!user?.uid || isAdmin || !myProfileRequest) return;
    const status = String(myProfileRequest.status || '').toLowerCase();
    if (!['pending', 'approved', 'rejected'].includes(status)) return;
    const requestedMs = toMs(myProfileRequest.requestedAt);
    const resolvedMs = toMs(myProfileRequest.resolvedAt);
    const stamp = status === 'pending'
      ? (requestedMs || toMs(myProfileRequest.updatedAt))
      : (resolvedMs || toMs(myProfileRequest.updatedAt) || requestedMs);
    const eventKey = `profile_req_${status}_${user.uid}_${myProfileRequest.targetProfile || ''}_${stamp || 0}`;
    const seenStorageKey = `vpa_profile_request_notice_seen_${user.uid}`;
    let seenKeys = [];
    try { seenKeys = JSON.parse(localStorage.getItem(seenStorageKey) || '[]'); } catch {}
    if (seenKeys.includes(eventKey)) return;

    const targetLabel = myProfileRequest.targetProfile === 'promax' ? 'Pro Max' : 'Pro';
    const when = status === 'pending'
      ? formatItDateTime(myProfileRequest.requestedAt)
      : formatItDateTime(myProfileRequest.resolvedAt || myProfileRequest.updatedAt);
    const text = status === 'pending'
      ? `Richiesta upgrade profilo inviata: passaggio a ${targetLabel}${when ? ` il ${when}` : ''}.`
      : status === 'approved'
        ? `Upgrade profilo approvato: ora sei abilitato a ${targetLabel}${when ? ` (approvazione ${when})` : ''}.`
        : `Richiesta upgrade profilo non approvata${when ? ` (${when})` : ''}.`;

    const type = status === 'approved' ? 'risultato' : status === 'rejected' ? 'avviso' : 'info';
    seenKeys = [...seenKeys, eventKey].slice(-50);
    try { localStorage.setItem(seenStorageKey, JSON.stringify(seenKeys)); } catch {}
    addSystemNotification({ metaKey: eventKey, type, text });
  }, [user, isAdmin, myProfileRequest, toMs, formatItDateTime, addSystemNotification]);

  useEffect(() => {
    if (!user?.uid || isAdmin) return;
    const storageKey = `vpa_last_assigned_profile_${user.uid}`;
    let prevProfile = 'base';
    try { prevProfile = localStorage.getItem(storageKey) || 'base'; } catch {}
    if (!PROFILE_ORDER[assignedProfile] && assignedProfile !== 'base') return;
    if (PROFILE_ORDER[assignedProfile] > PROFILE_ORDER[prevProfile]) {
      const eventKey = `profile_level_up_${user.uid}_${prevProfile}_${assignedProfile}`;
      addSystemNotification({
        metaKey: eventKey,
        type: 'risultato',
        text: `Upgrade profilo attivato: da ${profileLabel(prevProfile)} a ${profileLabel(assignedProfile)}.`,
      });
    }
    try { localStorage.setItem(storageKey, assignedProfile); } catch {}
  }, [user, isAdmin, assignedProfile, addSystemNotification, profileLabel]);

  useEffect(() => {
    if (!isAdmin) return;
    if (canUseAdminUi) {
      if (ADMIN_SECTION_IDS.includes(activeSection)) return;
      setActiveSection('admin_users');
      try { localStorage.setItem('vpa_active_section', 'admin_users'); } catch {}
      return;
    }
    if (!ADMIN_SECTION_IDS.includes(activeSection)) return;
    setActiveSection('home');
    try { localStorage.setItem('vpa_active_section', 'home'); } catch {}
  }, [isAdmin, canUseAdminUi, activeSection]);

  useEffect(() => {
    if (!user) {
      setUserAccess(null);
      setAdminUsers([]);
      setAdminUsageStats([]);
      setProfileRequests([]);
      setMyProfileRequest(null);
      lastTrackedSectionRef.current = '';
      setIsAccessReady(false);
      return;
    }
    let cancelled = false;
    const syncAccess = async () => {
      try {
        setIsAccessReady(false);
        const ensuredAccess = await ensureUserAccessRecord(user);
        const loadedAccess = await loadCurrentUserAccess(user.uid);
        const access = loadedAccess || ensuredAccess;
        if (cancelled) return;
        setUserAccess(access);
        const forcedProfile = access?.assignedProfile || 'base';
        setActiveProfile(forcedProfile);
        try { localStorage.setItem('vpa_active_profile', forcedProfile); } catch {}
        if (access?.role === 'admin') {
          const [usersList, requestsList, usageRows] = await Promise.all([
            loadAllUsersAccess(),
            loadAllProfileUpgradeRequests(),
            loadAllUserUsageStats(),
          ]);
          if (cancelled) return;
          setAdminUsers(usersList);
          setProfileRequests(requestsList);
          setAdminUsageStats(usageRows);
          setMyProfileRequest(null);
        } else {
          setAdminUsers([]);
          setAdminUsageStats([]);
          setProfileRequests([]);
          const myRequest = await loadMyProfileUpgradeRequest(user.uid);
          if (cancelled) return;
          setMyProfileRequest(myRequest);
          try {
            await recordUserLoginUsage(user, access, {
              section: 'home',
              appVersion: APP_VERSION,
              userAgent: navigator?.userAgent || '',
            });
          } catch {}
          setActiveSection(prev => (ADMIN_SECTION_IDS.includes(prev) ? 'home' : prev));
          setActiveSubTabs(prev => {
            const hasAdminSubtabs = Object.keys(prev).some(k => k.startsWith('admin'));
            if (!hasAdminSubtabs) return prev;
            const next = { ...prev };
            Object.keys(next).forEach((k) => {
              if (k.startsWith('admin')) delete next[k];
            });
            try { localStorage.setItem('vpa_active_subtabs', JSON.stringify(next)); } catch {}
            return next;
          });
          try {
            if (ADMIN_SECTION_IDS.includes(localStorage.getItem('vpa_active_section'))) {
              localStorage.setItem('vpa_active_section', 'home');
            }
          } catch {}
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(`Errore profilo utente: ${err.message}`);
        }
      } finally {
        if (!cancelled) {
          setIsAccessReady(true);
        }
      }
    };
    syncAccess();
    return () => { cancelled = true; };
  }, [user]);

  const refreshAdminUsers = useCallback(async () => {
    if (!isAdmin) return;
    const [usersList, requestsList, usageRows] = await Promise.all([
      loadAllUsersAccess(),
      loadAllProfileUpgradeRequests(),
      loadAllUserUsageStats(),
    ]);
    setAdminUsers(usersList);
    setProfileRequests(requestsList);
    setAdminUsageStats(usageRows);
  }, [isAdmin]);

  useEffect(() => {
    if (!user?.uid || isAdmin) return;
    if (!activeSection) return;
    if (activeSection === lastTrackedSectionRef.current) return;
    lastTrackedSectionRef.current = activeSection;
    recordUserSectionUsage(user.uid, activeSection).catch(() => {});
  }, [user, isAdmin, activeSection]);

  const refreshMyProfileRequest = useCallback(async () => {
    if (!user?.uid || isAdmin) return;
    const latest = await loadMyProfileUpgradeRequest(user.uid);
    setMyProfileRequest(latest);
  }, [user, isAdmin]);

  const handleAdminProfileChange = useCallback(async (targetUser, profile) => {
    if (!targetUser?.uid) return;
    setIsAdminSaving(true);
    setErrorMsg('');
    try {
      await updateUserAssignedProfile(targetUser.uid, profile);
      await refreshAdminUsers();
      if (targetUser.uid === user?.uid) {
        setUserAccess(prev => prev ? { ...prev, assignedProfile: profile } : prev);
        setActiveProfile(profile);
        try { localStorage.setItem('vpa_active_profile', profile); } catch {}
      }
    } catch (err) {
      setErrorMsg(`Errore aggiornamento profilo utente: ${err.message}`);
    } finally {
      setIsAdminSaving(false);
    }
  }, [refreshAdminUsers, user]);

  const handleAdminRoleChange = useCallback(async (targetUser, role) => {
    if (!targetUser?.uid) return;
    setIsAdminSaving(true);
    setErrorMsg('');
    try {
      const normalizedRole = role;
      await updateUserRole(targetUser.uid, normalizedRole);
      await refreshAdminUsers();
      if (targetUser.uid === user?.uid) {
        setUserAccess(prev => prev ? { ...prev, role: normalizedRole } : prev);
      }
    } catch (err) {
      setErrorMsg(`Errore aggiornamento ruolo utente: ${err.message}`);
    } finally {
      setIsAdminSaving(false);
    }
  }, [refreshAdminUsers, user]);

  const handleProfileRequestDecision = useCallback(async (requestItem, decision) => {
    if (!requestItem?.uid || !canUseAdminUi) return;
    setIsAdminSaving(true);
    setErrorMsg('');
    try {
      await resolveProfileUpgradeRequest(requestItem.uid, decision, {
        uid: user?.uid || '',
        email: user?.email || '',
      });
      await refreshAdminUsers();
      if (requestItem.uid === user?.uid && decision === 'approved') {
        const nextProfile = requestItem.targetProfile || 'pro';
        setUserAccess(prev => prev ? { ...prev, assignedProfile: nextProfile } : prev);
        setActiveProfile(nextProfile);
        try { localStorage.setItem('vpa_active_profile', nextProfile); } catch {}
      }
    } catch (err) {
      setErrorMsg(`Errore gestione richiesta profilo: ${err.message}`);
    } finally {
      setIsAdminSaving(false);
    }
  }, [canUseAdminUi, refreshAdminUsers, user]);

  const handleSubmitProfileRequest = useCallback(async () => {
    if (!user || isAdmin) return;
    const target = String(requestTargetProfile || '').toLowerCase();
    if (!['pro', 'promax'].includes(target)) return;
    if (PROFILE_ORDER[target] <= PROFILE_ORDER[assignedProfile]) {
      setErrorMsg('Hai già un profilo uguale o superiore a quello richiesto.');
      return;
    }
    setIsRequestSaving(true);
    setErrorMsg('');
    try {
      await submitProfileUpgradeRequest({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        currentProfile: assignedProfile,
        targetProfile: target,
        message: requestMessage,
      });
      await refreshMyProfileRequest();
      setLoadingMsg('Richiesta inviata all’amministratore.');
    } catch (err) {
      setErrorMsg(`Errore invio richiesta profilo: ${err.message}`);
    } finally {
      setIsRequestSaving(false);
    }
  }, [user, isAdmin, requestTargetProfile, assignedProfile, requestMessage, refreshMyProfileRequest]);

  useEffect(() => {
    if (!user?.uid || isAdmin) return;
    let cancelled = false;
    const run = async () => {
      try {
        const latest = await loadMyProfileUpgradeRequest(user.uid);
        if (!cancelled) setMyProfileRequest(latest);
      } catch {}
    };
    run();
    const intervalId = setInterval(run, 20000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, isAdmin]);

  const handleAdminViewModeChange = useCallback((mode) => {
    if (!isAdmin) return;
    const next = mode === 'user' ? 'user' : 'admin';
    setAdminViewMode(next);
    try { localStorage.setItem('vpa_admin_view_mode', next); } catch {}
  }, [isAdmin]);

  useEffect(() => {
    const onDocClick = (event) => {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    setUserMenuOpen(false);
    const t = setTimeout(() => setUserMenuOpen(false), 250);
    return () => clearTimeout(t);
  }, [user?.uid]);

  useEffect(() => {
    let mql = null;
    const updateViewportMode = () => {
      try {
        const active = mql?.matches
          ?? window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches;
        setIsMobilePortrait(active);
      } catch {
        setIsMobilePortrait(false);
      }
    };
    try {
      mql = window.matchMedia('(max-width: 768px) and (orientation: portrait)');
      updateViewportMode();
      if (mql.addEventListener) {
        mql.addEventListener('change', updateViewportMode);
      } else if (mql.addListener) {
        mql.addListener(updateViewportMode);
      }
      window.addEventListener('orientationchange', updateViewportMode);
      window.addEventListener('resize', updateViewportMode);
    } catch {}
    return () => {
      if (mql?.removeEventListener) {
        mql.removeEventListener('change', updateViewportMode);
      } else if (mql?.removeListener) {
        mql.removeListener(updateViewportMode);
      }
      window.removeEventListener('orientationchange', updateViewportMode);
      window.removeEventListener('resize', updateViewportMode);
    };
  }, []);

  useEffect(() => {
    if (!isMobilePortrait) {
      setIsSidebarOpen(false);
    }
  }, [isMobilePortrait]);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth)); } catch {}
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isSidebarResizing || isMobilePortrait) return undefined;
    const onMouseMove = (event) => {
      const start = sidebarResizeStartRef.current;
      if (!start) return;
      const next = start.width + (event.clientX - start.x);
      setSidebarWidth(Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(next))));
    };
    const onMouseUp = () => {
      setIsSidebarResizing(false);
      sidebarResizeStartRef.current = null;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isSidebarResizing, isMobilePortrait]);

  const handleSidebarResizeStart = useCallback((event) => {
    if (isMobilePortrait) return;
    if (event.button !== 0) return;
    event.preventDefault();
    sidebarResizeStartRef.current = { x: event.clientX, width: sidebarWidth };
    setIsSidebarResizing(true);
  }, [isMobilePortrait, sidebarWidth]);

  const handleAppTouchStart = useCallback((event) => {
    if (!isMobilePortrait) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, [isMobilePortrait]);

  const handleAppTouchEnd = useCallback((event) => {
    if (!isMobilePortrait) return;
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    const touch = event.changedTouches?.[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const isHorizontalSwipe = Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) + 20;
    if (!isHorizontalSwipe) return;
    if (!isSidebarOpen && start.x <= 32 && dx > 0) {
      setIsSidebarOpen(true);
    }
    if (isSidebarOpen && dx < 0) {
      setIsSidebarOpen(false);
    }
  }, [isMobilePortrait, isSidebarOpen]);

  // ─── Profile & navigation helpers ────────────────────────────────────────
  const profileAllows = useCallback((minProfile) => {
    return PROFILE_ORDER[activeProfile] >= PROFILE_ORDER[minProfile];
  }, [activeProfile]);

  const navigateTo = useCallback((section, subTab) => {
    setActiveSection(section);
    try { localStorage.setItem('vpa_active_section', section); } catch {}
    if (subTab) {
      setActiveSubTabs(prev => {
        const next = { ...prev, [section]: subTab };
        try { localStorage.setItem('vpa_active_subtabs', JSON.stringify(next)); } catch {}
        return next;
      });
    }
    if (isMobilePortrait) setIsSidebarOpen(false);
  }, [isMobilePortrait]);

  const handleProfileChange = useCallback((profile) => {
    if (!canUseAdminUi && PROFILE_ORDER[profile] > PROFILE_ORDER[assignedProfile]) {
      setErrorMsg('Profilo non abilitato. Invia una richiesta all’amministratore.');
      return;
    }
    const prevSections = new Set(getVisibleSectionIdsByProfile(activeProfile));
    const nextSections = getVisibleSectionIdsByProfile(profile);
    const revealedSections = nextSections.filter(sectionId => !prevSections.has(sectionId));

    const prevTabs = new Set(getVisibleTabIdsByProfile(activeSection, activeProfile));
    const nextTabs = getVisibleTabIdsByProfile(activeSection, profile);
    const revealedTabs = nextTabs.filter(tabId => !prevTabs.has(tabId));

    setProfileReveal({ sections: revealedSections, tabs: revealedTabs });
    setActiveProfile(profile);
    try { localStorage.setItem('vpa_active_profile', profile); } catch {}
    // If current section is not visible in new profile, redirect to home
    const sectionMeta = SECTIONS.find(s => s.id === activeSection);
    if (sectionMeta && PROFILE_ORDER[profile] < PROFILE_ORDER[sectionMeta.minProfile]) {
      setActiveSection('home');
      try { localStorage.setItem('vpa_active_section', 'home'); } catch {}
    }
    // If current sub-tab is not visible in new profile, reset it
    const tabs = SECTION_TABS[activeSection] || [];
    const curSub = activeSubTabs[activeSection];
    if (curSub) {
      const tabMeta = tabs.find(t => t.id === curSub);
      if (tabMeta && PROFILE_ORDER[profile] < PROFILE_ORDER[tabMeta.minProfile]) {
        const firstAllowed = tabs.find(t => PROFILE_ORDER[profile] >= PROFILE_ORDER[t.minProfile]);
        if (firstAllowed) {
          setActiveSubTabs(prev => {
            const next = { ...prev, [activeSection]: firstAllowed.id };
            try { localStorage.setItem('vpa_active_subtabs', JSON.stringify(next)); } catch {}
            return next;
          });
        }
      }
    }
  }, [activeProfile, activeSection, activeSubTabs, canUseAdminUi, assignedProfile]);

  useEffect(() => {
    if (profileReveal.sections.length === 0 && profileReveal.tabs.length === 0) return;
    const timeoutId = setTimeout(() => {
      setProfileReveal({ sections: [], tabs: [] });
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [profileReveal]);

  const handleOwnerTeamChange = useCallback((teamName) => {
    const resolved = findStandingTeamName(standings, teamName) || teamName || '';
    setOwnerTeamName(resolved);
    try { localStorage.setItem('vpa_owner_team', resolved); } catch {}
  }, [standings]);

  const handleOpenOpponentCommentFromTrainingPlan = useCallback((opponentName) => {
    if (!opponentName) return;
    setSelectedMatch(null);
    setMatchReportIntent({ opponent: opponentName, openCommentTick: Date.now() });
    navigateTo('analisi', 'partite');
  }, [navigateTo]);

  const handleOpenOpponentReportFromDashboard = useCallback((opponentName) => {
    if (!opponentName) return;
    // Fuzzy-match the standings name against the match metadata opponent names
    // (standings team names may differ from the short names used in match data)
    const normalize = (s) => String(s || '').trim().toUpperCase();
    const oppNorm = normalize(opponentName);
    const matchOpponentName = matches
      .map(m => m.metadata?.opponent || '')
      .find(opp => {
        const n = normalize(opp);
        return n === oppNorm || n.includes(oppNorm) || oppNorm.includes(n);
      }) || opponentName;
    setSelectedMatch(null);
    setMatchReportIntent({ opponent: matchOpponentName, openCommentTick: 0 });
    navigateTo('analisi', 'partite');
  }, [matches, navigateTo]);

  useEffect(() => {
    if (!standings.length) return;
    const selected = findStandingTeamName(standings, ownerTeamName);
    if (selected && selected === ownerTeamName) return;
    const fromMatches = findStandingTeamName(
      standings,
      matches.find(m => m.metadata?.teamName)?.metadata?.teamName || ''
    );
    if (fromMatches) {
      setOwnerTeamName(fromMatches);
      try { localStorage.setItem('vpa_owner_team', fromMatches); } catch {}
    }
  }, [standings, matches, ownerTeamName]);

  // ─── Load data from Firestore when user logs in ──────────────────────────
  useEffect(() => {
    if (!user) {
      // Reset state on logout
      setMatches([]);
      setCalendar([]);
      setStandings([]);
      setShareInfo(null);
      setSharedAccess(null);
      setDataLoaded(false);
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      setLoadingMsg('Caricamento dati da Database in Cloud…');
      try {
        let ownerUid = user.uid;
        if (isSharedMode) {
          const access = await resolveSharedAccess(shareToken, user);
          if (!access.granted) {
            throw new Error('Non autorizzato ad accedere a questo dataset condiviso');
          }
          ownerUid = access.ownerUid;
          setSharedAccess(access);
          setShareInfo({
            token: access.token,
            ownerUid: access.ownerUid,
            ownerEmail: access.ownerEmail,
            shareMembers: access.shareMembers || [],
            allowedEmails: access.allowedEmails || [],
            writerEmails: access.writerEmails || [],
            publicAccess: access.publicAccess === true,
          });
        } else {
          setSharedAccess({ isOwner: true, ownerUid: user.uid, token: '', canWrite: true, role: 'owner', permission: 'write' });
          try {
            const existingShare = await loadShareLinkForOwner(user.uid);
            if (existingShare) {
              setShareInfo(existingShare);
            } else {
              setShareInfo(null);
            }
          } catch (shareErr) {
            console.warn('[App] sharing metadata unavailable:', shareErr?.message || shareErr);
            setShareInfo(null);
          }
        }

        const [loadedMatches, calData, loadedNews, loadedOffers] = await Promise.all([
          loadAllMatches(ownerUid),
          loadCalendar(ownerUid),
          loadTeamNews(ownerUid),
          loadTeamOffers(ownerUid),
        ]);

        if (cancelled) return;

        if (loadedMatches.length > 0) {
          setMatches(loadedMatches);
        }
        if (calData) {
          setCalendar(calData.calendar || []);
          setStandings(calData.standings || []);
        }
        if (loadedNews)   setTeamNews(loadedNews);
        if (loadedOffers) setTeamOffers(loadedOffers);

        if (loadedMatches.length === 0) {
          setActiveSection('sistema');
          setActiveSubTabs(prev => ({ ...prev, sistema: 'dati' }));
        }
        setLoadingMsg(
          loadedMatches.length > 0
            ? `${loadedMatches.length} partite caricate da Database in Cloud`
            : 'Nessun dato su Database in Cloud. Carica i file scout per iniziare.'
        );
      } catch (err) {
        if (!cancelled) {
          console.error('[App] loadData error:', err);
          setErrorMsg(`Errore caricamento dati: ${err.message}`);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setDataLoaded(true);
          setTimeout(() => setLoadingMsg(''), 3000);
        }
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [user, isSharedMode, shareToken]);

  const handleCreateShareLink = useCallback(async () => {
    if (!user) return;
    const created = await getOrCreateShareLink(user.uid, user.email || '');
    setShareInfo(created);
    return created;
  }, [user]);

  const handleUpdateShareMembers = useCallback(async (members) => {
    if (!user || !shareInfo?.token || !canManageShare) return null;
    const updated = await updateShareMembers(shareInfo.token, user.uid, members);
    setShareInfo(updated);
    return updated;
  }, [user, shareInfo, canManageShare]);

  const handleShareOnWhatsApp = useCallback(async () => {
    let url = shareUrl;
    if (canEditDataset) {
      const created = await handleCreateShareLink();
      if (created?.token) {
        url = `${window.location.origin}${window.location.pathname}?share=${created.token}`;
      }
    }
    if (!url) {
      setErrorMsg('Link di condivisione non disponibile');
      return;
    }
    const message = encodeURIComponent(`Ti condivido il dataset Volley Team Analysis (sola lettura): ${url}`);
    window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer');
    setUserMenuOpen(false);
  }, [shareUrl, canEditDataset, handleCreateShareLink]);

  // ─── File upload handler — parse + salva su Firestore ────────────────────
  const handleFileUpload = useCallback(async (files) => {
    if (!user || !dataOwnerUid || !canEditDataset) return;
    setIsLoading(true);
    setErrorMsg('');
    const queuedFiles = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      fileName: file.name,
      extension: file.name.split('.').pop().toLowerCase(),
      status: 'queued',
      phase: 'In coda',
      progress: 0,
      detail: 'In attesa di elaborazione',
    }));
    setUploadProgress(queuedFiles);

    const updateProgress = (index, patch) => {
      setUploadProgress(prev => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    };

    let completedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const ext = file.name.split('.').pop().toLowerCase();
        updateProgress(i, {
          status: 'processing',
          phase: 'Lettura file',
          progress: 10,
          detail: 'Acquisizione contenuto binario',
        });
        const buffer = await file.arrayBuffer();
        updateProgress(i, {
          phase: 'Lettura completata',
          progress: 25,
          detail: 'Contenuto file acquisito',
        });

        if (ext === 'csv') {
          setLoadingMsg('Parsing calendario CSV…');
          updateProgress(i, {
            phase: 'Parsing calendario',
            progress: 45,
            detail: 'Interpretazione righe CSV',
          });
          const text = new TextDecoder('utf-8').decode(buffer);
          const cal = parseCalendarCSV(text);
          updateProgress(i, {
            phase: 'Calcolo classifica',
            progress: 65,
            detail: `Partite trovate: ${cal.length}`,
          });
          const st = computeStandings(cal);

          setLoadingMsg('Salvataggio calendario su Database in Cloud…');
          updateProgress(i, {
            phase: 'Salvataggio Database in Cloud',
            progress: 85,
            detail: `Scrittura calendario e ${st.length} squadre`,
          });
          await saveCalendar(dataOwnerUid, cal, st);

          setCalendar(cal);
          setStandings(st);
          updateProgress(i, {
            status: 'done',
            phase: 'Completato',
            progress: 100,
            detail: `Calendario salvato: ${cal.length} partite`,
          });
          setLoadingMsg(`Calendario salvato: ${cal.length} partite, ${st.length} squadre`);

        } else if (ext === 'xlsm' || ext === 'xlsx') {
          setLoadingMsg(`Parsing ${file.name}…`);
          updateProgress(i, {
            phase: 'Parsing scout gara',
            progress: 45,
            detail: 'Estrazione roster, set e rally',
          });
          const match = parseMatchFile(buffer, file.name);

          setLoadingMsg(`Salvataggio ${file.name} su Database in Cloud…`);
          updateProgress(i, {
            phase: 'Salvataggio Database in Cloud',
            progress: 80,
            detail: `vs ${match.metadata.opponent || 'N/D'} · ${match.metadata.date || 'Data N/D'}`,
          });
          await saveMatch(dataOwnerUid, match);

          setMatches(prev => {
            const exists = prev.find(m =>
              m.metadata.opponent === match.metadata.opponent &&
              m.metadata.date    === match.metadata.date
            );
            if (exists) {
              return prev.map(m => m.id === exists.id ? { ...match, id: exists.id } : m);
            }
            return [...prev, match];
          });
          updateProgress(i, {
            status: 'done',
            phase: 'Completato',
            progress: 100,
            detail: `Partita salvata: ${match.metadata.opponent || 'N/D'}`,
          });

          setLoadingMsg(`✓ ${file.name} → Database in Cloud (${match.metadata.opponent}, ${match.metadata.date})`);
        } else {
          throw new Error(`Formato non supportato: .${ext}`);
        }
        completedCount += 1;
      } catch (err) {
        console.error('[App] Upload error:', file.name, err);
        updateProgress(i, {
          status: 'error',
          phase: 'Errore',
          progress: 100,
          detail: err.message,
        });
        setErrorMsg(`Errore con ${file.name}: ${err.message}`);
      }
    }

    setIsLoading(false);
    setLoadingMsg(`Upload completato: ${completedCount}/${files.length} file salvati`);
    setTimeout(() => setLoadingMsg(''), 5000);
  }, [user, dataOwnerUid, canEditDataset]);

  // ─── Delete match — rimuove da Firestore e dallo stato locale ─────────────
  const handleDeleteMatch = useCallback(async (matchId) => {
    if (!user || !dataOwnerUid || !canEditDataset) return;
    try {
      await deleteMatchFromFirestore(dataOwnerUid, matchId);
      setMatches(prev => prev.filter(m => m.id !== matchId));
      if (selectedMatch?.id === matchId) setSelectedMatch(null);
    } catch (err) {
      console.error('[App] deleteMatch error:', err);
      setErrorMsg(`Errore eliminazione: ${err.message}`);
    }
  }, [user, selectedMatch, dataOwnerUid, canEditDataset]);

  const handleClearArchive = useCallback(async () => {
    if (!user || !dataOwnerUid || !canEditDataset) return;
    try {
      setIsLoading(true);
      setLoadingMsg('Pulizia totale archivio in corso…');
      await clearArchiveData(dataOwnerUid);
      setMatches([]);
      setCalendar([]);
      setStandings([]);
      setSelectedMatch(null);
      setLoadingMsg('Archivio ripulito: partite e calendario eliminati');
      setActiveSection('sistema');
      setActiveSubTabs(prev => ({ ...prev, sistema: 'dati' }));
      setTimeout(() => setLoadingMsg(''), 3500);
    } catch (err) {
      console.error('[App] clearArchive error:', err);
      setErrorMsg(`Errore pulizia archivio: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [user, dataOwnerUid, canEditDataset]);

  // ─── Available match types (derived from raw matches list) ──────────────
  const availableMatchTypes = useMemo(() => {
    const types = new Set();
    for (const m of matches) {
      const t = m.metadata?.matchType;
      if (t && String(t).trim()) types.add(String(t).trim());
    }
    return Array.from(types).sort();
  }, [matches]);

  // ─── Filtered matches (by type + home/away, sorted by date) ─────────────
  const filteredMatches = useMemo(() => {
    let result = matches;
    if (filterMatchType !== 'all') {
      result = result.filter(m => (m.metadata?.matchType || '') === filterMatchType);
    }
    if (filterHomeAway !== 'all') {
      result = result.filter(m => (m.metadata?.homeAway || '') === filterHomeAway);
    }
    // Normalise DD/MM/YYYY → YYYY-MM-DD before sorting so chronological order is always correct
    const normDate = (d) => {
      if (!d) return '';
      const m = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : String(d);
    };
    return [...result].sort((a, b) =>
      normDate(a.metadata?.date).localeCompare(normDate(b.metadata?.date))
    );
  }, [matches, filterMatchType, filterHomeAway]);

  // ─── Fundamental baselines — depends only on match DATA (not on weights/FNC) ─
  const baselines = useMemo(() => {
    if (filteredMatches.length === 0) return null;
    return computeFundamentalBaselines(filteredMatches);
  }, [filteredMatches]);

  // ─── Computed analytics ──────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (filteredMatches.length === 0) return null;

    const matchAnalytics = filteredMatches.map(match => {
      const matchWeight = computeMatchWeight(match, standings, filteredMatches, weights);
      const fundWeights = computeFundamentalWeights(match, filteredMatches, standings);
      const playerStats = computeWeightedPlayerStats(match, matchWeight, fundWeights);
      const chains      = analyzeRallyChains(match.rallies);
      const report      = generateMatchReport(match, matchWeight, standings);
      const oppStats    = reconstructOpponent(match);

      return { match, matchWeight, fundWeights, playerStats, chains, report, oppStats };
    });

    const allMatchPlayerStats = matchAnalytics.map(ma => ({
      matchId:     ma.match.id,
      date:        ma.match.metadata.date || '',
      opponent:    ma.match.metadata.opponent || '',
      playerStats: ma.playerStats,
    }));
    const playerTrends = computePlayerTrends(allMatchPlayerStats);

    const rosterMap = {};
    for (const m of filteredMatches) {
      for (const p of m.roster || []) {
        if (p.number && !rosterMap[p.number]) rosterMap[p.number] = p;
      }
    }
    const roster = Object.values(rosterMap);

    const teamStats = matchAnalytics.map(ma => ({
      team: ma.match.riepilogo?.team,
      date: ma.match.metadata.date,
    }));
    const suggestions = generateTrainingSuggestions(playerTrends, teamStats, roster);

    // ─── Chain / sequence analytics (new Analisi Sequenze section) ───────────
    const chainData = {
      rdToA:             analyzeRDtoAConversions(filteredMatches, roster),
      sideOutVsTransition: analyzeSideOutVsTransition(filteredMatches, roster),
      serveDefense:      analyzeServeDefenseChain(filteredMatches),
      rallyLength:       analyzeRallyLengthPerformance(filteredMatches, roster),
      rotationalChains:  analyzeRotationalChains(filteredMatches),
    };
    const chainSuggestions = generateChainSuggestions(chainData, roster);

    // ─── Setter distribution analytics ──────────────────────────────────────
    const setterDistribution = analyzeSetterDistribution(filteredMatches, roster);
    const setterDiagnostics = buildSetterDiagnostics(setterDistribution, playerTrends, roster);

    return { matchAnalytics, playerTrends, trainingSuggestions: suggestions, chainData, chainSuggestions, setterDistribution, setterDiagnostics };
  // fncConfig intentionally NOT in deps: FNC is applied at display-time in components,
  // not recalculated in the engine (baselines are separate, weights trigger re-compute)
  }, [filteredMatches, standings, weights]);

  // ─── Roster da tutte le partite ──────────────────────────────────────────
  const allPlayers = useMemo(() => {
    const map = {};
    for (const m of matches) {
      for (const p of m.roster || []) {
        if (!map[p.number]) map[p.number] = p;
      }
    }
    return Object.values(map).sort((a, b) => a.number.localeCompare(b.number));
  }, [matches]);

  // ─── Loading iniziale di Firebase Auth ───────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: '#0a0e1a' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
            🏐
          </div>
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-500">Inizializzazione…</p>
        </div>
      </div>
    );
  }

  // ─── Login guard ─────────────────────────────────────────────────────────
  if (!user) {
    return <LoginPage />;
  }

  if (!isAccessReady) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: '#0a0e1a' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
            🏐
          </div>
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-500">Verifica accesso utente…</p>
        </div>
      </div>
    );
  }

  const visibleSections = canUseAdminUi
    ? SECTIONS.filter(s => ADMIN_SECTION_IDS.includes(s.id))
    : SECTIONS.filter((s) => {
      if (ADMIN_SECTION_IDS.includes(s.id)) return false;
      return profileAllows(s.minProfile);
    });
  const curSubTabs = (SECTION_TABS[activeSection] || []).filter(t => profileAllows(t.minProfile));
  const curSubTab  = activeSubTabs[activeSection] || curSubTabs[0]?.id || '';
  const isMatchesView = activeSection === 'analisi' && curSubTab === 'partite';

  // ─── Main App ─────────────────────────────────────────────────────────────
  return (
    <ProfileProvider
      activeProfile={activeProfile}
      onProfileChange={handleProfileChange}
      savedProfiles={savedProfiles}
      activeWeightProfileId={activeProfileId}
      onWeightProfileChange={handleProfileLoad}
    >
    <div className="h-screen flex flex-col overflow-hidden relative" onTouchStart={handleAppTouchStart} onTouchEnd={handleAppTouchEnd}>
      <style>{`
        @keyframes vpa-admin-sidebar-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .vpa-admin-sidebar-marquee-wrap {
          position: relative;
          overflow: hidden;
          min-width: 0;
          flex: 1 1 auto;
          white-space: nowrap;
        }
        .vpa-admin-sidebar-marquee-wrap.is-moving {
          mask-image: linear-gradient(to right, black 0, black calc(100% - 8px), transparent 100%);
          -webkit-mask-image: linear-gradient(to right, black 0, black calc(100% - 8px), transparent 100%);
        }
        .vpa-admin-sidebar-marquee-track {
          display: inline-flex;
          align-items: center;
          min-width: max-content;
          will-change: transform;
        }
        .vpa-admin-sidebar-marquee-track.is-moving {
          animation: vpa-admin-sidebar-marquee 9s linear infinite;
        }
        .vpa-admin-sidebar-marquee-gap {
          display: inline-block;
          padding: 0 14px;
          opacity: .45;
        }
      `}</style>
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-50 flex-shrink-0 border-b border-white/5 px-2.5 sm:px-4 py-2.5 flex items-center justify-between gap-2"
        style={{ background: 'linear-gradient(180deg, rgba(17,24,39,0.97), rgba(10,14,26,0.99))', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        {/* Left: hamburger + title */}
        <div className="flex items-center gap-2 min-w-0">
          {isMobilePortrait && (
            <button
              onClick={() => setIsSidebarOpen(v => !v)}
              className="w-8 h-8 rounded-lg border border-white/10 bg-white/[0.04] text-gray-200 flex items-center justify-center"
              title={isSidebarOpen ? 'Chiudi menu' : 'Apri menu'}
            >
              {isSidebarOpen ? '✕' : '☰'}
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-[13px] sm:text-sm font-bold tracking-tight whitespace-nowrap truncate leading-none max-w-[140px] sm:max-w-none" style={{ color: '#f59e0b' }}>{APP_NAME}</h1>
            <p className="text-[9px] text-gray-500 tracking-widest uppercase whitespace-nowrap truncate max-w-[140px] sm:max-w-none">
              v{APP_VERSION} · {matches.length} partite · {allPlayers.length} atlete
            </p>
          </div>
        </div>

        {/* Centre: profile selector + status */}
        <div className="flex-1 flex items-center justify-center gap-2 px-2">
          {/* Profile pills */}
          {canUseAdminUi ? (
            <div className="px-3 py-1 rounded-lg text-[11px] sm:text-xs font-semibold border border-emerald-400/40 text-emerald-300 bg-emerald-500/10 whitespace-nowrap">
              Admin
            </div>
          ) : (
            <div className="flex items-center gap-1 p-0.5 rounded-lg border border-white/10 bg-white/[0.03]">
              {Object.entries(PROFILE_META).map(([key, meta]) => {
                const active = activeProfile === key;
                const locked = PROFILE_ORDER[key] > PROFILE_ORDER[assignedProfile];
                return (
                  <button
                    key={key}
                    onClick={() => handleProfileChange(key)}
                    title={locked ? `Profilo ${meta.label} non abilitato` : `Profilo ${meta.label}`}
                    disabled={locked}
                    className="px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-xs font-semibold transition-all whitespace-nowrap"
                    style={active
                      ? { background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }
                      : { color: locked ? '#4b5563' : '#6b7280' }
                    }
                  >
                    {meta.label}{locked ? ' 🔒' : ''}
                  </button>
                );
              })}
            </div>
          )}
          {isAdmin && (
            <button
              onClick={() => handleAdminViewModeChange(canUseAdminUi ? 'user' : 'admin')}
              className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-semibold border whitespace-nowrap transition-colors ${
                canUseAdminUi
                  ? 'border-sky-400/40 text-sky-300 bg-sky-500/10 hover:bg-sky-500/20'
                  : 'border-emerald-400/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20'
              }`}
              title={canUseAdminUi ? 'Passa a interfaccia user standard' : 'Passa a interfaccia admin'}
            >
              {canUseAdminUi ? 'User standard' : 'Passa ad admin'}
            </button>
          )}
          {/* Status message (desktop) */}
          <div className="hidden lg:flex flex-1 justify-center">
            {isLoading && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400">
                <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                {loadingMsg}
              </div>
            )}
            {loadingMsg && !isLoading && <div className="text-xs text-green-400">{loadingMsg}</div>}
            {errorMsg && <div className="text-xs text-red-400">{errorMsg}</div>}
          </div>
        </div>

        {/* Right: data mode selector + user menu */}
        <div className="flex items-center gap-2">
          {!isMatchesView && !canUseAdminUi && (
            <DataModeSelector
              mode={dataMode}
              onChange={setDataMode}
            />
          )}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              className="w-8 h-8 rounded-full ring-1 ring-white/20 overflow-hidden bg-white/[0.06] text-gray-200 flex items-center justify-center"
              title="Menu utente"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'Account'} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-semibold">{(user.displayName || user.email || 'U').slice(0, 1).toUpperCase()}</span>
              )}
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-8 w-64 rounded-lg border border-white/10 bg-slate-900/95 shadow-xl backdrop-blur-sm overflow-hidden">
                <div className="px-3 py-2 border-b border-white/5 bg-white/[0.02]">
                  <p className="text-[11px] font-medium text-gray-200 truncate">{user.displayName || 'Account Google'}</p>
                  <p className="text-[10px] text-gray-500 truncate">{user.email || 'Email non disponibile'}</p>
                  <p className="text-[10px] text-sky-400/80 mt-0.5">Database in Cloud</p>
                  {isSharedMode && (
                    <p className="text-[10px] text-sky-300 mt-0.5">Modalità sola lettura · Dataset condiviso</p>
                  )}
                </div>
                <button
                  onClick={handleShareOnWhatsApp}
                  className="w-full text-left px-3 py-2 text-xs text-green-300 hover:bg-green-500/10 transition-colors"
                >
                  Condividi link su WhatsApp
                </button>
                {!isAdmin && (
                  <div className="border-t border-white/5 px-3 py-2 space-y-2 bg-white/[0.02]">
                    <p className="text-[11px] text-gray-300">Richiedi abilitazione profilo</p>
                    {availableUpgradeTargets.length > 0 ? (
                      <>
                        <select
                          value={requestTargetProfile}
                          onChange={(e) => setRequestTargetProfile(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-md bg-slate-800 border border-white/10 text-xs text-gray-100"
                        >
                          {availableUpgradeTargets.map((profile) => (
                            <option key={profile} value={profile}>
                              {PROFILE_META[profile]?.label || profile}
                            </option>
                          ))}
                        </select>
                        <input
                          value={requestMessage}
                          onChange={(e) => setRequestMessage(e.target.value)}
                          placeholder="Messaggio per admin (opzionale)"
                          className="w-full px-2.5 py-1.5 rounded-md bg-slate-800 border border-white/10 text-xs text-gray-100 placeholder:text-gray-500"
                        />
                        {myProfileRequest && (
                          <p className="text-[10px] text-gray-400">
                            Stato richiesta: {myProfileRequest.status === 'approved' ? 'approvata' : myProfileRequest.status === 'rejected' ? 'rifiutata' : 'in attesa'}
                          </p>
                        )}
                        <button
                          onClick={handleSubmitProfileRequest}
                          disabled={isRequestSaving}
                          className="w-full text-left px-2.5 py-1.5 rounded-md text-xs border border-amber-400/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-60"
                        >
                          {isRequestSaving ? 'Invio richiesta...' : 'Invia richiesta upgrade'}
                        </button>
                      </>
                    ) : (
                      <p className="text-[10px] text-gray-500">Profilo massimo già assegnato.</p>
                    )}
                  </div>
                )}
                <button
                  onClick={signOut}
                  className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 transition-colors border-t border-white/5"
                >
                  Esci
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {isMobilePortrait && isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="absolute inset-0 bg-black/45 z-20"
            aria-label="Chiudi menu laterale"
          />
        )}

        {/* ── Sidebar — 5 sezioni macro ── */}
        <nav
          className={`${isMobilePortrait
            ? `absolute left-0 top-0 h-full w-52 z-30 transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
            : 'flex-shrink-0'} border-r border-white/5 py-3 px-2 flex flex-col gap-0.5 relative overflow-y-auto overflow-x-hidden`}
          style={{ background: isMobilePortrait ? 'rgba(2,6,23,0.97)' : 'rgba(17,24,39,0.5)', width: isMobilePortrait ? undefined : `${sidebarWidth}px`, userSelect: isSidebarResizing ? 'none' : undefined }}
        >
          {/* Profile badge in sidebar (mobile only) */}
          {isMobilePortrait && (
            <div className="mb-3 px-1">
              <div
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-center"
                style={{
                  background: PROFILE_META[activeProfile].bg,
                  color: PROFILE_META[activeProfile].color,
                  border: `1px solid ${PROFILE_META[activeProfile].border}`,
                }}
              >
                Profilo {PROFILE_META[activeProfile].label}
              </div>
            </div>
          )}

          {visibleSections.map(section => {
            const active = activeSection === section.id;
            const reveal = profileReveal.sections.includes(section.id);
            const unreadCount = Number(sectionUnreadCountMap?.[section.id] || 0);
            const shouldMarquee = canUseAdminUi && !!sidebarLabelOverflowMap?.[section.id];
            return (
              <button
                key={section.id}
                onClick={() => navigateTo(section.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all text-left w-full
                  ${reveal ? 'profile-reveal-animate' : ''}
                  ${active
                    ? 'bg-amber-500/10 text-amber-400 font-semibold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                style={reveal ? {
                  '--profile-reveal-color': PROFILE_META[activeProfile].color,
                  '--profile-reveal-bg': PROFILE_META[activeProfile].bg,
                  '--profile-reveal-border': PROFILE_META[activeProfile].border,
                } : undefined}
              >
                <span className="text-base w-5 text-center leading-none">{section.icon}</span>
                {canUseAdminUi ? (
                  <span className={`vpa-admin-sidebar-marquee-wrap ${shouldMarquee ? 'is-moving' : ''}`} data-sidebar-label-wrap={section.id}>
                    <span className={`vpa-admin-sidebar-marquee-track ${shouldMarquee ? 'is-moving' : ''}`}>
                      <span data-sidebar-label-text>{section.label}</span>
                      {shouldMarquee && <span aria-hidden="true" className="vpa-admin-sidebar-marquee-gap">•</span>}
                      {shouldMarquee && <span aria-hidden="true">{section.label}</span>}
                    </span>
                  </span>
                ) : (
                  <span className="truncate">{section.label}</span>
                )}
                {unreadCount > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none shadow-[0_0_0_2px_rgba(15,23,42,0.65)]">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
                {active && curSubTabs.length > 0 && (
                  <span className={`${unreadCount > 0 ? 'ml-1' : 'ml-auto'} text-[9px] font-normal text-gray-600`}>
                    {curSubTabs.length}
                  </span>
                )}
              </button>
            );
          })}

          {/* Cloud badge */}
          <div className="mt-auto pt-3 px-2">
            <div className="flex items-center gap-1.5 text-[9px] text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Database in Cloud
            </div>
          </div>
          {!isMobilePortrait && (
            <button
              type="button"
              onMouseDown={handleSidebarResizeStart}
              aria-label="Ridimensiona sidebar"
              className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-sky-400/30 active:bg-sky-400/50 transition-colors"
            />
          )}
        </nav>

        {/* ── Main Content ── */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* ── Sub-tab bar (visibile per tutte le sezioni tranne home) ── */}
          {activeSection !== 'home' && curSubTabs.length > 0 && (
            <div
              className="flex-shrink-0 flex items-center gap-1 px-3 sm:px-4 py-2 border-b border-white/5 overflow-x-auto"
              style={{ background: 'rgba(10,14,26,0.6)' }}
            >
              {curSubTabs.map(tab => {
                const active = curSubTab === tab.id;
                const reveal = profileReveal.tabs.includes(tab.id);
                return (
                  <button
                    key={tab.id}
                    onClick={() => navigateTo(activeSection, tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0
                      ${reveal ? 'profile-reveal-animate' : ''}
                      ${active
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'}`}
                    style={reveal ? {
                      '--profile-reveal-color': PROFILE_META[activeProfile].color,
                      '--profile-reveal-bg': PROFILE_META[activeProfile].bg,
                      '--profile-reveal-border': PROFILE_META[activeProfile].border,
                    } : undefined}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}


          {/* ── Content area ── */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <PinProvider dashboardConfig={dashboardConfig} onConfigChange={handleDashboardConfigChange}>

            {/* HOME */}
            {activeSection === 'home' && (
              <Dashboard
                analytics={analytics}
                matches={matches}
                standings={standings}
                calendar={calendar}
                weights={weights}
                dataMode={dataMode}
                fncConfig={fncConfig}
                baselines={baselines}
                onSelectMatch={(m) => { setSelectedMatch(m); navigateTo('analisi', 'partite'); }}
                onSelectPlayer={(p) => { setSelectedPlayer(p); navigateTo('analisi', 'giocatrici'); }}
                dashboardConfig={dashboardConfig}
                onConfigChange={handleDashboardConfigChange}
                onOpenGrafici={() => navigateTo('sistema', 'grafici')}
                ownerTeamName={ownerTeamName}
                onOwnerTeamChange={handleOwnerTeamChange}
                onOpenOpponentReport={handleOpenOpponentReportFromDashboard}
                teamNews={newsBachecaPosts}
                onNewsChange={handleNewsChange}
                canEditNews={false}
                newsAuthorEmail={user?.email || ''}
                teamOffers={filteredAdminOffers}
                onOffersChange={null}
                newsUnreadByTab={unreadNewsByCategory}
                onNewsTabViewed={markNewsCategoryAsRead}
                onOpenDataImport={() => navigateTo('sistema', 'dati')}
              />
            )}

            {/* MATCH-STATS */}
            {activeSection === 'matchstats' && (
              <MatchStats matches={filteredMatches} analytics={analytics} standings={standings} />
            )}

            {/* ANALISI */}
            {activeSection === 'analisi' && curSubTab === 'partite' && (
              <MatchReport
                analytics={analytics}
                matches={filteredMatches}
                standings={standings}
                dataMode={dataMode}
                selectedMatch={selectedMatch}
                onSelectMatch={setSelectedMatch}
                weights={weights}
                externalScoutOpponent={matchReportIntent.opponent}
                externalOpenCommentTick={matchReportIntent.openCommentTick}
              />
            )}

            {activeSection === 'analisi' && curSubTab === 'giocatrici' && (
              <PlayerCard
                analytics={analytics}
                allPlayers={allPlayers}
                matches={filteredMatches}
                dataMode={dataMode}
                selectedPlayer={selectedPlayer}
                onSelectPlayer={setSelectedPlayer}
                fncConfig={fncConfig}
                baselines={baselines}
              />
            )}

            {activeSection === 'analisi' && curSubTab === 'squadra' && (
              <TeamAnalysis matches={filteredMatches} />
            )}

            {activeSection === 'analisi' && curSubTab === 'avversari' && (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-center select-none">
                <p className="text-4xl opacity-20">🎯</p>
                <p className="text-sm font-medium text-gray-400">Analisi Avversari</p>
                <p className="text-xs text-gray-600 max-w-xs">
                  Scout dedotto per ogni avversario, benchmark campionato e analisi storica.
                  In arrivo nella prossima release.
                </p>
              </div>
            )}

            {activeSection === 'analisi' && curSubTab === 'gioco' && (() => {
              const roster = (() => {
                const seen = {};
                for (const m of filteredMatches) {
                  for (const p of m.roster || []) {
                    if (p.number && !seen[p.number]) seen[p.number] = p;
                  }
                }
                return Object.values(seen);
              })();
              return (
                <GiocoAnalysis matches={filteredMatches} standings={standings} roster={roster} />
              );
            })()}

            {/* EVIDENZE */}
            {activeSection === 'evidenze' && curSubTab === 'suggerimenti' && (
              <TrainingSuggestions
                analytics={analytics}
                matches={filteredMatches}
                dataMode={dataMode}
                readOnly={!canEditDataset}
                datasetOwnerUid={dataOwnerUid}
                capFilterEnabled={capFilterEnabled}
                onToggleCapFilter={() => setCapFilterEnabled(v => !v)}
                capMinPriority={capMinPriority}
                capMaxPriority={capMaxPriority}
                onCapMinChange={(v) => {
                  const next = Math.min(5, Math.max(1, Math.round(Number(v) || 1)));
                  setCapMinPriority(next);
                  if (next > capMaxPriority) setCapMaxPriority(next);
                }}
                onCapMaxChange={(v) => {
                  const next = Math.min(5, Math.max(1, Math.round(Number(v) || 5)));
                  setCapMaxPriority(next);
                  if (next < capMinPriority) setCapMinPriority(next);
                }}
              />
            )}

            {activeSection === 'evidenze' && curSubTab === 'trend' && (
              <TeamTrends
                analytics={analytics}
                matches={filteredMatches}
                standings={standings}
                dataMode={dataMode}
              />
            )}

            {activeSection === 'evidenze' && curSubTab === 'rotazioni' && (
              <RotationAnalysis
                analytics={analytics}
                matches={filteredMatches}
                allPlayers={allPlayers}
                dataMode={dataMode}
              />
            )}

            {activeSection === 'evidenze' && curSubTab === 'attacco' && (
              <AttackAnalysis
                analytics={analytics}
                matches={filteredMatches}
                allPlayers={allPlayers}
                dataMode={dataMode}
              />
            )}

            {activeSection === 'evidenze' && curSubTab === 'catene' && (
              <SequenceAnalysis
                chainData={analytics?.chainData}
                chainSuggestions={analytics?.chainSuggestions}
                matches={filteredMatches}
                dataMode={dataMode}
                capFilterEnabled={capFilterEnabled}
                onToggleCapFilter={() => setCapFilterEnabled(v => !v)}
                capMinPriority={capMinPriority}
                capMaxPriority={capMaxPriority}
                onCapMinChange={(v) => {
                  const next = Math.min(5, Math.max(1, Math.round(Number(v) || 1)));
                  setCapMinPriority(next);
                  if (next > capMaxPriority) setCapMaxPriority(next);
                }}
                onCapMaxChange={(v) => {
                  const next = Math.min(5, Math.max(1, Math.round(Number(v) || 5)));
                  setCapMaxPriority(next);
                  if (next < capMinPriority) setCapMinPriority(next);
                }}
              />
            )}

            {/* TRAINING */}
            {activeSection === 'training' && curSubTab === 'suggerimenti' && (
              <TrainingSuggestions
                analytics={analytics}
                matches={filteredMatches}
                dataMode={dataMode}
                readOnly={!canEditDataset}
                datasetOwnerUid={dataOwnerUid}
                capFilterEnabled={capFilterEnabled}
                onToggleCapFilter={() => setCapFilterEnabled(v => !v)}
                capMinPriority={capMinPriority}
                capMaxPriority={capMaxPriority}
                onCapMinChange={(v) => {
                  const next = Math.min(5, Math.max(1, Math.round(Number(v) || 1)));
                  setCapMinPriority(next);
                  if (next > capMaxPriority) setCapMaxPriority(next);
                }}
                onCapMaxChange={(v) => {
                  const next = Math.min(5, Math.max(1, Math.round(Number(v) || 5)));
                  setCapMaxPriority(next);
                  if (next < capMinPriority) setCapMinPriority(next);
                }}
              />
            )}

            {activeSection === 'training' && curSubTab === 'settimana' && (
              <TrainPage
                analytics={analytics}
                matches={filteredMatches}
                calendar={calendar}
                standings={standings}
                ownerTeamName={ownerTeamName}
                allPlayers={allPlayers}
                dataMode={dataMode}
                weights={weights}
                onOpenOpponentComment={handleOpenOpponentCommentFromTrainingPlan}
              />
            )}

            {activeSection === 'training' && curSubTab === 'piano' && (
              <ChainTrainingPlan
                analytics={analytics}
                matches={filteredMatches}
                calendar={calendar}
                standings={standings}
                ownerTeamName={ownerTeamName}
                allPlayers={allPlayers}
                dataMode={dataMode}
                weights={weights}
                onOpenOpponentComment={handleOpenOpponentCommentFromTrainingPlan}
              />
            )}

            {/* SISTEMA — Tipologia Gare */}
            {activeSection === 'sistema' && curSubTab === 'tipologia' && (
              <div className="max-w-2xl mx-auto space-y-6">
                <div>
                  <h2 className="text-base font-semibold text-white mb-1">Tipologia Gare</h2>
                  <p className="text-xs text-gray-500">
                    Seleziona quali gare includere nell'analisi. Il filtro si applica a tutte le sezioni
                    (Analisi, Evidenze, Training). Le gare sono sempre considerate in ordine cronologico.
                  </p>
                </div>

                {/* Type filter */}
                <div className="rounded-xl border border-white/8 p-4 space-y-3"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Tipo di gara</p>
                  <div className="flex flex-wrap gap-2">
                    {['all', ...availableMatchTypes].map(type => {
                      const active = filterMatchType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            setFilterMatchType(type);
                            try { localStorage.setItem('vpa_filter_match_type', type); } catch {}
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                            ${active
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-white/10'}`}
                        >
                          {type === 'all' ? '🏐 Tutte le tipologie' : type}
                        </button>
                      );
                    })}
                    {availableMatchTypes.length === 0 && (
                      <p className="text-xs text-gray-600 italic">
                        Nessuna tipologia rilevata — assicurati che le gare abbiano il campo "Tipo" compilato in MVS.
                      </p>
                    )}
                  </div>
                </div>

                {/* Home/Away filter */}
                <div className="rounded-xl border border-white/8 p-4 space-y-3"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Casa / Trasferta</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'all',        label: '🏐 Tutte',        desc: 'Casa e trasferta' },
                      { value: 'Casa',       label: '🏠 Casa',          desc: 'Solo gare in casa' },
                      { value: 'Trasferta',  label: '✈️ Trasferta',     desc: 'Solo gare in trasferta' },
                    ].map(({ value, label, desc }) => {
                      const active = filterHomeAway === value;
                      return (
                        <button
                          key={value}
                          onClick={() => {
                            setFilterHomeAway(value);
                            try { localStorage.setItem('vpa_filter_home_away', value); } catch {}
                          }}
                          className={`flex flex-col items-start px-4 py-2.5 rounded-lg text-sm font-medium transition-all min-w-[130px]
                            ${active
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-white/10'}`}
                        >
                          <span>{label}</span>
                          <span className={`text-xs font-normal mt-0.5 ${active ? 'text-sky-400/70' : 'text-gray-600'}`}>{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active filter summary */}
                <div className="rounded-xl border border-amber-500/20 p-4 flex items-center gap-4"
                  style={{ background: 'rgba(245,158,11,0.05)' }}>
                  <span className="text-2xl">📊</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-200">
                      {filteredMatches.length === matches.length
                        ? `Analisi su tutte le ${matches.length} gare`
                        : `Analisi su ${filteredMatches.length} di ${matches.length} gare`}
                    </p>
                    <p className="text-xs text-amber-500/70 mt-0.5">
                      Tipo: <span className="font-medium">{filterMatchType === 'all' ? 'Tutte le tipologie' : filterMatchType}</span>
                      {' · '}
                      Sede: <span className="font-medium">{filterHomeAway === 'all' ? 'Casa + Trasferta' : filterHomeAway}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SISTEMA — Dati */}
            {activeSection === 'sistema' && curSubTab === 'dati' && (
              <div className="space-y-8">
                <DatasetManager
                  matches={matches}
                  calendar={calendar}
                  standings={standings}
                  ownerTeamName={ownerTeamName}
                  readOnly={!canEditDataset}
                  isSharedMode={isSharedMode}
                  canManageShare={canManageShare}
                  shareInfo={shareInfo}
                  shareUrl={shareUrl}
                  onCreateShareLink={handleCreateShareLink}
                  onUpdateShareMembers={handleUpdateShareMembers}
                  onUpload={handleFileUpload}
                  onDelete={handleDeleteMatch}
                  onClearArchive={handleClearArchive}
                  isLoading={isLoading}
                  uploadProgress={uploadProgress}
                />
                {calendar.length > 0 && (
                  <CalendarSection
                    calendar={calendar}
                    standings={standings}
                    ownerTeamName={ownerTeamName}
                  />
                )}
              </div>
            )}

            {activeSection === 'sistema' && curSubTab === 'config' && (
              <ConfigPanel
                weights={weights}
                onWeightsChange={setWeights}
                fncConfig={fncConfig}
                onFncConfigChange={handleFncConfigChange}
                analytics={analytics}
                baselines={baselines}
                savedProfiles={savedProfiles}
                activeProfileId={activeProfileId}
                onProfileLoad={handleProfileLoad}
                onProfileSave={handleProfileSave}
                onProfileDelete={handleProfileDelete}
                onProfileReset={handleProfileReset}
                hasUnsavedChanges={hasUnsavedChanges}
              />
            )}

            {activeSection === 'sistema' && curSubTab === 'grafici' && (
              <ChartsExplorer
                analytics={analytics}
                matches={matches}
                standings={standings}
                dataMode={dataMode}
                dashboardConfig={dashboardConfig}
                onConfigChange={handleDashboardConfigChange}
                onSelectPlayer={(p) => { setSelectedPlayer(p); navigateTo('analisi', 'giocatrici'); }}
              />
            )}

            {activeSection === 'sistema' && curSubTab === 'glossario' && <Glossary />}

            {activeSection === 'sistema' && curSubTab === 'guida' && <GuidePage />}

            {activeSection === 'admin_users' && canUseAdminUi && (
              <AdminUsersPanel
                users={adminUsers}
                requests={profileRequests}
                usageStats={adminUsageStats}
                currentUserEmail={user?.email || ''}
                onRefresh={refreshAdminUsers}
                onUpdateProfile={handleAdminProfileChange}
                onUpdateRole={handleAdminRoleChange}
                isSaving={isAdminSaving}
              />
            )}

            {activeSection === 'admin_requests' && canUseAdminUi && (
              <AdminRequestsPanel
                requests={profileRequests}
                onResolveRequest={handleProfileRequestDecision}
                isSaving={isAdminSaving}
              />
            )}

            {activeSection === 'admin_content' && canUseAdminUi && (
              <AdminContentPanel
                adminPosts={adminPosts}
                onPostsChange={handleAdminPostsChange}
                adminOffers={adminOffers}
                onOffersChange={handleAdminOffersChange}
                newsAuthorEmail={user?.email || ''}
                ownerTeamName={ownerTeamName}
                allUsers={adminUsers || []}
              />
            )}

            {activeSection === 'admin_stats' && canUseAdminUi && (
              <AdminUsageStatsPanel
                users={adminUsers}
                usageStats={adminUsageStats}
              />
            )}

          </PinProvider>
          </div>{/* end content area */}
        </main>
      </div>
    </div>
    </ProfileProvider>
  );
}
