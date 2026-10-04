'use client';

import { useMemo, useState } from 'react';
import { MapPin, Plus, QrCode, ChevronLeft, Pencil, Search } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { coincideBusqueda } from '@/lib/busqueda';
import { Articulo, Ubicacion, crearUbicacion, editarUbicacion, asignarUbicacion } from '@/lib/almacen';

// Ubicaciones del almacén (gabinete, sección, rack): qué hay en cada una,
// acomodar artículos y sacar sus etiquetas QR. Al escanear la etiqueta de
// una ubicación se abre aquí, directo en ella.

const inputCls = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px] placeholder:text-faint';

export default function UbicacionesAlmacen({
  ubicaciones, articulos, existencia, inicial, onCambio, onAbrirArticulo,
}: {
  ubicaciones: Ubicacion[];
  articulos: Articulo[];
  existencia: Record<string, number>;
  inicial?: string | null;
  onCambio: () => void;
  onAbrirArticulo: (a: Articulo) => void;
}) {
  const [sel, setSel] = useState<string | null>(inicial || null);
  const [nueva, setNueva] = useState('');
  const [nuevaDesc, setNuevaDesc] = useState('');
  const [acomodar, setAcomodar] = useState(false);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [buscar, setBuscar] = useState('');
  const [renombrando, setRenombrando] = useState<string | null>(null);

  const activos = articulos.filter((a) => a.activo);
  const sinUbicacion = activos.filter((a) => !a.ubicacion_id);
  const cuenta = (id: string) => activos.filter((a) => a.ubicacion_id === id).length;
  const ubic = ubicaciones.find((u) => u.id === sel) || null;

  async function crear() {
    if (!nueva.trim()) return;
    try {
      await crearUbicacion(nueva, nuevaDesc);
      setNueva(''); setNuevaDesc('');
      showToast('Ubicación creada', 'success');
      onCambio();
    } catch (e: any) { showToast(e?.message || 'No se pudo crear', 'error'); }
  }

  async function guardarAcomodo() {
    if (!sel) return;
    try {
      await asignarUbicacion([...elegidos], sel);
      showToast(`${elegidos.size} artículo(s) acomodados en ${ubic?.nombre}`, 'success');
      setElegidos(new Set()); setAcomodar(false); setBuscar('');
      onCambio();
    } catch (e: any) { showToast(e?.message || 'No se pudo', 'error'); }
  }

  const candidatos = useMemo(() => {
    const q = buscar.trim();
    return activos
      .filter((a) => a.ubicacion_id !== sel)
      .filter((a) => !q || coincideBusqueda(`${a.descripcion} ${a.marca || ''} ${a.modelo || ''}`, q))
      .sort((a, b) => Number(!!a.ubicacion_id) - Number(!!b.ubicacion_id) || a.descripcion.localeCompare(b.descripcion));
  }, [activos, sel, buscar]);

  if (ubic) {
    const aqui = activos.filter((a) => a.ubicacion_id === ubic.id);
    return (
      <div>
        <button type="button" onClick={() => { setSel(null); setAcomodar(false); }} className="text-[13.5px] font-semibold text-teal flex items-center gap-1 mb-3"><ChevronLeft size={16} /> Todas las ubicaciones</button>
        <div className="flex items-start justify-between gap-2 mb-3">
          {renombrando !== null ? (
            <div className="flex gap-2 flex-1">
              <input className={inputCls} value={renombrando} onChange={(e) => setRenombrando(e.target.value)} />
              <button type="button" onClick={async () => { try { await editarUbicacion(ubic.id, { nombre: renombrando.trim() }); setRenombrando(null); onCambio(); } catch (e: any) { showToast(e?.message, 'error'); } }} className="px-4 rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold">Guardar</button>
            </div>
          ) : (
            <div className="min-w-0">
              <h2 className="font-display font-bold text-[20px] flex items-center gap-2"><MapPin size={18} className="text-teal" /> {ubic.nombre}
                <button type="button" onClick={() => setRenombrando(ubic.nombre)} aria-label="Renombrar" className="text-muted"><Pencil size={14} /></button>
              </h2>
              {ubic.descripcion && <p className="text-[13px] text-muted">{ubic.descripcion}</p>}
            </div>
          )}
          <a href={`/api/almacen/etiquetas?tipo=ubicacion&ids=${ubic.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0 px-3 min-h-[40px] rounded-xl bg-surface-2 border border-line text-[13px] font-semibold flex items-center gap-1.5"><QrCode size={15} /> Etiqueta</a>
        </div>

        <div className="rounded-2xl bg-surface border border-line divide-y divide-line mb-3">
          {aqui.length === 0 && <p className="text-[13px] text-muted p-4">No hay artículos aquí todavía.</p>}
          {aqui.map((a) => (
            <button key={a.id} type="button" onClick={() => onAbrirArticulo(a)} className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-surface-2">
              <span className="min-w-0">
                <span className="block text-[14px] font-medium truncate">{a.descripcion}</span>
                <span className="block text-[12px] text-muted truncate">{[a.marca, a.modelo].filter(Boolean).join(' ')}</span>
              </span>
              <span className={`text-[13px] font-semibold shrink-0 ${(existencia[a.id] || 0) > 0 ? 'text-teal' : 'text-red'}`}>{existencia[a.id] || 0} {a.unidad}</span>
            </button>
          ))}
        </div>
        {aqui.length > 0 && (
          <a href={`/api/almacen/etiquetas?tipo=articulo&ids=${aqui.map((a) => a.id).join(',')}`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-teal flex items-center gap-1.5 mb-4"><QrCode size={14} /> Imprimir etiquetas de estos {aqui.length} artículos</a>
        )}

        {!acomodar ? (
          <button type="button" onClick={() => setAcomodar(true)} className="w-full min-h-[46px] rounded-2xl border border-dashed border-teal/50 text-teal text-[14px] font-semibold flex items-center justify-center gap-2"><Plus size={17} /> Acomodar artículos aquí</button>
        ) : (
          <div className="rounded-2xl border border-teal/40 bg-teal/5 p-3">
            <p className="text-[13px] font-semibold mb-2">Elige lo que se guarda en {ubic.nombre} (primero los que no tienen ubicación)</p>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input className={`${inputCls} pl-9`} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar artículo" />
            </div>
            <div className="max-h-[300px] overflow-y-auto rounded-xl bg-surface border border-line divide-y divide-line">
              {candidatos.map((a) => (
                <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer">
                  <input type="checkbox" className="w-5 h-5 accent-teal" checked={elegidos.has(a.id)}
                    onChange={() => setElegidos((p) => { const n = new Set(p); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] truncate">{a.descripcion}</span>
                    <span className="block text-[11.5px] text-muted">{a.ubicacion_id ? `Ahora en: ${ubicaciones.find((u) => u.id === a.ubicacion_id)?.nombre || '—'}` : 'Sin ubicación'}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button type="button" onClick={() => { setAcomodar(false); setElegidos(new Set()); }} className="min-h-[42px] rounded-xl border border-line text-[13px] font-semibold">Cancelar</button>
              <button type="button" disabled={elegidos.size === 0} onClick={guardarAcomodo} className="min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold disabled:opacity-50">Acomodar {elegidos.size || ''}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="text-[13px] text-muted mb-3 leading-relaxed">
        Dónde se guarda cada cosa: gabinetes, secciones, racks. El almacenista ve la ubicación al entregar y puede pegar una etiqueta QR en cada lugar y en la herramienta.
      </p>
      {sinUbicacion.length > 0 && (
        <div className="rounded-2xl px-4 py-2.5 mb-3 bg-amber/10 border border-amber/30 text-[13px] text-amber font-semibold">
          {sinUbicacion.length} artículo(s) sin ubicación. Entra a una ubicación y usa «Acomodar artículos aquí».
        </div>
      )}
      <div className="rounded-2xl bg-surface border border-line p-3 mb-4">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2">Nueva ubicación</p>
        <input className={`${inputCls} mb-2`} value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Ej. Gabinete 2 · Sección 2 Rack B" />
        <input className={`${inputCls} mb-2`} value={nuevaDesc} onChange={(e) => setNuevaDesc(e.target.value)} placeholder="Qué se guarda ahí (opcional): herramienta eléctrica, equipo CCTV…" />
        <button type="button" onClick={crear} disabled={!nueva.trim()} className="w-full min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"><Plus size={16} /> Agregar ubicación</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-2.5">
        {ubicaciones.map((u) => (
          <button key={u.id} type="button" onClick={() => setSel(u.id)} className="rounded-2xl bg-surface border border-line p-3.5 text-left hover:border-teal/50 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-teal/12 text-teal flex items-center justify-center shrink-0"><MapPin size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold truncate">{u.nombre}</span>
              <span className="block text-[12.5px] text-muted truncate">{cuenta(u.id)} artículo(s){u.descripcion ? ` · ${u.descripcion}` : ''}</span>
            </span>
          </button>
        ))}
      </div>
      {ubicaciones.length > 0 && (
        <a href={`/api/almacen/etiquetas?tipo=ubicacion&ids=${ubicaciones.map((u) => u.id).join(',')}`} target="_blank" rel="noopener noreferrer" className="mt-3 text-[13px] font-semibold text-teal flex items-center gap-1.5"><QrCode size={14} /> Imprimir etiquetas de todas las ubicaciones</a>
      )}
    </div>
  );
}
