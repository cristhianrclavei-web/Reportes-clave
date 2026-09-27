'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseClient';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';

type Fila = { id: string; fecha: string; ing: string | null; folio: string | null; revisado: string | null };

function fechaCorta(fecha: string): string {
  const [y, m, d] = (fecha || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : fecha || '—';
}

// Reportes de servicio de un cliente, en su detalle. Cerrado muestra el
// resumen (total, último, pendientes de revisión); abierto, la lista con
// Fecha · Ing. a cargo · Folio · Ver, que lleva al reporte en Reportes.
// Solo se piden las columnas de la tabla: el JSON completo del reporte trae
// firmas y fotos y pesaría de más para una lista.
export default function ReportesDelCliente({ clienteId, clienteNombre }: { clienteId: string; clienteNombre: string }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    createClient()
      .from('reports')
      .select('id, fecha, ing:data->>ingACargo, folio:data->>claveFormato, revisado:data->>firmaRevisionFecha')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => setFilas((data as Fila[]) || []));
  }, [clienteId]);

  const total = filas?.length ?? 0;
  const pendientes = filas?.filter((f) => !f.revisado).length ?? 0;
  const ultimo = filas?.[0]?.fecha;

  return (
    <div className="rounded-2xl bg-surface border border-line mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={!filas || total === 0}
        aria-expanded={abierto}
        className="w-full p-4 flex items-center gap-3 text-left disabled:cursor-default"
      >
        <span className="w-11 h-11 rounded-xl bg-teal/12 text-teal flex items-center justify-center shrink-0">
          <FileText size={20} strokeWidth={2.2} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-display font-semibold text-[15px]">Reportes de servicio</span>
          <span className="block text-[12.5px] text-muted truncate">
            {filas === null
              ? 'Cargando…'
              : total === 0
              ? 'Todavía no hay reportes de este cliente'
              : `${total} ${total === 1 ? 'reporte' : 'reportes'} · último ${fechaCorta(ultimo!)}`}
          </span>
        </span>
        {pendientes > 0 && (
          <span className="hidden sm:inline text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-amber/15 text-amber whitespace-nowrap">
            {pendientes} pend. revisión
          </span>
        )}
        {total > 0 && (
          <>
            <span className="font-display font-bold text-[22px] leading-none tabular-nums">{total}</span>
            <ChevronDown size={18} className={`text-muted shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {abierto && filas && total > 0 && (
        <div className="border-t border-line">
          {pendientes > 0 && (
            <p className="sm:hidden px-4 pt-3 text-[12px] font-semibold text-amber">{pendientes} pendiente(s) de revisión</p>
          )}
          {/* Encabezado de columnas */}
          <div className="hidden sm:grid grid-cols-[110px_1fr_130px_60px] gap-3 px-4 pt-3 pb-2 text-[10.5px] uppercase tracking-wider text-muted font-semibold">
            <span>Fecha</span>
            <span>Ing. a cargo</span>
            <span>Folio</span>
            <span />
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {filas.map((f) => (
              <li key={f.id} className="border-t border-line first:border-t-0">
                <Link
                  href={`/dashboard/reportes?reporte=${f.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 sm:py-3 text-[13.5px] transition-colors hover:bg-surface-2 active:bg-surface-2 sm:grid sm:grid-cols-[110px_1fr_130px_60px]"
                >
                  {/* Celular: dos renglones (fecha y folio arriba, ingeniero
                      abajo). Computadora: columnas. */}
                  <span className="flex-1 min-w-0 sm:contents">
                    <span className="flex items-center gap-2 tabular-nums font-semibold sm:font-normal">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${f.revisado ? 'bg-teal' : 'bg-amber'}`}
                        title={f.revisado ? 'Revisado' : 'Pendiente de revisión'}
                      />
                      {fechaCorta(f.fecha)}
                      <span className="sm:hidden font-mono font-normal text-[11.5px] text-teal bg-teal/10 px-2 py-0.5 rounded-md">{f.folio || '—'}</span>
                    </span>
                    <span className="block truncate text-[12.5px] text-muted mt-1 pl-4 sm:pl-0 sm:mt-0 sm:text-[13.5px] sm:text-ink sm:font-medium">{f.ing || '—'}</span>
                    <span className="hidden sm:block font-mono text-[12px] text-teal truncate">{f.folio || '—'}</span>
                  </span>
                  <span className="shrink-0 text-teal font-semibold text-[13px] flex items-center justify-end gap-0.5">
                    Ver
                    <ChevronRight size={16} strokeWidth={2.4} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line bg-surface-2/50">
            <span className="flex items-center gap-3 text-[11.5px] text-muted">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal" /> Revisado</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber" /> Pendiente</span>
            </span>
            <Link href={`/dashboard/reportes?q=${encodeURIComponent(clienteNombre)}`} className="text-[12.5px] font-semibold text-teal">
              Ver todos en Reportes
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
