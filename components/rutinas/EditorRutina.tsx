'use client';

import { useState } from 'react';
import { X, Plus, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { Rutina, SeccionRutina, SISTEMAS_RUTINA, ETAPAS_SUGERIDAS, guardarRutina } from '@/lib/rutinas';

// Crear o editar una rutina: nombre, sistema y tareas agrupadas por etapa.

const inputCls = 'w-full px-3 min-h-[44px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px] placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';

export default function EditorRutina({
  inicial, onClose, onGuardada,
}: {
  inicial?: Partial<Rutina> | null;
  onClose: () => void;
  onGuardada: (id: string) => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre || '');
  const [sistema, setSistema] = useState(inicial?.sistema || '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion || '');
  const [secciones, setSecciones] = useState<SeccionRutina[]>(
    inicial?.secciones?.length ? inicial.secciones.map((s) => ({ titulo: s.titulo, tareas: [...s.tareas, ''] })) : ETAPAS_SUGERIDAS.slice(0, 3).map((t) => ({ titulo: t, tareas: [''] })),
  );
  const [guardando, setGuardando] = useState(false);

  const total = secciones.reduce((n, s) => n + s.tareas.filter((t) => t.trim()).length, 0);
  const cambiarSeccion = (i: number, p: Partial<SeccionRutina>) => setSecciones((prev) => prev.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const cambiarTarea = (i: number, k: number, v: string) =>
    setSecciones((prev) => prev.map((s, j) => {
      if (j !== i) return s;
      const tareas = s.tareas.map((t, x) => (x === k ? v : t));
      // Siempre queda un renglón vacío al final para seguir escribiendo.
      if (k === tareas.length - 1 && v.trim()) tareas.push('');
      return { ...s, tareas };
    }));
  const moverSeccion = (i: number, d: -1 | 1) => setSecciones((prev) => {
    const n = [...prev]; const j = i + d;
    if (j < 0 || j >= n.length) return prev;
    [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  async function guardar() {
    if (nombre.trim().length < 2) { showToast('Ponle nombre a la rutina', 'error'); return; }
    if (total === 0) { showToast('Agrega al menos una tarea', 'error'); return; }
    setGuardando(true);
    try {
      const id = await guardarRutina({ id: inicial?.id, nombre, sistema: sistema || null, descripcion: descripcion || null, secciones });
      showToast('Rutina guardada', 'success');
      onGuardada(id);
    } catch (e: any) {
      showToast(e?.message?.includes('rutinas_tareas') ? 'Falta correr el SQL de rutinas' : e?.message || 'No se pudo guardar', 'error');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-2xl p-5 lg:p-6 max-h-[94vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display font-bold text-[20px]">{inicial?.id ? 'Editar rutina' : 'Nueva rutina'}</h2>
            <p className="text-[13px] text-muted">Tareas que se repiten en cada mantenimiento, ordenadas por etapa.</p>
          </div>
          <button type="button" onClick={onClose} disabled={guardando} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted"><X size={19} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Nombre</label>
            <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Mantenimiento preventivo CCTV" />
          </div>
          <div>
            <label className={labelCls}>Descripción (opcional)</label>
            <input className={inputCls} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Trimestral, cámaras y grabador" />
          </div>
        </div>
        <label className={labelCls}>Sistema</label>
        <div className="flex flex-wrap gap-1.5 mb-5">
          {SISTEMAS_RUTINA.map((s) => (
            <button key={s} type="button" onClick={() => setSistema(sistema === s ? '' : s)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium border ${sistema === s ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line'}`}>{s}</button>
          ))}
        </div>

        <datalist id="etapas-rutina">{ETAPAS_SUGERIDAS.map((e) => <option key={e} value={e} />)}</datalist>
        <div className="flex flex-col gap-3">
          {secciones.map((s, i) => (
            <div key={i} className="rounded-2xl border border-line bg-surface/60 p-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-7 h-7 rounded-lg bg-teal/15 text-teal text-[12.5px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <input list="etapas-rutina" className={`${inputCls} font-semibold`} value={s.titulo} onChange={(e) => cambiarSeccion(i, { titulo: e.target.value })} placeholder="Etapa (ej. Pruebas con equipos)" />
                <button type="button" onClick={() => moverSeccion(i, -1)} disabled={i === 0} aria-label="Subir etapa" className="w-9 h-9 rounded-lg border border-line flex items-center justify-center disabled:opacity-30"><ChevronUp size={16} /></button>
                <button type="button" onClick={() => moverSeccion(i, 1)} disabled={i === secciones.length - 1} aria-label="Bajar etapa" className="w-9 h-9 rounded-lg border border-line flex items-center justify-center disabled:opacity-30"><ChevronDown size={16} /></button>
                <button type="button" onClick={() => setSecciones(secciones.filter((_, j) => j !== i))} aria-label="Quitar etapa" className="w-9 h-9 rounded-lg border border-line text-red flex items-center justify-center"><Trash2 size={15} /></button>
              </div>
              <div className="flex flex-col gap-1.5 pl-9">
                {s.tareas.map((t, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded border shrink-0 ${t.trim() ? 'border-teal/60' : 'border-line border-dashed'}`} />
                    <input className={`${inputCls} min-h-[40px] text-[14px]`} value={t} onChange={(e) => cambiarTarea(i, k, e.target.value)}
                      placeholder={k === s.tareas.length - 1 ? 'Escribe una tarea…' : ''} />
                    {t.trim() && (
                      <button type="button" onClick={() => cambiarSeccion(i, { tareas: s.tareas.filter((_, x) => x !== k) })} aria-label="Quitar tarea" className="text-muted w-8 shrink-0 flex justify-center"><X size={15} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setSecciones([...secciones, { titulo: ETAPAS_SUGERIDAS[secciones.length] || '', tareas: [''] }])}
          className="w-full mt-3 min-h-[44px] rounded-xl border border-dashed border-teal/50 text-teal text-[13.5px] font-semibold flex items-center justify-center gap-1.5">
          <Plus size={15} /> Agregar etapa
        </button>

        <button type="button" onClick={guardar} disabled={guardando}
          className="w-full mt-4 min-h-[50px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-50">
          {guardando ? 'Guardando…' : `Guardar rutina · ${total} tarea${total === 1 ? '' : 's'}`}
        </button>
      </div>
    </ModalOverlay>
  );
}
