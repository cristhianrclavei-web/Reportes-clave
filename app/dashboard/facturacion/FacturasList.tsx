'use client';

import { useAliasClientes } from '@/lib/useAliasClientes';
import { coincideBusqueda } from '@/lib/busqueda';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SupervisorShell from '@/components/SupervisorShell';
import TablaLista, { ColumnaTabla } from '@/components/TablaLista';
import EmptyIllustration from '@/components/EmptyIllustration';
import FacturaForm from '@/components/FacturaForm';
import { VistaCondicional } from '@/lib/vistaSupervisor';
import { EstadoFactura, ESTADO_FACTURA_CLS, ESTADO_FACTURA_LABEL, MonedaFactura, PorFacturarCliente, reportesPorFacturar } from '@/lib/facturas';
import SubTabs from '@/components/SubTabs';
import { Plus, Search, ReceiptText, FileClock } from 'lucide-react';

type FilaFactura = {
  id: string;
  folio: string;
  cliente_id: string | null;
  estado: EstadoFactura;
  fecha: string;
  receptor_nombre: string;
  moneda: MonedaFactura;
  total: number;
  folio_fiscal: string | null;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

function formatFecha(fecha: string): string {
  const [y, m, d] = (fecha || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : fecha || '—';
}

function money(n: number, moneda: MonedaFactura): string {
  return (moneda === 'USD' ? 'USD ' : '') + '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function EstadoFacturaChip({ estado }: { estado: EstadoFactura }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${ESTADO_FACTURA_CLS[estado]}`}>
      {ESTADO_FACTURA_LABEL[estado]}
    </span>
  );
}

const FILTROS: { key: 'todas' | EstadoFactura; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'borrador', label: 'Prefacturas' },
  { key: 'timbrada', label: 'Timbradas' },
  { key: 'pagada', label: 'Pagadas' },
  { key: 'cancelada', label: 'Canceladas' },
];

export default function FacturasList({
  facturas,
  userName,
  errorCarga,
  clienteInicial,
  reportesIniciales = [],
}: {
  facturas: FilaFactura[];
  userName?: string;
  errorCarga?: string | null;
  clienteInicial?: { id: string; nombre: string } | null;
  // Reportes ya elegidos al llegar desde «Armar factura».
  reportesIniciales?: string[];
}) {
  const [seccion, setSeccion] = useState<'nueva' | 'facturas' | 'pendientes'>(clienteInicial ? 'nueva' : 'facturas');
  // Reportes concluidos que nadie ha facturado ni descartado, por cliente.
  const [porFacturar, setPorFacturar] = useState<PorFacturarCliente[] | null>(null);
  useEffect(() => { reportesPorFacturar().then(setPorFacturar).catch(() => setPorFacturar([])); }, []);
  const totalPorFacturar = (porFacturar || []).reduce((n, g) => n + g.reportes.length, 0);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<'todas' | EstadoFactura>('todas');
  const aliasClientes = useAliasClientes();

  const conteo = useMemo(() => {
    const c: Record<string, number> = { todas: facturas.length };
    facturas.forEach((f) => (c[f.estado] = (c[f.estado] || 0) + 1));
    return c;
  }, [facturas]);

  const porCobrar = useMemo(
    () => facturas.filter((f) => f.estado === 'timbrada').reduce((s, f) => s + (f.moneda === 'MXN' ? f.total : 0), 0),
    [facturas]
  );

  const filtradas = useMemo(
    () =>
      facturas.filter((f) => {
        if (filtro !== 'todas' && f.estado !== filtro) return false;
        if (search) {
          const hay = `${f.receptor_nombre} ${aliasClientes[f.cliente_id || ''] || ''} ${f.folio} ${f.folio_fiscal || ''}`;
          if (!coincideBusqueda(hay, search)) return false;
        }
        return true;
      }),
    [facturas, filtro, search, aliasClientes]
  );

  const columnas: ColumnaTabla<FilaFactura>[] = [
    { header: 'Cliente', render: (f) => <span className="font-semibold">{f.receptor_nombre}</span> },
    { header: 'Folio', render: (f) => <span className="font-mono text-teal">{f.folio}</span> },
    { header: 'Folio CFDI', render: (f) => f.folio_fiscal || '—' },
    { header: 'Estado', render: (f) => <EstadoFacturaChip estado={f.estado} /> },
    { header: 'Fecha', render: (f) => formatFecha(f.fecha) },
    { header: 'Total', render: (f) => <span className="font-semibold">{money(f.total, f.moneda)}</span>, className: 'text-right' },
  ];


  return (
    <SupervisorShell active="facturacion" title="Facturación" userName={userName}>
      {errorCarga && (
        <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
          <p className="text-[14px] font-semibold text-red mb-1">No se pudieron cargar las facturas</p>
          <p className="text-[13px] text-ink/80 leading-relaxed">{errorCarga}</p>
        </div>
      )}

      {/* Mismas pestañas que el resto de las secciones. */}
      <SubTabs
        activa={seccion}
        onCambiar={setSeccion}
        opciones={[
          { k: 'facturas', label: 'Facturas', Icono: ReceiptText },
          { k: 'pendientes', label: totalPorFacturar > 0 ? `Por facturar · ${totalPorFacturar}` : 'Por facturar', Icono: FileClock },
          { k: 'nueva', label: 'Nueva factura', Icono: Plus },
        ]}
      />

      {seccion === 'nueva' && <FacturaForm modo="crear" clienteInicial={clienteInicial} reportesIniciales={reportesIniciales} />}

      {seccion === 'pendientes' && (
        <>
          <p className="text-[13px] text-muted mb-4 leading-relaxed max-w-2xl">
            Reportes de servicios ya concluidos que no están en ninguna factura. Arma la factura del cliente con todos sus reportes; si alguno no se va a facturar, márcalo desde el propio reporte.
          </p>
          {porFacturar === null && <p className="text-[13px] text-muted py-6 text-center">Cargando…</p>}
          {porFacturar && porFacturar.length === 0 && (
            <div className="rounded-2xl bg-teal/10 border border-teal/25 px-4 py-4 text-center text-[14px] text-teal font-semibold">
              No hay reportes pendientes de facturar
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
            {(porFacturar || []).map((g) => (
              <div key={g.clienteId || g.cliente} className="rounded-2xl bg-surface border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-[16px] tracking-wide truncate">{g.cliente}</p>
                    <p className="text-[12.5px] text-muted mt-0.5">
                      {g.reportes.length} {g.reportes.length === 1 ? 'reporte' : 'reportes'} · el más antiguo del {formatFecha(g.reportes[0].desde)}
                    </p>
                  </div>
                  {g.clienteId ? (
                    <a
                      href={`/dashboard/facturacion?cliente=${g.clienteId}&reporte=${g.reportes.map((r) => r.id).join(',')}`}
                      className="shrink-0 min-h-[40px] px-3.5 rounded-full bg-teal text-inkOnAccent text-[13px] font-semibold inline-flex items-center gap-1.5 active:scale-95 transition-transform"
                    >
                      <Plus size={15} strokeWidth={2.6} />
                      Armar factura
                    </a>
                  ) : (
                    <span className="shrink-0 text-[11.5px] font-semibold text-amber text-right max-w-[130px] leading-snug">Sin cliente ligado: lígalo en Clientes</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {g.reportes.slice(0, 12).map((r) => (
                    <Link key={r.id} href={`/dashboard/reportes?reporte=${r.id}`} className="text-[12px] px-2.5 py-1 rounded-full bg-surface-2 border border-line hover:border-teal/45 transition-colors">
                      <span className="font-mono text-teal">{r.folio || r.id.slice(0, 8).toUpperCase()}</span>
                      <span className="text-muted"> · {formatFecha(r.fecha).slice(0, 5)}</span>
                    </Link>
                  ))}
                  {g.reportes.length > 12 && <span className="text-[12px] text-muted px-1 py-1">+{g.reportes.length - 12} más</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {seccion === 'facturas' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            <div className="rounded-2xl bg-surface border border-line p-3.5">
              <p className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">Prefacturas por timbrar</p>
              <p className="font-display font-bold text-[22px]">{conteo.borrador || 0}</p>
            </div>
            <div className="rounded-2xl bg-surface border border-line p-3.5">
              <p className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">Por cobrar (MXN)</p>
              <p className="font-display font-bold text-[22px] text-teal">{money(porCobrar, 'MXN')}</p>
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">
            {FILTROS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`shrink-0 px-3.5 py-2 rounded-full text-[13px] font-medium border transition-colors ${
                  filtro === f.key ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 text-ink/80 border-line'
                }`}
              >
                {f.label}
                <span className="ml-1 opacity-70">{conteo[f.key] || 0}</span>
              </button>
            ))}
          </div>

          <div className="relative mb-4">
            <Search size={16} strokeWidth={2.4} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente o folio…"
              className="w-full pl-10 pr-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]"
            />
          </div>

          {filtradas.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center">
              <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3.5">
                <EmptyIllustration variante="cotizacion" />
              </div>
              <p className="text-[14.5px] font-medium mb-1">{facturas.length === 0 ? 'Todavía no hay facturas' : 'Sin resultados'}</p>
              <p className="text-[13px] text-muted leading-relaxed max-w-[280px]">
                {facturas.length === 0 ? 'Usa «Nueva factura» para armar la primera.' : 'Prueba con otro filtro o búsqueda.'}
              </p>
            </div>
          ) : (
            <VistaCondicional
              tabla={<TablaLista columnas={columnas} filas={filtradas} keyFn={(f) => f.id} hrefFn={(f) => `/dashboard/facturacion/${f.id}`} />}
              tarjetas={
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {filtradas.map((f) => (
                    <Link
                      key={f.id}
                      href={`/dashboard/facturacion/${f.id}`}
                      className="group block rounded-2xl border-l-4 border-teal bg-surface p-4 sm:p-5 shadow-glow transition-all duration-150 hover:-translate-y-1 hover:shadow-diffuse active:scale-[0.99]"
                    >
                      <div className="flex justify-between items-start gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Cliente</div>
                          <strong className="font-display font-bold text-[16px] tracking-wide block truncate group-hover:text-teal">{f.receptor_nombre}</strong>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Folio</div>
                          <span className="text-[12px] font-mono font-semibold text-teal">{f.folio}</span>
                        </div>
                      </div>
                      <div className="text-[12px] text-muted mb-3 flex items-center gap-1.5 flex-wrap">
                        <EstadoFacturaChip estado={f.estado} />
                        {f.folio_fiscal && <span>· CFDI {f.folio_fiscal}</span>}
                      </div>
                      <div className="flex justify-between items-end">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Fecha</div>
                          <span className="text-[13px] font-medium">{formatFecha(f.fecha)}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Total</div>
                          <span className="text-[15px] font-display font-bold text-teal">{money(f.total, f.moneda)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              }
            />
          )}
        </>
      )}
    </SupervisorShell>
  );
}
