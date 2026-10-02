import { createClient } from './supabaseClient';

// Rutinas de tareas para mantenimientos (patch_rutinas_tareas.sql): listas
// por etapas que se cargan al agendar un servicio.

export type SeccionRutina = { titulo: string; tareas: string[] };
export type Rutina = {
  id: string;
  nombre: string;
  sistema: string | null;
  descripcion: string | null;
  secciones: SeccionRutina[];
  activo: boolean;
  updated_at: string;
};

export const SISTEMAS_RUTINA = ['General', 'CCTV', 'Detección de incendio', 'Supresión', 'Control de acceso', 'Alarma de intrusión', 'Redes', 'Automatización', 'Energía solar'];
export const ETAPAS_SUGERIDAS = ['Antes de iniciar', 'Pruebas con equipos', 'Inspección visual', 'Medición de parámetros', 'Cierre'];

export function tareasDeRutina(r: Pick<Rutina, 'secciones'>): string[] {
  return r.secciones.flatMap((s) => s.tareas.map((t) => t.trim()).filter(Boolean));
}

export async function listarRutinas(): Promise<Rutina[]> {
  const { data, error } = await createClient()
    .from('rutinas_tareas')
    .select('id, nombre, sistema, descripcion, secciones, activo, updated_at')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return ((data as Rutina[]) || []).map((r) => ({ ...r, secciones: Array.isArray(r.secciones) ? r.secciones : [] }));
}

export async function guardarRutina(r: { id?: string; nombre: string; sistema: string | null; descripcion: string | null; secciones: SeccionRutina[] }): Promise<string> {
  const supabase = createClient();
  const fila = {
    nombre: r.nombre.trim(),
    sistema: r.sistema?.trim() || null,
    descripcion: r.descripcion?.trim() || null,
    secciones: r.secciones
      .map((s) => ({ titulo: s.titulo.trim() || 'Tareas', tareas: s.tareas.map((t) => t.trim()).filter(Boolean) }))
      .filter((s) => s.tareas.length > 0),
    updated_at: new Date().toISOString(),
  };
  if (r.id) {
    const { error } = await supabase.from('rutinas_tareas').update(fila).eq('id', r.id);
    if (error) throw error;
    return r.id;
  }
  const { data, error } = await supabase.from('rutinas_tareas').insert(fila).select('id').single();
  if (error) throw error;
  return data.id as string;
}

// Se desactiva en vez de borrar: los recurrentes que la usan no se rompen.
export async function eliminarRutina(id: string): Promise<void> {
  const { error } = await createClient().from('rutinas_tareas').update({ activo: false }).eq('id', id);
  if (error) throw error;
}
