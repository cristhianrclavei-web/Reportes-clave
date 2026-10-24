'use client';

// Qué tan lejos del punto del mapa se considera que el técnico sigue en el
// sitio. En una planta grande el punto suele quedar en la entrada y se
// trabaja en bodegas a cientos de metros: ahí hace falta un radio mayor.
// A cada radio la app le suma 80 m de margen y la imprecisión del GPS.
export const TAMANOS_SITIO = [
  { metros: 120, titulo: 'Normal', detalle: 'Casa, local u oficina' },
  { metros: 300, titulo: 'Grande', detalle: 'Edificio o plaza' },
  { metros: 500, titulo: 'Planta o complejo', detalle: 'Varias naves o bodegas' },
];

export const RADIO_SITIO_POR_DEFECTO = 120;

export function textoTamanoSitio(metros: number): string {
  const tamano = TAMANOS_SITIO.find((t) => t.metros === metros);
  if (!tamano) return `${metros} m`;
  return `${tamano.titulo} (${metros} m)`;
}

export default function SelectorTamanoSitio({ valor, onCambio }: { valor: number; onCambio: (metros: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Tamaño del sitio">
      <p className="text-[13px] text-ink/75 mb-1.5">Tamaño del sitio</p>
      <div className="grid grid-cols-3 gap-1.5">
        {TAMANOS_SITIO.map((t) => {
          const elegido = valor === t.metros;
          return (
            <button
              key={t.metros}
              type="button"
              role="radio"
              aria-checked={elegido}
              onClick={() => onCambio(t.metros)}
              className={`text-left rounded-xl border px-2.5 py-2 transition-colors ${elegido ? 'border-teal bg-teal/10' : 'border-line bg-surface-2'}`}
            >
              <span className="block text-[13px] font-semibold leading-tight">{t.titulo}</span>
              <span className="block text-[11.5px] text-muted leading-tight mt-0.5">{t.detalle}</span>
              <span className={`block text-[12px] font-semibold mt-1 ${elegido ? 'text-teal' : 'text-faint'}`}>{t.metros} m</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11.5px] text-muted mt-1.5">
        Hasta qué distancia del punto se considera que siguen en el sitio. Usa «Planta o complejo» si el punto está en la entrada y se trabaja en naves o bodegas lejanas.
      </p>
    </div>
  );
}
