'use client';

// Ayudas de SYSCOM en el formulario de cotización:
// · Sugerencia: al terminar de escribir o pegar un concepto sin enlace, se
//   busca primero en lo ya cotizado (gratis) y si no, en SYSCOM.
// · «Ligar con SYSCOM»: liga de una vez todos los conceptos sin enlace.
// · «Revisar precios»: compara el costo de los conceptos ligados con el
//   precio de hoy en SYSCOM.
// · El contador de consultas del mes (cada una sale por Fixie, con cupo).

import { useEffect, useState } from 'react';
import { BadgeDollarSign, Check, Link2, Loader2, Sparkles, X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { leerFichaSyscom } from '@/components/FichaProductoSyscom';
import { createClient } from '@/lib/supabaseClient';
import {
  buscarEnCatalogo, cambioDePrecio, construirCatalogo, parecido, PARECIDO_SYSCOM, textoParaBuscar, vaLaPenaBuscar,
  type ProductoCotizado,
} from '@/lib/catalogoCotizaciones';
import { idProductoDeEnlace } from '@/lib/syscomEnlace';
import type { ProductoSyscom } from '@/lib/syscom';

export const CUPO_MES = 2500;
export const AVISO_MES = 2000;

// Lo que se propone para un concepto.
export type Sugerencia = {
  fuente: 'catalogo' | 'syscom';
  titulo: string;
  enlace: string;
  costo: number | null;
  foto: string | null;
  modelo: string | null;
  marca: string | null;
  existencia: number | null;
  // Solo del catálogo: de qué cotización salió el costo.
  folio?: string | null;
  fecha?: string | null;
};

// Lo que se cambia en el concepto al aceptar.
export type CambioConcepto = { enlace: string; costo?: string; foto?: string; modelo?: string; marca?: string };

export function cambioDeSugerencia(s: Sugerencia, costoActual: string): CambioConcepto {
  const cambio: CambioConcepto = { enlace: s.enlace, modelo: s.modelo || '', marca: s.marca || '' };
  // El costo se llena solo si estaba vacío; para actualizarlo está «Revisar precios».
  if (!costoActual.trim() && s.costo !== null) cambio.costo = String(s.costo);
  if (s.foto && /^https:\/\//i.test(s.foto)) cambio.foto = s.foto;
  return cambio;
}

function sugerenciaDeCatalogo(p: ProductoCotizado): Sugerencia {
  return { fuente: 'catalogo', titulo: p.descripcion.split('\n')[0], enlace: p.enlace, costo: p.costo, foto: p.foto, modelo: p.modelo, marca: p.marca, existencia: null, folio: p.folio, fecha: p.fecha };
}

function sugerenciaDeSyscom(p: ProductoSyscom): Sugerencia | null {
  if (!p.link) return null;
  return { fuente: 'syscom', titulo: p.titulo, enlace: p.link, costo: p.precio, foto: p.imagen, modelo: p.modelo, marca: p.marca, existencia: p.existencia };
}

// ---------- Datos ----------

// Los productos ya ligados en cotizaciones anteriores.
export function useCatalogoCotizado(): { catalogo: ProductoCotizado[]; error: string | null } {
  const [catalogo, setCatalogo] = useState<ProductoCotizado[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelado = false;
    createClient().from('cotizacion_lineas')
      .select('descripcion, enlace, costo, unidad, foto, modelo, marca, cotizaciones(folio, created_at)')
      .not('enlace', 'is', null).neq('enlace', '').limit(3000)
      .then(({ data, error: e }) => {
        if (cancelado) return;
        if (e) {
          console.error('Catálogo de cotizaciones:', e.message);
          setError('No se pudo cargar lo ya cotizado; las sugerencias buscarán solo en SYSCOM.');
          return;
        }
        setCatalogo(construirCatalogo((data || []).map((f: any) => ({
          descripcion: f.descripcion || '', enlace: f.enlace, costo: f.costo, unidad: f.unidad,
          foto: f.foto, modelo: f.modelo, marca: f.marca,
          fecha: f.cotizaciones?.created_at || '', folio: f.cotizaciones?.folio || null,
        }))));
      });
    return () => { cancelado = true; };
  }, []);
  return { catalogo, error };
}

// Consultas a SYSCOM de este mes. `recargar` después de usar SYSCOM.
export function useUsoSyscom(): { usadas: number | null; recargar: () => void } {
  const [usadas, setUsadas] = useState<number | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    const mes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
    createClient().from('syscom_uso_mes').select('cuenta').eq('mes', mes).maybeSingle().then(({ data, error }) => {
      if (error) {
        console.error('Uso de SYSCOM:', error.message);
        return;
      }
      setUsadas(data?.cuenta ?? 0);
    });
  }, [vuelta]);
  return { usadas, recargar: () => setVuelta((v) => v + 1) };
}

// Primero lo ya cotizado; si no hay, el primer resultado de SYSCOM que se parezca.
// `auto`: la búsqueda automática se detiene cerca del cupo (el servidor decide).
export async function buscarSugerencia(descripcion: string, catalogo: ProductoCotizado[], auto: boolean): Promise<{ sugerencia: Sugerencia | null; pausado?: boolean; error?: string }> {
  const delCatalogo = buscarEnCatalogo(descripcion, catalogo);
  if (delCatalogo) return { sugerencia: sugerenciaDeCatalogo(delCatalogo) };
  const texto = textoParaBuscar(descripcion);
  let respuesta: Response;
  try {
    respuesta = await fetch(`/api/syscom/productos?q=${encodeURIComponent(texto)}${auto ? '&auto=1' : ''}`);
  } catch {
    return { sugerencia: null, error: 'Sin conexión con el servidor.' };
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) return { sugerencia: null, error: datos?.error || 'No se pudo buscar en SYSCOM.' };
  if (datos?.pausado) return { sugerencia: null, pausado: true };
  const primero: ProductoSyscom | undefined = (datos?.productos || [])[0];
  if (!primero) return { sugerencia: null };
  if (parecido(texto, `${primero.titulo} ${primero.modelo || ''}`) < PARECIDO_SYSCOM) return { sugerencia: null };
  return { sugerencia: sugerenciaDeSyscom(primero) };
}

export { vaLaPenaBuscar };

const dinero = (n: number | null) => (n === null ? '—' : '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fechaCorta = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// ---------- Sugerencia bajo el concepto ----------

export function TarjetaSugerencia({ sugerencia, onUsar, onDescartar }: { sugerencia: Sugerencia; onUsar: () => void; onDescartar: () => void }) {
  const delCatalogo = sugerencia.fuente === 'catalogo';
  return (
    <div className="mb-2.5 rounded-xl border border-teal/50 bg-teal/5 p-2.5 flex items-start gap-2.5">
      {sugerencia.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sugerencia.foto} alt="" className="w-12 h-12 rounded-lg object-contain bg-white shrink-0" />
      ) : (
        <span className="w-12 h-12 rounded-lg bg-teal/15 text-teal flex items-center justify-center shrink-0"><Sparkles size={20} /></span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-teal">
          {delCatalogo ? '¿Es este? Ya lo cotizaron antes' : '¿Es este? Encontrado en SYSCOM'}
        </p>
        <p className="text-[13.5px] font-semibold leading-snug line-clamp-2">{sugerencia.titulo}</p>
        <p className="text-[12px] text-muted mt-0.5">
          {sugerencia.modelo ? `${sugerencia.modelo} · ` : ''}
          Costo {dinero(sugerencia.costo)}
          {delCatalogo ? ` en ${sugerencia.folio || 'una cotización'} (${fechaCorta(sugerencia.fecha)})` : ' hoy'}
          {sugerencia.existencia !== null ? ` · ${sugerencia.existencia} en existencia` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button type="button" onClick={onUsar} className="whitespace-nowrap min-h-[38px] px-3 rounded-lg bg-teal text-inkOnAccent text-[13px] font-semibold flex items-center gap-1.5">
            <Link2 size={14} strokeWidth={2.5} /> Sí, ligarlo
          </button>
          <button type="button" onClick={onDescartar} className="whitespace-nowrap min-h-[38px] px-3 rounded-lg border border-line-strong text-[13px] font-semibold text-muted">
            No es
          </button>
          <a href={sugerencia.enlace} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap min-h-[38px] px-1 flex items-center text-[12.5px] text-teal underline">Ver en SYSCOM</a>
        </div>
      </div>
    </div>
  );
}

export function TextoUso({ usadas }: { usadas: number | null }) {
  if (usadas === null) return null;
  const cerca = usadas >= AVISO_MES;
  return (
    <p className={`text-[12px] ${cerca ? 'text-amber font-semibold' : 'text-muted'}`}>
      Consultas a SYSCOM este mes: {usadas.toLocaleString('es-MX')} de {CUPO_MES.toLocaleString('es-MX')}
      {cerca ? ' · cerca del cupo: la sugerencia automática se pausó' : ''}
    </p>
  );
}

// ---------- Ligar con SYSCOM (todos los conceptos sin enlace) ----------

export type ConceptoParaAyuda = { grupoId: string; itemId: string; descripcion: string; costo: string; enlace?: string };

type Fila = { concepto: ConceptoParaAyuda; estado: 'pendiente' | 'buscando' | 'listo' | 'nada' | 'error'; sugerencia?: Sugerencia | null; error?: string; elegido: boolean };

export function ModalLigarSyscom({ conceptos, catalogo, onAplicar, onClose, onUso }: {
  conceptos: ConceptoParaAyuda[];
  catalogo: ProductoCotizado[];
  onAplicar: (cambios: { grupoId: string; itemId: string; cambio: CambioConcepto }[]) => void;
  onClose: () => void;
  onUso: () => void;
}) {
  const [filas, setFilas] = useState<Fila[]>(() => conceptos.map((c) => ({ concepto: c, estado: 'pendiente', elegido: false })));
  const [trabajando, setTrabajando] = useState(true);

  // Uno por uno, para no saturar a SYSCOM.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      for (let i = 0; i < conceptos.length; i++) {
        if (cancelado) return;
        setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, estado: 'buscando' } : f)));
        const r = await buscarSugerencia(conceptos[i].descripcion, catalogo, false);
        if (cancelado) return;
        setFilas((prev) => prev.map((f, j) => (j === i
          ? { ...f, estado: r.error ? 'error' : r.sugerencia ? 'listo' : 'nada', sugerencia: r.sugerencia, error: r.error, elegido: !!r.sugerencia }
          : f)));
      }
      if (!cancelado) {
        setTrabajando(false);
        onUso();
      }
    })();
    return () => { cancelado = true; };
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elegidas = filas.filter((f) => f.elegido && f.sugerencia);

  function aplicar() {
    onAplicar(elegidas.map((f) => ({ grupoId: f.concepto.grupoId, itemId: f.concepto.itemId, cambio: cambioDeSugerencia(f.sugerencia as Sugerencia, f.concepto.costo) })));
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl bg-surface border border-line overflow-hidden">
        <Encabezado titulo="Ligar con SYSCOM" detalle="Busca cada concepto sin enlace: primero en lo ya cotizado y luego en SYSCOM. Revisa y quita lo que no sea." onClose={onClose} />
        <ul className="flex-1 overflow-y-auto px-4 py-2 divide-y divide-line">
          {filas.map((f) => (
            <li key={f.concepto.itemId} className="py-3 flex items-start gap-3">
              <input type="checkbox" className="w-5 h-5 mt-1 accent-teal shrink-0" disabled={!f.sugerencia} checked={f.elegido}
                aria-label={`Ligar «${f.concepto.descripcion.slice(0, 40)}»`}
                onChange={(e) => setFilas((prev) => prev.map((x) => (x === f ? { ...x, elegido: e.target.checked } : x)))} />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold leading-snug line-clamp-2">{f.concepto.descripcion || '(sin descripción)'}</p>
                {f.estado === 'buscando' && <p className="text-[12.5px] text-muted mt-1 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Buscando…</p>}
                {f.estado === 'pendiente' && <p className="text-[12.5px] text-faint mt-1">En espera</p>}
                {f.estado === 'nada' && <p className="text-[12.5px] text-muted mt-1">No encontré uno parecido. Búscalo con el botón SYSCOM del concepto.</p>}
                {f.estado === 'error' && <p className="text-[12.5px] text-red mt-1">{f.error}</p>}
                {f.sugerencia && (
                  <p className="text-[12.5px] text-muted mt-1">
                    → <a href={f.sugerencia.enlace} target="_blank" rel="noopener noreferrer" className="text-teal underline">{f.sugerencia.titulo.slice(0, 90)}</a>
                    {' · '}{f.sugerencia.fuente === 'catalogo' ? `ya cotizado en ${f.sugerencia.folio || 'otra cotización'}` : `SYSCOM hoy ${dinero(f.sugerencia.costo)}`}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        <Pie>
          <p className="text-[12.5px] text-muted flex-1">El costo solo se llena si estaba vacío. Para actualizarlo usa «Revisar precios».</p>
          <button type="button" onClick={aplicar} disabled={trabajando || elegidas.length === 0}
            className="min-h-[44px] px-4 rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold flex items-center gap-2 disabled:opacity-50">
            {trabajando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />}
            {trabajando ? 'Buscando…' : `Ligar ${elegidas.length}`}
          </button>
        </Pie>
      </div>
    </ModalOverlay>
  );
}

// ---------- Revisar precios (conceptos ligados) ----------

type FilaPrecio = { concepto: ConceptoParaAyuda; estado: 'pendiente' | 'buscando' | 'listo' | 'error'; precio?: number | null; existencia?: number | null; error?: string; elegido: boolean };

export function ModalPreciosSyscom({ conceptos, onAplicar, onClose, onUso }: {
  conceptos: ConceptoParaAyuda[];
  onAplicar: (cambios: { grupoId: string; itemId: string; costo: string }[]) => void;
  onClose: () => void;
  onUso: () => void;
}) {
  const [filas, setFilas] = useState<FilaPrecio[]>(() => conceptos.map((c) => ({ concepto: c, estado: 'pendiente', elegido: false })));
  const [trabajando, setTrabajando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      for (let i = 0; i < conceptos.length; i++) {
        if (cancelado) return;
        setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, estado: 'buscando' } : f)));
        const id = idProductoDeEnlace(conceptos[i].enlace || '') as string;
        let fila: Partial<FilaPrecio>;
        try {
          const ficha = await leerFichaSyscom(id);
          const cambio = cambioDePrecio(parseFloat(conceptos[i].costo), ficha.precio);
          // Se propone actualizar si cambió al menos 1 %.
          fila = { estado: 'listo', precio: ficha.precio, existencia: ficha.existencia, elegido: ficha.precio !== null && (cambio === null || Math.abs(cambio) >= 1) };
        } catch (e: any) {
          fila = { estado: 'error', error: e?.message || 'No se pudo consultar SYSCOM.' };
        }
        if (cancelado) return;
        setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...fila } : f)));
      }
      if (!cancelado) {
        setTrabajando(false);
        onUso();
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elegidas = filas.filter((f) => f.elegido && f.precio !== null && f.precio !== undefined);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl bg-surface border border-line overflow-hidden">
        <Encabezado titulo="Revisar precios" detalle="Compara el costo de cada concepto ligado con el precio de hoy en SYSCOM (sin IVA). Tu % de ganancia se respeta." onClose={onClose} />
        <ul className="flex-1 overflow-y-auto px-4 py-2 divide-y divide-line">
          {filas.map((f) => {
            const antes = parseFloat(f.concepto.costo);
            const cambio = cambioDePrecio(Number.isFinite(antes) ? antes : null, f.precio ?? null);
            const color = cambio === null || Math.abs(cambio) < 1 ? 'text-muted' : cambio > 0 ? 'text-red' : 'text-green-600 dark:text-green-400';
            return (
              <li key={f.concepto.itemId} className="py-3 flex items-start gap-3">
                <input type="checkbox" className="w-5 h-5 mt-1 accent-teal shrink-0" disabled={f.estado !== 'listo' || f.precio === null}
                  checked={f.elegido} aria-label={`Actualizar el costo de «${f.concepto.descripcion.slice(0, 40)}»`}
                  onChange={(e) => setFilas((prev) => prev.map((x) => (x === f ? { ...x, elegido: e.target.checked } : x)))} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold leading-snug line-clamp-2">{f.concepto.descripcion}</p>
                  {f.estado === 'buscando' && <p className="text-[12.5px] text-muted mt-1 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Consultando…</p>}
                  {f.estado === 'pendiente' && <p className="text-[12.5px] text-faint mt-1">En espera</p>}
                  {f.estado === 'error' && <p className="text-[12.5px] text-red mt-1">{f.error}</p>}
                  {f.estado === 'listo' && (
                    <p className="text-[12.5px] mt-1">
                      <span className="text-muted">Cotizado {dinero(Number.isFinite(antes) ? antes : null)} → hoy </span>
                      <b>{dinero(f.precio ?? null)}</b>
                      {cambio !== null && <span className={`font-semibold ${color}`}> ({cambio > 0 ? '+' : ''}{cambio} %)</span>}
                      {f.existencia !== null && f.existencia !== undefined && <span className={f.existencia === 0 ? 'text-red font-semibold' : 'text-muted'}> · {f.existencia === 0 ? 'sin existencia' : `${f.existencia} en existencia`}</span>}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <Pie>
          <p className="text-[12.5px] text-muted flex-1">Se marcan los que cambiaron 1 % o más.</p>
          <button type="button" disabled={trabajando || elegidas.length === 0}
            onClick={() => onAplicar(elegidas.map((f) => ({ grupoId: f.concepto.grupoId, itemId: f.concepto.itemId, costo: String(f.precio) })))}
            className="min-h-[44px] px-4 rounded-xl bg-teal text-inkOnAccent text-[14px] font-semibold flex items-center gap-2 disabled:opacity-50">
            {trabajando ? <Loader2 size={16} className="animate-spin" /> : <BadgeDollarSign size={16} strokeWidth={2.4} />}
            {trabajando ? 'Consultando…' : `Actualizar ${elegidas.length}`}
          </button>
        </Pie>
      </div>
    </ModalOverlay>
  );
}

function Encabezado({ titulo, detalle, onClose }: { titulo: string; detalle: string; onClose: () => void }) {
  return (
    <div className="px-4 pt-4 pb-3 border-b border-line flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-display font-bold text-[19px]">{titulo}</p>
        <p className="text-[13px] text-muted leading-snug mt-0.5">{detalle}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-ink"><X size={20} /></button>
    </div>
  );
}

function Pie({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3 border-t border-line flex items-center gap-3">{children}</div>;
}
