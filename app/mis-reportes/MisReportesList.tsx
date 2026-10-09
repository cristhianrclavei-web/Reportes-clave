'use client';

import BotonAyuda from '@/components/BotonAyuda';
import { useAliasClientes } from '@/lib/useAliasClientes';
import { coincideBusqueda } from '@/lib/busqueda';
import SubTabs from '@/components/SubTabs';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseClient';
import ThemeToggle from '@/components/ThemeToggle';
import MenuCuenta from '@/components/MenuCuenta';
import NotificacionesToggle from '@/components/NotificacionesToggle';
import AvisoCuentaPrueba from '@/components/AvisoCuentaPrueba';
import AvisoDiasSinReporte from '@/components/AvisoDiasSinReporte';
import AvisoActualizarCredenciales from '@/components/AvisoActualizarCredenciales';
import LogoutButton from '@/components/LogoutButton';
import ReportDetailModal, { ReportDetail } from '@/components/ReportDetailModal';
import LevantamientosSeccion from '@/components/LevantamientosSeccion';
import { Check, Plus, FileText, ClipboardList, ChevronRight, Search, PenLine, Clock3 } from 'lucide-react';
import EncabezadoSeccion, { BOTON_PRINCIPAL, RotuloGrupo } from '@/components/tecnico/EncabezadoSeccion';
import EstadoVacio from '@/components/EstadoVacio';
import TecnicoTabs from '@/components/TecnicoTabs';
import Logo from '@/components/Logo';

type Report = ReportDetail;

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function tituloMes(clave: string): string {
  const [y, m] = clave.split('-').map(Number);
  return y && m ? `${MESES[m - 1]} ${y}` : 'Sin fecha';
}

function estadoDe(r: Report): 'completo' | 'revision' {
  return r.data?.firmaRevisionData ? 'completo' : 'revision';
}
function faltaFirma(r: Report): boolean {
  return !!r.data?.firmaPendiente && !r.data?.firmaClienteData;
}

export default function MisReportesList({ reports: reportsIniciales, userName, errorCarga }: { reports: Report[]; userName?: string; errorCarga?: string | null }) {
  // Copia local: si algo del reporte cambia dentro del modal (firma de
  // revisión, facturación, corrección), se refleja aquí al instante sin
  // esperar a recargar la página. Mismo patrón que ReportesList.
  const [reports, setReports] = useState<Report[]>(reportsIniciales);
  const [search, setSearch] = useState('');
  const aliasClientes = useAliasClientes();
  const [filterType, setFilterType] = useState('');
  const [open, setOpen] = useState<Report | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'revision' | 'firma' | 'completo'>('todos');
  const [subseccion, setSubseccion] = useState<'reportes' | 'levantamientos'>('reportes');

  // Enlace directo (p. ej. desde el asistente): ?reporte=<id> abre ese reporte.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('reporte');
    if (!id) return;
    const r = reportsIniciales.find((x) => x.id === id);
    if (r) setOpen(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleReporteActualizado(reportId: string, patch: Partial<Report>) {
    setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, ...patch } : r)));
  }


  const cuentas = useMemo(() => ({
    todos: reports.length,
    revision: reports.filter((r) => estadoDe(r) === 'revision').length,
    firma: reports.filter(faltaFirma).length,
    completo: reports.filter((r) => estadoDe(r) === 'completo').length,
  }), [reports]);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (filtroEstado === 'firma' ? !faltaFirma(r) : filtroEstado !== 'todos' && estadoDe(r) !== filtroEstado) return false;
      if (filterType && r.tipo_servicio !== filterType) return false;
      if (search) {
        const hay = `${r.empresa_cliente} ${aliasClientes[(r as any).cliente_id] || ''} ${r.data?.claveFormato || ''}`;
        if (!coincideBusqueda(hay, search)) return false;
      }
      return true;
    });
  }, [reports, search, filterType, filtroEstado, aliasClientes]);

  // Por mes del servicio: la lista se lee por bloques en vez de una pared
  // de tarjetas iguales. Sale de la fecha del reporte, no del reloj.
  const porMes = useMemo(() => {
    const grupos: { clave: string; titulo: string; reportes: Report[] }[] = [];
    filtered.forEach((r) => {
      const clave = (r.fecha || '').slice(0, 7);
      let g = grupos.find((x) => x.clave === clave);
      if (!g) { g = { clave, titulo: tituloMes(clave), reportes: [] }; grupos.push(g); }
      g.reportes.push(r);
    });
    return grupos;
  }, [filtered]);

  return (
    <div className="max-w-2xl lg:max-w-none lg:px-6 mx-auto pb-24 lg:pb-12">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-bg pb-2">
        <div
          className="barra-fija px-5 pb-3 flex items-center justify-between gap-3"
          style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
        >
        <Logo variante="completo" size={34} className="min-w-0" />
        <div className="flex items-center gap-1 shrink-0">
          <MenuCuenta nombre={userName} respaldo="Personal técnico" />
        </div>
        </div>
        <TecnicoTabs active="reportes" />
      </div>

      <div className="px-4 pt-5 lg:pt-7">
        <EncabezadoSeccion
          titulo="Mis reportes"
          detalle={reports.length === 0
            ? 'Aquí quedan los reportes que vayas creando.'
            : `${reports.length} ${reports.length === 1 ? 'reporte' : 'reportes'}${cuentas.revision ? ` · ${cuentas.revision} por revisar` : ''}${cuentas.firma ? ` · ${cuentas.firma} sin firma del cliente` : ''}`}
          accion={
            // En computadora «Nuevo reporte» ya está en la barra de secciones.
            <Link href="/nuevo" className={`lg:!hidden ${BOTON_PRINCIPAL}`}>
              <Plus size={20} strokeWidth={2.6} />
              Crear nuevo reporte
            </Link>
          }
        />

        <AvisoActualizarCredenciales />
        <AvisoCuentaPrueba />
        <AvisoDiasSinReporte />

        <NotificacionesToggle esTecnico />

        <SubTabs
          activa={subseccion}
          onCambiar={setSubseccion}
          opciones={[
            { k: 'reportes', label: 'Reportes', Icono: FileText },
            { k: 'levantamientos', label: 'Levantamientos', Icono: ClipboardList },
          ]}
        />

        {subseccion === 'levantamientos' && <LevantamientosSeccion soloPropios />}

        {subseccion === 'reportes' && (
          <>
            {errorCarga && (
              <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
                <p className="text-[14px] font-semibold text-red mb-1">No se pudieron cargar los reportes</p>
                <p className="text-[13px] text-ink/80 leading-relaxed">{errorCarga}</p>
              </div>
            )}

            {/* Buscador y filtros: en computadora, un solo renglón */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
              <div className="relative lg:w-[340px] xl:w-[400px] shrink-0">
                <Search size={16} strokeWidth={2.3} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                <input
                  placeholder="Buscar por cliente o folio"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-3.5 min-h-[44px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[14px] placeholder:text-faint"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {([
                  ['todos', 'Todos', cuentas.todos],
                  ['revision', 'Por revisar', cuentas.revision],
                  ['firma', 'Sin firma del cliente', cuentas.firma],
                  ['completo', 'Completados', cuentas.completo],
                ] as const).filter(([k, , n]) => k === 'todos' || n > 0).map(([k, texto, n]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFiltroEstado(k)}
                    aria-pressed={filtroEstado === k}
                    className={`shrink-0 min-h-[40px] px-3.5 rounded-full border text-[13px] font-medium flex items-center gap-2 transition-colors ${
                      filtroEstado === k ? 'bg-teal/12 border-teal/45 text-teal font-semibold' : 'bg-surface border-line text-ink/75 hover:border-line-strong'
                    }`}
                  >
                    {texto}
                    <span className={`text-[12px] tabular-nums ${filtroEstado === k ? 'text-teal' : 'text-faint'}`}>{n}</span>
                  </button>
                ))}
                <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                aria-label="Tipo de servicio"
                className={`shrink-0 lg:ml-auto min-h-[40px] px-3.5 rounded-full border text-[13px] font-medium focus:border-teal focus:outline-none ${
                  filterType ? 'bg-teal/12 border-teal/45 text-teal' : 'bg-surface border-line text-ink/75'
                }`}
              >
                <option value="">Todos los tipos</option>
                <option value="Instalación nueva">Instalación nueva</option>
                <option value="Mantenimiento">Mantenimiento</option>
                <option value="Otro">Otro</option>
              </select>
              </div>
            </div>

            {filtered.length === 0 && (
              <EstadoVacio
                icono={<FileText size={24} strokeWidth={1.8} />}
                titulo={reports.length === 0 ? 'Todavía no has creado ningún reporte' : 'Sin resultados'}
                detalle={reports.length === 0 ? 'Crea el primero al terminar un servicio.' : 'Prueba con otro cliente, folio o filtro.'}
              />
            )}

            {porMes.map((g) => (
              <section key={g.clave} className="mb-7">
                <RotuloGrupo cuenta={g.reportes.length}>{g.titulo}</RotuloGrupo>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 lg:gap-3">
                  {g.reportes.map((r) => {
                    const completo = estadoDe(r) === 'completo';
                    const sinFirma = faltaFirma(r);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setOpen(r)}
                        className="group text-left rounded-2xl bg-surface border border-line p-4 flex items-center gap-3.5 transition-all duration-150 hover:border-teal/45 hover:-translate-y-0.5 hover:shadow-diffuse active:translate-y-0 active:scale-[0.99]"
                      >
                        {/* Día del servicio, como hoja de calendario */}
                        <span className="shrink-0 w-[46px] h-[50px] rounded-xl bg-surface-2 border border-line flex flex-col items-center justify-center leading-none">
                          <span className="font-display font-bold text-[19px] tabular-nums">{(r.fecha || '').slice(8, 10) || '—'}</span>
                          <span className="text-[10px] uppercase tracking-wider text-muted mt-1">{(MESES[Number((r.fecha || '').slice(5, 7)) - 1] || '').slice(0, 3)}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-display font-bold text-[16px] tracking-wide truncate transition-colors group-hover:text-teal">{r.empresa_cliente}</span>
                          <span className="block text-[12.5px] text-muted mt-0.5 truncate">
                            <span className="font-mono">{r.data?.claveFormato || r.id.slice(0, 8).toUpperCase()}</span>
                            {r.data?.horaLlegada ? ` · ${r.data.horaLlegada} hrs` : ''}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                            {completo ? (
                              <span className="text-[12px] font-semibold text-teal flex items-center gap-1"><Check size={13} strokeWidth={3} />Completado</span>
                            ) : (
                              <span className="text-[12px] font-semibold text-amber flex items-center gap-1"><Clock3 size={12.5} strokeWidth={2.6} />Por revisar</span>
                            )}
                            {sinFirma && (
                              <span className="text-[12px] font-semibold text-red flex items-center gap-1"><PenLine size={12.5} strokeWidth={2.6} />Falta firma del cliente</span>
                            )}
                          </span>
                        </span>
                        <ChevronRight size={18} strokeWidth={2.3} className="shrink-0 text-faint transition-all group-hover:text-teal group-hover:translate-x-0.5" />
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      {open && (
        <ReportDetailModal report={open} onClose={() => setOpen(null)} onUpdated={handleReporteActualizado} />
      )}

    </div>
  );
}
