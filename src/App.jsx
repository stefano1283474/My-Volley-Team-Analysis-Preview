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
} from './utils/analyticsEngine';
import { APP_NAME, APP_VERSION, DEFAULT_WEIGHTS, DEFAULT_FNC_CONFIG, DEFAULT_PROFILE, TEAM_MAP, FUNDAMENTALS, COLORS, SCALE_DESCRIPTIONS } from './utils/constants';
import {
  saveMatch,
  deleteMatchFromFirestore,
  loadAllMatches,
  saveCalendar,
  loadCalendar,
  getOrCreateShareLink,
  loadShareLinkForOwner,
  updateShareAllowedEmails,
  resolveSharedAccess,
} from './utils/firestoreService';
import { useAuth } from './context/AuthContext';

import Dashboard from './components/Dashboard';
import ChartsExplorer, { DEFAULT_DASHBOARD_CONFIG } from './components/ChartsExplorer';
import MatchReport from './components/MatchReport';
import PlayerCard from './components/PlayerCard';
import WeightAdjuster from './components/WeightAdjuster';
import ConfigPanel from './components/ConfigPanel';
import DatasetManager from './components/DatasetManager';
import TrainingSuggestions from './components/TrainingSuggestions';
import SequenceAnalysis from './components/SequenceAnalysis';
import TeamTrends from './components/TeamTrends';
import RotationAnalysis from './components/RotationAnalysis';
import AttackAnalysis from './components/AttackAnalysis';
import LoginPage from './components/LoginPage';
import Glossary from './components/Glossary';

// ─── Navigation tabs ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',       icon: '◉' },
  { id: 'grafici',   label: 'Grafici',         icon: '📊' },
  { id: 'matches',   label: 'Partite',         icon: '⚡' },
  { id: 'players',   label: 'Giocatrici',      icon: '★' },
  { id: 'trends',    label: 'Trend',           icon: '↗' },
  { id: 'rotations', label: 'Rotazioni',       icon: '⟳' },
  { id: 'attack',    label: 'Analisi attacco', icon: '⚔' },
  { id: 'training',  label: 'Allenamento',     icon: '⚙' },
  { id: 'sequences', label: 'Coach Brain',      icon: '🧠' },
  { id: 'data',      label: 'Dati',            icon: '☰' },
  { id: 'config',    label: 'Config',          icon: '🔧' },
  { id: 'glossary',  label: 'Glossario',       icon: '📖' },
];

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
  const [activeTab, setActiveTab]         = useState('dashboard');
  const [matches, setMatches]             = useState([]);
  const [calendar, setCalendar]           = useState([]);
  const [standings, setStandings]         = useState([]);
  const [weights, setWeights]             = useState(DEFAULT_WEIGHTS);

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
  const [isLoading, setIsLoading]         = useState(false);
  const [loadingMsg, setLoadingMsg]       = useState('');
  const [errorMsg, setErrorMsg]           = useState('');
  const [dataLoaded, setDataLoaded]       = useState(false); // Firestore loaded once
  const [uploadProgress, setUploadProgress] = useState([]);
  const [shareInfo, setShareInfo] = useState(null);
  const [sharedAccess, setSharedAccess] = useState(null);
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
  const canEditDataset = !!user && (!isSharedMode || !!sharedAccess?.isOwner);
  const dataOwnerUid = isSharedMode ? (sharedAccess?.ownerUid || null) : (user?.uid || null);
  const shareUrl = shareInfo?.token
    ? `${window.location.origin}${window.location.pathname}?share=${shareInfo.token}`
    : '';

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

  const handleOwnerTeamChange = useCallback((teamName) => {
    const resolved = findStandingTeamName(standings, teamName) || teamName || '';
    setOwnerTeamName(resolved);
    try { localStorage.setItem('vpa_owner_team', resolved); } catch {}
  }, [standings]);

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
      setLoadingMsg('Caricamento dati da Firestore…');
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
            allowedEmails: access.allowedEmails || [],
          });
        } else {
          setSharedAccess({ isOwner: true, ownerUid: user.uid, token: '' });
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
          setActiveTab('data'); // nessun dato → apri sezione Dati
        }
        setLoadingMsg(
          loadedMatches.length > 0
            ? `${loadedMatches.length} partite caricate da Firestore`
            : 'Nessun dato su Firestore. Carica i file scout per iniziare.'
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

  const handleUpdateShareReaders = useCallback(async (emails) => {
    if (!user || !shareInfo?.token) return null;
    const updated = await updateShareAllowedEmails(shareInfo.token, user.uid, emails);
    setShareInfo(updated);
    return updated;
  }, [user, shareInfo]);

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

          setLoadingMsg('Salvataggio calendario su Firestore…');
          updateProgress(i, {
            phase: 'Salvataggio Firestore',
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

          setLoadingMsg(`Salvataggio ${file.name} su Firestore…`);
          updateProgress(i, {
            phase: 'Salvataggio Firestore',
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

          setLoadingMsg(`✓ ${file.name} → Firestore (${match.metadata.opponent}, ${match.metadata.date})`);
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

    return { matchAnalytics, playerTrends, suggestions, chainData, chainSuggestions };
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

  // ─── Main App ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col relative" onTouchStart={handleAppTouchStart} onTouchEnd={handleAppTouchEnd}>
      {/* Header */}
      <header
        className="border-b border-white/5 px-3 sm:px-6 py-3 flex items-center justify-between"
        style={{ background: 'linear-gradient(180deg, rgba(17,24,39,0.95), rgba(10,14,26,0.98))' }}
      >
        <div className="flex items-center gap-3">
          {isMobilePortrait && (
            <button
              onClick={() => setIsSidebarOpen(v => !v)}
              className="w-8 h-8 rounded-lg border border-white/10 bg-white/[0.04] text-gray-200 flex items-center justify-center"
              title={isSidebarOpen ? 'Chiudi menu' : 'Apri menu'}
            >
              {isSidebarOpen ? '✕' : '☰'}
            </button>
          )}
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
            🏐
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight" style={{ color: '#f59e0b' }}>{APP_NAME}</h1>
            <p className="text-[10px] text-gray-500 tracking-widest uppercase">
              v{APP_VERSION} · {matches.length} partite · {allPlayers.length} atlete
            </p>
          </div>
        </div>

        {/* Centro: status messaggio */}
        <div className="flex-1 flex justify-center px-4">
          {isSharedMode && (
            <div className="text-[11px] text-sky-400">
              Modalità sola lettura · Dataset condiviso
            </div>
          )}
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              {loadingMsg}
            </div>
          )}
          {loadingMsg && !isLoading && (
            <div className="text-xs text-green-400">{loadingMsg}</div>
          )}
          {errorMsg && (
            <div className="text-xs text-red-400">{errorMsg}</div>
          )}
        </div>

        {/* Utente loggato */}
        <div className="flex items-center gap-3">
          {user.photoURL && (
            <img
              src={user.photoURL}
              alt={user.displayName}
              className="w-7 h-7 rounded-full ring-1 ring-white/20"
            />
          )}
          <div className="hidden sm:block text-right">
            <p className="text-xs font-medium text-gray-300">{user.displayName}</p>
            <p className="text-[10px] text-gray-600">Firebase · Google</p>
          </div>
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-white/5"
              title="Menu utente"
            >
              ⋮
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-8 w-64 rounded-lg border border-white/10 bg-slate-900/95 shadow-xl backdrop-blur-sm overflow-hidden">
                <div className="px-3 py-2 border-b border-white/5 bg-white/[0.02]">
                  <p className="text-[11px] font-medium text-gray-200 truncate">{user.displayName || 'Account Google'}</p>
                  <p className="text-[10px] text-gray-500 truncate">{user.email || 'Email non disponibile'}</p>
                  <p className="text-[10px] text-sky-400/80 mt-0.5">Accesso con account Google</p>
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
        {/* Sidebar Navigation */}
        <nav className={`${isMobilePortrait
          ? `absolute left-0 top-0 h-full w-64 z-30 transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
          : 'w-48 flex-shrink-0'} border-r border-white/5 p-3 flex flex-col gap-1`}
          style={{ background: 'rgba(17,24,39,0.5)' }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (isMobilePortrait) {
                  setIsSidebarOpen(false);
                }
              }}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left
                ${activeTab === item.id
                  ? 'bg-amber-500/10 text-amber-400 font-medium'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </button>
          ))}

          {/* Firebase badge in sidebar */}
          <div className="mt-auto pt-4 px-2">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Firestore sync attivo
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'data' && (
            <DatasetManager
              matches={matches}
              calendar={calendar}
              standings={standings}
              ownerTeamName={ownerTeamName}
              readOnly={!canEditDataset}
              isSharedMode={isSharedMode}
              shareInfo={shareInfo}
              shareUrl={shareUrl}
              onCreateShareLink={handleCreateShareLink}
              onUpdateShareReaders={handleUpdateShareReaders}
              onUpload={handleFileUpload}
              onDelete={handleDeleteMatch}
              isLoading={isLoading}
              uploadProgress={uploadProgress}
            />
          )}

          {activeTab === 'dashboard' && (
            <Dashboard
              analytics={analytics}
              matches={matches}
              standings={standings}
              weights={weights}
              fncConfig={fncConfig}
              baselines={baselines}
              onSelectMatch={(m) => { setSelectedMatch(m); setActiveTab('matches'); }}
              onSelectPlayer={(p) => { setSelectedPlayer(p); setActiveTab('players'); }}
              dashboardConfig={dashboardConfig}
              onOpenGrafici={() => setActiveTab('grafici')}
              ownerTeamName={ownerTeamName}
              onOwnerTeamChange={handleOwnerTeamChange}
            />
          )}

          {activeTab === 'grafici' && (
            <ChartsExplorer
              analytics={analytics}
              matches={matches}
              standings={standings}
              dashboardConfig={dashboardConfig}
              onConfigChange={handleDashboardConfigChange}
              onSelectPlayer={(p) => { setSelectedPlayer(p); setActiveTab('players'); }}
            />
          )}

          {activeTab === 'matches' && (
            <MatchReport
              analytics={analytics}
              matches={matches}
              standings={standings}
              selectedMatch={selectedMatch}
              onSelectMatch={setSelectedMatch}
              weights={weights}
            />
          )}

          {activeTab === 'players' && (
            <PlayerCard
              analytics={analytics}
              allPlayers={allPlayers}
              matches={matches}
              selectedPlayer={selectedPlayer}
              onSelectPlayer={setSelectedPlayer}
              fncConfig={fncConfig}
              baselines={baselines}
            />
          )}

          {activeTab === 'trends' && (
            <TeamTrends
              analytics={analytics}
              matches={matches}
              standings={standings}
            />
          )}

          {activeTab === 'rotations' && (
            <RotationAnalysis
              analytics={analytics}
              matches={matches}
              allPlayers={allPlayers}
            />
          )}

          {activeTab === 'attack' && (
            <AttackAnalysis
              analytics={analytics}
              matches={matches}
              allPlayers={allPlayers}
            />
          )}

          {activeTab === 'training' && (
            <TrainingSuggestions
              analytics={analytics}
              matches={matches}
              readOnly={!canEditDataset}
              datasetOwnerUid={dataOwnerUid}
            />
          )}

          {activeTab === 'config' && (
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

          {activeTab === 'sequences' && (
            <SequenceAnalysis
              chainData={analytics?.chainData}
              chainSuggestions={analytics?.chainSuggestions}
              matches={matches}
            />
          )}

          {activeTab === 'glossary' && <Glossary />}
        </main>
      </div>
    </div>
  );
}
