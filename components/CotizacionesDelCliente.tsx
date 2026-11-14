'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, FileSpreadsheet, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import type { EstadoCotizacion, MonedaCotizacion } from '@/lib/cotizaciones';

type Fila = { id: string; folio: string; fecha: string; estado: EstadoCotizacion; total: number; moneda: MonedaCotizacion; titulo_proyecto: string | null };

// Mismos colores y nombres que la lista de Cotizaciones.
const ESTADO_CLS: Record<EstadoCotizacion, string> = {
  borrador: 'bg-surface-2 text-muted border-line',
  aprobada: 'bg-teal/15 text-teal border-teal/30',
  enviada: 'bg-amber/15 text-amber border-amber/30',
  rechazada: 'bg-red/15 text-red border-red/30',
};
const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  borrador: 'Borrador',
  aprobada: 'Aprobada',
  enviada: 'Enviada',
  rechazada: 'Rechazada',
};

function fechaCorta(f: string): string {
  const [y, m, d] = (f || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : f || '—';
}
function money(n: number, moneda: MonedaCotizacion): string {
  return (moneda === 'USD' ? 'USD ' : '') + '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const COLUMNAS = 'id, folio, fecha, estado, total, moneda, titulo_proyecto';

// Cotizaciones de un cliente, en su detalle. Cerrado muestra el resumen;
// abierto, la lista (cada una abre su detalle) y el botón de nueva
// cotización. Si el plan de la empresa no incluye cotizaciones, no aparece.
export default function CotizacionesDelCliente({ clienteId, clienteNombre }: { clienteId: string; clienteNombre: string }) {
  const [activo, setActivo] = useState(false);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const supabase = createClient();
      const { data: moduloActivo } = await supabase.rpc('modulo_activo', { p_modulo: 'cotizaciones' });
      if (moduloActivo === false || cancelado) return;
      setActivo(true);
      // Las ligadas al cliente, más las viejas sin ligar que tienen su mismo nombre.
      const [ligadas, porNombre] = await Promise.all([
        supabase.from('cotizaciones').select(COLUMNAS).eq('cliente_id', clienteId),
        supabase.from('cotizaciones').select(COLUMNAS).is('cliente_id', null).ilike('empresa', clienteNombre.replace(/[\\%_]/g, '\\$&')),
      ]);
      if (cancelado) return;
      const falla = ligadas.error || porNombre.error;
      if (falla) {
        setError(`No se pudieron cargar las cotizaciones: ${falla.message}. Revisa tu conexión y recarga.`);
        setFilas([]);
        return;
      }
      const todas = [...((ligadas.data as Fila[]) || []), ...((porNombre.data as Fila[]) || [])];
      todas.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.folio.localeCompare(a.folio));
      setFilas(todas);
    })();
    return () => { cancelado = true; };
  }, [clienteId, clienteNombre]);

  if (!activo) return null;

  const total = filas?.length ?? 0;
  const contar = (estado: EstadoCotizacion) => (filas || []).filter((f) => f.estado === estado).length;
  const resumen = [
    `${total} ${total === 1 ? 'cotización' : 'cotizaciones'}`,
    contar('borrador') ? `${contar('borrador')} en borrador` : '',
    contar('enviada') ? `${contar('enviada')} ${contar('enviada') === 1 ? 'enviada' : 'enviadas'}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="rounded-2xl bg-surface border border-line mb-6 overflow-hidden">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="w-full p-4 flex items-center gap-3 text-left">
        <span className="w-11 h-11 rounded-xl bg-teal/12 text-teal flex items-center justify-center shrink-0">
          <FileSpreadsheet size={20} strokeWidth={2.2} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-display font-semibold text-[15px]">Cotizaciones</span>
          <span className={`block text-[12.5px] truncate ${error ? 'text-red' : 'text-muted'}`}>
            {error ? 'No se pudieron cargar' : filas === null ? 'Cargando…' : total === 0 ? 'Todavía no hay cotizaciones de este cliente' : resumen}
          </span>
        </span>
        <ChevronDown size={18} className={`text-muted shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="border-t border-line">
          {error && <p className="px-4 py-3 text-[13px] text-red">{error}</p>}
          {total > 0 && (
            <ul className="max-h-[360px] overflow-y-auto">
              {filas!.map((f) => (
                <li key={f.id} className="border-t border-line first:border-t-0">
                  <Link href={`/dashboard/cotizaciones/${f.id}`} className="flex items-center gap-3 px-4 py-3 text-[13.5px] hover:bg-surface-2">
                    <span className="font-mono text-[12px] text-teal w-[70px] shrink-0">{f.folio}</span>
                    <span className="tabular-nums text-muted w-[84px] shrink-0">{fechaCorta(f.fecha)}</span>
                    <span className="flex-1 min-w-0 truncate text-ink/80 hidden sm:block">{f.titulo_proyecto || ''}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${ESTADO_CLS[f.estado]}`}>{ESTADO_LABEL[f.estado]}</span>
                    <span className="ml-auto sm:ml-0 text-right font-semibold tabular-nums shrink-0">{money(f.total, f.moneda)}</span>
                    <ChevronRight size={16} className="text-muted shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="p-3 border-t border-line bg-surface-2/50">
            <Link
              href="/dashboard/cotizaciones?sub=nueva"
              className="w-full min-h-[46px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
            >
              <Plus size={17} strokeWidth={2.4} /> Nueva cotización
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
