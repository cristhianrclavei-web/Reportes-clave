'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, CornerDownRight, GitFork, Undo2, Check } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { Simbolo } from '@/components/lazos/DiagramaLazo';
import { generarUUID } from '@/lib/uuid';
import {
  Elemento, Lazo, PartesUbicacion, TIPOS_POR_CIRCUITO, tiposParaElegir, armarUbicacion, direccionOcupada, direccionVisible, hijosDe, lineaPrincipal,
  nombreSugerido, normalizarDireccion, ordenEntre, partesDe, prefijoLazo, siguienteDireccion, tipoDispositivo, sugerenciaPara, valoresUsados,
} from '@/lib/lazos';
import { guardarElemento, subirFotoElemento } from '@/lib/lazosDatos';
import { Lugar, lugarColgandoDe, lugarDespuesDe, raizDe } from '@/lib/lazos';

// Los lugares (dónde va un dispositivo) viven en lib/lazos.ts; se reexportan
// para quien ya los importaba de aquí.
export type { Lugar } from '@/lib/lazos';
export { lugarAlFinal, lugarAntesDe, lugarColgandoDe, lugarDespuesDe } from '@/lib/lazos';

// Hoja para capturar un dispositivo mientras se cablea. «Guardar y
// siguiente» deja la hoja abierta con el siguiente lugar del lazo, el mismo
// tipo y la siguiente dirección libre, para capturar uno tras otro sin
// regresar a la lista.

const CAMPO = 'w-full px-3 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';

// Niveles comunes, sugeridos después de los que ya se usaron en el lazo
// (sirven desde el primer dispositivo).
const NIVELES_COMUNES = ['Sótano', 'Planta baja', 'Nivel 1', 'Nivel 2', 'Mezanine', 'Azotea'];

// Enfoca el siguiente campo de texto de la hoja (como el «Siguiente» del teclado).
function pasarAlSiguienteCampo(actual: HTMLInputElement) {
  const campos = Array.from(document.querySelectorAll<HTMLInputElement>('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio])'));
  const siguiente = campos[campos.indexOf(actual) + 1];
  if (siguiente) siguiente.focus();
  else actual.blur();
}

// Campo de texto que completa con lo ya usado: al escribir «habit» aparece
// en gris «Habitación 30»; Enter (o tocar la sugerencia) la acepta, y si se
// sigue escribiendo se queda lo escrito.
function CampoConSugerencias({ id, etiqueta, valor, onCambiar, sugerencias, placeholder, maximo }: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambiar: (valor: string) => void;
  sugerencias: string[];
  placeholder: string;
  maximo: number;
}) {
  const sugerencia = sugerenciaPara(valor, sugerencias);

  // El botón del teclado es «Listo» y no cambia mientras se escribe: en
  // Android cambiarlo reinicia el teclado y borra la letra escrita. Con
  // «Siguiente» Android brinca de campo sin avisar, por eso no se usa.
  // Primer toque: acepta la sugerencia. Sin sugerencia: pasa al siguiente campo.
  function alTeclear(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    if (sugerencia) {
      onCambiar(sugerencia);
      return;
    }
    pasarAlSiguienteCampo(ev.currentTarget);
  }

  return (
    <div className="mt-3">
      <label htmlFor={id} className="block text-[12.5px] text-muted mb-1">{etiqueta}</label>
      <div className="relative">
        <input id={id} value={valor} onChange={(ev) => onCambiar(ev.target.value)} onKeyDown={alTeclear} maxLength={maximo}
          placeholder={placeholder} autoComplete="off" enterKeyHint="done" className={CAMPO} />
        {sugerencia && (
          // Lo que falta, en gris, justo después de lo escrito (lo escrito va transparente para alinear).
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 right-0 px-3 border border-transparent flex items-center text-[15px] whitespace-pre overflow-hidden">
            <span className="text-transparent">{valor}</span>
            <span className="text-faint">{sugerencia.slice(valor.length)}</span>
          </span>
        )}
      </div>
      {sugerencia && (
        <button type="button" onClick={() => onCambiar(sugerencia)}
          className="mt-1 min-h-[30px] text-[12.5px] text-teal font-medium">
          Enter o toca para usar «{sugerencia}»
        </button>
      )}
    </div>
  );
}

type Errores = Partial<Record<'direccion' | 'nombre' | 'ubicacion' | 'general', string>>;

export default function HojaCaptura({ lazo, elementos, lugarInicial, editando, onGuardado, onCerrar, tipoInicial, nivelInicial, direccionInicial, unoSolo }: {
  lazo: Lazo;
  elementos: Elemento[];
  lugarInicial: Lugar;
  // Si viene, se corrige ese dispositivo en vez de agregar uno nuevo.
  editando?: Elemento | null;
  onGuardado: (elemento: Elemento, pendiente: boolean) => void;
  onCerrar: () => void;
  // Desde el plano: el tipo del símbolo tocado, el nivel (nombre del plano)
  // y solo uno a la vez (el siguiente se toca en el plano).
  tipoInicial?: string;
  nivelInicial?: string;
  // La dirección que ya traía el equipo en el plano (p. ej. de un DXF), «D017».
  direccionInicial?: string | null;
  unoSolo?: boolean;
}) {
  const tipos = TIPOS_POR_CIRCUITO[lazo.tipo];
  // Los poco comunes se enseñan hasta que se piden.
  const [verTodosLosTipos, setVerTodosLosTipos] = useState(false);
  const cuantosExtra = tipos.filter((t) => t.extra).length;
  const [lugar, setLugar] = useState<Lugar>(lugarInicial);
  const tipoDelPlano = tipos.some((t) => t.codigo === tipoInicial) ? (tipoInicial as string) : null;
  const [tipo, setTipo] = useState(editando?.tipo || tipoDelPlano || tipos[0].codigo);
  const [letra, setLetra] = useState<'D' | 'M'>('D');
  const [numero, setNumero] = useState('');
  const [nombre, setNombre] = useState(editando?.nombre || '');
  const [nombreAMano, setNombreAMano] = useState(Boolean(editando));
  // Ubicación por partes: área (Cocina, Bodega 1), nivel y una referencia.
  const [partes, setPartes] = useState<PartesUbicacion>(editando ? partesDe(editando) : { area: '', nivel: nivelInicial || '', referencia: '' });
  const niveles = valoresUsados(elementos, 'nivel', 100);
  const sugerenciasNivel = [...niveles, ...NIVELES_COMUNES.filter((n) => !niveles.includes(n))];
  const sugerenciasArea = valoresUsados(elementos, 'area', 100);
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
  // La del plano vale mientras no cambie el tipo ni se guarde otro. (Se
  // compara en vez de «gastarla» porque en desarrollo el efecto corre dos veces.)
  const alAbrir = useRef({ tipo: editando?.tipo || tipoDelPlano || tipos[0].codigo, cuantos: elementos.length });

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
    const delPlano = tipo === alAbrir.current.tipo && elementos.length === alAbrir.current.cuantos ? direccionInicial : null;
    if (delPlano && infoTipo.conDireccion) {
      setLetra(delPlano[0] as 'D' | 'M');
      setNumero(delPlano.slice(1));
    } else {
      setLetra(nuevaLetra);
      setNumero(infoTipo.conDireccion ? String(siguienteDireccion(nuevaLetra, elementos)).padStart(3, '0') : '');
    }
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
    const ubicacion = armarUbicacion(partes) || '';
    if (ubicacion.length > 160) e.ubicacion = 'La ubicación es muy larga (máximo 160 en total). Acorta la referencia.';
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
      ubicacion: armarUbicacion(partes),
      area: partes.area.trim() || null,
      nivel: partes.nivel.trim() || null,
      referencia: partes.referencia.trim() || null,
      foto_path: editando?.foto_path || null,
      sin_conectar: editando ? Boolean(editando.sin_conectar) : Boolean(lugar.sinConectar),
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
      if (elemento.padre_id || elemento.sin_conectar) {
        setLugar({ padreId: elemento.id, ordenAntes: null, ordenDespues: null, adoptar: lugar.adoptar });
      } else {
        setLugar({ padreId: null, ordenAntes: elemento.orden, ordenDespues: lugar.ordenDespues });
      }
      setUltimo(elemento);
      setCapturados((n) => n + 1);
      setFoto(null);
      // El siguiente casi siempre va en el mismo nivel: el nivel se queda.
      setPartes({ area: '', nivel: partes.nivel, referencia: '' });
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
  const anterior = editando || lugar.padreId || lugar.sinConectar ? null : elementos.find((x) => x.orden === lugar.ordenAntes && !x.padre_id) || null;
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
            {padre ? <>Cuelga de <span className="font-mono">{etiqueta(padre)}</span></> : lugar.sinConectar ? 'Tramo sin conectar (se une al lazo después)' : 'Línea principal'}
            {ramaNueva && ' · rama nueva'}
            {siguienteEnRama && <> · antes de <span className="font-mono">{etiqueta(siguienteEnRama)}</span></>}
            {anterior ? <> · después de <span className="font-mono">{etiqueta(anterior)}</span></> : padre || lugar.sinConectar ? '' : ' · al inicio'}
          </p>
        )}

        <span className="sr-only" id="tipo-dispositivo">Tipo de dispositivo</span>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5" role="radiogroup" aria-labelledby="tipo-dispositivo">
          {tiposParaElegir(tipos, verTodosLosTipos, tipo).map((t) => (
            <button key={t.codigo} type="button" role="radio" aria-checked={tipo === t.codigo} title={t.nombre}
              onClick={() => setTipo(t.codigo)}
              className={`min-h-[40px] rounded-lg border font-mono text-[12.5px] ${tipo === t.codigo ? 'bg-teal border-teal text-inkOnAccent' : t.forma === 'caja' ? 'bg-surface-2 border-amber/50 text-amber' : 'bg-surface-2 border-line text-ink'}`}>
              {t.codigo}
            </button>
          ))}
          {cuantosExtra > 0 && (
            <button type="button" onClick={() => setVerTodosLosTipos(!verTodosLosTipos)} aria-expanded={verTodosLosTipos}
              className="min-h-[40px] rounded-lg border border-dashed border-line text-[12px] font-semibold text-muted">
              {verTodosLosTipos ? 'Menos' : `Más +${cuantosExtra}`}
            </button>
          )}
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

        <CampoConSugerencias id="disp-area" etiqueta="Área" valor={partes.area} onCambiar={(area) => setPartes((antes) => ({ ...antes, area }))}
          sugerencias={sugerenciasArea} placeholder="Cocina, Central de enfermeras, Bodega 1" maximo={80} />
        <CampoConSugerencias id="disp-nivel" etiqueta="Nivel" valor={partes.nivel} onCambiar={(nivel) => setPartes((antes) => ({ ...antes, nivel }))}
          sugerencias={sugerenciasNivel} placeholder="Planta baja, Nivel -1" maximo={40} />
        <label htmlFor="disp-referencia" className="block text-[12.5px] text-muted mt-3 mb-1">Referencia (opcional)</label>
        <input id="disp-referencia" value={partes.referencia} onChange={(ev) => { const referencia = ev.target.value; setPartes((antes) => ({ ...antes, referencia })); }} maxLength={80}
          placeholder="Sobre plafón, junto a la puerta" className={CAMPO} />
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
          {!editando && !unoSolo && ultimo && lugar.padreId !== ultimo.id && (
            <button type="button" onClick={colgarDelAnterior}
              className="flex-1 min-h-[42px] rounded-xl border border-line bg-surface-2 text-[13px] flex items-center justify-center gap-1.5 px-2">
              <CornerDownRight size={16} strokeWidth={2.2} className="shrink-0" />
              <span className="leading-tight text-left">Colgar de<span className="block font-mono text-[12px]">{etiqueta(ultimo)}</span></span>
            </button>
          )}
          {!editando && !unoSolo && origenRama && lugar.padreId !== origenRama.id && (
            <button type="button" onClick={otraRama}
              className="flex-1 min-h-[42px] rounded-xl border border-line bg-surface-2 text-[13px] flex items-center justify-center gap-1.5 px-2">
              <GitFork size={16} strokeWidth={2.2} className="shrink-0" />
              <span className="leading-tight text-left">Otra rama desde<span className="block font-mono text-[12px]">{etiqueta(origenRama)}</span></span>
            </button>
          )}
          {!editando && !unoSolo && padre && (
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
          {editando || unoSolo ? (
            <button type="button" onClick={() => guardar(false)} disabled={guardando}
              className="flex-[1.6] min-h-[50px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[15px] disabled:opacity-60">
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar'}
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
