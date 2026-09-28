'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { ClipboardCheck, Check, X, Minus } from 'lucide-react';
import {
  FormatoLlenado, Frecuencia, PLANTILLAS, Resultado, PuntoLlenado,
  ETIQUETA_FRECUENCIA, cambiarVisita, frecuenciasDe, nuevoFormato, resumenFormato,
} from '@/lib/formatosMantenimiento';

// Formatos de mantenimiento preventivo dentro del reporte:
//   · SelectorFormatos: tarjeta del paso «Trabajo» para decidir si el
//     servicio lleva formato y cuál (uno por sistema).
//   · PasoFormato: la lista de cotejo, en su propio paso.

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const cardCls = 'glass rounded-2xl p-4';
const cardTitleCls = 'font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-3.5 flex items-center gap-2';

function chipCls(selected: boolean) {
  return `px-3.5 py-2 rounded-full text-[13px] font-medium mr-2 mb-2 inline-block cursor-pointer active:scale-95 transition-all border ${
    selected ? 'bg-teal text-inkOnAccent border-teal shadow-glow-teal' : 'bg-surface-2 text-ink/80 border-line'
  }`;
}

export function SelectorFormatos({
  usaFormato,
  setUsaFormato,
  formatos,
  setFormatos,
  sistemas,
  onAgregarSistema,
}: {
  usaFormato: boolean;
  setUsaFormato: (v: boolean) => void;
  formatos: FormatoLlenado[];
  setFormatos: Dispatch<SetStateAction<FormatoLlenado[]>>;
  sistemas: string[];
  onAgregarSistema: (s: string) => void;
}) {
  // Se muestran los formatos de los sistemas marcados (y los ya elegidos);
  // el resto queda detrás de «Ver otros» para no hacer larga la lista.
  const [verTodos, setVerTodos] = useState(false);
  const relevantes = PLANTILLAS.filter(
    (p) => sistemas.includes(p.sistema) || formatos.some((f) => f.plantillaId === p.id)
  );
  const plantillas = verTodos || relevantes.length === 0 ? PLANTILLAS : relevantes;
  const ocultos = PLANTILLAS.length - plantillas.length;

  function alternar(id: string) {
    const ya = formatos.find((f) => f.plantillaId === id);
    if (ya) {
      setFormatos((prev) => prev.filter((f) => f.plantillaId !== id));
      return;
    }
    const p = PLANTILLAS.find((x) => x.id === id)!;
    setFormatos((prev) => (prev.some((f) => f.plantillaId === id) ? prev : [...prev, nuevoFormato(p)]));
    if (!sistemas.includes(p.sistema)) onAgregarSistema(p.sistema);
  }

  function visita(id: string, v: Frecuencia) {
    setFormatos((prev) => prev.map((f) => (f.plantillaId === id ? cambiarVisita(f, v) : f)));
  }

  return (
    <div className={cardCls}>
      <p className={cardTitleCls}>
        <span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Formato de mantenimiento
      </p>
      <p className="text-[13px] text-muted mb-3">¿Este servicio lleva formato de mantenimiento preventivo? Se anexa al final del PDF.</p>
      <span className={chipCls(!usaFormato)} onClick={() => setUsaFormato(false)}>No, solo el reporte</span>
      <span className={chipCls(usaFormato)} onClick={() => setUsaFormato(true)}>Sí, agregar formato</span>

      {usaFormato && (
        <div className="mt-2 flex flex-col gap-2.5">
          {plantillas.map((p) => {
            const f = formatos.find((x) => x.plantillaId === p.id);
            const sel = Boolean(f);
            return (
              <div key={p.id} className={`rounded-xl border p-3 transition-colors ${sel ? 'border-teal/60 bg-teal/5' : 'border-line bg-surface-2/60'}`}>
                <button type="button" onClick={() => alternar(p.id)} className="w-full flex items-start gap-3 text-left">
                  <span className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${sel ? 'bg-teal border-teal text-inkOnAccent' : 'border-line-strong'}`}>
                    {sel && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold">{p.titulo}</span>
                    <span className="block text-[12px] text-muted">{p.normas.map((n) => n.clave).join(' · ')}</span>
                  </span>
                </button>
                {f && (
                  <div className="mt-3 pl-8">
                    <p className={labelCls}>Tipo de visita</p>
                    {frecuenciasDe(p).map((k) => (
                      <span key={k} className={chipCls(f.visita === k)} onClick={() => visita(p.id, k)}>{ETIQUETA_FRECUENCIA[k]}</span>
                    ))}
                    <p className="text-[12px] text-muted">{f.puntos.length} puntos a revisar{f.visita !== frecuenciasDe(p)[0] ? ' (incluye los de menor frecuencia)' : ''}.</p>
                  </div>
                )}
              </div>
            );
          })}
          {ocultos > 0 && (
            <button type="button" onClick={() => setVerTodos(true)} className="self-start text-[13px] font-semibold text-teal py-1">
              Ver otros formatos ({ocultos})
            </button>
          )}
          {formatos.length === 0 && <p className="text-[12.5px] text-amber">Elige al menos un formato, o marca «No, solo el reporte».</p>}
        </div>
      )}
    </div>
  );
}

const BOTONES: { r: Resultado; label: string; Icono: typeof Check; activo: string }[] = [
  { r: 'cumple', label: 'Cumple', Icono: Check, activo: 'bg-teal text-inkOnAccent border-teal' },
  { r: 'no_cumple', label: 'No cumple', Icono: X, activo: 'bg-red text-white border-red' },
  { r: 'na', label: 'N/A', Icono: Minus, activo: 'bg-ink/70 text-bg border-ink/70' },
];

function Punto({ p, n, onChange }: { p: PuntoLlenado; n: number; onChange: (c: Partial<PuntoLlenado>) => void }) {
  return (
    <div className={`py-3.5 border-t border-line first:border-t-0 ${p.resultado === null ? '' : 'opacity-95'}`}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-teal">{n}. {p.componente}</span>
        <span className="text-[10.5px] text-muted shrink-0">{ETIQUETA_FRECUENCIA[p.frecuencia]}</span>
      </div>
      <p className="text-[14px] leading-snug">{p.actividad}</p>
      <p className="text-[12.5px] text-muted mt-1 leading-snug">
        <b className="font-semibold text-ink/70">Criterio:</b> {p.criterio}
        {p.ref && <span className="text-faint"> · {p.ref}</span>}
      </p>
      <div className="grid grid-cols-3 gap-2 mt-2.5">
        {BOTONES.map((b) => (
          <button
            key={b.r}
            type="button"
            onClick={() => onChange({ resultado: p.resultado === b.r ? null : b.r })}
            className={`min-h-[42px] rounded-xl border text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all ${
              p.resultado === b.r ? b.activo : 'bg-surface-2 border-line text-ink/75'
            }`}
          >
            <b.Icono size={15} strokeWidth={2.6} /> {b.label}
          </button>
        ))}
      </div>
      {(p.medicion || p.resultado === 'no_cumple') && (
        <div className="mt-2.5 grid gap-2">
          {p.medicion && (
            <input
              type="text"
              className={inputCls}
              placeholder={`Medición (${p.medicion})`}
              value={p.valor}
              onChange={(e) => onChange({ valor: e.target.value })}
            />
          )}
          {p.resultado === 'no_cumple' && (
            <textarea
              className={`${inputCls} min-h-[64px]`}
              placeholder="¿Qué se encontró? (anomalía)"
              value={p.nota}
              onChange={(e) => onChange({ nota: e.target.value })}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function PasoFormato({
  formatos,
  setFormatos,
}: {
  formatos: FormatoLlenado[];
  setFormatos: Dispatch<SetStateAction<FormatoLlenado[]>>;
}) {
  function cambiar(i: number, cambios: Partial<FormatoLlenado>) {
    setFormatos((prev) => prev.map((f, j) => (j === i ? { ...f, ...cambios } : f)));
  }
  function cambiarPunto(i: number, k: number, c: Partial<PuntoLlenado>) {
    setFormatos((prev) =>
      prev.map((f, j) => (j === i ? { ...f, puntos: f.puntos.map((p, m) => (m === k ? { ...p, ...c } : p)) } : f))
    );
  }

  return (
    <>
      {formatos.map((f, i) => {
        const r = resumenFormato(f);
        const hechos = r.total - r.pendientes;
        return (
          <div key={f.plantillaId} className="flex flex-col gap-4">
            <div className={cardCls}>
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-teal/12 text-teal flex items-center justify-center shrink-0">
                  <ClipboardCheck size={20} strokeWidth={2.2} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-[15px] leading-tight">{f.titulo}</p>
                  <p className="text-[12px] text-muted">Visita {ETIQUETA_FRECUENCIA[f.visita].toLowerCase()} · {f.normas.map((n) => n.clave).join(' · ')}</p>
                </div>
                <span className={`text-[13px] font-bold tabular-nums shrink-0 ${r.pendientes === 0 ? 'text-teal' : 'text-muted'}`}>
                  {hechos}/{r.total}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-line mt-3 overflow-hidden">
                <div className="h-full bg-teal transition-all" style={{ width: `${r.total ? (hechos / r.total) * 100 : 0}%` }} />
              </div>
              {r.noCumple > 0 && <p className="text-[12.5px] text-red font-semibold mt-2">{r.noCumple} punto(s) no cumplen</p>}

              <div className="mt-2">
                {f.puntos.map((p, k) => (
                  <Punto key={p.id} p={p} n={k + 1} onChange={(c) => cambiarPunto(i, k, c)} />
                ))}
              </div>
            </div>

            <div className={cardCls}>
              <div className="mb-3">
                <label className={labelCls}>Áreas revisadas</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Ej. Planta baja, almacén, oficinas nivel 1"
                  value={f.areas}
                  onChange={(e) => cambiar(i, { areas: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Acciones correctivas recomendadas</label>
                <textarea
                  className={`${inputCls} min-h-[72px]`}
                  value={f.recomendaciones}
                  onChange={(e) => cambiar(i, { recomendaciones: e.target.value })}
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// Lo que falta para dar por terminado el paso: puntos sin marcar y «No
// cumple» sin descripción (la NOM-002 pide registrar las anomalías).
export function pendientesFormatos(formatos: FormatoLlenado[]): string | null {
  let sinMarcar = 0, sinNota = 0;
  for (const f of formatos) {
    for (const p of f.puntos) {
      if (p.resultado === null) sinMarcar++;
      if (p.resultado === 'no_cumple' && !p.nota.trim()) sinNota++;
    }
  }
  const partes: string[] = [];
  if (sinMarcar) partes.push(`${sinMarcar} punto(s) sin marcar (usa N/A si no aplica)`);
  if (sinNota) partes.push(`${sinNota} «No cumple» sin describir qué se encontró`);
  return partes.length ? 'En el formato falta: ' + partes.join(' y ') + '.' : null;
}

// Resumen para el detalle del reporte y la vista previa: por formato, cuántos
// puntos cumplen y los hallazgos. La lista completa va en el PDF.
export function ResumenFormatos({ formatos }: { formatos?: FormatoLlenado[] }) {
  if (!Array.isArray(formatos) || formatos.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {formatos.map((f) => {
        const r = resumenFormato(f);
        const hallazgos = f.puntos.filter((p) => p.resultado === 'no_cumple');
        return (
          <div key={f.plantillaId} className="rounded-xl border border-line bg-surface-2/60 p-3">
            <div className="flex items-start gap-2.5">
              <ClipboardCheck size={18} strokeWidth={2.2} className="text-teal shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold leading-tight">{f.titulo}</p>
                <p className="text-[12px] text-muted">Visita {ETIQUETA_FRECUENCIA[f.visita]?.toLowerCase()} · {f.normas.map((n) => n.clave).join(' · ')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2.5 text-[12px] font-semibold">
              <span className="px-2 py-0.5 rounded-full bg-teal/12 text-teal">{r.cumple} cumplen</span>
              {r.noCumple > 0 && <span className="px-2 py-0.5 rounded-full bg-red/12 text-red">{r.noCumple} no cumplen</span>}
              {r.na > 0 && <span className="px-2 py-0.5 rounded-full bg-ink/8 text-muted">{r.na} N/A</span>}
              {r.pendientes > 0 && <span className="px-2 py-0.5 rounded-full bg-amber/15 text-amber">{r.pendientes} sin marcar</span>}
            </div>
            {hallazgos.length > 0 && (
              <ul className="mt-2.5 text-[13px] space-y-1">
                {hallazgos.map((p) => (
                  <li key={p.id}><b className="text-red">{p.componente}:</b> {p.nota || p.actividad}</li>
                ))}
              </ul>
            )}
            {f.areas && <p className="text-[12.5px] text-muted mt-2">Áreas: {f.areas}</p>}
            {f.recomendaciones && <p className="text-[13px] mt-1.5"><span className="text-muted">Recomendaciones: </span>{f.recomendaciones}</p>}
          </div>
        );
      })}
    </div>
  );
}
