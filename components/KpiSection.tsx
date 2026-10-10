'use client';

import { useEffect, useMemo, useState } from 'react';
import { ReportDetail } from './ReportDetailModal';
import BotonInfo from '@/components/BotonInfo';
import { hoyLocal } from '@/lib/fechaHoy';
import { MARCA } from '@/lib/marca';
import { ZonaGraficas, Marco, Punto, Crece, Contador, Dona, LineaInteractiva, InfoPunto, COLOR } from '@/components/Graficas';

// «Ing. Everardo Sánchez» → «Ing. Sánchez»: quien firma la revisión, en corto.
const REVISOR_PARTES = MARCA.revisor.trim().split(/\s+/);
const REVISOR_CORTO = REVISOR_PARTES.length > 2
  ? `${REVISOR_PARTES[0]} ${REVISOR_PARTES[REVISOR_PARTES.length - 1]}`
  : MARCA.revisor;

type Report = ReportDetail;

function parseTimeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function reportDurationMinutes(r: Report): number | null {
  const a = parseTimeToMinutes(r.data?.horaLlegada);
  const b = parseTimeToMinutes(r.data?.horaSalida);
  if (a === null || b === null) return null;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60; // por si el servicio cruza la medianoche
  if (diff <= 0 || diff > 14 * 60) return null; // descarta capturas con error evidente (> 14h)
  return diff;
}

function formatDuracion(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function isCompletado(r: Report): boolean {
  // "Completado" ahora significa que el Ing. Everardo Sánchez ya revisó y firmó el reporte.
  return Boolean(r.data?.firmaRevisionData);
}
function tieneObservaciones(r: Report): boolean {
  return Boolean(r.data?.observaciones?.trim()) || (r.data?.casoPuntos || []).length > 0;
}

export default function KpiSection({ reports }: { reports: Report[] }) {
  const [periodo, setPeriodo] = useState<'dia' | 'semana'>('semana');
  // "Hoy"/"esta semana" dependen de la hora del navegador, que puede no
  // coincidir con la del servidor (Vercel corre en UTC) — ver el comentario
  // en components/SelectorSemana.tsx. Mismo patrón: arranca en null (mismo
  // valor en servidor y primer render del cliente) y se corrige ya montado.
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => setAhora(Date.now()), []);

  const kpiReports = useMemo(() => {
    if (ahora === null) return [];
    const today = hoyLocal(new Date(ahora));
    const weekAgo = new Date(ahora - 7 * 864e5);
    if (periodo === 'dia') return reports.filter((r) => r.fecha === today);
    return reports.filter((r) => new Date(r.created_at) >= weekAgo);
  }, [reports, periodo, ahora]);

  const { avgLabel, avgSampleSize } = useMemo(() => {
    const durations = kpiReports.map(reportDurationMinutes).filter((d): d is number => d !== null);
    if (durations.length === 0) return { avgLabel: '—', avgSampleSize: 0 };
    const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
    return { avgLabel: formatDuracion(avg), avgSampleSize: durations.length };
  }, [kpiReports]);

  const { completados, pendientes, pctCompletados } = useMemo(() => {
    const total = kpiReports.length;
    const completados = kpiReports.filter(isCompletado).length;
    const pendientes = total - completados;
    return { completados, pendientes, pctCompletados: total > 0 ? (completados / total) * 100 : 0 };
  }, [kpiReports]);

  const { conformes, conObservaciones, sinFirma } = useMemo(() => {
    let conformes = 0;
    let conObservaciones = 0;
    let sinFirma = 0;
    kpiReports.forEach((r) => {
      if (!r.data?.firmaClienteData) {
        sinFirma++;
      } else if (tieneObservaciones(r)) {
        conObservaciones++;
      } else {
        conformes++;
      }
    });
    return { conformes, conObservaciones, sinFirma };
  }, [kpiReports]);

  const totalConformidad = conformes + conObservaciones + sinFirma;

  // Últimos 7 días: cuántos reportes hubo cada día y cuánto duró en promedio
  // el servicio. Siempre es la semana, sin importar el periodo elegido.
  const dias = useMemo(() => {
    if (ahora === null) return [];
    return Array.from({ length: 7 }, (_, i) => {
      const fecha = hoyLocal(new Date(ahora - (6 - i) * 864e5));
      const delDia = reports.filter((r) => r.fecha === fecha);
      const dur = delDia.map(reportDurationMinutes).filter((d): d is number => d !== null);
      const [y, m, d] = fecha.split('-').map(Number);
      return {
        fecha,
        n: delDia.length,
        duracion: dur.length ? dur.reduce((a, b) => a + b, 0) / dur.length : null,
        letra: ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(y, m - 1, d).getDay()],
        dia: d,
        nombre: new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }),
        esHoy: i === 6,
      };
    });
  }, [reports, ahora]);
  const maxDia = Math.max(1, ...dias.map((d) => d.n));
  const totalSemana = dias.reduce((a, d) => a + d.n, 0);

  // Qué sistemas se atendieron en el periodo (un reporte puede llevar varios).
  const sistemas = useMemo(() => {
    const cuenta = new Map<string, number>();
    kpiReports.forEach((r) => {
      const lista: string[] = Array.isArray(r.data?.sistemaSeguridad) ? r.data.sistemaSeguridad : [];
      lista.forEach((sis) => {
        const nombre = sis === 'Otra' ? (r.data?.seguridadOtraTexto?.trim() || 'Otro') : sis === 'Alarma&Det' ? 'Alarma y detección' : sis;
        cuenta.set(nombre, (cuenta.get(nombre) || 0) + 1);
      });
    });
    return Array.from(cuenta.entries()).map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n).slice(0, 6);
  }, [kpiReports]);
  const maxSistema = Math.max(1, ...sistemas.map((x) => x.n));

  return (
    <ZonaGraficas className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold text-[15px] tracking-wide">KPIs operativos</h2>
        <div className="flex items-center gap-1 bg-surface-2 rounded-full p-1 border border-line">
          {(['dia', 'semana'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                periodo === p ? 'bg-teal text-inkOnAccent' : 'text-muted'
              }`}
            >
              {p === 'dia' ? 'Hoy' : 'Esta semana'}
            </button>
          ))}
        </div>
      </div>

      {/* Fila 1: el ritmo de la semana y en qué se trabajó */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3 mb-3">
        {/* Reportes por día: columnas */}
        <Marco className="glass rounded-2xl p-4 lg:p-5 flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Reportes por día · últimos 7 días</div>
              <p className="leading-none">
                <Contador valor={totalSemana} className="font-display text-[30px] font-bold" />
                <span className="text-[12.5px] text-muted"> reporte{totalSemana === 1 ? '' : 's'} en la semana</span>
              </p>
            </div>
            <BotonInfo titulo="Reportes por día">
              Cuántos reportes de servicio se entregaron cada día de la última semana, por la fecha
              del servicio. La columna de hoy va resaltada.
            </BotonInfo>
          </div>
          <div className="relative flex-1 flex flex-col">
            <div className="flex-1 flex items-end gap-2 sm:gap-3 min-h-[150px] border-b border-line-strong">
              {dias.map((d, i) => (
                <Punto key={d.fecha} grupo="dias" className="relative flex-1 h-full flex flex-col justify-end items-center"
                  etiqueta={`${d.nombre}: ${d.n} reporte${d.n === 1 ? '' : 's'}`}
                  info={
                    <InfoPunto
                      titulo={`${d.nombre}${d.esHoy ? ' · hoy' : ''}`}
                      filas={[
                        { color: COLOR.acento, texto: 'Reportes entregados', valor: d.n },
                        ...(d.duracion !== null ? [{ texto: 'Duración promedio', valor: formatDuracion(d.duracion) }] : []),
                        ...(totalSemana > 0 ? [{ texto: 'Parte de la semana', valor: `${Math.round((d.n / totalSemana) * 100)}%` }] : []),
                      ]}
                      nota={d.n === 0 ? 'Sin reportes ese día.' : d.n === maxDia ? 'El día más productivo de la semana.' : undefined}
                    />
                  }>
                  {(activo, otro) => (
                    <>
                      <span className={`text-[12px] font-semibold tabular-nums mb-1 transition-colors ${d.n === 0 ? 'text-faint' : activo ? 'text-teal' : ''}`}>{d.n}</span>
                      <Crece eje="y" orden={i} data-ancla="" pct={d.n === 0 ? 2 : Math.max(6, (d.n / maxDia) * 100 * 0.82)}
                        className={`w-full max-w-[56px] rounded-t-[5px] transition-[background-color,opacity,box-shadow] duration-200 ${
                          activo ? 'bg-teal shadow-glow-teal' : d.esHoy ? 'bg-teal' : 'bg-teal/45'} ${otro ? 'opacity-55' : ''}`} />
                    </>
                  )}
                </Punto>
              ))}
            </div>
            <div className="flex gap-2 sm:gap-3 mt-1.5">
              {dias.map((d) => (
                <div key={d.fecha} className={`flex-1 text-center text-[11px] leading-tight ${d.esHoy ? 'text-teal font-semibold' : 'text-muted'}`}>
                  {d.letra} {d.dia}
                  {d.esHoy && <span className="block text-[10px]">hoy</span>}
                </div>
              ))}
            </div>
          </div>
        </Marco>

        {/* Sistemas atendidos: barras horizontales, de más a menos */}
        <Marco className="glass rounded-2xl p-4 lg:p-5">
          <div className="flex items-center gap-1.5 mb-4">
            <div className="text-[10px] uppercase tracking-wider text-muted">Sistemas atendidos · {periodo === 'dia' ? 'hoy' : 'esta semana'}</div>
            <BotonInfo titulo="Sistemas atendidos">
              En qué tipo de sistema se trabajó, según lo que marca cada reporte. Un reporte puede
              contar en más de un sistema.
            </BotonInfo>
          </div>
          {sistemas.length === 0 ? (
            <p className="text-[13px] text-muted">Sin reportes en el periodo.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {sistemas.map((x, i) => (
                <Punto key={x.nombre} grupo="sistemas" etiqueta={`${x.nombre}: ${x.n} reporte${x.n === 1 ? '' : 's'}`}
                  info={
                    <InfoPunto titulo={x.nombre}
                      filas={[
                        { color: COLOR.acento, texto: 'Reportes', valor: x.n },
                        { texto: 'Del trabajo del periodo', valor: `${Math.round((x.n / Math.max(1, kpiReports.length)) * 100)}%` },
                      ]}
                      nota={i === 0 ? 'El sistema más atendido.' : undefined} />
                  }>
                  {(activo, otro) => (
                    <div className={`transition-opacity duration-200 ${otro ? 'opacity-55' : ''}`}>
                      <div className="flex justify-between items-baseline gap-2 mb-1">
                        <span className={`text-[12.5px] truncate transition-colors ${activo ? 'text-teal font-semibold' : 'text-ink/85'}`}>{x.nombre}</span>
                        <span className="text-[12.5px] font-semibold tabular-nums shrink-0">{x.n}</span>
                      </div>
                      <div className="h-2.5 rounded-r-[4px] bg-surface-2 overflow-hidden" data-ancla="">
                        <Crece orden={i} pct={(x.n / maxSistema) * 100} className={`h-full rounded-r-[4px] bg-teal transition-[filter] duration-200 ${activo ? 'brightness-125' : ''}`} />
                      </div>
                    </div>
                  )}
                </Punto>
              ))}
            </div>
          )}
        </Marco>
      </div>

      {/* Fila 2: tiempo, cierre y conformidad */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Tiempo promedio de atención: cifra + tendencia */}
        <Marco className="glass rounded-2xl p-4 lg:p-5 flex flex-col">
          <div className="flex items-center gap-1.5 mb-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="text-[10px] uppercase tracking-wider text-muted">Tiempo promedio de atención</div>
            <BotonInfo titulo="Tiempo promedio de atención">
              Cuánto dura un servicio en sitio, de la hora de llegada a la de salida que se
              capturan en el reporte. Solo entran los reportes con ambas horas, y se descartan
              los de más de 14 horas: eso no es un servicio largo, es alguien que olvidó cerrar.
              La línea muestra el promedio de cada día de la última semana.
            </BotonInfo>
          </div>
          <div className="font-display text-[30px] font-bold leading-none mb-1.5">{avgLabel}</div>
          <p className="text-[11px] text-muted mb-3">
            {avgSampleSize > 0
              ? `Desde llegada hasta salida · ${avgSampleSize} reporte${avgSampleSize > 1 ? 's' : ''} con hora registrada`
              : 'Sin reportes con hora de llegada y salida capturadas'}
          </p>
          {dias.filter((d) => d.duracion !== null).length >= 2 && (
            <div className="mt-auto">
              <LineaInteractiva
                alto={84} color={COLOR.ambar} desdeCero={false} formatoEje={null} cadaEtiqueta={1}
                puntos={dias.map((d) => ({
                  valor: d.duracion,
                  etiqueta: `${d.letra} ${d.dia}`,
                  info: d.duracion === null ? null : (
                    <InfoPunto titulo={d.nombre}
                      filas={[
                        { color: COLOR.ambar, texto: 'Duración promedio', valor: formatDuracion(d.duracion) },
                        { texto: 'Reportes del día', valor: d.n },
                      ]} />
                  ),
                }))}
                descripcion={`Tendencia del tiempo promedio: ${dias.filter((d) => d.duracion !== null).map((d) => `${d.letra} ${d.dia} ${formatDuracion(d.duracion!)}`).join(', ')}`}
              />
            </div>
          )}
        </Marco>

        {/* Completados vs pendientes */}
        <Marco className="glass rounded-2xl p-4 lg:p-5">
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <div className="text-[10px] uppercase tracking-wider text-muted">Servicios completados vs. pendientes</div>
            <BotonInfo titulo="Servicios completados vs. pendientes">
              Un reporte cuenta como completado cuando lleva la firma de revisión final. Los
              pendientes son los que ya se entregaron pero todavía esperan esa revisión. No
              mide trabajo hecho en campo, sino trabajo cerrado en papel.
            </BotonInfo>
          </div>
          <div className="flex items-center gap-4">
            <Dona grupo="cierre" partes={[
              { clave: 'completados', valor: completados, color: COLOR.acento, etiqueta: `Completados: ${completados}`,
                info: <InfoPunto titulo="Completados" filas={[{ color: COLOR.acento, texto: 'Reportes', valor: completados }, { texto: 'Del periodo', valor: `${Math.round(pctCompletados)}%` }]} nota={`Ya firmados por ${REVISOR_CORTO}.`} /> },
              { clave: 'pendientes', valor: pendientes, color: COLOR.gris, etiqueta: `Pendientes: ${pendientes}`,
                info: <InfoPunto titulo="Pendientes de revisión" filas={[{ color: COLOR.gris, texto: 'Reportes', valor: pendientes }, { texto: 'Del periodo', valor: `${Math.round(100 - pctCompletados)}%` }]} nota="Entregados, esperan la firma de revisión." /> },
            ]} />
            <div className="flex flex-col gap-1.5 text-[12px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal shrink-0" />
                <span className="font-semibold">{completados}</span>
                <span className="text-muted">completados (firmados por {REVISOR_CORTO})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-line-strong shrink-0" />
                <span className="font-semibold">{pendientes}</span>
                <span className="text-muted">pendientes</span>
              </div>
            </div>
          </div>
        </Marco>

        {/* Conformidad del cliente */}
        <Marco className="glass rounded-2xl p-4 lg:p-5">
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <div className="text-[10px] uppercase tracking-wider text-muted">Conformidad del cliente</div>
            <BotonInfo titulo="Conformidad del cliente">
              Cómo quedó el cliente al cerrar el servicio. «Con firma» es conforme sin
              objeciones; «con observaciones» es que firmó pero dejó algo anotado, y ahí
              conviene leer el reporte; «pendiente de firma» es que nadie firmó, y esos no
              se pueden facturar.
            </BotonInfo>
          </div>
          {totalConformidad === 0 ? (
            <p className="text-[13px] text-muted">Sin reportes en el periodo.</p>
          ) : (
            <>
              {/* Una sola barra: las tres partes de un todo, separadas por 2 px. */}
              <div className="flex h-5 gap-[2px] mb-3.5">
                {([
                  [conformes, 'bg-teal', COLOR.acento, 'Con firma de conformidad', 'El cliente firmó sin objeciones.'],
                  [conObservaciones, 'bg-amber', COLOR.ambar, 'Con observaciones', 'Firmó, pero dejó algo anotado: conviene leer el reporte.'],
                  [sinFirma, 'bg-red', COLOR.rojo, 'Pendientes de firma', 'Sin firma no se pueden facturar.'],
                ] as const)
                  .filter(([n]) => n > 0)
                  .map(([n, clase, color, etiqueta, nota], i) => (
                    <Punto key={etiqueta} grupo="conformidad" etiqueta={`${etiqueta}: ${n}`} className="h-full min-w-[6px]" style={{ width: `${(n / totalConformidad) * 100}%` }}
                      info={<InfoPunto titulo={etiqueta} filas={[{ color, texto: 'Reportes', valor: n }, { texto: 'Del periodo', valor: `${Math.round((n / totalConformidad) * 100)}%` }]} nota={nota} />}>
                      {(activo, otro) => (
                        <Crece orden={i * 3} pct={100} data-ancla=""
                          className={`${clase} h-full rounded-[4px] transition-[opacity,transform,filter] duration-200 origin-bottom ${activo ? 'scale-y-125 brightness-110' : ''} ${otro ? 'opacity-40' : ''}`} />
                      )}
                    </Punto>
                  ))}
              </div>
              <div className="flex flex-col gap-2">
                <ConformidadRow label="Con firma de conformidad" value={conformes} total={totalConformidad} color="bg-teal" />
                <ConformidadRow label="Con observaciones" value={conObservaciones} total={totalConformidad} color="bg-amber" />
                <ConformidadRow label="Pendientes de firma" value={sinFirma} total={totalConformidad} color="bg-red" />
              </div>
            </>
          )}
        </Marco>
      </div>
    </ZonaGraficas>
  );
}

// Renglón de la leyenda: color, etiqueta, cuántos y qué parte del total.
function ConformidadRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className={`w-2.5 h-2.5 rounded-[3px] shrink-0 ${color}`} />
      <span className="text-ink/85 flex-1 min-w-0 truncate">{label}</span>
      <span className="font-semibold tabular-nums shrink-0">{value}</span>
      <span className="text-muted tabular-nums shrink-0 w-9 text-right">{pct}%</span>
    </div>
  );
}
