'use client';

import { estadoFacturacion } from '@/lib/reportStatus';
import { useRouter } from 'next/navigation';
import { useEnVivo, huellaReportes } from '@/lib/useEnVivo';
import AvisoPlegable from '@/components/AvisoPlegable';
import AlertaEquiposSinRegistro from '@/components/AlertaEquiposSinRegistro';
import AlertaSolicitudes from '@/components/AlertaSolicitudes';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseClient';
import NotificacionesToggle from '@/components/NotificacionesToggle';
import AvisoCuentaPrueba from '@/components/AvisoCuentaPrueba';
import AvisoActualizarCredenciales from '@/components/AvisoActualizarCredenciales';
import { ReportDetail, techName } from '@/components/ReportDetailModal';
import KpiSection from '@/components/KpiSection';
import KpiOperativos from '@/components/KpiOperativos';
import AvisosPendientes from '@/components/AvisosPendientes';
import ServiciosSinReporteSection from '@/components/ServiciosSinReporteSection';
import { listarAgendaSupervisor, DiaAgenda } from '@/lib/serviciosProgramados';
import KpiEficiencia from '@/components/KpiEficiencia';
import BitacoraSupervisorSection from '@/components/BitacoraSupervisorSection';
import SupervisorShell from '@/components/SupervisorShell';
import { CalendarClock, MessageSquareWarning, PackagePlus, AlertTriangle, PackageOpen, ChevronRight, CalendarCheck, BarChart3, Receipt, Users, FileText } from 'lucide-react';
import { listarSolicitudesPendientes, resolverSolicitudInsumo } from '@/lib/insumos';
import { mapaDeExistencias, listarBajoMinimo, ArticuloBajoMinimo } from '@/lib/almacen';
import { showToast } from '@/components/Toast';
import { hoyLocal } from '@/lib/fechaHoy';

type Report = ReportDetail;
type DiaVencido = { id: string; proyecto: string; fecha: string; numero_dia: number; dias_totales: number };

function formatFecha(fecha: string): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  if (!y || !m || !d) return fecha;
  return `${d}/${m}/${y}`;
}

// Pantalla de aterrizaje del supervisor: lo que necesita saber al abrir la
// app, sin mezclarlo con la lista de reportes ni con la programación. Los
// avisos que exigen una decisión van primero.
export default function ResumenList({
  reports,
  userName,
  errorCarga,
  diasVencidos = [],
}: {
  reports: Report[];
  userName?: string;
  errorCarga?: string | null;
  diasVencidos?: DiaVencido[];
}) {
  const [solicitudesInsumo, setSolicitudesInsumo] = useState<any[]>([]);
  const [servicios, setServicios] = useState<DiaAgenda[]>([]);

  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [existencias, setExistencias] = useState<Record<string, number>>({});
  const [bajoMinimo, setBajoMinimo] = useState<ArticuloBajoMinimo[]>([]);
  // Estos tres alimentan avisos que el supervisor usa para decidir ("no hay
  // nada pendiente"). Si la carga falla y se descarta en silencio, una lista
  // vacía es indistinguible de que de verdad no hay nada — así que el fallo
  // se muestra en vez de tragarse.
  const [erroresAvisos, setErroresAvisos] = useState<string[]>([]);
  // "Hoy"/"esta semana" dependen de la hora del navegador, que puede no
  // coincidir con la del servidor (Vercel corre en UTC) — ver el comentario
  // en components/SelectorSemana.tsx. Mismo patrón: arranca en null (mismo
  // valor en servidor y primer render del cliente) y se corrige ya montado.
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => setAhora(Date.now()), []);

  // En vivo: cuando llega un reporte (o cambia un servicio) el Resumen se
  // vuelve a pedir al servidor, sin recargar la página.
  const router = useRouter();
  useEnVivo({ tablas: ['reports', 'servicios_programados'], huella: huellaReportes, alCambiar: () => router.refresh() });
  const cuantos = useRef(reports.length);
  useEffect(() => {
    if (reports.length > cuantos.current) showToast('Llegó un reporte nuevo', 'success');
    cuantos.current = reports.length;
  }, [reports.length]);

  function marcarErrorAviso(descripcion: string) {
    setErroresAvisos((prev) => (prev.includes(descripcion) ? prev : [...prev, descripcion]));
  }

  useEffect(() => {
    listarSolicitudesPendientes().then(setSolicitudesInsumo).catch(() => marcarErrorAviso('las solicitudes de herramienta pendientes'));
    // Sirve para avisar al aprobar si no alcanza: autorizar 20 tubos cuando
    // hay 4 solo mueve el problema al mostrador del almacén.
    mapaDeExistencias().then(setExistencias).catch(() => marcarErrorAviso('las existencias del almacén'));
    listarBajoMinimo().then(setBajoMinimo).catch(() => marcarErrorAviso('los artículos bajo el mínimo'));
    // Los indicadores de desempeño se calculan sobre los servicios ya
    // concluidos; si falla la carga, las tarjetas muestran que no hay datos
    // en lugar de romper el resumen.
    listarAgendaSupervisor().then(setServicios).catch(() => {});
  }, []);

  // Se autoriza desde aquí: obligar a abrir el proyecto, el día correcto y la
  // sección de herramienta para dar un sí era demasiado camino.
  async function handleResolver(sol: any, aprobar: boolean) {
    setResolviendo(sol.id);
    try {
      await resolverSolicitudInsumo(sol, aprobar);
      setSolicitudesInsumo((prev) => prev.filter((x) => x.id !== sol.id));
      showToast(aprobar ? 'Herramienta autorizada' : 'Solicitud rechazada', 'success');
    } catch (e: any) {
      alert('No se pudo procesar: ' + (e?.message || 'error'));
    } finally {
      setResolviendo(null);
    }
  }


  const solicitudesPendientes = useMemo(
    () => reports.filter((r) => r.correccion_solicitada && !r.correccion_habilitada),
    [reports]
  );

  // Mismos criterios que tenía el panel antes de separarse, para que los
  // números no cambien de significado al moverse de pantalla.
  const today = ahora !== null ? hoyLocal(new Date(ahora)) : '';
  const weekAgo = ahora !== null ? new Date(ahora - 7 * 864e5) : null;
  const totalToday = ahora !== null ? reports.filter((r) => r.fecha === today).length : 0;
  const totalWeek = weekAgo ? reports.filter((r) => new Date(r.created_at) >= weekAgo).length : 0;
  const tecnicosActivos = new Set(reports.map((r) => techName(r.profiles))).size;
  const porFacturar = reports.filter((r) => estadoFacturacion(r.data) === 'pendiente').length;
  const concluidos = reports.filter((r) => r.data?.servicioConcluido).length;
  const ayer = ahora !== null ? hoyLocal(new Date(ahora - 864e5)) : '';
  const totalAyer = ahora !== null ? reports.filter((r) => r.fecha === ayer).length : 0;
  // Reportes de cada uno de los últimos 7 días (para las mini columnas).
  const porDia = ahora !== null
    ? Array.from({ length: 7 }, (_, i) => { const f = hoyLocal(new Date(ahora - (6 - i) * 864e5)); return reports.filter((r) => r.fecha === f).length; })
    : [0, 0, 0, 0, 0, 0, 0];

  return (
    <SupervisorShell active="resumen" title="Resumen" userName={userName}>
        <AvisoActualizarCredenciales />
        <AvisoCuentaPrueba />

        <NotificacionesToggle />

        {/* Lo de hoy, arriba: es lo primero que el supervisor busca */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <Stat label="Hoy" value={totalToday} Icono={CalendarCheck} tono="teal"
            nota={ahora === null ? '' : totalAyer === totalToday ? 'Igual que ayer' : `${totalToday > totalAyer ? '+' : '−'}${Math.abs(totalToday - totalAyer)} que ayer`}
            notaTono={totalToday > totalAyer ? 'teal' : undefined} />
          <Stat label="Esta semana" value={totalWeek} Icono={BarChart3} tono="teal" nota="Últimos 7 días">
            {/* Mini columnas: un vistazo al ritmo de la semana. */}
            <div className="flex items-end gap-[3px] h-7" aria-hidden="true">
              {porDia.map((n, i) => (
                <span key={i} className={`w-[5px] rounded-t-[2px] ${i === porDia.length - 1 ? 'bg-teal' : 'bg-teal/45'}`}
                  style={{ height: `${Math.max(8, (n / Math.max(1, ...porDia)) * 100)}%` }} />
              ))}
            </div>
          </Stat>
          <Stat label="Por facturar" value={porFacturar} Icono={Receipt} tono="amber"
            nota={concluidos > 0 ? `de ${concluidos} concluidos` : 'Sin servicios concluidos'}
            barra={concluidos > 0 ? porFacturar / concluidos : undefined} />
          <Stat label="Personal activo" value={tecnicosActivos} Icono={Users} tono="teal" nota="Con reportes entregados" />
          {/* En celular ocupa el renglón completo: con cinco indicadores quedaba uno suelto. */}
          <Stat label="Reportes totales" value={reports.length} Icono={FileText} tono="teal" nota="Desde que se usa la app" className="col-span-2 lg:col-span-1" />
        </div>

        <AlertaSolicitudes />
        <AlertaEquiposSinRegistro />

        {errorCarga && (
          <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
            <p className="text-[14px] font-semibold text-red mb-1">No se pudieron cargar los reportes</p>
            <p className="text-[13px] text-ink/80 leading-relaxed">{errorCarga}</p>
            <p className="text-[12.5px] text-muted mt-2 leading-relaxed">
              Si el mensaje habla de una columna o tabla que no existe, falta correr un patch de SQL en Supabase.
            </p>
          </div>
        )}

        {erroresAvisos.length > 0 && (
          <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
            <p className="text-[14px] font-semibold text-red mb-1">Algunos avisos no se pudieron comprobar</p>
            <p className="text-[13px] text-ink/80 leading-relaxed">
              No se pudo revisar {erroresAvisos.join(', ')}. Puede que falten avisos aquí arriba aunque no
              se muestre ninguno — recarga la página o revisa esas secciones directamente.
            </p>
          </div>
        )}

        {/* Lo que requiere una decisión va antes que las métricas */}
        {diasVencidos.length > 0 && (
          <AvisoPlegable
            tono="red"
            Icono={CalendarClock}
            cuenta={diasVencidos.length}
            titulo={diasVencidos.length === 1 ? 'Día programado vencido' : 'Días programados vencidos'}
            resumen="Hay que reprogramarlos para que se puedan iniciar"
          >
            <p className="text-[13px] text-ink/80 leading-relaxed mb-2">
              No se pueden iniciar hasta que se reprogramen.
            </p>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface-2/40 mb-3">
              {diasVencidos.slice(0, 6).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate">{d.proyecto}{d.dias_totales > 1 ? ` · Día ${d.numero_dia} de ${d.dias_totales}` : ''}</span>
                  <span className="shrink-0 text-muted tabular-nums">{formatFecha(d.fecha)}</span>
                </li>
              ))}
              {diasVencidos.length > 6 && <li className="px-3 py-2 text-[12.5px] text-muted">y {diasVencidos.length - 6} más…</li>}
            </ul>
            <Link href="/dashboard/agenda" className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-red">
              Ir a la agenda para reprogramarlos <ChevronRight size={15} />
            </Link>
          </AvisoPlegable>
        )}

        {bajoMinimo.length > 0 && (
          <AvisoPlegable
            tono="amber"
            Icono={PackageOpen}
            cuenta={bajoMinimo.length}
            titulo={bajoMinimo.length === 1 ? 'Artículo por debajo del mínimo' : 'Artículos por debajo del mínimo'}
            resumen={bajoMinimo.slice(0, 2).map((b) => b.articulo.descripcion).join(', ') + (bajoMinimo.length > 2 ? '…' : '')}
          >
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface-2/40 mb-3">
              {bajoMinimo.slice(0, 6).map((b) => (
                <li key={b.articulo.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate">{b.articulo.descripcion}</span>
                  <span className="shrink-0 text-muted tabular-nums">{b.existencia} de {b.articulo.minimo} {b.articulo.unidad}</span>
                </li>
              ))}
              {bajoMinimo.length > 6 && <li className="px-3 py-2 text-[12.5px] text-muted">y {bajoMinimo.length - 6} más…</li>}
            </ul>
            <Link href="/dashboard/almacen" className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-amber">
              Ver el almacén <ChevronRight size={15} />
            </Link>
          </AvisoPlegable>
        )}

        {solicitudesInsumo.length > 0 && (
          <AvisoPlegable
            tono="amber"
            Icono={PackagePlus}
            cuenta={solicitudesInsumo.length}
            titulo={solicitudesInsumo.length === 1 ? 'Solicitud de herramienta o material' : 'Solicitudes de herramienta o material'}
            resumen={solicitudesInsumo.slice(0, 2).map((x) => x.descripcion).join(', ') + (solicitudesInsumo.length > 2 ? '…' : '')}
          >

            <div className="flex flex-col gap-2.5">
              {solicitudesInsumo.map((s) => (
                <div key={s.id} className="rounded-xl bg-surface border border-line p-3.5">
                  <p className="text-[14.5px] font-medium">
                    {s.cantidad} {s.unidad} de {s.descripcion}
                  </p>
                  <p className="text-[12.5px] text-muted mt-0.5">
                    {s.solicitante || 'Alguien del equipo'}{s.proyecto ? ` · ${s.proyecto}` : ''}
                    {s.motivo_solicitud ? ` — ${s.motivo_solicitud}` : ''}
                  </p>
                  {s.articulo_id && (
                    (existencias[s.articulo_id] ?? 0) < s.cantidad ? (
                      <p className="text-[12.5px] text-amber font-medium mt-1.5 flex items-center gap-1.5">
                        <AlertTriangle size={13} strokeWidth={2.5} className="shrink-0" />
                        En almacén solo hay {existencias[s.articulo_id] ?? 0} {s.unidad}
                      </p>
                    ) : (
                      <p className="text-[12.5px] text-teal mt-1.5">
                        Hay {existencias[s.articulo_id]} {s.unidad} en almacén
                      </p>
                    )
                  )}
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={() => handleResolver(s, false)}
                      disabled={resolviendo === s.id}
                      className="flex-1 min-h-[44px] rounded-xl border border-line-strong text-ink/80 text-[14px] font-medium active:scale-95 transition-transform disabled:opacity-60"
                    >
                      Rechazar
                    </button>
                    <button
                      onClick={() => handleResolver(s, true)}
                      disabled={resolviendo === s.id}
                      className="flex-1 min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
                    >
                      {resolviendo === s.id ? 'Guardando...' : 'Autorizar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </AvisoPlegable>
        )}

        {solicitudesPendientes.length > 0 && (
          <AvisoPlegable
            tono="amber"
            Icono={MessageSquareWarning}
            cuenta={solicitudesPendientes.length}
            titulo={solicitudesPendientes.length === 1 ? 'Solicitud de corrección de reporte' : 'Solicitudes de corrección de reportes'}
            resumen={solicitudesPendientes.slice(0, 2).map((r) => techName(r.profiles)).join(', ')}
          >
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface-2/40 mb-3">
              {solicitudesPendientes.slice(0, 6).map((r) => (
                <li key={r.id} className="px-3 py-2 text-[13px]">
                  <span className="font-medium">{techName(r.profiles)}</span>
                  <span className="text-muted"> — {r.empresa_cliente}{r.correccion_motivo ? `: ${r.correccion_motivo}` : ''}</span>
                </li>
              ))}
            </ul>
            <Link href="/dashboard/reportes" className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-amber">
              Ver en Reportes para autorizarlas <ChevronRight size={15} />
            </Link>
          </AvisoPlegable>
        )}

        <AvisosPendientes />
        <ServiciosSinReporteSection />

        <KpiSection reports={reports} />
        <KpiOperativos servicios={servicios} reports={reports} />
        <KpiEficiencia servicios={servicios} />
        <BitacoraSupervisorSection />

    </SupervisorShell>
  );
}

// Indicador de la fila de arriba: ícono, cifra grande, una nota de contexto
// y, si aplica, una gráfica mínima (columnas o barra de proporción).
function Stat({
  label, value, Icono, tono, nota, notaTono, barra, children, className = '',
}: {
  label: string;
  value: number;
  Icono: any;
  tono: 'teal' | 'amber';
  nota?: string;
  notaTono?: 'teal';
  // Proporción 0–1 para una barra bajo la cifra.
  barra?: number;
  children?: React.ReactNode;
  className?: string;
}) {
  const chip = tono === 'teal' ? 'bg-teal/12 text-teal' : 'bg-amber/15 text-amber';
  return (
    <div className={`glass rounded-2xl px-3.5 py-3.5 lg:px-5 lg:py-4 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${chip}`}>
          <Icono size={15} strokeWidth={2.2} />
        </span>
        <div className="text-[11px] uppercase tracking-wider text-muted leading-tight">{label}</div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="font-display text-[30px] lg:text-[36px] font-bold leading-none tabular-nums">{value}</div>
        {children}
      </div>
      {barra !== undefined && (
        <div className="h-1.5 rounded-r-[3px] bg-surface-2 overflow-hidden mt-2">
          <div className={`h-full rounded-r-[3px] ${tono === 'teal' ? 'bg-teal' : 'bg-amber'} transition-all duration-500`} style={{ width: `${Math.min(100, barra * 100)}%` }} />
        </div>
      )}
      {nota !== undefined && <p className={`text-[11.5px] mt-1.5 min-h-[16px] ${notaTono === 'teal' ? 'text-teal font-semibold' : 'text-muted'}`}>{nota}</p>}
    </div>
  );
}
