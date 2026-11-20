'use client';

// Revisión antes de cotizar un levantamiento: cada recomendación, equipo con
// falla u observación es un concepto propuesto que se marca, corrige o
// descarta. Al terminar se abre «Nueva cotización» ya llenada, donde se
// ligan productos de SYSCOM y se ponen precios como siempre.

import { useEffect, useMemo, useState } from 'react';
import { Check, CircleCheck, CircleDashed, ClipboardList, Plus, Trash2, Wrench, X } from 'lucide-react';
import { obtenerLevantamiento, type Levantamiento, type SistemaLevantamiento } from '@/lib/levantamientos';
import { propuestasDeLevantamiento, type ConceptoPropuesto, type OrigenPropuesta } from '@/lib/levantamientoACotizacion';
import { buscarEnCatalogo } from '@/lib/catalogoCotizaciones';
import { useCatalogoCotizado } from './AyudaSyscom';
import { generarUUID } from '@/lib/uuid';

const ETIQUETA_ORIGEN: Record<OrigenPropuesta, string> = {
  recomendacion: 'Recomendación',
  reemplazo: '¿Cotizar reemplazo?',
  observacion: 'Observación',
  mano_obra: 'Mano de obra',
  manual: 'Agregado',
};

const UNIDADES = ['Pza', 'Lote', 'Serv', 'Mts', 'Hrs', 'Juego'];

function money(n: number): string {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CotizarLevantamiento({
  levantamientoId,
  onListo,
  onClose,
}: {
  levantamientoId: string;
  onListo: (levantamiento: Levantamiento, conceptos: ConceptoPropuesto[]) => void;
  onClose: () => void;
}) {
  const [levantamiento, setLevantamiento] = useState<Levantamiento | null>(null);
  const [sistemas, setSistemas] = useState<SistemaLevantamiento[]>([]);
  const [conceptos, setConceptos] = useState<ConceptoPropuesto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { catalogo } = useCatalogoCotizado();

  useEffect(() => {
    obtenerLevantamiento(levantamientoId)
      .then(({ levantamiento: lev, sistemas: sis }) => {
        setLevantamiento(lev);
        setSistemas(sis);
        setConceptos(propuestasDeLevantamiento(sis, generarUUID));
      })
      .catch((e) => setError((e?.message || 'No se pudo cargar el levantamiento') + '. Revisa tu conexión e inténtalo de nuevo.'));
  }, [levantamientoId]);

  // Lo ya cotizado antes que se parece a cada concepto (sin gastar consultas a SYSCOM).
  const parecidos = useMemo(() => {
    const mapa: Record<string, ReturnType<typeof buscarEnCatalogo>> = {};
    for (const c of conceptos) {
      if (!c.enlace && c.origen !== 'mano_obra') mapa[c.id] = buscarEnCatalogo(c.descripcion, catalogo);
    }
    return mapa;
  }, [conceptos, catalogo]);

  function cambiar(id: string, cambio: Partial<ConceptoPropuesto>) {
    setConceptos((prev) => prev.map((c) => (c.id === id ? { ...c, ...cambio } : c)));
    setAviso(null);
  }

  function usarParecido(c: ConceptoPropuesto) {
    const p = parecidos[c.id];
    if (!p) return;
    cambiar(c.id, {
      descripcion: p.descripcion, enlace: p.enlace, costo: p.costo, unidad: p.unidad || c.unidad,
      foto: p.foto || '', modelo: p.modelo || '', marca: p.marca || '', incluir: true,
    });
  }

  function agregar(sistema: string) {
    const nuevo: ConceptoPropuesto = {
      id: generarUUID(), sistema, origen: 'manual', textoOriginal: '', descripcion: '', cantidad: 1, unidad: 'Pza',
      incluir: true, enlace: '', costo: null, foto: '', modelo: '', marca: '',
    };
    // Va antes de la mano de obra del sistema, que queda al final.
    setConceptos((prev) => {
      const ultimo = prev.map((c) => c.sistema).lastIndexOf(sistema);
      const posicion = prev[ultimo]?.origen === 'mano_obra' ? ultimo : ultimo + 1;
      return [...prev.slice(0, posicion), nuevo, ...prev.slice(posicion)];
    });
  }

  function quitar(id: string) {
    setConceptos((prev) => prev.filter((c) => c.id !== id));
  }

  function armar() {
    const elegidos = conceptos.filter((c) => c.incluir);
    if (elegidos.length === 0) {
      setAviso('Marca al menos un concepto para cotizar.');
      return;
    }
    const sinTexto = elegidos.find((c) => !c.descripcion.trim());
    if (sinTexto) {
      setAviso('Hay un concepto marcado sin descripción: escríbela o desmárcalo.');
      document.getElementById(`concepto-${sinTexto.id}`)?.focus();
      return;
    }
    const sinCantidad = elegidos.find((c) => !(c.cantidad > 0));
    if (sinCantidad) {
      setAviso('Hay un concepto marcado con cantidad en cero: corrígela o desmárcalo.');
      document.getElementById(`cantidad-${sinCantidad.id}`)?.focus();
      return;
    }
    if (levantamiento) onListo(levantamiento, conceptos);
  }

  const nombresSistemas = [...new Set(conceptos.map((c) => c.sistema))];
  const marcados = conceptos.filter((c) => c.incluir).length;
  const ligados = conceptos.filter((c) => c.incluir && c.enlace).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass-strong rounded-t-3xl sm:rounded-3xl max-w-3xl w-full max-h-[94vh] flex flex-col relative">
        <div className="p-5 pb-3 border-b border-line">
          <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-2 border border-line flex items-center justify-center active:scale-90 transition-transform">
            <X size={17} strokeWidth={2.4} />
          </button>
          <p className="text-[12px] uppercase tracking-wider text-muted mb-0.5">Cotizar levantamiento</p>
          <h2 className="font-display font-bold text-[19px] leading-snug pr-10">
            {levantamiento ? `${levantamiento.folio} · ${levantamiento.empresa}` : 'Cargando…'}
          </h2>
          <p className="text-[12.5px] text-muted mt-1 leading-relaxed">
            Marca lo que entra en la cotización y corrige descripción, cantidad y unidad. Los precios y productos de SYSCOM se ponen en el siguiente paso.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {error && <p className="text-center text-red py-10 text-[14px]">{error}</p>}
          {!error && !levantamiento && <div className="rounded-2xl bg-surface-2 h-40 animate-pulse" />}
          {levantamiento && sistemas.length === 0 && (
            <p className="text-center text-muted py-10 text-[14px]">Este levantamiento no tiene sistemas revisados. Edítalo para agregarlos, o arma la cotización desde cero.</p>
          )}

          {nombresSistemas.map((nombre) => {
            const s = sistemas.find((x) => (x.sistema.trim() || 'General') === nombre);
            return (
              <section key={nombre}>
                <p className="font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-1.5">{nombre}</p>
                {s?.observaciones && (
                  <details className="mb-2 text-[12.5px] text-muted">
                    <summary className="cursor-pointer select-none">Ver observaciones del levantamiento</summary>
                    <p className="mt-1 whitespace-pre-wrap leading-relaxed">{s.observaciones}</p>
                  </details>
                )}
                <div className="flex flex-col gap-2">
                  {conceptos.filter((c) => c.sistema === nombre).map((c) => (
                    <TarjetaConcepto
                      key={c.id}
                      concepto={c}
                      parecido={parecidos[c.id] || null}
                      onCambiar={(cambio) => cambiar(c.id, cambio)}
                      onUsarParecido={() => usarParecido(c)}
                      onQuitar={c.origen === 'manual' ? () => quitar(c.id) : undefined}
                    />
                  ))}
                </div>
                <button type="button" onClick={() => agregar(nombre)} className="mt-2 h-9 px-3 rounded-full border border-dashed border-teal/50 text-teal text-[13px] font-semibold flex items-center gap-1.5 hover:bg-teal/5">
                  <Plus size={14} /> Agregar concepto
                </button>
              </section>
            );
          })}
        </div>

        <div className="p-4 border-t border-line flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold">{marcados} {marcados === 1 ? 'concepto marcado' : 'conceptos marcados'}</p>
            <p className="text-[12px] text-muted">{ligados > 0 ? `${ligados} ya con producto. ` : ''}Los demás se ligan con «Ligar con SYSCOM» en la cotización.</p>
            {aviso && <p className="text-[12.5px] text-red font-semibold mt-1">{aviso}</p>}
          </div>
          <button type="button" onClick={armar} disabled={!levantamiento}
            className="min-h-[48px] px-5 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-glow-teal disabled:opacity-50">
            <ClipboardList size={17} /> Armar cotización
          </button>
        </div>
      </div>
    </div>
  );
}

function TarjetaConcepto({
  concepto: c,
  parecido,
  onCambiar,
  onUsarParecido,
  onQuitar,
}: {
  concepto: ConceptoPropuesto;
  parecido: ReturnType<typeof buscarEnCatalogo>;
  onCambiar: (cambio: Partial<ConceptoPropuesto>) => void;
  onUsarParecido: () => void;
  onQuitar?: () => void;
}) {
  const conProducto = Boolean(c.enlace);
  const editado = c.textoOriginal && c.descripcion.trim() !== c.textoOriginal;
  let estado = { texto: 'Sin producto ligado', Icono: CircleDashed, clase: 'text-amber' };
  if (c.origen === 'mano_obra') estado = { texto: 'Pon el precio en la cotización', Icono: Wrench, clase: 'text-muted' };
  if (conProducto) estado = { texto: c.costo !== null ? `Con producto · costo ${money(c.costo)}` : 'Con enlace de producto', Icono: CircleCheck, clase: 'text-teal' };

  return (
    <div className={`rounded-2xl border p-3 transition-colors ${c.incluir ? 'border-teal/40 bg-surface' : 'border-line bg-surface-2/60 opacity-75'}`}>
      <div className="flex items-start gap-2.5">
        <button type="button" role="checkbox" aria-checked={c.incluir} aria-label={c.incluir ? 'Quitar de la cotización' : 'Incluir en la cotización'}
          onClick={() => onCambiar({ incluir: !c.incluir })}
          className={`mt-0.5 w-6 h-6 shrink-0 rounded-md border flex items-center justify-center ${c.incluir ? 'bg-teal border-teal text-inkOnAccent' : 'border-line-strong'}`}>
          {c.incluir && <Check size={15} strokeWidth={3} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10.5px] uppercase tracking-wider font-semibold text-muted">{ETIQUETA_ORIGEN[c.origen]}</span>
            <span className={`text-[11.5px] flex items-center gap-1 ${estado.clase}`}><estado.Icono size={13} /> {estado.texto}</span>
            {onQuitar && (
              <button type="button" onClick={onQuitar} aria-label="Quitar concepto" className="ml-auto text-faint hover:text-red"><Trash2 size={14} /></button>
            )}
          </div>
          <textarea
            id={`concepto-${c.id}`}
            value={c.descripcion}
            onChange={(e) => onCambiar({ descripcion: e.target.value })}
            rows={2}
            placeholder="Descripción del concepto"
            className="w-full rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none px-3 py-2 text-[13.5px] leading-snug resize-y"
          />
          {editado && <p className="text-[11.5px] text-faint mt-0.5 line-clamp-2">Decía: {c.textoOriginal}</p>}
          <div className="flex items-center gap-2 mt-2">
            <label className="text-[12px] text-muted" htmlFor={`cantidad-${c.id}`}>Cant.</label>
            <input
              id={`cantidad-${c.id}`}
              type="number" inputMode="decimal" min={0} step="any"
              value={Number.isFinite(c.cantidad) ? c.cantidad : ''}
              onChange={(e) => onCambiar({ cantidad: e.target.value === '' ? NaN : Number(e.target.value) })}
              className="w-20 h-9 rounded-lg bg-surface-2 border border-line focus:border-teal focus:outline-none px-2 text-[13.5px] tabular-nums"
            />
            <input
              aria-label="Unidad"
              list="unidades-levantamiento"
              value={c.unidad}
              onChange={(e) => onCambiar({ unidad: e.target.value })}
              className="w-20 h-9 rounded-lg bg-surface-2 border border-line focus:border-teal focus:outline-none px-2 text-[13.5px]"
            />
            <datalist id="unidades-levantamiento">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
          </div>
          {parecido && !conProducto && (
            <div className="mt-2 rounded-xl border border-teal/40 bg-teal/8 p-2 flex items-center gap-2">
              <p className="flex-1 min-w-0 text-[12px] leading-snug">
                <span className="font-semibold text-teal">Ya se cotizó antes:</span> {parecido.descripcion}
                {parecido.costo !== null && <span className="text-muted"> · {money(parecido.costo)}</span>}
              </p>
              <button type="button" onClick={onUsarParecido} className="shrink-0 h-8 px-3 rounded-full bg-teal text-inkOnAccent text-[12px] font-semibold">Usar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
