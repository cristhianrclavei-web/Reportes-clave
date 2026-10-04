'use client';

import SelectorPersona from '@/components/cuadrillas/SelectorPersona';
import { useCuadrillas, cuadrillaPorTecnico, enCuadrilla, TODAS, SIN_CUADRILLA } from '@/lib/cuadrillas';
import { FiltroCuadrillas } from '@/components/cuadrillas/ChipsCuadrilla';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Copy, ArrowRightLeft, X, ExternalLink } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { CambioDia, SelectorTecnicos } from '@/components/TableroDia';
import { PorProgramar } from '@/components/MantenimientosRecurrentes';
import { TiraTecnicos } from '@/components/AvatarTecnico';
import { hoyLocal, sumarDias, fechaLocal } from '@/lib/fechaHoy';
import { listarFestivos, festivosEnCache, Festivo } from '@/lib/avisos';
import { motivoNoEditable } from '@/lib/serviciosProgramados';
import { ServicioDia, cargarSemana, copiarServicio } from '@/lib/tableroDia';

// Planeación de la semana: técnicos × días con sus servicios. Sirve para
// planear con anticipación y para acomodar lo de mañana: «+» en cualquier
// casilla asigna con el técnico y la fecha ya puestos, y cada servicio se
// puede copiar a otro día o cambiar (reprogramar, cancelar, mover técnicos).
// En el celular se ve un técnico a la vez con sus siete días.

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const SIN_TECNICO = '__sin__';

function lunesDe(f: string): string {
  const d = fechaLocal(f).getDay();
  return sumarDias(f, d === 0 ? -6 : 1 - d);
}

function etiquetaSemana(lunes: string): string {
  const fin = sumarDias(lunes, 6);
  const a = fechaLocal(lunes), b = fechaLocal(fin);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${MESES[b.getMonth()]}`
    : `${a.getDate()} ${MESES[a.getMonth()]} – ${b.getDate()} ${MESES[b.getMonth()]}`;
}

function nombreCorto(n: string): string {
  const p = n.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0];
}

function colorServicio(s: ServicioDia): string {
  if (s.estado === 'cancelado') return 'bg-surface-2 text-faint line-through border-line';
  if (s.estado === 'concluido') return 'bg-teal/12 text-teal border-teal/30';
  if (s.estado === 'en_sitio' || s.estado === 'en_curso') return 'bg-amber/12 text-amber border-amber/35';
  if (s.asignados.length > 0 && s.asignados.every((a) => a.enterado_en)) return 'bg-surface text-ink border-line-strong';
  return 'bg-surface text-ink border-dashed border-line-strong';
}

export default function PlanSemana() {
  const [hoy, setHoy] = useState('');
  const [lunes, setLunes] = useState('');
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof cargarSemana>> | null>(null);
  const [festivos, setFestivos] = useState<Festivo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [acciones, setAcciones] = useState<ServicioDia | null>(null);
  const [cambio, setCambio] = useState<ServicioDia | null>(null);
  const [copiar, setCopiar] = useState<ServicioDia | null>(null);
  const router = useRouter();

  useEffect(() => {
    const h = hoyLocal();
    setHoy(h);
    setLunes(lunesDe(h));
    setFestivos(festivosEnCache());
    listarFestivos().then(setFestivos).catch(() => {});
  }, []);

  const dias = useMemo(() => (lunes ? Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)) : []), [lunes]);

  const cargar = useCallback(async () => {
    if (!lunes) return;
    setCargando(true);
    try {
      setDatos(await cargarSemana(lunes, sumarDias(lunes, 6)));
      setError(null);
    } catch {
      setError('No se pudo cargar la semana. Revisa la conexión.');
    } finally {
      setCargando(false);
    }
  }, [lunes]);

  useEffect(() => { cargar(); }, [cargar]);

  // Cuadrillas (opcionales): reducen la semana a un grupo de personas.
  const { cuadrillas } = useCuadrillas();
  const mapaCuad = useMemo(() => cuadrillaPorTecnico(cuadrillas), [cuadrillas]);
  const [cuad, setCuad] = useState<string>(TODAS);
  useEffect(() => {
    if (cuad !== TODAS && cuad !== SIN_CUADRILLA && !cuadrillas.some((c) => c.id === cuad)) setCuad(TODAS);
  }, [cuad, cuadrillas]);

  // Filas: técnicos activos (de la cuadrilla elegida) y, si hay, «Sin
  // técnico» al final cuando se ven todos.
  const filas = useMemo(() => {
    if (!datos) return [];
    const base = datos.tecnicos.filter((t) => enCuadrilla(cuad, mapaCuad, t.id)).map((t) => ({ id: t.id, nombre: t.nombre }));
    if (cuad === TODAS && datos.servicios.some((s) => s.asignados.length === 0)) base.push({ id: SIN_TECNICO, nombre: 'Sin asignar' });
    return base;
  }, [datos, cuad, mapaCuad]);

  const serviciosDe = useCallback((tecnicoId: string, fecha: string) =>
    (datos?.servicios || []).filter((s) => s.fecha === fecha && (tecnicoId === SIN_TECNICO ? s.asignados.length === 0 : s.asignados.some((a) => a.tecnico_id === tecnicoId))),
  [datos]);

  const cuenta = useCallback((tecnicoId: string) =>
    dias.reduce((n, d) => n + serviciosDe(tecnicoId, d).filter((s) => s.estado !== 'cancelado').length, 0), [dias, serviciosDe]);

  // Celular: el menú lista a la gente de la cuadrilla elegida (o a todos).
  const filasMovil = filas;
  const seleccionado = filasMovil.find((f) => f.id === selId) || filasMovil[0];

  useEffect(() => {
    const cont = document.querySelector<HTMLElement>('[data-tira="semana"]');
    const el = cont?.querySelector<HTMLElement>(`[data-tec="${seleccionado?.id}"]`);
    if (cont && el) cont.scrollTo({ left: el.offsetLeft - cont.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [seleccionado?.id]);

  // «+» abre el formulario completo de Servicios (ubicación, tareas, lista de
  // carga, varios días) con la fecha y el técnico puestos; al guardar regresa.
  function agendarCompleto(fecha: string, tecnicoIds: string[]) {
    const q = new URLSearchParams({ agendar: '1', fecha, volver: 'agenda' });
    if (tecnicoIds.length) q.set('tecnicos', tecnicoIds.join(','));
    router.push(`/dashboard/servicios?${q.toString()}`);
  }

  const festivo = (f: string) => festivos.find((x) => x.fecha === f && x.tipo !== 'costumbre');

  if (!lunes) return null;

  function Chip({ s }: { s: ServicioDia }) {
    return (
      <button type="button" onClick={() => setAcciones(s)}
        className={`w-full text-left rounded-lg border px-2 py-1.5 text-[12px] leading-tight active:scale-[0.98] transition-transform ${colorServicio(s)}`}>
        <span className="block font-semibold truncate">{s.proyecto}</span>
        <span className="block text-[11px] opacity-80 truncate">
          {s.hora_programada ? s.hora_programada.slice(0, 5) : 'Sin hora'}
          {s.dias_totales > 1 ? ` · ${s.numero_dia}/${s.dias_totales}` : ''}
          {s.estado === 'cancelado' ? ' · cancelado' : ''}
        </span>
      </button>
    );
  }

  function BotonMas({ fecha, tecnicoId }: { fecha: string; tecnicoId: string }) {
    if (fecha < hoy) return null;
    return (
      <button type="button" onClick={() => agendarCompleto(fecha, tecnicoId === SIN_TECNICO ? [] : [tecnicoId])} aria-label="Asignar servicio"
        className="w-full min-h-[30px] rounded-lg border border-dashed border-line text-faint hover:text-teal hover:border-teal/50 flex items-center justify-center">
        <Plus size={14} />
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <button type="button" onClick={() => setLunes(sumarDias(lunes, -7))} aria-label="Semana anterior"
          className="w-10 h-10 rounded-xl bg-surface-2 border border-line flex items-center justify-center active:scale-95">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="font-display font-semibold text-[16px]">Semana {etiquetaSemana(lunes)}</p>
          {lunes !== lunesDe(hoy) && <button type="button" onClick={() => setLunes(lunesDe(hoy))} className="text-[12px] font-semibold text-teal">Ir a esta semana</button>}
        </div>
        <button type="button" onClick={() => setLunes(sumarDias(lunes, 7))} aria-label="Semana siguiente"
          className="w-10 h-10 rounded-xl bg-surface-2 border border-line flex items-center justify-center active:scale-95">
          <ChevronRight size={18} />
        </button>
      </div>

      <PorProgramar />

      <p className="text-[12.5px] text-muted mb-3">
        Toca «+» para asignar un servicio a esa persona y día; toca un servicio para copiarlo a otro día, cambiarlo o cancelarlo.
        {datos ? ` ${datos.servicios.filter((s) => s.estado !== 'cancelado').length} servicio(s) esta semana.` : ''}
      </p>

      {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}

      {/* Mientras llega la semana: renglones de espera, no la pantalla en blanco. */}
      {!datos && !error && (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-surface border border-line p-4">
              <div className="h-3.5 w-1/3 rounded-full skeleton-shimmer mb-2.5" />
              <div className="h-2.5 w-2/3 rounded-full skeleton-shimmer" />
            </div>
          ))}
        </div>
      )}

      {datos && (
        <FiltroCuadrillas cuadrillas={cuadrillas} mapa={mapaCuad} ids={datos.tecnicos.map((t) => t.id)} valor={cuad} onCambiar={setCuad} className="mb-3" />
      )}

      {/* Celular: un técnico a la vez con sus 7 días */}
      <div className={`lg:hidden ${cargando ? 'opacity-60' : ''}`}>
        {/* Menú desplegable agrupado por cuadrilla (en vez de la tira de avatares). */}
        <SelectorPersona
          items={filasMovil.map((f) => ({ id: f.id, nombre: f.nombre, cuenta: cuenta(f.id), especial: f.id === SIN_TECNICO, indice: Math.max(0, (datos?.tecnicos || []).findIndex((t) => t.id === f.id)) }))}
          cuadrillas={cuadrillas}
          mapa={mapaCuad}
          valor={seleccionado?.id}
          onCambiar={setSelId}
        />
        <div className="h-2" />
        {seleccionado && (
          <div className="rounded-2xl bg-surface border border-line divide-y divide-line">
            {dias.map((d) => {
              const lista = serviciosDe(seleccionado.id, d);
              const fe = festivo(d);
              const finde = [0, 6].includes(fechaLocal(d).getDay());
              return (
                <div key={d} className={`flex gap-3 px-3 py-2.5 ${d === hoy ? 'bg-teal/5' : ''}`}>
                  <div className="w-11 shrink-0 pt-0.5">
                    <p className={`text-[12px] font-semibold ${d === hoy ? 'text-teal' : finde ? 'text-faint' : 'text-muted'}`}>{DIAS[fechaLocal(d).getDay()]}</p>
                    <p className={`text-[15px] font-bold tabular-nums ${d === hoy ? 'text-teal' : ''}`}>{fechaLocal(d).getDate()}</p>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    {fe && <p className="text-[11.5px] text-amber font-semibold">{fe.nombre}</p>}
                    {lista.map((s) => <Chip key={s.id} s={s} />)}
                    {lista.length === 0 && d < hoy && <p className="text-[12px] text-faint pt-1">—</p>}
                    <BotonMas fecha={d} tecnicoId={seleccionado.id} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Computadora: cuadrícula completa */}
      <div className={`hidden lg:block rounded-2xl bg-surface border border-line overflow-x-auto ${cargando ? 'opacity-60' : ''}`}>
        <table className="w-full border-collapse table-fixed min-w-[900px]">
          <thead>
            <tr>
              <th className="w-[150px] text-left text-[11px] uppercase tracking-wider text-muted font-semibold px-3 py-2.5">Personal técnico</th>
              {dias.map((d) => {
                const fe = festivo(d);
                return (
                  <th key={d} className={`text-[11px] font-semibold px-1.5 py-2.5 text-left ${d === hoy ? 'text-teal' : 'text-muted'}`}>
                    <span className="uppercase tracking-wider">{DIAS[fechaLocal(d).getDay()]}</span> <span className="tabular-nums">{fechaLocal(d).getDate()}</span>
                    {fe && <span className="block text-[10px] text-amber normal-case truncate">{fe.nombre}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-line align-top">
                <td className="px-3 py-2">
                  <p className="text-[13px] font-semibold leading-tight">{f.nombre}</p>
                  <p className={`text-[11px] ${cuenta(f.id) === 0 ? 'text-red' : 'text-muted'}`}>{cuenta(f.id)} servicio(s)</p>
                </td>
                {dias.map((d) => (
                  <td key={d} className={`px-1 py-1.5 ${d === hoy ? 'bg-teal/5' : ''}`}>
                    <div className="flex flex-col gap-1">
                      {serviciosDe(f.id, d).map((s) => <Chip key={s.id} s={s} />)}
                      <BotonMas fecha={d} tecnicoId={f.id} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {acciones && (
        <ModalOverlay onClose={() => setAcciones(null)}>
          <div className="glass-strong rounded-3xl w-full max-w-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display font-bold text-[18px] leading-tight">{acciones.proyecto}</h2>
                <p className="text-[12.5px] text-muted mt-0.5">
                  {DIAS[fechaLocal(acciones.fecha).getDay()]} {fechaLocal(acciones.fecha).getDate()} {MESES[fechaLocal(acciones.fecha).getMonth()]}
                  {acciones.hora_programada ? ` · ${acciones.hora_programada.slice(0, 5)}` : ''}
                  {acciones.asignados.length ? ` · ${acciones.asignados.map((a) => nombreCorto(a.nombre)).join(', ')}` : ' · sin asignar'}
                </p>
                {acciones.estado === 'cancelado' && <p className="text-[12.5px] text-red mt-1">Cancelado: {acciones.cancelado_motivo || 'sin motivo'}</p>}
              </div>
              <button onClick={() => setAcciones(null)} aria-label="Cerrar" className="w-9 h-9 -mr-1 -mt-1 flex items-center justify-center text-muted shrink-0"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <Link href={`/dashboard/servicios/${acciones.id}`} className="min-h-[44px] rounded-xl bg-surface-2 border border-line text-[13.5px] font-semibold flex items-center justify-center gap-2">
                <ExternalLink size={15} /> Ver servicio
              </Link>
              <button type="button" onClick={() => { setCopiar(acciones); setAcciones(null); }}
                className="min-h-[44px] rounded-xl bg-surface-2 border border-line text-[13.5px] font-semibold flex items-center justify-center gap-2">
                <Copy size={15} /> Copiar a otro día
              </button>
              {acciones.estado !== 'concluido' && acciones.estado !== 'cancelado' && (
                <button type="button" onClick={() => { setCambio(acciones); setAcciones(null); }}
                  className="min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold flex items-center justify-center gap-2">
                  <ArrowRightLeft size={15} /> Reprogramar, cancelar o mover personal
                </button>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}

      {cambio && datos && (
        <CambioDia
          servicio={cambio}
          hoy={hoy}
          otros={datos.servicios.filter((s) => s.id !== cambio.id && s.fecha === cambio.fecha && !motivoNoEditable(s.estado) && s.estado !== 'cancelado')}
          onClose={() => setCambio(null)}
          onListo={() => { setCambio(null); cargar(); }}
        />
      )}
      {copiar && datos && (
        <CopiarServicio servicio={copiar} hoy={hoy} tecnicos={datos.tecnicos} onClose={() => setCopiar(null)} onListo={() => { setCopiar(null); cargar(); }} />
      )}
    </div>
  );
}

function CopiarServicio({ servicio, hoy, tecnicos, onClose, onListo }: {
  servicio: ServicioDia; hoy: string; tecnicos: { id: string; nombre: string }[]; onClose: () => void; onListo: () => void;
}) {
  const sugerida = (() => {
    let f = sumarDias(servicio.fecha < hoy ? hoy : servicio.fecha, 1);
    while ([0, 6].includes(fechaLocal(f).getDay())) f = sumarDias(f, 1);
    return f;
  })();
  const [fecha, setFecha] = useState(sugerida);
  const [ids, setIds] = useState<string[]>(servicio.asignados.map((a) => a.tecnico_id));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!fecha) { setError('Elige la fecha.'); return; }
    setGuardando(true);
    setError(null);
    try {
      await copiarServicio(servicio, fecha, ids);
      showToast('Servicio copiado; ya les llegó el aviso', 'success');
      onListo();
    } catch (e: any) {
      setError(e?.message || 'No se pudo copiar.');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-display font-bold text-[19px] tracking-wide">Copiar a otro día</h2>
          <button onClick={onClose} disabled={guardando} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted"><X size={19} /></button>
        </div>
        <p className="text-[13px] text-muted mb-4">{servicio.proyecto}: mismo cliente, descripción, hora y ubicación. Las tareas y la lista de carga no se copian.</p>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Fecha</label>
        <input type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line text-[15px] mb-3" />
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Personal técnico</label>
        <SelectorTecnicos tecnicos={tecnicos} seleccion={ids} onCambiar={setIds} />
        {error && <p className="text-[13px] text-red font-semibold mt-2">{error}</p>}
        <button type="button" onClick={guardar} disabled={guardando}
          className="w-full mt-4 min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-50">
          {guardando ? 'Copiando…' : 'Copiar y avisar'}
        </button>
      </div>
    </ModalOverlay>
  );
}
