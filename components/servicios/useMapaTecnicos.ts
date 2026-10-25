'use client';

import { useEffect, useRef, useState } from 'react';
import { EstadoSenal, PuntoRecorrido, UltimaUbicacion, estadoSenal, marcasDelRecorrido, MINUTOS_ENTRE_MARCAS, recorridoDelDia, ultimasUbicacionesDelDia, ultimasUbicacionesHoy, DIAS_HISTORIAL } from '@/lib/ubicacionTecnicos';
import { useEnVivo } from '@/lib/useEnVivo';
import { fechaLocal, hoyLocal, sumarDias } from '@/lib/fechaHoy';
import { LLAVE_GOOGLE_MAPS, MarcaMapa, MotorMapa, PinMapa, Punto, crearMotorBasico, crearMotorGoogle } from './motorMapa';

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

// HTML del pin: las iniciales con el color de su señal y, si está en línea,
// un halo que late. Lo usan los dos mapas.
function htmlPin(t: UltimaUbicacion, estado: EstadoSenal | null, elegido: boolean): string {
  const borde = elegido ? '#111827' : '#ffffff';
  const color = estado ? COLOR_SENAL[estado] : COLOR_HISTORIAL;
  const halo = estado === 'en_linea'
    ? `<span style="position:absolute;inset:-6px;border-radius:50%;background:${color};opacity:.35;animation:pulsoTecnico 2s ease-out infinite"></span>`
    : '';
  return `<div style="position:relative;width:36px;height:36px">${halo}<div style="position:relative;width:36px;height:36px;border-radius:50%;background:${color};border:3px solid ${borde};color:#fff;font:700 12px sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.35)">${inicialesTecnico(t.nombre)}</div></div>`;
}

// Texto seguro para meterlo en el HTML de la marca.
function sinEtiquetas(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Marca de una hora del recorrido: etiqueta «9 a.m.» y, al pasar el mouse
// o tocarla, la tarjeta con hora exacta, fecha y coordenadas.
function htmlMarcaHora(p: PuntoRecorrido, nombre: string | null): string {
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
  return `<div class="marca-hora" role="button" aria-label="${sinEtiquetas(`${hora}, ${coordenadas}`)}">`
    + `<div class="marca-hora-detalle"><b>${sinEtiquetas(hora)}</b><small>${sinEtiquetas(dia)}</small>`
    + `<code>${coordenadas}</code><i>${sinEtiquetas(nombre || 'Técnico')}</i></div>`
    + `<div class="marca-hora-etiqueta">${sinEtiquetas(etiqueta)}</div><div class="marca-hora-pico"></div></div>`;
}

export function useMapaTecnicos({ zoomControl = true }: { zoomControl?: boolean } = {}) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const motorRef = useRef<MotorMapa | null>(null);
  const yaEncuadreRef = useRef(false);
  // Crear y destruir mapas uno tras otro: React monta el efecto dos veces en
  // desarrollo y Leaflet falla si dos mapas toman el mismo div a la vez.
  const colaRef = useRef<Promise<void>>(Promise.resolve());

  const [tecnicos, setTecnicos] = useState<UltimaUbicacion[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [recorrido, setRecorrido] = useState<PuntoRecorrido[]>([]);
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
      html: htmlPin(t, esHoy ? estadoSenal(t.registrado_en, ahora) : null, t.tecnico_id === elegido),
      titulo: `${t.nombre || 'Técnico'} · ${horaCorta(t.registrado_en)}`,
    }));
    mapa.ponerPines(pines, setElegido);
    if (!yaEncuadreRef.current && tecnicos.length > 0) {
      yaEncuadreRef.current = true;
      encuadrarTodos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, tecnicos, elegido, ahora, esHoy]);

  // Recorrido del día del técnico elegido (hoy se recarga con cada punto nuevo).
  useEffect(() => {
    if (!elegido || !fecha) {
      setRecorrido([]);
      return;
    }
    // El técnico elegido no trabajó ese día: no hay recorrido que mostrar.
    if (!tecnicos.some((t) => t.tecnico_id === elegido)) {
      setRecorrido([]);
      return;
    }
    const [desde, hasta] = limitesDelDia(fecha);
    recorridoDelDia(elegido, desde, hasta)
      .then(setRecorrido)
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegido, tecnicos]);

  useEffect(() => {
    motorRef.current?.ponerRuta(recorrido.map((p) => [p.lat, p.lng] as Punto));
    // Una marca cada 10 minutos sobre el recorrido, como referencia de dónde estaba.
    const nombre = tecnicos.find((t) => t.tecnico_id === elegido)?.nombre || null;
    const marcas: MarcaMapa[] = marcasDelRecorrido(recorrido).map((p) => ({ lat: p.lat, lng: p.lng, html: htmlMarcaHora(p, nombre) }));
    motorRef.current?.ponerMarcas(marcas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, recorrido]);

  function encuadrarTodos() {
    motorRef.current?.encuadrar(tecnicos.map((t) => [t.lat, t.lng] as Punto));
  }

  // Elegir (o soltar) a un técnico y acercar el mapa a él.
  function enfocar(t: UltimaUbicacion) {
    const yaElegido = t.tecnico_id === elegido;
    setElegido(yaElegido ? null : t.tecnico_id);
    if (!yaElegido) motorRef.current?.centrar([t.lat, t.lng], 15);
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
    contenedorRef, tecnicos, elegido, recorrido, error, cargando, ahora, enfocar, encuadrarTodos, motor, hayGoogle, cambiarMotor,
    fecha, hoy, esHoy, fechaMinima, irADia,
  };
}
