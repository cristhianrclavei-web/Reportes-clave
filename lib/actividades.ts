import { reducirFoto } from './reducirFoto';
import { createClient } from './supabaseClient';
import { getCurrentLocation } from './geolocation';
import { notificar } from './push';
import { TipoActividad } from './tiposActividad';
import { VideoGrabado, subirVideo } from './videoEvidencia';

export type ActividadEvento = {
  id: string;
  actividad_id: string;
  tipo: 'avance' | 'pausa' | 'reanudacion' | 'cierre';
  nota: string | null;
  foto_path: string | null;
  // Evidencia en video (patch_video_evidencia.sql): foto_path es su portada.
  video_path?: string | null;
  video_duracion?: number | null;
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
  // patch_bitacora_tipos.sql. Las anteriores no tienen tipo (se leen como
  // «otro», lib/tiposActividad.ts).
  tipo?: TipoActividad | null;
  cliente_id?: string | null;
  // Quedó abierta al terminar el día y se cerró sola: falta que su dueño
  // confirme a qué hora terminó de verdad.
  cierre_automatico?: boolean;
};

export async function crearActividad(proyecto: string, titulo: string, extra: { tipo?: TipoActividad; clienteId?: string | null } = {}): Promise<Actividad> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const ubicacion = await getCurrentLocation();

  const { data, error } = await supabase
    .from('actividades')
    .insert({
      created_by: user.id, proyecto, titulo, ubicacion_inicio: ubicacion,
      ...(extra.tipo ? { tipo: extra.tipo, cliente_id: extra.clienteId || null } : {}),
    })
    .select()
    .single();
  if (error) throw error;

  const { data: perfil } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
  await notificar({
    destino: 'supervisores',
    tipo: 'bitacora_inicio',
    titulo: 'Actividad iniciada',
    mensaje: `${perfil?.full_name || 'Alguien del equipo'} abrió «${titulo}»${proyecto ? ` en ${proyecto}` : ''}`,
    url: '/dashboard',
    tag: 'bitacora',
  });

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
  file = await reducirFoto(file);
  const supabase = createClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `actividades/${actividadId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('evidencias').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) {
    // Antes esto devolvia null y el avance se guardaba sin foto sin avisar
    // a nadie. El tecnico creia haber documentado algo que no quedo. Ahora
    // se propaga: es preferible que el guardado falle a que mienta.
    throw new Error(`No se pudo subir la foto: ${error.message}`);
  }
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

// Video de evidencia: la portada va en foto_path y el video en video_path.
export async function agregarVideoAvance(actividadId: string, v: VideoGrabado): Promise<void> {
  const [ubicacion, foto_path, video_path] = await Promise.all([
    getCurrentLocation(),
    subirFotoEvento(actividadId, v.poster),
    subirVideo(`actividades/${actividadId}`, v.video),
  ]);
  const { error } = await createClient()
    .from('actividad_eventos')
    .insert({ actividad_id: actividadId, tipo: 'avance', nota: null, foto_path, video_path, video_duracion: v.dur, ubicacion });
  if (error) throw error;
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

  // Solo se avisa el cierre: pausas y reanudaciones son ruido diario.
  if (tipo === 'cierre') {
    const { data: { user } } = await supabase.auth.getUser();
    const [{ data: act }, { data: perfil }] = await Promise.all([
      supabase.from('actividades').select('titulo, proyecto').eq('id', actividadId).single(),
      user ? supabase.from('profiles').select('full_name').eq('id', user.id).single() : Promise.resolve({ data: null }),
    ]);
    await notificar({
      destino: 'supervisores',
      tipo: 'bitacora_fin',
      titulo: 'Actividad concluida',
      mensaje: `${perfil?.full_name || 'Alguien del equipo'} terminó «${act?.titulo || 'una actividad'}»${act?.proyecto ? ` en ${act.proyecto}` : ''}`,
      url: '/dashboard',
      tag: 'bitacora',
    });
  }
}

export const pausarActividad = (id: string, motivo: string) => cambiarEstado(id, 'pausa', motivo.trim() || null, 'pausada');
export const reanudarActividad = (id: string, nota: string = '') => cambiarEstado(id, 'reanudacion', nota.trim() || null, 'en_curso');
export const concluirActividad = (id: string, notaFinal: string = '') => cambiarEstado(id, 'cierre', notaFinal.trim() || null, 'concluida');

// Cierra lo que quedó abierto de días anteriores (lo hace también el cron de
// la noche). Si la base aún no tiene la función, no pasa nada.
export async function cerrarActividadesAbiertas(): Promise<void> {
  try { await createClient().rpc('cerrar_actividades_abiertas'); } catch { /* sin parche o sin red */ }
}

// La actividad se cerró sola: su dueño dice a qué hora terminó de verdad.
export async function corregirHoraFin(actividad: Pick<Actividad, 'id' | 'hora_inicio'>, horaFinIso: string): Promise<void> {
  if (new Date(horaFinIso).getTime() < new Date(actividad.hora_inicio).getTime()) {
    throw new Error('La hora de fin no puede ser antes del inicio.');
  }
  const { error } = await createClient().from('actividades').update({ hora_fin: horaFinIso, cierre_automatico: false }).eq('id', actividad.id);
  if (error) throw error;
}

// Comentario de una foto ya guardada (la foto rápida entra sin texto).
export async function actualizarNotaAvance(eventoId: string, nota: string): Promise<void> {
  const { error } = await createClient().from('actividad_eventos').update({ nota: nota.trim() || null }).eq('id', eventoId).eq('tipo', 'avance');
  if (error) throw error;
}

// Al hacer el reporte de una actividad queda ligada a él.
export async function ligarReporteAActividad(actividadId: string, reportId: string): Promise<void> {
  const { error } = await createClient().from('actividades').update({ report_id: reportId }).eq('id', actividadId);
  if (error) throw error;
}

// Minutos efectivos: del inicio al fin (o a «ahora») menos las pausas.
export function minutosEfectivos(a: Pick<Actividad, 'hora_inicio' | 'hora_fin'>, eventos: Pick<ActividadEvento, 'tipo' | 'created_at'>[], ahora: number): number {
  const fin = a.hora_fin ? new Date(a.hora_fin).getTime() : ahora;
  let pausado = 0;
  let desde: number | null = null;
  [...eventos].sort((x, y) => x.created_at.localeCompare(y.created_at)).forEach((e) => {
    const t = new Date(e.created_at).getTime();
    if (e.tipo === 'pausa' && desde === null) desde = t;
    else if ((e.tipo === 'reanudacion' || e.tipo === 'cierre') && desde !== null) { pausado += Math.max(0, t - desde); desde = null; }
  });
  if (desde !== null) pausado += Math.max(0, fin - desde);
  return Math.max(0, Math.round((fin - new Date(a.hora_inicio).getTime() - pausado) / 60000));
}

export type ActividadEquipo = Actividad & { tecnico: string };

// Actividades de todo el equipo desde una fecha (supervisión).
export async function listarActividadesEquipo(desdeIso: string): Promise<ActividadEquipo[]> {
  const { data, error } = await createClient()
    .from('actividades')
    .select('*, profiles(full_name)')
    .gte('hora_inicio', desdeIso)
    .order('hora_inicio', { ascending: false });
  if (error) throw error;
  return ((data as any[]) || []).map(({ profiles, ...a }) => ({
    ...(a as Actividad),
    tecnico: (Array.isArray(profiles) ? profiles[0]?.full_name : profiles?.full_name) || 'Personal técnico',
  }));
}
