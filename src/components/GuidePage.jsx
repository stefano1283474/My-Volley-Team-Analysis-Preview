// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Guida / Help
// Documentazione integrata per l'utilizzo dell'applicazione.
// ============================================================================

import React, { useState } from 'react';

// ─── Struttura della guida ───────────────────────────────────────────────────

const GUIDE_SECTIONS = [
  {
    id: 'intro',
    label: 'Introduzione',
    icon: '🏐',
    content: [
      {
        title: "Che cos'è Volley Performance Analyzer",
        text: "VPA è uno strumento di analisi tattica e prestazionale per allenatori di pallavolo. Consente di elaborare gli scout delle partite (file DataVolley .xlsm/.xlsx), calcolare statistiche avanzate e visualizzare l'andamento della stagione con grafici interattivi.",
      },
      {
        title: 'Profili utente',
        text: "L'app offre tre livelli di profilo, selezionabili nella barra in alto:",
        list: [
          "Base — Accesso alle funzionalità essenziali: caricamento dati, analisi partite, analisi giocatrici, suggerimenti allenamento e classifica.",
          "Pro — Tutto di Base + analisi squadra e avversari, sezione Evidenze completa (Trend, Rotazioni, Attacco), piano settimanale allenamento.",
          "Pro Max — Tutto di Pro + analisi del gioco avanzata, Catene di gioco, piano allenamento esteso e grafici personalizzati.",
        ],
      },
    ],
  },
  {
    id: 'dati',
    label: 'Caricamento dati',
    icon: '📂',
    content: [
      {
        title: 'Carica Scout Partite',
        text: "Nella sezione Sistema → Dati trovi due zone di upload separate:",
        list: [
          "Scout Partite — accetta file .xlsm e .xlsx esportati da DataVolley. Puoi trascinare più file contemporaneamente per un import multiplo.",
          "Calendario Campionato — accetta un file .csv con il calendario della stagione. Il calendario alimenta la classifica, i pesi delle partite e il piano settimanale.",
        ],
      },
      {
        title: 'Salvataggio in cloud',
        text: "Tutti i dati vengono salvati automaticamente su Firestore (database cloud di Google). Non è necessario esportare o fare backup: i dati sono disponibili da qualsiasi dispositivo con lo stesso account Google.",
      },
      {
        title: 'Condivisione dataset',
        text: "Dal pannello di condivisione in Gestione Archivio puoi generare un link e invitare altri utenti (es. assistenti allenatori, preparatori) con diversi livelli di accesso: lettura o lettura e scrittura.",
      },
    ],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '🏠',
    content: [
      {
        title: 'La dashboard principale',
        text: "La Home mostra una panoramica rapida della stagione: KPI principali (posizione in classifica, Side-Out%, Break-Point%, peso medio partite), classifica, grafici personalizzabili e lista partite.",
      },
      {
        title: 'Personalizzare la dashboard',
        text: "Puoi scegliere quali grafici mostrare in due modi:",
        list: [
          "📌 Pinna — ogni grafico/tabella in qualsiasi sezione dell'app ha un tasto 📌 (visibile al passaggio del mouse). Clicca per aggiungere o rimuovere dalla dashboard.",
          "📊 Personalizza — il tasto nell'header della dashboard apre la galleria completa dei grafici disponibili (sezione Grafici, solo profilo Pro Max).",
        ],
      },
      {
        title: 'Modalità Modifica (riordino)',
        text: "Clicca il tasto ✏️ Modifica nella dashboard per entrare in modalità editing. In questa modalità ogni grafico mostra i tasti ▲ ▼ per spostarlo su o giù nell'ordine di visualizzazione. Clicca ✓ Fine per uscire.",
      },
      {
        title: 'Dato Grezzo vs Pesato (per grafico)',
        text: "I grafici che supportano la distinzione tra dato grezzo e dato pesato mostrano un selettore Grezzo / Pesato nell'angolo in alto a destra (visibile al passaggio del mouse). Questa selezione è indipendente per ogni grafico.",
      },
      {
        title: 'Classifica e identificazione team',
        text: "Il widget Classifica mostra la classifica del campionato derivata dal calendario CSV. Usa il tasto ✏️ Identifica Team / Modifica per selezionare la tua squadra dalla classifica. La squadra identificata influenza il calcolo del peso delle partite e la posizione KPI.",
      },
    ],
  },
  {
    id: 'metriche',
    label: 'Metriche chiave',
    icon: '📊',
    content: [
      {
        title: 'Efficacia (Efficacy)',
        text: "La metrica principale di VPA. Misura in percentuale la qualità di esecuzione di un fondamentale, calcolata come combinazione di qualità e frequenza degli esiti positivi (eccellente + positivo) rispetto al totale delle azioni del fondamentale.",
      },
      {
        title: 'Side-Out %',
        text: "Percentuale di rotazioni di ricezione in cui la squadra conquista il punto. Un valore superiore al 55% è generalmente considerato buono. Misura la capacità di convertire la ricezione in punto.",
      },
      {
        title: 'Break-Point %',
        text: "Percentuale di rotazioni di battuta in cui la squadra conquista il punto (rompendo il servizio avversario). Misura la capacità offensiva in fase di battuta e la tenuta difensiva.",
      },
      {
        title: 'Peso partita (Match Weight)',
        text: "Coefficiente che pondera ogni partita in base alla forza dell'avversario (posizione in classifica) e al contesto (casa/trasferta, fase del campionato). Le partite contro avversari più forti hanno peso maggiore. Il dato 'Pesato' moltiplica il valore grezzo per questo coefficiente.",
      },
      {
        title: 'FNC — Fondamentale Normalizzato Contestuale',
        text: "Meccanismo avanzato (configurabile in Sistema → Config) che normalizza le prestazioni rispetto alle baseline di riferimento, consentendo confronti più equi tra fondamentali con scale diverse (es. attacco vs difesa).",
      },
    ],
  },
  {
    id: 'fondamentali',
    label: 'Fondamentali',
    icon: '⚔',
    content: [
      {
        title: '⚔ Attacco',
        text: "Analisi delle azioni offensive: efficacia degli attaccanti nelle diverse rotazioni, distribuzione per zona, percentuale di punto diretto (ace attacco), errori e muro subito.",
      },
      {
        title: '🎯 Battuta',
        text: "Qualità e efficacia della battuta: percentuale di ace, errori, difficoltà generate alla ricezione avversaria. Il peso della battuta influenza direttamente il Break-Point% della squadra.",
      },
      {
        title: '🤲 Ricezione',
        text: "Qualità della ricezione: percentuale di ricezioni perfette (che consentono un primo tempo) vs buone vs negative. Un'alta qualità di ricezione è la base per costruire il Side-Out.",
      },
      {
        title: '🛡 Difesa',
        text: "Efficacia in difesa: percentuale di palloni difesi e ricostruiti positivamente. Include l'analisi per zona e per rotazione.",
      },
      {
        title: '🧱 Muro',
        text: "Contributo del muro: muri punto diretti, muri che rallentano, errori. Il muro è analizzato anche in combinazione con la battuta e la difesa nelle catene di gioco.",
      },
    ],
  },
  {
    id: 'analisi',
    label: 'Sezioni di analisi',
    icon: '🔬',
    content: [
      {
        title: 'Analisi → Partite',
        text: "Visualizzazione dettagliata di ogni partita: sets, punteggi, statistiche per fondamentale per set, confronto con l'avversario, commenti tecnici personalizzabili.",
      },
      {
        title: 'Analisi → Giocatrici',
        text: "Scheda individuale per ogni atleta: trend prestazionale nella stagione, confronto con la media squadra, analisi per fondamentale e per set.",
      },
      {
        title: 'Analisi → Squadra (Pro)',
        text: "Visione complessiva della squadra: radar dell'efficacia aggregata, distribuzione per ruolo, variazioni stagionali.",
      },
      {
        title: 'Analisi → Avversari (Pro)',
        text: "Analisi dello scout dedotto degli avversari (in sviluppo). Mostrerà benchmark di campionato e storico partite contro ogni avversario.",
      },
      {
        title: 'Analisi → Gioco (Pro Max)',
        text: "Analisi avanzata del sistema di gioco: distribuzione della palleggiatrice, first-tempo, distribuzione diagonale/pipe, efficacia per zona d'attacco.",
      },
    ],
  },
  {
    id: 'evidenze',
    label: 'Evidenze (Pro)',
    icon: '📈',
    content: [
      {
        title: 'Suggerimenti',
        text: "Raccomandazioni automatiche basate sull'analisi dei dati: aree di miglioramento prioritarie, confronto con baseline di riferimento, focus di allenamento suggeriti per ogni fondamentale.",
      },
      {
        title: 'Trend',
        text: "Andamento stagionale interattivo su tre livelli: squadra (media aggregata), per fondamentale (una linea per ogni voce), per giocatrice (seleziona atleta e fondamentale).",
      },
      {
        title: 'Rotazioni',
        text: "Analisi dell'efficacia per ogni rotazione del cambiopalla: identifica le rotazioni forti e quelle critiche, sia in side-out che in break-point.",
      },
      {
        title: 'Attacco',
        text: "Distribuzione degli attacchi per zona, per rotazione, per atleta. Efficacia per tipologia di attacco (diagonale, line, pipe, primo tempo).",
      },
      {
        title: 'Catene (Pro Max)',
        text: "Analisi delle sequenze di gioco: ricezione → palleggio → attacco, difesa → contrattacco. Identifica le 'catene virtuose' che portano al punto e quelle negative da correggere.",
      },
    ],
  },
  {
    id: 'training',
    label: 'Training',
    icon: '🏋️',
    content: [
      {
        title: 'Suggerimenti allenamento',
        text: "Lista prioritizzata di esercizi e focus tecnici derivati automaticamente dalle aree di maggiore criticità rilevate nei dati. Personalizzabile per tipo di azione e soglia di priorità.",
      },
      {
        title: 'Piano Settimana (Pro)',
        text: "Pianificazione settimanale dell'allenamento tenendo conto del calendario (prossima partita, avversario, distanza tra partite) e delle criticità rilevate. Ogni sessione suggerisce volume e intensità per ogni fondamentale.",
      },
      {
        title: 'Piano Stagionale (Pro Max)',
        text: "Visione longitudinale su tutto il campionato: periodizzazione della stagione, correlazione tra carichi di lavoro e prestazioni nelle partite successive.",
      },
    ],
  },
  {
    id: 'config',
    label: 'Configurazione',
    icon: '🔧',
    content: [
      {
        title: 'Pesi partita (Pro)',
        text: "Configura quanto ogni fattore pesa nel calcolo del peso delle partite: forza avversario (posizione in classifica), casa/trasferta, fase del campionato, importanza del match.",
      },
      {
        title: 'FNC — Normalizzazione Contestuale (Pro)',
        text: "Attiva e configura il meccanismo FNC: scegli tra Z-Score (normalizzazione statistica rispetto alla media campionato) e Relativo (normalizzazione rispetto al proprio storico). Regola l'intensità della normalizzazione con il cursore peso.",
      },
      {
        title: 'Profili di configurazione (Pro)',
        text: "Salva più configurazioni di pesi/FNC con nomi diversi (es. 'Fase regolare', 'Playoff') e passa da una all'altra con un click.",
      },
    ],
  },
  {
    id: 'faq',
    label: 'FAQ',
    icon: '❓',
    content: [
      {
        title: 'I dati sono al sicuro?',
        text: "Sì. I dati vengono salvati su Firestore (Google Cloud) con autenticazione Google Sign-In. Solo tu (e le persone che inviti esplicitamente) puoi accedere al tuo dataset.",
      },
      {
        title: "Posso usare l'app su più dispositivi?",
        text: "Sì. Accedendo con lo stesso account Google, trovi esattamente gli stessi dati su qualsiasi dispositivo (computer, tablet, smartphone).",
      },
      {
        title: 'Quante partite posso caricare?',
        text: "Non c'è un limite fisso. La performance dell'app rimane ottimale fino a circa 50-60 partite per stagione. Per stagioni molto lunghe o campionati multipli, è consigliabile creare un account separato.",
      },
      {
        title: 'Il formato del file CSV del calendario è specifico?',
        text: "Il CSV del calendario deve contenere almeno le colonne: giornata, data, ora, squadra_casa, squadra_ospite. Colonne opzionali: campo, punteggio_casa, punteggio_ospite. La prima riga deve essere l'intestazione (header).",
      },
      {
        title: 'Cosa significa il badge ★ sulla classifica?',
        text: "Identifica la tua squadra nella classifica. Puoi impostarlo o modificarlo con il tasto ✏️ Identifica Team nel widget classifica della dashboard. È importante impostarlo correttamente perché influenza i calcoli dei pesi partita.",
      },
      {
        title: 'Posso esportare i grafici?',
        text: "Al momento l'export diretto dei grafici non è disponibile, ma puoi usare la funzione screenshot del tuo dispositivo. Una funzione di export PDF è in programma per le prossime versioni.",
      },
    ],
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function GuidePage() {
  const [activeId, setActiveId] = useState('intro');

  const activeSection = GUIDE_SECTIONS.find(s => s.id === activeId) || GUIDE_SECTIONS[0];

  return (
    <div className="max-w-5xl mx-auto flex gap-6">

      {/* ── Sidebar navigation ──────────────────────────────────────────── */}
      <aside className="w-44 shrink-0 hidden md:block">
        <nav className="space-y-0.5 sticky top-4">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider font-medium mb-2 px-2">
            Argomenti
          </p>
          {GUIDE_SECTIONS.map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveId(sec.id)}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs transition-all text-left ${
                activeId === sec.id
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
            >
              <span className="text-sm shrink-0">{sec.icon}</span>
              <span className="truncate">{sec.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0">
        {/* Mobile section picker */}
        <div className="md:hidden mb-4">
          <select
            value={activeId}
            onChange={e => setActiveId(e.target.value)}
            className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200"
          >
            {GUIDE_SECTIONS.map(sec => (
              <option key={sec.id} value={sec.id}>{sec.icon} {sec.label}</option>
            ))}
          </select>
        </div>

        {/* Section header */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">{activeSection.icon}</span>
            <h2 className="text-xl font-bold text-white">{activeSection.label}</h2>
          </div>
          <div className="h-px bg-gradient-to-r from-amber-500/30 to-transparent" />
        </div>

        {/* Section content */}
        <div className="space-y-5">
          {activeSection.content.map((block, i) => (
            <div key={i} className="glass-card p-5">
              <h3 className="text-sm font-semibold text-amber-300 mb-2">{block.title}</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{block.text}</p>
              {block.list && (
                <ul className="mt-3 space-y-2">
                  {block.list.map((item, j) => (
                    <li key={j} className="flex gap-2 text-sm text-gray-400">
                      <span className="text-amber-500/60 shrink-0 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {/* Quick nav bottom */}
        <div className="mt-6 flex justify-between text-xs text-gray-500">
          {(() => {
            const idx = GUIDE_SECTIONS.findIndex(s => s.id === activeId);
            const prev = GUIDE_SECTIONS[idx - 1];
            const next = GUIDE_SECTIONS[idx + 1];
            return (
              <>
                <div>
                  {prev && (
                    <button
                      onClick={() => setActiveId(prev.id)}
                      className="flex items-center gap-1.5 hover:text-gray-300 transition-colors"
                    >
                      ← {prev.icon} {prev.label}
                    </button>
                  )}
                </div>
                <div>
                  {next && (
                    <button
                      onClick={() => setActiveId(next.id)}
                      className="flex items-center gap-1.5 hover:text-gray-300 transition-colors"
                    >
                      {next.icon} {next.label} →
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </main>
    </div>
  );
}
