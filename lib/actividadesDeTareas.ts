import { hoyLocal } from './fechaHoy';

// Convierte la lista de tareas de un servicio en las «actividades realizadas»
// del reporte, para que el técnico no tenga que volver a escribirlas.

export type TareaParaActividad = {
  id: string;
  descripcion: string;
  completada: boolean;
  avance_pct: number;
  completada_en: string | null;
};

// Un avance, foto o corrección registrada para una tarea en un día del
// proyecto (servicio_eventos con tarea_id). avance_pct es null cuando solo se
// ligó una foto sin decir cuánto se avanzó.
export type RegistroDeTarea = {
  tarea_id: string;
  servicio_id: string; // el día del proyecto
  fecha: string; // fecha de ese día (YYYY-MM-DD)
  avance_pct: number | null;
  created_at: string;
};

function enOrden(a: RegistroDeTarea, b: RegistroDeTarea): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  if (a.created_at === b.created_at) return 0;
  return a.created_at < b.created_at ? -1 : 1;
}

// El último porcentaje registrado en la lista (por fecha del día y luego por
// hora). Se usa el último y no el mayor para que una corrección del
// supervisor que baja el avance sí cuente. null si no hay porcentajes.
export function ultimoAvance(registros: RegistroDeTarea[]): number | null {
  const conPorcentaje = registros.filter((r) => r.avance_pct !== null).sort(enOrden);
  if (conPorcentaje.length === 0) return null;
  return conPorcentaje[conPorcentaje.length - 1].avance_pct;
}

// Qué se trabajó de cada tarea en UN día, con el avance que quedó al cierre
// de ESE día (no el de hoy): así un reporte hecho después dice lo que de
// verdad se llevaba ese día.
//  - completada ese día → «Tarea»
//  - avanzó ese día → «Tarea (avance 50%)»
//  - solo se le tomó foto ese día → con el avance que ya traía
//  - terminada en un día anterior, o sin registros ese día → no entra
export function actividadesDelDia(
  tareas: TareaParaActividad[],
  registros: RegistroDeTarea[],
  dia: { id: string; fecha: string },
): string[] {
  return Array.from(actividadesDelDiaPorTarea(tareas, registros, dia).values());
}

// Lo mismo, con la línea de cada tarea por su id (en el orden de la lista).
export function actividadesDelDiaPorTarea(
  tareas: TareaParaActividad[],
  registros: RegistroDeTarea[],
  dia: { id: string; fecha: string },
): Map<string, string> {
  const porTarea = new Map<string, string>();
  for (const t of tareas) {
    const linea = lineaDelDia(t, registros.filter((r) => r.tarea_id === t.id), dia);
    if (linea) porTarea.set(t.id, linea);
  }
  return porTarea;
}

function lineaDelDia(t: TareaParaActividad, registros: RegistroDeTarea[], dia: { id: string; fecha: string }): string | null {
  const delDia = registros.filter((r) => r.servicio_id === dia.id);
  if (delDia.length === 0) {
    // Tareas cerradas antes de que el avance se guardara por día: solo se
    // sabe la fecha en que se completaron.
    const completadaEseDia = t.completada && !!t.completada_en && hoyLocal(new Date(t.completada_en)) === dia.fecha;
    return completadaEseDia ? t.descripcion : null;
  }

  // Si el técnico no estuvo en los días anteriores no ve sus registros; en
  // ese caso basta saber si la tarea ya estaba completada antes de este día.
  const completadaAntes = t.completada && !!t.completada_en && hoyLocal(new Date(t.completada_en)) < dia.fecha;
  const avanceAntes = ultimoAvance(registros.filter((r) => r.fecha < dia.fecha)) ?? (completadaAntes ? 100 : 0);
  if (avanceAntes >= 100) return null;

  const avanceDelDia = ultimoAvance(delDia);
  if (avanceDelDia === null) {
    // Solo fotos ese día, sin porcentaje nuevo.
    if (avanceAntes > 0) return `${t.descripcion} (avance ${avanceAntes}%)`;
    return `${t.descripcion} (en proceso)`;
  }
  if (avanceDelDia >= 100) return t.descripcion;
  if (avanceDelDia > 0) return `${t.descripcion} (avance ${avanceDelDia}%)`;
  // Corregido a 0%: ese día no se trabajó.
  return null;
}

// ¿De qué tarea es esta línea de actividades? Las líneas que salen de las
// tareas son «Tarea» o «Tarea (…)». Se buscan también las descripciones
// anteriores, por si el supervisor le cambió el nombre a la tarea.
function tareaDeLinea(linea: string, descripciones: Map<string, string[]>): string | null {
  const texto = linea.trim();
  for (const [tareaId, nombres] of descripciones) {
    for (const nombre of nombres) {
      if (texto === nombre || texto.startsWith(`${nombre} (`)) return tareaId;
    }
  }
  return null;
}

// Actualiza las actividades que ya tiene un reporte con las líneas nuevas de
// las tareas, sin tocar lo que el técnico escribió a mano:
//  - la línea de una tarea se reemplaza por su versión nueva en el mismo lugar
//  - si la tarea ya no aplica a ese día, su línea se quita
//  - las tareas que faltaban se agregan al final
export function fusionarActividades(
  actuales: string[],
  descripciones: Map<string, string[]>,
  nuevas: Map<string, string>,
): string[] {
  const resultado: string[] = [];
  const yaPuestas = new Set<string>();
  for (const linea of actuales) {
    const tareaId = tareaDeLinea(linea, descripciones);
    if (tareaId === null) {
      if (linea.trim()) resultado.push(linea);
      continue;
    }
    const nueva = nuevas.get(tareaId);
    if (nueva && !yaPuestas.has(tareaId)) {
      resultado.push(nueva);
      yaPuestas.add(tareaId);
    }
  }
  for (const [tareaId, linea] of nuevas) {
    if (!yaPuestas.has(tareaId)) resultado.push(linea);
  }
  return resultado;
}
