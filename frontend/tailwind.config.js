/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#05070A',
        panel: '#0A0F14',
        raised: '#10161D',
        overlay: '#0D1319',
        line: 'rgba(255,255,255,0.08)',
        line2: 'rgba(255,255,255,0.14)',
        glass: 'rgba(255,255,255,0.035)',
        text: '#EDF2F1',
        muted: '#8B9A9B',
        dim: '#5C6B6D',
        accent: '#22C55E',
        'accent-soft': '#34D399',
        'accent-deep': '#16A34A',
        pass: '#34D399',
        fail: '#F5657A',
        hold: '#F2B84B',
        info: '#5EA8FF',
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: { tightest: '-0.045em' },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
      },
      boxShadow: {
        lift: '0 24px 60px -30px rgba(0,0,0,0.9)',
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 10px 30px -18px rgba(0,0,0,0.7)',
        accent: '0 0 0 1px rgba(34,197,94,0.35), 0 12px 32px -12px rgba(34,197,94,0.35)',
        popover: '0 20px 50px -20px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'fade-up': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        'pop-in': { from: { opacity: 0, transform: 'scale(0.96) translateY(4px)' }, to: { opacity: 1, transform: 'scale(1) translateY(0)' } },
        'slide-in-right': { from: { opacity: 0, transform: 'translateX(16px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        // Ambient rotation for the pipeline's database mesh — deliberately
        // slow, so it reads as "alive" rather than as a loading spinner.
        'spin-slow': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        // Breathing glow for emissive "core" elements (db mesh, hero relay).
        'pulse-soft': {
          '0%, 100%': { opacity: 0.55, transform: 'scale(1)' },
          '50%': { opacity: 1, transform: 'scale(1.06)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
        'fade-up': 'fade-up 0.22s cubic-bezier(0.16,1,0.3,1)',
        'pop-in': 'pop-in 0.16s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-right': 'slide-in-right 0.22s cubic-bezier(0.16,1,0.3,1)',
        shimmer: 'shimmer 1.6s linear infinite',
        'spin-slow': 'spin-slow 16s linear infinite',
        'pulse-soft': 'pulse-soft 2.6s cubic-bezier(0.2,0.7,0.3,1) infinite',
      },
    },
  },
  plugins: [],
}
