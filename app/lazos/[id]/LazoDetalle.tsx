'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, CloudUpload, History, Plus, Settings2, WifiOff } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import DiagramaLazo, { Simbolo } from '@/components/lazos/DiagramaLazo';
import HojaCaptura, { Lugar, lugarAlFinal, lugarAntesDe, lugarColgandoDe, lugarDespuesDe } from '@/components/lazos/HojaCaptura';
import FichaElemento, { fechaHora } from '@/components/lazos/FichaElemento';
import BusquedaFalla from '@/components/lazos/BusquedaFalla';
import { confirmar } from '@/lib/dialogos';
import { Cambio, Corte, Elemento, Falla, NOMBRE_CIRCUITO, describirCambio, direccionVisible, hijosDe, lineaPrincipal } from '@/lib/lazos';
import {
  DatosLazo, ResultadoGuardar, actualizarLazo, borrarElemento, borrarLazo, descartarPrimerPendiente,
  fallasResueltas, guardarCopiaLazo, guardarElemento, historialDeLazo, obtenerLazo, pendientesDeLazo, subirPendientes,
} from '@/lib/lazosDatos';

type Vista = 'lista' | 'diagrama' | 'falla';

// Todos los que cuelgan de un dispositivo, a cualquier profundidad.
function descendientes(elementos: Elemento[], id: string): string[] {
  const resultado: string[] = [];
  for (const hijo of hijosDe(elementos, id)) {
    resultado.push(hijo.id, ...descendientes(elementos, hijo.id));
  }
  return resultado;
}

export default function LazoDetalle({ lazoId, esSupervisor }: { lazoId: string; esSupervisor: boolean }) {
  const [datos, setDatos] = useState<DatosLazo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [vista, setVista] = useState<Vista>('lista');
  const [hoja, setHoja] = useState<{ lugar: Lugar; editando: Elemento | null } | null>(null);
  const [ficha, setFicha] = useState<Elemento | null>(null);
  const [historial, setHistorial] = useState<Falla[]>([]);
  const [editandoLazo, setEditandoLazo] = useState(false);
  const [cambios, setCambios] = useState<Cambio[]>([]);
  const [avisoHistorial, setAvisoHistorial] = useState<string | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);

  // El historial lo anota la base; se vuelve a pedir al abrir una ficha o
  // el historial, para ver lo más reciente.
  const cargarHistorial = useCallback(async () => {
    const resultado = await historialDeLazo(lazoId);
    setCambios(resultado.cambios);
    setAvisoHistorial(resultado.aviso);
  }, [lazoId]);

  function abrirFicha(elemento: Elemento) {
    setFicha(elemento);
    cargarHistorial();
  }

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      const resultado = await obtenerLazo(lazoId);
      setDatos(resultado.datos);
      setSinConexion(resultado.sinConexion);
      if (!resultado.sinConexion) fallasResueltas(lazoId).then(setHistorial).catch(() => {});
    } catch (e: any) {
      setErrorCarga(e?.message || 'No se pudo cargar el lazo.');
    } finally {
      setPendientes(pendientesDeLazo(lazoId));
      setCargando(false);
    }
  }, [lazoId]);

  // Sube lo capturado sin señal. Cuando ya no queda nada, recarga del
  // servidor para quedar al día.
  const sincronizar = useCallback(async () => {
    if (pendientesDeLazo(lazoId) === 0) return;
    setSubiendo(true);
    const resultado = await subirPendientes();
    setSubiendo(false);
    setRechazo(resultado.rechazo);
    setPendientes(pendientesDeLazo(lazoId));
    if (resultado.quedan === 0) {
      showToast('Se subió lo capturado sin señal');
      cargar();
    }
  }, [lazoId, cargar]);

  useEffect(() => {
    cargar().then(sincronizar);
    window.addEventListener('online', sincronizar);
    return () => window.removeEventListener('online', sincronizar);
  }, [cargar, sincronizar]);

  function actualizar(nuevos: DatosLazo) {
    setDatos(nuevos);
    guardarCopiaLazo(nuevos);
  }

  function despuesDeGuardar(resultado: ResultadoGuardar) {
    setPendientes(pendientesDeLazo(lazoId));
    if (resultado.pendiente && navigator.onLine) sincronizar();
    // Lo que ya subió ya está en el historial.
    if (!resultado.pendiente) cargarHistorial();
  }

  function alGuardarElemento(elemento: Elemento, pendiente: boolean) {
    if (!datos) return;
    const elementos = datos.elementos.filter((e) => e.id !== elemento.id).concat(elemento);
    actualizar({ ...datos, elementos });
    if (ficha?.id === elemento.id) setFicha(elemento);
    despuesDeGuardar({ pendiente });
  }

  async function alBorrarElemento(elemento: Elemento) {
    if (!datos) return;
    try {
      // En una rama, lo que seguía sube a colgar del anterior antes de
      // borrar; si no, la base lo borraría en cascada con él.
      let elementos = datos.elementos;
      if (elemento.padre_id) {
        for (const hijo of hijosDe(elementos, elemento.id)) {
          const movido = { ...hijo, padre_id: elemento.padre_id };
          await guardarElemento(movido);
          elementos = elementos.map((e) => (e.id === hijo.id ? movido : e));
        }
      }
      const resultado = await borrarElemento(lazoId, elemento.id);
      const quitar = new Set([elemento.id, ...descendientes(elementos, elemento.id)]);
      actualizar({ ...datos, elementos: elementos.filter((e) => !quitar.has(e.id)) });
      setFicha(null);
      showToast(resultado.pendiente ? 'Borrado en el teléfono; se sube al tener señal' : 'Dispositivo borrado');
      despuesDeGuardar(resultado);
    } catch (e: any) {
      showToast(e?.message || 'No se pudo borrar el dispositivo.', 'error');
    }
  }

  function alCambiarFalla(cambio: { falla?: Falla | null; corte?: Corte; corteBorrado?: string }, resultado: ResultadoGuardar) {
    if (!datos) return;
    let { falla, cortes } = datos;
    if (cambio.falla !== undefined) {
      if (cambio.falla && cambio.falla.estado === 'abierta') {
        falla = cambio.falla;
      } else {
        falla = null;
        cortes = [];
        if (cambio.falla) setHistorial((h) => [cambio.falla as Falla, ...h]);
        showToast('Búsqueda cerrada; quedó en el historial del lazo');
      }
    }
    if (cambio.corte) cortes = cortes.concat(cambio.corte);
    if (cambio.corteBorrado) cortes = cortes.filter((c) => c.id !== cambio.corteBorrado);
    actualizar({ ...datos, falla, cortes });
    despuesDeGuardar(resultado);
  }

  async function descartarRechazado() {
    const ok = await confirmar('¿Descartar el cambio que no se puede subir?', {
      detalle: `${rechazo || ''} Se pierde ese cambio; los demás siguen en la cola.`,
      textoAceptar: 'Descartar',
      tono: 'peligro',
    });
    if (!ok) return;
    descartarPrimerPendiente();
    setRechazo(null);
    await sincronizar();
    cargar();
  }

  if (cargando) return <p className="p-6 text-[14px] text-muted">Cargando…</p>;

  if (!datos) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="rounded-xl bg-red/10 text-red text-[14px] px-4 py-3">
          {errorCarga || 'No se encontró el lazo.'}{' '}
          <button type="button" onClick={() => { setCargando(true); cargar(); }} className="underline font-semibold">Reintentar</button>
        </p>
        <Link href="/lazos" className="inline-block mt-4 text-teal font-semibold text-[14px]">Volver a los lazos</Link>
      </div>
    );
  }

  const { lazo, elementos } = datos;
  const principal = lineaPrincipal(elementos);

  // Lista en orden: cada dispositivo de la línea y, sangrado, lo que cuelga.
  // marca: número en la línea principal, ↳ al empezar una rama, ↓ en serie.
  function filas(lista: Elemento[], nivel: number, marca: 'numero' | 'rama' | 'serie'): React.ReactNode[] {
    const numerar = marca === 'numero';
    const resultado: React.ReactNode[] = [];
    lista.forEach((e, i) => {
      const direccion = direccionVisible(e.direccion, lazo.numero);
      resultado.push(
        <li key={e.id}>
          <button type="button" onClick={() => abrirFicha(e)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-surface-2/60 rounded-lg"
            style={{ paddingLeft: nivel * 26 }}>
            <span className={`w-7 h-7 shrink-0 rounded-lg font-mono text-[11px] flex items-center justify-center ${numerar ? 'bg-surface-2 text-muted' : 'text-faint'}`}>
              {numerar ? i + 1 : marca === 'serie' ? '↓' : '↳'}
            </span>
            <span className="w-11 shrink-0 flex justify-center text-ink scale-[0.8]"><Simbolo tipo={e.tipo} chico /></span>
            <span className="flex-1 min-w-0">
              <span className="block font-mono text-[14px] truncate">{e.nombre}</span>
              {e.ubicacion && <span className="block text-[12px] text-muted truncate">{e.ubicacion}</span>}
            </span>
            {direccion && <span className="font-mono text-[12px] rounded-md bg-surface-2 px-1.5 py-0.5 shrink-0">{direccion}</span>}
          </button>
        </li>,
      );
      // Lo que sigue en serie dentro de una rama va a la misma sangría; las
      // ramas de un dispositivo, un nivel más adentro.
      const hijos = hijosDe(elementos, e.id);
      const enSerie = nivel > 0 && hijos.length === 1;
      resultado.push(...filas(hijos, enSerie ? nivel : nivel + 1, enSerie ? 'serie' : 'rama'));
    });
    return resultado;
  }

  const pestanas: { k: Vista; label: string }[] = [
    { k: 'lista', label: 'Lista en orden' },
    { k: 'diagrama', label: 'Diagrama' },
    { k: 'falla', label: 'Falla a tierra' },
  ];

  return (
    <div className="max-w-3xl mx-auto pb-28">
      <div className="sticky top-0 z-20 glass-strong px-4 py-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <Link href={`/lazos?cliente=${lazo.cliente_id}`} aria-label="Volver a los lazos" className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft size={24} strokeWidth={2.4} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-faint uppercase tracking-[0.06em] truncate">
              {NOMBRE_CIRCUITO[lazo.tipo]}{lazo.clase ? ` · Clase ${lazo.clase}` : ''} · {principal.length} en línea
            </p>
            <h1 className="font-display font-bold text-[22px] leading-tight truncate">
              <span className="font-mono text-[16px] text-teal mr-1.5">{lazo.codigo}</span>{lazo.nombre}
            </h1>
          </div>
          <button type="button" onClick={() => { setVerHistorial(true); cargarHistorial(); }} aria-label="Historial de cambios" className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:bg-surface-2">
            <History size={20} strokeWidth={2.2} />
          </button>
          <button type="button" onClick={() => setEditandoLazo(true)} aria-label="Datos del lazo" className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:bg-surface-2">
            <Settings2 size={20} strokeWidth={2.2} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface border border-line p-1 mt-2.5" role="tablist">
          {pestanas.map((p) => (
            <button key={p.k} type="button" role="tab" aria-selected={vista === p.k} onClick={() => setVista(p.k)}
              className={`relative min-h-[38px] rounded-lg text-[13px] font-semibold ${vista === p.k ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
              {p.label}
              {p.k === 'falla' && datos.falla && <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-amber" aria-label="búsqueda abierta" />}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-3">
        {(sinConexion || pendientes > 0) && (
          <div className="flex items-center gap-2 rounded-xl bg-amber/10 text-amber text-[13px] px-3 py-2 mb-3">
            {sinConexion ? <WifiOff size={16} strokeWidth={2.4} /> : <CloudUpload size={16} strokeWidth={2.4} />}
            <span className="flex-1">
              {sinConexion ? 'Sin señal: trabajas con la copia del teléfono. ' : ''}
              {pendientes > 0 ? `${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'} sin subir.` : ''}
            </span>
            {pendientes > 0 && (
              <button type="button" onClick={sincronizar} disabled={subiendo} className="font-semibold underline disabled:opacity-60">
                {subiendo ? 'Subiendo…' : 'Subir ahora'}
              </button>
            )}
          </div>
        )}
        {rechazo && (
          <div className="rounded-xl bg-red/10 text-red text-[13px] px-3 py-2 mb-3">
            <p className="flex gap-2"><AlertTriangle size={16} strokeWidth={2.4} className="shrink-0 mt-0.5" />{rechazo}</p>
            <button type="button" onClick={descartarRechazado} className="mt-1 font-semibold underline">Descartar ese cambio</button>
          </div>
        )}

        {vista === 'lista' && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[12px] border-[1.5px] border-teal text-teal rounded-md px-1.5 py-0.5">PCI</span>
              <span className="text-[12.5px] text-muted truncate">{lazo.panel || 'Panel'} · salida del lazo</span>
            </div>
            {principal.length === 0
              ? <p className="text-[14px] text-muted py-6">Todavía no hay dispositivos. Toca «Agregar dispositivo» y captura en el orden en que corre el cable.</p>
              : <ol className="divide-y divide-line">{filas(principal, 0, 'numero')}</ol>}
          </>
        )}

        {vista === 'diagrama' && (
          <div className="rounded-2xl bg-surface border border-line p-3 overflow-x-auto">
            <DiagramaLazo lazo={lazo} elementos={elementos} onTocar={abrirFicha} />
          </div>
        )}

        {vista === 'falla' && (
          <BusquedaFalla lazo={lazo} elementos={elementos} falla={datos.falla} cortes={datos.cortes} onCambio={alCambiarFalla} onTocar={abrirFicha} />
        )}
      </div>

      {/* pr-20: deja libre el botón flotante del asistente. */}
      {vista !== 'falla' && (
        <div className="fixed bottom-0 inset-x-0 z-10 bg-bg/95 border-t border-line pl-4 pr-20 sm:pr-4 pt-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={() => setHoja({ lugar: lugarAlFinal(elementos), editando: null })}
            className="w-full max-w-3xl mx-auto min-h-[52px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[15.5px] flex items-center justify-center gap-2">
            <Plus size={19} strokeWidth={2.6} /> Agregar dispositivo
          </button>
        </div>
      )}

      {hoja && (
        <HojaCaptura
          lazo={lazo}
          elementos={elementos}
          lugarInicial={hoja.lugar}
          editando={hoja.editando}
          onGuardado={alGuardarElemento}
          onCerrar={() => setHoja(null)}
        />
      )}

      {ficha && !hoja && (
        <FichaElemento
          lazo={lazo}
          elementos={elementos}
          elemento={ficha}
          fallas={historial}
          cambios={cambios}
          avisoHistorial={avisoHistorial}
          onCerrar={() => setFicha(null)}
          onEditar={() => setHoja({ lugar: lugarDespuesDe(elementos, ficha), editando: ficha })}
          onInsertarAntes={() => { setHoja({ lugar: lugarAntesDe(elementos, ficha), editando: null }); setFicha(null); }}
          onInsertarDespues={() => { setHoja({ lugar: lugarDespuesDe(elementos, ficha), editando: null }); setFicha(null); }}
          onColgar={() => { setHoja({ lugar: lugarColgandoDe(elementos, ficha), editando: null }); setFicha(null); }}
          onBorrar={() => alBorrarElemento(ficha)}
        />
      )}

      {verHistorial && (
        <ModalOverlay onClose={() => setVerHistorial(false)}>
          <div className="glass-strong rounded-3xl max-w-md w-full p-4 max-h-[85vh] flex flex-col">
            <h2 className="font-display font-bold text-[21px] mb-1">Historial de cambios</h2>
            <p className="text-[12.5px] text-muted mb-3">Quién agregó, corrigió o borró algo en este lazo, y cuándo.</p>
            {avisoHistorial && <p className="text-[13px] text-amber mb-2">{avisoHistorial}</p>}
            {!avisoHistorial && cambios.length === 0 && <p className="text-[13px] text-muted">Todavía no hay cambios anotados.</p>}
            <ul className="flex flex-col gap-2.5 overflow-y-auto text-[13.5px] -mx-1 px-1">
              {cambios.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${c.accion === 'baja' ? 'bg-red' : c.tabla === 'lazo_cortes' || c.tabla === 'lazo_fallas' ? 'bg-amber' : c.accion === 'alta' ? 'bg-teal' : 'bg-muted'}`} />
                  <span>
                    {describirCambio(c, lazo.numero, (id) => elementos.find((e) => e.id === id)?.nombre || null)}
                    <span className="block text-[12px] text-faint">{c.usuario_nombre || 'Alguien'} · {fechaHora(c.creado_en)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setVerHistorial(false)} className="mt-4 min-h-[46px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px]">Cerrar</button>
          </div>
        </ModalOverlay>
      )}

      {editandoLazo && (
        <DatosDelLazo
          datos={datos}
          esSupervisor={esSupervisor}
          onCerrar={() => setEditandoLazo(false)}
          onGuardado={(cambios) => { actualizar({ ...datos, lazo: { ...lazo, ...cambios } }); setEditandoLazo(false); }}
        />
      )}
    </div>
  );
}

function DatosDelLazo({ datos, esSupervisor, onCerrar, onGuardado }: {
  datos: DatosLazo;
  esSupervisor: boolean;
  onCerrar: () => void;
  onGuardado: (cambios: { nombre: string; panel: string | null; clase: 'A' | 'B' | null }) => void;
}) {
  const { lazo } = datos;
  const [nombre, setNombre] = useState(lazo.nombre);
  const [panel, setPanel] = useState(lazo.panel || '');
  const [clase, setClase] = useState<'A' | 'B' | null>(lazo.clase);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const campo = 'w-full px-3 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';

  async function guardar() {
    if (!nombre.trim()) { setError('El lazo necesita un nombre.'); return; }
    setGuardando(true);
    setError(null);
    const cambios = { nombre: nombre.trim(), panel: panel.trim() || null, clase };
    try {
      await actualizarLazo(lazo.id, cambios);
      showToast('Datos del lazo guardados');
      onGuardado(cambios);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron guardar los datos.');
      setGuardando(false);
    }
  }

  async function borrar() {
    const ok = await confirmar(`¿Borrar el lazo ${lazo.codigo}?`, {
      detalle: `Se borran sus ${datos.elementos.length} dispositivos y sus búsquedas de falla. No se puede deshacer.`,
      textoAceptar: 'Borrar lazo',
      tono: 'peligro',
    });
    if (!ok) return;
    try {
      await borrarLazo(lazo.id);
      showToast('Lazo borrado');
      window.location.href = '/lazos';
    } catch (e: any) {
      setError(e?.message || 'No se pudo borrar el lazo.');
    }
  }

  return (
    <ModalOverlay onClose={() => !guardando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-4">
        <h2 className="font-display font-bold text-[21px] mb-3">Datos del lazo</h2>
        <label htmlFor="dl-nombre" className="block text-[12.5px] text-muted mb-1">Nombre</label>
        <input id="dl-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} className={campo} />
        <label htmlFor="dl-panel" className="block text-[12.5px] text-muted mt-3 mb-1">Panel</label>
        <input id="dl-panel" value={panel} onChange={(e) => setPanel(e.target.value)} maxLength={160} className={campo} />
        {lazo.tipo === 'deteccion' && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 mt-3" role="radiogroup" aria-label="Clase">
            {(['B', 'A'] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={clase === c} onClick={() => setClase(c)}
                className={`min-h-[40px] rounded-lg text-[13.5px] font-semibold ${clase === c ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>Clase {c}</button>
            ))}
          </div>
        )}
        {error && <p className="text-red font-semibold text-[13px] mt-3">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCerrar} disabled={guardando} className="flex-1 min-h-[48px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px]">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="flex-[1.4] min-h-[48px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14.5px] disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
        {esSupervisor && (
          <button type="button" onClick={borrar} className="w-full mt-2 min-h-[44px] rounded-xl text-red text-[13.5px] font-medium hover:bg-red/10">Borrar este lazo</button>
        )}
      </div>
    </ModalOverlay>
  );
}
