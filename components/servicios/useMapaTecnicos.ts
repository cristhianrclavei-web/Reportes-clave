'use client';

import { useEffect, useRef, useState } from 'react';
import { EstadoSenal, PuntoRecorrido, UltimaUbicacion, estadoSenal, marcasDelRecorrido, minutosEnElLugar, MINUTOS_ENTRE_MARCAS, recorridoDelDia, ultimasUbicacionesDelDia, ultimasUbicacionesHoy, DIAS_HISTORIAL } from '@/lib/ubicacionTecnicos';
import { useEnVivo } from '@/lib/useEnVivo';
import { fechaLocal, hoyLocal, sumarDias } from '@/lib/fechaHoy';
import { LLAVE_GOOGLE_MAPS, MarcaMapa, MotorMapa, PinMapa, Punto, RutaMapa, crearMotorBasico, crearMotorGoogle } from './motorMapa';

// Lo que comparten el mapa de Servicios → Mapa y la tarjeta del Resumen:
// carga las últimas ubicaciones (y se actualiza sola), dibuja el mapa
// (Google Maps o el básico, ver motorMapa.ts) con un pin por técnico y, al elegir uno, su recorrido de hoy.
// Quien lo usa pone `contenedorRef` en el div del mapa y arma lo demás.

export const COLOR_SENAL: Record<EstadoSenal, string> = { en_linea: '#16a34a', reciente: '#d97706', sin_senal: '#6b7280' };
export const TEXTO_SENAL: Record<EstadoSenal, string> = { en_linea: 'En línea', reciente: 'Hace unos minutos', sin_senal: 'Sin señal' };

export function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export function inicialesTecnico(nombre: string | null): string {
  // Solo letras y números: el texto va dentro del HTML del pin.
  const limpio = (nombre || '').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  const partes = limpio.split(/\s+/).filter(Boolean).slice(0, 2);
  if (partes.length === 0) return '?';
  return partes.map((p) => p[0]).join('').toUpperCase();
}

// Qué mapa prefiere quien lo ve (se recuerda en este aparato).
const CLAVE_PREFERENCIA = 'mapaTecnicosMotor';
export type TipoMotor = 'google' | 'basico';

function preferenciaGuardada(): TipoMotor {
  if (!LLAVE_GOOGLE_MAPS) return 'basico';
  try {
    if (localStorage.getItem(CLAVE_PREFERENCIA) === 'basico') return 'basico';
  } catch { /* sin almacenamiento: Google */ }
  return 'google';
}

// Días pasados: ya no hay «señal», el pin va de un solo color.
export const COLOR_HISTORIAL = '#2563eb';

// Se pueden ver hasta 3 recorridos a la vez; cada técnico elegido toma el
// primer color libre (azul, naranja, morado) y lo conserva mientras siga elegido.
export const MAX_ELEGIDOS = 3;
export const COLORES_RUTA = ['#2563eb', '#ea580c', '#9333ea'];

// HTML del pin (clases .pin-tec en globals.css): las iniciales con el color
// de su señal; si está en línea, un halo que late. El elegido se agranda y
// muestra su nombre y la hora de su último punto (también al pasar el mouse).
function htmlPin(t: UltimaUbicacion, estado: EstadoSenal | null, colorRuta: string | null): string {
  // Hoy el relleno dice la señal; en un día pasado no hay señal, así que el
  // elegido se rellena con el color de su recorrido.
  let color = estado ? COLOR_SENAL[estado] : COLOR_HISTORIAL;
  if (!estado && colorRuta) color = colorRuta;
  const clases = ['pin-tec'];
  if (colorRuta) clases.push('elegido');
  if (estado === 'sin_senal') clases.push('apagado');
  const halo = estado === 'en_linea' ? '<span class="pin-tec-halo"></span>' : '';
  const nombre = sinEtiquetas(`${t.nombre || 'Técnico'} · ${horaCorta(t.registrado_en)}`);
  const estilo = colorRuta ? `--color-pin:${color};--color-ruta:${colorRuta}` : `--color-pin:${color}`;
  return `<div class="${clases.join(' ')}" style="${estilo}">${halo}`
    + `<div class="pin-tec-cara">${inicialesTecnico(t.nombre)}</div>`
    + `<div class="pin-tec-nombre">${nombre}</div></div>`;
}

// Texto seguro para meterlo en el HTML de la marca.
function sinEtiquetas(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Marca del recorrido (cada 10 minutos). Tres formas, para no saturar:
//  · inicio: etiqueta verde «Inicio · 8:02 a.m.» en el primer punto del día;
//  · hora en punto: etiqueta «9 a.m.»;
//  · las demás: solo un punto.
// Al pasar el mouse o tocarla, la tarjeta con hora exacta, fecha, cuánto
// tiempo se quedó ahí (si fueron 5 min o más) y coordenadas.
type TipoMarca = 'inicio' | 'hora' | 'punto' | 'fin';
function htmlMarcaHora(p: PuntoRecorrido, nombre: string | null, tipo: TipoMarca, minutosAqui: number, colorRuta: string): string {
  const fecha = new Date(p.registrado_en);
  // La etiqueta dice a qué tramo pertenece la marca («9 a.m.», «9:10 a.m.»…).
  const inicioTramo = new Date(fecha);
  inicioTramo.setMinutes(Math.floor(fecha.getMinutes() / MINUTOS_ENTRE_MARCAS) * MINUTOS_ENTRE_MARCAS);
  const opciones: Intl.DateTimeFormatOptions = inicioTramo.getMinutes() === 0
    ? { hour: 'numeric' }
    : { hour: 'numeric', minute: '2-digit' };
  const etiqueta = inicioTramo.toLocaleTimeString('es-MX', opciones);
  const hora = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const diaLargo = fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dia = diaLargo.charAt(0).toUpperCase() + diaLargo.slice(1);
  const coordenadas = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  const estancia = minutosAqui >= 5 ? `<em>Estuvo aquí ~${duracionCorta(minutosAqui)}</em>` : '';
  const detalle = `<div class="marca-hora-detalle"><b>${sinEtiquetas(hora)}</b><small>${sinEtiquetas(dia)}</small>`
    + `${estancia}<code>${coordenadas}</code><i>${sinEtiquetas(nombre || 'Técnico')}</i></div>`;
  let figura = '<div class="marca-hora-punto"></div>';
  if (tipo === 'hora') figura = `<div class="marca-hora-etiqueta">${sinEtiquetas(etiqueta)}</div><div class="marca-hora-pico"></div>`;
  if (tipo === 'inicio') figura = `<div class="marca-hora-etiqueta">Inicio · ${sinEtiquetas(hora)}</div><div class="marca-hora-pico"></div>`;
  if (tipo === 'fin') figura = `<div class="marca-hora-etiqueta">Fin · ${sinEtiquetas(hora)}</div><div class="marca-hora-pico"></div>`;
  return `<div class="marca-hora ${tipo}" style="--color-ruta:${colorRuta}" role="button" aria-label="${sinEtiquetas(`${hora}, ${coordenadas}`)}">${detalle}${figura}</div>`;
}

// ¿Ya terminó el recorrido del día? Un día pasado, sí. Hoy, solo después
// de la salida (6:30 p.m.) y si el teléfono ya dejó de mandar puntos (más de
// 15 min): así no sale «Fin» mientras alguien sigue con horas extra.
const HORA_FIN_JORNADA = 18 * 60 + 30;
function terminoElRecorrido(ultimo: PuntoRecorrido, esHoy: boolean, ahoraMs: number): boolean {
  if (!esHoy) return true;
  const ahora = new Date(ahoraMs);
  const minutosDelDia = ahora.getHours() * 60 + ahora.getMinutes();
  if (minutosDelDia < HORA_FIN_JORNADA) return false;
  return estadoSenal(ultimo.registrado_en, ahoraMs) === 'sin_senal';
}

// «25 min», «1 h 20 min».
function duracionCorta(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

// Las marcas de un recorrido: inicio, horas en punto, puntos cada 10 min y fin.
// Con varios recorridos a la vez (`horasConEtiqueta` en false) las horas en
// punto también van como punto: solo «Inicio» y «Fin» llevan etiqueta, para
// que no se encimen. La hora se ve al tocar o pasar el mouse.
function marcasDeRecorrido(recorrido: PuntoRecorrido[], nombre: string | null, color: string, esHoy: boolean, ahora: number | null, horasConEtiqueta: boolean): MarcaMapa[] {
  const marcas: MarcaMapa[] = marcasDelRecorrido(recorrido).map((p, i) => {
    let tipo: TipoMarca = 'punto';
    if (i === 0) tipo = 'inicio';
    else if (horasConEtiqueta && new Date(p.registrado_en).getMinutes() < MINUTOS_ENTRE_MARCAS) tipo = 'hora';
    const minutosAqui = minutosEnElLugar(recorrido, recorrido.indexOf(p));
    return { lat: p.lat, lng: p.lng, html: htmlMarcaHora(p, nombre, tipo, minutosAqui, color) };
  });
  const ultimo = recorrido[recorrido.length - 1];
  if (recorrido.length >= 2 && ahora !== null && terminoElRecorrido(ultimo, esHoy, ahora)) {
    marcas.push({ lat: ultimo.lat, lng: ultimo.lng, html: htmlMarcaHora(ultimo, nombre, 'fin', 0, color) });
  }
  return marcas;
}

export function useMapaTecnicos({ zoomControl = true }: { zoomControl?: boolean } = {}) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const motorRef = useRef<MotorMapa | null>(null);
  const yaEncuadreRef = useRef(false);
  // Crear y destruir mapas uno tras otro: React monta el efecto dos veces en
  // desarrollo y Leaflet falla si dos mapas toman el mismo div a la vez.
  const colaRef = useRef<Promise<void>>(Promise.resolve());

  const [tecnicos, setTecnicos] = useState<UltimaUbicacion[]>([]);
  // Técnicos elegidos (hasta 3, en el orden en que se eligieron), su color y su recorrido del día.
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [colores, setColores] = useState<Record<string, string>>({});
  const [recorridos, setRecorridos] = useState<Record<string, PuntoRecorrido[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  // Hora de la última carga; null hasta montar (no se lee el reloj en el render).
  const [ahora, setAhora] = useState<number | null>(null);
  // null hasta montar: la preferencia vive en el navegador.
  const [motor, setMotor] = useState<TipoMotor | null>(null);
  // Cambia cada vez que se crea un mapa nuevo, para volver a dibujar todo.
  const [version, setVersion] = useState(0);
  // Día que se ve (YYYY-MM-DD) y el de hoy; null hasta montar (no se lee el
  // reloj en el render). Cambiar de día redibuja sobre el MISMO mapa: no
  // cuenta como otra carga de Google Maps.
  const [fecha, setFecha] = useState<string | null>(null);
  const [hoy, setHoy] = useState<string | null>(null);
  const esHoy = fecha !== null && fecha === hoy;
  // La carga más reciente gana si se cambia de día muy rápido.
  const pedidoRef = useRef(0);

  function limitesDelDia(dia: string): [string, string] {
    return [fechaLocal(dia).toISOString(), fechaLocal(sumarDias(dia, 1)).toISOString()];
  }

  async function cargar(dia: string | null = fecha) {
    if (!dia) return;
    const pedido = ++pedidoRef.current;
    try {
      let lista: UltimaUbicacion[];
      if (dia === hoyLocal()) {
        lista = await ultimasUbicacionesHoy();
      } else {
        const [desde, hasta] = limitesDelDia(dia);
        lista = await ultimasUbicacionesDelDia(desde, hasta);
      }
      if (pedido !== pedidoRef.current) return;
      setTecnicos(lista);
      setError(null);
    } catch (e: any) {
      if (pedido === pedidoRef.current) setError(e.message);
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
  }, []);
  useEffect(() => {
    if (!fecha) return;
    setCargando(true);
    yaEncuadreRef.current = false;
    cargar(fecha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);
  // Solo el día de hoy se actualiza solo; un día pasado ya no cambia.
  useEnVivo({ tablas: ['ubicaciones_tecnicos'], alCambiar: () => { if (esHoy) cargar(); }, cadaMs: 60000 });
  useEffect(() => { setMotor(preferenciaGuardada()); }, []);

  // El mapa se crea al montar y cada vez que se cambia entre Google y el
  // básico. Si Google no carga (llave, tope diario, sin señal), queda el básico.
  useEffect(() => {
    const div = contenedorRef.current;
    if (!motor || !div) return;
    let cancelado = false;

    async function crear() {
      let nuevo: MotorMapa;
      if (motor === 'google') {
        try {
          nuevo = await crearMotorGoogle(div!, zoomControl, () => setMotor('basico'));
        } catch (e) {
          console.error('Mapa: Google Maps no cargó, se usa el mapa básico', e);
          if (!cancelado) setMotor('basico');
          return;
        }
      } else {
        nuevo = await crearMotorBasico(div!, zoomControl);
      }
      if (cancelado) {
        nuevo.destruir();
        return;
      }
      motorRef.current = nuevo;
      yaEncuadreRef.current = false;
      setVersion((v) => v + 1);
    }
    colaRef.current = colaRef.current.then(crear).catch((e) => console.error('Mapa: no se pudo dibujar', e));

    return () => {
      cancelado = true;
      colaRef.current = colaRef.current.then(() => {
        motorRef.current?.destruir();
        motorRef.current = null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motor]);

  // Al ampliar o reducir el mapa (pantalla completa), el mapa básico necesita
  // volver a medir su caja; Google lo hace solo.
  useEffect(() => {
    const div = contenedorRef.current;
    if (!div) return;
    const observador = new ResizeObserver(() => motorRef.current?.ajustarTamano());
    observador.observe(div);
    return () => observador.disconnect();
  }, []);

  // Pines: uno por técnico, con sus iniciales y el color de su señal.
  useEffect(() => {
    const mapa = motorRef.current;
    if (!mapa || ahora === null) return;
    const pines: PinMapa[] = tecnicos.map((t) => ({
      id: t.tecnico_id,
      lat: t.lat,
      lng: t.lng,
      html: htmlPin(t, esHoy ? estadoSenal(t.registrado_en, ahora) : null, elegidos.includes(t.tecnico_id) ? colores[t.tecnico_id] : null),
      titulo: `${t.nombre || 'Técnico'} · ${horaCorta(t.registrado_en)}`,
    }));
    mapa.ponerPines(pines, (id) => {
      const t = tecnicos.find((x) => x.tecnico_id === id);
      if (t) enfocar(t);
    });
    if (!yaEncuadreRef.current && tecnicos.length > 0) {
      yaEncuadreRef.current = true;
      encuadrarTodos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, tecnicos, elegidos, colores, ahora, esHoy]);

  // Recorrido del día de cada técnico elegido (hoy se recarga con cada punto nuevo).
  useEffect(() => {
    if (!fecha) return;
    // Solo los que trabajaron ese día tienen recorrido.
    const conDatos = elegidos.filter((id) => tecnicos.some((t) => t.tecnico_id === id));
    if (conDatos.length === 0) {
      setRecorridos({});
      return;
    }
    const [desde, hasta] = limitesDelDia(fecha);
    Promise.all(conDatos.map((id) => recorridoDelDia(id, desde, hasta)))
      .then((listas) => {
        const nuevos: Record<string, PuntoRecorrido[]> = {};
        conDatos.forEach((id, i) => { nuevos[id] = listas[i]; });
        setRecorridos(nuevos);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegidos, tecnicos]);

  // Al elegir a alguien, el mapa encuadra los recorridos elegidos una sola
  // vez (no en cada punto nuevo, para no mover el mapa mientras se mira).
  const encuadradosRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const id of [...encuadradosRef.current]) {
      if (!elegidos.includes(id)) encuadradosRef.current.delete(id);
    }
    const nuevo = elegidos.find((id) => recorridos[id] && !encuadradosRef.current.has(id));
    if (nuevo) {
      encuadradosRef.current.add(nuevo);
      const todos = elegidos.flatMap((id) => (recorridos[id] || []).map((p) => [p.lat, p.lng] as Punto));
      if (todos.length >= 2) {
        motorRef.current?.encuadrar(todos);
      } else {
        const t = tecnicos.find((x) => x.tecnico_id === nuevo);
        if (t) motorRef.current?.centrar([t.lat, t.lng], 15);
      }
    }

    const rutas: RutaMapa[] = [];
    const marcas: MarcaMapa[] = [];
    for (const id of elegidos) {
      const recorrido = recorridos[id] || [];
      const color = colores[id] || COLORES_RUTA[0];
      rutas.push({ puntos: recorrido.map((p) => [p.lat, p.lng] as Punto), color });
      const nombre = tecnicos.find((t) => t.tecnico_id === id)?.nombre || null;
      marcas.push(...marcasDeRecorrido(recorrido, nombre, color, esHoy, ahora, elegidos.length === 1));
    }
    motorRef.current?.ponerRutas(rutas);
    motorRef.current?.ponerMarcas(marcas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, recorridos, elegidos, colores, esHoy, ahora]);

  function encuadrarTodos() {
    motorRef.current?.encuadrar(tecnicos.map((t) => [t.lat, t.lng] as Punto));
  }

  // Elegir o soltar a un técnico. Con 3 elegidos, el nuevo reemplaza al
  // primero que se eligió. Cada quien toma el primer color libre.
  function enfocar(t: UltimaUbicacion) {
    const id = t.tecnico_id;
    if (elegidos.includes(id)) {
      quitar(id);
      return;
    }
    let lista = [...elegidos];
    if (lista.length >= MAX_ELEGIDOS) lista = lista.slice(1);
    const usados = lista.map((x) => colores[x]);
    const libre = COLORES_RUTA.find((c) => !usados.includes(c)) || COLORES_RUTA[0];
    setColores((c) => ({ ...c, [id]: libre }));
    setElegidos([...lista, id]);
  }

  function quitar(id: string) {
    setElegidos((lista) => lista.filter((x) => x !== id));
  }

  // Botón «Google Maps / Mapa básico». Se recuerda en este aparato.
  function cambiarMotor() {
    const siguiente: TipoMotor = motor === 'google' ? 'basico' : 'google';
    try {
      localStorage.setItem(CLAVE_PREFERENCIA, siguiente);
    } catch { /* no crítico */ }
    setMotor(siguiente);
  }
  const hayGoogle = LLAVE_GOOGLE_MAPS !== '';

  // Historial: de hoy hacia atrás hasta 90 días.
  const fechaMinima = hoy ? sumarDias(hoy, -(DIAS_HISTORIAL - 1)) : null;
  function irADia(dia: string) {
    if (!hoy || !fechaMinima) return;
    if (dia > hoy || dia < fechaMinima) return;
    setFecha(dia);
  }

  return {
    contenedorRef, tecnicos, elegidos, colores, recorridos, error, cargando, ahora, enfocar, quitar, encuadrarTodos, motor, hayGoogle, cambiarMotor,
    fecha, hoy, esHoy, fechaMinima, irADia,
  };
}
