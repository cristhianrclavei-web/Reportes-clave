'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import SupervisorShell from '@/components/SupervisorShell';
import TablaLista, { ColumnaTabla } from '@/components/TablaLista';
import { VistaCondicional } from '@/lib/vistaSupervisor';
import { Cotizacion } from '@/lib/cotizaciones';
import { Plus, Search } from 'lucide-react';
import SelectorSemana, { RangoSeleccionado } from '@/components/SelectorSemana';

function formatFecha(fecha: string): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
}

function money(n: number): string {
  return '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nombreCreador(profiles: Cotizacion['profiles']): string {
  if (!profiles) return '—';
  return Array.isArray(profiles) ? profiles[0]?.full_name || '—' : profiles.full_name || '—';
}

const ESTADO_CLS: Record<Cotizacion['estado'], string> = {
  borrador: 'bg-surface-2 text-muted border-line',
  aprobada: 'bg-teal/15 text-teal border-teal/30',
  enviada: 'bg-amber/15 text-amber border-amber/30',
  rechazada: 'bg-red/15 text-red border-red/30',
};

const ESTADO_LABEL: Record<Cotizacion['estado'], string> = {
  borrador: 'Borrador',
  aprobada: 'Aprobada',
  enviada: 'Enviada',
  rechazada: 'Rechazada',
};

function EstadoChip({ estado }: { estado: Cotizacion['estado'] }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${ESTADO_CLS[estado]}`}>
      {ESTADO_LABEL[estado]}
    </span>
  );
}

export default function CotizacionesList({
  cotizaciones,
  userName,
  errorCarga,
}: {
  cotizaciones: Cotizacion[];
  userName?: string;
  errorCarga?: string | null;
}) {
  const [search, setSearch] = useState('');
  const [rango, setRango] = useState<RangoSeleccionado | null>(null);
  const fechasDeCotizaciones = useMemo(() => cotizaciones.map((c) => c.fecha).filter(Boolean), [cotizaciones]);

  const filtradas = useMemo(() => {
    return cotizaciones.filter((c) => {
      // El rango de fechas no aplica cuando se busca por texto: quien escribe
      // el nombre de un cliente quiere encontrarlo esté en la semana que esté.
      if (!search && rango && c.fecha) {
        if (c.fecha < rango.desde || c.fecha > rango.hasta) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const hay = `${c.empresa} ${c.folio} ${c.atencion || ''} ${nombreCreador(c.profiles)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cotizaciones, search, rango]);

  const columnas: ColumnaTabla<Cotizacion>[] = [
    { header: 'Cliente / Empresa', render: (c) => <span className="font-semibold">{c.empresa}</span> },
    { header: 'Folio', render: (c) => <span className="font-mono text-teal">{c.folio}</span> },
    { header: 'Hecha por', render: (c) => nombreCreador(c.profiles) },
    { header: 'Estado', render: (c) => <EstadoChip estado={c.estado} /> },
    { header: 'Fecha', render: (c) => formatFecha(c.fecha) },
    {
      header: 'Total',
      render: (c) => (
        <span className="font-semibold">
          {c.moneda === 'USD' && <span className="text-muted font-normal">USD </span>}
          {money(c.total)}
        </span>
      ),
      className: 'text-right',
    },
  ];

  return (
    <SupervisorShell active="cotizaciones" title="Cotizaciones" userName={userName}>
      {errorCarga && (
        <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
          <p className="text-[14px] font-semibold text-red mb-1">No se pudieron cargar las cotizaciones</p>
          <p className="text-[13px] text-ink/80 leading-relaxed">{errorCarga}</p>
        </div>
      )}

      <Link
        href="/dashboard/cotizaciones/nueva"
        className="flex items-center justify-center gap-2 mb-4 min-h-[52px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] active:scale-95 transition-transform shadow-glow-teal"
      >
        <Plus size={19} strokeWidth={2.6} />
        Nueva cotización
      </Link>

      <SelectorSemana fechas={fechasDeCotizaciones} onCambio={setRango} etiqueta="cotizaciones" />

      <div className="relative mb-4">
        <Search size={16} strokeWidth={2.4} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, folio o quién la hizo..."
          className="w-full pl-10 pr-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]"
        />
      </div>

      {filtradas.length === 0 && (
        <p className="text-center text-muted py-14 text-[14px] leading-relaxed">
          {cotizaciones.length === 0
            ? 'Todavía no hay cotizaciones.'
            : search
            ? 'Sin resultados para esa búsqueda.'
            : 'No hay cotizaciones en estas fechas. Cambia de semana o toca «Toda la semana».'}
        </p>
      )}

      {filtradas.length > 0 && (
        <VistaCondicional
          tabla={
            <TablaLista
              columnas={columnas}
              filas={filtradas}
              keyFn={(c) => c.id}
              hrefFn={(c) => `/dashboard/cotizaciones/${c.id}`}
            />
          }
          tarjetas={
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtradas.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard/cotizaciones/${c.id}`}
                  className="block rounded-2xl border-l-4 border-teal bg-surface p-4 sm:p-5 active:scale-[0.99] hover:shadow-glow transition-all shadow-glow"
                >
                  <div className="flex justify-between items-start gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Cliente / Empresa</div>
                      <strong className="font-display font-bold text-[16px] tracking-wide block truncate">{c.empresa}</strong>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Folio</div>
                      <span className="text-[12px] font-mono font-semibold text-teal">{c.folio}</span>
                    </div>
                  </div>

                  <div className="text-[12px] text-muted mb-3 flex items-center gap-1.5 flex-wrap">
                    <span className="truncate">{nombreCreador(c.profiles)}</span>
                    <span className="text-faint">·</span>
                    <EstadoChip estado={c.estado} />
                  </div>

                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Fecha</div>
                      <span className="text-[13px] font-medium">{formatFecha(c.fecha)}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Total</div>
                      <span className="text-[15px] font-display font-bold text-teal">
                        {c.moneda === 'USD' && <span className="text-muted font-normal text-[11px]">USD </span>}
                        {money(c.total)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          }
        />
      )}
    </SupervisorShell>
  );
}
