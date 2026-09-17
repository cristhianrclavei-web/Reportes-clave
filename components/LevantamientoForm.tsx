'use client';

import { useMemo, useRef, useState } from 'react';
import {
  Levantamiento, SistemaLevantamiento, LevantamientoInput, SistemaInput, FotoGuardada,
  SISTEMAS_SUGERIDOS, crearLevantamiento, actualizarLevantamiento, urlsDeFotos,
} from '@/lib/levantamientos';
import { generarUUID } from '@/lib/uuid';
import { hoyLocal } from '@/lib/fechaHoy';
import { showToast } from '@/components/Toast';
import { Plus, Trash2, Camera, Images, X } from 'lucide-react';

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal-glow text-[15px] transition-colors placeholder:text-faint';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const cardCls = 'glass rounded-2xl p-4';
const cardTitleCls = 'font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-3.5 flex items-center gap-2';

type SistemaForm = { id: string; sistema: string; estadoActual: string; observaciones: string; fotosExistentes: FotoGuardada[]; fotosNuevas: File[] };

function nuevoSistema(): SistemaForm {
  return { id: generarUUID(), sistema: '', estadoActual: '', observaciones: '', fotosExistentes: [], fotosNuevas: [] };
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
  const [msg, setMsg] = useState<string | null>(null);

  const l = inicial?.levantamiento;
  const [fecha, setFecha] = useState(l?.fecha || hoyLocal());
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
  function quitarSistema(id: string) {
    if (sistemas.length <= 1) return;
    if (!confirm('¿Quitar este sistema del levantamiento?')) return;
    setSistemas((prev) => prev.filter((s) => s.id !== id));
  }

  const faltantes: string[] = [];
  if (!empresa.trim()) faltantes.push('empresa / cliente');
  if (!sistemas.some((s) => s.sistema.trim())) faltantes.push('al menos un sistema');

  async function handleGuardar() {
    if (faltantes.length > 0) {
      setMsg('Falta por llenar: ' + faltantes.join(', '));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
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
          fotosExistentes: s.fotosExistentes,
          fotosNuevas: s.fotosNuevas,
        })),
    };
    try {
      if (modo === 'editar' && levantamientoId) {
        await actualizarLevantamiento(levantamientoId, input);
        showToast('Levantamiento actualizado', 'success');
        onGuardado(levantamientoId);
      } else {
        const id = await crearLevantamiento(input);
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
      <div className={cardCls}>
        <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Datos del sitio</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className={labelCls}>Empresa / Cliente *</label>
            <input className={inputCls} value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Ej. Administración Torre Classiqa" />
          </div>
          <div>
            <label className={labelCls}>Fecha</label>
            <input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Atención (contacto)</label>
            <input className={inputCls} value={atencion} onChange={(e) => setAtencion(e.target.value)} placeholder="Quién recibió en el sitio" />
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
        <div key={s.id} className={cardCls}>
          <div className="flex items-center justify-between gap-2 mb-3.5">
            <p className={`${cardTitleCls} mb-0`}><span className="w-1.5 h-1.5 rounded-full bg-teal inline-block" /> Sistema {si + 1}</p>
            {sistemas.length > 1 && (
              <button onClick={() => quitarSistema(s.id)} className="text-red text-xs font-medium active:scale-95 transition-transform">
                Quitar sistema
              </button>
            )}
          </div>

          <label className={labelCls}>¿Qué sistema se está levantando? *</label>
          <input
            list={`sistemas-lev-${s.id}`}
            className={`${inputCls} mb-3.5`}
            value={s.sistema}
            onChange={(e) => actualizarSistema(s.id, { sistema: e.target.value })}
            placeholder="Ej. CCTV"
          />
          <datalist id={`sistemas-lev-${s.id}`}>
            {SISTEMAS_SUGERIDOS.map((sg) => <option key={sg} value={sg} />)}
          </datalist>

          <label className={labelCls}>Estado actual / qué hay hoy en el sitio</label>
          <textarea
            value={s.estadoActual}
            onChange={(e) => actualizarSistema(s.id, { estadoActual: e.target.value })}
            placeholder="Ej. Cuenta con 4 cámaras análogas, 2 dañadas, sin NVR funcional…"
            className={`${inputCls} min-h-[70px] mb-3.5`}
          />

          <label className={labelCls}>Observaciones / recomendación</label>
          <textarea
            value={s.observaciones}
            onChange={(e) => actualizarSistema(s.id, { observaciones: e.target.value })}
            placeholder="Lo que se sugiere hacer, riesgos encontrados, accesos requeridos…"
            className={`${inputCls} min-h-[70px] mb-3.5`}
          />

          <label className={labelCls}>Fotos de este sistema</label>
          <FotosCaptura
            fotosExistentes={s.fotosExistentes}
            fotosNuevas={s.fotosNuevas}
            onAgregarNuevas={(files) => actualizarSistema(s.id, { fotosNuevas: [...s.fotosNuevas, ...files] })}
            onQuitarNueva={(idx) => actualizarSistema(s.id, { fotosNuevas: s.fotosNuevas.filter((_, i) => i !== idx) })}
            onQuitarExistente={(path) => actualizarSistema(s.id, { fotosExistentes: s.fotosExistentes.filter((f) => f.path !== path) })}
          />
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
          onClick={onCancelar}
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
