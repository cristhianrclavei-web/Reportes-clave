'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Articulo, Sistema, CategoriaInsumo, CATEGORIAS, UNIDADES,
  crearArticulo, crearSistema, registrarEntrada,
} from '@/lib/almacen';
import { showToast } from '@/components/Toast';
import {
  ChevronLeft, Search, Plus, X, Camera, Images, FileText,
  Wrench, Package, HardHat, Check, Pencil, ArrowRight,
} from 'lucide-react';

// Registrar una entrada de almacén, rehecho como asistente de un solo paso a
// la vez (como un checkout), en vez de un formulario largo de una sola
// pantalla. Dos problemas concretos que resuelve:
//
// 1. Antes había que elegir un "sistema" (CCTV, control de acceso…) ANTES de
//    poder ver el catálogo. Un artículo sin sistema asignado (cinta
//    aislante, un taladro genérico) quedaba invisible: no había forma de
//    registrarle una entrada. Ahora el sistema es un filtro opcional sobre
//    una búsqueda que ve todo el catálogo desde el inicio.
// 2. Cinco secciones apiladas en una sola pantalla larga se sentían como
//    llenar un formulario, no como una tarea guiada. Separarlas en pasos con
//    "Atrás" y un resumen final antes de guardar reduce cuánto hay que
//    sostener en la cabeza a la vez.

const ICONO: Record<CategoriaInsumo, any> = { herramienta: Wrench, material: Package, equipo: HardHat };

type Props = {
  sistemas: Sistema[];
  articulos: Articulo[];
  proyectos: { grupoId: string; proyecto: string }[];
  onRegistrada: () => void;
  onCancelar: () => void;
  onCatalogoActualizado: () => Promise<void>;
};

const TOTAL_PASOS = 5;
const TITULOS: Record<number, string> = {
  1: '¿Qué vas a registrar?',
  2: '¿A qué inventario entra?',
  3: '¿Cuánto entró?',
  4: 'Respaldo de la compra',
  5: 'Revisar y confirmar',
};

export default function EntradaAlmacenWizard({
  sistemas, articulos, proyectos, onRegistrada, onCancelar, onCatalogoActualizado,
}: Props) {
  const [paso, setPaso] = useState(1);
  const [busy, setBusy] = useState(false);

  // Paso 1 — artículo
  const [busqueda, setBusqueda] = useState('');
  const [filtroSistema, setFiltroSistema] = useState<'todos' | 'sin-sistema' | string>('todos');
  const [articuloId, setArticuloId] = useState('');
  const [showNuevoArticulo, setShowNuevoArticulo] = useState(false);
  const [showNuevoSistema, setShowNuevoSistema] = useState(false);
  const [nuevoSistemaNombre, setNuevoSistemaNombre] = useState('');

  // Paso 2 — inventario
  const [inventario, setInventario] = useState<'general' | 'proyecto'>('general');
  const [grupoId, setGrupoId] = useState('');

  // Paso 3 — cantidad
  const [cantidad, setCantidad] = useState('');
  const [numerosSerie, setNumerosSerie] = useState('');

  // Paso 4 — respaldo
  const [proveedor, setProveedor] = useState('');
  const [notaEntrada, setNotaEntrada] = useState('');
  const [factura, setFactura] = useState<File | null>(null);
  const [ordenCompra, setOrdenCompra] = useState<File | null>(null);

  const articuloElegido = articulos.find((a) => a.id === articuloId) || null;
  const soloGeneral = articuloElegido?.categoria === 'herramienta';

  // Respaldo del caso en que se elige un artículo recién creado y la lista
  // de artículos del padre todavía no se ha actualizado en ese instante: en
  // vez de forzarlo solo al elegir, se corrige en cualquier render donde la
  // categoría ya se sepa que es herramienta.
  useEffect(() => {
    if (soloGeneral) setInventario('general');
  }, [soloGeneral]);

  function elegirArticulo(id: string) {
    setArticuloId(id);
    setPaso(2);
  }

  function irAtras() {
    if (paso === 1) { onCancelar(); return; }
    setPaso((p) => p - 1);
  }

  function puedeContinuar(): boolean {
    if (paso === 1) return !!articuloId;
    if (paso === 2) return inventario === 'general' || !!grupoId;
    if (paso === 3) return parseFloat(cantidad) > 0;
    return true;
  }

  async function handleNuevoSistema() {
    if (!nuevoSistemaNombre.trim()) return;
    try {
      const nuevo = await crearSistema(nuevoSistemaNombre.trim());
      await onCatalogoActualizado();
      setFiltroSistema(nuevo.id);
      setShowNuevoSistema(false);
      setNuevoSistemaNombre('');
      showToast('Sistema agregado', 'success');
    } catch (e: any) {
      alert('No se pudo agregar: ' + (e?.message || 'error'));
    }
  }

  async function handleRegistrar() {
    const cant = parseFloat(cantidad);
    setBusy(true);
    try {
      await registrarEntrada({
        articuloId, cantidad: cant, inventario,
        grupoId: inventario === 'proyecto' ? grupoId : null,
        proveedor, nota: notaEntrada, factura, ordenCompra, numerosSerie,
      });
      showToast('Entrada registrada', 'success');
      onRegistrada();
    } catch (e: any) {
      alert('No se pudo registrar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'w-full px-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';
  const labelCls = 'text-[13px] text-ink/75 block mb-1.5';

  return (
    <div className="pb-28">
      {/* Encabezado del asistente: atrás, título, progreso */}
      <div className="flex items-center gap-2.5 mb-1">
        <button
          onClick={irAtras}
          aria-label="Atrás"
          className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0"
        >
          <ChevronLeft size={22} strokeWidth={2.4} />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] text-muted uppercase tracking-wider">Paso {paso} de {TOTAL_PASOS}</p>
          <p className="font-display font-semibold text-[17px] truncate">{TITULOS[paso]}</p>
        </div>
      </div>
      <div className="h-1 rounded-full bg-surface-2 mb-5 overflow-hidden">
        <div
          className="h-full bg-teal transition-all duration-300"
          style={{ width: `${(paso / TOTAL_PASOS) * 100}%` }}
        />
      </div>

      {/* Resumen de lo ya elegido: contexto para no perder el hilo entre pasos */}
      {paso > 1 && articuloElegido && (
        <div className="flex items-center gap-2 mb-5 px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line">
          {(() => { const Icono = ICONO[articuloElegido.categoria]; return <Icono size={15} strokeWidth={2.3} className="text-teal shrink-0" />; })()}
          <span className="text-[13.5px] font-medium truncate flex-1">{articuloElegido.descripcion}</span>
          <button onClick={() => setPaso(1)} className="text-[12.5px] text-teal font-semibold shrink-0 min-h-[32px] px-1">
            Cambiar
          </button>
        </div>
      )}

      {/* --- Paso 1: Artículo --- */}
      {paso === 1 && (
        <PasoArticulo
          articulos={articulos}
          sistemas={sistemas}
          busqueda={busqueda}
          setBusqueda={setBusqueda}
          filtroSistema={filtroSistema}
          setFiltroSistema={setFiltroSistema}
          onElegir={elegirArticulo}
          onAgregarNuevo={() => setShowNuevoArticulo(true)}
          onAgregarSistema={() => setShowNuevoSistema(true)}
        />
      )}

      {/* --- Paso 2: Inventario --- */}
      {paso === 2 && (
        <div>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setInventario('general')}
              className={`flex-1 min-h-[52px] rounded-xl text-[14.5px] font-semibold border ${inventario === 'general' ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line-strong text-ink/80'}`}
            >
              General
            </button>
            <button
              onClick={() => setInventario('proyecto')}
              disabled={soloGeneral}
              className={`flex-1 min-h-[52px] rounded-xl text-[14.5px] font-semibold border disabled:opacity-40 ${inventario === 'proyecto' ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line-strong text-ink/80'}`}
            >
              De un proyecto
            </button>
          </div>
          {soloGeneral ? (
            <p className="text-[12.5px] text-muted leading-relaxed">
              La herramienta es de uso general: no se reserva por proyecto.
            </p>
          ) : inventario === 'proyecto' ? (
            <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} autoFocus className={`${inputCls} mt-3`}>
              <option value="">Elegir proyecto…</option>
              {proyectos.map((pr) => <option key={pr.grupoId} value={pr.grupoId}>{pr.proyecto}</option>)}
            </select>
          ) : (
            <p className="text-[12.5px] text-muted leading-relaxed">
              Se suma al inventario compartido, disponible para cualquier proyecto.
            </p>
          )}
        </div>
      )}

      {/* --- Paso 3: Cantidad y series --- */}
      {paso === 3 && (
        <div>
          <label className={labelCls}>Cantidad</label>
          <div className="flex items-center gap-2 mb-5">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              autoFocus
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
              className={`${inputCls} text-[20px] font-semibold`}
            />
            <span className="text-[15px] text-muted shrink-0 w-[60px]">{articuloElegido?.unidad || ''}</span>
          </div>

          <label className={labelCls}>Números de serie (si aplica)</label>
          <textarea
            value={numerosSerie}
            onChange={(e) => setNumerosSerie(e.target.value)}
            placeholder="Uno por línea, si el equipo los tiene"
            className="w-full px-3.5 py-2.5 mb-1 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px] min-h-[70px]"
          />
          <p className="text-[12.5px] text-muted leading-relaxed">
            Sirve para rastrear una pieza concreta si falla o se pierde. Déjalo vacío en material a granel.
          </p>
        </div>
      )}

      {/* --- Paso 4: Respaldo --- */}
      {paso === 4 && (
        <div>
          <label className={labelCls}>Proveedor (opcional)</label>
          <input type="text" value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={`${inputCls} mb-5`} />

          <CapturaDocumento label="Factura" archivo={factura} onCambiar={setFactura} />
          <CapturaDocumento label="Orden de compra" archivo={ordenCompra} onCambiar={setOrdenCompra} />

          <label className={labelCls}>Nota (opcional)</label>
          <input type="text" value={notaEntrada} onChange={(e) => setNotaEntrada(e.target.value)} className={inputCls} />
        </div>
      )}

      {/* --- Paso 5: Confirmar --- */}
      {paso === 5 && articuloElegido && (
        <div className="flex flex-col gap-2">
          <FilaResumen label="Artículo" valor={articuloElegido.descripcion} onEditar={() => setPaso(1)} />
          <FilaResumen
            label="Inventario"
            valor={inventario === 'general' ? 'General' : proyectos.find((p) => p.grupoId === grupoId)?.proyecto || 'Proyecto'}
            onEditar={() => setPaso(2)}
          />
          <FilaResumen label="Cantidad" valor={`${cantidad || 0} ${articuloElegido.unidad}`} onEditar={() => setPaso(3)} />
          {numerosSerie.trim() && (
            <FilaResumen label="Números de serie" valor={numerosSerie.trim().split('\n').filter(Boolean).join(', ')} onEditar={() => setPaso(3)} />
          )}
          <FilaResumen
            label="Respaldo"
            valor={[
              proveedor.trim() && `Proveedor: ${proveedor.trim()}`,
              factura && 'Factura adjunta',
              ordenCompra && 'Orden de compra adjunta',
              notaEntrada.trim() && `Nota: ${notaEntrada.trim()}`,
            ].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
            onEditar={() => setPaso(4)}
          />
        </div>
      )}

      {/* Barra inferior fija: mismo patrón que el resto de la app para
          acciones al alcance del pulgar. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 glass-strong px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="max-w-2xl lg:max-w-6xl mx-auto">
          {paso < TOTAL_PASOS ? (
            <button
              onClick={() => setPaso((p) => p + 1)}
              disabled={!puedeContinuar()}
              className="w-full min-h-[52px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] active:scale-95 transition-transform disabled:opacity-40"
            >
              Continuar
            </button>
          ) : (
            <button
              onClick={handleRegistrar}
              disabled={busy}
              className="w-full min-h-[52px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
            >
              <Check size={18} strokeWidth={2.8} />
              {busy ? 'Guardando...' : 'Registrar entrada'}
            </button>
          )}
        </div>
      </div>

      {/* Nuevo sistema, inline: nada de prompt() nativo del navegador */}
      {showNuevoSistema && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={() => setShowNuevoSistema(false)}>
          <div onClick={(e) => e.stopPropagation()} className="glass-strong rounded-3xl max-w-sm w-full p-5">
            <p className="font-display font-semibold text-[16px] mb-1">Nuevo sistema</p>
            <p className="text-[13px] text-muted mb-4 leading-relaxed">Ej. Telefonía, Videoporteros, Redes.</p>
            <input
              type="text"
              autoFocus
              value={nuevoSistemaNombre}
              onChange={(e) => setNuevoSistemaNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNuevoSistema(); }}
              className={`${inputCls} mb-4`}
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowNuevoSistema(false); setNuevoSistemaNombre(''); }} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium">
                Cancelar
              </button>
              <button onClick={handleNuevoSistema} disabled={!nuevoSistemaNombre.trim()} className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-50">
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nuevo artículo */}
      {showNuevoArticulo && (
        <ModalNuevoArticulo
          sistemas={sistemas}
          sistemaSugerido={filtroSistema !== 'todos' && filtroSistema !== 'sin-sistema' ? filtroSistema : null}
          descripcionSugerida={busqueda}
          onCancelar={() => setShowNuevoArticulo(false)}
          onCreado={async (nuevo) => {
            setShowNuevoArticulo(false);
            await onCatalogoActualizado();
            elegirArticulo(nuevo.id);
          }}
        />
      )}
    </div>
  );
}

function FilaResumen({ label, valor, onEditar }: { label: string; valor: string; onEditar: () => void }) {
  return (
    <button
      onClick={onEditar}
      className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-surface border border-line text-left active:scale-[0.99] transition-transform"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted mb-0.5">{label}</p>
        <p className="text-[14px] font-medium truncate">{valor}</p>
      </div>
      <Pencil size={15} strokeWidth={2.3} className="text-muted shrink-0" />
    </button>
  );
}

function PasoArticulo({
  articulos, sistemas, busqueda, setBusqueda, filtroSistema, setFiltroSistema, onElegir, onAgregarNuevo, onAgregarSistema,
}: {
  articulos: Articulo[];
  sistemas: Sistema[];
  busqueda: string;
  setBusqueda: (v: string) => void;
  filtroSistema: string;
  setFiltroSistema: (v: string) => void;
  onElegir: (id: string) => void;
  onAgregarNuevo: () => void;
  onAgregarSistema: () => void;
}) {
  const resultados = useMemo(() => {
    let list = articulos;
    if (filtroSistema === 'sin-sistema') list = list.filter((a) => !a.sistema_id);
    else if (filtroSistema !== 'todos') list = list.filter((a) => a.sistema_id === filtroSistema);
    const q = busqueda.trim().toLowerCase();
    if (q) list = list.filter((a) => `${a.descripcion} ${a.marca || ''} ${a.modelo || ''}`.toLowerCase().includes(q));
    return list;
  }, [articulos, filtroSistema, busqueda]);

  const grupos = CATEGORIAS
    .map((c) => ({ ...c, items: resultados.filter((a) => a.categoria === c.valor) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="relative mb-3">
        <Search size={17} strokeWidth={2.3} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          autoFocus
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en el catálogo…"
          className="w-full pl-10 pr-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]"
        />
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-0.5">
        {([{ k: 'todos', label: 'Todos' }, { k: 'sin-sistema', label: 'Sin sistema' }, ...sistemas.map((s) => ({ k: s.id, label: s.nombre }))]).map(({ k, label }) => (
          <button
            key={k}
            onClick={() => setFiltroSistema(k)}
            className={`min-h-[38px] px-3.5 rounded-full text-[13px] font-medium border shrink-0 ${filtroSistema === k ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line-strong text-ink/80'}`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={onAgregarSistema}
          className="min-h-[38px] px-3.5 rounded-full text-[13px] font-medium border border-dashed border-teal/50 text-teal shrink-0 flex items-center gap-1"
        >
          <Plus size={13} strokeWidth={2.6} /> Sistema
        </button>
      </div>

      <button
        onClick={onAgregarNuevo}
        className="w-full min-h-[48px] mb-4 rounded-xl border border-dashed border-teal/50 text-teal text-[14px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <Plus size={16} strokeWidth={2.6} />
        {busqueda.trim() ? `Agregar «${busqueda.trim()}» al catálogo` : 'Agregar artículo nuevo'}
      </button>

      {resultados.length === 0 && (
        <p className="text-center text-muted py-6 text-[13.5px] leading-relaxed">
          Nada en el catálogo coincide con esta búsqueda.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {grupos.map((g) => (
          <div key={g.valor}>
            <p className="text-[11px] uppercase tracking-wider text-muted mb-1.5 px-1">{g.label}</p>
            <div className="flex flex-col gap-1.5">
              {g.items.map((a) => {
                const Icono = ICONO[a.categoria];
                const sistemaNombre = a.sistema_id ? sistemas.find((s) => s.id === a.sistema_id)?.nombre : null;
                return (
                  <button
                    key={a.id}
                    onClick={() => onElegir(a.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-surface border border-line text-left active:scale-[0.99] transition-transform"
                  >
                    <Icono size={17} strokeWidth={2.2} className="text-muted shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold truncate">{a.descripcion}</p>
                      <p className="text-[12px] text-muted truncate">
                        {[a.marca, a.modelo].filter(Boolean).join(' ')}
                        {sistemaNombre && (a.marca || a.modelo ? ' · ' : '') + sistemaNombre}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapturaDocumento({ label, archivo, onCambiar }: { label: string; archivo: File | null; onCambiar: (f: File | null) => void }) {
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (archivo && archivo.type.startsWith('image/') ? URL.createObjectURL(archivo) : null), [archivo]);
  const esPdf = archivo && !archivo.type.startsWith('image/');

  return (
    <div className="mb-5">
      <label className="text-[13px] text-ink/75 block mb-1.5">{label} (opcional)</label>
      <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onCambiar(e.target.files?.[0] || null)} />
      <input ref={galeriaRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => onCambiar(e.target.files?.[0] || null)} />

      {!archivo ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => camaraRef.current?.click()} className="min-h-[48px] rounded-xl border border-dashed border-teal/50 text-teal text-[13.5px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform">
            <Camera size={16} strokeWidth={2.3} /> Tomar foto
          </button>
          <button onClick={() => galeriaRef.current?.click()} className="min-h-[48px] rounded-xl border border-dashed border-teal/50 text-teal text-[13.5px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform">
            <Images size={16} strokeWidth={2.3} /> Elegir archivo
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-line">
          {preview ? (
            <img src={preview} className="w-12 h-12 object-cover rounded-lg border border-line shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-surface border border-line flex items-center justify-center shrink-0">
              <FileText size={18} strokeWidth={2.2} className="text-teal" />
            </div>
          )}
          <span className="flex-1 min-w-0 text-[13px] text-ink/85 truncate">{archivo.name}</span>
          <button onClick={() => onCambiar(null)} aria-label="Quitar" className="w-9 h-9 flex items-center justify-center text-muted shrink-0 active:scale-90 transition-transform">
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
      )}
    </div>
  );
}

export function ModalNuevoArticulo({
  sistemas, sistemaSugerido, descripcionSugerida, onCancelar, onCreado,
}: {
  sistemas: Sistema[];
  sistemaSugerido: string | null;
  descripcionSugerida: string;
  onCancelar: () => void;
  onCreado: (nuevo: Articulo) => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaInsumo>('material');
  const [descripcion, setDescripcion] = useState(descripcionSugerida);
  const [unidad, setUnidad] = useState('pza');
  const [retornable, setRetornable] = useState(false);
  const [minimo, setMinimo] = useState('');
  const [sistemaId, setSistemaId] = useState<string | null>(sistemaSugerido);
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [busy, setBusy] = useState(false);

  const inputCls = 'w-full px-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';
  const labelCls = 'text-[13px] text-ink/75 block mb-1.5';

  async function handleCrear() {
    if (!descripcion.trim()) { alert('Escribe qué es.'); return; }
    setBusy(true);
    try {
      const nuevo = await crearArticulo({
        categoria, descripcion, unidad, retornable,
        minimo: parseFloat(minimo) || 0, sistemaId, marca, modelo,
      });
      // Este modal solo da de alta el artículo en el catálogo — con 0 en
      // existencia. Sin este aviso, es fácil creer que "Agregar" ya
      // registró la entrada y salirse antes del paso de cantidad, dejando
      // el artículo en 0 aunque sí haya llegado al almacén.
      showToast('Catálogo actualizado — ahora indica cuánto entró', 'success');
      onCreado(nuevo);
    } catch (e: any) {
      alert('No se pudo agregar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={onCancelar}>
      <div onClick={(e) => e.stopPropagation()} className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
        <p className="font-display font-semibold text-[16px] mb-1">Nuevo artículo</p>
        <p className="text-[12.5px] text-muted mb-4 leading-relaxed">
          Esto solo lo da de alta en el catálogo. Al continuar, todavía falta indicar cuánto entró.
        </p>

        <label className={labelCls}>Tipo</label>
        <div className="flex gap-2 mb-4">
          {CATEGORIAS.map((c) => (
            <button
              key={c.valor}
              onClick={() => { setCategoria(c.valor); setRetornable(c.valor === 'herramienta'); }}
              className={`flex-1 min-h-[46px] rounded-xl text-[13.5px] font-semibold border ${categoria === c.valor ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface border-line-strong text-ink/80'}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <label className={labelCls}>¿Qué es?</label>
        <input
          type="text"
          autoFocus
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Cable calibre 12, taladro, panel solar…"
          className={`${inputCls} mb-4`}
        />

        <div className="flex gap-2 mb-4">
          <div className="flex-1 min-w-0">
            <label className={labelCls}>Marca</label>
            <input type="text" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Hikvision" className={inputCls} />
          </div>
          <div className="flex-1 min-w-0">
            <label className={labelCls}>Modelo</label>
            <input type="text" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="DS-2CD" className={inputCls} />
          </div>
        </div>

        <label className={labelCls}>Sistema (opcional)</label>
        <select value={sistemaId || ''} onChange={(e) => setSistemaId(e.target.value || null)} className={`${inputCls} mb-4`}>
          <option value="">Sin clasificar</option>
          {sistemas.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>

        <label className={labelCls}>Unidad</label>
        <select value={unidad} onChange={(e) => setUnidad(e.target.value)} className={`${inputCls} mb-4`}>
          {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>

        <label className={labelCls}>Mínimo antes de reponer (opcional)</label>
        <div className="flex items-center gap-2 mb-1">
          <input type="number" inputMode="decimal" min={0} value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="0" className={inputCls} />
          <span className="text-[15px] text-muted shrink-0 w-[60px]">{unidad}</span>
        </div>
        <p className="text-[12.5px] text-muted mb-4 leading-relaxed">
          Cuando el inventario general baje de aquí, aparecerá un aviso. Déjalo en 0 si no lo quieres controlar.
        </p>

        <label className="flex items-start gap-2.5 min-h-[44px] cursor-pointer mb-4">
          <input type="checkbox" checked={retornable} onChange={(e) => setRetornable(e.target.checked)} className="w-5 h-5 accent-teal mt-0.5" />
          <span className="text-[14px] text-ink/85 leading-snug">
            Regresa al almacén
            <span className="block text-[12.5px] text-muted">La herramienta vuelve; el material se queda instalado.</span>
          </span>
        </label>

        <div className="flex gap-2">
          <button onClick={onCancelar} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium">
            Cancelar
          </button>
          <button
            onClick={handleCrear}
            disabled={busy}
            className="flex-[1.4] min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {busy ? 'Guardando...' : (
              <>
                Guardar y seguir con la cantidad
                <ArrowRight size={15} strokeWidth={2.6} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
