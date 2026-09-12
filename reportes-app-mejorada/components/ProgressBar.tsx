'use client';

// Barra de progreso delgada, consistente en toda la app.
// Semántica de color: ámbar = en avance, teal = 100% (misma lógica que
// los badges de estado). La transición suave hace visible el "brinco"
// cuando se registra un avance sin recargar.
export default function ProgressBar({ pct, className = '' }: { pct: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div
      className={`h-1.5 rounded-full bg-surface-2 overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${v >= 100 ? 'bg-teal' : 'bg-amber'}`}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
