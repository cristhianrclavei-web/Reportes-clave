'use client';

// Dibuja un DXF ya leído (lib/leerDxf.ts) como imagen del plano, igual que
// se hace con la hoja del PDF. En gris, para que lo sembrado resalte.
//
// La hoja de la app mide 3000 unidades por el lado largo (como un plano de
// tamaño parecido al PDF); `transformacion` dice cómo volver a coordenadas
// del dibujo: X = x0 + x·k ; Y = y1 − y·k.

import { cajaDe, visible, type Primitiva } from './leerDxf';

const LADO_HOJA = 3000;
const LADO_MAXIMO = 4096;
const PIXELES_MAXIMOS = 16_000_000;

export type TransformacionDxf = { x0: number; y1: number; k: number };

export type DxfRenderizado = { imagen: Blob; ancho: number; alto: number; transformacion: TransformacionDxf };

// Tamaño de la hoja y cómo pasar de dibujo a hoja (con un margen de 2 %).
export function hojaDelDibujo(primitivas: Primitiva[], ocultas: Set<string>): { ancho: number; alto: number; transformacion: TransformacionDxf } | null {
  const caja = cajaDe(primitivas, ocultas);
  if (!caja) return null;
  const margen = Math.max(caja.maxX - caja.minX, caja.maxY - caja.minY) * 0.02 || 1;
  const anchoDibujo = caja.maxX - caja.minX + margen * 2;
  const altoDibujo = caja.maxY - caja.minY + margen * 2;
  const k = Math.max(anchoDibujo, altoDibujo) / LADO_HOJA;
  return {
    ancho: anchoDibujo / k,
    alto: altoDibujo / k,
    transformacion: { x0: caja.minX - margen, y1: caja.maxY + margen, k },
  };
}

function dibujar(lienzo: HTMLCanvasElement, primitivas: Primitiva[], ocultas: Set<string>, hoja: NonNullable<ReturnType<typeof hojaDelDibujo>>, pxPorUnidad: number) {
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('Este navegador no puede dibujar el plano. Prueba en Chrome.');
  const { x0, y1, k } = hoja.transformacion;
  const aPx = (x: number, y: number): [number, number] => [((x - x0) / k) * pxPorUnidad, ((y1 - y) / k) * pxPorUnidad];

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  // Líneas gruesas: la imagen se ve reducida en el celular y una línea de
  // 1 px desaparece. Así se lee el plano completo y al acercar sigue bien.
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = Math.max(1.2, lienzo.width / 1500);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Todas las líneas en un solo trazo: mucho más rápido.
  ctx.beginPath();
  for (const p of primitivas) {
    if (p.tipo !== 'trazo' || !visible(p, ocultas)) continue;
    const [ax, ay] = aPx(p.puntos[0][0], p.puntos[0][1]);
    ctx.moveTo(ax, ay);
    for (let i = 1; i < p.puntos.length; i++) {
      const [bx, by] = aPx(p.puntos[i][0], p.puntos[i][1]);
      ctx.lineTo(bx, by);
    }
    if (p.cerrado) ctx.lineTo(ax, ay);
  }
  ctx.stroke();

  ctx.fillStyle = '#374151';
  for (const p of primitivas) {
    if (p.tipo !== 'texto' || !visible(p, ocultas)) continue;
    const altoPx = (p.alto / k) * pxPorUnidad;
    if (altoPx < 3) continue; // ilegible: solo ensucia
    const [tx, ty] = aPx(p.x, p.y);
    const renglones = p.texto.split('\n');
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(-p.angulo);
    ctx.font = `${altoPx}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = p.anclaX === 0.5 ? 'center' : p.anclaX === 1 ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    const interlineado = altoPx * 1.45;
    // anclaY: 0 arriba, 0.5 en medio, 1 abajo (base del último renglón).
    const total = interlineado * (renglones.length - 1) + altoPx;
    const primeraBase = altoPx - p.anclaY * total;
    renglones.forEach((r, i) => ctx.fillText(r, 0, primeraBase + i * interlineado));
    ctx.restore();
  }
}

function lienzoABlob(lienzo: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error('No se pudo convertir el plano en imagen.'))), 'image/webp', 0.9);
  });
}

// La imagen del plano para el editor (hasta 4096 px y 16 megapixeles).
export async function renderizarDxf(primitivas: Primitiva[], ocultas: Set<string>): Promise<DxfRenderizado> {
  const hoja = hojaDelDibujo(primitivas, ocultas);
  if (!hoja) throw new Error('Con esas capas apagadas no queda nada que dibujar.');
  let px = LADO_MAXIMO / Math.max(hoja.ancho, hoja.alto);
  if (hoja.ancho * hoja.alto * px * px > PIXELES_MAXIMOS) px = Math.sqrt(PIXELES_MAXIMOS / (hoja.ancho * hoja.alto));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.floor(hoja.ancho * px);
  lienzo.height = Math.floor(hoja.alto * px);
  dibujar(lienzo, primitivas, ocultas, hoja, px);
  const imagen = await lienzoABlob(lienzo);
  lienzo.width = 0;
  lienzo.height = 0;
  return { imagen, ancho: hoja.ancho, alto: hoja.alto, transformacion: hoja.transformacion };
}

// Vista previa chica para elegir capas.
export function vistaPreviaDxf(primitivas: Primitiva[], ocultas: Set<string>, lado = 900): string | null {
  const hoja = hojaDelDibujo(primitivas, ocultas);
  if (!hoja) return null;
  const px = lado / Math.max(hoja.ancho, hoja.alto);
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.floor(hoja.ancho * px);
  lienzo.height = Math.floor(hoja.alto * px);
  dibujar(lienzo, primitivas, ocultas, hoja, px);
  const url = lienzo.toDataURL('image/png');
  lienzo.width = 0;
  lienzo.height = 0;
  return url;
}
