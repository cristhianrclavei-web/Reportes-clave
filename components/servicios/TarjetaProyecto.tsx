'use client';

import Link from 'next/link';
import {
  X, FileText, AlertTriangle, Timer, MapPin, Play, Check, Clock, TrendingUp, ChevronRight, ChevronDown,
  Trash2, CalendarClock, CheckCircle2, Users, CircleDashed,
} from 'lucide-react';
import { Servicio, calcularEstadoTiempo, ProgresoTareas, ConfirmacionTecnico } from '@/lib/serviciosProgramados';
import { calcularResultadoServicio } from '@/lib/resultadoServicio';
import { ResultadoIconos } from '@/components/ResultadoServicioBadges';
import ConfirmacionTecnicos, { ResumenConfirmacion } from '@/components/ConfirmacionTecnicos';
import { AvatarTecnico } from '@/components/AvatarTecnico';

// Tarjeta de un proyecto (uno o varios días) en Servicios → Agendados y
// Concluidos. Arriba lo que el supervisor busca de un vistazo: cuándo, en
// qué estado va y quién va; abajo, al abrirla, cada día con su detalle.

export type GrupoProyecto = { grupoId: string; proyecto: string; dias: Servicio[] };

export const ESTADO_DIA: Record<Servicio['estado'], { label: string; cls: string; Icono: any }> = {
  programado: { label: 'Programado', cls: 'bg-surface-2 text-muted', Icono: Clock },
  en_sitio: { label: 'En sitio', cls: 'bg-amber/15 text-amber', Icono: MapPin },
  en_curso: { label: 'En curso', cls: 'bg-teal/15 text-teal', Icono: Play },
  concluido: { label: 'Concluido', cls: 'bg-teal/15 text-teal', Icono: Check },
  cancelado: { label: 'Cancelado', cls: 'bg-surface-2 text-faint', Icono: X },
};

// Estado del proyecto completo, en una sola etiqueta. El color también pinta
// la franja lateral y el bloque de la fecha.
type EstadoProyecto = 'concluido' | 'en_curso' | 'atrasado' | 'hoy' | 'manana' | 'proximo';

// Mismos colores que la Agenda: morado = en curso, azul cielo = hoy.
const ESTILO_PROYECTO: Record<EstadoProyecto, { label: string; chip: string; franja: string; bloque: string }> = {
  en_curso: { label: 'En curso', chip: 'bg-[#8b5cf6]/15 text-[#8b5cf6]', franja: 'bg-[#8b5cf6]', bloque: 'bg-[#8b5cf6]/12 text-[#8b5cf6] border-[#8b5cf6]/30' },
  hoy: { label: 'Hoy', chip: 'bg-sky-500/15 text-sky-500', franja: 'bg-sky-500', bloque: 'bg-sky-500/12 text-sky-500 border-sky-500/30' },
  manana: { label: 'Mañana', chip: 'bg-teal/15 text-teal', franja: 'bg-teal', bloque: 'bg-teal/12 text-teal border-teal/25' },
  proximo: { label: 'Próximo', chip: 'bg-surface-2 text-ink/70', franja: 'bg-line-strong', bloque: 'bg-surface-2 text-ink border-line' },
  atrasado: { label: 'Sin cerrar', chip: 'bg-red/15 text-red', franja: 'bg-red', bloque: 'bg-red/12 text-red border-red/25' },
  concluido: { label: 'Concluido', chip: 'bg-teal/15 text-teal', franja: 'bg-teal', bloque: 'bg-teal/12 text-teal border-teal/25' },
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function partesFecha(fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = new Date(y, m - 1, d).getDay();
  return { dia: d, mes: MESES[m - 1], semana: DIAS_SEMANA[dia] };
}

function fechaCorta(fecha: string): string {
  const p = partesFecha(fecha);
  return `${p.semana} ${p.dia} ${p.mes}`;
}

// «09:15:00» → «9:15 a.m.»
function hora12(hora: string | null): string | null {
  if (!hora) return null;
  const [h, m] = hora.split(':').map(Number);
  const sufijo = h < 12 ? 'a.m.' : 'p.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`;
}

function sumarUnDia(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const enCampo = (d: Servicio) => d.estado === 'en_sitio' || d.estado === 'en_curso';
const pendiente = (d: Servicio) => d.estado !== 'concluido' && d.estado !== 'cancelado';

export function estadoDelProyecto(dias: Servicio[], hoy: string): EstadoProyecto {
  if (dias.every((d) => !pendiente(d))) return 'concluido';
  if (dias.some(enCampo)) return 'en_curso';
  // Un día que ya pasó y nadie cerró: lo primero que hay que atender.
  if (dias.some((d) => d.estado === 'programado' && d.fecha < hoy)) return 'atrasado';
  if (dias.some((d) => pendiente(d) && d.fecha === hoy)) return 'hoy';
  if (dias.some((d) => pendiente(d) && d.fecha === sumarUnDia(hoy))) return 'manana';
  return 'proximo';
}

// El día que importa ahora: el siguiente por trabajar o, si ya terminó, el último.
function diaDeReferencia(dias: Servicio[]): Servicio {
  return dias.find(pendiente) || dias[dias.length - 1];
}

// Personal asignado en todo el proyecto, sin repetir.
function personalDelProyecto(dias: Servicio[], confirmaciones: Record<string, ConfirmacionTecnico[]>): ConfirmacionTecnico[] {
  const vistos = new Map<string, ConfirmacionTecnico>();
  dias.forEach((d) => (confirmaciones[d.id] || []).forEach((c) => {
    if (!vistos.has(c.tecnico_id)) vistos.set(c.tecnico_id, c);
  }));
  return Array.from(vistos.values());
}

const MAX_CARAS = 4;

function CarasPersonal({ personal }: { personal: ConfirmacionTecnico[] }) {
  if (personal.length === 0) {
    return (
      <span className="text-[12.5px] text-faint flex items-center gap-1.5">
        <Users size={14} strokeWidth={2.3} /> Sin personal
      </span>
    );
  }
  const visibles = personal.slice(0, MAX_CARAS);
  const resto = personal.length - visibles.length;
  const nombres = personal.map((p) => p.nombre).join(', ');
  return (
    <span className="flex items-center" title={nombres} aria-label={`Personal: ${nombres}`}>
      {visibles.map((p, i) => (
        <span key={p.tecnico_id} className={`rounded-full ring-2 ring-surface ${i > 0 ? '-ml-2' : ''}`} style={{ zIndex: MAX_CARAS - i }}>
          <AvatarTecnico id={p.tecnico_id} nombre={p.nombre} size={28} />
        </span>
      ))}
      {resto > 0 && (
        <span className="-ml-2 w-7 h-7 rounded-full ring-2 ring-surface bg-surface-2 text-[11px] font-bold text-ink/70 flex items-center justify-center">
          +{resto}
        </span>
      )}
      {personal.length === 1 && (
        <span className="ml-2 text-[12.5px] text-ink/75 truncate max-w-[140px]">{personal[0].nombre.split(' ')[0]}</span>
      )}
    </span>
  );
}

// Un segmento por día: lleno si se concluyó, latiendo si se trabaja ahora.
function TiraDeDias({ dias, hoy }: { dias: Servicio[]; hoy: string }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {dias.map((d) => {
        let cls = 'bg-surface-2 border border-line';
        if (d.estado === 'concluido') cls = d.report_id ? 'bg-teal' : 'bg-teal/45';
        else if (enCampo(d)) cls = 'bg-[#8b5cf6] animate-pulse';
        else if (d.estado === 'cancelado') cls = 'bg-line';
        else if (d.fecha < hoy) cls = 'bg-red/60';
        else if (d.fecha === hoy) cls = 'bg-sky-500/60';
        return <span key={d.id} title={`Día ${d.numero_dia} · ${fechaCorta(d.fecha)}`} className={`h-1.5 flex-1 rounded-full ${cls}`} />;
      })}
    </div>
  );
}

export default function TarjetaProyecto({
  grupo, progreso, confirmaciones, seccion, abierto, onAlternar, onEliminarDia, onEliminarProyecto, indice, hoy,
}: {
  grupo: GrupoProyecto;
  progreso?: ProgresoTareas;
  confirmaciones: Record<string, ConfirmacionTecnico[]>;
  seccion: 'agendados' | 'concluidos';
  abierto: boolean;
  onAlternar: () => void;
  onEliminarDia: (d: Servicio) => void;
  onEliminarProyecto: () => void;
  indice: number;
  hoy: string;
}) {
  const { dias } = grupo;
  const diasTotales = dias[0]?.dias_totales || dias.length;
  const diasConReporte = dias.filter((d) => d.report_id).length;
  const estado = estadoDelProyecto(dias, hoy);
  const estilo = ESTILO_PROYECTO[estado];
  const referencia = diaDeReferencia(dias);
  const fechaBloque = seccion === 'concluidos' ? dias[dias.length - 1].fecha : referencia.fecha;
  const bloque = partesFecha(fechaBloque);
  const personal = personalDelProyecto(dias, confirmaciones);
  const confirmacionesPendientes = dias.filter((d) => d.estado === 'programado').flatMap((d) => confirmaciones[d.id] || []);
  const direccion = referencia.ubicacion_programada?.direccion;
  const llegada = hora12(referencia.hora_programada);
  const salida = hora12(referencia.hora_salida_programada);
  const pct = progreso && progreso.total > 0 ? progreso.pct : null;

  let rango = fechaCorta(dias[0].fecha);
  if (diasTotales > 1) rango = `${fechaCorta(dias[0].fecha)} – ${fechaCorta(dias[dias.length - 1].fecha)}`;

  return (
    <article
      className="tarjeta-proyecto group/tarjeta relative rounded-2xl border border-line bg-surface overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-diffuse"
      // Aparecen en cascada al cargar la lista (tope para que la décima no espere de más).
      style={{ animationDelay: `${Math.min(indice, 8) * 45}ms` }}
    >
      {/* Franja del color del estado */}
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${estilo.franja}`} aria-hidden />

      <button onClick={onAlternar} aria-expanded={abierto} className="w-full text-left pl-5 pr-4 pt-4 pb-3.5 active:scale-[0.995] transition-transform">
        <div className="flex items-start gap-3.5">
          {/* Bloque de calendario: el día que importa ahora */}
          <div className={`shrink-0 w-[54px] rounded-xl border text-center overflow-hidden ${estilo.bloque}`}>
            <p className="text-[10.5px] font-bold uppercase tracking-wider pt-1.5 opacity-80">{bloque.mes}</p>
            <p className="font-display font-bold text-[22px] leading-none py-0.5">{bloque.dia}</p>
            <p className="text-[10.5px] font-semibold pb-1.5 opacity-70">{bloque.semana}</p>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display font-bold text-[16.5px] leading-snug min-w-0 truncate">{grupo.proyecto}</h3>
              <span className={`shrink-0 text-[11.5px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${estilo.chip}`}>
                {estado === 'en_curso' && (
                  <span className="relative flex w-2 h-2">
                    <span className="absolute inset-0 rounded-full bg-[#8b5cf6] animate-ping opacity-60" />
                    <span className="relative w-2 h-2 rounded-full bg-[#8b5cf6]" />
                  </span>
                )}
                {estado === 'concluido' && <CheckCircle2 size={12} strokeWidth={2.7} />}
                {estado === 'atrasado' && <AlertTriangle size={12} strokeWidth={2.7} />}
                {estilo.label}
              </span>
            </div>

            {/* Renglones de una línea y siempre presentes: así todas las
                tarjetas miden lo mismo aunque a alguna le falten datos. */}
            <p className="text-[12.5px] text-muted mt-1 flex items-center gap-1.5 min-w-0">
              <CalendarClock size={13} strokeWidth={2.3} className="shrink-0" />
              <span className="truncate">
                {diasTotales > 1 ? `${diasTotales} días · ${rango}` : rango}
                {llegada && seccion === 'agendados' && (
                  <span className="text-ink/70"> · {llegada}{salida ? ` – ${salida}` : ''}</span>
                )}
              </span>
            </p>
            <p className={`text-[12.5px] mt-0.5 flex items-center gap-1.5 min-w-0 ${direccion ? 'text-muted' : 'text-faint'}`}>
              <MapPin size={13} strokeWidth={2.3} className="shrink-0" />
              <span className="truncate">{direccion || 'Sin dirección registrada'}</span>
            </p>
          </div>
        </div>

        {/* Avance: días trabajados y tareas del proyecto */}
        <div className="mt-3.5">
          <TiraDeDias dias={dias} hoy={hoy} />
          <div className="flex items-center gap-2.5 mt-2.5 h-[18px]">
            <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Tareas completadas">
              {pct !== null && (
                <div className={`barra-avance h-full rounded-full ${pct >= 100 ? 'bg-teal' : 'bg-gradient-to-r from-amber to-amber/70'}`} style={{ width: `${pct}%` }} />
              )}
            </div>
            {pct !== null ? (
              <span className={`text-[12.5px] font-display font-bold tabular-nums shrink-0 ${pct >= 100 ? 'text-teal' : 'text-amber'}`}>{pct}%</span>
            ) : (
              <span className="text-[11.5px] text-faint shrink-0">Sin tareas</span>
            )}
          </div>
        </div>

        {/* Pie: quién va, confirmaciones y reportes */}
        <div className="mt-3.5 pt-3 border-t border-line flex items-center gap-2.5 h-[44px] min-w-0 whitespace-nowrap">
          <CarasPersonal personal={personal} />
          {seccion === 'agendados' && confirmacionesPendientes.length > 0 && (
            <ResumenConfirmacion items={confirmacionesPendientes} />
          )}
          <span className="ml-auto flex items-center gap-2 shrink-0">
            <span
              className={`text-[12px] font-semibold flex items-center gap-1 tabular-nums ${diasConReporte === diasTotales ? 'text-teal' : 'text-muted'}`}
              title="Días con reporte"
            >
              <FileText size={13} strokeWidth={2.4} />
              {diasConReporte}/{diasTotales}
            </span>
            <span className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center text-muted transition-colors group-hover/tarjeta:text-ink">
              <ChevronDown size={16} strokeWidth={2.4} className={`transition-transform duration-300 ${abierto ? 'rotate-180' : ''}`} />
            </span>
          </span>
        </div>
      </button>

      {/* Detalle por día: se despliega con una transición de altura */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${abierto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="border-t border-line bg-bg/40 px-3 pb-3 pt-3 flex flex-col gap-2">
            {diasTotales > 1 && (
              <Link
                href={`/dashboard/servicios/proyecto/${grupo.grupoId}`}
                className="group/avance flex items-center justify-between gap-2 px-3.5 min-h-[44px] rounded-xl bg-teal/10 border border-teal/25 text-teal text-[13.5px] font-semibold transition-colors hover:bg-teal/15"
              >
                <span className="flex items-center gap-2">
                  <TrendingUp size={16} strokeWidth={2.4} />
                  Ver el avance del proyecto
                </span>
                <ChevronRight size={16} strokeWidth={2.4} className="transition-transform group-hover/avance:translate-x-0.5" />
              </Link>
            )}

            {dias.map((d) => (
              <FilaDia
                key={d.id}
                dia={d}
                progreso={progreso}
                confirmaciones={confirmaciones[d.id] || []}
                proyecto={grupo.proyecto}
                puedeEliminar={dias.length > 1 && pendiente(d) && d.estado !== 'en_curso' && !d.report_id}
                onEliminar={() => onEliminarDia(d)}
              />
            ))}

            <button
              type="button"
              onClick={onEliminarProyecto}
              className="self-start mt-0.5 min-h-[38px] px-2 text-[12.5px] font-semibold text-red/85 hover:text-red flex items-center gap-1.5 active:scale-95 transition"
            >
              <Trash2 size={14} strokeWidth={2.4} />
              {dias.length > 1 ? 'Eliminar el proyecto completo' : 'Eliminar este servicio'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function FilaDia({ dia, progreso, confirmaciones, proyecto, puedeEliminar, onEliminar }: {
  dia: Servicio;
  progreso?: ProgresoTareas;
  confirmaciones: ConfirmacionTecnico[];
  proyecto: string;
  puedeEliminar: boolean;
  onEliminar: () => void;
}) {
  const tiempo = calcularEstadoTiempo(dia);
  const cfg = ESTADO_DIA[dia.estado];
  const llegada = hora12(dia.hora_programada);
  return (
    <div className="flex items-stretch gap-1.5">
      <Link
        href={`/dashboard/servicios/${dia.id}`}
        className="group/dia flex-1 min-w-0 flex justify-between items-center gap-2 rounded-xl bg-surface border border-line px-3.5 py-2.5 transition-all duration-150 hover:border-teal/40 active:scale-[0.99]"
      >
        <div className="min-w-0">
          <span className="text-[14px] font-semibold flex items-center gap-2">
            <ResultadoIconos resultado={calcularResultadoServicio(dia, progreso)} size={15} />
            {dia.dias_totales > 1 ? `Día ${dia.numero_dia} · ` : ''}
            <span className="first-letter:uppercase">{fechaCorta(dia.fecha)}</span>
            {llegada && <span className="text-[12.5px] font-normal text-muted">{llegada}</span>}
          </span>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${cfg.cls}`}>
              <cfg.Icono size={12} strokeWidth={2.6} />
              {cfg.label}
            </span>
            {dia.report_id && (
              <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-teal/15 text-teal flex items-center gap-1.5">
                <FileText size={12} strokeWidth={2.6} />Con reporte
              </span>
            )}
            {!dia.report_id && dia.estado === 'concluido' && (
              <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-surface-2 text-muted flex items-center gap-1.5">
                <CircleDashed size={12} strokeWidth={2.6} />Sin reporte
              </span>
            )}
            {dia.cierre_tipo === 'automatico' && (
              <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-amber/15 text-amber flex items-center gap-1.5">
                <AlertTriangle size={12} strokeWidth={2.6} />Cierre por confirmar
              </span>
            )}
            {tiempo.tipo === 'retraso' && (
              <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-red/15 text-red flex items-center gap-1.5">
                <AlertTriangle size={12} strokeWidth={2.6} />{tiempo.minutos} min
              </span>
            )}
            {tiempo.tipo === 'excedido' && (
              <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-amber/15 text-amber flex items-center gap-1.5">
                <Timer size={12} strokeWidth={2.6} />Excedido
              </span>
            )}
          </div>
          {dia.estado === 'programado' && confirmaciones.length > 0 && (
            <ConfirmacionTecnicos items={confirmaciones} className="mt-1.5" />
          )}
        </div>
        <ChevronRight size={16} strokeWidth={2.4} className="text-muted shrink-0 transition-transform group-hover/dia:translate-x-0.5" />
      </Link>
      {/* Quitar un día suelto: solo si ese día no se ha trabajado (lo trabajado es respaldo). */}
      {puedeEliminar && (
        <button
          type="button"
          onClick={onEliminar}
          aria-label={`Eliminar el día ${dia.numero_dia} de ${proyecto}`}
          title="Eliminar este día"
          className="shrink-0 w-11 rounded-xl bg-surface border border-line text-muted flex items-center justify-center transition-colors hover:text-red hover:border-red/40 active:scale-90"
        >
          <Trash2 size={16} strokeWidth={2.3} />
        </button>
      )}
    </div>
  );
}

// Resumen arriba de la lista: cuatro números que dicen qué atender primero.
// Cada uno filtra la lista al tocarlo (otra vez, quita el filtro).
export type FiltroEstado = EstadoProyecto | 'sin_confirmar' | 'sin_reporte' | null;

export function ResumenProyectos({ grupos, confirmaciones, seccion, hoy, filtro, onFiltro }: {
  grupos: GrupoProyecto[];
  confirmaciones: Record<string, ConfirmacionTecnico[]>;
  seccion: 'agendados' | 'concluidos';
  hoy: string;
  filtro: FiltroEstado;
  onFiltro: (f: FiltroEstado) => void;
}) {
  const contar = (f: Exclude<FiltroEstado, null>) => grupos.filter((g) => cumpleFiltro(g, f, confirmaciones, hoy)).length;

  let tarjetas: { f: Exclude<FiltroEstado, null>; label: string; valor: number; color: string; Icono: any }[];
  if (seccion === 'agendados') {
    tarjetas = [
      { f: 'en_curso', label: 'En curso', valor: contar('en_curso'), color: 'text-[#8b5cf6]', Icono: Play },
      { f: 'hoy', label: 'Hoy', valor: contar('hoy'), color: 'text-sky-500', Icono: CalendarClock },
      { f: 'sin_confirmar', label: 'Sin confirmar', valor: contar('sin_confirmar'), color: 'text-amber', Icono: Users },
      { f: 'atrasado', label: 'Sin cerrar', valor: contar('atrasado'), color: 'text-red', Icono: AlertTriangle },
    ];
  } else {
    const conReporte = grupos.length - contar('sin_reporte');
    tarjetas = [
      { f: 'concluido', label: 'Proyectos', valor: grupos.length, color: 'text-teal', Icono: CheckCircle2 },
      { f: 'sin_reporte', label: 'Falta reporte', valor: contar('sin_reporte'), color: 'text-amber', Icono: CircleDashed },
    ];
    // Proporción de proyectos con todos sus reportes: el dato que pide Facturación.
    if (grupos.length > 0) {
      tarjetas.push({ f: 'concluido', label: 'Completos', valor: conReporte, color: 'text-ink', Icono: FileText });
    }
  }

  return (
    <div className={`grid gap-2 lg:gap-2.5 mb-4 ${seccion === 'agendados' ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {tarjetas.map((t, i) => {
        const activo = filtro === t.f && !(seccion === 'concluidos' && t.f === 'concluido');
        const filtrable = !(seccion === 'concluidos' && t.f === 'concluido');
        return (
          <button
            key={t.label}
            type="button"
            disabled={!filtrable}
            onClick={() => onFiltro(activo ? null : t.f)}
            aria-pressed={filtrable ? activo : undefined}
            className={`tarjeta-proyecto text-left rounded-2xl border px-2.5 py-2 lg:px-4 lg:py-3 min-w-0 transition-all duration-200 disabled:cursor-default ${
              activo ? 'border-teal/50 bg-teal/10 shadow-diffuse' : 'border-line bg-surface enabled:hover:border-line-strong enabled:hover:-translate-y-0.5'
            }`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="flex items-center justify-between">
              <span className="text-[11px] lg:text-[12px] font-semibold text-muted leading-tight">{t.label}</span>
              <t.Icono size={15} strokeWidth={2.4} className={`hidden lg:block shrink-0 ${t.valor > 0 ? t.color : 'text-faint'}`} />
            </span>
            <span className={`block font-display font-bold text-[21px] lg:text-[26px] leading-tight tabular-nums mt-0.5 ${t.valor > 0 ? t.color : 'text-faint'}`}>{t.valor}</span>
          </button>
        );
      })}
    </div>
  );
}

export function cumpleFiltro(g: GrupoProyecto, f: Exclude<FiltroEstado, null>, confirmaciones: Record<string, ConfirmacionTecnico[]>, hoy: string): boolean {
  if (f === 'sin_confirmar') {
    return g.dias.some((d) => d.estado === 'programado' && (confirmaciones[d.id] || []).some((c) => !c.enterado_en));
  }
  if (f === 'sin_reporte') return g.dias.some((d) => d.estado === 'concluido' && !d.report_id);
  return estadoDelProyecto(g.dias, hoy) === f;
}
