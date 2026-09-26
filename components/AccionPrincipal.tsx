'use client';

// Acción principal de una pantalla (Agendar, Entrada…), con el mismo estilo
// que «Nuevo cliente»: al lado del buscador, en el mismo renglón. En celular
// solo se ve el ícono para que el buscador conserve el ancho.
export function BotonNuevo({ label, Icono, onClick }: { label: string; Icono: any; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 min-h-[48px] px-4 rounded-xl bg-teal text-inkOnAccent font-display font-semibold text-[13.5px] flex items-center gap-1.5 transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-95 shadow-glow-teal"
    >
      <Icono size={17} strokeWidth={2.6} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
