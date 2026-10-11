import { Servicio } from './serviciosProgramados';

// ¿Con este día quedó terminado TODO el servicio (no solo la jornada)?
//
// Lo usa el formulario del reporte para no preguntarle al técnico algo que
// el servicio ya sabe: de esto sale si el reporte pasa a «Por facturar».
//   · Día intermedio de un proyecto → no: falta trabajo en los días que siguen.
//     (Si se acabó antes, al cerrar se cancelan los días restantes y este
//     pasa a ser el último.)
//   · Último día (o servicio de un solo día) → sí, salvo que al cerrarlo se
//     haya dicho que quedó trabajo pendiente o que no se pudo trabajar.
export function servicioQuedoTerminado(s: Pick<Servicio, 'numero_dia' | 'dias_totales' | 'resultado'>): boolean {
  const esUltimoDia = s.numero_dia >= s.dias_totales;
  if (!esUltimoDia) return false;
  return s.resultado !== 'pendiente' && s.resultado !== 'no_realizado';
}
