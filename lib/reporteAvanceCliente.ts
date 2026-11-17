// Arma el reporte de avance de TODOS los planos de un cliente y devuelve el
// enlace para descargarlo. Se usa desde el editor del plano y desde la vista
// del cliente en «Diagramas y planos». Corre en el navegador (convierte la
// imagen del plano con un canvas).

import { MARCA } from './marca';
import { direccionVisible, etiquetaSalida, type Elemento } from './lazos';
import { leerAvance, type AvancePlano } from './avancePlano';
import type { EquipoPlano, Sembrado } from './planos';
import { bytesDeFotos, descargarPdfOriginal, entregarPdf, lazosDelCliente, planosDelCliente, type LazoConElementos } from './planosDatos';

export function etiquetaDeElemento(elemento: Elemento, lazo: LazoConElementos): string {
  return direccionVisible(elemento.direccion, lazo.numero) || elemento.nombre;
}

export function nombreDeLazo(lazo: LazoConElementos): string {
  return `${lazo.numero ? `${etiquetaSalida(lazo)} · ` : ''}${lazo.codigo}`;
}

// La imagen del plano (WebP) convertida a PNG para meterla al PDF.
export async function aPng(bytes: ArrayBuffer): Promise<Uint8Array> {
  const mapa = await createImageBitmap(new Blob([bytes]));
  const lienzo = document.createElement('canvas');
  lienzo.width = mapa.width;
  lienzo.height = mapa.height;
  lienzo.getContext('2d')?.drawImage(mapa, 0, 0);
  const png = await new Promise<Blob>((resolver, rechazar) => lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No se pudo preparar la imagen del plano.'))), 'image/png'));
  lienzo.width = 0;
  lienzo.height = 0;
  return new Uint8Array(await png.arrayBuffer());
}

export async function generarReporteAvanceCliente({ clienteId, cliente, paneles, enPantalla }: {
  clienteId: string;
  cliente: string;
  // Nombres de los paneles del cliente, para la portada.
  paneles: string[];
  // El plano abierto en el editor va con lo que se ve en pantalla (puede traer cambios sin subir).
  enPantalla?: { planoId: string; sembrado: Sembrado; avance: AvancePlano };
}): Promise<string> {
  const [{ reporteAvancePdf }, { planos }, { lazos }] = await Promise.all([
    import('./reporteAvancePdf'),
    planosDelCliente(clienteId),
    lazosDelCliente(clienteId),
  ]);
  if (planos.length === 0) throw new Error('Este cliente todavía no tiene planos.');

  const elementosPorId = new Map<string, { elemento: Elemento; lazo: LazoConElementos }>();
  for (const lazo of lazos) for (const e of lazo.elementos) elementosPorId.set(e.id, { elemento: e, lazo });
  const etiquetas = new Map<string, string>();
  const ubicaciones = new Map<string, string>();
  for (const [id, { elemento, lazo }] of elementosPorId) {
    etiquetas.set(id, etiquetaDeElemento(elemento, lazo));
    if (elemento.ubicacion) ubicaciones.set(id, elemento.ubicacion);
  }
  const lazoDe = (e: EquipoPlano) => {
    const ligado = e.elementoId ? elementosPorId.get(e.elementoId) : undefined;
    return ligado ? { id: ligado.lazo.id, nombre: nombreDeLazo(ligado.lazo) } : null;
  };

  const paraReporte = [];
  for (const plano of planos) {
    const esEste = plano.id === enPantalla?.planoId;
    const datos = esEste ? { ...plano, sembrado: enPantalla!.sembrado } : plano;
    const esDxf = datos.formato === 'dxf';
    const original = await descargarPdfOriginal(esDxf ? datos.imagen_path : datos.pdf_path);
    paraReporte.push({
      plano: datos,
      avance: esEste ? enPantalla!.avance : leerAvance(plano.avance),
      pdfOriginal: esDxf ? null : original,
      fondoPng: esDxf ? await aPng(original) : null,
      etiquetas,
    });
  }

  // Fotos de evidencia (lo que no se puede instalar y las marcas con foto).
  const rutas = new Set<string>();
  for (const p of paraReporte) {
    for (const marca of Object.values(p.avance)) {
      const ruta = marca.bloqueo?.foto || marca.foto;
      if (ruta) rutas.add(ruta);
    }
  }
  const fotos = await bytesDeFotos([...rutas].slice(0, 60));

  const bytes = await reporteAvancePdf({ cliente, empresa: MARCA.nombre, planos: paraReporte, paneles, lazoDe, fotos, ubicaciones });
  const nombreArchivo = `avance-${cliente}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-');
  // El archivo se guarda junto al plano abierto o, desde la vista del cliente, junto al primero.
  return entregarPdf(enPantalla?.planoId ?? planos[0].id, bytes, nombreArchivo);
}
