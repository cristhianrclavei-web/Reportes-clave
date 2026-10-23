'use client';

import { useEffect, useRef, useState } from 'react';
import { EstadoSenal, PuntoRecorrido, UltimaUbicacion, estadoSenal, recorridoDeHoy, ultimasUbicacionesHoy } from '@/lib/ubicacionTecnicos';
import { useEnVivo } from '@/lib/useEnVivo';
import { fechaLocal, hoyLocal } from '@/lib/fechaHoy';
import { LLAVE_GOOGLE_MAPS, MotorMapa, PinMapa, Punto, crearMotorBasico, crearMotorGoogle } from './motorMapa';

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

// HTML del pin: las iniciales con el color de su señal y, si está en línea,
// un halo que late. Lo usan los dos mapas.
function htmlPin(t: UltimaUbicacion, estado: EstadoSenal, elegido: boolean): string {
  const borde = elegido ? '#111827' : '#ffffff';
  const halo = estado === 'en_linea'
    ? `<span style="position:absolute;inset:-6px;border-radius:50%;background:${COLOR_SENAL[estado]};opacity:.35;animation:pulsoTecnico 2s ease-out infinite"></span>`
    : '';
  return `<div style="position:relative;width:36px;height:36px">${halo}<div style="position:relative;width:36px;height:36px;border-radius:50%;background:${COLOR_SENAL[estado]};border:3px solid ${borde};color:#fff;font:700 12px sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.35)">${inicialesTecnico(t.nombre)}</div></div>`;
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

  async function cargar() {
    try {
      const lista = await ultimasUbicacionesHoy();
      setTecnicos(lista);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
      setAhora(Date.now());
    }
  }

  useEffect(() => { cargar(); }, []);
  useEnVivo({ tablas: ['ubicaciones_tecnicos'], alCambiar: cargar, cadaMs: 60000 });
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

  // Pines: uno por técnico, con sus iniciales y el color de su señal.
  useEffect(() => {
    const mapa = motorRef.current;
    if (!mapa || ahora === null) return;
    const pines: PinMapa[] = tecnicos.map((t) => ({
      id: t.tecnico_id,
      lat: t.lat,
      lng: t.lng,
      html: htmlPin(t, estadoSenal(t.registrado_en, ahora), t.tecnico_id === elegido),
      titulo: `${t.nombre || 'Técnico'} · ${horaCorta(t.registrado_en)}`,
    }));
    mapa.ponerPines(pines, setElegido);
    if (!yaEncuadreRef.current && tecnicos.length > 0) {
      yaEncuadreRef.current = true;
      encuadrarTodos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, tecnicos, elegido, ahora]);

  // Recorrido de hoy del técnico elegido (se recarga con cada punto nuevo).
  useEffect(() => {
    if (!elegido) {
      setRecorrido([]);
      return;
    }
    const inicioDelDia = fechaLocal(hoyLocal()).toISOString();
    recorridoDeHoy(elegido, inicioDelDia)
      .then(setRecorrido)
      .catch((e) => setError(e.message));
  }, [elegido, tecnicos]);

  useEffect(() => {
    motorRef.current?.ponerRuta(recorrido.map((p) => [p.lat, p.lng] as Punto));
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

  return { contenedorRef, tecnicos, elegido, recorrido, error, cargando, ahora, enfocar, encuadrarTodos, motor, hayGoogle, cambiarMotor };
}
