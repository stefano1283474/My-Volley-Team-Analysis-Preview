# 🏐 Volley Performance Analyzer

Strumento di analisi avanzata delle performance per allenatori di pallavolo.

## Funzionalità

- **Pesatura contestuale**: le statistiche grezze vengono pesate in base alla forza dell'avversario, al contesto della partita, ai parziali dei set e alla complessità dei rally
- **Scout dedotto avversario**: ricostruisce le statistiche dell'avversario dalle tue quartine
- **Analisi catene causali**: ogni rally viene scomposto nella catena di azioni per capire causa-effetto
- **Trend nel tempo**: curva di forma per giocatrice e per fondamentale (grezzo vs pesato)
- **Report partita contestualizzato**: lettura "alternativa" della gara basata sui dati
- **Suggerimenti allenamento**: indicazioni automatiche su chi allenare in cosa
- **Analisi rotazioni**: side-out e break-point per rotazione
- **Pesi regolabili**: l'allenatore può aggiustare i pesi finché la lettura corrisponde a ciò che ha visto

## Setup

### Prerequisiti
- Node.js 18+ installato
- npm o yarn

### Installazione

```bash
# Installa le dipendenze
npm install

# Avvia in sviluppo
npm run dev

# Build per produzione
npm run build
```

L'app si aprirà su http://localhost:3000

## Come usare

1. **Carica il Calendario CSV** - vai nella sezione "Dati" e carica il file CSV del calendario per ottenere classifica e contesto
2. **Carica gli Scout** - carica i file .xlsm o .xlsx delle partite (uno per gara)
3. **Esplora la Dashboard** - vedi la panoramica squadra con metriche chiave
4. **Analizza le Partite** - vai in "Partite" per il report contestualizzato di ogni gara
5. **Schede Giocatrici** - profilo radar, trend, delta grezzo/pesato per ogni atleta
6. **Regola i Pesi** - in "Pesi" puoi calibrare l'algoritmo sulla tua esperienza

## Struttura File Input

### CSV Calendario
- Delimitatore: `;`
- Campi: OSPITANTE, OSPITE, SET1, SET2, PNT1_1..PNT2_5, etc.

### XLSM/XLSX Scout
- Fogli richiesti: `El. Gioc.`, `Set 1`..`Set 5`, `Riepilogo`, `Gioco`
- Quartine nel formato: `[numero_maglia][fondamentale][valore]`
  - Esempio: `15r4` = giocatrice #15, ricezione qualità 4

## Algoritmo di Pesatura

Il **Coefficiente di Contesto (CC)** è calcolato come:

```
CC = 1 + Σ(peso_i × fattore_i)
```

### Fattori:
1. **Forza Avversario** (classifica) — normalizzato tra -1 e +1
2. **Performance Avversario** — errori reali vs attesi (ha giocato sopra o sotto il suo livello?)
3. **Competitività Set** — set combattuti aumentano il peso
4. **Risultato** — vittorie sofferte valgono di più
5. **Complessità Rally** — rally lunghi = gioco più difficile

Il peso viene poi declinato **per fondamentale**: lo scout dedotto dell'avversario confrontato con il benchmark del campionato determina pesi specifici per attacco, battuta, ricezione, difesa e muro.

## Tecnologie

- React 18 + Vite
- Recharts (grafici)
- SheetJS/xlsx (parsing Excel)
- PapaParse (parsing CSV)
- Tailwind CSS (styling)
