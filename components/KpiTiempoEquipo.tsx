'use client';

import { useEffect, useMemo, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { DiaAgenda } from '@/lib/serviciosProgramados';
import { ActividadEquipo, listarActividadesEquipo } from '@/lib/actividades';
import { hoyLocal, sumarDias, fechaLocal } from '@/lib/fechaHoy';
import { tiempoDelEquipo } from '@/lib/tiempoEquipo';
import { tipoActividad, COLOR_SERVICIO } from '@/lib/tiposActividad';
import { duracionTexto } from '@/lib/lineaDelDia';
import { Tarjeta } from '@/components/KpiOperativos';
import IconoTipo from '@/components/bitacora/IconoTipo';

// En qué se va el tiempo del equipo en los últimos 7 días: servicios
// programados contra lo registrado en bitácora (traslados, compras, oficina,
// capacitación, apoyos). Responde cuánto del tiempo no es trabajo en sitio.
// Solo aparece si hay algo que mostrar.
const DIAS = 7;

export default function KpiTiempoEquipo({ servicios }: { servicios: DiaAgenda[] }) {
  // «Hoy» se lee ya montado (Vercel corre en UTC).
  const [hoy, setHoy] = useState<string | null>(null);
  const [actividades, setActividades] = useState<ActividadEquipo[]>([]);

  useEffect(() => {
    const h = hoyLocal();
    setHoy(h);
    listarActividadesEquipo(fechaLocal(sumarDias(h, -(DIAS - 1))).toISOString()).then(setActividades).catch(() => {});
  }, []);

  const filas = useMemo(
    () => (hoy ? tiempoDelEquipo(servicios, actividades, sumarDias(hoy, -(DIAS - 1)), hoy, (iso) => hoyLocal(new Date(iso))) : []),
    [servicios, actividades, hoy],
  );
  const total = filas.reduce((n, f) => n + f.minutos, 0);
  if (!hoy || total === 0) return null;

  const enServicio = filas.find((f) => f.clase === 'servicio')?.minutos || 0;
  const nombre = (c: (typeof filas)[number]['clase']) => (c === 'servicio' ? 'Servicios programados' : tipoActividad(c).nombre);
  const color = (c: (typeof filas)[number]['clase']) => (c === 'servicio' ? COLOR_SERVICIO : tipoActividad(c).color);
  const sinConfirmar = actividades.filter((a) => a.cierre_automatico).length;

  return (
    <div className="mb-6">
      <h2 className="font-display font-semibold text-[15px] tracking-wide mb-3">En qué se va el tiempo · últimos {DIAS} días</h2>
      <Tarjeta titulo="Tiempo del equipo" Icono={Hourglass} color="text-teal"
        explicacion={
          <>
            Horas-persona de los últimos {DIAS} días. Los <b>servicios</b> cuentan de la llegada al cierre, sin
            pausas, por cada persona asignada. Lo demás sale de la <b>bitácora</b>: lo que el personal registró
            fuera de un servicio. No entran las actividades abiertas ni las que se cerraron solas sin confirmar
            la hora.
          </>
        }
      >
        <p className="flex items-baseline gap-2 mb-3">
          <span className="font-display font-bold text-[30px] leading-none tabular-nums">{Math.round((enServicio / total) * 100)}%</span>
          <span className="text-[12.5px] text-muted">en servicios · {duracionTexto(total)} registradas en total</span>
        </p>
        <div className="flex h-3.5 rounded-full overflow-hidden bg-surface-2 mb-3.5" role="img" aria-label="Reparto del tiempo por tipo">
          {filas.map((f) => (
            <span key={f.clase} title={`${nombre(f.clase)}: ${duracionTexto(f.minutos)}`} style={{ width: `${(f.minutos / total) * 100}%`, backgroundColor: color(f.clase) }} />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
          {filas.map((f) => (
            <div key={f.clase} className="flex items-center gap-2.5 text-[13px]">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0" style={{ backgroundColor: color(f.clase) }}>
                <IconoTipo tipo={f.clase} size={14} />
              </span>
              <span className="flex-1 min-w-0 truncate">{nombre(f.clase)}</span>
              <span className="font-semibold tabular-nums shrink-0">{duracionTexto(f.minutos)}</span>
              <span className="text-muted tabular-nums shrink-0 w-10 text-right">{Math.round((f.minutos / total) * 100)}%</span>
            </div>
          ))}
        </div>
        {sinConfirmar > 0 && (
          <p className="text-[12px] text-amber mt-3">{sinConfirmar} actividad{sinConfirmar > 1 ? 'es se cerraron solas' : ' se cerró sola'} y no cuenta{sinConfirmar > 1 ? 'n' : ''} hasta que su dueño confirme la hora.</p>
        )}
      </Tarjeta>
    </div>
  );
}
