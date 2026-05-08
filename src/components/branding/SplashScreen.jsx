import { useEffect, useState } from 'react';
import BrandLogo from './BrandLogo';

/**
 * SplashScreen — tela de carregamento premium NC Finance
 */
export default function SplashScreen() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 700);
    const t3 = setTimeout(() => setPhase(3), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      style={{ background: '#071120' }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(0,93,255,0.18) 0%, transparent 65%)' }}
      />

      {/* Circuit grid (subtle) */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="sp-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#14D8FF" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sp-grid)" />
      </svg>

      {/* Logo block */}
      <div
        className="relative flex flex-col items-center gap-6"
        style={{
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease'
        }}
      >
        {/* Glow ring behind logo */}
        <div
          className="absolute -inset-8 rounded-full"
          style={{
            background: 'radial-gradient(ellipse, rgba(0,93,255,0.25) 0%, transparent 70%)',
            opacity: phase >= 2 ? 1 : 0,
            transition: 'opacity 0.8s ease'
          }}
        />

        <BrandLogo size="lg" />

        <div className="text-center">
          <p
            style={{
              fontFamily: "'Inter Tight', Inter, sans-serif",
              background: 'linear-gradient(135deg, #005DFF 0%, #14D8FF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              opacity: phase >= 1 ? 1 : 0,
              transition: 'opacity 0.5s ease 0.1s'
            }}
            className="text-2xl font-black tracking-tight"
          >
            NC Finance
          </p>
          <p
            style={{
              opacity: phase >= 2 ? 0.4 : 0,
              transition: 'opacity 0.5s ease'
            }}
            className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white"
          >
            by NC HUB
          </p>
        </div>

        {/* Loading bar */}
        <div className="w-48 overflow-hidden rounded-full bg-white/10 h-[2px]">
          <div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, #005DFF, #14D8FF)',
              width: phase >= 3 ? '100%' : phase >= 2 ? '60%' : phase >= 1 ? '25%' : '0%',
              transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)',
              boxShadow: '0 0 8px rgba(20,216,255,0.6)'
            }}
          />
        </div>

        <p
          style={{
            opacity: phase >= 2 ? 0.45 : 0,
            transition: 'opacity 0.5s ease'
          }}
          className="text-xs text-white"
        >
          Inicializando ambiente...
        </p>
      </div>

      {/* Powered by */}
      <p
        className="absolute bottom-6 text-[10px] font-medium tracking-widest text-white/20 uppercase"
        style={{ opacity: phase >= 3 ? 1 : 0, transition: 'opacity 0.5s ease' }}
      >
        Powered by NC HUB
      </p>
    </div>
  );
}
