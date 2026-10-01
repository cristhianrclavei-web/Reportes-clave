'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Plus, X, Download, AlertTriangle, ArrowRightLeft, FileText, Clock, UserX,
} from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import { showToast } from '@/components/Toast';
import { hoyLocal, sumarDias, fechaLocal } from '@/lib/fechaHoy';
import { etiquetaCausa } from '@/lib/avisos';
import { calcularEstadoTiempo, motivoNoEditable } from '@/lib/serviciosProgramados';
import {
  TableroDia as Datos, ServicioDia, cargarTableroDia, asignarRapido, registrarCambioDia, MOTIVOS_CAMBIO,
} from '@/lib/tableroDia';

// Tablero del día: por técnico, a qué servicios va, en qué va cada uno y si
// ya hizo su reporte. Es la hoja de Excel de la mañana, pero viva: se
// actualiza sola cada minuto con lo que los técnicos marcan en campo.

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';

function chip(sel: boolean) {
  return `px-3 py-1.5 rounded-full text-[12.5px] font-medium mr-1.5 mb-1.5 inline-block cursor-pointer border active:scale-95 transition-all ${
    sel ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 text-ink/80 border-line'
  }`;
}

function hora(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function horaCorta(h: string | null): string {
  return h ? h.slice(0, 5) : '';
}

function etiquetaFecha(f: string): string {
  const d = fechaLocal(f);
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

// Estado de un técnico en un servicio, del más avanzado al menos.
function estadoServicio(s: ServicioDia, tecnicoId: string): { texto: string; corto: string; cls: string } {
  if (s.estado === 'concluido') return { texto: `Concluyó ${hora(s.hora_fin)}`, corto: `✓ ${hora(s.hora_fin)}`, cls: 'bg-teal/15 text-teal' };
  if (s.pausado_desde) return { texto: `Pausado ${hora(s.pausado_desde)}`, corto: 'Pausado', cls: 'bg-amber/15 text-amber' };
  if (s.estado === 'en_curso') return { texto: `En curso ${hora(s.hora_inicio)}`, corto: 'En curso', cls: 'bg-teal/15 text-teal' };
  if (s.estado === 'en_sitio') return { texto: `Llegó ${hora(s.hora_llegada)}`, corto: 'En sitio', cls: 'bg-teal/10 text-teal' };
  const a = s.asignados.find((x) => x.tecnico_id === tecnicoId);
  if (a?.enterado_en) return { texto: 'Enterado', corto: 'Enterado', cls: 'bg-surface-2 text-ink/80' };
  if (a?.visto_en) return { texto: 'Visto, sin confirmar', corto: 'Visto', cls: 'bg-amber/12 text-amber' };
  return { texto: 'No lo ha visto', corto: 'Sin ver', cls: 'bg-red/12 text-red' };
}

// «Hector Cardenas» → «Hector C.» (el primer nombre solo puede repetirse).
function nombreCorto(n: string): string {
  const p = n.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0];
}

function duracion(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

type Filtro = 'todos' | 'alertas' | 'campo' | 'sin';

// ¿Ya pasó la hora acordada y nadie ha llegado?
function llegadaAtrasada(s: ServicioDia, hoy: string, minutos: number, fecha: string): number {
  if (s.estado !== 'programado' || !s.hora_programada || fecha !== hoy) return 0;
  const [h, m] = s.hora_programada.split(':').map(Number);
  const diff = minutos - (h * 60 + m);
  return diff > 15 ? diff : 0;
}

export default function TableroDia() {
  const [hoy, setHoy] = useState('');
  const [minutos, setMinutos] = useState(0);
  const [fecha, setFecha] = useState('');
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asignar, setAsignar] = useState<{ tecnicoIds: string[] } | null>(null);
  const [cambio, setCambio] = useState<ServicioDia | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const alternar = (k: string) => setAbiertos((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  useEffect(() => {
    const h = hoyLocal();
    setHoy(h);
    setFecha(h);
  }, []);

  const cargar = useCallback(async (silencioso = false) => {
    if (!fecha) return;
    if (!silencioso) setCargando(true);
    const ahora = new Date();
    setMinutos(ahora.getHours() * 60 + ahora.getMinutes());
    try {
      setDatos(await cargarTableroDia(fecha));
      setError(null);
    } catch {
      setError('No se pudo cargar el tablero. Revisa la conexión.');
    } finally {
      setCargando(false);
    }
  }, [fecha]);

  useEffect(() => {
    cargar();
    // Se refresca solo cada minuto, y al volver a la pestaña.
    const t = setInterval(() => cargar(true), 60000);
    const alVolver = () => document.visibilityState === 'visible' && cargar(true);
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [cargar]);

  // Técnicos con sus servicios del día; primero los que tienen servicio.
  const filas = useMemo(() => {
    if (!datos) return [];
    return datos.tecnicos
      .map((t) => ({
        ...t,
        servicios: datos.servicios.filter((s) => s.asignados.some((a) => a.tecnico_id === t.id)),
      }))
      .sort((a, b) => (a.servicios.length === 0 ? 1 : 0) - (b.servicios.length === 0 ? 1 : 0));
  }, [datos]);

  const resumen = useMemo(() => {
    const servicios = datos?.servicios || [];
    const conServicio = filas.filter((f) => f.servicios.length > 0).length;
    const enCampo = servicios.filter((s) => s.estado === 'en_sitio' || s.estado === 'en_curso').length;
    const concluidos = servicios.filter((s) => s.estado === 'concluido').length;
    const sinReporte = servicios.filter((s) => s.estado === 'concluido' && !s.report_id).length;
    const avisos = servicios.reduce((n, s) => n + s.avisosPendientes.length, 0);
    return { conServicio, total: filas.length, enCampo, concluidos, sinReporte, avisos, servicios: servicios.length };
  }, [datos, filas]);


  // Algo que el supervisor debe atender en este servicio.
  function alertaDe(sv: ServicioDia, tecnicoId: string): boolean {
    const t = calcularEstadoTiempo(sv);
    const e = estadoServicio(sv, tecnicoId);
    return sv.avisosPendientes.length > 0
      || llegadaAtrasada(sv, hoy, minutos, fecha) > 0
      || t.tipo === 'excedido'
      || (sv.estado === 'concluido' && !sv.report_id)
      || (e.corto === 'Sin ver' && fecha <= hoy);
  }

  const visibles = filas.filter((f) => {
    if (filtro === 'sin') return f.servicios.length === 0;
    if (filtro === 'campo') return f.servicios.some((sv) => sv.estado === 'en_sitio' || sv.estado === 'en_curso');
    if (filtro === 'alertas') return f.servicios.some((sv) => alertaDe(sv, f.id))
    return true;
  });

  async function descargarExcel() {
    if (!datos) return;
    const ExcelJS = (await import('exceljs')).default;
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Día');
    hoja.columns = [
      { header: 'Técnico', key: 'tecnico', width: 24 },
      { header: 'Servicio', key: 'servicio', width: 34 },
      { header: 'Hora acordada', key: 'hora', width: 12 },
      { header: 'Estado', key: 'estado', width: 22 },
      { header: 'Llegada', key: 'llegada', width: 10 },
      { header: 'Inicio', key: 'inicio', width: 10 },
      { header: 'Fin', key: 'fin', width: 10 },
      { header: 'Reporte del servicio', key: 'reporte', width: 18 },
      { header: 'Aviso / motivo', key: 'aviso', width: 40 },
    ];
    hoja.getRow(1).font = { bold: true };
    for (const f of filas) {
      if (f.servicios.length === 0) {
        hoja.addRow({ tecnico: f.nombre, servicio: 'Disponible (sin servicio asignado)' });
        continue;
      }
      for (const s of f.servicios) {
        hoja.addRow({
          tecnico: f.nombre,
          servicio: s.proyecto + (s.dias_totales > 1 ? ` (día ${s.numero_dia}/${s.dias_totales})` : ''),
          hora: horaCorta(s.hora_programada),
          estado: estadoServicio(s, f.id).texto,
          llegada: hora(s.hora_llegada),
          inicio: hora(s.hora_inicio),
          fin: hora(s.hora_fin),
          reporte: s.report_id ? 'Sí' : s.estado === 'concluido' ? 'FALTA' : '',
          aviso: [
            ...s.avisosPendientes.map((a) => `${etiquetaCausa(a.causa)}${a.comentario ? ': ' + a.comentario : ''}`),
            s.ultimoAviso?.nota || '',
          ].filter(Boolean).join(' · '),
        });
      }
    }
    const buf = await libro.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `servicios-${fecha}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Técnico que se muestra en el celular.
  const [selId, setSelId] = useState<string | null>(null);
  const toqueX = useRef(0);
  const tira = useRef<HTMLDivElement>(null);
  // Centra en la tira el técnico elegido (solo la tira, no la página).
  useEffect(() => {
    const cont = tira.current;
    const el = cont?.querySelector<HTMLElement>(`[data-tec="${selId}"]`);
    if (cont && el) cont.scrollTo({ left: el.offsetLeft - cont.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [selId]);
  const indiceSel = Math.max(0, visibles.findIndex((f) => f.id === selId));
  const seleccionado = visibles[indiceSel];
  function mover(paso: number) {
    const n = visibles[indiceSel + paso];
    if (n) setSelId(n.id);
  }
  // Punto de la tira: rojo si hay algo que atender, verde si ya acabó todo.
  function puntoTecnico(f: (typeof filas)[number]): string | null {
    if (f.servicios.some((sv) => alertaDe(sv, f.id))) return 'bg-red';
    if (f.servicios.length > 0 && f.servicios.every((sv) => sv.estado === 'concluido')) return 'bg-teal';
    if (f.servicios.some((sv) => sv.estado === 'en_sitio' || sv.estado === 'en_curso')) return 'bg-amber';
    return null;
  }

  function tarjeta(f: (typeof filas)[number]) {
    return (
      <div key={f.id} className="rounded-2xl bg-surface border border-line px-3.5 py-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[14.5px] font-semibold leading-tight truncate">{f.nombre}</p>
          </div>
          <div className="flex flex-col">
            {f.servicios.map((sv) => {
              const e = estadoServicio(sv, f.id);
              const clave = `${f.id}|${sv.id}`;
              const abierto = abiertos.has(clave);
              const alerta = alertaDe(sv, f.id);
              return (
                <div key={sv.id} className="border-t border-line first:border-t-0">
                  <button type="button" onClick={() => alternar(clave)} className="w-full flex items-center gap-2 py-2 text-left">
                    <span className="text-[12px] tabular-nums text-muted w-10 shrink-0">{horaCorta(sv.hora_programada) || '—'}</span>
                    <span className="flex-1 min-w-0 text-[13.5px] font-medium truncate">{sv.proyecto}</span>
                    {alerta && <span className="w-2 h-2 rounded-full bg-red shrink-0" aria-label="Con alerta" />}
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${e.cls}`}>{e.corto}</span>
                    <ChevronDown size={15} className={`text-faint shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
                  </button>
                  {abierto && <DetalleServicio s={sv} tecnicoId={f.id} hoy={hoy} minutos={minutos} fecha={fecha} onCambio={() => setCambio(sv)} />}
                </div>
              );
            })}
          </div>
        </div>
    );
  }

  function sinServicio(f: (typeof filas)[number]) {
    return (
      <div className="rounded-2xl bg-surface border border-dashed border-line-strong px-3.5 py-4">
        <p className="text-[14.5px] font-semibold">{f.nombre}</p>
        <p className="text-[13px] text-muted mt-1 flex items-center gap-1.5"><UserX size={15} /> Disponible: sin servicio asignado</p>
        <button type="button" onClick={() => setAsignar({ tecnicoIds: [f.id] })}
          className="mt-3 w-full min-h-[44px] rounded-xl bg-teal/12 text-teal text-[13.5px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98]">
          <Plus size={16} /> Asignarle un servicio
        </button>
      </div>
    );
  }

  if (!fecha) return null;

  return (
    <div>
      {/* Día */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <button type="button" onClick={() => setFecha(sumarDias(fecha, -1))} aria-label="Día anterior"
          className="w-10 h-10 rounded-xl bg-surface-2 border border-line flex items-center justify-center active:scale-95">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center min-w-0">
          <p className="font-display font-semibold text-[17px] capitalize">{fecha === hoy ? 'Hoy, ' : ''}{etiquetaFecha(fecha)}</p>
          {fecha !== hoy && <button type="button" onClick={() => setFecha(hoy)} className="text-[12px] font-semibold text-teal">Ir a hoy</button>}
        </div>
        <button type="button" onClick={() => setFecha(sumarDias(fecha, 1))} aria-label="Día siguiente"
          className="w-10 h-10 rounded-xl bg-surface-2 border border-line flex items-center justify-center active:scale-95">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-3">
        <Kpi n={`${resumen.conServicio}/${resumen.total}`} label="Con servicio" />
        <Kpi n={resumen.enCampo} label="En sitio" tono="teal" />
        <Kpi n={`${resumen.concluidos}/${resumen.servicios}`} label="Concluidos" />
        <Kpi n={resumen.sinReporte} label="Sin reporte" tono={resumen.sinReporte ? 'red' : undefined} />
      </div>

      {resumen.avisos > 0 && (
        <div className="rounded-2xl px-4 py-2.5 mb-3 bg-red/10 border border-red/30 text-[13px] text-red font-semibold flex items-center gap-2">
          <AlertTriangle size={16} /> {resumen.avisos} aviso(s) de técnicos sin atender. Revisa los servicios marcados.
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button type="button" onClick={() => setAsignar({ tecnicoIds: [] })}
          className="flex-1 min-h-[46px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
          <Plus size={18} strokeWidth={2.6} /> Asignar servicio
        </button>
        <button type="button" onClick={() => cargar()} aria-label="Actualizar"
          className="w-12 min-h-[46px] rounded-xl bg-surface-2 border border-line flex items-center justify-center active:scale-95">
          <RefreshCw size={17} className={cargando ? 'animate-spin' : ''} />
        </button>
        <button type="button" onClick={descargarExcel} disabled={!datos}
          className="px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50">
          <Download size={16} /> Excel
        </button>
      </div>

      {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}

      <div className="flex flex-wrap items-center gap-x-1 mb-2">
        {([
          ['todos', `Todos (${filas.length})`],
          ['alertas', `Con alertas (${filas.filter((f) => f.servicios.some((sv) => alertaDe(sv, f.id))).length})`],
          ['campo', `En campo (${filas.filter((f) => f.servicios.some((sv) => sv.estado === 'en_sitio' || sv.estado === 'en_curso')).length})`],
          ['sin', `Disponibles (${filas.filter((f) => f.servicios.length === 0).length})`],
        ] as [Filtro, string][]).map(([k, l]) => (
          <span key={k} className={chip(filtro === k)} onClick={() => setFiltro(k)}>{l}</span>
        ))}
      </div>

      {/* Celular: un técnico a la vez, con tira para cambiar entre ellos. */}
      {visibles.length > 0 && (
        <div className="lg:hidden">
          <div ref={tira} className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 snap-x" style={{ scrollbarWidth: 'none' }}>
            {visibles.map((f) => {
              const sel = f.id === seleccionado?.id;
              const punto = puntoTecnico(f);
              return (
                <button key={f.id} type="button" onClick={() => setSelId(f.id)} data-tec={f.id}
                  className={`snap-start shrink-0 px-3 py-2 rounded-xl border text-[13px] font-semibold flex items-center gap-1.5 transition-colors ${sel ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line text-ink/85'}`}>
                  {punto && <span className={`w-2 h-2 rounded-full ${punto}`} />}
                  {nombreCorto(f.nombre)}
                  <span className={`text-[11px] font-medium ${sel ? 'text-inkOnAccent/80' : 'text-muted'}`}>{f.servicios.length}</span>
                </button>
              );
            })}
          </div>
          {seleccionado && (
            <div
              onTouchStart={(e) => { toqueX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                const dx = e.changedTouches[0].clientX - toqueX.current;
                if (Math.abs(dx) > 60) mover(dx < 0 ? 1 : -1);
              }}
            >
              <div className="flex items-center justify-between text-[12px] text-muted mb-1.5 px-1">
                <button type="button" onClick={() => mover(-1)} disabled={indiceSel <= 0} className="w-9 h-9 -ml-2 flex items-center justify-center disabled:opacity-30" aria-label="Técnico anterior"><ChevronLeft size={18} /></button>
                <span>{indiceSel + 1} de {visibles.length}</span>
                <button type="button" onClick={() => mover(1)} disabled={indiceSel >= visibles.length - 1} className="w-9 h-9 -mr-2 flex items-center justify-center disabled:opacity-30" aria-label="Técnico siguiente"><ChevronRight size={18} /></button>
              </div>
              {seleccionado.servicios.length > 0 ? tarjeta(seleccionado) : sinServicio(seleccionado)}
            </div>
          )}
        </div>
      )}

      {/* Computadora: todos a la vista. */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-2 gap-2.5 items-start">
          {visibles.filter((f) => f.servicios.length > 0).map((f) => tarjeta(f))}
        </div>
        {(filtro === 'todos' || filtro === 'sin') && visibles.some((f) => f.servicios.length === 0) && (
          <div className="mt-2.5 rounded-2xl border border-dashed border-line-strong px-3.5 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5"><UserX size={14} /> Disponibles (sin servicio)</p>
            <div className="flex flex-wrap gap-1.5">
              {visibles.filter((f) => f.servicios.length === 0).map((f) => {
                return (
                  <button key={f.id} type="button" onClick={() => setAsignar({ tecnicoIds: [f.id] })}
                    className="px-2.5 py-1.5 rounded-full bg-surface-2 border border-line text-[12.5px] font-medium flex items-center gap-1.5 active:scale-95">
                    {f.nombre}
                    <Plus size={13} className="text-teal" />
                  </button>
                );
              })}
            </div>
            <p className="text-[11.5px] text-faint mt-2">Toca un nombre para asignarle un servicio.</p>
          </div>
        )}
      </div>

      {datos && visibles.length === 0 && filas.length > 0 && <p className="text-[13px] text-muted text-center py-6">Nada con este filtro.</p>}
      {datos && filas.length === 0 && <p className="text-[13px] text-muted text-center py-8">No hay técnicos activos.</p>}

      {asignar && datos && (
        <AsignarRapido
          fecha={fecha}
          tecnicos={datos.tecnicos}
          ocupados={new Set(datos.servicios.flatMap((s) => s.estado === 'concluido' ? [] : s.asignados.map((a) => a.tecnico_id)))}
          inicial={asignar.tecnicoIds}
          onClose={() => setAsignar(null)}
          onListo={() => { setAsignar(null); cargar(); }}
        />
      )}
      {cambio && datos && (
        <CambioDia
          servicio={cambio}
          hoy={hoy}
          otros={datos.servicios.filter((s) => s.id !== cambio.id && !motivoNoEditable(s.estado))}
          onClose={() => setCambio(null)}
          onListo={() => { setCambio(null); cargar(); }}
        />
      )}
    </div>
  );
}

function DetalleServicio({
  s, tecnicoId, hoy, minutos, fecha, onCambio,
}: {
  s: ServicioDia; tecnicoId: string; hoy: string; minutos: number; fecha: string; onCambio: () => void;
}) {
  const e = estadoServicio(s, tecnicoId);
  const tiempo = calcularEstadoTiempo(s);
  const atraso = llegadaAtrasada(s, hoy, minutos, fecha);
  const companeros = s.asignados.filter((a) => a.tecnico_id !== tecnicoId).map((a) => a.nombre.split(' ')[0]);
  return (
    <div className="pb-2.5 pl-12 pr-1 text-[12.5px]">
      <p className="text-muted">
        {e.texto} · {s.dias_totales > 1 ? `Día ${s.numero_dia}/${s.dias_totales}` : 'Un día'}
        {companeros.length > 0 ? ` · con ${companeros.join(', ')}` : ''}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11.5px] font-semibold">
        {atraso > 0 && <span className="px-2 py-0.5 rounded-full bg-red/12 text-red flex items-center gap-1"><Clock size={11} />Sin llegar ({duracion(atraso)} tarde)</span>}
        {tiempo.tipo === 'excedido' && <span className="px-2 py-0.5 rounded-full bg-amber/15 text-amber">Excedido {duracion(tiempo.minutos || 0)}</span>}
        {tiempo.tipo === 'retraso' && <span className="px-2 py-0.5 rounded-full bg-amber/15 text-amber">Tardó {duracion(tiempo.minutos || 0)} de más</span>}
        {s.report_id ? (
          <span className="px-2 py-0.5 rounded-full bg-teal/15 text-teal">Con reporte</span>
        ) : s.estado === 'concluido' ? (
          <span className="px-2 py-0.5 rounded-full bg-red/12 text-red">Sin reporte</span>
        ) : null}
      </div>
      {s.avisosPendientes.map((a) => (
        <p key={a.id} className="text-red mt-1.5 flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span><b>Aviso:</b> {etiquetaCausa(a.causa)}{a.comentario ? ` — ${a.comentario}` : ''}</span>
        </p>
      ))}
      {s.ultimoAviso?.nota && (
        <p className="text-muted mt-1.5 line-clamp-3">
          {s.ultimoAviso.tipo === 'pausa' ? 'Pausa' : 'Retraso'} {hora(s.ultimoAviso.created_at)}: {s.ultimoAviso.nota}
        </p>
      )}
      <div className="flex items-center gap-4 mt-2">
        <Link href={`/dashboard/servicios/${s.id}`} className="font-semibold text-teal">Ver servicio</Link>
        {s.estado !== 'concluido' && (
          <button type="button" onClick={onCambio} className="font-semibold text-teal flex items-center gap-1.5">
            <ArrowRightLeft size={13} /> Cambio en el día
          </button>
        )}
      </div>
    </div>
  );
}

function Kpi({ n, label, tono }: { n: number | string; label: string; tono?: 'teal' | 'red' }) {
  const color = tono === 'red' ? 'text-red' : tono === 'teal' ? 'text-teal' : 'text-ink';
  return (
    <div className="rounded-xl bg-surface border border-line px-2 py-2 text-center">
      <p className={`text-[17px] font-bold tabular-nums leading-none ${color}`}>{n}</p>
      <p className="text-[10.5px] text-muted font-semibold mt-1 leading-tight">{label}</p>
    </div>
  );
}

export function SelectorTecnicos({
  tecnicos, seleccion, onCambiar, ocupados,
}: {
  tecnicos: { id: string; nombre: string }[];
  seleccion: string[];
  onCambiar: (ids: string[]) => void;
  ocupados?: Set<string>;
}) {
  return (
    <div>
      {tecnicos.map((t) => {
        const sel = seleccion.includes(t.id);
        return (
          <span key={t.id} className={chip(sel)} onClick={() => onCambiar(sel ? seleccion.filter((x) => x !== t.id) : [...seleccion, t.id])}>
            {t.nombre}{ocupados?.has(t.id) && !sel ? ' · ocupado' : ''}
          </span>
        );
      })}
    </div>
  );
}

function Encabezado({ titulo, subtitulo, onClose, deshabilitado }: { titulo: string; subtitulo?: string; onClose: () => void; deshabilitado?: boolean }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-display font-bold text-[19px] tracking-wide">{titulo}</h2>
        <button onClick={onClose} disabled={deshabilitado} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted shrink-0">
          <X size={19} strokeWidth={2.5} />
        </button>
      </div>
      {subtitulo && <p className="text-[13px] text-muted mb-4">{subtitulo}</p>}
    </>
  );
}

export function AsignarRapido({
  fecha, tecnicos, ocupados, inicial, onClose, onListo,
}: {
  fecha: string;
  tecnicos: { id: string; nombre: string }[];
  ocupados: Set<string>;
  inicial: string[];
  onClose: () => void;
  onListo: () => void;
}) {
  const [proyecto, setProyecto] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [horaP, setHoraP] = useState('');
  const [ids, setIds] = useState<string[]>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!proyecto.trim()) { setError('Escribe el cliente o proyecto.'); return; }
    if (ids.length === 0) { setError('Elige al menos un técnico.'); return; }
    setGuardando(true);
    setError(null);
    try {
      await asignarRapido({ proyecto: proyecto.trim(), clienteId, descripcion, fecha, hora: horaP || null, tecnicoIds: ids });
      showToast('Servicio asignado; ya les llegó el aviso', 'success');
      onListo();
    } catch (e: any) {
      setError(e?.message || 'No se pudo asignar.');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <Encabezado titulo="Asignar servicio" subtitulo={`Para el ${etiquetaFecha(fecha)}. Para varios días, tareas o lista de carga usa «Programar servicio o proyecto».`} onClose={onClose} deshabilitado={guardando} />
        <label className={labelCls}>Cliente / proyecto</label>
        <div className="mb-3">
          <AutocompletarCliente soloSugerir value={proyecto} onChange={(n, id) => { setProyecto(n); setClienteId(id); }} className={inputCls} placeholder="Ej. Pinturas Casther" />
        </div>
        <label className={labelCls}>Qué se va a hacer (opcional)</label>
        <input className={`${inputCls} mb-3`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Mantenimiento preventivo CCTV" />
        <label className={labelCls}>Hora de llegada (opcional)</label>
        <input type="time" className={`${inputCls} mb-3`} value={horaP} onChange={(e) => setHoraP(e.target.value)} />
        <label className={labelCls}>Técnicos</label>
        <SelectorTecnicos tecnicos={tecnicos} seleccion={ids} onCambiar={setIds} ocupados={ocupados} />
        {error && <p className="text-[13px] text-red font-semibold mt-2">{error}</p>}
        <button type="button" onClick={guardar} disabled={guardando}
          className="w-full mt-4 min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-50 active:scale-[0.98]">
          {guardando ? 'Asignando…' : 'Asignar y avisar'}
        </button>
      </div>
    </ModalOverlay>
  );
}

export function CambioDia({
  servicio: s, hoy, otros, onClose, onListo,
}: {
  servicio: ServicioDia;
  hoy: string;
  otros: ServicioDia[];
  onClose: () => void;
  onListo: () => void;
}) {
  const empezado = Boolean(motivoNoEditable(s.estado));
  const manana = (() => {
    let f = sumarDias(s.fecha < hoy ? hoy : s.fecha, 1);
    while ([0, 6].includes(fechaLocal(f).getDay())) f = sumarDias(f, 1);
    return f;
  })();
  const avisoInicial = s.avisosPendientes[0];
  const [motivo, setMotivo] = useState(
    avisoInicial ? `${etiquetaCausa(avisoInicial.causa)}${avisoInicial.comentario ? ` — ${avisoInicial.comentario}` : ''}` : ''
  );
  const [accion, setAccion] = useState<'reprogramar' | 'continuar' | 'cancelar' | 'nada'>(empezado ? 'continuar' : 'reprogramar');
  const [nuevaFecha, setNuevaFecha] = useState(manana);
  const [destino, setDestino] = useState<'ninguno' | 'existente' | 'nuevo'>('ninguno');
  const [destinoId, setDestinoId] = useState(otros[0]?.id || '');
  const [proyecto, setProyecto] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [horaP, setHoraP] = useState('');
  const [ids, setIds] = useState<string[]>(s.asignados.map((a) => a.tecnico_id));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await registrarCambioDia({
        servicio: s,
        motivo,
        accion,
        nuevaFecha: accion === 'reprogramar' || accion === 'continuar' ? nuevaFecha : undefined,
        destino:
          destino === 'existente' && destinoId ? { tipo: 'existente', servicioId: destinoId }
          : destino === 'nuevo' ? { tipo: 'nuevo', proyecto, clienteId, descripcion, hora: horaP || null }
          : undefined,
        tecnicoIds: ids,
        avisosAtendidos: s.avisosPendientes.map((a) => a.id),
      });
      showToast('Cambio registrado; los técnicos ya tienen el aviso', 'success');
      onListo();
    } catch (e: any) {
      setError(e?.message || 'No se pudo registrar el cambio.');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <Encabezado titulo="Cambio en el día" subtitulo={`${s.proyecto} · ${etiquetaFecha(s.fecha)}. Queda registrado en el historial del servicio y en Eventos.`} onClose={onClose} deshabilitado={guardando} />

        <label className={labelCls}>¿Qué pasó?</label>
        {MOTIVOS_CAMBIO.map((m) => (
          <span key={m} className={chip(motivo === m)} onClick={() => setMotivo(m)}>{m}</span>
        ))}
        <input className={`${inputCls} mb-4`} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Otro motivo o detalle" />

        <label className={labelCls}>¿Qué pasa con este servicio?</label>
        {!empezado ? (
          <>
            <span className={chip(accion === 'reprogramar')} onClick={() => setAccion('reprogramar')}>Reprogramar</span>
            <span className={chip(accion === 'cancelar')} onClick={() => setAccion('cancelar')}>Cancelar</span>
          </>
        ) : (
          <span className={chip(accion === 'continuar')} onClick={() => setAccion('continuar')}>Continuar otro día</span>
        )}
        <span className={chip(accion === 'nada')} onClick={() => setAccion('nada')}>Dejarlo como está</span>
        {accion === 'cancelar' && (
          <p className="text-[12px] text-muted mt-1">Ya no se hará: queda en el historial con el motivo, deja de exigir reporte y a los técnicos les llega el aviso.</p>
        )}
        {(accion === 'reprogramar' || accion === 'continuar') && (
          <input type="date" className={`${inputCls} mt-1`} value={nuevaFecha} min={hoy} onChange={(e) => setNuevaFecha(e.target.value)} />
        )}
        {empezado && (
          <p className="text-[12px] text-muted mt-1.5">Ya se empezó: los técnicos deben hacer hoy su reporte de avance (servicio no concluido).</p>
        )}

        <label className={`${labelCls} mt-4`}>¿A dónde van los técnicos?</label>
        <span className={chip(destino === 'ninguno')} onClick={() => setDestino('ninguno')}>No se mueven</span>
        {otros.length > 0 && <span className={chip(destino === 'existente')} onClick={() => setDestino('existente')}>A otro servicio del mismo día</span>}
        <span className={chip(destino === 'nuevo')} onClick={() => setDestino('nuevo')}>A un servicio nuevo</span>

        {destino !== 'ninguno' && (
          <div className="mt-2 flex flex-col gap-3">
            {destino === 'existente' ? (
              <select className={inputCls} value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                {otros.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.hora_programada ? `${horaCorta(o.hora_programada)} · ` : ''}{o.proyecto}{o.asignados.length ? ` (${o.asignados.map((a) => a.nombre.split(' ')[0]).join(', ')})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <AutocompletarCliente soloSugerir value={proyecto} onChange={(n, id) => { setProyecto(n); setClienteId(id); }} className={inputCls} placeholder="Cliente del nuevo servicio" />
                <input className={inputCls} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué se va a hacer (opcional)" />
                <input type="time" className={inputCls} value={horaP} onChange={(e) => setHoraP(e.target.value)} />
              </>
            )}
            <div>
              <label className={labelCls}>Técnicos que se mueven</label>
              <SelectorTecnicos tecnicos={s.asignados.map((a) => ({ id: a.tecnico_id, nombre: a.nombre }))} seleccion={ids} onCambiar={setIds} />
            </div>
          </div>
        )}

        {error && <p className="text-[13px] text-red font-semibold mt-3">{error}</p>}
        <button type="button" onClick={guardar} disabled={guardando || !motivo.trim()}
          className="w-full mt-4 min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-50 active:scale-[0.98]">
          {guardando ? 'Guardando…' : 'Registrar cambio'}
        </button>
      </div>
    </ModalOverlay>
  );
}
