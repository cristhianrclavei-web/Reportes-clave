'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check, ChevronLeft, CloudOff, Eye, FileDown, Hand, Lock, LockOpen, Network, Map as IconoPlano, Link2, Link2Off, Loader2, Minus, MoreVertical, Plus, RotateCcw, RotateCw, MousePointer2, PenLine, Ruler, Spline, Redo2, Trash2, Undo2, Waypoints, X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import HojaCaptura from '@/components/lazos/HojaCaptura';
import DiagramaLazo from '@/components/lazos/DiagramaLazo';
import LienzoPlano, { type NodoTuberia, type Seleccion } from '@/components/lazos/LienzoPlano';
import SimboloPlano from '@/components/lazos/SimboloPlano';
import { girar } from '@/lib/simbolosPlano';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { confirmar, pedirTexto } from '@/lib/dialogos';
import { catalogoEnCache, listarCatalogoClientes } from '@/lib/clientesCatalogo';
import {
  PANEL_EN_PLANO, TIPOS_POR_CIRCUITO, cuantosEnRama, direccionDeTexto, direccionVisible, enOrdenDeRecorrido, esInicioSinConectar, idsSinConectar, tramosSinConectar, hijosDe, lineaPrincipal, lugarDespuesDe, tipoDispositivo,
  type Elemento, type Lugar, type Panel,
} from '@/lib/lazos';
import { guardarElemento, listarPaneles, pendientesDeLazo, subirPendientes } from '@/lib/lazosDatos';
import { alinear, arrastrarNodo, enderezar, insertarNodo, siguientesPuntos, type Union, type Ajuste, type Guias, type ModoTrazo } from '@/lib/trazoRecto';
import type { LineaConexion, MarcaConexion } from '@/lib/conexionesPlano';
import { colorDeLazo, conectarTramo, conexionesEnPlano, lugarParaConectar, lugarTramoSinConectar, revisarLazo, tieneSiguiente } from '@/lib/conexionesPlano';
import {
  DIAMETROS, TIPOS_TUBERIA, cantidadesDeEquipos, cantidadesDeTuberia, colorTuberia, distancia,
  escalaDesdeMedida, escalaDesdeProporcion, formatoMetros, longitudEnHoja, metrosDeTuberia, nombrePlanoSchema,
  proporcionDeEscala, siguienteTamano, tamanoDe, tamanoSimbolo, tiposSembrables,
  type EquipoPlano, type Plano, type Punto, type Sembrado, type TuberiaPlano,
} from '@/lib/planos';
import {
  borrarPlano, descargarPdfOriginal, entregarPdf, guardarCopiaLazos, guardarSembrado, imagenDelPlano, lazosDelCliente, leerPendiente,
  obtenerPlano, otrosPlanosDelCliente, renombrarPlano, type LazoConElementos,
} from '@/lib/planosDatos';

type Herramienta = 'ver' | 'equipo' | 'conectar' | 'tuberia' | 'escala' | 'unifilar';
// Las que cambian el plano: piden quitar el candado.
const HERRAMIENTAS_DE_EDICION: Herramienta[] = ['equipo', 'conectar', 'tuberia', 'escala'];
type EstadoGuardado = 'guardado' | 'guardando' | 'pendiente' | 'error';
// panelId: al sembrar el panel (tipo FACP), cuál de los del cliente.
type PorColocar = { tipo: string; elementoId: string | null; panelId?: string | null };
type Estado = { sembrado: Sembrado; metros: number | null };
// De dónde sale el siguiente al conectar: el panel o un dispositivo.
// 'suelto': un tramo nuevo que todavía no se une al lazo (otro nivel).
type Desde = 'panel' | 'suelto' | string;
// Hoja de captura abierta desde el plano: un dispositivo nuevo (en un equipo
// suelto o en un punto vacío) o corregir uno ya ligado.
type HojaPlano = {
  lazo: LazoConElementos;
  lugar: Lugar;
  editando: Elemento | null;
  equipoId: string | null;
  punto: Punto | null;
  tipo: string | null;
  // La dirección escrita junto al equipo suelto (importado del DXF).
  direccion?: string | null;
};

const HISTORIAL_MAXIMO = 60;

const HERRAMIENTAS: { id: Herramienta; nombre: string; icono: React.ReactNode }[] = [
  { id: 'ver', nombre: 'Mover', icono: <Hand size={18} strokeWidth={2.3} /> },
  { id: 'equipo', nombre: 'Equipos', icono: <MousePointer2 size={18} strokeWidth={2.3} /> },
  { id: 'conectar', nombre: 'Conectar', icono: <Waypoints size={18} strokeWidth={2.3} /> },
  { id: 'tuberia', nombre: 'Tubería', icono: <Spline size={18} strokeWidth={2.3} /> },
  { id: 'escala', nombre: 'Escala', icono: <Ruler size={18} strokeWidth={2.3} /> },
  { id: 'unifilar', nombre: 'Unifilar', icono: <Network size={18} strokeWidth={2.3} /> },
];

function nuevoId(): string {
  return crypto.randomUUID();
}

export default function EditorPlano({ planoId, esSupervisor }: { planoId: string; esSupervisor: boolean }) {
  const [plano, setPlano] = useState<Plano | null>(null);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [lazos, setLazos] = useState<LazoConElementos[]>([]);
  const lazosRef = useRef(lazos);
  lazosRef.current = lazos;
  // En qué otro plano del cliente está cada dispositivo (va en uno solo).
  const [otrosPlanos, setOtrosPlanos] = useState<Map<string, string>>(new Map());
  // Paneles del cliente, para sembrarlos y que de ahí salgan los lazos.
  const [paneles, setPaneles] = useState<Panel[]>([]);
  const [sinConexion, setSinConexion] = useState(false);
  const [pendientesLazos, setPendientesLazos] = useState(0);
  const [rechazoLazos, setRechazoLazos] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Lo dibujado y la escala van juntos para que «Deshacer» regrese ambos.
  const [estado, setEstado] = useState<Estado>({ sembrado: { equipos: [], tuberias: [] }, metros: null });
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const [historial, setHistorial] = useState<Estado[]>([]);
  // Lo que se deshizo, para «Rehacer».
  const [rehacer, setRehacer] = useState<Estado[]>([]);
  const [cambios, setCambios] = useState(0);
  const [guardado, setGuardado] = useState<EstadoGuardado>('guardado');
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const cadenaGuardar = useRef<Promise<void>>(Promise.resolve());

  const [herramienta, setHerramienta] = useState<Herramienta>('ver');
  // El plano abre bloqueado: al recorrerlo con el dedo no se mueve nada sin
  // querer. El candado de arriba lo abre para editar.
  const [bloqueado, setBloqueado] = useState(true);
  // Cuenta las veces que se intentó editar con candado (sacude el candado).
  const [avisosCandado, setAvisosCandado] = useState(0);
  // Pedido para centrar el plano en un equipo (al tocarlo en el unifilar).
  const [enfocar, setEnfocar] = useState<{ punto: Punto; vez: number } | null>(null);
  const [lazoUnifilarId, setLazoUnifilarId] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [porColocar, setPorColocar] = useState<PorColocar | null>(null);
  // Tramo de tubería que se está trazando. Cada toque se guarda en el plano
  // en ese momento: el tramo ya es una tubería del plano (id) desde el
  // segundo punto; antes solo se sabe dónde empieza (inicio).
  const [tramoActivo, setTramoActivo] = useState<{ id: string | null; inicio: Punto | null }>({ id: null, inicio: null });
  const [tipoTubo, setTipoTubo] = useState<string>('EMT');
  const [diametro, setDiametro] = useState<string>('3/4"');
  // Como AutoCAD: a 90° (recto), con diagonales a 45° o libre.
  const [modoTrazo, setModoTrazo] = useState<ModoTrazo>('recto');
  // Los puntos del tramo activo salen del plano mismo: así «Deshacer» y
  // «Rehacer» también le quitan o regresan quiebres.
  const tuberiaActiva = tramoActivo.id ? estado.sembrado.tuberias.find((t) => t.id === tramoActivo.id) || null : null;
  const trazo: Punto[] = useMemo(() => {
    if (tuberiaActiva) return tuberiaActiva.puntos;
    return tramoActivo.inicio ? [tramoActivo.inicio] : [];
  }, [tuberiaActiva, tramoActivo.inicio]);
  // Los equipos nuevos salen del último tamaño que se eligió en una ficha.
  const [tamanoNuevo, setTamanoNuevo] = useState(1);
  // Igual con el giro: si el edificio va en diagonal, todos salen ya girados.
  const [rotacionNueva, setRotacionNueva] = useState(0);
  const [medida, setMedida] = useState<Punto[]>([]);
  const [metrosMedida, setMetrosMedida] = useState('');
  const [proporcion, setProporcion] = useState('');
  const [errorEscala, setErrorEscala] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [menu, setMenu] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(true);
  const [verConexiones, setVerConexiones] = useState(true);
  const [lazoActivoId, setLazoActivoId] = useState<string | null>(null);
  const [desde, setDesde] = useState<Desde | null>(null);
  const [enMedio, setEnMedio] = useState(false);
  const [tipoNuevo, setTipoNuevo] = useState<string | null>(null);
  const [hoja, setHoja] = useState<HojaPlano | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [exportandoDxf, setExportandoDxf] = useState(false);

  // ---------- Carga ----------

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      const { plano: datos, sinConexion: sinSenal } = await obtenerPlano(planoId);
      setPlano(datos);
      setSinConexion(sinSenal);
      const pendiente = leerPendiente(planoId);
      if (pendiente) {
        // Cambios que no alcanzaron a subir la vez pasada: ganan a los del servidor.
        setEstado({ sembrado: pendiente.sembrado, metros: pendiente.metros_por_unidad });
        setCambios((n) => n + 1);
        showToast('Se recuperaron cambios guardados en este teléfono');
      } else {
        setEstado({ sembrado: datos.sembrado, metros: datos.metros_por_unidad });
      }
      imagenDelPlano(datos.imagen_path).then(setImagenUrl).catch((e) => setErrorCarga(e.message));
      lazosDelCliente(datos.cliente_id)
        .then((r) => {
          setLazos(r.lazos);
          if (r.sinConexion) setSinConexion(true);
        })
        .catch((e) => showToast(e.message, 'error'));
      otrosPlanosDelCliente(datos.cliente_id, planoId).then(setOtrosPlanos).catch((e) => showToast(e.message, 'error'));
      listarPaneles()
        .then((r) => setPaneles(r.paneles.filter((p) => p.cliente_id === datos.cliente_id)))
        .catch((e) => showToast(e.message, 'error'));
    } catch (e: any) {
      setErrorCarga(e?.message || 'No se pudo abrir el plano.');
    }
  }, [planoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // ---------- Guardar ----------

  // Uno a la vez y en orden: así el servidor nunca se queda con uno viejo.
  const subir = useCallback(() => {
    cadenaGuardar.current = cadenaGuardar.current.then(async () => {
      setGuardado('guardando');
      try {
        const { sembrado, metros } = estadoRef.current;
        const resultado = await guardarSembrado(planoId, { sembrado, metros_por_unidad: metros });
        setGuardado(resultado.pendiente ? 'pendiente' : 'guardado');
        setErrorGuardar(null);
      } catch (e: any) {
        setGuardado('error');
        setErrorGuardar(e?.message || 'No se pudo guardar el plano.');
      }
    });
  }, [planoId]);

  useEffect(() => {
    if (cambios === 0) return;
    const espera = setTimeout(subir, 1200);
    return () => clearTimeout(espera);
  }, [cambios, subir]);

  useEffect(() => {
    function alVolverSenal() {
      if (guardado === 'pendiente') subir();
    }
    window.addEventListener('online', alVolverSenal);
    return () => window.removeEventListener('online', alVolverSenal);
  }, [guardado, subir]);

  // Dispositivos capturados desde el plano sin señal: van en la misma cola
  // de los lazos y se suben al volver la señal.
  const contarPendientesLazos = useCallback(
    () => lazosRef.current.reduce((suma, l) => suma + pendientesDeLazo(l.id), 0),
    [],
  );

  const sincronizarLazos = useCallback(async () => {
    setPendientesLazos(contarPendientesLazos());
    if (!navigator.onLine || contarPendientesLazos() === 0) return;
    const resultado = await subirPendientes();
    setRechazoLazos(resultado.rechazo);
    const quedan = contarPendientesLazos();
    setPendientesLazos(quedan);
    if (quedan === 0) showToast('Se subieron los dispositivos capturados sin señal');
  }, [contarPendientesLazos]);

  useEffect(() => {
    if (lazos.length > 0) sincronizarLazos();
    // Solo cuando llegan los lazos; después lo dispara la señal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lazos.length > 0]);

  useEffect(() => {
    window.addEventListener('online', sincronizarLazos);
    return () => window.removeEventListener('online', sincronizarLazos);
  }, [sincronizarLazos]);

  // Anota el estado actual para «Deshacer». Un cambio nuevo borra lo que se
  // podía «Rehacer». El estado de antes se toma aquí, no dentro de
  // setHistorial: React puede correr esa función ya con el estado nuevo.
  function anotarEnHistorial() {
    const antes = estadoRef.current;
    setHistorial((h) => [...h.slice(-(HISTORIAL_MAXIMO - 1)), antes]);
    setRehacer([]);
  }

  function cambiar(nuevo: Estado) {
    anotarEnHistorial();
    setEstado(nuevo);
    setCambios((n) => n + 1);
  }

  function cambiarSembrado(sembrado: Sembrado) {
    cambiar({ sembrado, metros: estadoRef.current.metros });
  }

  function deshacer() {
    const anterior = historial[historial.length - 1];
    if (!anterior) return;
    const actual = estadoRef.current;
    setHistorial((h) => h.slice(0, -1));
    setRehacer((r) => [...r, actual]);
    setEstado(anterior);
    setSeleccion(null);
    setCambios((n) => n + 1);
  }

  function rehacerCambio() {
    const siguiente = rehacer[rehacer.length - 1];
    if (!siguiente) return;
    const actual = estadoRef.current;
    setRehacer((r) => r.slice(0, -1));
    setHistorial((h) => [...h.slice(-(HISTORIAL_MAXIMO - 1)), actual]);
    setEstado(siguiente);
    setSeleccion(null);
    setCambios((n) => n + 1);
  }

  // Atajos: Ctrl+Z deshace; Ctrl+Y (o Ctrl+Shift+Z) rehace. En Mac, Cmd.
  // No cuando se escribe en un campo (ahí el navegador deshace el texto).
  const atajos = useRef({ deshacer, rehacerCambio, soltarTramo: () => {} });
  useEffect(() => {
    function alTeclear(ev: KeyboardEvent) {
      const destino = ev.target as HTMLElement | null;
      if (destino && (destino.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName))) return;
      // Esc termina el tramo de tubería, como en AutoCAD.
      if (ev.key === 'Escape') {
        atajos.current.soltarTramo();
        return;
      }
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      const tecla = ev.key.toLowerCase();
      if (tecla === 'z' && !ev.shiftKey) {
        ev.preventDefault();
        atajos.current.deshacer();
      } else if (tecla === 'y' || (tecla === 'z' && ev.shiftKey)) {
        ev.preventDefault();
        atajos.current.rehacerCambio();
      }
    }
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  // ---------- Dispositivos de los lazos ----------

  const elementosPorId = useMemo(() => {
    const mapa = new Map<string, { elemento: Elemento; lazo: LazoConElementos }>();
    for (const lazo of lazos) for (const e of lazo.elementos) mapa.set(e.id, { elemento: e, lazo });
    return mapa;
  }, [lazos]);

  const sembrados = useMemo(() => new Set(estado.sembrado.equipos.map((e) => e.elementoId).filter(Boolean) as string[]), [estado.sembrado]);

  // Lo que falta sembrar de cada lazo, en el orden en que corre el cable.
  const faltantesPorLazo = useMemo(
    () => lazos.map((lazo) => ({ lazo, faltan: enOrdenDeRecorrido(lazo.elementos).filter((e) => !sembrados.has(e.id) && !otrosPlanos.has(e.id)) })),
    [lazos, sembrados, otrosPlanos],
  );

  function etiquetaDeElemento(elemento: Elemento, lazo: LazoConElementos): string {
    return direccionVisible(elemento.direccion, lazo.numero) || elemento.nombre;
  }

  // Sueltos: sembrados sin dispositivo del lazo (o cuyo dispositivo ya se borró del lazo).
  const sueltos = useMemo(
    () => estado.sembrado.equipos.filter((e) => e.tipo !== PANEL_EN_PLANO && (!e.elementoId || !elementosPorId.has(e.elementoId))),
    [estado.sembrado, elementosPorId],
  );
  const totalFaltantes = faltantesPorLazo.reduce((suma, f) => suma + f.faltan.length, 0);

  // Dispositivos con los que se puede ligar un equipo suelto: los que faltan
  // sembrar, primero los del mismo tipo y en el orden del cable.
  function candidatosPara(equipo: EquipoPlano) {
    const lista: { elemento: Elemento; lazo: LazoConElementos; etiqueta: string }[] = [];
    for (const { lazo, faltan } of faltantesPorLazo) {
      for (const elemento of faltan) lista.push({ elemento, lazo, etiqueta: etiquetaDeElemento(elemento, lazo) });
    }
    const mismoTipo = lista.filter((c) => c.elemento.tipo === equipo.tipo);
    const otroTipo = lista.filter((c) => c.elemento.tipo !== equipo.tipo);
    return [...mismoTipo, ...otroTipo];
  }

  // El símbolo se queda donde está y con su tamaño; solo toma el dispositivo,
  // su tipo y su dirección.
  function ligarEquipo(equipoId: string, elementoId: string) {
    const ligado = elementosPorId.get(elementoId);
    if (!ligado) return;
    const etiqueta = etiquetaDeElemento(ligado.elemento, ligado.lazo);
    const { sembrado } = estadoRef.current;
    cambiarSembrado({
      ...sembrado,
      equipos: sembrado.equipos.map((e) => (e.id === equipoId ? { ...e, elementoId, tipo: ligado.elemento.tipo, etiqueta } : e)),
    });
    if (porColocar?.elementoId === elementoId) setPorColocar(null);
    showToast(`Ligado a ${etiqueta}`);
  }

  // Sin la dirección vieja: ya no es de ese dispositivo.
  function desligarEquipo(equipoId: string) {
    const { sembrado } = estadoRef.current;
    cambiarSembrado({ ...sembrado, equipos: sembrado.equipos.map((e) => (e.id === equipoId ? { ...e, elementoId: null, etiqueta: null } : e)) });
  }

  const etiquetaDe = useCallback((e: EquipoPlano): string => {
    if (e.panelId) {
      const panel = paneles.find((p) => p.id === e.panelId);
      if (panel) return panel.nombre;
    }
    if (e.elementoId) {
      const ligado = elementosPorId.get(e.elementoId);
      if (ligado) return etiquetaDeElemento(ligado.elemento, ligado.lazo);
    }
    return e.etiqueta || '';
  }, [elementosPorId, paneles]);

  // ---------- Conectar (el lazo se arma desde el plano) ----------

  const colorPorLazo = useMemo(() => new Map(lazos.map((l, i) => [l.id, colorDeLazo(i)])), [lazos]);
  // El cable se dibuja por la tubería si el equipo está a menos de dos
  // símbolos de ella.
  const alcanceTuberia = plano ? tamanoSimbolo(plano.ancho, plano.alto) * 2 : 0;
  const conexiones = useMemo(() => conexionesEnPlano(lazos, estado.sembrado, otrosPlanos, alcanceTuberia), [lazos, estado.sembrado, otrosPlanos, alcanceTuberia]);
  const lazoActivo = lazos.find((l) => l.id === lazoActivoId) || null;
  const elementoDesde = desde && desde !== 'panel' ? elementosPorId.get(desde)?.elemento || null : null;
  // El símbolo del que sale el cable, para marcarlo en el plano.
  let equipoResaltado: string | null = null;
  if (desde === 'panel') {
    const panelAqui = estado.sembrado.equipos.find((e) => e.tipo === PANEL_EN_PLANO && (!lazoActivo?.panel_id || !e.panelId || e.panelId === lazoActivo.panel_id));
    equipoResaltado = panelAqui ? panelAqui.id : null;
  } else if (elementoDesde) {
    equipoResaltado = estado.sembrado.equipos.find((e) => e.elementoId === elementoDesde.id)?.id || null;
  }

  function textoDeElemento(elemento: Elemento, lazo: LazoConElementos): string {
    const direccion = direccionVisible(elemento.direccion, lazo.numero);
    return direccion ? `${elemento.nombre} · ${direccion}` : elemento.nombre;
  }

  function elegirLazo(lazo: LazoConElementos) {
    setLazoActivoId(lazo.id);
    // Lazo vacío: arranca en el panel. Si ya tiene, se toca de dónde sigue.
    setDesde(lazo.elementos.length === 0 ? 'panel' : null);
    setEnMedio(false);
    setTipoNuevo(TIPOS_POR_CIRCUITO[lazo.tipo][0].codigo);
  }

  // Conectar arranca con el primer lazo del cliente (aunque los lazos lleguen
  // después de abrir la herramienta).
  useEffect(() => {
    if (herramienta === 'conectar' && !lazoActivoId && lazos.length > 0) elegirLazo(lazos[0]);
    // elegirLazo solo cambia estado de aquí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [herramienta, lazoActivoId, lazos]);

  function elegirDesde(nuevo: Desde) {
    setDesde(nuevo);
    setEnMedio(false);
  }

  // Al conectar: tocar un dispositivo del lazo = seguir desde él; tocar un
  // equipo suelto o un punto vacío = capturar el siguiente ahí.
  async function tocarAlConectar(p: Punto, equipo: EquipoPlano | null) {
    if (!lazoActivo) {
      showToast('Elige abajo el lazo que vas a conectar', 'error');
      setPanelAbierto(true);
      return;
    }
    // Tocar el panel: de ahí sale el cable (si es el panel de este lazo).
    if (equipo && equipo.tipo === PANEL_EN_PLANO) {
      if (equipo.panelId && lazoActivo.panel_id && equipo.panelId !== lazoActivo.panel_id) {
        showToast(`Ese no es el panel de ${lazoActivo.codigo}.`, 'error');
        return;
      }
      elegirDesde('panel');
      return;
    }
    const ligado = equipo?.elementoId ? elementosPorId.get(equipo.elementoId) || null : null;
    if (equipo && ligado) {
      if (ligado.lazo.id !== lazoActivo.id) {
        showToast(`Ese es de ${ligado.lazo.codigo}. Cámbiate a ese lazo abajo para seguir desde él.`, 'error');
        return;
      }
      // El primero de un tramo sin conectar, tocado con un origen ya elegido:
      // se ofrece unir el tramo ahí.
      if (esInicioSinConectar(ligado.elemento) && desde && desde !== 'suelto' && desde !== ligado.elemento.id) {
        const origenTexto = desde === 'panel' ? 'el panel' : elementoDesde ? textoDeElemento(elementoDesde, lazoActivo) : '';
        const unir = await confirmar(`¿Unir el tramo de ${ligado.elemento.nombre} después de ${origenTexto}?`, {
          detalle: `Son ${cuantosEnRama(lazoActivo.elementos, ligado.elemento.id)} dispositivos que hoy están sin conectar. Si solo quieres seguir trazando desde él, cancela.`,
        });
        if (unir) {
          await unirTramo(ligado.elemento.id);
          return;
        }
      }
      elegirDesde(ligado.elemento.id);
      return;
    }
    if (!desde) {
      showToast('Primero toca de dónde sale el cable: un dispositivo del lazo o «Desde el panel»', 'error');
      setPanelAbierto(true);
      return;
    }
    const origen = desde === 'panel' || desde === 'suelto' ? desde : lazoActivo.elementos.find((e) => e.id === desde);
    if (!origen) {
      setDesde(null);
      showToast('Ese dispositivo ya no está en el lazo. Toca de dónde sale el cable.', 'error');
      return;
    }
    const tipo = equipo ? equipo.tipo : tipoNuevo;
    if (!tipo) {
      showToast('Elige abajo qué equipo vas a poner', 'error');
      return;
    }
    setHoja({
      lazo: lazoActivo,
      lugar: origen === 'suelto' ? lugarTramoSinConectar(lazoActivo.elementos) : lugarParaConectar(lazoActivo.elementos, origen, enMedio),
      editando: null,
      equipoId: equipo ? equipo.id : null,
      punto: equipo ? null : alinearEquipo(p).puntos[0],
      tipo,
      direccion: equipo?.etiqueta ? direccionDeTexto(equipo.etiqueta) : null,
    });
  }

  // Une un tramo sin conectar después de lo elegido en «Sale de». Cada
  // dispositivo que cambia se guarda (sin señal, a la cola del lazo).
  async function unirTramo(inicioId: string) {
    if (!lazoActivo || !desde || desde === 'suelto') {
      showToast('Primero elige de dónde sale: el último del otro nivel, un dispositivo o el panel.', 'error');
      return;
    }
    const origen = desde === 'panel' ? 'panel' : lazoActivo.elementos.find((e) => e.id === desde);
    if (!origen) return;
    try {
      const cambios = conectarTramo(lazoActivo.elementos, inicioId, origen, enMedio);
      let pendiente = false;
      for (const elemento of cambios) {
        const resultado = await guardarElemento(elemento);
        pendiente = pendiente || resultado.pendiente;
        ponerElementoEnLazos(elemento);
      }
      setPendientesLazos(contarPendientesLazos());
      if (pendiente && navigator.onLine) sincronizarLazos();
      // Lo siguiente sale del último del tramo que se unió.
      const ultimoUnido = cambios.length > 1 ? cambios[cambios.length - 1] : null;
      if (ultimoUnido) setDesde(ultimoUnido.id);
      showToast(pendiente ? 'Tramo unido en el teléfono; sube al tener señal' : 'Tramo unido al lazo');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo unir el tramo.', 'error');
    }
  }

  // El lazo cambió (se capturó o corrigió un dispositivo): se actualiza aquí
  // y en la copia del teléfono.
  function ponerElementoEnLazos(elemento: Elemento) {
    const nuevos = lazosRef.current.map((l) => (
      l.id === elemento.lazo_id ? { ...l, elementos: l.elementos.filter((e) => e.id !== elemento.id).concat(elemento) } : l
    ));
    setLazos(nuevos);
    if (plano) guardarCopiaLazos(plano.cliente_id, nuevos);
  }

  // Lo llama la hoja por cada dispositivo que guarda (el nuevo y, si se metió
  // en medio de una rama, los que pasan a colgar de él).
  function alGuardarDesdeHoja(abierta: HojaPlano, elemento: Elemento, pendiente: boolean) {
    ponerElementoEnLazos(elemento);
    setPendientesLazos(contarPendientesLazos());
    if (pendiente && navigator.onLine) sincronizarLazos();

    const { sembrado } = estadoRef.current;
    if (abierta.editando) {
      // Si se corrigió el tipo, el símbolo también cambia.
      if (elemento.id === abierta.editando.id && elemento.tipo !== abierta.editando.tipo) {
        cambiarSembrado({ ...sembrado, equipos: sembrado.equipos.map((e) => (e.elementoId === elemento.id ? { ...e, tipo: elemento.tipo } : e)) });
      }
      return;
    }
    const esElNuevo = !abierta.lazo.elementos.some((e) => e.id === elemento.id);
    if (!esElNuevo) return;
    const etiqueta = etiquetaDeElemento(elemento, abierta.lazo);
    if (abierta.equipoId) {
      cambiarSembrado({
        ...sembrado,
        equipos: sembrado.equipos.map((e) => (e.id === abierta.equipoId ? { ...e, elementoId: elemento.id, tipo: elemento.tipo, etiqueta } : e)),
      });
    } else if (abierta.punto) {
      const equipo: EquipoPlano = { id: nuevoId(), tipo: elemento.tipo, x: abierta.punto[0], y: abierta.punto[1], elementoId: elemento.id, etiqueta };
      if (tamanoNuevo !== 1) equipo.tamano = tamanoNuevo;
      if (rotacionNueva !== 0) equipo.rotacion = rotacionNueva;
      cambiarSembrado({ ...sembrado, equipos: [...sembrado.equipos, equipo] });
    }
    // El siguiente sale de este.
    setDesde(elemento.id);
    setEnMedio(false);
    setTipoNuevo(elemento.tipo);
  }

  function editarDatos(equipo: EquipoPlano) {
    const ligado = equipo.elementoId ? elementosPorId.get(equipo.elementoId) : null;
    if (!ligado) return;
    setHoja({
      lazo: ligado.lazo,
      lugar: lugarDespuesDe(ligado.lazo.elementos, ligado.elemento),
      editando: ligado.elemento,
      equipoId: equipo.id,
      punto: null,
      tipo: null,
    });
  }

  // ---------- Acciones en el plano ----------

  const W = plano?.ancho || 1;
  const H = plano?.alto || 1;
  const radioPegar = tamanoSimbolo(W, H);

  // Lo que agrega un toque a la tubería: pegado al centro de un equipo o a
  // un nodo (quiebre o punta) de otra tubería, con codo si no está en línea;
  // o a 90°/45° del anterior y alineado con lo que ya está.
  const ajustarPunto = useCallback((p: Punto): Ajuste => {
    const { equipos, tuberias } = estadoRef.current.sembrado;
    let puntoFijo: Punto | null = null;
    let menor = Infinity;
    for (const e of equipos) {
      const d = distancia(p, [e.x, e.y]);
      if (d <= radioPegar * tamanoDe(e) && d < menor) {
        puntoFijo = [e.x, e.y];
        menor = d;
      }
    }
    if (!puntoFijo) {
      const ultimoDelTramo = trazo[trazo.length - 1];
      for (const nodo of tuberias.flatMap((t) => t.puntos)) {
        if (nodo === ultimoDelTramo) continue;
        const d = distancia(p, nodo);
        if (d <= radioPegar * 0.8 && d < menor) {
          puntoFijo = nodo;
          menor = d;
        }
      }
    }
    const referencias: Punto[] = [
      ...equipos.map((e): Punto => [e.x, e.y]),
      ...tuberias.flatMap((t) => t.puntos),
      ...trazo.slice(0, -1),
    ];
    return siguientesPuntos(trazo, p, {
      modo: modoTrazo,
      puntoFijo,
      referencias,
      tolerancia: radioPegar * 0.6,
    });
  }, [trazo, modoTrazo, radioPegar]);

  // Al poner o mover un equipo: si queda casi en el mismo eje que otro, se
  // empareja con él y se muestra la guía (como el rastreo de AutoCAD).
  const alinearEquipo = useCallback((p: Punto, excepto: string | null = null): Ajuste => {
    const otros = estadoRef.current.sembrado.equipos.filter((e) => e.id !== excepto).map((e): Punto => [e.x, e.y]);
    const { punto, guias } = alinear(p, otros, radioPegar * 0.6, { x: true, y: true });
    return { puntos: [punto], guias };
  }, [radioPegar]);

  // Guías mientras se arrastra un equipo.
  const [guiasArrastre, setGuiasArrastre] = useState<Guias | null>(null);

  function colocarEquipo(toque: Punto) {
    const p = alinearEquipo(toque).puntos[0];
    if (!porColocar) {
      showToast('Elige abajo qué equipo vas a sembrar', 'error');
      setPanelAbierto(true);
      return;
    }
    const equipo: EquipoPlano = { id: nuevoId(), tipo: porColocar.tipo, x: p[0], y: p[1], elementoId: porColocar.elementoId };
    if (tamanoNuevo !== 1) equipo.tamano = tamanoNuevo;
    if (rotacionNueva !== 0) equipo.rotacion = rotacionNueva;
    if (porColocar.elementoId) {
      const ligado = elementosPorId.get(porColocar.elementoId);
      if (ligado) equipo.etiqueta = etiquetaDeElemento(ligado.elemento, ligado.lazo);
    }
    if (porColocar.tipo === PANEL_EN_PLANO) {
      const panel = paneles.find((x) => x.id === porColocar.panelId) || null;
      equipo.panelId = panel ? panel.id : null;
      equipo.etiqueta = panel ? panel.nombre : 'FACP';
      // Un panel se siembra una vez: se suelta la selección.
      setPorColocar(null);
      showToast(panel ? `${panel.nombre} sembrado` : 'Panel sembrado');
    }
    cambiarSembrado({ ...estadoRef.current.sembrado, equipos: [...estadoRef.current.sembrado.equipos, equipo] });
    // Del lazo: pasa solo al siguiente dispositivo en el orden del cable.
    if (porColocar.elementoId) {
      const ligado = elementosPorId.get(porColocar.elementoId);
      const yaSembrados = new Set(sembrados).add(porColocar.elementoId);
      const siguiente = ligado ? enOrdenDeRecorrido(ligado.lazo.elementos).find((e) => !yaSembrados.has(e.id)) : null;
      setPorColocar(siguiente ? { tipo: siguiente.tipo, elementoId: siguiente.id } : null);
      if (!siguiente && ligado) showToast(`Todo ${ligado.lazo.codigo} quedó sembrado`);
    }
  }

  function alTocar(p: Punto, equipo: EquipoPlano | null, tuberia: TuberiaPlano | null) {
    if (herramienta === 'conectar') {
      tocarAlConectar(p, equipo);
      return;
    }
    if (herramienta === 'equipo') {
      colocarEquipo(p);
      return;
    }
    if (herramienta === 'tuberia') {
      agregarATramo(p);
      return;
    }
    if (herramienta === 'escala') {
      setMedida((m) => (m.length >= 2 ? [p] : [...m, p]));
      return;
    }
    if (equipo) setSeleccion({ tipo: 'equipo', id: equipo.id });
    else if (tuberia) setSeleccion({ tipo: 'tuberia', id: tuberia.id });
    else setSeleccion(null);
    // En el unifilar se muestra el lazo del equipo tocado.
    const lazoDelEquipo = equipo?.elementoId ? elementosPorId.get(equipo.elementoId)?.lazo : null;
    if (lazoDelEquipo) setLazoUnifilarId(lazoDelEquipo.id);
    if (equipo || tuberia) setPanelAbierto(true);
  }

  // Cada toque se guarda: el primero marca el inicio, el segundo crea la
  // tubería en el plano y los demás le agregan quiebres. Tocar otra vez el
  // último punto termina el tramo.
  function agregarATramo(p: Punto) {
    const ultimo = trazo[trazo.length - 1];
    if (ultimo && distancia(p, ultimo) <= radioPegar * 0.8) {
      soltarTramo();
      return;
    }
    const { puntos } = ajustarPunto(p);
    const { sembrado } = estadoRef.current;
    if (tuberiaActiva) {
      cambiarSembrado({
        ...sembrado,
        tuberias: sembrado.tuberias.map((t) => (t.id === tuberiaActiva.id ? { ...t, puntos: [...t.puntos, ...puntos] } : t)),
      });
      return;
    }
    if (tramoActivo.inicio) {
      const tuberia: TuberiaPlano = { id: nuevoId(), tipo: tipoTubo, diametro, puntos: [tramoActivo.inicio, ...puntos] };
      cambiarSembrado({ ...sembrado, tuberias: [...sembrado.tuberias, tuberia] });
      setTramoActivo({ id: tuberia.id, inicio: null });
      return;
    }
    setTramoActivo({ id: null, inicio: puntos[puntos.length - 1] });
  }

  // Termina el tramo; el siguiente toque empieza otro. (Lo trazado ya está guardado.)
  function soltarTramo() {
    setTramoActivo({ id: null, inicio: null });
  }
  // Con candado, Ctrl+Z y Ctrl+Y no cambian nada.
  atajos.current = bloqueado
    ? { deshacer: pedirDesbloqueo, rehacerCambio: pedirDesbloqueo, soltarTramo }
    : { deshacer, rehacerCambio, soltarTramo };

  // Cambiar tipo o diámetro a medio trazo: lo que sigue es otro tramo que
  // arranca donde iba el anterior.
  function cambiarTuboActual(cambio: { tipo?: string; diametro?: string }) {
    if (cambio.tipo) setTipoTubo(cambio.tipo);
    if (cambio.diametro) setDiametro(cambio.diametro);
    const ultimo = trazo[trazo.length - 1];
    if (tuberiaActiva && ultimo) setTramoActivo({ id: null, inicio: ultimo });
  }

  // Al arrastrar un equipo: se anota el estado de antes una sola vez para
  // que «Deshacer» lo regrese a donde estaba.
  function arrastreInicio(id: string) {
    anotarEnHistorial();
    setSeleccion({ tipo: 'equipo', id });
  }

  function arrastre(id: string, dedo: Punto) {
    const { puntos, guias } = alinearEquipo(dedo, id);
    const p = puntos[0];
    setGuiasArrastre(guias);
    setEstado((actual) => ({
      ...actual,
      sembrado: { ...actual.sembrado, equipos: actual.sembrado.equipos.map((e) => (e.id === id ? { ...e, x: p[0], y: p[1] } : e)) },
    }));
  }

  // Arrastrar un nodo de tubería: la punta se alarga derecho y, si llega a
  // otra tubería, se une ahí y esa tubería gana un nodo al soltar.
  const unionPendiente = useRef<Union | null>(null);
  const nodoArrastrado = useRef<NodoTuberia | null>(null);

  function nodoInicio(nodo: NodoTuberia) {
    anotarEnHistorial();
    unionPendiente.current = null;
    nodoArrastrado.current = nodo;
  }

  function moverNodo(nodo: NodoTuberia, dedo: Punto) {
    const { equipos, tuberias } = estadoRef.current.sembrado;
    const r = arrastrarNodo(tuberias, nodo.tuberiaId, nodo.indice, dedo, {
      modo: modoTrazo,
      equipos: equipos.map((e): Punto => [e.x, e.y]),
      tolerancia: radioPegar * 0.6,
    });
    unionPendiente.current = r.union;
    setGuiasArrastre(r.guias);
    setEstado((actual) => ({
      ...actual,
      sembrado: {
        ...actual.sembrado,
        tuberias: actual.sembrado.tuberias.map((t) => (
          t.id === nodo.tuberiaId ? { ...t, puntos: t.puntos.map((q, i) => (i === nodo.indice ? r.punto : q)) } : t
        )),
      },
    }));
  }

  function nodoFin() {
    const union = unionPendiente.current;
    const nodo = nodoArrastrado.current;
    unionPendiente.current = null;
    nodoArrastrado.current = null;
    setGuiasArrastre(null);
    if (union && nodo) {
      setEstado((actual) => {
        // El punto donde quedó la punta es el que se le agrega a la otra tubería.
        const punto = actual.sembrado.tuberias.find((t) => t.id === nodo.tuberiaId)?.puntos[nodo.indice];
        if (!punto) return actual;
        return {
          ...actual,
          sembrado: {
            ...actual.sembrado,
            tuberias: actual.sembrado.tuberias.map((t) => (t.id === union.tuberiaId ? { ...t, puntos: insertarNodo(t.puntos, union.segmento, punto) } : t)),
          },
        };
      });
      showToast('Tubería unida: se agregó el nodo');
    }
    setCambios((n) => n + 1);
  }

  function arrastreFin() {
    setGuiasArrastre(null);
    setCambios((n) => n + 1);
  }

  function quitarSeleccion() {
    if (!seleccion) return;
    const { sembrado } = estadoRef.current;
    if (seleccion.tipo === 'equipo') cambiarSembrado({ ...sembrado, equipos: sembrado.equipos.filter((e) => e.id !== seleccion.id) });
    else cambiarSembrado({ ...sembrado, tuberias: sembrado.tuberias.filter((t) => t.id !== seleccion.id) });
    setSeleccion(null);
  }

  function cambiarTamano(id: string, tamano: number) {
    const { sembrado } = estadoRef.current;
    cambiarSembrado({ ...sembrado, equipos: sembrado.equipos.map((e) => (e.id === id ? { ...e, tamano } : e)) });
    setTamanoNuevo(tamano);
  }

  function cambiarRotacion(id: string, rotacion: number) {
    const { sembrado } = estadoRef.current;
    cambiarSembrado({ ...sembrado, equipos: sembrado.equipos.map((e) => (e.id === id ? { ...e, rotacion } : e)) });
    setRotacionNueva(rotacion);
  }

  function rotacionATodos(rotacion: number) {
    const { sembrado } = estadoRef.current;
    cambiarSembrado({ ...sembrado, equipos: sembrado.equipos.map((e) => ({ ...e, rotacion })) });
    showToast(`Todos los equipos quedaron girados a ${rotacion}°`);
  }

  function tamanoATodos(tamano: number) {
    const { sembrado } = estadoRef.current;
    cambiarSembrado({ ...sembrado, equipos: sembrado.equipos.map((e) => ({ ...e, tamano })) });
    showToast(`Todos los equipos quedaron al ${Math.round(tamano * 100)} %`);
  }

  function cambiarTuberia(id: string, cambio: Partial<TuberiaPlano>) {
    const { sembrado } = estadoRef.current;
    cambiarSembrado({ ...sembrado, tuberias: sembrado.tuberias.map((t) => (t.id === id ? { ...t, ...cambio } : t)) });
  }

  function pedirDesbloqueo() {
    setAvisosCandado((n) => n + 1);
    showToast('El plano está bloqueado. Toca el candado de arriba para editar.');
  }

  function cambiarCandado() {
    if (bloqueado) {
      setBloqueado(false);
      showToast('Edición abierta: ya puedes mover y cambiar el plano');
      return;
    }
    setBloqueado(true);
    // Lo que se estaba haciendo se suelta y se vuelve a ver el plano.
    if (HERRAMIENTAS_DE_EDICION.includes(herramienta)) elegirHerramienta('ver');
    showToast('Plano bloqueado');
  }

  // Tocar un dispositivo en el unifilar lleva el plano hasta él.
  function buscarEnPlano(elemento: Elemento) {
    const equipo = estadoRef.current.sembrado.equipos.find((e) => e.elementoId === elemento.id);
    if (equipo) {
      setSeleccion({ tipo: 'equipo', id: equipo.id });
      setEnfocar((anterior) => ({ punto: [equipo.x, equipo.y], vez: (anterior?.vez || 0) + 1 }));
      return;
    }
    const otro = otrosPlanos.get(elemento.id);
    showToast(otro ? `${elemento.nombre} está en el plano «${otro}»` : `${elemento.nombre} todavía no está sembrado en este plano`);
  }

  function elegirHerramienta(h: Herramienta) {
    if (bloqueado && HERRAMIENTAS_DE_EDICION.includes(h)) {
      pedirDesbloqueo();
      return;
    }
    setHerramienta(h);
    setSeleccion(null);
    setTramoActivo({ id: null, inicio: null });
    setMedida([]);
    setErrorEscala(null);
    setPanelAbierto(true);
    // Equipos: arranca con el primer dispositivo que falte sembrar.
    if (h === 'equipo' && !porColocar) {
      const primero = faltantesPorLazo.find((f) => f.faltan.length > 0)?.faltan[0];
      if (primero) setPorColocar({ tipo: primero.tipo, elementoId: primero.id });
    }
  }

  // ---------- Escala ----------

  function aplicarProporcion() {
    const m = escalaDesdeProporcion(Number(proporcion));
    if (!m) {
      setErrorEscala('Escribe solo el número: para 1:100 pon 100.');
      return;
    }
    cambiar({ sembrado: estadoRef.current.sembrado, metros: m });
    setErrorEscala(null);
    setProporcion('');
    showToast(`Escala 1:${proporcionDeEscala(m)} aplicada`);
  }

  function aplicarMedida() {
    if (medida.length < 2) {
      setErrorEscala('Toca en el plano los dos extremos de algo que mida lo que conoces.');
      return;
    }
    const m = escalaDesdeMedida(medida[0], medida[1], Number(metrosMedida.replace(',', '.')));
    if (!m) {
      setErrorEscala('Escribe la medida real en metros, por ejemplo 0.90.');
      return;
    }
    cambiar({ sembrado: estadoRef.current.sembrado, metros: m });
    setErrorEscala(null);
    setMedida([]);
    setMetrosMedida('');
    showToast(`Escala calibrada: aprox. 1:${proporcionDeEscala(m)}`);
  }

  // ---------- Plano ----------

  async function exportar() {
    if (!plano) return;
    if (!navigator.onLine) {
      showToast('El PDF necesita señal. Intenta cuando tengas conexión.', 'error');
      return;
    }
    setExportando(true);
    try {
      // Plano en DXF: el fondo es su imagen (en PNG, que es lo que acepta el PDF).
      const esDxf = plano.formato === 'dxf';
      const [{ exportarPlanoPdf }, original] = await Promise.all([
        import('@/lib/exportarPlanoPdf'),
        descargarPdfOriginal(esDxf ? plano.imagen_path : plano.pdf_path),
      ]);
      const fondoPng = esDxf ? await aPng(original) : null;
      let clientes = catalogoEnCache();
      if (!clientes.some((c) => c.id === plano.cliente_id)) clientes = await listarCatalogoClientes().catch(() => clientes);
      const cliente = clientes.find((c) => c.id === plano.cliente_id)?.nombre || 'Cliente';
      const etiquetas = new Map<string, string>();
      for (const [id, { elemento, lazo }] of elementosPorId) etiquetas.set(id, etiquetaDeElemento(elemento, lazo));
      const bytes = await exportarPlanoPdf({
        plano: { ...plano, sembrado: estado.sembrado, metros_por_unidad: estado.metros },
        pdfOriginal: esDxf ? null : original,
        fondoPng,
        cliente,
        etiquetas,
        conexiones,
        lazos: lazos.map((l) => ({ id: l.id, texto: `${l.codigo} · ${l.nombre}`, color: colorPorLazo.get(l.id) || '#0f766e' })),
      });
      const nombreArchivo = `sembrado-${plano.nombre}-${cliente}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-');
      const url = await entregarPdf(plano.id, bytes, nombreArchivo);
      window.location.assign(url);
      showToast('Descargando el PDF del plano');
    } catch (e: any) {
      showToast(e?.message || 'No se pudo generar el PDF. Intenta de nuevo.', 'error');
    }
    setExportando(false);
  }

  async function renombrar() {
    setMenu(false);
    if (!plano) return;
    const nombre = await pedirTexto('Nombre del plano', plano.nombre);
    if (nombre === null) return;
    const valido = nombrePlanoSchema.safeParse(nombre);
    if (!valido.success) {
      showToast(valido.error.issues[0].message, 'error');
      return;
    }
    try {
      await renombrarPlano(plano.id, valido.data);
      setPlano({ ...plano, nombre: valido.data });
      showToast('Nombre cambiado');
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  }

  // Lo llama el modal de confirmación. Si falla, el error se muestra en el
  // modal y el plano sigue igual.
  async function borrar() {
    if (!plano) return;
    if (!navigator.onLine) throw new Error('Eliminar un plano necesita señal. Intenta cuando tengas conexión.');
    await borrarPlano(plano.id);
    window.location.href = `/lazos?cliente=${plano.cliente_id}`;
  }

  // ---------- Vista ----------

  if (errorCarga && !plano) {
    return (
      <div className="max-w-md mx-auto p-6 pt-16 text-center">
        <p className="text-red font-semibold">{errorCarga}</p>
        <div className="flex gap-2 justify-center mt-4">
          <Link href="/lazos" className="min-h-[44px] px-4 rounded-xl bg-surface-2 border border-line font-semibold flex items-center">Volver</Link>
          <button type="button" onClick={cargar} className="min-h-[44px] px-4 rounded-xl bg-teal text-inkOnAccent font-semibold">Reintentar</button>
        </div>
      </div>
    );
  }

  if (!plano) {
    return <div className="h-[100dvh] flex items-center justify-center text-muted gap-2"><Loader2 className="animate-spin" size={20} /> Abriendo el plano…</div>;
  }

  const { sembrado, metros } = estado;
  const equipoElegido = seleccion?.tipo === 'equipo' ? sembrado.equipos.find((e) => e.id === seleccion.id) || null : null;
  const tuberiaElegida = seleccion?.tipo === 'tuberia' ? sembrado.tuberias.find((t) => t.id === seleccion.id) || null : null;
  const metrosTrazo = metros && trazo.length > 1 ? longitudEnHoja(trazo) * metros : null;

  return (
    <div className="h-[100dvh] flex flex-col bg-bg">
      {/* Barra superior */}
      <div className="glass-strong z-20 px-3 py-2.5 flex items-center gap-2 border-b border-line" style={{ paddingTop: 'calc(0.6rem + env(safe-area-inset-top))' }}>
        <Link href={`/lazos?cliente=${plano.cliente_id}`} aria-label="Volver a lazos" className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} strokeWidth={2.4} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-[16.5px] truncate">{plano.nombre}</p>
          {sinConexion
            ? <p className="text-[12px] text-amber flex items-center gap-1"><CloudOff size={12} /> Sin señal: copia guardada en este teléfono</p>
            : <EstadoDeGuardado estado={guardado} error={errorGuardar} onReintentar={subir} />}
        </div>
        <BotonCandado bloqueado={bloqueado} avisos={avisosCandado} onCambiar={cambiarCandado} />
        <AnimatePresence initial={false}>
          {!bloqueado && (
            <motion.div key="historial" className="flex gap-2 overflow-hidden"
              initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} transition={{ duration: 0.2 }}>
              <button type="button" onClick={deshacer} disabled={historial.length === 0} aria-label="Deshacer" title="Deshacer (Ctrl+Z)"
                className="w-11 h-11 shrink-0 rounded-xl border border-line bg-surface-2 flex items-center justify-center disabled:opacity-40">
                <Undo2 size={18} strokeWidth={2.4} />
              </button>
              <button type="button" onClick={rehacerCambio} disabled={rehacer.length === 0} aria-label="Rehacer" title="Rehacer (Ctrl+Y)"
                className="w-11 h-11 shrink-0 rounded-xl border border-line bg-surface-2 flex items-center justify-center disabled:opacity-40">
                <Redo2 size={18} strokeWidth={2.4} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <button type="button" onClick={exportar} disabled={exportando}
          className="min-h-[44px] px-3.5 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] flex items-center gap-1.5 disabled:opacity-60">
          {exportando ? <Loader2 size={17} className="animate-spin" /> : <FileDown size={17} strokeWidth={2.4} />}
          <span className="hidden sm:inline">PDF</span>
        </button>
        {esSupervisor && (
          <button type="button" onClick={() => setBorrando(true)} aria-label="Eliminar plano" title="Eliminar plano"
            className="hidden sm:flex w-11 h-11 rounded-xl border border-red/40 text-red bg-red/10 items-center justify-center hover:bg-red/15 active:scale-95 transition-transform">
            <Trash2 size={18} strokeWidth={2.3} />
          </button>
        )}
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Más opciones" className="w-11 h-11 rounded-xl flex items-center justify-center">
            <MoreVertical size={20} />
          </button>
          {menu && (
            <div className="absolute right-0 top-12 w-52 rounded-2xl bg-surface border border-line shadow-xl p-1.5 z-30">
              <button type="button" onClick={() => { setMenu(false); setExportandoDxf(true); }} className="w-full text-left min-h-[44px] px-3 rounded-xl hover:bg-surface-2 flex items-center gap-2 text-[14.5px]"><FileDown size={16} /> Exportar a AutoCAD (DXF)</button>
              <button type="button" onClick={renombrar} className="w-full text-left min-h-[44px] px-3 rounded-xl hover:bg-surface-2 flex items-center gap-2 text-[14.5px]"><PenLine size={16} /> Cambiar nombre</button>
              {/* En celular no cabe en la barra: aquí. */}
              {esSupervisor && (
                <button type="button" onClick={() => { setMenu(false); setBorrando(true); }} className="sm:hidden w-full text-left min-h-[44px] px-3 rounded-xl hover:bg-red/10 text-red flex items-center gap-2 text-[14.5px]"><Trash2 size={16} /> Eliminar plano</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Plano */}
        <div className="relative flex-1 min-h-0">
          <LienzoPlano
            imagenUrl={imagenUrl}
            ancho={plano.ancho}
            alto={plano.alto}
            sembrado={sembrado}
            etiquetaDe={etiquetaDe}
            seleccion={seleccion}
            trazo={trazo}
            colorTrazo={colorTuberia(diametro)}
            medida={medida}
            ajustarPunto={herramienta === 'tuberia' ? ajustarPunto : alinearEquipo}
            onTocar={alTocar}
            onDobleToque={() => { if (herramienta === 'tuberia') soltarTramo(); }}
            onArrastreInicio={arrastreInicio}
            onArrastre={arrastre}
            onArrastreFin={arrastreFin}
            conexiones={verConexiones || herramienta === 'conectar' ? conexiones : null}
            colorPorLazo={colorPorLazo}
            resaltado={herramienta === 'conectar' ? equipoResaltado : null}
            ayudaPuntero={herramienta === 'tuberia' || herramienta === 'equipo' || herramienta === 'conectar'}
            guiasArrastre={guiasArrastre}
            verNodos={!bloqueado && (herramienta === 'tuberia' || herramienta === 'ver')}
            bloqueado={bloqueado}
            enfocar={enfocar}
            onNodoInicio={nodoInicio}
            onNodo={moverNodo}
            onNodoFin={nodoFin}
          />
          <AyudaFlotante herramienta={herramienta} porColocar={porColocar} trazo={trazo.length} medida={medida.length}
            desde={desde === 'panel' ? 'el panel' : desde === 'suelto' ? 'un tramo sin conectar' : elementoDesde && lazoActivo ? textoDeElemento(elementoDesde, lazoActivo) : null}
            etiqueta={porColocar?.elementoId ? (() => {
            const l = elementosPorId.get(porColocar.elementoId!);
            return l ? `${l.elemento.nombre}${l.elemento.direccion ? ` · ${etiquetaDeElemento(l.elemento, l.lazo)}` : ''}` : '';
          })() : porColocar ? tipoDispositivo(porColocar.tipo).nombre : ''} />
        </div>

        {/* Herramientas y panel: abajo en celular, a la derecha en computadora */}
        <aside className="shrink-0 lg:w-[380px] border-t lg:border-t-0 lg:border-l border-line bg-surface flex flex-col min-h-0 lg:h-full">
          <div className="grid grid-cols-6 gap-1 p-2" role="tablist" aria-label="Herramientas">
            {HERRAMIENTAS.map((h) => {
              const conCandado = bloqueado && HERRAMIENTAS_DE_EDICION.includes(h.id);
              // Con candado, «Mover» solo deja ver.
              const verSolo = bloqueado && h.id === 'ver';
              const activa = herramienta === h.id;
              return (
                <button key={h.id} type="button" role="tab" aria-selected={activa} aria-disabled={conCandado || undefined}
                  title={conCandado ? 'Quita el candado de arriba para editar' : undefined}
                  onClick={() => (activa ? setPanelAbierto((a) => !a) : elegirHerramienta(h.id))}
                  className={`relative min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11.5px] sm:text-[12px] font-semibold transition-colors ${activa ? 'bg-teal text-inkOnAccent' : conCandado ? 'text-faint opacity-60' : 'text-muted hover:bg-surface-2'}`}>
                  {verSolo ? <Eye size={18} strokeWidth={2.3} /> : h.icono}
                  {verSolo ? 'Ver' : h.nombre}
                  {conCandado && <Lock size={10} strokeWidth={2.8} className="absolute top-1.5 right-1.5" aria-hidden />}
                </button>
              );
            })}
          </div>

          <div className={`${panelAbierto ? (herramienta === 'unifilar' ? 'max-h-[46dvh]' : 'max-h-[38dvh]') : 'max-h-0'} lg:max-h-none lg:flex-1 overflow-y-auto px-3.5 transition-[max-height] duration-200`}>
            <div className="pb-4">
              {herramienta === 'ver' && (
                <>
                  {equipoElegido && (
                    <FichaEquipo key={equipoElegido.id} equipo={equipoElegido} ligado={equipoElegido.elementoId ? elementosPorId.get(equipoElegido.elementoId) || null : null}
                      etiqueta={etiquetaDe(equipoElegido)} onQuitar={quitarSeleccion} onCerrar={() => setSeleccion(null)}
                      onTamano={(t) => cambiarTamano(equipoElegido.id, t)} onTamanoATodos={() => tamanoATodos(tamanoDe(equipoElegido))}
                      variosEquipos={sembrado.equipos.length > 1}
                      candidatos={candidatosPara(equipoElegido)}
                      onLigar={(elementoId) => ligarEquipo(equipoElegido.id, elementoId)} onDesligar={() => desligarEquipo(equipoElegido.id)}
                      onEditarDatos={() => editarDatos(equipoElegido)}
                      onRotacion={(g) => cambiarRotacion(equipoElegido.id, g)} onRotacionATodos={() => rotacionATodos(equipoElegido.rotacion || 0)}
                      soloVer={bloqueado} onVerUnifilar={() => elegirHerramienta('unifilar')} />
                  )}
                  {tuberiaElegida && (
                    <FichaTuberia tuberia={tuberiaElegida} metros={metrosDeTuberia(tuberiaElegida, metros)} tolerancia={radioPegar * 0.6}
                      onCambiar={(c) => cambiarTuberia(tuberiaElegida.id, c)} onQuitar={quitarSeleccion} onCerrar={() => setSeleccion(null)}
                      soloVer={bloqueado} />
                  )}
                  {!equipoElegido && !tuberiaElegida && (
                    <>
                      {!bloqueado && sueltos.length > 0 && totalFaltantes > 0 && (
                        <div className="mt-1 mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                          <p className="text-[13.5px]">
                            Hay <b>{sueltos.length} {sueltos.length === 1 ? 'equipo suelto' : 'equipos sueltos'}</b> en el plano
                            y <b>{totalFaltantes} {totalFaltantes === 1 ? 'dispositivo' : 'dispositivos'} del lazo</b> sin sembrar.
                            Si son los mismos, lígalos para que tomen su dirección.
                          </p>
                          <button type="button" onClick={() => setSeleccion({ tipo: 'equipo', id: sueltos[0].id })}
                            className="mt-2 min-h-[40px] px-3 rounded-lg bg-surface border border-line text-[13.5px] font-semibold flex items-center gap-1.5">
                            <Link2 size={16} /> Ligar el primero
                          </button>
                        </div>
                      )}
                      <label className="flex items-center gap-2.5 pt-1 pb-2 text-[14px]">
                        <input type="checkbox" checked={verConexiones} onChange={(ev) => setVerConexiones(ev.target.checked)} className="w-5 h-5 accent-teal" />
                        Ver conexiones de los lazos (línea punteada)
                      </label>
                      {bloqueado ? (
                        <p className="text-[13px] text-muted pt-1 pb-3 flex gap-2">
                          <Lock size={15} className="shrink-0 mt-0.5 text-faint" />
                          <span>Plano bloqueado: recórrelo y acércalo sin miedo, nada se mueve. Toca un equipo para ver sus datos. Para editar, toca el candado de arriba.</span>
                        </p>
                      ) : (
                        <p className="text-[13px] text-muted pt-1 pb-3">Toca un equipo o una tubería para ver su ficha (ahí se agranda o achica el equipo). Arrastra un equipo para moverlo; arrastra el plano para recorrerlo.</p>
                      )}
                      <Cantidades sembrado={sembrado} metros={metros} />
                    </>
                  )}
                </>
              )}

              {herramienta === 'unifilar' && (
                <PanelUnifilar lazos={lazos} lazoId={lazoUnifilarId} onElegirLazo={setLazoUnifilarId} colorPorLazo={colorPorLazo}
                  resaltado={equipoElegido?.elementoId || null} enEstePlano={sembrados} onTocar={buscarEnPlano} />
              )}

              {herramienta === 'equipo' && (
                <PanelEquipos
                  paneles={paneles}
                  panelDondeEsta={(id) => (sembrado.equipos.some((e) => e.panelId === id) ? 'en este plano' : otrosPlanos.has(id) ? `en ${otrosPlanos.get(id)}` : null)}
                  faltantesPorLazo={faltantesPorLazo}
                  porColocar={porColocar}
                  onElegir={setPorColocar}
                  etiquetaDe={etiquetaDeElemento}
                />
              )}

              {herramienta === 'conectar' && (
                <PanelConectar
                  lazos={lazos}
                  lazoActivo={lazoActivo}
                  colorPorLazo={colorPorLazo}
                  onElegirLazo={elegirLazo}
                  desde={desde}
                  elementoDesde={elementoDesde}
                  onDesde={elegirDesde}
                  onUnirTramo={unirTramo}
                  enMedio={enMedio}
                  onEnMedio={setEnMedio}
                  tipoNuevo={tipoNuevo}
                  onTipoNuevo={setTipoNuevo}
                  textoDe={textoDeElemento}
                  planoDe={otrosPlanos}
                  sembrados={sembrados}
                  pendientes={pendientesLazos}
                  rechazo={rechazoLazos}
                  clienteId={plano.cliente_id}
                />
              )}

              {herramienta === 'tuberia' && (
                <div className="pt-1">
                  <Opciones titulo="Tipo" opciones={TIPOS_TUBERIA} valor={tipoTubo} onElegir={(tipo) => cambiarTuboActual({ tipo })} />
                  <Opciones titulo="Diámetro" opciones={DIAMETROS} valor={diametro} onElegir={(d) => cambiarTuboActual({ diametro: d })} color={colorTuberia} />
                  <ModosTrazo valor={modoTrazo} onElegir={setModoTrazo} />
                  <p className="text-[13px] text-muted mt-3">
                    {trazo.length === 0
                      ? 'Toca donde empieza la tubería; cada toque agrega un quiebre y se guarda solo. Cerca de un equipo o de un nodo se pega ahí y, si no está en línea, hace el codo.'
                      : trazo.length === 1
                        ? 'Inicio marcado. Toca el siguiente punto.'
                        : `Tramo guardado: ${trazo.length} puntos${metrosTrazo !== null ? ` · ${formatoMetros(metrosTrazo)}` : ''}. Sigue tocando para alargarlo.`}
                  </p>
                  <button type="button" onClick={soltarTramo} disabled={trazo.length === 0}
                    className="mt-3 w-full min-h-[46px] rounded-xl bg-surface-2 border border-line font-semibold text-[14px] flex items-center justify-center gap-1.5 disabled:opacity-40">
                    <Plus size={17} strokeWidth={2.6} /> Nuevo tramo (terminar este)
                  </button>
                  <p className="text-[12px] text-muted mt-2">Para quitar un quiebre usa «Deshacer». Para borrar una tubería, tócala en «Mover» y «Quitar tramo». Para alargarla, arrastra su punta (circulito) hasta la otra tubería.</p>
                  {!metros && <p className="text-[12.5px] text-amber mt-3">Sin escala no se calculan los metros. Ponla en «Escala».</p>}
                </div>
              )}

              {herramienta === 'escala' && (
                <div className="pt-1">
                  <p className="text-[14px]">
                    {metros ? <>Escala actual: <span className="font-mono font-semibold">aprox. 1:{proporcionDeEscala(metros)}</span></> : <span className="text-amber font-semibold">Este plano todavía no tiene escala.</span>}
                  </p>
                  <p className="text-[13px] font-semibold mt-4 mb-1.5">Medir algo conocido (lo más exacto)</p>
                  <p className="text-[13px] text-muted mb-2">
                    {medida.length < 2 ? `Toca los dos extremos de una puerta, un muro o una cota (${medida.length}/2).` : `Medida en el plano lista. ¿Cuánto mide en realidad?`}
                  </p>
                  <div className="flex gap-2">
                    <input inputMode="decimal" value={metrosMedida} onChange={(ev) => setMetrosMedida(ev.target.value.replace(/[^\d.,]/g, '').slice(0, 8))} placeholder="0.90"
                      aria-label="Medida real en metros" className="flex-1 min-w-0 px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none font-mono text-[15px]" />
                    <span className="self-center text-[14px] text-muted">m</span>
                    <button type="button" onClick={aplicarMedida} className="min-h-[46px] px-4 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px]">Calibrar</button>
                  </div>
                  <p className="text-[13px] font-semibold mt-5 mb-1.5">O la escala de impresión</p>
                  <div className="flex gap-2">
                    <span className="self-center font-mono text-[15px] whitespace-nowrap shrink-0">1 :</span>
                    <input inputMode="numeric" value={proporcion} onChange={(ev) => setProporcion(ev.target.value.replace(/[^\d.]/g, '').slice(0, 6))} placeholder="100"
                      aria-label="Escala de impresión" className="flex-1 min-w-0 px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none font-mono text-[15px]" />
                    <button type="button" onClick={aplicarProporcion} className="min-h-[46px] px-4 rounded-xl bg-surface-2 border border-line font-semibold text-[14px]">Aplicar</button>
                  </div>
                  {errorEscala && <p className="text-red font-semibold text-[13px] mt-2">{errorEscala}</p>}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {exportandoDxf && (
        <ExportarDxf
          plano={{ ...plano, sembrado: estado.sembrado, metros_por_unidad: estado.metros }}
          etiquetaDe={(id) => {
            const equipo = estado.sembrado.equipos.find((e) => e.id === id);
            return equipo ? etiquetaDe(equipo) : '';
          }}
          conexiones={conexiones}
          lazos={lazos.map((l) => ({ id: l.id, codigo: l.codigo }))}
          onCerrar={() => setExportandoDxf(false)}
        />
      )}

      {borrando && (
        <ConfirmarBorrarPlano
          nombre={plano.nombre}
          imagenUrl={imagenUrl}
          equipos={sembrado.equipos.length}
          tramos={sembrado.tuberias.length}
          onCancelar={() => setBorrando(false)}
          onBorrar={borrar}
        />
      )}

      {hoja && (
        <HojaCaptura
          lazo={hoja.lazo}
          elementos={hoja.lazo.elementos}
          lugarInicial={hoja.lugar}
          editando={hoja.editando}
          tipoInicial={hoja.tipo || undefined}
          nivelInicial={plano.nombre.slice(0, 40)}
          direccionInicial={hoja.direccion}
          unoSolo
          onGuardado={(elemento, pendiente) => alGuardarDesdeHoja(hoja, elemento, pendiente)}
          onCerrar={() => setHoja(null)}
        />
      )}
    </div>
  );
}

// La imagen del plano (WebP) convertida a PNG para meterla al PDF.
async function aPng(bytes: ArrayBuffer): Promise<Uint8Array> {
  const mapa = await createImageBitmap(new Blob([bytes]));
  const lienzo = document.createElement('canvas');
  lienzo.width = mapa.width;
  lienzo.height = mapa.height;
  lienzo.getContext('2d')?.drawImage(mapa, 0, 0);
  const png = await new Promise<Blob>((resolver, rechazar) => lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No se pudo preparar la imagen del plano.'))), 'image/png'));
  lienzo.width = 0;
  lienzo.height = 0;
  return new Uint8Array(await png.arrayBuffer());
}

// ---------- Piezas ----------

// Exportar a AutoCAD: plano DXF → coordenadas reales; plano PDF → a escala
// real en las unidades que use su dibujo (luego se acomoda con ALINEAR).
const UNIDADES_DESTINO = [
  { nombre: 'Metros', metros: 1 },
  { nombre: 'Centímetros', metros: 0.01 },
  { nombre: 'Milímetros', metros: 0.001 },
];

function ExportarDxf({ plano, etiquetaDe, conexiones, lazos, onCerrar }: {
  plano: Plano;
  etiquetaDe: (equipoId: string) => string;
  conexiones: { lineas: LineaConexion[]; marcas: MarcaConexion[] };
  lazos: { id: string; codigo: string }[];
  onCerrar: () => void;
}) {
  const esDxf = plano.formato === 'dxf' && Boolean(plano.dxf);
  const [unidad, setUnidad] = useState(() => {
    try {
      return Number(localStorage.getItem('unidadAutocad')) || 1;
    } catch {
      return 1;
    }
  });
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportar() {
    if (!navigator.onLine) {
      setError('Descargar el DXF necesita señal. Intenta cuando tengas conexión.');
      return;
    }
    setTrabajando(true);
    setError(null);
    try {
      try {
        localStorage.setItem('unidadAutocad', String(unidad));
      } catch {
        // Sin localStorage: la próxima vez se vuelve a elegir.
      }
      const { exportarPlanoDxf, colocacionDe } = await import('@/lib/exportarPlanoDxf');
      const bytes = exportarPlanoDxf({ plano, colocacion: colocacionDe(plano, unidad), etiquetaDe, conexiones, lazos });
      const nombre = `sembrado-${plano.nombre}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-');
      const url = await entregarPdf(plano.id, bytes, nombre, 'dxf');
      window.location.assign(url);
      onCerrar();
    } catch (e: any) {
      setError(e?.message || 'No se pudo generar el DXF. Intenta de nuevo.');
      setTrabajando(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !trabajando && onCerrar()}>
      <div className="glass-strong rounded-3xl max-w-md w-full p-5">
        <h2 className="font-display font-bold text-[21px]">Exportar a AutoCAD</h2>
        <p className="text-[13px] text-muted mt-1">
          Un DXF con los equipos como bloques (FA_SH, FA_EMA…), la tubería por tipo y diámetro y las conexiones de cada lazo, cada cosa en su capa FA-*.
        </p>

        {esDxf ? (
          <div className="mt-4 rounded-xl border border-teal/40 bg-teal/10 p-3 text-[13.5px]">
            <p className="font-semibold">Coordenadas reales del dibujo</p>
            <p className="mt-1 text-muted">Este plano se subió en DXF: todo cae en su lugar exacto. En AutoCAD, en tu DWG:</p>
            <ol className="mt-1.5 list-decimal pl-5 flex flex-col gap-0.5">
              <li>Insertar → Bloque → «Examinar» y elige el DXF.</li>
              <li>Punto de inserción <b>0,0</b>, escala <b>1</b>, giro <b>0</b> (sin «Especificar en pantalla»).</li>
              <li>Descompón (DESCOMP / EXPLODE) si quieres los bloques sueltos.</li>
            </ol>
          </div>
        ) : (
          <>
            <label htmlFor="dxf-unidad" className="block text-[13px] text-muted mt-4 mb-1.5">¿En qué unidades está dibujado tu plano de AutoCAD?</label>
            <select id="dxf-unidad" value={unidad} onChange={(ev) => setUnidad(Number(ev.target.value))}
              className="w-full px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]">
              {UNIDADES_DESTINO.map((u) => <option key={u.metros} value={u.metros}>{u.nombre}</option>)}
            </select>
            {!plano.metros_por_unidad && (
              <p className="mt-2 text-[12.5px] text-amber font-semibold">Este plano no tiene escala: el DXF no saldrá a tamaño real. Ponla en «Escala» antes de exportar.</p>
            )}
            <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3 text-[13px]">
              <p className="font-semibold">Este plano se subió en PDF</p>
              <p className="mt-1 text-muted">Sale a escala real, pero hay que acomodarlo: inserta el DXF en tu DWG y usa <b>ALINEAR</b> (ALIGN) con dos puntos que reconozcas (dos esquinas de muro). Para que caiga solo en su lugar, sube el plano en DXF.</p>
            </div>
          </>
        )}

        {error && <p className="mt-3 rounded-xl bg-red/10 text-red text-[13px] font-semibold px-3 py-2">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCerrar} disabled={trabajando}
            className="flex-1 min-h-[48px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px] disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={exportar} disabled={trabajando}
            className="flex-[1.4] min-h-[48px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14.5px] flex items-center justify-center gap-2 disabled:opacity-60">
            {trabajando ? <Loader2 size={17} className="animate-spin" /> : <FileDown size={17} strokeWidth={2.4} />}
            {trabajando ? 'Preparando…' : 'Descargar DXF'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// Confirmación para eliminar el plano: qué se borra, qué no, y que no se
// puede deshacer. Mientras borra no se puede cerrar.
function ConfirmarBorrarPlano({ nombre, imagenUrl, equipos, tramos, onCancelar, onBorrar }: {
  nombre: string;
  imagenUrl: string | null;
  equipos: number;
  tramos: number;
  onCancelar: () => void;
  onBorrar: () => Promise<void>;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmarBorrado() {
    setTrabajando(true);
    setError(null);
    try {
      await onBorrar();
    } catch (e: any) {
      setError(e?.message || 'No se pudo eliminar el plano. Intenta de nuevo.');
      setTrabajando(false);
    }
  }

  const loQueSeBorra = [
    `${equipos} ${equipos === 1 ? 'equipo sembrado' : 'equipos sembrados'}`,
    `${tramos} ${tramos === 1 ? 'tramo de tubería' : 'tramos de tubería'}`,
  ].join(' y ');

  return (
    <ModalOverlay onClose={() => !trabajando && onCancelar()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="borrar-plano-titulo" aria-describedby="borrar-plano-detalle"
        className="glass-strong rounded-3xl max-w-sm w-full p-5 text-center">
        <span className="mx-auto w-14 h-14 rounded-full bg-red/15 ring-8 ring-red/5 text-red flex items-center justify-center">
          <Trash2 size={26} strokeWidth={2.2} />
        </span>
        <h2 id="borrar-plano-titulo" className="font-display font-bold text-[21px] mt-4 leading-tight">¿Seguro que quieres eliminar este plano?</h2>

        <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-2.5 flex items-center gap-3 text-left">
          <span className="w-14 h-14 shrink-0 rounded-xl bg-white border border-line overflow-hidden flex items-center justify-center">
            {imagenUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={imagenUrl} alt="" className="w-full h-full object-contain" />
              : <IconoPlano size={22} className="text-slate-400" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold truncate">{nombre}</span>
            <span className="block text-[12.5px] text-muted">{loQueSeBorra}</span>
          </span>
        </div>

        <ul id="borrar-plano-detalle" className="mt-4 text-left text-[13.5px] flex flex-col gap-2">
          <li className="flex gap-2"><X size={16} strokeWidth={2.6} className="text-red shrink-0 mt-0.5" /> Se borra el plano con todo lo sembrado, la tubería y sus conexiones dibujadas.</li>
          <li className="flex gap-2"><Check size={16} strokeWidth={2.6} className="text-teal shrink-0 mt-0.5" /> Los lazos y sus dispositivos se quedan: siguen en el diagrama unifilar.</li>
        </ul>
        <p className="mt-3 text-[12.5px] font-semibold text-red">Esta acción no se puede deshacer.</p>

        {error && <p className="mt-3 rounded-xl bg-red/10 text-red text-[13px] font-semibold px-3 py-2">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCancelar} disabled={trabajando} autoFocus
            className="flex-1 min-h-[48px] rounded-xl bg-surface-2 border border-line font-semibold text-[14.5px] disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={confirmarBorrado} disabled={trabajando}
            className="flex-1 min-h-[48px] rounded-xl bg-red text-white font-semibold text-[14.5px] flex items-center justify-center gap-2 disabled:opacity-70">
            {trabajando ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} strokeWidth={2.4} />}
            {trabajando ? 'Eliminando…' : 'Eliminar plano'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function EstadoDeGuardado({ estado, error, onReintentar }: { estado: EstadoGuardado; error: string | null; onReintentar: () => void }) {
  if (estado === 'guardando') return <p className="text-[12px] text-muted flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Guardando…</p>;
  if (estado === 'pendiente') return <p className="text-[12px] text-amber flex items-center gap-1"><CloudOff size={12} /> Sin señal: guardado en este teléfono</p>;
  if (estado === 'error') {
    return (
      <p className="text-[12px] text-red truncate">
        {error} <button type="button" onClick={onReintentar} className="underline font-semibold">Reintentar</button>
      </p>
    );
  }
  return <p className="text-[12px] text-faint flex items-center gap-1"><Check size={12} strokeWidth={2.6} /> Guardado</p>;
}

function AyudaFlotante({ herramienta, porColocar, trazo, medida, etiqueta, desde }: {
  herramienta: Herramienta; porColocar: PorColocar | null; trazo: number; medida: number; etiqueta: string; desde: string | null;
}) {
  let texto: React.ReactNode = null;
  if (herramienta === 'conectar') {
    texto = desde ? <>Sale de <b>{desde}</b> · toca dónde va el siguiente</> : 'Toca el dispositivo del que sale el cable';
  } else if (herramienta === 'equipo') {
    texto = porColocar ? <>Toca el plano para sembrar <b>{etiqueta}</b></> : 'Elige qué equipo vas a sembrar';
  } else if (herramienta === 'tuberia') {
    texto = trazo === 0 ? 'Toca donde empieza la tubería' : 'Se guarda solo · toca otra vez el último punto para terminar';
  } else if (herramienta === 'escala') {
    texto = medida < 2 ? `Toca los extremos de una medida conocida (${medida}/2)` : 'Escribe la medida real y «Calibrar»';
  }
  if (!texto) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-3 max-w-[92%] rounded-full bg-ink/85 text-bg text-[13px] px-4 py-2 shadow-lg text-center">
      {texto}
    </div>
  );
}

const MODOS_TRAZO: { valor: ModoTrazo; nombre: string; detalle: string }[] = [
  { valor: 'recto', nombre: 'Recto 90°', detalle: 'Solo horizontal y vertical' },
  { valor: '45', nombre: '45°', detalle: 'También diagonales' },
  { valor: 'libre', nombre: 'Libre', detalle: 'Sin ayuda' },
];

function ModosTrazo({ valor, onElegir }: { valor: ModoTrazo; onElegir: (m: ModoTrazo) => void }) {
  return (
    <div className="mt-3">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-1.5">Trazo</p>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Cómo se traza">
        {MODOS_TRAZO.map((m) => (
          <button key={m.valor} type="button" role="radio" aria-checked={valor === m.valor} onClick={() => onElegir(m.valor)}
            className={`min-h-[52px] rounded-xl border px-2 flex flex-col items-center justify-center ${valor === m.valor ? 'border-teal bg-teal/15' : 'border-line bg-surface-2'}`}>
            <span className="text-[13.5px] font-semibold">{m.nombre}</span>
            <span className="text-[11px] text-muted leading-tight text-center">{m.detalle}</span>
          </button>
        ))}
      </div>
      {valor !== 'libre' && <p className="text-[12px] text-muted mt-1.5">Los puntos se alinean con los equipos y la tubería que ya están (línea guía punteada).</p>}
    </div>
  );
}

function Opciones({ titulo, opciones, valor, onElegir, color }: {
  titulo: string; opciones: readonly string[]; valor: string; onElegir: (v: string) => void; color?: (v: string) => string;
}) {
  return (
    <div className="mt-2">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-1.5">{titulo}</p>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((o) => (
          <button key={o} type="button" onClick={() => onElegir(o)} aria-pressed={valor === o}
            className={`min-h-[38px] px-3 rounded-full border text-[13.5px] font-semibold flex items-center gap-1.5 ${valor === o ? 'border-teal bg-teal/15 text-teal' : 'border-line bg-surface-2'}`}>
            {color && <span className="w-3 h-3 rounded-full" style={{ background: color(o) }} />}
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function PanelEquipos({ paneles, panelDondeEsta, faltantesPorLazo, porColocar, onElegir, etiquetaDe }: {
  paneles: Panel[];
  panelDondeEsta: (id: string) => string | null;
  faltantesPorLazo: { lazo: LazoConElementos; faltan: Elemento[] }[];
  porColocar: PorColocar | null;
  onElegir: (p: PorColocar) => void;
  etiquetaDe: (e: Elemento, l: LazoConElementos) => string;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const conDispositivos = faltantesPorLazo.filter((f) => f.lazo.elementos.length > 0);
  const eligiendoPanel = (id: string | null) => porColocar?.tipo === PANEL_EN_PLANO && (porColocar.panelId || null) === id;
  return (
    <div className="pt-1">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-1.5">Panel de alarma</p>
      <div className="flex flex-col gap-1.5 mb-4">
        {paneles.map((p) => {
          const donde = panelDondeEsta(p.id);
          return (
            <button key={p.id} type="button" disabled={Boolean(donde)} aria-pressed={eligiendoPanel(p.id)}
              onClick={() => onElegir({ tipo: PANEL_EN_PLANO, elementoId: null, panelId: p.id })}
              className={`min-h-[52px] px-2.5 rounded-xl border flex items-center gap-2.5 text-left disabled:opacity-55 ${eligiendoPanel(p.id) ? 'border-teal bg-teal/15' : 'border-line bg-surface-2'}`}>
              <SimboloPlano tipo={PANEL_EN_PLANO} tamano={32} />
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold truncate">{p.nombre}</span>
                <span className="block text-[12px] text-muted truncate">{donde ? `Ya está ${donde}` : [p.modelo, p.ubicacion].filter(Boolean).join(' · ') || 'Toca para sembrarlo'}</span>
              </span>
            </button>
          );
        })}
        {paneles.length === 0 && (
          <button type="button" aria-pressed={eligiendoPanel(null)} onClick={() => onElegir({ tipo: PANEL_EN_PLANO, elementoId: null, panelId: null })}
            className={`min-h-[52px] px-2.5 rounded-xl border flex items-center gap-2.5 text-left ${eligiendoPanel(null) ? 'border-teal bg-teal/15' : 'border-line bg-surface-2'}`}>
            <SimboloPlano tipo={PANEL_EN_PLANO} tamano={32} />
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-semibold">Panel (FACP)</span>
              <span className="block text-[12px] text-muted">El cliente no tiene panel registrado; se siembra solo el símbolo.</span>
            </span>
          </button>
        )}
      </div>

      {conDispositivos.length > 0 && (
        <>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-1.5">De los lazos del cliente</p>
          <div className="flex flex-col gap-1.5">
            {conDispositivos.map(({ lazo, faltan }) => {
              const desplegado = abierto === lazo.id || faltan.some((e) => e.id === porColocar?.elementoId);
              return (
                <div key={lazo.id} className="rounded-xl border border-line bg-surface-2">
                  <button type="button" onClick={() => setAbierto(abierto === lazo.id ? null : lazo.id)} className="w-full min-h-[44px] px-3 flex items-center gap-2 text-left">
                    <span className="font-mono text-[12.5px] rounded-md bg-surface px-1.5 py-0.5">{lazo.codigo}</span>
                    <span className="flex-1 min-w-0 truncate text-[14px] font-semibold">{lazo.nombre}</span>
                    <span className={`text-[12px] ${faltan.length ? 'text-muted' : 'text-teal font-semibold'}`}>
                      {faltan.length ? `faltan ${faltan.length}` : 'completo'}
                    </span>
                  </button>
                  {desplegado && faltan.length > 0 && (
                    <div className="px-2 pb-2 flex flex-col gap-1 max-h-[220px] overflow-y-auto">
                      {faltan.map((e) => (
                        <button key={e.id} type="button" onClick={() => onElegir({ tipo: e.tipo, elementoId: e.id })} aria-pressed={porColocar?.elementoId === e.id}
                          className={`min-h-[44px] px-2 rounded-lg flex items-center gap-2.5 text-left ${porColocar?.elementoId === e.id ? 'bg-teal/15 ring-1 ring-teal' : 'hover:bg-surface'}`}>
                          <span className="w-10 flex justify-center text-ink"><SimboloPlano tipo={e.tipo} tamano={28} /></span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[13.5px] font-semibold truncate">{e.nombre}</span>
                            {e.ubicacion && <span className="block text-[12px] text-muted truncate">{e.ubicacion}</span>}
                          </span>
                          {e.direccion && <span className="font-mono text-[12px] text-muted">{etiquetaDe(e, lazo)}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mt-4 mb-1.5">Equipo suelto (sin lazo)</p>
      <div className="grid grid-cols-3 gap-1.5">
        {tiposSembrables().map((t) => (
          <button key={t.codigo} type="button" onClick={() => onElegir({ tipo: t.codigo, elementoId: null })} title={t.nombre}
            aria-pressed={porColocar?.elementoId === null && porColocar?.tipo === t.codigo}
            className={`min-h-[68px] rounded-xl border flex flex-col items-center justify-center gap-1 px-1 text-ink ${porColocar?.elementoId === null && porColocar?.tipo === t.codigo ? 'border-teal bg-teal/15' : 'border-line bg-surface-2'}`}>
            <SimboloPlano tipo={t.codigo} tamano={30} />
            <span className="text-[11px] leading-tight text-center text-muted line-clamp-2">{t.nombre}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PanelConectar({
  lazos, lazoActivo, colorPorLazo, onElegirLazo, desde, elementoDesde, onDesde, onUnirTramo, enMedio, onEnMedio, tipoNuevo, onTipoNuevo,
  textoDe, planoDe, sembrados, pendientes, rechazo, clienteId,
}: {
  lazos: LazoConElementos[];
  lazoActivo: LazoConElementos | null;
  colorPorLazo: Map<string, string>;
  onElegirLazo: (l: LazoConElementos) => void;
  desde: Desde | null;
  elementoDesde: Elemento | null;
  onDesde: (d: Desde) => void;
  onUnirTramo: (inicioId: string) => void;
  enMedio: boolean;
  onEnMedio: (v: boolean) => void;
  tipoNuevo: string | null;
  onTipoNuevo: (t: string) => void;
  textoDe: (e: Elemento, l: LazoConElementos) => string;
  planoDe: Map<string, string>;
  sembrados: Set<string>;
  pendientes: number;
  rechazo: string | null;
  clienteId: string;
}) {
  if (lazos.length === 0) {
    return (
      <div className="pt-1 text-[13.5px]">
        <p>Este cliente todavía no tiene lazos. Crea el lazo (necesita señal) y regresa a conectarlo aquí.</p>
        <Link href={`/lazos?cliente=${clienteId}`} className="inline-block mt-2 font-semibold text-teal underline">Ir a Lazos y circuitos</Link>
      </div>
    );
  }

  // El último del recorrido, por si el lazo sigue desde otro plano.
  // El último ya conectado del recorrido, por si el lazo sigue desde otro plano.
  const sueltosDelLazo = lazoActivo ? idsSinConectar(lazoActivo.elementos) : new Set<string>();
  const recorrido = lazoActivo ? enOrdenDeRecorrido(lazoActivo.elementos).filter((e) => !sueltosDelLazo.has(e.id)) : [];
  const ultimo = recorrido[recorrido.length - 1] || null;
  const tramos = lazoActivo ? tramosSinConectar(lazoActivo.elementos) : [];
  const textoDesde = desde === 'panel' ? 'el panel' : elementoDesde && lazoActivo ? textoDe(elementoDesde, lazoActivo) : null;
  // Qué le sigue a `desde` hoy (para ofrecer rama o en medio).
  let siguiente: Elemento | null = null;
  if (lazoActivo && elementoDesde && tieneSiguiente(lazoActivo.elementos, elementoDesde)) {
    if (elementoDesde.padre_id || esInicioSinConectar(elementoDesde)) {
      siguiente = hijosDe(lazoActivo.elementos, elementoDesde.id)[0] || null;
    } else {
      const principal = lineaPrincipal(lazoActivo.elementos);
      siguiente = principal[principal.findIndex((e) => e.id === elementoDesde.id) + 1] || null;
    }
  }
  const enAlgunPlano = new Set([...sembrados, ...planoDe.keys()]);
  const avisos = lazoActivo ? revisarLazo(lazoActivo, lazoActivo.elementos, enAlgunPlano, (d) => direccionVisible(d, lazoActivo.numero)) : [];

  return (
    <div className="pt-1">
      {pendientes > 0 && (
        <p className="mb-2 text-[12.5px] text-amber flex items-center gap-1.5">
          <CloudOff size={14} /> {pendientes} {pendientes === 1 ? 'cambio del lazo guardado' : 'cambios del lazo guardados'} en este teléfono; suben al tener señal.
        </p>
      )}
      {rechazo && <p className="mb-2 text-[12.5px] text-red font-semibold">{rechazo} Ábrelo en el lazo para corregirlo.</p>}

      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-1.5">Lazo</p>
      <div className="flex flex-wrap gap-1.5">
        {lazos.map((l) => (
          <button key={l.id} type="button" onClick={() => onElegirLazo(l)} aria-pressed={lazoActivo?.id === l.id}
            className={`min-h-[40px] px-3 rounded-xl border text-[13.5px] font-semibold flex items-center gap-2 ${lazoActivo?.id === l.id ? 'border-teal bg-teal/15' : 'border-line bg-surface-2'}`}>
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: colorPorLazo.get(l.id) }} />
            {l.codigo}
          </button>
        ))}
      </div>

      {lazoActivo && (
        <>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mt-4 mb-1.5">Sale de</p>
          <p className="text-[14px] font-semibold">
            {desde === 'panel' ? 'El panel' : desde === 'suelto' ? 'Tramo nuevo sin conectar (lo unes después)' : elementoDesde ? textoDe(elementoDesde, lazoActivo) : <span className="text-muted font-normal">Toca en el plano el dispositivo del que sale el cable.</span>}
            {elementoDesde && planoDe.has(elementoDesde.id) && <span className="text-muted font-normal"> (en {planoDe.get(elementoDesde.id)})</span>}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button type="button" onClick={() => onDesde('panel')} aria-pressed={desde === 'panel'}
              className={`min-h-[38px] px-3 rounded-lg border text-[13px] ${desde === 'panel' ? 'border-teal bg-teal/15' : 'border-line bg-surface-2'}`}>Desde el panel</button>
            <button type="button" onClick={() => onDesde('suelto')} aria-pressed={desde === 'suelto'}
              className={`min-h-[38px] px-3 rounded-lg border text-[13px] ${desde === 'suelto' ? 'border-amber bg-amber/15' : 'border-line bg-surface-2'}`}>Tramo sin conectar</button>
            {ultimo && ultimo.id !== desde && (
              <button type="button" onClick={() => onDesde(ultimo.id)}
                className="min-h-[38px] px-3 rounded-lg border border-line bg-surface-2 text-[13px] text-left">
                Seguir desde el último: <span className="font-mono">{textoDe(ultimo, lazoActivo)}</span>
                {planoDe.has(ultimo.id) && <span className="text-muted"> ({planoDe.get(ultimo.id)})</span>}
              </button>
            )}
          </div>
          {siguiente && (
            <div className="mt-2 flex flex-col gap-1 text-[13px]">
              <label className="flex items-center gap-2">
                <input type="radio" checked={!enMedio} onChange={() => onEnMedio(false)} className="w-4 h-4 accent-teal" />
                Rama nueva (derivación en T)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={enMedio} onChange={() => onEnMedio(true)} className="w-4 h-4 accent-teal" />
                En medio, antes de <span className="font-mono">{textoDe(siguiente, lazoActivo)}</span>
              </label>
            </div>
          )}

          {desde === 'suelto' && (
            <p className="mt-2 text-[12.5px] text-muted">El primero que pongas queda «Sin conectar» y los siguientes se conectan a él. Cuando termines el otro nivel, únelo desde aquí abajo.</p>
          )}

          {tramos.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber/50 bg-amber/10 p-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-amber mb-1.5">Tramos sin conectar</p>
              <div className="flex flex-col gap-2">
                {tramos.map((inicio) => {
                  const cuantos = cuantosEnRama(lazoActivo.elementos, inicio.id);
                  const donde = planoDe.get(inicio.id) || (sembrados.has(inicio.id) ? 'este plano' : null);
                  const puedeUnir = Boolean(textoDesde) && desde !== inicio.id;
                  return (
                    <div key={inicio.id} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-[13px]">
                        <span className="font-mono font-semibold">{textoDe(inicio, lazoActivo)}</span>
                        <span className="text-muted"> · {cuantos} {cuantos === 1 ? 'dispositivo' : 'dispositivos'}{donde ? ` · ${donde}` : ''}</span>
                      </span>
                      <button type="button" onClick={() => onUnirTramo(inicio.id)} disabled={!puedeUnir}
                        className="shrink-0 min-h-[38px] px-3 rounded-lg bg-teal text-inkOnAccent text-[12.5px] font-semibold disabled:opacity-40">
                        Unir aquí
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="text-[12px] text-muted mt-2">
                {textoDesde
                  ? <>«Unir aquí» lo conecta después de <span className="font-mono">{textoDesde}</span>.</>
                  : 'Elige en «Sale de» dónde se conecta (por ejemplo «Seguir desde el último» del otro nivel) y toca «Unir aquí».'}
              </p>
            </div>
          )}

          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mt-4 mb-1.5">Equipo nuevo (al tocar un punto vacío)</p>
          <div className="grid grid-cols-4 gap-1.5">
            {TIPOS_POR_CIRCUITO[lazoActivo.tipo].map((t) => (
              <button key={t.codigo} type="button" onClick={() => onTipoNuevo(t.codigo)} title={t.nombre} aria-pressed={tipoNuevo === t.codigo}
                className={`min-h-[56px] rounded-xl border flex flex-col items-center justify-center gap-0.5 px-1 text-ink ${tipoNuevo === t.codigo ? 'border-teal bg-teal/15' : 'border-line bg-surface-2'}`}>
                <SimboloPlano tipo={t.codigo} tamano={30} />
                {/* Los detectores dicen S o C: abajo va el código. Los demás ya lo traen dentro. */}
                {t.forma === 'detector' && <span className="text-[10.5px] leading-tight text-center text-muted">{t.codigo}</span>}
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-muted mt-2">Toca un punto vacío para poner uno nuevo, o un equipo suelto para darle sus datos. Se guarda en el lazo y aparece en el diagrama unifilar.</p>

          {avisos.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-amber mb-1">Revisar</p>
              <ul className="text-[13px] list-disc pl-4 flex flex-col gap-0.5">
                {avisos.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
          )}
          <Link href={`/lazos/${lazoActivo.id}`} className="inline-block mt-3 text-[13px] font-semibold text-teal underline">Ver el diagrama unifilar de {lazoActivo.codigo}</Link>
        </>
      )}
    </div>
  );
}

const BOTON_GIRO = 'h-11 px-2 rounded-xl bg-surface border border-line flex items-center gap-0.5 text-[12px] font-semibold';

function FichaEquipo({ equipo, ligado, etiqueta, onQuitar, onCerrar, onTamano, onTamanoATodos, variosEquipos, candidatos, onLigar, onDesligar, onEditarDatos, onRotacion, onRotacionATodos, soloVer, onVerUnifilar }: {
  equipo: EquipoPlano;
  ligado: { elemento: Elemento; lazo: LazoConElementos } | null;
  etiqueta: string;
  onQuitar: () => void;
  onCerrar: () => void;
  onTamano: (tamano: number) => void;
  onTamanoATodos: () => void;
  variosEquipos: boolean;
  candidatos: { elemento: Elemento; lazo: LazoConElementos; etiqueta: string }[];
  onLigar: (elementoId: string) => void;
  onDesligar: () => void;
  onEditarDatos: () => void;
  onRotacion: (grados: number) => void;
  onRotacionATodos: () => void;
  // Plano bloqueado: solo los datos, sin botones que cambien algo.
  soloVer: boolean;
  onVerUnifilar: () => void;
}) {
  const rotacion = equipo.rotacion || 0;
  const [eligiendo, setEligiendo] = useState(false);
  const esPanel = equipo.tipo === PANEL_EN_PLANO;
  const tamano = tamanoDe(equipo);
  const menor = siguienteTamano(tamano, -1);
  const mayor = siguienteTamano(tamano, 1);
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-3.5 mt-1">
      <div className="flex items-start gap-3">
        <span className="w-11 flex justify-center pt-1 text-ink"><SimboloPlano tipo={equipo.tipo} tamano={38} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold">{ligado ? ligado.elemento.nombre : esPanel && etiqueta ? etiqueta : tipoDispositivo(equipo.tipo).nombre}</p>
          <p className="text-[13px] text-muted">{tipoDispositivo(equipo.tipo).nombre}{etiqueta && ligado?.elemento.direccion ? ` · ${etiqueta}` : ''}</p>
          {ligado?.elemento.ubicacion && <p className="text-[13px] text-muted mt-0.5">{ligado.elemento.ubicacion}</p>}
          {esPanel ? (
            equipo.panelId
              ? <Link href={`/lazos/panel/${equipo.panelId}`} className="inline-block mt-1.5 text-[13px] font-semibold text-teal underline">Ver el panel y sus circuitos</Link>
              : <p className="text-[12.5px] text-faint mt-1">Panel sin registrar en la app.</p>
          ) : ligado ? (
            <Link href={`/lazos/${ligado.lazo.id}`} className="inline-block mt-1.5 text-[13px] font-semibold text-teal underline">{ligado.lazo.codigo} · {ligado.lazo.nombre}</Link>
          ) : (
            <p className="text-[12.5px] text-faint mt-1">Equipo suelto, no está ligado a ningún dispositivo del lazo.</p>
          )}
          {ligado && soloVer && (
            <button type="button" onClick={onVerUnifilar} className="mt-1.5 text-[13px] font-semibold text-teal underline inline-flex items-center gap-1">
              <Network size={14} /> Ver en el unifilar
            </button>
          )}
          {ligado && !soloVer && (
            <span className="flex flex-wrap gap-x-3">
              <button type="button" onClick={onEditarDatos} className="mt-1.5 text-[13px] font-semibold text-teal underline inline-flex items-center gap-1">
                <PenLine size={14} /> Editar datos
              </button>
              <button type="button" onClick={onDesligar} className="mt-1.5 text-[13px] text-muted underline inline-flex items-center gap-1">
                <Link2Off size={14} /> Desligar
              </button>
            </span>
          )}
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar ficha" className="w-9 h-9 rounded-full flex items-center justify-center"><X size={18} /></button>
      </div>
      {!soloVer && (<>
      {!ligado && !esPanel && (
        <ListaParaLigar candidatos={candidatos} eligiendo={eligiendo} onAbrir={() => setEligiendo(!eligiendo)}
          onLigar={(id) => { setEligiendo(false); onLigar(id); }} />
      )}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[13px] text-muted flex-1">Tamaño</span>
        <button type="button" onClick={() => onTamano(menor)} disabled={menor === tamano} aria-label="Hacer más chico"
          className="w-11 h-11 rounded-xl bg-surface border border-line flex items-center justify-center disabled:opacity-40"><Minus size={18} strokeWidth={2.6} /></button>
        <button type="button" onClick={() => onTamano(1)} title="Tamaño normal"
          className="min-w-[64px] h-11 rounded-xl font-mono text-[14px] font-semibold">{Math.round(tamano * 100)} %</button>
        <button type="button" onClick={() => onTamano(mayor)} disabled={mayor === tamano} aria-label="Hacer más grande"
          className="w-11 h-11 rounded-xl bg-surface border border-line flex items-center justify-center disabled:opacity-40"><Plus size={18} strokeWidth={2.6} /></button>
      </div>
      {variosEquipos && (
        <button type="button" onClick={onTamanoATodos} className="mt-2 w-full min-h-[40px] rounded-xl border border-line text-[13.5px] font-semibold">
          Poner todos los equipos a {Math.round(tamano * 100)} %
        </button>
      )}
      {/* Giro: de 15 en 15 para emparejarlo con la pared; 90 para voltearlo. */}
      <div className="mt-3 flex items-center gap-1.5">
        <span className="text-[13px] text-muted flex-1">Girar</span>
        <button type="button" onClick={() => onRotacion(girar(rotacion, -90))} aria-label="Girar 90 grados a la izquierda" title="−90°"
          className={BOTON_GIRO}><RotateCcw size={16} strokeWidth={2.4} />90</button>
        <button type="button" onClick={() => onRotacion(girar(rotacion, -15))} aria-label="Girar 15 grados a la izquierda" title="−15°"
          className={BOTON_GIRO}><RotateCcw size={14} strokeWidth={2.4} />15</button>
        <button type="button" onClick={() => onRotacion(0)} title="Sin giro"
          className="min-w-[52px] h-11 rounded-xl font-mono text-[14px] font-semibold">{rotacion}°</button>
        <button type="button" onClick={() => onRotacion(girar(rotacion, 15))} aria-label="Girar 15 grados a la derecha" title="+15°"
          className={BOTON_GIRO}>15<RotateCw size={14} strokeWidth={2.4} /></button>
        <button type="button" onClick={() => onRotacion(girar(rotacion, 90))} aria-label="Girar 90 grados a la derecha" title="+90°"
          className={BOTON_GIRO}>90<RotateCw size={16} strokeWidth={2.4} /></button>
      </div>
      {variosEquipos && rotacion !== 0 && (
        <button type="button" onClick={onRotacionATodos} className="mt-2 w-full min-h-[40px] rounded-xl border border-line text-[13.5px] font-semibold">
          Girar todos los equipos a {rotacion}°
        </button>
      )}
      <button type="button" onClick={onQuitar} className="mt-3 w-full min-h-[44px] rounded-xl border border-red/40 text-red font-semibold text-[14px] flex items-center justify-center gap-1.5">
        <Trash2 size={16} /> Quitar del plano
      </button>
      </>)}
    </div>
  );
}

function ListaParaLigar({ candidatos, eligiendo, onAbrir, onLigar }: {
  candidatos: { elemento: Elemento; lazo: LazoConElementos; etiqueta: string }[];
  eligiendo: boolean;
  onAbrir: () => void;
  onLigar: (elementoId: string) => void;
}) {
  if (candidatos.length === 0) {
    return <p className="mt-3 text-[12.5px] text-faint">Cuando lo agregues al diagrama del lazo, aquí lo podrás ligar para que tome su dirección.</p>;
  }
  return (
    <div className="mt-3">
      <button type="button" onClick={onAbrir} aria-expanded={eligiendo}
        className="w-full min-h-[44px] rounded-xl bg-teal/15 border border-teal/50 text-[14px] font-semibold flex items-center justify-center gap-1.5">
        <Link2 size={16} /> Ligar a un dispositivo del lazo
      </button>
      {eligiendo && (
        <div className="mt-2 flex flex-col gap-1 max-h-[240px] overflow-y-auto">
          {candidatos.map(({ elemento, lazo, etiqueta }) => (
            <button key={elemento.id} type="button" onClick={() => onLigar(elemento.id)}
              className="min-h-[44px] px-2 rounded-lg flex items-center gap-2.5 text-left hover:bg-surface border border-line">
              <span className="w-10 flex justify-center text-ink"><SimboloPlano tipo={elemento.tipo} tamano={28} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold truncate">{elemento.nombre}</span>
                <span className="block text-[12px] text-muted truncate">{lazo.codigo}{elemento.ubicacion ? ` · ${elemento.ubicacion}` : ''}</span>
              </span>
              <span className="font-mono text-[12px] text-muted">{etiqueta}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FichaTuberia({ tuberia, metros, tolerancia, onCambiar, onQuitar, onCerrar, soloVer }: {
  tuberia: TuberiaPlano;
  metros: number | null;
  tolerancia: number;
  onCambiar: (c: Partial<TuberiaPlano>) => void;
  onQuitar: () => void;
  onCerrar: () => void;
  soloVer: boolean;
}) {
  // Si enderezarla agrega codos, es que tiene tramos chuecos.
  const derecha = enderezar(tuberia.puntos, 'recto', tolerancia);
  const chueca = derecha.length !== tuberia.puntos.length;
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-3.5 mt-1">
      <div className="flex items-center gap-2">
        <span className="w-6 h-1.5 rounded-full" style={{ background: colorTuberia(tuberia.diametro) }} />
        <p className="flex-1 text-[15px] font-semibold">{tuberia.tipo} {tuberia.diametro}</p>
        <span className="font-mono text-[14px]">{metros !== null ? formatoMetros(metros) : 'sin escala'}</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar ficha" className="w-9 h-9 rounded-full flex items-center justify-center"><X size={18} /></button>
      </div>
      {soloVer ? (
        <p className="mt-2 text-[12.5px] text-faint flex items-center gap-1.5"><Lock size={13} /> Quita el candado de arriba para cambiarla.</p>
      ) : (<>
      <Opciones titulo="Tipo" opciones={TIPOS_TUBERIA} valor={tuberia.tipo} onElegir={(tipo) => onCambiar({ tipo })} />
      <Opciones titulo="Diámetro" opciones={DIAMETROS} valor={tuberia.diametro} onElegir={(d) => onCambiar({ diametro: d })} color={colorTuberia} />
      {chueca && (
        <button type="button" onClick={() => onCambiar({ puntos: derecha })}
          className="mt-3 w-full min-h-[44px] rounded-xl border border-teal/50 bg-teal/10 text-teal font-semibold text-[14px] flex items-center justify-center gap-1.5">
          <Spline size={16} /> Enderezar este tramo (con codos a 90°)
        </button>
      )}
      <button type="button" onClick={onQuitar} className="mt-3 w-full min-h-[44px] rounded-xl border border-red/40 text-red font-semibold text-[14px] flex items-center justify-center gap-1.5">
        <Trash2 size={16} /> Quitar tramo
      </button>
      </>)}
    </div>
  );
}

function Cantidades({ sembrado, metros }: { sembrado: Sembrado; metros: number | null }) {
  const equipos = cantidadesDeEquipos(sembrado);
  const tuberias = cantidadesDeTuberia(sembrado, metros);
  const totalMetros = tuberias.reduce((suma, t) => suma + (t.metros || 0), 0);
  return (
    <div className="grid gap-3">
      <div className="rounded-2xl border border-line bg-surface-2 p-3.5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-2">Equipos · {sembrado.equipos.length}</p>
        {equipos.length === 0 && <p className="text-[13px] text-muted">Todavía no hay equipos. Usa «Equipos» para sembrarlos.</p>}
        {equipos.map((e) => (
          <div key={e.tipo} className="flex items-center gap-2.5 py-1">
            <span className="w-10 flex justify-center text-ink"><SimboloPlano tipo={e.tipo} tamano={28} /></span>
            <span className="flex-1 text-[14px]">{e.nombre}</span>
            <span className="font-mono font-semibold text-[14px]">{e.cuantos}</span>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-surface-2 p-3.5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint mb-2">Canalización{metros && tuberias.length ? ` · ${formatoMetros(totalMetros)}` : ''}</p>
        {tuberias.length === 0 && <p className="text-[13px] text-muted">Todavía no hay tubería. Usa «Tubería» para trazarla.</p>}
        {tuberias.map((t) => (
          <div key={`${t.tipo}${t.diametro}`} className="flex items-center gap-2.5 py-1">
            <span className="w-6 h-1.5 rounded-full" style={{ background: colorTuberia(t.diametro) }} />
            <span className="flex-1 text-[14px]">{t.tipo} {t.diametro}</span>
            <span className="font-mono font-semibold text-[14px]">{t.metros !== null ? formatoMetros(t.metros) : `${t.tramos} tramos`}</span>
          </div>
        ))}
        {tuberias.length > 0 && !metros && <p className="text-[12.5px] text-amber mt-1.5">Ponle escala al plano para ver los metros.</p>}
      </div>
    </div>
  );
}

// Candado de la barra de arriba. Cerrado: el plano solo se ve. Abierto
// (ámbar, para que se note): se edita. Se sacude si se intenta editar con
// candado.
function BotonCandado({ bloqueado, avisos, onCambiar }: { bloqueado: boolean; avisos: number; onCambiar: () => void }) {
  return (
    <motion.button type="button" onClick={onCambiar} aria-pressed={!bloqueado}
      aria-label={bloqueado ? 'Plano bloqueado. Toca para editar' : 'Editando. Toca para bloquear'}
      title={bloqueado ? 'Toca para editar el plano' : 'Toca para bloquear el plano'}
      key={avisos}
      initial={false}
      animate={avisos > 0 ? { x: [0, -7, 7, -5, 5, -2, 0] } : undefined}
      transition={{ duration: 0.45 }}
      whileTap={{ scale: 0.94 }}
      className={`shrink-0 min-h-[44px] min-w-[44px] justify-center px-3 rounded-xl border font-semibold text-[13.5px] flex items-center gap-1.5 transition-colors ${bloqueado
        ? 'bg-surface-2 border-line text-ink'
        : 'bg-amber/15 border-amber/60 text-amber shadow-[0_0_0_3px_rgb(var(--c-amber)/0.12)]'}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={bloqueado ? 'cerrado' : 'abierto'} className="flex"
          initial={{ rotate: -35, scale: 0.5, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 35, scale: 0.5, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 26 }}>
          {bloqueado ? <Lock size={17} strokeWidth={2.4} /> : <LockOpen size={17} strokeWidth={2.4} />}
        </motion.span>
      </AnimatePresence>
      {/* Editando, en celular solo el ícono: ahí aparecen Deshacer y Rehacer. */}
      <span className={bloqueado ? 'hidden min-[360px]:inline' : 'hidden sm:inline'}>{bloqueado ? 'Editar' : 'Editando'}</span>
    </motion.button>
  );
}

// El diagrama unifilar del lazo junto al plano. Tocar un dispositivo lleva
// el plano hasta él; tocar un equipo en el plano lo marca aquí. Los que no
// están sembrados en este plano salen tenues.
function PanelUnifilar({ lazos, lazoId, onElegirLazo, colorPorLazo, resaltado, enEstePlano, onTocar }: {
  lazos: LazoConElementos[];
  lazoId: string | null;
  onElegirLazo: (id: string) => void;
  colorPorLazo: Map<string, string>;
  resaltado: string | null;
  enEstePlano: Set<string>;
  onTocar: (elemento: Elemento) => void;
}) {
  const lazo = lazos.find((l) => l.id === lazoId) || lazos[0] || null;
  const tenues = useMemo(() => {
    const mapa = new Map<string, 'descartado'>();
    for (const e of lazo?.elementos || []) if (!enEstePlano.has(e.id)) mapa.set(e.id, 'descartado');
    return mapa;
  }, [lazo, enEstePlano]);

  if (!lazo) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-4 mt-1 text-center">
        <Network size={26} className="mx-auto text-faint" />
        <p className="text-[14px] font-semibold mt-2">Este cliente todavía no tiene lazos</p>
        <p className="text-[13px] text-muted mt-1">Arma el lazo con «Conectar» (quita el candado) o desde Lazos, y aquí verás su diagrama.</p>
      </div>
    );
  }

  const enPlano = lazo.elementos.filter((e) => enEstePlano.has(e.id)).length;
  const color = colorPorLazo.get(lazo.id);
  return (
    <div className="pt-1">
      {lazos.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-0.5 px-0.5" role="tablist" aria-label="Lazos">
          {lazos.map((l) => {
            const activo = l.id === lazo.id;
            return (
              <button key={l.id} type="button" role="tab" aria-selected={activo} onClick={() => onElegirLazo(l.id)}
                className={`shrink-0 min-h-[38px] px-3 rounded-full border text-[13px] font-semibold flex items-center gap-1.5 transition-colors ${activo ? 'bg-surface-2 border-line-strong text-ink' : 'border-line text-muted hover:bg-surface-2'}`}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorPorLazo.get(l.id) }} />
                {l.codigo}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2 mb-2">
        <span className="w-1.5 h-8 rounded-full" style={{ background: color }} />
        <div className="flex-1 min-w-0">
          <p className="text-[14.5px] font-semibold truncate">{lazo.codigo} · {lazo.nombre}</p>
          <p className="text-[12.5px] text-muted">{enPlano} de {lazo.elementos.length} en este plano · toca uno para ubicarlo</p>
        </div>
        <Link href={`/lazos/${lazo.id}`} className="shrink-0 min-h-[38px] px-3 rounded-xl border border-line text-[13px] font-semibold flex items-center">Abrir</Link>
      </div>
      {lazo.elementos.length === 0 ? (
        <p className="text-[13px] text-muted rounded-2xl border border-line bg-surface-2 p-3.5">El lazo está vacío. Con «Conectar» lo armas tocando los equipos del plano.</p>
      ) : (
        <motion.div key={lazo.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
          className="rounded-2xl bg-surface-2 border border-line p-3 overflow-x-auto">
          <DiagramaLazo lazo={lazo} elementos={lazo.elementos} onTocar={onTocar} colorLinea={color} estados={tenues} resaltado={resaltado} />
        </motion.div>
      )}
    </div>
  );
}
