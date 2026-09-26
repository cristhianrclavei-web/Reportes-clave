'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SupervisorShell from '@/components/SupervisorShell';
import EmptyIllustration from '@/components/EmptyIllustration';
import SelectorSemana, { RangoSeleccionado } from '@/components/SelectorSemana';
import { useTheme } from '@/lib/useTheme';
import { listarFestivos, festivoDe, festivosEnCache, Festivo } from '@/lib/avisos';
import { crearServicio, listarServiciosSupervisor, listarTecnicos, Servicio, calcularEstadoTiempo, listarProgresoPorGrupo, ProgresoTareas, listarConfirmacionesPorServicio, ConfirmacionTecnico } from '@/lib/serviciosProgramados';
import ConfirmacionTecnicos, { ResumenConfirmacion } from '@/components/ConfirmacionTecnicos';
import ProgressBar from '@/components/ProgressBar';
import {
  InsumoNuevo, CategoriaInsumo, CATEGORIAS, UNIDADES, PlantillaInsumos,
  listarPlantillas, guardarPlantillaDeItems, actualizarPlantilla, eliminarPlantilla, listarChecklists, ResumenChecklist,
  eliminarChecklist, agregarInsumosIniciales,
} from '@/lib/insumos';
import { Plus, X, FileText, AlertTriangle, Timer, MapPin, Play, Check, Clock, FolderKanban, Bookmark, Pencil, Copy, Trash2, PackageCheck, TrendingUp, ChevronRight } from 'lucide-react';
import { calcularResultadoServicio } from '@/lib/resultadoServicio';
import { ResultadoIconos } from '@/components/ResultadoServicioBadges';
import { showToast } from '@/components/Toast';
import SelectorArticulo from '@/components/SelectorArticulo';
import { hoyLocal } from '@/lib/fechaHoy';
import { getCurrentLocation } from '@/lib/geolocation';
import { extraerCoordenadas, esEnlaceCortoMaps } from '@/lib/geocerca';
import { buscarDirecciones, resolverEnlaceMapa, SugerenciaDireccion } from '@/lib/geocoding';

const ESTADO_CFG: Record<Servicio['estado'], { label: string; cls: string; Icono: any }> = {
  programado: { label: 'Programado', cls: 'bg-surface-2 text-muted', Icono: Clock },
  en_sitio: { label: 'En sitio', cls: 'bg-amber/15 text-amber', Icono: MapPin },
  en_curso: { label: 'En curso', cls: 'bg-teal/15 text-teal', Icono: Play },
  concluido: { label: 'Concluido', cls: 'bg-teal/15 text-teal', Icono: Check },
};

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

// Mismas clases que ya usan el formulario de "Nuevo reporte" y el de
// cotizaciones: tarjetas separadas por sección en vez de un formulario
// plano, con la etiqueta en teal + punto de color.
const cardCls = 'glass rounded-2xl p-4';
const cardTitleCls = 'font-display font-semibold text-[13px] uppercase tracking-wider text-teal mb-3.5 flex items-center gap-2';

type Grupo = { grupoId: string; proyecto: string; dias: Servicio[] };

function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
}

function ConteoChip({ label, valor }: { label: string; valor: number }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-[15px] font-display font-bold">{valor}</p>
    </div>
  );
}

function formatFechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

function esFinDeSemana(fecha: string): boolean {
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = new Date(y, m - 1, d).getDay();
  return dia === 0 || dia === 6;
}

// Genera las fechas corridas desde una fecha de inicio, saltando fines de
// semana si así se pidió.
function generarFechasSeguidas(inicio: string, cantidad: number, omitirFinde: boolean): string[] {
  const fechas: string[] = [];
  let cursor = inicio;
  let guardia = 0;
  while (fechas.length < cantidad && guardia < 400) {
    if (!omitirFinde || !esFinDeSemana(cursor)) fechas.push(cursor);
    cursor = sumarDias(cursor, 1);
    guardia++;
  }
  return fechas;
}

export default function ServiciosSupervisorList({ userName }: { userName?: string }) {
  const theme = useTheme();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [progresoPorGrupo, setProgresoPorGrupo] = useState<Record<string, ProgresoTareas>>({});
  const [confirmaciones, setConfirmaciones] = useState<Record<string, ConfirmacionTecnico[]>>({});
  const [tecnicos, setTecnicos] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNuevo, setShowNuevo] = useState(false);
  // La pantalla hace dos cosas distintas: programar algo nuevo y consultar lo
  // ya programado. Separarlas evita que el formulario y la lista compitan.
  const [seccion, setSeccion] = useState<'agendar' | 'agendados' | 'concluidos' | 'checklists' | 'plantillas'>('agendados');
  const [checklists, setChecklists] = useState<ResumenChecklist[]>([]);
  const [rango, setRango] = useState<RangoSeleccionado | null>(null);
  const [busquedaServicio, setBusquedaServicio] = useState('');
  const fechasDeServicios = useMemo(() => servicios.map((s) => s.fecha).filter(Boolean), [servicios]);
  const [plantillaEditando, setPlantillaEditando] = useState<PlantillaInsumos | null>(null);
  const [creandoPlantilla, setCreandoPlantilla] = useState(false);
  const [nombreEdit, setNombreEdit] = useState('');
  const [itemsEdit, setItemsEdit] = useState<InsumoNuevo[]>([]);
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);
  const [eliminandoChecklist, setEliminandoChecklist] = useState<string | null>(null);
  const [mostrarNuevaLista, setMostrarNuevaLista] = useState(false);
  const [grupoNuevaLista, setGrupoNuevaLista] = useState('');
  const [insumosNuevaLista, setInsumosNuevaLista] = useState<InsumoNuevo[]>([{ categoria: 'herramienta', descripcion: '', cantidad: 1, unidad: 'pza', articuloId: null }]);
  const [guardandoNuevaLista, setGuardandoNuevaLista] = useState(false);

  // Proyectos agendados que todavía no tienen una lista de carga — de ahí
  // se elige al crear una nueva, ya que una lista siempre pertenece a un
  // proyecto (no existe suelta).
  const gruposSinChecklist = useMemo(() => {
    const conLista = new Set(checklists.map((c) => c.grupoId));
    const mapa = new Map<string, { grupoId: string; proyecto: string; servicioId: string }>();
    servicios.forEach((s) => {
      if (conLista.has(s.grupo_id) || mapa.has(s.grupo_id)) return;
      mapa.set(s.grupo_id, { grupoId: s.grupo_id, proyecto: s.proyecto, servicioId: s.id });
    });
    // Si el proyecto tiene varios días, se guarda el del día 1 cuando aparece.
    servicios.forEach((s) => {
      if (s.numero_dia === 1 && mapa.has(s.grupo_id)) {
        mapa.set(s.grupo_id, { grupoId: s.grupo_id, proyecto: s.proyecto, servicioId: s.id });
      }
    });
    return Array.from(mapa.values()).sort((a, b) => a.proyecto.localeCompare(b.proyecto));
  }, [servicios, checklists]);

  const [proyecto, setProyecto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(hoyLocal());
  const [duracionMin, setDuracionMin] = useState(120);
  // Hora acordada con el cliente. Opcional a propósito: si se vuelve
  // obligatoria, la gente escribe cualquier cosa con tal de guardar y el
  // indicador de puntualidad queda midiendo ruido.
  const [horaProgramada, setHoraProgramada] = useState('');
  const [horaSalidaProgramada, setHoraSalidaProgramada] = useState('');
  // Cuál de los dos campos capturó la persona por última vez: el otro se
  // deriva de llegada + este. Null hasta que toque uno de los dos, para no
  // forzar el cálculo con la duración por defecto sin que nadie la haya
  // tocado.
  const [ultimoCampoEditado, setUltimoCampoEditado] = useState<'salida' | 'duracion' | null>(null);
  const [ubicLat, setUbicLat] = useState('');
  const [ubicLng, setUbicLng] = useState('');
  const [ubicDireccion, setUbicDireccion] = useState('');
  const [ubicSugerencias, setUbicSugerencias] = useState<SugerenciaDireccion[]>([]);
  const [ubicBuscandoDireccion, setUbicBuscandoDireccion] = useState(false);
  const ubicDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ubicEnlace, setUbicEnlace] = useState('');
  const [ubicBuscando, setUbicBuscando] = useState(false);
  const [ubicResolviendoEnlace, setUbicResolviendoEnlace] = useState(false);
  const [ubicError, setUbicError] = useState<string | null>(null);
  // Festivos: se avisa AL AGENDAR, no al reportar. Si el aviso sale antes de
  // guardar, el viaje perdido no llega a ocurrir.
  const [festivos, setFestivos] = useState<Festivo[]>(() => festivosEnCache());
  const [diasTotales, setDiasTotales] = useState(1);
  // true = días corridos a partir de la fecha de inicio; false = cada día se
  // captura por separado (obras que solo se atienden ciertos días).
  const [diasSeguidos, setDiasSeguidos] = useState(true);
  // Lista de carga capturada durante el alta. Vive en memoria hasta que el
  // proyecto existe: antes de crearlo no hay grupo al que asociarla.
  const [insumos, setInsumos] = useState<InsumoNuevo[]>([]);
  const [plantillas, setPlantillas] = useState<PlantillaInsumos[]>([]);
  const [fechasSalteadas, setFechasSalteadas] = useState<string[]>([]);
  // Los fines de semana suelen no ser laborables; al generar días corridos se
  // pueden omitir sábados y domingos.
  const [omitirFinDeSemana, setOmitirFinDeSemana] = useState(false);
  const [tecnicoIds, setTecnicoIds] = useState<string[]>([]);
  const [tareas, setTareas] = useState<string[]>(['']);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    try {
      const [s, t, p] = await Promise.all([listarServiciosSupervisor(), listarTecnicos(), listarProgresoPorGrupo()]);
      setServicios(s);
      setTecnicos(t);
      setProgresoPorGrupo(p);
      listarConfirmacionesPorServicio().then(setConfirmaciones).catch(() => {});
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los servicios');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    listarFestivos().then(setFestivos).catch(() => {});
  }, []);

  // Fechas resultantes según el modo elegido — se usan para la vista previa
  // y para guardar.
  const fechasDelProyecto = useMemo(() => {
    if (diasTotales <= 1) return fecha ? [fecha] : [];
    if (diasSeguidos) return generarFechasSeguidas(fecha, diasTotales, omitirFinDeSemana);
    return fechasSalteadas.filter(Boolean);
  }, [diasTotales, diasSeguidos, fecha, omitirFinDeSemana, fechasSalteadas]);

  // Se revisan todas las fechas del proyecto, no solo la primera: en uno de
  // cinco días el festivo suele caer a media semana.
  const festivosDelProyecto = useMemo(
    () => fechasDelProyecto
      .map((f) => festivoDe(f, festivos))
      .filter((f): f is Festivo => f !== null),
    [fechasDelProyecto, festivos],
  );

  // Al cambiar el número de días en modo salteado, se ajusta la lista de
  // campos conservando lo ya capturado.
  useEffect(() => {
    listarPlantillas().then(setPlantillas).catch(() => {});
    listarChecklists().then(setChecklists).catch(() => {});
  }, []);

  useEffect(() => {
    if (diasSeguidos || diasTotales <= 1) return;
    setFechasSalteadas((prev) => {
      const copia = [...prev];
      while (copia.length < diasTotales) {
        const ultima = copia[copia.length - 1] || fecha;
        copia.push(sumarDias(ultima, 1));
      }
      return copia.slice(0, diasTotales);
    });
  }, [diasTotales, diasSeguidos, fecha]);

  const gruposFiltrados = useMemo<Grupo[]>(() => {
    const mapa: Record<string, Grupo> = {};
    servicios.forEach((s) => {
      // El rango de fechas no aplica cuando se busca por texto: quien escribe
      // el nombre de un cliente quiere encontrarlo esté en la semana que esté.
      if (!busquedaServicio && rango) {
        // Un proyecto aparece si alguno de sus días cae en el rango: filtrar
        // día por día partiría proyectos a la mitad y confundiría la numeración.
        if (!servicios.some((d) => d.grupo_id === s.grupo_id && d.fecha >= rango.desde && d.fecha <= rango.hasta)) return;
      }
      if (busquedaServicio) {
        if (!s.proyecto.toLowerCase().includes(busquedaServicio.toLowerCase())) return;
      }
      if (!mapa[s.grupo_id]) mapa[s.grupo_id] = { grupoId: s.grupo_id, proyecto: s.proyecto, dias: [] };
      mapa[s.grupo_id].dias.push(s);
    });
    Object.values(mapa).forEach((g) => g.dias.sort((a, b) => a.numero_dia - b.numero_dia));
    return Object.values(mapa).sort((a, b) => {
      const fa = a.dias[a.dias.length - 1]?.created_at || '';
      const fb = b.dias[b.dias.length - 1]?.created_at || '';
      return fb.localeCompare(fa);
    });
  }, [servicios, rango, busquedaServicio]);

  // "Agendados" es lo que todavía tiene trabajo pendiente — incluye los
  // proyectos de varios días que van a medias. Un proyecto con todos sus
  // días concluidos pasa a "Concluidos".
  const grupos = useMemo(() => gruposFiltrados.filter((g) => g.dias.some((d) => d.estado !== 'concluido')), [gruposFiltrados]);
  const gruposConcluidos = useMemo(() => gruposFiltrados.filter((g) => g.dias.every((d) => d.estado === 'concluido')), [gruposFiltrados]);
  const lista = seccion === 'concluidos' ? gruposConcluidos : grupos;

  // Con llegada y salida acordadas, la duración ya no hay que estimarla a
  // ojo: es la diferencia entre las dos. Solo se deriva cuando la salida fue
  // el último campo que la persona tocó — si en cambio tocó la duración, es
  // la salida la que se deriva (ver salidaCalculada), no al revés.
  const duracionCalculada = useMemo(() => {
    if (ultimoCampoEditado !== 'salida') return null;
    if (!horaProgramada || !horaSalidaProgramada) return null;
    const [h1, m1] = horaProgramada.split(':').map(Number);
    const [h2, m2] = horaSalidaProgramada.split(':').map(Number);
    let minutos = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (minutos <= 0) minutos += 24 * 60; // cruza medianoche
    return minutos;
  }, [horaProgramada, horaSalidaProgramada, ultimoCampoEditado]);

  useEffect(() => {
    if (duracionCalculada !== null) setDuracionMin(duracionCalculada);
  }, [duracionCalculada]);

  // Caso inverso: llegada + duración capturadas a mano → la salida se deriva
  // sumando los minutos a la llegada.
  const salidaCalculada = useMemo(() => {
    if (ultimoCampoEditado !== 'duracion') return null;
    if (!horaProgramada || !duracionMin) return null;
    const [h1, m1] = horaProgramada.split(':').map(Number);
    const totalMin = ((h1 * 60 + m1 + duracionMin) % (24 * 60) + 24 * 60) % (24 * 60);
    const h2 = Math.floor(totalMin / 60);
    const m2 = totalMin % 60;
    return `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`;
  }, [horaProgramada, duracionMin, ultimoCampoEditado]);

  useEffect(() => {
    if (salidaCalculada !== null) setHoraSalidaProgramada(salidaCalculada);
  }, [salidaCalculada]);

  async function handleUsarUbicacionActual() {
    setUbicBuscando(true);
    setUbicError(null);
    const loc = await getCurrentLocation();
    setUbicBuscando(false);
    if (!loc) {
      setUbicError('No se pudo obtener tu ubicación. Revisa el permiso de ubicación del navegador.');
      return;
    }
    setUbicLat(String(loc.lat));
    setUbicLng(String(loc.lng));
    setUbicDireccion('');
    setUbicSugerencias([]);
  }

  async function handleUsarEnlaceUbicacion() {
    const directo = extraerCoordenadas(ubicEnlace);
    if (directo) {
      setUbicError(null);
      setUbicLat(String(directo.lat));
      setUbicLng(String(directo.lng));
      setUbicDireccion('');
      setUbicSugerencias([]);
      return;
    }

    // Los enlaces cortos (maps.app.goo.gl) no traen coordenadas en la URL:
    // hay que resolverlos en el servidor. Cualquier otro texto sin
    // coordenadas es simplemente un texto inválido.
    if (!esEnlaceCortoMaps(ubicEnlace)) {
      setUbicError('No se encontraron coordenadas en ese texto. Pega el enlace de Google Maps o "lat, lng".');
      return;
    }

    setUbicError(null);
    setUbicResolviendoEnlace(true);
    try {
      const resultado = await resolverEnlaceMapa(ubicEnlace.trim());
      if ('error' in resultado) {
        setUbicError(resultado.error);
        return;
      }
      setUbicLat(String(resultado.punto.lat));
      setUbicLng(String(resultado.punto.lng));
      setUbicDireccion('');
      setUbicSugerencias([]);
    } finally {
      setUbicResolviendoEnlace(false);
    }
  }

  // Igual que escribir en el buscador de Google Maps: cada tecla dispara una
  // búsqueda con medio segundo de margen, para no mandar un request por
  // letra mientras la persona sigue escribiendo.
  function handleCambiarDireccion(texto: string) {
    setUbicDireccion(texto);
    setUbicError(null);
    if (ubicDebounceRef.current) clearTimeout(ubicDebounceRef.current);
    if (texto.trim().length < 3) {
      setUbicSugerencias([]);
      return;
    }
    ubicDebounceRef.current = setTimeout(async () => {
      setUbicBuscandoDireccion(true);
      try {
        setUbicSugerencias(await buscarDirecciones(texto));
      } catch {
        setUbicSugerencias([]);
      } finally {
        setUbicBuscandoDireccion(false);
      }
    }, 500);
  }

  function handleElegirSugerencia(s: SugerenciaDireccion) {
    setUbicLat(String(s.lat));
    setUbicLng(String(s.lng));
    setUbicDireccion(s.direccion);
    setUbicSugerencias([]);
  }

  function toggleTecnico(id: string) {
    setTecnicoIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function updateTarea(i: number, value: string) {
    setTareas((prev) => prev.map((t, idx) => (idx === i ? value : t)));
  }
  function addTarea() {
    setTareas((prev) => [...prev, '']);
  }
  function removeTarea(i: number) {
    setTareas((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : ['']));
  }

  // Guarda la lista capturada en el alta como plantilla reutilizable, sin
  // esperar a que el proyecto exista.
  async function handleDuplicarPlantilla(pl: PlantillaInsumos) {
    const nombre = prompt('Nombre de la copia', `${pl.nombre} (copia)`);
    if (!nombre || !nombre.trim()) return;
    try {
      await guardarPlantillaDeItems(nombre, pl.items);
      setPlantillas(await listarPlantillas());
      showToast('Plantilla duplicada', 'success');
    } catch (e: any) {
      alert('No se pudo duplicar: ' + (e?.message || 'error'));
    }
  }

  async function handleEliminarPlantilla(pl: PlantillaInsumos) {
    if (!confirm(`¿Borrar la plantilla «${pl.nombre}»?\n\nLos servicios que ya la usaron conservan su lista; solo deja de estar disponible para nuevos.`)) return;
    try {
      await eliminarPlantilla(pl.id);
      setPlantillas(await listarPlantillas());
      showToast('Plantilla borrada', 'success');
    } catch (e: any) {
      alert('No se pudo borrar: ' + (e?.message || 'error'));
    }
  }

  function abrirNuevaPlantilla() {
    setNombreEdit('');
    setItemsEdit([{ categoria: 'herramienta', descripcion: '', cantidad: 1, unidad: 'pza' }]);
    setCreandoPlantilla(true);
  }

  function cerrarModalPlantilla() {
    setPlantillaEditando(null);
    setCreandoPlantilla(false);
  }

  // Sirve para editar una plantilla existente y para crear una desde cero:
  // la diferencia es solo si hay una `plantillaEditando` o se está creando.
  async function handleGuardarEdicionPlantilla() {
    if (!plantillaEditando && !creandoPlantilla) return;
    const items = itemsEdit
      .filter((i) => i.descripcion.trim())
      .map((i) => ({ ...i, descripcion: i.descripcion.trim(), unidad: i.unidad.trim() || 'pza' }));
    try {
      if (plantillaEditando) {
        await actualizarPlantilla(plantillaEditando.id, { nombre: nombreEdit.trim() || plantillaEditando.nombre, items });
        showToast('Plantilla actualizada', 'success');
      } else {
        if (!nombreEdit.trim()) {
          alert('Ponle un nombre a la plantilla.');
          return;
        }
        if (items.length === 0) {
          alert('Agrega al menos un renglón a la plantilla.');
          return;
        }
        await guardarPlantillaDeItems(nombreEdit, items);
        showToast('Plantilla creada', 'success');
      }
      setPlantillas(await listarPlantillas());
      cerrarModalPlantilla();
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || 'error'));
    }
  }

  async function handleEliminarChecklist(c: ResumenChecklist) {
    const aviso = c.entregadoEn
      ? '\n\nOJO: ya se entregó la herramienta de esta lista. Al borrarla se pierde el registro de qué se entregó.'
      : '';
    if (!confirm(`¿Borrar la lista de carga de «${c.proyecto}» (${c.total} renglones)?${aviso}\n\nEl proyecto no se elimina, solo su lista de herramienta y material.`)) return;
    setEliminandoChecklist(c.grupoId);
    try {
      await eliminarChecklist(c.grupoId);
      setChecklists(await listarChecklists());
      showToast('Lista de carga borrada', 'success');
    } catch (e: any) {
      alert('No se pudo borrar: ' + (e?.message || 'error'));
    } finally {
      setEliminandoChecklist(null);
    }
  }

  function abrirNuevaLista() {
    setGrupoNuevaLista(gruposSinChecklist[0]?.grupoId || '');
    setInsumosNuevaLista([{ categoria: 'herramienta', descripcion: '', cantidad: 1, unidad: 'pza', articuloId: null }]);
    setMostrarNuevaLista(true);
  }

  async function handleGuardarNuevaLista() {
    const destino = gruposSinChecklist.find((g) => g.grupoId === grupoNuevaLista);
    if (!destino) {
      alert('Elige el proyecto al que pertenece la lista.');
      return;
    }
    const items = insumosNuevaLista
      .filter((i) => i.descripcion.trim())
      .map((i) => ({ ...i, descripcion: i.descripcion.trim(), unidad: i.unidad.trim() || 'pza' }));
    if (items.length === 0) {
      alert('Agrega al menos un renglón a la lista.');
      return;
    }
    setGuardandoNuevaLista(true);
    try {
      await agregarInsumosIniciales(destino.grupoId, destino.servicioId, items);
      setChecklists(await listarChecklists());
      setMostrarNuevaLista(false);
      showToast('Lista de carga creada', 'success');
    } catch (e: any) {
      alert('No se pudo guardar: ' + (e?.message || 'error'));
    } finally {
      setGuardandoNuevaLista(false);
    }
  }

  async function handleGuardarPlantillaDesdeAlta() {
    const items = insumos
      .filter((i) => i.descripcion.trim())
      .map((i) => ({ ...i, descripcion: i.descripcion.trim(), unidad: i.unidad.trim() || 'pza' }));
    if (items.length === 0) return;
    const nombre = prompt('¿Con qué nombre guardas esta lista? (ej. Instalación de paneles)');
    if (!nombre || !nombre.trim()) return;
    try {
      await guardarPlantillaDeItems(nombre, items);
      setPlantillas(await listarPlantillas());
      showToast('Plantilla guardada', 'success');
    } catch (e: any) {
      alert('No se pudo guardar la plantilla: ' + (e?.message || 'error'));
    }
  }

  async function handleCrear() {
    if (!proyecto.trim()) {
      setError('Falta el nombre del proyecto/cliente.');
      return;
    }
    if (tecnicoIds.length === 0) {
      setError('Selecciona al menos un técnico.');
      return;
    }
    const tareasLimpias = tareas.map((t) => t.trim()).filter(Boolean);
    // Se descartan los renglones sin descripción: quedan vacíos cuando el
    // supervisor agrega uno y se arrepiente.
    const insumosLimpios = insumos
      .filter((i) => i.descripcion.trim())
      .map((i) => ({ ...i, descripcion: i.descripcion.trim(), unidad: i.unidad.trim() || 'pza' }));
    const fechasFinales = fechasDelProyecto;
    if (fechasFinales.length === 0) {
      setError('Falta indicar la fecha de cada día.');
      return;
    }
    if (new Set(fechasFinales).size !== fechasFinales.length) {
      setError('Hay fechas repetidas. Cada día debe tener una fecha distinta.');
      return;
    }
    const ubicacionProgramada = ubicLat.trim() && ubicLng.trim()
      ? { lat: parseFloat(ubicLat), lng: parseFloat(ubicLng), ...(ubicDireccion.trim() ? { direccion: ubicDireccion.trim() } : {}) }
      : null;
    if ((ubicLat.trim() || ubicLng.trim()) && !ubicacionProgramada) {
      setError('La ubicación del sitio quedó incompleta.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await crearServicio({
        proyecto: proyecto.trim(),
        descripcion: descripcion.trim(),
        fechas: fechasFinales,
        horaProgramada: horaProgramada || null,
        horaSalidaProgramada: horaSalidaProgramada || null,
        ubicacionProgramada,
        duracionMin,
        tecnicoIds,
        tareas: tareasLimpias,
        insumos: insumosLimpios,
      });
      showToast(fechasFinales.length > 1 ? `Proyecto programado (${fechasFinales.length} días)` : 'Servicio programado', 'success');
      setShowNuevo(false);
      setSeccion('agendados');
      setProyecto(''); setDescripcion(''); setTecnicoIds([]); setTareas(['']); setDuracionMin(120);
      setHoraProgramada(''); setHoraSalidaProgramada(''); setUltimoCampoEditado(null);
      setUbicLat(''); setUbicLng(''); setUbicDireccion(''); setUbicSugerencias([]); setUbicEnlace(''); setUbicError(null);
      setDiasTotales(1);
      setDiasSeguidos(true); setFechasSalteadas([]); setOmitirFinDeSemana(false);
      setInsumos([]);
      await cargar();
    } catch (e: any) {
      setError(e?.message || 'No se pudo programar el servicio.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <SupervisorShell
      active="servicios"
      title="Servicios"
      userName={userName}
      wrapperClassName="max-w-2xl lg:max-w-6xl mx-auto pb-28 lg:pb-16 lg:px-6"
    >
        {/* Cuatro secciones con su nombre: en una sola fila no caben cuatro
            etiquetas en un celular, así que se acomodan en dos por dos y pasan
            a una fila en pantallas anchas. Un ícono solo obliga a adivinar. */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
          {([
            { k: 'agendar', label: 'Agendar', Icono: Plus },
            { k: 'agendados', label: 'Agendados', Icono: FolderKanban },
            { k: 'concluidos', label: 'Concluidos', Icono: Check },
            { k: 'checklists', label: 'Listas de carga', Icono: PackageCheck },
            { k: 'plantillas', label: 'Plantillas', Icono: Bookmark },
          ] as const).map(({ k, label, Icono }) => (
            <button
              key={k}
              onClick={() => { setSeccion(k); setShowNuevo(k === 'agendar'); }}
              className={`min-h-[54px] px-2 rounded-2xl text-[13.5px] font-display font-semibold border transition-all duration-150 flex items-center justify-center gap-1.5 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] ${
                seccion === k ? 'bg-teal text-inkOnAccent border-teal shadow-glow-teal hover:brightness-110' : 'bg-surface-2 border-line-strong text-ink/80 hover:text-ink'
              }`}
            >
              <Icono size={17} strokeWidth={2.4} className="shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {/* Listas de herramienta creadas: un renglón por proyecto */}
        {seccion === 'checklists' && (
          <div>
            <p className="text-[12.5px] text-muted mb-3 leading-relaxed">
              Listas de herramienta y material creadas, una por proyecto. También se crean al programar un servicio.
            </p>

            <button
              onClick={abrirNuevaLista}
              disabled={gruposSinChecklist.length === 0}
              className="w-full min-h-[50px] mb-4 rounded-2xl border border-dashed border-teal/50 text-teal text-[14.5px] font-semibold flex items-center justify-center gap-2 transition-all duration-150 hover:bg-teal/5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={18} strokeWidth={2.6} />
              Nueva lista de carga
            </button>
            {gruposSinChecklist.length === 0 && (
              <p className="text-[12px] text-faint -mt-2 mb-4">Todos los proyectos agendados ya tienen su lista.</p>
            )}

            {checklists.length === 0 && (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3.5">
                  <EmptyIllustration variante="lista" />
                </div>
                <p className="text-[13.5px] text-muted leading-relaxed max-w-[260px]">Todavía no hay listas. Crea una aquí o al programar un servicio.</p>
              </div>
            )}

            {/* Encabezado de columnas: solo cabe en pantallas anchas */}
            {checklists.length > 0 && (
              <div className="hidden lg:grid grid-cols-[2fr_repeat(3,72px)_1.2fr_1.4fr] gap-3 px-4 pb-2 text-[11.5px] uppercase tracking-wider text-muted">
                <span>Lista / proyecto</span>
                <span className="text-center">Herr.</span>
                <span className="text-center">Mat.</span>
                <span className="text-center">Equipo</span>
                <span>Entrega</span>
                <span>Creada por</span>
              </div>
            )}

            <div className="flex flex-col gap-2.5 lg:gap-1.5">
              {checklists.map((c) => (
                <div key={c.grupoId} className="flex items-stretch gap-2">
                <Link
                  href={`/dashboard/servicios/${c.servicioId}`}
                  className="group flex-1 min-w-0 rounded-2xl lg:rounded-xl bg-surface border border-line p-4 lg:py-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-diffuse hover:border-line-strong active:translate-y-0 active:scale-[0.99] lg:grid lg:grid-cols-[2fr_repeat(3,72px)_1.2fr_1.4fr] lg:gap-3 lg:items-center"
                >
                  <div className="min-w-0">
                    <strong className="font-display font-bold text-[15.5px] lg:text-[14.5px] block truncate transition-colors group-hover:text-teal">{c.proyecto}</strong>
                    <p className="text-[12.5px] text-muted lg:hidden mt-0.5">{c.total} renglones</p>
                  </div>

                  {/* En móvil las cifras van juntas; en escritorio, en columnas */}
                  <div className="flex gap-4 mt-2 lg:hidden">
                    <ConteoChip label="Herramienta" valor={c.herramienta} />
                    <ConteoChip label="Material" valor={c.material} />
                    <ConteoChip label="Equipo" valor={c.equipo} />
                  </div>
                  <span className="hidden lg:block text-center text-[14.5px] font-display font-bold">{c.herramienta}</span>
                  <span className="hidden lg:block text-center text-[14.5px] font-display font-bold">{c.material}</span>
                  <span className="hidden lg:block text-center text-[14.5px] font-display font-bold">{c.equipo}</span>

                  <p className={`text-[12.5px] mt-2 lg:mt-0 ${c.entregadoEn ? 'text-teal' : 'text-amber'}`}>
                    <span className="lg:hidden">Entrega: </span>
                    {c.entregadoEn ? formatFechaHora(c.entregadoEn) : 'Pendiente'}
                  </p>

                  <p className="text-[12.5px] text-muted mt-1 lg:mt-0 truncate">
                    <span className="lg:hidden">Creada por </span>{c.creadoPor}
                    {c.creadoEn && <span className="lg:block"> · {formatFechaHora(c.creadoEn)}</span>}
                  </p>
                </Link>
                <button
                  onClick={() => handleEliminarChecklist(c)}
                  disabled={eliminandoChecklist === c.grupoId}
                  aria-label={`Borrar lista de carga de ${c.proyecto}`}
                  className="shrink-0 w-11 rounded-2xl lg:rounded-xl border border-red/40 text-red flex items-center justify-center transition-all duration-150 hover:bg-red/10 active:scale-90 disabled:opacity-50"
                >
                  <Trash2 size={16} strokeWidth={2.4} />
                </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Administración de plantillas de herramienta */}
        {seccion === 'plantillas' && (
          <div>
            <p className="text-[12.5px] text-muted mb-3 leading-relaxed">
              Listas guardadas de herramienta y material. Se cargan al programar un servicio.
            </p>

            <button
              onClick={abrirNuevaPlantilla}
              className="w-full min-h-[50px] mb-4 rounded-2xl border border-dashed border-teal/50 text-teal text-[14.5px] font-semibold flex items-center justify-center gap-2 transition-all duration-150 hover:bg-teal/5 active:scale-[0.98]"
            >
              <Plus size={18} strokeWidth={2.6} />
              Nueva plantilla
            </button>

            {plantillas.length === 0 && (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3.5">
                  <EmptyIllustration variante="plantilla" />
                </div>
                <p className="text-[13.5px] text-muted leading-relaxed max-w-[260px]">Todavía no hay plantillas. Crea una aquí o guarda la lista de un servicio al programarlo.</p>
              </div>
            )}

            <div className="flex flex-col lg:grid lg:grid-cols-2 gap-2.5">
              {plantillas.map((pl) => (
                <div key={pl.id} className="rounded-2xl bg-surface border border-line p-4">
                  <div className="flex justify-between items-start gap-2.5">
                    <div className="min-w-0">
                      <strong className="font-display font-bold text-[15.5px]">{pl.nombre}</strong>
                      <p className="text-[12.5px] text-muted mt-0.5">{pl.items.length} renglones</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => { setPlantillaEditando(pl); setNombreEdit(pl.nombre); setItemsEdit(pl.items as InsumoNuevo[]); }}
                        aria-label="Editar plantilla"
                        className="w-11 h-11 flex items-center justify-center rounded-xl border border-line-strong text-ink/80 transition-all duration-150 hover:-translate-y-0.5 hover:border-teal hover:text-teal active:translate-y-0 active:scale-90"
                      >
                        <Pencil size={16} strokeWidth={2.4} />
                      </button>
                      <button
                        onClick={() => handleDuplicarPlantilla(pl)}
                        aria-label="Duplicar plantilla"
                        className="w-11 h-11 flex items-center justify-center rounded-xl border border-line-strong text-ink/80 transition-all duration-150 hover:-translate-y-0.5 hover:border-teal hover:text-teal active:translate-y-0 active:scale-90"
                      >
                        <Copy size={16} strokeWidth={2.4} />
                      </button>
                      <button
                        onClick={() => handleEliminarPlantilla(pl)}
                        aria-label="Borrar plantilla"
                        className="w-11 h-11 flex items-center justify-center rounded-xl border border-red/40 text-red transition-all duration-150 hover:-translate-y-0.5 hover:bg-red/10 active:translate-y-0 active:scale-90"
                      >
                        <Trash2 size={16} strokeWidth={2.4} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[12.5px] text-muted mt-2 leading-relaxed line-clamp-2">
                    {pl.items.map((i) => `${i.cantidad} ${i.unidad} ${i.descripcion}`).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {seccion === 'agendar' && (!showNuevo ? (
          <button
            onClick={() => setShowNuevo(true)}
            className="w-full min-h-[56px] mb-5 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[16px] tracking-wide shadow-glow-teal flex items-center justify-center gap-2 transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.98]"
          >
            <Plus size={20} strokeWidth={2.6} />
            Programar servicio o proyecto
          </button>
        ) : (
          <div className="flex flex-col gap-4 mb-5">
            <div className={cardCls}>
              <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Datos del proyecto</p>

              <label className="text-[13px] text-ink/75 block mb-1.5">Proyecto / Cliente</label>
              <input value={proyecto} onChange={(e) => setProyecto(e.target.value)} className="w-full px-3.5 min-h-[48px] mb-3 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]" placeholder="Ej. PRINT PACK — Etapa 4" />

              <label className="text-[13px] text-ink/75 block mb-1.5">Descripción (opcional)</label>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="w-full px-3.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px] min-h-[48px]" placeholder="Detalle breve del servicio" />
            </div>

            <div className={cardCls}>
              <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Fecha y horario</p>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[13px] text-ink/75 block mb-1.5">{diasTotales > 1 && diasSeguidos ? 'Fecha de inicio' : 'Fecha'}</label>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]" />
                </div>
                <div>
                  <label className="text-[13px] text-ink/75 block mb-1.5">Hora de llegada programada</label>
                  <input
                    type="time"
                    value={horaProgramada}
                    onChange={(e) => setHoraProgramada(e.target.value)}
                    className="w-full px-3.5 min-h-[48px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]"
                  />
                  <p className="text-[11px] text-faint mt-1">Opcional. Sin ella no se mide puntualidad.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[13px] text-ink/75 block mb-1.5">Hora de salida programada</label>
                  <input
                    type="time"
                    value={horaSalidaProgramada}
                    onChange={(e) => { setHoraSalidaProgramada(e.target.value); setUltimoCampoEditado('salida'); }}
                    readOnly={salidaCalculada !== null}
                    className={`w-full px-3.5 min-h-[48px] rounded-xl border border-line focus:border-teal focus:outline-none text-[15px] ${salidaCalculada !== null ? 'bg-surface text-muted' : 'bg-surface-2'}`}
                  />
                  {salidaCalculada !== null && (
                    <p className="text-[11px] text-faint mt-1">Calculada de llegada + duración.</p>
                  )}
                </div>
                <div>
                  <label className="text-[13px] text-ink/75 block mb-1.5">Duración estimada (min/día)</label>
                  <input
                    type="number"
                    value={duracionMin === 0 ? '' : duracionMin}
                    onChange={(e) => { setDuracionMin(e.target.value === '' ? 0 : parseInt(e.target.value) || 0); setUltimoCampoEditado('duracion'); }}
                    placeholder="120"
                    readOnly={duracionCalculada !== null}
                    className={`w-full px-3.5 min-h-[48px] rounded-xl border border-line focus:border-teal focus:outline-none text-[15px] ${duracionCalculada !== null ? 'bg-surface text-muted' : 'bg-surface-2'}`}
                  />
                  {duracionCalculada !== null && (
                    <p className="text-[11px] text-faint mt-1">Calculada de llegada a salida.</p>
                  )}
                </div>
              </div>
            </div>

            <div className={cardCls}>
              <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Ubicación del sitio</p>
              <p className="text-[12.5px] text-muted mb-2.5 -mt-2">Opcional.</p>
            <div className="mb-1 p-3.5 rounded-xl bg-surface-2 border border-line">
              <div className="relative mb-2.5">
                <input
                  placeholder="Escribe la dirección…"
                  value={ubicDireccion}
                  onChange={(e) => handleCambiarDireccion(e.target.value)}
                  className="w-full px-3 min-h-[44px] rounded-lg bg-surface border border-line focus:border-teal focus:outline-none text-[14px]"
                />
                {ubicBuscandoDireccion && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-faint">Buscando…</span>
                )}
                {ubicSugerencias.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg bg-surface border border-line-strong shadow-glow overflow-hidden">
                    {ubicSugerencias.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleElegirSugerencia(s)}
                        className="w-full text-left px-3 py-2.5 text-[13px] border-b border-line last:border-b-0 active:bg-surface-2"
                      >
                        {s.direccion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                <input
                  type="number" step="any" placeholder="Latitud" value={ubicLat}
                  onChange={(e) => setUbicLat(e.target.value)}
                  className="w-full px-3 min-h-[44px] rounded-lg bg-surface border border-line focus:border-teal focus:outline-none text-[14px]"
                />
                <input
                  type="number" step="any" placeholder="Longitud" value={ubicLng}
                  onChange={(e) => setUbicLng(e.target.value)}
                  className="w-full px-3 min-h-[44px] rounded-lg bg-surface border border-line focus:border-teal focus:outline-none text-[14px]"
                />
              </div>
              <button
                type="button"
                onClick={handleUsarUbicacionActual}
                disabled={ubicBuscando}
                className="w-full min-h-[40px] mb-2.5 rounded-lg bg-surface border border-line text-[13px] font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                <MapPin size={14} strokeWidth={2.4} />
                {ubicBuscando ? 'Buscando…' : 'Usar mi ubicación actual'}
              </button>
              <div className="flex gap-2">
                <input
                  placeholder="O pega un enlace de Google Maps"
                  value={ubicEnlace}
                  onChange={(e) => setUbicEnlace(e.target.value)}
                  disabled={ubicResolviendoEnlace}
                  className="flex-1 min-w-0 px-3 min-h-[40px] rounded-lg bg-surface border border-line focus:border-teal focus:outline-none text-[13px] disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleUsarEnlaceUbicacion}
                  disabled={ubicResolviendoEnlace}
                  className="px-3.5 min-h-[40px] rounded-lg bg-surface border border-line text-[13px] font-medium shrink-0 active:scale-95 transition-transform disabled:opacity-60"
                >
                  {ubicResolviendoEnlace ? 'Resolviendo…' : 'Usar'}
                </button>
              </div>
              {ubicError && <p className="text-[12px] text-red mt-2">{ubicError}</p>}
            </div>
            <p className="text-[11px] text-faint">
              Con esto el técnico puede marcar llegada solo, comparando su GPS contra este punto.
            </p>
            </div>

            <div className={cardCls}>
              <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Duración del proyecto</p>
              <label className="text-[13px] text-ink/75 block mb-1.5">¿Cuántos días va a durar este proyecto?</label>
              <input
                type="number"
                min={1}
                value={diasTotales === 0 ? '' : diasTotales}
                onChange={(e) => setDiasTotales(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                placeholder="1"
                className="w-full px-3.5 min-h-[48px] mb-1 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]"
              />
              <p className="text-[12.5px] text-muted">
                Cada día lleva su propia fecha y solo se puede trabajar ese día. Si después hacen falta más, se amplía desde el detalle del proyecto.
              </p>
            </div>

            <div className={cardCls}>
              <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Técnicos asignados</p>
              <div className="flex flex-wrap gap-2">
                {tecnicos.length === 0 && <p className="text-muted text-[12px]">No hay técnicos registrados.</p>}
                {tecnicos.map((t) => (
                  <span
                    key={t.id}
                    onClick={() => toggleTecnico(t.id)}
                    className={`px-4 min-h-[44px] flex items-center rounded-full text-[14px] font-medium cursor-pointer border ${
                      tecnicoIds.includes(t.id) ? 'bg-teal text-inkOnAccent border-teal' : 'bg-surface-2 border-line-strong text-ink/80'
                    }`}
                  >
                    {t.full_name}
                  </span>
                ))}
              </div>
            </div>

            <div className={cardCls}>
              <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Lista de tareas a realizar</p>
              <p className="text-[12.5px] text-muted mb-2.5">
                Del proyecto completo. En proyectos de varios días la lista es una sola y se comparte: lo que quede pendiente un día aparece pendiente el siguiente, y el avance se acumula.
              </p>
              {tareas.map((t, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <span className="text-[12px] text-muted w-5 shrink-0">{i + 1}.</span>
                  <input
                    value={t}
                    onChange={(e) => updateTarea(i, e.target.value)}
                    className="flex-1 px-3 min-h-[46px] rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]"
                    placeholder="Ej. Instalar 10 detectores en nivel 1"
                  />
                  <button onClick={() => removeTarea(i)} aria-label="Quitar tarea" className="text-red w-11 h-11 flex items-center justify-center shrink-0 active:scale-90 transition-transform"><X size={19} strokeWidth={2.6} /></button>
                </div>
              ))}
              <button onClick={addTarea} className="text-teal text-[14.5px] font-medium min-h-[44px] flex items-center gap-1.5"><Plus size={17} strokeWidth={2.6} />Agregar tarea</button>
            </div>

            <div className={cardCls}>
              {/* Lista de carga: se define al programar, que es cuando el
                  supervisor sabe qué se necesita para el trabajo. */}
              <p className={cardTitleCls}><span className="w-1.5 h-1.5 rounded-full bg-amber inline-block" /> Herramienta, material y equipo</p>
              <p className="text-[12.5px] text-muted mb-2.5">
                Lo que la cuadrilla debe llevar. El técnico la verifica al salir y al regresar, cada día del proyecto.
              </p>

              {plantillas.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const pl = plantillas.find((x) => x.id === e.target.value);
                  if (pl) setInsumos((prev) => [...prev, ...pl.items]);
                }}
                className="w-full px-3 min-h-[46px] mb-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]"
              >
                <option value="">Cargar una plantilla…</option>
                {plantillas.map((pl) => <option key={pl.id} value={pl.id}>{pl.nombre} ({pl.items.length})</option>)}
              </select>
            )}

            {insumos.map((it, i) => (
              <div key={i} className="mb-2.5 p-3 rounded-xl bg-surface-2 border border-line">
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <SelectorArticulo
                      valor={it.articuloId || null}
                      cantidadPedida={it.cantidad}
                      onChange={(a) =>
                        setInsumos((prev) =>
                          prev.map((x, idx) =>
                            idx === i
                              ? a
                                ? { ...x, articuloId: a.id, descripcion: a.descripcion, unidad: a.unidad, categoria: a.categoria }
                                : { ...x, articuloId: null }
                              : x
                          )
                        )
                      }
                    />
                  </div>
                  <button
                    onClick={() => setInsumos((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Quitar de la lista"
                    className="text-red w-11 h-11 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
                  >
                    <X size={19} strokeWidth={2.6} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-muted shrink-0">Cantidad</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={it.cantidad}
                    onChange={(e) => setInsumos((prev) => prev.map((x, idx) => (idx === i ? { ...x, cantidad: parseFloat(e.target.value) || 0 } : x)))}
                    className="w-[90px] shrink-0 px-2.5 min-h-[46px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14.5px]"
                  />
                  <span className="text-[14px] text-muted">{it.unidad || 'pza'}</span>
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <button
                onClick={() => setInsumos((prev) => [...prev, { categoria: 'herramienta', descripcion: '', cantidad: 1, unidad: 'pza', articuloId: null }])}
                className="flex-1 text-teal text-[14.5px] font-medium min-h-[44px] flex items-center justify-center gap-1.5 border border-dashed border-teal/50 rounded-xl"
              >
                <Plus size={17} strokeWidth={2.6} />
                Agregar herramienta o material
              </button>
              {insumos.filter((i) => i.descripcion.trim()).length > 0 && (
                <button
                  onClick={handleGuardarPlantillaDesdeAlta}
                  aria-label="Guardar esta lista como plantilla"
                  className="min-h-[44px] px-3.5 rounded-xl border border-line-strong text-ink/80 flex items-center gap-1.5 text-[13.5px]"
                >
                  <Bookmark size={16} strokeWidth={2.3} />
                  Guardar
                </button>
              )}
            </div>
            </div>

            {/* No bloquea: a veces hay que trabajar en festivo, y el supervisor
                sabe algo que la app no. Pero que no sea por no haberlo visto. */}
            {festivosDelProyecto.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-amber/10 border border-amber/25">
                <p className="text-[13.5px] text-amber font-semibold mb-1.5">
                  {festivosDelProyecto.length === 1
                    ? 'Un día del proyecto cae en festivo'
                    : `${festivosDelProyecto.length} días del proyecto caen en festivo`}
                </p>
                {festivosDelProyecto.map((f) => (
                  <p key={f.fecha} className="text-[12.5px] text-ink/80">
                    {f.fecha} — {f.nombre}
                    {f.tipo === 'costumbre' && ' (muchos clientes cierran)'}
                  </p>
                ))}
                <p className="text-[12px] text-muted mt-2">
                  Puedes programarlo igual si ya lo acordaste con el cliente.
                </p>
              </div>
            )}

            {error && <p className="text-red text-[12px]">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => { setShowNuevo(false); setError(null); }} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium active:scale-95 transition-transform">
                Cancelar
              </button>
              <button onClick={handleCrear} disabled={guardando} className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold active:scale-95 transition-transform disabled:opacity-60">
                {guardando ? 'Guardando...' : fechasDelProyecto.length > 1 ? `Programar ${fechasDelProyecto.length} días` : 'Programar servicio'}
              </button>
            </div>
          </div>
        ))}

        {(seccion === 'agendados' || seccion === 'concluidos') && (
          <>
            <SelectorSemana fechas={fechasDeServicios} onCambio={setRango} etiqueta="días programados" />
            <input
              value={busquedaServicio}
              onChange={(e) => setBusquedaServicio(e.target.value)}
              placeholder="Buscar proyecto o cliente..."
              className="w-full px-3.5 min-h-[48px] mb-4 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[15px]"
            />
          </>
        )}

        {(seccion === 'agendados' || seccion === 'concluidos') && loading && (
          <div className="flex flex-col lg:grid lg:grid-cols-2 gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border-l-4 border-line bg-surface p-4">
                <div className="flex justify-between items-baseline gap-2.5 mb-2.5">
                  <div className="h-4 w-2/5 rounded-full skeleton-shimmer" />
                  <div className="h-3 w-16 rounded-full skeleton-shimmer shrink-0" />
                </div>
                <div className="h-2 w-full rounded-full skeleton-shimmer mb-2.5" />
                <div className="h-3 w-3/5 rounded-full skeleton-shimmer" />
              </div>
            ))}
          </div>
        )}
        {(seccion === 'agendados' || seccion === 'concluidos') && !loading && lista.length === 0 && (
          <div className="flex flex-col items-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3.5">
              <EmptyIllustration variante="proyecto" />
            </div>
            <p className="text-[14.5px] font-medium mb-1">
              {servicios.length === 0 ? 'Todavía no hay servicios programados' : 'Sin resultados'}
            </p>
            <p className="text-[13px] text-muted leading-relaxed max-w-[280px]">
              {servicios.length === 0
                ? 'Usa «Agendar» para programar el primero.'
                : busquedaServicio
                ? 'Ningún proyecto coincide con la búsqueda.'
                : seccion === 'concluidos'
                ? 'No hay servicios concluidos en estas fechas. Cambia de semana, o busca el proyecto por nombre.'
                : 'No hay servicios programados en estas fechas. Cambia de semana o toca «Toda la semana».'}
            </p>
          </div>
        )}

        {(seccion === 'agendados' || seccion === 'concluidos') && (
        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-3 lg:items-start">
          {lista.map((g) => {
            const diasConReporte = g.dias.filter((d) => d.report_id).length;
            const abierto = grupoAbierto === g.grupoId;
            const diasTotalesGrupo = g.dias[0]?.dias_totales || g.dias.length;
            const pr = progresoPorGrupo[g.grupoId];
            // Confirmación solo de los días que aún no se trabajan.
            const confProgramados = g.dias.filter((d) => d.estado === 'programado').flatMap((d) => confirmaciones[d.id] || []);
            return (
              <div key={g.grupoId} className="rounded-2xl border-l-4 border-teal bg-surface overflow-hidden transition-shadow duration-150 hover:shadow-diffuse">
                <button
                  onClick={() => setGrupoAbierto(abierto ? null : g.grupoId)}
                  className="w-full text-left p-4 transition-transform duration-150 active:scale-[0.99]"
                >
                  <div className="flex justify-between items-baseline gap-2.5">
                    <strong className="font-display font-bold text-[16px] leading-snug min-w-0 truncate">{g.proyecto}</strong>
                    <span className="text-[12.5px] text-muted shrink-0 whitespace-nowrap">
                      {diasConReporte}/{diasTotalesGrupo} con reporte
                    </span>
                  </div>
                  {pr && pr.total > 0 && (
                    <div className="flex items-center gap-2.5 mt-2">
                      <ProgressBar pct={pr.pct} className="flex-1" />
                      <span className={`text-[13px] font-display font-bold shrink-0 ${pr.pct >= 100 ? 'text-teal' : 'text-amber'}`}>{pr.pct}%</span>
                    </div>
                  )}
                  {seccion !== 'concluidos' && confProgramados.length > 0 && (
                    <div className="mt-2"><ResumenConfirmacion items={confProgramados} /></div>
                  )}
                  <p className="text-[13px] text-muted mt-2">
                    {diasTotalesGrupo === 1
                      ? formatFecha(g.dias[0].fecha)
                      : `${diasTotalesGrupo} días · ${formatFecha(g.dias[0].fecha)} al ${formatFecha(g.dias[g.dias.length - 1].fecha)}`} · toca para {abierto ? 'ocultar' : 'ver'} el detalle
                  </p>
                </button>

                {/* Solo tiene sentido para proyectos de varios días */}
                {diasTotalesGrupo > 1 && (
                  <Link
                    href={`/dashboard/servicios/proyecto/${g.grupoId}`}
                    className="group/avance flex items-center justify-between gap-2 mx-4 mb-3 px-3.5 min-h-[46px] rounded-xl bg-surface-2 border border-line text-[14px] font-medium transition-all duration-150 hover:border-teal/40 active:scale-[0.99]"
                  >
                    <span className="flex items-center gap-2">
                      <TrendingUp size={16} strokeWidth={2.4} className="text-teal" />
                      Ver el avance del proyecto
                    </span>
                    <ChevronRight size={16} strokeWidth={2.4} className="text-muted transition-transform group-hover/avance:translate-x-0.5" />
                  </Link>
                )}

                {abierto && (
                  <div className="border-t border-line px-3 pb-3 pt-1 flex flex-col gap-2">
                    {g.dias.map((d) => {
                      const et = calcularEstadoTiempo(d);
                      return (
                        <Link
                          key={d.id}
                          href={`/dashboard/servicios/${d.id}`}
                          className="flex justify-between items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 transition-all duration-150 hover:bg-surface-2/70 active:scale-[0.98]"
                        >
                          <div className="min-w-0">
                            <span className="text-[14.5px] font-semibold flex items-center gap-2">
                              <ResultadoIconos resultado={calcularResultadoServicio(d, pr)} size={15} />
                              Día {d.numero_dia} de {d.dias_totales} · {formatFecha(d.fecha)}
                            </span>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${ESTADO_CFG[d.estado].cls}`}>
                                {(() => { const I = ESTADO_CFG[d.estado].Icono; return <I size={12} strokeWidth={2.6} />; })()}
                                {ESTADO_CFG[d.estado].label}
                              </span>
                              {d.report_id && <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-teal/15 text-teal flex items-center gap-1.5"><FileText size={12} strokeWidth={2.6} />Con reporte</span>}
                              {et.tipo === 'retraso' && <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-red/15 text-red flex items-center gap-1.5"><AlertTriangle size={12} strokeWidth={2.6} />{et.minutos} min</span>}
                              {et.tipo === 'excedido' && <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-amber/15 text-amber flex items-center gap-1.5"><Timer size={12} strokeWidth={2.6} />Excedido</span>}
                            </div>
                            {d.estado === 'programado' && (confirmaciones[d.id] || []).length > 0 && (
                              <ConfirmacionTecnicos items={confirmaciones[d.id]} className="mt-1.5" />
                            )}
                          </div>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}

      {/* Editar o crear plantilla */}
      {(plantillaEditando || creandoPlantilla) && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-3">{creandoPlantilla ? 'Nueva plantilla' : 'Editar plantilla'}</p>

            <label className="text-[13px] text-ink/75 block mb-1.5">Nombre</label>
            <input
              value={nombreEdit}
              onChange={(e) => setNombreEdit(e.target.value)}
              className="w-full px-3 min-h-[48px] mb-4 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px]"
            />

            <label className="text-[13px] text-ink/75 block mb-1.5">Renglones</label>
            {itemsEdit.map((it, i) => (
              <div key={i} className="mb-2.5 p-3 rounded-xl bg-surface-2 border border-line">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={it.cantidad}
                    onChange={(e) => setItemsEdit((prev) => prev.map((x, idx) => (idx === i ? { ...x, cantidad: parseFloat(e.target.value) || 0 } : x)))}
                    className="w-[70px] shrink-0 px-2.5 min-h-[46px] rounded-xl bg-surface border border-line text-[14.5px]"
                  />
                  <select
                    value={UNIDADES.includes(it.unidad) ? it.unidad : '__otra'}
                    onChange={(e) => setItemsEdit((prev) => prev.map((x, idx) => (idx === i ? { ...x, unidad: e.target.value === '__otra' ? '' : e.target.value } : x)))}
                    className="w-[92px] shrink-0 px-2 min-h-[46px] rounded-xl bg-surface border border-line text-[14.5px]"
                  >
                    {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                    <option value="__otra">Otra…</option>
                  </select>
                  <select
                    value={it.categoria}
                    onChange={(e) => setItemsEdit((prev) => prev.map((x, idx) => (idx === i ? { ...x, categoria: e.target.value as CategoriaInsumo } : x)))}
                    className="flex-1 min-w-0 px-2 min-h-[46px] rounded-xl bg-surface border border-line text-[14.5px]"
                  >
                    {CATEGORIAS.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
                  </select>
                  <button
                    onClick={() => setItemsEdit((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Quitar renglón"
                    className="text-red w-11 h-11 flex items-center justify-center shrink-0"
                  >
                    <X size={19} strokeWidth={2.6} />
                  </button>
                </div>
                <input
                  value={it.descripcion}
                  onChange={(e) => setItemsEdit((prev) => prev.map((x, idx) => (idx === i ? { ...x, descripcion: e.target.value } : x)))}
                  placeholder="Qué es"
                  className="w-full px-3 min-h-[46px] rounded-xl bg-surface border border-line text-[14.5px]"
                />
              </div>
            ))}

            <button
              onClick={() => setItemsEdit((prev) => [...prev, { categoria: 'herramienta', descripcion: '', cantidad: 1, unidad: 'pza' }])}
              className="w-full text-teal text-[14.5px] font-medium min-h-[46px] flex items-center justify-center gap-1.5 border border-dashed border-teal/50 rounded-xl mb-4"
            >
              <Plus size={17} strokeWidth={2.6} />
              Agregar renglón
            </button>

            <div className="flex gap-2">
              <button onClick={cerrarModalPlantilla} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium">
                Cancelar
              </button>
              <button onClick={handleGuardarEdicionPlantilla} className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold">
                {creandoPlantilla ? 'Crear plantilla' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nueva lista de carga para un proyecto que todavía no tiene una */}
      {mostrarNuevaLista && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="glass-strong rounded-3xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto">
            <p className="font-display font-semibold text-[16px] mb-3">Nueva lista de carga</p>

            <label className="text-[13px] text-ink/75 block mb-1.5">Proyecto</label>
            <select
              value={grupoNuevaLista}
              onChange={(e) => setGrupoNuevaLista(e.target.value)}
              className="w-full px-3 min-h-[48px] mb-4 rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[15px]"
            >
              {gruposSinChecklist.map((g) => <option key={g.grupoId} value={g.grupoId}>{g.proyecto}</option>)}
            </select>

            <label className="text-[13px] text-ink/75 block mb-1.5">Herramienta, material y equipo</label>
            {plantillas.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const pl = plantillas.find((x) => x.id === e.target.value);
                  if (pl) setInsumosNuevaLista((prev) => [...prev.filter((x) => x.descripcion.trim()), ...pl.items]);
                }}
                className="w-full px-3 min-h-[46px] mb-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[14.5px]"
              >
                <option value="">Cargar una plantilla…</option>
                {plantillas.map((pl) => <option key={pl.id} value={pl.id}>{pl.nombre} ({pl.items.length})</option>)}
              </select>
            )}

            {insumosNuevaLista.map((it, i) => (
              <div key={i} className="mb-2.5 p-3 rounded-xl bg-surface-2 border border-line">
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <SelectorArticulo
                      valor={it.articuloId || null}
                      cantidadPedida={it.cantidad}
                      onChange={(a) =>
                        setInsumosNuevaLista((prev) =>
                          prev.map((x, idx) =>
                            idx === i
                              ? a
                                ? { ...x, articuloId: a.id, descripcion: a.descripcion, unidad: a.unidad, categoria: a.categoria }
                                : { ...x, articuloId: null }
                              : x
                          )
                        )
                      }
                    />
                  </div>
                  <button
                    onClick={() => setInsumosNuevaLista((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Quitar de la lista"
                    className="text-red w-11 h-11 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
                  >
                    <X size={19} strokeWidth={2.6} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-muted shrink-0">Cantidad</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={it.cantidad}
                    onChange={(e) => setInsumosNuevaLista((prev) => prev.map((x, idx) => (idx === i ? { ...x, cantidad: parseFloat(e.target.value) || 0 } : x)))}
                    className="w-[90px] shrink-0 px-2.5 min-h-[46px] rounded-xl bg-surface border border-line focus:border-teal focus:outline-none text-[14.5px]"
                  />
                  <span className="text-[14px] text-muted">{it.unidad || 'pza'}</span>
                </div>
              </div>
            ))}

            <button
              onClick={() => setInsumosNuevaLista((prev) => [...prev, { categoria: 'herramienta', descripcion: '', cantidad: 1, unidad: 'pza', articuloId: null }])}
              className="w-full text-teal text-[14.5px] font-medium min-h-[46px] flex items-center justify-center gap-1.5 border border-dashed border-teal/50 rounded-xl mb-4"
            >
              <Plus size={17} strokeWidth={2.6} />
              Agregar herramienta o material
            </button>

            <div className="flex gap-2">
              <button onClick={() => setMostrarNuevaLista(false)} className="flex-1 min-h-[48px] rounded-xl border border-line-strong text-ink/80 text-[14.5px] font-medium">
                Cancelar
              </button>
              <button onClick={handleGuardarNuevaLista} disabled={guardandoNuevaLista} className="flex-1 min-h-[48px] rounded-xl bg-teal text-inkOnAccent text-[14.5px] font-semibold disabled:opacity-60">
                {guardandoNuevaLista ? 'Guardando...' : 'Crear lista'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SupervisorShell>
  );
}
