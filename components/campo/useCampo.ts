'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePerfiles } from '@/lib/perfiles';
import { useEnVivo } from '@/lib/useEnVivo';
import { fechaLocal, hoyLocal, sumarDias } from '@/lib/fechaHoy';
import {
  COLOR_ACTUAL, COLOR_ESTADO, COLOR_FALTA, COLOR_RECORRIDO, agruparCercanas, alertasDelTecnico, avanceDelDia, estadoTecnico, kmRecorridos,
  metrosPorPixel, paradasDelDia, posicionEn, rutaFaltante, servicioActual, serviciosDe, siguienteServicio, tiemposDelDia, tramosDeRuta, ultimaVez,
  type Alerta, type EstadoTecnico, type ParadaCampo, type Punto, type ReporteCampo, type ServicioCampo,
} from '@/lib/campo';
import { DIAS_HISTORIAL, estadoSenal, recorridoDelDia, ultimasUbicacionesDelDia, ultimasUbicacionesHoy, type PuntoRecorrido, type UltimaUbicacion } from '@/lib/ubicacionTecnicos';
import { clientesConLevantamiento, reportesDelDia, serviciosDelDia, telefonos, ultimosPuntosConocidos } from '@/lib/campoDatos';
import { lugaresConocidos } from '@/lib/visitasDatos';
import type { LugarConocido } from '@/lib/visitas';
import { LLAVE_GOOGLE_MAPS, crearMotorBasico, crearMotorGoogle, type MarcaMapa, type MotorMapa, type RutaMapa, type TipoMotor } from '@/components/servicios/motorMapa';
import { htmlGrupo, htmlLugar, htmlPin, htmlVisitas, hora, type MarcaDelDia } from './htmlMapa';

// Todo lo del mapa de técnicos en campo, para los dos mapas (Resumen y
// Servicios → Mapa): el día que se ve, el rastreo de cada técnico, sus
// servicios y reportes, y lo que se dibuja (pines, rutas por tramos, paradas
// numeradas, lugares propios, el marcador del reproductor y las visitas del
// buscador). Quien lo usa pone `contenedorRef` en el div del mapa.

export type InfoTecnico = {
  id: string;
  nombre: string;
  ultimo: UltimaUbicacion | null;
  // Último punto de cualquier día (para «última vez visto», batería y GPS).
  conocido: UltimaUbicacion | null;
  recorrido: PuntoRecorrido[];
  servicios: ServicioCampo[];
  actual: ServicioCampo | null;
  siguiente: ServicioCampo | null;
  avance: { hechos: number; total: number };
  estado: EstadoTecnico;
  paradas: ParadaCampo[];
  alertas: Alerta[];
  km: number;
  tiempos: { enSitio: number; enRuta: number };
  reportes: number;
  enLinea: boolean;
  telefono: string | null;
};

export type VisitasEnMapa = { cliente: string; lugares: { lat: number; lng: number }[]; filas: { fecha: string; texto: string; enlaces: { texto: string; href: string }[] }[] } | null;

const CLAVE_PREFERENCIA = 'mapaTecnicosMotor';
const HORA_FIN_JORNADA = 18 * 60 + 30;

function preferenciaGuardada(): TipoMotor {
  if (!LLAVE_GOOGLE_MAPS) return 'basico';
  try {
    if (localStorage.getItem(CLAVE_PREFERENCIA) === 'basico') return 'basico';
  } catch { /* sin almacenamiento: Google */ }
  return 'google';
}

function limitesDelDia(dia: string): [string, string] {
  return [fechaLocal(dia).toISOString(), fechaLocal(sumarDias(dia, 1)).toISOString()];
}

// ¿Ya terminó su día? Un día pasado, sí. Hoy, después de la salida y sin puntos hace 15 min.
function termino(ultimo: UltimaUbicacion | null, esHoy: boolean, ahora: number): boolean {
  if (!ultimo) return false;
  if (!esHoy) return true;
  const fecha = new Date(ahora);
  if (fecha.getHours() * 60 + fecha.getMinutes() < HORA_FIN_JORNADA) return false;
  return estadoSenal(ultimo.registrado_en, ahora) === 'sin_senal';
}

export function useCampo({ conConocidos = false }: { conConocidos?: boolean } = {}) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const motorRef = useRef<MotorMapa | null>(null);
  const colaRef = useRef<Promise<void>>(Promise.resolve());
  const perfiles = usePerfiles();

  const [motor, setMotor] = useState<TipoMotor | null>(null);
  const [version, setVersion] = useState(0);
  const [zoomVersion, setZoomVersion] = useState(0);
  const [fecha, setFecha] = useState<string | null>(null);
  const [hoy, setHoy] = useState<string | null>(null);
  const esHoy = fecha !== null && fecha === hoy;
  const [ahora, setAhora] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ultimos, setUltimos] = useState<UltimaUbicacion[]>([]);
  const [recorridos, setRecorridos] = useState<Record<string, PuntoRecorrido[]>>({});
  const [servicios, setServicios] = useState<ServicioCampo[]>([]);
  const [reportes, setReportes] = useState<ReporteCampo[]>([]);
  const [levantamientos, setLevantamientos] = useState<Set<string>>(new Set());
  const [lugares, setLugares] = useState<LugarConocido[]>([]);
  const [tels, setTels] = useState<Record<string, string>>({});
  const [conocidos, setConocidos] = useState<UltimaUbicacion[]>([]);
  const [verConocidos, setVerConocidos] = useState(false);

  const [elegido, setElegido] = useState<string | null>(null);
  // Reproductor: la hora que se ve (null = el final, o «ahora»).
  const [tiempo, setTiempo] = useState<number | null>(null);
  const [visitas, setVisitas] = useState<VisitasEnMapa>(null);
  const pedidoRef = useRef(0);
  const encuadradoRef = useRef<string>('');

  // ---------- Carga ----------

  async function cargar(dia: string | null = fecha, silencioso = false) {
    if (!dia) return;
    const pedido = ++pedidoRef.current;
    if (!silencioso) setCargando(true);
    try {
      const [desde, hasta] = limitesDelDia(dia);
      const [lista, delDia, reps, levs] = await Promise.all([
        dia === hoyLocal() ? ultimasUbicacionesHoy() : ultimasUbicacionesDelDia(desde, hasta),
        serviciosDelDia(dia),
        reportesDelDia(dia),
        // Sin levantamientos el mapa sigue (la parada solo diría «sin reporte»).
        clientesConLevantamiento(dia).catch((e) => { console.error('Levantamientos del día:', e?.message); return new Set<string>(); }),
      ]);
      // Un recorrido por técnico con rastreo ese día (son pocos: uno por teléfono de la empresa).
      const rutas = await Promise.all(lista.map((t) => recorridoDelDia(t.tecnico_id, desde, hasta)));
      if (pedido !== pedidoRef.current) return;
      const nuevos: Record<string, PuntoRecorrido[]> = {};
      lista.forEach((t, i) => { nuevos[t.tecnico_id] = rutas[i]; });
      setUltimos(lista);
      setRecorridos(nuevos);
      setServicios(delDia);
      setReportes(reps);
      setLevantamientos(levs);
      setError(null);
    } catch (e: any) {
      if (pedido === pedidoRef.current) setError(e?.message || 'No se pudo cargar el mapa.');
    } finally {
      if (pedido === pedidoRef.current) {
        setCargando(false);
        setAhora(Date.now());
      }
    }
  }

  useEffect(() => {
    const dia = hoyLocal();
    setHoy(dia);
    setFecha(dia);
    setMotor(preferenciaGuardada());
    // Lugares de clientes y de la empresa: para nombrar las paradas. Sin ellos el mapa sigue.
    lugaresConocidos().then(setLugares).catch((e) => console.error('Lugares del mapa:', e?.message));
  }, []);

  useEffect(() => {
    if (!fecha) return;
    setTiempo(null);
    encuadradoRef.current = '';
    cargar(fecha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  // Última ubicación conocida de cada técnico (Servicios → Mapa, o al pedirla).
  useEffect(() => {
    if (!conConocidos && !verConocidos) return;
    ultimosPuntosConocidos().then(setConocidos).catch((e) => console.error('Últimas ubicaciones:', e?.message));
  }, [conConocidos, verConocidos]);

  // Solo hoy se actualiza solo.
  useEnVivo({ tablas: ['ubicaciones_tecnicos', 'servicios_programados'], alCambiar: () => { if (esHoy) cargar(fecha, true); }, cadaMs: 60000 });

  // ---------- Técnicos ----------

  const ids = useMemo(() => {
    const todos = new Set<string>(ultimos.map((u) => u.tecnico_id));
    for (const s of servicios) for (const t of s.tecnicoIds) todos.add(t);
    if (conConocidos) for (const c of conocidos) todos.add(c.tecnico_id);
    // Supervisión no se rastrea ni sale en la lista.
    return [...todos].filter((id) => perfiles[id]?.role !== 'supervisor');
  }, [ultimos, servicios, conocidos, conConocidos, perfiles]);

  useEffect(() => {
    if (ids.length === 0) return;
    telefonos(ids).then(setTels).catch((e) => console.error('Teléfonos:', e?.message));
  }, [ids.join(',')]);

  const infos: InfoTecnico[] = useMemo(() => {
    if (ahora === null) return [];
    return ids.map((id) => {
      const ultimo = ultimos.find((u) => u.tecnico_id === id) || null;
      const conocido = conocidos.find((c) => c.tecnico_id === id) || ultimo;
      const recorrido = recorridos[id] || [];
      const suyos = serviciosDe(id, servicios);
      const nombre = ultimo?.nombre || conocido?.nombre || perfiles[id]?.full_name || 'Técnico';
      const misReportes = reportes.filter((r) => r.created_by === id || r.personal.includes(nombre));
      const paradas = paradasDelDia(recorrido, lugares, suyos, misReportes, esHoy, ahora, levantamientos);
      const posicion: Punto | null = ultimo ? [ultimo.lat, ultimo.lng] : null;
      return {
        id, nombre, ultimo, conocido, recorrido, servicios: suyos,
        actual: servicioActual(suyos), siguiente: siguienteServicio(suyos), avance: avanceDelDia(suyos),
        estado: estadoTecnico(suyos, recorrido.length > 0, termino(ultimo, esHoy, ahora)),
        paradas, alertas: alertasDelTecnico(paradas, suyos, posicion, esHoy),
        km: kmRecorridos(recorrido), tiempos: tiemposDelDia(recorrido, paradas), reportes: misReportes.length,
        enLinea: esHoy && Boolean(ultimo) && estadoSenal(ultimo!.registrado_en, ahora) === 'en_linea',
        telefono: tels[id] || null,
      };
    }).sort((a, b) => Number(b.recorrido.length > 0) - Number(a.recorrido.length > 0) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [ids, ultimos, conocidos, recorridos, servicios, reportes, levantamientos, lugares, perfiles, tels, esHoy, ahora]);

  const info = infos.find((t) => t.id === elegido) || null;

  // ---------- El mapa ----------

  useEffect(() => {
    const div = contenedorRef.current;
    if (!motor || !div) return;
    let cancelado = false;
    async function crear() {
      let nuevo: MotorMapa;
      if (motor === 'google') {
        try {
          nuevo = await crearMotorGoogle(div!, false, () => setMotor('basico'));
        } catch (e) {
          console.error('Mapa: Google Maps no cargó, se usa el mapa básico', e);
          if (!cancelado) setMotor('basico');
          return;
        }
      } else {
        nuevo = await crearMotorBasico(div!, false);
      }
      if (cancelado) {
        nuevo.destruir();
        return;
      }
      nuevo.alCambiarZoom(() => setZoomVersion((v) => v + 1));
      motorRef.current = nuevo;
      encuadradoRef.current = '';
      setVersion((v) => v + 1);
    }
    // Uno tras otro: Leaflet falla si dos mapas toman el mismo div a la vez.
    colaRef.current = colaRef.current.then(crear).catch((e) => console.error('Mapa: no se pudo dibujar', e));
    return () => {
      cancelado = true;
      colaRef.current = colaRef.current.then(() => {
        motorRef.current?.destruir();
        motorRef.current = null;
      });
    };
  }, [motor]);

  useEffect(() => {
    const div = contenedorRef.current;
    if (!div) return;
    const observador = new ResizeObserver(() => motorRef.current?.ajustarTamano());
    observador.observe(div);
    return () => observador.disconnect();
  }, []);

  // Pines: uno por técnico con rastreo ese día (y, si se pide, la última ubicación conocida en gris).
  useEffect(() => {
    const mapa = motorRef.current;
    if (!mapa || ahora === null) return;
    const pines = infos.filter((t) => t.ultimo).map((t) => ({
      id: t.id,
      lat: t.ultimo!.lat,
      lng: t.ultimo!.lng,
      titulo: `${t.nombre} · ${hora(t.ultimo!.registrado_en)}`,
      html: htmlPin({
        nombre: t.nombre, perfil: perfiles[t.id], color: COLOR_ESTADO[t.estado], etiqueta: `${t.nombre} · ${hora(t.ultimo!.registrado_en)}`,
        elegido: elegido === t.id, atenuado: elegido !== null && elegido !== t.id, enLinea: t.enLinea,
      }),
    }));
    // La última ubicación conocida (en gris) solo tiene sentido viendo hoy.
    if (verConocidos && esHoy) {
      for (const c of conocidos) {
        if (infos.some((t) => t.id === c.tecnico_id && t.ultimo)) continue;
        const nombre = c.nombre || 'Técnico';
        pines.push({
          id: c.tecnico_id, lat: c.lat, lng: c.lng, titulo: `${nombre}, última vez ${ultimaVez(c.registrado_en, ahora)}`,
          html: htmlPin({ nombre, perfil: perfiles[c.tecnico_id], color: '#64748b', etiqueta: `${nombre.split(' ')[0]}, última vez ${ultimaVez(c.registrado_en, ahora)}`, elegido: false, atenuado: false, enLinea: false, gris: true }),
        });
      }
    }
    mapa.ponerPines(pines, (id) => elegir(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, infos, elegido, perfiles, verConocidos, conocidos, ahora, esHoy]);

  // Rutas: el elegido por tramos (verde lo recorrido, azul el tramo actual,
  // gris punteado lo que falta); los demás, atenuados. Sin elegido, todas en azul suave.
  useEffect(() => {
    const mapa = motorRef.current;
    if (!mapa) return;
    const rutas: RutaMapa[] = [];
    for (const t of infos) {
      if (t.recorrido.length < 2) continue;
      if (t.id === elegido) continue;
      rutas.push({ puntos: t.recorrido.map((p) => [p.lat, p.lng] as Punto), color: COLOR_ACTUAL, opacidad: elegido ? 0.22 : 0.55, grosor: elegido ? 3 : 3.5 });
    }
    if (info) {
      const { hecho, actual } = tramosDeRuta(info.recorrido, info.paradas, esHoy);
      rutas.push({ puntos: hecho, color: COLOR_RECORRIDO, grosor: 5 });
      if (actual.length >= 2) rutas.push({ puntos: actual, color: COLOR_ACTUAL, grosor: 5.5 });
      if (esHoy) {
        const posicion: Punto | null = info.ultimo ? [info.ultimo.lat, info.ultimo.lng] : null;
        const falta = rutaFaltante(posicion, info.servicios);
        if (falta.length >= 2) rutas.push({ puntos: falta, color: COLOR_FALTA, punteada: true, grosor: 4.5 });
      }
    }
    mapa.ponerRutas(rutas);
  }, [version, infos, info, elegido, esHoy]);

  // Marcas: paradas numeradas del elegido (con inicio y fin), agrupadas si se
  // enciman; lugares de la empresa; servicios pendientes; visitas del buscador.
  useEffect(() => {
    const mapa = motorRef.current;
    if (!mapa || ahora === null) return;
    const marcas: MarcaMapa[] = [];
    for (const l of lugares) {
      if (l.propio) marcas.push({ lat: l.lat, lng: l.lng, html: htmlLugar(l.cliente, 'propio', 'Lugar de la empresa') });
    }
    if (info) {
      const delDia: MarcaDelDia[] = [];
      const primero = info.recorrido[0];
      const ultimo = info.recorrido[info.recorrido.length - 1];
      if (primero) delDia.push({ tipo: 'inicio', lat: primero.lat, lng: primero.lng, hora: primero.registrado_en, nombre: info.nombre });
      for (const p of info.paradas) delDia.push({ tipo: 'parada', lat: p.lat, lng: p.lng, parada: p });
      if (ultimo && info.recorrido.length > 1 && info.estado === 'terminado') delDia.push({ tipo: 'fin', lat: ultimo.lat, lng: ultimo.lng, hora: ultimo.registrado_en, nombre: info.nombre });
      const lat = primero?.lat ?? 20.67;
      for (const grupo of agruparCercanas(delDia, metrosPorPixel(mapa.zoom(), lat))) {
        const centro = grupo[0];
        marcas.push({ lat: centro.lat, lng: centro.lng, html: htmlGrupo(grupo) });
      }
      if (esHoy) {
        for (const s of info.servicios) {
          if (s.estado === 'programado' && s.ubicacion) {
            marcas.push({ lat: s.ubicacion.lat, lng: s.ubicacion.lng, html: htmlLugar(s.proyecto, 'pendiente', `Pendiente${s.hora_programada ? ` · ${s.hora_programada}` : ''}`) });
          }
        }
      }
    }
    if (visitas) {
      for (const l of visitas.lugares) marcas.push({ lat: l.lat, lng: l.lng, html: htmlVisitas(visitas.cliente, visitas.filas) });
    }
    mapa.ponerMarcas(marcas);
  }, [version, zoomVersion, info, lugares, visitas, esHoy, ahora]);

  // Marcador del reproductor: dónde iba a esa hora.
  useEffect(() => {
    const mapa = motorRef.current;
    if (!mapa) return;
    const punto = info && tiempo !== null ? posicionEn(info.recorrido, tiempo) : null;
    mapa.ponerCursor(punto, punto && info ? htmlPin({
      nombre: info.nombre, perfil: perfiles[info.id], color: COLOR_ACTUAL, etiqueta: new Date(tiempo!).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }),
      elegido: true, atenuado: false, enLinea: false,
    }) : '');
  }, [version, info, tiempo, perfiles]);

  // Encuadre: una vez por día o por técnico elegido (no en cada punto nuevo).
  useEffect(() => {
    const mapa = motorRef.current;
    if (!mapa || ahora === null) return;
    const clave = `${version}|${fecha}|${elegido || ''}|${visitas ? visitas.cliente : ''}`;
    if (encuadradoRef.current === clave) return;
    let puntos: Punto[] = [];
    if (visitas) puntos = visitas.lugares.map((l) => [l.lat, l.lng] as Punto);
    else if (info && info.recorrido.length > 0) puntos = info.recorrido.map((p) => [p.lat, p.lng] as Punto);
    else if (info?.ultimo) puntos = [[info.ultimo.lat, info.ultimo.lng]];
    else puntos = infos.filter((t) => t.ultimo).map((t) => [t.ultimo!.lat, t.ultimo!.lng] as Punto);
    if (puntos.length === 0) return;
    encuadradoRef.current = clave;
    mapa.encuadrar(puntos);
  }, [version, ahora, fecha, elegido, info, infos, visitas]);

  // ---------- Acciones ----------

  function elegir(id: string | null) {
    setTiempo(null);
    setElegido((actual) => (actual === id ? null : id));
  }

  function encuadrarTodos() {
    encuadradoRef.current = '';
    setElegido(null);
    const puntos = infos.filter((t) => t.ultimo).map((t) => [t.ultimo!.lat, t.ultimo!.lng] as Punto);
    if (puntos.length > 0) motorRef.current?.encuadrar(puntos);
  }

  function cambiarMotor() {
    const siguiente: TipoMotor = motor === 'google' ? 'basico' : 'google';
    try { localStorage.setItem(CLAVE_PREFERENCIA, siguiente); } catch { /* no crítico */ }
    setMotor(siguiente);
  }

  const fechaMinima = hoy ? sumarDias(hoy, -(DIAS_HISTORIAL - 1)) : null;
  function irADia(dia: string) {
    if (!hoy || !fechaMinima || dia > hoy || dia < fechaMinima) return;
    setVisitas(null);
    setFecha(dia);
  }

  // Desde el buscador: ese día y ese técnico. false si el día ya no tiene rastreo.
  function verDia(dia: string, tecnicoIds: string[]): boolean {
    if (!hoy || !fechaMinima || dia > hoy || dia < fechaMinima) return false;
    setVisitas(null);
    setElegido(tecnicoIds[0] || null);
    if (dia !== fecha) setFecha(dia);
    return true;
  }

  return {
    contenedorRef, infos, info, elegido, elegir, encuadrarTodos, error, cargando, ahora,
    motor, hayGoogle: LLAVE_GOOGLE_MAPS !== '', cambiarMotor,
    fecha, hoy, esHoy, fechaMinima, irADia, verDia,
    tiempo, setTiempo, servicios, verConocidos, setVerConocidos, conocidos, visitas, setVisitas, lugares,
  };
}
