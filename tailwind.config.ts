import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        line: 'rgb(var(--c-line-rgb) / var(--c-line-a))',
        'line-strong': 'rgb(var(--c-line-rgb) / var(--c-line-a-strong))',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        // fixed brand accents — look good on both light and dark backgrounds
        teal: {
          DEFAULT: '#22B08A',
          dark: '#15614F',
          glow: 'rgba(34,176,138,0.35)',
        },
        amber: '#E8B04B',
        red: '#E0654A',
        // fixed dark ink used as text ON TOP of teal/amber accent buttons,
        // independent of the light/dark page theme, for guaranteed contrast
        inkOnAccent: '#0A121C',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--c-line-rgb) / var(--c-line-a-strong)), 0 8px 30px rgb(0 0 0 / var(--c-shadow-a))',
        'glow-teal': '0 0 24px rgba(34,176,138,0.25)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
