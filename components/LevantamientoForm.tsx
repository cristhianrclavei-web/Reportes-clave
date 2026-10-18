'use client';

import { confirmar } from '@/lib/dialogos';
import AutocompletarCliente from '@/components/AutocompletarCliente';
import AutocompletarPersona from '@/components/AutocompletarPersona';
import { useContactosCliente } from '@/lib/useContactosCliente';
import { useMemo, useRef, useState } from 'react';
import { useBorradorFormulario } from '@/lib/useBorradorFormulario';
import AvisoBorrador from '@/components/AvisoBorrador';
import {
  Levantamiento, SistemaLevantamiento, LevantamientoInput, SistemaInput, FotoGuardada,
  SISTEMAS_SUGERIDOS, ESTADOS_EQUIPO, crearLevantamiento, actualizarLevantamiento, urlsDeFotos,
} from '@/lib/levantamientos';
import { generarUUID } from '@/lib/uuid';
import { hoyLocal } from '@/lib/fechaHoy';
import { showToast } from '@/components/Toast';
import { useAvanceGuardado, pausaFinal } from '@/lib/useAvanceGuardado';
import SavingOverlay from '@/components/SavingOverlay';
import { Plus, Trash2, Camera, Images, X, ClipboardList, Cpu, ListOrdered, MessageSquareText, ImageIcon } from 'lucide-react';

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const cardCls = 'glass rounded-2xl p-4';
const cardTitleCls = 'font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-3.5 flex items-center gap-2';

const inputChicoCls =
  'w-full min-w-0 px-2.5 py-2 rounded-lg bg-surface border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[14px] transition-colors placeholder:text-faint';
const subtituloCls = 'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted mb-2';

// La cantidad se guarda como texto mientras se escribe para poder borrarla
// y escribir otra sin que el campo brinque a 0.
type EquipoForm = { id: string; cantidad: string; descripcion: string; modelo: string; estado: string };
type RecomendacionForm = { id: string; texto: string };
type SistemaForm = {
  id: string; sistema: string; estadoActual: string; observaciones: string;
  equipos: EquipoForm[]; recomendaciones: RecomendacionForm[];
  fotosExistentes: FotoGuardada[]; fotosNuevas: File[];
};

function nuevoSistema(): SistemaForm {
  return {
    id: generarUUID(), sistema: '', estadoActual: '', observaciones: '',
    equipos: [], recomendaciones: [], fotosExistentes: [], fotosNuevas: [],
  };
}
function nuevoEquipo(): EquipoForm {
  return { id: generarUUID(), cantidad: '1', descripcion: '', modelo: '', estado: '' };
}
function nuevaRecomendacion(): RecomendacionForm {
  return { id: generarUUID(), texto: '' };
}

// Qué le falta a un renglón de equipos; null si está bien o está en blanco.
function errorDeEquipo(e: EquipoForm): string | null {
  const tieneAlgo = e.descripcion.trim() || e.modelo.trim() || e.estado;
  if (!tieneAlgo) return null;
  if (!e.descripcion.trim()) return 'Escribe qué equipo es (descripción).';
  const cantidad = Number(e.cantidad);
  if (!Number.isInteger(cantidad) || cantidad < 1) return 'La cantidad debe ser un número entero de 1 en adelante.';
  return null;
}

// Tabla de equipos que ya están instalados: cantidad, descripción, modelo y
// estado. En el celular cada equipo ocupa dos renglones; en pantalla ancha, uno.
function TablaEquipos({
  equipos, onCambiar, mostrarErrores,
}: {
  equipos: EquipoForm[];
  onCambiar: (equipos: EquipoForm[]) => void;
  mostrarErrores: boolean;
}) {
  const [recienAgregado, setRecienAgregado] = useState<string | null>(null);

  function cambiar(id: string, patch: Partial<EquipoForm>) {
    onCambiar(equipos.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function agregar() {
    const nuevo = nuevoEquipo();
    setRecienAgregado(nuevo.id);
    onCambiar([...equipos, nuevo]);
  }
  function quitar(id: string) {
    onCambiar(equipos.filter((e) => e.id !== id));
  }

  return (
    <div>
      {equipos.length > 0 && (
        <div className="hidden sm:grid grid-cols-[64px_minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_36px] gap-2 px-0.5 mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
          <span>Cant.</span><span>Descripción</span><span>Modelo</span><span>Estado</span><span />
        </div>
      )}
      <div className="flex flex-col gap-2">
        {equipos.map((e, i) => {
          const error = mostrarErrores ? errorDeEquipo(e) : null;
          return (
            <div key={e.id}>
              <div className={`grid grid-cols-[64px_minmax(0,1fr)_36px] sm:grid-cols-[64px_minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_36px] gap-2 items-center p-2 sm:p-0 rounded-xl border sm:border-0 bg-surface-2/60 sm:bg-transparent ${error ? 'border-red/50' : 'border-line'}`}>
                <input
                  type="number" inputMode="numeric" min={1} step={1}
                  aria-label={`Cantidad del equipo ${i + 1}`}
                  className={`${inputChicoCls} text-center tabular-nums`}
                  value={e.cantidad}
                  onChange={(ev) => cambiar(e.id, { cantidad: ev.target.value })}
                />
                <input
                  aria-label={`Descripción del equipo ${i + 1}`}
                  placeholder="Ej. Cámara bala 2 MP"
                  autoFocus={e.id === recienAgregado}
                  className={inputChicoCls}
                  value={e.descripcion}
                  onChange={(ev) => cambiar(e.id, { descripcion: ev.target.value })}
                />
                <button
                  type="button" onClick={() => quitar(e.id)} aria-label={`Quitar el equipo ${i + 1}`}
                  className="w-9 h-9 rounded-lg text-red/80 flex items-center justify-center active:scale-90 transition-transform sm:order-last"
                >
                  <Trash2 size={16} strokeWidth={2.3} />
                </button>
                {/* En el celular modelo y estado van juntos en un segundo renglón;
                    en pantalla ancha «sm:contents» los mete a la misma fila. */}
                <div className="col-span-3 grid grid-cols-2 gap-2 sm:contents">
                  <input
                    aria-label={`Modelo del equipo ${i + 1}`}
                    placeholder="Modelo"
                    className={inputChicoCls}
                    value={e.modelo}
                    onChange={(ev) => cambiar(e.id, { modelo: ev.target.value })}
                  />
                  <select
                    aria-label={`Estado del equipo ${i + 1}`}
                    className={`${inputChicoCls} ${e.estado ? '' : 'text-faint'}`}
                    value={e.estado}
                    onChange={(ev) => cambiar(e.id, { estado: ev.target.value })}
                  >
                    <option value="">Estado…</option>
                    {ESTADOS_EQUIPO.map((est) => <option key={est} value={est}>{est}</option>)}
                  </select>
                </div>
              </div>
              {error && <p className="text-[12px] text-red mt-1 ml-1">{error}</p>}
            </div>
          );
        })}
      </div>
      <button
        type="button" onClick={agregar}
        className="mt-2 w-full min-h-[42px] rounded-xl border border-dashed border-teal/50 text-teal text-[13px] font-medium flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
      >
        <Plus size={15} strokeWidth={2.4} /> Agregar equipo
      </button>
    </div>
  );
}

// Recomendaciones como lista numerada: 1. …, 2. …, 3. … Con Enter se pasa
// al siguiente punto, como en una lista de un procesador de texto.
function ListaRecomendaciones({
  recomendaciones, onCambiar,
}: {
  recomendaciones: RecomendacionForm[];
  onCambiar: (recomendaciones: RecomendacionForm[]) => void;
}) {
  const [recienAgregada, setRecienAgregada] = useState<string | null>(null);

  function cambiar(id: string, texto: string) {
    onCambiar(recomendaciones.map((r) => (r.id === id ? { ...r, texto } : r)));
  }
  function agregarDespuesDe(indice: number) {
    const nueva = nuevaRecomendacion();
    setRecienAgregada(nueva.id);
    const copia = [...recomendaciones];
    copia.splice(indice + 1, 0, nueva);
    onCambiar(copia);
  }
  function quitar(id: string) {
    onCambiar(recomendaciones.filter((r) => r.id !== id));
  }

  return (
    <div>
      <ol className="flex flex-col gap-2">
        {recomendaciones.map((r, i) => (
          <li key={r.id} className="flex items-start gap-2">
            <span className="mt-1.5 w-7 h-7 shrink-0 rounded-full bg-teal/15 text-teal text-[12.5px] font-bold tabular-nums flex items-center justify-center">
              {i + 1}
            </span>
            <textarea
              rows={1}
              aria-label={`Recomendación ${i + 1}`}
              placeholder="Escribe la recomendación"
              autoFocus={r.id === recienAgregada}
              className={`${inputChicoCls} resize-none [field-sizing:content] min-h-[40px]`}
              value={r.texto}
              onChange={(ev) => cambiar(r.id, ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                  ev.preventDefault();
                  agregarDespuesDe(i);
                }
              }}
            />
            <button
              type="button" onClick={() => quitar(r.id)} aria-label={`Quitar la recomendación ${i + 1}`}
              className="mt-0.5 w-9 h-9 shrink-0 rounded-lg text-red/80 flex items-center justify-center active:scale-90 transition-transform"
            >
              <X size={16} strokeWidth={2.4} />
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button" onClick={() => agregarDespuesDe(recomendaciones.length - 1)}
        className="mt-2 w-full min-h-[42px] rounded-xl border border-dashed border-teal/50 text-teal text-[13px] font-medium flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
      >
        <Plus size={15} strokeWidth={2.4} /> Agregar recomendación
      </button>
    </div>
  );
}

// Fotos: se toman/eligen varias a la vez y se ven en miniatura antes de
// guardar. Las ya guardadas (edición) se resuelven a una URL firmada; las
// nuevas usan una URL local — así no hay que subir nada hasta dar Guardar.
function FotosCaptura({
  fotosExistentes, fotosNuevas, onQuitarExistente, onAgregarNuevas, onQuitarNueva,
}: {
  fotosExistentes: FotoGuardada[];
  fotosNuevas: File[];
  onQuitarExistente: (path: string) => void;
  onAgregarNuevas: (files: File[]) => void;
  onQuitarNueva: (idx: number) => void;
}) {
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useMemo(() => {
    const faltantes = fotosExistentes.map((f) => f.path).filter((p) => !urls[p]);
    if (faltantes.length === 0) return;
    urlsDeFotos(faltantes).then((mapa) => setUrls((prev) => ({ ...prev, ...mapa })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotosExistentes]);

  const previewsNuevas = useMemo(() => fotosNuevas.map((f) => URL.createObjectURL(f)), [fotosNuevas]);

  return (
    <div>
      <input ref={camaraRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
        onChange={(e) => { onAgregarNuevas(Array.from(e.target.files || [])); e.target.value = ''; }} />
      <input ref={galeriaRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { onAgregarNuevas(Array.from(e.target.files || [])); e.target.value = ''; }} />

      <div className="grid grid-cols-2 gap-2 mb-2.5">
        <button type="button" onClick={() => camaraRef.current?.click()} className="min-h-[44px] rounded-xl border border-dashed border-teal/50 text-teal text-[13px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform">
          <Camera size={15} strokeWidth={2.3} /> Tomar foto
        </button>
        <button type="button" onClick={() => galeriaRef.current?.click()} className="min-h-[44px] rounded-xl border border-dashed border-teal/50 text-teal text-[13px] font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform">
          <Images size={15} strokeWidth={2.3} /> Elegir de galería
        </button>
      </div>

      {(fotosExistentes.length > 0 || fotosNuevas.length > 0) && (
        <div className="grid grid-cols-4 gap-2">
          {fotosExistentes.map((f) => (
            <div key={f.path} className="relative aspect-square rounded-lg overflow-hidden border border-line bg-surface-2">
              {urls[f.path] ? <img src={urls[f.path]} className="w-full h-full object-cover" /> : <div className="w-full h-full animate-pulse" />}
              <button type="button" onClick={() => onQuitarExistente(f.path)} aria-label="Quitar foto" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                <X size={12} strokeWidth={2.8} />
              </button>
            </div>
          ))}
          {previewsNuevas.map((url, i) => (
            <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-line bg-surface-2">
              <img src={url} className="w-full h-full object-cover" />
              <button type="button" onClick={() => onQuitarNueva(i)} aria-label="Quitar foto" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                <X size={12} strokeWidth={2.8} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LevantamientoForm({
  modo,
  levantamientoId,
  inicial,
  onGuardado,
  onCancelar,
}: {
  modo: 'crear' | 'editar';
  levantamientoId?: string;
  inicial?: { levantamiento: Levantamiento; sistemas: SistemaLevantamiento[] };
  onGuardado: (id: string) => void;
  onCancelar: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const { progreso, avance } = useAvanceGuardado();
  const [msg, setMsg] = useState<string | null>(null);

  const l = inicial?.levantamiento;
  const [fecha, setFecha] = useState(l?.fecha || hoyLocal());
  // Contactos del cliente elegido (sugerencias en «Atención»).
  const contactosCliente = useContactosCliente();
  const [empresa, setEmpresa] = useState(l?.empresa || '');
  const [atencion, setAtencion] = useState(l?.atencion || '');
  const [telefono, setTelefono] = useState(l?.telefono || '');
  const [correo, setCorreo] = useState(l?.correo || '');
  const [direccion, setDireccion] = useState(l?.direccion || '');
  const [notas, setNotas] = useState(l?.notas || '');
  const [fotosExistentes, setFotosExistentes] = useState<FotoGuardada[]>(l?.fotos || []);
  const [fotosNuevas, setFotosNuevas] = useState<File[]>([]);

  const [sistemas, setSistemas] = useState<SistemaForm[]>(() => {
    if (!inicial || inicial.sistemas.length === 0) return [nuevoSistema()];
    return inicial.sistemas.map((s) => ({
      id: generarUUID(),
      sistema: s.sistema,
      estadoActual: s.estado_actual || '',
      observaciones: s.observaciones || '',
      equipos: (s.equipos || []).map((e) => ({
        id: generarUUID(), cantidad: String(e.cantidad), descripcion: e.descripcion, modelo: e.modelo || '', estado: e.estado || '',
      })),
      recomendaciones: (s.recomendaciones || []).map((texto) => ({ id: generarUUID(), texto })),
      fotosExistentes: s.fotos || [],
      fotosNuevas: [],
    }));
  });

  function actualizarSistema(id: string, patch: Partial<SistemaForm>) {
    setSistemas((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function agregarSistema() {
    setSistemas((prev) => [...prev, nuevoSistema()]);
  }
  async function quitarSistema(id: string) {
    if (sistemas.length <= 1) return;
    if (!await confirmar('¿Quitar este sistema del levantamiento?')) return;
    setSistemas((prev) => prev.filter((s) => s.id !== id));
  }

  // Borrador en el dispositivo (incluye las fotos nuevas): si la página se
  // recarga o se cierra, lo capturado se recupera al volver.
  const datosForm = { fecha, empresa, atencion, telefono, correo, direccion, notas, fotosExistentes, fotosNuevas, sistemas };
  const datosIniciales = useRef(datosForm);
  const huellaInicial = useRef(JSON.stringify(datosForm));
  function aplicarDatos(d: typeof datosForm) {
    setFecha(d.fecha); setEmpresa(d.empresa); setAtencion(d.atencion); setTelefono(d.telefono); setCorreo(d.correo);
    setDireccion(d.direccion); setNotas(d.notas); setFotosExistentes(d.fotosExistentes); setFotosNuevas(d.fotosNuevas);
    // Un borrador guardado antes de existir equipos/recomendaciones no los trae.
    setSistemas(d.sistemas.map((x) => ({ ...x, equipos: x.equipos || [], recomendaciones: x.recomendaciones || [] })));
  }
  const hayCambios = modo === 'crear'
    ? Boolean(empresa.trim() || notas.trim() || fotosNuevas.length || sistemas.some((x) => x.sistema.trim() || x.observaciones.trim() || x.fotosNuevas.length || x.equipos.length || x.recomendaciones.length))
    : fotosNuevas.length > 0 || sistemas.some((x) => x.fotosNuevas.length > 0) || JSON.stringify(datosForm) !== huellaInicial.current;
  const borrador = useBorradorFormulario({
    clave: modo === 'editar' && levantamientoId ? `levantamiento:${levantamientoId}` : 'levantamiento:nuevo',
    datos: datosForm,
    hayDatos: hayCambios,
    aplicar: aplicarDatos,
  });

  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const faltantes: string[] = [];
  if (!empresa.trim()) faltantes.push('empresa / cliente');
  if (!sistemas.some((s) => s.sistema.trim())) faltantes.push('al menos un sistema');
  sistemas.forEach((s, si) => {
    if (s.equipos.some((e) => errorDeEquipo(e))) faltantes.push(`revisar los equipos del sistema ${si + 1}`);
  });

  async function handleGuardar() {
    setIntentoGuardar(true);
    if (faltantes.length > 0) {
      setMsg('Falta por llenar: ' + faltantes.join(', '));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    avance(3, 'Preparando el levantamiento');
    setGuardando(true);
    setMsg(null);
    const input: LevantamientoInput = {
      fecha, empresa, atencion, telefono, correo, direccion, notas,
      fotosExistentes, fotosNuevas,
      sistemas: sistemas
        .filter((s) => s.sistema.trim())
        .map<SistemaInput>((s) => ({
          sistema: s.sistema,
          estado_actual: s.estadoActual,
          observaciones: s.observaciones,
          equipos: s.equipos.map((e) => ({ cantidad: Number(e.cantidad), descripcion: e.descripcion, modelo: e.modelo, estado: e.estado })),
          recomendaciones: s.recomendaciones.map((r) => r.texto),
          fotosExistentes: s.fotosExistentes,
          fotosNuevas: s.fotosNuevas,
        })),
    };
    try {
      if (modo === 'editar' && levantamientoId) {
        await actualizarLevantamiento(levantamientoId, input, avance);
        await borrador.limpiar();
        avance(100, 'Levantamiento actualizado');
        await pausaFinal();
        showToast('Levantamiento actualizado', 'success');
        onGuardado(levantamientoId);
      } else {
        const id = await crearLevantamiento(input, avance);
        await borrador.limpiar();
        avance(100, 'Levantamiento guardado');
        await pausaFinal();
        showToast('Levantamiento guardado', 'success');
        onGuardado(id);
      }
    } catch (e: any) {
      setMsg('Error al guardar: ' + (e?.message || 'error desconocido'));
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <SavingOverlay show={guardando} pct={progreso.pct} label={progreso.etapa} />
      {borrador.recuperadoEn && (
        <AvisoBorrador
          que="el levantamiento"
          guardadoEn={borrador.recuperadoEn}
          onDescartar={async () => { aplicarDatos(datosIniciales.current); await borrador.limpiar(); }}
        />
      )}
      <div className={cardCls}>
        <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Datos del sitio</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className={labelCls}>Empresa / Cliente *</label>
            <AutocompletarCliente
              value={empresa}
              onChange={(nombre, id, contactos) => {
                setEmpresa(nombre);
                contactosCliente.alElegirCliente(id, contactos).then((dir) => {
                  if (dir) setDireccion((prev) => (prev.trim() ? prev : dir));
                });
              }}
              className={inputCls}
              placeholder="Escribe para buscar en Clientes"
            />
          </div>
          <div>
            <label className={labelCls}>Fecha</label>
            <input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Atención (contacto)</label>
            <AutocompletarPersona
              value={atencion}
              onChange={(v) => {
                setAtencion(v);
                const k = contactosCliente.buscar(v);
                if (k?.telefono) setTelefono((prev) => (prev.trim() ? prev : k.telefono!));
                if (k?.correo) setCorreo((prev) => (prev.trim() ? prev : k.correo!));
              }}
              grupos={contactosCliente.grupos}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Teléfono</label>
            <input className={inputCls} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Correo</label>
            <input className={inputCls} value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Dirección</label>
            <input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>
        </div>
      </div>

      {sistemas.map((s, si) => (
        <div key={s.id} className="rounded-2xl glass border-l-4 border-l-teal overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-teal/10 border-b border-line">
            <p className="font-display font-bold text-[13px] uppercase tracking-wider text-teal tabular-nums">
              Sistema {String(si + 1).padStart(2, '0')}
              {s.sistema.trim() && <span className="text-ink/80 normal-case tracking-normal font-semibold"> · {s.sistema.trim()}</span>}
            </p>
            {sistemas.length > 1 && (
              <button onClick={() => quitarSistema(s.id)} className="min-h-[36px] px-2 -mr-2 text-red text-xs font-medium flex items-center gap-1 active:scale-95 transition-transform">
                <Trash2 size={14} strokeWidth={2.3} /> Quitar
              </button>
            )}
          </div>

          <div className="p-4 flex flex-col gap-5">
            <div>
              <label className={labelCls}>¿Qué sistema se está levantando? *</label>
              <input
                list={`sistemas-lev-${s.id}`}
                className={inputCls}
                value={s.sistema}
                onChange={(e) => actualizarSistema(s.id, { sistema: e.target.value })}
                placeholder="Ej. CCTV"
              />
              <datalist id={`sistemas-lev-${s.id}`}>
                {SISTEMAS_SUGERIDOS.map((sg) => <option key={sg} value={sg} />)}
              </datalist>
            </div>

            <div>
              <p className={subtituloCls}><ClipboardList size={14} strokeWidth={2.3} className="text-teal" /> Estado actual / qué hay hoy en el sitio</p>
              <textarea
                value={s.estadoActual}
                onChange={(e) => actualizarSistema(s.id, { estadoActual: e.target.value })}
                placeholder="Ej. Sistema análogo de 2015, sin mantenimiento, NVR sin grabar…"
                className={`${inputCls} min-h-[70px]`}
              />
            </div>

            <div>
              <p className={subtituloCls}>
                <Cpu size={14} strokeWidth={2.3} className="text-teal" /> Equipos existentes
                {s.equipos.length > 0 && <span className="text-faint normal-case tracking-normal font-normal">· {s.equipos.length}</span>}
              </p>
              <TablaEquipos
                equipos={s.equipos}
                onCambiar={(equipos) => actualizarSistema(s.id, { equipos })}
                mostrarErrores={intentoGuardar}
              />
            </div>

            <div>
              <p className={subtituloCls}><MessageSquareText size={14} strokeWidth={2.3} className="text-teal" /> Observaciones</p>
              <textarea
                value={s.observaciones}
                onChange={(e) => actualizarSistema(s.id, { observaciones: e.target.value })}
                placeholder="Hallazgos, riesgos encontrados, accesos requeridos…"
                className={`${inputCls} min-h-[70px]`}
              />
            </div>

            <div>
              <p className={subtituloCls}><ListOrdered size={14} strokeWidth={2.3} className="text-teal" /> Recomendaciones</p>
              <ListaRecomendaciones
                recomendaciones={s.recomendaciones}
                onCambiar={(recomendaciones) => actualizarSistema(s.id, { recomendaciones })}
              />
            </div>

            <div>
              <p className={subtituloCls}><ImageIcon size={14} strokeWidth={2.3} className="text-teal" /> Fotos de este sistema</p>
              <FotosCaptura
                fotosExistentes={s.fotosExistentes}
                fotosNuevas={s.fotosNuevas}
                onAgregarNuevas={(files) => actualizarSistema(s.id, { fotosNuevas: [...s.fotosNuevas, ...files] })}
                onQuitarNueva={(idx) => actualizarSistema(s.id, { fotosNuevas: s.fotosNuevas.filter((_, i) => i !== idx) })}
                onQuitarExistente={(path) => actualizarSistema(s.id, { fotosExistentes: s.fotosExistentes.filter((f) => f.path !== path) })}
              />
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={agregarSistema}
        className="w-full min-h-[52px] rounded-2xl border border-dashed border-line-strong text-ink/75 font-medium text-[14.5px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <Plus size={18} strokeWidth={2.4} />
        Agregar otro sistema
      </button>

      <div className={cardCls}>
        <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Notas generales del sitio</p>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Cualquier cosa del sitio en general que no sea de un sistema en particular"
          className={`${inputCls} min-h-[70px] mb-3.5`}
        />
        <label className={labelCls}>Fotos generales del sitio</label>
        <FotosCaptura
          fotosExistentes={fotosExistentes}
          fotosNuevas={fotosNuevas}
          onAgregarNuevas={(files) => setFotosNuevas((prev) => [...prev, ...files])}
          onQuitarNueva={(idx) => setFotosNuevas((prev) => prev.filter((_, i) => i !== idx))}
          onQuitarExistente={(path) => setFotosExistentes((prev) => prev.filter((f) => f.path !== path))}
        />
      </div>

      {msg && (
        <div className="text-sm px-4 py-3 rounded-xl bg-red/10 text-red border border-red/30">{msg}</div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => { borrador.limpiar(); onCancelar(); }}
          className="flex-1 min-h-[54px] rounded-2xl border border-line-strong text-ink/80 font-semibold text-[15px] active:scale-95 transition-transform"
        >
          Cancelar
        </button>
        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="flex-[1.5] min-h-[54px] rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[16px] active:scale-95 transition-transform disabled:opacity-60 shadow-glow-teal"
        >
          {guardando ? 'Guardando...' : modo === 'editar' ? 'Guardar cambios' : 'Guardar levantamiento'}
        </button>
      </div>
    </div>
  );
}
