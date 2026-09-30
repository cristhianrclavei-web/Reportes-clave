'use client';

import { memo, useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { ClipboardCheck, Check, X, Minus, Plus, ListPlus, History, Search, Trash2, ChevronDown, Calculator } from 'lucide-react';
import {
  FormatoLlenado, Frecuencia, PLANTILLAS, Resultado, PuntoLlenado,
  ETIQUETA_FRECUENCIA, cambiarVisita, frecuenciasDe, nuevoFormato, resumenFormato,
  DispositivoPrueba, ResultadoDispositivo, TIPOS_DISPOSITIVO, MOTIVOS_FALLA, MOTIVOS_NO_PROBADO,
  nuevoDispositivo, siguienteDireccion, resumenDispositivos, sincronizarDispositivos, tipoDispositivo,
} from '@/lib/formatosMantenimiento';
import { createClient } from '@/lib/supabaseClient';

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
      {p.desdeDispositivos ? (
        <div className="mt-2.5 rounded-xl bg-surface-2 border border-line px-3 py-2 text-[12.5px] flex items-start gap-2">
          <Calculator size={15} className="text-teal shrink-0 mt-0.5" />
          <span className="flex-1 min-w-0">
            <b className={p.resultado === 'cumple' ? 'text-teal' : p.resultado === 'no_cumple' ? 'text-red' : 'text-muted'}>
              {p.resultado === 'cumple' ? 'Cumple' : p.resultado === 'no_cumple' ? 'No cumple' : p.resultado === 'na' ? 'N/A (sin dispositivos de este tipo)' : 'Faltan dispositivos por marcar'}
            </b>
            {p.valor && <span className="text-muted"> · {p.valor}</span>}
            <span className="block text-muted">Se calcula con la tabla de pruebas por dispositivo.</span>
          </span>
        </div>
      ) : (
      <>
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
      </>
      )}
    </div>
  );
}

export function PasoFormato({
  formatos,
  setFormatos,
  clienteId,
}: {
  formatos: FormatoLlenado[];
  setFormatos: Dispatch<SetStateAction<FormatoLlenado[]>>;
  clienteId?: string | null;
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
            {f.campos && f.campos.length > 0 && (
              <div className={cardCls}>
                <p className={cardTitleCls}>
                  <span className="w-1.5 h-1.5 rounded-full bg-teal inline-block" /> Datos del sistema
                </p>
                <div className="grid gap-3">
                  {f.campos.map((c) => (
                    <div key={c.key}>
                      <label className={labelCls}>{c.label}</label>
                      <input
                        type="text"
                        className={inputCls}
                        placeholder={c.placeholder}
                        value={f.datos?.[c.key] || ''}
                        onChange={(e) => cambiar(i, { datos: { ...(f.datos || {}), [c.key]: e.target.value } })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {f.dispositivos && (
              <PruebasDispositivos formato={f} indice={i} setFormatos={setFormatos} clienteId={clienteId} />
            )}
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
  let sinDisp = false, dispPend = 0, dispSinMotivo = 0;
  for (const f of formatos) {
    for (const p of f.puntos) {
      if (p.desdeDispositivos) continue;
      if (p.resultado === null) sinMarcar++;
      if (p.resultado === 'no_cumple' && !p.nota.trim()) sinNota++;
    }
    if (f.dispositivos) {
      if (f.dispositivos.length === 0) sinDisp = true;
      for (const d of f.dispositivos) {
        if (d.resultado === null) dispPend++;
        else if (d.resultado !== 'pasa' && !d.nota.trim()) dispSinMotivo++;
      }
    }
  }
  const partes: string[] = [];
  if (sinDisp) partes.push('agregar los dispositivos probados');
  if (dispPend) partes.push(`${dispPend} dispositivo(s) sin resultado`);
  if (dispSinMotivo) partes.push(`${dispSinMotivo} dispositivo(s) con falla o sin probar sin motivo`);
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
            {Array.isArray(f.dispositivos) && f.dispositivos.length > 0 && (() => {
              const d = resumenDispositivos(f.dispositivos);
              return (
                <p className="text-[12.5px] mt-2">
                  <span className="text-muted">Dispositivos: </span>
                  <b>{d.total}</b> · <span className="text-teal font-semibold">{d.pasa} pasan</span>
                  {d.falla > 0 && <> · <span className="text-red font-semibold">{d.falla} fallan</span></>}
                  {d.noProbado > 0 && <> · <span className="text-amber font-semibold">{d.noProbado} sin probar</span></>}
                </p>
              );
            })()}
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

// ------------------------------------------------------------------
// Tabla de pruebas por dispositivo (formato «Pruebas de dispositivos»)
// ------------------------------------------------------------------
// Pensada para capturar en sitio con el celular: «Agregar» deja el formulario
// abierto y avanza la dirección (L1-045 → L1-046); «Agregar varios» crea un
// rango de direcciones de una vez; «Cargar del último servicio» trae la lista
// del cliente para no volver a escribirla en cada visita.

const BOTONES_DISP: { r: ResultadoDispositivo; label: string; activo: string }[] = [
  { r: 'pasa', label: 'Pasa', activo: 'bg-teal text-inkOnAccent border-teal' },
  { r: 'falla', label: 'Falla', activo: 'bg-red text-white border-red' },
  { r: 'no_probado', label: 'No probado', activo: 'bg-amber text-white border-amber' },
];

type Filtro = 'todos' | 'pendientes' | 'observaciones';

function PruebasDispositivos({
  formato,
  indice,
  setFormatos,
  clienteId,
}: {
  formato: FormatoLlenado;
  indice: number;
  setFormatos: Dispatch<SetStateAction<FormatoLlenado[]>>;
  clienteId?: string | null;
}) {
  const onChange = useCallback(
    (fn: (lista: DispositivoPrueba[]) => DispositivoPrueba[]) =>
      setFormatos((prev) =>
        prev.map((x, j) => (j === indice ? sincronizarDispositivos({ ...x, dispositivos: fn(x.dispositivos || []) }) : x))
      ),
    [setFormatos, indice]
  );
  // Datos del sistema del servicio anterior: solo llena los que están vacíos.
  const onDatos = (datos: Record<string, string>) =>
    setFormatos((prev) =>
      prev.map((x, j) =>
        j === indice ? { ...x, datos: { ...datos, ...Object.fromEntries(Object.entries(x.datos || {}).filter(([, v]) => v)) } } : x
      )
    );
  const lista = formato.dispositivos || [];
  const r = resumenDispositivos(lista);
  const [modo, setModo] = useState<'uno' | 'varios' | null>(lista.length === 0 ? 'uno' : null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [buscar, setBuscar] = useState('');
  const [cargando, setCargando] = useState(false);
  const [avisoCarga, setAvisoCarga] = useState<string | null>(null);

  // Formulario «Agregar»
  const [tipo, setTipo] = useState(TIPOS_DISPOSITIVO[0].key);
  const [dir, setDir] = useState('');
  const [ubic, setUbic] = useState('');
  // Formulario «Agregar varios»
  const [prefijo, setPrefijo] = useState('L1-');
  const [desde, setDesde] = useState('001');
  const [hasta, setHasta] = useState('');
  const [ubicVarios, setUbicVarios] = useState('');

  function agregar(resultado: ResultadoDispositivo | null) {
    const d = { ...nuevoDispositivo(tipo, dir.trim(), ubic.trim()), resultado };
    onChange((l) => [...l, d]);
    if (dir.trim()) setDir(siguienteDireccion(dir.trim()));
    setUbic('');
  }

  const nDesde = parseInt(desde, 10);
  const nHasta = parseInt(hasta, 10);
  const rangoOk = !Number.isNaN(nDesde) && !Number.isNaN(nHasta) && nHasta >= nDesde && nHasta - nDesde < 500;
  function agregarVarios() {
    if (!rangoOk) return;
    const ancho = desde.length;
    const nuevos: DispositivoPrueba[] = [];
    for (let n = nDesde; n <= nHasta; n++) {
      nuevos.push(nuevoDispositivo(tipo, `${prefijo}${String(n).padStart(ancho, '0')}`, ubicVarios.trim()));
    }
    onChange((l) => [...l, ...nuevos]);
    setModo(null);
    setHasta('');
  }

  async function cargarAnterior() {
    if (!clienteId) return;
    setCargando(true);
    setAvisoCarga(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('reports')
        .select('fecha, data')
        .eq('cliente_id', clienteId)
        .contains('data', { formatosMtto: [{ plantillaId: formato.plantillaId }] })
        .order('fecha', { ascending: false })
        .limit(1);
      if (error) throw error;
      const previo = (data?.[0]?.data?.formatosMtto || []).find((x: FormatoLlenado) => x.plantillaId === formato.plantillaId) as FormatoLlenado | undefined;
      const anteriores = previo?.dispositivos || [];
      if (!anteriores.length) {
        setAvisoCarga('Este cliente no tiene un servicio anterior con pruebas de dispositivos.');
        return;
      }
      const ya = new Set(lista.map((d) => `${d.tipo}|${d.direccion}|${d.ubicacion}`));
      const nuevos = anteriores
        .filter((d) => !ya.has(`${d.tipo}|${d.direccion}|${d.ubicacion}`))
        .map((d) => ({ ...nuevoDispositivo(d.tipo, d.direccion, d.ubicacion), metodo: d.metodo || tipoDispositivo(d.tipo)?.metodos[0] || '' }));
      onChange((l) => [...l, ...nuevos]);
      if (previo?.datos) onDatos(previo.datos);
      setModo(null);
      setAvisoCarga(`Se cargaron ${nuevos.length} dispositivo(s) del servicio del ${data![0].fecha}. Marca el resultado de cada uno.`);
    } catch {
      setAvisoCarga('No se pudo consultar el servicio anterior. Revisa la conexión.');
    } finally {
      setCargando(false);
    }
  }

  const cambiarDisp = useCallback(
    (id: string, c: Partial<DispositivoPrueba>) => onChange((l) => l.map((d) => (d.id === id ? { ...d, ...c } : d))),
    [onChange]
  );
  const quitarDisp = useCallback((id: string) => onChange((l) => l.filter((d) => d.id !== id)), [onChange]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return lista
      .map((d, n) => ({ d, n }))
      .filter(({ d }) =>
        filtro === 'pendientes' ? d.resultado === null : filtro === 'observaciones' ? d.resultado === 'falla' || d.resultado === 'no_probado' : true
      )
      .filter(({ d }) => !q || `${d.direccion} ${d.ubicacion} ${tipoDispositivo(d.tipo)?.label || ''}`.toLowerCase().includes(q));
  }, [lista, filtro, buscar]);

  const hechos = r.total - r.pendientes;

  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between gap-2">
        <p className={cardTitleCls}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Pruebas por dispositivo
        </p>
        <span className={`text-[13px] font-bold tabular-nums ${r.total && r.pendientes === 0 ? 'text-teal' : 'text-muted'}`}>{hechos}/{r.total}</span>
      </div>
      <p className="text-[12.5px] text-muted -mt-2 mb-3">
        Registra cada detector, estación manual o photobeam probado con su dirección y ubicación. Si falla o no se pudo probar, anota el motivo.
      </p>

      {r.total > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 text-[12px] font-semibold">
          <span className="px-2 py-0.5 rounded-full bg-teal/12 text-teal">{r.pasa} pasan</span>
          {r.falla > 0 && <span className="px-2 py-0.5 rounded-full bg-red/12 text-red">{r.falla} fallan</span>}
          {r.noProbado > 0 && <span className="px-2 py-0.5 rounded-full bg-amber/15 text-amber">{r.noProbado} sin probar</span>}
          {r.pendientes > 0 && <span className="px-2 py-0.5 rounded-full bg-ink/8 text-muted">{r.pendientes} por marcar</span>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => setModo(modo === 'uno' ? null : 'uno')}
          className={`min-h-[42px] rounded-xl border text-[12.5px] font-semibold flex items-center justify-center gap-1.5 ${modo === 'uno' ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line'}`}>
          <Plus size={15} strokeWidth={2.6} /> Agregar
        </button>
        <button type="button" onClick={() => setModo(modo === 'varios' ? null : 'varios')}
          className={`min-h-[42px] rounded-xl border text-[12.5px] font-semibold flex items-center justify-center gap-1.5 ${modo === 'varios' ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line'}`}>
          <ListPlus size={15} strokeWidth={2.4} /> Varios
        </button>
        <button type="button" onClick={cargarAnterior} disabled={!clienteId || cargando}
          className="min-h-[42px] rounded-xl border text-[12.5px] font-semibold flex items-center justify-center gap-1.5 bg-surface-2 border-line disabled:opacity-45">
          <History size={15} strokeWidth={2.4} /> {cargando ? 'Cargando…' : 'Anterior'}
        </button>
      </div>
      {!clienteId && <p className="text-[11.5px] text-faint mt-1.5">«Anterior» carga la lista del último servicio; necesita el cliente elegido del catálogo.</p>}
      {avisoCarga && <p className="text-[12.5px] text-teal mt-2">{avisoCarga}</p>}

      {modo && (
        <div className="mt-3 rounded-xl border border-teal/40 bg-teal/5 p-3 grid gap-2.5">
          <div>
            <label className={labelCls}>Tipo de dispositivo</label>
            <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_DISPOSITIVO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          {modo === 'uno' ? (
            <>
              <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
                <div>
                  <label className={labelCls}>Dirección / zona</label>
                  <input className={inputCls} value={dir} onChange={(e) => setDir(e.target.value)} placeholder="L1-045" />
                </div>
                <div>
                  <label className={labelCls}>Ubicación</label>
                  <input className={inputCls} value={ubic} onChange={(e) => setUbic(e.target.value)} placeholder="Oficina 3, nivel 1" />
                </div>
              </div>
              <p className="text-[11.5px] text-muted">Toca el resultado para agregarlo; la dirección avanza sola a la siguiente.</p>
              <div className="grid grid-cols-3 gap-2">
                {BOTONES_DISP.map((b) => (
                  <button key={b.r} type="button" onClick={() => agregar(b.r)}
                    className={`min-h-[42px] rounded-xl border text-[13px] font-semibold active:scale-95 transition-all ${b.activo}`}>
                    {b.label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => agregar(null)} className="justify-self-start text-[12.5px] font-semibold text-teal py-1">
                Agregar sin resultado (probar después)
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>Prefijo</label>
                  <input className={inputCls} value={prefijo} onChange={(e) => setPrefijo(e.target.value)} placeholder="L1-" />
                </div>
                <div>
                  <label className={labelCls}>Desde</label>
                  <input className={inputCls} inputMode="numeric" value={desde} onChange={(e) => setDesde(e.target.value.replace(/\D/g, ''))} placeholder="001" />
                </div>
                <div>
                  <label className={labelCls}>Hasta</label>
                  <input className={inputCls} inputMode="numeric" value={hasta} onChange={(e) => setHasta(e.target.value.replace(/\D/g, ''))} placeholder="060" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Ubicación (opcional, para todos)</label>
                <input className={inputCls} value={ubicVarios} onChange={(e) => setUbicVarios(e.target.value)} placeholder="Nave 2" />
              </div>
              <button type="button" onClick={agregarVarios} disabled={!rangoOk}
                className="min-h-[42px] rounded-xl bg-teal text-inkOnAccent text-[13.5px] font-semibold disabled:opacity-45">
                {rangoOk ? `Agregar ${nHasta - nDesde + 1} dispositivo(s): ${prefijo}${desde} a ${prefijo}${String(nHasta).padStart(desde.length, '0')}` : 'Escribe el rango (máx. 500)'}
              </button>
            </>
          )}
        </div>
      )}

      {r.total > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-x-1 mt-4">
            {([['todos', `Todos (${r.total})`], ['pendientes', `Por marcar (${r.pendientes})`], ['observaciones', `Fallas / sin probar (${r.falla + r.noProbado})`]] as [Filtro, string][]).map(([k, l]) => (
              <span key={k} className={chipCls(filtro === k)} onClick={() => setFiltro(k)}>{l}</span>
            ))}
          </div>
          {r.total > 8 && (
            <div className="relative mb-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input className={`${inputCls} pl-9`} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar dirección o ubicación" />
            </div>
          )}
          <div className="mt-1">
            {visibles.map(({ d, n }) => (
              <FilaDispositivo key={d.id} d={d} n={n + 1} onCambiar={cambiarDisp} onQuitar={quitarDisp} />
            ))}
            {visibles.length === 0 && <p className="text-[13px] text-muted py-3">Nada con este filtro.</p>}
          </div>
        </>
      )}
    </div>
  );
}

const FilaDispositivo = memo(function FilaDispositivo({
  d, n, onCambiar, onQuitar,
}: {
  d: DispositivoPrueba;
  n: number;
  onCambiar: (id: string, c: Partial<DispositivoPrueba>) => void;
  onQuitar: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const t = tipoDispositivo(d.tipo);
  const motivos = d.resultado === 'falla' ? MOTIVOS_FALLA : d.resultado === 'no_probado' ? MOTIVOS_NO_PROBADO : [];
  const faltaMotivo = motivos.length > 0 && !d.nota.trim();

  return (
    <div className="py-3 border-t border-line first:border-t-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-faint tabular-nums w-6 shrink-0">{n}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-teal shrink-0">{t?.corto || d.tipo}</span>
        <span className="text-[14px] font-bold tabular-nums shrink-0">{d.direccion || '—'}</span>
        <input
          className="flex-1 min-w-0 bg-transparent border-b border-line focus:border-teal focus:outline-none text-[13.5px] py-0.5 placeholder:text-faint"
          value={d.ubicacion}
          onChange={(e) => onCambiar(d.id, { ubicacion: e.target.value })}
          placeholder="Ubicación"
        />
        <button type="button" onClick={() => setAbierto(!abierto)} aria-label="Más datos" className="w-8 h-8 rounded-lg flex items-center justify-center text-muted shrink-0">
          <ChevronDown size={17} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {BOTONES_DISP.map((b) => (
          <button
            key={b.r}
            type="button"
            onClick={() => onCambiar(d.id, { resultado: d.resultado === b.r ? null : b.r, ...(b.r === 'pasa' ? { nota: '' } : {}) })}
            className={`min-h-[38px] rounded-xl border text-[12.5px] font-semibold active:scale-95 transition-all ${d.resultado === b.r ? b.activo : 'bg-surface-2 border-line text-ink/75'}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      {motivos.length > 0 && (
        <div className="mt-2">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {motivos.map((m) => (
              <button key={m} type="button"
                onClick={() => onCambiar(d.id, { nota: d.nota.includes(m) ? d.nota : [d.nota.trim(), m].filter(Boolean).join(', ') })}
                className="px-2.5 py-1 rounded-full text-[11.5px] border border-line bg-surface-2 text-ink/80 active:scale-95">
                {m}
              </button>
            ))}
          </div>
          <input
            className={`${inputCls} ${faltaMotivo ? 'border-amber' : ''}`}
            value={d.nota}
            onChange={(e) => onCambiar(d.id, { nota: e.target.value })}
            placeholder={d.resultado === 'falla' ? '¿Qué falló?' : '¿Por qué no se probó?'}
          />
        </div>
      )}
      {abierto && (
        <div className="mt-2.5 grid gap-2 rounded-xl bg-surface-2/70 border border-line p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Tipo</label>
              <select className={inputCls} value={d.tipo}
                onChange={(e) => onCambiar(d.id, { tipo: e.target.value, metodo: tipoDispositivo(e.target.value)?.metodos[0] || '' })}>
                {TIPOS_DISPOSITIVO.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Dirección / zona</label>
              <input className={inputCls} value={d.direccion} onChange={(e) => onCambiar(d.id, { direccion: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Método de prueba</label>
            <select className={inputCls} value={d.metodo} onChange={(e) => onCambiar(d.id, { metodo: e.target.value })}>
              {(t?.metodos || []).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Medición (opcional)</label>
            <input className={inputCls} value={d.valor} onChange={(e) => onCambiar(d.id, { valor: e.target.value })} placeholder={t?.medicion || 'Valor medido'} />
          </div>
          <button type="button" onClick={() => onQuitar(d.id)} className="justify-self-start flex items-center gap-1.5 text-[12.5px] font-semibold text-red py-1">
            <Trash2 size={14} /> Quitar dispositivo
          </button>
        </div>
      )}
    </div>
  );
});
