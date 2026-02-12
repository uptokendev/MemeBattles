/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './src/content/**/*.md'
  ],
  theme: {
    extend: {
      colors: {
        mb: {
          bg: '#0b0b0e',
          panel: '#111116',
          panel2: '#15151c',
          border: 'rgba(255,255,255,0.08)',
          text: 'rgba(255,255,255,0.92)',
          muted: 'rgba(255,255,255,0.65)',
          gold: '#ddab4d',
          gold2: '#af7f23'
        }
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(221,171,77,0.25), 0 0 30px rgba(221,171,77,0.10)'
      }
    }
  },
  plugins: []
}
