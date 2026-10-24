'use client';

import { useMemo, useState } from 'react';
import { X, Plus, Check, Link2, Search } from 'lucide-react';
import { coincideBusqueda } from '@/lib/busqueda';
import {
  FilaTuberia, FilaCable, FilaSoporteria, TIPOS_TUBERIA, MEDIDAS_TUBERIA, UNIDADES_TUBERIA,
  TIPOS_CABLE, UNIDADES_CABLE, SUGERENCIAS_SOPORTERIA, UNIDADES_SOPORTERIA, soloNumero, inferirTuberia,
} from '@/lib/materialesReporte';
import type { ArticuloCatalogo } from '@/components/EquipoInstaladoRenglon';
import { ConceptosAprendidos, formaCanonica, unirSugerencias } from '@/lib/conceptosMateriales';

// Secciones de materiales del reporte (tubería, cable, soportería y
// fijación). Cada renglón: datos estructurados, cantidad solo numérica con
// su unidad, y opcionalmente ligado a un artículo del almacén.

const labelCls = 'block text-[10.5px] font-semibold uppercase tracking-wider text-muted mb-1';

export const tuberiaVacia = (): FilaTuberia => ({ tipo: '', medida: '', cantidad: '', unidad: 'm', especifica: '' });
export const cableVacio = (): FilaCable => ({ tipo: '', calibre: '', cantidad: '', unidad: 'm' });
export const soporteriaVacia = (): FilaSoporteria => ({ desc: '', medida: '', cantidad: '', unidad: 'pza' });

// ------------------------------------------------------------------
// Piezas compartidas
// ------------------------------------------------------------------

function Cantidad({ valor, onCambiar, inputCls }: { valor: string; onCambiar: (v: string) => void; inputCls: string }) {
  return (
    <input type="text" inputMode="decimal" pattern="[0-9]*[.]?[0-9]*" placeholder="0" value={valor}
      onChange={(e) => onCambiar(soloNumero(e.target.value))} className={`${inputCls} text-center font-semibold tabular-nums`} />
  );
}

function Unidad({ valor, opciones, onCambiar, inputCls }: { valor: string; opciones: { valor: string; label: string }[]; onCambiar: (v: string) => void; inputCls: string }) {
  return (
    <select value={valor} onChange={(e) => onCambiar(e.target.value)} className={inputCls}>
      {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
    </select>
  );
}

// Liga el renglón con un artículo del almacén (para trazabilidad e inventario).
function LigarAlmacen({
  catalogo, filtro, articuloId, articulo, onLigar, onQuitar,
}: {
  catalogo: ArticuloCatalogo[] | null;
  filtro: RegExp | null;
  articuloId?: string | null;
  articulo?: string | null;
  onLigar: (a: ArticuloCatalogo) => void;
  onQuitar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const opciones = useMemo(() => {
    if (!catalogo) return [];
    const base = filtro ? catalogo.filter((a) => filtro.test(a.descripcion)) : catalogo;
    return (q.trim() ? (catalogo.filter((a) => coincideBusqueda(`${a.descripcion} ${a.marca || ''} ${a.modelo || ''}`, q))) : base).slice(0, 8);
  }, [catalogo, filtro, q]);
  if (!catalogo) return null;

  if (articuloId) {
    return (
      <span className="mt-2 inline-flex items-center gap-1.5 max-w-full text-[11.5px] font-semibold text-teal bg-teal/10 border border-teal/30 rounded-full pl-2.5 pr-1 py-0.5">
        <Check size={12} strokeWidth={2.8} className="shrink-0" />
        <span className="truncate">Almacén: {articulo || 'artículo'}</span>
        <button type="button" onClick={onQuitar} aria-label="Desligar" className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-teal/15 shrink-0"><X size={11} /></button>
      </span>
    );
  }
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="mt-2 text-[11.5px] font-semibold text-teal flex items-center gap-1 min-h-[26px]">
        <Link2 size={12} /> Ligar con el almacén
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-xl border border-line bg-surface p-2">
      <div className="relative mb-1.5">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el almacén"
          className="w-full h-9 pl-8 pr-8 rounded-lg bg-surface-2 border border-line text-[13px] focus:border-teal focus:outline-none" />
        <button type="button" onClick={() => { setAbierto(false); setQ(''); }} aria-label="Cerrar" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-muted"><X size={13} /></button>
      </div>
      <div className="max-h-[180px] overflow-y-auto">
        {opciones.length === 0 && <p className="text-[12px] text-muted px-1 py-1.5">Sin coincidencias en el almacén.</p>}
        {opciones.map((a) => (
          <button key={a.id} type="button" onClick={() => { onLigar(a); setAbierto(false); setQ(''); }}
            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-2 text-[12.5px]">
            <span className="font-medium">{a.descripcion}</span>
            <span className="text-muted">{[a.marca, a.modelo].filter(Boolean).length ? ` · ${[a.marca, a.modelo].filter(Boolean).join(' ')}` : ''} · {a.unidad}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Tarjeta({ n, titulo, onQuitar, children }: { n: number; titulo: string; onQuitar?: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3 mb-2.5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">{titulo} {n}</p>
        {onQuitar && <button type="button" onClick={onQuitar} aria-label="Quitar" className="w-7 h-7 rounded-lg flex items-center justify-center text-red hover:bg-red/10"><X size={15} /></button>}
      </div>
      {children}
    </div>
  );
}

function Lista({ id, opciones }: { id: string; opciones: string[] }) {
  return <datalist id={id}>{opciones.map((t) => <option key={t} value={t} />)}</datalist>;
}

function Agregar({ texto, onClick }: { texto: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full border border-dashed border-teal/50 text-teal py-2 rounded-xl text-[13px] font-medium flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
      <Plus size={14} /> {texto}
    </button>
  );
}

// Si la unidad del artículo del almacén coincide con una opción, se usa.
function unidadDe(a: ArticuloCatalogo, opciones: { valor: string }[], actual: string): string {
  const u = (a.unidad || '').toLowerCase();
  const m = u.startsWith('m') && !u.startsWith('ma') ? 'm' : u.startsWith('pz') || u.startsWith('pie') ? 'pza' : u;
  return opciones.some((o) => o.valor === m) ? m : actual;
}

// ------------------------------------------------------------------
// Tubería
// ------------------------------------------------------------------
type Sugeridas = { aprendidos?: ConceptosAprendidos };

export function SeccionTuberia({ filas, onCambiar, catalogo, inputCls, aprendidos = {} }: { filas: FilaTuberia[]; onCambiar: (f: FilaTuberia[]) => void; catalogo: ArticuloCatalogo[] | null; inputCls: string } & Sugeridas) {
  const set = (i: number, p: Partial<FilaTuberia>) => onCambiar(filas.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const medidas = useMemo(() => unirSugerencias(MEDIDAS_TUBERIA, aprendidos.tuberia_medida), [aprendidos]);
  const especificas = useMemo(() => unirSugerencias([], aprendidos.tuberia_especifica), [aprendidos]);
  return (
    <div>
      <Lista id="medidas-tuberia" opciones={medidas} />
      <Lista id="especificas-tuberia" opciones={especificas} />
      {filas.map((f, i) => (
        <Tarjeta key={i} n={i + 1} titulo="Tubería" onQuitar={filas.length > 1 ? () => onCambiar(filas.filter((_, j) => j !== i)) : undefined}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Tipo</label>
              <select value={f.tipo} onChange={(e) => set(i, { tipo: e.target.value })} className={inputCls}>
                <option value="">Elige…</option>
                {TIPOS_TUBERIA.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Medida</label>
              <input list="medidas-tuberia" value={f.medida} onChange={(e) => set(i, { medida: e.target.value })} onBlur={(e) => set(i, { medida: formaCanonica(e.target.value, medidas) })} placeholder='3/4"' className={inputCls} />
            </div>
          </div>
          {f.tipo === 'Otra' && (
            <div className="mt-2">
              <label className={labelCls}>Especifica</label>
              <input list="especificas-tuberia" value={f.especifica || ''} onChange={(e) => set(i, { especifica: e.target.value })} onBlur={(e) => set(i, { especifica: formaCanonica(e.target.value, especificas) })} className={inputCls} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div><label className={labelCls}>Cantidad</label><Cantidad valor={f.cantidad} onCambiar={(v) => set(i, { cantidad: v })} inputCls={inputCls} /></div>
            <div><label className={labelCls}>Unidad</label><Unidad valor={f.unidad} opciones={UNIDADES_TUBERIA} onCambiar={(v) => set(i, { unidad: v })} inputCls={inputCls} /></div>
          </div>
          <LigarAlmacen catalogo={catalogo} filtro={/tubo|tuber|conduit|licuatite|ducto/i} articuloId={f.articuloId} articulo={f.articulo}
            onLigar={(a) => { const x = inferirTuberia(a.descripcion); set(i, { articuloId: a.id, articulo: a.descripcion, tipo: f.tipo || x.tipo, medida: f.medida || x.medida, unidad: unidadDe(a, UNIDADES_TUBERIA, f.unidad) }); }}
            onQuitar={() => set(i, { articuloId: null, articulo: null })} />
        </Tarjeta>
      ))}
      <Agregar texto="Agregar tubería" onClick={() => onCambiar([...filas, tuberiaVacia()])} />
    </div>
  );
}

// ------------------------------------------------------------------
// Cable
// ------------------------------------------------------------------
export function SeccionCable({ filas, onCambiar, catalogo, inputCls, aprendidos = {} }: { filas: FilaCable[]; onCambiar: (f: FilaCable[]) => void; catalogo: ArticuloCatalogo[] | null; inputCls: string } & Sugeridas) {
  const set = (i: number, p: Partial<FilaCable>) => onCambiar(filas.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const tipos = useMemo(() => unirSugerencias(TIPOS_CABLE, aprendidos.cable_tipo), [aprendidos]);
  const calibres = useMemo(() => unirSugerencias([], aprendidos.cable_calibre), [aprendidos]);
  return (
    <div>
      <Lista id="tipos-cable" opciones={tipos} />
      <Lista id="calibres-cable" opciones={calibres} />
      {filas.map((f, i) => (
        <Tarjeta key={i} n={i + 1} titulo="Cable" onQuitar={filas.length > 1 ? () => onCambiar(filas.filter((_, j) => j !== i)) : undefined}>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className={labelCls}>Tipo</label>
              <input list="tipos-cable" value={f.tipo} onChange={(e) => set(i, { tipo: e.target.value })} onBlur={(e) => set(i, { tipo: formaCanonica(e.target.value, tipos) })} placeholder="UTP Cat 6" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Calibre</label>
              <input list="calibres-cable" value={f.calibre} onChange={(e) => set(i, { calibre: e.target.value })} onBlur={(e) => set(i, { calibre: formaCanonica(e.target.value, calibres) })} placeholder="23 AWG" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div><label className={labelCls}>Cantidad</label><Cantidad valor={f.cantidad} onCambiar={(v) => set(i, { cantidad: v })} inputCls={inputCls} /></div>
            <div><label className={labelCls}>Unidad</label><Unidad valor={f.unidad} opciones={UNIDADES_CABLE} onCambiar={(v) => set(i, { unidad: v })} inputCls={inputCls} /></div>
          </div>
          <LigarAlmacen catalogo={catalogo} filtro={/cable|utp|coax|fibra|siam|fplr|thw|thhn|uso rudo/i} articuloId={f.articuloId} articulo={f.articulo}
            onLigar={(a) => set(i, { articuloId: a.id, articulo: a.descripcion, tipo: f.tipo || a.descripcion, unidad: unidadDe(a, UNIDADES_CABLE, f.unidad) })}
            onQuitar={() => set(i, { articuloId: null, articulo: null })} />
        </Tarjeta>
      ))}
      <Agregar texto="Agregar cable" onClick={() => onCambiar([...filas, cableVacio()])} />
    </div>
  );
}

// ------------------------------------------------------------------
// Soportería y fijación
// ------------------------------------------------------------------
export function SeccionSoporteria({ filas, onCambiar, catalogo, inputCls, aprendidos = {} }: { filas: FilaSoporteria[]; onCambiar: (f: FilaSoporteria[]) => void; catalogo: ArticuloCatalogo[] | null; inputCls: string } & Sugeridas) {
  const set = (i: number, p: Partial<FilaSoporteria>) => onCambiar(filas.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const conceptos = useMemo(() => unirSugerencias(SUGERENCIAS_SOPORTERIA, aprendidos.soporteria_desc), [aprendidos]);
  const medidas = useMemo(() => unirSugerencias([], aprendidos.soporteria_medida), [aprendidos]);
  return (
    <div>
      <Lista id="sugerencias-soporteria" opciones={conceptos} />
      <Lista id="medidas-soporteria" opciones={medidas} />
      {filas.map((f, i) => (
        <Tarjeta key={i} n={i + 1} titulo="Material" onQuitar={filas.length > 1 ? () => onCambiar(filas.filter((_, j) => j !== i)) : undefined}>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className={labelCls}>Qué se usó</label>
              <input list="sugerencias-soporteria" value={f.desc} onChange={(e) => set(i, { desc: e.target.value })} onBlur={(e) => set(i, { desc: formaCanonica(e.target.value, conceptos) })} placeholder="Taquete, unicanal, abrazadera…" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Medida</label>
              <input list="medidas-soporteria" value={f.medida} onChange={(e) => set(i, { medida: e.target.value })} onBlur={(e) => set(i, { medida: formaCanonica(e.target.value, medidas) })} placeholder='1/4"' className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div><label className={labelCls}>Cantidad</label><Cantidad valor={f.cantidad} onCambiar={(v) => set(i, { cantidad: v })} inputCls={inputCls} /></div>
            <div><label className={labelCls}>Unidad</label><Unidad valor={f.unidad} opciones={UNIDADES_SOPORTERIA} onCambiar={(v) => set(i, { unidad: v })} inputCls={inputCls} /></div>
          </div>
          <LigarAlmacen catalogo={catalogo} filtro={null} articuloId={f.articuloId} articulo={f.articulo}
            onLigar={(a) => set(i, { articuloId: a.id, articulo: a.descripcion, desc: f.desc || a.descripcion, unidad: unidadDe(a, UNIDADES_SOPORTERIA, f.unidad) })}
            onQuitar={() => set(i, { articuloId: null, articulo: null })} />
        </Tarjeta>
      ))}
      <Agregar texto="Agregar material de fijación" onClick={() => onCambiar([...filas, soporteriaVacia()])} />
    </div>
  );
}
