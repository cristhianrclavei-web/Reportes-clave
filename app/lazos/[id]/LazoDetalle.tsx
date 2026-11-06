'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, CloudUpload, FileDown, History, Plus, Settings2, WifiOff } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import DiagramaLazo from '@/components/lazos/DiagramaLazo';
import ListaEnOrden from '@/components/lazos/ListaEnOrden';
import PanelLazos from '@/components/lazos/PanelLazos';
import { NuevoLazo } from '@/app/lazos/LazosList';
import { catalogoEnCache } from '@/lib/clientesCatalogo';
import VerFoto from '@/components/lazos/VerFoto';
import HojaCaptura, { Lugar, lugarAlFinal, lugarAntesDe, lugarColgandoDe, lugarDespuesDe } from '@/components/lazos/HojaCaptura';
import FichaElemento, { fechaHora } from '@/components/lazos/FichaElemento';
import BusquedaFalla from '@/components/lazos/BusquedaFalla';
import { confirmar } from '@/lib/dialogos';
import { Cambio, Corte, Elemento, Falla, NOMBRE_CIRCUITO, Panel, describirCambio, etiquetaSalida, hijosDe, lazosDelMismoPanel, lineaPrincipal, siguienteNumeroDeLazo } from '@/lib/lazos';
import {
  DatosLazo, LazoResumen, ResultadoGuardar, actualizarLazo, borrarElemento, borrarLazo, descartarPrimerPendiente,
  fallasResueltas, guardarCopiaLazo, guardarElemento, historialDeLazo, listarLazos, listarPaneles, obtenerLazo, asignarPanel, nombreCompletoPanel, textoDePanel, pendientesDeLazo, subirPendientes,
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
  const [exportando, setExportando] = useState(false);
  // Todos los lazos, para juntar los que salen del mismo panel.
  const [todosLosLazos, setTodosLosLazos] = useState<LazoResumen[]>([]);
  const [paneles, setPaneles] = useState<Panel[]>([]);
  const [verPanel, setVerPanel] = useState(true);
  const [agregandoLazo, setAgregandoLazo] = useState(false);

  // El PDF se arma en el servidor y se descarga con un enlace firmado de
  // Storage (ver app/api/lazos/[id]/pdf): abrir el PDF directo no funciona
  // dentro de la app de Android.
  async function exportarPdf() {
    if (!navigator.onLine) {
      showToast('El PDF necesita señal. Intenta cuando tengas conexión.', 'error');
      return;
    }
    setExportando(true);
    try {
      const respuesta = await fetch(`/api/lazos/${lazoId}/pdf?enlace=1`, { cache: 'no-store' });
      const cuerpo = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !cuerpo.url) throw new Error(cuerpo.error || `No se pudo generar el PDF (código ${respuesta.status}).`);
      window.location.assign(cuerpo.url);
      showToast('Descargando el PDF del diagrama');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo generar el PDF. Revisa tu señal e intenta de nuevo.', 'error');
    }
    setExportando(false);
  }

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
      // Si falla, solo no se ofrece la vista del panel completo: el lazo
      // se sigue viendo y capturando igual.
      listarLazos().then((r) => setTodosLosLazos(r.lazos)).catch(() => setTodosLosLazos([]));
      listarPaneles().then((r) => setPaneles(r.paneles)).catch(() => setPaneles([]));
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
        showToast('Búsqueda cerrada; quedó abajo en «Fallas encontradas»');
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

  const delPanel = lazosDelMismoPanel(lazo, todosLosLazos);
  const panelDelLazo = paneles.find((p) => p.id === lazo.panel_id) || null;
  const nombrePanel = panelDelLazo ? nombreCompletoPanel(panelDelLazo) : lazo.panel || 'Panel';
  const hayVariosLazos = delPanel.length > 1;

  const pestanas: { k: Vista; label: string }[] = [
    { k: 'lista', label: 'Lista en orden' },
    { k: 'diagrama', label: 'Diagrama' },
    { k: 'falla', label: 'Falla a tierra' },
  ];

  return (
    <div className="max-w-3xl mx-auto pb-28">
      <div className="sticky top-0 z-20 glass-strong px-4 py-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <Link href={panelDelLazo ? `/lazos/panel/${panelDelLazo.id}` : `/lazos?cliente=${lazo.cliente_id}`} aria-label={panelDelLazo ? `Volver al ${panelDelLazo.nombre}` : 'Volver a los lazos'} className="shrink-0 w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft size={24} strokeWidth={2.4} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-faint uppercase tracking-[0.06em] truncate">
              {lazo.numero ? `${etiquetaSalida(lazo)} · ` : ''}{panelDelLazo ? panelDelLazo.nombre : NOMBRE_CIRCUITO[lazo.tipo]}{lazo.clase ? ` · Clase ${lazo.clase}` : ''}
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

        {vista === 'lista' && <ListaEnOrden lazo={lazo} elementos={elementos} onTocar={abrirFicha} />}

        {vista === 'diagrama' && (
          <>
            <div className="flex flex-wrap items-center justify-end gap-2 mb-2">
              {hayVariosLazos && (
                <div className="mr-auto grid grid-cols-2 gap-0.5 rounded-xl bg-surface border border-line p-0.5" role="radiogroup" aria-label="Qué ver en el diagrama">
                  {[{ panel: false, texto: 'Este lazo' }, { panel: true, texto: `Panel · ${delPanel.length}` }].map((o) => (
                    <button key={o.texto} type="button" role="radio" aria-checked={verPanel === o.panel} onClick={() => setVerPanel(o.panel)}
                      className={`min-h-[38px] px-3 rounded-lg text-[13px] font-semibold ${verPanel === o.panel ? 'bg-teal text-inkOnAccent' : 'text-muted'}`}>
                      {o.texto}
                    </button>
                  ))}
                </div>
              )}
              {lazo.tipo === 'deteccion' && (
                <button type="button" onClick={() => setAgregandoLazo(true)} aria-label="Agregar otro lazo a este panel"
                  className="min-h-[42px] px-3 rounded-xl border border-teal/60 bg-teal/10 text-teal text-[13.5px] font-semibold flex items-center gap-1 shrink-0">
                  <Plus size={16} strokeWidth={2.6} /> Lazo {siguienteNumeroDeLazo(delPanel.length ? delPanel : [lazo])}
                </button>
              )}
              <button type="button" onClick={exportarPdf} disabled={exportando}
                className="min-h-[42px] px-3.5 rounded-xl border border-line bg-surface-2 text-[13.5px] font-semibold flex items-center gap-1.5 disabled:opacity-60">
                <FileDown size={16} strokeWidth={2.2} /> {exportando ? 'Generando…' : 'PDF'}
              </button>
            </div>
            {hayVariosLazos && verPanel ? (
              <PanelLazos actual={lazo} elementosActual={elementos} lazos={delPanel} nombrePanel={nombrePanel} onTocar={abrirFicha} onAgregarLazo={() => setAgregandoLazo(true)} />
            ) : (
              <>
                <div className="rounded-2xl bg-surface border border-line p-3 overflow-x-auto">
                  <DiagramaLazo lazo={lazo} elementos={elementos} onTocar={abrirFicha} />
                </div>
                {lazo.tipo === 'deteccion' && !hayVariosLazos && (
                  <button type="button" onClick={() => setAgregandoLazo(true)}
                    className="mt-3 w-full rounded-2xl border border-dashed border-line-strong p-3 text-left flex items-center gap-3 hover:border-teal/60">
                    <span className="w-10 h-10 shrink-0 rounded-full bg-teal/15 text-teal flex items-center justify-center"><Plus size={19} strokeWidth={2.6} /></span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold">Agregar el lazo {siguienteNumeroDeLazo([lazo])} de este panel</span>
                      <span className="block text-[12.5px] text-muted">Si el panel tiene otra tarjeta SLC, captúrala y ve los dos lazos juntos en el diagrama.</span>
                    </span>
                  </button>
                )}
              </>
            )}
          </>
        )}

        {vista === 'falla' && (
          <BusquedaFalla lazo={lazo} elementos={elementos} falla={datos.falla} cortes={datos.cortes} resueltas={historial} onCambio={alCambiarFalla} onTocar={abrirFicha} />
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
                    {c.tabla === 'lazo_fallas' && c.despues?.foto_path && <VerFoto path={c.despues.foto_path} texto="Ver foto de la falla" />}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setVerHistorial(false)} className="mt-4 min-h-[46px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px]">Cerrar</button>
          </div>
        </ModalOverlay>
      )}

      {agregandoLazo && (
        <NuevoLazo
          clienteInicial={{ id: lazo.cliente_id, nombre: catalogoEnCache().find((c) => c.id === lazo.cliente_id)?.nombre || 'Cliente' }}
          lazosExistentes={todosLosLazos}
          inicial={{
            numero: siguienteNumeroDeLazo(delPanel.length ? delPanel : [lazo]),
            clase: lazo.clase || 'B',
            panel: panelDelLazo ? textoDePanel(panelDelLazo) : lazo.panel || '',
            panel_id: panelDelLazo?.id || null,
          }}
          onCerrar={() => setAgregandoLazo(false)}
          onCreado={(id) => { window.location.href = `/lazos/${id}`; }}
        />
      )}

      {editandoLazo && (
        <DatosDelLazo
          datos={datos}
          paneles={paneles.filter((p) => p.cliente_id === lazo.cliente_id)}
          esSupervisor={esSupervisor}
          onCerrar={() => setEditandoLazo(false)}
          onGuardado={(cambios) => {
            actualizar({ ...datos, lazo: { ...lazo, ...cambios } });
            // La lista de todos los lazos también, para que la vista Panel cuadre.
            setTodosLosLazos((todos) => todos.map((l) => (l.id === lazo.id ? { ...l, ...cambios } : l)));
            setEditandoLazo(false);
          }}
        />
      )}
    </div>
  );
}

type CambiosLazo = { nombre: string; panel: string | null; clase: 'A' | 'B' | null; numero: number | null; panel_id?: string | null };

function DatosDelLazo({ datos, paneles, esSupervisor, onCerrar, onGuardado }: {
  datos: DatosLazo;
  // Paneles registrados de este cliente.
  paneles: Panel[];
  esSupervisor: boolean;
  onCerrar: () => void;
  onGuardado: (cambios: CambiosLazo) => void;
}) {
  const { lazo } = datos;
  const [nombre, setNombre] = useState(lazo.nombre);
  const [panel, setPanel] = useState(lazo.panel || '');
  const [panelId, setPanelId] = useState<string>(lazo.panel_id || '');
  const [numero, setNumero] = useState(lazo.numero ? String(lazo.numero) : '');
  const [clase, setClase] = useState<'A' | 'B' | null>(lazo.clase);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const campo = 'w-full px-3 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]';

  async function guardar() {
    if (!nombre.trim()) { setError('El lazo necesita un nombre.'); return; }
    const numeroValido = /^\d{1,2}$/.test(numero) && Number(numero) >= 1;
    if (lazo.tipo === 'deteccion' && !numeroValido) { setError('El número de lazo va de 1 a 99.'); return; }
    if (numero && !numeroValido) { setError('El número va de 1 a 99.'); return; }
    setGuardando(true);
    setError(null);
    const elegido = paneles.find((p) => p.id === panelId) || null;
    const cambios: CambiosLazo = { nombre: nombre.trim(), panel: elegido ? textoDePanel(elegido) : panel.trim() || null, clase, numero: numero ? Number(numero) : null };
    try {
      await actualizarLazo(lazo.id, { nombre: cambios.nombre, panel: cambios.panel, clase: cambios.clase, numero: cambios.numero });
      // El panel se cambia aparte: así guardar sigue funcionando aunque falte
      // correr patch_lazos_paneles.sql.
      if ((lazo.panel_id || '') !== panelId) {
        const r = await asignarPanel(lazo.id, elegido);
        cambios.panel_id = r.panel_id;
      }
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
        <label htmlFor="dl-numero" className="block text-[12.5px] text-muted mt-3 mb-1">
          {lazo.tipo === 'deteccion' ? 'Número de lazo (SLC)' : lazo.tipo === 'estrobos' ? 'Número de NAC' : 'Número de voceo'}
        </label>
        <input id="dl-numero" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 2))} className={campo} />
        {paneles.length > 0 && (
          <>
            <label htmlFor="dl-panel-id" className="block text-[12.5px] text-muted mt-3 mb-1">Panel</label>
            <select id="dl-panel-id" value={panelId} onChange={(e) => setPanelId(e.target.value)} className={campo}>
              <option value="">Sin panel</option>
              {paneles.map((p) => <option key={p.id} value={p.id}>{nombreCompletoPanel(p)}</option>)}
            </select>
          </>
        )}
        {!panelId && (
          <>
            <label htmlFor="dl-panel" className="block text-[12.5px] text-muted mt-3 mb-1">{paneles.length > 0 ? 'Panel escrito (sin registrar)' : 'Panel'}</label>
            <input id="dl-panel" value={panel} onChange={(e) => setPanel(e.target.value)} maxLength={160} className={campo} />
          </>
        )}
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
