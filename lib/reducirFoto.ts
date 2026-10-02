// Reduce una foto antes de subirla: lado mayor a 1600 px en JPEG (calidad
// 0.82). Una foto del celular pasa de 3–5 MB a ~300–400 KB y en reportes y
// PDFs se sigue viendo bien; además sube más rápido con mala señal.
//
// Lo que no es foto (PDF, GIF, SVG) o ya es chico se regresa tal cual, y si
// por algo la versión reducida saliera más pesada, también se usa el original.
// Solo corre en el navegador (canvas).

export const LADO_MAXIMO = 1600;
const CALIDAD = 0.82;
const YA_CHICA = 450 * 1024;

async function decodificar(blob: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; cerrar: () => void }> {
  // createImageBitmap respeta la orientación EXIF (fotos de lado del celular).
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { img: bmp, w: bmp.width, h: bmp.height, cerrar: () => bmp.close() };
    } catch { /* formato no soportado por createImageBitmap: probar con <img> */ }
  }
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('No se pudo leer la imagen'));
    i.src = url;
  });
  return { img, w: img.naturalWidth, h: img.naturalHeight, cerrar: () => URL.revokeObjectURL(url) };
}

export async function reducirFoto<T extends Blob>(archivo: T): Promise<T | File> {
  if (typeof document === 'undefined') return archivo;
  const tipo = archivo.type || '';
  if (!tipo.startsWith('image/') || /gif|svg/.test(tipo)) return archivo;

  try {
    const { img, w, h, cerrar } = await decodificar(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(w, h));
    if (escala === 1 && archivo.size <= YA_CHICA && tipo === 'image/jpeg') { cerrar(); return archivo; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * escala);
    canvas.height = Math.round(h * escala);
    const ctx = canvas.getContext('2d');
    if (!ctx) { cerrar(); return archivo; }
    // Fondo blanco: un PNG con transparencia no queda negro al pasar a JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    cerrar();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', CALIDAD));
    if (!blob || blob.size >= archivo.size) return archivo;
    const base = ((archivo as unknown as File).name || 'foto').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return archivo;
  }
}
