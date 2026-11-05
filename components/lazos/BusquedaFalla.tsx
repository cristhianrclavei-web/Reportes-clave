'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Image as IconoGaleria, Plus, Scissors, Trash2, X } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import DiagramaLazo, { EstadoEnFalla } from '@/components/lazos/DiagramaLazo';
import { confirmar } from '@/lib/dialogos';
import { generarUUID } from '@/lib/uuid';
import {
  Corte, Elemento, Falla, Lazo, corteSugerido, cortesRestantes, direccionVisible, enOrdenDeRecorrido, ladoCampo, lineaPrincipal,
  posiciones, zonaConFalla,
} from '@/lib/lazos';
import ElegirDispositivo from '@/components/lazos/ElegirDispositivo';
import VerFoto from '@/components/lazos/VerFoto';
import { ResultadoGuardar, borrarCorte, guardarCorte, guardarFalla, subirFotoFalla } from '@/lib/lazosDatos';

// Búsqueda de falla a tierra seccionando el lazo. Cada corte dice dónde se
// abrió (a la salida de qué dispositivo, en la línea o dentro de una rama) y
// de qué lado quedó la falla; con eso se pinta dónde está y se sugiere el
// siguiente corte, el que parte lo que queda más cerca de la mitad.

const CAMPO = 'w-full px-3 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';

// «LZ1_SH_4 · L01D004», para reconocer el equipo por su dirección.
function conDireccion(e: Elemento, lazo: Lazo): string {
  const direccion = direccionVisible(e.direccion, lazo.numero);
  return direccion ? `${e.nombre} · ${direccion}` : e.nombre;
}

function fecha(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Fallas ya encontradas en este lazo: cuándo, dónde, por qué y su foto.
function FallasEncontradas({ lazo, elementos, resueltas, onTocar }: {
  lazo: Lazo;
  elementos: Elemento[];
  resueltas: Falla[];
  onTocar: (elemento: Elemento) => void;
}) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted mb-2">Fallas encontradas</h3>
      {resueltas.length === 0 && <p className="text-[13px] text-muted">Todavía no se ha cerrado ninguna búsqueda en este lazo.</p>}
      <ul className="flex flex-col gap-2">
        {resueltas.map((f) => {
          const elemento = elementos.find((e) => e.id === f.elemento_id) || null;
          return (
            <li key={f.id} className="rounded-xl bg-surface border border-line p-3 text-[13.5px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-amber">{fecha(f.resuelta_en)}</span>
              </div>
              <p className="mt-1">
                <span className="text-muted">Dónde: </span>
                {elemento ? (
                  <button type="button" onClick={() => onTocar(elemento)} className="font-mono underline decoration-dotted underline-offset-2">
                    {conDireccion(elemento, lazo)}
                  </button>
                ) : f.elemento_id ? 'un dispositivo que ya se borró' : 'en el cable, entre dispositivos'}
              </p>
              {elemento?.ubicacion && <p className="text-muted text-[12.5px]">{elemento.ubicacion}</p>}
              {f.causa && <p className="mt-1"><span className="text-muted">Causa: </span>{f.causa}</p>}
              {f.foto_path && <VerFoto path={f.foto_path} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function BusquedaFalla({ lazo, elementos, falla, cortes, resueltas, onCambio, onTocar }: {
  lazo: Lazo;
  elementos: Elemento[];
  falla: Falla | null;
  cortes: Corte[];
  resueltas: Falla[];
  // Avisa al padre qué cambió para que actualice sus datos.
  onCambio: (cambio: { falla?: Falla | null; corte?: Corte; corteBorrado?: string }, resultado: ResultadoGuardar) => void;
  onTocar: (elemento: Elemento) => void;
}) {
  const [registrando, setRegistrando] = useState(false);
  const [resolviendo, setResolviendo] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const principal = lineaPrincipal(elementos);
  const total = principal.length;
  const pos = posiciones(elementos);

  async function iniciar() {
    setIniciando(true);
    setError(null);
    const nueva: Falla = {
      id: generarUUID(), lazo_id: lazo.id, estado: 'abierta', elemento_id: null, causa: null,
      // Hora del teléfono: si queda en la cola, al subir conserva cuándo se abrió.
      abierta_en: new Date().toISOString(), resuelta_en: null,
    };
    try {
      const resultado = await guardarFalla(nueva);
      onCambio({ falla: nueva }, resultado);
    } catch (e: any) {
      setError(e?.message || 'No se pudo iniciar la búsqueda.');
    }
    setIniciando(false);
  }

  if (!falla) {
    return (
      <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-surface border border-line p-4">
        <h2 className="font-display font-bold text-[20px]">Búsqueda de falla a tierra</h2>
        <p className="text-[14px] text-muted mt-1.5 leading-relaxed">
          Registra cada corte que hagas al seccionar el lazo. La app marca el tramo donde quedó la falla y te dice dónde cortar para partirlo a la mitad.
        </p>
        {total < 2 && <p className="text-[13px] text-amber mt-3">Primero captura los dispositivos del lazo en orden.</p>}
        {error && <p className="text-red font-semibold text-[13px] mt-3">{error}</p>}
        <button type="button" onClick={iniciar} disabled={iniciando || total < 2}
          className="w-full mt-4 min-h-[50px] rounded-xl bg-amber text-inkOnAccent font-semibold text-[15px] disabled:opacity-50">
          {iniciando ? 'Iniciando…' : 'Iniciar búsqueda de falla a tierra'}
        </button>
      </div>
      <FallasEncontradas lazo={lazo} elementos={elementos} resueltas={resueltas} onTocar={onTocar} />
      </div>
    );
  }

  // Cortes en el orden en que se hicieron, con la posición de cada uno.
  const conPosicion = [...cortes]
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en))
    .map((c, i) => ({ ...c, numero: i + 1, posicion: c.elemento_id ? pos.get(c.elemento_id) : undefined }));
  const validos = conPosicion.filter((c) => c.posicion !== undefined) as (Corte & { numero: number; posicion: number })[];
  const zona = zonaConFalla(elementos, validos.map((c) => ({ elementoId: c.elemento_id as string, lado: c.lado })));
  const elementoSugerido = corteSugerido(elementos, zona);
  const unoSolo = !zona.contradictorio && zona.ids.size === 1 ? elementos.find((e) => zona.ids.has(e.id)) || null : null;

  // Posiciones de la línea principal donde todavía puede estar la falla (una
  // posición cuenta si él o algo de sus ramas sigue en la zona).
  const posicionesEnZona = new Set<number>();
  for (const id of zona.ids) {
    const p = pos.get(id);
    if (p) posicionesEnZona.add(p);
  }
  const desde = Math.min(...posicionesEnZona);
  const hasta = Math.max(...posicionesEnZona);
  const textoPosiciones = desde === hasta ? `posición ${desde}` : `posiciones ${desde} a ${hasta}`;

  // Cómo se pinta cada dispositivo: antes del primer corte, nada.
  const estados = new Map<string, EstadoEnFalla>();
  if (validos.length > 0) {
    for (const e of elementos) estados.set(e.id, zona.ids.has(e.id) ? 'sospechoso' : 'descartado');
  }
  const marcas = new Map<string, number>();
  for (const c of validos) if (c.elemento_id) marcas.set(c.elemento_id, c.numero);

  async function quitarCorte(corte: Corte & { numero: number }) {
    const ok = await confirmar(`¿Quitar el corte ${corte.numero}?`, { detalle: 'Úsalo si se anotó mal. El tramo se vuelve a calcular.', textoAceptar: 'Quitar', tono: 'peligro' });
    if (!ok) return;
    try {
      const resultado = await borrarCorte(lazo.id, corte.id);
      onCambio({ corteBorrado: corte.id }, resultado);
    } catch (e: any) {
      setError(e?.message || 'No se pudo quitar el corte.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-surface border border-line p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13.5px] font-semibold">El lazo completo · {total} posiciones</span>
          <span className="text-[12px] text-muted">Abierta {hora(falla.abierta_en)}</span>
        </div>
        <div className="relative mt-6" aria-hidden="true">
          {validos.map((c) => (
            <span key={c.id} className="absolute -top-5 -translate-x-1/2 font-mono text-[10px] bg-ink text-bg rounded px-1"
              style={{ left: `${(c.posicion / total) * 100}%` }}>{c.numero}</span>
          ))}
          <div className="flex gap-px h-[18px]">
            {principal.map((e, i) => {
              const dentro = posicionesEnZona.has(i + 1);
              return <span key={e.id} className={`flex-1 rounded-[2px] ${validos.length === 0 ? 'bg-muted/40' : dentro ? 'bg-amber' : 'bg-line-strong'}`} />;
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-2.5 text-[11.5px] text-muted">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-line-strong" />Descartado</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber" />Aquí está la falla</span>
          <span className="flex items-center gap-1.5"><Scissors size={11} strokeWidth={2.4} />Corte</span>
        </div>
      </div>

      {zona.contradictorio && (
        <p className="flex gap-2 rounded-2xl bg-red/10 text-red text-[13.5px] p-3">
          <AlertTriangle size={18} strokeWidth={2.4} className="shrink-0" />
          Los cortes se contradicen: revisa que el lado anotado en el último sea el correcto, o vuelve a medir. Puede haber más de una falla.
        </p>
      )}

      {!zona.contradictorio && (
        <div className="rounded-2xl bg-amber/10 border border-amber/40 p-3.5">
          <p className="text-[13.5px] font-semibold text-amber">
            {validos.length === 0
              ? 'Todavía sin cortes: la falla puede estar en todo el lazo'
              : `Tramo con falla · ${zona.ids.size} ${zona.ids.size === 1 ? 'dispositivo' : 'dispositivos'} · ${textoPosiciones}`}
          </p>
          {unoSolo ? (
            <p className="text-[13.5px] mt-2">La falla está en <span className="font-mono">{conDireccion(unoSolo, lazo)}</span> o en el cable que llega a él. Revisa su cableado y su caja.</p>
          ) : elementoSugerido && (
            <p className="text-[13.5px] mt-2 flex gap-2">
              <Scissors size={17} strokeWidth={2.4} className="text-teal shrink-0 mt-0.5" />
              <span>
                <b className="font-semibold">Siguiente corte sugerido:</b> salida de <span className="font-mono">{conDireccion(elementoSugerido, lazo)}</span>
                {elementoSugerido.padre_id ? ' (en una rama)' : ` (pos. ${pos.get(elementoSugerido.id)})`}.
                {elementoSugerido.ubicacion && <span className="block text-muted text-[12.5px] mt-0.5">{elementoSugerido.ubicacion}</span>}
                <span className="block text-muted text-[12.5px] mt-0.5">Parte el tramo a la mitad. {cortesRestantes(zona.ids.size) === 1 ? 'Con 1 corte más se encuentra.' : `Con ${cortesRestantes(zona.ids.size)} cortes más como máximo se encuentra.`}</span>
              </span>
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl bg-surface border border-line p-3 overflow-x-auto">
        <DiagramaLazo lazo={lazo} elementos={elementos} estados={estados} cortes={marcas} onTocar={onTocar} />
      </div>

      <div>
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted mb-2">Cortes registrados</h3>
        {conPosicion.length === 0 && <p className="text-[13px] text-muted">Aún no hay cortes.</p>}
        <ul className="flex flex-col gap-2">
          {[...conPosicion].reverse().map((c) => {
            const elemento = elementos.find((e) => e.id === c.elemento_id);
            return (
              <li key={c.id} className="flex items-start gap-2.5 rounded-xl bg-surface border border-line p-2.5">
                <span className="font-mono text-[11px] bg-ink text-bg rounded px-1.5 py-0.5 shrink-0">{c.numero}</span>
                <div className="flex-1 min-w-0 text-[13px]">
                  <p>Abrí a la salida de <span className="font-mono">{elemento ? conDireccion(elemento, lazo) : 'un dispositivo borrado'}</span>{elemento?.padre_id ? ' (en una rama)' : c.posicion ? ` (pos. ${c.posicion})` : ''}</p>
                  {elemento?.ubicacion && <p className="text-muted text-[12.5px]">{elemento.ubicacion}</p>}
                  <p className="text-muted text-[12.5px]">
                    La falla quedó del lado {c.lado}{c.medicion ? ` · ${c.medicion}` : ''}{c.notas ? ` · ${c.notas}` : ''}
                  </p>
                </div>
                <span className="text-[11.5px] text-faint shrink-0">{hora(c.creado_en)}</span>
                <button type="button" onClick={() => quitarCorte(c)} aria-label={`Quitar el corte ${c.numero}`} className="w-8 h-8 -m-1 rounded-full flex items-center justify-center text-faint hover:text-red shrink-0">
                  <Trash2 size={15} strokeWidth={2.2} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {error && <p className="text-red font-semibold text-[13px]">{error}</p>}

      {/* pr-16: deja libre el botón flotante del asistente. */}
      <div className="flex gap-2 sticky bottom-0 bg-bg/95 py-3 pr-16 sm:pr-0" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={() => setRegistrando(true)}
          className="flex-[1.3] min-h-[52px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[15px] flex items-center justify-center gap-1.5">
          <Plus size={18} strokeWidth={2.6} /> Registrar corte
        </button>
        <button type="button" onClick={() => setResolviendo(true)}
          className="flex-1 min-h-[52px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px]">
          Encontré la falla
        </button>
      </div>

      {registrando && (
        <RegistrarCorte
          lazo={lazo} elementos={elementos} falla={falla} sugeridoId={elementoSugerido?.id || null}
          zona={validos.length > 0 ? zona.ids : null}
          onCerrar={() => setRegistrando(false)}
          onGuardado={(corte, resultado) => { onCambio({ corte }, resultado); setRegistrando(false); }}
        />
      )}
      {resolviendo && (
        <ResolverFalla
          lazo={lazo} elementos={elementos} falla={falla} sugeridoId={unoSolo?.id || null}
          zona={validos.length > 0 ? zona.ids : null}
          onCerrar={() => setResolviendo(false)}
          onGuardado={(resuelta, resultado) => { onCambio({ falla: resuelta }, resultado); setResolviendo(false); }}
        />
      )}
    </div>
  );
}

function RegistrarCorte({ lazo, elementos, falla, sugeridoId, zona, onCerrar, onGuardado }: {
  lazo: Lazo;
  elementos: Elemento[];
  zona: Set<string> | null;
  falla: Falla;
  sugeridoId: string | null;
  onCerrar: () => void;
  onGuardado: (corte: Corte, resultado: ResultadoGuardar) => void;
}) {
  // Solo donde abrir deja algo del lado campo: no el último de la línea ni
  // el último de una rama.
  const opciones = enOrdenDeRecorrido(elementos).filter((e) => ladoCampo(elementos, e).size > 0);
  const [elementoId, setElementoId] = useState(sugeridoId || '');
  const [lado, setLado] = useState<'panel' | 'campo' | null>(null);
  const [medicion, setMedicion] = useState('');
  const [notas, setNotas] = useState('');
  const [errores, setErrores] = useState<Partial<Record<'elemento' | 'lado' | 'general', string>>>({});
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const e: typeof errores = {};
    if (!elementoId) e.elemento = 'Elige dónde abriste el lazo.';
    if (!lado) e.lado = 'Indica de qué lado quedó la falla.';
    setErrores(e);
    if (Object.keys(e).length > 0) return;
    setGuardando(true);
    const corte: Corte = {
      id: generarUUID(), falla_id: falla.id, elemento_id: elementoId, lado: lado as 'panel' | 'campo',
      medicion: medicion.trim() || null, notas: notas.trim() || null,
      creado_en: new Date().toISOString(),
    };
    try {
      const resultado = await guardarCorte(lazo.id, corte);
      onGuardado(corte, resultado);
    } catch (err: any) {
      setErrores({ general: err?.message || 'No se pudo guardar el corte.' });
      setGuardando(false);
    }
  }

  const ladoBoton = (valor: 'panel' | 'campo', titulo: string, detalle: string) => (
    <button type="button" role="radio" aria-checked={lado === valor} onClick={() => setLado(valor)}
      className={`flex-1 rounded-xl border p-3 text-left ${lado === valor ? 'border-teal bg-teal/10' : 'border-line bg-surface-2'}`}>
      <span className="block text-[14px] font-semibold">{titulo}</span>
      <span className="block text-[12px] text-muted mt-0.5">{detalle}</span>
    </button>
  );

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-display font-bold text-[21px] mb-3">Registrar corte</h2>

        <span className="block text-[12.5px] text-muted mb-1">Abrí el lazo a la salida de</span>
        <ElegirDispositivo
          lazo={lazo} elementos={elementos} opciones={opciones} zona={zona}
          sugeridoId={sugeridoId} valor={elementoId} onCambiar={setElementoId}
        />
        {errores.elemento && <p className="text-red font-semibold text-[13px] mt-1">{errores.elemento}</p>}

        <span className="block text-[12.5px] text-muted mt-3 mb-1" id="corte-lado">¿De qué lado quedó la falla?</span>
        <div className="flex gap-2" role="radiogroup" aria-labelledby="corte-lado">
          {ladoBoton('panel', 'Lado panel', 'La falla sigue entre el panel y el corte')}
          {ladoBoton('campo', 'Lado campo', 'La falla está después del corte')}
        </div>
        {errores.lado && <p className="text-red font-semibold text-[13px] mt-1">{errores.lado}</p>}

        <div className="flex gap-2 mt-3">
          <div className="w-[130px] shrink-0">
            <label htmlFor="corte-medicion" className="block text-[12.5px] text-muted mb-1">Medición</label>
            <input id="corte-medicion" value={medicion} onChange={(ev) => setMedicion(ev.target.value)} maxLength={40} placeholder="40 kΩ" className={CAMPO} />
          </div>
          <div className="flex-1 min-w-0">
            <label htmlFor="corte-notas" className="block text-[12.5px] text-muted mb-1">Notas (opcional)</label>
            <input id="corte-notas" value={notas} onChange={(ev) => setNotas(ev.target.value)} maxLength={300} className={CAMPO} />
          </div>
        </div>

        {errores.general && <p className="text-red font-semibold text-[13px] mt-3">{errores.general}</p>}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCerrar} disabled={guardando} className="flex-1 min-h-[50px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px]">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="flex-[1.5] min-h-[50px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Guardar corte'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function ResolverFalla({ lazo, elementos, falla, sugeridoId, zona, onCerrar, onGuardado }: {
  lazo: Lazo;
  elementos: Elemento[];
  zona: Set<string> | null;
  falla: Falla;
  sugeridoId: string | null;
  onCerrar: () => void;
  onGuardado: (falla: Falla, resultado: ResultadoGuardar) => void;
}) {
  const [elementoId, setElementoId] = useState(sugeridoId || '');
  const [causa, setCausa] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [vistaFoto, setVistaFoto] = useState<string | null>(null);
  // Dos entradas: con `capture` el teléfono abre directo la cámara y no deja
  // elegir de la galería, así que la galería va en su propio botón.
  const entradaCamara = useRef<HTMLInputElement | null>(null);
  const entradaGaleria = useRef<HTMLInputElement | null>(null);
  const [errores, setErrores] = useState<Partial<Record<'causa' | 'foto' | 'general', string>>>({});
  const [guardando, setGuardando] = useState(false);

  function elegirFoto(archivo: File | null) {
    if (vistaFoto) URL.revokeObjectURL(vistaFoto);
    setFoto(archivo);
    setVistaFoto(archivo ? URL.createObjectURL(archivo) : null);
    setErrores((e) => ({ ...e, foto: undefined }));
  }

  async function guardar() {
    if (!causa.trim()) {
      setErrores({ causa: 'Escribe qué la causaba, por ejemplo «agua en la caja RG-02».' });
      return;
    }
    setErrores({});
    setGuardando(true);

    // La foto sube primero porque necesita señal. Si no sube, no se cierra la
    // búsqueda: se avisa y el técnico decide reintentar o cerrar sin foto.
    let fotoPath: string | null = falla.foto_path || null;
    if (foto) {
      try {
        fotoPath = await subirFotoFalla(falla, foto);
      } catch (err: any) {
        setErrores({ foto: err?.message || 'No se pudo subir la foto. Intenta de nuevo o quítala.' });
        setGuardando(false);
        return;
      }
    }

    const resuelta: Falla = {
      ...falla, estado: 'resuelta', elemento_id: elementoId || null, causa: causa.trim(),
      resuelta_en: new Date().toISOString(),
    };
    // Solo se manda la columna si hay foto: así cerrar sin foto sigue
    // funcionando aunque la base aún no tenga patch_lazos_falla_foto.sql.
    if (fotoPath) resuelta.foto_path = fotoPath;
    try {
      const resultado = await guardarFalla(resuelta);
      onGuardado(resuelta, resultado);
    } catch (err: any) {
      setErrores({ general: err?.message || 'No se pudo cerrar la búsqueda.' });
      setGuardando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-display font-bold text-[21px] mb-3 flex items-center gap-2">
          <CheckCircle2 size={22} strokeWidth={2.4} className="text-teal" /> Encontré la falla
        </h2>
        <span className="block text-[12.5px] text-muted mb-1">¿En qué dispositivo o caja?</span>
        <ElegirDispositivo
          lazo={lazo} elementos={elementos} opciones={enOrdenDeRecorrido(elementos)} zona={zona}
          sugeridoId={sugeridoId} valor={elementoId} onCambiar={setElementoId}
          ninguno="En el cable, entre dispositivos"
        />

        <label htmlFor="falla-causa" className="block text-[12.5px] text-muted mt-3 mb-1">Causa</label>
        <textarea id="falla-causa" value={causa} onChange={(ev) => setCausa(ev.target.value)} maxLength={500} rows={3}
          placeholder="Agua en la caja, cable pellizcado en la charola…" className={`${CAMPO} py-2.5`} />
        {errores.causa && <p className="text-red font-semibold text-[13px] mt-1">{errores.causa}</p>}

        <span className="block text-[12.5px] text-muted mt-3 mb-1">Foto de evidencia (opcional)</span>
        {vistaFoto ? (
          <div className="relative rounded-xl overflow-hidden border border-line">
            <img src={vistaFoto} alt="Foto de evidencia" className="w-full max-h-[200px] object-cover" />
            <button type="button" onClick={() => elegirFoto(null)} aria-label="Quitar la foto"
              className="absolute top-2 right-2 w-9 h-9 rounded-full bg-bg/80 flex items-center justify-center">
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => entradaCamara.current?.click()}
              className="flex-1 min-h-[50px] rounded-xl border border-dashed border-line-strong bg-surface-2 text-[14px] font-medium flex items-center justify-center gap-2">
              <Camera size={18} strokeWidth={2.2} /> Cámara
            </button>
            <button type="button" onClick={() => entradaGaleria.current?.click()}
              className="flex-1 min-h-[50px] rounded-xl border border-dashed border-line-strong bg-surface-2 text-[14px] font-medium flex items-center justify-center gap-2">
              <IconoGaleria size={18} strokeWidth={2.2} /> Galería
            </button>
          </div>
        )}
        <input ref={entradaCamara} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(ev) => { elegirFoto(ev.target.files?.[0] || null); ev.target.value = ''; }} />
        <input ref={entradaGaleria} type="file" accept="image/*" className="hidden"
          onChange={(ev) => { elegirFoto(ev.target.files?.[0] || null); ev.target.value = ''; }} />
        {errores.foto && <p className="text-red font-semibold text-[13px] mt-1">{errores.foto}</p>}

        {errores.general && <p className="text-red font-semibold text-[13px] mt-2">{errores.general}</p>}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCerrar} disabled={guardando} className="flex-1 min-h-[50px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px]">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="flex-[1.5] min-h-[50px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Cerrar la búsqueda'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
