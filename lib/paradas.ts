// Paradas que detecta el rastreo (GPS) fuera de un cliente y gastos con ticket.
//
// La regla vive en SQL (supabase/patch_paradas_gastos.sql): si el teléfono de
// la empresa se queda 5 minutos o más en un lugar que no es cliente ni de la
// empresa, a media ruta, el técnico dice qué fue. Combustible y compra de
// material son gastos: piden el monto y la foto del ticket (o explicar por
// qué no hubo). Aquí va solo la lógica pura; se prueba en lib/paradas.test.ts.

import { horaReloj } from './visitasExigibles';
import { textoDuracion } from './visitas';

export type MotivoParada =
  | 'combustible' | 'compra_material' | 'comida' | 'desayuno_tienda' | 'espera' | 'cliente' | 'otro'
  // Solo para el rato con el cliente después de la firma:
  | 'material_herramienta' | 'siguio_trabajando' | 'tramite_salida' | 'personal';
export type TipoGasto = 'combustible' | 'material';

export type InfoMotivoParada = {
  valor: MotivoParada;
  label: string;
  ejemplo: string;
  // Texto sobre el campo de detalle.
  pregunta: string;
  detalleObligatorio: boolean;
  // Si es un gasto, de qué tipo (pide monto y ticket).
  gasto: TipoGasto | null;
  // Comida y tráfico/espera no pasan por supervisión.
  sinAutorizacion: boolean;
  // Dónde se ofrece: a media ruta, con el cliente después de la firma, o en ambos.
  donde: 'ruta' | 'tras_firma' | 'ambos';
  // Después de la firma: si el rato sigue contando como servicio.
  esServicio?: boolean;
};

export const MOTIVOS_PARADA: InfoMotivoParada[] = [
  { valor: 'combustible', label: 'Combustible', ejemplo: 'Cargué gasolina', pregunta: 'Algo que agregar (opcional)', detalleObligatorio: false, gasto: 'combustible', sinAutorizacion: false, donde: 'ruta' },
  { valor: 'compra_material', label: 'Compra de material', ejemplo: 'Proveedor, ferretería, recoger pedido', pregunta: '¿Qué material compraste o recogiste?', detalleObligatorio: true, gasto: 'material', sinAutorizacion: false, donde: 'ruta' },
  { valor: 'comida', label: 'Comida', ejemplo: 'Hora de comida', pregunta: 'Algo que agregar (opcional)', detalleObligatorio: false, gasto: null, sinAutorizacion: true, donde: 'ambos' },
  // Cuenta como comida (se descuenta de la hora de comida del día).
  { valor: 'desayuno_tienda', label: 'Desayuno o tienda', ejemplo: 'Desayuno, tienda, café', pregunta: 'Algo que agregar (opcional)', detalleObligatorio: false, gasto: null, sinAutorizacion: true, donde: 'ruta' },
  { valor: 'material_herramienta', label: 'Material y herramienta', ejemplo: 'Cargar o guardar material', pregunta: 'Algo que agregar (opcional)', detalleObligatorio: false, gasto: null, sinAutorizacion: true, donde: 'tras_firma', esServicio: true },
  { valor: 'siguio_trabajando', label: 'Seguí trabajando', ejemplo: 'Un pendiente del cliente', pregunta: '¿Qué quedó pendiente? (opcional)', detalleObligatorio: false, gasto: null, sinAutorizacion: true, donde: 'tras_firma', esServicio: true },
  { valor: 'tramite_salida', label: 'Salida de la planta', ejemplo: 'Vigilancia, revisión, permisos', pregunta: 'Algo que agregar (opcional)', detalleObligatorio: false, gasto: null, sinAutorizacion: true, donde: 'tras_firma', esServicio: true },
  { valor: 'espera', label: 'Tráfico o espera', ejemplo: 'Tráfico, esperar a alguien', pregunta: 'Algo que agregar (opcional)', detalleObligatorio: false, gasto: null, sinAutorizacion: true, donde: 'ambos' },
  { valor: 'personal', label: 'Asunto personal', ejemplo: 'Llamada, trámite propio', pregunta: 'Algo que agregar (opcional)', detalleObligatorio: false, gasto: null, sinAutorizacion: true, donde: 'tras_firma' },
  { valor: 'cliente', label: 'Con un cliente', ejemplo: 'Cliente sin ubicación en la app', pregunta: '¿Con qué cliente estabas?', detalleObligatorio: true, gasto: null, sinAutorizacion: false, donde: 'ruta' },
  { valor: 'otro', label: 'Otro', ejemplo: 'Explica qué fue', pregunta: 'Explica qué pasó', detalleObligatorio: true, gasto: null, sinAutorizacion: false, donde: 'ambos' },
];

// Los motivos que se ofrecen para esta parada.
export function motivosDeParada(parada: { reporte_id?: string | null }): InfoMotivoParada[] {
  const lugar = parada.reporte_id ? 'tras_firma' : 'ruta';
  return MOTIVOS_PARADA.filter((m) => m.donde === 'ambos' || m.donde === lugar);
}

// Motivo ya marcado al abrir: después de la firma, media hora o más a la
// hora de comida (13:00 a 16:00) casi siempre es la comida. Solo se confirma.
export function motivoSugerido(parada: { reporte_id?: string | null; inicio: string; fin: string; minutos: number }): MotivoParada | '' {
  if (!parada.reporte_id || parada.minutos < 30) return '';
  const inicio = horaReloj(parada.inicio);
  const fin = horaReloj(parada.fin);
  if (inicio < '16:00' && fin > '13:00') return 'comida';
  return '';
}

export function infoMotivoParada(motivo: string | null | undefined): InfoMotivoParada | null {
  return MOTIVOS_PARADA.find((m) => m.valor === motivo) || null;
}

// Una fila de paradas_por_revisar().
export type Parada = {
  id: string;
  tecnico_id: string;
  tecnico: string | null;
  fecha: string;
  inicio: string; // ISO
  fin: string;
  minutos: number;
  lat: number;
  lng: number;
  sin_senal: number;
  motivo: MotivoParada | null;
  detalle: string | null;
  // null = sin justificar.
  estado: 'pendiente' | 'aprobada' | 'rechazada' | null;
  justifico: string | null;
  justificado_en: string | null;
  reviso: string | null;
  revisado_en: string | null;
  monto: number | null;
  fotos: string[] | null;
  sin_ticket: boolean | null;
  motivo_sin_ticket: string | null;
  // Si fue el rato con un cliente después de que firmó el reporte.
  reporte_id?: string | null;
  cliente?: string | null;
};

// «En MAQUISA, después de que firmó el reporte» o null si fue a media ruta.
export function textoTrasFirma(parada: { reporte_id?: string | null; cliente?: string | null }): string | null {
  if (!parada.reporte_id) return null;
  return `En ${parada.cliente || 'el cliente'}, después de que firmó el reporte`;
}

// Motivos que se descuentan de la hora de comida.
export function esComida(motivo: string | null | undefined): boolean {
  return motivo === 'comida' || motivo === 'desayuno_tienda';
}

// Lo que se captura del gasto antes de subirlo.
export type DatosGasto = { monto: number; fotos: File[]; sinTicket: boolean; motivoSinTicket: string };
export const GASTO_VACIO: DatosGasto = { monto: 0, fotos: [], sinTicket: false, motivoSinTicket: '' };
export const FOTOS_MAXIMO = 6;
export const MONTO_MAXIMO = 200000;

// Revisa el gasto. Devuelve el mensaje de error o null.
export function errorDeGasto(gasto: DatosGasto): string | null {
  if (!(gasto.monto > 0)) return 'Escribe cuánto se gastó.';
  if (gasto.monto > MONTO_MAXIMO) return 'El monto es demasiado alto. Revísalo.';
  if (gasto.fotos.length > FOTOS_MAXIMO) return `Máximo ${FOTOS_MAXIMO} fotos de ticket.`;
  if (gasto.sinTicket) {
    const texto = gasto.motivoSinTicket.trim();
    if (texto.length < 5) return 'Explica por qué no hay ticket.';
    if (texto.length > 500) return 'La explicación es muy larga (máximo 500 letras).';
    return null;
  }
  if (gasto.fotos.length === 0) return 'Agrega la foto del ticket, o marca «No me dieron ticket» y explica por qué.';
  return null;
}

// Revisa la justificación completa (motivo, detalle y, si aplica, el gasto).
export function errorDeParada(motivo: string, detalle: string, gasto: DatosGasto): string | null {
  const info = infoMotivoParada(motivo);
  if (!info) return 'Elige qué fue la parada.';
  const texto = detalle.trim();
  if (info.detalleObligatorio && texto.length < 3) return info.pregunta;
  if (texto.length > 500) return 'La explicación es muy larga (máximo 500 letras).';
  if (info.gasto) return errorDeGasto(gasto);
  return null;
}

// Las que le toca justificar al técnico: sin justificar o rechazadas.
export function paradasPorJustificar<T extends { estado: string | null }>(paradas: T[]): T[] {
  return paradas.filter((p) => p.estado === null || p.estado === 'rechazada');
}

// «10:12 – 10:21 · 9 min»
export function textoHorarioParada(parada: { inicio: string; fin: string; minutos: number }): string {
  return `${horaReloj(parada.inicio)} – ${horaReloj(parada.fin)} · ${textoDuracion(parada.minutos)}`;
}

export function textoMonto(monto: number): string {
  return '$' + monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function enlaceMapa(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

// Lo que se manda a la base como p_gasto (las fotos ya subidas).
export function gastoParaEnviar(gasto: DatosGasto, rutasFotos: string[]) {
  return {
    monto: Math.round(gasto.monto * 100) / 100,
    fotos: gasto.sinTicket ? [] : rutasFotos,
    sin_ticket: gasto.sinTicket,
    motivo_sin_ticket: gasto.sinTicket ? gasto.motivoSinTicket.trim() : null,
  };
}

// Texto del aviso (push) al técnico.
export function mensajeParadasPendientes(cuantas: number): { titulo: string; cuerpo: string } {
  return {
    titulo: cuantas === 1 ? 'Tienes 1 parada por justificar' : `Tienes ${cuantas} paradas por justificar`,
    cuerpo: 'Di qué fue (combustible, material, comida, desayuno…). Si hubo gasto, sube la foto del ticket.',
  };
}

// Aviso (push) en cuanto se detecta el rato de más después de la firma.
export function mensajeTrasFirma(cliente: string | null, minutos: number): { titulo: string; cuerpo: string } {
  return {
    titulo: `Te quedaste ${textoDuracion(minutos)} más en ${cliente || 'el cliente'}`,
    cuerpo: 'Después de la firma. ¿Qué fue? Comida, material, seguiste trabajando… Toca para decirlo.',
  };
}
