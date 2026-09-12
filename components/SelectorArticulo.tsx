'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Articulo, CategoriaInsumo, CATEGORIAS, UNIDADES,
  listarArticulos, crearArticulo, mapaDeExistencias,
} from '@/lib/almacen';
import ModalOverlay from '@/components/ModalOverlay';
import { Plus, AlertTriangle } from 'lucide-react';

// Selector de artículo del catálogo, con la existencia a la vista.
//
// El catálogo es lo que hace que el inventario cuadre: mientras cada quien
// escriba "Taladro", "taladro 1/2" y "Taladro Dewalt", no hay forma de saber
// cuántos taladros hay. Por eso aquí se elige, no se escribe — y si de plano
// falta, se da de alta en el momento sin salir de la pantalla.
export default function SelectorArticulo({
  valor,
  onChange,
  cantidadPedida,
  grupoId,
  className = '',
}: {
  valor: string | null;
  onChange: (articulo: Articulo | null) => void;
  cantidadPedida?: number;
  grupoId?: string | null;
  className?: string;
}) {
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [existencias, setExistencias] = useState<Record<string, number>>({});
  const [showNuevo, setShowNuevo] = useState(false);
  const [busy, setBusy] = useState(false);

  const [nuevaCategoria, setNuevaCategoria] = useState<CategoriaInsumo>('material');
  const [nuevaDescripcion, setNuevaDescripcion] = useState('');
  const [nuevaUnidad, setNuevaUnidad] = useState('pza');
  const [nuevoRetornable, setNuevoRetornable] = useState(false);

  async function cargar() {
    try {
      const [ar, ex] = await Promise.all([listarArticulos(), mapaDeExistencias(grupoId)]);
      setArticulos(ar);
      setExistencias(ex);
    } catch {
      // Sin catálogo el selector queda vacío; el aviso lo da la pantalla.
    }
  }

  useEffect(() => { cargar(); }, [grupoId]);

  const elegido = useMemo(() => articulos.find((a) => a.id === valor) || null, [articulos, valor]);
  const disponible = valor ? (existencias[valor] ?? 0) : 0;
  const noAlcanza = !!elegido && typeof cantidadPedida === 'number' && cantidadPedida > disponible;

  async function handleCrear() {
    if (!nuevaDescripcion.trim()) {
      alert('Escribe qué es.');
      return;
    }
    setBusy(true);
    try {
      const nuevo = await crearArticulo({
        categoria: nuevaCategoria,
        descripcion: nuevaDescripcion,
        unidad: nuevaUnidad,
        retornable: nuevoRetornable,
      });
      await cargar();
      onChange(nuevo);
      setShowNuevo(false);
      setNuevaDescripcion('');
      setNuevaUnidad('pza');
    } catch (e: any) {
      alert('No se pudo agregar al catálogo: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'w-full px-3 min-h-[48px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px]';

  return (
    <div className={className}>
      <select
        value={valor || ''}
        onChange={(e) => {
          if (e.target.value === '__nuevo') { setShowNuevo(true); return; }
          onChange(articulos.find((a) => a.id === e.target.value) || null);
        }}
        className="w-full px-3 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]"
      >
        <option value="">Elegir del catálogo…</option>
        {CATEGORIAS.map((c) => {
          const delTipo = articulos.filter((a) => a.categoria === c.valor);
          if (delTipo.length === 0) return null;
          return (
            <optgroup key={c.valor} label={c.label}>
              {delTipo.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.descripcion} ({a.unidad}) — hay {existencias[a.id] ?? 0}
                </option>
              ))}
            </optgroup>
          );
        })}
        <option value="__nuevo">+ No está en el catálogo…</option>
      </select>

      {elegido && (
        <p className={`text-[12.5px] mt-1.5 leading-relaxed ${noAlcanza ? 'text-amber' : 'text-muted'}`}>
          {noAlcanza ? (
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={13} strokeWidth={2.5} className="shrink-0" />
              Solo hay {disponible} {elegido.unidad} y estás pidiendo {cantidadPedida}.
            </span>
          ) : (
            <>Disponible: {disponible} {elegido.unidad}{elegido.retornable ? ' · Regresa al almacén' : ' · Se consume'}</>
          )}
        </p>
      )}

      {showNuevo && (
        <ModalOverlay onClose={() => setShowNuevo(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-1">Nuevo artículo</p>
            <p className="text-[12.5px] text-muted mb-4 leading-relaxed">
              Se agrega al catálogo del almacén y queda disponible para todos.
            </p>

            <label className="text-[13px] text-ink/75 block mb-1.5">Tipo</label>
            <div className="flex gap-2 mb-4">
              {CATEGORIAS.map((c) => (
                <button
                  key={c.valor}
                  onClick={() => { setNuevaCategoria(c.valor); setNuevoRetornable(c.valor === 'herramienta'); }}
                  className={`flex-1 min-h-[46px] rounded-xl text-[13.5px] font-semibold border ${
                    nuevaCategoria === c.valor ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface border-line-strong text-ink/80'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <label className="text-[13px] text-ink/75 block mb-1.5">¿Qué es?</label>
            <input
              type="text"
              value={nuevaDescripcion}
              onChange={(e) => setNuevaDescripcion(e.target.value)}
              placeholder="Cable calibre 12, taladro, panel solar…"
              className={`${inputCls} mb-4`}
            />

            <label className="text-[13px] text-ink/75 block mb-1.5">Unidad</label>
            <select value={nuevaUnidad} onChange={(e) => setNuevaUnidad(e.target.value)} className={`${inputCls} mb-4`}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>

            <label className="flex items-start gap-2.5 min-h-[44px] cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={nuevoRetornable}
                onChange={(e) => setNuevoRetornable(e.target.checked)}
                className="w-5 h-5 accent-teal mt-0.5"
              />
              <span className="text-[14px] text-ink/85 leading-snug">
                Regresa al almacén
                <span className="block text-[12.5px] text-muted">La herramienta vuelve; el material se queda instalado.</span>
              </span>
            </label>

            <div className="flex gap-2">
              <button onClick={() => setShowNuevo(false)} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium">
                Cancelar
              </button>
              <button onClick={handleCrear} disabled={busy} className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-60">
                {busy ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
