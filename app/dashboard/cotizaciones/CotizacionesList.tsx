'use client';

import { useAliasClientes } from '@/lib/useAliasClientes';
import { coincideBusqueda } from '@/lib/busqueda';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SupervisorShell from '@/components/SupervisorShell';
import TablaLista, { ColumnaTabla } from '@/components/TablaLista';
import EmptyIllustration from '@/components/EmptyIllustration';
import CotizacionForm from '@/components/CotizacionForm';
import { VistaCondicional } from '@/lib/vistaSupervisor';
import { Cotizacion, LineaCotizacion, obtenerCotizacion, copiaParaOtroCliente } from '@/lib/cotizaciones';
import { hoyLocal } from '@/lib/fechaHoy';
import { descartarBorradorFormulario } from '@/lib/useBorradorFormulario';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import SubTabs from '@/components/SubTabs';
import { Plus, Search, Receipt, Copy, X } from 'lucide-react';
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
  correoUsuario,
  errorCarga,
}: {
  cotizaciones: Cotizacion[];
  userName?: string;
  correoUsuario?: string;
  errorCarga?: string | null;
}) {
  // Mismo patrón que Servicios (Agendar/Agendados): armar y consultar son
  // dos tareas distintas, separarlas en pestañas evita que el formulario y
  // la lista compitan por espacio en la misma pantalla.
  const [seccion, setSeccion] = useState<'nueva' | 'cotizaciones'>('cotizaciones');
  // Copia de otra cotización para un cliente nuevo (mismas partidas y condiciones).
  const [copia, setCopia] = useState<{ origen: Cotizacion; datos: { cotizacion: Cotizacion; lineas: LineaCotizacion[] } } | null>(null);
  const [eligiendoCopia, setEligiendoCopia] = useState(false);
  const [cargandoCopia, setCargandoCopia] = useState(false);

  async function copiarDe(id: string) {
    setCargandoCopia(true);
    try {
      const origen = await obtenerCotizacion(id);
      setCopia({ origen: origen.cotizacion, datos: copiaParaOtroCliente(origen, hoyLocal(), { nombre: userName, correo: correoUsuario }) });
      setSeccion('nueva');
      setEligiendoCopia(false);
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      showToast(e?.message || 'No se pudo copiar la cotización', 'error');
    } finally {
      setCargandoCopia(false);
    }
  }

  // Desde el detalle: /dashboard/cotizaciones?copiar=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('copiar');
    if (id) {
      copiarDe(id);
      window.history.replaceState(null, '', window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [search, setSearch] = useState('');
  const aliasClientes = useAliasClientes();
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
        const hay = `${c.empresa} ${aliasClientes[(c as any).cliente_id] || ''} ${c.folio} ${c.atencion || ''} ${nombreCreador(c.profiles)}`;
        if (!coincideBusqueda(hay, search)) return false;
      }
      return true;
    });
  }, [cotizaciones, search, rango, aliasClientes]);

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

      {/* Mismas pestañas que el resto de las secciones. */}
      <SubTabs
        activa={seccion}
        onCambiar={setSeccion}
        opciones={[
          { k: 'cotizaciones', label: 'Cotizaciones', Icono: Receipt },
          { k: 'nueva', label: 'Nueva cotización', Icono: Plus },
        ]}
      />

      {seccion === 'nueva' && (
        <>
          {copia ? (
            <div className="mb-4 rounded-2xl border border-teal/40 bg-teal/8 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-teal/15 text-teal flex items-center justify-center shrink-0"><Copy size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">Copia de {copia.origen.folio} · {copia.origen.empresa}</p>
                <p className="text-[12.5px] text-muted">Se copiaron las partidas, precios y condiciones. Escribe los datos del nuevo cliente, revisa precios y tipo de cambio, y guarda: se crea con folio nuevo y la original no cambia.</p>
              </div>
              <button type="button" onClick={() => { descartarBorradorFormulario(`cotizacion:copia:${copia.origen.id}`); setCopia(null); }}
                className="shrink-0 h-9 px-3.5 rounded-full border border-line text-[13px] font-semibold flex items-center gap-1.5 hover:bg-surface-2">
                <X size={14} /> Empezar en blanco
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setEligiendoCopia(true)} disabled={cotizaciones.length === 0}
              className="w-full mb-4 min-h-[48px] rounded-2xl border border-dashed border-teal/50 text-teal text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-teal/5 disabled:opacity-50">
              <Copy size={16} /> Copiar de otra cotización
            </button>
          )}
          <CotizacionForm
            key={copia ? `copia-${copia.origen.id}` : 'nueva'}
            modo="crear"
            inicial={copia?.datos}
            claveBorrador={copia ? `cotizacion:copia:${copia.origen.id}` : undefined}
            nombreUsuario={userName}
            correoUsuario={correoUsuario}
          />
        </>
      )}

      {eligiendoCopia && (
        <ElegirCotizacion
          cotizaciones={cotizaciones}
          cargando={cargandoCopia}
          onElegir={copiarDe}
          onClose={() => setEligiendoCopia(false)}
        />
      )}

      {seccion === 'cotizaciones' && (
        <>
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
            <div className="flex flex-col items-center py-14 text-center">
              <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3.5">
                <EmptyIllustration variante="cotizacion" />
              </div>
              <p className="text-[14.5px] font-medium mb-1">
                {cotizaciones.length === 0 ? 'Todavía no hay cotizaciones' : 'Sin resultados'}
              </p>
              <p className="text-[13px] text-muted leading-relaxed max-w-[280px]">
                {cotizaciones.length === 0
                  ? 'Usa «Nueva cotización» para armar la primera.'
                  : search
                  ? 'Sin resultados para esa búsqueda.'
                  : 'No hay cotizaciones en estas fechas. Cambia de semana o toca «Toda la semana».'}
              </p>
            </div>
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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {filtradas.map((c) => (
                    <Link
                      key={c.id}
                      href={`/dashboard/cotizaciones/${c.id}`}
                      className="group block rounded-2xl border-l-4 border-teal bg-surface p-4 sm:p-5 shadow-glow transition-all duration-150 hover:-translate-y-1 hover:shadow-diffuse active:translate-y-0 active:scale-[0.99]"
                    >
                      <div className="flex justify-between items-start gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Cliente / Empresa</div>
                          <strong className="font-display font-bold text-[16px] tracking-wide block truncate transition-colors group-hover:text-teal">{c.empresa}</strong>
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
        </>
      )}
    </SupervisorShell>
  );
}

// Buscador de la cotización a copiar.
function ElegirCotizacion({
  cotizaciones, cargando, onElegir, onClose,
}: {
  cotizaciones: Cotizacion[];
  cargando: boolean;
  onElegir: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const lista = cotizaciones
    .filter((c) => !q.trim() || coincideBusqueda(`${c.folio} ${c.empresa} ${c.atencion || ''} ${c.notas || ''}`, q))
    .slice(0, 40);
  return (
    <ModalOverlay onClose={() => !cargando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-lg p-5 max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display font-bold text-[19px]">Copiar de otra cotización</h2>
            <p className="text-[13px] text-muted">Elige la cotización que quieres usar de base para el nuevo cliente.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 flex items-center justify-center text-muted shrink-0"><X size={18} /></button>
        </div>
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Folio, cliente o nota (ej. paneles)"
            className="w-full h-11 pl-10 pr-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]" />
        </div>
        <div className="overflow-y-auto -mx-1 px-1 flex-1">
          {lista.length === 0 && <p className="text-[13px] text-muted text-center py-6">Nada coincide.</p>}
          <div className="flex flex-col gap-2">
            {lista.map((c) => (
              <button key={c.id} type="button" disabled={cargando} onClick={() => onElegir(c.id)}
                className="w-full text-left rounded-xl bg-surface border border-line px-3.5 py-3 hover:border-teal/50 disabled:opacity-60 flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-mono font-semibold text-teal">{c.folio}</span>
                  <span className="block text-[14px] font-semibold truncate">{c.empresa}</span>
                  <span className="block text-[12px] text-muted">{formatFecha(c.fecha)}{c.atencion ? ` · ${c.atencion}` : ''}</span>
                </span>
                <span className="text-[13.5px] font-semibold tabular-nums shrink-0">{money(c.total)}</span>
              </button>
            ))}
          </div>
        </div>
        {cargando && <p className="text-[12.5px] text-muted text-center mt-2">Copiando…</p>}
      </div>
    </ModalOverlay>
  );
}
