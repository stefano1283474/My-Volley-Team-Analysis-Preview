// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Glossario Tecnico
// Terminologia tecnica del volley e dell'analisi statistica usata nell'app
// ============================================================================

import React, { useState, useMemo } from 'react';

// ─── Dati glossario ───────────────────────────────────────────────────────────

const GLOSSARY = [

  // ── FONDAMENTALI ────────────────────────────────────────────────────────────
  {
    term: 'Attacco',
    category: 'fondamentali',
    short: 'Azione offensiva che termina con un colpo verso il campo avversario.',
    detail: `Include tutti i tipi di colpo offensivo: schiacciata, pallonetto (tip), primo tempo, attacco da seconda linea. È il fondamentale più determinante per il risultato: una squadra che attacca efficacemente sopra il 45–50% ha un vantaggio significativo.`,
    tags: ['core', 'offense'],
  },
  {
    term: 'Battuta',
    category: 'fondamentali',
    short: 'Azione con cui si mette la palla in gioco a inizio rally.',
    detail: `Esistono vari tipi: battuta float (senza rotazione, traiettoria imprevedibile), battuta in salto (jump serve, potente e spesso tesa), battuta float in salto (jump float, alta difficoltà di ricezione). La battuta è l'unico fondamentale completamente autonomo: nessun avversario può interferire. Un buon rendimento si misura sul numero di ace (punto diretto) e sui palloni difficili da ricevere per la squadra avversaria.`,
    tags: ['core', 'serve'],
  },
  {
    term: 'Ricezione',
    category: 'fondamentali',
    short: 'Primo tocco con cui si risponde alla battuta avversaria.',
    detail: `Obiettivo: inviare un pallone preciso alla palleggiatrice (valore 3 = perfetto per tutte le opzioni di gioco; valore 2 = alzata possibile ma con opzioni ridotte; valore 1 = difensivo). Nel software di scout, i valori vanno da 0 (ace subito) a 4 (perfetto). La qualità della ricezione determina l'efficacia del sistema offensivo: senza ricezione di qualità non si può giocare in velocità.`,
    tags: ['core', 'reception'],
  },
  {
    term: 'Difesa',
    category: 'fondamentali',
    short: 'Controllo del pallone in risposta a un attacco avversario.',
    detail: `Comprende la difesa di campo (in buca, bagher) e la difesa delle palle sporche. Si misura sulla capacità di mantenere il pallone in gioco (positività) e sulla qualità del controllo (difese che permettono la controffensiva). I liberi e le schiacciatrici sono i principali difensori di campo.`,
    tags: ['core', 'defense'],
  },
  {
    term: 'Muro',
    category: 'fondamentali',
    short: `Azione difensiva/offensiva in cui uno o più giocatori alzano le mani sopra il nastro per bloccare o deviare l'attacco avversario.`,
    detail: `Il muro può essere: vincente (kill block — punto diretto), positivo (devia la palla verso i difensori), neutro, negativo (tocco che favorisce l'avversario) o errore (fallo di muro). I centrali e l'opposto sono i principali muratori. Un muro efficace chiude le linee di attacco e crea transizioni offensive. Si misura su kill + posizioni positive rispetto al totale di tentativi.`,
    tags: ['core', 'block'],
  },
  {
    term: 'Alzata / Distribuzione',
    category: 'fondamentali',
    short: `Secondo tocco: la palleggiatrice gestisce il pallone e sceglie a chi e come distribuire l'attacco.`,
    detail: `Non è direttamente tracciata come fondamentale nelle statistiche individuali standard, ma è il fondamentale "nascosto" che determina la qualità del gioco offensivo. Si misura indirettamente sull'efficacia dell'attacco delle compagne quando ricevono l'alzata.`,
    tags: ['setter'],
  },

  // ── TATTICA ─────────────────────────────────────────────────────────────────
  {
    term: 'Side-out',
    category: 'tattica',
    short: 'Conquistare il punto quando si riceve la battuta avversaria (cambio-palla).',
    detail: `Il side-out rappresenta la capacità della squadra di fare punto quando non è al servizio. È la fase "risposta alla battuta": si ottiene il punto dopo aver ricevuto, alzato e attaccato. Un buon side-out è tipicamente sopra il 55–60% in A1 femminile. Nel volley moderno, è considerata la fase difensiva (si è sotto pressione della battuta altrui).`,
    tags: ['tactical', 'key'],
  },
  {
    term: 'Break-point',
    category: 'tattica',
    short: 'Conquistare il punto quando si è al servizio (rottura).',
    detail: `Il break-point è la fase in cui si serve: si vince il punto grazie a battuta ace, errore avversario, o difesa + controffensiva dopo aver servito. Un alto numero di break-point indica che la propria battuta mette in difficoltà l'avversario. Si misura come percentuale di punti vinti quando si è al servizio. Break-point + side-out = 100% dei punti totali.`,
    tags: ['tactical', 'key'],
  },
  {
    term: 'Cambiopalla',
    category: 'tattica',
    short: 'Sinonimo di side-out: ottenere il punto in risposta alla battuta altrui.',
    detail: `Termine italiano equivalente a side-out. La fase di cambiopalla include: ricezione → alzata → attacco. Si dice "buona percentuale di cambiopalla" quando la squadra conquista il punto in questa fase con regolarità.`,
    tags: ['tactical'],
  },
  {
    term: 'Rotazione',
    category: 'tattica',
    short: 'Ordine di gioco delle sei giocatrici in campo, che avanza di una posizione ad ogni punto conquistato al servizio.',
    detail: `Ci sono 6 rotazioni per squadra. Ogni rotazione ha caratteristiche diverse in attacco (chi è in zona 4, 3, 2) e in servizio. L'analisi delle rotazioni identifica quali rotazioni sono deboli (poche schiacciatrici in prima linea, palleggiatrice in zona attacco). In questa app la sezione "Rotazioni" mostra efficacia per rotazione.`,
    tags: ['tactical', 'rotation'],
  },
  {
    term: 'Prima linea',
    category: 'tattica',
    short: 'Le tre giocatrici nelle posizioni 2, 3, 4 (vicino alla rete), che possono attaccare e murare sopra il nastro.',
    detail: `In prima linea le centrali attaccano (primo tempo in zona 3) e murano. Schiacciatrici e opposto attaccano dalle ali. Le palleggiatrici in prima linea partecipano al muro. Le libere NON possono stare in prima linea.`,
    tags: ['tactical'],
  },
  {
    term: 'Seconda linea',
    category: 'tattica',
    short: 'Le tre giocatrici nelle posizioni 1, 5, 6 (lontano dalla rete), responsabili di ricezione e difesa.',
    detail: `In seconda linea centrali e palleggiatrici vengono sostituite dal libero. L'opposto tipicamente non riceve in seconda linea. Le schiacciatrici ricevono e difendono in seconda linea. È possibile attaccare da seconda linea (pipe, attacco da zona 1 o 6) se si salta da dietro la linea dei 3 metri.`,
    tags: ['tactical'],
  },
  {
    term: 'Pipe',
    category: 'tattica',
    short: 'Attacco da seconda linea in zona 6 (centro-retro campo).',
    detail: `Il pipe è un attacco potente eseguito dalla zona 6 in seconda linea. È spesso usato dall'opposto o dalla schiacciatrice come quinta opzione offensiva. Richiede coordinazione con la palleggiatrice e un salto con rincorsa partendo da dietro la linea dei 3 metri.`,
    tags: ['attack'],
  },

  // ── TIPI DI ATTACCO ──────────────────────────────────────────────────────────
  {
    term: 'Primo tempo',
    category: 'tipi_attacco',
    short: `Attacco veloce in zona 3 (centro rete), sincronizzato con l'alzata bassa e rapida della palleggiatrice.`,
    detail: `È il fondamentale offensivo principale della centrale. L'alzata è molto bassa (appena sopra il nastro) e la centrale deve partire in salto prima che la palleggiatrice tocchi la palla. Obiettivo: bucare il muro avversario in velocità, o creare superiorità numerica sul muro per le compagne di banda. Una centrale efficace nel primo tempo è un'arma tattica fondamentale.`,
    tags: ['attack', 'central'],
  },
  {
    term: 'Fast / Veloce',
    category: 'tipi_attacco',
    short: 'Categoria di alzate rapide che includono il primo tempo e varianti veloci alle ali.',
    detail: `Oltre al primo tempo in zona 3, esistono attacchi fast in zona 2 (quick alle spalle della palleggiatrice) e attacchi veloci alle bande. Le alzate fast richiedono sincronismo tra palleggiatrice e attaccante e mettono sotto pressione il sistema di muro avversario.`,
    tags: ['attack'],
  },
  {
    term: 'Pallonetto (Tip / Dink)',
    category: 'tipi_attacco',
    short: 'Tocco morbido sulla palla per farla cadere vicino al nastro o nei buchi difensivi avversari.',
    detail: `Il pallonetto è usato quando il muro è schierato o la difesa è posizionata lontano dalla rete. Richiede lettura del campo e precisione. In italiano si chiama anche "tocco morbido" o "tip". Se ben eseguito è quasi inarrestabile, ma se prevedibile diventa facile da difendere.`,
    tags: ['attack'],
  },
  {
    term: 'Parallela',
    category: 'tipi_attacco',
    short: 'Attacco lungo-linea, in direzione parallela alle linee laterali del campo.',
    detail: `La parallela da posto 4 è uno degli attacchi più forti del volley: è potente, la traiettoria è lunga e il difensore è lontano. Richiede un'ampia apertura del braccio e forza. La difesa su parallela è affidata tipicamente alla schiacciatrice avversaria in zona 5.`,
    tags: ['attack'],
  },
  {
    term: 'Diagonale',
    category: 'tipi_attacco',
    short: 'Attacco in diagonale attraverso il campo, dalla zona 4 verso la zona 1 avversaria (o dalla zona 2 verso la zona 5).',
    detail: `La diagonale è l'attacco più frequente perché sfrutta la maggiore area di campo disponibile. Dalla zona 4, la diagonale "lunga" va verso il fondo del campo avversario; quella "corta" (anche detta "diagonale corta" o "cut shot") si chiude vicino alla rete in zona 2. La variazione corta/lunga mette in difficoltà il libero avversario.`,
    tags: ['attack'],
  },

  // ── RUOLI ───────────────────────────────────────────────────────────────────
  {
    term: 'Palleggiatrice (P)',
    category: 'ruoli',
    short: `Regia della squadra: gestisce il secondo tocco e distribuisce l'attacco.`,
    detail: `La palleggiatrice (setter) è il cervello tattico della squadra. Decide in tempo reale a chi alzare, come e con quale tipo di alzata, leggendo il muro avversario e la posizione delle attaccanti. Non attacca normalmente (solo rarissimi attacchi di sorpresa sul secondo tocco). In prima linea partecipa al muro. In seconda linea è sostituita dal libero per la ricezione nelle squadre di alto livello.`,
    tags: ['role', 'setter'],
  },
  {
    term: 'Centrale (C)',
    category: 'ruoli',
    short: 'Specialista di attacco rapido (primo tempo) e muro. Non riceve e non difende (sostituita dal libero).',
    detail: `La centrale opera principalmente in prima linea: attacca in primo tempo, partecipa al muro seguendo il gioco avversario su tutta la rete. In seconda linea viene sostituita dal libero per ricezione e difesa. Una buona centrale deve avere timing perfetto per il primo tempo e mobilità laterale per il muro. Il suo contributo offensivo è misurato sull'efficacia dell'attacco; in difesa è esclusa per ruolo. Nei file scout di questa app: codice C1 / C2.`,
    tags: ['role'],
  },
  {
    term: 'Schiacciatrice (M / Banda)',
    category: 'ruoli',
    short: 'Ruolo più completo: attacco (zona 4), ricezione, difesa, battuta e muro.',
    detail: `La schiacciatrice (wing spiker, in italiano anche "banda" o "martello") è il ruolo più impegnativo fisicamente e tecnicamente perché partecipa a tutti i fondamentali. Riceve la battuta avversaria insieme al libero, attacca dalla zona 4 (sinistra) in primo e secondo ritmo, difende in seconda linea, mura in prima linea e batte. Una schiacciatrice di alto livello deve essere efficace in tutti questi aspetti. Nei file scout di questa app: codice M1 / M2.`,
    tags: ['role'],
  },
  {
    term: 'Opposto (O)',
    category: 'ruoli',
    short: 'Terminale offensivo principale: attacca dalla zona 2 (destra) e da seconda linea. Non riceve.',
    detail: `L'opposto (opposite hitter) è schierato "opposto" alla palleggiatrice in rotazione. Attacca principalmente dalla zona 2 in prima linea e dalla zona 1 in seconda linea. Non è normalmente inserito nel sistema di ricezione. È spesso il giocatore con più punti in attacco. Mura in zona 2 contro i palloni veloci. Deve avere potenza d'attacco e buona lettura del gioco difensivo. Codice: O.`,
    tags: ['role'],
  },
  {
    term: 'Libero (L)',
    category: 'ruoli',
    short: 'Specialista difensivo: ricezione e difesa. Non può battere, murare o attaccare sopra il nastro.',
    detail: `Il libero indossa una maglia di colore diverso dal resto della squadra. Può entrare e uscire dal campo per sostituire qualsiasi giocatrice di seconda linea senza che il cambio venga conteggiato. Per regolamento non può battere, murare, attaccare sopra il livello del nastro o alzare con le dita in zona d'attacco per una compagna che attaccherebbe sopra il nastro. Le squadre usano spesso due liberi. Codice: L1 / L2.`,
    tags: ['role'],
  },

  // ── STATISTICHE ─────────────────────────────────────────────────────────────
  {
    term: 'Efficacia (%)',
    category: 'statistiche',
    short: 'Percentuale di azioni con esito positivo o neutro (kill + positivi) sul totale.',
    detail: `Formula tipica: (Kill + Positivi) / Totale × 100. Per l'attacco: (Kills + Pos) / Tot. Un valore di 50% in attacco significa che metà degli attacchi sono stati kill o positivi. L'efficacia è la metrica più immediata per valutare la prestazione in un fondamentale. Valori di riferimento (A1 femminile): attacco >45% ottimo, battuta >50% buona, ricezione >55% ottima.`,
    tags: ['stats', 'key'],
  },
  {
    term: 'Efficienza (%)',
    category: 'statistiche',
    short: 'Misura il bilancio netto tra azioni positive e negative: (Kill − Errori) / Totale.',
    detail: `Formula: (Kill − Errori) / Totale × 100. Può essere negativa (più errori che kill). L'efficienza è una metrica più severa dell'efficacia perché penalizza gli errori. Un attaccante con efficienza del 30% su 100 attacchi ha 30 kill in più rispetto agli errori. Usata soprattutto per battuta e attacco per valutare la "produttività netta".`,
    tags: ['stats'],
  },
  {
    term: 'Kill (K)',
    category: 'statistiche',
    short: 'Azione che termina con punto diretto (attacco vincente, ace, muro vincente).',
    detail: `In attacco: schiacciata che tocca terra o genera errore avversario immediato. In battuta: ace (punto diretto). In muro: block vincente. Il kill è il massimo valore possibile per un'azione (valore 5 nel software Data Volley). È il dato più grezzo per valutare l'incisività offensiva.`,
    tags: ['stats'],
  },
  {
    term: 'Errore (E)',
    category: 'statistiche',
    short: `Azione che termina con punto diretto all'avversario (fuori, in rete, fallo).`,
    detail: `In attacco: palla fuori o in rete. In battuta: palla fuori o in rete. In muro: fallo di muro. Un alto numero di errori abbassa drasticamente efficienza ed efficacia. Nel bilanciamento tattico, qualche errore è fisiologico (attacco aggressivo = qualche errore in più); il problema è quando gli errori superano i kill.`,
    tags: ['stats'],
  },
  {
    term: 'Valore 3 (ricezione/difesa)',
    category: 'statistiche',
    short: 'Azione perfetta che permette alla palleggiatrice tutte le opzioni di gioco.',
    detail: `Nel sistema di valutazione Data Volley, le azioni di ricezione e difesa vengono valutate da 0 a 4. Valore 3 = "perfetto" — la palleggiatrice può alzare in qualsiasi zona con qualsiasi tipo di alzata. Valore 4 = sopra aspettative. Valore 2 = discreta, alzata possibile ma opzioni ridotte. Valore 1 = solo difensiva. Valore 0 = ace subito / errore. La percentuale di "3+" è il KPI principale per libero e bande.`,
    tags: ['stats', 'reception'],
  },
  {
    term: 'Ace',
    category: 'statistiche',
    short: `Battuta che fa punto direttamente, senza che l'avversario riesca a controllare il primo tocco.`,
    detail: `L'ace è il massimo risultato ottenibile con una battuta. Si ottiene quando la palla non viene toccata, o tocca il campo direttamente, o viene toccata ma non può essere giocata dalla squadra avversaria. Un ace equivale a un kill in battuta. Tasso di ace tipico in A1: 5–12% delle battute.`,
    tags: ['stats', 'serve'],
  },

  // ── ANALISI ─────────────────────────────────────────────────────────────────
  {
    term: 'Dato grezzo (Raw)',
    category: 'analisi',
    short: `Statistica non pesata: valore assoluto della prestazione in quella partita, indipendente dall'avversario o dal contesto.`,
    detail: `Il dato grezzo mostra la prestazione numerica pura. Ad esempio: 52% di efficacia in ricezione contro l'ultima in classifica e 52% contro la prima in classifica hanno lo stesso valore grezzo, ma hanno significati molto diversi. L'app mostra il dato grezzo come linea principale nei grafici.`,
    tags: ['analytics'],
  },
  {
    term: 'Dato pesato / Contestualizzato',
    category: 'analisi',
    short: `Statistica corretta per la difficoltà dell'avversario e l'importanza della partita.`,
    detail: `L'app applica un peso (moltiplicatore) a ogni partita basato su: posizione in classifica dell'avversario, distanza dalla vetta, tipo di gara (campionato vs. coppa). Una prestazione forte contro una squadra di alta classifica vale di più di una prestazione identica contro la penultima. Il dato pesato emerge nei grafici come linea tratteggiata.`,
    tags: ['analytics', 'key'],
  },
  {
    term: 'Trend',
    category: 'analisi',
    short: 'Direzione della prestazione nel tempo: in miglioramento, in calo, o stabile.',
    detail: `L'app calcola il trend confrontando la media delle ultime 3 partite con la media delle partite precedenti. Se la media recente è inferiore di oltre il 10% rispetto alla media precedente → trend "declining" (in calo). Se superiore di oltre il 10% → trend "improving". Altrimenti → "stable". Il trend è calcolato sia sul dato grezzo sia sul dato pesato.`,
    tags: ['analytics', 'key'],
  },
  {
    term: 'Media pesata stagionale',
    category: 'analisi',
    short: 'Media delle prestazioni di una giocatrice su tutta la stagione, con ogni partita pesata per la sua importanza.',
    detail: `Non è una semplice media aritmetica: ogni partita contribuisce in proporzione al suo peso (calcolato sull'avversario e sul tipo di gara). Questo evita che partite contro avversari deboli gonfiino artificialmente la media, e viceversa che una prestazione contro un avversario forte venga sottovalutata.`,
    tags: ['analytics'],
  },
  {
    term: 'Fondamentale CORE',
    category: 'analisi',
    short: 'Fondamentale "essenziale" per quel ruolo: un calo in questa area ha impatto diretto sulla squadra.',
    detail: `Ogni ruolo ha fondamentali core (essenziali), secondari e esclusi. Esempio: per la schiacciatrice tutti i fondamentali sono core; per la centrale lo sono attacco, muro e battuta (ma non ricezione e difesa, che sono escluse perché sostituita dal libero). Un segnale di calo su un fondamentale core è classificato con priorità più alta nei suggerimenti di allenamento.`,
    tags: ['analytics', 'app'],
  },
  {
    term: 'Peso partita',
    category: 'analisi',
    short: `Coefficiente moltiplicativo che misura l'importanza relativa di una partita nella stagione.`,
    detail: `Calcolato dall'app in base a: classifica dell'avversario (più è alto, più pesa), distanza dalla testa della classifica, tipo di partita (campionato conta di più di una partita amichevole). Il peso viene usato per calcolare statistiche ponderate e per il calcolo del trend pesato.`,
    tags: ['analytics', 'app'],
  },

  // ── SISTEMI DI GIOCO ────────────────────────────────────────────────────────
  {
    term: 'Sistema 5-1',
    category: 'sistemi',
    short: 'Sistema di gioco con 1 palleggiatrice e 5 attaccanti.',
    detail: `Il sistema più usato nel volley moderno ad alto livello. C'è una sola palleggiatrice che alza in tutte le rotazioni. L'opposto è il partner offensivo principale. Vantaggi: continuità di gioco, la palleggiatrice conosce sempre la sua posizione. Svantaggi: la palleggiatrice deve reggere l'intero arco della partita.`,
    tags: ['system'],
  },
  {
    term: 'Sistema 6-2',
    category: 'sistemi',
    short: 'Sistema con 2 palleggiatrici che alzano solo quando sono in seconda linea, con 6 attaccanti in prima linea.',
    detail: `Usato principalmente nelle categorie giovanili o a livelli non elite. Il vantaggio è di avere sempre 3 attaccanti in prima linea. Lo svantaggio è che richiede due palleggiatrici di pari livello e le alzate cambiano ogni rotazione. Meno diffuso nel volley femminile d'alto livello.`,
    tags: ['system'],
  },
  {
    term: 'Sistema W (W-System)',
    category: 'sistemi',
    short: 'Schema di ricezione a W con 5 giocatrici (o 4): bande e libero formano una W per coprire il campo.',
    detail: `La ricezione a W è il sistema standard: libero in zona 6, due schiacciatrici in zona 1 e 5, con le punte della W verso la rete. La palleggiatrice si libera verso la rete appena la battuta parte. Varianti a 4 ricevitrici (libero + 1 banda + opposto in alcune rotazioni) sono usate quando una schiacciatrice non è una buona ricevitrice.`,
    tags: ['system', 'reception'],
  },
];

// ─── Categorie ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'all',          label: 'Tutti', icon: '≡' },
  { id: 'fondamentali', label: 'Fondamentali', icon: '🏐' },
  { id: 'tattica',      label: 'Tattica', icon: '♟' },
  { id: 'tipi_attacco', label: 'Tipi di Attacco', icon: '⚔' },
  { id: 'ruoli',        label: 'Ruoli', icon: '★' },
  { id: 'statistiche',  label: 'Statistiche', icon: '📊' },
  { id: 'analisi',      label: 'Analisi (App)', icon: '◈' },
  { id: 'sistemi',      label: 'Sistemi di Gioco', icon: '⬡' },
];

const CAT_COLORS = {
  fondamentali: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  tattica:      'text-sky-400 bg-sky-500/10 border-sky-500/20',
  tipi_attacco: 'text-red-400 bg-red-500/10 border-red-500/20',
  ruoli:        'text-purple-400 bg-purple-500/10 border-purple-500/20',
  statistiche:  'text-green-400 bg-green-500/10 border-green-500/20',
  analisi:      'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  sistemi:      'text-orange-400 bg-orange-500/10 border-orange-500/20',
};

const CAT_BORDER = {
  fondamentali: 'border-amber-500/15',
  tattica:      'border-sky-500/15',
  tipi_attacco: 'border-red-500/15',
  ruoli:        'border-purple-500/15',
  statistiche:  'border-green-500/15',
  analisi:      'border-cyan-500/15',
  sistemi:      'border-orange-500/15',
};

// ─── Main component ──────────────────────────────────────────────────────────

export default function Glossary() {
  const [search,   setSearch]   = useState('');
  const [category, setCategory] = useState('all');
  const [expanded, setExpanded] = useState({}); // { [term]: bool }

  const toggleExpand = (term) =>
    setExpanded(prev => ({ ...prev, [term]: !prev[term] }));

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return GLOSSARY.filter(item => {
      const matchCat = category === 'all' || item.category === category;
      const matchQ   = !q ||
        item.term.toLowerCase().includes(q) ||
        item.short.toLowerCase().includes(q) ||
        item.detail.toLowerCase().includes(q) ||
        (item.tags || []).some(t => t.includes(q));
      return matchCat && matchQ;
    });
  }, [search, category]);

  // Group filtered items by category for display
  const grouped = useMemo(() => {
    if (category !== 'all') return { [category]: filtered };
    const g = {};
    for (const item of filtered) {
      if (!g[item.category]) g[item.category] = [];
      g[item.category].push(item);
    }
    return g;
  }, [filtered, category]);

  const catOrder = ['fondamentali', 'tattica', 'tipi_attacco', 'ruoli', 'statistiche', 'analisi', 'sistemi'];

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Glossario Tecnico</h2>
        <p className="text-sm text-gray-400">
          Terminologia del volley e dell'analisi statistica usata in questa app.
          {' '}<span className="text-gray-600">{GLOSSARY.length} termini in {CATEGORIES.length - 1} categorie.</span>
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Cerca un termine… (es. "side-out", "efficacia", "libero")`}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-gray-200 placeholder-gray-600 outline-none"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map(cat => {
          const cnt = cat.id === 'all'
            ? GLOSSARY.length
            : GLOSSARY.filter(g => g.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all ${
                category === cat.id
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'text-gray-500 border border-white/8 hover:text-gray-300 hover:border-white/15'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span className="text-[10px] text-gray-600 ml-0.5">{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* Results count */}
      {search && (
        <p className="text-xs text-gray-500">
          {filtered.length === 0
            ? 'Nessun termine trovato.'
            : `${filtered.length} termin${filtered.length > 1 ? 'i' : 'e'} trovato${filtered.length > 1 ? 'i' : ''} per "${search}"`}
        </p>
      )}

      {/* Grouped entries */}
      {catOrder
        .filter(cat => grouped[cat]?.length > 0)
        .map(cat => {
          const catMeta = CATEGORIES.find(c => c.id === cat);
          const items = grouped[cat];
          const colorClass = CAT_COLORS[cat] || 'text-gray-400 bg-white/5 border-white/10';
          return (
            <div key={cat} className="space-y-2">
              {/* Category header (only shown in "all" view) */}
              {category === 'all' && (
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-base">{catMeta?.icon}</span>
                  <h3 className="text-sm font-semibold text-gray-300">{catMeta?.label}</h3>
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-[10px] text-gray-600">{items.length} termini</span>
                </div>
              )}

              {/* Term cards */}
              {items.map(item => {
                const isOpen = !!expanded[item.term];
                const borderClass = CAT_BORDER[item.category] || 'border-white/10';
                return (
                  <div
                    key={item.term}
                    className={`glass-card border ${borderClass} transition-all`}
                  >
                    <button
                      className="w-full flex items-start justify-between gap-4 p-4 text-left"
                      onClick={() => toggleExpand(item.term)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-bold text-white">{item.term}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colorClass}`}>
                            {catMeta?.label || item.category}
                          </span>
                          {item.tags?.includes('key') && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-semibold">
                              CHIAVE
                            </span>
                          )}
                          {item.tags?.includes('app') && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-semibold">
                              IN APP
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">{item.short}</p>
                      </div>
                      <span className="text-gray-600 text-xs flex-shrink-0 mt-0.5">
                        {isOpen ? '▲' : '▼'}
                      </span>
                    </button>

                    {isOpen && (
                      <div
                        className="px-4 pb-4 border-t border-white/5 pt-3"
                        style={{ borderTopColor: 'rgba(255,255,255,0.05)' }}
                      >
                        <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">
                          {item.detail}
                        </p>
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex gap-1.5 mt-3 flex-wrap">
                            {item.tags.map(tag => (
                              <span
                                key={tag}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-600 font-mono"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

      {filtered.length === 0 && !search && (
        <div className="glass-card p-6 text-center">
          <p className="text-sm text-gray-400">Nessun termine disponibile per questa categoria.</p>
        </div>
      )}

      {/* Footer note */}
      <div className="glass-card p-4 text-center">
        <p className="text-xs text-gray-600">
          Il glossario è integrato nell'app e non richiede connessione.
          I termini marcati <span className="text-cyan-400 font-semibold">IN APP</span> si riferiscono
          a concetti specifici dell'analisi di questa applicazione.
          I termini <span className="text-amber-400 font-semibold">CHIAVE</span> sono i più importanti
          per la lettura dei report.
        </p>
      </div>
    </div>
  );
}
