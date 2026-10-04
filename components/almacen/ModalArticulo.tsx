'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Camera, MapPin, QrCode, Plus, History, User } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import {
  Articulo, Sistema, Ubicacion, CATEGORIAS, UNIDADES, editarArticulo, cambiarFotoArticulo, urlDeDocumento, crearUbicacion,
  HistorialArticulo, historialArticulo,
} from '@/lib/almacen';

// Ficha del artículo para el almacenista: datos, dónde se guarda, foto,
// mínimo y etiqueta QR. Se abre desde el catálogo, las existencias o al
// escanear la etiqueta del artículo.

const inputCls = 'w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';
const labelCls = 'text-[13px] text-ink/75 block mb-1.5';

export function SelectorUbicacion({
  ubicaciones, valor, onCambiar, onCreada,
}: {
  ubicaciones: Ubicacion[];
  valor: string | null;
  onCambiar: (id: string | null) => void;
  onCreada: (u: Ubicacion) => void;
}) {
  const [nueva, setNueva] = useState<string | null>(null);
  if (nueva !== null) {
    return (
      <div className="flex gap-2">
        <input autoFocus className={inputCls} value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Ej. Gabinete 2 · Sección 2 Rack B" />
        <button type="button" onClick={async () => {
          if (!nueva.trim()) return;
          try { const u = await crearUbicacion(nueva); onCreada(u); onCambiar(u.id); setNueva(null); } catch (e: any) { showToast(e?.message || 'No se pudo crear', 'error'); }
        }} className="shrink-0 px-4 rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold">Crear</button>
        <button type="button" onClick={() => setNueva(null)} aria-label="Cancelar" className="shrink-0 w-11 rounded-xl border border-line flex items-center justify-center"><X size={16} /></button>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <select className={inputCls} value={valor || ''} onChange={(e) => onCambiar(e.target.value || null)}>
        <option value="">Sin ubicación</option>
        {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
      </select>
      <button type="button" onClick={() => setNueva('')} aria-label="Nueva ubicación" title="Nueva ubicación" className="shrink-0 w-11 rounded-xl border border-line text-teal flex items-center justify-center"><Plus size={17} /></button>
    </div>
  );
}

export default function ModalArticulo({
  articulo, sistemas, ubicaciones, existencia, onClose, onGuardado, onUbicacionCreada, onRegistrarEntrada,
}: {
  articulo: Articulo;
  sistemas: Sistema[];
  ubicaciones: Ubicacion[];
  existencia?: number;
  onClose: () => void;
  onGuardado: () => void;
  onUbicacionCreada: (u: Ubicacion) => void;
  onRegistrarEntrada?: () => void;
}) {
  const [descripcion, setDescripcion] = useState(articulo.descripcion);
  const [categoria, setCategoria] = useState(articulo.categoria);
  const [marca, setMarca] = useState(articulo.marca || '');
  const [modelo, setModelo] = useState(articulo.modelo || '');
  const [unidad, setUnidad] = useState(articulo.unidad);
  const [sistemaId, setSistemaId] = useState<string | null>(articulo.sistema_id);
  const [ubicacionId, setUbicacionId] = useState<string | null>(articulo.ubicacion_id || null);
  const [minimo, setMinimo] = useState(String(articulo.minimo || ''));
  const [retornable, setRetornable] = useState(articulo.retornable);
  const [costo, setCosto] = useState(articulo.costo_unitario != null ? String(articulo.costo_unitario) : '');
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const camara = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (articulo.foto_path) urlDeDocumento(articulo.foto_path).then(setFotoUrl).catch(() => {});
  }, [articulo.foto_path]);

  async function cambiarFoto(f: File) {
    setSubiendo(true);
    try {
      const path = await cambiarFotoArticulo(articulo.id, f);
      setFotoUrl(await urlDeDocumento(path));
      showToast('Foto guardada', 'success');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo subir la foto', 'error');
    } finally {
      setSubiendo(false);
    }
  }

  async function guardar() {
    if (!descripcion.trim()) return;
    setGuardando(true);
    try {
      await editarArticulo(articulo.id, {
        descripcion: descripcion.trim(), categoria, marca: marca.trim() || null, modelo: modelo.trim() || null,
        unidad, sistema_id: sistemaId, ubicacion_id: ubicacionId, minimo: parseFloat(minimo) || 0, retornable,
        costo_unitario: costo.trim() === '' ? null : Math.max(0, Number(costo) || 0),
      });
      showToast('Artículo actualizado', 'success');
      onGuardado();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar', 'error');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-md p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="font-display font-bold text-[19px] leading-tight">{articulo.descripcion}</h2>
            {existencia !== undefined && <p className="text-[13px] text-muted">Hay {existencia} {articulo.unidad} en inventario general</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted shrink-0"><X size={19} /></button>
        </div>

        {onRegistrarEntrada && articulo.activo && (
          <button type="button" onClick={onRegistrarEntrada}
            className="w-full min-h-[46px] mb-4 rounded-2xl bg-teal text-inkOnAccent font-semibold text-[14.5px] flex items-center justify-center gap-2 active:scale-[0.98]">
            <Plus size={17} strokeWidth={2.6} /> Registrar entrada
          </button>
        )}

        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={() => camara.current?.click()} className="w-24 h-24 rounded-2xl border border-dashed border-line-strong bg-surface-2 overflow-hidden flex items-center justify-center shrink-0">
            {fotoUrl ? <img src={fotoUrl} alt="" className="w-full h-full object-cover" /> : <Camera size={22} className="text-muted" />}
          </button>
          <div className="text-[12.5px] text-muted">
            {subiendo ? 'Subiendo…' : fotoUrl ? 'Toca la foto para cambiarla.' : 'Toca para tomarle foto: ayuda a reconocerlo al pedirlo y al entregarlo.'}
            <a href={`/api/almacen/etiquetas?tipo=articulo&ids=${articulo.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 mt-2 text-teal font-semibold">
              <QrCode size={14} /> Imprimir etiqueta QR
            </a>
          </div>
          <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) cambiarFoto(f); e.target.value = ''; }} />
        </div>

        <Historial articuloId={articulo.id} unidad={articulo.unidad} />

        <label className={`${labelCls} flex items-center gap-1.5`}><MapPin size={13} /> Dónde se guarda</label>
        <div className="mb-4"><SelectorUbicacion ubicaciones={ubicaciones} valor={ubicacionId} onCambiar={setUbicacionId} onCreada={onUbicacionCreada} /></div>

        <label className={labelCls}>Tipo</label>
        <div className="flex gap-1.5 mb-3">
          {CATEGORIAS.map((c) => (
            <button key={c.valor} type="button" onClick={() => setCategoria(c.valor)}
              className={`flex-1 min-h-[40px] rounded-xl border text-[13px] font-medium ${categoria === c.valor ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line'}`}>{c.label}</button>
          ))}
        </div>
        <label className={labelCls}>Descripción</label>
        <input className={`${inputCls} mb-3`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div><label className={labelCls}>Marca</label><input className={inputCls} value={marca} onChange={(e) => setMarca(e.target.value)} /></div>
          <div><label className={labelCls}>Modelo</label><input className={inputCls} value={modelo} onChange={(e) => setModelo(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className={labelCls}>Unidad</label>
            <select className={inputCls} value={unidad} onChange={(e) => setUnidad(e.target.value)}>
              {[...new Set([unidad, ...UNIDADES])].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Mínimo</label><input type="number" inputMode="decimal" className={inputCls} value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="0" /></div>
        </div>
        <label className={labelCls}>Costo por {unidad} (sin IVA, opcional)</label>
        <input type="number" inputMode="decimal" min={0} step="0.01" className={`${inputCls} mb-3`} value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Se llena solo con la última entrada que traiga costo" />
        <label className={labelCls}>Sistema</label>
        <select className={`${inputCls} mb-3`} value={sistemaId || ''} onChange={(e) => setSistemaId(e.target.value || null)}>
          <option value="">Sin sistema</option>
          {sistemas.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <label className="flex items-center gap-2.5 min-h-[40px] mb-2 text-[13.5px]">
          <input type="checkbox" checked={retornable} onChange={(e) => setRetornable(e.target.checked)} className="w-5 h-5 accent-teal" />
          Regresa al almacén (herramienta). Sin marcar: se consume.
        </label>
        <button type="button" onClick={guardar} disabled={guardando}
          className="w-full mt-2 min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </ModalOverlay>
  );
}

function fechaCorta(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' }) : '';
}

// Quién lo tiene ahora y su recorrido (se carga al abrir la ficha).
function Historial({ articuloId, unidad }: { articuloId: string; unidad: string }) {
  const [h, setH] = useState<HistorialArticulo | null>(null);
  const [ver, setVer] = useState(false);
  useEffect(() => { historialArticulo(articuloId).then(setH).catch(() => setH({ enUso: [], eventos: [] })); }, [articuloId]);
  if (!h) return <p className="text-[12.5px] text-muted mb-4">Cargando historial…</p>;
  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface-2/40 p-3">
      {h.enUso.length > 0 ? (
        <div className="mb-2">
          <p className="text-[11px] uppercase tracking-wider text-muted mb-1">Lo tiene ahora</p>
          {h.enUso.map((u) => (
            <p key={u.folio} className="text-[13px] flex items-center gap-1.5">
              <User size={13} className="text-teal shrink-0" />
              <span className="min-w-0"><b>{u.tecnico.split(' ').slice(0, 2).join(' ')}</b> · {u.cantidad} {unidad} · {u.folio} · {u.cliente}{u.limite ? ` · devolver ${fechaCorta(u.limite)}` : ''}</span>
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-muted mb-2">Nadie lo tiene ahora.</p>
      )}
      <button type="button" onClick={() => setVer((v) => !v)} className="text-[12.5px] font-semibold text-teal flex items-center gap-1.5 min-h-[30px]">
        <History size={13} /> {ver ? 'Ocultar historial' : `Ver historial (${h.eventos.length})`}
      </button>
      {ver && (
        <div className="mt-1 max-h-[220px] overflow-y-auto">
          {h.eventos.length === 0 && <p className="text-[12.5px] text-muted">Sin movimientos todavía.</p>}
          {h.eventos.map((e, i) => (
            <div key={i} className="flex gap-2 py-1 border-t border-line text-[12px]">
              <span className="text-muted shrink-0 w-[68px]">{fechaCorta(e.fecha)}</span>
              <span className={`min-w-0 ${e.tipo === 'merma' ? 'text-red' : e.tipo === 'instalado' ? 'text-teal' : ''}`}>{e.texto}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
