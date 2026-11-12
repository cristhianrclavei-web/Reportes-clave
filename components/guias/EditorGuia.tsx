'use client';

import { useState } from 'react';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import CampoFoto from '@/components/lazos/CampoFoto';
import { showToast } from '@/components/Toast';
import {
  COLORES_CABLE, SISTEMAS_GUIA, conexionesRotas, nombreSistema,
  type ConexionGuia, type DatosGuia, type EquipoGuia, type Guia, type PruebaGuia,
} from '@/lib/guias';
import { guardarGuia, subirFotoGuia } from '@/lib/guiasDatos';

// Editor del dibujo de una guía, en formulario: equipos con sus bornes,
// conexiones borne a borne, pruebas con su rango, notas y fotos. Lo usa el
// ingeniero (supervisión) para armar o ajustar la guía de un cliente.

const CAMPO = 'w-full px-3 min-h-[44px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]';
const ROTULO = 'block text-[12.5px] text-muted mb-1';
const TITULO = 'text-[12px] font-semibold uppercase tracking-[0.08em] text-faint';
const BOTON_AGREGAR = 'min-h-[44px] px-4 rounded-xl border border-dashed border-line-strong text-[13.5px] font-semibold text-muted flex items-center justify-center gap-1.5 hover:text-ink';
const BOTON_QUITAR = 'w-10 h-10 rounded-xl flex items-center justify-center text-red shrink-0';

function nuevoId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// Número de un campo de texto: vacío = sin límite.
function aNumero(texto: string): number | null {
  if (texto.trim() === '') return null;
  const n = Number(texto.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export default function EditorGuia({ guia, onCancelar, onGuardada }: {
  guia: Guia;
  onCancelar: () => void;
  onGuardada: (guia: Guia) => void;
}) {
  const [nombre, setNombre] = useState(guia.nombre);
  const [sistema, setSistema] = useState(guia.sistema);
  const [descripcion, setDescripcion] = useState(guia.descripcion || '');
  const [datos, setDatos] = useState<DatosGuia>(guia.datos);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fotoNueva, setFotoNueva] = useState<File | null>(null);
  const [pieNuevo, setPieNuevo] = useState('');
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  // ---------- Equipos y bornes ----------

  function cambiarEquipo(id: string, cambio: Partial<EquipoGuia>) {
    setDatos({ ...datos, equipos: datos.equipos.map((e) => (e.id === id ? { ...e, ...cambio } : e)) });
  }

  function agregarEquipo() {
    setDatos({ ...datos, equipos: [...datos.equipos, { id: nuevoId(), nombre: '', bornes: [{ id: nuevoId(), nombre: '' }] }] });
  }

  // Al quitar un equipo se van también sus cables.
  function quitarEquipo(id: string) {
    setDatos({
      ...datos,
      equipos: datos.equipos.filter((e) => e.id !== id),
      conexiones: datos.conexiones.filter((c) => c.de.equipo !== id && c.a.equipo !== id),
    });
  }

  function quitarBorne(equipo: EquipoGuia, borneId: string) {
    setDatos({
      ...datos,
      equipos: datos.equipos.map((e) => (e.id === equipo.id ? { ...e, bornes: e.bornes.filter((b) => b.id !== borneId) } : e)),
      conexiones: datos.conexiones.filter((c) => !(c.de.equipo === equipo.id && c.de.borne === borneId) && !(c.a.equipo === equipo.id && c.a.borne === borneId)),
    });
  }

  // ---------- Conexiones ----------

  // Cada punta se elige como «equipo|borne» en una sola lista.
  const puntas = datos.equipos.flatMap((e) => e.bornes.map((b) => ({ valor: `${e.id}|${b.id}`, texto: `${e.nombre || 'Equipo'} · ${b.nombre || 'borne'}`, equipo: e.nombre || 'Equipo' })));

  function cambiarConexion(id: string, cambio: Partial<ConexionGuia>) {
    setDatos({ ...datos, conexiones: datos.conexiones.map((c) => (c.id === id ? { ...c, ...cambio } : c)) });
  }

  function agregarConexion() {
    const primera = puntas[0]?.valor.split('|') || ['', ''];
    const segunda = (puntas.find((p) => !p.valor.startsWith(`${primera[0]}|`)) || puntas[0])?.valor.split('|') || ['', ''];
    setDatos({ ...datos, conexiones: [...datos.conexiones, { id: nuevoId(), de: { equipo: primera[0], borne: primera[1] }, a: { equipo: segunda[0], borne: segunda[1] }, color: 'rojo' }] });
  }

  function selectorDePunta(valor: string, alCambiar: (equipo: string, borne: string) => void, etiqueta: string) {
    return (
      <select value={valor} aria-label={etiqueta} className={CAMPO}
        onChange={(ev) => { const [equipo, borne] = ev.target.value.split('|'); alCambiar(equipo, borne); }}>
        {datos.equipos.map((e) => (
          <optgroup key={e.id} label={e.nombre || 'Equipo'}>
            {e.bornes.map((b) => <option key={b.id} value={`${e.id}|${b.id}`}>{e.nombre || 'Equipo'} · {b.nombre || 'borne'}</option>)}
          </optgroup>
        ))}
      </select>
    );
  }

  // ---------- Pruebas, notas y fotos ----------

  function cambiarPrueba(id: string, cambio: Partial<PruebaGuia>) {
    setDatos({ ...datos, pruebas: datos.pruebas.map((p) => (p.id === id ? { ...p, ...cambio } : p)) });
  }

  async function agregarFoto() {
    if (!fotoNueva) return;
    setSubiendoFoto(true);
    try {
      const path = await subirFotoGuia(guia.id, fotoNueva);
      setDatos({ ...datos, fotos: [...datos.fotos, { path, pie: pieNuevo.trim() }] });
      setFotoNueva(null);
      setPieNuevo('');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo subir la foto', 'error');
    } finally {
      setSubiendoFoto(false);
    }
  }

  // ---------- Guardar ----------

  async function guardar() {
    setError(null);
    // Se revisa aquí con mensajes claros; el servidor (zod y la base) lo vuelve a revisar.
    if (!nombre.trim()) return setError('Ponle nombre a la guía.');
    if (datos.equipos.some((e) => !e.nombre.trim())) return setError('Hay un equipo sin nombre.');
    if (datos.equipos.some((e) => e.bornes.some((b) => !b.nombre.trim()))) return setError('Hay un borne sin nombre: escríbelo o quítalo.');
    if (conexionesRotas(datos).length > 0) return setError('Hay una conexión que apunta a un borne que ya no existe: corrígela o quítala.');
    if (datos.conexiones.some((c) => c.de.equipo === c.a.equipo && c.de.borne === c.a.borne)) return setError('Una conexión sale y llega al mismo borne.');
    if (datos.pruebas.some((p) => !p.texto.trim())) return setError('Hay una prueba sin descripción.');
    if (datos.pruebas.some((p) => p.min != null && p.max != null && p.min > p.max)) return setError('En una prueba el mínimo es mayor que el máximo.');
    const limpio: DatosGuia = { ...datos, notas: datos.notas.map((n) => n.trim()).filter(Boolean) };
    setGuardando(true);
    try {
      const guardada = await guardarGuia(guia.id, { nombre, sistema, descripcion: descripcion.trim() || null, servicio_grupo_id: guia.servicio_grupo_id, datos: limpio });
      onGuardada(guardada);
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la guía.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-2xl lg:max-w-[1100px] mx-auto pb-32">
      <div className="sticky top-0 z-20 glass-strong px-4 lg:px-8 py-3 flex items-center gap-2" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <button type="button" onClick={onCancelar} aria-label="Cancelar la edición" className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center">
          <ChevronLeft size={24} strokeWidth={2.4} />
        </button>
        <h1 className="flex-1 font-display font-bold text-[19px] truncate">Editar guía</h1>
        <button type="button" onClick={guardar} disabled={guardando} className="min-h-[44px] px-5 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      <div className="px-4 lg:px-8 pt-4 flex flex-col gap-6">
        {error && <p role="alert" className="rounded-xl bg-red/10 text-red font-semibold text-[14px] px-3.5 py-2.5">{error}</p>}

        <section className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <label><span className={ROTULO}>Nombre de la guía</span>
            <input className={CAMPO} value={nombre} maxLength={120} onChange={(ev) => setNombre(ev.target.value)} /></label>
          <label><span className={ROTULO}>Sistema</span>
            <select className={CAMPO} value={sistema} onChange={(ev) => setSistema(ev.target.value)}>
              {[...new Set([...SISTEMAS_GUIA, sistema])].map((s) => <option key={s} value={s}>{nombreSistema(s)}</option>)}
            </select></label>
          <label className="lg:col-span-2"><span className={ROTULO}>Descripción (qué se instala, en qué puerta, cualquier dato del levantamiento)</span>
            <textarea className={`${CAMPO} py-2 min-h-[70px]`} value={descripcion} maxLength={600} onChange={(ev) => setDescripcion(ev.target.value)} /></label>
        </section>

        <section>
          <p className={`${TITULO} mb-2`}>Equipos y sus bornes · {datos.equipos.length}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {datos.equipos.map((e) => (
              <div key={e.id} className="rounded-2xl border border-line bg-surface p-3">
                <div className="flex gap-2">
                  <input className={CAMPO} value={e.nombre} maxLength={60} placeholder="Equipo (Controladora, Lectora…)" aria-label="Nombre del equipo"
                    onChange={(ev) => cambiarEquipo(e.id, { nombre: ev.target.value })} />
                  <button type="button" onClick={() => quitarEquipo(e.id)} aria-label={`Quitar ${e.nombre || 'el equipo'}`} className={BOTON_QUITAR}><Trash2 size={17} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input className={CAMPO} value={e.modelo || ''} maxLength={80} placeholder="Modelo" aria-label="Modelo" onChange={(ev) => cambiarEquipo(e.id, { modelo: ev.target.value })} />
                  <input className={CAMPO} value={e.enlace || ''} maxLength={400} placeholder="Enlace al manual" aria-label="Enlace al manual" onChange={(ev) => cambiarEquipo(e.id, { enlace: ev.target.value })} />
                </div>
                <input className={`${CAMPO} mt-2`} value={e.nota || ''} maxLength={300} placeholder="Nota del equipo (opcional)" aria-label="Nota del equipo" onChange={(ev) => cambiarEquipo(e.id, { nota: ev.target.value })} />
                <p className="text-[12px] text-muted mt-2.5 mb-1">Bornes, en el orden en que están en el equipo</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {e.bornes.map((b) => (
                    <div key={b.id} className="flex items-center gap-1">
                      <input className={`${CAMPO} min-h-[40px] font-mono text-[13.5px]`} value={b.nombre} maxLength={40} placeholder="12V, GND, W0…" aria-label="Nombre del borne"
                        onChange={(ev) => cambiarEquipo(e.id, { bornes: e.bornes.map((x) => (x.id === b.id ? { ...x, nombre: ev.target.value } : x)) })} />
                      <button type="button" onClick={() => quitarBorne(e, b.id)} aria-label={`Quitar el borne ${b.nombre}`} className="w-8 h-10 flex items-center justify-center text-muted shrink-0"><Trash2 size={15} /></button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => cambiarEquipo(e.id, { bornes: [...e.bornes, { id: nuevoId(), nombre: '' }] })} className={`${BOTON_AGREGAR} w-full mt-2 min-h-[40px]`}>
                  <Plus size={15} strokeWidth={2.6} /> Borne
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={agregarEquipo} className={`${BOTON_AGREGAR} w-full mt-3`}><Plus size={16} strokeWidth={2.6} /> Agregar equipo</button>
        </section>

        <section>
          <p className={`${TITULO} mb-2`}>Conexiones · {datos.conexiones.length}</p>
          {puntas.length < 2 && <p className="text-[13.5px] text-muted">Primero agrega los equipos con sus bornes.</p>}
          <div className="flex flex-col gap-2.5">
            {datos.conexiones.map((c) => (
              <div key={c.id} className="rounded-2xl border border-line bg-surface p-3 grid gap-2 lg:grid-cols-[1fr_1fr_150px_110px_40px] lg:items-center">
                {selectorDePunta(`${c.de.equipo}|${c.de.borne}`, (equipo, borne) => cambiarConexion(c.id, { de: { equipo, borne } }), 'Sale de')}
                {selectorDePunta(`${c.a.equipo}|${c.a.borne}`, (equipo, borne) => cambiarConexion(c.id, { a: { equipo, borne } }), 'Llega a')}
                <input className={CAMPO} list="colores-de-cable" value={c.color || ''} maxLength={30} placeholder="Color (rojo, blanco/rojo)" aria-label="Color del cable"
                  onChange={(ev) => cambiarConexion(c.id, { color: ev.target.value })} />
                <input className={CAMPO} value={c.calibre || ''} maxLength={20} placeholder="Calibre" aria-label="Calibre" onChange={(ev) => cambiarConexion(c.id, { calibre: ev.target.value })} />
                <button type="button" onClick={() => setDatos({ ...datos, conexiones: datos.conexiones.filter((x) => x.id !== c.id) })} aria-label="Quitar la conexión" className={BOTON_QUITAR}><Trash2 size={17} /></button>
                <input className={`${CAMPO} lg:col-span-5`} value={c.nota || ''} maxLength={200} placeholder="Nota (opcional): para qué es, cuidado con…" aria-label="Nota de la conexión"
                  onChange={(ev) => cambiarConexion(c.id, { nota: ev.target.value })} />
              </div>
            ))}
          </div>
          <datalist id="colores-de-cable">{Object.keys(COLORES_CABLE).map((color) => <option key={color} value={color} />)}</datalist>
          {puntas.length >= 2 && <button type="button" onClick={agregarConexion} className={`${BOTON_AGREGAR} w-full mt-3`}><Plus size={16} strokeWidth={2.6} /> Agregar conexión</button>}
        </section>

        <section>
          <p className={`${TITULO} mb-1`}>Pruebas de puesta en marcha · {datos.pruebas.length}</p>
          <p className="text-[12.5px] text-muted mb-2">Lo que el técnico mide y entre qué valores debe salir. Si captura algo fuera, la app le avisa.</p>
          <div className="flex flex-col gap-2.5">
            {datos.pruebas.map((p) => (
              <div key={p.id} className="rounded-2xl border border-line bg-surface p-3 grid gap-2 grid-cols-[1fr_1fr_1fr_40px] lg:grid-cols-[1fr_90px_100px_100px_40px] lg:items-center">
                <input className={`${CAMPO} col-span-4 lg:col-span-1`} value={p.texto} maxLength={160} placeholder="Qué se mide (voltaje en la chapa…)" aria-label="Qué se mide" onChange={(ev) => cambiarPrueba(p.id, { texto: ev.target.value })} />
                <input className={CAMPO} value={p.unidad || ''} maxLength={12} placeholder="Unidad" aria-label="Unidad" onChange={(ev) => cambiarPrueba(p.id, { unidad: ev.target.value })} />
                <input className={CAMPO} inputMode="decimal" defaultValue={p.min ?? ''} placeholder="Mínimo" aria-label="Valor mínimo" onChange={(ev) => cambiarPrueba(p.id, { min: aNumero(ev.target.value) })} />
                <input className={CAMPO} inputMode="decimal" defaultValue={p.max ?? ''} placeholder="Máximo" aria-label="Valor máximo" onChange={(ev) => cambiarPrueba(p.id, { max: aNumero(ev.target.value) })} />
                <button type="button" onClick={() => setDatos({ ...datos, pruebas: datos.pruebas.filter((x) => x.id !== p.id) })} aria-label="Quitar la prueba" className={BOTON_QUITAR}><Trash2 size={17} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setDatos({ ...datos, pruebas: [...datos.pruebas, { id: nuevoId(), texto: '', unidad: 'V', min: null, max: null }] })} className={`${BOTON_AGREGAR} w-full mt-3`}>
            <Plus size={16} strokeWidth={2.6} /> Agregar prueba
          </button>
        </section>

        <section>
          <p className={`${TITULO} mb-1`}>Notas y errores comunes · {datos.notas.length}</p>
          <p className="text-[12.5px] text-muted mb-2">Lo que explicarías por teléfono: cuidados, lo que suele salir mal, cómo configurar.</p>
          <div className="flex flex-col gap-2">
            {datos.notas.map((nota, i) => (
              <div key={i} className="flex gap-2">
                <textarea className={`${CAMPO} py-2`} rows={2} value={nota} maxLength={300} aria-label={`Nota ${i + 1}`}
                  onChange={(ev) => setDatos({ ...datos, notas: datos.notas.map((n, j) => (j === i ? ev.target.value : n)) })} />
                <button type="button" onClick={() => setDatos({ ...datos, notas: datos.notas.filter((_, j) => j !== i) })} aria-label="Quitar la nota" className={BOTON_QUITAR}><Trash2 size={17} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setDatos({ ...datos, notas: [...datos.notas, ''] })} className={`${BOTON_AGREGAR} w-full mt-3`}><Plus size={16} strokeWidth={2.6} /> Agregar nota</button>
        </section>

        <section>
          <p className={`${TITULO} mb-1`}>Fotos «así debe quedar» · {datos.fotos.length}</p>
          <div className="flex flex-col gap-1.5 mb-3">
            {datos.fotos.map((f) => (
              <div key={f.path} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13.5px]">
                <span className="flex-1 truncate">{f.pie || 'Foto sin descripción'}</span>
                <button type="button" onClick={() => setDatos({ ...datos, fotos: datos.fotos.filter((x) => x.path !== f.path) })} aria-label="Quitar la foto" className={BOTON_QUITAR}><Trash2 size={17} /></button>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-line bg-surface p-3 lg:max-w-md">
            <CampoFoto titulo="Foto de una instalación bien hecha" archivo={fotoNueva} onCambiar={setFotoNueva} />
            {fotoNueva && (
              <>
                <input className={`${CAMPO} mt-2`} value={pieNuevo} maxLength={120} placeholder="Qué se ve (peinado del gabinete, fuente…)" aria-label="Descripción de la foto" onChange={(ev) => setPieNuevo(ev.target.value)} />
                <button type="button" onClick={agregarFoto} disabled={subiendoFoto} className="w-full mt-2 min-h-[44px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] disabled:opacity-60">
                  {subiendoFoto ? 'Subiendo…' : 'Agregar esta foto'}
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
