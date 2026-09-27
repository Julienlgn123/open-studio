/** Les couleurs passent par des variables CSS (canaux RGB) : le thème clair/sombre
 * se bascule avec `data-theme` sur <html>, sans toucher aux classes des composants. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          50: v('base-50'),
          100: v('base-100'),
          200: v('base-200'),
          300: v('base-300'),
          400: v('base-400'),
          500: v('base-500'),
          600: v('base-600'),
          700: v('base-700'),
          800: v('base-800'),
          850: v('base-850'),
          900: v('base-900'),
          950: v('base-950')
        },
        accent: {
          400: v('accent-400'),
          500: v('accent-500'),
          600: v('accent-600')
        }
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        composer: 'var(--shadow-composer)'
      }
    }
  },
  plugins: []
}
