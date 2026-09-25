/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        base: {
          50: '#f6f6f7',
          100: '#e8e8ea',
          200: '#d3d3d8',
          300: '#a8a8b3',
          400: '#7a7a88',
          500: '#5c5c6b',
          600: '#44444f',
          700: '#2f2f38',
          800: '#1c1c22',
          850: '#17171c',
          900: '#111115',
          950: '#0a0a0d'
        },
        accent: {
          400: '#8f7cff',
          500: '#7c5cff',
          600: '#6a45f0'
        }
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)'
      }
    }
  },
  plugins: []
}
