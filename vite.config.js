import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    open: false,
    host: '0.0.0.0',
  },
  optimizeDeps: {
    include: [
      'papaparse',
      'xlsx',
      'recharts',
      'lodash',
      'react',
      'react-dom',
      'react/jsx-runtime',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
    ],
  },
});
