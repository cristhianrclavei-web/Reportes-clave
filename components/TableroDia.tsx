'use client';

import { useEnVivo } from '@/lib/useEnVivo';
import { coincideBusqueda } from '@/lib/busqueda';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Plus, X, Download, AlertTriangle, ArrowRightLeft, FileText, Clock, UserX,
  Search, Users, List as ListIcon,
} from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { AvatarTecnico, TiraTecnicos, EstadoAvatar, UNIFORMES } from '@/components/AvatarTecnico';
import { Cuadrilla, useCuadrillas, cuadrillaPorTecnico, enCuadrilla, TODAS, SIN_CUADRILLA, MIAS } from '@/lib/cuadrillas';
import { useMiId } from '@/lib/perfiles';
import { ElegirCuadrilla } from '@/components/cuadrillas/ChipsCuadrilla';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import { showToast } from '@/components/Toast';
import { hoyLocal, sumarDias, fechaLocal } from '@/lib/fechaHoy';
import { etiquetaCausa } from '@/lib/avisos';
import { calcularEstadoTiempo, motivoNoEditable, Servicio } from '@/lib/serviciosProgramados';
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

export default function TableroDia({ onAgendar }: {
  // Abre el formulario completo de agendar (ubicación, tareas, lista de
  // carga) con la fecha y los técnicos puestos. Sin él, se usa el rápido.
  onAgendar?: (p: { fecha: string; tecnicoIds: string[] }) => void;
} = {}) {
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
  const pedirAsignar = (tecnicoIds: string[]) =>
    onAgendar ? onAgendar({ fecha: fecha || hoy, tecnicoIds }) : setAsignar({ tecnicoIds });
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
  // Y al instante cuando alguien marca llegada, concluye o entrega su reporte
  // (si la base publica esas tablas en tiempo real).
  useEnVivo({ tablas: ['servicios_programados', 'servicio_tecnicos', 'reports'], alCambiar: () => cargar(true), cadaMs: 0 });

  // Cuadrillas (opcionales): filtran todo el tablero a un grupo de personas.
  const { cuadrillas } = useCuadrillas();
  const mapaCuad = useMemo(() => cuadrillaPorTecnico(cuadrillas), [cuadrillas]);
  const miId = useMiId();
  const misCuadrillas = useMemo(() => new Set(miId ? cuadrillas.filter((c) => c.supervisor_id === miId).map((c) => c.id) : []), [cuadrillas, miId]);
  const [cuad, setCuad] = useState<string>(TODAS);
  // Si la cuadrilla elegida se borró, se vuelve a «Todas».
  useEffect(() => {
    if (cuad !== TODAS && cuad !== SIN_CUADRILLA && !cuad.startsWith(MIAS) && !cuadrillas.some((c) => c.id === cuad)) setCuad(TODAS);
  }, [cuad, cuadrillas]);

  // Técnicos con sus servicios del día; primero los que tienen servicio.
  const filasTodas = useMemo(() => {
    if (!datos) return [];
    return datos.tecnicos
      .map((t) => ({
        ...t,
        servicios: datos.servicios.filter((s) => s.asignados.some((a) => a.tecnico_id === t.id)),
      }))
      .sort((a, b) => (a.servicios.length === 0 ? 1 : 0) - (b.servicios.length === 0 ? 1 : 0));
  }, [datos]);
  const filas = useMemo(
    () => (cuad === TODAS ? filasTodas : filasTodas.filter((f) => enCuadrilla(cuad, mapaCuad, f.id))),
    [filasTodas, cuad, mapaCuad],
  );
  // Servicios del día de la cuadrilla elegida (los que llevan a alguien de ella).
  const serviciosDia = useMemo(() => {
    const todos = datos?.servicios || [];
    return cuad === TODAS ? todos : todos.filter((sv) => sv.asignados.some((a) => enCuadrilla(cuad, mapaCuad, a.tecnico_id)));
  }, [datos, cuad, mapaCuad]);

  const resumen = useMemo(() => {
    const servicios = serviciosDia;
    const conServicio = filas.filter((f) => f.servicios.length > 0).length;
    const enCampo = servicios.filter((s) => s.estado === 'en_sitio' || s.estado === 'en_curso').length;
    const concluidos = servicios.filter((s) => s.estado === 'concluido').length;
    const sinReporte = servicios.filter((s) => s.estado === 'concluido' && !s.report_id).length;
    const avisos = servicios.reduce((n, s) => n + s.avisosPendientes.length, 0);
    return { conServicio, total: filas.length, enCampo, concluidos, sinReporte, avisos, servicios: servicios.length };
  }, [serviciosDia, filas]);


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

  // ---- Celular: la gente por grupos según lo que está pasando ----
  const [busca, setBusca] = useState('');
  // Plegados al abrir: lo que no pide atención.
  const [plegadosMovil, setPlegadosMovil] = useState<Set<string>>(new Set(['concluidos', 'libres']));
  const alternarGrupoMovil = (k: string) => setPlegadosMovil((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const gruposMovil = (() => {
    const q = busca.trim();
    const lista = (q
      ? filas.filter((f) => coincideBusqueda(`${f.nombre} ${f.servicios.map((sv) => sv.proyecto).join(' ')}`, q))
      : filas
    ).slice().sort((x, y) => x.nombre.localeCompare(y.nombre));
    const de = (f: (typeof filas)[number]) => {
      if (f.servicios.length === 0) return 'libres';
      if (f.servicios.some((sv) => alertaDe(sv, f.id))) return 'atencion';
      if (f.servicios.some((sv) => sv.estado === 'en_sitio' || sv.estado === 'en_curso')) return 'campo';
      if (f.servicios.every((sv) => sv.estado === 'concluido' || sv.estado === 'cancelado')) return 'concluidos';
      return 'porIniciar';
    };
    return [
      { k: 'atencion', titulo: 'Requieren atención', tono: 'text-red', punto: 'bg-red' },
      { k: 'campo', titulo: 'En campo', tono: 'text-teal', punto: 'bg-teal' },
      { k: 'porIniciar', titulo: 'Por iniciar', tono: '', punto: 'bg-amber' },
      { k: 'concluidos', titulo: 'Ya concluyeron', tono: '', punto: 'bg-line-strong' },
      { k: 'libres', titulo: 'Disponibles', tono: '', punto: 'bg-line-strong' },
    ].map((g) => ({ ...g, gente: lista.filter((f) => de(f) === g.k) }));
  })();

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
      { header: 'Personal técnico', key: 'tecnico', width: 24 },
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
  // Centra en la tira el técnico elegido (solo la tira, no la página).
  useEffect(() => {
    const cont = document.querySelector<HTMLElement>('[data-tira="hoy"]');
    const el = cont?.querySelector<HTMLElement>(`[data-tec="${selId}"]`);
    if (cont && el) cont.scrollTo({ left: el.offsetLeft - cont.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [selId]);
  const indiceSel = Math.max(0, visibles.findIndex((f) => f.id === selId));
  const seleccionado = visibles[indiceSel];
  function mover(paso: number) {
    const n = visibles[indiceSel + paso];
    if (n) setSelId(n.id);
  }
  // Color de uniforme por posición en la lista (orden alfabético).
  const indiceTec = (id: string) => Math.max(0, (datos?.tecnicos || []).findIndex((t) => t.id === id));
  // Punto del avatar: rojo si hay algo que atender, ámbar en campo, verde si ya acabó.
  function estadoTecnico(f: (typeof filas)[number]): EstadoAvatar {
    if (f.servicios.some((sv) => alertaDe(sv, f.id))) return 'alerta';
    if (f.servicios.some((sv) => sv.estado === 'en_sitio' || sv.estado === 'en_curso')) return 'campo';
    if (f.servicios.length > 0 && f.servicios.every((sv) => sv.estado === 'concluido')) return 'listo';
    return null;
  }

  // Orden de la lista del celular: alertas, en campo, programados, listos y disponibles.
  function pesoFila(f: (typeof filas)[number]): number {
    const e = estadoTecnico(f);
    return e === 'alerta' ? 0 : e === 'campo' ? 1 : f.servicios.length === 0 ? 4 : e === 'listo' ? 3 : 2;
  }

  function tarjeta(f: (typeof filas)[number], conNombre = true) {
    return (
      <div key={f.id} className="rounded-2xl bg-surface border border-line px-3.5 py-3">
          {conNombre && (
            <div className="flex items-center gap-2.5 mb-1.5">
              <AvatarTecnico id={f.id} nombre={f.nombre} size={30} estado={estadoTecnico(f)} indice={indiceTec(f.id)} />
              <p className="text-[14.5px] font-semibold leading-tight truncate">{f.nombre}</p>
            </div>
          )}
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
        <p className="text-[13px] text-muted flex items-center justify-center gap-1.5"><UserX size={15} /> Disponible: sin servicio asignado</p>
        <button type="button" onClick={() => pedirAsignar([f.id])}
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
      <div className="flex items-center justify-between gap-2 mb-3">
        <button type="button" onClick={() => setFecha(sumarDias(fecha, -1))} aria-label="Día anterior"
          className="w-9 h-9 rounded-full bg-surface-2 border border-line flex items-center justify-center active:scale-95">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center min-w-0">
          <p className="font-display font-semibold text-[16px] capitalize">{fecha === hoy ? 'Hoy, ' : ''}{etiquetaFecha(fecha)}</p>
          {fecha !== hoy && <button type="button" onClick={() => setFecha(hoy)} className="text-[12px] font-semibold text-teal">Ir a hoy</button>}
        </div>
        <button type="button" onClick={() => setFecha(sumarDias(fecha, 1))} aria-label="Día siguiente"
          className="w-9 h-9 rounded-full bg-surface-2 border border-line flex items-center justify-center active:scale-95">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-4 mb-3 rounded-2xl bg-surface border border-line divide-x divide-line">
        {/* Sin datos todavía: guiones, no ceros (parecería un día vacío). */}
        <Kpi n={datos ? `${resumen.conServicio}/${resumen.total}` : '–'} label="Con servicio" />
        <Kpi n={datos ? resumen.enCampo : '–'} label="En sitio" tono="teal" />
        <Kpi n={datos ? `${resumen.concluidos}/${resumen.servicios}` : '–'} label="Concluidos" />
        <Kpi n={datos ? resumen.sinReporte : '–'} label="Sin reporte" tono={resumen.sinReporte ? 'red' : undefined} />
      </div>

      {resumen.avisos > 0 && (
        <div className="rounded-2xl px-4 py-2.5 mb-3 bg-red/10 border border-red/30 text-[13px] text-red font-semibold flex items-center gap-2">
          <AlertTriangle size={16} /> {resumen.avisos} aviso(s) del personal sin atender. Revisa los servicios marcados.
        </div>
      )}

      <div className="flex gap-2 mb-3 lg:justify-end">
        <button type="button" onClick={() => pedirAsignar([])}
          className="flex-1 lg:flex-none lg:px-6 min-h-[42px] rounded-full bg-teal text-inkOnAccent text-[14px] font-semibold flex items-center justify-center gap-2 shadow-glow-teal active:scale-[0.98]">
          <Plus size={17} strokeWidth={2.6} /> Asignar servicio
        </button>
        <button type="button" onClick={() => cargar()} aria-label="Actualizar" title="Actualizar"
          className="w-[42px] h-[42px] rounded-full bg-surface-2 border border-line flex items-center justify-center active:scale-95">
          <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />
        </button>
        <button type="button" onClick={descargarExcel} disabled={!datos} aria-label="Descargar Excel" title="Descargar Excel"
          className="w-[42px] h-[42px] rounded-full bg-surface-2 border border-line flex items-center justify-center active:scale-95 disabled:opacity-50">
          <Download size={16} />
        </button>
      </div>

      {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}

      {/* Cuadrillas: reducen el tablero a un grupo. Solo si existen. */}
      {cuadrillas.length > 0 && datos && (
        <div className="flex items-center gap-1.5 mb-2.5 overflow-x-auto -mx-1 px-1 lg:flex-wrap lg:overflow-visible" style={{ scrollbarWidth: 'none' }}>
          {[
            { k: TODAS, nombre: 'Todas', color: null as number | null, gente: filasTodas },
            // «Mis cuadrillas»: solo para el supervisor que tiene alguna a su cargo.
            ...(misCuadrillas.size > 0 && misCuadrillas.size < cuadrillas.length
              ? [{ k: MIAS + miId, nombre: misCuadrillas.size === 1 ? 'Mi cuadrilla' : 'Mis cuadrillas', color: null as number | null, gente: filasTodas.filter((f) => misCuadrillas.has(mapaCuad.get(f.id)?.id || '')) }]
              : []),
            ...cuadrillas.map((c) => ({ k: c.id, nombre: c.nombre, color: c.color as number | null, gente: filasTodas.filter((f) => mapaCuad.get(f.id)?.id === c.id) })),
            ...(filasTodas.some((f) => !mapaCuad.has(f.id))
              ? [{ k: SIN_CUADRILLA, nombre: 'Sin cuadrilla', color: null as number | null, gente: filasTodas.filter((f) => !mapaCuad.has(f.id)) }]
              : []),
          ].map((g) => {
            const sel = cuad === g.k;
            const conAlerta = g.k !== TODAS && g.gente.some((f) => f.servicios.some((sv) => alertaDe(sv, f.id)));
            return (
              <button key={g.k} type="button" onClick={() => setCuad(g.k)} aria-pressed={sel}
                className={`shrink-0 h-8 pl-2.5 pr-3 rounded-full text-[12.5px] font-semibold border flex items-center gap-1.5 transition-colors active:scale-95 ${sel ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink/80'}`}>
                {g.color !== null && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: UNIFORMES[g.color % UNIFORMES.length] }} />}
                {g.nombre}
                <span className={`tabular-nums font-medium ${sel ? 'opacity-70' : 'text-muted'}`}>{g.gente.length}</span>
                {conAlerta && <span className="w-1.5 h-1.5 rounded-full bg-red shrink-0" aria-label="Con alertas" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Celular: buscador y la gente agrupada por lo que está pasando, en
          secciones que se pliegan. Con mucho personal la lista plana se
          saturaba: ahora se ve primero lo que hay que atender y quién está en
          campo; quienes ya concluyeron o están disponibles quedan plegados. */}
      {datos && filas.length > 0 && (
        <div className="lg:hidden">
          <div className="relative mb-2.5">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar persona o servicio"
              className="w-full h-11 pl-10 pr-10 rounded-full bg-surface border border-line focus:border-teal focus:outline-none text-[14px] placeholder:text-muted"
            />
            {busca && (
              <button type="button" onClick={() => setBusca('')} aria-label="Borrar búsqueda" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            )}
          </div>

          {gruposMovil.every((g) => g.gente.length === 0) && (
            <p className="text-[13px] text-muted text-center py-6">Nadie coincide con «{busca}».</p>
          )}

          <div className="flex flex-col gap-2.5">
            {gruposMovil.filter((g) => g.gente.length > 0).map((g) => {
              const abiertoGrupo = busca.trim() !== '' || !plegadosMovil.has(g.k);
              return (
                <section key={g.k} className="rounded-2xl bg-surface border border-line overflow-hidden">
                  <button type="button" onClick={() => alternarGrupoMovil(g.k)} aria-expanded={abiertoGrupo}
                    className="w-full flex items-center gap-2.5 px-3.5 min-h-[44px] text-left">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${g.punto}`} />
                    <span className={`text-[13.5px] font-semibold flex-1 ${g.tono}`}>{g.titulo}</span>
                    <span className="text-[12.5px] font-bold tabular-nums text-muted">{g.gente.length}</span>
                    <ChevronDown size={16} className={`text-muted shrink-0 transition-transform duration-200 ${abiertoGrupo ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Disponibles: no hay nada que ver de cada quien, así que
                      van como botones compactos para asignarles un servicio. */}
                  {abiertoGrupo && g.k === 'libres' && (
                    <div className="flex flex-wrap gap-1.5 px-3 pb-3 border-t border-line pt-2.5">
                      {g.gente.map((f) => (
                        <button key={f.id} type="button" onClick={() => pedirAsignar([f.id])}
                          className="pl-1 pr-2.5 h-9 rounded-full bg-surface-2 border border-line text-[13px] font-medium flex items-center gap-1.5 active:scale-95">
                          <AvatarTecnico id={f.id} nombre={f.nombre} size={26} indice={indiceTec(f.id)} />
                          {f.nombre.split(' ')[0]} {f.nombre.split(' ')[1]?.[0] ? `${f.nombre.split(' ')[1][0]}.` : ''}
                          <Plus size={14} className="text-teal" />
                        </button>
                      ))}
                    </div>
                  )}

                  {abiertoGrupo && g.k !== 'libres' && (
                    <div className="divide-y divide-line border-t border-line">
                      {g.gente.map((f) => {
                        const abierto = selId === f.id;
                        const enCurso = f.servicios.find((sv) => sv.estado === 'en_sitio' || sv.estado === 'en_curso');
                        const primero = enCurso || f.servicios[0];
                        const resumenFila = enCurso
                          ? `${enCurso.estado === 'en_curso' ? 'En curso' : 'En sitio'} · ${enCurso.proyecto}`
                          : g.k === 'concluidos'
                            ? `${f.servicios.length} concluido${f.servicios.length > 1 ? 's' : ''} · ${primero.proyecto}`
                            : `${primero.hora_programada ? `${String(primero.hora_programada).slice(0, 5)} · ` : ''}${primero.proyecto}`;
                        return (
                          <div key={f.id}>
                            <button type="button" onClick={() => setSelId(abierto ? null : f.id)} aria-expanded={abierto}
                              className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${abierto ? 'bg-teal/8' : 'active:bg-surface-2/60'}`}>
                              <AvatarTecnico id={f.id} nombre={f.nombre} size={32} estado={estadoTecnico(f)} indice={indiceTec(f.id)} />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[14px] font-semibold leading-tight truncate">{f.nombre}</span>
                                <span className="block text-[12.5px] text-muted truncate">{resumenFila}</span>
                              </span>
                              {f.servicios.length > 1 && (
                                <span className="text-[11.5px] font-bold tabular-nums px-1.5 h-5 rounded-full bg-surface-2 flex items-center justify-center shrink-0">{f.servicios.length}</span>
                              )}
                              <ChevronDown size={16} className={`text-muted shrink-0 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} />
                            </button>
                            {abierto && <div className="px-2.5 pb-2.5 pt-0.5 bg-teal/8">{tarjeta(f, false)}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* Computadora: vista por servicio (tabla agrupada) o por técnico
          (lista + detalle). Aguanta mucho personal sin saturarse. */}
      {datos && (
        <div className="hidden lg:block">
          <VistaEscritorio
            filas={filas}
            servicios={serviciosDia}
            cuadrillas={cuad === TODAS ? cuadrillas : []}
            mapaCuad={mapaCuad}
            filtro={filtro}
            hoy={hoy}
            minutos={minutos}
            fecha={fecha}
            alertaDe={alertaDe}
            estadoTecnico={estadoTecnico}
            indiceTec={indiceTec}
            pedirAsignar={pedirAsignar}
            onCambio={setCambio}
            chips={([
              ['todos', `Todos ${filas.length}`],
              ['alertas', `Alertas ${filas.filter((f) => f.servicios.some((sv) => alertaDe(sv, f.id))).length}`],
              ['campo', `En campo ${filas.filter((f) => f.servicios.some((sv) => sv.estado === 'en_sitio' || sv.estado === 'en_curso')).length}`],
              ['sin', `Disponibles ${filas.filter((f) => f.servicios.length === 0).length}`],
            ] as [Filtro, string][]).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFiltro(k)}
                className={`h-8 px-3 rounded-full text-[12.5px] font-semibold border transition-colors ${filtro === k ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface border-line text-ink/75 hover:text-ink'}`}>{l}</button>
            ))}
          />
        </div>
      )}

      {datos && visibles.length === 0 && filas.length > 0 && <p className="text-[13px] text-muted text-center py-6">Nada con este filtro.</p>}
      {datos && filas.length === 0 && <p className="text-[13px] text-muted text-center py-8">No hay personal técnico activo.</p>}

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
    <div className="px-1.5 py-2 text-center">
      <p className={`text-[16px] font-bold tabular-nums leading-none ${color}`}>{n}</p>
      <p className="text-[10px] text-muted font-medium mt-1 leading-tight">{label}</p>
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
      <ElegirCuadrilla disponibles={tecnicos.map((t) => t.id)} seleccion={seleccion} onCambiar={onCambiar} className="mb-2.5 pb-2.5 border-b border-line" />
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
  fecha: fechaInicial, tecnicos, ocupados, inicial, onClose, onListo, prefill, titulo = 'Asignar servicio', editarFecha = false,
}: {
  fecha: string;
  tecnicos: { id: string; nombre: string }[];
  ocupados: Set<string>;
  inicial: string[];
  onClose: () => void;
  onListo: (servicio: Servicio) => void;
  // Datos ya llenos (p. ej. un mantenimiento recurrente).
  prefill?: { proyecto: string; clienteId: string | null; descripcion: string; hora: string | null; nota?: string };
  titulo?: string;
  editarFecha?: boolean;
}) {
  const [fecha, setFecha] = useState(fechaInicial);
  const [proyecto, setProyecto] = useState(prefill?.proyecto || '');
  const [clienteId, setClienteId] = useState<string | null>(prefill?.clienteId || null);
  const [descripcion, setDescripcion] = useState(prefill?.descripcion || '');
  const [horaP, setHoraP] = useState(prefill?.hora ? prefill.hora.slice(0, 5) : '');
  const [ids, setIds] = useState<string[]>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!proyecto.trim()) { setError('Escribe el cliente o proyecto.'); return; }
    if (ids.length === 0) { setError('Elige al menos a una persona.'); return; }
    setGuardando(true);
    setError(null);
    try {
      const creado = await asignarRapido({ proyecto: proyecto.trim(), clienteId, descripcion, fecha, hora: horaP || null, tecnicoIds: ids });
      showToast('Servicio asignado; ya les llegó el aviso', 'success');
      onListo(creado);
    } catch (e: any) {
      setError(e?.message || 'No se pudo asignar.');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <Encabezado titulo={titulo} subtitulo={prefill?.nota || `Para el ${etiquetaFecha(fecha)}. Para varios días, tareas o lista de carga usa «Programar servicio o proyecto».`} onClose={onClose} deshabilitado={guardando} />
        {editarFecha && (
          <>
            <label className={labelCls}>Fecha</label>
            <input type="date" className={`${inputCls} mb-3`} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </>
        )}
        <label className={labelCls}>Cliente / proyecto</label>
        <div className="mb-3">
          <AutocompletarCliente soloSugerir value={proyecto} onChange={(n, id) => { setProyecto(n); setClienteId(id); }} className={inputCls} placeholder="Ej. Comercial del Norte" />
        </div>
        <label className={labelCls}>Qué se va a hacer (opcional)</label>
        <input className={`${inputCls} mb-3`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Mantenimiento preventivo CCTV" />
        <label className={labelCls}>Hora de llegada (opcional)</label>
        <input type="time" className={`${inputCls} mb-3`} value={horaP} onChange={(e) => setHoraP(e.target.value)} />
        <label className={labelCls}>Personal técnico</label>
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
      showToast('Cambio registrado; el personal ya tiene el aviso', 'success');
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
          <p className="text-[12px] text-muted mt-1">Ya no se hará: queda en el historial con el motivo, deja de exigir reporte y al personal asignado le llega el aviso.</p>
        )}
        {(accion === 'reprogramar' || accion === 'continuar') && (
          <input type="date" className={`${inputCls} mt-1`} value={nuevaFecha} min={hoy} onChange={(e) => setNuevaFecha(e.target.value)} />
        )}
        {empezado && (
          <p className="text-[12px] text-muted mt-1.5">Ya se empezó: el personal debe hacer hoy su reporte de avance (servicio no concluido).</p>
        )}

        <label className={`${labelCls} mt-4`}>¿A dónde va el personal?</label>
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
              <label className={labelCls}>Personal que se mueve</label>
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

// ------------------------------------------------------------------
// Vista de computadora
// ------------------------------------------------------------------

type FilaTec = { id: string; nombre: string; servicios: ServicioDia[] };

// Estado del servicio completo (no de un técnico): si no ha iniciado,
// cuántos de sus técnicos ya lo vieron o confirmaron.
function estadoGlobal(s: ServicioDia): { texto: string; cls: string } {
  if (s.estado !== 'programado') {
    const e = estadoServicio(s, '');
    return { texto: e.texto, cls: e.cls };
  }
  const n = s.asignados.length;
  if (n === 0) return { texto: 'Sin asignar', cls: 'bg-red/12 text-red' };
  const enterados = s.asignados.filter((a) => a.enterado_en).length;
  const sinVer = s.asignados.filter((a) => !a.visto_en && !a.enterado_en).length;
  if (enterados === n) return { texto: n > 1 ? `Enterados ${n}/${n}` : 'Enterado', cls: 'bg-surface-2 text-ink/80' };
  if (sinVer > 0) return { texto: n > 1 ? `Sin ver ${sinVer}/${n}` : 'Sin ver', cls: 'bg-red/12 text-red' };
  return { texto: n > 1 ? `Vistos ${n - enterados}/${n}` : 'Visto', cls: 'bg-amber/12 text-amber' };
}

const KEY_VISTA_DIA = 'tablero-dia-vista';

function VistaEscritorio({
  filas, servicios, filtro, hoy, minutos, fecha, alertaDe, estadoTecnico, indiceTec, pedirAsignar, onCambio, chips,
  cuadrillas, mapaCuad,
}: {
  chips: React.ReactNode;
  // Con cuadrillas, la lista «Por técnico» sale agrupada y plegable.
  cuadrillas: Cuadrilla[];
  mapaCuad: Map<string, Cuadrilla>;
  filas: FilaTec[];
  servicios: ServicioDia[];
  filtro: Filtro;
  hoy: string;
  minutos: number;
  fecha: string;
  alertaDe: (s: ServicioDia, tecnicoId: string) => boolean;
  estadoTecnico: (f: FilaTec) => EstadoAvatar;
  indiceTec: (id: string) => number;
  pedirAsignar: (ids: string[]) => void;
  onCambio: (s: ServicioDia) => void;
}) {
  const [vista, setVista] = useState<'servicio' | 'tecnico'>('servicio');
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [tecSel, setTecSel] = useState<string | null>(null);
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  const [verDisponibles, setVerDisponibles] = useState(false);

  useEffect(() => {
    try { const v = localStorage.getItem(KEY_VISTA_DIA); if (v === 'tecnico' || v === 'servicio') setVista(v); } catch { /* sin almacenamiento */ }
  }, []);
  function cambiarVista(v: 'servicio' | 'tecnico') {
    setVista(v);
    try { localStorage.setItem(KEY_VISTA_DIA, v); } catch { /* no crítico */ }
  }

  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nq = norm(q.trim());
  const coincideServicio = (s: ServicioDia) =>
    !nq || norm(s.proyecto).includes(nq) || s.asignados.some((a) => norm(a.nombre).includes(nq));

  const alertaServicio = (s: ServicioDia) =>
    s.asignados.length === 0 ? alertaDe(s, '') : s.asignados.some((a) => alertaDe(s, a.tecnico_id));

  const grupos = useMemo(() => {
    const lista = servicios.filter(coincideServicio);
    const atencion = lista.filter(alertaServicio);
    const resto = lista.filter((s) => !alertaServicio(s));
    return [
      { k: 'atencion', titulo: 'Requieren atención', tono: 'text-red', items: atencion },
      { k: 'campo', titulo: 'En campo', tono: 'text-teal', items: resto.filter((s) => s.estado === 'en_sitio' || s.estado === 'en_curso') },
      { k: 'iniciar', titulo: 'Por iniciar', tono: 'text-ink', items: resto.filter((s) => s.estado === 'programado') },
      { k: 'concluidos', titulo: 'Concluidos', tono: 'text-muted', items: resto.filter((s) => s.estado === 'concluido') },
    ].filter((g) => {
      if (filtro === 'alertas') return g.k === 'atencion';
      if (filtro === 'campo') return g.k === 'campo' || (g.k === 'atencion');
      return true;
    }).map((g) => (filtro === 'campo' && g.k === 'atencion'
      ? { ...g, items: g.items.filter((s) => s.estado === 'en_sitio' || s.estado === 'en_curso') }
      : g));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicios, nq, filtro, hoy, minutos, fecha]);

  const disponibles = filas.filter((f) => f.servicios.length === 0 && (!nq || norm(f.nombre).includes(nq)));
  const tecnicosLista = filas.filter((f) => {
    if (nq && !norm(f.nombre).includes(nq) && !f.servicios.some((s) => norm(s.proyecto).includes(nq))) return false;
    if (filtro === 'sin') return f.servicios.length === 0;
    if (filtro === 'campo') return f.servicios.some((sv) => sv.estado === 'en_sitio' || sv.estado === 'en_curso');
    if (filtro === 'alertas') return f.servicios.some((sv) => alertaDe(sv, f.id));
    return true;
  }).sort((a, b) => {
    // Primero lo que hay que atender, luego en campo, programados, listos y disponibles.
    const peso = (f: FilaTec) => {
      const e = estadoTecnico(f);
      return e === 'alerta' ? 0 : e === 'campo' ? 1 : f.servicios.length === 0 ? 4 : e === 'listo' ? 3 : 2;
    };
    return peso(a) - peso(b) || a.nombre.localeCompare(b.nombre);
  });
  const tecActual = tecnicosLista.find((f) => f.id === tecSel) || tecnicosLista[0] || null;

  // Agrupación por cuadrilla de la lista «Por técnico». El orden visual se
  // da con `order` (flex): encabezado y luego su gente, conservando dentro
  // de cada grupo el orden por urgencia de `tecnicosLista`.
  const agrupar = cuadrillas.length > 0;
  const claveGrupo = (id: string) => (agrupar ? mapaCuad.get(id)?.id || 'sin' : '');
  const ordenGrupo = (id: string) => {
    const c = mapaCuad.get(id);
    return c ? cuadrillas.findIndex((x) => x.id === c.id) + 1 : cuadrillas.length + 1;
  };
  const gruposTec = !agrupar ? [] : [
    ...cuadrillas.map((c, i) => ({ k: c.id as string | null, titulo: c.nombre, color: c.color as number | null, orden: i + 1, items: tecnicosLista.filter((f) => mapaCuad.get(f.id)?.id === c.id) })),
    { k: 'sin' as string | null, titulo: 'Sin cuadrilla', color: null as number | null, orden: cuadrillas.length + 1, items: tecnicosLista.filter((f) => !mapaCuad.has(f.id)) },
  ].filter((g) => g.items.length > 0);

  // Al abrir, las cuadrillas sin nada que atender quedan plegadas: con mucha
  // gente, la lista arranca mostrando solo donde hay alertas. Se hace una
  // vez; después manda lo que el supervisor abra o cierre.
  const plegadoInicial = useRef(false);
  useEffect(() => {
    if (plegadoInicial.current || !agrupar || filas.length === 0) return;
    plegadoInicial.current = true;
    const tranquilas = gruposTec.filter((g) => !g.items.some((f) => estadoTecnico(f) === 'alerta')).map((g) => `c:${g.k}`);
    // Si ninguna tiene alertas no se pliega nada (no habría qué destacar).
    if (tranquilas.length > 0 && tranquilas.length < gruposTec.length) setPlegados((p) => new Set([...p, ...tranquilas]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agrupar, filas.length]);

  const plegar = (k: string) => setPlegados((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // --- Barra: buscador + selector de vista ---
  const barra = (
    <div className="flex items-center gap-3 mb-4">
      <div className="relative w-[280px] shrink-0">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar persona o servicio"
          className="w-full h-10 pl-10 pr-9 rounded-full bg-surface border border-line focus:border-teal focus:outline-none text-[14px] placeholder:text-muted" />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label="Limpiar" className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-muted hover:bg-surface-2"><X size={14} /></button>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">{chips}</div>
      <div className="ml-auto flex items-center p-1 rounded-full bg-surface border border-line shrink-0">
        {([['servicio', 'Por servicio', ListIcon], ['tecnico', 'Por persona', Users]] as const).map(([k, l, I]) => (
          <button key={k} type="button" onClick={() => cambiarVista(k)}
            className={`h-8 px-3.5 rounded-full text-[13px] font-semibold flex items-center gap-1.5 transition-colors ${vista === k ? 'bg-teal text-inkOnAccent' : 'text-ink/70 hover:text-ink'}`}>
            <I size={14} /> {l}
          </button>
        ))}
      </div>
    </div>
  );

  // --- Disponibles: compactos, se expanden si son muchos ---
  const MAX_DISP = 10;
  const bloqueDisponibles = (filtro === 'todos' || filtro === 'sin') && disponibles.length > 0 && (
    <div className="mb-4 rounded-2xl border border-dashed border-line-strong px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5 shrink-0"><UserX size={14} /> Disponibles · {disponibles.length}</p>
        {(verDisponibles || filtro === 'sin' ? disponibles : disponibles.slice(0, MAX_DISP)).map((f) => (
          <button key={f.id} type="button" onClick={() => pedirAsignar([f.id])} title={`Asignar servicio a ${f.nombre}`}
            className="pl-1 pr-2.5 py-1 rounded-full bg-surface border border-line text-[12.5px] font-medium flex items-center gap-1.5 hover:border-teal/50">
            <AvatarTecnico id={f.id} nombre={f.nombre} size={22} indice={indiceTec(f.id)} />
            {nombreCorto(f.nombre)}
            <Plus size={12} className="text-teal" />
          </button>
        ))}
        {filtro !== 'sin' && disponibles.length > MAX_DISP && (
          <button type="button" onClick={() => setVerDisponibles((v) => !v)} className="text-[12.5px] font-semibold text-teal">
            {verDisponibles ? 'Ver menos' : `+${disponibles.length - MAX_DISP} más`}
          </button>
        )}
      </div>
    </div>
  );

  // --- Vista por servicio ---
  const COLS = 'grid grid-cols-[64px_minmax(0,1.6fr)_minmax(0,1.3fr)_150px_150px_110px_28px] gap-4 items-center';
  const vistaServicio = (
    <>
      {bloqueDisponibles}
      {filtro !== 'sin' && (
        <div className="rounded-2xl bg-surface border border-line overflow-hidden">
          <div className={`${COLS} px-4 py-2.5 border-b border-line bg-surface-2/60 text-[11px] font-semibold uppercase tracking-wider text-muted`}>
            <span>Hora</span><span>Servicio</span><span>Personal</span><span>Estado</span><span>Tiempos</span><span>Reporte</span><span />
          </div>
          {grupos.every((g) => g.items.length === 0) && (
            <p className="text-[13.5px] text-muted text-center py-10">{servicios.length === 0 ? 'No hay servicios este día.' : 'Nada coincide con la búsqueda o el filtro.'}</p>
          )}
          {grupos.filter((g) => g.items.length > 0).map((g) => (
            <div key={g.k}>
              <button type="button" onClick={() => plegar(g.k)}
                className="w-full flex items-center gap-2 px-4 py-2 bg-bg/60 border-b border-line text-left">
                <ChevronDown size={14} className={`text-muted transition-transform ${plegados.has(g.k) ? '-rotate-90' : ''}`} />
                <span className={`text-[12.5px] font-bold ${g.tono}`}>{g.titulo}</span>
                <span className="text-[12px] text-muted">{g.items.length}</span>
              </button>
              {!plegados.has(g.k) && g.items.map((sv) => {
                const est = estadoGlobal(sv);
                const alerta = g.k === 'atencion';
                const atraso = llegadaAtrasada(sv, hoy, minutos, fecha);
                const open = abierto === sv.id;
                return (
                  <div key={sv.id} className={`border-b border-line last:border-b-0 ${open ? 'bg-surface-2/40' : ''}`}>
                    <button type="button" onClick={() => setAbierto(open ? null : sv.id)}
                      className={`${COLS} w-full px-4 py-3 text-left hover:bg-surface-2/50 transition-colors`}>
                      <span className="text-[13px] tabular-nums font-semibold">{horaCorta(sv.hora_programada) || '—'}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          {alerta && <AlertTriangle size={13} className="text-red shrink-0" />}
                          <span className="text-[14px] font-semibold truncate">{sv.proyecto}</span>
                        </span>
                        <span className="block text-[12px] text-muted truncate">
                          {sv.dias_totales > 1 ? `Día ${sv.numero_dia} de ${sv.dias_totales}` : 'Un día'}
                          {sv.avisosPendientes.length > 0 && <span className="text-red font-semibold"> · {sv.avisosPendientes.length} aviso(s)</span>}
                          {atraso > 0 && <span className="text-red font-semibold"> · {duracion(atraso)} tarde</span>}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="flex -space-x-2 shrink-0">
                          {sv.asignados.slice(0, 4).map((a) => (
                            <span key={a.tecnico_id} className="rounded-full ring-2 ring-surface"><AvatarTecnico id={a.tecnico_id} nombre={a.nombre} size={26} indice={indiceTec(a.tecnico_id)} /></span>
                          ))}
                        </span>
                        <span className="text-[12.5px] text-ink/80 truncate">
                          {sv.asignados.length === 0 ? 'Sin asignar' : sv.asignados.map((a) => nombreCorto(a.nombre)).join(', ')}
                        </span>
                      </span>
                      <span><span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${est.cls}`}>{est.texto}</span></span>
                      <span className="text-[12px] tabular-nums text-muted leading-tight">
                        {sv.hora_llegada ? <>Llegó {hora(sv.hora_llegada)}</> : '—'}
                        {sv.hora_fin && <><br />Fin {hora(sv.hora_fin)}</>}
                      </span>
                      <span>
                        {sv.report_id ? <span className="text-[11.5px] font-semibold text-teal flex items-center gap-1"><FileText size={13} /> Listo</span>
                          : sv.estado === 'concluido' ? <span className="text-[11.5px] font-semibold text-red">Falta</span>
                          : <span className="text-[12px] text-faint">—</span>}
                      </span>
                      <ChevronDown size={16} className={`text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && (
                      <div className="px-4 pb-4 grid grid-cols-2 xl:grid-cols-3 gap-3">
                        {sv.asignados.length === 0 && <p className="text-[13px] text-muted">Este servicio no tiene personal asignado.</p>}
                        {sv.asignados.map((a) => (
                          <div key={a.tecnico_id} className="rounded-xl bg-surface border border-line pt-2.5">
                            <div className="flex items-center gap-2 px-3 mb-1">
                              <AvatarTecnico id={a.tecnico_id} nombre={a.nombre} size={26} indice={indiceTec(a.tecnico_id)} />
                              <span className="text-[13px] font-semibold truncate">{a.nombre}</span>
                            </div>
                            <div className="[&>div]:pl-3">
                              <DetalleServicio s={sv} tecnicoId={a.tecnico_id} hoy={hoy} minutos={minutos} fecha={fecha} onCambio={() => onCambio(sv)} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </>
  );

  // --- Vista por técnico: lista + detalle ---
  const vistaTecnico = (
    <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
      <div className="rounded-2xl bg-surface border border-line overflow-hidden lg:sticky lg:top-[150px] 2xl:top-6">
        <div className="max-h-[calc(100vh-190px)] overflow-y-auto divide-y divide-line flex flex-col">
          {tecnicosLista.length === 0 && <p className="text-[13px] text-muted p-4">Nadie coincide.</p>}
          {gruposTec.map((g) => {
            if (g.k === null) return null;
            const cerrado = plegados.has(`c:${g.k}`);
            const conServicio = g.items.filter((f) => f.servicios.length > 0).length;
            const alertas = g.items.filter((f) => estadoTecnico(f) === 'alerta').length;
            return (
              <button key={`h:${g.k}`} type="button" onClick={() => plegar(`c:${g.k}`)} style={{ order: g.orden * 1000 }}
                className="w-full flex items-center gap-2 px-3.5 py-2 bg-bg/60 text-left">
                <ChevronDown size={14} className={`text-muted transition-transform ${cerrado ? '-rotate-90' : ''}`} />
                {g.color !== null && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: UNIFORMES[g.color % UNIFORMES.length] }} />}
                <span className="text-[12.5px] font-bold flex-1 min-w-0 truncate">{g.titulo}</span>
                <span className="text-[11.5px] text-muted tabular-nums shrink-0">{conServicio}/{g.items.length} con servicio</span>
                {alertas > 0 && <span className="text-[11px] font-bold text-red tabular-nums shrink-0">{alertas} ⚠</span>}
              </button>
            );
          })}
          {tecnicosLista.filter((f) => !plegados.has(`c:${claveGrupo(f.id)}`)).map((f) => {
            const activo = tecActual?.id === f.id;
            const enCurso = f.servicios.find((s) => s.estado === 'en_sitio' || s.estado === 'en_curso');
            const resumen = f.servicios.length === 0 ? 'Disponible'
              : enCurso ? `${enCurso.estado === 'en_curso' ? 'En curso' : 'En sitio'} · ${enCurso.proyecto}`
              : `${f.servicios.length} servicio${f.servicios.length > 1 ? 's' : ''} · ${f.servicios.filter((s) => s.estado === 'concluido').length} concluido(s)`;
            return (
              <button key={f.id} type="button" onClick={() => setTecSel(f.id)} style={agrupar ? { order: ordenGrupo(f.id) * 1000 + 1 } : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${activo ? 'bg-teal/10' : 'hover:bg-surface-2/60'}`}>
                <AvatarTecnico id={f.id} nombre={f.nombre} size={34} estado={estadoTecnico(f)} indice={indiceTec(f.id)} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13.5px] truncate ${activo ? 'font-bold text-teal' : 'font-semibold'}`}>{f.nombre}</span>
                  <span className={`block text-[12px] truncate ${f.servicios.length === 0 ? 'text-faint' : 'text-muted'}`}>{resumen}</span>
                </span>
                {f.servicios.length > 0 && <span className="text-[11.5px] font-bold tabular-nums w-6 h-6 rounded-full bg-surface-2 flex items-center justify-center shrink-0">{f.servicios.length}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-2xl bg-surface border border-line p-5 min-h-[240px]">
        {!tecActual ? (
          <p className="text-[13.5px] text-muted text-center py-10">Elige a una persona.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <AvatarTecnico id={tecActual.id} nombre={tecActual.nombre} size={48} estado={estadoTecnico(tecActual)} indice={indiceTec(tecActual.id)} />
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-[20px] leading-tight truncate">{tecActual.nombre}</p>
                <p className="text-[13px] text-muted">{tecActual.servicios.length === 0 ? 'Sin servicio este día' : `${tecActual.servicios.length} servicio(s) este día`}</p>
              </div>
              <button type="button" onClick={() => pedirAsignar([tecActual.id])}
                className="h-10 px-4 rounded-full bg-teal/12 text-teal text-[13px] font-semibold flex items-center gap-1.5 hover:bg-teal/20">
                <Plus size={15} /> Asignar servicio
              </button>
            </div>
            {tecActual.servicios.length === 0 ? (
              <p className="text-[13.5px] text-muted rounded-xl border border-dashed border-line-strong px-4 py-6 text-center">Disponible: no tiene servicios asignados.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {tecActual.servicios.map((sv) => {
                  const e = estadoServicio(sv, tecActual.id);
                  return (
                    <div key={sv.id} className={`rounded-xl border pt-3 ${alertaDe(sv, tecActual.id) ? 'border-red/40' : 'border-line'}`}>
                      <div className="flex items-center gap-3 px-4">
                        <span className="text-[13px] tabular-nums font-semibold w-12 shrink-0">{horaCorta(sv.hora_programada) || '—'}</span>
                        <span className="flex-1 min-w-0 text-[15px] font-semibold truncate">{sv.proyecto}</span>
                        <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${e.cls}`}>{e.corto}</span>
                      </div>
                      <div className="[&>div]:pl-[76px] [&>div]:pt-1">
                        <DetalleServicio s={sv} tecnicoId={tecActual.id} hoy={hoy} minutos={minutos} fecha={fecha} onCambio={() => onCambio(sv)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div>
      {barra}
      {vista === 'servicio' ? vistaServicio : vistaTecnico}
    </div>
  );
}
