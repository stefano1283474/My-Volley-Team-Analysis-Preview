// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Auth Context
// Gestisce Google Sign-In e lo stato di autenticazione dell'utente
// ============================================================================

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true); // true finché Firebase non risponde

  useEffect(() => {
    // Cattura il risultato del redirect al ritorno da Google
    getRedirectResult(auth).catch((err) => {
      if (!SILENT_ERROR_CODES.has(err?.code)) {
        console.error('[Auth] getRedirectResult error:', err);
      }
    });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsubscribe; // cleanup listener on unmount
  }, []);

  // signInWithRedirect evita l'uso dei popup e le conseguenti
  // Cross-Origin-Opener-Policy warnings di Chrome.
  const signInWithGoogle = async () => {
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      if (!SILENT_ERROR_CODES.has(err?.code)) {
        console.error('[Auth] signInWithGoogle error:', err);
        throw err;
      }
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, authLoading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
