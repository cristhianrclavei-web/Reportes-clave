import { createClient } from './supabaseClient';
import { getCurrentLocation } from './geolocation';

export type Servicio = {
  id: string;
  creado_por: string;
  proyecto: string;
  descripcion: string | null;
  fecha: string;
  duracion_estimada_min: number;
  hora_llegada: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  estado: 'programado' | 'en_sitio' | 'en_curso' | 'concluido';
  report_id: string | null;
  grupo_id: string;
  numero_dia: number;
  dias_totales: number;
  created_at: string;
};

export type Tarea = {
  id: string;
  servicio_id: string;
  descripcion: string;
  orden: number;
  completada: boolean;
  completada_por: string | null;
  completada_en: string | null;
  foto_path: string | null;
  ubicacion: { lat: number; lng: number } | null;
  nota: string | null;
};

export type Evento = {
  id: string;
  servicio_id: string;
  tipo: 'llegada' | 'inicio' | 'retraso' | 'evidencia' | 'cierre';
  nota: string | null;
  foto_path: string | null;
  ubicacion: { lat: number; lng: number } | null;
  created_by: string | null;
  created_at: string;
};

export type Auditoria = {
  id: string;
  servicio_id: string;
  supervisor_id: string;
  cambio: string;
  created_at: string;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

export async function listarTecnicos(): Promise<{ id: string; full_name: string }[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('role', 'tecnico').order('full_name');
  if (error) throw error;
  return data || [];
}

export async function crearServicio(input: {
  proyecto: string;
  descripcion: string;
  fecha: string;
  duracionMin: number;
  tecnicoIds: string[];
  tareas: string[];
  diasTotales: number;
}): Promise<Servicio[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const diasTotales = Math.max(1, input.diasTotales || 1);
  const grupoId = crypto.randomUUID();
  const diasCreados: Servicio[] = [];

  for (let dia = 1; dia <= diasTotales; dia++) {
    const { data: servicio, error: e1 } = await supabase
      .from('servicios_programados')
      .insert({
        creado_por: user.id,
        proyecto: input.proyecto,
        descripcion: input.descripcion || null,
        fecha: input.fecha,
        duracion_estimada_min: input.duracionMin,
        grupo_id: grupoId,
        numero_dia: dia,
        dias_totales: diasTotales,
      })
      .select()
      .single();
    if (e1) throw e1;

    if (input.tecnicoIds.length > 0) {
      const { error: e2 } = await supabase
        .from('servicio_tecnicos')
        .insert(input.tecnicoIds.map((tid) => ({ servicio_id: servicio.id, tecnico_id: tid })));
      if (e2) throw e2;
    }

    if (input.tareas.length > 0) {
      const { error: e3 } = await supabase
        .from('servicio_tareas')
        .insert(input.tareas.map((desc, i) => ({ servicio_id: servicio.id, descripcion: desc, orden: i })));
      if (e3) throw e3;
    }

    diasCreados.push(servicio as Servicio);
  }

  return diasCreados;
}

// Amplía un proyecto ya existente agregando más días — copia los técnicos y
// el checklist del último día del grupo como plantilla para los días nuevos,
// y actualiza el "de cuántos" (dias_totales) en TODAS las filas del grupo.
export async function agregarDiasAGrupo(grupoId: string, diasNuevos: number): Promise<Servicio[]> {
  const supabase = createClient();

  const { data: diasExistentes, error: eFetch } = await supabase
    .from('servicios_programados')
    .select('*')
    .eq('grupo_id', grupoId)
    .order('numero_dia', { ascending: false });
  if (eFetch) throw eFetch;
  if (!diasExistentes || diasExistentes.length === 0) throw new Error('No se encontró el proyecto.');

  const ultimoDia = diasExistentes[0] as Servicio;
  const [{ data: tecnicosBase }, { data: tareasBase }] = await Promise.all([
    supabase.from('servicio_tecnicos').select('tecnico_id').eq('servicio_id', ultimoDia.id),
    supabase.from('servicio_tareas').select('descripcion, orden').eq('servicio_id', ultimoDia.id).order('orden'),
  ]);

  const nuevoTotal = ultimoDia.dias_totales + diasNuevos;
  const { error: eUpdate } = await supabase.from('servicios_programados').update({ dias_totales: nuevoTotal }).eq('grupo_id', grupoId);
  if (eUpdate) throw eUpdate;

  const diasCreados: Servicio[] = [];
  for (let i = 1; i <= diasNuevos; i++) {
    const numeroDia = ultimoDia.numero_dia + i;
    const { data: servicio, error: e1 } = await supabase
      .from('servicios_programados')
      .insert({
        creado_por: ultimoDia.creado_por,
        proyecto: ultimoDia.proyecto,
        descripcion: ultimoDia.descripcion,
        fecha: ultimoDia.fecha,
        duracion_estimada_min: ultimoDia.duracion_estimada_min,
        grupo_id: grupoId,
        numero_dia: numeroDia,
        dias_totales: nuevoTotal,
      })
      .select()
      .single();
    if (e1) throw e1;

    if (tecnicosBase && tecnicosBase.length > 0) {
      await supabase.from('servicio_tecnicos').insert(tecnicosBase.map((t) => ({ servicio_id: servicio.id, tecnico_id: t.tecnico_id })));
    }
    if (tareasBase && tareasBase.length > 0) {
      await supabase.from('servicio_tareas').insert(tareasBase.map((t) => ({ servicio_id: servicio.id, descripcion: t.descripcion, orden: t.orden })));
    }
    diasCreados.push(servicio as Servicio);
  }

  return diasCreados;
}


export async function listarServiciosSupervisor(fecha?: string): Promise<Servicio[]> {
  const supabase = createClient();
  let q = supabase.from('servicios_programados').select('*').order('fecha', { ascending: false });
  if (fecha) q = q.eq('fecha', fecha);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Servicio[]) || [];
}

export async function listarMisServicios(): Promise<Servicio[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('servicios_programados')
    .select('*')
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data as Servicio[]) || [];
}

export async function obtenerServicioCompleto(id: string) {
  const supabase = createClient();
  const [{ data: servicio, error: e1 }, { data: tareas, error: e2 }, { data: eventos, error: e3 }, { data: tecnicos, error: e4 }, { data: auditoria, error: e5 }] =
    await Promise.all([
      supabase.from('servicios_programados').select('*').eq('id', id).single(),
      supabase.from('servicio_tareas').select('*').eq('servicio_id', id).order('orden'),
      supabase.from('servicio_eventos').select('*').eq('servicio_id', id).order('created_at', { ascending: false }),
      supabase.from('servicio_tecnicos').select('tecnico_id, profiles(full_name)').eq('servicio_id', id),
      supabase.from('servicio_auditoria').select('*, profiles(full_name)').eq('servicio_id', id).order('created_at', { ascending: false }),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;
  if (e5) throw e5;
  return {
    servicio: servicio as Servicio,
    tareas: (tareas as Tarea[]) || [],
    eventos: (eventos as Evento[]) || [],
    tecnicos: (tecnicos as any[]) || [],
    auditoria: (auditoria as Auditoria[]) || [],
  };
}

export async function editarServicio(
  id: string,
  cambios: Partial<Pick<Servicio, 'proyecto' | 'descripcion' | 'fecha' | 'duracion_estimada_min'>>,
  descripcionCambio: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const { error: e1 } = await supabase.from('servicios_programados').update(cambios).eq('id', id);
  if (e1) throw e1;

  const { error: e2 } = await supabase.from('servicio_auditoria').insert({
    servicio_id: id,
    supervisor_id: user.id,
    cambio: descripcionCambio,
  });
  if (e2) throw e2;
}

export async function reasignarTecnicos(id: string, tecnicoIds: string[], descripcionCambio: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const { error: eDel } = await supabase.from('servicio_tecnicos').delete().eq('servicio_id', id);
  if (eDel) throw eDel;
  if (tecnicoIds.length > 0) {
    const { error: eIns } = await supabase.from('servicio_tecnicos').insert(tecnicoIds.map((tid) => ({ servicio_id: id, tecnico_id: tid })));
    if (eIns) throw eIns;
  }
  const { error: eAud } = await supabase.from('servicio_auditoria').insert({ servicio_id: id, supervisor_id: user.id, cambio: descripcionCambio });
  if (eAud) throw eAud;
}

async function subirFotoServicio(servicioId: string, file: File): Promise<string | null> {
  const supabase = createClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `servicios/${servicioId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('evidencias').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) return null;
  return path;
}

export async function marcarLlegada(servicioId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ubicacion = await getCurrentLocation();
  const horaLlegada = new Date().toISOString();

  const { error: e1 } = await supabase
    .from('servicios_programados')
    .update({ hora_llegada: horaLlegada, estado: 'en_sitio' })
    .eq('id', servicioId);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from('servicio_eventos')
    .insert({ servicio_id: servicioId, tipo: 'llegada', ubicacion, created_by: user?.id });
  if (e2) throw e2;
}

export async function iniciarServicio(servicioId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ubicacion = await getCurrentLocation();
  const horaInicio = new Date().toISOString();

  const { error: e1 } = await supabase
    .from('servicios_programados')
    .update({ hora_inicio: horaInicio, estado: 'en_curso' })
    .eq('id', servicioId);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from('servicio_eventos')
    .insert({ servicio_id: servicioId, tipo: 'inicio', ubicacion, created_by: user?.id });
  if (e2) throw e2;
}

export async function completarTarea(tareaId: string, servicioId: string, foto: File | null, nota: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [ubicacion, foto_path] = await Promise.all([
    getCurrentLocation(),
    foto ? subirFotoServicio(servicioId, foto) : Promise.resolve(null),
  ]);

  const { error } = await supabase
    .from('servicio_tareas')
    .update({
      completada: true,
      completada_por: user?.id,
      completada_en: new Date().toISOString(),
      foto_path,
      ubicacion,
      nota: nota.trim() || null,
    })
    .eq('id', tareaId);
  if (error) throw error;
}

export async function registrarRetraso(servicioId: string, motivo: string, comentario: string, foto: File | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [ubicacion, foto_path] = await Promise.all([
    getCurrentLocation(),
    foto ? subirFotoServicio(servicioId, foto) : Promise.resolve(null),
  ]);
  const nota = `${motivo}${comentario ? ' — ' + comentario : ''}`;
  const { error } = await supabase
    .from('servicio_eventos')
    .insert({ servicio_id: servicioId, tipo: 'retraso', nota, foto_path, ubicacion, created_by: user?.id });
  if (error) throw error;
}

// Evidencia adicional que el técnico agrega por su cuenta, más allá de las
// tareas del checklist que definió el supervisor (ej. algo imprevisto en sitio).
export async function agregarEvidenciaExtra(servicioId: string, nota: string, foto: File | null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [ubicacion, foto_path] = await Promise.all([
    getCurrentLocation(),
    foto ? subirFotoServicio(servicioId, foto) : Promise.resolve(null),
  ]);
  const { error } = await supabase
    .from('servicio_eventos')
    .insert({ servicio_id: servicioId, tipo: 'evidencia', nota: nota.trim() || null, foto_path, ubicacion, created_by: user?.id });
  if (error) throw error;
}

export async function concluirServicio(servicioId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ubicacion = await getCurrentLocation();
  const horaFin = new Date().toISOString();

  const { error: e1 } = await supabase.from('servicios_programados').update({ hora_fin: horaFin, estado: 'concluido' }).eq('id', servicioId);
  if (e1) throw e1;

  const { error: e2 } = await supabase.from('servicio_eventos').insert({ servicio_id: servicioId, tipo: 'cierre', ubicacion, created_by: user?.id });
  if (e2) throw e2;
}

export async function vincularReporteAServicio(servicioId: string, reportId: string) {
  const supabase = createClient();
  const { error } = await supabase.from('servicios_programados').update({ report_id: reportId }).eq('id', servicioId);
  if (error) throw error;
}

export type EstadoTiempo = { tipo: 'a_tiempo' | 'retraso' | 'excedido' | null; minutos?: number };

// De un proyecto de varios días, solo deja pasar "el siguiente día pendiente"
// de cada grupo (el de menor numero_dia que todavía no esté concluido) —
// así el técnico ve "Día 1/5" primero, y hasta que lo concluya aparece
// "Día 2/5", en vez de ver los 5 días sueltos al mismo tiempo.
export function filtrarSiguienteDiaPorGrupo(servicios: Servicio[]): Servicio[] {
  const porGrupo: Record<string, Servicio[]> = {};
  servicios.forEach((s) => {
    if (!porGrupo[s.grupo_id]) porGrupo[s.grupo_id] = [];
    porGrupo[s.grupo_id].push(s);
  });

  const resultado: Servicio[] = [];
  Object.values(porGrupo).forEach((dias) => {
    const pendientes = dias.filter((d) => d.estado !== 'concluido').sort((a, b) => a.numero_dia - b.numero_dia);
    if (pendientes.length > 0) resultado.push(pendientes[0]);
  });
  return resultado;
}

// Calcula si un servicio terminó a tiempo, con retraso, o si ya lleva más
// tiempo del estimado sin haber concluido todavía (útil para el supervisor).
export function calcularEstadoTiempo(s: Servicio): EstadoTiempo {
  const inicioReferencia = s.hora_inicio || s.hora_llegada;
  if (!inicioReferencia) return { tipo: null };

  if (s.estado === 'concluido' && s.hora_fin) {
    const totalMin = Math.floor((new Date(s.hora_fin).getTime() - new Date(inicioReferencia).getTime()) / 60000);
    const diff = totalMin - s.duracion_estimada_min;
    return diff > 0 ? { tipo: 'retraso', minutos: diff } : { tipo: 'a_tiempo' };
  }

  if (s.estado === 'en_curso' || s.estado === 'en_sitio') {
    const transcurrido = Math.floor((Date.now() - new Date(inicioReferencia).getTime()) / 60000);
    if (transcurrido > s.duracion_estimada_min) return { tipo: 'excedido', minutos: transcurrido - s.duracion_estimada_min };
  }

  return { tipo: null };
}
