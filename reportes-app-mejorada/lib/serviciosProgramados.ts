import { createClient } from './supabaseClient';
import { getCurrentLocation } from './geolocation';
import { registrarAccionGlobal } from './auditoriaGlobal';
import { generarUUID } from './uuid';
import { evaluarVentanaServicio } from './ventanaServicio';
import { notificar } from './push';

export type Servicio = {
  id: string;
  creado_por: string;
  proyecto: string;
  descripcion: string | null;
  fecha: string;
  hora_programada: string | null;
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
  grupo_id: string; // el checklist pertenece al PROYECTO, no a un día
  descripcion: string;
  orden: number;
  completada: boolean;
  avance_pct: number; // 0–100; completada equivale a 100
  completada_por: string | null;
  completada_en: string | null;
  foto_path: string | null;
  ubicacion: { lat: number; lng: number } | null;
  nota: string | null;
};

export type Evento = {
  id: string;
  servicio_id: string;
  tipo: 'llegada' | 'inicio' | 'retraso' | 'evidencia' | 'cierre' | 'avance';
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

// Nombres de TODO el personal asignado a un día de servicio. Va por RPC
// (función SECURITY DEFINER) y no por select directo: la política RLS de
// servicio_tecnicos solo deja al técnico ver su propia fila, así que un
// select normal devolvería únicamente su nombre y no el de su cuadrilla.
export async function listarTecnicosDeServicio(servicioId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('personal_de_servicio', { p_servicio_id: servicioId });
  if (error) throw error;
  return ((data || []) as any[]).map((r) => r.full_name).filter(Boolean) as string[];
}

export async function listarTecnicos(): Promise<{ id: string; full_name: string }[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('profiles').select('id, full_name').eq('role', 'tecnico').order('full_name');
  if (error) throw error;
  return data || [];
}

// Cada día del proyecto tiene su PROPIA fecha. Antes todos los días
// compartían la fecha de arranque, lo que impedía validar "este día es hoy"
// y obligaba a aflojar el bloqueo por fecha en proyectos multi-día.
export async function crearServicio(input: {
  proyecto: string;
  descripcion: string;
  fechas: string[]; // una fecha por día, en orden cronológico
  // Hora de llegada acordada. Opcional: sin ella no se mide puntualidad,
  // pero el servicio se programa igual.
  horaProgramada?: string | null;
  duracionMin: number;
  tecnicoIds: string[];
  tareas: string[];
  // Lista de carga capturada al programar. Se guarda junto con el proyecto
  // para que el técnico la tenga desde el primer día.
  insumos?: { categoria: string; descripcion: string; cantidad: number; unidad: string; articuloId?: string | null }[];
}): Promise<Servicio[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  // Se ordenan por si el supervisor las capturó desordenadas: "Día 1" debe
  // ser siempre el más temprano.
  const fechas = [...input.fechas].filter(Boolean).sort();
  if (fechas.length === 0) throw new Error('Hay que indicar al menos una fecha.');
  const diasTotales = fechas.length;
  const grupoId = generarUUID();
  const diasCreados: Servicio[] = [];

  for (let dia = 1; dia <= diasTotales; dia++) {
    const { data: servicio, error: e1 } = await supabase
      .from('servicios_programados')
      .insert({
        creado_por: user.id,
        proyecto: input.proyecto,
        descripcion: input.descripcion || null,
        fecha: fechas[dia - 1],
        hora_programada: input.horaProgramada || null,
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

    diasCreados.push(servicio as Servicio);
  }

  // El checklist se crea UNA sola vez y pertenece al proyecto completo
  // (grupo_id): todos los días comparten la misma lista, así lo pendiente
  // del día 1 sigue disponible el día 2. (servicio_id apunta al día 1
  // solo como ancla del registro.)
  if (input.tareas.length > 0) {
    const { error: e3 } = await supabase
      .from('servicio_tareas')
      .insert(input.tareas.map((desc, i) => ({ servicio_id: diasCreados[0].id, grupo_id: grupoId, descripcion: desc, orden: i })));
    if (e3) throw e3;
  }

  // La lista de herramienta y material también es del proyecto completo.
  if (input.insumos && input.insumos.length > 0) {
    const { error: e4 } = await supabase.from('servicio_insumos').insert(
      input.insumos.map((it, i) => ({
        grupo_id: grupoId,
        servicio_id: diasCreados[0].id,
        categoria: it.categoria,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        unidad: it.unidad,
        articulo_id: it.articuloId || null,
        orden: i,
        agregado_por: user.id,
        es_del_tecnico: false,
      }))
    );
    if (e4) throw e4;
  }

  await registrarAccionGlobal(
    'programo_servicio',
    'servicio',
    diasCreados[0].id,
    `Programó «${input.proyecto}» — ${diasTotales} día(s), ${input.tecnicoIds.length} técnico(s), ${input.tareas.length} tarea(s). Fechas: ${fechas.join(', ')}`
  );

  // Avisar a quienes quedaron asignados: es el dato que hoy tienen que
  // descubrir entrando a la app.
  if (input.tecnicoIds.length > 0) {
    const [y, m, d] = fechas[0].split('-');
    await notificar({
      usuarios: input.tecnicoIds,
      tipo: 'servicio_asignado',
      titulo: 'Te asignaron un servicio',
      mensaje: `${input.proyecto} · ${diasTotales > 1 ? `${diasTotales} días desde el ` : ''}${d}/${m}/${y}`,
      url: '/servicios',
      tag: 'servicio-asignado',
    });
  }

  return diasCreados;
}

// Cambia la fecha de un día concreto y renumera el grupo para que "Día N"
// siga siendo cronológico (si se mueve el día 4 antes del día 2, se
// reordenan). El identificador de cada fila no cambia, así que los reportes
// ya vinculados siguen apuntando al mismo registro.
export async function reprogramarDia(servicioId: string, nuevaFecha: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const { data: actual, error: eGet } = await supabase
    .from('servicios_programados')
    .select('id, proyecto, fecha, numero_dia, dias_totales, grupo_id, estado')
    .eq('id', servicioId)
    .single();
  if (eGet) throw eGet;
  if (actual.estado === 'concluido') throw new Error('Este día ya está concluido; no se puede reprogramar.');

  const fechaAnterior = actual.fecha;
  if (fechaAnterior === nuevaFecha) return;

  const { error: eUpd } = await supabase
    .from('servicios_programados')
    .update({ fecha: nuevaFecha })
    .eq('id', servicioId);
  if (eUpd) throw eUpd;

  // Renumerar el grupo por orden de fecha
  const { data: dias, error: eDias } = await supabase
    .from('servicios_programados')
    .select('id, fecha, numero_dia')
    .eq('grupo_id', actual.grupo_id)
    .order('fecha', { ascending: true });
  if (eDias) throw eDias;

  let nuevoNumeroDelDia = actual.numero_dia;
  for (let i = 0; i < (dias || []).length; i++) {
    const d: any = dias![i];
    const numero = i + 1;
    if (d.id === servicioId) nuevoNumeroDelDia = numero;
    if (d.numero_dia !== numero) {
      await supabase.from('servicios_programados').update({ numero_dia: numero }).eq('id', d.id);
    }
  }

  const cambio = `Reprogramó el día ${nuevoNumeroDelDia} de «${actual.proyecto}»: de ${fechaAnterior} a ${nuevaFecha}`;
  await supabase.from('servicio_auditoria').insert({ servicio_id: servicioId, supervisor_id: user.id, cambio });
  await registrarAccionGlobal('reprogramo_dia', 'servicio', servicioId, cambio);
}

// Amplía un proyecto ya existente agregando más días — copia los técnicos
// del último día del grupo para los días nuevos y actualiza el "de cuántos"
// (dias_totales) en TODAS las filas del grupo. El checklist NO se copia:
// es compartido por proyecto, así que los días nuevos ven la misma lista
// (con lo pendiente que haya quedado).
export async function agregarDiasAGrupo(grupoId: string, fechasNuevas: string[]): Promise<Servicio[]> {
  const supabase = createClient();

  const { data: diasExistentes, error: eFetch } = await supabase
    .from('servicios_programados')
    .select('*')
    .eq('grupo_id', grupoId)
    .order('numero_dia', { ascending: false });
  if (eFetch) throw eFetch;
  if (!diasExistentes || diasExistentes.length === 0) throw new Error('No se encontró el proyecto.');

  const ultimoDia = diasExistentes[0] as Servicio;
  const { data: tecnicosBase } = await supabase
    .from('servicio_tecnicos')
    .select('tecnico_id')
    .eq('servicio_id', ultimoDia.id);

  const fechas = [...fechasNuevas].filter(Boolean).sort();
  if (fechas.length === 0) throw new Error('Hay que indicar al menos una fecha.');
  const diasNuevos = fechas.length;
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
        fecha: fechas[i - 1],
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
    diasCreados.push(servicio as Servicio);
  }

  await registrarAccionGlobal(
    'amplio_proyecto',
    'servicio',
    ultimoDia.id,
    `Amplió «${ultimoDia.proyecto}» de ${ultimoDia.dias_totales} a ${nuevoTotal} día(s). Fechas nuevas: ${fechas.join(', ')}`
  );

  return diasCreados;
}


// Técnicos asignados de TODOS los servicios visibles, en una sola consulta,
// para no disparar una petición por día en la agenda.
export async function listarTecnicosPorServicio(): Promise<Record<string, string[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('servicio_tecnicos')
    .select('servicio_id, profiles(full_name)');
  if (error) throw error;
  const mapa: Record<string, string[]> = {};
  (data || []).forEach((r: any) => {
    const nombre = Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name;
    if (!nombre) return;
    if (!mapa[r.servicio_id]) mapa[r.servicio_id] = [];
    mapa[r.servicio_id].push(nombre);
  });
  return mapa;
}

export async function listarServiciosSupervisor(fecha?: string): Promise<Servicio[]> {
  const supabase = createClient();
  let q = supabase.from('servicios_programados').select('*').order('fecha', { ascending: false });
  if (fecha) q = q.eq('fecha', fecha);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Servicio[]) || [];
}

// Servicios donde el usuario está asignado AHORA MISMO. El filtro por
// asignación es explícito y no se delega solo a RLS: si al técnico lo
// quitaron del proyecto (reasignación a media semana), el servicio debe
// desaparecer de su lista de inmediato — incluso si su cuenta tuviera
// permisos amplios por otro rol.
export async function listarMisServicios(): Promise<Servicio[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: asignaciones, error: eAsig } = await supabase
    .from('servicio_tecnicos')
    .select('servicio_id')
    .eq('tecnico_id', user.id);
  if (eAsig) throw eAsig;

  const ids = (asignaciones || []).map((a: any) => a.servicio_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('servicios_programados')
    .select('*')
    .in('id', ids)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data as Servicio[]) || [];
}

export type DiaAgenda = Servicio & { tecnicos: string[] };

// Agenda del supervisor: todos los días programados con sus técnicos, en
// orden cronológico. Es el mismo dato que la vista por proyecto, pero
// ordenado por fecha — que es como se planea la semana.
export async function listarAgendaSupervisor(): Promise<DiaAgenda[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('servicios_programados')
    .select('*, servicio_tecnicos(profiles(full_name))')
    .order('fecha', { ascending: true })
    .order('numero_dia', { ascending: true });
  if (error) throw error;

  return ((data as any[]) || []).map((s) => {
    const tecnicos = (s.servicio_tecnicos || [])
      .map((st: any) => (Array.isArray(st.profiles) ? st.profiles[0]?.full_name : st.profiles?.full_name))
      .filter(Boolean) as string[];
    const { servicio_tecnicos, ...resto } = s;
    return { ...(resto as Servicio), tecnicos };
  });
}

// Servicios sin reporte a los que se puede vincular uno ya guardado: los del
// usuario cuya fecha ya llegó. A diferencia de la lista para trabajar, aquí
// sí entran los días pasados.
export async function listarServiciosVinculables(): Promise<Servicio[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: role } = await supabase.rpc('get_my_role');
  const hoy = new Date();
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

  let q = supabase
    .from('servicios_programados')
    .select('*')
    .is('report_id', null)
    .lte('fecha', hoyStr)
    .order('fecha', { ascending: false });

  // El supervisor puede vincular cualquiera; el técnico, solo los suyos.
  if (role !== 'supervisor') {
    const { data: asignaciones } = await supabase
      .from('servicio_tecnicos')
      .select('servicio_id')
      .eq('tecnico_id', user.id);
    const ids = (asignaciones || []).map((a: any) => a.servicio_id);
    if (ids.length === 0) return [];
    q = q.in('id', ids);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data as Servicio[]) || [];
}

// ¿El usuario sigue asignado a este día de servicio? Se consulta antes de
// dejarlo marcar llegada, iniciar o vincular un reporte.
export async function sigoAsignadoAServicio(servicioId: string): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from('servicio_tecnicos')
    .select('servicio_id')
    .eq('servicio_id', servicioId)
    .eq('tecnico_id', user.id)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export async function obtenerServicioCompleto(id: string) {
  const supabase = createClient();
  // Primero el servicio (para conocer su grupo): el checklist es compartido
  // por proyecto, así que las tareas se buscan por grupo_id, no por día.
  const { data: servicio, error: e1 } = await supabase.from('servicios_programados').select('*').eq('id', id).single();
  if (e1) throw e1;

  const [{ data: tareas, error: e2 }, { data: eventos, error: e3 }, { data: tecnicos, error: e4 }, { data: auditoria, error: e5 }] =
    await Promise.all([
      supabase.from('servicio_tareas').select('*').eq('grupo_id', (servicio as Servicio).grupo_id).order('orden'),
      supabase.from('servicio_eventos').select('*').eq('servicio_id', id).order('created_at', { ascending: false }),
      supabase.from('servicio_tecnicos').select('tecnico_id, profiles(full_name)').eq('servicio_id', id),
      supabase.from('servicio_auditoria').select('*, profiles(full_name)').eq('servicio_id', id).order('created_at', { ascending: false }),
    ]);
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

// Un servicio deja de ser editable en cuanto el técnico empieza a trabajarlo.
// El plan (proyecto, fecha, duración) es contra lo que se compara el resultado;
// cambiarlo después es ajustar el examen a la calificación. El disparador de la
// base lo impide de todos modos (patch_bloquear_edicion_servicio.sql); esto es
// para dar un mensaje legible en vez de un error de Postgres.
export function motivoNoEditable(estado: Servicio['estado']): string | null {
  if (estado === 'en_curso') return 'El técnico ya empezó este servicio. Para cambiarlo hay que esperar a que cierre o pedirle que lo detenga.';
  if (estado === 'concluido') return 'Este servicio ya está concluido. Lo registrado es el respaldo de lo que se hizo y no se modifica.';
  return null;
}

export async function editarServicio(
  id: string,
  cambios: Partial<Pick<Servicio, 'proyecto' | 'descripcion' | 'fecha' | 'duracion_estimada_min'>>,
  descripcionCambio: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const { data: actual, error: eGet } = await supabase
    .from('servicios_programados').select('estado').eq('id', id).single();
  if (eGet) throw eGet;
  const motivo = motivoNoEditable(actual.estado);
  if (motivo) throw new Error(motivo);

  const { error: e1 } = await supabase.from('servicios_programados').update(cambios).eq('id', id);
  if (e1) throw e1;

  const { error: e2 } = await supabase.from('servicio_auditoria').insert({
    servicio_id: id,
    supervisor_id: user.id,
    cambio: descripcionCambio,
  });
  if (e2) throw e2;

  const { data: sv } = await supabase.from('servicios_programados').select('proyecto, numero_dia, dias_totales').eq('id', id).single();
  const etiqueta = sv ? `«${sv.proyecto}»${sv.dias_totales > 1 ? ` (día ${sv.numero_dia}/${sv.dias_totales})` : ''}` : 'servicio';
  await registrarAccionGlobal('edito_servicio', 'servicio', id, `Editó ${etiqueta}: ${descripcionCambio}`);
}

export async function reasignarTecnicos(id: string, tecnicoIds: string[], descripcionCambio: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const { data: svActual, error: eSv } = await supabase
    .from('servicios_programados').select('estado').eq('id', id).single();
  if (eSv) throw eSv;
  if (motivoNoEditable(svActual.estado)) {
    throw new Error('No se pueden cambiar los técnicos de un servicio que ya empezó. Quien hizo el trabajo debe seguir apareciendo en él.');
  }

  const { error: eDel } = await supabase.from('servicio_tecnicos').delete().eq('servicio_id', id);
  if (eDel) throw eDel;
  if (tecnicoIds.length > 0) {
    const { error: eIns } = await supabase.from('servicio_tecnicos').insert(tecnicoIds.map((tid) => ({ servicio_id: id, tecnico_id: tid })));
    if (eIns) throw eIns;
  }
  const { error: eAud } = await supabase.from('servicio_auditoria').insert({ servicio_id: id, supervisor_id: user.id, cambio: descripcionCambio });
  if (eAud) throw eAud;

  const { data: sv } = await supabase.from('servicios_programados').select('proyecto, numero_dia, dias_totales').eq('id', id).single();
  const etiqueta = sv ? `«${sv.proyecto}»${sv.dias_totales > 1 ? ` (día ${sv.numero_dia}/${sv.dias_totales})` : ''}` : 'servicio';
  await registrarAccionGlobal('reasigno_tecnicos', 'servicio', id, `${descripcionCambio} en ${etiqueta}`);
}

// Elimina un proyecto COMPLETO (todos sus días). Solo supervisores — la
// RLS lo respalda del lado de la base de datos. La cascada del esquema
// se lleva tareas, técnicos asignados, eventos y auditoría por servicio;
// los reportes formales vinculados NO se borran, solo se desvinculan
// (el servicio muere, el reporte queda). Las fotos de evidencia se
// limpian del Storage (best-effort: si alguna falla, la eliminación
// del proyecto no se frena).
// Elimina un día intermedio de un proyecto: el cliente no estaba, no llegó el
// equipo, etc. Los días siguientes conservan su fecha pero suben de número,
// para que la numeración quede continua (si se borra el día 3, el que era 4
// pasa a ser 3 de 4 con su misma fecha).
//
// No se permite borrar un día ya trabajado: sus evidencias, horas y GPS son
// el respaldo de lo que se hizo, y el motivo aquí es que NO se hizo.
export async function eliminarDiaDeProyecto(servicioId: string, motivo: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  if (!motivo.trim()) throw new Error('Hay que indicar por qué se elimina el día.');

  const { data: dia, error: eGet } = await supabase
    .from('servicios_programados')
    .select('id, proyecto, fecha, numero_dia, dias_totales, grupo_id, estado, report_id')
    .eq('id', servicioId)
    .single();
  if (eGet) throw eGet;

  if (dia.estado === 'concluido') {
    throw new Error('Este día ya se trabajó y no se puede eliminar. Sus evidencias son el respaldo del servicio.');
  }
  if (dia.report_id) {
    throw new Error('Este día tiene un reporte vinculado. Desvincula el reporte antes de eliminarlo.');
  }

  const { data: hermanos, error: eHer } = await supabase
    .from('servicios_programados')
    .select('id, fecha, numero_dia')
    .eq('grupo_id', dia.grupo_id)
    .order('fecha', { ascending: true });
  if (eHer) throw eHer;

  const restantes = (hermanos || []).filter((d: any) => d.id !== servicioId);
  if (restantes.length === 0) {
    throw new Error('Es el único día del proyecto. Para cancelarlo completo, elimina el proyecto.');
  }

  // Limpiar las fotos de ese día antes de borrarlo.
  const { data: eventosFotos } = await supabase
    .from('servicio_eventos')
    .select('foto_path')
    .eq('servicio_id', servicioId)
    .not('foto_path', 'is', null);
  const paths = (eventosFotos || []).map((e: any) => e.foto_path as string).filter(Boolean);
  if (paths.length > 0) {
    try {
      await supabase.storage.from('evidencias').remove(paths);
    } catch (e) {
      console.error('No se pudieron borrar las fotos del día:', e);
    }
  }

  const { error: eDel } = await supabase.from('servicios_programados').delete().eq('id', servicioId);
  if (eDel) throw eDel;

  // Renumerar por fecha: los días siguientes recorren su número sin cambiar
  // de fecha, y el total baja en uno.
  const nuevoTotal = restantes.length;
  for (let i = 0; i < restantes.length; i++) {
    const d: any = restantes[i];
    await supabase
      .from('servicios_programados')
      .update({ numero_dia: i + 1, dias_totales: nuevoTotal })
      .eq('id', d.id);
  }

  const cambio = `Eliminó el día ${dia.numero_dia} de «${dia.proyecto}» (${dia.fecha}): ${motivo.trim()}. El proyecto queda en ${nuevoTotal} día(s).`;
  await registrarAccionGlobal('elimino_dia', 'servicio', restantes[0].id, cambio);
}

export async function eliminarProyecto(grupoId: string): Promise<void> {
  const supabase = createClient();

  const { data: dias, error: e1 } = await supabase
    .from('servicios_programados')
    .select('id, proyecto, dias_totales')
    .eq('grupo_id', grupoId);
  if (e1) throw e1;
  if (!dias || dias.length === 0) throw new Error('No se encontró el proyecto.');

  const proyecto = dias[0].proyecto;
  const diasTotales = dias[0].dias_totales;
  const servicioIds = dias.map((d) => d.id);

  // Recolectar fotos (tareas del grupo + eventos de todos los días) para limpiarlas
  const [{ data: tareasFotos }, { data: eventosFotos }] = await Promise.all([
    supabase.from('servicio_tareas').select('foto_path').eq('grupo_id', grupoId).not('foto_path', 'is', null),
    supabase.from('servicio_eventos').select('foto_path').in('servicio_id', servicioIds).not('foto_path', 'is', null),
  ]);
  const fotoPaths = [
    ...(tareasFotos || []).map((t: any) => t.foto_path as string),
    ...(eventosFotos || []).map((e: any) => e.foto_path as string),
  ];

  const { error: eDel } = await supabase.from('servicios_programados').delete().eq('grupo_id', grupoId);
  if (eDel) throw eDel;

  if (fotoPaths.length > 0) {
    try {
      await supabase.storage.from('evidencias').remove(fotoPaths);
    } catch (e) {
      console.error('No se pudieron limpiar algunas fotos del proyecto eliminado:', e);
    }
  }

  await registrarAccionGlobal(
    'elimino_servicio',
    'servicio',
    servicioIds[0],
    `Eliminó el proyecto «${proyecto}» (${diasTotales} día(s), ${fotoPaths.length} foto(s) de evidencia)`
  );
}

async function subirFotoServicio(servicioId: string, file: File): Promise<string | null> {
  const supabase = createClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `servicios/${servicioId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('evidencias').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) {
    // Se avisa en vez de devolver null en silencio: así una foto rechazada
    // por el almacenamiento no se pierde sin que nadie se entere, como pasó
    // con las evidencias de servicio.
    console.error('No se pudo subir la foto de evidencia', error);
    throw new Error('No se pudo guardar la foto: ' + (error.message || 'error de almacenamiento'));
  }
  return path;
}

// Verifica en la base (no en la pantalla) que el servicio esté dentro de su
// fecha. La UI ya lo bloquea, pero una pantalla vieja en caché o un reloj
// desfasado no deben poder saltarse la regla.
async function exigirVentanaValida(servicioId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('servicios_programados')
    .select('fecha, dias_totales')
    .eq('id', servicioId)
    .single();
  if (error) throw error;
  const ventana = evaluarVentanaServicio(data as any);
  if (!ventana.permitido) throw new Error(ventana.motivo || 'Este servicio está fuera de su fecha programada.');
}

export async function marcarLlegada(servicioId: string) {
  await exigirVentanaValida(servicioId);
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

  const { data: sv } = await supabase
    .from('servicios_programados')
    .select('proyecto, numero_dia, dias_totales')
    .eq('id', servicioId)
    .single();
  const quien = await nombreDelUsuario();
  await notificar({
    destino: 'supervisores',
    tipo: 'llegada_servicio',
    titulo: 'Llegada a sitio',
    mensaje: `${quien} llegó a ${sv?.proyecto || 'un servicio'}${sv && sv.dias_totales > 1 ? ` · Día ${sv.numero_dia}` : ''}`,
    url: `/dashboard/servicios/${servicioId}`,
    tag: 'llegada',
  });
}

// Nombre de quien realiza la acción, para que el aviso diga quién y no solo qué.
async function nombreDelUsuario(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Un técnico';
  const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
  return data?.full_name || 'Un técnico';
}

export async function iniciarServicio(servicioId: string) {
  await exigirVentanaValida(servicioId);
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

  const { data: sv } = await supabase.from('servicios_programados').select('proyecto').eq('id', servicioId).single();
  const quien = await nombreDelUsuario();
  await notificar({
    destino: 'supervisores',
    tipo: 'inicio_servicio',
    titulo: 'Servicio iniciado',
    mensaje: `${quien} arrancó ${sv?.proyecto || 'un servicio'}`,
    url: `/dashboard/servicios/${servicioId}`,
    tag: 'inicio',
  });
}

// Registra el avance de una tarea. Si el porcentaje llega a 100 la tarea
// queda completada (con hora, autor, foto y ubicación como siempre); si es
// parcial (ej. "instalé las cámaras pero falta conectarlas" = 50%), se
// actualiza el porcentaje en la tarea y el detalle queda auditado como
// evento 'avance' (quién, cuándo, %, nota, foto, ubicación).
export async function registrarAvanceTarea(
  tarea: Pick<Tarea, 'id' | 'descripcion'>,
  servicioId: string,
  avancePct: number,
  foto: File | null,
  nota: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const pct = Math.max(0, Math.min(100, Math.round(avancePct)));
  const [ubicacion, foto_path] = await Promise.all([
    getCurrentLocation(),
    foto ? subirFotoServicio(servicioId, foto) : Promise.resolve(null),
  ]);

  if (pct >= 100) {
    const { error } = await supabase
      .from('servicio_tareas')
      .update({
        completada: true,
        avance_pct: 100,
        completada_por: user?.id,
        completada_en: new Date().toISOString(),
        foto_path,
        ubicacion,
        nota: nota.trim() || null,
      })
      .eq('id', tarea.id);
    if (error) throw error;
    return;
  }

  const { error: e1 } = await supabase
    .from('servicio_tareas')
    .update({ avance_pct: pct })
    .eq('id', tarea.id);
  if (e1) throw e1;

  const notaEvento = `«${tarea.descripcion}» — avance ${pct}%${nota.trim() ? ': ' + nota.trim() : ''}`;
  const { error: e2 } = await supabase
    .from('servicio_eventos')
    .insert({
      servicio_id: servicioId,
      tipo: 'avance',
      nota: notaEvento,
      foto_path,
      ubicacion,
      created_by: user?.id,
      // En columnas y no solo en el texto: es lo que permite calcular cuánto
      // se llevaba al cierre de cada día.
      tarea_id: tarea.id,
      avance_pct: pct,
    });
  if (e2) throw e2;
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

  // El aviso incluye si quedó fuera de tiempo: un cierre normal es rutina,
  // uno con retraso es lo que el supervisor necesita saber en el momento.
  const { data: sv } = await supabase
    .from('servicios_programados')
    .select('proyecto, duracion_estimada_min, hora_llegada, hora_inicio, hora_fin')
    .eq('id', servicioId)
    .single();

  let extra = '';
  if (sv) {
    const et = calcularEstadoTiempo(sv as any);
    if (et.tipo === 'retraso' && et.minutos) extra = ` · ${et.minutos} min de más`;
  }

  const quien = await nombreDelUsuario();
  await notificar({
    destino: 'supervisores',
    tipo: 'cierre_servicio',
    titulo: 'Servicio concluido',
    mensaje: `${quien} cerró ${sv?.proyecto || 'un servicio'}${extra}`,
    url: `/dashboard/servicios/${servicioId}`,
    tag: 'cierre',
  });
}

export async function vincularReporteAServicio(servicioId: string, reportId: string) {
  const supabase = createClient();
  const { data: sv, error: eSv } = await supabase
    .from('servicios_programados')
    .select('fecha')
    .eq('id', servicioId)
    .single();
  if (eSv) throw eSv;
  const ventana = evaluarVentanaServicio(sv as any);
  // Solo se impide vincular a un servicio que todavía no llega: eso sí sería
  // un error de captura. Uno de días pasados es normal.
  if (!ventana.permitido && ventana.motivo?.includes('Faltan')) {
    throw new Error(ventana.motivo);
  }
  const { error } = await supabase.from('servicios_programados').update({ report_id: reportId }).eq('id', servicioId);
  if (error) throw error;
}

export type EstadoTiempo = { tipo: 'a_tiempo' | 'retraso' | 'excedido' | null; minutos?: number };

export type ProgresoTareas = { total: number; completadas: number; pct: number };

// Progreso global de un checklist: promedio de los porcentajes de todas
// las tareas (una tarea al 50% aporta medio punto, no cero). En proyectos
// multi-día el checklist es compartido, así que este número ES el avance
// de todo el proyecto.
export function calcularProgresoTareas(tareas: Pick<Tarea, 'completada' | 'avance_pct'>[]): ProgresoTareas {
  const total = tareas.length;
  const completadas = tareas.filter((t) => t.completada).length;
  if (total === 0) return { total: 0, completadas: 0, pct: 0 };
  const suma = tareas.reduce((acc, t) => acc + (t.completada ? 100 : Math.max(0, Math.min(100, t.avance_pct || 0))), 0);
  return { total, completadas, pct: Math.round(suma / total) };
}

// Progreso de todos los proyectos visibles para el usuario actual,
// agrupado por grupo_id (RLS ya filtra: el supervisor ve todo, el
// técnico solo los proyectos donde está asignado).
export async function listarProgresoPorGrupo(): Promise<Record<string, ProgresoTareas>> {
  const supabase = createClient();
  const { data, error } = await supabase.from('servicio_tareas').select('grupo_id, completada, avance_pct');
  if (error) throw error;
  const porGrupo: Record<string, Pick<Tarea, 'completada' | 'avance_pct'>[]> = {};
  (data || []).forEach((t: any) => {
    if (!porGrupo[t.grupo_id]) porGrupo[t.grupo_id] = [];
    porGrupo[t.grupo_id].push(t);
  });
  const resultado: Record<string, ProgresoTareas> = {};
  Object.entries(porGrupo).forEach(([grupoId, ts]) => {
    resultado[grupoId] = calcularProgresoTareas(ts);
  });
  return resultado;
}

// De un proyecto de varios días, solo deja pasar "el siguiente día pendiente"
// de cada grupo (el de menor numero_dia que todavía no esté concluido) —
// así el técnico ve "Día 1/5" primero, y hasta que lo concluya aparece
// "Día 2/5", en vez de ver los 5 días sueltos al mismo tiempo.
//
// Los días ya concluidos que todavía no tienen reporte SÍ pasan. Antes se
// descartaban junto con los demás concluidos, y el resultado era que un día
// terminado al que solo le faltaba el papeleo se volvía inalcanzable: al día
// siguiente la lista ya solo ofrecía el día 2, y el reporte del día 1 no se
// podía capturar desde ningún lado. El trabajo estaba hecho; lo que faltaba
// era documentarlo.
//
// `incluirConcluidosSinReporte` existe porque no todas las pantallas quieren
// lo mismo: en «mis servicios» el día concluido ya no es trabajo por hacer,
// pero al crear un reporte sí es justo lo que se anda buscando.
export function filtrarSiguienteDiaPorGrupo(
  servicios: Servicio[],
  incluirConcluidosSinReporte = false,
): Servicio[] {
  const porGrupo: Record<string, Servicio[]> = {};
  servicios.forEach((s) => {
    if (!porGrupo[s.grupo_id]) porGrupo[s.grupo_id] = [];
    porGrupo[s.grupo_id].push(s);
  });

  const resultado: Servicio[] = [];
  Object.values(porGrupo).forEach((dias) => {
    const ordenados = [...dias].sort((a, b) => a.numero_dia - b.numero_dia);

    if (incluirConcluidosSinReporte) {
      // Todos los días terminados que deben reporte, más el siguiente por hacer.
      ordenados
        .filter((d) => d.estado === 'concluido' && !d.report_id)
        .forEach((d) => resultado.push(d));
    }

    const siguiente = ordenados.find((d) => d.estado !== 'concluido');
    if (siguiente) resultado.push(siguiente);
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
