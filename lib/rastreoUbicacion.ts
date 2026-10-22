'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { createClient } from './supabaseClient';
import { POR_ENVIO, PuntoUbicacion, agregarACola, leerCola, quitarEnviados, tocaGuardar } from './rastreoCola';

// Rastreo de los teléfonos de la empresa. Solo funciona dentro de la app de
// Android de Clave (en el navegador no hace nada). Cada pocos minutos
// pregunta a la base si es horario de trabajo (rastreo_activo_ahora): si sí,
// prende el GPS y guarda un punto por minuto; si no, lo apaga. Los puntos se
// juntan en el teléfono y se mandan a la base; sin señal esperan en la cola.
// Ver supabase/patch_ubicacion_tecnicos.sql y android/.

// Lo que manda el plugin por su vía abierta: primero «listo» (o el error
// de permiso) y después cada ubicación.
type Mensaje = {
  listo?: boolean;
  error?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  speed?: number | null;
  time?: number | null;
};

// Plugin nativo propio (android/app/src/main/java/mx/clavei/app/RastreoUbicacionPlugin.java).
const RastreoNativo = registerPlugin<{
  preparar(opciones: Record<string, never>, alRecibir: (m?: Mensaje, e?: unknown) => void): Promise<string>;
  gps(opciones: { activo: boolean }): Promise<void>;
  abrirAjustes(): Promise<void>;
}>('RastreoUbicacion');

const CLAVE_COLA = 'ubicacionesPendientes';
const REVISAR_HORARIO_MS = 3 * 60 * 1000;
const ENVIAR_CADA_MS = 60 * 1000;

let iniciado = false;
let preparado = false;
let gpsPrendido: boolean | null = null;
let ultimoGuardadoMs: number | null = null;
let ultimoEnvioMs = 0;
let enviando = false;
let alFaltarPermiso: (() => void) | null = null;

export function esAppAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function abrirAjustesDeUbicacion(): void {
  RastreoNativo.abrirAjustes().catch((e) => console.error('No se pudieron abrir los ajustes', e));
}

// Se llama una vez al abrir la app. `faltaPermiso` avisa a la pantalla para
// que muestre cómo dar el permiso de ubicación «todo el tiempo».
export function iniciarRastreo(faltaPermiso: () => void): void {
  if (iniciado || !esAppAndroid()) return;
  iniciado = true;
  alFaltarPermiso = faltaPermiso;
  // Al abrir la app (en primer plano) se arranca el servicio: Android no
  // deja hacerlo después desde segundo plano.
  RastreoNativo.preparar({}, alRecibirMensaje).catch((e) => console.error('Rastreo: no se pudo preparar', e));
  setInterval(revisarHorario, REVISAR_HORARIO_MS);
}

async function revisarHorario() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    await cambiarGps(false);
    return;
  }
  const { data, error } = await supabase.rpc('rastreo_activo_ahora');
  if (error) {
    // Sin señal no se sabe: se deja como está y se reintenta al rato.
    console.error('Rastreo: no se pudo revisar el horario', error.message);
    return;
  }
  await cambiarGps(data === true);
  enviarPendientes();
}

async function cambiarGps(activo: boolean) {
  if (!preparado || gpsPrendido === activo) return;
  try {
    await RastreoNativo.gps({ activo });
    gpsPrendido = activo;
  } catch (e) {
    console.error('Rastreo: no se pudo cambiar el GPS', e);
  }
}

function alRecibirMensaje(m?: Mensaje, e?: unknown) {
  if (e) {
    console.error('Rastreo: error del GPS', e);
    return;
  }
  if (!m) return;
  if (m.error === 'NOT_AUTHORIZED') {
    alFaltarPermiso?.();
    return;
  }
  if (m.listo) {
    preparado = true;
    revisarHorario();
    return;
  }
  if (typeof m.latitude !== 'number' || typeof m.longitude !== 'number') return;
  guardarUbicacion(m.latitude, m.longitude, m.accuracy ?? null, m.speed ?? null, m.time ?? null);
}

function guardarUbicacion(lat: number, lng: number, precision: number | null, velocidad: number | null, tiempo: number | null) {
  const momento = tiempo || Date.now();
  if (!tocaGuardar(ultimoGuardadoMs, momento)) return;
  ultimoGuardadoMs = momento;

  const punto: PuntoUbicacion = {
    registrado_en: new Date(momento).toISOString(),
    lat,
    lng,
    precision_m: precision === null ? null : Math.round(precision),
    velocidad_ms: velocidad,
  };
  guardarCola(agregarACola(leerColaGuardada(), punto));
  if (Date.now() - ultimoEnvioMs >= ENVIAR_CADA_MS) enviarPendientes();
}

// Manda lo pendiente. Solo se quita de la cola lo que la base confirmó.
async function enviarPendientes() {
  if (enviando) return;
  const cola = leerColaGuardada();
  if (cola.length === 0) return;
  enviando = true;
  ultimoEnvioMs = Date.now();
  try {
    const lote = cola.slice(0, POR_ENVIO);
    const { error } = await createClient().rpc('registrar_ubicaciones', { p_puntos: lote });
    if (error) {
      console.error('Rastreo: no se pudieron mandar los puntos', error.message);
      return;
    }
    // Lo que llegó mientras se enviaba se queda.
    guardarCola(quitarEnviados(leerColaGuardada(), lote.length));
  } finally {
    enviando = false;
  }
}

function leerColaGuardada(): PuntoUbicacion[] {
  try {
    return leerCola(localStorage.getItem(CLAVE_COLA));
  } catch {
    return [];
  }
}

function guardarCola(cola: PuntoUbicacion[]) {
  try {
    localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
  } catch (e) {
    console.error('Rastreo: no se pudo guardar la cola', e);
  }
}
