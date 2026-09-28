// Etiqueta de mantenimiento que se pega en el equipo: una por formato, con
// QR a /verificar/<token> para que un auditor compruebe el servicio.
//
// Pensada para cinta laminada de 24 mm (Brother P-touch TZe): se imprime en
// una sola tinta, así que todo va en negro sobre blanco y el resultado se
// distingue por texto, no por color.

import QRCode from 'qrcode';
import { MARCA } from './marca';
import { FormatoLlenado, Frecuencia, resumenFormato } from './formatosMantenimiento';

const MESES: Record<Frecuencia, number> = { trimestral: 3, semestral: 6, anual: 12 };

// Nombre corto del sistema para la etiqueta.
const CORTO: Record<string, string> = {
  cctv: 'Videovigilancia (CCTV)',
  'deteccion-incendio': 'Detección y alarma de incendio',
  'agente-limpio': 'Supresión por agente limpio',
  'control-acceso': 'Control de acceso',
  intrusion: 'Alarma de intrusión',
  bms: 'Automatización (BMS)',
  'red-contra-incendio': 'Red contra incendio',
  'instalaciones-electricas': 'Instalaciones eléctricas',
  fotovoltaico: 'Sistema fotovoltaico',
};

export function sistemaCorto(f: { plantillaId?: string; titulo: string }): string {
  return (f.plantillaId && CORTO[f.plantillaId]) || f.titulo;
}

export function urlVerificacion(token: string): string {
  return `${MARCA.appUrl.replace(/\/$/, '')}/verificar/${token}`;
}

// «2026-09-27» → «27/09/2026». Solo con el texto: nada de Date para no
// depender de la zona horaria.
export function fechaDMA(fecha: string): string {
  const [y, m, d] = (fecha || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : fecha || '—';
}

// Siguiente servicio: la fecha más la frecuencia más corta del formato (en
// una visita anual de CCTV, los puntos trimestrales tocan en 3 meses).
export function proximoServicio(fecha: string, frecuencias: string[]): string | null {
  const meses = frecuencias.map((f) => MESES[f as Frecuencia]).filter(Boolean);
  const [y, m, d] = (fecha || '').split('-').map(Number);
  if (!meses.length || !y || !m || !d) return null;
  const total = y * 12 + (m - 1) + Math.min(...meses);
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, ultimo);
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

export function resultadoEtiqueta(f: FormatoLlenado): 'CUMPLE' | 'CON OBSERVACIONES' {
  return resumenFormato(f).noCumple === 0 ? 'CUMPLE' : 'CON OBSERVACIONES';
}

export type DatosEtiqueta = {
  formato: FormatoLlenado;
  token: string;
  cliente: string;
  fecha: string;
  tecnico: string;
  folio?: string;
};

// Dibuja la etiqueta en un canvas y la regresa como PNG. Alto fijo (la
// franja imprimible de la cinta) y ancho según el texto.
export async function generarEtiqueta(d: DatosEtiqueta): Promise<Blob> {
  const H = 360; // alto en px; la app de la impresora la escala a la cinta
  const pad = 14;
  const qrSize = H - pad * 2;
  const gap = 26;
  const maxTexto = H * 3.4;

  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, urlVerificacion(d.token), {
    width: qrSize,
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });

  const resultado = resultadoEtiqueta(d.formato);
  const proximo = proximoServicio(d.fecha, d.formato.puntos.map((p) => p.frecuencia));
  const fuente = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  const lineas: { texto: string; font: string; alto: number; caja?: boolean }[] = [
    { texto: 'MANTENIMIENTO PREVENTIVO', font: `800 44px ${fuente}`, alto: 58 },
    { texto: resultado, font: `800 38px ${fuente}`, alto: 60, caja: true },
    { texto: sistemaCorto(d.formato), font: `700 36px ${fuente}`, alto: 50 },
    { texto: d.cliente || '—', font: `500 34px ${fuente}`, alto: 48 },
    {
      texto: `Realizado ${fechaDMA(d.fecha)}${proximo ? `  ·  Próximo ${fechaDMA(proximo)}` : ''}`,
      font: `600 32px ${fuente}`,
      alto: 46,
    },
    {
      texto: [d.folio ? `Folio ${d.folio}` : null, d.tecnico ? `Téc. ${d.tecnico}` : null, MARCA.nombre].filter(Boolean).join('  ·  '),
      font: `500 28px ${fuente}`,
      alto: 40,
    },
  ];

  const medir = document.createElement('canvas').getContext('2d')!;
  function recortar(texto: string, font: string, max: number): string {
    medir.font = font;
    if (medir.measureText(texto).width <= max) return texto;
    let t = texto;
    while (t.length > 1 && medir.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }
  const textos = lineas.map((l) => recortar(l.texto, l.font, maxTexto));
  const anchoTexto = Math.max(
    ...lineas.map((l, i) => {
      medir.font = l.font;
      return medir.measureText(textos[i]).width + (l.caja ? 28 : 0);
    })
  );

  const W = Math.ceil(pad + qrSize + gap + anchoTexto + pad);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(qrCanvas, pad, pad, qrSize, qrSize);

  const x = pad + qrSize + gap;
  const altoTotal = lineas.reduce((s, l) => s + l.alto, 0);
  let y = Math.max(pad, (H - altoTotal) / 2);
  ctx.textBaseline = 'middle';
  lineas.forEach((l, i) => {
    ctx.font = l.font;
    const cy = y + l.alto / 2;
    if (l.caja) {
      // Resultado en negativo (blanco sobre negro) para que resalte.
      const w = ctx.measureText(textos[i]).width + 28;
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y + 4, w, l.alto - 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(textos[i], x + 14, cy + 1);
    } else {
      ctx.fillStyle = '#000000';
      ctx.fillText(textos[i], x, cy);
    }
    y += l.alto;
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la etiqueta'))), 'image/png')
  );
}
