// Días de un proyecto al programarlo. Por defecto todos comparten el
// horario general y sus fechas van corridas; el supervisor puede cambiarle a
// un día suelto la fecha, la llegada o la salida (por ejemplo: el día 1 de
// 11:00 a 15:00 y el día 2 de 9:00 a 17:00).

// Lo que el supervisor cambió en un día; lo que no esté, sigue al general.
export type AjusteDia = { fecha?: string; llegada?: string; salida?: string };

export type DiaProyecto = {
  fecha: string;
  llegada: string; // 'HH:MM' o '' si no se acordó hora
  salida: string;
  duracionMin: number;
  personalizado: boolean; // tiene algún ajuste propio
};

export type HorarioGeneral = { llegada: string; salida: string; duracionMin: number };

function minutosDelDia(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

// Con llegada y salida, la duración es la diferencia; si falta alguna, se
// usa la duración general.
function duracionDe(llegada: string, salida: string, general: number): number {
  if (!llegada || !salida) return general;
  let minutos = minutosDelDia(salida) - minutosDelDia(llegada);
  if (minutos <= 0) minutos += 24 * 60; // cruza medianoche
  return minutos;
}

export function armarDiasDelProyecto(
  fechasBase: string[],
  general: HorarioGeneral,
  ajustes: Record<number, AjusteDia>,
): DiaProyecto[] {
  return fechasBase.map((fechaBase, i) => {
    const ajuste = ajustes[i] || {};
    const llegada = ajuste.llegada ?? general.llegada;
    const salida = ajuste.salida ?? general.salida;
    const cambioHorario = ajuste.llegada !== undefined || ajuste.salida !== undefined;
    return {
      fecha: ajuste.fecha || fechaBase,
      llegada,
      salida,
      // Un día sin cambio de horario conserva la duración general tal cual
      // (puede haberse capturado a mano, sin horas).
      duracionMin: cambioHorario ? duracionDe(llegada, salida, general.duracionMin) : general.duracionMin,
      personalizado: Object.keys(ajuste).length > 0,
    };
  });
}

// Mensaje de lo primero que esté mal, o null si los días se pueden guardar.
export function errorEnDias(dias: DiaProyecto[]): string | null {
  if (dias.length === 0 || dias.some((d) => !d.fecha)) return 'Falta indicar la fecha de cada día.';
  const fechas = dias.map((d) => d.fecha);
  if (new Set(fechas).size !== fechas.length) return 'Hay fechas repetidas. Cada día debe tener una fecha distinta.';
  return null;
}
