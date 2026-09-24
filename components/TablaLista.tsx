'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export type ColumnaTabla<T> = {
  header: string;
  render: (fila: T) => ReactNode;
  className?: string;
};

// Vista en filas/columnas para listas de registros — la alternativa a las
// tarjetas en bloque, para la vista nueva del panel del supervisor. Genérica
// a propósito: cada pantalla (cotizaciones, reportes, servicios, agenda...)
// define sus propias columnas y pasa sus propias filas, en vez de que cada
// una arme su tabla desde cero.
export default function TablaLista<T>({
  columnas,
  filas,
  keyFn,
  hrefFn,
  onDetalle,
}: {
  columnas: ColumnaTabla<T>[];
  filas: T[];
  keyFn: (fila: T) => string;
  // Una lista navega a otra página (Link); otra abre un modal (onDetalle).
  // Se pasa exactamente uno de los dos.
  hrefFn?: (fila: T) => string;
  onDetalle?: (fila: T) => void;
}) {
  return (
    <div className="rounded-2xl border border-line overflow-hidden overflow-x-auto">
      <table className="w-full text-[13.5px] border-collapse min-w-[720px]">
        <thead>
          <tr className="bg-surface-2 text-muted text-[11px] uppercase tracking-wider">
            {columnas.map((c, i) => (
              <th key={i} className={`text-left px-4 py-3 font-semibold whitespace-nowrap ${c.className || ''}`}>
                {c.header}
              </th>
            ))}
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={keyFn(f)} className="border-t border-line hover:bg-surface-2/60 transition-colors">
              {columnas.map((c, i) => (
                <td key={i} className={`px-4 py-3 align-top ${c.className || ''}`}>
                  {c.render(f)}
                </td>
              ))}
              <td className="px-4 py-3 text-right">
                {hrefFn ? (
                  <Link
                    href={hrefFn(f)}
                    className="group/link inline-flex items-center gap-1 text-teal text-[13px] font-semibold whitespace-nowrap transition-transform active:scale-95"
                  >
                    Ver detalles
                    <ChevronRight size={14} strokeWidth={2.6} className="transition-transform group-hover/link:translate-x-0.5" />
                  </Link>
                ) : (
                  <button
                    onClick={() => onDetalle?.(f)}
                    className="group/link inline-flex items-center gap-1 text-teal text-[13px] font-semibold whitespace-nowrap transition-transform active:scale-95"
                  >
                    Ver detalles
                    <ChevronRight size={14} strokeWidth={2.6} className="transition-transform group-hover/link:translate-x-0.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
