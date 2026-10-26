'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAvanceGuardado, pausaFinal } from '@/lib/useAvanceGuardado';
import SavingOverlay from '@/components/SavingOverlay';
import type { Avance } from '@/lib/useAvanceGuardado';
import { X, FileText, Clock, AlertTriangle, Check, Users, BellRing, PackageCheck, ShieldCheck, Undo2 } from 'lucide-react';
import { LineaDelVale, FotosDelVale, SelectorFotos, Cantidad } from './EvidenciaVale';
import ModalOverlay from '@/components/ModalOverlay';
import SignaturePad, { SignaturePadHandle } from '@/components/SignaturePad';
import { showToast } from '@/components/Toast';
import { mapaDeExistencias } from '@/lib/almacen';
import { createClient } from '@/lib/supabaseClient';
import {
  Vale, ETIQUETA_ESTADO, MOTIVOS_FALTANTE, valeVencido,
  firmarVale, firmarValeEnAlmacen, devolverVale, subirFotoVale, pedirMasDias, recordarMasDias, cancelarVale,
  entregarVale, recibirDevolucion, resolverMasDias, urlsFotos,
  Traspaso, traspasosDeVale, companerosParaPrestamo, proponerTraspaso, cancelarTraspaso, disponiblesParaPrestar, nombreCorto,
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
  const { progreso, avance } = useAvanceGuardado();
  const [error, setError] = useState<string | null>(null);
  const est = ETIQUETA_ESTADO[vale.estado];
  const vencido = valeVencido(vale);
  const [traspasos, setTraspasos] = useState<Traspaso[]>([]);
  const [recargaT, setRecargaT] = useState(0);
  // Recién entregado en este dispositivo: lo normal es que el técnico esté
  // ahí, así que la firma se abre sola.
  const [recienEntregado, setRecienEntregado] = useState(false);
  useEffect(() => { traspasosDeVale(vale.id).then(setTraspasos); }, [vale.id, recargaT]);

  // Toda acción muestra la pantalla de avance. `conEtapas`: la acción reporta
  // sus propios pasos (devolución con fotos); las de un toque van de un tirón.
  async function ejecutar(fn: (avance: Avance) => Promise<void>, ok: string, conEtapas = false) {
    avance(conEtapas ? 4 : 35, conEtapas ? 'Preparando…' : 'Guardando…');
    setGuardando(true);
    setError(null);
    try {
      await fn(avance);
      avance(100, ok);
      await pausaFinal();
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
      <SavingOverlay show={guardando} pct={progreso.pct} label={progreso.etapa} />
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

        <LineaDelVale vale={vale} />

        {vale.nota && <p className="text-[13px] mt-2"><span className="text-muted">Nota: </span>{vale.nota}</p>}

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
                    {it.nota_recepcion && <span className="block text-[11px] text-amber">Almacén: {it.nota_recepcion}</span>}
                  </td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums">{n(it.cantidad_solicitada)}</td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums">{n(it.cantidad_entregada)}</td>
                  <td className="text-center px-1.5 py-1.5 tabular-nums">{n(it.cantidad_devuelta)}{it.cantidad_recibida != null && it.cantidad_recibida !== it.cantidad_devuelta ? ` (recibió ${n(it.cantidad_recibida)})` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(vale.fotos_entrega?.length || 0) > 0 && <FotosDelVale titulo="Fotos de la entrega" paths={vale.fotos_entrega!} />}
        {vale.fotos_devolucion?.length > 0 && <FotosDelVale titulo="Fotos de la devolución" paths={vale.fotos_devolucion} />}

        {traspasos.length > 0 && (
          <div className="mt-3 rounded-xl border border-line p-3">
            <p className={labelCls}>Préstamos entre compañeros</p>
            <div className="flex flex-col gap-1.5">
              {traspasos.map((t) => {
                const salida = t.vale_origen_id === vale.id;
                const etiqueta = { pendiente: 'esperando que acepte', aceptado: 'aceptado', rechazado: 'no lo aceptó', cancelado: 'cancelado' }[t.estado];
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="min-w-0">
                      <b className="font-mono">{t.folio}</b> · {salida ? `a ${nombreCorto(t.a?.full_name)}` : `de ${nombreCorto(t.de?.full_name)}`}
                      {' · '}{t.items.reduce((s, x) => s + Number(x.cantidad), 0)} pza · <span className={t.estado === 'pendiente' ? 'text-amber font-semibold' : 'text-muted'}>{etiqueta}</span>
                      {t.motivo_rechazo && <span className="text-muted"> ({t.motivo_rechazo})</span>}
                    </span>
                    {t.estado === 'pendiente' && salida && (
                      <button type="button" disabled={guardando}
                        onClick={() => ejecutar(async () => { await cancelarTraspaso(t); setRecargaT((k) => k + 1); }, 'Préstamo cancelado')}
                        className="text-[12px] font-semibold text-red shrink-0">Cancelar</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
              {vale.estado === 'en_uso' && (
                <Prestar vale={vale} pendientes={traspasos} guardando={guardando}
                  ejecutar={(fn, ok, conEtapas) => ejecutar(async (av) => { await fn(av); setRecargaT((k) => k + 1); }, ok, conEtapas)} />
              )}
              {/* Renovar el plazo. Con una solicitud en espera se dice en qué va
                  (antes solo desaparecía el botón y parecía que no existía). */}
              {vale.extension_estado === 'pendiente' ? (
                <div className="rounded-xl border border-amber/40 bg-amber/5 p-3">
                  <p className="text-[13.5px] font-semibold text-amber flex items-center gap-1.5"><Clock size={15} /> Ya pediste {vale.extension_dias} día(s) más</p>
                  <p className="text-[12.5px] text-ink/80 mt-1 leading-snug">
                    Falta que el almacén lo autorice; el plazo se amplía en cuanto lo apruebe.
                    {vale.extension_motivo ? ` Motivo: ${vale.extension_motivo}` : ''}
                  </p>
                  <button type="button" disabled={guardando} onClick={() => ejecutar(() => recordarMasDias(vale), 'Se le recordó al almacén')}
                    className="mt-2.5 min-h-[40px] px-3.5 rounded-xl border border-amber/50 text-amber text-[13px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60">
                    <BellRing size={14} /> Recordar al almacén
                  </button>
                </div>
              ) : (
                <MasDias vale={vale} vencido={vencido} guardando={guardando} ejecutar={ejecutar} />
              )}
            </>
          )}
          {modo === 'almacen' && vale.estado === 'por_firmar' && <FirmarEnAlmacen vale={vale} guardando={guardando} ejecutar={ejecutar} abiertoInicial={recienEntregado} />}
          {modo === 'almacen' && vale.estado === 'solicitado' && (
            <Entregar vale={vale} guardando={guardando}
              ejecutar={(fn, ok, conEtapas) => ejecutar(async (av) => { await fn(av); setRecienEntregado(true); }, ok, conEtapas)} />
          )}
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

type Ejecutar = (fn: (avance: Avance) => Promise<void>, ok: string, conEtapas?: boolean) => void;

// Para cuando el técnico recibe en persona: firma aquí mismo, en la pantalla
// del almacén. Va plegado para que nadie firme por error; si el técnico no
// está, el vale se queda esperando su firma desde su celular, como siempre.
function FirmarEnAlmacen({ vale, guardando, ejecutar, abiertoInicial = false }: { vale: Vale; guardando: boolean; ejecutar: Ejecutar; abiertoInicial?: boolean }) {
  const ref = useRef<SignaturePadHandle>(null);
  const [abierto, setAbierto] = useState(abiertoInicial);
  useEffect(() => { if (abiertoInicial) setAbierto(true); }, [abiertoInicial]);
  const [firma, setFirma] = useState<string | null>(null);
  if (!abierto) {
    return (
      <div className="rounded-xl border border-line bg-surface-2/60 p-3">
        <p className="text-[13px] text-ink/80 leading-snug mb-2">Falta la firma de recibido de <b className="text-ink">{vale.tecnico || 'quien lo pidió'}</b>. Puede firmar desde su celular, o aquí si está contigo.</p>
        <button type="button" onClick={() => setAbierto(true)} className="w-full min-h-[44px] rounded-xl border border-teal/50 text-teal text-[14px] font-semibold active:scale-95 transition-transform">
          Firmar aquí, en este dispositivo
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-teal/40 bg-teal/5 p-3">
      <p className="text-[13px] mb-2 leading-snug">Pásale el dispositivo a <b>{vale.tecnico || 'quien recibe'}</b>: que revise la columna <b>Entregado</b> y firme de recibido.</p>
      <div className="rounded-xl overflow-hidden border border-line">
        <SignaturePad ref={ref} titulo={`Firma de ${vale.tecnico || 'quien recibe'}`} onCambio={setFirma} />
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" disabled={guardando} onClick={() => { setAbierto(false); setFirma(null); }}
          className="flex-1 min-h-[44px] rounded-xl border border-line text-[14px] font-semibold text-ink/80 disabled:opacity-50">
          Cancelar
        </button>
        <button type="button" disabled={guardando || !firma}
          onClick={() => ejecutar(() => firmarValeEnAlmacen(vale, firma!), 'Recibido firmado en almacén')}
          className="flex-1 min-h-[44px] rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold disabled:opacity-50">
          Guardar firma
        </button>
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

// El técnico devuelve: por cada concepto, «regresa completo» o «regresa
// menos» (con cuánto y qué pasó), más la foto de lo que entrega. Al almacén
// le llega el aviso para revisarlo.
function Devolver({ vale, guardando, ejecutar }: { vale: Vale; guardando: boolean; ejecutar: Ejecutar }) {
  const [abierto, setAbierto] = useState(false);
  const entregados = vale.items.filter((i) => (i.cantidad_entregada || 0) > 0);
  const [cant, setCant] = useState<Record<string, number>>(() => Object.fromEntries(entregados.map((i) => [i.id, Number(i.cantidad_entregada)])));
  const [menos, setMenos] = useState<Record<string, boolean>>({});
  const [motivo, setMotivo] = useState<Record<string, string>>({});
  const [nota, setNota] = useState<Record<string, string>>({});
  const [notaGral, setNotaGral] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)}
        className="min-h-[50px] rounded-2xl bg-teal text-inkOnAccent text-[15px] font-display font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
        <Undo2 size={18} /> Devolver al almacén
      </button>
    );
  }

  // Lo que regresa de cada concepto: todo, salvo que se marque «menos».
  const devuelve = (id: string, entregado: number) => (menos[id] ? Math.min(cant[id] ?? 0, entregado) : entregado);
  const conDiferencia = entregados.filter((i) => devuelve(i.id, Number(i.cantidad_entregada)) < Number(i.cantidad_entregada));
  const motivoDe = (i: typeof entregados[number]) => motivo[i.id] || (i.articulo?.categoria === 'material' ? 'consumido' : '');
  const faltanMotivos = conDiferencia.filter((i) => !motivoDe(i));

  async function enviar(avance: Avance) {
    if (fotos.length === 0) throw new Error('Agrega al menos una foto de lo que entregas');
    if (faltanMotivos.length > 0) throw new Error(`Indica qué pasó con «${faltanMotivos[0].articulo?.descripcion}»`);
    const items = entregados.map((i) => {
      const c = devuelve(i.id, Number(i.cantidad_entregada));
      const falta = c < Number(i.cantidad_entregada);
      return { id: i.id, cantidad: c, motivo: falta ? motivoDe(i) : null, nota: falta ? nota[i.id] || '' : '' };
    });
    const paths: string[] = [];
    for (let k = 0; k < fotos.length; k++) {
      avance(10 + (62 * k) / fotos.length, fotos.length > 1 ? `Guardando fotos · ${k + 1} de ${fotos.length}` : 'Guardando la foto');
      paths.push(await subirFotoVale(vale.id, fotos[k]));
    }
    avance(78, 'Avisando al almacén');
    await devolverVale(vale, items, paths, notaGral);
  }

  return (
    <div className="rounded-2xl border border-teal/40 bg-teal/5 p-3.5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display font-semibold text-[16px]">Devolver al almacén</p>
          <p className="text-[12px] text-muted leading-snug">Marca lo que regresa. El almacén revisa cada concepto y firma de recibido.</p>
        </div>
        <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="w-9 h-9 -mr-1 flex items-center justify-center text-muted shrink-0"><X size={17} /></button>
      </div>

      <div className="flex flex-col gap-2">
        {entregados.map((i) => {
          const entregado = Number(i.cantidad_entregada);
          const esMenos = !!menos[i.id];
          const c = devuelve(i.id, entregado);
          return (
            <div key={i.id} className={`rounded-xl border p-3 transition-colors ${esMenos ? 'bg-amber/5 border-amber/40' : 'bg-surface border-line'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold leading-snug">{i.articulo?.descripcion}</p>
                  <p className="text-[11.5px] text-muted">Te entregaron {n(entregado)} {i.articulo?.unidad}</p>
                </div>
                <span className={`text-[12px] font-bold tabular-nums shrink-0 px-2 py-0.5 rounded-full ${esMenos ? 'bg-amber/15 text-amber' : 'bg-teal/15 text-teal'}`}>
                  {c} de {n(entregado)}
                </span>
              </div>
              {/* Completo / menos: un toque para el caso normal. */}
              <div className="grid grid-cols-2 gap-1.5 mt-2.5 p-0.5 rounded-xl bg-surface-2" role="radiogroup" aria-label={`¿Regresa completo ${i.articulo?.descripcion}?`}>
                {([[false, 'Regresa completo'], [true, 'Regresa menos']] as const).map(([valor, texto]) => (
                  <button key={texto} type="button" role="radio" aria-checked={esMenos === valor}
                    onClick={() => { setMenos({ ...menos, [i.id]: valor }); if (valor && (cant[i.id] ?? entregado) >= entregado) setCant({ ...cant, [i.id]: Math.max(0, entregado - 1) }); }}
                    className={`min-h-[38px] rounded-[10px] text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      esMenos === valor ? (valor ? 'bg-amber text-inkOnAccent' : 'bg-teal text-inkOnAccent') : 'text-muted'
                    }`}>
                    {!valor && <Check size={14} strokeWidth={3} />}{texto}
                  </button>
                ))}
              </div>
              {esMenos && (
                <div className="mt-2.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] text-ink/80">¿Cuánto regresa?</span>
                    <Cantidad valor={cant[i.id] ?? 0} max={entregado} onChange={(v) => setCant({ ...cant, [i.id]: v })} unidad={i.articulo?.unidad} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {MOTIVOS_FALTANTE.map((m) => (
                      <button key={m.valor} type="button" onClick={() => setMotivo({ ...motivo, [i.id]: m.valor })}
                        className={`px-3 py-1.5 rounded-full text-[12px] font-medium border ${motivoDe(i) === m.valor ? 'bg-amber text-inkOnAccent border-amber' : 'bg-surface border-line text-ink/80'}`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <input className={inputCls} placeholder="Detalle (opcional): dónde quedó, qué le pasó…" value={nota[i.id] || ''} onChange={(e) => setNota({ ...nota, [i.id]: e.target.value })} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SelectorFotos fotos={fotos} onChange={setFotos} titulo="Foto de lo que devuelves"
        ayuda="Acomoda todo junto y toma la foto: es tu evidencia de que lo regresaste." />
      <input className={inputCls} placeholder="Nota para el almacén (opcional)" value={notaGral} onChange={(e) => setNotaGral(e.target.value)} />

      <p className="text-[12px] text-muted">
        {conDiferencia.length === 0 ? 'Regresas todo completo.' : `${conDiferencia.length} concepto${conDiferencia.length > 1 ? 's' : ''} con diferencia${faltanMotivos.length ? ' · falta decir qué pasó' : ''}.`}
      </p>
      <button type="button" disabled={guardando || fotos.length === 0 || faltanMotivos.length > 0} onClick={() => ejecutar(enviar, 'Devolución enviada; el almacén la va a revisar', true)}
        className="min-h-[50px] rounded-2xl bg-teal text-inkOnAccent text-[15px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
        <Undo2 size={17} /> {guardando ? 'Enviando…' : 'Enviar devolución'}
      </button>
    </div>
  );
}

// Pasar herramienta a un compañero sin regresarla al almacén. El otro la
// acepta con su firma y le queda un vale a su nombre con el mismo plazo.
function Prestar({ vale, pendientes, guardando, ejecutar }: { vale: Vale; pendientes: Traspaso[]; guardando: boolean; ejecutar: Ejecutar }) {
  const [abierto, setAbierto] = useState(false);
  const [companeros, setCompaneros] = useState<{ id: string; full_name: string }[] | null>(null);
  const [aQuien, setAQuien] = useState('');
  const [cant, setCant] = useState<Record<string, string>>({});
  const [nota, setNota] = useState('');
  const disp = useMemo(() => disponiblesParaPrestar(vale, pendientes), [vale, pendientes]);

  useEffect(() => {
    if (abierto && companeros === null) companerosParaPrestamo().then(setCompaneros).catch(() => setCompaneros([]));
  }, [abierto, companeros]);

  if (!abierto) {
    return <button type="button" onClick={() => setAbierto(true)} className="text-[13px] font-semibold text-teal py-1 flex items-center gap-1.5 self-start"><Users size={14} /> Prestar a un compañero</button>;
  }
  const items = vale.items.filter((i) => (disp[i.id] || 0) > 0);
  const elegidos = items.map((i) => ({ item: i.id, cantidad: Math.min(Number(cant[i.id]) || 0, disp[i.id] || 0) })).filter((x) => x.cantidad > 0);
  const destino = (companeros || []).find((c) => c.id === aQuien);
  return (
    <div className="rounded-xl border border-teal/40 bg-teal/5 p-3">
      <p className="text-[13px] mb-2">Se lo pasas sin regresarlo al almacén. Cuando lo acepte con su firma, queda a su nombre y tu vale baja esas cantidades.</p>
      <p className={labelCls}>¿A quién?</p>
      <select className={`${inputCls} mb-2`} value={aQuien} onChange={(e) => setAQuien(e.target.value)}>
        <option value="">{companeros === null ? 'Cargando…' : 'Elige un compañero'}</option>
        {(companeros || []).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
      </select>
      <p className={labelCls}>¿Qué le pasas?</p>
      {items.length === 0 && <p className="text-[12.5px] text-muted mb-2">No te queda nada libre para prestar en este vale.</p>}
      {items.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface border border-line p-2.5 mb-1.5">
          <span className="min-w-0">
            <span className="block text-[13px] font-medium truncate">{i.articulo?.descripcion}</span>
            <span className="block text-[11.5px] text-muted">Tienes {disp[i.id]} {i.articulo?.unidad}</span>
          </span>
          <input type="number" inputMode="decimal" min={0} max={disp[i.id]} placeholder="0" value={cant[i.id] ?? ''}
            onChange={(e) => setCant({ ...cant, [i.id]: e.target.value })}
            className="w-16 px-2 py-1.5 rounded-lg bg-surface-2 border border-line text-[14px] text-center shrink-0" />
        </div>
      ))}
      <input className={`${inputCls} mt-1`} placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button type="button" onClick={() => setAbierto(false)} className="min-h-[42px] rounded-xl border border-line text-[13px] font-semibold">Cancelar</button>
        <button type="button" disabled={guardando || !destino || elegidos.length === 0}
          onClick={() => ejecutar(async () => { await proponerTraspaso(vale, destino!, elegidos, nota); setAbierto(false); setCant({}); }, `Se le avisó a ${nombreCorto(destino?.full_name)}`)}
          className="min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13px] font-semibold disabled:opacity-50">Prestar</button>
      </div>
    </div>
  );
}

function MasDias({ vale, vencido, guardando, ejecutar }: { vale: Vale; vencido: boolean; guardando: boolean; ejecutar: Ejecutar }) {
  const [abierto, setAbierto] = useState(false);
  const [dias, setDias] = useState(3);
  const [motivo, setMotivo] = useState('');
  if (!abierto) {
    return (
      <div>
        {vale.extension_estado === 'rechazada' && (
          <p className="text-[12.5px] text-red mb-1.5">El almacén no aprobó los {vale.extension_dias} día(s) que pediste. Puedes devolverlo o pedirlo de nuevo.</p>
        )}
        <button type="button" onClick={() => setAbierto(true)}
          className={`w-full min-h-[44px] rounded-xl border text-[13.5px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${
            vencido ? 'border-red/50 bg-red/8 text-red' : 'border-teal/45 bg-teal/8 text-teal'
          }`}>
          <Clock size={15} /> {vencido ? 'Renovar plazo: pedir más días' : 'Pedir más días'}
        </button>
      </div>
    );
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

// El almacén entrega: cantidades por concepto (sin pasar de lo que hay) y la
// foto de lo entregado. Al guardar se descuenta del inventario y la pantalla
// pasa directo a la firma del técnico.
function Entregar({ vale, guardando, ejecutar }: { vale: Vale; guardando: boolean; ejecutar: Ejecutar }) {
  const [cant, setCant] = useState<Record<string, number>>(() => Object.fromEntries(vale.items.map((i) => [i.id, Number(i.cantidad_solicitada)])));
  const [hay, setHay] = useState<Record<string, number> | null>(null);
  const [nota, setNota] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);
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
    })().catch(() => setHay({}));
  }, [vale.servicio_id]);

  const disponible = (articuloId: string) => Math.max(0, hay?.[articuloId] ?? 0);
  const total = vale.items.reduce((s, i) => s + (cant[i.id] || 0), 0);
  const excedidos = vale.items.filter((i) => (cant[i.id] || 0) > disponible(i.articulo_id));

  async function entregar(avance: Avance) {
    if (fotos.length === 0) throw new Error('Toma al menos una foto de lo que entregas');
    const paths: string[] = [];
    for (let k = 0; k < fotos.length; k++) {
      avance(10 + (55 * k) / fotos.length, fotos.length > 1 ? `Guardando fotos · ${k + 1} de ${fotos.length}` : 'Guardando la foto');
      paths.push(await subirFotoVale(vale.id, fotos[k]));
    }
    avance(72, 'Descontando del inventario');
    await entregarVale(vale, vale.items.map((i) => ({ id: i.id, cantidad: cant[i.id] || 0 })), nota, paths);
  }

  return (
    <div className="rounded-2xl border border-teal/40 bg-teal/5 p-3.5 flex flex-col gap-3">
      <div>
        <p className="font-display font-semibold text-[16px] flex items-center gap-2"><PackageCheck size={18} className="text-teal" /> Entregar</p>
        <p className="text-[12px] text-muted leading-snug">Ajusta lo que de verdad entregas, toma la foto y en seguida {vale.tecnico || 'quien lo pidió'} firma de recibido en este dispositivo.</p>
      </div>

      <div className="flex flex-col gap-2">
        {vale.items.map((i) => {
          const disp = disponible(i.articulo_id);
          const c = cant[i.id] || 0;
          const pedido = Number(i.cantidad_solicitada);
          return (
            <div key={i.id} className={`rounded-xl border p-3 ${c > disp ? 'border-red/50 bg-red/5' : 'border-line bg-surface'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold leading-snug">{i.articulo?.descripcion}</p>
                  <p className="text-[11.5px] text-muted">
                    Pidió {n(pedido)} {i.articulo?.unidad} · {hay === null ? 'revisando existencia…' : <span className={c > disp ? 'text-red font-semibold' : ''}>hay {disp}</span>}
                  </p>
                  {i.articulo?.almacen_ubicaciones?.nombre && <p className="text-[11.5px] text-teal font-semibold">Está en: {i.articulo.almacen_ubicaciones.nombre}</p>}
                </div>
                <Cantidad valor={c} max={Math.max(pedido, disp)} onChange={(v) => setCant({ ...cant, [i.id]: v })} />
              </div>
              {c > 0 && c < pedido && <p className="text-[11.5px] text-amber mt-1.5">Entregas {pedido - c} menos de lo que pidió.</p>}
              {c === 0 && <p className="text-[11.5px] text-muted mt-1.5">No se entrega este concepto.</p>}
            </div>
          );
        })}
      </div>

      <SelectorFotos fotos={fotos} onChange={setFotos} titulo="Foto de lo que entregas"
        ayuda="Acomoda todo lo del vale y toma la foto antes de dárselo: es la evidencia de la entrega." />
      <input className={inputCls} placeholder="Nota (opcional): p. ej. la broca de 3/8 va usada" value={nota} onChange={(e) => setNota(e.target.value)} />

      {excedidos.length > 0 && <p className="text-[12px] text-red font-semibold">No alcanza la existencia de «{excedidos[0].articulo?.descripcion}». Baja la cantidad.</p>}
      <button type="button" disabled={guardando || fotos.length === 0 || total <= 0 || excedidos.length > 0}
        onClick={() => ejecutar(entregar, 'Entregado; ahora firma quien recibe', true)}
        className="min-h-[50px] rounded-2xl bg-teal text-inkOnAccent text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
        <Check size={17} /> Entregar y pasar a la firma
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

// El almacén revisa la devolución: marca cada concepto como recibido (o
// anota cuánto llegó y qué pasó) y firma de recibido. Esa firma es la prueba
// para el técnico de que ya no tiene nada a su nombre.
function Recibir({ vale, guardando, ejecutar }: { vale: Vale; guardando: boolean; ejecutar: Ejecutar }) {
  const devueltos = vale.items.filter((i) => (i.cantidad_entregada || 0) > 0);
  // Por concepto: null = sin revisar, 'ok' = llegó lo que dijo, 'dif' = llegó distinto.
  const [revision, setRevision] = useState<Record<string, 'ok' | 'dif' | null>>({});
  const [cant, setCant] = useState<Record<string, number>>({});
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [nota, setNota] = useState('');
  const [firma, setFirma] = useState<string | null>(null);
  const ref = useRef<SignaturePadHandle>(null);

  const revisados = devueltos.filter((i) => revision[i.id]).length;
  const sinNota = devueltos.filter((i) => revision[i.id] === 'dif' && (cant[i.id] ?? 0) < Number(i.cantidad_devuelta || 0) && !notas[i.id]?.trim());
  const listo = revisados === devueltos.length && sinNota.length === 0;

  function marcarTodo() {
    setRevision(Object.fromEntries(devueltos.map((i) => [i.id, revision[i.id] || 'ok'])));
  }

  const items = devueltos.map((i) => {
    const declarado = Number(i.cantidad_devuelta || 0);
    const dif = revision[i.id] === 'dif';
    return { id: i.id, cantidad: dif ? Math.min(cant[i.id] ?? 0, declarado) : declarado, nota: dif ? notas[i.id]?.trim() || '' : '' };
  });

  return (
    <div className="rounded-2xl border border-teal/40 bg-teal/5 p-3.5 flex flex-col gap-3">
      <div>
        <p className="font-display font-semibold text-[16px] flex items-center gap-2"><ShieldCheck size={18} className="text-teal" /> Revisar la devolución</p>
        <p className="text-[12px] text-muted leading-snug">Compara con las fotos de arriba y cuenta lo que regresó. Lo que recibas vuelve al inventario.</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold tabular-nums">{revisados} de {devueltos.length} revisados</span>
        {revisados < devueltos.length && (
          <button type="button" onClick={marcarTodo} className="text-[12.5px] font-semibold text-teal">Todo llegó como dice</button>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden -mt-1.5">
        <div className="h-full bg-teal rounded-full transition-[width] duration-300" style={{ width: `${devueltos.length ? (revisados / devueltos.length) * 100 : 0}%` }} />
      </div>

      <div className="flex flex-col gap-2">
        {devueltos.map((i) => {
          const declarado = Number(i.cantidad_devuelta || 0);
          const r = revision[i.id] || null;
          return (
            <div key={i.id} className={`rounded-xl border p-3 transition-colors ${r === 'ok' ? 'border-teal/50 bg-teal/5' : r === 'dif' ? 'border-amber/50 bg-amber/5' : 'border-line bg-surface'}`}>
              <div className="flex items-start gap-3">
                <button type="button" aria-label={r === 'ok' ? 'Quitar marca' : 'Marcar como recibido'} onClick={() => setRevision({ ...revision, [i.id]: r === 'ok' ? null : 'ok' })}
                  className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center shrink-0 active:scale-90 transition ${
                    r === 'ok' ? 'bg-teal border-teal text-inkOnAccent' : r === 'dif' ? 'bg-amber/15 border-amber text-amber' : 'border-line-strong text-transparent'
                  }`}>
                  {r === 'dif' ? <AlertTriangle size={15} strokeWidth={2.6} /> : <Check size={17} strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold leading-snug">{i.articulo?.descripcion}</p>
                  <p className="text-[11.5px] text-muted">
                    Devuelve {n(declarado)} de {n(i.cantidad_entregada)} {i.articulo?.unidad}
                    {i.motivo_faltante && <span className="text-red"> · {MOTIVOS_FALTANTE.find((m) => m.valor === i.motivo_faltante)?.label}{i.nota ? `: ${i.nota}` : ''}</span>}
                  </p>
                  {r !== 'dif' && declarado > 0 && (
                    <button type="button" onClick={() => { setRevision({ ...revision, [i.id]: 'dif' }); setCant({ ...cant, [i.id]: Math.max(0, declarado - 1) }); }}
                      className="text-[12px] font-semibold text-amber mt-1">Llegó diferente</button>
                  )}
                </div>
              </div>
              {r === 'dif' && (
                <div className="mt-2.5 ml-11 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] text-ink/80">¿Cuánto llegó?</span>
                    <Cantidad valor={cant[i.id] ?? 0} max={declarado} onChange={(v) => setCant({ ...cant, [i.id]: v })} unidad={i.articulo?.unidad} />
                  </div>
                  <input className={`${inputCls} ${sinNota.some((x) => x.id === i.id) ? 'border-amber' : ''}`} placeholder="¿Qué pasó? (obligatorio): llegó roto, faltó una pieza…"
                    value={notas[i.id] || ''} onChange={(e) => setNotas({ ...notas, [i.id]: e.target.value })} />
                  <button type="button" onClick={() => setRevision({ ...revision, [i.id]: null })} className="text-[12px] text-muted self-start">Cancelar diferencia</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <input className={inputCls} placeholder="Nota general (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />

      <div className={`rounded-xl border p-3 transition-opacity ${listo ? '' : 'opacity-60'}`}>
        <p className="text-[13px] font-semibold mb-1">Tu firma de recibido</p>
        <p className="text-[11.5px] text-muted mb-2">{listo ? 'Con tu firma se cierra el vale y le llega el acuse a quien devolvió.' : 'Revisa todos los conceptos para poder firmar.'}</p>
        <div className={`rounded-xl overflow-hidden border border-line ${listo ? '' : 'pointer-events-none'}`}>
          <SignaturePad ref={ref} titulo="Firma de quien recibe en almacén" onCambio={setFirma} />
        </div>
      </div>

      <button type="button" disabled={guardando || !listo || !firma}
        onClick={() => ejecutar(() => recibirDevolucion(vale, items, nota, firma!), 'Devolución recibida y vale cerrado')}
        className="min-h-[50px] rounded-2xl bg-teal text-inkOnAccent text-[15px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
        <ShieldCheck size={17} /> Aceptar devolución y cerrar vale
      </button>
    </div>
  );
}
