/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#0a0e1a', 800: '#111827', 700: '#1a2235', 600: '#243049' },
        accent: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
        volt: { 400: '#a3e635', 500: '#84cc16' },
        coral: { 400: '#fb7185', 500: '#f43f5e' },
        sky: { 400: '#38bdf8', 500: '#0ea5e9' },
      },
      fontFamily: {
        display: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
