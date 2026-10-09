'use client';

import TablaLista from '@/components/TablaLista';
import { VistaCondicional } from '@/lib/vistaSupervisor';
import EstadoVacio from '@/components/EstadoVacio';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, AlertTriangle, PackageX, ClipboardList, Archive, ChevronDown, Search, X, ChevronRight } from 'lucide-react';
import { showToast } from '@/components/Toast';
import NuevoVale from './NuevoVale';
import ValeDetalle from './ValeDetalle';
import PrestamosParaMi from './PrestamosParaMi';
import {
  Vale, AltaSolicitada, ETIQUETA_ESTADO, valeVencido, listarVales, listarAltasPendientes, resolverAlta,
} from '@/lib/vales';

// Vales de almacén: la lista del técnico (los suyos + «Pedir al almacén») y
// la bandeja del almacenista (todos, con lo que requiere su acción arriba y
// lo que los técnicos pidieron que no está en inventario).

function fecha(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function Tarjeta({ v, onAbrir, verTecnico }: { v: Vale; onAbrir: () => void; verTecnico?: boolean }) {
  const est = ETIQUETA_ESTADO[v.estado];
  const vencido = valeVencido(v);
  return (
    <button type="button" onClick={onAbrir}
      className={`w-full text-left rounded-2xl bg-surface border p-3.5 active:scale-[0.99] transition-transform ${vencido ? 'border-red/40' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="text-[11.5px] font-mono font-semibold text-teal">{v.folio}</span>
          <span className="block text-[14.5px] font-semibold leading-tight truncate">{v.cliente_nombre}</span>
        </span>
        <span className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${est.cls}`}>{est.label}</span>
      </div>
      <p className="text-[12.5px] text-muted mt-1 truncate">
        {verTecnico ? `${v.tecnico} · ` : ''}{v.items.length} artículo(s): {v.items.slice(0, 2).map((i) => i.articulo?.descripcion).join(', ')}{v.items.length > 2 ? '…' : ''}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11.5px] font-semibold">
        {vencido && <span className="px-2 py-0.5 rounded-full bg-red/12 text-red flex items-center gap-1"><AlertTriangle size={11} /> Vencido desde {fecha(v.fecha_limite)}</span>}
        {v.extension_estado === 'pendiente' && <span className="px-2 py-0.5 rounded-full bg-amber/15 text-amber">Pide más días</span>}
        <span className="text-faint font-normal">{fecha(v.created_at)}</span>
      </div>
    </button>
  );
}

type Grupo = { titulo: string; vales: Vale[] };

export default function Vales({ modo }: { modo: 'tecnico' | 'almacen' }) {
  const [vales, setVales] = useState<Vale[] | null>(null);
  const [altas, setAltas] = useState<AltaSolicitada[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [verCerrados, setVerCerrados] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [v, a] = await Promise.all([
        listarVales({ soloMios: modo === 'tecnico' }),
        modo === 'almacen' ? listarAltasPendientes() : Promise.resolve([] as AltaSolicitada[]),
      ]);
      setVales(v);
      setAltas(a);
      setError(null);
    } catch (e: any) {
      setError(e?.message?.includes('almacen_vales') ? 'Falta correr el SQL de vales en Supabase.' : 'No se pudieron cargar los vales.');
      setVales([]);
    }
  }, [modo]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60000);
    const alVolver = () => document.visibilityState === 'visible' && cargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [cargar]);

  const grupos: Grupo[] = useMemo(() => {
    const l = vales || [];
    const activos = (estados: Vale['estado'][]) => l.filter((v) => estados.includes(v.estado));
    if (modo === 'almacen') {
      return [
        { titulo: 'Por entregar', vales: activos(['solicitado']) },
        { titulo: 'Devoluciones por confirmar', vales: activos(['devolucion_por_confirmar']) },
        { titulo: 'Piden más días', vales: l.filter((v) => v.extension_estado === 'pendiente' && (v.estado === 'en_uso' || v.estado === 'por_firmar')) },
        { titulo: 'Fuera del almacén', vales: activos(['por_firmar', 'en_uso']).sort((a, b) => Number(valeVencido(b)) - Number(valeVencido(a))) },
      ];
    }
    return [
      { titulo: 'Por firmar de recibido', vales: activos(['por_firmar']) },
      { titulo: 'En tu resguardo', vales: activos(['en_uso']).sort((a, b) => Number(valeVencido(b)) - Number(valeVencido(a))) },
      { titulo: 'Esperando al almacén', vales: activos(['solicitado', 'devolucion_por_confirmar']) },
    ];
  }, [vales, modo]);

  const cerrados = (vales || []).filter((v) => ['cerrado', 'rechazado', 'cancelado'].includes(v.estado));
  const valeAbierto = (vales || []).find((v) => v.id === abierto) || null;
  const vencidos = (vales || []).filter((v) => valeVencido(v)).length;

  async function atenderAlta(a: AltaSolicitada, estado: 'atendida' | 'descartada') {
    try {
      await resolverAlta(a.id, estado, null, '');
      showToast(estado === 'atendida' ? 'Marcada como atendida' : 'Descartada', 'success');
      cargar();
    } catch (e: any) {
      showToast(e?.message || 'No se pudo', 'error');
    }
  }

  return (
    <div>
      {modo === 'tecnico' && (
        <button type="button" onClick={() => setNuevo(true)}
          className="w-full lg:w-auto lg:px-7 min-h-[50px] lg:min-h-[46px] mb-5 rounded-2xl bg-teal text-inkOnAccent font-semibold text-[15px] lg:text-[14.5px] shadow-glow-teal flex items-center justify-center gap-2 transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]">
          <Plus size={19} strokeWidth={2.6} /> Pedir al almacén
        </button>
      )}

      {modo === 'tecnico' && <PrestamosParaMi onCambio={cargar} />}

      {vencidos > 0 && (
        <div className="rounded-2xl px-4 py-2.5 mb-3 bg-red/10 border border-red/30 text-[13px] text-red font-semibold flex items-center gap-2">
          <AlertTriangle size={16} /> {vencidos} vale(s) con plazo vencido{modo === 'tecnico' ? ': devuélvelos o pide más días' : ''}.
        </div>
      )}

      {modo === 'almacen' && altas.length > 0 && (
        <div className="rounded-2xl border border-amber/40 bg-amber/5 p-3.5 mb-4">
          <p className="text-[13px] font-semibold text-amber flex items-center gap-1.5 mb-2"><PackageX size={15} /> Piden cosas que no están en inventario ({altas.length})</p>
          <p className="text-[12px] text-muted mb-2">Si las tienes, dalas de alta en «Catálogo» y registra su entrada; después márcalas como atendidas.</p>
          <div className="flex flex-col gap-2">
            {altas.map((a) => (
              <div key={a.id} className="rounded-xl bg-surface border border-line px-3 py-2.5">
                <p className="text-[13.5px] font-semibold">{a.cantidad} {a.unidad} · {a.descripcion}</p>
                <p className="text-[12px] text-muted">{a.tecnico}{a.contexto ? ` · ${a.contexto}` : ''} · {fecha(a.created_at)}</p>
                <div className="flex gap-4 mt-1.5 text-[12.5px] font-semibold">
                  <button type="button" onClick={() => atenderAlta(a, 'atendida')} className="text-teal">Ya lo registré</button>
                  <button type="button" onClick={() => atenderAlta(a, 'descartada')} className="text-muted">No lo tenemos</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-[13px] text-red font-semibold mb-3">{error}</p>}
      {vales === null && <p className="text-[13px] text-muted py-6 text-center">Cargando vales…</p>}

      {grupos.filter((g) => g.vales.length > 0).map((g) => (
        <div key={g.titulo} className="mb-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2">{g.titulo} ({g.vales.length})</p>
          <VistaCondicional
          tabla={
            <TablaLista<Vale>
              filas={g.vales}
              keyFn={(v) => `${g.titulo}-${v.id}`}
              onDetalle={(v) => setAbierto(v.id)}
              columnas={[
                { header: 'Folio', render: (v) => <span className="font-mono text-teal">{v.folio}</span> },
                { header: 'Cliente', render: (v) => <span className="font-semibold">{v.cliente_nombre}</span> },
                ...(modo === 'almacen' ? [{ header: 'Solicita', render: (v: Vale) => v.tecnico || '—' }] : []),
                { header: 'Artículos', render: (v) => <span className="text-muted">{v.items.length}: {v.items.slice(0, 2).map((i) => i.articulo?.descripcion).join(', ')}{v.items.length > 2 ? '…' : ''}</span> },
                {
                  header: 'Estado',
                  render: (v) => (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ETIQUETA_ESTADO[v.estado].cls}`}>{ETIQUETA_ESTADO[v.estado].label}</span>
                      {valeVencido(v) && <span className="text-[11.5px] font-semibold text-red whitespace-nowrap">Vencido</span>}
                      {v.extension_estado === 'pendiente' && <span className="text-[11.5px] font-semibold text-amber whitespace-nowrap">Pide más días</span>}
                    </span>
                  ),
                },
                { header: 'Fecha', render: (v) => <span className="tabular-nums whitespace-nowrap">{fecha(v.created_at)}</span> },
              ]}
            />
          }
          tarjetas={
<div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-2.5">
            {g.vales.map((v) => <Tarjeta key={`${g.titulo}-${v.id}`} v={v} verTecnico={modo === 'almacen'} onAbrir={() => setAbierto(v.id)} />)}
          </div>
          }
        />
        </div>
      ))}

      {vales && grupos.every((g) => g.vales.length === 0) && (
        <EstadoVacio
          icono={<ClipboardList size={24} strokeWidth={1.8} />}
          titulo={modo === 'tecnico' ? 'No tienes vales abiertos' : 'No hay vales pendientes'}
          detalle={modo === 'tecnico' ? 'Usa «Pedir al almacén» cuando necesites material o herramienta.' : 'Aquí aparecen los vales que pide el personal para surtir.'}
        />
      )}

      {cerrados.length > 0 && (
        <HistorialVales
          vales={cerrados}
          abierto={verCerrados}
          onAlternar={() => setVerCerrados(!verCerrados)}
          verTecnico={modo === 'almacen'}
          onAbrir={(id) => setAbierto(id)}
        />
      )}

      {nuevo && <NuevoVale onClose={() => setNuevo(false)} onCreado={() => { setNuevo(false); cargar(); }} />}
      {valeAbierto && (
        <ValeDetalle vale={valeAbierto} modo={modo} onClose={() => setAbierto(null)} onCambio={() => { cargar(); }} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Historial: vales cerrados, rechazados y cancelados
// ------------------------------------------------------------------

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
type FiltroHist = 'todos' | 'cerrado' | 'rechazado' | 'cancelado';

// Fecha con la que el vale terminó (recibido por el almacén) o, si no, cuando se pidió.
const fechaFin = (v: Vale) => v.recibido_en || v.created_at;

// Etiquetas del historial con más contraste que las de la bandeja.
const ESTADO_HIST: Record<string, { label: string; cls: string }> = {
  cerrado: { label: '✓ Cerrado', cls: 'bg-teal/12 text-teal ring-1 ring-teal/25' },
  rechazado: { label: 'Rechazado', cls: 'bg-red/12 text-red ring-1 ring-red/25' },
  cancelado: { label: 'Cancelado', cls: 'bg-surface-2 text-ink/60 ring-1 ring-line-strong' },
};

function HistorialVales({
  vales, abierto, onAlternar, verTecnico, onAbrir,
}: {
  vales: Vale[];
  abierto: boolean;
  onAlternar: () => void;
  verTecnico: boolean;
  onAbrir: (id: string) => void;
}) {
  const [filtro, setFiltro] = useState<FiltroHist>('todos');
  const [q, setQ] = useState('');
  const [limite, setLimite] = useState(20);

  const cuenta = (e: FiltroHist) => (e === 'todos' ? vales.length : vales.filter((v) => v.estado === e).length);
  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nq = norm(q.trim());

  const lista = useMemo(() => vales
    .filter((v) => filtro === 'todos' || v.estado === filtro)
    .filter((v) => !nq || norm(`${v.folio} ${v.cliente_nombre} ${v.tecnico || ''} ${v.items.map((i) => i.articulo?.descripcion || '').join(' ')}`).includes(nq))
    .sort((a, b) => fechaFin(b).localeCompare(fechaFin(a))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [vales, filtro, nq]);

  // Agrupado por mes de cierre.
  const meses = useMemo(() => {
    const out: { clave: string; titulo: string; vales: Vale[] }[] = [];
    for (const v of lista.slice(0, limite)) {
      const d = new Date(fechaFin(v));
      const clave = `${d.getFullYear()}-${d.getMonth()}`;
      let g = out.find((x) => x.clave === clave);
      if (!g) { g = { clave, titulo: `${MESES_LARGOS[d.getMonth()]} ${d.getFullYear()}`, vales: [] }; out.push(g); }
      g.vales.push(v);
    }
    return out;
  }, [lista, limite]);

  const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

  return (
    <section className="mt-6 rounded-2xl bg-surface border border-line overflow-hidden">
      <button type="button" onClick={onAlternar} aria-expanded={abierto}
        className="w-full flex items-center gap-3.5 px-4 py-4 text-left hover:bg-surface-2/50 transition-colors">
        <span className="w-11 h-11 rounded-xl bg-teal/12 text-teal flex items-center justify-center shrink-0">
          <Archive size={20} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-semibold text-[16px]">Historial de vales</span>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted mt-0.5">
            <span><b className="text-ink font-semibold">{cuenta('cerrado')}</b> cerrados</span>
            {cuenta('rechazado') > 0 && <span><b className="text-red font-semibold">{cuenta('rechazado')}</b> rechazados</span>}
            {cuenta('cancelado') > 0 && <span><b className="text-ink/70 font-semibold">{cuenta('cancelado')}</b> cancelados</span>}
          </span>
        </span>
        <span className="shrink-0 h-9 px-3.5 rounded-full bg-surface-2 border border-line text-[13px] font-semibold flex items-center gap-1.5">
          {abierto ? 'Ocultar' : 'Ver historial'}
          <ChevronDown size={15} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {abierto && (
        <div className="border-t border-line px-4 pt-3 pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 mb-3">
            <div className="relative lg:w-[300px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setLimite(20); }} placeholder="Folio, cliente, persona o artículo"
                className="w-full h-10 pl-10 pr-9 rounded-full bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px] placeholder:text-muted" />
              {q && <button type="button" onClick={() => setQ('')} aria-label="Limpiar" className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-muted"><X size={14} /></button>}
            </div>
            <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {(['todos', 'cerrado', 'rechazado', 'cancelado'] as FiltroHist[]).filter((k) => k === 'todos' || cuenta(k) > 0).map((k) => (
                <button key={k} type="button" onClick={() => { setFiltro(k); setLimite(20); }}
                  className={`shrink-0 h-8 px-3 rounded-full text-[12.5px] font-semibold border transition-colors ${filtro === k ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line text-ink/75'}`}>
                  {k === 'todos' ? 'Todos' : ETIQUETA_ESTADO[k].label + 's'} {cuenta(k)}
                </button>
              ))}
            </div>
          </div>

          {lista.length === 0 && <p className="text-[13.5px] text-muted text-center py-8">Nada coincide.</p>}

          {lista.length > 0 && (
          <VistaCondicional
            tabla={
              <TablaLista<Vale>
                filas={lista.slice(0, limite)}
                keyFn={(v) => v.id}
                onDetalle={(v) => onAbrir(v.id)}
                columnas={[
                  { header: 'Folio', render: (v) => <span className="font-mono text-teal">{v.folio}</span> },
                  { header: 'Cliente', render: (v) => <span className="font-semibold">{v.cliente_nombre}</span> },
                  ...(verTecnico ? [{ header: 'Solicitó', render: (v: Vale) => v.tecnico || '—' }] : []),
                  { header: 'Artículos', render: (v) => <span className="text-muted">{v.items.slice(0, 2).map((i) => i.articulo?.descripcion).join(', ')}{v.items.length > 2 ? ` +${v.items.length - 2}` : ''}</span> },
                  { header: 'Piezas', render: (v) => <span className="tabular-nums">{v.items.reduce((n, i) => n + Number(i.cantidad_entregada ?? i.cantidad_solicitada ?? 0), 0)}</span> },
                  { header: 'Cierre', render: (v) => <span className="tabular-nums whitespace-nowrap">{new Date(fechaFin(v)).toLocaleDateString('es-MX')}</span> },
                  {
                    header: 'Estado',
                    render: (v) => {
                      const est = ESTADO_HIST[v.estado] || ETIQUETA_ESTADO[v.estado];
                      return <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${est.cls}`}>{est.label}</span>;
                    },
                  },
                ]}
              />
            }
            tarjetas={<>
          {meses.map((m) => (
            <div key={m.clave} className="mb-3 last:mb-0">
              <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted mb-1.5 capitalize">{m.titulo} · {m.vales.length}</p>
              <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
                {m.vales.map((v) => {
                  const est = ESTADO_HIST[v.estado] || ETIQUETA_ESTADO[v.estado];
                  const piezas = v.items.reduce((n, i) => n + Number(i.cantidad_entregada ?? i.cantidad_solicitada ?? 0), 0);
                  return (
                    <button key={v.id} type="button" onClick={() => onAbrir(v.id)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-surface-2/60 transition-colors grid grid-cols-[1fr_auto] lg:grid-cols-[80px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_90px_120px_16px] gap-x-4 gap-y-0.5 items-center">
                      <span className="text-[12px] font-mono font-semibold text-teal lg:order-none">{v.folio}</span>
                      <span className={`lg:hidden text-[11px] font-semibold px-2 py-0.5 rounded-full justify-self-end ${est.cls}`}>{est.label}</span>
                      <span className="text-[14px] font-semibold truncate col-span-2 lg:col-span-1">{v.cliente_nombre}</span>
                      <span className="text-[12.5px] text-muted truncate col-span-2 lg:col-span-1">{verTecnico ? v.tecnico : `${v.items.length} artículo(s)`}</span>
                      <span className="hidden lg:block text-[12.5px] text-ink/75 truncate">{v.items.slice(0, 2).map((i) => i.articulo?.descripcion).join(', ')}{v.items.length > 2 ? ` +${v.items.length - 2}` : ''}</span>
                      <span className="hidden lg:block text-[12.5px] text-muted tabular-nums">{piezas} pza · {fechaCorta(fechaFin(v))}</span>
                      <span className="hidden lg:block"><span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${est.cls}`}>{est.label}</span></span>
                      <ChevronRight size={15} className="hidden lg:block text-faint" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
            </>}
          />
          )}

          {lista.length > limite && (
            <button type="button" onClick={() => setLimite((l) => l + 20)}
              className="w-full mt-2 min-h-[40px] rounded-xl border border-line text-[13px] font-semibold text-teal hover:bg-surface-2">
              Ver 20 más ({lista.length - limite} restantes)
            </button>
          )}
        </div>
      )}
    </section>
  );
}
