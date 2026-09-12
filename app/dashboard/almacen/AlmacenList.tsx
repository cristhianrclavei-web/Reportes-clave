'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import LogoutButton from '@/components/LogoutButton';
import Logo from '@/components/Logo';
import DashboardTabs from '@/components/DashboardTabs';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import {
  Articulo, Existencia, CATEGORIAS, UNIDADES, CategoriaInsumo,
  listarArticulos, crearArticulo, desactivarArticulo, listarExistencias,
  registrarEntrada, listarProyectosParaAlmacen, urlDeDocumento,
  listarMovimientos, MovimientoDetallado, listarBajoMinimo, ArticuloBajoMinimo, editarArticulo,
  Sistema, listarSistemas, crearSistema, desactivarSistema, articulosPorSistema,
} from '@/lib/almacen';
import {
  Plus, X, FileText, ScrollText, Wrench, Package, HardHat,
  Warehouse, Trash2, Boxes, ArrowLeftRight, ArrowDown, ArrowUp, RotateCcw, AlertTriangle, LayoutGrid,
} from 'lucide-react';

const ICONO: Record<CategoriaInsumo, any> = { herramienta: Wrench, material: Package, equipo: HardHat };

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function AlmacenList({ userName }: { userName?: string }) {
  const [seccion, setSeccion] = useState<'existencias' | 'entrada' | 'movimientos' | 'catalogo' | 'sistemas'>('existencias');
  const [movimientos, setMovimientos] = useState<MovimientoDetallado[]>([]);
  const [existencias, setExistencias] = useState<Existencia[]>([]);
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [proyectos, setProyectos] = useState<{ grupoId: string; proyecto: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Entrada
  const [articuloId, setArticuloId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [inventario, setInventario] = useState<'general' | 'proyecto'>('general');
  const [grupoId, setGrupoId] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [notaEntrada, setNotaEntrada] = useState('');
  const [factura, setFactura] = useState<File | null>(null);
  const [ordenCompra, setOrdenCompra] = useState<File | null>(null);

  // Alta de artículo
  const [showNuevoArticulo, setShowNuevoArticulo] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState<CategoriaInsumo>('material');
  const [nuevaDescripcion, setNuevaDescripcion] = useState('');
  const [nuevaUnidad, setNuevaUnidad] = useState('pza');
  const [nuevoRetornable, setNuevoRetornable] = useState(false);
  const [nuevoMinimo, setNuevoMinimo] = useState('');
  const [bajoMinimo, setBajoMinimo] = useState<ArticuloBajoMinimo[]>([]);
  const [editandoMinimo, setEditandoMinimo] = useState<Articulo | null>(null);
  const [minimoEdit, setMinimoEdit] = useState('');
  const [sistemas, setSistemas] = useState<Sistema[]>([]);
  const [sistemaId, setSistemaId] = useState<string | null>(null);
  const [numerosSerie, setNumerosSerie] = useState('');
  // Sistema preseleccionado al dar de alta un artículo desde el flujo de entrada.
  const [nuevoSistemaId, setNuevoSistemaId] = useState<string | null>(null);
  const [nuevaMarca, setNuevaMarca] = useState('');
  const [nuevoModelo, setNuevoModelo] = useState('');

  const [filtro, setFiltro] = useState<'todos' | CategoriaInsumo>('todos');

  async function cargar() {
    try {
      const [ex, ar, pr, mv, bm, si] = await Promise.all([
        listarExistencias(), listarArticulos(), listarProyectosParaAlmacen(), listarMovimientos(), listarBajoMinimo(), listarSistemas(),
      ]);
      setExistencias(ex);
      setArticulos(ar);
      setProyectos(pr);
      setMovimientos(mv);
      setBajoMinimo(bm);
      setSistemas(si);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el almacén');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  // La herramienta es de uso general: no se reserva por proyecto, porque no
  // se compra para una obra específica.
  const articuloElegido = articulos.find((a) => a.id === articuloId);
  const soloGeneral = articuloElegido?.categoria === 'herramienta';

  useEffect(() => {
    if (soloGeneral) setInventario('general');
  }, [soloGeneral]);

  const existenciasFiltradas = useMemo(
    () => (filtro === 'todos' ? existencias : existencias.filter((e) => e.articulo.categoria === filtro)),
    [existencias, filtro]
  );

  async function handleNuevoSistema() {
    const nombre = prompt('¿Qué sistema? (ej. Telefonía, Videoporteros)');
    if (!nombre || !nombre.trim()) return;
    try {
      const nuevo = await crearSistema(nombre);
      setSistemas(await listarSistemas());
      setSistemaId(nuevo.id);
      showToast('Sistema agregado', 'success');
    } catch (e: any) {
      alert('No se pudo agregar: ' + (e?.message || 'error'));
    }
  }

  async function handleRegistrarEntrada() {
    const cant = parseFloat(cantidad);
    if (!articuloId) { alert('Elige el artículo.'); return; }
    if (isNaN(cant) || cant <= 0) { alert('Escribe la cantidad que entró.'); return; }
    if (inventario === 'proyecto' && !grupoId) { alert('Elige el proyecto al que se reserva.'); return; }

    setBusy(true);
    try {
      await registrarEntrada({
        articuloId, cantidad: cant, inventario,
        grupoId: grupoId || null, proveedor, nota: notaEntrada, factura, ordenCompra,
        numerosSerie,
      });
      showToast('Entrada registrada', 'success');
      setArticuloId(''); setCantidad(''); setProveedor(''); setNotaEntrada('');
      setFactura(null); setOrdenCompra(null); setGrupoId(''); setInventario('general');
      setNumerosSerie(''); setSistemaId(null);
      setSeccion('existencias');
      await cargar();
    } catch (e: any) {
      alert('No se pudo registrar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function handleCrearArticulo() {
    if (!nuevaDescripcion.trim()) { alert('Escribe qué es.'); return; }
    setBusy(true);
    try {
      const nuevo = await crearArticulo({
        categoria: nuevaCategoria,
        descripcion: nuevaDescripcion,
        unidad: nuevaUnidad,
        retornable: nuevoRetornable,
        minimo: parseFloat(nuevoMinimo) || 0,
        sistemaId: nuevoSistemaId,
        marca: nuevaMarca,
        modelo: nuevoModelo,
      });
      showToast('Artículo agregado', 'success');
      setShowNuevoArticulo(false);
      setNuevaDescripcion(''); setNuevaUnidad('pza'); setNuevoRetornable(false); setNuevoMinimo('');
      setNuevaMarca(''); setNuevoModelo('');
      await cargar();
      setArticuloId(nuevo.id);
    } catch (e: any) {
      alert('No se pudo agregar: ' + (e?.message || 'error'));
    } finally {
      setBusy(false);
    }
  }

  async function abrirDocumento(path: string) {
    const url = await urlDeDocumento(path);
    if (url) window.open(url, '_blank');
    else alert('No se pudo abrir el archivo.');
  }

  const inputCls = 'w-full px-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';
  const labelCls = 'text-[13px] text-ink/75 block mb-1.5';

  return (
    <div className="max-w-2xl lg:max-w-6xl mx-auto pb-16 lg:px-6">
      <div className="sticky top-0 z-20 glass-strong px-5 py-3.5 flex items-center justify-between gap-3">
        <Logo variante="completo" size={32} className="min-w-0" compactoEnMovil />
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <LogoutButton compacto />
        </div>
      </div>

      <div className="px-4 lg:px-0 pt-5">
        <h1 className="font-display font-bold text-2xl lg:text-3xl tracking-wide mb-4">Almacén</h1>
        {userName && <p className="text-[15px] text-muted font-medium mb-4 -mt-2.5">{userName}</p>}

        <DashboardTabs active="almacen" mostrarAlmacen />

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-5">
          {([
            { k: 'existencias', label: 'Existencias', Icono: Boxes },
            { k: 'entrada', label: 'Entrada', Icono: Plus },
            { k: 'movimientos', label: 'Movimientos', Icono: ArrowLeftRight },
            { k: 'catalogo', label: 'Catálogo', Icono: ScrollText },
            { k: 'sistemas', label: 'Sistemas', Icono: LayoutGrid },
          ] as const).map(({ k, label, Icono }) => (
            <button
              key={k}
              onClick={() => setSeccion(k)}
              className={`min-h-[54px] px-2 rounded-2xl text-[13px] font-display font-semibold border transition-colors flex items-center justify-center gap-1.5 ${
                seccion === k ? 'bg-teal text-inkOnAccent border-teal shadow-glow-teal' : 'bg-surface-2 border-line-strong text-ink/80'
              }`}
            >
              <Icono size={16} strokeWidth={2.4} className="shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-2xl bg-red/10 border border-red/30">
            <p className="text-[14px] font-semibold text-red mb-1">No se pudo cargar el almacén</p>
            <p className="text-[13px] text-ink/80 leading-relaxed">{error}</p>
            <p className="text-[12.5px] text-muted mt-2">Si menciona una tabla que no existe, falta correr el patch del almacén.</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="rounded-2xl bg-surface-2 h-[84px] animate-pulse" />)}
          </div>
        )}

        {/* --- Existencias --- */}
        {!loading && seccion === 'existencias' && (
          <>
            {/* Reponer antes de que el técnico se quede parado en el mostrador */}
            {bajoMinimo.length > 0 && (
              <div className="mb-4 p-4 rounded-2xl bg-amber/12 border-2 border-amber/40">
                <p className="font-display font-semibold text-[15px] text-amber mb-2 flex items-center gap-2">
                  <AlertTriangle size={18} strokeWidth={2.5} />
                  {bajoMinimo.length === 1
                    ? 'Hay 1 artículo por debajo del mínimo'
                    : `Hay ${bajoMinimo.length} artículos por debajo del mínimo`}
                </p>
                {bajoMinimo.map((b) => (
                  <p key={b.articulo.id} className="text-[13px] text-ink/85 leading-relaxed">
                    <span className="font-medium">{b.articulo.descripcion}</span>
                    {' — quedan '}{b.existencia} de {b.articulo.minimo} {b.articulo.unidad}
                    {b.faltan > 0 && <span className="text-muted"> · faltan {b.faltan}</span>}
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-2 mb-4 overflow-x-auto">
              {([
                { k: 'todos', label: 'Todo' },
                ...CATEGORIAS.map((c) => ({ k: c.valor, label: c.label })),
              ] as const).map(({ k, label }) => (
                <button
                  key={k}
                  onClick={() => setFiltro(k as any)}
                  className={`min-h-[42px] px-4 rounded-full text-[13.5px] font-medium border shrink-0 ${
                    filtro === k ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line-strong text-ink/80'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {existenciasFiltradas.length === 0 && (
              <p className="text-center text-muted py-10 text-[14px] leading-relaxed">
                Todavía no hay existencias. Registra una entrada para empezar.
              </p>
            )}

            {existenciasFiltradas.length > 0 && (
              <div className="hidden lg:grid grid-cols-[1.6fr_90px_90px_1.3fr_100px_110px] gap-3 px-4 pb-2 text-[11.5px] uppercase tracking-wider text-muted">
                <span>Artículo</span>
                <span className="text-center">Cantidad</span>
                <span className="text-center">Unidad</span>
                <span>Inventario</span>
                <span className="text-center">Documentos</span>
                <span>Última entrada</span>
              </div>
            )}

            <div className="flex flex-col gap-2.5 lg:gap-1.5">
              {existenciasFiltradas.map((e, i) => {
                const Icono = ICONO[e.articulo.categoria];
                return (
                  <div
                    key={`${e.articulo.id}-${e.inventario}-${e.grupoId || 'g'}-${i}`}
                    className="rounded-2xl lg:rounded-xl bg-surface border border-line p-4 lg:py-3 lg:grid lg:grid-cols-[1.6fr_90px_90px_1.3fr_100px_110px] lg:gap-3 lg:items-center"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <Icono size={15} strokeWidth={2.3} className="text-muted shrink-0" />
                      <span className="text-[14.5px] font-semibold truncate">{e.articulo.descripcion}</span>
                    </div>

                    <div className="flex items-center gap-4 mt-2 lg:hidden">
                      <span className={`text-[15px] font-display font-bold ${e.cantidad <= 0 ? 'text-red' : ''}`}>
                        {e.cantidad} {e.articulo.unidad}
                      </span>
                      <span className="text-[13px] text-muted">
                        {e.inventario === 'general' ? 'General' : e.proyecto}
                      </span>
                    </div>
                    <span className={`hidden lg:block text-center text-[15px] font-display font-bold ${e.cantidad <= 0 ? 'text-red' : ''}`}>
                      {e.cantidad}
                    </span>
                    <span className="hidden lg:block text-center text-[13.5px] text-muted">{e.articulo.unidad}</span>
                    <span className="hidden lg:block text-[13.5px] truncate">
                      {e.inventario === 'general'
                        ? <span className="text-muted">General</span>
                        : <span className="text-teal">{e.proyecto}</span>}
                    </span>

                    <div className="flex items-center gap-2 mt-2 lg:mt-0 lg:justify-center">
                      {e.tieneFactura && (
                        <span className="text-[12px] text-teal flex items-center gap-1"><FileText size={13} strokeWidth={2.4} />Factura</span>
                      )}
                      {e.tieneOrdenCompra && (
                        <span className="text-[12px] text-teal flex items-center gap-1"><ScrollText size={13} strokeWidth={2.4} />OC</span>
                      )}
                      {!e.tieneFactura && !e.tieneOrdenCompra && <span className="text-[12px] text-muted">—</span>}
                    </div>

                    <span className="text-[12.5px] text-muted mt-1 lg:mt-0 block">
                      <span className="lg:hidden">Última entrada: </span>{fmtFecha(e.ultimaEntrada)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* --- Registrar entrada --- */}
        {!loading && seccion === 'entrada' && (
          <div className="glass rounded-2xl p-4">
            <p className="font-display font-semibold text-[16px] mb-1">Entrada de almacén</p>
            <p className="text-[12.5px] text-muted mb-5 leading-relaxed">
              Lo que llega de una compra. Se registra paso por paso para que nada quede sin capturar.
            </p>

            {/* Paso 1 — Sistema. Filtra el catálogo antes de buscar el
                artículo: es más rápido que recorrer una lista plana. */}
            <Paso numero={1} titulo="¿De qué sistema es?" />
            <div className="flex flex-wrap gap-2 mb-2">
              {sistemas.map((sis) => (
                <button
                  key={sis.id}
                  onClick={() => { setSistemaId(sis.id); setArticuloId(''); }}
                  className={`min-h-[44px] px-3.5 rounded-xl text-[13.5px] font-medium border transition-colors ${
                    sistemaId === sis.id ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line-strong text-ink/80'
                  }`}
                >
                  {sis.nombre}
                </button>
              ))}
              <button
                onClick={handleNuevoSistema}
                className="min-h-[44px] px-3.5 rounded-xl text-[13.5px] font-medium border border-dashed border-teal/50 text-teal flex items-center gap-1.5"
              >
                <Plus size={15} strokeWidth={2.6} />
                Otro sistema
              </button>
            </div>
            <p className="text-[12.5px] text-muted mb-5">
              Los sistemas nuevos quedan guardados para las próximas entradas.
            </p>

            {/* Paso 2 — Artículo */}
            <Paso numero={2} titulo="¿Qué artículo?" />
            <select
              value={articuloId}
              onChange={(e) => setArticuloId(e.target.value)}
              disabled={!sistemaId}
              className={`${inputCls} mb-2 disabled:opacity-50`}
            >
              <option value="">{sistemaId ? 'Elegir del catálogo…' : 'Primero elige el sistema'}</option>
              {CATEGORIAS.map((c) => {
                const delTipo = articulos.filter((a) => a.categoria === c.valor && a.sistema_id === sistemaId);
                if (delTipo.length === 0) return null;
                return (
                  <optgroup key={c.valor} label={c.label}>
                    {delTipo.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.descripcion}{a.marca ? ` · ${a.marca}` : ''}{a.modelo ? ` ${a.modelo}` : ''} ({a.unidad})
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            <button
              onClick={() => { setShowNuevoArticulo(true); setNuevoSistemaId(sistemaId); }}
              disabled={!sistemaId}
              className="w-full min-h-[46px] mb-5 rounded-xl border border-dashed border-teal/50 text-teal text-[14px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
            >
              <Plus size={16} strokeWidth={2.6} />
              No está en el catálogo
            </button>

            {/* Paso 3 — Inventario */}
            <Paso numero={3} titulo="¿A qué inventario entra?" />
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setInventario('general')}
                className={`flex-1 min-h-[48px] rounded-xl text-[14px] font-semibold border ${
                  inventario === 'general' ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line-strong text-ink/80'
                }`}
              >
                General
              </button>
              <button
                onClick={() => setInventario('proyecto')}
                disabled={soloGeneral}
                className={`flex-1 min-h-[48px] rounded-xl text-[14px] font-semibold border disabled:opacity-40 ${
                  inventario === 'proyecto' ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line-strong text-ink/80'
                }`}
              >
                De un proyecto
              </button>
            </div>
            {soloGeneral && (
              <p className="text-[12.5px] text-muted mb-4 leading-relaxed">
                La herramienta es de uso general: no se reserva por proyecto.
              </p>
            )}
            {inventario === 'proyecto' && (
              <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} className={`${inputCls} mb-4`}>
                <option value="">Elegir proyecto…</option>
                {proyectos.map((pr) => (
                  <option key={pr.grupoId} value={pr.grupoId}>{pr.proyecto}</option>
                ))}
              </select>
            )}
            <div className="mb-5" />

            {/* Paso 4 — Cantidad y series */}
            <Paso numero={4} titulo="¿Cuánto entró?" />
            <div className="flex items-center gap-2 mb-4">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className={inputCls}
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
            <p className="text-[12.5px] text-muted mb-5 leading-relaxed">
              Sirve para rastrear una pieza concreta si falla o se pierde. Déjalo vacío en material a granel.
            </p>

            {/* Paso 5 — Respaldo */}
            <Paso numero={5} titulo="Respaldo de la compra" />
            <label className={labelCls}>Proveedor (opcional)</label>
            <input type="text" value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={`${inputCls} mb-4`} />

            <label className={labelCls}>Factura</label>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFactura(e.target.files?.[0] || null)}
              className="w-full text-[13.5px] mb-1 text-muted file:mr-3 file:min-h-[42px] file:px-4 file:rounded-xl file:border file:border-line-strong file:bg-surface-2 file:text-ink/80 file:text-[13.5px]"
            />
            {factura && <p className="text-[12.5px] text-teal mb-3">{factura.name}</p>}

            <label className={`${labelCls} mt-3`}>Orden de compra</label>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setOrdenCompra(e.target.files?.[0] || null)}
              className="w-full text-[13.5px] mb-1 text-muted file:mr-3 file:min-h-[42px] file:px-4 file:rounded-xl file:border file:border-line-strong file:bg-surface-2 file:text-ink/80 file:text-[13.5px]"
            />
            {ordenCompra && <p className="text-[12.5px] text-teal mb-3">{ordenCompra.name}</p>}

            <label className={`${labelCls} mt-3`}>Nota (opcional)</label>
            <input type="text" value={notaEntrada} onChange={(e) => setNotaEntrada(e.target.value)} className={`${inputCls} mb-5`} />

            <button
              onClick={handleRegistrarEntrada}
              disabled={busy}
              className="w-full min-h-[52px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] active:scale-95 transition-transform disabled:opacity-60"
            >
              {busy ? 'Guardando...' : 'Registrar entrada'}
            </button>
            <p className="text-[12.5px] text-muted mt-2 text-center">
              Se guarda con la fecha de hoy y tu nombre.
            </p>
          </div>
        )}

        {/* --- Movimientos --- */}
        {!loading && seccion === 'movimientos' && (
          <>
            <p className="text-[12.5px] text-muted mb-3 leading-relaxed">
              Todo lo que entró y salió. El saldo de cada artículo se calcula sumando estos renglones.
            </p>

            {movimientos.length === 0 && (
              <p className="text-center text-muted py-10 text-[14px]">Todavía no hay movimientos.</p>
            )}

            <div className="flex flex-col gap-2.5 lg:gap-1.5">
              {movimientos.map((m) => {
                const cfg = {
                  entrada: { Icono: ArrowDown, color: 'text-teal', signo: '+', label: 'Entrada' },
                  salida: { Icono: ArrowUp, color: 'text-red', signo: '−', label: 'Salida' },
                  retorno: { Icono: RotateCcw, color: 'text-teal', signo: '+', label: 'Retorno' },
                  ajuste: { Icono: ArrowLeftRight, color: 'text-amber', signo: '', label: 'Ajuste' },
                }[m.tipo];
                return (
                  <div key={m.id} className="rounded-2xl lg:rounded-xl bg-surface border border-line p-4 lg:py-3 flex items-center gap-3">
                    <cfg.Icono size={17} strokeWidth={2.4} className={`${cfg.color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] font-semibold truncate">
                        {m.articulo?.descripcion || 'Artículo eliminado'}
                      </p>
                      <p className="text-[12.5px] text-muted">
                        {cfg.label} · {m.inventario === 'general' ? 'General' : m.proyecto || 'Proyecto'} · {m.quien}
                      </p>
                      {m.numeros_serie && (
                        <p className="text-[12px] text-muted font-mono mt-0.5 truncate">
                          {m.numeros_serie.split('\n').filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[15px] font-display font-bold ${cfg.color}`}>
                        {cfg.signo}{m.cantidad} {m.articulo?.unidad || ''}
                      </p>
                      <p className="text-[12px] text-muted">{fmtFecha(m.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* --- Sistemas --- */}
        {!loading && seccion === 'sistemas' && (
          <>
            <p className="text-[12.5px] text-muted mb-3 leading-relaxed">
              Clasifican el catálogo por tipo de instalación. Se eligen al registrar una entrada.
            </p>

            <button
              onClick={handleNuevoSistema}
              className="w-full min-h-[52px] mb-4 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <Plus size={18} strokeWidth={2.6} />
              Agregar sistema
            </button>

            <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2">
              {sistemas.map((sis) => (
                <div key={sis.id} className="rounded-2xl bg-surface border border-line p-4 flex items-center gap-3">
                  <LayoutGrid size={17} strokeWidth={2.3} className="text-muted shrink-0" />
                  <p className="flex-1 min-w-0 text-[14.5px] font-semibold truncate">{sis.nombre}</p>
                  <button
                    onClick={async () => {
                      const cuantos = await articulosPorSistema(sis.id);
                      const aviso = cuantos > 0
                        ? `«${sis.nombre}» tiene ${cuantos} artículo(s).\n\nAl quitarlo dejará de aparecer al registrar entradas, pero esos artículos conservan su clasificación y el historial no se toca.`
                        : `¿Quitar «${sis.nombre}» de la lista?`;
                      if (!confirm(aviso)) return;
                      await desactivarSistema(sis.id);
                      await cargar();
                      showToast('Sistema quitado', 'success');
                    }}
                    aria-label="Quitar sistema"
                    className="w-10 h-10 flex items-center justify-center text-red shrink-0 active:scale-90 transition-transform"
                  >
                    <Trash2 size={16} strokeWidth={2.4} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* --- Catálogo --- */}
        {!loading && seccion === 'catalogo' && (
          <>
            <button
              onClick={() => setShowNuevoArticulo(true)}
              className="w-full min-h-[52px] mb-4 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <Plus size={18} strokeWidth={2.6} />
              Agregar artículo
            </button>

            {articulos.length === 0 && (
              <p className="text-center text-muted py-10 text-[14px]">El catálogo está vacío.</p>
            )}

            <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2">
              {articulos.map((a) => {
                const Icono = ICONO[a.categoria];
                return (
                  <div key={a.id} className="rounded-2xl bg-surface border border-line p-4 flex items-center gap-3">
                    <Icono size={17} strokeWidth={2.3} className="text-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] font-semibold truncate">{a.descripcion}</p>
                      <p className="text-[12.5px] text-muted">
                        {[a.marca, a.modelo].filter(Boolean).join(' ') || CATEGORIAS.find((c) => c.valor === a.categoria)?.label}
                        {' · '}{a.unidad}{a.retornable ? ' · Regresa' : ' · Se consume'}
                      </p>
                      {a.sistema_id && (
                        <p className="text-[12px] text-teal mt-0.5">
                          {sistemas.find((sx) => sx.id === a.sistema_id)?.nombre || ''}
                        </p>
                      )}
                      <button
                        onClick={() => { setEditandoMinimo(a); setMinimoEdit(String(a.minimo || '')); }}
                        className="text-[12.5px] text-teal font-medium mt-1 min-h-[32px]"
                      >
                        {a.minimo > 0 ? `Mínimo: ${a.minimo} ${a.unidad}` : 'Definir mínimo'}
                      </button>
                    </div>
                    <button
                      onClick={async () => {
                        if (!confirm(`¿Quitar «${a.descripcion}» del catálogo?\n\nSe conserva en el historial de movimientos.`)) return;
                        await desactivarArticulo(a.id);
                        await cargar();
                      }}
                      aria-label="Quitar del catálogo"
                      className="w-10 h-10 flex items-center justify-center text-red shrink-0 active:scale-90 transition-transform"
                    >
                      <Trash2 size={16} strokeWidth={2.4} />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {editandoMinimo && (
        <ModalOverlay onClose={() => setEditandoMinimo(null)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5">
            <p className="font-display font-semibold text-[16px] mb-1">{editandoMinimo.descripcion}</p>
            <p className="text-[13px] text-muted mb-4 leading-relaxed">
              Cuando el inventario general baje de esta cantidad, aparecerá un aviso para reponer.
            </p>
            <div className="flex items-center gap-2 mb-4">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={minimoEdit}
                onChange={(e) => setMinimoEdit(e.target.value)}
                autoFocus
                className="flex-1 px-3.5 min-h-[52px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[18px] font-semibold"
              />
              <span className="text-[16px] text-muted shrink-0">{editandoMinimo.unidad}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditandoMinimo(null)} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  try {
                    await editarArticulo(editandoMinimo.id, { minimo: parseFloat(minimoEdit) || 0 });
                    setEditandoMinimo(null);
                    await cargar();
                    showToast('Mínimo actualizado', 'success');
                  } catch (e: any) {
                    alert('No se pudo guardar: ' + (e?.message || 'error'));
                  }
                }}
                className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold"
              >
                Guardar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {showNuevoArticulo && (
        <ModalOverlay onClose={() => setShowNuevoArticulo(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-4">Nuevo artículo</p>

            <label className={labelCls}>Tipo</label>
            <div className="flex gap-2 mb-4">
              {CATEGORIAS.map((c) => (
                <button
                  key={c.valor}
                  onClick={() => {
                    setNuevaCategoria(c.valor);
                    // La herramienta siempre vuelve; el material se consume.
                    setNuevoRetornable(c.valor === 'herramienta');
                  }}
                  className={`flex-1 min-h-[46px] rounded-xl text-[13.5px] font-semibold border ${
                    nuevaCategoria === c.valor ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface border-line-strong text-ink/80'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <label className={labelCls}>¿Qué es?</label>
            <input
              type="text"
              value={nuevaDescripcion}
              onChange={(e) => setNuevaDescripcion(e.target.value)}
              placeholder="Cable calibre 12, taladro, panel solar…"
              className={`${inputCls} mb-4`}
            />

            <div className="flex gap-2 mb-4">
              <div className="flex-1 min-w-0">
                <label className={labelCls}>Marca</label>
                <input type="text" value={nuevaMarca} onChange={(e) => setNuevaMarca(e.target.value)} placeholder="Hikvision" className={inputCls} />
              </div>
              <div className="flex-1 min-w-0">
                <label className={labelCls}>Modelo</label>
                <input type="text" value={nuevoModelo} onChange={(e) => setNuevoModelo(e.target.value)} placeholder="DS-2CD" className={inputCls} />
              </div>
            </div>

            <label className={labelCls}>Sistema</label>
            <select
              value={nuevoSistemaId || ''}
              onChange={(e) => setNuevoSistemaId(e.target.value || null)}
              className={`${inputCls} mb-4`}
            >
              <option value="">Sin clasificar</option>
              {sistemas.map((sis) => <option key={sis.id} value={sis.id}>{sis.nombre}</option>)}
            </select>

            <label className={labelCls}>Unidad</label>
            <select value={nuevaUnidad} onChange={(e) => setNuevaUnidad(e.target.value)} className={`${inputCls} mb-4`}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>

            <label className={labelCls}>Mínimo antes de reponer (opcional)</label>
            <div className="flex items-center gap-2 mb-1">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={nuevoMinimo}
                onChange={(e) => setNuevoMinimo(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
              <span className="text-[15px] text-muted shrink-0 w-[60px]">{nuevaUnidad}</span>
            </div>
            <p className="text-[12.5px] text-muted mb-4 leading-relaxed">
              Cuando el inventario general baje de aquí, aparecerá un aviso. Déjalo en 0 si no lo quieres controlar.
            </p>

            <label className="flex items-start gap-2.5 min-h-[44px] cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={nuevoRetornable}
                onChange={(e) => setNuevoRetornable(e.target.checked)}
                className="w-5 h-5 accent-teal mt-0.5"
              />
              <span className="text-[14px] text-ink/85 leading-snug">
                Regresa al almacén
                <span className="block text-[12.5px] text-muted">
                  La herramienta vuelve; el material se queda instalado.
                </span>
              </span>
            </label>

            <div className="flex gap-2">
              <button onClick={() => setShowNuevoArticulo(false)} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium">
                Cancelar
              </button>
              <button onClick={handleCrearArticulo} disabled={busy} className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-60">
                {busy ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// Numerar los pasos hace legible un formulario largo: se ve cuánto falta y
// dónde se quedó uno si lo interrumpen.
function Paso({ numero, titulo }: { numero: number; titulo: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="w-7 h-7 rounded-full bg-teal/15 text-teal text-[13px] font-display font-bold flex items-center justify-center shrink-0">
        {numero}
      </span>
      <p className="text-[14.5px] font-semibold">{titulo}</p>
    </div>
  );
}
