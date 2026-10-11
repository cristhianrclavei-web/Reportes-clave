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

// Entran las tareas que se trabajaron ESE día (en proyectos de varios días
// la lista es compartida): las que se completaron en esa fecha y las que
// tuvieron un avance o una foto ese día. Las que siguen a medias llevan su
// porcentaje, para que el reporte no diga que se terminó algo que no.
export function actividadesDesdeTareas(
  tareas: TareaParaActividad[],
  conEventoEseDia: Set<string>,
  fecha: string,
): string[] {
  const actividades: string[] = [];
  for (const t of tareas) {
    const completadaEseDia = t.completada && !!t.completada_en && hoyLocal(new Date(t.completada_en)) === fecha;
    if (!completadaEseDia && !conEventoEseDia.has(t.id)) continue;
    actividades.push(t.completada ? t.descripcion : `${t.descripcion} (avance ${t.avance_pct}%)`);
  }
  return actividades;
}
