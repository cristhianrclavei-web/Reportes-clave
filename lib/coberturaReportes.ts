import { sumarDias } from './fechaHoy';

// Cobertura diaria de reportes. La regla vive en SQL
// (supabase/patch_cobertura_reportes.sql → dias_sin_reporte): un día hábil,
// o un fin de semana con servicio programado, queda cubierto por un reporte o
// por una justificación. Aquí solo va lo que comparten el cron y la app.

// Primer día que cuenta. Los días anteriores no se cobran: no había forma de
// justificarlos cuando pasaron.
export const INICIO_COBERTURA = '2026-09-28';

// Hasta cuántos días atrás se sigue recordando un pendiente.
export const DIAS_ATRAS_MAXIMO = 30;

// Desde las 18:00 el día de hoy ya cuenta como pendiente (es cuando llega el
// primer aviso); antes, el técnico todavía está a tiempo.
export const HORA_CORTE_MIN = 18 * 60;

export type MotivoJustificacion = 'no_asisti' | 'sin_servicio' | 'festivo' | 'vacaciones' | 'otro';

export const MOTIVOS: { valor: MotivoJustificacion; label: string; detalle: string }[] = [
  { valor: 'sin_servicio', label: 'No salí a servicio', detalle: 'Estuve en oficina, almacén o sin asignación' },
  { valor: 'no_asisti', label: 'No asistí', detalle: 'Falta, incapacidad o permiso' },
  { valor: 'festivo', label: 'Día festivo', detalle: 'No se trabajó ese día' },
  { valor: 'vacaciones', label: 'Vacaciones', detalle: '' },
  { valor: 'otro', label: 'Otro', detalle: 'Especifica el motivo' },
];

export function inicioVentana(hoy: string): string {
  const hace = sumarDias(hoy, -DIAS_ATRAS_MAXIMO);
  return hace > INICIO_COBERTURA ? hace : INICIO_COBERTURA;
}

export function fechaCorta(fecha: string): string {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function listaFechas(fechas: string[]): string {
  const f = fechas.map(fechaCorta);
  if (f.length === 1) return f[0];
  return `${f.slice(0, -1).join(', ')} y ${f[f.length - 1]}`;
}

// Texto del push. 'tarde' = el día de hoy; 'manana' = días anteriores.
export function mensajePendiente(momento: 'tarde' | 'manana', fechas: string[]): { titulo: string; cuerpo: string } {
  const ordenadas = [...fechas].sort();
  if (momento === 'tarde') {
    return {
      titulo: 'Falta reporte de servicio',
      cuerpo: `Aún no hay reporte de hoy (${fechaCorta(ordenadas[0])}). Si no saliste a servicio, justifica el día.`,
    };
  }
  if (ordenadas.length <= 3) {
    return {
      titulo: `Falta reporte de servicio del ${listaFechas(ordenadas)}`,
      cuerpo: 'Haz el reporte o justifica el día desde la app.',
    };
  }
  return {
    titulo: `Faltan reportes de ${ordenadas.length} días`,
    cuerpo: `Desde el ${fechaCorta(ordenadas[0])}. Haz los reportes o justifica cada día desde la app.`,
  };
}

// Agrupa las filas de dias_sin_reporte por técnico.
export function agruparPorTecnico(filas: { tecnico_id: string; fecha: string }[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const f of filas) {
    const lista = mapa.get(f.tecnico_id) || [];
    lista.push(f.fecha);
    mapa.set(f.tecnico_id, lista);
  }
  return mapa;
}
