// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Delete Account Modal
// Implementa il diritto alla cancellazione (GDPR Art. 17)
// ============================================================================

import React, { useState } from 'react';
import { deleteUserAccount } from '../utils/firestoreService';
import { useAuth } from '../context/AuthContext';

/**
 * DeleteAccountModal
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 */
export default function DeleteAccountModal({ open, onClose }) {
  const { user, signOut } = useAuth();
  const [step, setStep] = useState('confirm'); // 'confirm' | 'deleting' | 'done' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const reset = () => { setStep('confirm'); setErrorMsg(''); };

  const handleClose = () => { reset(); onClose(); };

  const handleDelete = async () => {
    if (!user) { setErrorMsg('Utente non autenticato.'); setStep('error'); return; }
    setStep('deleting');
    try {
      // 1. Elimina dati Firestore
      const result = await deleteUserAccount(user);
      if (!result.success) {
        setErrorMsg(result.error || 'Impossibile eliminare i dati Firestore.');
        setStep('error');
        return;
      }
      // 2. Elimina account Firebase Auth
      await user.delete();
      setStep('done');
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') {
        // Firebase richiede re-autenticazione recente per eliminare l'account
        setErrorMsg(
          'Per sicurezza, Firebase richiede che tu abbia effettuato l\'accesso recentemente. ' +
          'Effettua il logout e accedi di nuovo con Google, poi riprova l\'eliminazione.'
        );
        setStep('error');
      } else {
        setErrorMsg(err.message || 'Errore imprevisto durante l\'eliminazione.');
        setStep('error');
      }
    }
  };

  const handleDoneLogout = async () => {
    try { await signOut(); } catch (_) {}
    handleClose();
  };

  const handleErrorLogout = async () => {
    try { await signOut(); } catch (_) {}
    handleClose();
  };

  if (!open) return null;

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.80)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
  };

  const cardStyle = {
    background: '#111827',
    border: '1px solid rgba(220,38,38,0.30)',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '420px',
    padding: '28px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  };

  const btnBase = {
    borderRadius: '8px', padding: '10px 20px',
    fontWeight: 700, fontSize: '14px',
    cursor: 'pointer', border: 'none',
  };

  // ── STEP: confirm ──
  if (step === 'confirm') {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '28px' }}>⚠️</div>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#f87171', margin: 0 }}>
              Elimina Account e Dati
            </h2>
          </div>

          <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6, margin: 0 }}>
            Stai per eliminare il tuo account e <strong style={{ color: '#e5e7eb' }}>tutti i dati associati</strong>:
          </p>
          <ul style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.7, paddingLeft: '20px', margin: 0 }}>
            <li>Tutte le tue squadre e dataset</li>
            <li>Tutte le partite e i dati statistici</li>
            <li>Il calendario e le impostazioni</li>
            <li>Il tuo profilo e account di accesso</li>
          </ul>
          <p style={{ fontSize: '13px', color: '#f87171', fontWeight: 600, margin: 0 }}>
            ⛔ Questa operazione è IRREVERSIBILE e non può essere annullata.
          </p>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={handleClose} style={{ ...btnBase, background: 'rgba(255,255,255,0.07)', color: '#9ca3af' }}>
              Annulla
            </button>
            <button
              onClick={handleDelete}
              style={{ ...btnBase, background: '#dc2626', color: '#fff' }}
            >
              Elimina definitivamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP: deleting ──
  if (step === 'deleting') {
    return (
      <div style={overlayStyle}>
        <div style={{ ...cardStyle, alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: '36px', height: '36px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>
            Eliminazione in corso…<br />
            <span style={{ fontSize: '12px' }}>Non chiudere questa finestra.</span>
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── STEP: done ──
  if (step === 'done') {
    return (
      <div style={overlayStyle}>
        <div style={{ ...cardStyle, alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '40px' }}>✅</div>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#4ade80', margin: 0 }}>
            Account eliminato
          </h2>
          <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
            Il tuo account e tutti i tuoi dati sono stati eliminati con successo.
            Grazie per aver utilizzato il servizio.
          </p>
          <button
            onClick={handleDoneLogout}
            style={{ ...btnBase, background: '#f59e0b', color: '#1a1a1a', width: '100%' }}
          >
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  // ── STEP: error ──
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '24px' }}>❌</div>
          <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#f87171', margin: 0 }}>
            Errore durante l'eliminazione
          </h2>
        </div>
        <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6, margin: 0 }}>
          {errorMsg}
        </p>
        {errorMsg.includes('recentemente') ? (
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={handleClose} style={{ ...btnBase, background: 'rgba(255,255,255,0.07)', color: '#9ca3af' }}>
              Annulla
            </button>
            <button onClick={handleErrorLogout} style={{ ...btnBase, background: '#f59e0b', color: '#1a1a1a' }}>
              Effettua logout e riprova
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button onClick={handleClose} style={{ ...btnBase, background: 'rgba(255,255,255,0.07)', color: '#9ca3af' }}>
              Chiudi
            </button>
            <button onClick={reset} style={{ ...btnBase, background: '#dc2626', color: '#fff' }}>
              Riprova
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
