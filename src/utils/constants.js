// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Constants & Configuration
// ============================================================================

// Team name mapping: sheet name → CSV official name
export const TEAM_MAP = {
  'Cagliero': 'G.S. CAGLIERO',
  'Lovvey': 'LOVVEY TEAM BLACK',
  'Astra': 'ASTRA PHOENIX',
  'Volley_Angels': 'VOLLEY ANGELS CUSANO ASD',
  'Geas': 'GEAS VOLLEY ASD',
  'Aspes': 'ASPES VOLLEY CUS STATALE',
  'Limbiate': 'SMARTSERVICE LIMBIATE VOLLEY',
  'Numia_VeroVolley': 'VERO VOLLEY NUMIA',
  'OSL Garbagnate': 'OSL VOLLEY GARBAGNATE',
  'Bresso': 'CALIMAN BRESSO',
  'Cormano': 'NAPOCOLOR - VOLLEY CORMANO',
  'GPB_Bollate': 'GPB BOLLATE VOLLEY',
};

// Reverse map: CSV name → short key
export const TEAM_MAP_REVERSE = Object.fromEntries(
  Object.entries(TEAM_MAP).map(([k, v]) => [v.toUpperCase(), k])
);

// Our team
export const OUR_TEAM = 'GEAS VOLLEY ASD';

// Fundamental names
export const FUNDAMENTALS = {
  a: { key: 'a', name: 'Attacco', nameEN: 'Attack', color: '#f43f5e' },
  b: { key: 'b', name: 'Battuta', nameEN: 'Serve', color: '#8b5cf6' },
  r: { key: 'r', name: 'Ricezione', nameEN: 'Reception', color: '#0ea5e9' },
  d: { key: 'd', name: 'Difesa', nameEN: 'Defense', color: '#10b981' },
  m: { key: 'm', name: 'Muro', nameEN: 'Block', color: '#f59e0b' },
};

// Scale descriptions per fundamental
export const SCALE_DESCRIPTIONS = {
  r: {
    5: 'Palleggio vicino a rete',
    4: 'Palleggio staccato da rete',
    3: 'Attacco da bagher',
    2: 'Nessuna azione d\'attacco',
    1: 'Errore',
  },
  d: {
    5: 'Palleggio vicino a rete',
    4: 'Palleggio staccato da rete',
    3: 'Attacco da bagher',
    2: 'Nessuna azione d\'attacco',
    1: 'Errore',
  },
  a: {
    5: 'Punto diretto',
    4: 'Freeball (avv. non attacca)',
    3: 'Avv. attacca da bagher',
    2: 'Avv. attacca da palleggio',
    1: 'Errore',
  },
  b: {
    5: 'Ace (punto diretto)',
    4: 'Freeball (avv. non attacca)',
    3: 'Avv. attacca da bagher',
    2: 'Avv. attacca da palleggio',
    1: 'Errore',
  },
  m: {
    5: 'Punto diretto (muro vincente)',
    4: 'Freeball (avv. non attacca)',
    3: 'Avv. attacca da bagher',
    2: 'Avv. attacca da palleggio',
    1: 'Errore (muro out / tocco fallo)',
  },
};

// Inverse mapping: our fundamental → opponent's deduced fundamental
// Our R(x) → Opponent Serve(6-x), except R1→Serve5, "solo Avv"→Serve1
// Our D(x) → Opponent Attack(6-x), except "Avv preceduto da tocco"→Attack1
// Our A(x) → Opponent Defense(6-x), A2→Def4+5 (combined)
// Our B(x) → Opponent Reception(6-x), B2→Rec4+5 (combined)
export const INVERSE_MAP = {
  // Our reception → their serve
  r: { 1: { fund: 'b', val: 5 }, 2: { fund: 'b', val: 4 }, 3: { fund: 'b', val: 3 }, 4: { fund: 'b', val: 2 } },
  // Our defense → their attack
  d: { 1: { fund: 'a', val: 5 }, 2: { fund: 'a', val: 4 }, 3: { fund: 'a', val: 3 }, 4: { fund: 'a', val: 2 } },
  // Our attack → their defense
  a: { 5: { fund: 'd', val: 1 }, 4: { fund: 'd', val: 2 }, 3: { fund: 'd', val: 3 }, 2: { fund: 'd', val: '4+5' } },
  // Our serve → their reception
  b: { 5: { fund: 'r', val: 1 }, 4: { fund: 'r', val: 2 }, 3: { fund: 'r', val: 3 }, 2: { fund: 'r', val: '4+5' } },
};

// Default weight settings (adjustable by coach)
export const DEFAULT_WEIGHTS = {
  opponentStrength: 0.25,    // How much opponent ranking matters
  opponentPerformance: 0.25, // How much opponent actual performance matters
  setCompetitiveness: 0.15,  // How much set margins matter
  matchResult: 0.10,         // How much win/loss matters
  chainContext: 0.25,        // How much rally chain context matters
};

// Player roles
export const ROLES = {
  P1: 'Palleggiatrice 1',
  P2: 'Palleggiatrice 2',
  C1: 'Centrale 1',
  C2: 'Centrale 2',
  M1: 'Banda 1',
  M2: 'Banda 2',
  O: 'Opposto',
  L1: 'Libero 1',
  L2: 'Libero 2',
};

// Core fundamentals per role
// Based on women's volleyball role responsibilities:
//
// PALLEGGIATRICE (P): Regia (distribuzione), muro quando in prima linea, difesa.
//   - NON riceve di norma (si sposta in zona 3 alla battuta avversaria)
//   - NON attacca (salvo rarissimi 2° tocco d'attacco)
//   - Battuta presente ma secondaria
//
// CENTRALE (C): Attacco (primo tempo), muro (fondamentale primario), battuta.
//   - NON riceve (viene sostituita dal libero in seconda linea)
//   - NON difende di norma (viene sostituita dal libero in seconda linea)
//
// SCHIACCIATRICE/BANDA (M = Martello): Ruolo più completo — attacco, ricezione, difesa, battuta, muro.
//   - Tutti i fondamentali sono core
//
// OPPOSTO (O): Attacco (terminale offensivo principale), muro, battuta.
//   - Di norma NON riceve (non è nel sistema di ricezione)
//   - Difesa secondaria (spesso sostituita dal secondo libero o DS)
//
// LIBERO (L): Ricezione, difesa.
//   - Per regolamento NON può: battere, murare, attaccare sopra il nastro
//
export const ROLE_CORE_FUNDAMENTALS = {
  P1: {
    core: ['defense'],           // Difesa quando in seconda linea
    secondary: ['serve', 'block'], // Battuta, muro quando in prima linea
    excluded: ['attack', 'reception'], // Non attacca, non riceve
    label: 'Palleggiatrice',
    description: 'Regia, distribuzione, muro in prima linea, difesa in seconda linea',
  },
  P2: {
    core: ['defense'],
    secondary: ['serve', 'block'],
    excluded: ['attack', 'reception'],
    label: 'Palleggiatrice',
    description: 'Regia, distribuzione, muro in prima linea, difesa in seconda linea',
  },
  M1: {
    core: ['attack', 'reception', 'serve', 'block', 'defense'], // Ruolo completo (Schiacciatrice/Martello)
    secondary: [],
    excluded: [],
    label: 'Schiacciatrice (Banda)',
    description: 'Ruolo più completo: attacco, ricezione, battuta, muro, difesa',
  },
  M2: {
    core: ['attack', 'reception', 'serve', 'block', 'defense'],
    secondary: [],
    excluded: [],
    label: 'Schiacciatrice (Banda)',
    description: 'Ruolo più completo: attacco, ricezione, battuta, muro, difesa',
  },
  C1: {
    core: ['attack', 'block', 'serve'], // Primo tempo, muro centrale, battuta
    secondary: [],
    excluded: ['reception', 'defense'], // Sostituita dal libero in 2a linea
    label: 'Centrale',
    description: 'Attacco primo tempo, muro centrale, battuta. Sostituita dal libero in 2a linea',
  },
  C2: {
    core: ['attack', 'block', 'serve'],
    secondary: [],
    excluded: ['reception', 'defense'],
    label: 'Centrale',
    description: 'Attacco primo tempo, muro centrale, battuta. Sostituita dal libero in 2a linea',
  },
  O: {
    core: ['attack', 'block', 'serve'],   // Terminale offensivo, muro in zona 2, battuta
    secondary: ['defense'],                 // Difesa secondaria
    excluded: ['reception'],                // Non è nel sistema di ricezione
    label: 'Opposto',
    description: 'Terminale offensivo principale, muro in zona 2, battuta. Non riceve',
  },
  L1: {
    core: ['reception', 'defense'],         // Specialista difensivo
    secondary: [],
    excluded: ['attack', 'block', 'serve'], // Per regolamento non può attaccare, murare, battere
    label: 'Libero',
    description: 'Specialista ricezione e difesa. Per regolamento: no attacco, no muro, no battuta',
  },
  L2: {
    core: ['reception', 'defense'],
    secondary: [],
    excluded: ['attack', 'block', 'serve'],
    label: 'Libero',
    description: 'Specialista ricezione e difesa. Per regolamento: no attacco, no muro, no battuta',
  },
};

// Match result factors
export const RESULT_FACTORS = {
  '3-0_win': { label: 'Vittoria 3-0', factor: 0.3 },
  '3-1_win': { label: 'Vittoria 3-1', factor: 0.5 },
  '3-2_win': { label: 'Vittoria 3-2', factor: 1.0 },
  '2-3_loss': { label: 'Sconfitta 2-3', factor: 0.4 },
  '1-3_loss': { label: 'Sconfitta 1-3', factor: -0.3 },
  '0-3_loss': { label: 'Sconfitta 0-3', factor: -1.0 },
};

// Chart colors
export const COLORS = {
  raw: '#38bdf8',       // Sky blue for raw data
  weighted: '#f59e0b',  // Amber for weighted data
  positive: '#a3e635',  // Green for positive trends
  negative: '#fb7185',  // Red for negative trends
  neutral: '#94a3b8',   // Gray for neutral
  opponent: '#8b5cf6',  // Purple for opponent data
  bg: '#0a0e1a',
  cardBg: '#111827',
  border: 'rgba(255,255,255,0.06)',
};
