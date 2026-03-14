// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Login Page
// Mostrata quando l'utente non è autenticato.
// ============================================================================

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { APP_NAME, APP_VERSION } from '../utils/constants';

export default function LoginPage() {
  const { signInWithGoogle, authError } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
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

        {/* Footer note */}
        <p className="text-[11px] text-gray-600 text-center px-4">
          I dati vengono archiviati esclusivamente nel tuo Database in Cloud.
          Solo tu puoi accedervi.
        </p>
      </div>
    </div>
  );
}
