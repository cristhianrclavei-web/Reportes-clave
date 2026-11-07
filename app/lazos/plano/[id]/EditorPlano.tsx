'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check, ChevronLeft, CloudOff, FileDown, Hand, Link2, Link2Off, Loader2, Minus, MoreVertical, Plus, MousePointer2, PenLine, Ruler, Spline, Trash2, Undo2, X,
} from 'lucide-react';
import LienzoPlano, { type Seleccion } from '@/components/lazos/LienzoPlano';
import { Simbolo } from '@/components/lazos/DiagramaLazo';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { confirmar, pedirTexto } from '@/lib/dialogos';
import { catalogoEnCache, listarCatalogoClientes } from '@/lib/clientesCatalogo';
import { direccionVisible, enOrdenDeRecorrido, tipoDispositivo, type Elemento } from '@/lib/lazos';
import {
  DIAMETROS, TIPOS_TUBERIA, aEscuadra, cantidadesDeEquipos, cantidadesDeTuberia, colorTuberia, distancia,
  escalaDesdeMedida, escalaDesdeProporcion, formatoMetros, longitudEnHoja, metrosDeTuberia, nombrePlanoSchema,
  proporcionDeEscala, siguienteTamano, tamanoDe, tamanoSimbolo, tiposSembrables,
  type EquipoPlano, type Plano, type Punto, type Sembrado, type TuberiaPlano,
} from '@/lib/planos';
import {
  borrarPlano, descargarPdfOriginal, entregarPdf, guardarSembrado, lazosDelCliente, leerPendiente, obtenerPlano,
  renombrarPlano, urlArchivo, type LazoConElementos,
} from '@/lib/planosDatos';

type Herramienta = 'ver' | 'equipo' | 'tuberia' | 'escala';
type EstadoGuardado = 'guardado' | 'guardando' | 'pendiente' | 'error';
type PorColocar = { tipo: string; elementoId: string | null };
type Estado = { sembrado: Sembrado; metros: number | null };

const HISTORIAL_MAXIMO = 60;

const HERRAMIENTAS: { id: Herramienta; nombre: string; icono: React.ReactNode }[] = [
  { id: 'ver', nombre: 'Mover', icono: <Hand size={18} strokeWidth={2.3} /> },
  { id: 'equipo', nombre: 'Equipos', icono: <MousePointer2 size={18} strokeWidth={2.3} /> },
  { id: 'tuberia', nombre: 'Tubería', icono: <Spline size={18} strokeWidth={2.3} /> },
  { id: 'escala', nombre: 'Escala', icono: <Ruler size={18} strokeWidth={2.3} /> },
];

function nuevoId(): string {
  return crypto.randomUUID();
}

export default function EditorPlano({ planoId, esSupervisor }: { planoId: string; esSupervisor: boolean }) {
  const [plano, setPlano] = useState<Plano | null>(null);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [lazos, setLazos] = useState<LazoConElementos[]>([]);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Lo dibujado y la escala van juntos para que «Deshacer» regrese ambos.
  const [estado, setEstado] = useState<Estado>({ sembrado: { equipos: [], tuberias: [] }, metros: null });
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const [historial, setHistorial] = useState<Estado[]>([]);
  const [cambios, setCambios] = useState(0);
  const [guardado, setGuardado] = useState<EstadoGuardado>('guardado');
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const cadenaGuardar = useRef<Promise<void>>(Promise.resolve());

  const [herramienta, setHerramienta] = useState<Herramienta>('ver');
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [porColocar, setPorColocar] = useState<PorColocar | null>(null);
  const [trazo, setTrazo] = useState<Punto[]>([]);
  const [tipoTubo, setTipoTubo] = useState<string>('EMT');
  const [diametro, setDiametro] = useState<string>('3/4"');
  const [escuadra, setEscuadra] = useState(true);
  // Los equipos nuevos salen del último tamaño que se eligió en una ficha.
  const [tamanoNuevo, setTamanoNuevo] = useState(1);
  const [medida, setMedida] = useState<Punto[]>([]);
  const [metrosMedida, setMetrosMedida] = useState('');
  const [proporcion, setProporcion] = useState('');
  const [errorEscala, setErrorEscala] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [menu, setMenu] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(true);

  // ---------- Carga ----------

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      const datos = await obtenerPlano(planoId);
      setPlano(datos);
      const pendiente = leerPendiente(planoId);
      if (pendiente) {
        // Cambios que no alcanzaron a subir la vez pasada: ganan a los del servidor.
        setEstado({ sembrado: pendiente.sembrado, metros: pendiente.metros_por_unidad });
        setCambios((n) => n + 1);
        showToast('Se recuperaron cambios guardados en este teléfono');
      } else {
        setEstado({ sembrado: datos.sembrado, metros: datos.metros_por_unidad });
      }
      urlArchivo(datos.imagen_path).then(setImagenUrl).catch((e) => setErrorCarga(e.message));
      lazosDelCliente(datos.cliente_id).then(setLazos).catch((e) => showToast(e.message, 'error'));
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

  function cambiar(nuevo: Estado) {
    setHistorial((h) => [...h.slice(-(HISTORIAL_MAXIMO - 1)), estadoRef.current]);
    setEstado(nuevo);
    setCambios((n) => n + 1);
  }

  function cambiarSembrado(sembrado: Sembrado) {
    cambiar({ sembrado, metros: estadoRef.current.metros });
  }

  function deshacer() {
    const anterior = historial[historial.length - 1];
    if (!anterior) return;
    setHistorial((h) => h.slice(0, -1));
    setEstado(anterior);
    setSeleccion(null);
    setCambios((n) => n + 1);
  }

  // ---------- Dispositivos de los lazos ----------

  const elementosPorId = useMemo(() => {
    const mapa = new Map<string, { elemento: Elemento; lazo: LazoConElementos }>();
    for (const lazo of lazos) for (const e of lazo.elementos) mapa.set(e.id, { elemento: e, lazo });
    return mapa;
  }, [lazos]);

  const sembrados = useMemo(() => new Set(estado.sembrado.equipos.map((e) => e.elementoId).filter(Boolean) as string[]), [estado.sembrado]);

  // Lo que falta sembrar de cada lazo, en el orden en que corre el cable.
  const faltantesPorLazo = useMemo(
    () => lazos.map((lazo) => ({ lazo, faltan: enOrdenDeRecorrido(lazo.elementos).filter((e) => !sembrados.has(e.id)) })),
    [lazos, sembrados],
  );

  function etiquetaDeElemento(elemento: Elemento, lazo: LazoConElementos): string {
    return direccionVisible(elemento.direccion, lazo.numero) || elemento.nombre;
  }

  // Sueltos: sembrados sin dispositivo del lazo (o cuyo dispositivo ya se borró del lazo).
  const sueltos = useMemo(
    () => estado.sembrado.equipos.filter((e) => !e.elementoId || !elementosPorId.has(e.elementoId)),
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
    if (e.elementoId) {
      const ligado = elementosPorId.get(e.elementoId);
      if (ligado) return etiquetaDeElemento(ligado.elemento, ligado.lazo);
    }
    return e.etiqueta || '';
  }, [elementosPorId]);

  // ---------- Acciones en el plano ----------

  const W = plano?.ancho || 1;
  const H = plano?.alto || 1;
  const radioPegar = tamanoSimbolo(W, H);

  // El siguiente punto de la tubería: pegado al centro de un equipo cercano
  // o, si no, a escuadra con el anterior.
  const ajustarPunto = useCallback((p: Punto): Punto => {
    const cercano = estadoRef.current.sembrado.equipos.find((e) => distancia(p, [e.x, e.y]) <= radioPegar);
    if (cercano) return [cercano.x, cercano.y];
    const anterior = trazo[trazo.length - 1];
    if (anterior && escuadra) return aEscuadra(anterior, p);
    return p;
  }, [trazo, escuadra, radioPegar]);

  function colocarEquipo(p: Punto) {
    if (!porColocar) {
      showToast('Elige abajo qué equipo vas a sembrar', 'error');
      setPanelAbierto(true);
      return;
    }
    const equipo: EquipoPlano = { id: nuevoId(), tipo: porColocar.tipo, x: p[0], y: p[1], elementoId: porColocar.elementoId };
    if (tamanoNuevo !== 1) equipo.tamano = tamanoNuevo;
    if (porColocar.elementoId) {
      const ligado = elementosPorId.get(porColocar.elementoId);
      if (ligado) equipo.etiqueta = etiquetaDeElemento(ligado.elemento, ligado.lazo);
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
    if (herramienta === 'equipo') {
      colocarEquipo(p);
      return;
    }
    if (herramienta === 'tuberia') {
      setTrazo((t) => [...t, t.length === 0 ? (ajustarPuntoInicial(p)) : ajustarPunto(p)]);
      return;
    }
    if (herramienta === 'escala') {
      setMedida((m) => (m.length >= 2 ? [p] : [...m, p]));
      return;
    }
    if (equipo) setSeleccion({ tipo: 'equipo', id: equipo.id });
    else if (tuberia) setSeleccion({ tipo: 'tuberia', id: tuberia.id });
    else setSeleccion(null);
    if (equipo || tuberia) setPanelAbierto(true);
  }

  function ajustarPuntoInicial(p: Punto): Punto {
    const cercano = estadoRef.current.sembrado.equipos.find((e) => distancia(p, [e.x, e.y]) <= radioPegar);
    return cercano ? [cercano.x, cercano.y] : p;
  }

  function terminarTramo() {
    if (trazo.length < 2) {
      showToast('Toca al menos dos puntos para el tramo', 'error');
      return;
    }
    const tuberia: TuberiaPlano = { id: nuevoId(), tipo: tipoTubo, diametro, puntos: trazo };
    cambiarSembrado({ ...estadoRef.current.sembrado, tuberias: [...estadoRef.current.sembrado.tuberias, tuberia] });
    setTrazo([]);
  }

  // Al arrastrar un equipo: se anota el estado de antes una sola vez para
  // que «Deshacer» lo regrese a donde estaba.
  function arrastreInicio(id: string) {
    setHistorial((h) => [...h.slice(-(HISTORIAL_MAXIMO - 1)), estadoRef.current]);
    setSeleccion({ tipo: 'equipo', id });
  }

  function arrastre(id: string, p: Punto) {
    setEstado((actual) => ({
      ...actual,
      sembrado: { ...actual.sembrado, equipos: actual.sembrado.equipos.map((e) => (e.id === id ? { ...e, x: p[0], y: p[1] } : e)) },
    }));
  }

  function arrastreFin() {
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

  function tamanoATodos(tamano: number) {
    const { sembrado } = estadoRef.current;
    cambiarSembrado({ ...sembrado, equipos: sembrado.equipos.map((e) => ({ ...e, tamano })) });
    showToast(`Todos los equipos quedaron al ${Math.round(tamano * 100)} %`);
  }

  function cambiarTuberia(id: string, cambio: Partial<TuberiaPlano>) {
    const { sembrado } = estadoRef.current;
    cambiarSembrado({ ...sembrado, tuberias: sembrado.tuberias.map((t) => (t.id === id ? { ...t, ...cambio } : t)) });
  }

  function elegirHerramienta(h: Herramienta) {
    setHerramienta(h);
    setSeleccion(null);
    setTrazo([]);
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
      const [{ exportarPlanoPdf }, original] = await Promise.all([import('@/lib/exportarPlanoPdf'), descargarPdfOriginal(plano.pdf_path)]);
      let clientes = catalogoEnCache();
      if (!clientes.some((c) => c.id === plano.cliente_id)) clientes = await listarCatalogoClientes().catch(() => clientes);
      const cliente = clientes.find((c) => c.id === plano.cliente_id)?.nombre || 'Cliente';
      const etiquetas = new Map<string, string>();
      for (const [id, { elemento, lazo }] of elementosPorId) etiquetas.set(id, etiquetaDeElemento(elemento, lazo));
      const bytes = await exportarPlanoPdf({
        plano: { ...plano, sembrado: estado.sembrado, metros_por_unidad: estado.metros },
        pdfOriginal: original,
        cliente,
        etiquetas,
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

  async function borrar() {
    setMenu(false);
    if (!plano) return;
    const ok = await confirmar(`¿Borrar el plano «${plano.nombre}»?`, { detalle: 'Se borra con todo lo sembrado y la tubería. Los lazos y sus dispositivos no se tocan.' });
    if (!ok) return;
    try {
      await borrarPlano(plano.id);
      window.location.href = `/lazos?cliente=${plano.cliente_id}`;
    } catch (e: any) {
      showToast(e.message, 'error');
    }
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
          <EstadoDeGuardado estado={guardado} error={errorGuardar} onReintentar={subir} />
        </div>
        <button type="button" onClick={deshacer} disabled={historial.length === 0} aria-label="Deshacer" title="Deshacer"
          className="w-11 h-11 rounded-xl border border-line bg-surface-2 flex items-center justify-center disabled:opacity-40">
          <Undo2 size={18} strokeWidth={2.4} />
        </button>
        <button type="button" onClick={exportar} disabled={exportando}
          className="min-h-[44px] px-3.5 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] flex items-center gap-1.5 disabled:opacity-60">
          {exportando ? <Loader2 size={17} className="animate-spin" /> : <FileDown size={17} strokeWidth={2.4} />}
          <span className="hidden sm:inline">PDF</span>
        </button>
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Más opciones" className="w-11 h-11 rounded-xl flex items-center justify-center">
            <MoreVertical size={20} />
          </button>
          {menu && (
            <div className="absolute right-0 top-12 w-52 rounded-2xl bg-surface border border-line shadow-xl p-1.5 z-30">
              <button type="button" onClick={renombrar} className="w-full text-left min-h-[44px] px-3 rounded-xl hover:bg-surface-2 flex items-center gap-2 text-[14.5px]"><PenLine size={16} /> Cambiar nombre</button>
              {esSupervisor && (
                <button type="button" onClick={borrar} className="w-full text-left min-h-[44px] px-3 rounded-xl hover:bg-surface-2 flex items-center gap-2 text-[14.5px] text-red"><Trash2 size={16} /> Borrar plano</button>
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
            puedeArrastrar={herramienta === 'ver'}
            ajustarPunto={ajustarPunto}
            onTocar={alTocar}
            onDobleToque={() => { if (herramienta === 'tuberia' && trazo.length >= 2) terminarTramo(); }}
            onArrastreInicio={arrastreInicio}
            onArrastre={arrastre}
            onArrastreFin={arrastreFin}
          />
          <AyudaFlotante herramienta={herramienta} porColocar={porColocar} trazo={trazo.length} medida={medida.length} etiqueta={porColocar?.elementoId ? (() => {
            const l = elementosPorId.get(porColocar.elementoId!);
            return l ? `${l.elemento.nombre}${l.elemento.direccion ? ` · ${etiquetaDeElemento(l.elemento, l.lazo)}` : ''}` : '';
          })() : porColocar ? tipoDispositivo(porColocar.tipo).nombre : ''} />
        </div>

        {/* Herramientas y panel: abajo en celular, a la derecha en computadora */}
        <aside className="shrink-0 lg:w-[380px] border-t lg:border-t-0 lg:border-l border-line bg-surface flex flex-col min-h-0 lg:h-full">
          <div className="grid grid-cols-4 gap-1 p-2" role="tablist" aria-label="Herramientas">
            {HERRAMIENTAS.map((h) => (
              <button key={h.id} type="button" role="tab" aria-selected={herramienta === h.id}
                onClick={() => (herramienta === h.id ? setPanelAbierto((a) => !a) : elegirHerramienta(h.id))}
                className={`min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold transition-colors ${herramienta === h.id ? 'bg-teal text-inkOnAccent' : 'text-muted hover:bg-surface-2'}`}>
                {h.icono}
                {h.nombre}
              </button>
            ))}
          </div>

          <div className={`${panelAbierto ? 'max-h-[38dvh]' : 'max-h-0'} lg:max-h-none lg:flex-1 overflow-y-auto px-3.5 transition-[max-height] duration-200`}>
            <div className="pb-4">
              {herramienta === 'ver' && (
                <>
                  {equipoElegido && (
                    <FichaEquipo key={equipoElegido.id} equipo={equipoElegido} ligado={equipoElegido.elementoId ? elementosPorId.get(equipoElegido.elementoId) || null : null}
                      etiqueta={etiquetaDe(equipoElegido)} onQuitar={quitarSeleccion} onCerrar={() => setSeleccion(null)}
                      onTamano={(t) => cambiarTamano(equipoElegido.id, t)} onTamanoATodos={() => tamanoATodos(tamanoDe(equipoElegido))}
                      variosEquipos={sembrado.equipos.length > 1}
                      candidatos={candidatosPara(equipoElegido)}
                      onLigar={(elementoId) => ligarEquipo(equipoElegido.id, elementoId)} onDesligar={() => desligarEquipo(equipoElegido.id)} />
                  )}
                  {tuberiaElegida && (
                    <FichaTuberia tuberia={tuberiaElegida} metros={metrosDeTuberia(tuberiaElegida, metros)}
                      onCambiar={(c) => cambiarTuberia(tuberiaElegida.id, c)} onQuitar={quitarSeleccion} onCerrar={() => setSeleccion(null)} />
                  )}
                  {!equipoElegido && !tuberiaElegida && (
                    <>
                      {sueltos.length > 0 && totalFaltantes > 0 && (
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
                      <p className="text-[13px] text-muted pt-1 pb-3">Toca un equipo o una tubería para ver su ficha (ahí se agranda o achica el equipo). Arrastra un equipo para moverlo; arrastra el plano para recorrerlo.</p>
                      <Cantidades sembrado={sembrado} metros={metros} />
                    </>
                  )}
                </>
              )}

              {herramienta === 'equipo' && (
                <PanelEquipos
                  faltantesPorLazo={faltantesPorLazo}
                  porColocar={porColocar}
                  onElegir={setPorColocar}
                  etiquetaDe={etiquetaDeElemento}
                />
              )}

              {herramienta === 'tuberia' && (
                <div className="pt-1">
                  <Opciones titulo="Tipo" opciones={TIPOS_TUBERIA} valor={tipoTubo} onElegir={setTipoTubo} />
                  <Opciones titulo="Diámetro" opciones={DIAMETROS} valor={diametro} onElegir={setDiametro} color={colorTuberia} />
                  <label className="flex items-center gap-2.5 mt-3 text-[14px]">
                    <input type="checkbox" checked={escuadra} onChange={(ev) => setEscuadra(ev.target.checked)} className="w-5 h-5 accent-teal" />
                    Enderezar a escuadra
                  </label>
                  <p className="text-[13px] text-muted mt-3">
                    {trazo.length === 0 ? 'Toca en el plano donde empieza la tubería; cada toque agrega un quiebre. Cerca de un equipo se pega a él.' : `${trazo.length} puntos${metrosTrazo !== null ? ` · ${formatoMetros(metrosTrazo)}` : ''}`}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => setTrazo((t) => t.slice(0, -1))} disabled={trazo.length === 0}
                      className="flex-1 min-h-[46px] rounded-xl bg-surface-2 border border-line font-semibold text-[14px] disabled:opacity-40">Quitar punto</button>
                    <button type="button" onClick={terminarTramo} disabled={trazo.length < 2}
                      className="flex-[1.3] min-h-[46px] rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] flex items-center justify-center gap-1.5 disabled:opacity-40">
                      <Check size={17} strokeWidth={2.6} /> Terminar tramo
                    </button>
                  </div>
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
    </div>
  );
}

// ---------- Piezas ----------

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

function AyudaFlotante({ herramienta, porColocar, trazo, medida, etiqueta }: {
  herramienta: Herramienta; porColocar: PorColocar | null; trazo: number; medida: number; etiqueta: string;
}) {
  let texto: React.ReactNode = null;
  if (herramienta === 'equipo') {
    texto = porColocar ? <>Toca el plano para sembrar <b>{etiqueta}</b></> : 'Elige qué equipo vas a sembrar';
  } else if (herramienta === 'tuberia') {
    texto = trazo === 0 ? 'Toca donde empieza la tubería' : 'Toca el siguiente quiebre · doble clic o «Terminar tramo»';
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

function PanelEquipos({ faltantesPorLazo, porColocar, onElegir, etiquetaDe }: {
  faltantesPorLazo: { lazo: LazoConElementos; faltan: Elemento[] }[];
  porColocar: PorColocar | null;
  onElegir: (p: PorColocar) => void;
  etiquetaDe: (e: Elemento, l: LazoConElementos) => string;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const conDispositivos = faltantesPorLazo.filter((f) => f.lazo.elementos.length > 0);
  return (
    <div className="pt-1">
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
                          <span className="w-10 flex justify-center text-ink"><Simbolo tipo={e.tipo} chico /></span>
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
            <Simbolo tipo={t.codigo} chico />
            <span className="text-[11px] leading-tight text-center text-muted line-clamp-2">{t.nombre}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FichaEquipo({ equipo, ligado, etiqueta, onQuitar, onCerrar, onTamano, onTamanoATodos, variosEquipos, candidatos, onLigar, onDesligar }: {
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
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const tamano = tamanoDe(equipo);
  const menor = siguienteTamano(tamano, -1);
  const mayor = siguienteTamano(tamano, 1);
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-3.5 mt-1">
      <div className="flex items-start gap-3">
        <span className="w-11 flex justify-center pt-1 text-ink"><Simbolo tipo={equipo.tipo} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold">{ligado ? ligado.elemento.nombre : tipoDispositivo(equipo.tipo).nombre}</p>
          <p className="text-[13px] text-muted">{tipoDispositivo(equipo.tipo).nombre}{etiqueta && ligado?.elemento.direccion ? ` · ${etiqueta}` : ''}</p>
          {ligado?.elemento.ubicacion && <p className="text-[13px] text-muted mt-0.5">{ligado.elemento.ubicacion}</p>}
          {ligado ? (
            <Link href={`/lazos/${ligado.lazo.id}`} className="inline-block mt-1.5 text-[13px] font-semibold text-teal underline">{ligado.lazo.codigo} · {ligado.lazo.nombre}</Link>
          ) : (
            <p className="text-[12.5px] text-faint mt-1">Equipo suelto, no está ligado a ningún dispositivo del lazo.</p>
          )}
          {ligado && (
            <button type="button" onClick={onDesligar} className="mt-1.5 ml-3 text-[13px] text-muted underline inline-flex items-center gap-1">
              <Link2Off size={14} /> Desligar
            </button>
          )}
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar ficha" className="w-9 h-9 rounded-full flex items-center justify-center"><X size={18} /></button>
      </div>
      {!ligado && (
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
      <button type="button" onClick={onQuitar} className="mt-3 w-full min-h-[44px] rounded-xl border border-red/40 text-red font-semibold text-[14px] flex items-center justify-center gap-1.5">
        <Trash2 size={16} /> Quitar del plano
      </button>
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
              <span className="w-10 flex justify-center text-ink"><Simbolo tipo={elemento.tipo} chico /></span>
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

function FichaTuberia({ tuberia, metros, onCambiar, onQuitar, onCerrar }: {
  tuberia: TuberiaPlano;
  metros: number | null;
  onCambiar: (c: Partial<TuberiaPlano>) => void;
  onQuitar: () => void;
  onCerrar: () => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-3.5 mt-1">
      <div className="flex items-center gap-2">
        <span className="w-6 h-1.5 rounded-full" style={{ background: colorTuberia(tuberia.diametro) }} />
        <p className="flex-1 text-[15px] font-semibold">{tuberia.tipo} {tuberia.diametro}</p>
        <span className="font-mono text-[14px]">{metros !== null ? formatoMetros(metros) : 'sin escala'}</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar ficha" className="w-9 h-9 rounded-full flex items-center justify-center"><X size={18} /></button>
      </div>
      <Opciones titulo="Tipo" opciones={TIPOS_TUBERIA} valor={tuberia.tipo} onElegir={(tipo) => onCambiar({ tipo })} />
      <Opciones titulo="Diámetro" opciones={DIAMETROS} valor={tuberia.diametro} onElegir={(d) => onCambiar({ diametro: d })} color={colorTuberia} />
      <button type="button" onClick={onQuitar} className="mt-3 w-full min-h-[44px] rounded-xl border border-red/40 text-red font-semibold text-[14px] flex items-center justify-center gap-1.5">
        <Trash2 size={16} /> Quitar tramo
      </button>
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
            <span className="w-10 flex justify-center text-ink"><Simbolo tipo={e.tipo} chico /></span>
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
