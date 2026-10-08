'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAvanceGuardado, pausaFinal } from '@/lib/useAvanceGuardado';
import SavingOverlay from '@/components/SavingOverlay';
import { X, Search, Plus, Minus, Trash2, AlertTriangle, PackageX } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import { showToast } from '@/components/Toast';
import { coincideBusqueda } from '@/lib/busqueda';
import { hoyLocal } from '@/lib/fechaHoy';
import { CATEGORIAS, CategoriaInsumo, Articulo } from '@/lib/almacen';
import { listarMisServicios, Servicio } from '@/lib/serviciosProgramados';
import { catalogoParaPedir, crearVale, solicitarAlta } from '@/lib/vales';

// El técnico pide herramienta, material o equipo al almacén. Solo se puede
// pedir lo que existe en el inventario y con existencia; lo demás se
// reporta al almacenista para que lo dé de alta.

const inputCls = 'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px] placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const chip = (sel: boolean) =>
  `px-3 py-1.5 rounded-full text-[12.5px] font-medium mr-1.5 mb-1.5 inline-block cursor-pointer border ${sel ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 text-ink/80 border-line'}`;

type Partida = { articulo: Articulo; existencia: number; cantidad: number };

export default function NuevoVale({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [cliente, setCliente] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState<{ articulo: Articulo; existencia: number }[] | null>(null);
  const [buscar, setBuscar] = useState('');
  const [categoria, setCategoria] = useState<CategoriaInsumo | 'todas'>('todas');
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const { progreso, avance } = useAvanceGuardado();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ descripcion: string; unidad: string; sinExistencia: boolean } | null>(null);

  useEffect(() => {
    const hoy = hoyLocal();
    listarMisServicios()
      .then((l) => setServicios(l.filter((s) => s.fecha >= hoy && s.estado !== 'concluido').sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 6)))
      .catch(() => {});
  }, []);

  // Existencias: con servicio, cuenta también lo reservado a su proyecto.
  useEffect(() => {
    setCatalogo(null);
    catalogoParaPedir(servicio?.grupo_id || null).then(setCatalogo).catch(() => setCatalogo([]));
  }, [servicio?.grupo_id]);

  const resultados = useMemo(() => {
    if (!catalogo) return [];
    const q = buscar.trim();
    return catalogo
      .filter((c) => categoria === 'todas' || c.articulo.categoria === categoria)
      .filter((c) => !q || coincideBusqueda(`${c.articulo.descripcion} ${c.articulo.marca || ''} ${c.articulo.modelo || ''}`, q))
      .slice(0, q ? 30 : 12);
  }, [catalogo, buscar, categoria]);

  function agregar(c: { articulo: Articulo; existencia: number }) {
    if (c.existencia <= 0) {
      setAviso({ descripcion: c.articulo.descripcion, unidad: c.articulo.unidad, sinExistencia: true });
      return;
    }
    setPartidas((p) => (p.some((x) => x.articulo.id === c.articulo.id) ? p : [...p, { ...c, cantidad: 1 }]));
    setBuscar('');
  }

  function cambiar(id: string, cantidad: number) {
    setPartidas((p) => p.map((x) => (x.articulo.id === id ? { ...x, cantidad: Math.max(0, Math.min(cantidad, x.existencia)) } : x)));
  }

  async function enviar() {
    const nombre = servicio ? servicio.proyecto : cliente.trim();
    if (!nombre) { setError('Indica para qué cliente o servicio es.'); return; }
    const items = partidas.filter((p) => p.cantidad > 0);
    if (items.length === 0) { setError('Agrega al menos un artículo.'); return; }
    avance(5, 'Preparando el vale');
    setGuardando(true);
    setError(null);
    try {
      const r = await crearVale({
        clienteId: servicio ? servicio.cliente_id || null : clienteId,
        clienteNombre: nombre,
        servicioId: servicio?.id || null,
        nota,
        items: items.map((p) => ({ articuloId: p.articulo.id, cantidad: p.cantidad, descripcion: p.articulo.descripcion })),
      }, avance);
      avance(100, `Vale ${r.folio} enviado`);
      await pausaFinal();
      showToast(`Vale ${r.folio} enviado al almacén`, 'success');
      onCreado();
    } catch (e: any) {
      setError(e?.message || 'No se pudo enviar el vale');
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <SavingOverlay show={guardando} pct={progreso.pct} label={progreso.etapa} />
      <div className="glass-strong rounded-3xl w-full max-w-lg p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-display font-bold text-[19px] tracking-wide">Pedir al almacén</h2>
            <p className="text-[12.5px] text-muted">Se descuenta del inventario cuando el almacén te lo entregue.</p>
          </div>
          <button onClick={onClose} disabled={guardando} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted"><X size={19} /></button>
        </div>

        <label className={labelCls}>¿Para qué servicio o cliente?</label>
        {servicios.length > 0 && (
          <div className="mb-1">
            {servicios.map((s) => (
              <span key={s.id} className={chip(servicio?.id === s.id)} onClick={() => setServicio(servicio?.id === s.id ? null : s)}>
                {s.proyecto}{s.fecha !== hoyLocal() ? ` · ${s.fecha.slice(8)}/${s.fecha.slice(5, 7)}` : ''}
              </span>
            ))}
          </div>
        )}
        {!servicio && (
          <AutocompletarCliente soloSugerir value={cliente} onChange={(nm, id) => { setCliente(nm); setClienteId(id); }} className={inputCls} placeholder="Cliente (si no es un servicio de la lista)" />
        )}

        <label className={`${labelCls} mt-4`}>Artículos</label>
        {partidas.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {partidas.map((p) => (
              <div key={p.articulo.id} className="flex items-center gap-2 rounded-xl bg-surface border border-line p-2.5">
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-medium truncate">{p.articulo.descripcion}</span>
                  <span className="block text-[11.5px] text-muted">Hay {p.existencia} {p.articulo.unidad}</span>
                </span>
                <button type="button" aria-label="Menos" onClick={() => cambiar(p.articulo.id, p.cantidad - 1)} className="w-8 h-8 rounded-lg bg-surface-2 border border-line flex items-center justify-center"><Minus size={14} /></button>
                <input type="number" inputMode="decimal" value={p.cantidad} onChange={(e) => cambiar(p.articulo.id, Number(e.target.value) || 0)}
                  className="w-14 px-1.5 py-1.5 rounded-lg bg-surface-2 border border-line text-[14px] text-center" />
                <button type="button" aria-label="Más" onClick={() => cambiar(p.articulo.id, p.cantidad + 1)} className="w-8 h-8 rounded-lg bg-surface-2 border border-line flex items-center justify-center"><Plus size={14} /></button>
                <button type="button" aria-label="Quitar" onClick={() => setPartidas(partidas.filter((x) => x.articulo.id !== p.articulo.id))} className="w-8 h-8 rounded-lg text-red flex items-center justify-center"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input className={`${inputCls} pl-9`} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar: taladro, broca 3/8, disco de corte…" />
        </div>
        <div className="mt-2">
          <span className={chip(categoria === 'todas')} onClick={() => setCategoria('todas')}>Todo</span>
          {CATEGORIAS.map((c) => <span key={c.valor} className={chip(categoria === c.valor)} onClick={() => setCategoria(c.valor)}>{c.label}</span>)}
        </div>
        <div className="rounded-xl border border-line divide-y divide-line max-h-[260px] overflow-y-auto">
          {catalogo === null && <p className="text-[13px] text-muted p-3">Cargando inventario…</p>}
          {resultados.map((c) => {
            const ya = partidas.some((p) => p.articulo.id === c.articulo.id);
            return (
              <button key={c.articulo.id} type="button" disabled={ya} onClick={() => agregar(c)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left disabled:opacity-50 hover:bg-surface-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-medium truncate">{c.articulo.descripcion}</span>
                  <span className="block text-[11.5px] text-muted truncate">{[c.articulo.marca, c.articulo.modelo].filter(Boolean).join(' ') || CATEGORIAS.find((x) => x.valor === c.articulo.categoria)?.label}</span>
                </span>
                <span className={`text-[12px] font-semibold shrink-0 ${c.existencia > 0 ? 'text-teal' : 'text-red'}`}>
                  {c.existencia > 0 ? `${c.existencia} ${c.articulo.unidad}` : 'Sin existencia'}
                </span>
                {!ya && c.existencia > 0 && <Plus size={16} className="text-teal shrink-0" />}
              </button>
            );
          })}
          {catalogo && resultados.length === 0 && buscar.trim() && (
            <div className="p-3">
              <p className="text-[13px] text-red font-semibold flex items-center gap-1.5"><PackageX size={15} /> «{buscar}» no está en el inventario</p>
              <p className="text-[12.5px] text-muted mt-1">No se puede pedir algo que el almacén no tiene registrado. Comunícate con el almacenista o avísale desde aquí para que lo dé de alta.</p>
              <button type="button" onClick={() => setAviso({ descripcion: buscar.trim(), unidad: 'pza', sinExistencia: false })} className="mt-2 text-[13px] font-semibold text-teal">Avisar al almacenista</button>
            </div>
          )}
        </div>
        <button type="button" onClick={() => setAviso({ descripcion: buscar.trim(), unidad: 'pza', sinExistencia: false })} className="text-[12.5px] font-semibold text-muted underline mt-2">
          ¿No encuentras lo que buscas?
        </button>

        <label className={`${labelCls} mt-4`}>Nota (opcional)</label>
        <input className={inputCls} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. para barrenar losa en el 2.º piso" />

        {error && <p className="text-[13px] text-red font-semibold mt-3">{error}</p>}
        <button type="button" onClick={enviar} disabled={guardando}
          className="w-full mt-4 min-h-[48px] rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-50">
          {guardando ? 'Enviando…' : `Enviar vale${partidas.length ? ` (${partidas.length})` : ''}`}
        </button>

        {aviso && (
          <AvisarAlmacen
            inicial={aviso}
            contexto={servicio ? servicio.proyecto : cliente}
            onClose={() => setAviso(null)}
          />
        )}
      </div>
    </ModalOverlay>
  );
}

function AvisarAlmacen({ inicial, contexto, onClose }: {
  inicial: { descripcion: string; unidad: string; sinExistencia: boolean }; contexto: string; onClose: () => void;
}) {
  const [descripcion, setDescripcion] = useState(inicial.descripcion);
  const [cantidad, setCantidad] = useState('1');
  const [unidad, setUnidad] = useState(inicial.unidad);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function enviar() {
    if (descripcion.trim().length < 2) { setError('Escribe qué necesitas.'); return; }
    setGuardando(true);
    try {
      await solicitarAlta({
        descripcion: descripcion.trim(),
        cantidad: Number(cantidad) || 1,
        unidad,
        contexto: [contexto.trim(), inicial.sinExistencia ? 'sin existencia en almacén' : 'no está en el catálogo'].filter(Boolean).join(' · '),
      });
      showToast('Avisamos al almacenista', 'success');
      onClose();
    } catch (e: any) {
      setError(e?.message || 'No se pudo avisar');
      setGuardando(false);
    }
  }
  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-sm p-5">
        <div className="flex items-start gap-2.5 mb-3">
          <AlertTriangle size={20} className="text-amber shrink-0 mt-0.5" />
          <div>
            <h3 className="font-display font-bold text-[17px]">{inicial.sinExistencia ? 'Sin existencia en almacén' : 'No está en el inventario'}</h3>
            <p className="text-[12.5px] text-muted">No se puede agregar al vale. Comunícate con el almacenista; también le llega este aviso para que lo registre si lo tiene.</p>
          </div>
        </div>
        <label className={labelCls}>Qué necesitas</label>
        <input className={`${inputCls} mb-2`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelCls}>Cantidad</label><input type="number" inputMode="decimal" className={inputCls} value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></div>
          <div><label className={labelCls}>Unidad</label><input className={inputCls} value={unidad} onChange={(e) => setUnidad(e.target.value)} /></div>
        </div>
        {error && <p className="text-[13px] text-red font-semibold mt-2">{error}</p>}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-line text-[13.5px] font-semibold">Cerrar</button>
          <button type="button" onClick={enviar} disabled={guardando} className="min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold disabled:opacity-50">{guardando ? 'Enviando…' : 'Avisar al almacenista'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
