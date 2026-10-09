'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Check, Clock, Plus, AlertTriangle, CalendarDays, Users, FileText, Ban } from 'lucide-react';
import { Servicio } from '@/lib/serviciosProgramados';
import { Festivo, festivoDe } from '@/lib/avisos';
import { hoyLocal } from '@/lib/fechaHoy';
import { debeReporte } from '@/lib/visitaSinTrabajo';
import {
  MESES, DIAS_CORTOS, semanasDelMes, moverMes, resumenPorDia, fechaLargaCalendario,
} from '@/lib/calendarioMes';

// Calendario mensual de servicios con el detalle del día al lado.
//   · Rejilla del mes: hoy resaltado y puntos por día (hecho, por venir,
//     vencido). Al cambiar de mes la rejilla se desliza.
//   · Panel del día elegido: «Hecho» y «Por venir», cada servicio con su
//     hora, su gente y su estado, y de ahí al servicio.
// Lo usan la Agenda del supervisor (todos los servicios, con «Programar») y
// Servicios del técnico (los suyos). En celular el panel va debajo.
//
// «Hoy» se lee ya montado (lib/fechaHoy): en el servidor no hay reloj local.

type ServicioMes = Servicio & { tecnicos?: string[] };

const ESTADO: Record<Servicio['estado'], { label: string; cls: string }> = {
  programado: { label: 'Programado', cls: 'bg-surface-2 text-muted' },
  en_sitio: { label: 'En sitio', cls: 'bg-amber/15 text-amber' },
  en_curso: { label: 'En curso', cls: 'bg-teal/15 text-teal' },
  concluido: { label: 'Concluido', cls: 'bg-teal/15 text-teal' },
  cancelado: { label: 'Cancelado', cls: 'bg-surface-2 text-faint' },
};

function hora(s: ServicioMes): string | null {
  const h = (s as any).hora_programada as string | null | undefined;
  return h ? h.slice(0, 5) : null;
}

function Renglon({ s, href, hecho, vencido }: { s: ServicioMes; href: string; hecho: boolean; vencido: boolean }) {
  const h = hora(s);
  const sinReporte = hecho && debeReporte(s);
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 transition-all duration-150 hover:border-teal/45 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]"
    >
      <span className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${hecho ? 'bg-teal text-inkOnAccent' : vencido ? 'bg-red/15 text-red' : 'bg-surface-2 text-muted border border-line'}`}>
        {hecho ? <Check size={14} strokeWidth={3} /> : vencido ? <AlertTriangle size={13} strokeWidth={2.6} /> : <Clock size={13} strokeWidth={2.4} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-snug truncate transition-colors group-hover:text-teal">
          {s.proyecto}{s.dias_totales > 1 ? ` · día ${s.numero_dia}/${s.dias_totales}` : ''}
        </span>
        <span className="block text-[12.5px] text-muted truncate mt-0.5">
          {h ? `${h} hrs` : 'Sin hora'}
          {s.tecnicos && s.tecnicos.length > 0 ? ` · ${s.tecnicos.join(', ')}` : ''}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {!hecho && (
            <span className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full ${vencido ? 'bg-red/12 text-red' : ESTADO[s.estado].cls}`}>
              {vencido ? 'Sin concluir' : ESTADO[s.estado].label}
            </span>
          )}
          {hecho && s.visita_estado && (
            <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-amber/15 text-amber flex items-center gap-1"><Ban size={11} strokeWidth={2.6} />Visita sin trabajo</span>
          )}
          {hecho && s.report_id && (
            <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-teal/12 text-teal flex items-center gap-1"><FileText size={11} strokeWidth={2.6} />Con reporte</span>
          )}
          {sinReporte && <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-red/12 text-red">Falta reporte</span>}
        </span>
      </span>
      <ChevronRight size={16} strokeWidth={2.3} className="mt-1 shrink-0 text-faint transition-all group-hover:text-teal group-hover:translate-x-0.5" />
    </Link>
  );
}

export default function CalendarioMes({
  servicios, festivos = [], hrefServicio, hrefProgramar, cargando = false,
}: {
  servicios: ServicioMes[];
  festivos?: Festivo[];
  hrefServicio: (s: ServicioMes) => string;
  // Solo quien programa: enlace para agendar en el día elegido.
  hrefProgramar?: (fecha: string) => string;
  cargando?: boolean;
}) {
  const [hoy, setHoy] = useState<string | null>(null);
  const [mesVisto, setMesVisto] = useState<{ anio: number; mes: number } | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  // +1 al avanzar de mes, −1 al regresar: hacia dónde se desliza la rejilla.
  const [direccion, setDireccion] = useState(1);

  useEffect(() => {
    const h = hoyLocal();
    setHoy(h);
    setElegido(h);
    const [y, m] = h.split('-').map(Number);
    setMesVisto({ anio: y, mes: m - 1 });
  }, []);

  const resumen = useMemo(() => (hoy ? resumenPorDia(servicios, hoy) : {}), [servicios, hoy]);
  const semanas = useMemo(() => (mesVisto ? semanasDelMes(mesVisto.anio, mesVisto.mes) : []), [mesVisto]);

  const delDia = useMemo(() => {
    if (!elegido || !hoy) return { hechos: [], porVenir: [], cancelados: [] as ServicioMes[] };
    const lista = servicios
      .filter((s) => s.fecha === elegido)
      .sort((a, b) => (hora(a) || '99').localeCompare(hora(b) || '99') || a.proyecto.localeCompare(b.proyecto, 'es'));
    return {
      hechos: lista.filter((s) => s.estado === 'concluido'),
      porVenir: lista.filter((s) => s.estado !== 'concluido' && s.estado !== 'cancelado'),
      cancelados: lista.filter((s) => s.estado === 'cancelado'),
    };
  }, [servicios, elegido, hoy]);

  if (!hoy || !mesVisto || !elegido) {
    return <div className="rounded-3xl bg-surface border border-line h-[460px] animate-pulse" aria-busy="true" />;
  }

  function cambiarMes(pasos: number) {
    setDireccion(pasos);
    setMesVisto((m) => (m ? moverMes(m.anio, m.mes, pasos) : m));
  }
  function irAHoy() {
    const [y, m] = hoy!.split('-').map(Number);
    setDireccion(y * 12 + (m - 1) >= mesVisto!.anio * 12 + mesVisto!.mes ? 1 : -1);
    setMesVisto({ anio: y, mes: m - 1 });
    setElegido(hoy);
  }
  function elegir(fecha: string, delMes: boolean) {
    setElegido(fecha);
    if (!delMes) {
      const [y, m] = fecha.split('-').map(Number);
      setDireccion(fecha < `${mesVisto!.anio}-${String(mesVisto!.mes + 1).padStart(2, '0')}-01` ? -1 : 1);
      setMesVisto({ anio: y, mes: m - 1 });
    }
  }

  const festivoElegido = festivoDe(elegido, festivos);
  const pasado = elegido < hoy;
  const totalDia = delDia.hechos.length + delDia.porVenir.length + delDia.cancelados.length;
  const enMesActual = hoy.startsWith(`${mesVisto.anio}-${String(mesVisto.mes + 1).padStart(2, '0')}`);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-5 lg:items-start">
      {/* ---------- Mes ---------- */}
      <div className="rounded-3xl bg-surface border border-line p-3.5 sm:p-5 overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <div className="min-w-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.h2
                key={`${mesVisto.anio}-${mesVisto.mes}`}
                initial={{ opacity: 0, y: direccion * 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -direccion * 8 }}
                transition={{ duration: 0.16 }}
                className="font-display font-bold text-[22px] lg:text-[26px] tracking-wide leading-none"
              >
                {MESES[mesVisto.mes]} <span className="text-muted font-semibold">{mesVisto.anio}</span>
              </motion.h2>
            </AnimatePresence>
          </div>
          {!enMesActual && (
            <button type="button" onClick={irAHoy} className="shrink-0 h-10 px-3.5 rounded-full border border-teal/45 bg-teal/10 text-teal text-[13px] font-semibold active:scale-95 transition-transform">
              Hoy
            </button>
          )}
          <button type="button" onClick={() => cambiarMes(-1)} aria-label="Mes anterior" className="shrink-0 w-10 h-10 rounded-full border border-line bg-surface-2 flex items-center justify-center hover:border-line-strong active:scale-90 transition">
            <ChevronLeft size={19} strokeWidth={2.4} />
          </button>
          <button type="button" onClick={() => cambiarMes(1)} aria-label="Mes siguiente" className="shrink-0 w-10 h-10 rounded-full border border-line bg-surface-2 flex items-center justify-center hover:border-line-strong active:scale-90 transition">
            <ChevronRight size={19} strokeWidth={2.4} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
          {DIAS_CORTOS.map((d, i) => (
            <div key={d} className={`text-center text-[11px] font-semibold uppercase tracking-wider py-1 ${i > 4 ? 'text-faint' : 'text-muted'}`}>{d}</div>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${mesVisto.anio}-${mesVisto.mes}`}
            initial={{ opacity: 0, x: direccion * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -direccion * 28 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="grid grid-cols-7 gap-1 sm:gap-1.5"
            role="grid"
            aria-label={`${MESES[mesVisto.mes]} ${mesVisto.anio}`}
          >
            {semanas.flat().map((c) => {
              const r = resumen[c.fecha];
              const esHoy = c.fecha === hoy;
              const sel = c.fecha === elegido;
              const festivo = festivoDe(c.fecha, festivos);
              const total = r ? r.hechos + r.porVenir + r.vencidos : 0;
              return (
                <button
                  key={c.fecha}
                  type="button"
                  role="gridcell"
                  aria-selected={sel}
                  aria-label={`${fechaLargaCalendario(c.fecha)}${total ? `, ${total} servicio${total > 1 ? 's' : ''}` : ''}${festivo ? `, ${festivo.nombre}` : ''}`}
                  onClick={() => elegir(c.fecha, c.delMes)}
                  className={`relative min-h-[52px] sm:min-h-[66px] lg:min-h-[86px] rounded-xl sm:rounded-2xl border p-1.5 sm:p-2 flex flex-col items-center lg:items-start text-left transition-all duration-150 active:scale-95 ${
                    sel
                      ? 'border-teal bg-teal/12 shadow-glow-teal'
                      : esHoy
                        ? 'border-teal/50 bg-surface-2'
                        : 'border-transparent bg-surface-2/60 hover:border-line-strong'
                  } ${c.delMes ? '' : 'opacity-40'}`}
                >
                  <span className={`text-[13.5px] sm:text-[14.5px] font-display font-bold tabular-nums leading-none w-7 h-7 flex items-center justify-center rounded-full ${
                    esHoy ? 'bg-teal text-inkOnAccent' : sel ? 'text-teal' : ''
                  }`}>
                    {c.dia}
                  </span>
                  {festivo && (
                    <span className="hidden lg:block text-[10.5px] text-amber font-semibold truncate max-w-full mt-0.5">{festivo.nombre}</span>
                  )}
                  {festivo && <span className="lg:hidden absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber" aria-hidden="true" />}
                  {r && total > 0 && (
                    <span className="mt-auto flex items-center gap-1 pt-1">
                      {r.vencidos > 0 && <span className="w-2 h-2 rounded-full bg-red" aria-hidden="true" />}
                      {r.porVenir > 0 && <span className="w-2 h-2 rounded-full bg-amber" aria-hidden="true" />}
                      {r.hechos > 0 && <span className="w-2 h-2 rounded-full bg-teal" aria-hidden="true" />}
                      <span className="hidden sm:inline text-[11px] font-semibold text-muted tabular-nums ml-0.5">{total}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-[12px] text-muted">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal" />Hecho</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber" />Por venir</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red" />Sin concluir</span>
          {cargando && <span className="ml-auto">Actualizando…</span>}
        </div>
      </div>

      {/* ---------- Día elegido ---------- */}
      <div className="mt-4 lg:mt-0 lg:sticky lg:top-6 rounded-3xl bg-surface border border-line p-4 sm:p-5 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={elegido}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="flex items-start gap-3 mb-4">
              <span className="shrink-0 w-[52px] h-[56px] rounded-2xl bg-teal/12 border border-teal/30 flex flex-col items-center justify-center leading-none">
                <span className="font-display font-bold text-[21px] text-teal tabular-nums">{Number(elegido.slice(8, 10))}</span>
                <span className="text-[10px] uppercase tracking-wider text-teal/80 mt-1">{MESES[Number(elegido.slice(5, 7)) - 1].slice(0, 3)}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-[18px] tracking-wide leading-tight first-letter:uppercase">{fechaLargaCalendario(elegido)}</p>
                <p className="text-[13px] text-muted mt-0.5">
                  {elegido === hoy ? 'Hoy · ' : ''}
                  {totalDia === 0 ? 'Sin servicios' : `${totalDia} servicio${totalDia > 1 ? 's' : ''}`}
                </p>
                {festivoElegido && (
                  <p className="text-[12.5px] text-amber font-semibold mt-1 flex items-center gap-1.5">
                    <CalendarDays size={13} strokeWidth={2.5} />
                    {festivoElegido.nombre}
                  </p>
                )}
              </div>
            </div>

            {hrefProgramar && !pasado && (
              <Link
                href={hrefProgramar(elegido)}
                className="mb-4 w-full min-h-[46px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[14.5px] tracking-wide shadow-glow-teal flex items-center justify-center gap-2 transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
              >
                <Plus size={18} strokeWidth={2.6} />
                Programar servicio este día
              </Link>
            )}

            {totalDia === 0 && (
              <div className="rounded-2xl border border-dashed border-line-strong px-4 py-7 text-center">
                <p className="text-[14px] font-medium">Nada programado este día</p>
                <p className="text-[12.5px] text-muted mt-1">{pasado ? 'No hubo servicios.' : hrefProgramar ? 'Puedes agendar uno desde aquí.' : 'Tu supervisor no ha programado nada.'}</p>
              </div>
            )}

            {delDia.porVenir.length > 0 && (
              <section className="mb-4">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted mb-2 flex items-center gap-2">
                  {pasado ? 'Sin concluir' : 'Por venir'}
                  <span className="text-faint tabular-nums">{delDia.porVenir.length}</span>
                </p>
                <div className="flex flex-col gap-2">
                  {delDia.porVenir.map((s) => <Renglon key={s.id} s={s} href={hrefServicio(s)} hecho={false} vencido={pasado} />)}
                </div>
              </section>
            )}

            {delDia.hechos.length > 0 && (
              <section className="mb-4">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted mb-2 flex items-center gap-2">
                  Hecho
                  <span className="text-faint tabular-nums">{delDia.hechos.length}</span>
                </p>
                <div className="flex flex-col gap-2">
                  {delDia.hechos.map((s) => <Renglon key={s.id} s={s} href={hrefServicio(s)} hecho vencido={false} />)}
                </div>
              </section>
            )}

            {delDia.cancelados.length > 0 && (
              <section className="mb-4">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted mb-2">Cancelados · {delDia.cancelados.length}</p>
                <div className="flex flex-col gap-1.5">
                  {delDia.cancelados.map((s) => (
                    <Link key={s.id} href={hrefServicio(s)} className="text-[13px] text-faint line-through truncate hover:text-muted">{s.proyecto}</Link>
                  ))}
                </div>
              </section>
            )}

            {delDia.porVenir.length > 0 && delDia.porVenir.some((s) => s.tecnicos && s.tecnicos.length === 0) && (
              <p className="text-[12px] text-amber mt-3 flex items-center gap-1.5"><Users size={13} strokeWidth={2.4} />Hay servicios sin personal asignado.</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
