// En qué se va el tiempo del equipo: horas-persona en servicios programados
// y en cada tipo de actividad de bitácora, dentro de un rango de fechas.
// Puro; las fechas son de calendario (AAAA-MM-DD) y `fechaDe` convierte un
// instante a la fecha local de quien lo ve.

import { TipoActividad, tipoActividad } from './tiposActividad';

export type ClaseTiempo = 'servicio' | TipoActividad;

type ServicioTiempo = {
  fecha: string; estado: string;
  hora_llegada: string | null; hora_inicio: string | null; hora_fin: string | null;
  minutos_pausados?: number | null;
  tecnicos?: string[];
};
type ActividadTiempo = { hora_inicio: string; hora_fin: string | null; tipo?: string | null; cierre_automatico?: boolean };

// Más de 16 h en un solo registro es un cierre olvidado, no trabajo.
const TOPE_MIN = 16 * 60;

export function tiempoDelEquipo(
  servicios: ServicioTiempo[],
  actividades: ActividadTiempo[],
  desde: string,
  hasta: string,
  fechaDe: (iso: string) => string,
): { clase: ClaseTiempo; minutos: number }[] {
  const suma = new Map<ClaseTiempo, number>();
  const agregar = (clase: ClaseTiempo, min: number) => {
    if (min > 0 && min <= TOPE_MIN) suma.set(clase, (suma.get(clase) || 0) + min);
  };

  servicios.forEach((s) => {
    if (s.estado !== 'concluido' || s.fecha < desde || s.fecha > hasta) return;
    const ini = s.hora_llegada || s.hora_inicio;
    if (!ini || !s.hora_fin) return;
    const min = (new Date(s.hora_fin).getTime() - new Date(ini).getTime()) / 60000 - (s.minutos_pausados || 0);
    // Horas-persona: el servicio lo trabajó toda su cuadrilla.
    agregar('servicio', Math.round(min) * Math.max(1, s.tecnicos?.length || 1));
  });

  actividades.forEach((a) => {
    // Sin hora de fin confiable no se sabe cuánto duró.
    if (!a.hora_fin || a.cierre_automatico) return;
    const f = fechaDe(a.hora_inicio);
    if (f < desde || f > hasta) return;
    agregar(tipoActividad(a.tipo).clave, Math.round((new Date(a.hora_fin).getTime() - new Date(a.hora_inicio).getTime()) / 60000));
  });

  return [...suma.entries()].map(([clase, minutos]) => ({ clase, minutos })).sort((x, y) => y.minutos - x.minutos);
}
