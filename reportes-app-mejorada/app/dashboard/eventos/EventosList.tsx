'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import Logo from '@/components/Logo';
import DashboardTabs from '@/components/DashboardTabs';
import { listarAuditoriaGlobal, EntradaAuditoria, AccionGlobal } from '@/lib/auditoriaGlobal';
import { CalendarPlus, Pencil, Users, Plus, Trash2, BadgeCheck, Flag, Banknote, AlertTriangle, MessageSquareWarning, Unlock, LockKeyhole, FileCheck, CalendarClock, PackagePlus, PackageCheck, PackageX, Warehouse, CalendarX } from 'lucide-react';

// Configuración visual por tipo de acción: ícono + etiqueta + color.
// Las eliminaciones van en rojo para que salten a la vista.
const ACCION_CFG: Record<AccionGlobal, { Icono: any; label: string; tono: 'teal' | 'amber' | 'red' }> = {
  programo_servicio: { Icono: CalendarPlus, label: 'Programó servicio', tono: 'teal' },
  aviso_servicio: { Icono: AlertTriangle, label: 'Avisó de un problema', tono: 'amber' },
  resolvio_aviso: { Icono: CalendarClock, label: 'Resolvió un aviso', tono: 'teal' },
  edito_servicio: { Icono: Pencil, label: 'Editó servicio', tono: 'amber' },
  reasigno_tecnicos: { Icono: Users, label: 'Reasignó técnicos', tono: 'amber' },
  amplio_proyecto: { Icono: Plus, label: 'Amplió proyecto', tono: 'teal' },
  reprogramo_dia: { Icono: CalendarClock, label: 'Reprogramó una fecha', tono: 'amber' },
  agrego_insumo: { Icono: PackagePlus, label: 'Agregó a la lista de carga', tono: 'amber' },
  solicito_insumo: { Icono: PackagePlus, label: 'Solicitó herramienta o material', tono: 'amber' },
  aprobo_insumo: { Icono: PackageCheck, label: 'Autorizó herramienta o material', tono: 'teal' },
  rechazo_insumo: { Icono: PackageX, label: 'Rechazó una solicitud', tono: 'red' },
  firmo_resguardo: { Icono: PackageCheck, label: 'Tomó resguardo de herramienta', tono: 'teal' },
  devolvio_herramienta: { Icono: PackageX, label: 'Devolvió herramienta', tono: 'amber' },
  recibio_herramienta: { Icono: Warehouse, label: 'Recibió en almacén', tono: 'teal' },
  elimino_servicio: { Icono: Trash2, label: 'Eliminó servicio', tono: 'red' },
  elimino_dia: { Icono: CalendarX, label: 'Eliminó un día del proyecto', tono: 'red' },
  elimino_reporte: { Icono: Trash2, label: 'Eliminó reporte', tono: 'red' },
  aprobo_revision: { Icono: BadgeCheck, label: 'Aprobó revisión final', tono: 'teal' },
  marco_finalizado: { Icono: Flag, label: 'Marcó servicio finalizado', tono: 'teal' },
  subio_factura: { Icono: Banknote, label: 'Subió factura', tono: 'teal' },
  marco_no_facturable: { Icono: AlertTriangle, label: 'Marcó no facturable', tono: 'amber' },
  solicito_correccion: { Icono: MessageSquareWarning, label: 'Pidió corregir un reporte', tono: 'amber' },
  habilito_correccion: { Icono: Unlock, label: 'Autorizó corregir un reporte', tono: 'amber' },
  cerro_correccion: { Icono: LockKeyhole, label: 'Cerró permiso de corrección', tono: 'teal' },
  aplico_correccion: { Icono: FileCheck, label: 'Aplicó una corrección', tono: 'teal' },
};

const TONO_CLS = {
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

function fmtDia(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(Date.now() - 864e5);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function EventosList({ userName }: { userName?: string }) {
  const [entradas, setEntradas] = useState<EntradaAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroActor, setFiltroActor] = useState('');
  const [filtroAccion, setFiltroAccion] = useState('');

  useEffect(() => {
    listarAuditoriaGlobal()
      .then(setEntradas)
      .catch((e) => setError(e?.message || 'No se pudieron cargar los eventos'))
      .finally(() => setLoading(false));
  }, []);

  const actores = useMemo(() => {
    const set = new Map<string, string>();
    entradas.forEach((e) => set.set(e.actor_id, nombre(e.profiles)));
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
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
      const dia = fmtDia(e.created_at);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.dia === dia) ultimo.items.push(e);
      else grupos.push({ dia, items: [e] });
    });
    return grupos;
  }, [filtradas]);

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto pb-28 lg:pb-16 lg:px-6">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <Logo variante="completo" size={32} className="min-w-0" compactoEnMovil />
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <LogoutButton compacto />
        </div>
      </div>

      <div className="px-4 pt-5">
        <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-4">Actividad del equipo</h1>
        {userName && <p className="text-[15px] text-muted font-medium mb-4 -mt-2.5">{userName}</p>}

        <DashboardTabs active="eventos" />

        <p className="text-[12.5px] text-muted mb-4">
          Registro de todas las acciones de los supervisores: servicios programados, ediciones, eliminaciones, revisiones y facturación. Las eliminaciones quedan aquí de forma permanente aunque el registro original ya no exista.
        </p>

        <div className="flex gap-2 mb-5">
          <select
            value={filtroActor}
            onChange={(e) => setFiltroActor(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13px]"
          >
            <option value="">Todos los supervisores</option>
            {actores.map(([id, n]) => (
              <option key={id} value={id}>{n}</option>
            ))}
          </select>
          <select
            value={filtroAccion}
            onChange={(e) => setFiltroAccion(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13px]"
          >
            <option value="">Todas las acciones</option>
            {Object.entries(ACCION_CFG).map(([k, cfg]) => (
              <option key={k} value={k}>{cfg.label}</option>
            ))}
          </select>
        </div>

        {loading && <p className="text-center text-muted py-10 text-sm">Cargando...</p>}
        {error && <p className="text-red text-sm mb-4">{error}</p>}
        {!loading && !error && filtradas.length === 0 && (
          <p className="text-center text-muted py-10 text-sm">
            {entradas.length === 0
              ? 'Todavía no hay eventos registrados — aparecerán conforme los supervisores programen, editen o eliminen registros.'
              : 'Sin resultados con esos filtros.'}
          </p>
        )}

        {porDia.map((g) => (
          <div key={g.dia} className="mb-6">
            <div className="text-[13.5px] font-semibold text-muted mb-2.5 capitalize">{g.dia}</div>
            <div className="flex flex-col gap-2.5">
              {g.items.map((e) => {
                const cfg = ACCION_CFG[e.accion] || { Icono: Pencil, label: e.accion, tono: 'amber' as const };
                const CfgIcono = cfg.Icono;
                return (
                  <div key={e.id} className={`rounded-xl bg-surface-2 border p-3.5 ${cfg.tono === 'red' ? 'border-red/25' : 'border-line'}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${TONO_CLS[cfg.tono]}`}>
                        <CfgIcono size={13} strokeWidth={2.6} />
                        {cfg.label}
                      </span>
                      <span className="text-[13px] font-semibold">{nombre(e.profiles)}</span>
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
    </div>
  );
}
