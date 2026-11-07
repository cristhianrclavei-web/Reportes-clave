'use client';

// Convierte una hoja del PDF del plano en imagen, solo al subirlo. En el
// editor se muestra esa imagen (rápida en cualquier celular) y lo sembrado
// se guarda en puntos de la hoja; el PDF exportado usa el PDF original, que
// sale nítido a cualquier zoom.

// Lado más largo de la imagen. Más de ~16 millones de pixeles truena el
// canvas en iPhone, por eso no más grande.
const LADO_MAXIMO = 4096;
const PIXELES_MAXIMOS = 16_000_000;

type PdfJs = typeof import('pdfjs-dist');

let pdfjsCargado: Promise<PdfJs> | null = null;

// La versión «legacy» funciona en teléfonos Android viejos.
function cargarPdfJs(): Promise<PdfJs> {
  if (!pdfjsCargado) {
    pdfjsCargado = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
      return pdfjs as unknown as PdfJs;
    });
  }
  return pdfjsCargado;
}

export type PdfAbierto = { paginas: number; documento: any };

export async function abrirPdf(archivo: File): Promise<PdfAbierto> {
  const pdfjs = await cargarPdfJs();
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  try {
    const documento = await pdfjs.getDocument({ data: bytes }).promise;
    return { paginas: documento.numPages, documento };
  } catch (e: any) {
    if (e?.name === 'PasswordException') throw new Error('El PDF tiene contraseña. Expórtalo de nuevo sin contraseña.');
    throw new Error('No se pudo leer el PDF. Revisa que sea un PDF válido (expórtalo de nuevo desde AutoCAD).');
  }
}

export type HojaRenderizada = { imagen: Blob; ancho: number; alto: number };

function lienzoABlob(lienzo: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    // WebP pesa la mitad; Safari no lo genera y regresa PNG, que también sirve.
    lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error('No se pudo convertir el plano en imagen.'))), 'image/webp', 0.9);
  });
}

export async function renderizarHoja(pdf: PdfAbierto, numeroPagina: number): Promise<HojaRenderizada> {
  const pagina = await pdf.documento.getPage(numeroPagina);
  // A escala 1 el tamaño es en puntos y ya trae el giro de la hoja.
  const base = pagina.getViewport({ scale: 1 });
  let escala = LADO_MAXIMO / Math.max(base.width, base.height);
  if (base.width * base.height * escala * escala > PIXELES_MAXIMOS) {
    escala = Math.sqrt(PIXELES_MAXIMOS / (base.width * base.height));
  }
  const vista = pagina.getViewport({ scale: escala });
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.floor(vista.width);
  lienzo.height = Math.floor(vista.height);
  const contexto = lienzo.getContext('2d');
  if (!contexto) throw new Error('Este navegador no puede dibujar el plano. Prueba en Chrome.');
  // Fondo blanco: los PDF de AutoCAD vienen transparentes.
  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, lienzo.width, lienzo.height);
  await pagina.render({ canvasContext: contexto, canvas: lienzo, viewport: vista }).promise;
  const imagen = await lienzoABlob(lienzo);
  lienzo.width = 0;
  lienzo.height = 0;
  return { imagen, ancho: base.width, alto: base.height };
}

// Miniatura para elegir la hoja.
export async function miniaturaHoja(pdf: PdfAbierto, numeroPagina: number): Promise<string> {
  const pagina = await pdf.documento.getPage(numeroPagina);
  const base = pagina.getViewport({ scale: 1 });
  const vista = pagina.getViewport({ scale: 360 / Math.max(base.width, base.height) });
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.floor(vista.width);
  lienzo.height = Math.floor(vista.height);
  const contexto = lienzo.getContext('2d');
  if (!contexto) return '';
  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, lienzo.width, lienzo.height);
  await pagina.render({ canvasContext: contexto, canvas: lienzo, viewport: vista }).promise;
  return lienzo.toDataURL('image/jpeg', 0.7);
}
