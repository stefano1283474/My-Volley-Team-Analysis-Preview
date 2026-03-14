import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3003,
    open: false,
    host: '0.0.0.0',
  },
  // Risolve l'errore "Failed to resolve entry for package @firebase/auth"
  // esbuild non riesce a navigare il campo `exports` di @firebase/auth.
  // Escludiamo l'intero pacchetto firebase dal pre-bundling: viene servito come
  // ESM puro e Vite/browser lo gestisce senza problemi.
  optimizeDeps: {
    exclude: [
      'firebase',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
    ],
  },
});
