'use client';

import { useMemo } from 'react';
import { Servicio } from '@/lib/serviciosProgramados';
import {
  desviacionPorProyecto,
  lecturaDeTiempo,
  tiempoDeArranque,
  puntualidad,
  retrabajo,
  formatMinutos,
  MUESTRA_MINIMA,
} from '@/lib/kpis';
import { Hourglass, Timer, Clock, FileWarning } from 'lucide-react';
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

// Las tres lecturas de un servicio contra su tiempo planeado.
const LECTURAS = [
  { clave: 'antes', texto: 'Antes', clase: 'bg-teal/50', css: 'rgb(var(--c-acento) / 0.5)', nota: 'Terminaron más de 10% antes del tiempo planeado.' },
  { clave: 'aTiempo', texto: 'A tiempo', clase: 'bg-teal', css: COLOR.acento, nota: 'Terminaron en el tiempo planeado, con 10% de margen.' },
  { clave: 'tarde', texto: 'Se pasaron', clase: 'bg-amber', css: COLOR.ambar, nota: 'Tardaron más de 10% sobre el tiempo planeado.' },
] as const;

// Una diferencia de tiempo dicha en palabras: «35 min más», «20 min menos».
function textoDiferencia(minutos: number): string {
  const redondo = Math.round(minutos);
  if (redondo === 0) return 'Igual a lo planeado';
  return `${formatMinutos(Math.abs(redondo))} ${redondo > 0 ? 'más' : 'menos'}`;
}

// Un renglón de la comparación: «Planeado» o «Real», su barra y su tiempo.
function BarraTiempo({ texto, minutos, tope, clase, orden, activo }: {
  texto: string; minutos: number; tope: number; clase: string; orden: number; activo: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-14 shrink-0 text-muted">{texto}</span>
      <div className="flex-1 h-2.5 rounded-full bg-surface-2 overflow-hidden">
        <Crece orden={orden} pct={(minutos / tope) * 100}
          className={`h-full rounded-full ${clase} transition-[filter] duration-200 ${activo ? 'brightness-125' : ''}`} />
      </div>
      <span className="w-[72px] shrink-0 text-right tabular-nums font-medium">{formatMinutos(minutos)}</span>
    </div>
  );
}

// ¿Se cumple el tiempo planeado? Primero la respuesta en servicios contados
// (cuántos terminaron antes, a tiempo o tarde) y luego, por proyecto, dos
// barras lado a lado: lo planeado y lo que de verdad se tardó.
function TiempoPlaneado({ datos }: { datos: ReturnType<typeof desviacionPorProyecto> }) {
  const total = datos.resumen.n;
  const cumplen = datos.reparto.antes + datos.reparto.aTiempo;
  const diferencia = Math.round(datos.diferenciaMin);
  const filas = datos.filas.slice(0, 5);
  // Todas las barras comparten escala: la más larga llena el renglón.
  const tope = Math.max(1, ...filas.map((f) => Math.max(f.estimadoMin, f.realMin)));

  let loNormal = 'Lo normal es terminar justo en el tiempo planeado.';
  if (diferencia !== 0) {
    loNormal = `Lo normal es tardar ${formatMinutos(Math.abs(diferencia))} ${diferencia > 0 ? 'más' : 'menos'} de lo planeado.`;
  }

  return (
    <>
      <div className="flex items-baseline gap-1.5 font-display font-bold leading-none mb-1.5">
        <Contador valor={cumplen} className="text-[30px]" />
        <span className="text-[15px] text-muted font-semibold">de {total}</span>
      </div>
      <p className="text-[12.5px] text-ink/85">
        {total === 1 ? 'servicio terminó' : 'servicios terminaron'} en el tiempo planeado o antes
      </p>
      <p className="text-[11.5px] text-muted mt-1">{loNormal}</p>

      {/* Reparto: cada tramo es un grupo de servicios. */}
      <div className="flex h-3.5 gap-[2px] mt-3.5 mb-2">
        {LECTURAS.filter((l) => datos.reparto[l.clave] > 0).map((l, i) => {
          const n = datos.reparto[l.clave];
          return (
            <Punto key={l.clave} grupo="reparto-tiempo" className="h-full min-w-[5px]" style={{ width: `${(n / total) * 100}%` }}
              etiqueta={`${l.texto}: ${n} de ${total} servicios`}
              info={
                <InfoPunto titulo={l.texto}
                  filas={[
                    { color: l.css, texto: 'Servicios', valor: n },
                    { texto: 'Del total medido', valor: `${Math.round((n / total) * 100)}%` },
                  ]}
                  nota={l.nota} />
              }>
              {(activo, otro) => (
                <Crece orden={i * 2} pct={100} data-ancla=""
                  className={`h-full rounded-[4px] origin-bottom transition-[transform,opacity,filter] duration-200 ${l.clase} ${activo ? 'scale-y-[1.35] brightness-110' : ''} ${otro ? 'opacity-40' : ''}`} />
              )}
            </Punto>
          );
        })}
      </div>
      <p className="text-[11.5px] text-muted flex items-center gap-x-3.5 gap-y-1 flex-wrap">
        {LECTURAS.map((l) => (
          <span key={l.clave} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-[3px] ${l.clase}`} /> {l.texto} <b className="text-ink tabular-nums">{datos.reparto[l.clave]}</b>
          </span>
        ))}
      </p>
      <Muestra n={total} descartados={datos.resumen.descartados} />

      {filas.length > 0 && (
        <div className="mt-4 pt-4 border-t border-line space-y-3.5">
          <p className="text-[10px] uppercase tracking-wider text-faint">Planeado contra real, por proyecto</p>
          {filas.map((f, i) => {
            const lectura = lecturaDeTiempo(f.realMin, f.estimadoMin);
            const sePasa = lectura === 'tarde';
            const veredicto = lectura === 'aTiempo' ? 'A tiempo' : textoDiferencia(f.realMin - f.estimadoMin);
            return (
              <Punto key={f.proyecto} grupo="desviacion"
                etiqueta={`${f.proyecto}: planeado ${formatMinutos(f.estimadoMin)}, real ${formatMinutos(f.realMin)}`}
                info={
                  <InfoPunto titulo={f.proyecto}
                    filas={[
                      { texto: 'Planeado', valor: formatMinutos(f.estimadoMin) },
                      { color: sePasa ? COLOR.ambar : COLOR.acento, texto: 'Real', valor: formatMinutos(f.realMin) },
                      { texto: 'Diferencia', valor: textoDiferencia(f.realMin - f.estimadoMin) },
                      ...LECTURAS.map((l) => ({ texto: `Servicios: ${l.texto.toLowerCase()}`, valor: f.reparto[l.clave] })),
                    ]}
                    nota={sePasa
                      ? 'Tarda más de lo planeado: conviene ajustar el tiempo que se agenda o lo que se cotiza.'
                      : 'Va dentro de lo planeado.'} />
                }>
                {(activo, otro) => (
                  <div className={`transition-opacity duration-200 ${otro ? 'opacity-55' : ''}`}>
                    <div className="flex justify-between items-center gap-2 mb-1.5">
                      <span className={`text-[12.5px] truncate transition-colors ${activo ? 'text-ink font-semibold' : 'text-ink/85'}`}>{f.proyecto}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-semibold tabular-nums ${sePasa ? 'bg-amber/15 text-amber' : 'bg-teal/15 text-teal'}`}>
                        {veredicto}
                      </span>
                    </div>
                    <div className="space-y-1" data-ancla="">
                      <BarraTiempo texto="Planeado" minutos={f.estimadoMin} tope={tope} clase="bg-ink/30" orden={i * 2} activo={activo} />
                      <BarraTiempo texto="Real" minutos={f.realMin} tope={tope} clase={sePasa ? 'bg-amber' : 'bg-teal'} orden={i * 2 + 1} activo={activo} />
                    </div>
                    {f.n < MUESTRA_MINIMA && (
                      <p className="text-[10.5px] text-faint mt-1">Pocos datos: {f.n === 1 ? '1 servicio medido' : `${f.n} servicios medidos`}</p>
                    )}
                  </div>
                )}
              </Punto>
            );
          })}
        </div>
      )}
    </>
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

  const seExcede = desviacion.diferenciaMin > 0;

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
        {/* 1. Tiempo planeado contra real */}
        <Tarjeta
          className="xl:row-span-2"
          titulo="¿Se cumple el tiempo planeado?"
          Icono={Hourglass}
          color={seExcede ? 'text-amber' : 'text-teal'}
          explicacion={
            <>
              Compara lo que se planeó al agendar contra lo que de verdad tardó cada servicio.
              Arriba, cuántos servicios terminaron antes, a tiempo o se pasaron; se toma como
              «a tiempo» hasta 10% de diferencia. Abajo, por proyecto, la barra gris es lo planeado
              y la de color lo real: si la de color es más larga, ahí se tarda más de lo previsto y
              conviene ajustar el tiempo que se agenda o lo que se cotiza.
              {' '}Se mide de iniciar a concluir, no desde que se llega: el traslado y la espera en
              caseta no cuentan. «Lo normal» es el servicio de en medio (la mediana), para que uno
              que se fue a seis horas no mueva todo.
            </>
          }
        >
          {desviacion.resumen.n === 0 ? (
            <p className="text-[13px] text-muted">
              Aún no hay servicios concluidos con hora de inicio y fin.
            </p>
          ) : (
            <TiempoPlaneado datos={desviacion} />
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
