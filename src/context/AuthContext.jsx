// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Auth Context
// Gestisce Google Sign-In e lo stato di autenticazione dell'utente
// ============================================================================

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

const AuthContext = createContext(null);

// Codici di errore Firebase da ignorare silenziosamente
const SILENT_ERROR_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]);

const REDIRECT_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true); // true finché Firebase non risponde
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    // Cattura il risultato del redirect al ritorno da Google
    getRedirectResult(auth).catch((err) => {
      if (!SILENT_ERROR_CODES.has(err?.code)) {
        console.error('[Auth] getRedirectResult error:', err);
        setAuthError('Accesso Google non completato. Riprova.');
      }
    });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) setAuthError('');
      setAuthLoading(false);
    });
    return unsubscribe; // cleanup listener on unmount
  }, []);

  const signInWithGoogle = async () => {
    try {
      setAuthError('');
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (REDIRECT_FALLBACK_CODES.has(err?.code)) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      if (!SILENT_ERROR_CODES.has(err?.code)) {
        console.error('[Auth] signInWithGoogle error:', err);
        setAuthError('Accesso Google non riuscito. Controlla popup/cookie e riprova.');
        throw err;
      }
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, authLoading, authError, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
