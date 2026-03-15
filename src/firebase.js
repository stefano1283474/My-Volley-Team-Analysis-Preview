// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Firebase Initialization
// ============================================================================

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCl_ppzWIZW8xL0UNdoL-bwFX9vpFbMo0Q',
  authDomain: 'volley-data-studio.firebaseapp.com',
  projectId: 'volley-data-studio',
  storageBucket: 'volley-data-studio.firebasestorage.app',
  messagingSenderId: '55271933225',
  appId: '1:55271933225:web:19980c83c3f0d21283e338',
  measurementId: 'G-F79R9P9JQM',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Force Google account selection every time
googleProvider.setCustomParameters({ prompt: 'select_account' });
