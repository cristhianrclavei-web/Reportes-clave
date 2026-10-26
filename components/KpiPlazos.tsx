'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, CalendarX, AlertTriangle } from 'lucide-react';
import { DiaAgenda, listarProgresoPorGrupo, ProgresoTareas } from '@/lib/serviciosProgramados';
import { agruparPorProyecto, resumenPlazos, enRiesgo, PlazoProyecto } from '@/lib/plazosProyecto';
import { textoMotivo } from '@/lib/motivosServicio';
import { MUESTRA_MINIMA } from '@/lib/kpis';
import { hoyLocal, sumarDias } from '@/lib/fechaHoy';
import { Tarjeta } from '@/components/KpiOperativos';
import { ZonaGraficas, Punto, Crece, Contador, Medidor, InfoPunto, COLOR } from '@/components/Graficas';

// Plazo de los proyectos (lib/plazosProyecto.ts): cuántos terminan en los
// días cotizados, cuántos se alargan y por qué, y cuáles van en riesgo hoy.

const DIAS_PERIODO = 90;

function dias(n: number): string {
  return `${n} día${n === 1 ? '' : 's'}`;
}

export default function KpiPlazos({ servicios }: { servicios: DiaAgenda[] }) {
  // «Hoy» se lee después de montar (ver feedback de hidratación con fechas).
  const [hoy, setHoy] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<Record<string, ProgresoTareas>>({});
  useEffect(() => {
    setHoy(hoyLocal());
    // Sin el avance no se puede saber si va en riesgo; lo demás sí se muestra.
    listarProgresoPorGrupo().then(setProgreso).catch(() => setProgreso({}));
  }, []);

  const proyectos = useMemo(() => agruparPorProyecto(servicios), [servicios]);
  const resumen = useMemo(
    () => (hoy ? resumenPlazos(proyectos, sumarDias(hoy, -DIAS_PERIODO), hoy) : null),
    [proyectos, hoy],
  );
  // A dónde lleva cada proyecto: su primer día que no esté cancelado.
  const primerDia = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const s of servicios) if (s.estado !== 'cancelado' && !mapa[s.grupo_id]) mapa[s.grupo_id] = s.id;
    return mapa;
  }, [servicios]);
  const enRiesgoHoy = useMemo(
    () => proyectos.filter((p) => {
      const avance = progreso[p.grupoId];
      return enRiesgo(p, avance && avance.total > 0 ? avance.pct : null) || Boolean(p.faltaAmpliar);
    }),
    [proyectos, progreso],
  );

  if (!hoy || !resumen) return null;

  const hayDatos = resumen.terminados > 0;
  const aTiempo = resumen.aTiempo + resumen.antes;
  const maxMotivo = Math.max(1, ...resumen.motivos.map((m) => m.dias));

  return (
    <ZonaGraficas className="mb-6">
      <h2 className="font-display font-semibold text-[15px] tracking-wide mb-3">
        Plazo de proyectos <span className="text-muted font-normal text-[12.5px]">· terminados en los últimos {DIAS_PERIODO} días</span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* 1. A tiempo contra desfasados */}
        <Tarjeta titulo="Terminan en los días cotizados" Icono={CalendarCheck} color="text-teal"
          explicacion={
            <>
              Cada proyecto o servicio terminado se compara con los días con los que se programó.
              <b> A tiempo</b>: no necesitó días extra (o terminó antes). <b>Desfase ajeno</b>: todos
              los días extra fueron por causas que no dependen del equipo (permisos, clima, el
              cliente agregó trabajo, se cotizaron menos días). <b>Desfase del equipo</b>: al menos
              un día extra fue por retrabajo, olvido de herramienta u otra causa propia. El
              porcentaje grande no cuenta los desfases ajenos; abajo está el que cuenta todo. Los
              proyectos programados antes de esta medición salen como «sin medir».
            </>
          }
        >
          {!hayDatos ? (
            <>
              <p className="text-[13px] text-muted">
                Todavía no termina ningún proyecto medido. Se empiezan a contar los que se programen desde ahora.
              </p>
              {resumen.sinMedir > 0 && <p className="text-[11px] text-faint mt-1.5">{resumen.sinMedir} terminado(s) sin medir (programados antes).</p>}
            </>
          ) : (
            <>
              <div className="flex items-center gap-4 flex-wrap">
                {resumen.cumplimientoPct !== null && (
                  <Medidor pct={resumen.cumplimientoPct}
                    info={
                      <InfoPunto titulo="Cumplimiento de plazos"
                        filas={[
                          { color: COLOR.acento, texto: 'A tiempo', valor: aTiempo },
                          { color: COLOR.rojo, texto: 'Desfase del equipo', valor: resumen.desfasePropio },
                          { color: COLOR.ambar, texto: 'Desfase ajeno (no cuenta)', valor: resumen.desfaseExterno },
                        ]}
                        nota="A tiempo entre a tiempo más desfases del equipo." />
                    } />
                )}
                <div className="min-w-0 flex-1 flex flex-col gap-1 text-[12.5px]">
                  {([
                    ['A tiempo', aTiempo, 'bg-teal'],
                    ['Desfase ajeno', resumen.desfaseExterno, 'bg-amber'],
                    ['Desfase del equipo', resumen.desfasePropio, 'bg-red'],
                  ] as const).map(([texto, n, color]) => (
                    <div key={texto} className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-[3px] shrink-0 ${color}`} />
                      <span className="text-ink/85 flex-1 min-w-0 truncate">{texto}</span>
                      <span className="font-semibold tabular-nums shrink-0">{n}</span>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted mt-1">
                    Contando todo: {Math.round(resumen.aTiempoPct ?? 0)}% a tiempo de {resumen.terminados}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3.5 text-center">
                {([
                  ['Días extra del equipo', resumen.diasExtraPropios, 'text-red'],
                  ['Días extra ajenos', resumen.diasExtraExternos, 'text-amber'],
                  ['Terminaron antes', resumen.antes, 'text-teal'],
                ] as const).map(([etiqueta, n, color]) => (
                  <div key={etiqueta} className="rounded-xl bg-surface-2/60 px-2 py-2">
                    <p className={`font-display font-bold text-[18px] tabular-nums ${color}`}><Contador valor={n} /></p>
                    <p className="text-[10.5px] text-muted leading-tight mt-0.5">{etiqueta}</p>
                  </div>
                ))}
              </div>
              {resumen.terminados < MUESTRA_MINIMA && <p className="text-[11px] text-amber mt-1.5">Pocos datos aún · {resumen.terminados} proyecto(s)</p>}
            </>
          )}
        </Tarjeta>

        {/* 2. Por qué se alargan */}
        <Tarjeta titulo="Por qué se agregan días" Icono={CalendarX} color="text-amber"
          explicacion={
            <>
              Días extra de los proyectos terminados, según el motivo que se eligió al ampliarlos.
              Los del equipo son los que se pueden corregir (retrabajos, olvidos, falta de
              material); los ajenos ayudan a cotizar mejor y a negociar con el cliente. Un día
              agregado sin motivo cuenta como del equipo.
            </>
          }
        >
          {resumen.motivos.length === 0 ? (
            <p className="text-[13px] text-muted">{hayDatos ? 'Ningún proyecto necesitó días extra.' : 'Sin datos todavía.'}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {resumen.motivos.map((m, i) => (
                <Punto key={m.clave} grupo="motivos-plazo" etiqueta={`${m.texto}: ${dias(m.dias)}`}
                  info={
                    <InfoPunto titulo={m.texto}
                      filas={[{ color: m.origen === 'propio' ? COLOR.rojo : COLOR.ambar, texto: 'Días extra', valor: m.dias }]}
                      nota={m.origen === 'propio' ? 'Del equipo: cuenta en contra.' : 'Ajeno al equipo: no cuenta en contra.'} />
                  }>
                  {(activo, otro) => (
                    <div className={`transition-opacity duration-200 ${otro ? 'opacity-55' : ''}`}>
                      <div className="flex items-baseline gap-2 text-[12.5px]">
                        <span className={`flex-1 min-w-0 truncate ${activo ? 'font-semibold' : ''}`}>{m.texto}</span>
                        <span className="font-semibold tabular-nums shrink-0">{dias(m.dias)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1" data-ancla="">
                        <Crece orden={i} pct={(m.dias / maxMotivo) * 100}
                          className={`h-full rounded-full ${m.origen === 'propio' ? 'bg-red' : 'bg-amber'}`} />
                      </div>
                    </div>
                  )}
                </Punto>
              ))}
            </div>
          )}
          {resumen.desfasados.length > 0 && (
            <div className="mt-4 pt-3 border-t border-line">
              <p className="text-[10.5px] uppercase tracking-wider text-muted mb-1.5">Más desfasados</p>
              {resumen.desfasados.slice(0, 4).map((p) => (
                <FilaProyecto key={p.grupoId} p={p} href={primerDia[p.grupoId]}
                  detalle={`+${dias(p.extra)} sobre ${p.planeados}`} tono={p.extraPropios > 0 ? 'text-red' : 'text-amber'} />
              ))}
            </div>
          )}
        </Tarjeta>

        {/* 3. Adelantarse */}
        <Tarjeta titulo="En riesgo ahora" Icono={AlertTriangle} color="text-red"
          explicacion={
            <>
              Proyectos en curso que probablemente no alcancen sus días cotizados: el avance de
              las tareas va más de 20 puntos atrás de los días ya trabajados, o el último día
              programado cerró sin terminar. Ampliarlos a tiempo evita que el personal y el
              cliente se enteren el último día.
            </>
          }
        >
          {enRiesgoHoy.length === 0 ? (
            <p className="text-[13px] text-muted">Ninguno. Los proyectos en curso van al paso de sus días cotizados.</p>
          ) : (
            <div className="flex flex-col">
              {enRiesgoHoy.slice(0, 6).map((p) => {
                const avance = progreso[p.grupoId];
                const detalle = p.faltaAmpliar
                  ? `Sin días: ${p.faltaAmpliar.motivo ? textoMotivo(p.faltaAmpliar.motivo).toLowerCase() : 'quedó pendiente'}`
                  : `${avance?.pct ?? 0}% en ${p.concluidos} de ${p.planeados} días`;
                return <FilaProyecto key={p.grupoId} p={p} href={p.faltaAmpliar?.diaId || primerDia[p.grupoId]} detalle={detalle} tono="text-red" />;
              })}
            </div>
          )}
        </Tarjeta>
      </div>
    </ZonaGraficas>
  );
}

function FilaProyecto({ p, href, detalle, tono }: { p: PlazoProyecto; href?: string; detalle: string; tono: string }) {
  const contenido = (
    <>
      <span className="flex-1 min-w-0 truncate">{p.proyecto}</span>
      <span className={`shrink-0 font-semibold ${tono}`}>{detalle}</span>
    </>
  );
  if (!href) return <div className="flex items-baseline gap-2 text-[12.5px] py-1.5">{contenido}</div>;
  return (
    <Link href={`/dashboard/servicios/${href}`} className="flex items-baseline gap-2 text-[12.5px] py-1.5 border-t border-line first:border-t-0 hover:text-teal">
      {contenido}
    </Link>
  );
}
