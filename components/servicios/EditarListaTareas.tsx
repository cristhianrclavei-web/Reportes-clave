'use client';

import { useState } from 'react';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { Servicio, Tarea, editarListaTareas, LARGO_MAXIMO_TAREA } from '@/lib/serviciosProgramados';

// Editor de la lista de tareas para el supervisor: agregar tareas, y
// renombrar o quitar las que todavía no tienen avance. Las que ya tienen
// avance se muestran con candado (se corrigen con «Corregir»).

type Fila = { id: string; descripcion: string; conAvance: boolean };

function tieneAvance(t: Tarea): boolean {
  return t.completada || t.avance_pct > 0 || !!t.foto_path;
}

export default function EditarListaTareas({
  servicio, tareas, onCancelar, onGuardado,
}: {
  servicio: Servicio;
  tareas: Tarea[];
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  const [filas, setFilas] = useState<Fila[]>(
    tareas.map((t) => ({ id: t.id, descripcion: t.descripcion, conAvance: tieneAvance(t) })),
  );
  const [quitadas, setQuitadas] = useState<string[]>([]);
  const [nuevas, setNuevas] = useState<string[]>([]);
  const [textoNueva, setTextoNueva] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hayVacias = filas.some((f) => !f.descripcion.trim());

  function cambiarNombre(id: string, descripcion: string) {
    setFilas(filas.map((f) => (f.id === id ? { ...f, descripcion } : f)));
  }

  function quitar(id: string) {
    setFilas(filas.filter((f) => f.id !== id));
    setQuitadas([...quitadas, id]);
  }

  function agregar() {
    const texto = textoNueva.trim();
    if (!texto) return;
    setNuevas([...nuevas, texto]);
    setTextoNueva('');
  }

  async function guardar() {
    if (hayVacias) return;
    // Lo que quedó escrito en el campo de nueva tarea también cuenta.
    const todasNuevas = textoNueva.trim() ? [...nuevas, textoNueva.trim()] : nuevas;
    const renombradas = filas
      .filter((f) => !f.conAvance)
      .filter((f) => f.descripcion.trim() !== tareas.find((t) => t.id === f.id)?.descripcion);
    setGuardando(true);
    setError(null);
    try {
      await editarListaTareas(servicio, { nuevas: todasNuevas, renombradas, quitadas });
      onGuardado();
    } catch (e: any) {
      setError('No se pudo guardar la lista: ' + (e?.message || 'revisa tu conexión e intenta de nuevo.'));
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {filas.map((f) => (
        <div key={f.id} className="flex items-center gap-2">
          {f.conAvance ? (
            <p className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface-2 border border-line text-[13.5px] text-muted flex items-center gap-1.5">
              <Lock size={13} strokeWidth={2.4} className="shrink-0" />
              <span className="truncate">{f.descripcion}</span>
            </p>
          ) : (
            <input
              value={f.descripcion}
              maxLength={LARGO_MAXIMO_TAREA}
              onChange={(e) => cambiarNombre(f.id, e.target.value)}
              aria-label="Nombre de la tarea"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13.5px]"
            />
          )}
          {!f.conAvance && (
            <button
              type="button"
              onClick={() => quitar(f.id)}
              aria-label={`Quitar la tarea ${f.descripcion}`}
              className="shrink-0 w-10 h-10 rounded-lg text-red flex items-center justify-center active:scale-90 transition-transform"
            >
              <Trash2 size={16} strokeWidth={2.4} />
            </button>
          )}
        </div>
      ))}
      {nuevas.map((n, i) => (
        <div key={`nueva-${i}`} className="flex items-center gap-2">
          <p className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-teal/10 border border-teal/40 text-[13.5px]">{n}</p>
          <button
            type="button"
            onClick={() => setNuevas(nuevas.filter((_, j) => j !== i))}
            aria-label={`Quitar la tarea ${n}`}
            className="shrink-0 w-10 h-10 rounded-lg text-red flex items-center justify-center active:scale-90 transition-transform"
          >
            <Trash2 size={16} strokeWidth={2.4} />
          </button>
        </div>
      ))}
      {hayVacias && <p className="text-[12px] text-red">Ninguna tarea puede quedar sin nombre.</p>}
      {filas.some((f) => f.conAvance) && (
        <p className="text-[11.5px] text-muted">Las tareas con candado ya tienen avance: no se quitan, y su nombre se cambia con «Corregir».</p>
      )}

      <div className="flex gap-2 mt-1">
        <input
          value={textoNueva}
          maxLength={LARGO_MAXIMO_TAREA}
          onChange={(e) => setTextoNueva(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
          placeholder="Nueva tarea…"
          className="flex-1 min-w-0 px-3 min-h-[40px] rounded-lg bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13.5px]"
        />
        <button
          type="button"
          onClick={agregar}
          className="shrink-0 px-3 min-h-[40px] rounded-lg border border-teal/50 text-teal text-[13px] font-semibold flex items-center gap-1 active:scale-95 transition-transform"
        >
          <Plus size={15} strokeWidth={2.6} /> Agregar
        </button>
      </div>

      {error && <p className="text-[12px] text-red">{error}</p>}
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="flex-1 min-h-[42px] rounded-xl border border-line-strong text-[13px] font-semibold disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || hayVacias}
          className="flex-1 min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar lista'}
        </button>
      </div>
    </div>
  );
}
