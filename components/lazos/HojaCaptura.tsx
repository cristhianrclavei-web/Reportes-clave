'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, CornerDownRight, GitFork, Undo2, Check } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { Simbolo } from '@/components/lazos/DiagramaLazo';
import { generarUUID } from '@/lib/uuid';
import {
  Elemento, Lazo, TIPOS_POR_CIRCUITO, direccionOcupada, direccionVisible, hijosDe, lineaPrincipal,
  nombreSugerido, normalizarDireccion, ordenEntre, prefijoLazo, siguienteDireccion, tipoDispositivo,
} from '@/lib/lazos';
import { guardarElemento, subirFotoElemento } from '@/lib/lazosDatos';

// Hoja para capturar un dispositivo mientras se cablea. «Guardar y
// siguiente» deja la hoja abierta con el siguiente lugar del lazo, el mismo
// tipo y la siguiente dirección libre, para capturar uno tras otro sin
// regresar a la lista.

// Dónde va el dispositivo: colgando de quién (o en la línea principal) y
// entre qué números de orden.
//
// En la línea principal los dispositivos van uno tras otro con `orden`.
// Lo que cuelga directo de un dispositivo es una RAMA aparte (varias = una
// estrella); dentro de una rama, lo que sigue en serie cuelga del anterior.
// `adoptar`: dispositivos que pasan a colgar del nuevo (al insertar en medio
// de una rama, lo que seguía queda después del nuevo).
export type Lugar = { padreId: string | null; ordenAntes: number | null; ordenDespues: number | null; adoptar?: string[] };

const CAMPO = 'w-full px-3 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';

// Lugar al final de la línea principal.
export function lugarAlFinal(elementos: Elemento[]): Lugar {
  const principal = lineaPrincipal(elementos);
  const ultimo = principal[principal.length - 1];
  return { padreId: null, ordenAntes: ultimo ? ultimo.orden : null, ordenDespues: null };
}

// Lugar justo después de un dispositivo. En una rama: en serie después de
// él, y lo que seguía pasa a seguir al nuevo.
export function lugarDespuesDe(elementos: Elemento[], elemento: Elemento): Lugar {
  if (elemento.padre_id) {
    return { padreId: elemento.id, ordenAntes: null, ordenDespues: null, adoptar: hijosDe(elementos, elemento.id).map((h) => h.id) };
  }
  const hermanos = elemento.padre_id ? hijosDe(elementos, elemento.padre_id) : lineaPrincipal(elementos);
  const i = hermanos.findIndex((h) => h.id === elemento.id);
  const siguiente = hermanos[i + 1];
  return { padreId: elemento.padre_id, ordenAntes: elemento.orden, ordenDespues: siguiente ? siguiente.orden : null };
}

// Lugar justo antes de un dispositivo. En una rama, el nuevo toma su lugar
// y él pasa a colgar del nuevo.
export function lugarAntesDe(elementos: Elemento[], elemento: Elemento): Lugar {
  const hermanos = elemento.padre_id ? hijosDe(elementos, elemento.padre_id) : lineaPrincipal(elementos);
  const i = hermanos.findIndex((h) => h.id === elemento.id);
  const anterior = hermanos[i - 1];
  const adoptar = elemento.padre_id ? [elemento.id] : undefined;
  return { padreId: elemento.padre_id, ordenAntes: anterior ? anterior.orden : null, ordenDespues: elemento.orden, adoptar };
}

// Una rama nueva desde un dispositivo, a la derecha de las que ya tiene.
export function lugarColgandoDe(elementos: Elemento[], padre: Elemento): Lugar {
  const hijos = hijosDe(elementos, padre.id);
  const ultimo = hijos[hijos.length - 1];
  return { padreId: padre.id, ordenAntes: ultimo ? ultimo.orden : null, ordenDespues: null };
}

// El dispositivo de la línea principal del que cuelga (o él mismo).
function raizDe(elementos: Elemento[], elemento: Elemento): Elemento {
  let actual = elemento;
  let vueltas = 0;
  while (actual.padre_id && vueltas < 50) {
    const padre = elementos.find((e) => e.id === actual.padre_id);
    if (!padre) break;
    actual = padre;
    vueltas++;
  }
  return actual;
}

type Errores = Partial<Record<'direccion' | 'nombre' | 'ubicacion' | 'general', string>>;

export default function HojaCaptura({ lazo, elementos, lugarInicial, editando, onGuardado, onCerrar }: {
  lazo: Lazo;
  elementos: Elemento[];
  lugarInicial: Lugar;
  // Si viene, se corrige ese dispositivo en vez de agregar uno nuevo.
  editando?: Elemento | null;
  onGuardado: (elemento: Elemento, pendiente: boolean) => void;
  onCerrar: () => void;
}) {
  const tipos = TIPOS_POR_CIRCUITO[lazo.tipo];
  const [lugar, setLugar] = useState<Lugar>(lugarInicial);
  const [tipo, setTipo] = useState(editando?.tipo || tipos[0].codigo);
  const [letra, setLetra] = useState<'D' | 'M'>('D');
  const [numero, setNumero] = useState('');
  const [nombre, setNombre] = useState(editando?.nombre || '');
  const [nombreAMano, setNombreAMano] = useState(Boolean(editando));
  const [ubicacion, setUbicacion] = useState(editando?.ubicacion || '');
  const [foto, setFoto] = useState<File | null>(null);
  const [errores, setErrores] = useState<Errores>({});
  const [guardando, setGuardando] = useState(false);
  // El último que se guardó en esta hoja: de él se puede colgar el siguiente.
  const [ultimo, setUltimo] = useState<Elemento | null>(null);
  const [capturados, setCapturados] = useState(0);
  // De qué dispositivo salen las ramas que se están capturando: con él se
  // puede abrir otra rama (estrella).
  const [origenRama, setOrigenRama] = useState<Elemento | null>(
    !editando && lugarInicial.padreId && !lugarInicial.adoptar ? elementos.find((e) => e.id === lugarInicial.padreId) || null : null,
  );
  const entradaFoto = useRef<HTMLInputElement | null>(null);

  const infoTipo = tipoDispositivo(tipo);
  const padre = lugar.padreId ? elementos.find((e) => e.id === lugar.padreId) || null : null;

  // Dirección inicial: la del que se edita, o la siguiente libre.
  useEffect(() => {
    if (editando?.direccion) {
      setLetra(editando.direccion[0] as 'D' | 'M');
      setNumero(editando.direccion.slice(1).padStart(3, '0'));
    }
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al cambiar de tipo: los detectores van con D y los módulos con M, se
  // propone la siguiente dirección libre y el siguiente nombre.
  useEffect(() => {
    if (editando) return;
    const nuevaLetra = infoTipo.forma === 'detector' ? 'D' : 'M';
    setLetra(nuevaLetra);
    setNumero(infoTipo.conDireccion ? String(siguienteDireccion(nuevaLetra, elementos)).padStart(3, '0') : '');
    if (!nombreAMano) setNombre(nombreSugerido(lazo.codigo, tipo, elementos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, elementos.length]);

  function cambiarLetra(nueva: 'D' | 'M') {
    setLetra(nueva);
    if (!editando) setNumero(String(siguienteDireccion(nueva, elementos)).padStart(3, '0'));
  }

  function validar(): { errores: Errores; direccion: string | null } {
    const e: Errores = {};
    let direccion: string | null = null;
    if (infoTipo.conDireccion && numero.trim()) {
      direccion = normalizarDireccion(letra, numero);
      if (!direccion) {
        e.direccion = 'La dirección es un número del 1 al 999.';
      } else {
        const ocupada = direccionOcupada(direccion, elementos, editando?.id);
        if (ocupada) e.direccion = `La ${direccionVisible(direccion, lazo.numero)} ya la tiene ${ocupada.nombre}.`;
      }
    }
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) e.nombre = 'Escribe el nombre del dispositivo.';
    else if (nombreLimpio.length > 40) e.nombre = 'El nombre es muy largo (máximo 40).';
    else if (elementos.some((x) => x.nombre === nombreLimpio && x.id !== editando?.id)) e.nombre = 'Ya hay un dispositivo con ese nombre en este lazo.';
    if (ubicacion.length > 160) e.ubicacion = 'La ubicación es muy larga (máximo 160).';
    return { errores: e, direccion };
  }

  async function guardar(seguir: boolean) {
    const { errores: e, direccion } = validar();
    setErrores(e);
    if (Object.keys(e).length > 0) return;
    setGuardando(true);

    const id = editando?.id || generarUUID();
    const elemento: Elemento = {
      id,
      lazo_id: lazo.id,
      padre_id: editando ? editando.padre_id : lugar.padreId,
      orden: editando ? editando.orden : ordenEntre(lugar.ordenAntes, lugar.ordenDespues),
      tipo,
      nombre: nombre.trim(),
      direccion,
      ubicacion: ubicacion.trim() || null,
      foto_path: editando?.foto_path || null,
      creado_por: editando?.creado_por,
      creado_en: editando?.creado_en,
    };

    // La foto sube primero (necesita señal). Si no sube, el dispositivo se
    // guarda igual y se avisa: la foto se puede poner después.
    let avisoFoto: string | null = null;
    if (foto) {
      try {
        elemento.foto_path = await subirFotoElemento(elemento, foto);
      } catch (err: any) {
        avisoFoto = err?.message || 'No se pudo subir la foto.';
      }
    }

    try {
      const { pendiente } = await guardarElemento(elemento);
      onGuardado(elemento, pendiente);
      // Insertado en medio de una rama: lo que seguía ahora cuelga del nuevo.
      for (const id of (editando ? [] : lugar.adoptar || [])) {
        const hijo = elementos.find((x) => x.id === id);
        if (!hijo) continue;
        const movido = { ...hijo, padre_id: elemento.id };
        const resultado = await guardarElemento(movido);
        onGuardado(movido, resultado.pendiente);
      }
      if (!seguir || editando) {
        if (avisoFoto) setErrores({ general: avisoFoto });
        else onCerrar();
        setGuardando(false);
        return;
      }
      // Siguiente: en la línea principal, después del que se guardó; en una
      // rama, en serie colgando de él (y lo que seguía, después del siguiente).
      if (elemento.padre_id) {
        setLugar({ padreId: elemento.id, ordenAntes: null, ordenDespues: null, adoptar: lugar.adoptar });
      } else {
        setLugar({ padreId: null, ordenAntes: elemento.orden, ordenDespues: lugar.ordenDespues });
      }
      setUltimo(elemento);
      setCapturados((n) => n + 1);
      setFoto(null);
      setNombreAMano(false);
      setNombre(nombreSugerido(lazo.codigo, tipo, [...elementos, elemento]));
      if (infoTipo.conDireccion && direccion) setNumero(String(siguienteDireccion(letra, [...elementos, elemento])).padStart(3, '0'));
      setErrores(avisoFoto ? { general: avisoFoto } : {});
    } catch (err: any) {
      setErrores({ general: err?.message || 'No se pudo guardar el dispositivo.' });
    }
    setGuardando(false);
  }

  function colgarDelAnterior() {
    if (!ultimo) return;
    setLugar(lugarColgandoDe(elementos, ultimo));
    setOrigenRama(ultimo);
  }

  function otraRama() {
    if (!origenRama) return;
    setLugar(lugarColgandoDe(elementos, origenRama));
  }

  function volverALaLinea() {
    if (!padre) return;
    setLugar(lugarDespuesDe(elementos, raizDe(elementos, padre)));
    setOrigenRama(null);
  }

  // Nombre y, si tiene, dirección: «LZ1_SH_1 · L01D001».
  function etiqueta(e: Elemento): string {
    const direccion = direccionVisible(e.direccion, lazo.numero);
    return direccion ? `${e.nombre} · ${direccion}` : e.nombre;
  }

  const titulo = editando ? `Corregir ${editando.nombre}` : `Agregar dispositivo${capturados ? ` · ${capturados} capturados` : ''}`;
  const anterior = editando || lugar.padreId ? null : elementos.find((x) => x.orden === lugar.ordenAntes && !x.padre_id) || null;
  const siguienteEnRama = lugar.adoptar?.length ? elementos.find((x) => x.id === lugar.adoptar?.[0]) || null : null;
  const ramaNueva = Boolean(padre && !siguienteEnRama && hijosDe(elementos, padre.id).length > 0);

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <h2 className="font-display font-bold text-[21px] leading-tight">{titulo}</h2>
        </div>
        {!editando && (
          <p className="text-[12.5px] text-muted mb-3">
            {padre ? <>Cuelga de <span className="font-mono">{etiqueta(padre)}</span></> : 'Línea principal'}
            {ramaNueva && ' · rama nueva'}
            {siguienteEnRama && <> · antes de <span className="font-mono">{etiqueta(siguienteEnRama)}</span></>}
            {anterior ? <> · después de <span className="font-mono">{etiqueta(anterior)}</span></> : padre ? '' : ' · al inicio'}
          </p>
        )}

        <span className="sr-only" id="tipo-dispositivo">Tipo de dispositivo</span>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5" role="radiogroup" aria-labelledby="tipo-dispositivo">
          {tipos.map((t) => (
            <button key={t.codigo} type="button" role="radio" aria-checked={tipo === t.codigo} title={t.nombre}
              onClick={() => setTipo(t.codigo)}
              className={`min-h-[40px] rounded-lg border font-mono text-[12.5px] ${tipo === t.codigo ? 'bg-teal border-teal text-inkOnAccent' : t.forma === 'caja' ? 'bg-surface-2 border-amber/50 text-amber' : 'bg-surface-2 border-line text-ink'}`}>
              {t.codigo}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-2 text-[13px] text-muted mt-2">
          <span className="text-ink scale-75 origin-left"><Simbolo tipo={tipo} chico /></span>{infoTipo.nombre}
        </p>

        {/* Dirección del equipo en su propio renglón, como la nombran ellos:
            L01 (lazo) + D detector o M módulo + número (L01D001, L01M002). */}
        {infoTipo.conDireccion && (
          <div className="mt-3">
            <label htmlFor="disp-direccion" className="block text-[12.5px] text-muted mb-1">Dirección del equipo</label>
            <div className="flex items-stretch gap-2">
              <div className="flex flex-1 min-h-[48px] rounded-xl border border-line bg-surface-2 overflow-hidden">
                {prefijoLazo(lazo.numero) && (
                  <span className="px-2.5 flex items-center font-mono text-[16px] text-muted border-r border-line">{prefijoLazo(lazo.numero)}</span>
                )}
                {(['D', 'M'] as const).map((l) => (
                  <button key={l} type="button" onClick={() => cambiarLetra(l)} aria-pressed={letra === l}
                    aria-label={l === 'D' ? 'Detector' : 'Módulo'}
                    className={`w-10 font-mono text-[16px] ${letra === l ? 'bg-teal text-inkOnAccent' : 'text-faint'}`}>{l}</button>
                ))}
                <input id="disp-direccion" inputMode="numeric" value={numero} placeholder="001"
                  onChange={(ev) => setNumero(ev.target.value.replace(/\D/g, '').slice(0, 3))}
                  onBlur={() => { if (numero) setNumero(numero.padStart(3, '0')); }}
                  className="w-full min-w-0 bg-transparent px-2.5 font-mono text-[17px] focus:outline-none" />
              </div>
              <span className="shrink-0 min-w-[96px] rounded-xl bg-teal/10 text-teal font-mono text-[16px] font-semibold flex items-center justify-center px-2" aria-live="polite">
                {numero ? direccionVisible(normalizarDireccion(letra, numero), lazo.numero) || '—' : '—'}
              </span>
            </div>
            {errores.direccion && <p className="text-red font-semibold text-[13px] mt-1">{errores.direccion}</p>}
          </div>
        )}

        <label htmlFor="disp-ubicacion" className="block text-[12.5px] text-muted mt-3 mb-1">Ubicación</label>
        <input id="disp-ubicacion" value={ubicacion} onChange={(ev) => setUbicacion(ev.target.value)} maxLength={160}
          placeholder="Pasillo B, sobre plafón" className={CAMPO} />
        {errores.ubicacion && <p className="text-red font-semibold text-[13px] mt-1">{errores.ubicacion}</p>}

        <label htmlFor="disp-nombre" className="block text-[12.5px] text-muted mt-3 mb-1">Nombre</label>
        <input id="disp-nombre" value={nombre} onChange={(ev) => { setNombre(ev.target.value); setNombreAMano(true); }} maxLength={40}
          className={`${CAMPO} font-mono`} />
        {errores.nombre && <p className="text-red font-semibold text-[13px] mt-1">{errores.nombre}</p>}

        <div className="flex flex-wrap gap-1.5 mt-3">
          <button type="button" onClick={() => entradaFoto.current?.click()}
            className={`flex-1 min-h-[42px] rounded-xl border text-[13px] flex items-center justify-center gap-1.5 px-2 ${foto ? 'border-teal text-teal bg-teal/10' : 'border-line bg-surface-2'}`}>
            {foto ? <Check size={16} strokeWidth={2.4} /> : <Camera size={16} strokeWidth={2.2} />}{foto ? 'Foto lista' : 'Foto'}
          </button>
          {/* Sin `capture`: así el teléfono ofrece cámara o galería. */}
          <input ref={entradaFoto} type="file" accept="image/*" className="hidden"
            onChange={(ev) => setFoto(ev.target.files?.[0] || null)} />
          {!editando && ultimo && lugar.padreId !== ultimo.id && (
            <button type="button" onClick={colgarDelAnterior}
              className="flex-1 min-h-[42px] rounded-xl border border-line bg-surface-2 text-[13px] flex items-center justify-center gap-1.5 px-2">
              <CornerDownRight size={16} strokeWidth={2.2} className="shrink-0" />
              <span className="leading-tight text-left">Colgar de<span className="block font-mono text-[12px]">{etiqueta(ultimo)}</span></span>
            </button>
          )}
          {!editando && origenRama && lugar.padreId !== origenRama.id && (
            <button type="button" onClick={otraRama}
              className="flex-1 min-h-[42px] rounded-xl border border-line bg-surface-2 text-[13px] flex items-center justify-center gap-1.5 px-2">
              <GitFork size={16} strokeWidth={2.2} className="shrink-0" />
              <span className="leading-tight text-left">Otra rama desde<span className="block font-mono text-[12px]">{etiqueta(origenRama)}</span></span>
            </button>
          )}
          {!editando && padre && (
            <button type="button" onClick={volverALaLinea}
              className="flex-1 min-h-[42px] rounded-xl border border-line bg-surface-2 text-[13px] flex items-center justify-center gap-1.5 px-2">
              <Undo2 size={16} strokeWidth={2.2} /> Volver a la línea
            </button>
          )}
        </div>

        {errores.general && <p className="text-red font-semibold text-[13px] mt-3">{errores.general}</p>}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCerrar} disabled={guardando}
            className="flex-1 min-h-[50px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px]">
            {capturados > 0 ? 'Terminar' : 'Cancelar'}
          </button>
          {editando ? (
            <button type="button" onClick={() => guardar(false)} disabled={guardando}
              className="flex-[1.6] min-h-[50px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          ) : (
            <button type="button" onClick={() => guardar(true)} disabled={guardando}
              className="flex-[1.6] min-h-[50px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[15px] flex items-center justify-center gap-1.5 disabled:opacity-60">
              {guardando ? 'Guardando…' : <>Guardar y siguiente <ArrowRight size={18} strokeWidth={2.6} /></>}
            </button>
          )}
        </div>
        <p className="text-[12px] text-faint text-center mt-2">Sin señal se guarda en el teléfono y sube después.</p>
      </div>
    </ModalOverlay>
  );
}
