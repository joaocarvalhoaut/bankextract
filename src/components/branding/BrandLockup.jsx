import BrandLogo from './BrandLogo';
import { BRAND } from '../../theme/brand';

/**
 * BrandLockup — Logo + texto vertical/horizontal
 * variant: 'sidebar' | 'login' | 'compact'
 */
export default function BrandLockup({ variant = 'sidebar', className = '' }) {
  if (variant === 'compact') {
    return (
      <div className={"flex items-center gap-2 " + className}>
        <BrandLogo size="sm" />
        <span
          style={{ fontFamily: "'Inter Tight', Inter, sans-serif", background: "linear-gradient(135deg, #005DFF, #14D8FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          className="text-sm font-black tracking-tight"
        >
          NC Finance
        </span>
      </div>
    );
  }

  if (variant === 'login') {
    return (
      <div className={"flex flex-col items-center gap-4 " + className}>
        <BrandLogo size="lg" />
        <div className="text-center">
          <h1
            style={{ fontFamily: "'Inter Tight', Inter, sans-serif", background: "linear-gradient(135deg, #005DFF 0%, #14D8FF 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
            className="text-3xl font-black tracking-tight"
          >
            NC Finance
          </h1>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.25em] text-white/40">
            by NC HUB
          </p>
          <p className="mt-3 text-sm text-white/60">{BRAND.tagline}</p>
        </div>
      </div>
    );
  }

  // sidebar (default)
  return (
    <div className={"flex items-center gap-3 " + className}>
      <BrandLogo size="md" />
      <div className="min-w-0">
        <p
          style={{ fontFamily: "'Inter Tight', Inter, sans-serif", background: "linear-gradient(135deg, #005DFF 0%, #14D8FF 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          className="text-sm font-black tracking-tight leading-none"
        >
          NC Finance
        </p>
        <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          by NC HUB
        </p>
        <p className="mt-1 text-[10px] font-medium tracking-[0.08em] text-slate-400">
          {BRAND.tagline}
        </p>
      </div>
    </div>
  );
}
