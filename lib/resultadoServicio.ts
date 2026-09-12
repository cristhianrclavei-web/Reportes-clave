import { Servicio, ProgresoTareas } from './serviciosProgramados';

// Cómo cerró un servicio. Un servicio concluido puede tener DOS problemas
// distintos y acumulables:
//   - incompleto: quedaron tareas del checklist sin terminar
//   - retrasado:  se pasó del tiempo estimado
// Si no tiene ninguno, cerró "en tiempo y forma".
//
// Matiz importante de proyectos multi-día: como el checklist es compartido,
// que el día 2 de 5 cierre con tareas pendientes es lo ESPERADO, no una
// falla. Por eso "incompleto" solo se evalúa en el último día del proyecto
// (o en servicios de un solo día). El retraso sí se evalúa día por día,
// porque cada día tiene su propia duración estimada.

export type MarcaResultado = 'completo' | 'incompleto' | 'retrasado';

export type ResultadoServicio = {
  marcas: MarcaResultado[]; // vacío si el servicio aún no concluye
  retrasoMin: number | null;
  pendientes: number;
};

export function calcularResultadoServicio(
  servicio: Pick<Servicio, 'estado' | 'hora_llegada' | 'hora_inicio' | 'hora_fin' | 'duracion_estimada_min' | 'numero_dia' | 'dias_totales'>,
  progreso?: ProgresoTareas | null
): ResultadoServicio {
  if (servicio.estado !== 'concluido') {
    return { marcas: [], retrasoMin: null, pendientes: 0 };
  }

  // ¿Se pasó del tiempo estimado?
  let retrasoMin: number | null = null;
  const inicio = servicio.hora_inicio || servicio.hora_llegada;
  if (inicio && servicio.hora_fin) {
    const min = Math.round((new Date(servicio.hora_fin).getTime() - new Date(inicio).getTime()) / 60000);
    const exceso = min - servicio.duracion_estimada_min;
    if (exceso > 0) retrasoMin = exceso;
  }

  // ¿Quedaron tareas sin terminar? Solo cuenta en el último día.
  const esUltimoDia = servicio.numero_dia >= servicio.dias_totales;
  const pendientes = progreso && progreso.total > 0 ? progreso.total - progreso.completadas : 0;
  const incompleto = esUltimoDia && pendientes > 0;

  const marcas: MarcaResultado[] = [];
  if (incompleto) marcas.push('incompleto');
  if (retrasoMin !== null) marcas.push('retrasado');
  if (marcas.length === 0) marcas.push('completo');

  return { marcas, retrasoMin, pendientes };
}
