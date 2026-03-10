// ============================================================================
// VOLLEY PERFORMANCE ANALYZER — Firebase Initialization
// ============================================================================

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCVlsHEejZn-eFjFZQlZZeg8LFkW2oI1WU',
  authDomain: 'volley-analisys-1aafc.firebaseapp.com',
  projectId: 'volley-analisys-1aafc',
  storageBucket: 'volley-analisys-1aafc.firebasestorage.app',
  messagingSenderId: '304243190555',
  appId: '1:304243190555:web:34dcc783ca09a92c4201be',
  measurementId: 'G-KW5TR4HBSB',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Force Google account selection every time
googleProvider.setCustomParameters({ prompt: 'select_account' });
