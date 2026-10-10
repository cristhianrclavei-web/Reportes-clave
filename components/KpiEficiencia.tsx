'use client';

import { useEffect, useMemo, useState } from 'react';
import { Gauge, MessageSquareWarning, Users, Ban } from 'lucide-react';
import { DiaAgenda } from '@/lib/serviciosProgramados';
import {
  resumenEficiencia, eficienciaPorSemana, motivosFrecuentes, eficienciaPorGrupo, visitasEnFalso, lunesDe, MARGEN_MIN,
  Conteo, FilaGrupo,
} from '@/lib/eficiencia';
import { formatMinutos, MUESTRA_MINIMA } from '@/lib/kpis';
import { hoyLocal } from '@/lib/fechaHoy';
import { Tarjeta } from '@/components/KpiOperativos';
import { ZonaGraficas, Punto, Crece, Contador, Medidor, InfoPunto, COLOR } from '@/components/Graficas';

// Eficiencia de servicios: de cada día concluido, si salió a favor, en contra
// o se desvió por una causa externa (lib/eficiencia.ts). Solo cuenta lo que el
// técnico ya respondió al cerrar; lo anterior aparece como «sin clasificar».

const SEMANAS = 8;

const TONOS = [
  { clave: 'positivas', texto: 'A favor', color: 'bg-teal', css: COLOR.acento },
  { clave: 'neutras', texto: 'Causa externa', color: 'bg-amber', css: COLOR.ambar },
  { clave: 'negativas', texto: 'En contra', color: 'bg-red', css: COLOR.rojo },
  { clave: 'sinClasificar', texto: 'Sin clasificar', color: 'bg-line-strong/70', css: COLOR.gris },
] as const;

function total(c: Conteo): number {
  return c.positivas + c.neutras + c.negativas + c.sinClasificar;
}

// Barra horizontal partida en los cuatro tonos.
function BarraReparto({ c, className = '' }: { c: Conteo; className?: string }) {
  const t = total(c);
  return (
    <div className={`flex h-2 rounded-full overflow-hidden bg-surface-2 ${className}`} aria-hidden="true">
      {t > 0 && TONOS.map((tono) => (c[tono.clave] > 0
        ? <span key={tono.clave} className={tono.color} style={{ width: `${(c[tono.clave] / t) * 100}%` }} />
        : null))}
    </div>
  );
}

function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)}%`;
}

function TablaGrupos({ filas }: { filas: FilaGrupo[] }) {
  if (filas.length === 0) return <p className="text-[13px] text-muted">Sin servicios clasificados en el periodo.</p>;
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-[12.5px] min-w-[460px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-muted text-right">
            <th className="text-left font-medium pb-2">Nombre</th>
            <th className="font-medium pb-2 pl-2">Días</th>
            <th className="font-medium pb-2 pl-2">Cumple</th>
            <th className="font-medium pb-2 pl-2">Puntual</th>
            <th className="font-medium pb-2 pl-2">Terminó</th>
            <th className="font-medium pb-2 pl-2">Tiempo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.nombre} className="border-t border-line text-right tabular-nums transition-colors hover:bg-surface-2/60">
              <td className="text-left py-2 pr-2 max-w-[150px]">
                <span className="block truncate font-medium">{f.nombre}</span>
                <BarraReparto c={f} className="mt-1 h-1.5" />
              </td>
              <td className={`pl-2 ${f.n < MUESTRA_MINIMA ? 'text-amber' : ''}`}>{f.n}</td>
              <td className="pl-2 font-semibold">{pct(f.cumplimientoPct)}</td>
              <td className="pl-2">{pct(f.puntualidadPct)}</td>
              <td className="pl-2">{pct(f.terminadosPct)}</td>
              <td className={`pl-2 whitespace-nowrap ${f.minutosNetos > 0 ? 'text-teal' : f.minutosNetos < 0 ? 'text-red' : 'text-muted'}`}>
                {f.minutosNetos === 0 ? '0 min' : `${f.minutosNetos > 0 ? '+' : '−'}${formatMinutos(Math.abs(f.minutosNetos))}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function KpiEficiencia({ servicios }: { servicios: DiaAgenda[] }) {
  // «Hoy» se lee después de montar: en el render daría una fecha en el
  // servidor (UTC) y otra en el navegador.
  const [hoy, setHoy] = useState<string | null>(null);
  useEffect(() => { setHoy(hoyLocal()); }, []);
  const [agrupar, setAgrupar] = useState<'tecnico' | 'cliente'>('tecnico');

  const semanas = useMemo(() => (hoy ? eficienciaPorSemana(servicios, hoy, SEMANAS) : []), [servicios, hoy]);
  // Todo lo demás se calcula sobre el mismo periodo que las barras.
  const delPeriodo = useMemo(() => {
    if (semanas.length === 0) return [];
    const desde = semanas[0].inicio;
    const hasta = lunesDe(hoy!);
    return servicios.filter((s) => { const l = lunesDe(s.fecha); return l >= desde && l <= hasta; });
  }, [servicios, semanas, hoy]);
  const resumen = useMemo(() => resumenEficiencia(delPeriodo), [delPeriodo]);
  const motivos = useMemo(() => motivosFrecuentes(delPeriodo), [delPeriodo]);
  const enFalso = useMemo(() => visitasEnFalso(delPeriodo), [delPeriodo]);
  const grupos = useMemo(
    () => eficienciaPorGrupo(delPeriodo, (s) => (agrupar === 'tecnico' ? s.tecnicos : [s.proyecto])),
    [delPeriodo, agrupar],
  );

  if (!hoy) return null;

  const maxSemana = Math.max(1, ...semanas.map(total));
  const maxMotivo = Math.max(1, ...motivos.map((m) => m.n));
  const hayDatos = resumen.clasificados > 0;

  return (
    <ZonaGraficas className="mb-6">
      <h2 className="font-display font-semibold text-[15px] tracking-wide mb-3">
        Eficiencia de servicios <span className="text-muted font-normal text-[12.5px]">· últimas {SEMANAS} semanas</span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* 1. Cumplimiento y reparto por semana */}
        <Tarjeta titulo="Cumplimiento del plan" Icono={Gauge} color="text-teal" className="md:col-span-2"
          explicacion={
            <>
              Cada día de servicio concluido se lee así: <b>a favor</b> si llegó y cerró dentro de
              los {MARGEN_MIN} min de margen con el trabajo terminado (o terminó antes);{' '}
              <b>causa externa</b> si se desvió por tráfico, cliente ausente, permisos, instrucción
              del cliente o clima; <b>en contra</b> si la causa fue propia o quedó trabajo
              pendiente sin causa externa. El porcentaje es a favor entre a favor más en contra:
              lo externo no cuenta. Solo entran los servicios donde el técnico ya respondió al
              cerrar.
            </>
          }
        >
          {!hayDatos ? (
            <>
              <p className="text-[13px] text-muted">
                Todavía no hay servicios clasificados. Empiezan a contarse cuando el técnico responde cómo quedó el trabajo al cerrar.
              </p>
              {resumen.sinClasificar > 0 && (
                <p className="text-[11px] text-faint mt-1.5">{resumen.sinClasificar} servicio(s) concluidos antes de esta medición, sin clasificar.</p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-4 flex-wrap">
                {resumen.cumplimientoPct !== null && (
                  <Medidor pct={resumen.cumplimientoPct}
                    info={
                      <InfoPunto titulo="Cumplimiento del plan"
                        filas={[
                          { color: COLOR.acento, texto: 'A favor', valor: resumen.positivas },
                          { color: COLOR.rojo, texto: 'En contra', valor: resumen.negativas },
                          { color: COLOR.ambar, texto: 'Causa externa (no cuenta)', valor: resumen.neutras },
                        ]}
                        nota="A favor entre a favor más en contra." />
                    } />
                )}
                <div className="min-w-0 flex-1 flex flex-col gap-1 text-[12.5px]">
                  {TONOS.map((t) => (
                    <div key={t.clave} className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-[3px] shrink-0 ${t.color}`} />
                      <span className="text-ink/85 flex-1 min-w-0 truncate">{t.texto}</span>
                      <span className="font-semibold tabular-nums shrink-0">{resumen[t.clave]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3.5 text-center">
                {([
                  ['Tiempo ganado', resumen.minutosGanados, 'text-teal'],
                  ['Perdido, causa propia', resumen.minutosPerdidosPropios, 'text-red'],
                  ['Perdido, causa externa', resumen.minutosPerdidosExternos, 'text-ink/80'],
                ] as const).map(([etiqueta, min, color]) => (
                  <div key={etiqueta} className="rounded-xl bg-surface-2/60 px-2 py-2">
                    <p className={`font-display font-bold text-[15px] tabular-nums ${color}`}><Contador valor={min} formato={formatMinutos} /></p>
                    <p className="text-[10.5px] text-muted leading-tight mt-0.5">{etiqueta}</p>
                  </div>
                ))}
              </div>

              {/* Columnas apiladas: una por semana. */}
              <div className="mt-4 pt-4 border-t border-line">
                <div className="flex items-end gap-2 h-[104px] border-b border-line-strong">
                  {semanas.map((s, i) => {
                    const t = total(s);
                    const base = s.positivas + s.negativas;
                    return (
                      <Punto key={s.inicio} grupo="semanas" className="flex-1 h-full flex flex-col justify-end items-center"
                        etiqueta={`Semana del ${s.etiqueta}: ${s.positivas} a favor, ${s.neutras} por causa externa, ${s.negativas} en contra, ${s.sinClasificar} sin clasificar`}
                        info={
                          <InfoPunto titulo={`Semana del ${s.etiqueta}${i === semanas.length - 1 ? ' · en curso' : ''}`}
                            filas={[
                              ...TONOS.filter((tono) => s[tono.clave] > 0).map((tono) => ({ color: tono.css, texto: tono.texto, valor: s[tono.clave] })),
                              { texto: 'Días de servicio', valor: t },
                              ...(base > 0 ? [{ texto: 'Cumplimiento', valor: `${Math.round((s.positivas / base) * 100)}%` }] : []),
                            ]}
                            nota={t === 0 ? 'Sin servicios concluidos esa semana.' : undefined} />
                        }>
                        {(activo, otro) => (
                          <>
                            <span className={`text-[11px] font-semibold tabular-nums mb-1 transition-colors ${t === 0 ? 'text-faint' : activo ? 'text-teal' : ''}`}>{t}</span>
                            <Crece eje="y" orden={i} data-ancla="" pct={t === 0 ? 2 : Math.max(8, (t / maxSemana) * 80)}
                              className={`w-full max-w-[40px] flex flex-col-reverse rounded-t-[4px] overflow-hidden gap-px transition-[filter,opacity,box-shadow] duration-200 ${
                                activo ? 'brightness-125 shadow-glow-teal' : ''} ${otro ? 'opacity-55' : ''}`}>
                              {t === 0
                                ? <span className="flex-1 bg-line-strong/70" />
                                : TONOS.map((tono) => (s[tono.clave] > 0
                                  ? <span key={tono.clave} className={tono.color} style={{ flexGrow: s[tono.clave], flexBasis: 0 }} />
                                  : null))}
                            </Crece>
                          </>
                        )}
                      </Punto>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-1.5">
                  {semanas.map((s) => <span key={s.inicio} className="flex-1 text-center text-[10px] text-muted leading-tight">{s.etiqueta}</span>)}
                </div>
                <p className="text-[11px] text-muted mt-2">Cada columna es una semana (inicia en lunes); la altura son los días de servicio concluidos.</p>
              </div>
              {resumen.clasificados < MUESTRA_MINIMA && <p className="text-[11px] text-amber mt-1.5">Pocos datos aún · {resumen.clasificados} clasificado(s)</p>}
            </>
          )}
        </Tarjeta>

        {/* 2. Motivos */}
        <Tarjeta titulo="Motivos de desviación" Icono={MessageSquareWarning} color="text-amber"
          explicacion={
            <>
              Por qué se llegó tarde, se cerró después de lo programado o no se terminó, según lo
              que eligió el técnico. Los externos no dependen del equipo; los propios sí, y son
              los que se pueden corregir. Un motivo sin capturar cuenta como propio.
            </>
          }
        >
          {motivos.length === 0 ? (
            <p className="text-[13px] text-muted">{hayDatos ? 'Sin desviaciones en el periodo.' : 'Sin datos todavía.'}</p>
          ) : (
            <div className="flex flex-col gap-3.5">
              {(['propio', 'externo'] as const).map((origen) => {
                const lista = motivos.filter((m) => m.origen === origen);
                if (lista.length === 0) return null;
                return (
                  <div key={origen}>
                    <p className="text-[10.5px] uppercase tracking-wider text-muted mb-1.5">
                      {origen === 'propio' ? 'Propios · cuentan en contra' : 'Externos · no cuentan'}
                    </p>
                    <div className="flex flex-col gap-2">
                      {lista.map((m, i) => (
                        <Punto key={m.clave} grupo="motivos" etiqueta={`${m.texto}: ${m.n}`}
                          info={
                            <InfoPunto titulo={m.texto}
                              filas={[
                                { color: origen === 'propio' ? COLOR.rojo : COLOR.ambar, texto: 'Veces', valor: m.n },
                                ...(m.minutos > 0 ? [{ texto: 'Tiempo de desviación', valor: formatMinutos(m.minutos) }] : []),
                              ]}
                              nota={origen === 'propio' ? 'Causa propia: se puede corregir.' : 'Causa externa: no cuenta en contra.'} />
                          }>
                          {(activo, otro) => (
                            <div className={`transition-opacity duration-200 ${otro ? 'opacity-55' : ''}`}>
                              <div className="flex items-baseline gap-2 text-[12.5px]">
                                <span className={`flex-1 min-w-0 truncate ${activo ? 'font-semibold' : ''}`}>{m.texto}</span>
                                <span className="font-semibold tabular-nums shrink-0">{m.n}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-1" data-ancla="">
                                <Crece orden={i} pct={(m.n / maxMotivo) * 100}
                                  className={`h-full rounded-full ${origen === 'propio' ? 'bg-red' : 'bg-amber'} transition-[filter] duration-200 ${activo ? 'brightness-125' : ''}`} />
                              </div>
                            </div>
                          )}
                        </Punto>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Tarjeta>

        {/* 3. Visitas en falso */}
        <Tarjeta titulo="Visitas en falso" Icono={Ban} color="text-red"
          explicacion={
            <>
              Días en que el personal llegó y no se pudo trabajar («No se pudo trabajar» al cerrar).
              El tiempo es de la llegada al cierre de esas visitas. Por cliente, para ver con quién
              se pierden más vueltas; «externas» son las que no fueron por causa del equipo.
            </>
          }
        >
          {enFalso.total === 0 ? (
            <p className="text-[13px] text-muted">{hayDatos ? 'Ninguna en el periodo.' : 'Sin datos todavía.'}</p>
          ) : (
            <>
              <p className="flex items-baseline gap-2">
                <Contador valor={enFalso.total} className="font-display font-bold text-[30px] leading-none" />
                <span className="text-[12.5px] text-muted">{enFalso.total === 1 ? 'visita' : 'visitas'}{enFalso.minutos > 0 ? ` · ${formatMinutos(enFalso.minutos)} en sitio sin trabajo` : ''}</span>
              </p>
              <div className="flex flex-col gap-1.5 mt-3">
                {enFalso.porCliente.slice(0, 6).map((c) => (
                  <div key={c.nombre} className="flex items-baseline gap-2 text-[12.5px]">
                    <span className="flex-1 min-w-0 truncate">{c.nombre}</span>
                    <span className="text-muted shrink-0">{c.externas === c.n ? 'externa' : c.externas === 0 ? 'propia' : `${c.externas} externa${c.externas > 1 ? 's' : ''}`}</span>
                    <span className="font-semibold tabular-nums shrink-0 w-5 text-right">{c.n}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Tarjeta>

        {/* 4. Por técnico o por cliente */}
        <Tarjeta titulo="Detalle" Icono={Users} color="text-teal" className="md:col-span-2 xl:col-span-3"
          explicacion={
            <>
              <b>Días</b>: días de servicio clasificados. <b>Cumple</b>: a favor entre a favor más
              en contra. <b>Puntual</b>: llegadas dentro de los {MARGEN_MIN} min, de los servicios
              con hora acordada. <b>Terminó</b>: días con el trabajo terminado. <b>Tiempo</b>:
              minutos ganados menos los perdidos por causa propia. Un servicio con varias personas
              cuenta para cada una, porque el día lo trabajaron juntas. Con menos de{' '}
              {MUESTRA_MINIMA} días el número aparece en ámbar: no alcanza para sacar conclusiones.
            </>
          }
        >
          <div className="inline-flex rounded-xl bg-surface-2 p-0.5 mb-3" role="tablist" aria-label="Agrupar por">
            {([['tecnico', 'Por técnico'], ['cliente', 'Por cliente']] as const).map(([clave, texto]) => (
              <button key={clave} type="button" role="tab" aria-selected={agrupar === clave} onClick={() => setAgrupar(clave)}
                className={`px-3.5 min-h-[36px] rounded-[10px] text-[12.5px] font-semibold transition-colors ${agrupar === clave ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
                {texto}
              </button>
            ))}
          </div>
          <TablaGrupos filas={grupos} />
        </Tarjeta>
      </div>
    </ZonaGraficas>
  );
}
