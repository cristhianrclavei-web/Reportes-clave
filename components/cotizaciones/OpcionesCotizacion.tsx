import { modoIvaDe, opcionesDeCotizacion, type Cotizacion, type LineaCotizacion } from '@/lib/cotizaciones';

// Sistemas opcionales abajo del total: cuánto cuesta cada uno y cómo quedaría
// el total si el cliente lo elige. Mismo cálculo que el PDF.

function dinero(n: number, moneda: string): string {
  const cifra = (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${cifra}${moneda === 'USD' ? ' USD' : ''}`;
}

export default function OpcionesCotizacion({ cotizacion, lineas }: { cotizacion: Cotizacion; lineas: LineaCotizacion[] }) {
  const opciones = opcionesDeCotizacion(lineas, cotizacion);
  if (opciones.length === 0) return null;

  const modo = modoIvaDe(cotizacion);
  let sufijoIva = '';
  if (modo === 'sumar') sufijoIva = ' + IVA';
  if (modo === 'incluido') sufijoIva = ' (IVA incluido)';

  return (
    <div className="mt-3 pt-3 border-t border-dashed border-line-strong">
      <p className="text-[12px] uppercase tracking-wider text-muted font-semibold mb-2">Opciones (no incluidas en el total)</p>
      <ul className="space-y-2">
        {opciones.map((op) => (
          <li key={op.nombre} className="text-[13px]">
            <p className="font-semibold break-words">{op.nombre}</p>
            <p className="text-muted">
              + {dinero(op.importe, cotizacion.moneda)}{sufijoIva} · Total con esta opción:{' '}
              <b className="text-ink tabular-nums">{dinero(op.totalConOpcion, cotizacion.moneda)}</b>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
