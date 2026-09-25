'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SupervisorShell from '@/components/SupervisorShell';
import EmptyIllustration from '@/components/EmptyIllustration';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import {
  Articulo, Existencia, CATEGORIAS, CategoriaInsumo,
  listarArticulos, desactivarArticulo, reactivarArticulo, listarExistencias,
  listarProyectosParaAlmacen, urlDeDocumento,
  listarMovimientos, MovimientoDetallado, listarBajoMinimo, ArticuloBajoMinimo, editarArticulo,
  Sistema, listarSistemas, crearSistema, desactivarSistema, articulosPorSistema,
} from '@/lib/almacen';
import EntradaAlmacenWizard, { ModalNuevoArticulo } from '@/components/almacen/EntradaAlmacenWizard';
import {
  Plus, FileText, ScrollText, Wrench, Package, HardHat,
  Trash2, Boxes, ArrowLeftRight, ArrowDown, ArrowUp, RotateCcw, AlertTriangle, LayoutGrid,
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

  // Alta de artículo (desde la pestaña Catálogo; el flujo de Entrada tiene
  // su propio modal igual, ver EntradaAlmacenWizard)
  const [showNuevoArticulo, setShowNuevoArticulo] = useState(false);
  const [bajoMinimo, setBajoMinimo] = useState<ArticuloBajoMinimo[]>([]);
  const [editandoMinimo, setEditandoMinimo] = useState<Articulo | null>(null);
  const [minimoEdit, setMinimoEdit] = useState('');
  const [sistemas, setSistemas] = useState<Sistema[]>([]);

  const [filtro, setFiltro] = useState<'todos' | CategoriaInsumo>('todos');
  const [verBaja, setVerBaja] = useState(false);

  async function cargar() {
    try {
      // false: trae también los dados de baja, para poder mostrarlos y
      // reactivarlos en Catálogo. El asistente de "nueva entrada" solo debe
      // ofrecer los activos — se filtra al pasárselo (ver más abajo).
      const [ex, ar, pr, mv, bm, si] = await Promise.all([
        listarExistencias(), listarArticulos(false), listarProyectosParaAlmacen(), listarMovimientos(), listarBajoMinimo(), listarSistemas(),
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

  const existenciasFiltradas = useMemo(
    () => (filtro === 'todos' ? existencias : existencias.filter((e) => e.articulo.categoria === filtro)),
    [existencias, filtro]
  );

  async function handleNuevoSistema() {
    const nombre = prompt('¿Qué sistema? (ej. Telefonía, Videoporteros)');
    if (!nombre || !nombre.trim()) return;
    try {
      await crearSistema(nombre);
      setSistemas(await listarSistemas());
      showToast('Sistema agregado', 'success');
    } catch (e: any) {
      alert('No se pudo agregar: ' + (e?.message || 'error'));
    }
  }

  async function abrirDocumento(path: string) {
    const url = await urlDeDocumento(path);
    if (url) window.open(url, '_blank');
    else alert('No se pudo abrir el archivo.');
  }

  return (
    <SupervisorShell
      active="almacen"
      title="Almacén"
      userName={userName}
      mostrarAlmacen
      wrapperClassName="max-w-2xl lg:max-w-6xl mx-auto pb-16 lg:px-6"
    >
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
              className={`min-h-[54px] px-2 rounded-2xl text-[13px] font-display font-semibold border transition-all duration-150 flex items-center justify-center gap-1.5 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] ${
                seccion === k ? 'bg-teal text-inkOnAccent border-teal shadow-glow-teal hover:brightness-110' : 'bg-surface-2 border-line-strong text-ink/80 hover:text-ink'
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
          <div className="flex flex-col gap-2.5" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-surface border border-line p-4 flex items-center gap-3">
                <div className="w-4 h-4 rounded skeleton-shimmer shrink-0" />
                <div className="h-3.5 w-2/5 rounded-full skeleton-shimmer" />
                <div className="h-3.5 w-12 rounded-full skeleton-shimmer ml-auto shrink-0" />
              </div>
            ))}
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
              <div className="flex flex-col items-center py-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3.5">
                  <EmptyIllustration variante="almacen" />
                </div>
                <p className="text-[13.5px] text-muted leading-relaxed max-w-[260px]">Todavía no hay existencias. Registra una entrada para empezar.</p>
              </div>
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
                      {e.facturaPath && (
                        <button
                          onClick={() => abrirDocumento(e.facturaPath!)}
                          className="text-[12px] text-teal flex items-center gap-1 min-h-[32px] active:scale-95 transition-transform"
                        >
                          <FileText size={13} strokeWidth={2.4} />Factura
                        </button>
                      )}
                      {e.ordenCompraPath && (
                        <button
                          onClick={() => abrirDocumento(e.ordenCompraPath!)}
                          className="text-[12px] text-teal flex items-center gap-1 min-h-[32px] active:scale-95 transition-transform"
                        >
                          <ScrollText size={13} strokeWidth={2.4} />OC
                        </button>
                      )}
                      {!e.facturaPath && !e.ordenCompraPath && <span className="text-[12px] text-muted">—</span>}
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
          <EntradaAlmacenWizard
            sistemas={sistemas}
            articulos={articulos.filter((a) => a.activo)}
            proyectos={proyectos}
            onCancelar={() => setSeccion('existencias')}
            onCatalogoActualizado={cargar}
            onRegistrada={async () => {
              setSeccion('existencias');
              await cargar();
            }}
          />
        )}

        {/* --- Movimientos --- */}
        {!loading && seccion === 'movimientos' && (
          <>
            <p className="text-[12.5px] text-muted mb-3 leading-relaxed">
              Todo lo que entró y salió. El saldo de cada artículo se calcula sumando estos renglones.
            </p>

            {movimientos.length === 0 && (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3.5">
                  <EmptyIllustration variante="lista" />
                </div>
                <p className="text-[13.5px] text-muted leading-relaxed max-w-[260px]">Todavía no hay movimientos.</p>
              </div>
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
        {!loading && seccion === 'catalogo' && (() => {
          const activos = articulos.filter((a) => a.activo);
          const dadosDeBaja = articulos.filter((a) => !a.activo);
          const mostrar = verBaja ? dadosDeBaja : activos;
          return (
            <>
              <button
                onClick={() => setShowNuevoArticulo(true)}
                className="w-full min-h-[52px] mb-3 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Plus size={18} strokeWidth={2.6} />
                Agregar artículo
              </button>

              {dadosDeBaja.length > 0 && (
                <button
                  onClick={() => setVerBaja((v) => !v)}
                  className={`w-full min-h-[42px] mb-4 rounded-xl border text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    verBaja ? 'bg-amber/12 border-amber/40 text-amber' : 'bg-surface-2 border-line text-ink/75'
                  }`}
                >
                  {verBaja ? 'Viendo dados de baja — volver al catálogo activo' : `Ver dados de baja (${dadosDeBaja.length})`}
                </button>
              )}

              {mostrar.length === 0 && (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3.5">
                    <EmptyIllustration variante="almacen" />
                  </div>
                  <p className="text-[13.5px] text-muted leading-relaxed max-w-[260px]">
                    {verBaja ? 'No hay artículos dados de baja.' : 'El catálogo está vacío.'}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2">
                {mostrar.map((a) => {
                  const Icono = ICONO[a.categoria];
                  return (
                    <div key={a.id} className={`rounded-2xl bg-surface border border-line p-4 flex items-center gap-3 ${a.activo ? '' : 'opacity-70'}`}>
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
                        {a.activo && (
                          <button
                            onClick={() => { setEditandoMinimo(a); setMinimoEdit(String(a.minimo || '')); }}
                            className="text-[12.5px] text-teal font-medium mt-1 min-h-[32px]"
                          >
                            {a.minimo > 0 ? `Mínimo: ${a.minimo} ${a.unidad}` : 'Definir mínimo'}
                          </button>
                        )}
                      </div>
                      {a.activo ? (
                        <button
                          onClick={async () => {
                            if (!confirm(`¿Quitar «${a.descripcion}» del catálogo?\n\nSe conserva en el historial de movimientos, y se puede reactivar después.`)) return;
                            await desactivarArticulo(a.id);
                            await cargar();
                          }}
                          aria-label="Quitar del catálogo"
                          className="w-10 h-10 flex items-center justify-center text-red shrink-0 active:scale-90 transition-transform"
                        >
                          <Trash2 size={16} strokeWidth={2.4} />
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            await reactivarArticulo(a.id);
                            await cargar();
                            showToast(`«${a.descripcion}» reactivado`, 'success');
                          }}
                          aria-label="Reactivar artículo"
                          className="shrink-0 min-h-[40px] px-3 rounded-xl bg-teal/12 text-teal text-[12.5px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
                        >
                          <RotateCcw size={14} strokeWidth={2.4} />
                          Reactivar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

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
        <ModalNuevoArticulo
          sistemas={sistemas}
          sistemaSugerido={null}
          descripcionSugerida=""
          onCancelar={() => setShowNuevoArticulo(false)}
          onCreado={async () => {
            setShowNuevoArticulo(false);
            await cargar();
          }}
        />
      )}
    </SupervisorShell>
  );
}
