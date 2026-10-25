'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import EmptyIllustration from '@/components/EmptyIllustration';
import { listarAuditoriaGlobal, EntradaAuditoria, SeccionActividad } from '@/lib/auditoriaGlobal';
import { CalendarPlus, Pencil, Users, Plus, Trash2, BadgeCheck, Flag, Banknote, AlertTriangle, MessageSquareWarning, Unlock, LockKeyhole, FileCheck, CalendarClock, PackagePlus, PackageCheck, PackageX, Warehouse, CalendarX, ClipboardList, ClipboardCheck, Receipt, ArrowLeftRight } from 'lucide-react';

// Línea de tiempo de la actividad: la usan la página «Actividad» (todo) y la
// subsección «Actividad» de cada sección (solo lo de esa sección).

// Configuración visual por tipo de acción: ícono + etiqueta + color.
// Las eliminaciones van en rojo para que salten a la vista.
type Tono = 'teal' | 'amber' | 'red';
type ConfigAccion = { Icono: any; label: string; tono: Tono };

const ACCION_CFG: Record<string, ConfigAccion> = {
  programo_servicio: { Icono: CalendarPlus, label: 'Programó servicio', tono: 'teal' },
  aviso_servicio: { Icono: AlertTriangle, label: 'Avisó de un problema', tono: 'amber' },
  resolvio_aviso: { Icono: CalendarClock, label: 'Resolvió un aviso', tono: 'teal' },
  edito_servicio: { Icono: Pencil, label: 'Editó servicio', tono: 'amber' },
  reasigno_tecnicos: { Icono: Users, label: 'Reasignó personal', tono: 'amber' },
  amplio_proyecto: { Icono: Plus, label: 'Amplió proyecto', tono: 'teal' },
  reprogramo_dia: { Icono: CalendarClock, label: 'Reprogramó una fecha', tono: 'amber' },
  cambio_en_dia: { Icono: CalendarClock, label: 'Cambio en el día', tono: 'amber' },
  agrego_insumo: { Icono: PackagePlus, label: 'Agregó a la lista de carga', tono: 'amber' },
  solicito_insumo: { Icono: PackagePlus, label: 'Solicitó herramienta o material', tono: 'amber' },
  aprobo_insumo: { Icono: PackageCheck, label: 'Autorizó herramienta o material', tono: 'teal' },
  rechazo_insumo: { Icono: PackageX, label: 'Rechazó una solicitud', tono: 'red' },
  firmo_resguardo: { Icono: PackageCheck, label: 'Tomó resguardo de herramienta', tono: 'teal' },
  devolvio_herramienta: { Icono: PackageX, label: 'Devolvió herramienta', tono: 'amber' },
  recibio_herramienta: { Icono: Warehouse, label: 'Recibió en almacén', tono: 'teal' },
  elimino_servicio: { Icono: Trash2, label: 'Eliminó servicio', tono: 'red' },
  elimino_dia: { Icono: CalendarX, label: 'Eliminó un día del proyecto', tono: 'red' },
  cerro_dia_manual: { Icono: BadgeCheck, label: 'Cerró un día manualmente', tono: 'amber' },
  libero_reporte: { Icono: BadgeCheck, label: 'Liberó un servicio del reporte', tono: 'amber' },
  exigio_reporte: { Icono: BadgeCheck, label: 'Indicó que un servicio sí requiere reporte', tono: 'amber' },
  elimino_reporte: { Icono: Trash2, label: 'Eliminó reporte', tono: 'red' },
  aprobo_revision: { Icono: BadgeCheck, label: 'Aprobó revisión final', tono: 'teal' },
  marco_finalizado: { Icono: Flag, label: 'Marcó servicio finalizado', tono: 'teal' },
  subio_factura: { Icono: Banknote, label: 'Subió factura', tono: 'teal' },
  marco_no_facturable: { Icono: AlertTriangle, label: 'Marcó no facturable', tono: 'amber' },
  solicito_correccion: { Icono: MessageSquareWarning, label: 'Pidió corregir un reporte', tono: 'amber' },
  habilito_correccion: { Icono: Unlock, label: 'Autorizó corregir un reporte', tono: 'amber' },
  cerro_correccion: { Icono: LockKeyhole, label: 'Cerró permiso de corrección', tono: 'teal' },
  aplico_correccion: { Icono: FileCheck, label: 'Aplicó una corrección', tono: 'teal' },
  creo_proyecto: { Icono: CalendarPlus, label: 'Creó un proyecto', tono: 'teal' },
  creo_usuario: { Icono: Users, label: 'Dio de alta un usuario', tono: 'teal' },
  edito_usuario: { Icono: Pencil, label: 'Editó un usuario', tono: 'amber' },
  elimino_usuario: { Icono: Trash2, label: 'Eliminó un usuario', tono: 'red' },
  actualizo_estado_proyecto: { Icono: Pencil, label: 'Actualizó el estado de un proyecto', tono: 'amber' },
  elimino_proyecto: { Icono: Trash2, label: 'Eliminó un proyecto', tono: 'red' },
  justifico_dia: { Icono: MessageSquareWarning, label: 'Justificó un día sin reporte', tono: 'amber' },
  autorizo_justificacion: { Icono: FileCheck, label: 'Autorizó la justificación de un día', tono: 'teal' },
  rechazo_justificacion: { Icono: CalendarX, label: 'Rechazó la justificación de un día', tono: 'red' },
  marco_festivo: { Icono: CalendarPlus, label: 'Marcó un día festivo', tono: 'teal' },
  quito_festivo: { Icono: CalendarX, label: 'Quitó un día festivo', tono: 'red' },
  unio_clientes: { Icono: Users, label: 'Unió o dio de alta clientes', tono: 'teal' },
  // Las que anota la base (patch_actividad_por_seccion.sql).
  creo_reporte: { Icono: FileCheck, label: 'Hizo un reporte', tono: 'teal' },
  modifico_reporte: { Icono: Pencil, label: 'Modificó un reporte', tono: 'amber' },
  creo_levantamiento: { Icono: ClipboardList, label: 'Hizo un levantamiento', tono: 'teal' },
  edito_levantamiento: { Icono: Pencil, label: 'Editó un levantamiento', tono: 'amber' },
  elimino_levantamiento: { Icono: Trash2, label: 'Eliminó un levantamiento', tono: 'red' },
  creo_cotizacion: { Icono: Receipt, label: 'Creó una cotización', tono: 'teal' },
  edito_cotizacion: { Icono: Pencil, label: 'Editó una cotización', tono: 'amber' },
  cambio_estado_cotizacion: { Icono: BadgeCheck, label: 'Cambió el estado de una cotización', tono: 'teal' },
  elimino_cotizacion: { Icono: Trash2, label: 'Eliminó una cotización', tono: 'red' },
  creo_factura: { Icono: Banknote, label: 'Creó una prefactura', tono: 'teal' },
  edito_factura: { Icono: Pencil, label: 'Editó una factura', tono: 'amber' },
  cambio_estado_factura: { Icono: BadgeCheck, label: 'Cambió el estado de una factura', tono: 'teal' },
  elimino_factura: { Icono: Trash2, label: 'Eliminó una factura', tono: 'red' },
  creo_cliente: { Icono: Users, label: 'Dio de alta un cliente', tono: 'teal' },
  edito_cliente: { Icono: Pencil, label: 'Editó un cliente', tono: 'amber' },
  elimino_cliente: { Icono: Trash2, label: 'Eliminó un cliente', tono: 'red' },
  movimiento_almacen: { Icono: ArrowLeftRight, label: 'Movimiento de almacén', tono: 'teal' },
  creo_articulo: { Icono: PackagePlus, label: 'Dio de alta un artículo', tono: 'teal' },
  edito_articulo: { Icono: Pencil, label: 'Editó un artículo', tono: 'amber' },
  elimino_articulo: { Icono: Trash2, label: 'Eliminó un artículo', tono: 'red' },
  creo_vale: { Icono: ClipboardList, label: 'Vale de almacén', tono: 'teal' },
  cambio_estado_vale: { Icono: PackageCheck, label: 'Cambió el estado de un vale', tono: 'teal' },
  elimino_vale: { Icono: Trash2, label: 'Eliminó un vale', tono: 'red' },
  traspaso_almacen: { Icono: ArrowLeftRight, label: 'Traspaso entre técnicos', tono: 'amber' },
  conteo_almacen: { Icono: ClipboardCheck, label: 'Conteo físico', tono: 'teal' },
  creo_solicitud: { Icono: CalendarClock, label: 'Solicitud de personal', tono: 'teal' },
  cambio_estado_solicitud: { Icono: BadgeCheck, label: 'Respondió una solicitud', tono: 'teal' },
};

// Acción sin configuración (nueva): se muestra legible en vez de «crear_algo».
function configDe(accion: string): ConfigAccion {
  const cfg = ACCION_CFG[accion];
  if (cfg) return cfg;
  const texto = accion.replace(/_/g, ' ');
  return { Icono: Pencil, label: texto.charAt(0).toUpperCase() + texto.slice(1), tono: 'amber' };
}

const TONO_CLS: Record<Tono, string> = {
  teal: 'bg-teal/15 text-teal',
  amber: 'bg-amber/15 text-amber',
  red: 'bg-red/15 text-red',
};

function nombre(profiles: any): string {
  if (!profiles) return '—';
  if (Array.isArray(profiles)) return profiles[0]?.full_name || '—';
  return profiles.full_name || '—';
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', hour12: false, minute: '2-digit' });
}

// "Hoy"/"Ayer" dependen de `ahora`, que se recibe desde afuera en vez de leer
// new Date() aquí — ver el comentario en components/SelectorSemana.tsx: el
// servidor (Vercel, UTC) y el navegador (México) pueden calcular un día
// distinto y React truena al hidratar.
function fmtDia(iso: string, ahora: number | null) {
  const d = new Date(iso);
  if (ahora === null) return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const hoy = new Date(ahora);
  const ayer = new Date(ahora - 864e5);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}


export const NOMBRE_SECCION: Record<SeccionActividad, string> = {
  servicios: 'Servicios',
  reportes: 'Reportes',
  cotizaciones: 'Cotizaciones',
  facturacion: 'Facturación',
  clientes: 'Clientes',
  personal: 'Personal',
  almacen: 'Almacén',
};

// filtroExtra: un filtro más (p. ej. la sección) que va en el mismo renglón que los demás.
export default function ActividadSeccion({ seccion, mostrarSeccion = false, filtroExtra }: { seccion?: SeccionActividad; mostrarSeccion?: boolean; filtroExtra?: ReactNode }) {
  const [entradas, setEntradas] = useState<EntradaAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroActor, setFiltroActor] = useState('');
  const [filtroAccion, setFiltroAccion] = useState('');
  const [ahora, setAhora] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    listarAuditoriaGlobal(300, seccion)
      .then((lista) => { setEntradas(lista); setError(null); })
      .catch((e) => setError(e?.message || 'No se pudo cargar la actividad. Revisa tu conexión e intenta de nuevo.'))
      .finally(() => setLoading(false));
    setAhora(Date.now());
  }, [seccion]);

  const actores = useMemo(() => {
    const set = new Map<string, string>();
    entradas.forEach((e) => set.set(e.actor_id, nombre(e.profiles)));
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [entradas]);

  // Solo las acciones que aparecen en esta lista.
  const acciones = useMemo(() => {
    const vistas = new Set(entradas.map((e) => e.accion));
    return Array.from(vistas).map((k) => [k, configDe(k).label] as const).sort((a, b) => a[1].localeCompare(b[1]));
  }, [entradas]);

  const filtradas = useMemo(
    () =>
      entradas.filter((e) => {
        if (filtroActor && e.actor_id !== filtroActor) return false;
        if (filtroAccion && e.accion !== filtroAccion) return false;
        return true;
      }),
    [entradas, filtroActor, filtroAccion]
  );

  // Agrupar por día para leerse como línea de tiempo
  const porDia = useMemo(() => {
    const grupos: { dia: string; items: EntradaAuditoria[] }[] = [];
    filtradas.forEach((e) => {
      const dia = fmtDia(e.created_at, ahora);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.dia === dia) ultimo.items.push(e);
      else grupos.push({ dia, items: [e] });
    });
    return grupos;
  }, [filtradas, ahora]);

  return (
    <div>
        <p className="text-[12.5px] text-muted mb-4">
          {seccion
            ? `Registro permanente de lo que pasa en ${NOMBRE_SECCION[seccion]}, incluidas las ediciones y eliminaciones.`
            : 'Registro permanente de lo que hace el equipo, incluidas las eliminaciones.'}
        </p>

        <div className="flex flex-wrap lg:flex-nowrap gap-2 mb-5">
          {filtroExtra}
          <select
            value={filtroActor}
            onChange={(e) => setFiltroActor(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13px]"
          >
            <option value="">Todas las personas</option>
            {actores.map(([id, n]) => (
              <option key={id} value={id}>{n}</option>
            ))}
          </select>
          <select
            value={filtroAccion}
            onChange={(e) => setFiltroAccion(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13px]"
          >
            <option value="">Todas las acciones</option>
            {acciones.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="flex flex-col gap-2.5" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl bg-surface-2 border border-line p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-5 w-28 rounded-full skeleton-shimmer" />
                  <div className="h-3 w-16 rounded-full skeleton-shimmer ml-auto shrink-0" />
                </div>
                <div className="h-3 w-3/5 rounded-full skeleton-shimmer" />
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-red text-sm mb-4">{error}</p>}
        {!loading && !error && filtradas.length === 0 && (
          <div className="flex flex-col items-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3.5">
              <EmptyIllustration variante="historial" />
            </div>
            <p className="text-[13.5px] text-muted leading-relaxed max-w-[280px]">
              {entradas.length === 0
                ? 'Todavía no hay actividad registrada. Aparecerá conforme se creen, editen o eliminen registros.'
                : 'Sin resultados con esos filtros.'}
            </p>
          </div>
        )}

        {porDia.map((g) => (
          <div key={g.dia} className="mb-6">
            <div className="text-[13.5px] font-semibold text-muted mb-2.5 first-letter:uppercase">{g.dia}</div>
            <div className="flex flex-col gap-2.5">
              {g.items.map((e) => {
                const cfg = configDe(e.accion);
                const CfgIcono = cfg.Icono;
                return (
                  <div key={e.id} className={`rounded-xl bg-surface-2 border p-3.5 ${cfg.tono === 'red' ? 'border-red/25' : 'border-line'}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${TONO_CLS[cfg.tono]}`}>
                        <CfgIcono size={13} strokeWidth={2.6} />
                        {cfg.label}
                      </span>
                      <span className="text-[13px] font-semibold">{nombre(e.profiles)}</span>
                      {mostrarSeccion && e.seccion && e.seccion in NOMBRE_SECCION && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface border border-line text-muted">{NOMBRE_SECCION[e.seccion as SeccionActividad]}</span>
                      )}
                      <span className="text-[12px] text-muted ml-auto shrink-0">{fmtHora(e.created_at)}</span>
                    </div>
                    {e.detalle && <p className="text-[13.5px] text-ink/85 leading-relaxed mt-0.5">{e.detalle}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
