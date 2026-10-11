import type { ComponentType } from 'react';

// Renglón de cifras bajo el título de una sección del técnico («24 reportes»,
// «3 sin firma»…): ícono y número juntos a la izquierda, y abajo el rótulo.
// Con `onElegir` cada tarjeta es un botón (sirve de filtro); sin él, solo
// informa.

export type Cifra<K extends string> = {
  clave: K;
  rotulo: string;
  n: number;
  Icono: ComponentType<{ size?: number; strokeWidth?: number }>;
  // Clases de color del ícono cuando la cifra no es cero.
  color: string;
  fondo: string;
};

export default function TarjetasCifra<K extends string>({
  cifras, elegida, onElegir,
}: {
  cifras: Cifra<K>[];
  elegida?: K | null;
  onElegir?: (clave: K) => void;
}) {
  const columnas = cifras.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <span className={`grid ${columnas} gap-2 mt-2.5 lg:w-[460px]`}>
      {cifras.map(({ clave, rotulo, n, Icono, color, fondo }) => {
        const contenido = (
          <>
            <span className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${n > 0 ? `${fondo} ${color}` : 'bg-surface-2 text-faint'}`}>
                <Icono size={14} strokeWidth={2.5} />
              </span>
              <span className={`font-display font-bold text-[24px] leading-none tabular-nums ${n > 0 ? 'text-ink' : 'text-faint'}`}>{n}</span>
            </span>
            <span className="block text-[11.5px] font-semibold uppercase tracking-wider text-muted mt-1.5 truncate">{rotulo}</span>
          </>
        );
        const base = 'text-left rounded-2xl border bg-surface px-3 py-2.5';
        if (!onElegir) return <span key={clave} className={`${base} border-line`}>{contenido}</span>;
        return (
          <button
            key={clave}
            type="button"
            onClick={() => onElegir(clave)}
            aria-pressed={elegida === clave}
            className={`${base} transition-all active:scale-[0.97] ${elegida === clave ? 'border-teal/55 shadow-diffuse' : 'border-line hover:border-line-strong'}`}
          >
            {contenido}
          </button>
        );
      })}
    </span>
  );
}
