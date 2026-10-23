'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { createClient } from './supabaseClient';

// Rastreo de los teléfonos de la empresa. Solo funciona dentro de la app de
// Android de Clave (en el navegador no hace nada). La página solo pide los
// permisos y le pasa al servicio nativo la «llave de rastreo» de quien tiene
// la sesión; el servicio prende el GPS en horario, guarda un punto por
// minuto y los manda él solo a la base, aunque la pantalla esté apagada.
// Ver supabase/patch_rastreo_llave_telefono.sql y android/.

// Plugin nativo propio (android/app/src/main/java/mx/clavei/app/RastreoUbicacionPlugin.java).
const RastreoNativo = registerPlugin<{
  preparar(): Promise<{ permiso: boolean }>;
  configurar(opciones: { url: string; apikey: string; usuario: string | null; llave: string | null }): Promise<void>;
  abrirAjustes(): Promise<void>;
  info(): Promise<InfoApk>;
}>('RastreoUbicacion');

export type InfoApk = { version: string; compilacion: number; android: string; modelo: string };

// Versión del APK instalado; null en el navegador o con la app 1.4 o anterior
// (no traen este método).
export async function infoApk(): Promise<InfoApk | null> {
  if (!esAppAndroid()) return null;
  try {
    return await RastreoNativo.info();
  } catch {
    return null;
  }
}

const REINTENTAR_MS = 60 * 1000;

let iniciado = false;
// Para quién se está configurando el servicio (undefined = nadie todavía).
// Se marca antes de esperar a la base: Supabase avisa dos veces seguidas al
// abrir y no deben salir dos llaves.
let usuarioPedido: string | null | undefined;
let reintento: ReturnType<typeof setTimeout> | null = null;

export function esAppAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function abrirAjustesDeUbicacion(): void {
  RastreoNativo.abrirAjustes().catch((e) => console.error('No se pudieron abrir los ajustes', e));
}

// Se llama una vez al abrir la app. `faltaPermiso` avisa a la pantalla para
// que muestre cómo dar el permiso de ubicación.
export async function iniciarRastreo(faltaPermiso: () => void): Promise<void> {
  if (iniciado || !esAppAndroid()) return;
  iniciado = true;
  try {
    const { permiso } = await RastreoNativo.preparar();
    if (!permiso) {
      faltaPermiso();
      return;
    }
  } catch (e) {
    console.error('Rastreo: no se pudo preparar', e);
    return;
  }
  // Al abrir la app y al entrar o salir de una cuenta.
  createClient().auth.onAuthStateChange((_evento, sesion) => {
    const usuario = sesion?.user.id ?? null;
    if (usuario === usuarioPedido) return;
    usuarioPedido = usuario;
    configurarServicio(usuario);
  });
}

async function configurarServicio(usuario: string | null) {
  if (reintento) clearTimeout(reintento);
  reintento = null;
  // Si mientras tanto entró otra cuenta, esta ya no cuenta.
  if (usuario !== usuarioPedido) return;

  let llave: string | null = null;
  if (usuario) {
    const { data, error } = await createClient().rpc('crear_llave_rastreo');
    if (error || typeof data !== 'string') {
      // Sin señal (o falta el SQL): el servicio sigue con la llave que ya
      // tenía y se vuelve a intentar al rato.
      console.error('Rastreo: no se pudo crear la llave', error?.message);
      reintento = setTimeout(() => configurarServicio(usuario), REINTENTAR_MS);
      return;
    }
    llave = data;
  }
  if (usuario !== usuarioPedido) return;

  try {
    await RastreoNativo.configurar({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      usuario,
      llave,
    });
  } catch (e) {
    // Con la versión 1.1 de la app no existe «configurar»: hay que instalar la nueva.
    console.error('Rastreo: no se pudo configurar el servicio', e);
  }
}
