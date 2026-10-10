'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FileCheck2, TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react';
import { DiaAgenda } from '@/lib/serviciosProgramados';
import { serieProductividad, compararPeriodos, mejorDia, promedioPorDiaActivo, Metrica, DiaProductividad, ReporteDia } from '@/lib/productividad';
import { formatMinutos } from '@/lib/kpis';
import { hoyLocal, fechaLocal } from '@/lib/fechaHoy';
import BotonInfo from '@/components/BotonInfo';
import { ZonaGraficas, Marco, Contador, LineaInteractiva, InfoPunto, COLOR } from '@/components/Graficas';

// Productividad del equipo: lo que se cerró, las horas en sitio y los reportes
// entregados, día por día y contra el periodo anterior. Es lo primero que ve
// el supervisor de los indicadores.

const VENTANAS = [7, 14, 30] as const;

const METRICAS: { clave: Metrica; texto: string; corto: string; Icono: any; valor: (n: number) => string; eje: (n: number) => string }[] = [
  { clave: 'servicios', texto: 'Servicios concluidos', corto: 'servicios', Icono: CheckCircle2, valor: (n) => String(Math.round(n)), eje: (n) => String(Math.round(n)) },
  { clave: 'minutos', texto: 'Horas en sitio', corto: 'en sitio', Icono: Clock3, valor: (n) => formatMinutos(n), eje: (n) => `${Math.round(n / 60)} h` },
  { clave: 'reportes', texto: 'Reportes entregados', corto: 'reportes', Icono: FileCheck2, valor: (n) => String(Math.round(n)), eje: (n) => String(Math.round(n)) },
];

function nombreDia(fecha: string, largo = true): string {
  return fechaLocal(fecha).toLocaleDateString('es-MX', largo ? { weekday: 'long', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' }).replace('.', '');
}

function Cambio({ pct, actual }: { pct: number | null; actual: number }) {
  if (pct === null) {
    return actual > 0
      ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-teal/15 text-teal"><Sparkles size={11} strokeWidth={2.4} /> Nuevo</span>
      : null;
  }
  const r = Math.round(pct);
  const tono = r > 0 ? 'bg-teal/15 text-teal' : r < 0 ? 'bg-red/15 text-red' : 'bg-surface-2 text-muted';
  const Icono = r > 0 ? TrendingUp : r < 0 ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold tabular-nums ${tono}`}>
      <Icono size={11} strokeWidth={2.6} /> {r > 0 ? '+' : r < 0 ? '−' : ''}{Math.abs(r)}%
    </span>
  );
}

export default function KpiProductividad({ servicios, reports }: { servicios: DiaAgenda[]; reports: ReporteDia[] }) {
  // «Hoy» se lee ya montado (Vercel corre en UTC).
  const [hoy, setHoy] = useState<string | null>(null);
  useEffect(() => { setHoy(hoyLocal()); }, []);
  const [ventana, setVentana] = useState<(typeof VENTANAS)[number]>(14);
  const [metrica, setMetrica] = useState<Metrica>('servicios');

  const serie = useMemo(() => (hoy ? serieProductividad(servicios, reports, hoy, ventana * 2) : []), [servicios, reports, hoy, ventana]);
  if (!hoy) return null;

  const previos = serie.slice(0, ventana);
  const actuales = serie.slice(ventana);
  const m = METRICAS.find((x) => x.clave === metrica)!;
  const mejor = mejorDia(actuales, metrica);
  const promedio = promedioPorDiaActivo(actuales, metrica);
  const hayAlgo = serie.some((d) => d.servicios || d.reportes || d.minutos);

  // Globo de un día: primero la medida elegida contra el mismo día del periodo
  // anterior (la línea punteada), luego las otras medidas de ese día.
  const info = (d: DiaProductividad, i: number) => {
    const antes: DiaProductividad | undefined = previos[i];
    const clasificados = d.aFavor + d.enContra + d.externas;
    const otras = METRICAS.filter((x) => x.clave !== metrica);

    let nota: string | undefined;
    if (antes) {
      const diferencia = d[metrica] - antes[metrica];
      if (diferencia === 0) nota = 'Igual que el mismo día del periodo anterior.';
      else nota = `${m.valor(Math.abs(diferencia))} ${diferencia > 0 ? 'más' : 'menos'} que en el periodo anterior.`;
    }
    if (d.minutosDeReportes > 0) {
      nota = `${nota ? `${nota} ` : ''}${formatMinutos(d.minutosDeReportes)} en sitio se tomaron de la hora de llegada y salida de los reportes.`;
    }

    return (
      <InfoPunto
        titulo={`${nombreDia(d.fecha)}${d.fecha === hoy ? ' · hoy, en curso' : ''}`}
        filas={[
          { color: COLOR.acento, texto: m.texto, valor: m.valor(d[metrica]) },
          ...(antes ? [{ color: '#94A0AB', texto: `Periodo anterior · ${nombreDia(antes.fecha, false)}`, valor: m.valor(antes[metrica]) }] : []),
          ...otras.map((x) => ({ texto: x.texto, valor: x.valor(d[x.clave]) })),
          ...(clasificados > 0 ? [
            { color: COLOR.acento, texto: 'A favor del plan', valor: d.aFavor },
            ...(d.externas ? [{ color: COLOR.ambar, texto: 'Causa externa', valor: d.externas }] : []),
            ...(d.enContra ? [{ color: COLOR.rojo, texto: 'En contra', valor: d.enContra }] : []),
          ] : []),
        ]}
        nota={nota}
      />
    );
  };

  return (
    <ZonaGraficas className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-display font-semibold text-[15px] tracking-wide">Productividad del equipo</h2>
        <div className="flex items-center gap-1 bg-surface-2 rounded-full p-1 border border-line" role="tablist" aria-label="Periodo">
          {VENTANAS.map((v) => (
            <button key={v} type="button" role="tab" aria-selected={ventana === v} onClick={() => setVentana(v)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${ventana === v ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
              {v} días
            </button>
          ))}
        </div>
      </div>

      <Marco className="glass rounded-2xl p-4 lg:p-5">
        {/* Las tres medidas: cada una es también el botón que la pone en la gráfica. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
          {METRICAS.map((x) => {
            const c = compararPeriodos(serie, x.clave);
            const activa = metrica === x.clave;
            return (
              <button key={x.clave} type="button" onClick={() => setMetrica(x.clave)} aria-pressed={activa}
                className={`group text-left rounded-xl border px-3.5 py-3 transition-all duration-200 active:scale-[0.98] ${
                  activa ? 'border-teal/70 bg-teal/10 shadow-glow-teal' : 'border-line bg-surface-2/50 hover:border-teal/40 hover:bg-teal/5'
                }`}>
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
                  <x.Icono size={13} strokeWidth={2.2} className={`transition-colors ${activa ? 'text-teal' : 'text-faint group-hover:text-teal'}`} />
                  {x.texto}
                </span>
                <span className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                  <Contador valor={c.actual} formato={x.valor} className="font-display font-bold text-[26px] leading-none" />
                  <Cambio pct={c.cambioPct} actual={c.actual} />
                </span>
                <span className="block text-[11px] text-muted mt-1">
                  {c.previo > 0 || c.actual > 0 ? `${x.valor(c.previo)} en los ${ventana} días anteriores` : 'Sin registros todavía'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <div className="text-[10px] uppercase tracking-wider text-muted">{m.texto} por día · últimos {ventana} días</div>
          <BotonInfo titulo="Productividad del equipo">
            Lo que el equipo cerró cada día. <b>Servicios concluidos</b> son los días de servicio que se
            terminaron en la app. <b>Horas en sitio</b> van de la llegada al cierre de cada servicio, sin
            pausas; si el servicio no tiene horas registradas, se toman la llegada y la salida de
            su reporte. <b>Reportes entregados</b> cuentan por la fecha del servicio. La línea
            punteada es el periodo anterior, y al señalar un día se ve su dato junto al de este periodo; el porcentaje compara los
            totales de los dos periodos. Hoy todavía está en curso.
          </BotonInfo>
        </div>

        {!hayAlgo ? (
          <p className="text-[13px] text-muted py-6">Todavía no hay actividad registrada en este periodo.</p>
        ) : (
          <>
            <LineaInteractiva
              key={`${metrica}-${ventana}`}
              puntos={actuales.map((d, i) => ({ valor: d[metrica], etiqueta: nombreDia(d.fecha, false), info: info(d, i) }))}
              previos={previos.map((d) => d[metrica])}
              formatoEje={m.eje}
              descripcion={`${m.texto} por día: ${actuales.map((d) => `${nombreDia(d.fecha, false)}, ${m.valor(d[metrica])}`).join('; ')}`}
            />
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2.5 text-[11.5px] text-muted">
              <span className="flex items-center gap-1.5"><span className="w-4 h-[3px] rounded-full bg-teal" /> Este periodo</span>
              <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-muted/70" /> Periodo anterior</span>
              {mejor && (
                <span className="sm:ml-auto text-ink/85">
                  Mejor día: <b>{nombreDia(mejor.fecha)}</b> · {m.valor(mejor[metrica])} {m.clave === 'minutos' ? '' : m.corto}
                  {promedio !== null && <span className="text-muted"> · promedio {m.valor(promedio)} por día con actividad</span>}
                </span>
              )}
            </div>
          </>
        )}
      </Marco>
    </ZonaGraficas>
  );
}
