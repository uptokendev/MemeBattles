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
          bg: '#0b0d10',
          panel: '#14181e',
          panel2: '#1c2128',
          border: 'rgba(132,141,152,0.24)',
          text: '#f2f2ee',
          muted: '#b5bcc6',
          accent: '#f06a1a',
          accent2: '#ff8a2a',
          nvg: '#39e317',
          olive: '#7c8b5a'
        }
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(240,106,26,0.18), 0 0 28px rgba(240,106,26,0.12)',
        nvg: '0 0 0 1px rgba(57,227,23,0.16), 0 0 24px rgba(57,227,23,0.10)'
      }
    }
  },
  plugins: []
}
