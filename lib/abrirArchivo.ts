import type { MouseEvent } from 'react';
import { showToast } from '@/components/Toast';
import { esAppAndroid } from './rastreoUbicacion';
import { createClient } from './supabaseClient';

// Abrir o descargar un archivo (PDF, Excel, etiqueta) desde cualquier pantalla.
//
// En el navegador basta con abrir la dirección en otra pestaña. Dentro de la
// app de Android eso no hace nada: su visor interno no muestra PDFs, no
// descarga archivos y no tiene «otra pestaña». Lo que sí funciona es mandar
// al teléfono a una dirección de OTRO dominio: Android la abre en Chrome y
// Chrome descarga el archivo. Por eso, en la app, el archivo se sube a
// Storage y se abre con un enlace firmado de supabase.co que dura 10 minutos.

const CARPETA = 'lazos/descargas'; // dentro de lazos/: técnicos y supervisión ya pueden subir y leer ahí
const DIEZ_MINUTOS = 600;

// «reporte-2026 Lucía.pdf» → «reporte-2026-Lucia.pdf»: sirve en cualquier teléfono.
export function nombreSeguro(nombre: string): string {
  const limpio = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
  return limpio || 'archivo';
}

// El nombre que propone el servidor en el encabezado Content-Disposition.
export function nombreDeEncabezado(encabezado: string | null, respaldo: string): string {
  const encontrado = encabezado ? /filename="?([^";]+)"?/i.exec(encabezado) : null;
  return encontrado ? encontrado[1] : respaldo;
}

// Borra las descargas viejas de esta persona para que no se acumulen.
async function limpiarDescargasViejas(carpeta: string) {
  const supabase = createClient();
  const { data } = await supabase.storage.from('evidencias').list(carpeta);
  const limite = Date.now() - 15 * 60 * 1000;
  const viejas = (data || []).filter((archivo) => Number(archivo.name.split('-')[0]) < limite).map((archivo) => `${carpeta}/${archivo.name}`);
  if (viejas.length === 0) return;
  const { error } = await supabase.storage.from('evidencias').remove(viejas);
  if (error) console.error('[abrirArchivo] No se pudieron borrar descargas viejas:', error.message);
}

// Solo app de Android: sube el archivo y manda al teléfono al enlace firmado.
async function entregarEnAndroid(archivo: Blob, nombre: string) {
  const supabase = createClient();
  const { data: sesion } = await supabase.auth.getUser();
  if (!sesion.user) throw new Error('Tu sesión venció. Vuelve a entrar e intenta de nuevo.');
  const carpeta = `${CARPETA}/${sesion.user.id}`;
  const limpio = nombreSeguro(nombre);
  const ruta = `${carpeta}/${Date.now()}-${limpio}`;

  const subida = await supabase.storage.from('evidencias').upload(ruta, archivo, { contentType: archivo.type || 'application/octet-stream' });
  if (subida.error) throw new Error('No se pudo preparar el archivo para descargarlo. Revisa tu señal e intenta de nuevo.');
  const firmado = await supabase.storage.from('evidencias').createSignedUrl(ruta, DIEZ_MINUTOS, { download: limpio });
  if (firmado.error || !firmado.data) throw new Error('No se pudo preparar el enlace del archivo. Intenta de nuevo.');

  // No se espera: si falla la limpieza, el archivo se abre igual.
  limpiarDescargasViejas(carpeta).catch((e) => console.error('[abrirArchivo] limpieza', e));
  window.location.assign(firmado.data.signedUrl);
}

// Abre un archivo que arma el servidor, por ejemplo `/api/reports/<id>/pdf`.
export async function abrirArchivo(ruta: string): Promise<void> {
  if (!esAppAndroid()) {
    window.open(ruta, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!navigator.onLine) {
    showToast('El archivo necesita señal. Intenta cuando tengas conexión.', 'error');
    return;
  }
  showToast('Preparando el archivo…');
  try {
    const respuesta = await fetch(ruta, { cache: 'no-store' });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json().catch(() => ({}));
      throw new Error(cuerpo?.error || `No se pudo generar el archivo (código ${respuesta.status}).`);
    }
    const archivo = await respuesta.blob();
    const extension = archivo.type.includes('sheet') ? 'xlsx' : 'pdf';
    const nombre = nombreDeEncabezado(respuesta.headers.get('Content-Disposition'), `archivo.${extension}`);
    await entregarEnAndroid(archivo, nombre);
  } catch (e: any) {
    showToast(e?.message || 'No se pudo abrir el archivo. Revisa tu señal e intenta de nuevo.', 'error');
  }
}

// Para enlaces <a href="/api/…/pdf" target="_blank">: en el navegador el
// enlace sigue igual; en la app de Android se entrega con abrirArchivo.
export function alTocarEnlace(evento: MouseEvent<HTMLAnchorElement>) {
  if (!esAppAndroid()) return;
  evento.preventDefault();
  const ruta = evento.currentTarget.getAttribute('href');
  if (ruta) abrirArchivo(ruta);
}

// Descarga un archivo que se armó en el teléfono (Excel, etiqueta, varios PDF juntos).
export async function descargarArchivo(archivo: Blob, nombre: string): Promise<void> {
  if (!esAppAndroid()) {
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    // Con una pausa: si se libera en el acto, algunos navegadores cancelan la descarga.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  try {
    await entregarEnAndroid(archivo, nombre);
  } catch (e: any) {
    showToast(e?.message || 'No se pudo descargar el archivo. Revisa tu señal e intenta de nuevo.', 'error');
  }
}
