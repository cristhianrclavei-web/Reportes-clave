// Evidencias que el teléfono ya no deja leer.
//
// Una foto elegida de la galería llega como una «referencia» al archivo, no
// como la foto misma. Si después Android le quita el permiso a esa referencia
// (la foto se movió o borró, venía de la nube, la app pasó mucho rato en
// segundo plano), al leerla el navegador falla con un mensaje en inglés
// («The requested file could not be read…») y antes eso tumbaba el guardado
// del reporte completo.
//
// Aquí está lo que lo evita: copiar la foto a la memoria de la app en cuanto
// se elige, y revisar antes de guardar cuáles evidencias siguen legibles.

import { reducirFoto } from './reducirFoto';

// Deja la foto en la memoria de la app (reducida, si se puede), para que ya
// no dependa del archivo original. Si el archivo no se puede leer lanza un
// error: quien llama avisa al usuario en ese momento, no hasta guardar.
export async function fotoEnMemoria(archivo: File): Promise<File> {
  const reducida = await reducirFoto(archivo);
  // reducirFoto crea un archivo nuevo en memoria cuando sí redujo la foto.
  if (reducida !== archivo) return reducida as File;
  // Si regresó el mismo archivo (ya era chica, o no la pudo leer), se copia
  // byte por byte; con un archivo ilegible esta línea es la que falla.
  const bytes = await archivo.arrayBuffer();
  return new File([bytes], archivo.name, { type: archivo.type, lastModified: archivo.lastModified });
}

// Leer un solo byte basta para saber si el teléfono todavía deja leer el archivo.
async function sePuedeLeer(archivo: Blob): Promise<boolean> {
  try {
    await archivo.slice(0, 1).arrayBuffer();
    return true;
  } catch {
    return false;
  }
}

// Separa las evidencias que sí se pueden leer de las que no. De las ilegibles
// regresa su número en la lista (1, 2, 3…), que es como las ve el usuario.
export async function separarEvidenciasIlegibles<T extends { file: File; video?: File }>(
  evidencias: T[],
): Promise<{ legibles: T[]; numerosIlegibles: number[] }> {
  const legibles: T[] = [];
  const numerosIlegibles: number[] = [];
  for (let i = 0; i < evidencias.length; i++) {
    const evidencia = evidencias[i];
    const fotoLegible = await sePuedeLeer(evidencia.file);
    const videoLegible = evidencia.video ? await sePuedeLeer(evidencia.video) : true;
    if (fotoLegible && videoLegible) legibles.push(evidencia);
    else numerosIlegibles.push(i + 1);
  }
  return { legibles, numerosIlegibles };
}

// Aviso para el usuario; cadena vacía si todas se pudieron leer.
export function avisoEvidenciasIlegibles(numeros: number[]): string {
  if (numeros.length === 0) return '';
  if (numeros.length === 1) {
    return `La evidencia ${numeros[0]} no se pudo leer en este teléfono y no se incluyó: vuelve a tomarla y agrégala editando el reporte.`;
  }
  return `Las evidencias ${numeros.join(', ')} no se pudieron leer en este teléfono y no se incluyeron: vuelve a tomarlas y agrégalas editando el reporte.`;
}

// ¿El error es del navegador al no poder leer un archivo?
export function esErrorDeLectura(error: any): boolean {
  const nombre = String(error?.name || '');
  const texto = String(error?.message || '').toLowerCase();
  return nombre === 'NotReadableError' || nombre === 'NotFoundError' || texto.includes('could not be read') || texto.includes('could not be found');
}

// Texto de un error para mostrarlo: el de lectura de archivos llega en inglés
// y sin decir qué hacer, así que se cambia por uno en español.
export function textoDeError(error: any, respaldo: string): string {
  if (esErrorDeLectura(error)) {
    return 'el teléfono ya no deja leer una de las fotos o videos. Quita esa evidencia, vuelve a tomarla y guarda otra vez';
  }
  return error?.message || respaldo;
}
