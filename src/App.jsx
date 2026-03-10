// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Main App
// Auth: Google Sign-In (Firebase Auth)
// Storage: Firestore esclusivamente — nessun dato in locale
// ============================================================================

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { parseMatchFile, parseCalendarCSV, computeStandings } from './utils/dataParser';
import {
  reconstructOpponent, computeMatchWeight, computeFundamentalWeights,
  computeWeightedPlayerStats, computePlayerTrends, generateTrainingSuggestions,
  analyzeRallyChains, generateMatchReport, findOpponentStanding,
} from './utils/analyticsEngine';
import { DEFAULT_WEIGHTS, TEAM_MAP, FUNDAMENTALS, COLORS, SCALE_DESCRIPTIONS } from './utils/constants';
import {
  saveMatch,
  deleteMatchFromFirestore,
  loadAllMatches,
  saveCalendar,
  loadCalendar,
} from './utils/firestoreService';
import { useAuth } from './context/AuthContext';

import Dashboard from './components/Dashboard';
import ChartsExplorer, { DEFAULT_DASHBOARD_CONFIG } from './components/ChartsExplorer';
import MatchReport from './components/MatchReport';
import PlayerCard from './components/PlayerCard';
import WeightAdjuster from './components/WeightAdjuster';
import DatasetManager from './components/DatasetManager';
import TrainingSuggestions from './components/TrainingSuggestions';
import TeamTrends from './components/TeamTrends';
import RotationAnalysis from './components/RotationAnalysis';
import LoginPage from './components/LoginPage';
import Glossary from './components/Glossary';

// ─── Navigation tabs ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',    icon: '◉' },
  { id: 'grafici',   label: 'Grafici',      icon: '📊' },
  { id: 'matches',   label: 'Partite',      icon: '⚡' },
  { id: 'players',   label: 'Giocatrici',   icon: '★' },
  { id: 'trends',    label: 'Trend',        icon: '↗' },
  { id: 'rotations', label: 'Rotazioni',    icon: '⟳' },
  { id: 'training',  label: 'Allenamento',  icon: '⚙' },
  { id: 'data',      label: 'Dati',         icon: '☰' },
  { id: 'settings',  label: 'Pesi',         icon: '⚖' },
  { id: 'glossary',  label: 'Glossario',    icon: '📖' },
];

export default function App() {
  const { user, authLoading, signOut } = useAuth();

  // ─── State ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]         = useState('dashboard');
  const [matches, setMatches]             = useState([]);
  const [calendar, setCalendar]           = useState([]);
  const [standings, setStandings]         = useState([]);
  const [weights, setWeights]             = useState(DEFAULT_WEIGHTS);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isLoading, setIsLoading]         = useState(false);
  const [loadingMsg, setLoadingMsg]       = useState('');
  const [errorMsg, setErrorMsg]           = useState('');
  const [dataLoaded, setDataLoaded]       = useState(false); // Firestore loaded once
  const [uploadProgress, setUploadProgress] = useState([]);

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

  // ─── Load data from Firestore when user logs in ──────────────────────────
  useEffect(() => {
    if (!user) {
      // Reset state on logout
      setMatches([]);
      setCalendar([]);
      setStandings([]);
      setDataLoaded(false);
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      setLoadingMsg('Caricamento dati da Firestore…');
      try {
        const [loadedMatches, calData] = await Promise.all([
          loadAllMatches(user.uid),
          loadCalendar(user.uid),
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
  }, [user]);

  // ─── File upload handler — parse + salva su Firestore ────────────────────
  const handleFileUpload = useCallback(async (files) => {
    if (!user) return;
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
          await saveCalendar(user.uid, cal, st);

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
          await saveMatch(user.uid, match);

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
  }, [user]);

  // ─── Delete match — rimuove da Firestore e dallo stato locale ─────────────
  const handleDeleteMatch = useCallback(async (matchId) => {
    if (!user) return;
    try {
      await deleteMatchFromFirestore(user.uid, matchId);
      setMatches(prev => prev.filter(m => m.id !== matchId));
      if (selectedMatch?.id === matchId) setSelectedMatch(null);
    } catch (err) {
      console.error('[App] deleteMatch error:', err);
      setErrorMsg(`Errore eliminazione: ${err.message}`);
    }
  }, [user, selectedMatch]);

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

    return { matchAnalytics, playerTrends, suggestions };
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
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header
        className="border-b border-white/5 px-6 py-3 flex items-center justify-between"
        style={{ background: 'linear-gradient(180deg, rgba(17,24,39,0.95), rgba(10,14,26,0.98))' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
            🏐
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight" style={{ color: '#f59e0b' }}>
              My Volley Team Analysis
            </h1>
            <p className="text-[10px] text-gray-500 tracking-widest uppercase">
              v1.0 · {matches.length} partite · {allPlayers.length} atlete
            </p>
          </div>
        </div>

        {/* Centro: status messaggio */}
        <div className="flex-1 flex justify-center px-4">
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
          <button
            onClick={signOut}
            className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-white/5"
            title="Disconnetti"
          >
            Esci
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <nav className="w-48 border-r border-white/5 p-3 flex flex-col gap-1 flex-shrink-0"
          style={{ background: 'rgba(17,24,39,0.5)' }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
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
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === 'data' && (
            <DatasetManager
              matches={matches}
              calendar={calendar}
              standings={standings}
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
              onSelectMatch={(m) => { setSelectedMatch(m); setActiveTab('matches'); }}
              onSelectPlayer={(p) => { setSelectedPlayer(p); setActiveTab('players'); }}
              dashboardConfig={dashboardConfig}
              onOpenGrafici={() => setActiveTab('grafici')}
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

          {activeTab === 'training' && (
            <TrainingSuggestions
              analytics={analytics}
              matches={matches}
            />
          )}

          {activeTab === 'settings' && (
            <WeightAdjuster
              weights={weights}
              onWeightsChange={setWeights}
              analytics={analytics}
              matches={matches}
              standings={standings}
            />
          )}

          {activeTab === 'glossary' && <Glossary />}
        </main>
      </div>
    </div>
  );
}
