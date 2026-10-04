'use client';

import { Rutina, listarRutinas, tareasDeRutina } from '@/lib/rutinas';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Repeat, Pencil, CalendarPlus, SkipForward } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import { showToast } from '@/components/Toast';
import { SelectorTecnicos } from '@/components/TableroDia';
import { hoyLocal, fechaLocal } from '@/lib/fechaHoy';
import { listarTecnicos } from '@/lib/serviciosProgramados';
import {
  Recurrente, Frecuencia, FRECUENCIAS, listarRecurrentes, guardarRecurrente, eliminarRecurrente,
  avanzarRecurrente, porProgramar, siguienteFecha, DIAS_AVISO,
} from '@/lib/mantenimientosRecurrentes';

// Mantenimientos recurrentes por cliente. Dos piezas:
//   · PorProgramar: aviso en la Agenda con los que vencen en los próximos
//     días, para programarlos con un toque (o saltar el periodo).
//   · MantenimientosRecurrentes: la lista completa para darlos de alta,
//     editarlos o pausarlos.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaBonita(f: string): string {
  const d = fechaLocal(f);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
const inputCls = 'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px] placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const chip = (sel: boolean) =>
  `px-3 py-1.5 rounded-full text-[12.5px] font-medium mr-1.5 mb-1.5 inline-block cursor-pointer border ${sel ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 text-ink/80 border-line'}`;

function useTecnicos() {
  const [tecnicos, setTecnicos] = useState<{ id: string; nombre: string }[]>([]);
  useEffect(() => {
    listarTecnicos().then((t) => setTecnicos(t.map((x) => ({ id: x.id, nombre: x.full_name })))).catch(() => {});
  }, []);
  return tecnicos;
}

// ------------------------------------------------------------------
// Aviso en la Agenda
// ------------------------------------------------------------------
export function PorProgramar() {
  const [hoy, setHoy] = useState('');
  const [lista, setLista] = useState<Recurrente[]>([]);
  const router = useRouter();

  const cargar = useCallback(() => {
    listarRecurrentes().then(setLista).catch(() => setLista([]));
  }, []);

  useEffect(() => {
    setHoy(hoyLocal());
    cargar();
  }, [cargar]);

  if (!hoy) return null;
  const pendientes = porProgramar(lista, hoy);
  if (pendientes.length === 0) return null;

  // Abre el formulario completo de Servicios ya lleno; al guardar, la próxima
  // fecha avanza y regresa a la Agenda.
  function programar(r: Recurrente) {
    const q = new URLSearchParams({
      agendar: '1',
      fecha: r.proxima_fecha < hoy ? hoy : r.proxima_fecha,
      proyecto: r.proyecto,
      recurrente: r.id,
      volver: 'agenda',
    });
    if (r.cliente_id) q.set('cliente', r.cliente_id);
    if (r.descripcion) q.set('descripcion', r.descripcion);
    if (r.hora) q.set('hora', r.hora.slice(0, 5));
    if (r.tecnico_ids.length) q.set('tecnicos', r.tecnico_ids.join(','));
    if (r.rutina_id) q.set('rutina', r.rutina_id);
    router.push(`/dashboard/servicios?${q.toString()}`);
  }

  async function saltar(r: Recurrente) {
    try {
      await avanzarRecurrente(r, null);
      showToast(`Saltado; el siguiente queda el ${fechaBonita(siguienteFecha(r))}`, 'success');
      cargar();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo saltar', 'error');
    }
  }

  return (
    <div className="rounded-2xl border border-amber/40 bg-amber/5 p-3.5 mb-4">
      <p className="text-[13px] font-semibold text-amber flex items-center gap-1.5 mb-2">
        <Repeat size={15} /> Mantenimientos por programar ({pendientes.length})
      </p>
      <div className="flex flex-col gap-2">
        {pendientes.map((r) => {
          const vencido = r.proxima_fecha < hoy;
          return (
            <div key={r.id} className="rounded-xl bg-surface border border-line px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold truncate">{r.proyecto}</p>
                  <p className={`text-[12px] ${vencido ? 'text-red font-semibold' : 'text-muted'}`}>
                    {FRECUENCIAS.find((f) => f.valor === r.frecuencia)?.label} · {vencido ? 'tocaba el ' : 'toca el '}{fechaBonita(r.proxima_fecha)}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 mt-1.5 text-[12.5px] font-semibold">
                <button type="button" onClick={() => programar(r)} className="text-teal flex items-center gap-1"><CalendarPlus size={14} /> Programar</button>
                <button type="button" onClick={() => saltar(r)} className="text-muted flex items-center gap-1"><SkipForward size={14} /> Saltar este periodo</button>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ------------------------------------------------------------------
// Lista y alta
// ------------------------------------------------------------------
export default function MantenimientosRecurrentes() {
  const [lista, setLista] = useState<Recurrente[] | null>(null);
  const [editando, setEditando] = useState<Partial<Recurrente> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tecnicos = useTecnicos();

  const cargar = useCallback(() => {
    listarRecurrentes().then((l) => { setLista(l); setError(null); }).catch(() => { setLista([]); setError('No se pudieron cargar los mantenimientos recurrentes.'); });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const nombreTec = (id: string) => tecnicos.find((t) => t.id === id)?.nombre.split(' ')[0] || '—';

  return (
    <div>
      <p className="text-[13px] text-muted mb-3 leading-relaxed">
        Clientes con mantenimiento periódico. {DIAS_AVISO} días antes de la fecha aparecen en la Semana como «por programar»; al programarlos, la siguiente fecha se calcula sola.
      </p>
      <button type="button" onClick={() => setEditando({ frecuencia: 'trimestral', activo: true, tecnico_ids: [], duracion_min: 120 })}
        className="w-full min-h-[48px] mb-4 rounded-2xl border border-dashed border-teal/50 text-teal text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-teal/5">
        <Plus size={18} strokeWidth={2.6} /> Nuevo mantenimiento recurrente
      </button>

      {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}
      {lista && lista.length === 0 && !error && <p className="text-[13px] text-muted text-center py-6">Todavía no hay mantenimientos recurrentes.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {lista?.map((r) => (
          <div key={r.id} className={`rounded-2xl bg-surface border border-line p-3.5 ${r.activo ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[14.5px] font-semibold truncate">{r.proyecto}</p>
                <p className="text-[12.5px] text-muted">
                  {FRECUENCIAS.find((f) => f.valor === r.frecuencia)?.label}
                  {r.activo ? ` · próximo ${fechaBonita(r.proxima_fecha)}` : ' · en pausa'}
                  {r.hora ? ` · ${r.hora.slice(0, 5)}` : ''}
                </p>
                {r.descripcion && <p className="text-[12.5px] mt-0.5 truncate">{r.descripcion}</p>}
                <p className="text-[12px] text-muted mt-0.5">
                  {r.tecnico_ids.length ? r.tecnico_ids.map(nombreTec).join(', ') : 'Sin personal predefinido'}
                  {r.ultima_programacion ? ` · último: ${fechaBonita(r.ultima_programacion)}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setEditando(r)} aria-label="Editar" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted shrink-0"><Pencil size={16} /></button>
            </div>
          </div>
        ))}
      </div>

      {editando && (
        <FormRecurrente inicial={editando} tecnicos={tecnicos} onClose={() => setEditando(null)} onListo={() => { setEditando(null); cargar(); }} />
      )}
    </div>
  );
}

function FormRecurrente({ inicial, tecnicos, onClose, onListo }: {
  inicial: Partial<Recurrente>; tecnicos: { id: string; nombre: string }[]; onClose: () => void; onListo: () => void;
}) {
  const [proyecto, setProyecto] = useState(inicial.proyecto || '');
  const [clienteId, setClienteId] = useState<string | null>(inicial.cliente_id || null);
  const [descripcion, setDescripcion] = useState(inicial.descripcion || '');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(inicial.frecuencia || 'trimestral');
  const [proxima, setProxima] = useState(inicial.proxima_fecha || '');
  const [hora, setHora] = useState(inicial.hora ? inicial.hora.slice(0, 5) : '');
  const [ids, setIds] = useState<string[]>(inicial.tecnico_ids || []);
  const [notas, setNotas] = useState(inicial.notas || '');
  const [activo, setActivo] = useState(inicial.activo ?? true);
  const [rutinaId, setRutinaId] = useState<string | null>(inicial.rutina_id || null);
  const [rutinas, setRutinas] = useState<Rutina[]>([]);
  useEffect(() => { listarRutinas().then(setRutinas).catch(() => {}); }, []);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (proyecto.trim().length < 2) { setError('Escribe el cliente.'); return; }
    if (!proxima) { setError('Elige la fecha del próximo mantenimiento.'); return; }
    setGuardando(true);
    setError(null);
    try {
      await guardarRecurrente({
        id: inicial.id, cliente_id: clienteId, proyecto, descripcion, frecuencia, proxima_fecha: proxima,
        hora: hora || null, duracion_min: inicial.duracion_min || 120, tecnico_ids: ids, notas, activo,
        ...(rutinas.length ? { rutina_id: rutinaId } : {}),
      });
      showToast('Mantenimiento recurrente guardado', 'success');
      onListo();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar.');
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!inicial.id) return;
    setGuardando(true);
    try {
      await eliminarRecurrente(inicial.id);
      showToast('Mantenimiento recurrente eliminado', 'success');
      onListo();
    } catch (e: any) {
      setError(e?.message || 'No se pudo eliminar.');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="font-display font-bold text-[19px] tracking-wide">{inicial.id ? 'Editar mantenimiento' : 'Nuevo mantenimiento recurrente'}</h2>
          <button onClick={onClose} disabled={guardando} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted"><X size={19} /></button>
        </div>
        <label className={labelCls}>Cliente</label>
        <div className="mb-3">
          <AutocompletarCliente soloSugerir value={proyecto} onChange={(n, id) => { setProyecto(n); setClienteId(id); }} className={inputCls} placeholder="Ej. Hospital Central" />
        </div>
        <label className={labelCls}>Qué se hace</label>
        <input className={`${inputCls} mb-3`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Pruebas de detectores NFPA 72" />
        <label className={labelCls}>Cada cuánto</label>
        <div className="mb-2">
          {FRECUENCIAS.map((f) => <span key={f.valor} className={chip(frecuencia === f.valor)} onClick={() => setFrecuencia(f.valor)}>{f.label}</span>)}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className={labelCls}>Próximo</label>
            <input type="date" className={inputCls} value={proxima} onChange={(e) => setProxima(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Hora (opcional)</label>
            <input type="time" className={inputCls} value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>
        {rutinas.length > 0 && (
          <>
            <label className={labelCls}>Rutina de tareas</label>
            <select className={`${inputCls} mb-3`} value={rutinaId || ''} onChange={(e) => setRutinaId(e.target.value || null)}>
              <option value="">Sin rutina</option>
              {rutinas.map((r) => <option key={r.id} value={r.id}>{r.nombre} ({tareasDeRutina(r).length} tareas)</option>)}
            </select>
          </>
        )}
        <label className={labelCls}>Personal de siempre (opcional)</label>
        <SelectorTecnicos tecnicos={tecnicos} seleccion={ids} onCambiar={setIds} />
        <label className={`${labelCls} mt-2`}>Notas (opcional)</label>
        <input className={`${inputCls} mb-3`} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. Avisar a mantenimiento 2 días antes" />
        {inicial.id && (
          <label className="flex items-center gap-2 text-[13.5px] mb-2">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Activo (desmarca para pausarlo)
          </label>
        )}
        {error && <p className="text-[13px] text-red font-semibold mt-1">{error}</p>}
        <button type="button" onClick={guardar} disabled={guardando}
          className="w-full mt-3 min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        {inicial.id && (
          <button type="button" onClick={borrar} disabled={guardando} className="w-full mt-2 min-h-[42px] text-[13px] font-semibold text-red">Eliminar</button>
        )}
      </div>
    </ModalOverlay>
  );
}
