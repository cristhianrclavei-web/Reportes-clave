import { PDFDocument, rgb } from 'pdf-lib';
import {
  NAVY, TEAL_DARK, GRAY_LINE, GRAY_TEXT, WHITE, VERDE, ROJO, MARGIN, PAGE_W, PAGE_H,
  embedBrandFonts, drawBadge, drawWordmark,
} from './pdfBranding';
import { MARCA, MARCA_MAYUS } from './marca';
import type { Vale } from './vales';

// Vale de almacén en PDF: lo que se pidió, entregó, devolvió y recibió, con
// la firma de recibido del técnico y la del almacén al aceptar la devolución.
// Reemplaza al vale de papel.

const ESTADO: Record<string, string> = {
  solicitado: 'Por entregar', por_firmar: 'Entregado, por firmar', en_uso: 'En uso',
  devolucion_por_confirmar: 'Devolución por confirmar', cerrado: 'Cerrado', rechazado: 'Rechazado', cancelado: 'Cancelado',
};
const MOTIVO: Record<string, string> = {
  consumido: 'Se consumió', en_obra: 'Se quedó en obra', danado: 'Se dañó', perdido: 'Se perdió', otro: 'Otro',
};

function fecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' });
}
function num(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : String(Number(n));
}

export async function generateValePdf(v: Vale & { entregadoPor?: string | null; recibidoPor?: string | null }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  const { font, bold, display } = await embedBrandFonts(pdf);
  const w = PAGE_W - MARGIN * 2;
  let y = PAGE_H - MARGIN;

  drawBadge(page, display, MARGIN, y, 38);
  drawWordmark(page, display, MARGIN + 48, y - 15, 13);
  page.drawText(`VALE DE ALMACÉN ${v.folio}`, { x: PAGE_W - MARGIN - 210, y: y - 12, size: 14, font: display, color: NAVY });
  page.drawText(ESTADO[v.estado] || v.estado, { x: PAGE_W - MARGIN - 210, y: y - 26, size: 8.5, font, color: GRAY_TEXT });
  y -= 56;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: NAVY });
  y -= 18;

  const datos: [string, string][] = [
    ['Personal técnico', v.tecnico || '—'],
    ['Cliente / servicio', v.cliente_nombre],
    ['Solicitado', fecha(v.created_at)],
    ['Entregado', `${fecha(v.entregado_en)}${v.entregadoPor ? ` · por ${v.entregadoPor}` : ''}`],
    ['Fecha límite de devolución', fecha(v.fecha_limite)],
    ['Devuelto', fecha(v.devuelto_en)],
    ['Recibido en almacén', `${fecha(v.recibido_en)}${v.recibidoPor ? ` · por ${v.recibidoPor}` : ''}`],
  ];
  for (let i = 0; i < datos.length; i += 2) {
    datos.slice(i, i + 2).forEach(([k, val], j) => {
      const x = MARGIN + j * (w / 2);
      page.drawText(k.toUpperCase(), { x, y, size: 6.5, font: bold, color: GRAY_TEXT });
      page.drawText(val, { x, y: y - 11, size: 9, font, color: NAVY, maxWidth: w / 2 - 10 });
    });
    y -= 28;
  }
  if (v.nota) { page.drawText(`Nota: ${v.nota}`, { x: MARGIN, y, size: 8.5, font, color: NAVY, maxWidth: w }); y -= 16; }

  // Tabla de artículos
  const cols = [
    { t: 'ARTÍCULO', w: 0.4 }, { t: 'UNIDAD', w: 0.09 }, { t: 'PEDIDO', w: 0.09 }, { t: 'ENTREGADO', w: 0.11 },
    { t: 'DEVUELTO', w: 0.1 }, { t: 'RECIBIDO', w: 0.1 }, { t: 'NO REGRESÓ', w: 0.11 },
  ];
  y -= 6;
  page.drawRectangle({ x: MARGIN, y: y - 16, width: w, height: 16, color: NAVY });
  let cx = MARGIN;
  cols.forEach((c) => { page.drawText(c.t, { x: cx + 4, y: y - 11, size: 6.5, font: bold, color: WHITE }); cx += w * c.w; });
  y -= 16;
  v.items.forEach((it, i) => {
    const desc = [it.articulo?.descripcion, [it.articulo?.marca, it.articulo?.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    // Lo que no volvió al almacén: contra lo recibido si ya se confirmó (el
    // almacén pudo recibir menos de lo que se declaró), si no contra lo devuelto.
    const regreso = it.cantidad_recibida ?? it.cantidad_devuelta;
    const falta = it.cantidad_entregada != null && regreso != null && regreso < it.cantidad_entregada
      ? num(it.cantidad_entregada - regreso) : '—';
    // El motivo va en una segunda línea bajo la cantidad, sin invadir la fila.
    const motivoFalta = falta !== '—' ? MOTIVO[it.motivo_faltante || ''] || (it.nota_recepcion ? 'Ver nota' : '') : '';
    const h = motivoFalta ? 24 : 18;
    if (y - h < MARGIN + 130) { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
    if (i % 2) page.drawRectangle({ x: MARGIN, y: y - h, width: w, height: h, color: rgb(0.96, 0.97, 0.97) });
    const vals = [desc, it.articulo?.unidad || '', num(it.cantidad_solicitada), num(it.cantidad_entregada), num(it.cantidad_devuelta), num(it.cantidad_recibida), falta];
    cx = MARGIN;
    vals.forEach((t, k) => {
      page.drawText(t, { x: cx + 4, y: y - 12, size: k === 0 ? 7.5 : 8, font: k === 0 ? font : bold, color: k === 6 && t !== '—' ? ROJO : NAVY, maxWidth: w * cols[k].w - 8 });
      cx += w * cols[k].w;
    });
    if (motivoFalta) {
      page.drawText(motivoFalta, { x: MARGIN + w * (1 - cols[6].w) + 4, y: y - 20, size: 6.5, font, color: ROJO, maxWidth: w * cols[6].w - 6 });
    }
    page.drawLine({ start: { x: MARGIN, y: y - h }, end: { x: MARGIN + w, y: y - h }, thickness: 0.4, color: GRAY_LINE });
    y -= h;
  });
  y -= 14;
  [['Entrega', v.nota_entrega], ['Devolución', v.nota_devolucion], ['Recepción', v.nota_recepcion], ['Rechazo', v.motivo_rechazo]]
    .filter(([, t]) => t)
    .forEach(([k, t]) => { page.drawText(`${k}: ${t}`, { x: MARGIN, y, size: 8, font, color: NAVY, maxWidth: w }); y -= 13; });
  // Notas del almacén por concepto, cuando lo recibido no cuadró.
  v.items.filter((it) => it.nota_recepcion).forEach((it) => {
    page.drawText(`Recepción · ${it.articulo?.descripcion || ''}: ${it.nota_recepcion}`, { x: MARGIN, y, size: 8, font, color: NAVY, maxWidth: w }); y -= 13;
  });
  const fotos = [
    v.fotos_entrega?.length ? `${v.fotos_entrega.length} de la entrega` : '',
    v.fotos_devolucion?.length ? `${v.fotos_devolucion.length} de la devolución` : '',
  ].filter(Boolean).join(' · ');
  if (fotos) { page.drawText(`Fotos de evidencia: ${fotos} (en la app)`, { x: MARGIN, y, size: 8, font, color: GRAY_TEXT }); y -= 13; }

  // Las dos firmas: el técnico al recibir y el almacén al aceptar la devolución.
  y -= 10;
  const boxW = (w - 20) / 2, boxH = 70;
  async function firma(x: number, titulo: string, quien: string, png: string | null | undefined) {
    page.drawText(titulo, { x, y, size: 6.5, font: bold, color: GRAY_TEXT });
    page.drawText(quien, { x, y: y - 11, size: 9, font, color: NAVY, maxWidth: boxW });
    page.drawRectangle({ x, y: y - 20 - boxH, width: boxW, height: boxH, borderColor: GRAY_LINE, borderWidth: 0.75 });
    if (png?.startsWith('data:image')) {
      try {
        const img = await pdf.embedPng(Uint8Array.from(Buffer.from(png.split(',')[1], 'base64')));
        const s = Math.min((boxW - 10) / img.width, (boxH - 10) / img.height);
        page.drawImage(img, { x: x + (boxW - img.width * s) / 2, y: y - 20 - boxH + (boxH - img.height * s) / 2, width: img.width * s, height: img.height * s });
        return;
      } catch { /* sin firma si falla */ }
    }
    page.drawText('Sin firma', { x: x + 8, y: y - 20 - boxH / 2, size: 8, font, color: GRAY_TEXT });
  }
  await firma(MARGIN, 'FIRMA DE RECIBIDO DEL TÉCNICO', `${v.tecnico || ''}${v.firmado_en ? ` · ${fecha(v.firmado_en)}` : ''}`, v.firma_recepcion);
  await firma(MARGIN + boxW + 20, 'FIRMA DEL ALMACÉN AL RECIBIR LA DEVOLUCIÓN',
    `${v.recibidoPor || ''}${v.firma_almacen_en ? ` · ${fecha(v.firma_almacen_en)}` : ''}`, v.firma_almacen);
  if (v.estado === 'cerrado') {
    page.drawText('Devolución revisada y aceptada por el almacén', { x: MARGIN, y: y - 20 - boxH - 14, size: 9, font: bold, color: VERDE });
  }

  page.drawText(`Generado el ${fecha(new Date().toISOString())} · ${MARCA.nombre} · Vale ${v.folio}`, { x: MARGIN, y: MARGIN / 2, size: 6.5, font, color: GRAY_TEXT });
  void TEAL_DARK;
  return pdf.save();
}
