'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Hourglass } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { hoyLocal, sumarDias } from '@/lib/fechaHoy';
import { ClaseTiempo } from '@/lib/jornada';
import { DatosJornadas, cargarDatosJornadas, resumenDeJornadas, sumarMinutos, estadisticasJornada } from '@/lib/jornadaDatos';
import { duracionTexto } from '@/lib/lineaDelDia';
import { Tarjeta } from '@/components/KpiOperativos';
import { RepartoTiempo } from '@/components/bitacora/JornadaDia';
import { AvatarTecnico } from '@/components/AvatarTecnico';

// Resumen (tablero del supervisor): en qué se fue la jornada del equipo en
// los últimos 7 días, con promedios por técnico al día y una tabla por
// persona. Mismo cálculo que Personal → Jornadas (lib/jornada.ts): cada
// minuto cuenta una vez y lo no registrado dentro del horario se ve aparte.
const DIAS = 7;

export default function ResumenJornadas() {
  const [hoy, setHoy] = useState<string | null>(null);
  const [ahora, setAhora] = useState(0);
  const [tecnicos, setTecnicos] = useState<{ id: string; full_name: string }[]>([]);
  const [datos, setDatos] = useState<DatosJornadas | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fecha y hora se leen ya montado (el servidor está en UTC).
    const h = hoyLocal();
    setHoy(h);
    setAhora(Date.now());
    createClient().from('profiles').select('id, full_name').eq('role', 'tecnico').eq('activo', true).order('full_name')
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        setTecnicos(data || []);
      });
    cargarDatosJornadas(sumarDias(h, -(DIAS - 1)), h)
      .then(setDatos)
      .catch((e) => setError(e?.message || 'revisa tu conexión'));
  }, []);

  const resumen = useMemo(() => {
    if (!datos || !hoy || tecnicos.length === 0) return [];
    const fechas = Array.from({ length: DIAS }, (_, i) => sumarDias(hoy, i - (DIAS - 1)));
    return resumenDeJornadas(datos, tecnicos.map((t) => t.id), fechas, ahora);
  }, [datos, hoy, tecnicos, ahora]);

  if (error) {
    return (
      <div className="mb-6 p-4 rounded-2xl bg-red/10 border border-red/30">
        <p className="text-red text-sm font-medium">No se pudieron cargar las jornadas del equipo.</p>
        <p className="text-red/80 text-xs mt-1">{error}</p>
      </div>
    );
  }
  if (!datos || resumen.length === 0) return null;

  const equipo = resumen.reduce((acc, r) => sumarMinutos(acc, r.porClase), {} as Partial<Record<ClaseTiempo, number>>);
  const diasEquipo = resumen.reduce((n, r) => n + r.dias.length, 0);
  const e = estadisticasJornada(equipo, diasEquipo);
  if (e.total === 0) return null;

  const nombre = new Map(tecnicos.map((t) => [t.id, t.full_name]));
  const filas = resumen
    .filter((r) => r.dias.length > 0)
    .map((r) => ({ r, est: estadisticasJornada(r.porClase, r.dias.length) }))
    .sort((a, b) => b.est.pct('sin_registrar') - a.est.pct('sin_registrar') || (nombre.get(a.r.tecnicoId) || '').localeCompare(nombre.get(b.r.tecnicoId) || ''));

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="flex-1 font-display font-semibold text-[15px] tracking-wide">Jornadas · últimos {DIAS} días</h2>
        <Link href="/dashboard/personal?sub=jornadas" className="shrink-0 text-[12.5px] font-semibold text-teal flex items-center gap-0.5">
          Ver detalle <ChevronRight size={15} strokeWidth={2.4} />
        </Link>
      </div>
      <Tarjeta
        titulo="En qué se va el tiempo"
        Icono={Hourglass}
        color="text-teal"
        explicacion={
          <>
            Cada día cuenta de la hora de entrada a la de salida de la jornada (o desde antes o hasta después si se
            registró algo fuera de ese horario). <b>Trabajo en servicio</b> es de la llegada al cierre, sin comida, pausas
            ni lo registrado en bitácora a esa hora. Cada minuto cuenta una sola vez. <b>Sin registrar</b> son los tramos
            de la jornada sin servicio ni actividad. Los promedios son por técnico y por día con registros.
          </>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
          {([
            ['Jornada registrada', `${100 - e.pct('sin_registrar')}%`, `${duracionTexto(e.registrado)} en total`, 'text-teal'],
            ['Trabajo en servicio', `${e.pct('servicio')}%`, `${duracionTexto(e.servicioPorDia)} por técnico al día`, 'text-ink'],
            ['Registrado por día', duracionTexto(e.registradoPorDia), 'promedio por técnico', 'text-ink'],
            ['Sin registrar', `${e.pct('sin_registrar')}%`, `${duracionTexto(e.sinRegistrarPorDia)} por técnico al día`, e.pct('sin_registrar') >= 15 ? 'text-amber' : 'text-muted'],
          ] as const).map(([rotulo, valor, nota, color]) => (
            <div key={rotulo} className="rounded-xl bg-surface-2/70 px-3 py-2.5">
              <span className="block text-[11px] uppercase tracking-wider text-muted">{rotulo}</span>
              <span className={`block font-display font-bold text-[22px] tabular-nums leading-tight ${color}`}>{valor}</span>
              <span className="block text-[12px] text-muted">{nota}</span>
            </div>
          ))}
        </div>

        <RepartoTiempo porClase={equipo} />

        {/* Por técnico */}
        <div className="mt-5 overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-muted text-left">
                <th className="font-semibold py-2 pr-2">Técnico</th>
                <th className="font-semibold py-2 px-2 text-right">Días</th>
                <th className="font-semibold py-2 px-2 text-right">Registrado/día</th>
                <th className="font-semibold py-2 px-2 text-right">Servicio</th>
                <th className="font-semibold py-2 px-2 text-right">Traslado</th>
                <th className="font-semibold py-2 px-2 text-right">Compra</th>
                <th className="font-semibold py-2 pl-2 text-right">Sin registrar</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ r, est }) => (
                <tr key={r.tecnicoId} className="border-t border-line">
                  <td className="py-2 pr-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <AvatarTecnico nombre={nombre.get(r.tecnicoId) || ''} id={r.tecnicoId} size={26} />
                      <span className="min-w-0">
                        <span className="block font-semibold truncate">{nombre.get(r.tecnicoId)}</span>
                        <span className="block w-[140px] mt-1"><RepartoTiempo porClase={r.porClase} compacta /></span>
                      </span>
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{r.dias.length}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-semibold">{duracionTexto(est.registradoPorDia)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{est.pct('servicio')}%</td>
                  <td className="py-2 px-2 text-right tabular-nums">{est.pct('traslado')}%</td>
                  <td className="py-2 px-2 text-right tabular-nums">{est.pct('compra')}%</td>
                  <td className={`py-2 pl-2 text-right tabular-nums font-semibold ${est.pct('sin_registrar') >= 15 ? 'text-amber' : 'text-muted'}`}>{est.pct('sin_registrar')}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {resumen.some((r) => r.diasSinRegistros > 0) && (
          <p className="text-[12px] text-muted mt-2">
            No se cuentan los días hábiles sin ningún registro (vacaciones o faltas): {resumen.filter((r) => r.diasSinRegistros > 0).length} técnico(s) tuvieron alguno.
          </p>
        )}
      </Tarjeta>
    </div>
  );
}
