import { BRAND } from '../../theme/brand';

/**
 * BrandLogo — Símbolo compacto "NC" com glow azul
 * size: 'sm' | 'md' | 'lg'
 */
export default function BrandLogo({ size = 'md', className = '' }) {
  const dim = { sm: 32, md: 40, lg: 56 }[size] ?? 40;
  const font = { sm: 11, md: 14, lg: 20 }[size] ?? 14;

  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="NC Finance"
    >
      <defs>
        <linearGradient id="nc-brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#005DFF" />
          <stop offset="100%" stopColor="#14D8FF" />
        </linearGradient>
        <filter id="nc-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Background */}
      <rect width="40" height="40" rx="10" fill="#071120" />

      {/* Glow layer */}
      <rect width="40" height="40" rx="10" fill="url(#nc-brand-grad)" opacity="0.15" />

      {/* Border */}
      <rect x="0.5" y="0.5" width="39" height="39" rx="9.5"
        stroke="url(#nc-brand-grad)" strokeOpacity="0.6" strokeWidth="1" fill="none" />

      {/* Circuit accent lines */}
      <line x1="6" y1="34" x2="14" y2="34" stroke="#14D8FF" strokeOpacity="0.3" strokeWidth="0.75" />
      <line x1="14" y1="34" x2="14" y2="30" stroke="#14D8FF" strokeOpacity="0.3" strokeWidth="0.75" />
      <line x1="26" y1="6" x2="34" y2="6" stroke="#005DFF" strokeOpacity="0.3" strokeWidth="0.75" />
      <line x1="26" y1="6" x2="26" y2="10" stroke="#005DFF" strokeOpacity="0.3" strokeWidth="0.75" />

      {/* NC letters */}
      <text
        x="20"
        y="26"
        textAnchor="middle"
        fontFamily="Inter Tight, Inter, sans-serif"
        fontWeight="800"
        fontSize={font + 4}
        fill="url(#nc-brand-grad)"
        filter="url(#nc-glow)"
      >
        NC
      </text>
    </svg>
  );
}
