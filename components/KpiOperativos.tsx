'use client';

import { useMemo } from 'react';
import { Servicio } from '@/lib/serviciosProgramados';
import {
  desviacionPorProyecto,
  tiempoDeArranque,
  puntualidad,
  retrabajo,
  formatMinutos,
  MUESTRA_MINIMA,
} from '@/lib/kpis';
import { TrendingUp, TrendingDown, Timer, Clock, FileWarning } from 'lucide-react';
import BotonInfo from '@/components/BotonInfo';
import { ZonaGraficas, Marco, Punto, Crece, Aparece, Contador, Medidor, InfoPunto, COLOR } from '@/components/Graficas';

// Aviso de muestra chica. Aparece en vez de esconderse: es más honesto que una
// cifra sola que aparenta tendencia sacada de dos servicios.
function Muestra({ n, descartados }: { n: number; descartados?: number }) {
  const partes: string[] = [];
  partes.push(n === 1 ? '1 servicio medido' : `${n} servicios medidos`);
  if (descartados) partes.push(`${descartados} con hora incompleta`);

  return (
    <p className={`text-[11px] mt-1.5 ${n < MUESTRA_MINIMA ? 'text-amber' : 'text-muted'}`}>
      {n < MUESTRA_MINIMA && n > 0 && 'Pocos datos aún · '}
      {n === 0 ? 'Sin datos suficientes todavía' : partes.join(' · ')}
    </p>
  );
}

// Barra divergente centrada en cero: a la izquierda lo que cierra antes, a la
// derecha lo que se pasa. Es la forma más legible en un teléfono angosto.
function BarraDesviacion({ pct }: { pct: number }) {
  const tope = 60; // más allá de ±60% la barra se satura, el número lo dice
  const ancho = Math.min(Math.abs(pct), tope) / tope * 50;
  const seExcede = pct > 0;

  return (
    <div className="relative h-2 rounded-full bg-surface-2 overflow-hidden">
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-line-strong" />
      <div
        className={`absolute top-0 bottom-0 rounded-full ${seExcede ? 'bg-amber' : 'bg-teal'}`}
        style={
          seExcede
            ? { left: '50%', width: `${ancho}%` }
            : { right: '50%', width: `${ancho}%` }
        }
      />
    </div>
  );
}

export function Tarjeta({
  titulo,
  Icono,
  color,
  explicacion,
  children,
  className = '',
}: {
  titulo: string;
  Icono: any;
  color: string;
  explicacion: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Marco className={`glass rounded-2xl p-4 lg:p-5 ${className}`}>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <Icono size={14} strokeWidth={2.2} className={color} />
        <div className="text-[10px] uppercase tracking-wider text-muted">{titulo}</div>
        <BotonInfo titulo={titulo}>{explicacion}</BotonInfo>
      </div>
      {children}
    </Marco>
  );
}

export default function KpiOperativos({
  servicios,
  reports,
}: {
  servicios: Servicio[];
  reports: any[];
}) {
  const desviacion = useMemo(() => desviacionPorProyecto(servicios), [servicios]);
  const arranque = useMemo(() => tiempoDeArranque(servicios), [servicios]);
  const punt = useMemo(() => puntualidad(servicios), [servicios]);
  const retra = useMemo(() => retrabajo(reports), [reports]);

  const seExcede = desviacion.resumen.valor > 0;

  // Reparto del tiempo entre llegar y empezar, por rangos.
  const rangosArranque = useMemo(() => {
    const rangos = [
      { etiqueta: '0–5 min', hasta: 5, n: 0 }, { etiqueta: '5–10', hasta: 10, n: 0 }, { etiqueta: '10–20', hasta: 20, n: 0 },
      { etiqueta: '20–30', hasta: 30, n: 0 }, { etiqueta: 'Más de 30', hasta: Infinity, n: 0 },
    ];
    servicios.forEach((sv) => {
      if (!sv.hora_llegada || !sv.hora_inicio) return;
      const m = (new Date(sv.hora_inicio).getTime() - new Date(sv.hora_llegada).getTime()) / 60000;
      if (!Number.isFinite(m) || m < 0 || m > 240) return;
      (rangos.find((r) => m <= r.hasta) || rangos[rangos.length - 1]).n++;
    });
    return rangos;
  }, [servicios]);
  const maxRango = Math.max(1, ...rangosArranque.map((r) => r.n));

  return (
    <ZonaGraficas className="mb-6">
      <h2 className="font-display font-semibold text-[15px] tracking-wide mb-3">
        Desempeño operativo
      </h2>

      {/* Computadora: la tarjeta larga a la izquierda y las otras tres a su lado. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* 1. Desviación contra lo estimado */}
        <Tarjeta
          className="xl:row-span-2"
          titulo="Tiempo real contra estimado"
          Icono={seExcede ? TrendingUp : TrendingDown}
          color={seExcede ? 'text-amber' : 'text-teal'}
          explicacion={
            <>
              Cuánto se aleja el tiempo real del que se estimó al agendar. Un +20% significa
              que los servicios tardan una quinta parte más de lo planeado; un número negativo,
              que cierran antes. Se mide de iniciar a concluir, no desde que se llega: el traslado
              y la espera en caseta no son culpa del estimado.
              {' '}Se usa la mediana y no el promedio, para que un servicio que se fue a seis horas
              no ensucie todo el proyecto. Abajo se ve en qué proyectos se sale más, que es donde
              conviene ajustar lo que se estima o lo que se cotiza.
            </>
          }
        >
          {desviacion.resumen.n === 0 ? (
            <p className="text-[13px] text-muted">
              Aún no hay servicios concluidos con hora de inicio y fin.
            </p>
          ) : (
            <>
              <div className="font-display text-[30px] font-bold leading-none mb-1">
                <Contador valor={desviacion.resumen.valor} formato={(n) => `${Math.round(n) > 0 ? '+' : ''}${Math.round(n)}%`} />
              </div>
              <p className="text-[11px] text-muted">
                {seExcede
                  ? 'Los servicios se pasan del tiempo estimado'
                  : 'Los servicios cierran antes de lo estimado'}
              </p>
              <Muestra n={desviacion.resumen.n} descartados={desviacion.resumen.descartados} />

              {desviacion.filas.length > 0 && (
                <div className="mt-4 pt-4 border-t border-line space-y-3">
                  <p className="text-[10px] uppercase tracking-wider text-faint">
                    Dónde se sale más
                  </p>
                  <p className="text-[11px] text-muted flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-[2px] bg-teal" /> Tiempo real</span>
                    <span className="flex items-center gap-1.5"><span className="w-[3px] h-3 rounded-full bg-ink" /> Estimado</span>
                  </p>
                  {(() => {
                    const filas = desviacion.filas.slice(0, 5);
                    const tope = Math.max(1, ...filas.map((f) => Math.max(f.estimadoMin, f.realMin))) * 1.08;
                    return filas.map((f, i) => {
                      const color = f.desviacionPct > 0 ? COLOR.ambar : COLOR.acento;
                      return (
                        <Punto key={f.proyecto} grupo="desviacion" etiqueta={`${f.proyecto}: estimado ${formatMinutos(f.estimadoMin)}, real ${formatMinutos(f.realMin)}`}
                          info={
                            <InfoPunto titulo={f.proyecto}
                              filas={[
                                { texto: 'Estimado', valor: formatMinutos(f.estimadoMin) },
                                { color, texto: 'Real', valor: formatMinutos(f.realMin) },
                                { texto: 'Diferencia', valor: `${f.realMin >= f.estimadoMin ? '+' : '−'}${formatMinutos(Math.abs(f.realMin - f.estimadoMin))}` },
                                { texto: 'Servicios medidos', valor: f.n },
                              ]}
                              nota={f.desviacionPct > 0 ? 'Tarda más de lo planeado: conviene ajustar el estimado o la cotización.' : 'Cierra antes de lo estimado.'} />
                          }>
                          {(activo, otro) => (
                            <div className={`transition-opacity duration-200 ${otro ? 'opacity-55' : ''}`}>
                              <div className="flex justify-between items-baseline gap-2 mb-1.5">
                                <span className={`text-[12.5px] truncate transition-colors ${activo ? 'text-ink font-semibold' : 'text-ink/85'}`}>{f.proyecto}</span>
                                <span className={`text-[12.5px] font-semibold shrink-0 tabular-nums ${f.desviacionPct > 0 ? 'text-amber' : 'text-teal'}`}>
                                  {f.desviacionPct > 0 ? '+' : ''}{Math.round(f.desviacionPct)}%
                                </span>
                              </div>
                              {/* Barra = lo que tardó; marca = lo que se estimó. */}
                              <div className="relative h-3 rounded-r-[4px] bg-surface-2" data-ancla="">
                                <Crece orden={i} pct={(f.realMin / tope) * 100}
                                  className={`absolute inset-y-0 left-0 rounded-r-[4px] ${f.desviacionPct > 0 ? 'bg-amber' : 'bg-teal'} transition-[filter] duration-200 ${activo ? 'brightness-125' : ''}`} />
                                <div className={`absolute w-[3px] rounded-full bg-ink ring-2 ring-surface transition-all duration-200 ${activo ? '-top-1.5 -bottom-1.5' : '-top-1 -bottom-1'}`}
                                  style={{ left: `calc(${(f.estimadoMin / tope) * 100}% - 1.5px)` }} />
                              </div>
                              <p className="text-[10.5px] text-faint mt-1.5">
                                Estimado {formatMinutos(f.estimadoMin)} · real {formatMinutos(f.realMin)}
                                {f.n < MUESTRA_MINIMA && ` · solo ${f.n}`}
                              </p>
                            </div>
                          )}
                        </Punto>
                      );
                    });
                  })()}
                </div>
              )}
            </>
          )}
        </Tarjeta>

        {/* 2. Tiempo de arranque */}
        <Tarjeta titulo="De llegar a empezar" Icono={Timer} color="text-amber"
          explicacion={
            <>
              El hueco entre marcar llegada al sitio e iniciar el trabajo. Es tiempo pagado en
              el que todavía no se avanza. Cuando crece suele haber una causa concreta: faltó
              herramienta, el acceso no estaba listo o el contacto no había llegado. A diferencia
              de las demás, esta cifra apunta a algo que se puede arreglar antes del próximo servicio.
            </>
          }
        >
          <div className="font-display text-[30px] font-bold leading-none mb-1">
            {arranque.n === 0 ? '—' : <Contador valor={arranque.valor} formato={formatMinutos} />}
          </div>
          <p className="text-[11px] text-muted">
            Mediana entre marcar llegada e iniciar el trabajo. Cuando crece suele ser
            herramienta que faltó o acceso que no estaba listo.
          </p>
          <Muestra n={arranque.n} descartados={arranque.descartados} />
          {/* Cómo se reparten: cuántos servicios cayeron en cada rango. */}
          {arranque.n > 0 && (
            <div className="mt-4 pt-4 border-t border-line">
              <div className="flex items-end gap-2 h-[92px] border-b border-line-strong">
                {rangosArranque.map((r, i) => (
                  <Punto key={r.etiqueta} grupo="arranque" className="flex-1 h-full flex flex-col justify-end items-center"
                    etiqueta={`${r.etiqueta}: ${r.n} servicio${r.n === 1 ? '' : 's'}`}
                    info={
                      <InfoPunto titulo={`De llegar a empezar: ${r.etiqueta}${r.etiqueta.includes('min') ? '' : ' min'}`}
                        filas={[
                          { color: COLOR.ambar, texto: 'Servicios', valor: r.n },
                          { texto: 'De los medidos', valor: `${Math.round((r.n / Math.max(1, arranque.n)) * 100)}%` },
                        ]}
                        nota={i === 0 ? 'Llegar y empezar: así se ve un servicio bien preparado.' : i >= 3 ? 'Tiempo pagado sin avance: revisar herramienta y accesos.' : undefined} />
                    }>
                    {(activo, otro) => (
                      <>
                        <span className={`text-[11.5px] font-semibold tabular-nums mb-1 transition-colors ${r.n === 0 ? 'text-faint' : activo ? 'text-amber' : ''}`}>{r.n}</span>
                        <Crece eje="y" orden={i} data-ancla="" pct={r.n === 0 ? 2 : Math.max(8, (r.n / maxRango) * 78)}
                          className={`w-full max-w-[44px] rounded-t-[4px] bg-amber transition-[filter,opacity] duration-200 ${activo ? 'brightness-125' : ''} ${otro ? 'opacity-55' : ''}`} />
                      </>
                    )}
                  </Punto>
                ))}
              </div>
              <div className="flex gap-2 mt-1.5">
                {rangosArranque.map((r) => (
                  <span key={r.etiqueta} className="flex-1 text-center text-[10.5px] text-muted leading-tight">{r.etiqueta}</span>
                ))}
              </div>
            </div>
          )}
        </Tarjeta>

        {/* 3. Puntualidad */}
        <Tarjeta titulo="Puntualidad de llegada" Icono={Clock} color="text-teal"
          explicacion={
            <>
              De los servicios con hora acordada, qué porcentaje llegó dentro de los 15 minutos
              siguientes. Solo cuenta los que tienen hora capturada al agendar: no se puede llegar
              tarde a una cita que nunca tuvo hora, así que los demás quedan fuera y se informan
              aparte.
            </>
          }
        >
          {punt.n === 0 ? (
            <>
              <p className="text-[13px] text-muted">
                Todavía no hay servicios con hora acordada.
              </p>
              {punt.sinHora > 0 && (
                <p className="text-[11px] text-faint mt-1.5">
                  {punt.sinHora} servicio{punt.sinHora > 1 ? 's' : ''} sin hora programada. Al
                  agendar ya se puede capturar.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-4 flex-wrap">
                <Medidor pct={(punt.aTiempo / punt.n) * 100}
                  info={
                    <InfoPunto titulo="Puntualidad de llegada"
                      filas={[
                        { color: COLOR.acento, texto: 'A tiempo', valor: punt.aTiempo },
                        { color: COLOR.gris, texto: 'Tarde', valor: punt.tarde },
                        { texto: 'Desfase típico', valor: formatMinutos(punt.medianaDesfaseMin) },
                      ]}
                      nota="Cuenta como a tiempo hasta 15 min después de la hora acordada." />
                  } />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug">
                    <b>{punt.aTiempo}</b> de <b>{punt.n}</b> llegaron dentro de los 15 min acordados
                  </p>
                  <p className="text-[11.5px] text-muted mt-1">
                    Desfase típico {formatMinutos(punt.medianaDesfaseMin)}
                  </p>
                </div>
              </div>
              <Muestra n={punt.n} />
              {punt.sinHora > 0 && (
                <p className="text-[11px] text-faint mt-1">
                  {punt.sinHora} sin hora acordada, fuera del cálculo.
                </p>
              )}
            </>
          )}
        </Tarjeta>

        {/* 4. Retrabajo y firmas */}
        <Tarjeta titulo="Retrabajo y firmas" Icono={FileWarning} color="text-red" className="md:col-span-2 xl:col-span-2"
          explicacion={
            <>
              Reportes que hubo que corregir después de entregados, y reportes que se quedaron
              sin firma del cliente. Mide calidad de la documentación, no velocidad. El segundo
              pesa en caja: un reporte sin firma no se puede facturar.
            </>
          }
        >
          {retra.total === 0 ? (
            <p className="text-[13px] text-muted">Sin reportes en el periodo.</p>
          ) : (
            <div>
              {/* Un cuadro por reporte: de un vistazo se ve qué tan poco (o
                  mucho) es lo que salió mal. */}
              <div className="flex flex-wrap gap-[3px] mb-3.5" role="img"
                aria-label={`${retra.total} reportes: ${retra.sinFirmaCliente} sin firma del cliente, ${retra.conCorreccion} con corrección`}>
                {Array.from({ length: Math.min(retra.total, 120) }, (_, i) => {
                  const esc = retra.total > 120 ? 120 / retra.total : 1;
                  const rojos = Math.round(retra.sinFirmaCliente * esc);
                  const ambar = Math.round(retra.conCorreccion * esc);
                  return <Aparece key={i} orden={i} className={`w-3 h-3 rounded-[3px] ${i < rojos ? 'bg-red' : i < rojos + ambar ? 'bg-amber' : 'bg-line-strong/70'}`} />;
                })}
              </div>
              <div className="flex flex-col gap-1.5 text-[12.5px]">
                {([
                  ['bg-red', 'Sin firma del cliente', retra.sinFirmaCliente, retra.pctSinFirma],
                  ['bg-amber', 'Requirieron corrección', retra.conCorreccion, retra.pctCorreccion],
                  ['bg-line-strong/70', 'Sin incidencias', Math.max(0, retra.total - retra.sinFirmaCliente - retra.conCorreccion), null],
                ] as const).map(([color, etiqueta, n, pct]) => (
                  <div key={etiqueta} className="flex items-center gap-2 -mx-1.5 px-1.5 py-0.5 rounded-md transition-colors hover:bg-surface-2">
                    <span className={`w-2.5 h-2.5 rounded-[3px] shrink-0 ${color}`} />
                    <span className="text-ink/85 flex-1 min-w-0 truncate">{etiqueta}</span>
                    <span className="font-semibold tabular-nums shrink-0">{n}</span>
                    <span className="text-muted tabular-nums shrink-0 w-9 text-right">{pct === null ? '' : `${Math.round(pct)}%`}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted pt-2.5">
                Cada cuadro es un reporte{retra.total > 120 ? ' (a escala)' : ''}. Un reporte sin firma no se puede facturar.
              </p>
            </div>
          )}
        </Tarjeta>
      </div>
    </ZonaGraficas>
  );
}
