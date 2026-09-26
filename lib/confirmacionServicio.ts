import { sumarDias } from './fechaHoy';

// Reglas de los recordatorios de "Enterado" (los usa el cron cada 10 min).
//
// Al técnico, una sola vez por asignación:
//   · servicio de mañana → a partir de las 18:00 de hoy;
//   · servicio de hoy    → ya;
//   y en ambos casos, al menos 1 h después de asignado (para darle tiempo
//   de verlo solo). Servicios más lejanos esperan a la víspera.
// A los supervisores, una sola vez: 1 h después del recordatorio si sigue
// sin confirmar.
// Nada se envía de noche (21:00 a 07:00): se espera a la mañana.

export const HORA_VISPERA_MIN = 18 * 60;
export const MARGEN_MS = 60 * 60 * 1000;
export const HORARIO_ENVIO_MIN = { desde: 7 * 60, hasta: 21 * 60 };

export function dentroDeHorario(horaMin: number): boolean {
  return horaMin >= HORARIO_ENVIO_MIN.desde && horaMin < HORARIO_ENVIO_MIN.hasta;
}

export function tocaRecordarTecnico(p: {
  fecha: string;
  asignadoEn: string;
  hoy: string;
  horaMin: number;
  ahoraMs: number;
}): boolean {
  if (!dentroDeHorario(p.horaMin)) return false;
  if (p.ahoraMs < new Date(p.asignadoEn).getTime() + MARGEN_MS) return false;
  if (p.fecha === p.hoy) return true;
  return p.fecha === sumarDias(p.hoy, 1) && p.horaMin >= HORA_VISPERA_MIN;
}

export function tocaAvisarSupervisores(p: { recordatorioEn: string | null; horaMin: number; ahoraMs: number }): boolean {
  if (!p.recordatorioEn || !dentroDeHorario(p.horaMin)) return false;
  return p.ahoraMs >= new Date(p.recordatorioEn).getTime() + MARGEN_MS;
}
