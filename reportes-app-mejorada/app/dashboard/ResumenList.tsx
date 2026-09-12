'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabaseClient';
import ThemeToggle from '@/components/ThemeToggle';
import PerfilChip from '@/components/PerfilChip';
import NotificacionesToggle from '@/components/NotificacionesToggle';
import AvisoCuentaPrueba from '@/components/AvisoCuentaPrueba';
import LogoutButton from '@/components/LogoutButton';
import { ReportDetail, techName } from '@/components/ReportDetailModal';
import KpiSection from '@/components/KpiSection';
import KpiOperativos from '@/components/KpiOperativos';
import AvisosPendientes from '@/components/AvisosPendientes';
import { listarServiciosSupervisor, Servicio } from '@/lib/serviciosProgramados';
import BitacoraSupervisorSection from '@/components/BitacoraSupervisorSection';
import DashboardTabs from '@/components/DashboardTabs';
import Logo from '@/components/Logo';
import { CalendarClock, MessageSquareWarning, PackagePlus, AlertTriangle, PackageOpen } from 'lucide-react';
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
  const [servicios, setServicios] = useState<Servicio[]>([]);

  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [existencias, setExistencias] = useState<Record<string, number>>({});
  const [bajoMinimo, setBajoMinimo] = useState<ArticuloBajoMinimo[]>([]);

  useEffect(() => {
    listarSolicitudesPendientes().then(setSolicitudesInsumo).catch(() => {});
    // Sirve para avisar al aprobar si no alcanza: autorizar 20 tubos cuando
    // hay 4 solo mueve el problema al mostrador del almacén.
    mapaDeExistencias().then(setExistencias).catch(() => {});
    listarBajoMinimo().then(setBajoMinimo).catch(() => {});
    // Los indicadores de desempeño se calculan sobre los servicios ya
    // concluidos; si falla la carga, las tarjetas muestran que no hay datos
    // en lugar de romper el resumen.
    listarServiciosSupervisor().then(setServicios).catch(() => {});
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
  const today = hoyLocal();
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const totalToday = reports.filter((r) => r.fecha === today).length;
  const totalWeek = reports.filter((r) => new Date(r.created_at) >= weekAgo).length;
  const tecnicosActivos = new Set(reports.map((r) => techName(r.profiles))).size;
  const porFacturar = reports.filter((r) => r.data?.servicioConcluido && r.data?.facturaEstado !== 'facturado').length;

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto pb-10 lg:px-8">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <Logo variante="completo" size={34} className="min-w-0" />
        <div className="flex items-center gap-1 shrink-0">
          <PerfilChip nombre={userName} respaldo="Supervisor" />
          <ThemeToggle />
          <LogoutButton compacto />
        </div>
      </div>

      <div className="px-4 lg:px-0 pt-5">
        <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-4">Resumen</h1>
        {userName && <p className="text-[15px] text-muted font-medium mb-4 -mt-2.5">{userName}</p>}

        <DashboardTabs active="resumen" />

        <AvisoCuentaPrueba />

        <NotificacionesToggle />

        {errorCarga && (
          <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
            <p className="text-[14px] font-semibold text-red mb-1">No se pudieron cargar los reportes</p>
            <p className="text-[13px] text-ink/80 leading-relaxed">{errorCarga}</p>
            <p className="text-[12.5px] text-muted mt-2 leading-relaxed">
              Si el mensaje habla de una columna o tabla que no existe, falta correr un patch de SQL en Supabase.
            </p>
          </div>
        )}

        {/* Lo que requiere una decisión va antes que las métricas */}
        {diasVencidos.length > 0 && (
          <Link
            href="/dashboard/agenda"
            className="block mb-4 p-4 rounded-2xl bg-red/10 border-2 border-red/35 active:scale-[0.99] transition-transform"
          >
            <p className="font-display font-semibold text-[15px] text-red mb-1.5 flex items-center gap-2">
              <CalendarClock size={18} strokeWidth={2.5} />
              {diasVencidos.length === 1
                ? 'Hay 1 día programado que ya venció'
                : `Hay ${diasVencidos.length} días programados que ya vencieron`}
            </p>
            <p className="text-[13px] text-ink/80 leading-relaxed mb-1.5">
              Los técnicos no pueden iniciarlos hasta que se reprogramen.
            </p>
            {diasVencidos.slice(0, 3).map((d) => (
              <p key={d.id} className="text-[12.5px] text-muted">
                {d.proyecto}{d.dias_totales > 1 ? ` · Día ${d.numero_dia} de ${d.dias_totales}` : ''} — {formatFecha(d.fecha)}
              </p>
            ))}
            {diasVencidos.length > 3 && <p className="text-[12.5px] text-muted">y {diasVencidos.length - 3} más…</p>}
            <p className="text-[13px] text-red font-semibold mt-2">Ver la agenda para reprogramarlos</p>
          </Link>
        )}

        {bajoMinimo.length > 0 && (
          <Link
            href="/dashboard/almacen"
            className="block mb-4 p-4 rounded-2xl bg-amber/12 border-2 border-amber/40 active:scale-[0.99] transition-transform"
          >
            <p className="font-display font-semibold text-[15px] text-amber mb-1.5 flex items-center gap-2">
              <PackageOpen size={18} strokeWidth={2.5} />
              {bajoMinimo.length === 1
                ? 'Hay 1 artículo por debajo del mínimo'
                : `Hay ${bajoMinimo.length} artículos por debajo del mínimo`}
            </p>
            {bajoMinimo.slice(0, 3).map((b) => (
              <p key={b.articulo.id} className="text-[12.5px] text-muted">
                {b.articulo.descripcion} — quedan {b.existencia} de {b.articulo.minimo} {b.articulo.unidad}
              </p>
            ))}
            {bajoMinimo.length > 3 && <p className="text-[12.5px] text-muted">y {bajoMinimo.length - 3} más…</p>}
            <p className="text-[13px] text-amber font-semibold mt-2">Ver el almacén</p>
          </Link>
        )}

        {solicitudesInsumo.length > 0 && (
          <div className="mb-4 p-4 rounded-2xl bg-amber/12 border-2 border-amber/40">
            <p className="font-display font-semibold text-[15px] text-amber mb-2.5 flex items-center gap-2">
              <PackagePlus size={18} strokeWidth={2.5} />
              {solicitudesInsumo.length === 1
                ? 'Hay 1 solicitud de herramienta'
                : `Hay ${solicitudesInsumo.length} solicitudes de herramienta`}
            </p>

            <div className="flex flex-col gap-2.5">
              {solicitudesInsumo.map((s) => (
                <div key={s.id} className="rounded-xl bg-surface border border-line p-3.5">
                  <p className="text-[14.5px] font-medium">
                    {s.cantidad} {s.unidad} de {s.descripcion}
                  </p>
                  <p className="text-[12.5px] text-muted mt-0.5">
                    {s.solicitante || 'Un técnico'}{s.proyecto ? ` · ${s.proyecto}` : ''}
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
          </div>
        )}

        {solicitudesPendientes.length > 0 && (
          <Link
            href="/dashboard/reportes"
            className="block mb-4 p-4 rounded-2xl bg-amber/12 border-2 border-amber/40 active:scale-[0.99] transition-transform"
          >
            <p className="font-display font-semibold text-[15px] text-amber mb-1.5 flex items-center gap-2">
              <MessageSquareWarning size={18} strokeWidth={2.5} />
              {solicitudesPendientes.length === 1
                ? 'Hay 1 solicitud de corrección'
                : `Hay ${solicitudesPendientes.length} solicitudes de corrección`}
            </p>
            {solicitudesPendientes.slice(0, 3).map((r) => (
              <p key={r.id} className="text-[12.5px] text-muted">
                <span className="text-ink/80 font-medium">{techName(r.profiles)}</span> — {r.empresa_cliente}
                {r.correccion_motivo ? `: ${r.correccion_motivo}` : ''}
              </p>
            ))}
            <p className="text-[13px] text-amber font-semibold mt-2">Ver en Reportes para autorizarlas</p>
          </Link>
        )}

        <AvisosPendientes />

        <AvisosPendientes />

        <KpiSection reports={reports} />
        <KpiOperativos servicios={servicios} reports={reports} />
        <BitacoraSupervisorSection />

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <Stat label="Total" value={reports.length} accent="teal" />
          <Stat label="Esta semana" value={totalWeek} accent="amber" />
          <Stat label="Hoy" value={totalToday} accent="red" />
          <Stat label="Técnicos activos" value={tecnicosActivos} accent="teal" />
          <Stat label="Por facturar" value={porFacturar} accent="amber" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: 'teal' | 'amber' | 'red' }) {
  const dot = accent === 'teal' ? 'bg-teal' : accent === 'amber' ? 'bg-amber' : 'bg-red';
  return (
    <div className="glass rounded-2xl px-3.5 py-3.5 lg:px-5 lg:py-5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      </div>
      <div className="font-display text-[28px] lg:text-[34px] font-bold leading-none">{value}</div>
    </div>
  );
}
