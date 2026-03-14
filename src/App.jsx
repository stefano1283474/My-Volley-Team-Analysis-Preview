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

// ─── Profile system ───────────────────────────────────────────────────────────
const PROFILE_ORDER = { base: 0, pro: 1, promax: 2 };
const PROFILE_META = {
  base:   { label: 'Base',    color: '#2563EB', bg: 'rgba(37,99,235,0.15)',  border: 'rgba(37,99,235,0.4)'  },
  pro:    { label: 'Pro',     color: '#7C3AED', bg: 'rgba(124,58,237,0.15)', border: 'rgba(124,58,237,0.4)' },
  promax: { label: 'Pro Max', color: '#DC2626', bg: 'rgba(220,38,38,0.15)',  border: 'rgba(220,38,38,0.4)'  },
};

// ─── Navigation structure ─────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'home',     label: 'Home',     icon: '🏠', minProfile: 'base' },
  { id: 'analisi',  label: 'Analisi',  icon: '🔬', minProfile: 'base' },
  { id: 'evidenze', label: 'Evidenze', icon: '📈', minProfile: 'pro'  },
  { id: 'training', label: 'Training', icon: '🏋️', minProfile: 'base' },
  { id: 'sistema',  label: 'Sistema',  icon: '⚙️', minProfile: 'base' },
  { id: 'admin',    label: 'Utenti Admin', icon: '🛡️', minProfile: 'base' },
];

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
    { id: 'dati',      label: 'Dati',      icon: '☰',  minProfile: 'base'   },
    { id: 'guida',     label: 'Guida',     icon: '❓', minProfile: 'base'   },
    { id: 'glossario', label: 'Glossario', icon: '📖', minProfile: 'base'   },
    { id: 'config',    label: 'Config',    icon: '🔧', minProfile: 'pro'    },
    { id: 'grafici',   label: 'Grafici',   icon: '📊', minProfile: 'promax' },
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
  const [isAdminSaving, setIsAdminSaving] = useState(false);
  const [isAccessReady, setIsAccessReady] = useState(false);
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
  const swipeStartRef = useRef(null);
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

  useEffect(() => {
    if (!user) {
      setUserAccess(null);
      setAdminUsers([]);
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
        const forcedProfile = access?.assignedProfile || 'pro';
        setActiveProfile(forcedProfile);
        try { localStorage.setItem('vpa_active_profile', forcedProfile); } catch {}
        if (access?.role === 'admin') {
          const usersList = await loadAllUsersAccess();
          if (cancelled) return;
          setAdminUsers(usersList);
        } else {
          setAdminUsers([]);
          setActiveSection(prev => (prev === 'admin' ? 'home' : prev));
          setActiveSubTabs(prev => {
            if (!prev.admin) return prev;
            const next = { ...prev };
            delete next.admin;
            try { localStorage.setItem('vpa_active_subtabs', JSON.stringify(next)); } catch {}
            return next;
          });
          try {
            if (localStorage.getItem('vpa_active_section') === 'admin') {
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
    const usersList = await loadAllUsersAccess();
    setAdminUsers(usersList);
  }, [isAdmin]);

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
  }, [activeProfile, activeSection, activeSubTabs]);

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

        const [loadedMatches, calData] = await Promise.all([
          loadAllMatches(ownerUid),
          loadCalendar(ownerUid),
        ]);

        if (cancelled) return;

        if (loadedMatches.length > 0) {
          setMatches(loadedMatches);
        }
        if (calData) {
          setCalendar(calData.calendar || []);
          setStandings(calData.standings || []);
        }

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

  // ─── Fundamental baselines — depends only on match DATA (not on weights/FNC) ─
  const baselines = useMemo(() => {
    if (matches.length === 0) return null;
    return computeFundamentalBaselines(matches);
  }, [matches]);

  // ─── Computed analytics ──────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (matches.length === 0) return null;

    const matchAnalytics = matches.map(match => {
      const matchWeight = computeMatchWeight(match, standings, matches, weights);
      const fundWeights = computeFundamentalWeights(match, matches, standings);
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
    for (const m of matches) {
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
      rdToA:             analyzeRDtoAConversions(matches, roster),
      sideOutVsTransition: analyzeSideOutVsTransition(matches, roster),
      serveDefense:      analyzeServeDefenseChain(matches),
      rallyLength:       analyzeRallyLengthPerformance(matches, roster),
      rotationalChains:  analyzeRotationalChains(matches),
    };
    const chainSuggestions = generateChainSuggestions(chainData, roster);

    // ─── Setter distribution analytics ──────────────────────────────────────
    const setterDistribution = analyzeSetterDistribution(matches, roster);
    const setterDiagnostics = buildSetterDiagnostics(setterDistribution, playerTrends, roster);

    return { matchAnalytics, playerTrends, trainingSuggestions: suggestions, chainData, chainSuggestions, setterDistribution, setterDiagnostics };
  // fncConfig intentionally NOT in deps: FNC is applied at display-time in components,
  // not recalculated in the engine (baselines are separate, weights trigger re-compute)
  }, [matches, standings, weights]);

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

  const visibleSections = SECTIONS.filter((s) => {
    if (s.id === 'admin') return isAdmin;
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
          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-white/10 bg-white/[0.03]">
            {Object.entries(PROFILE_META).map(([key, meta]) => {
              const active = activeProfile === key;
              return (
                <button
                  key={key}
                  onClick={() => handleProfileChange(key)}
                  title={`Profilo ${meta.label}`}
                  className="px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-xs font-semibold transition-all whitespace-nowrap"
                  style={active
                    ? { background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }
                    : { color: '#6b7280' }
                  }
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
          {isAdmin && (
            <div className="px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-semibold border border-emerald-400/40 text-emerald-300 bg-emerald-500/10 whitespace-nowrap">
              🛡 Admin attivo
            </div>
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
          {!isMatchesView && (
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
            : 'w-44 flex-shrink-0'} border-r border-white/5 py-3 px-2 flex flex-col gap-0.5`}
          style={{ background: isMobilePortrait ? 'rgba(2,6,23,0.97)' : 'rgba(17,24,39,0.5)' }}
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
                <span className="truncate">{section.label}</span>
                {active && curSubTabs.length > 0 && (
                  <span className="ml-auto text-[9px] font-normal text-gray-600">
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
              />
            )}

            {/* ANALISI */}
            {activeSection === 'analisi' && curSubTab === 'partite' && (
              <MatchReport
                analytics={analytics}
                matches={matches}
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
                matches={matches}
                dataMode={dataMode}
                selectedPlayer={selectedPlayer}
                onSelectPlayer={setSelectedPlayer}
                fncConfig={fncConfig}
                baselines={baselines}
              />
            )}

            {activeSection === 'analisi' && curSubTab === 'squadra' && (
              <TeamAnalysis matches={matches} />
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
                for (const m of matches) {
                  for (const p of m.roster || []) {
                    if (p.number && !seen[p.number]) seen[p.number] = p;
                  }
                }
                return Object.values(seen);
              })();
              return (
                <GiocoAnalysis matches={matches} standings={standings} roster={roster} />
              );
            })()}

            {/* EVIDENZE */}
            {activeSection === 'evidenze' && curSubTab === 'suggerimenti' && (
              <TrainingSuggestions
                analytics={analytics}
                matches={matches}
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
                matches={matches}
                standings={standings}
                dataMode={dataMode}
              />
            )}

            {activeSection === 'evidenze' && curSubTab === 'rotazioni' && (
              <RotationAnalysis
                analytics={analytics}
                matches={matches}
                allPlayers={allPlayers}
                dataMode={dataMode}
              />
            )}

            {activeSection === 'evidenze' && curSubTab === 'attacco' && (
              <AttackAnalysis
                analytics={analytics}
                matches={matches}
                allPlayers={allPlayers}
                dataMode={dataMode}
              />
            )}

            {activeSection === 'evidenze' && curSubTab === 'catene' && (
              <SequenceAnalysis
                chainData={analytics?.chainData}
                chainSuggestions={analytics?.chainSuggestions}
                matches={matches}
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
                matches={matches}
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
                matches={matches}
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
                matches={matches}
                calendar={calendar}
                standings={standings}
                ownerTeamName={ownerTeamName}
                allPlayers={allPlayers}
                dataMode={dataMode}
                weights={weights}
                onOpenOpponentComment={handleOpenOpponentCommentFromTrainingPlan}
              />
            )}

            {/* SISTEMA */}
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

            {activeSection === 'admin' && isAdmin && (
              <AdminUsersPanel
                users={adminUsers}
                currentUserEmail={user?.email || ''}
                onRefresh={refreshAdminUsers}
                onUpdateProfile={handleAdminProfileChange}
                onUpdateRole={handleAdminRoleChange}
                isSaving={isAdminSaving}
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
