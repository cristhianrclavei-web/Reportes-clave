'use client';

import { useMemo, useState } from 'react';
import { Check, AlertTriangle, X } from 'lucide-react';
import { coincideBusqueda } from '@/lib/busqueda';

// Renglón de «Montaje de soportería y equipo» en el reporte. Al escribir la
// descripción sugiere artículos del almacén; elegir uno llena marca y modelo
// y lo liga (articuloId). Si no se liga, el reporte se guarda igual y el
// almacén recibe la alerta «equipo instalado sin registro».

export type EquipoFila = { cant: string; desc: string; modelo: string; marca: string; serie: string; articuloId?: string | null };
export type ArticuloCatalogo = { id: string; descripcion: string; marca: string | null; modelo: string | null; unidad: string };

function coincideCatalogo(eq: EquipoFila, catalogo: ArticuloCatalogo[]): ArticuloCatalogo | null {
  // Misma regla que el trigger: por modelo o por descripción exacta.
  const mod = eq.modelo.trim().toLowerCase();
  const des = eq.desc.trim().toLowerCase();
  return (
    (mod && catalogo.find((a) => (a.modelo || '').trim().toLowerCase() === mod)) ||
    (des && catalogo.find((a) => a.descripcion.trim().toLowerCase() === des)) ||
    null
  );
}

export default function EquipoInstaladoRenglon({
  eq, catalogo, inputCls, onCambiar, onQuitar,
}: {
  eq: EquipoFila;
  catalogo: ArticuloCatalogo[] | null;
  inputCls: string;
  onCambiar: (nuevo: EquipoFila) => void;
  onQuitar?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const vacio = !eq.cant && !eq.desc && !eq.modelo && !eq.marca && !eq.serie;
  const ligado = eq.articuloId ? catalogo?.find((a) => a.id === eq.articuloId) || null : null;
  const automatico = !eq.articuloId && catalogo ? coincideCatalogo(eq, catalogo) : null;

  const sugerencias = useMemo(() => {
    const q = eq.desc.trim();
    if (!catalogo || q.length < 2 || eq.articuloId) return [];
    return catalogo.filter((a) => coincideBusqueda(`${a.descripcion} ${a.marca || ''} ${a.modelo || ''}`, q)).slice(0, 6);
  }, [catalogo, eq.desc, eq.articuloId]);

  // Escribir sobre un renglón ligado lo desliga: ya no es ese artículo.
  const cambiar = (campo: keyof EquipoFila, valor: string) =>
    onCambiar({ ...eq, [campo]: valor, ...(campo === 'desc' || campo === 'modelo' ? { articuloId: null } : {}) });

  return (
    <div className="mb-3">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <input placeholder="Cant." className={inputCls} value={eq.cant} onChange={(e) => cambiar('cant', e.target.value)} />
        <div className="relative col-span-1">
          <input
            placeholder="Descripción"
            className={`${inputCls} w-full`}
            value={eq.desc}
            onChange={(e) => { cambiar('desc', e.target.value); setAbierto(true); }}
            onFocus={() => setAbierto(true)}
            onBlur={() => setTimeout(() => setAbierto(false), 150)}
          />
          {abierto && sugerencias.length > 0 && (
            <div className="absolute z-30 left-0 right-0 sm:right-auto sm:w-[320px] mt-1 rounded-xl bg-surface border border-line-strong shadow-diffuse overflow-hidden">
              <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-muted">Del almacén</p>
              {sugerencias.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onCambiar({ ...eq, desc: a.descripcion, marca: a.marca || eq.marca, modelo: a.modelo || eq.modelo, articuloId: a.id });
                    setAbierto(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-surface-2 border-t border-line"
                >
                  <span className="block text-[13.5px] font-medium truncate">{a.descripcion}</span>
                  <span className="block text-[11.5px] text-muted truncate">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.unidad}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input placeholder="Modelo" className={inputCls} value={eq.modelo} onChange={(e) => cambiar('modelo', e.target.value)} />
        <input placeholder="Marca" className={inputCls} value={eq.marca} onChange={(e) => cambiar('marca', e.target.value)} />
        <input placeholder="No. Serie" className={inputCls} value={eq.serie} onChange={(e) => cambiar('serie', e.target.value)} />
      </div>
      {!vacio && catalogo && (
        <div className="flex items-center justify-between gap-2 mt-1">
          {ligado || automatico ? (
            <span className="text-[11.5px] text-teal font-medium flex items-center gap-1 min-w-0">
              <Check size={12} strokeWidth={2.8} className="shrink-0" />
              <span className="truncate">En almacén: {(ligado || automatico)!.descripcion}</span>
            </span>
          ) : (
            <span className="text-[11.5px] text-amber font-medium flex items-center gap-1">
              <AlertTriangle size={12} strokeWidth={2.6} className="shrink-0" />
              No está en el almacén: elige de la lista o se avisará al almacenista
            </span>
          )}
          {onQuitar && (
            <button type="button" onClick={onQuitar} aria-label="Quitar renglón" className="text-muted shrink-0 p-1"><X size={14} /></button>
          )}
        </div>
      )}
    </div>
  );
}
