'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Printer, X, Search, Check, CheckCircle2, AlertTriangle, Loader2, Download, ArrowLeft, ArrowRight,
  FileStack, Files, CalendarRange, SlidersHorizontal, UserRound, ListOrdered, RotateCcw, BookOpenCheck, Copy, ImageIcon,
} from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { showToast } from '@/components/Toast';
import { createClient } from '@/lib/supabaseClient';
import {
  PERIODOS, MAXIMO_POR_ARCHIVO, rangoDelPeriodo, filtrarParaImprimir, ordenarParaImprimir, paginasEnBlancoDespues,
  nombreTecnico, folioDe, estaRevisado,
  ClavePeriodo, EstadoRevision, Orden, Impresion, ReporteImprimible,
} from '@/lib/impresionReportes';

// Reportes → «Imprimir varios»: se eligen los reportes con filtros, se
// generan sus PDF (los mismos que al abrir uno por uno) y se juntan en un
// solo archivo para mandarlo a la impresora de una vez.
//
// Los PDF se unen aquí en el navegador y no en el servidor: un servidor de
// Vercel no puede responder más de 4.5 MB y varios reportes con fotos pasan de eso.

type Paso = 'elegir' | 'opciones' | 'generando' | 'listo';
type EstadoParte = 'espera' | 'generando' | 'listo' | 'error';
type Parte = { id: string; estado: EstadoParte; error?: string };
type Resultado = { url: string; blob: Blob; nombre: string; hojas: number; reportes: number };

// Cuántos PDF se piden a la vez: más satura al servidor y al teléfono.
const A_LA_VEZ = 3;

function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fechaBonita(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

function impresoHace(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function ImprimirReportes({ reportes, onClose }: { reportes: ReporteImprimible[]; onClose: () => void }) {
  const [paso, setPaso] = useState<Paso>('elegir');

  // ---------- Filtros ----------
  const [hoy, setHoy] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<ClavePeriodo>('semana');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [texto, setTexto] = useState('');
  const [tecnicoId, setTecnicoId] = useState('');
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState<EstadoRevision>('revisados');
  const [soloSinImprimir, setSoloSinImprimir] = useState(true);
  const [orden, setOrden] = useState<Orden>('fecha');
  // En el celular los filtros menos usados se esconden para que se vea la lista.
  const [masFiltros, setMasFiltros] = useState(false);

  // El reloj se lee ya montado (nunca en el render: Vercel está en UTC).
  useEffect(() => {
    const dia = hoyLocal();
    setHoy(dia);
    const rango = rangoDelPeriodo('semana', dia);
    setDesde(rango.desde);
    setHasta(rango.hasta);
  }, []);

  function elegirPeriodo(clave: ClavePeriodo) {
    setPeriodo(clave);
    if (clave === 'personalizado' || !hoy) return;
    const rango = rangoDelPeriodo(clave, hoy);
    setDesde(rango.desde);
    setHasta(rango.hasta);
  }

  const tecnicos = useMemo(() => {
    const porId = new Map<string, string>();
    for (const r of reportes) {
      if (r.created_by) porId.set(r.created_by, nombreTecnico(r));
    }
    return [...porId.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [reportes]);

  // ---------- Reportes ya impresos ----------
  const [impresos, setImpresos] = useState<Record<string, Impresion>>({});
  const [avisoImpresos, setAvisoImpresos] = useState<string | null>(null);

  async function cargarImpresos() {
    const supabase = createClient();
    // shortcut: trae las últimas 5,000 impresiones; si algún día son más, filtrar por fecha del reporte.
    const { data, error } = await supabase
      .from('reportes_impresos')
      .select('report_id, impreso_en, profiles(full_name)')
      .order('impreso_en', { ascending: false })
      .limit(5000);
    if (error) {
      console.error('Reportes impresos', error.message);
      setAvisoImpresos('No se pudo saber cuáles ya se imprimieron (falta correr patch_reportes_impresos.sql o no hay señal). Puedes imprimir igual.');
      setSoloSinImprimir(false);
      return;
    }
    const mapa: Record<string, Impresion> = {};
    for (const fila of data || []) {
      // Vienen de la más reciente a la más vieja: se queda la primera.
      if (mapa[fila.report_id]) continue;
      const perfil: any = Array.isArray(fila.profiles) ? fila.profiles[0] : fila.profiles;
      mapa[fila.report_id] = { en: fila.impreso_en, por: perfil?.full_name || '' };
    }
    setImpresos(mapa);
    setAvisoImpresos(null);
  }
  useEffect(() => { cargarImpresos(); }, []);

  // ---------- Lista y selección ----------
  const filtrados = useMemo(() => {
    if (!desde || !hasta) return [];
    const filtros = { desde, hasta, texto, tecnicoId, tipo, estado, soloSinImprimir };
    return ordenarParaImprimir(filtrarParaImprimir(reportes, filtros, impresos), orden);
  }, [reportes, desde, hasta, texto, tecnicoId, tipo, estado, soloSinImprimir, impresos, orden]);

  // Al cambiar los filtros quedan elegidos todos los que se ven; luego se
  // quitan los que no van.
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const llaveFiltros = filtrados.map((r) => r.id).join(',');
  useEffect(() => {
    setElegidos(new Set(filtrados.map((r) => r.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llaveFiltros]);

  // Cuántos filtros escondidos están puestos (se ve en «Más filtros»).
  const filtrosActivos = [texto.trim(), tecnicoId, tipo, estado !== 'revisados' ? 'x' : '', soloSinImprimir ? '' : 'x'].filter(Boolean).length;

  const seleccion = filtrados.filter((r) => elegidos.has(r.id));
  const todosElegidos = filtrados.length > 0 && seleccion.length === filtrados.length;
  const demasiados = seleccion.length > MAXIMO_POR_ARCHIVO;

  function alternar(id: string) {
    setElegidos((previo) => {
      const nuevo = new Set(previo);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function alternarTodos() {
    if (todosElegidos) setElegidos(new Set());
    else setElegidos(new Set(filtrados.map((r) => r.id)));
  }

  // ---------- Opciones del archivo ----------
  const [hojaEntrega, setHojaEntrega] = useState(true);
  const [dobleCara, setDobleCara] = useState(false);
  const [fotosEquipos, setFotosEquipos] = useState(false);

  // ---------- Generar ----------
  const [partes, setPartes] = useState<Parte[]>([]);
  const [uniendo, setUniendo] = useState(false);
  const [errorUnir, setErrorUnir] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [marcados, setMarcados] = useState(false);
  // Los PDF ya descargados se guardan aquí para no volver a pedirlos al reintentar.
  const pdfsRef = useRef<Map<string, ArrayBuffer>>(new Map());
  // La hoja de entrega sola, para bajarla como archivo aparte.
  const hojaRef = useRef<ArrayBuffer | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);
  const cancelarRef = useRef<AbortController | null>(null);
  const ordenGeneradoRef = useRef<ReporteImprimible[]>([]);

  // Al cerrar se detiene lo pendiente.
  useEffect(() => () => cancelarRef.current?.abort(), []);
  // Cada archivo nuevo (o al cerrar) libera de la memoria el anterior.
  useEffect(() => () => {
    if (resultado) URL.revokeObjectURL(resultado.url);
  }, [resultado]);

  function cambiarParte(id: string, cambios: Partial<Parte>) {
    setPartes((previas) => previas.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  }

  async function descargarUno(id: string, senal: AbortSignal) {
    cambiarParte(id, { estado: 'generando', error: undefined });
    try {
      const extra = fotosEquipos ? '&fotosEquipos=1' : '';
      const respuesta = await fetch(`/api/reports/${id}/pdf?t=${Date.now()}${extra}`, { signal: senal });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => null);
        throw new Error(cuerpo?.error || `El servidor respondió ${respuesta.status}`);
      }
      pdfsRef.current.set(id, await respuesta.arrayBuffer());
      cambiarParte(id, { estado: 'listo' });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      const mensaje = navigator.onLine ? e?.message || 'No se pudo generar' : 'Sin conexión a internet';
      cambiarParte(id, { estado: 'error', error: mensaje });
    }
  }

  // Pide los PDF que faltan, de A_LA_VEZ en A_LA_VEZ.
  async function descargarFaltantes(lista: ReporteImprimible[]): Promise<boolean> {
    const controlador = new AbortController();
    cancelarRef.current = controlador;
    const pendientes = lista.filter((r) => !pdfsRef.current.has(r.id)).map((r) => r.id);
    let siguiente = 0;
    async function trabajador() {
      while (siguiente < pendientes.length && !controlador.signal.aborted) {
        const id = pendientes[siguiente];
        siguiente += 1;
        await descargarUno(id, controlador.signal);
      }
    }
    await Promise.all(Array.from({ length: A_LA_VEZ }, trabajador));
    if (controlador.signal.aborted) return false;
    return lista.every((r) => pdfsRef.current.has(r.id));
  }

  async function armarArchivo(lista: ReporteImprimible[]) {
    setUniendo(true);
    setErrorUnir(null);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const archivo = await PDFDocument.create();
      const hojasPorReporte: { id: string; hojas: number }[] = [];

      for (const r of lista) {
        const bytes = pdfsRef.current.get(r.id);
        if (!bytes) continue;
        const origen = await PDFDocument.load(bytes);
        const paginas = await archivo.copyPages(origen, origen.getPageIndices());
        paginas.forEach((p) => archivo.addPage(p));
        hojasPorReporte.push({ id: r.id, hojas: paginas.length });
        for (let i = 0; i < paginasEnBlancoDespues(paginas.length, dobleCara); i++) archivo.addPage();
      }

      hojaRef.current = null;
      if (hojaEntrega && hojasPorReporte.length > 0) {
        const respuesta = await fetch('/api/reports/hoja-entrega', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ renglones: hojasPorReporte }),
        });
        if (!respuesta.ok) {
          const cuerpo = await respuesta.json().catch(() => null);
          throw new Error(cuerpo?.error || 'No se pudo generar la hoja de entrega.');
        }
        hojaRef.current = await respuesta.arrayBuffer();
        const hoja = await PDFDocument.load(hojaRef.current);
        const paginasHoja = await archivo.copyPages(hoja, hoja.getPageIndices());
        // Va al frente; a doble cara, el primer reporte empieza en hoja nueva.
        let posicion = 0;
        for (const p of paginasHoja) archivo.insertPage(posicion++, p);
        for (let i = 0; i < paginasEnBlancoDespues(paginasHoja.length, dobleCara); i++) archivo.insertPage(posicion++);
      }

      archivo.setTitle(`Reportes de servicio (${hojasPorReporte.length})`);
      const bytes = await archivo.save();
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const dia = hoyLocal();
      setResultado({
        url: URL.createObjectURL(blob),
        blob,
        nombre: `reportes-${dia}-${hojasPorReporte.length}.pdf`,
        hojas: archivo.getPageCount(),
        reportes: hojasPorReporte.length,
      });
      setMarcados(false);
      setPaso('listo');
    } catch (e: any) {
      console.error('Unir reportes', e);
      setErrorUnir(e?.message || 'No se pudo armar el archivo.');
    } finally {
      setUniendo(false);
    }
  }

  async function generar() {
    const lista = seleccion;
    ordenGeneradoRef.current = lista;
    // Si cambió la opción de fotos, los PDF guardados ya no sirven.
    pdfsRef.current = new Map();
    setPartes(lista.map((r) => ({ id: r.id, estado: 'espera' })));
    setResultado(null);
    setErrorUnir(null);
    setPaso('generando');
    const completos = await descargarFaltantes(lista);
    if (completos) await armarArchivo(lista);
  }

  async function reintentar() {
    const lista = ordenGeneradoRef.current;
    const completos = await descargarFaltantes(lista);
    if (completos) await armarArchivo(lista);
  }

  function continuarSinFallidos() {
    armarArchivo(ordenGeneradoRef.current.filter((r) => pdfsRef.current.has(r.id)));
  }

  function cancelar() {
    cancelarRef.current?.abort();
    setPaso('opciones');
  }

  // ---------- Imprimir / descargar ----------
  const vistaRef = useRef<HTMLIFrameElement | null>(null);

  async function marcarImpresos() {
    if (marcados || !resultado) return;
    setMarcados(true);
    const ids = ordenGeneradoRef.current.filter((r) => pdfsRef.current.has(r.id)).map((r) => r.id);
    const supabase = createClient();
    const { error } = await supabase.from('reportes_impresos').insert(ids.map((id) => ({ report_id: id })));
    if (error) {
      console.error('Marcar impresos', error.message);
      showToast('El archivo está listo, pero no se pudo anotar que ya se imprimieron.', 'error');
      setMarcados(false);
      return;
    }
    showToast(ids.length === 1 ? 'Se anotó 1 reporte como impreso' : `Se anotaron ${ids.length} reportes como impresos`);
    cargarImpresos();
  }

  function bajarArchivo(url: string, nombre: string) {
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  }

  // Todo junto, en el mismo orden que se imprime.
  function descargarJunto() {
    if (!resultado) return;
    bajarArchivo(resultado.url, resultado.nombre);
    marcarImpresos();
  }

  // Un PDF por reporte (y la hoja de entrega aparte, si se pidió). La
  // primera vez el navegador pregunta si permite descargar varios archivos.
  async function descargarPorReporte() {
    if (!resultado || descargando) return;
    const lista = ordenGeneradoRef.current.filter((r) => pdfsRef.current.has(r.id));
    const archivos: { bytes: ArrayBuffer; nombre: string }[] = [];
    if (hojaRef.current) archivos.push({ bytes: hojaRef.current, nombre: `hoja-de-entrega-${hoyLocal()}.pdf` });
    for (const r of lista) {
      // Sin acentos: «Lucía» queda «Lucia» y no «Luc-a».
      const cliente = r.empresa_cliente.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
      archivos.push({ bytes: pdfsRef.current.get(r.id)!, nombre: `reporte-${r.fecha}-${cliente}-${folioDe(r)}.pdf` });
    }
    for (let i = 0; i < archivos.length; i++) {
      setDescargando(`Descargando ${i + 1} de ${archivos.length}…`);
      const url = URL.createObjectURL(new Blob([archivos[i].bytes], { type: 'application/pdf' }));
      bajarArchivo(url, archivos[i].nombre);
      // Una pausa entre archivos: si van todos de golpe el navegador descarta algunos.
      await new Promise((listo) => setTimeout(listo, 450));
      URL.revokeObjectURL(url);
    }
    setDescargando(null);
    showToast(`Se descargaron ${archivos.length} archivos. Si faltan, permite «descargar varios archivos» en el aviso del navegador.`);
    marcarImpresos();
  }

  async function imprimir() {
    if (!resultado) return;
    // En la computadora se imprime desde la vista previa. En el celular el
    // visor de PDF no imprime dentro de la página: se comparte el archivo
    // (Android ofrece «Imprimir») o se abre en otra pestaña.
    const esComputadora = window.matchMedia('(pointer: fine)').matches;
    const ventana = vistaRef.current?.contentWindow;
    if (esComputadora && ventana) {
      try {
        ventana.focus();
        ventana.print();
        marcarImpresos();
        return;
      } catch (e) {
        console.error('Imprimir desde la vista previa', e);
      }
    }
    const archivo = new File([resultado.blob], resultado.nombre, { type: 'application/pdf' });
    const nav = navigator as any;
    if (nav.canShare?.({ files: [archivo] })) {
      try {
        await nav.share({ files: [archivo], title: 'Reportes de servicio' });
        marcarImpresos();
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      }
    }
    window.open(resultado.url, '_blank');
    marcarImpresos();
  }

  // ---------- Pantalla ----------
  const listos = partes.filter((p) => p.estado === 'listo').length;
  const fallidos = partes.filter((p) => p.estado === 'error');
  const trabajando = partes.some((p) => p.estado === 'generando' || p.estado === 'espera');
  const porcentaje = partes.length ? Math.round((listos / partes.length) * 100) : 0;
  const porId = useMemo(() => new Map(reportes.map((r) => [r.id, r])), [reportes]);
  const clientesSeleccion = new Set(seleccion.map((r) => r.empresa_cliente)).size;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="w-full max-w-5xl h-[92dvh] sm:h-[88vh] bg-surface rounded-3xl border border-line shadow-diffuse flex flex-col overflow-hidden">
        {/* Encabezado con los tres pasos */}
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-line">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal/15 text-teal flex items-center justify-center shrink-0">
              <Printer size={22} strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display font-bold text-[20px] leading-tight">Imprimir reportes</h2>
              <p className="text-[12.5px] text-muted leading-snug">Elige los reportes y salen todos juntos en un solo archivo, listos para la impresora.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-xl hover:bg-surface-2 flex items-center justify-center text-muted shrink-0">
              <X size={20} />
            </button>
          </div>
          <Pasos paso={paso} />
        </div>

        {paso === 'elegir' && (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
            {/* Filtros */}
            <aside className="lg:w-[300px] shrink-0 border-b lg:border-b-0 lg:border-r border-line p-4 sm:p-5 flex flex-col gap-4 overflow-y-auto max-h-[50dvh] lg:max-h-none">
              <Grupo icono={<CalendarRange size={14} />} titulo="Fecha del servicio">
                <div className="flex flex-wrap gap-1.5">
                  {PERIODOS.map((p) => (
                    <Chip key={p.clave} activo={periodo === p.clave} onClick={() => elegirPeriodo(p.clave)}>{p.texto}</Chip>
                  ))}
                </div>
                {periodo === 'personalizado' ? (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <CampoFecha etiqueta="Desde" valor={desde} onCambio={setDesde} />
                    <CampoFecha etiqueta="Hasta" valor={hasta} onCambio={setHasta} />
                  </div>
                ) : desde && (
                  <p className="text-[11.5px] text-muted mt-1.5">
                    {desde === hasta ? fechaBonita(desde) : `${fechaBonita(desde)} — ${fechaBonita(hasta)}`}
                  </p>
                )}
              </Grupo>

              <button
                type="button"
                onClick={() => setMasFiltros((v) => !v)}
                className="lg:hidden -mt-1 self-start text-[12.5px] font-semibold text-teal flex items-center gap-1"
              >
                <SlidersHorizontal size={14} /> {masFiltros ? 'Menos filtros' : 'Más filtros'}
                {!masFiltros && filtrosActivos > 0 && (
                  <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-teal text-inkOnAccent text-[10.5px] flex items-center justify-center">{filtrosActivos}</span>
                )}
              </button>

              <div className={`${masFiltros ? 'flex' : 'hidden'} lg:flex flex-col gap-4`}>
              <Grupo icono={<Search size={14} />} titulo="Cliente o folio">
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ej. Plaza Norte"
                  className="w-full px-3 min-h-[40px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13.5px] placeholder:text-faint"
                />
              </Grupo>

              <Grupo icono={<UserRound size={14} />} titulo="Personal técnico">
                <select
                  value={tecnicoId}
                  onChange={(e) => setTecnicoId(e.target.value)}
                  className="w-full px-3 min-h-[40px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13.5px]"
                >
                  <option value="">Todo el personal</option>
                  {tecnicos.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                </select>
              </Grupo>

              <Grupo icono={<FileStack size={14} />} titulo="Tipo de servicio">
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="w-full px-3 min-h-[40px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13.5px]"
                >
                  <option value="">Todos los tipos</option>
                  <option value="Instalación nueva">Instalación nueva</option>
                  <option value="Mantenimiento">Mantenimiento</option>
                  <option value="Otro">Otro</option>
                </select>
              </Grupo>

              <Grupo icono={<BookOpenCheck size={14} />} titulo="Revisión">
                <div className="grid grid-cols-3 rounded-xl bg-surface-2 border border-line p-1 gap-1">
                  {([['revisados', 'Revisados'], ['todos', 'Todos'], ['pendientes', 'Pendientes']] as [EstadoRevision, string][]).map(([clave, etiqueta]) => (
                    <button
                      key={clave}
                      type="button"
                      onClick={() => setEstado(clave)}
                      className={`min-h-[34px] rounded-lg text-[12px] font-semibold transition-colors ${estado === clave ? 'bg-surface text-teal shadow-glow' : 'text-muted hover:text-ink'}`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
                {estado !== 'revisados' && (
                  <p className="text-[11.5px] text-amber mt-1.5 leading-snug">Los pendientes de revisión salen sin tu firma de revisado.</p>
                )}
              </Grupo>

              <Interruptor
                activo={soloSinImprimir}
                onCambio={setSoloSinImprimir}
                titulo="Solo los que no he impreso"
                detalle="Oculta los que ya salieron en otra impresión."
              />
              {avisoImpresos && <p className="text-[11.5px] text-amber leading-snug -mt-2">{avisoImpresos}</p>}
              </div>
            </aside>

            {/* Lista */}
            <section className="flex-1 min-h-0 flex flex-col">
              <div className="px-4 sm:px-5 py-3 border-b border-line flex items-center gap-3">
                <button
                  type="button"
                  onClick={alternarTodos}
                  disabled={filtrados.length === 0}
                  className="flex items-center gap-2.5 text-[13px] font-semibold disabled:opacity-40"
                >
                  <Casilla marcada={todosElegidos} parcial={!todosElegidos && seleccion.length > 0} />
                  {todosElegidos ? 'Quitar todos' : 'Elegir todos'}
                </button>
                <span className="text-[12.5px] text-muted">
                  {filtrados.length === 1 ? '1 reporte' : `${filtrados.length} reportes`}
                </span>
                <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
                  <ListOrdered size={14} />
                  <select
                    value={orden}
                    onChange={(e) => setOrden(e.target.value as Orden)}
                    className="bg-transparent text-ink font-semibold focus:outline-none"
                  >
                    <option value="fecha">Por fecha</option>
                    <option value="cliente">Por cliente</option>
                    <option value="tecnico">Por técnico</option>
                  </select>
                </label>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
                {filtrados.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
                    <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3 text-muted">
                      <Files size={24} />
                    </div>
                    <p className="text-[14.5px] font-semibold mb-1">No hay reportes con estos filtros</p>
                    <p className="text-[12.5px] text-muted max-w-[300px] leading-relaxed">
                      {soloSinImprimir
                        ? 'Puede que ya los hayas impreso: apaga «Solo los que no he impreso» o cambia las fechas.'
                        : 'Cambia las fechas o quita algún filtro.'}
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {filtrados.map((r) => {
                      const elegido = elegidos.has(r.id);
                      const impreso = impresos[r.id];
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => alternar(r.id)}
                            aria-pressed={elegido}
                            className={`w-full text-left rounded-2xl border p-3 sm:p-3.5 flex items-center gap-3 transition-all active:scale-[0.99] ${elegido ? 'border-teal/60 bg-teal/[0.06]' : 'border-line bg-surface hover:border-line-strong'}`}
                          >
                            <Casilla marcada={elegido} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <strong className="font-display font-bold text-[15px] tracking-wide truncate">{r.empresa_cliente}</strong>
                                <span className="text-[11.5px] font-mono font-semibold text-teal shrink-0">{folioDe(r)}</span>
                              </div>
                              <p className="text-[12px] text-muted truncate">
                                {fechaBonita(r.fecha)} · {nombreTecnico(r)}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {!estaRevisado(r) && (
                                <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-amber/15 text-amber">Pend. revisión</span>
                              )}
                              {r.data?.firmaPendiente && !r.data?.firmaClienteData && (
                                <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-red/12 text-red">Sin firma cliente</span>
                              )}
                              {impreso && (
                                <span title={impreso.por ? `Lo imprimió ${impreso.por}` : undefined} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-muted flex items-center gap-1">
                                  <Printer size={10} /> {impresoHace(impreso.en)}
                                </span>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <BarraInferior>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold">
                    {seleccion.length === 1 ? '1 reporte elegido' : `${seleccion.length} reportes elegidos`}
                  </p>
                  <p className={`text-[11.5px] ${demasiados ? 'text-red' : 'text-muted'}`}>
                    {demasiados ? `Máximo ${MAXIMO_POR_ARCHIVO} por archivo: quita algunos o divide por fechas.` : `${clientesSeleccion} ${clientesSeleccion === 1 ? 'cliente' : 'clientes'}`}
                  </p>
                </div>
                <BotonPrincipal onClick={() => setPaso('opciones')} disabled={seleccion.length === 0 || demasiados}>
                  Continuar <ArrowRight size={17} strokeWidth={2.4} />
                </BotonPrincipal>
              </BarraInferior>
            </section>
          </div>
        )}

        {paso === 'opciones' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
              <div className="max-w-2xl mx-auto flex flex-col gap-5">
                <div className="grid grid-cols-3 gap-3">
                  <Dato numero={seleccion.length} etiqueta={seleccion.length === 1 ? 'Reporte' : 'Reportes'} />
                  <Dato numero={clientesSeleccion} etiqueta={clientesSeleccion === 1 ? 'Cliente' : 'Clientes'} />
                  <Dato numero={new Set(seleccion.map((r) => r.created_by)).size} etiqueta="Técnicos" />
                </div>

                <div className="rounded-2xl border border-line divide-y divide-line">
                  <Interruptor
                    enTarjeta
                    icono={<BookOpenCheck size={18} />}
                    activo={hojaEntrega}
                    onCambio={setHojaEntrega}
                    titulo="Hoja de entrega al frente"
                    detalle="Lista de los reportes con espacio para nombre, firma y fecha de quien los recibe."
                  />
                  <Interruptor
                    enTarjeta
                    icono={<Copy size={18} />}
                    activo={dobleCara}
                    onCambio={setDobleCara}
                    titulo="Voy a imprimir a doble cara"
                    detalle="Agrega una hoja en blanco donde haga falta para que cada reporte empiece en hoja nueva y se puedan separar."
                  />
                  <Interruptor
                    enTarjeta
                    icono={<ImageIcon size={18} />}
                    activo={fotosEquipos}
                    onCambio={setFotosEquipos}
                    titulo="Fotos de catálogo de los equipos"
                    detalle="Igual que al abrir un reporte. Hace el archivo más pesado."
                  />
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">Orden en el archivo</p>
                  <ol className="rounded-2xl border border-line divide-y divide-line max-h-[260px] overflow-y-auto">
                    {hojaEntrega && (
                      <li className="px-3.5 py-2.5 flex items-center gap-3 text-[13px] text-muted">
                        <span className="w-6 text-center text-[11px] font-semibold">—</span>
                        Hoja de entrega
                      </li>
                    )}
                    {seleccion.map((r, i) => (
                      <li key={r.id} className="px-3.5 py-2.5 flex items-center gap-3 text-[13px]">
                        <span className="w-6 text-center text-[11px] font-semibold text-muted">{i + 1}</span>
                        <span className="font-semibold truncate flex-1">{r.empresa_cliente}</span>
                        <span className="text-muted text-[12px] shrink-0">{fechaBonita(r.fecha)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
            <BarraInferior>
              <BotonSecundario onClick={() => setPaso('elegir')}>
                <ArrowLeft size={16} /> <span className="hidden sm:inline">Cambiar reportes</span><span className="sm:hidden">Atrás</span>
              </BotonSecundario>
              <BotonPrincipal onClick={generar}>
                <Printer size={17} strokeWidth={2.4} /> Generar archivo
              </BotonPrincipal>
            </BarraInferior>
          </div>
        )}

        {paso === 'generando' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
              <div className="max-w-xl mx-auto">
                <div className="flex flex-col items-center text-center mb-6">
                  <Anillo porcentaje={uniendo ? 100 : porcentaje} girando={trabajando || uniendo} />
                  <p className="font-display font-bold text-[18px] mt-3">
                    {uniendo ? 'Juntando todo en un archivo…' : trabajando ? `Generando ${listos} de ${partes.length}` : fallidos.length ? 'Algunos reportes no se generaron' : 'Listo'}
                  </p>
                  <p className="text-[12.5px] text-muted mt-0.5">
                    {trabajando ? 'Puede tardar unos segundos por reporte si llevan muchas fotos.' : ' '}
                  </p>
                </div>

                {errorUnir && (
                  <div className="mb-4 p-3.5 rounded-2xl bg-red/10 border border-red/30 text-[13px]">
                    <p className="font-semibold text-red mb-0.5">No se pudo armar el archivo</p>
                    <p className="text-ink/80">{errorUnir}</p>
                  </div>
                )}

                <ul className="flex flex-col gap-1.5">
                  {partes.map((p, i) => {
                    const r = porId.get(p.id);
                    return (
                      <li key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-surface-2/60">
                        <span className="w-5 text-[11px] font-semibold text-muted text-center">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold truncate">{r?.empresa_cliente}</p>
                          {p.error && <p className="text-[11.5px] text-red truncate">{p.error}</p>}
                        </div>
                        <EstadoIcono estado={p.estado} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            <BarraInferior>
              {trabajando ? (
                <BotonSecundario onClick={cancelar}>Cancelar</BotonSecundario>
              ) : (
                <BotonSecundario onClick={() => setPaso('opciones')}><ArrowLeft size={16} /> Volver</BotonSecundario>
              )}
              {!trabajando && !uniendo && (fallidos.length > 0 || errorUnir) && (
                <div className="flex gap-2">
                  {fallidos.length > 0 && listos > 0 && (
                    <BotonSecundario onClick={continuarSinFallidos}>Seguir sin {fallidos.length === 1 ? 'ese' : `esos ${fallidos.length}`}</BotonSecundario>
                  )}
                  <BotonPrincipal onClick={reintentar}>
                    <RotateCcw size={16} /> Reintentar
                  </BotonPrincipal>
                </div>
              )}
            </BarraInferior>
          </div>
        )}

        {paso === 'listo' && resultado && (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
            {/* Vista previa: solo en computadora, el celular no muestra PDF dentro de la página. */}
            <div className="hidden lg:block flex-1 min-h-0 bg-surface-2 border-r border-line">
              <iframe ref={vistaRef} src={resultado.url} title="Vista previa" className="w-full h-full" />
            </div>
            <div className="lg:w-[340px] shrink-0 flex-1 lg:flex-none flex flex-col">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 flex flex-col items-center lg:items-stretch text-center lg:text-left">
                <div className="w-16 h-16 rounded-3xl bg-teal/15 text-teal flex items-center justify-center mb-4 animate-[guardado-etapa_.4s_ease-out]">
                  <CheckCircle2 size={34} strokeWidth={2.2} />
                </div>
                <h3 className="font-display font-bold text-[22px] leading-tight">Tu archivo está listo</h3>
                <p className="text-[13px] text-muted mt-1 leading-relaxed">
                  {resultado.reportes === 1 ? '1 reporte' : `${resultado.reportes} reportes`} en {resultado.hojas} {resultado.hojas === 1 ? 'hoja' : 'hojas'}
                  {hojaEntrega ? ', con la hoja de entrega al frente' : ''}.
                </p>
                {dobleCara && (
                  <p className="text-[12px] text-muted mt-2 leading-relaxed">En la impresora elige «Doble cara» (borde largo).</p>
                )}
                <div className={`mt-5 w-full rounded-2xl p-3.5 text-[12.5px] flex items-start gap-2.5 text-left ${marcados ? 'bg-teal/10 text-teal' : 'bg-surface-2 text-muted'}`}>
                  {marcados ? <Check size={16} className="shrink-0 mt-0.5" /> : <Printer size={16} className="shrink-0 mt-0.5" />}
                  <span>{marcados ? 'Quedaron anotados como impresos.' : 'Al imprimir o descargar, estos reportes quedan anotados como impresos.'}</span>
                </div>
              </div>
              <div className="p-4 sm:p-5 border-t border-line flex flex-col gap-2">
                <BotonPrincipal onClick={imprimir} ancho>
                  <Printer size={18} strokeWidth={2.4} /> Imprimir
                </BotonPrincipal>
                <BotonSecundario onClick={descargarPorReporte} ancho>
                  {descargando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {descargando || (resultado.reportes === 1 ? 'Descargar el PDF' : `Descargar ${resultado.reportes} PDF (uno por reporte)`)}
                </BotonSecundario>
                <button type="button" onClick={descargarJunto} className="text-[12.5px] font-semibold text-teal hover:underline min-h-[32px]">
                  Descargar todo en un solo PDF
                </button>
                <button type="button" onClick={() => setPaso('elegir')} className="text-[12.5px] text-muted hover:text-ink min-h-[36px]">
                  Imprimir otros reportes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}

// ---------- Piezas de la pantalla ----------

function Pasos({ paso }: { paso: Paso }) {
  const pasos = [
    { clave: 'elegir', texto: 'Elegir' },
    { clave: 'opciones', texto: 'Revisar' },
    { clave: 'listo', texto: 'Imprimir' },
  ];
  // «Generando» se muestra como el paso de Revisar ya terminado.
  const actual = paso === 'elegir' ? 0 : paso === 'opciones' ? 1 : paso === 'generando' ? 1.5 : 2;
  return (
    <div className="mt-4 flex items-center gap-2">
      {pasos.map((p, i) => {
        const hecho = actual > i;
        const enCurso = Math.floor(actual) === i && !hecho;
        return (
          <div key={p.clave} className="flex items-center gap-2 flex-1 last:flex-none">
            <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${hecho || enCurso ? 'text-ink' : 'text-faint'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] transition-colors ${hecho ? 'bg-teal text-inkOnAccent' : enCurso ? 'bg-teal/15 text-teal ring-2 ring-teal/50' : 'bg-surface-2 text-faint'}`}>
                {hecho ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              {p.texto}
            </div>
            {i < pasos.length - 1 && (
              <div className="flex-1 h-[2px] rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-teal transition-all duration-500" style={{ width: hecho ? '100%' : paso === 'generando' && i === 1 ? '50%' : '0%' }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Grupo({ icono, titulo, children }: { icono: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2 flex items-center gap-1.5">{icono}{titulo}</p>
      {children}
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 min-h-[32px] rounded-full text-[12px] font-semibold border transition-colors active:scale-95 ${activo ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line text-ink/80 hover:border-teal/50'}`}
    >
      {children}
    </button>
  );
}

function CampoFecha({ etiqueta, valor, onCambio }: { etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted">{etiqueta}</span>
      <input
        type="date"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="w-full px-2.5 min-h-[40px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13px]"
      />
    </label>
  );
}

function Casilla({ marcada, parcial = false }: { marcada: boolean; parcial?: boolean }) {
  return (
    <span className={`w-[22px] h-[22px] rounded-[7px] border-2 flex items-center justify-center shrink-0 transition-all ${marcada || parcial ? 'bg-teal border-teal text-inkOnAccent' : 'border-line-strong'}`}>
      {marcada && <Check size={14} strokeWidth={3.2} />}
      {parcial && <span className="w-2.5 h-[2.5px] rounded bg-current" />}
    </span>
  );
}

function Interruptor({ activo, onCambio, titulo, detalle, icono, enTarjeta = false }: {
  activo: boolean; onCambio: (v: boolean) => void; titulo: string; detalle: string; icono?: React.ReactNode; enTarjeta?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onCambio(!activo)}
      className={`w-full text-left flex items-start gap-3 ${enTarjeta ? 'p-4' : ''}`}
    >
      {icono && <span className={`mt-0.5 ${activo ? 'text-teal' : 'text-muted'}`}>{icono}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">{titulo}</span>
        <span className="block text-[12px] text-muted leading-snug mt-0.5">{detalle}</span>
      </span>
      <span className={`mt-0.5 w-10 h-6 rounded-full p-0.5 shrink-0 transition-colors ${activo ? 'bg-teal' : 'bg-surface-2 border border-line'}`}>
        <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}

function Dato({ numero, etiqueta }: { numero: number; etiqueta: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 border border-line p-3.5 text-center">
      <p className="font-display font-bold text-[28px] leading-none text-teal">{numero}</p>
      <p className="text-[11.5px] text-muted mt-1">{etiqueta}</p>
    </div>
  );
}

function Anillo({ porcentaje, girando }: { porcentaje: number; girando: boolean }) {
  const radio = 34;
  const perimetro = 2 * Math.PI * radio;
  return (
    <div className="relative w-[88px] h-[88px]">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={radio} fill="none" stroke="currentColor" strokeWidth="6" className="text-surface-2" />
        <circle
          cx="40" cy="40" r={radio} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
          className="text-teal transition-[stroke-dashoffset] duration-500"
          strokeDasharray={perimetro}
          strokeDashoffset={perimetro * (1 - porcentaje / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display font-bold text-[20px]">
        {girando && porcentaje >= 100 ? <Loader2 size={24} className="animate-spin text-teal" /> : `${porcentaje}%`}
      </span>
    </div>
  );
}

function EstadoIcono({ estado }: { estado: EstadoParte }) {
  if (estado === 'listo') return <CheckCircle2 size={18} className="text-teal shrink-0" />;
  if (estado === 'error') return <AlertTriangle size={18} className="text-red shrink-0" />;
  if (estado === 'generando') return <Loader2 size={18} className="text-teal animate-spin shrink-0" />;
  return <span className="w-[18px] h-[18px] rounded-full border-2 border-line-strong shrink-0" />;
}

function BarraInferior({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 sm:px-5 py-3.5 border-t border-line bg-surface flex items-center justify-between gap-3">
      {children}
    </div>
  );
}

function BotonPrincipal({ onClick, disabled = false, ancho = false, children }: { onClick: () => void; disabled?: boolean; ancho?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-12 px-5 rounded-2xl bg-teal text-inkOnAccent text-[14.5px] font-semibold flex items-center justify-center gap-2 shadow-glow-teal active:scale-95 transition-transform disabled:opacity-40 disabled:shadow-none disabled:active:scale-100 shrink-0 ${ancho ? 'w-full' : ''}`}
    >
      {children}
    </button>
  );
}

function BotonSecundario({ onClick, ancho = false, children }: { onClick: () => void; ancho?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-12 px-4 rounded-2xl bg-surface-2 border border-line text-[13.5px] font-semibold flex items-center justify-center gap-1.5 hover:border-line-strong active:scale-95 transition-transform shrink-0 ${ancho ? 'w-full' : ''}`}
    >
      {children}
    </button>
  );
}
