'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, FileText, Camera, Images, Clock, AlertTriangle, Check } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import { showToast } from '@/components/Toast';
import { mapaDeExistencias } from '@/lib/almacen';
import { createClient } from '@/lib/supabaseClient';
import {
  Vale, ETIQUETA_ESTADO, MOTIVOS_FALTANTE, valeVencido,
  firmarVale, devolverVale, subirFotoDevolucion, pedirMasDias, cancelarVale,
  entregarVale, recibirDevolucion, resolverMasDias, urlsFotos,
} from '@/lib/vales';

// Detalle de un vale de almacén, el mismo para el técnico y para el
// almacenista: cambian las acciones según quién lo abre y en qué paso va.

const inputCls = 'w-full px-3 py-2 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14px] placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';

function fecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}
const n = (x: number | null) => (x === null || x === undefined ? '—' : String(Number(x)));

export default function ValeDetalle({
  vale, modo, onClose, onCambio,
}: {
  vale: Vale;
  modo: 'tecnico' | 'almacen';
  onClose: () => void;
  onCambio: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const est = ETIQUETA_ESTADO[vale.estado];
  const vencido = valeVencido(vale);

  async function ejecutar(fn: () => Promise<void>, ok: string) {
    setGuardando(true);
    setError(null);
    try {
      await fn();
      showToast(ok, 'success');
      onCambio();
    } catch (e: any) {
      setError(e?.message || 'No se pudo completar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onClose()}>
      <div className="glass-strong rounded-3xl w-full max-w-lg p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-mono font-semibold text-teal">{vale.folio}</p>
            <h2 className="font-display font-bold text-[19px] leading-tight">{vale.cliente_nombre}</h2>
            <p className="text-[12.5px] text-muted">{vale.tecnico} · pedido {fecha(vale.created_at)}</p>
          </div>
          <button onClick={onClose} disabled={guardando} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 flex items-center justify-center text-muted shrink-0"><X size={19} /></button>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2 text-[12px] font-semibold">
          <span className={`px-2.5 py-0.5 rounded-full ${est.cls}`}>{est.label}</span>
          {vencido && <span className="px-2.5 py-0.5 rounded-full bg-red/12 text-red flex items-center gap-1"><AlertTriangle size={12} /> Plazo vencido</span>}
          {vale.fecha_limite && (vale.estado === 'en_uso' || vale.estado === 'por_firmar') && (
            <span className="px-2.5 py-0.5 rounded-full bg-surface-2 text-muted flex items-center gap-1"><Clock size={12} /> Devolver antes del {fecha(vale.fecha_limite)}</span>
          )}
          {vale.extension_estado === 'pendiente' && <span className="px-2.5 py-0.5 rounded-full bg-amber/15 text-amber">Pide {vale.extension_dias} día(s) más</span>}
        </div>

        {vale.nota && <p className="text-[13px] mt-2"><span className="text-muted">Nota: </span>{vale.nota}</p>}
        {vale.motivo_rechazo && <p className="text-[13px] mt-2 text-red">Motivo: {vale.motivo_rechazo}</p>}

        {/* Partidas */}
        <div className="mt-3 rounded-xl border border-line overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-2 text-[10.5px] uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left px-2.5 py-1.5">Artículo</th>
                <th className="px-1.5 py-1.5">Pedido</th>
                <th className="px-1.5 py-1.5">Entregado</th>
                <th className="px-1.5 py-1.5">Devuelto</th>
              </tr>
            </thead>
            <tbody>
              {vale.items.map((it) => (
                <tr key={it.id} className="border-t border-line align-top">
                  <td className="px-2.5 py-1.5">
                    <span className="font-medium">{it.articulo?.descripcion}</span>
                    <span className="block text-[11px] text-muted">{[it.articulo?.marca, it.articulo?.modelo].filter(Boolean).join(' ')} {it.articulo?.unidad}</span>
                    {it.motivo_faltante && <span className="block text-[11px] text-red">{MOTIVOS_FALTANTE.find((m) => m.valor === it.motivo_faltante)?.label}{it.nota ? ` · ${it.nota}` : ''}</span>}
                  </td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums">{n(it.cantidad_solicitada)}</td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums">{n(it.cantidad_entregada)}</td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums">{n(it.cantidad_devuelta)}{it.cantidad_recibida != null && it.cantidad_recibida !== it.cantidad_devuelta ? ` (recibió ${n(it.cantidad_recibida)})` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {vale.fotos_devolucion?.length > 0 && <FotosDevolucion paths={vale.fotos_devolucion} />}

        {error && <p className="text-[13px] text-red font-semibold mt-3">{error}</p>}

        {/* Acciones */}
        <div className="mt-4 flex flex-col gap-3">
          {modo === 'tecnico' && vale.estado === 'solicitado' && (
            <button type="button" disabled={guardando} onClick={() => ejecutar(() => cancelarVale(vale, ''), 'Vale cancelado')}
              className="min-h-[44px] rounded-xl border border-line text-[13.5px] font-semibold text-red">Cancelar vale</button>
          )}
          {modo === 'tecnico' && vale.estado === 'por_firmar' && <FirmarRecibido vale={vale} guardando={guardando} ejecutar={ejecutar} />}
          {modo === 'tecnico' && (vale.estado === 'en_uso' || vale.estado === 'por_firmar') && (
            <>
              <Devolver vale={vale} guardando={guardando} ejecutar={ejecutar} />
              {vale.extension_estado !== 'pendiente' && <MasDias vale={vale} guardando={guardando} ejecutar={ejecutar} />}
            </>
          )}
          {modo === 'almacen' && vale.estado === 'solicitado' && <Entregar vale={vale} guardando={guardando} ejecutar={ejecutar} />}
          {modo === 'almacen' && vale.estado === 'devolucion_por_confirmar' && <Recibir vale={vale} guardando={guardando} ejecutar={ejecutar} />}
          {modo === 'almacen' && vale.extension_estado === 'pendiente' && (
            <div className="rounded-xl border border-amber/40 bg-amber/5 p-3">
              <p className="text-[13px]"><b>Pide {vale.extension_dias} día(s) más:</b> {vale.extension_motivo}</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button type="button" disabled={guardando} onClick={() => ejecutar(() => resolverMasDias(vale, true), 'Plazo ampliado')} className="min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold">Aprobar</button>
                <button type="button" disabled={guardando} onClick={() => ejecutar(() => resolverMasDias(vale, false), 'Plazo rechazado')} className="min-h-[42px] rounded-xl border border-line text-[13px] font-semibold">Rechazar</button>
              </div>
            </div>
          )}
          {vale.estado !== 'solicitado' && vale.estado !== 'cancelado' && (
            <a href={`/api/vales/${vale.id}/pdf`} target="_blank" rel="noopener noreferrer"
              className="min-h-[42px] rounded-xl bg-surface-2 border border-line text-[13.5px] font-semibold flex items-center justify-center gap-2">
              <FileText size={16} /> Ver vale en PDF
            </a>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}

type Ejecutar = (fn: () => Promise<void>, ok: string) => void;

function FotosDevolucion({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => { urlsFotos(paths).then(setUrls).catch(() => {}); }, [paths]);
  return (
    <div className="mt-3">
      <p className={labelCls}>Fotos de la devolución</p>
      <div className="grid grid-cols-3 gap-2">
        {urls.map((u, i) => u && (
          <a key={i} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={`Devolución ${i + 1}`} className="w-full h-24 object-cover rounded-lg border border-line" /></a>
        ))}
      </div>
    </div>
  );
}

function FirmarRecibido({ vale, guardando, ejecutar }: { vale: Vale; guardando: boolean; ejecutar: Ejecutar }) {
  const ref = useRef<SignaturePadHandle>(null);
  const [firma, setFirma] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-teal/40 bg-teal/5 p-3">
      <p className="text-[13px] mb-2">Revisa que te entregaron lo de la columna <b>Entregado</b> y firma de recibido.</p>
      <div className="rounded-xl overflow-hidden border border-line">
        <SignaturePad ref={ref} titulo="Firma de recibido" onCambio={setFirma} />
      </div>
      <button type="button" disabled={guardando || !firma}
        onClick={() => ejecutar(() => firmarVale(vale, firma!), 'Recibido firmado')}
        className="w-full mt-2 min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold disabled:opacity-50">
        Firmar de recibido
      </button>
    </div>
  );
}

function Devolver({ vale, guardando, ejecutar }: { vale: Vale; guardando: boolean; ejecutar: Ejecutar }) {
  const [abierto, setAbierto] = useState(false);
  const entregados = vale.items.filter((i) => (i.cantidad_entregada || 0) > 0);
  const [cant, setCant] = useState<Record<string, string>>(() => Object.fromEntries(entregados.map((i) => [i.id, String(i.cantidad_entregada)])));
  const [motivo, setMotivo] = useState<Record<string, string>>({});
  const [nota, setNota] = useState<Record<string, string>>({});
  const [notaGral, setNotaGral] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="min-h-[46px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold">
        Devolver al almacén
      </button>
    );
  }

  async function enviar() {
    if (fotos.length === 0) throw new Error('Agrega al menos una foto de lo que entregas');
    const items = entregados.map((i) => {
      const c = Math.max(0, Math.min(Number(cant[i.id]) || 0, Number(i.cantidad_entregada)));
      const falta = c < Number(i.cantidad_entregada);
      return { id: i.id, cantidad: c, motivo: falta ? (motivo[i.id] || (i.articulo?.categoria === 'material' ? 'consumido' : null)) : null, nota: nota[i.id] || '' };
    });
    const sinMotivo = items.find((x) => x.motivo === null && x.cantidad < Number(entregados.find((e) => e.id === x.id)!.cantidad_entregada));
    if (sinMotivo) throw new Error('Indica qué pasó con lo que no regresa');
    const paths: string[] = [];
    for (const f of fotos) paths.push(await subirFotoDevolucion(vale.id, f));
    await devolverVale(vale, items, paths, notaGral);
  }

  return (
    <div className="rounded-xl border border-teal/40 bg-teal/5 p-3 flex flex-col gap-3">
      <p className="text-[13px] font-semibold">¿Qué regresas?</p>
      {entregados.map((i) => {
        const c = Number(cant[i.id]) || 0;
        const falta = c < Number(i.cantidad_entregada);
        return (
          <div key={i.id} className="rounded-lg bg-surface border border-line p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium min-w-0 truncate">{i.articulo?.descripcion}</span>
              <span className="flex items-center gap-1.5 shrink-0 text-[12px] text-muted">
                <input type="number" inputMode="decimal" min={0} max={Number(i.cantidad_entregada)} value={cant[i.id] ?? ''}
                  onChange={(e) => setCant({ ...cant, [i.id]: e.target.value })}
                  className="w-16 px-2 py-1.5 rounded-lg bg-surface-2 border border-line text-[14px] text-center" />
                de {n(i.cantidad_entregada)} {i.articulo?.unidad}
              </span>
            </div>
            {falta && (
              <div className="mt-2 flex flex-col gap-1.5">
                <select className={inputCls} value={motivo[i.id] || (i.articulo?.categoria === 'material' ? 'consumido' : '')} onChange={(e) => setMotivo({ ...motivo, [i.id]: e.target.value })}>
                  <option value="">¿Qué pasó con lo que no regresa?</option>
                  {MOTIVOS_FALTANTE.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
                </select>
                <input className={inputCls} placeholder="Detalle (opcional)" value={nota[i.id] || ''} onChange={(e) => setNota({ ...nota, [i.id]: e.target.value })} />
              </div>
            )}
          </div>
        );
      })}
      <div>
        <p className={labelCls}>Foto de evidencia (obligatoria)</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => camara.current?.click()} className="flex-1 min-h-[42px] rounded-xl bg-surface-2 border border-line text-[13px] font-semibold flex items-center justify-center gap-1.5"><Camera size={15} /> Tomar foto</button>
          <button type="button" onClick={() => galeria.current?.click()} className="flex-1 min-h-[42px] rounded-xl bg-surface-2 border border-line text-[13px] font-semibold flex items-center justify-center gap-1.5"><Images size={15} /> Galería</button>
        </div>
        <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { setFotos([...fotos, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
        <input ref={galeria} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { setFotos([...fotos, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
        {fotos.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-2">
            {previews.map((p, k) => (
              <div key={k} className="relative">
                <img src={p} alt="" className="w-full h-16 object-cover rounded-lg border border-line" />
                <button type="button" aria-label="Quitar foto" onClick={() => setFotos(fotos.filter((_, j) => j !== k))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red text-white flex items-center justify-center"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      <input className={inputCls} placeholder="Nota para el almacén (opcional)" value={notaGral} onChange={(e) => setNotaGral(e.target.value)} />
      <button type="button" disabled={guardando || fotos.length === 0} onClick={() => ejecutar(enviar, 'Devolución enviada al almacén')}
        className="min-h-[46px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold disabled:opacity-50">
        {guardando ? 'Enviando…' : 'Enviar devolución'}
      </button>
    </div>
  );
}

function MasDias({ vale, guardando, ejecutar }: { vale: Vale; guardando: boolean; ejecutar: Ejecutar }) {
  const [abierto, setAbierto] = useState(false);
  const [dias, setDias] = useState(3);
  const [motivo, setMotivo] = useState('');
  if (!abierto) {
    return <button type="button" onClick={() => setAbierto(true)} className="text-[13px] font-semibold text-teal py-1 flex items-center gap-1.5 self-start"><Clock size={14} /> Necesito más días</button>;
  }
  return (
    <div className="rounded-xl border border-line p-3">
      <p className={labelCls}>¿Cuántos días más?</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {[1, 2, 3, 5, 7, 15].map((d) => (
          <button key={d} type="button" onClick={() => setDias(d)} className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border ${dias === d ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line'}`}>{d}</button>
        ))}
      </div>
      <input className={inputCls} placeholder="¿Para qué lo necesitas? (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <button type="button" disabled={guardando || !motivo.trim()} onClick={() => ejecutar(() => pedirMasDias(vale, dias, motivo), 'Se pidió al almacén')}
        className="w-full mt-2 min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold disabled:opacity-50">Pedir {dias} día(s) más</button>
    </div>
  );
}

function Entregar({ vale, guardando, ejecutar }: { vale: Vale; guardando: boolean; ejecutar: Ejecutar }) {
  const [cant, setCant] = useState<Record<string, string>>(() => Object.fromEntries(vale.items.map((i) => [i.id, String(i.cantidad_solicitada)])));
  const [hay, setHay] = useState<Record<string, number>>({});
  const [nota, setNota] = useState('');
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  useEffect(() => {
    (async () => {
      let grupo: string | null = null;
      if (vale.servicio_id) {
        const { data } = await createClient().from('servicios_programados').select('grupo_id').eq('id', vale.servicio_id).maybeSingle();
        grupo = data?.grupo_id || null;
      }
      setHay(await mapaDeExistencias(grupo));
    })().catch(() => {});
  }, [vale.servicio_id]);

  return (
    <div className="rounded-xl border border-teal/40 bg-teal/5 p-3 flex flex-col gap-2.5">
      <p className="text-[13px] font-semibold">Entregar</p>
      {vale.items.map((i) => {
        const disp = Math.max(0, hay[i.articulo_id] ?? 0);
        const c = Number(cant[i.id]) || 0;
        return (
          <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface border border-line p-2.5">
            <span className="min-w-0">
              <span className="block text-[13px] font-medium truncate">{i.articulo?.descripcion}</span>
              <span className={`block text-[11.5px] ${c > disp ? 'text-red font-semibold' : 'text-muted'}`}>Hay {disp} {i.articulo?.unidad} · pidió {n(i.cantidad_solicitada)}</span>
            </span>
            <input type="number" inputMode="decimal" min={0} value={cant[i.id] ?? ''} onChange={(e) => setCant({ ...cant, [i.id]: e.target.value })}
              className="w-16 px-2 py-1.5 rounded-lg bg-surface-2 border border-line text-[14px] text-center shrink-0" />
          </div>
        );
      })}
      <input className={inputCls} placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
      <button type="button" disabled={guardando}
        onClick={() => ejecutar(() => entregarVale(vale, vale.items.map((i) => ({ id: i.id, cantidad: Number(cant[i.id]) || 0 })), nota), 'Entregado; el técnico debe firmar')}
        className="min-h-[46px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
        <Check size={16} /> Entregar y descontar del inventario
      </button>
      {!rechazando ? (
        <button type="button" onClick={() => setRechazando(true)} className="text-[13px] font-semibold text-red self-start py-1">Rechazar vale</button>
      ) : (
        <div className="flex gap-2">
          <input className={inputCls} placeholder="¿Por qué se rechaza?" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <button type="button" disabled={guardando || !motivo.trim()} onClick={() => ejecutar(() => cancelarVale(vale, motivo, true), 'Vale rechazado')}
            className="shrink-0 px-3 rounded-xl bg-red text-white text-[13px] font-semibold disabled:opacity-50">Rechazar</button>
        </div>
      )}
    </div>
  );
}

function Recibir({ vale, guardando, ejecutar }: { vale: Vale; guardando: boolean; ejecutar: Ejecutar }) {
  const devueltos = vale.items.filter((i) => (i.cantidad_entregada || 0) > 0);
  const [cant, setCant] = useState<Record<string, string>>(() => Object.fromEntries(devueltos.map((i) => [i.id, String(i.cantidad_devuelta ?? 0)])));
  const [nota, setNota] = useState('');
  return (
    <div className="rounded-xl border border-teal/40 bg-teal/5 p-3 flex flex-col gap-2.5">
      <p className="text-[13px] font-semibold">Confirmar lo que recibiste</p>
      <p className="text-[12px] text-muted">Revisa las fotos y cuenta lo que regresó. Lo recibido vuelve al inventario.</p>
      {devueltos.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface border border-line p-2.5">
          <span className="min-w-0">
            <span className="block text-[13px] font-medium truncate">{i.articulo?.descripcion}</span>
            <span className="block text-[11.5px] text-muted">Devolvió {n(i.cantidad_devuelta)} de {n(i.cantidad_entregada)} {i.articulo?.unidad}</span>
          </span>
          <input type="number" inputMode="decimal" min={0} max={Number(i.cantidad_devuelta) || 0} value={cant[i.id] ?? ''} onChange={(e) => setCant({ ...cant, [i.id]: e.target.value })}
            className="w-16 px-2 py-1.5 rounded-lg bg-surface-2 border border-line text-[14px] text-center shrink-0" />
        </div>
      ))}
      <input className={inputCls} placeholder="Nota (opcional): p. ej. llegó con la broca rota" value={nota} onChange={(e) => setNota(e.target.value)} />
      <button type="button" disabled={guardando}
        onClick={() => ejecutar(() => recibirDevolucion(vale, devueltos.map((i) => ({ id: i.id, cantidad: Number(cant[i.id]) || 0 })), nota), 'Devolución confirmada')}
        className="min-h-[46px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold disabled:opacity-50">
        Confirmar recepción y cerrar vale
      </button>
    </div>
  );
}
