import { createClient } from './supabaseClient';
import { getCurrentLocation } from './geolocation';

export type ActividadEvento = {
  id: string;
  actividad_id: string;
  tipo: 'avance' | 'pausa' | 'reanudacion' | 'cierre';
  nota: string | null;
  foto_path: string | null;
  ubicacion: { lat: number; lng: number; accuracy?: number } | null;
  created_at: string;
};

export type Actividad = {
  id: string;
  created_by: string;
  report_id: string | null;
  proyecto: string;
  titulo: string;
  estado: 'en_curso' | 'pausada' | 'concluida';
  hora_inicio: string;
  hora_fin: string | null;
  ubicacion_inicio: { lat: number; lng: number; accuracy?: number } | null;
  created_at: string;
};

export async function crearActividad(proyecto: string, titulo: string): Promise<Actividad> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const ubicacion = await getCurrentLocation();

  const { data, error } = await supabase
    .from('actividades')
    .insert({ created_by: user.id, proyecto, titulo, ubicacion_inicio: ubicacion })
    .select()
    .single();
  if (error) throw error;
  return data as Actividad;
}

export async function listarMisActividades(): Promise<Actividad[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('actividades')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Actividad[]) || [];
}

export async function obtenerActividad(id: string): Promise<{ actividad: Actividad; eventos: ActividadEvento[] }> {
  const supabase = createClient();
  const [{ data: actividad, error: e1 }, { data: eventos, error: e2 }] = await Promise.all([
    supabase.from('actividades').select('*').eq('id', id).single(),
    supabase.from('actividad_eventos').select('*').eq('actividad_id', id).order('created_at', { ascending: false }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { actividad: actividad as Actividad, eventos: (eventos as ActividadEvento[]) || [] };
}

async function subirFotoEvento(actividadId: string, file: File): Promise<string | null> {
  const supabase = createClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `actividades/${actividadId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('evidencias').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) return null;
  return path;
}

export async function agregarAvance(actividadId: string, nota: string, foto: File | null): Promise<ActividadEvento> {
  const supabase = createClient();
  const [ubicacion, foto_path] = await Promise.all([
    getCurrentLocation(),
    foto ? subirFotoEvento(actividadId, foto) : Promise.resolve(null),
  ]);
  const { data, error } = await supabase
    .from('actividad_eventos')
    .insert({ actividad_id: actividadId, tipo: 'avance', nota: nota.trim() || null, foto_path, ubicacion })
    .select()
    .single();
  if (error) throw error;
  return data as ActividadEvento;
}

async function cambiarEstado(actividadId: string, tipo: 'pausa' | 'reanudacion' | 'cierre', nota: string | null, nuevoEstado: Actividad['estado']) {
  const supabase = createClient();
  const ubicacion = await getCurrentLocation();

  const { error: e1 } = await supabase
    .from('actividad_eventos')
    .insert({ actividad_id: actividadId, tipo, nota, ubicacion });
  if (e1) throw e1;

  const patch: Record<string, any> = { estado: nuevoEstado };
  if (tipo === 'cierre') patch.hora_fin = new Date().toISOString();

  const { error: e2 } = await supabase.from('actividades').update(patch).eq('id', actividadId);
  if (e2) throw e2;
}

export const pausarActividad = (id: string, motivo: string) => cambiarEstado(id, 'pausa', motivo.trim() || null, 'pausada');
export const reanudarActividad = (id: string, nota: string = '') => cambiarEstado(id, 'reanudacion', nota.trim() || null, 'en_curso');
export const concluirActividad = (id: string, notaFinal: string = '') => cambiarEstado(id, 'cierre', notaFinal.trim() || null, 'concluida');
