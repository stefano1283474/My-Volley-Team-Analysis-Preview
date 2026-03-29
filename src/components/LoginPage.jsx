// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Login Page
// Mostrata quando l'utente non è autenticato.
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { APP_NAME, APP_VERSION } from '../utils/constants';
import LegalModal from './LegalModal';

export default function LoginPage() {
  const { signInWithGoogle, authError } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [ageError, setAgeError] = useState(false);
  const [legalModal, setLegalModal] = useState({ open: false, tab: 'privacy' });
  const [cookieDismissed, setCookieDismissed] = useState(true);

  // Controlla se il banner cookie è già stato accettato
  useEffect(() => {
    try {
      setCookieDismissed(!!localStorage.getItem('mvta_cookie_ok'));
    } catch (_) {}
  }, []);

  const handleDismissCookie = () => {
    try { localStorage.setItem('mvta_cookie_ok', '1'); } catch (_) {}
    setCookieDismissed(true);
  };

  const openLegal = (tab) => setLegalModal({ open: true, tab });

  const handleLogin = async () => {
    if (!ageConfirmed) {
      setAgeError(true);
      return;
    }
    setAgeError(false);
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError('Accesso fallito. Riprova.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #111827 60%, #0d1424 100%)' }}
    >
      {/* Decorazione sfondo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-5 blur-3xl"
          style={{ background: 'radial-gradient(circle, #f59e0b, transparent)' }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-5 blur-3xl"
          style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 p-10 max-w-sm w-full">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl shadow-xl"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
          >
            🏐
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#f59e0b' }}>{APP_NAME}</h1>
            <p className="text-xs text-gray-500 mt-1 tracking-widest uppercase">
              v{APP_VERSION} · Analisi · Dati · Coaching
            </p>
          </div>
        </div>

        {/* Login card */}
        <div
          className="w-full rounded-2xl p-6 flex flex-col gap-4"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <p className="text-sm text-gray-400 text-center">
            Accedi con il tuo account Google per sincronizzare i dati su Database in Cloud.
          </p>

          {/* Google Sign-In Button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all"
            style={{
              background: loading ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.92)',
              color: '#1f2937',
              border: '1px solid rgba(255,255,255,0.15)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-400">Accesso in corso…</span>
              </>
            ) : (
              <>
                {/* Google logo SVG */}
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.616z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/>
                </svg>
                Accedi con Google
              </>
            )}
          </button>

          {(error || authError) && (
            <p className="text-xs text-red-400 text-center">{error || authError}</p>
          )}
        </div>

        {/* Checkbox età + consenso */}
        <div
          style={{
            background: ageError ? 'rgba(220,38,38,0.10)' : 'rgba(245,158,11,0.06)',
            border: `1px solid ${ageError ? 'rgba(220,38,38,0.35)' : 'rgba(245,158,11,0.20)'}`,
            borderRadius: '10px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <input
            type="checkbox"
            id="ageCheck"
            checked={ageConfirmed}
            onChange={(e) => { setAgeConfirmed(e.target.checked); if (e.target.checked) setAgeError(false); }}
            style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer', accentColor: '#f59e0b', flexShrink: 0 }}
          />
          <label htmlFor="ageCheck" style={{ fontSize: '12px', color: ageError ? '#fca5a5' : '#9ca3af', cursor: 'pointer', lineHeight: 1.5 }}>
            Confermo di avere almeno <strong style={{ color: ageError ? '#fca5a5' : '#e5e7eb' }}>14 anni</strong> e di aver letto e accettato i{' '}
            <button type="button" onClick={() => openLegal('terms')} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 0, fontSize: '12px', textDecoration: 'underline' }}>
              Termini d'Uso
            </button>
            {' '}e la{' '}
            <button type="button" onClick={() => openLegal('privacy')} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 0, fontSize: '12px', textDecoration: 'underline' }}>
              Privacy Policy
            </button>.
          </label>
        </div>
        {ageError && (
          <p style={{ fontSize: '11px', color: '#f87171', textAlign: 'center', margin: 0 }}>
            Devi confermare l'età e accettare i Termini prima di continuare.
          </p>
        )}

        {/* Footer note — testo corretto (GDPR: non fuorviante) */}
        <p className="text-[11px] text-gray-600 text-center px-4">
          I tuoi dati sportivi sono archiviati nel tuo spazio Cloud personale.
          L'accesso è protetto e riservato a te e all'amministratore del servizio per finalità di gestione tecnica.{' '}
          <button type="button" onClick={() => openLegal('privacy')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>
            Privacy Policy
          </button>
        </p>
      </div>

      {/* Modale legale */}
      <LegalModal
        open={legalModal.open}
        defaultTab={legalModal.tab}
        onClose={() => setLegalModal({ open: false, tab: 'privacy' })}
      />

      {/* Cookie notice banner */}
      {!cookieDismissed && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998,
          background: '#1e293b',
          borderTop: '2px solid #f59e0b',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}>
          <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>
            Questo sito usa cookie tecnici necessari per l'autenticazione. Nessun cookie di profilazione.{' '}
            <button type="button" onClick={() => openLegal('privacy')} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 0, fontSize: '13px', textDecoration: 'underline' }}>
              Privacy Policy
            </button>
          </p>
          <button
            onClick={handleDismissCookie}
            style={{
              background: '#f59e0b', color: '#1a1a1a',
              border: 'none', borderRadius: '8px',
              padding: '7px 18px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            Capito
          </button>
        </div>
      )}
    </div>
  );
}
