'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseClient';
import { usePuedeFacturar } from '@/lib/usePuedeFacturar';
import { EstadoFactura, ESTADO_FACTURA_CLS, ESTADO_FACTURA_LABEL, MonedaFactura } from '@/lib/facturas';
import { ChevronDown, ChevronRight, Plus, ReceiptText } from 'lucide-react';

type Fila = { id: string; folio: string; fecha: string; estado: EstadoFactura; total: number; moneda: MonedaFactura; folio_fiscal: string | null };

function fechaCorta(f: string): string {
  const [y, m, d] = (f || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : f || '—';
}
function money(n: number, moneda: MonedaFactura): string {
  return (moneda === 'USD' ? 'USD ' : '') + '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Facturas de un cliente, en su detalle (solo para quien factura). Cerrado
// muestra el resumen; abierto, la lista y el botón de nueva factura, que
// abre el formulario de Facturación con el cliente ya elegido.
export default function FacturasDelCliente({ clienteId }: { clienteId: string }) {
  const puede = usePuedeFacturar();
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!puede) return;
    createClient()
      .from('facturas')
      .select('id, folio, fecha, estado, total, moneda, folio_fiscal')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })
      .then(({ data }) => setFilas((data as Fila[]) || []));
  }, [clienteId, puede]);

  if (!puede) return null;

  const total = filas?.length ?? 0;
  const porCobrar = (filas || []).filter((f) => f.estado === 'timbrada').length;
  const prefacturas = (filas || []).filter((f) => f.estado === 'borrador').length;

  return (
    <div className="rounded-2xl bg-surface border border-line mb-6 overflow-hidden">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="w-full p-4 flex items-center gap-3 text-left">
        <span className="w-11 h-11 rounded-xl bg-teal/12 text-teal flex items-center justify-center shrink-0">
          <ReceiptText size={20} strokeWidth={2.2} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-display font-semibold text-[15px]">Facturas</span>
          <span className="block text-[12.5px] text-muted truncate">
            {filas === null
              ? 'Cargando…'
              : total === 0
              ? 'Todavía no hay facturas de este cliente'
              : [`${total} ${total === 1 ? 'factura' : 'facturas'}`, prefacturas ? `${prefacturas} por timbrar` : '', porCobrar ? `${porCobrar} por cobrar` : '']
                  .filter(Boolean)
                  .join(' · ')}
          </span>
        </span>
        <ChevronDown size={18} className={`text-muted shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="border-t border-line">
          {total > 0 && (
            <ul className="max-h-[360px] overflow-y-auto">
              {filas!.map((f) => (
                <li key={f.id} className="border-t border-line first:border-t-0">
                  <Link href={`/dashboard/facturacion/${f.id}`} className="flex items-center gap-3 px-4 py-3 text-[13.5px] hover:bg-surface-2">
                    <span className="font-mono text-[12px] text-teal w-[70px] shrink-0">{f.folio}</span>
                    <span className="tabular-nums text-muted w-[84px] shrink-0">{fechaCorta(f.fecha)}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${ESTADO_FACTURA_CLS[f.estado]}`}>{ESTADO_FACTURA_LABEL[f.estado]}</span>
                    <span className="flex-1 text-right font-semibold tabular-nums">{money(f.total, f.moneda)}</span>
                    <ChevronRight size={16} className="text-muted shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="p-3 border-t border-line bg-surface-2/50">
            <Link
              href={`/dashboard/facturacion?cliente=${clienteId}`}
              className="w-full min-h-[46px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
            >
              <Plus size={17} strokeWidth={2.4} /> Nueva factura
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
