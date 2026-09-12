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

function Tarjeta({
  titulo,
  Icono,
  color,
  explicacion,
  children,
}: {
  titulo: string;
  Icono: any;
  color: string;
  explicacion: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-4 lg:p-5">
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <Icono size={14} strokeWidth={2.2} className={color} />
        <div className="text-[10px] uppercase tracking-wider text-muted">{titulo}</div>
        <BotonInfo titulo={titulo}>{explicacion}</BotonInfo>
      </div>
      {children}
    </div>
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

  return (
    <div className="mb-6">
      <h2 className="font-display font-semibold text-[15px] tracking-wide mb-3">
        Desempeño operativo
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 1. Desviación contra lo estimado */}
        <Tarjeta
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
                {desviacion.resumen.valor > 0 ? '+' : ''}
                {Math.round(desviacion.resumen.valor)}%
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
                  {desviacion.filas.slice(0, 5).map((f) => (
                    <div key={f.proyecto}>
                      <div className="flex justify-between items-baseline gap-2 mb-1.5">
                        <span className="text-[12.5px] text-ink/85 truncate">{f.proyecto}</span>
                        <span
                          className={`text-[12.5px] font-semibold shrink-0 ${
                            f.desviacionPct > 0 ? 'text-amber' : 'text-teal'
                          }`}
                        >
                          {f.desviacionPct > 0 ? '+' : ''}
                          {Math.round(f.desviacionPct)}%
                        </span>
                      </div>
                      <BarraDesviacion pct={f.desviacionPct} />
                      <p className="text-[10.5px] text-faint mt-1">
                        Estimado {formatMinutos(f.estimadoMin)} · real {formatMinutos(f.realMin)}
                        {f.n < MUESTRA_MINIMA && ` · solo ${f.n}`}
                      </p>
                    </div>
                  ))}
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
            {arranque.n === 0 ? '—' : formatMinutos(arranque.valor)}
          </div>
          <p className="text-[11px] text-muted">
            Mediana entre marcar llegada e iniciar el trabajo. Cuando crece suele ser
            herramienta que faltó o acceso que no estaba listo.
          </p>
          <Muestra n={arranque.n} descartados={arranque.descartados} />
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
              <div className="font-display text-[30px] font-bold leading-none mb-1">
                {Math.round((punt.aTiempo / punt.n) * 100)}%
              </div>
              <p className="text-[11px] text-muted">
                Llega dentro de los 15 min acordados · desfase típico{' '}
                {formatMinutos(punt.medianaDesfaseMin)}
              </p>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-3">
                <div
                  className="h-full rounded-full bg-teal transition-all duration-500"
                  style={{ width: `${(punt.aTiempo / punt.n) * 100}%` }}
                />
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
        <Tarjeta titulo="Retrabajo y firmas" Icono={FileWarning} color="text-red"
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
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-[12px] text-ink/85">Requirieron corrección</span>
                  <span className="text-[12px] font-semibold shrink-0 ml-2">
                    {retra.conCorreccion} de {retra.total}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber transition-all duration-500"
                    style={{ width: `${retra.pctCorreccion}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-[12px] text-ink/85">Sin firma del cliente</span>
                  <span className="text-[12px] font-semibold shrink-0 ml-2">
                    {retra.sinFirmaCliente} de {retra.total}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red transition-all duration-500"
                    style={{ width: `${retra.pctSinFirma}%` }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted pt-1">
                Un reporte sin firma no se puede facturar.
              </p>
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
