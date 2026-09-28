// Etiqueta de mantenimiento que se pega en el equipo: una por formato, con
// QR a /verificar/<token> para que un auditor compruebe el servicio.
//
// Dos tamaños:
//   · 'cinta24': tira para cinta laminada de 24 mm (Brother P-touch TZe).
//   · 'ancha62': etiqueta de 62 × 40 mm (rollo DK de 62 mm de las Brother
//     QL o papel de 58/62 mm de las portátiles RJ).
// Ambas en una sola tinta (negro sobre blanco): el resultado se distingue
// por texto, no por color.

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

export type TamanoEtiqueta = 'cinta24' | 'ancha62';

export const TAMANOS: { key: TamanoEtiqueta; label: string; detalle: string }[] = [
  { key: 'ancha62', label: 'Ancha 62 mm', detalle: 'Brother QL / RJ, rollo de 62 mm' },
  { key: 'cinta24', label: 'Cinta 24 mm', detalle: 'Brother P-touch, cinta TZe' },
];

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
export async function generarEtiqueta(d: DatosEtiqueta, tamano: TamanoEtiqueta = 'ancha62'): Promise<Blob> {
  if (tamano === 'ancha62') return generarAncha(d);
  return generarCinta(d);
}

async function dibujarQR(token: string, size: number): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  await QRCode.toCanvas(c, urlVerificacion(token), {
    width: size,
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
  return c;
}

const FUENTE = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function recortador() {
  const medir = document.createElement('canvas').getContext('2d')!;
  return (texto: string, font: string, max: number): string => {
    medir.font = font;
    if (medir.measureText(texto).width <= max) return texto;
    let t = texto;
    while (t.length > 1 && medir.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  };
}

function aBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la etiqueta'))), 'image/png')
  );
}

// 62 × 40 mm a ~20 px/mm: encabezado con la marca, QR grande a la
// izquierda y los datos a la derecha, en renglones con su etiqueta.
async function generarAncha(d: DatosEtiqueta): Promise<Blob> {
  const W = 1240;
  const H = 800;
  const pad = 36;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const recortar = recortador();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'alphabetic';

  // Encabezado: banda negra con la marca y el tipo de servicio.
  const bandaH = 104;
  ctx.fillRect(0, 0, W, bandaH);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 50px ${FUENTE}`;
  ctx.fillText('MANTENIMIENTO PREVENTIVO', pad, 68);
  ctx.font = `700 30px ${FUENTE}`;
  const marca = MARCA.nombre.toUpperCase();
  ctx.fillText(marca, W - pad - ctx.measureText(marca).width, 66);

  // QR
  const qrSize = 470;
  const qr = await dibujarQR(d.token, qrSize);
  const qrY = bandaH + pad;
  ctx.drawImage(qr, pad, qrY, qrSize, qrSize);
  ctx.fillStyle = '#000000';
  ctx.font = `600 24px ${FUENTE}`;
  const leyenda = 'Escanea para verificar';
  ctx.fillText(leyenda, pad + (qrSize - ctx.measureText(leyenda).width) / 2, qrY + qrSize + 32);

  // Datos
  const x = pad + qrSize + 40;
  const maxW = W - x - pad;
  let y = bandaH + pad + 8;

  // Resultado en negativo.
  const resultado = resultadoEtiqueta(d.formato);
  ctx.font = `800 46px ${FUENTE}`;
  const rw = ctx.measureText(resultado).width + 40;
  ctx.fillRect(x, y, Math.min(rw, maxW), 70);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(recortar(resultado, ctx.font, maxW - 40), x + 20, y + 51);
  ctx.fillStyle = '#000000';
  y += 70 + 44;

  // Sistema: hasta dos renglones.
  ctx.font = `800 40px ${FUENTE}`;
  const palabras = sistemaCorto(d.formato).split(' ');
  const renglones: string[] = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > maxW && actual) {
      renglones.push(actual);
      actual = p;
    } else {
      actual = prueba;
    }
  }
  if (actual) renglones.push(actual);
  renglones.slice(0, 2).forEach((r, i) => {
    const t = i === 1 && renglones.length > 2 ? recortar(renglones.slice(1).join(' '), ctx.font, maxW) : r;
    ctx.fillText(t, x, y);
    y += 46;
  });
  y -= 30;

  const proximo = proximoServicio(d.fecha, d.formato.puntos.map((p) => p.frecuencia));
  const filas: [string, string][] = [
    ['Cliente', d.cliente || '—'],
    ['Realizado', fechaDMA(d.fecha)],
    ['Próximo', proximo ? fechaDMA(proximo) : '—'],
    ['Técnico', d.tecnico || '—'],
  ];
  if (d.folio) filas.push(['Folio', d.folio]);
  const altoFila = filas.length > 4 ? 74 : 84;
  filas.forEach(([label, valor]) => {
    y += altoFila;
    ctx.font = `600 26px ${FUENTE}`;
    ctx.fillText(label.toUpperCase(), x, y - 30);
    ctx.font = `700 34px ${FUENTE}`;
    ctx.fillText(recortar(valor, ctx.font, maxW), x, y + 4);
    // Línea fina bajo cada dato, estilo formulario.
    ctx.fillRect(x, y + 14, maxW, 2);
  });

  return aBlob(canvas);
}

async function generarCinta(d: DatosEtiqueta): Promise<Blob> {
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
