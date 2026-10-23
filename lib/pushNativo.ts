'use client';

import { PushNotifications } from '@capacitor/push-notifications';
import { createClient } from './supabaseClient';
import { esAppAndroid } from './rastreoUbicacion';

// Notificaciones en la app de Android de Clave. La página dentro del APK no
// recibe las del navegador, así que aquí el teléfono se registra con
// Firebase y su token se guarda como una suscripción más, con el endpoint
// «fcm:<token>» (el servidor lo manda por lib/fcmServidor.ts). Es un teléfono
// de la empresa: se registra solo al entrar con una cuenta, sin interruptor.

const CLAVE_TOKEN = 'tokenFirebase';
let iniciado = false;
let usuarioRegistrado: string | null | undefined;

export async function iniciarAvisosNativos(): Promise<void> {
  if (iniciado || !esAppAndroid()) return;
  iniciado = true;
  try {
    await PushNotifications.addListener('registration', ({ value }) => {
      guardarToken(value);
      registrarEnServidor(value);
    });
    await PushNotifications.addListener('registrationError', (e) => {
      console.error('Avisos: Firebase no dio el registro', e);
    });
    // Al tocar el aviso se abre la pantalla que trae (solo rutas de la app).
    await PushNotifications.addListener('pushNotificationActionPerformed', (accion) => {
      const url = accion.notification.data?.url;
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) window.location.href = url;
    });
  } catch (e) {
    // La app 1.2 o anterior no trae el plugin: hay que instalar la nueva.
    console.error('Avisos: esta versión de la app no tiene notificaciones', e);
    return;
  }

  createClient().auth.onAuthStateChange((_evento, sesion) => {
    const usuario = sesion?.user.id ?? null;
    if (usuario === usuarioRegistrado) return;
    usuarioRegistrado = usuario;
    // Al salir, LogoutButton da de baja el token (quitarAvisosNativos).
    if (usuario) PushNotifications.register().catch((e) => console.error('Avisos: no se pudo registrar', e));
  });
}

async function registrarEnServidor(token: string) {
  try {
    const respuesta = await fetch('/api/push/suscribir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: `fcm:${token}`, p256dh: 'fcm', auth: 'fcm', user_agent: 'App Android de Clave' }),
    });
    if (!respuesta.ok) console.error('Avisos: el servidor no guardó el teléfono', respuesta.status);
  } catch (e) {
    // Sin señal: se vuelve a intentar la próxima vez que se abra la app.
    console.error('Avisos: no se pudo registrar el teléfono', e);
  }
}

// Al cerrar sesión: que el teléfono deje de recibir los avisos de esta cuenta.
export async function quitarAvisosNativos(): Promise<void> {
  const token = leerToken();
  if (!token) return;
  const respuesta = await fetch('/api/push/suscribir', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: `fcm:${token}` }),
  });
  if (!respuesta.ok) throw new Error(`El servidor respondió ${respuesta.status}`);
  usuarioRegistrado = null;
}

function guardarToken(token: string) {
  try {
    localStorage.setItem(CLAVE_TOKEN, token);
  } catch (e) {
    console.error('Avisos: no se pudo guardar el token', e);
  }
}

function leerToken(): string | null {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}
