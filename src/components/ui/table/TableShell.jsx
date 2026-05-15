export default function TableShell({ children, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/60 shadow-card ${className}`}>
      {children}
    </div>
  );
}
