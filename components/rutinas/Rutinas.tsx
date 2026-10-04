'use client';

import EmptyIllustration from '@/components/EmptyIllustration';
import EstadoVacio from '@/components/EstadoVacio';
import { useCallback, useEffect, useState } from 'react';
import { Plus, ListChecks, Pencil, Copy, Trash2, Check, X } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { Rutina, listarRutinas, eliminarRutina, tareasDeRutina } from '@/lib/rutinas';
import EditorRutina from './EditorRutina';

// «Mantenimiento preventivo CCTV» → «CCTV» (cabe en el chip).
function etiquetaCorta(nombre: string): string {
  const c = nombre.replace(/^mantenimiento preventivo\s*/i, '').trim();
  return c ? c[0].toUpperCase() + c.slice(1) : nombre;
}

// ------------------------------------------------------------------
// Selector para el formulario de agendar: carga una rutina en las tareas.
// ------------------------------------------------------------------
export function CargarRutina({
  onCargar, tareasActuales,
}: {
  onCargar: (tareas: string[], rutina: Rutina) => void;
  tareasActuales: string[];
}) {
  const [rutinas, setRutinas] = useState<Rutina[] | null>(null);
  const [cargada, setCargada] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => { listarRutinas().then(setRutinas).catch(() => setRutinas([])); }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const conTexto = tareasActuales.filter((t) => t.trim());
  if (rutinas === null) return null;

  return (
    <div className="mb-3">
      {rutinas.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5 flex items-center gap-1.5"><ListChecks size={13} /> Cargar una rutina</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {rutinas.map((r) => {
              const n = tareasDeRutina(r).length;
              const activa = cargada === r.id;
              return (
                <button key={r.id} type="button"
                  onClick={() => { onCargar(tareasDeRutina(r), r); setCargada(r.id); showToast(`Rutina cargada: ${n} tareas`, 'success'); }}
                  className={`shrink-0 text-left rounded-xl border px-3 py-2 max-w-[220px] transition-colors ${activa ? 'bg-teal/12 border-teal/50' : 'bg-surface-2 border-line hover:border-teal/40'}`}>
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                    {activa && <Check size={13} className="text-teal shrink-0" />}
                    <span className="truncate">{etiquetaCorta(r.nombre)}</span>
                  </span>
                  <span className="block text-[11.5px] text-muted">{n} tareas · {r.secciones.length} etapas</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {conTexto.length >= 2 && (
        <button type="button" onClick={() => setGuardando(true)} className="mt-1.5 text-[12.5px] font-semibold text-teal flex items-center gap-1 min-h-[30px]">
          <Plus size={13} /> Guardar estas {conTexto.length} tareas como rutina
        </button>
      )}
      {guardando && (
        <EditorRutina
          inicial={{ nombre: '', secciones: [{ titulo: 'Tareas', tareas: conTexto }] }}
          onClose={() => setGuardando(false)}
          onGuardada={() => { setGuardando(false); cargar(); }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Administración (Servicios → Plantillas → Rutinas de tareas)
// ------------------------------------------------------------------
export default function Rutinas() {
  const [rutinas, setRutinas] = useState<Rutina[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<Rutina> | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(() => {
    listarRutinas().then((r) => { setRutinas(r); setError(null); }).catch(() => { setRutinas([]); setError('Falta correr el SQL de rutinas.'); });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  async function borrar(id: string) {
    try { await eliminarRutina(id); showToast('Rutina eliminada', 'success'); setBorrando(null); cargar(); }
    catch (e: any) { showToast(e?.message || 'No se pudo', 'error'); }
  }

  return (
    <div>
      <p className="text-[12.5px] text-muted mb-3 leading-relaxed">
        Tareas que se repiten en cada mantenimiento preventivo. Se cargan con un clic al agendar un servicio, y cada mantenimiento recurrente puede llevar la suya.
      </p>
      <button type="button" onClick={() => setEditando({})}
        className="w-full min-h-[50px] mb-4 rounded-2xl border border-dashed border-teal/50 text-teal text-[14.5px] font-semibold flex items-center justify-center gap-2 hover:bg-teal/5">
        <Plus size={18} strokeWidth={2.6} /> Nueva rutina
      </button>
      {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}
      {rutinas && rutinas.length === 0 && !error && <EstadoVacio className="py-8" icono={<EmptyIllustration variante="plantilla" />} titulo="Todavía no hay rutinas" detalle="Crea la primera con «Nueva rutina»: después se carga con un clic al agendar un servicio." />}

      <div className="flex flex-col lg:grid lg:grid-cols-2 gap-3 items-start">
        {(rutinas || []).map((r) => {
          const n = tareasDeRutina(r).length;
          const ver = abierta === r.id;
          return (
            <div key={r.id} className="w-full rounded-2xl bg-surface border border-line p-4">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-teal/12 text-teal flex items-center justify-center shrink-0"><ListChecks size={19} /></span>
                <div className="min-w-0 flex-1">
                  <strong className="font-display font-bold text-[15.5px] block leading-tight">{r.nombre}</strong>
                  <p className="text-[12.5px] text-muted mt-0.5">
                    {r.sistema && <span className="text-teal font-semibold">{r.sistema} · </span>}{n} tareas en {r.secciones.length} etapas
                  </p>
                  {r.descripcion && <p className="text-[12.5px] text-ink/70 mt-0.5">{r.descripcion}</p>}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {r.secciones.map((s, i) => (
                  <span key={i} className="text-[11.5px] font-medium px-2 py-0.5 rounded-full bg-surface-2 border border-line">{s.titulo} · {s.tareas.length}</span>
                ))}
              </div>

              {ver && (
                <div className="mt-3 rounded-xl bg-surface-2/50 border border-line p-3 text-[13px] space-y-2.5">
                  {r.secciones.map((s, i) => (
                    <div key={i}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1">{i + 1}. {s.titulo}</p>
                      <ul className="space-y-0.5">{s.tareas.map((t, k) => <li key={k} className="flex gap-2"><span className="text-teal">☐</span>{t}</li>)}</ul>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-line">
                <button type="button" onClick={() => setAbierta(ver ? null : r.id)} className="text-[12.5px] font-semibold text-teal px-2 min-h-[34px]">{ver ? 'Ocultar tareas' : 'Ver tareas'}</button>
                <span className="flex-1" />
                {borrando === r.id ? (
                  <>
                    <span className="text-[12.5px] text-red font-semibold mr-1">¿Eliminar?</span>
                    <button type="button" onClick={() => borrar(r.id)} aria-label="Confirmar" className="w-9 h-9 rounded-lg bg-red text-white flex items-center justify-center"><Check size={15} /></button>
                    <button type="button" onClick={() => setBorrando(null)} aria-label="Cancelar" className="w-9 h-9 rounded-lg border border-line flex items-center justify-center"><X size={15} /></button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setEditando(r)} title="Editar" className="w-9 h-9 rounded-lg border border-line flex items-center justify-center hover:bg-surface-2"><Pencil size={15} /></button>
                    <button type="button" onClick={() => setEditando({ ...r, id: undefined, nombre: `${r.nombre} (copia)` })} title="Duplicar" className="w-9 h-9 rounded-lg border border-line flex items-center justify-center hover:bg-surface-2"><Copy size={15} /></button>
                    <button type="button" onClick={() => setBorrando(r.id)} title="Eliminar" className="w-9 h-9 rounded-lg border border-line text-red flex items-center justify-center hover:bg-red/5"><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editando && <EditorRutina inicial={editando} onClose={() => setEditando(null)} onGuardada={() => { setEditando(null); cargar(); }} />}
    </div>
  );
}
