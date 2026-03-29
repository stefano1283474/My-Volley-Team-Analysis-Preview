// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Legal Modal
// Privacy Policy e Termini d'Uso (GDPR Art. 13)
// ============================================================================

import React, { useState } from 'react';

const SECTION_STYLE = { marginBottom: '20px' };
const H3_STYLE = { fontSize: '13px', fontWeight: 700, color: '#f59e0b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' };
const P_STYLE = { fontSize: '13px', color: '#9ca3af', lineHeight: 1.6, marginBottom: '6px' };

function PrivacyContent() {
  return (
    <div>
      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>1. Titolare del Trattamento</h3>
        <p style={P_STYLE}>
          Il servizio My Volley Team Analysis è gestito dal suo sviluppatore individuale.
          Per qualsiasi richiesta relativa ai dati personali contattare:{' '}
          <span style={{ color: '#f59e0b' }}>[inserire email di contatto]</span>.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>2. Dati Raccolti</h3>
        <p style={P_STYLE}>Al momento dell'accesso tramite Google, raccogliamo e trattiamo:</p>
        <ul style={{ ...P_STYLE, paddingLeft: '20px' }}>
          <li>Indirizzo email Google (usato come identificativo nel database)</li>
          <li>UID Firebase (identificativo tecnico univoco)</li>
          <li>Data e ora dell'ultimo accesso</li>
          <li>Ruolo utente e pacchetto assegnato (Base / Pro / Pro Max)</li>
          <li>Log di utilizzo delle funzionalità dell'app</li>
          <li>Dati delle partite, calendar e dataset caricati dall'utente</li>
          <li>Cookie tecnici di sessione Firebase Auth</li>
        </ul>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>3. Finalità del Trattamento</h3>
        <ul style={{ ...P_STYLE, paddingLeft: '20px' }}>
          <li>Erogazione del servizio di analisi pallavolo</li>
          <li>Gestione degli accessi, dei profili e dei pacchetti utente</li>
          <li>Monitoraggio dell'utilizzo per il miglioramento del servizio</li>
          <li>Gestione della condivisione dati tra utenti (funzione squadra condivisa)</li>
        </ul>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>4. Base Giuridica</h3>
        <p style={P_STYLE}>
          Esecuzione del contratto (Art. 6.1.b GDPR) per i dati necessari al funzionamento del servizio.
          Legittimo interesse (Art. 6.1.f GDPR) per i log di utilizzo anonimi finalizzati al miglioramento del servizio.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>5. Conservazione</h3>
        <p style={P_STYLE}>
          I dati sono conservati per tutta la durata dell'account attivo.
          L'utente può richiedere la cancellazione in qualsiasi momento tramite la funzione
          "Elimina Account" o inviando richiesta al titolare del trattamento.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>6. Destinatari dei Dati</h3>
        <p style={P_STYLE}>
          I dati sono archiviati su Google Firebase / Firestore (Google Ireland Limited),
          che opera come Responsabile del Trattamento ai sensi dell'Art. 28 GDPR.
          Google è certificato EU-US Data Privacy Framework.
          Nessun dato viene ceduto a terzi per finalità commerciali o promozionali.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>7. Diritti dell'Utente</h3>
        <p style={P_STYLE}>In qualità di interessato hai diritto a:</p>
        <ul style={{ ...P_STYLE, paddingLeft: '20px' }}>
          <li>Accesso ai tuoi dati personali (Art. 15)</li>
          <li>Rettifica di dati inesatti (Art. 16)</li>
          <li>Cancellazione dei dati — "diritto all'oblio" (Art. 17)</li>
          <li>Portabilità dei dati (Art. 20)</li>
          <li>Opposizione al trattamento (Art. 21)</li>
          <li>Proporre reclamo al Garante Privacy italiano (garante.it)</li>
        </ul>
        <p style={P_STYLE}>
          Per esercitare i tuoi diritti contatta il titolare del trattamento o usa la funzione
          "Elimina Account" disponibile nell'app.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>8. Cookie</h3>
        <p style={P_STYLE}>
          L'app utilizza esclusivamente cookie tecnici necessari per l'autenticazione Firebase
          (mantenimento della sessione di accesso). Non vengono usati cookie di profilazione,
          di marketing o di terze parti.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>9. Sicurezza</h3>
        <p style={P_STYLE}>
          I dati sono protetti tramite le misure di sicurezza di Google Firebase,
          incluse regole di accesso Firestore che garantiscono che ogni utente possa
          accedere esclusivamente ai propri dati. L'amministratore del servizio può
          accedere ai dati per finalità di gestione tecnica e supporto.
        </p>
      </div>

      <p style={{ ...P_STYLE, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px', marginTop: '8px' }}>
        <em>Ultimo aggiornamento: Marzo 2026 — Versione Preview</em>
      </p>
    </div>
  );
}

function TermsContent() {
  return (
    <div>
      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>1. Accettazione dei Termini</h3>
        <p style={P_STYLE}>
          Accedendo a My Volley Team Analysis (di seguito "il Servizio"), l'utente accetta
          integralmente i presenti Termini e Condizioni d'Uso. Se non si accettano questi termini,
          non è consentito utilizzare il Servizio.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>2. Descrizione del Servizio</h3>
        <p style={P_STYLE}>
          My Volley Team Analysis è un'applicazione web per l'analisi delle prestazioni sportive
          nel volley femminile, rivolta ad allenatori e staff tecnico. Il Servizio è attualmente
          in versione <strong style={{ color: '#f59e0b' }}>Preview</strong> e può essere soggetto a
          modifiche, interruzioni o cessazione senza preavviso.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>3. Requisiti di Accesso</h3>
        <ul style={{ ...P_STYLE, paddingLeft: '20px' }}>
          <li>Account Google valido</li>
          <li>Età minima: 14 anni (o autorizzazione del genitore/tutore)</li>
          <li>Accesso soggetto ad approvazione — il gestore può revocare l'accesso in qualsiasi momento</li>
        </ul>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>4. Utilizzo Consentito</h3>
        <p style={P_STYLE}>Il Servizio è destinato all'uso sportivo/personale. È vietato:</p>
        <ul style={{ ...P_STYLE, paddingLeft: '20px' }}>
          <li>Utilizzo commerciale non autorizzato</li>
          <li>Condivisione non autorizzata delle credenziali di accesso</li>
          <li>Tentativo di accedere ai dati di altri utenti</li>
          <li>Caricamento di dati falsi, fuorvianti o contenuti illeciti</li>
          <li>Reverse engineering o copia del codice sorgente</li>
        </ul>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>5. Dati Inseriti dall'Utente</h3>
        <p style={P_STYLE}>
          L'utente è responsabile dei dati inseriti nel Servizio (nomi giocatori, statistiche,
          documenti). L'utente garantisce di avere il diritto di trattare tali dati e di aver
          ottenuto il consenso necessario (es. dei giocatori minorenni).
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>6. Disponibilità del Servizio (Versione Preview)</h3>
        <p style={P_STYLE}>
          Il Servizio è fornito "così com'è" in versione Preview. Il gestore non garantisce
          disponibilità continua, assenza di errori o conservazione permanente dei dati.
          Il Servizio può essere modificato, sospeso o terminato in qualsiasi momento.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>7. Limitazione di Responsabilità</h3>
        <p style={P_STYLE}>
          Il gestore non è responsabile per perdita di dati, interruzioni del servizio,
          danni indiretti o conseguenti derivanti dall'utilizzo del Servizio.
          La responsabilità massima è limitata all'importo eventualmente corrisposto dall'utente.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>8. Proprietà Intellettuale</h3>
        <p style={P_STYLE}>
          Il codice, il design, i loghi e i contenuti originali del Servizio sono di proprietà
          del gestore e sono protetti dalle leggi sul diritto d'autore.
        </p>
      </div>

      <div style={SECTION_STYLE}>
        <h3 style={H3_STYLE}>9. Legge Applicabile</h3>
        <p style={P_STYLE}>
          I presenti Termini sono regolati dalla legge italiana.
          Per qualsiasi controversia è competente il Foro del luogo di residenza del gestore.
        </p>
      </div>

      <p style={{ ...P_STYLE, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px', marginTop: '8px' }}>
        <em>Ultimo aggiornamento: Marzo 2026 — Versione Preview</em>
      </p>
    </div>
  );
}

/**
 * LegalModal — modale per Privacy Policy e Termini d'Uso
 *
 * Props:
 *   open: boolean
 *   defaultTab: 'privacy' | 'terms'
 *   onClose: () => void
 */
export default function LegalModal({ open, defaultTab = 'privacy', onClose }) {
  const [tab, setTab] = useState(defaultTab);

  // Aggiorna il tab quando cambia defaultTab (es. click su link diversi)
  React.useEffect(() => { if (open) setTab(defaultTab); }, [open, defaultTab]);

  if (!open) return null;

  const tabBtn = (id, label) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '8px 20px',
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 700,
        background: tab === id ? '#f59e0b' : 'rgba(255,255,255,0.06)',
        color: tab === id ? '#1a1a1a' : '#9ca3af',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {tabBtn('privacy', 'Privacy Policy')}
            {tabBtn('terms', 'Termini d\'Uso')}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              color: '#9ca3af',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Content scrollabile */}
        <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
          {tab === 'privacy' ? <PrivacyContent /> : <TermsContent />}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              background: '#f59e0b',
              color: '#1a1a1a',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 24px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
