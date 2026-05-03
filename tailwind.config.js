/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#edfdf6',
          100: '#d3f9e8',
          200: '#aaf1d3',
          300: '#72e4b6',
          400: '#38cd93',
          500: '#10b174',
          600: '#0E9F6E',
          700: '#0c7a54',
          800: '#0d6145',
          900: '#0c503b',
        },
      },
      boxShadow: {
        soft:   '0 1px 4px 0 rgba(15,23,42,0.06), 0 1px 2px -1px rgba(15,23,42,0.04)',
        card:   '0 4px 24px -4px rgba(15,23,42,0.10), 0 1px 4px -2px rgba(15,23,42,0.06)',
        lifted: '0 12px 40px -8px rgba(15,23,42,0.16), 0 4px 16px -4px rgba(15,23,42,0.08)',
        glow:   '0 0 0 3px rgba(14,159,110,0.18)',
        inner:  'inset 0 1px 2px rgba(15,23,42,0.08)',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      animation: {
        'fade-in':      'fadeIn 0.4s ease-out both',
        'slide-up':     'slideUp 0.45s cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-left':'slideInLeft 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'pulse-slow':   'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'shimmer':      'shimmer 2.2s linear infinite',
        'float':        'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%':   { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'mesh-dark': 'radial-gradient(at 20% 20%, rgba(14,159,110,0.15) 0, transparent 50%), radial-gradient(at 80% 80%, rgba(30,58,138,0.2) 0, transparent 50%), radial-gradient(at 50% 50%, rgba(15,23,42,0.6) 0, transparent 60%)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34,1.56,0.64,1)',
      },
    }
  },
  plugins: [],
};
