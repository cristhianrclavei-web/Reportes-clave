import { reducirFoto } from './reducirFoto';
import type { Avance } from './useAvanceGuardado';
import { createClient } from './supabaseClient';
import { getCurrentLocation } from './geolocation';
import { distanciaMetros } from './geocerca';
import {
  TipoPausa, AjustesOperacion, AJUSTES_POR_DEFECTO, limiteDePausa, textoTipoPausa, fueraDeSitio, distanciaTexto, minutosTexto,
  EventoPausa,
} from './pausas';
import { registrarAccionGlobal } from './auditoriaGlobal';
import { generarUUID } from './uuid';
import { evaluarVentanaServicio } from './ventanaServicio';
import { notificar } from './push';
import { textoMotivo } from './motivosServicio';
import { VideoGrabado, subirVideo } from './videoEvidencia';
import { VisitaEstado, debeReporte, FILTRO_DEBE_REPORTE } from './visitaSinTrabajo';

export type Servicio = {
  id: string;
  creado_por: string;
  proyecto: string;
  descripcion: string | null;
  fecha: string;
  hora_programada: string | null;
  hora_salida_programada: string | null;
  ubicacion_programada: { lat: number; lng: number; direccion?: string } | null;
  radio_geocerca_m: number;
  duracion_estimada_min: number;
  hora_llegada: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  estado: 'programado' | 'en_sitio' | 'en_curso' | 'concluido' | 'cancelado';
  // Cancelado por un supervisor (patch_fase2_servicios.sql): no se hizo y ya
  // no exige reporte; queda en el historial con su motivo.
  cancelado_motivo?: string | null;
  cancelado_en?: string | null;
  // Pausa en curso (ej. hora de comida) — null si no está pausado ahora
  // mismo. minutos_pausados acumula el total ya cerrado de pausas previas;
  // la pausa abierta se suma aparte con minutosPausadosTotales().
  pausado_desde: string | null;
  minutos_pausados: number;
  // Tipo y tiempo permitido de la pausa en curso (patch_control_pausas.sql).
  pausa_tipo?: string | null;
  pausa_limite_min?: number | null;
  report_id: string | null;
  // Cliente de la sección Clientes (patch_clientes_fase3.sql); null si no
  // se eligió de la lista ni coincide exacto con uno.
  cliente_id?: string | null;
  grupo_id: string;
  numero_dia: number;
  dias_totales: number;
  created_at: string;
  // Cierre y motivos de desviación (patch_eficiencia_servicios.sql). Las
  // claves de motivo y su lectura viven en lib/eficiencia.ts. Sin capturar
  // en los servicios anteriores a ese parche.
  resultado?: 'terminado' | 'pendiente' | 'no_realizado' | null;
  resultado_motivo?: string | null;
  resultado_comentario?: string | null;
  llegada_motivo?: string | null;
  llegada_comentario?: string | null;
  salida_motivo?: string | null;
  salida_comentario?: string | null;
  // Visita sin trabajo (patch_visita_sin_trabajo.sql, lib/visitaSinTrabajo.ts):
  // el técnico la deja «pendiente» y solo un supervisor la libera o rechaza.
  visita_estado?: VisitaEstado | null;
  visita_revisada_por?: string | null;
  visita_revisada_en?: string | null;
  visita_nota?: string | null;
  visita_firma?: string | null;
  visita_firma_nombre?: string | null;
};

// Lo que responde el técnico al cerrar el día: siempre el resultado; los
// motivos solo cuando no terminó o cerró fuera del horario programado.
export type CierreServicio = {
  resultado: 'terminado' | 'pendiente' | 'no_realizado';
  resultadoMotivo?: string | null;
  resultadoComentario?: string;
  salidaMotivo?: string | null;
  salidaComentario?: string;
  // Solo en «No se pudo trabajar»: quién atendió al técnico y su firma.
  firma?: string | null;
  firmaNombre?: string;
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
  tipo: 'llegada' | 'inicio' | 'retraso' | 'evidencia' | 'cierre' | 'avance' | 'pausa' | 'reanudacion' | 'salida_sitio';
  nota: string | null;
  // En pausa y reanudación (patch_control_pausas.sql): tipo de pausa, tiempo
  // permitido y, al reanudar, los minutos que duró.
  pausa_tipo?: string | null;
  limite_min?: number | null;
  minutos?: number | null;
  foto_path: string | null;
  // Evidencia en video (patch_video_evidencia.sql): foto_path es su portada.
  video_path?: string | null;
  video_duracion?: number | null;
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
  // Cliente elegido de la lista al escribir el proyecto (opcional).
  clienteId?: string | null;
  descripcion: string;
  fechas: string[]; // una fecha por día, en orden cronológico
  // Hora de llegada acordada. Opcional: sin ella no se mide puntualidad,
  // pero el servicio se programa igual.
  horaProgramada?: string | null;
  // Hora de salida acordada. Junto con horaProgramada permite calcular
  // cuánto debe durar el servicio en vez de estimarlo a ojo.
  horaSalidaProgramada?: string | null;
  // Dónde debe ocurrir el servicio. Con esto el técnico puede detectar su
  // llegada solo, comparando su GPS contra este punto.
  ubicacionProgramada?: { lat: number; lng: number; direccion?: string } | null;
  duracionMin: number;
  tecnicoIds: string[];
  tareas: string[];
  // Lista de carga capturada al programar. Se guarda junto con el proyecto
  // para que el técnico la tenga desde el primer día.
  insumos?: { categoria: string; descripcion: string; cantidad: number; unidad: string; articuloId?: string | null }[];
}, onAvance?: Avance): Promise<Servicio[]> {
  const supabase = createClient();
  onAvance?.(8, 'Verificando tu sesión');
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
    onAvance?.(15 + (50 * (dia - 1)) / diasTotales, diasTotales > 1 ? `Programando día ${dia} de ${diasTotales}` : 'Programando el servicio');
    const { data: servicio, error: e1 } = await supabase
      .from('servicios_programados')
      .insert({
        creado_por: user.id,
        proyecto: input.proyecto,
        cliente_id: input.clienteId || null,
        descripcion: input.descripcion || null,
        fecha: fechas[dia - 1],
        hora_programada: input.horaProgramada || null,
        hora_salida_programada: input.horaSalidaProgramada || null,
        ubicacion_programada: input.ubicacionProgramada || null,
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
    onAvance?.(68, 'Creando la lista de tareas');
    const { error: e3 } = await supabase
      .from('servicio_tareas')
      .insert(input.tareas.map((desc, i) => ({ servicio_id: diasCreados[0].id, grupo_id: grupoId, descripcion: desc, orden: i })));
    if (e3) throw e3;
  }

  // La lista de herramienta y material también es del proyecto completo.
  if (input.insumos && input.insumos.length > 0) {
    onAvance?.(77, 'Guardando la lista de carga');
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

  onAvance?.(86, input.tecnicoIds.length > 0 ? 'Avisando al personal asignado' : 'Registrando el servicio');
  await registrarAccionGlobal(
    'programo_servicio',
    'servicio',
    diasCreados[0].id,
    `Programó «${input.proyecto}» — ${diasTotales} día(s), ${input.tecnicoIds.length} persona(s), ${input.tareas.length} tarea(s). Fechas: ${fechas.join(', ')}`
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

  // Dos días del mismo proyecto no pueden compartir fecha: la renumeración
  // de abajo ordena por fecha, y con dos iguales el orden entre ellos queda
  // arbitrario — en la práctica se ven como el mismo día duplicado.
  // .limit(1) en vez de .single()/.maybeSingle(): así no truena con el error
  // críptico de Postgrest ("JSON object requested...") si por lo que sea
  // hay más de una fila con esa fecha — solo interesa si hay alguna.
  const { data: choque, error: eChoque } = await supabase
    .from('servicios_programados')
    .select('id')
    .eq('grupo_id', actual.grupo_id)
    .eq('fecha', nuevaFecha)
    .neq('id', servicioId)
    .limit(1);
  if (eChoque) throw eChoque;
  if (choque && choque.length > 0) {
    throw new Error(`Ya hay un día de este proyecto programado para el ${nuevaFecha}. Elige otra fecha.`);
  }

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
  const [y, m, d] = nuevaFecha.split('-');
  await avisarCambioATecnicos(servicioId, actual.proyecto, `ahora es el ${d}/${m}/${y}`);
}

// Cancelar un día que no se va a hacer (el cliente canceló, no llegó el
// equipo…). A diferencia de eliminarlo, queda en el historial con su motivo
// y ya no exige reporte. La base valida que sea supervisor y que no se haya
// empezado (patch_fase2_servicios.sql).
export async function cancelarServicio(servicioId: string, motivo: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  if (!motivo.trim()) throw new Error('Indica el motivo de la cancelación.');
  const { data: sv, error: eSv } = await supabase
    .from('servicios_programados').select('proyecto, fecha, estado, numero_dia, dias_totales').eq('id', servicioId).single();
  if (eSv) throw eSv;
  if (sv.estado !== 'programado') throw new Error('Solo se puede cancelar un servicio que no se ha empezado.');
  const { error } = await supabase
    .from('servicios_programados')
    .update({ estado: 'cancelado', cancelado_motivo: motivo.trim() })
    .eq('id', servicioId);
  if (error) throw error;
  const etiqueta = `«${sv.proyecto}»${sv.dias_totales > 1 ? ` (día ${sv.numero_dia}/${sv.dias_totales})` : ''}`;
  const cambio = `Canceló ${etiqueta} del ${fechaDMA(sv.fecha)}: ${motivo.trim()}`;
  await supabase.from('servicio_auditoria').insert({ servicio_id: servicioId, supervisor_id: user.id, cambio });
  await registrarAccionGlobal('cambio_en_dia', 'servicio', servicioId, cambio);
  const { data: asig } = await supabase.from('servicio_tecnicos').select('tecnico_id').eq('servicio_id', servicioId);
  const ids = (asig || []).map((r: any) => r.tecnico_id as string);
  if (ids.length > 0) {
    await notificar({
      usuarios: ids,
      tipo: 'servicio_asignado',
      titulo: 'Se canceló un servicio',
      mensaje: `${etiqueta} del ${fechaDMA(sv.fecha)}: ${motivo.trim()}`,
      url: '/servicios',
      tag: `servicio-cancelado-${servicioId}`,
    });
  }
}

export async function reactivarServicio(servicioId: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  const { data: sv, error: eSv } = await supabase.from('servicios_programados').select('proyecto, fecha').eq('id', servicioId).single();
  if (eSv) throw eSv;
  const { error } = await supabase.from('servicios_programados').update({ estado: 'programado' }).eq('id', servicioId);
  if (error) throw error;
  const cambio = `Reactivó «${sv.proyecto}» del ${fechaDMA(sv.fecha)}`;
  await supabase.from('servicio_auditoria').insert({ servicio_id: servicioId, supervisor_id: user.id, cambio });
  await registrarAccionGlobal('cambio_en_dia', 'servicio', servicioId, cambio);
  await avisarCambioATecnicos(servicioId, sv.proyecto, 'se reactivó');
}

function fechaDMA(f: string): string {
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
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
        cliente_id: ultimoDia.cliente_id || null,
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

// --- Confirmación de servicio asignado (ver patch_confirmacion_servicio.sql) ---

export type ConfirmacionTecnico = {
  tecnico_id: string;
  nombre: string;
  visto_en: string | null;
  enterado_en: string | null;
};

// Estado de confirmación de cada técnico, por día de servicio. Solo el
// supervisor ve todas las filas (RLS); al técnico le devuelve la suya.
export async function listarConfirmacionesPorServicio(): Promise<Record<string, ConfirmacionTecnico[]>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('servicio_tecnicos')
    .select('servicio_id, tecnico_id, visto_en, enterado_en, profiles(full_name)');
  if (error) throw error;
  const mapa: Record<string, ConfirmacionTecnico[]> = {};
  (data || []).forEach((r: any) => {
    const nombre = Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name;
    if (!mapa[r.servicio_id]) mapa[r.servicio_id] = [];
    mapa[r.servicio_id].push({ tecnico_id: r.tecnico_id, nombre: nombre || 'Personal técnico', visto_en: r.visto_en, enterado_en: r.enterado_en });
  });
  return mapa;
}

// Mis asignaciones con su estado de confirmación (vista del técnico).
export async function listarMisConfirmaciones(): Promise<Record<string, { visto_en: string | null; enterado_en: string | null }>> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const { data, error } = await supabase
    .from('servicio_tecnicos')
    .select('servicio_id, visto_en, enterado_en')
    .eq('tecnico_id', user.id);
  if (error) throw error;
  const mapa: Record<string, { visto_en: string | null; enterado_en: string | null }> = {};
  (data || []).forEach((r: any) => { mapa[r.servicio_id] = { visto_en: r.visto_en, enterado_en: r.enterado_en }; });
  return mapa;
}

// Best-effort: si falla, el técnico sigue viendo su lista con normalidad.
export async function marcarServiciosVistos(servicioIds: string[]): Promise<void> {
  if (servicioIds.length === 0) return;
  try {
    await createClient().rpc('marcar_servicios_vistos', { p_servicios: servicioIds });
  } catch (e) {
    console.error('No se pudo marcar como visto:', e);
  }
}

// "Enterado": confirma este día y los demás pendientes del mismo proyecto, y
// avisa a los supervisores.
export async function confirmarServicio(servicio: Pick<Servicio, 'id' | 'proyecto' | 'fecha' | 'dias_totales'>): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('confirmar_servicio', { p_servicio: servicio.id });
  if (error) throw error;
  const n = (data as number) || 0;
  if (n > 0) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: perfil } = user
      ? await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      : { data: null };
    const [y, m, d] = servicio.fecha.split('-');
    await notificar({
      destino: 'supervisores',
      tipo: 'servicio_confirmado',
      titulo: 'Servicio confirmado',
      mensaje: `${perfil?.full_name || 'Alguien del equipo'} está enterado de «${servicio.proyecto}» (${servicio.dias_totales > 1 ? `${n} día(s) desde el ` : ''}${d}/${m}/${y})`,
      url: `/dashboard/servicios/${servicio.id}`,
      tag: `servicio-confirmado-${servicio.id}`,
    });
  }
  return n;
}

// Cuando cambia el plan de un día (fecha u hora), la confirmación se
// reinicia en la base (trigger); esto le avisa al técnico que debe volver a
// confirmar.
async function avisarCambioATecnicos(servicioId: string, proyecto: string, detalle: string): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.from('servicio_tecnicos').select('tecnico_id').eq('servicio_id', servicioId);
  const ids = (data || []).map((r: any) => r.tecnico_id as string);
  if (ids.length === 0) return;
  await notificar({
    usuarios: ids,
    tipo: 'servicio_asignado',
    titulo: 'Cambió un servicio tuyo',
    mensaje: `«${proyecto}»: ${detalle}. Confirma que estás enterado.`,
    url: `/servicios/${servicioId}`,
    tag: `servicio-cambio-${servicioId}`,
  });
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
    // Un servicio cancelado ya no es trabajo del técnico (le llegó el aviso).
    .neq('estado', 'cancelado')
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data as Servicio[]) || [];
}

// Sitios de HOY donde el técnico actual NO está asignado, para comparar su
// posición y detectar si está parado en un servicio ajeno. No trae nombre de
// proyecto ni de nadie — ver sitiosActivosHoy() en la base para el porqué.
export async function listarSitiosActivosHoy(): Promise<{ servicio_id: string; lat: number; lng: number; radio_m: number }[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('sitios_activos_hoy');
  if (error) throw error;
  return (data as any[]) || [];
}

// Avisa a los supervisores que un técnico fue detectado en un sitio
// programado que no le corresponde. `servicioId` es el del sitio ajeno, no
// el del propio técnico — así el supervisor cae directo en el servicio
// afectado al tocar la notificación.
export async function avisarTecnicoFueraDeSitio(servicioId: string): Promise<void> {
  const quien = await nombreDelUsuario();
  await notificar({
    destino: 'supervisores',
    tipo: 'tecnico_fuera_de_sitio',
    titulo: 'Personal en sitio sin asignar',
    mensaje: `${quien} está en un sitio programado donde no tiene servicio asignado.`,
    url: `/dashboard/servicios/${servicioId}`,
    tag: 'anomalia-sitio',
  });
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
    .or(FILTRO_DEBE_REPORTE)
    .neq('estado', 'cancelado')
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
      // Un servicio sin grupo (datos cargados por fuera de la app) trae solo sus propias tareas.
      (servicio as Servicio).grupo_id
        ? supabase.from('servicio_tareas').select('*').eq('grupo_id', (servicio as Servicio).grupo_id).order('orden')
        : supabase.from('servicio_tareas').select('*').eq('servicio_id', id).order('orden'),
      supabase.from('servicio_eventos').select('*').eq('servicio_id', id).order('created_at', { ascending: false }),
      supabase.from('servicio_tecnicos').select('tecnico_id, visto_en, enterado_en, profiles(full_name)').eq('servicio_id', id),
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
  if (estado === 'en_curso') return 'Este servicio ya empezó. Para cambiarlo hay que esperar a que cierre o pedirle que lo detenga.';
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
    .from('servicios_programados').select('estado, fecha').eq('id', id).single();
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
  if (cambios.fecha && cambios.fecha !== actual.fecha) {
    const [y, m, d] = cambios.fecha.split('-');
    await avisarCambioATecnicos(id, sv?.proyecto || cambios.proyecto || 'Servicio', `ahora es el ${d}/${m}/${y}`);
  }
}

export async function reasignarTecnicos(id: string, tecnicoIds: string[], descripcionCambio: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const { data: svActual, error: eSv } = await supabase
    .from('servicios_programados').select('estado').eq('id', id).single();
  if (eSv) throw eSv;
  if (motivoNoEditable(svActual.estado)) {
    throw new Error('No se puede cambiar el personal de un servicio que ya empezó. Quien hizo el trabajo debe seguir apareciendo en él.');
  }

  // Solo se quitan los que salen y se agregan los que entran: quien sigue
  // asignado conserva su "Visto"/"Enterado".
  const { data: actuales, error: eAct } = await supabase.from('servicio_tecnicos').select('tecnico_id').eq('servicio_id', id);
  if (eAct) throw eAct;
  const antes = new Set((actuales || []).map((r: any) => r.tecnico_id as string));
  const salen = [...antes].filter((tid) => !tecnicoIds.includes(tid));
  const entran = tecnicoIds.filter((tid) => !antes.has(tid));
  if (salen.length > 0) {
    const { error: eDel } = await supabase.from('servicio_tecnicos').delete().eq('servicio_id', id).in('tecnico_id', salen);
    if (eDel) throw eDel;
  }
  if (entran.length > 0) {
    const { error: eIns } = await supabase.from('servicio_tecnicos').insert(entran.map((tid) => ({ servicio_id: id, tecnico_id: tid })));
    if (eIns) throw eIns;
  }
  const { error: eAud } = await supabase.from('servicio_auditoria').insert({ servicio_id: id, supervisor_id: user.id, cambio: descripcionCambio });
  if (eAud) throw eAud;

  const { data: sv } = await supabase.from('servicios_programados').select('proyecto, numero_dia, dias_totales').eq('id', id).single();
  const etiqueta = sv ? `«${sv.proyecto}»${sv.dias_totales > 1 ? ` (día ${sv.numero_dia}/${sv.dias_totales})` : ''}` : 'servicio';
  await registrarAccionGlobal('reasigno_tecnicos', 'servicio', id, `${descripcionCambio} en ${etiqueta}`);
  if (entran.length > 0 && sv) {
    await notificar({
      usuarios: entran,
      tipo: 'servicio_asignado',
      titulo: 'Te asignaron un servicio',
      mensaje: `${etiqueta}. Confirma que estás enterado.`,
      url: `/servicios/${id}`,
      tag: 'servicio-asignado',
    });
  }
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
  file = await reducirFoto(file);
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

// Por qué se llegó después de la hora acordada. Se pregunta después de marcar
// la llegada (que puede ser automática por GPS), no antes.
export async function registrarMotivoLlegada(servicioId: string, motivo: string, comentario: string): Promise<void> {
  const { error } = await createClient()
    .from('servicios_programados')
    .update({ llegada_motivo: motivo, llegada_comentario: comentario.trim() || null })
    .eq('id', servicioId);
  if (error) throw error;
}

// Nombre de quien realiza la acción, para que el aviso diga quién y no solo qué.
async function nombreDelUsuario(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Alguien del equipo';
  const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
  return data?.full_name || 'Alguien del equipo';
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

// Tiempos permitidos de pausa y de respuesta a una verificación. Si la tabla
// aún no existe o no se puede leer, se usan los de fábrica: una pausa nunca
// debe fallar por no poder leer un ajuste.
export async function leerAjustesOperacion(): Promise<AjustesOperacion> {
  const supabase = createClient();
  const { data } = await supabase
    .from('ajustes_operacion')
    .select('comida_min, otras_pausas_min, tolerancia_min, verificacion_min')
    .maybeSingle();
  return { ...AJUSTES_POR_DEFECTO, ...((data as Partial<AjustesOperacion>) || {}) };
}

export async function guardarAjustesOperacion(ajustes: AjustesOperacion): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('ajustes_operacion')
    .update({ ...ajustes, actualizado_en: new Date().toISOString(), actualizado_por: user?.id })
    .eq('id', true);
  if (error) throw error;
}

// Cuántas pausas de comida lleva ya este día de servicio. Sirve para avisar
// antes de tomar una segunda.
export async function comidasTomadas(servicioId: string): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from('servicio_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('servicio_id', servicioId)
    .eq('tipo', 'pausa')
    .eq('pausa_tipo', 'comida');
  return count || 0;
}

// Distancia de una ubicación al sitio programado, o null si falta alguna de
// las dos (permiso de ubicación negado, servicio sin dirección en el mapa).
function distanciaAlSitio(
  sitio: { lat: number; lng: number } | null | undefined,
  ubicacion: { lat: number; lng: number } | null
): number | null {
  if (!sitio || !ubicacion) return null;
  return Math.round(distanciaMetros(ubicacion, sitio));
}

export type DatosPausa = {
  tipo: TipoPausa;
  // Motivo escrito («Otro») o a dónde va (compra de material).
  detalle?: string;
  // Solo compra de material: cuánto dijo que tardaría.
  estimadoMin?: number | null;
};

// El técnico pausa el servicio él mismo (ej. hora de comida). Sin la app
// abierta en pantalla no hay rastreo en segundo plano (sobre todo en
// iPhone), así que la salida no se puede adivinar por GPS: se declara. Cada
// pausa lleva su tipo y su tiempo permitido; el cron de recordatorios avisa
// cuando está por terminar y cuando se excede. El tiempo pausado se
// descuenta del cálculo de «excedido» del servicio.
export async function pausarServicio(servicioId: string, datos: DatosPausa): Promise<{ limiteMin: number }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [ubicacion, ajustes, comidas] = await Promise.all([
    getCurrentLocation(),
    leerAjustesOperacion(),
    datos.tipo === 'comida' ? comidasTomadas(servicioId) : Promise.resolve(0),
  ]);
  const limiteMin = limiteDePausa(datos.tipo, ajustes, datos.estimadoMin);
  const detalle = datos.detalle?.trim() || '';

  const { data: actualizado, error: e1 } = await supabase
    .from('servicios_programados')
    .update({ pausado_desde: new Date().toISOString(), pausa_tipo: datos.tipo, pausa_limite_min: limiteMin, pausa_avisos: 0 })
    .eq('id', servicioId)
    .is('pausado_desde', null) // ya pausado: no reinicia el reloj de la pausa
    .select('id, proyecto')
    .maybeSingle();
  if (e1) throw e1;
  if (!actualizado) return { limiteMin }; // ya estaba pausado (doble toque) — no duplicar el evento

  const esExtra = datos.tipo === 'comida' && comidas > 0;
  const nota = [
    textoTipoPausa(datos.tipo) + (esExtra ? ' (extra: ya había tomado su comida)' : ''),
    detalle,
    `hasta ${minutosTexto(limiteMin)}`,
  ].filter(Boolean).join(' · ');

  const { error: e2 } = await supabase
    .from('servicio_eventos')
    .insert({
      servicio_id: servicioId, tipo: 'pausa', nota, ubicacion, created_by: user?.id,
      pausa_tipo: datos.tipo, limite_min: limiteMin,
    });
  if (e2) throw e2;

  const quien = await nombreDelUsuario();
  const proyecto = (actualizado as any).proyecto || 'un servicio';
  if (datos.tipo === 'material') {
    // Salir del sitio por material sí se avisa siempre: es lo que distingue
    // una salida declarada de una ausencia.
    await notificar({
      destino: 'supervisores',
      tipo: 'salida_sitio',
      titulo: 'Salida por material',
      mensaje: `${quien} salió de ${proyecto}${detalle ? ` a ${detalle}` : ''}. Calcula ${minutosTexto(limiteMin)}.`,
      url: `/dashboard/servicios/${servicioId}`,
      tag: `pausa-${servicioId}`,
    });
  } else {
    await notificar({
      destino: 'supervisores',
      tipo: 'pausa_servicio',
      titulo: esExtra ? 'Segunda pausa de comida' : 'Servicio en pausa',
      mensaje: `${quien} pausó ${proyecto}: ${textoTipoPausa(datos.tipo)}${detalle ? ` — ${detalle}` : ''}`,
      url: `/dashboard/servicios/${servicioId}`,
      tag: `pausa-${servicioId}`,
    });
  }
  return { limiteMin };
}

export type ResultadoReanudar = {
  minutos: number;
  // Minutos de más sobre lo permitido (0 si volvió a tiempo).
  excedidos: number;
  // Distancia al sitio al reanudar, si se pudo medir, y si eso es «fuera».
  distanciaM: number | null;
  fuera: boolean;
};

export async function reanudarServicio(servicioId: string): Promise<ResultadoReanudar | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ubicacion = await getCurrentLocation();

  const { data: sv, error: eSv } = await supabase
    .from('servicios_programados')
    .select('proyecto, pausado_desde, minutos_pausados, pausa_tipo, pausa_limite_min, ubicacion_programada, radio_geocerca_m')
    .eq('id', servicioId)
    .single();
  if (eSv) throw eSv;
  if (!sv?.pausado_desde) return null; // no estaba pausado — nada que hacer

  const minutos = Math.max(0, Math.round((Date.now() - new Date(sv.pausado_desde).getTime()) / 60000));
  const limite = (sv.pausa_limite_min as number | null) || null;
  const excedidos = limite ? Math.max(0, minutos - limite) : 0;
  const distanciaM = distanciaAlSitio(sv.ubicacion_programada as any, ubicacion);
  const fuera = distanciaM !== null && fueraDeSitio(distanciaM, ubicacion?.accuracy, (sv.radio_geocerca_m as number) || 120);

  const { error: e1 } = await supabase
    .from('servicios_programados')
    .update({
      pausado_desde: null, minutos_pausados: (sv.minutos_pausados || 0) + minutos,
      pausa_tipo: null, pausa_limite_min: null, pausa_avisos: 0,
    })
    .eq('id', servicioId);
  if (e1) throw e1;

  const nota = [
    `${minutosTexto(minutos)} de pausa`,
    excedidos > 0 ? `${minutosTexto(excedidos)} de más` : '',
    fuera ? `reanudó a ${distanciaTexto(distanciaM!)} del sitio` : '',
    !ubicacion && sv.ubicacion_programada ? 'sin ubicación' : '',
  ].filter(Boolean).join(' · ');

  const { error: e2 } = await supabase
    .from('servicio_eventos')
    .insert({
      servicio_id: servicioId, tipo: 'reanudacion', nota, ubicacion, created_by: user?.id,
      pausa_tipo: sv.pausa_tipo || null, limite_min: limite, minutos, fuera_sitio: fuera,
    });
  if (e2) throw e2;

  const quien = await nombreDelUsuario();
  const proyecto = sv.proyecto || 'un servicio';
  if (fuera) {
    // Reanudar lejos del sitio es justo lo que hay que ver: el reloj vuelve
    // a correr sin que la persona esté trabajando.
    await notificar({
      destino: 'supervisores',
      tipo: 'salida_sitio',
      titulo: 'Reanudó fuera del sitio',
      mensaje: `${quien} reanudó ${proyecto} a ${distanciaTexto(distanciaM!)} del sitio.`,
      url: `/dashboard/servicios/${servicioId}`,
      tag: `pausa-${servicioId}`,
    });
  } else {
    await notificar({
      destino: 'supervisores',
      tipo: 'reanudacion_servicio',
      titulo: 'Servicio reanudado',
      mensaje: `${quien} reanudó ${proyecto} tras ${minutosTexto(minutos)}${excedidos > 0 ? ` (${minutosTexto(excedidos)} de más)` : ''}`,
      url: `/dashboard/servicios/${servicioId}`,
      tag: `pausa-${servicioId}`,
    });
  }
  return { minutos, excedidos, distanciaM, fuera };
}

// Pausas cerradas y salidas detectadas desde una fecha, con quién las hizo:
// la materia prima del indicador de pausas del Resumen.
export async function listarPausasEquipo(desdeIso: string): Promise<EventoPausa[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('servicio_eventos')
    .select('tipo, pausa_tipo, minutos, limite_min, fuera_sitio, created_by, profiles!servicio_eventos_created_by_fkey(full_name)')
    .in('tipo', ['reanudacion', 'salida_sitio'])
    .gte('created_at', desdeIso)
    .limit(2000);
  if (error) throw error;
  return ((data as any[]) || []).map(({ profiles, ...e }) => ({
    ...e,
    nombre: (Array.isArray(profiles) ? profiles[0]?.full_name : profiles?.full_name) || 'Personal técnico',
  })) as EventoPausa[];
}

// La app detectó al técnico lejos del sitio con el servicio en curso y sin
// pausa. Solo ocurre con la pantalla del servicio abierta. Una vez cada
// media hora como mucho: el GPS puede rebotar y no se trata de llenar el
// historial ni el teléfono de supervisión.
export async function registrarSalidaDeSitio(servicioId: string, distanciaM: number, ubicacion: { lat: number; lng: number; accuracy?: number }): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const haceMediaHora = new Date(Date.now() - 30 * 60000).toISOString();
  const { count } = await supabase
    .from('servicio_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('servicio_id', servicioId)
    .eq('tipo', 'salida_sitio')
    .gte('created_at', haceMediaHora);
  if ((count || 0) > 0) return false;

  const { error } = await supabase.from('servicio_eventos').insert({
    servicio_id: servicioId,
    tipo: 'salida_sitio',
    nota: `Detectado a ${distanciaTexto(distanciaM)} del sitio, sin pausa`,
    ubicacion,
    fuera_sitio: true,
    created_by: user?.id,
  });
  if (error) throw error;

  const { data: sv } = await supabase.from('servicios_programados').select('proyecto').eq('id', servicioId).single();
  const quien = await nombreDelUsuario();
  await notificar({
    destino: 'supervisores',
    tipo: 'salida_sitio',
    titulo: 'Fuera del sitio sin pausa',
    mensaje: `${quien} está a ${distanciaTexto(distanciaM)} de ${sv?.proyecto || 'su servicio'} con el servicio en curso.`,
    url: `/dashboard/servicios/${servicioId}`,
    tag: `salida-${servicioId}`,
  });
  return true;
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

// Video de evidencia: la portada va en foto_path (así aparece en todo lo que
// ya muestra fotos) y el video en video_path.
export async function agregarVideoEvidencia(servicioId: string, v: VideoGrabado): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [ubicacion, foto_path, video_path] = await Promise.all([
    getCurrentLocation(),
    subirFotoServicio(servicioId, v.poster),
    subirVideo(`servicios/${servicioId}`, v.video),
  ]);
  const { error } = await supabase
    .from('servicio_eventos')
    .insert({ servicio_id: servicioId, tipo: 'evidencia', nota: null, foto_path, video_path, video_duracion: v.dur, ubicacion, created_by: user?.id });
  if (error) throw error;
}

// Comentario de una evidencia ya guardada. La foto rápida se guarda sin
// texto para no detener el trabajo; el comentario se puede poner (o corregir)
// después, mientras el día no se haya concluido: cerrado, lo registrado es el
// respaldo de lo que se hizo.
export async function actualizarNotaEvidencia(eventoId: string, servicioId: string, nota: string): Promise<void> {
  const supabase = createClient();
  const { data: sv, error: e1 } = await supabase.from('servicios_programados').select('estado').eq('id', servicioId).single();
  if (e1) throw e1;
  if (sv.estado === 'concluido') throw new Error('El servicio ya se concluyó; sus evidencias ya no se modifican.');
  const { error } = await supabase
    .from('servicio_eventos')
    .update({ nota: nota.trim() || null })
    .eq('id', eventoId)
    .eq('servicio_id', servicioId)
    .eq('tipo', 'evidencia');
  if (error) throw error;
}

export async function concluirServicio(servicioId: string, cierre: CierreServicio) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ubicacion = await getCurrentLocation();
  const horaFin = new Date().toISOString();

  // Si se olvidó reanudar antes de cerrar, la pausa abierta se cierra sola
  // aquí: sin esto, minutos_pausados quedaría corto y el servicio se vería
  // más retrasado de lo que en realidad estuvo.
  await reanudarServicio(servicioId).catch(() => {});

  const { error: e1 } = await supabase.from('servicios_programados').update({
    hora_fin: horaFin,
    estado: 'concluido',
    resultado: cierre.resultado,
    resultado_motivo: cierre.resultado === 'terminado' ? null : cierre.resultadoMotivo || null,
    resultado_comentario: cierre.resultado === 'terminado' ? null : cierre.resultadoComentario?.trim() || null,
    salida_motivo: cierre.salidaMotivo || null,
    salida_comentario: cierre.salidaComentario?.trim() || null,
    // No se trabajó: queda por revisar; el supervisor decide si se libera
    // del reporte.
    ...(cierre.resultado === 'no_realizado'
      ? { visita_estado: 'pendiente', visita_firma: cierre.firma || null, visita_firma_nombre: cierre.firmaNombre?.trim() || null }
      : {}),
  }).eq('id', servicioId);
  if (e1) throw e1;

  const { error: e2 } = await supabase.from('servicio_eventos').insert({ servicio_id: servicioId, tipo: 'cierre', ubicacion, created_by: user?.id });
  if (e2) throw e2;

  // El aviso incluye si quedó fuera de tiempo: un cierre normal es rutina,
  // uno con retraso es lo que el supervisor necesita saber en el momento.
  const { data: sv } = await supabase
    .from('servicios_programados')
    .select('proyecto, duracion_estimada_min, hora_llegada, hora_inicio, hora_fin, pausado_desde, minutos_pausados')
    .eq('id', servicioId)
    .single();

  let extra = '';
  if (sv) {
    const et = calcularEstadoTiempo(sv as any);
    if (et.tipo === 'retraso' && et.minutos) extra = ` · ${et.minutos} min de más`;
  }
  // Lo que no quedó terminado es lo que el supervisor necesita saber ya.
  if (cierre.resultado !== 'terminado') {
    extra += ` · ${cierre.resultado === 'pendiente' ? 'quedó trabajo pendiente' : 'no se pudo realizar'}${cierre.resultadoMotivo ? ` (${textoMotivo(cierre.resultadoMotivo).toLowerCase()})` : ''}`;
  }

  const quien = await nombreDelUsuario();
  if (cierre.resultado === 'no_realizado') {
    await notificar({
      destino: 'supervisores',
      tipo: 'cierre_servicio',
      titulo: 'Visita sin trabajo: revisar',
      mensaje: `${quien} no pudo trabajar en ${sv?.proyecto || 'un servicio'}${cierre.resultadoMotivo ? ` (${textoMotivo(cierre.resultadoMotivo).toLowerCase()})` : ''}. Decide si se libera del reporte y reprográmalo.`,
      url: `/dashboard/servicios/${servicioId}`,
      tag: 'visita-sin-trabajo',
    });
    return;
  }
  await notificar({
    destino: 'supervisores',
    tipo: 'cierre_servicio',
    titulo: 'Servicio concluido',
    mensaje: `${quien} cerró ${sv?.proyecto || 'un servicio'}${extra}`,
    url: `/dashboard/servicios/${servicioId}`,
    tag: 'cierre',
  });
}

// «No se pudo trabajar»: el técnico llegó y el trabajo no se pudo hacer. Guarda
// la foto (si la hay) como evidencia y cierra el día como no realizado; el
// servicio queda por revisar por un supervisor.
export async function registrarVisitaSinTrabajo(servicioId: string, datos: {
  motivo: string;
  comentario: string;
  foto?: File | null;
  firma?: string | null;
  firmaNombre?: string;
}): Promise<void> {
  if (datos.foto) {
    await agregarEvidenciaExtra(servicioId, `Visita sin trabajo: ${datos.comentario.trim()}`, datos.foto);
  }
  await concluirServicio(servicioId, {
    resultado: 'no_realizado',
    resultadoMotivo: datos.motivo,
    resultadoComentario: datos.comentario,
    firma: datos.firma || null,
    firmaNombre: datos.firmaNombre,
  });
}

// Decisión del supervisor sobre una visita sin trabajo. También sirve para
// liberar un día ya concluido que el técnico cerró de otra forma (la base
// solo se lo permite a un supervisor).
export async function resolverVisitaSinTrabajo(servicioId: string, decision: 'liberado' | 'rechazado', nota: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  if (decision === 'rechazado' && !nota.trim()) throw new Error('Explica por qué sí requiere reporte.');

  const { data: dia, error: eGet } = await supabase
    .from('servicios_programados')
    .select('proyecto, estado, report_id, numero_dia, dias_totales')
    .eq('id', servicioId)
    .single();
  if (eGet) throw eGet;
  if (dia.estado !== 'concluido') throw new Error('El día todavía no está concluido.');
  if (dia.report_id && decision === 'liberado') throw new Error('Este día ya tiene un reporte ligado.');

  const { error } = await supabase.from('servicios_programados').update({
    visita_estado: decision,
    visita_revisada_por: user.id,
    visita_revisada_en: new Date().toISOString(),
    visita_nota: nota.trim() || null,
  }).eq('id', servicioId);
  if (error) throw error;

  const etiqueta = `«${dia.proyecto}»${dia.dias_totales > 1 ? ` (día ${dia.numero_dia}/${dia.dias_totales})` : ''}`;
  const cambio = decision === 'liberado'
    ? `Liberó del reporte ${etiqueta} por visita sin trabajo${nota.trim() ? `: ${nota.trim()}` : ''}`
    : `Indicó que ${etiqueta} sí requiere reporte: ${nota.trim()}`;
  await supabase.from('servicio_auditoria').insert({ servicio_id: servicioId, supervisor_id: user.id, cambio });
  await registrarAccionGlobal(decision === 'liberado' ? 'libero_reporte' : 'exigio_reporte', 'servicio', servicioId, cambio);

  const { data: asignados } = await supabase.from('servicio_tecnicos').select('tecnico_id').eq('servicio_id', servicioId);
  const usuarios = (asignados || []).map((a: any) => a.tecnico_id as string);
  if (usuarios.length > 0) {
    await notificar({
      usuarios,
      tipo: decision === 'liberado' ? 'cierre_servicio' : 'reporte_pendiente',
      titulo: decision === 'liberado' ? 'Visita sin trabajo aceptada' : 'Ese servicio sí requiere reporte',
      mensaje: decision === 'liberado'
        ? `${dia.proyecto}: no necesitas hacer reporte de ese día.`
        : `${dia.proyecto}: ${nota.trim()}`,
      url: `/servicios/${servicioId}`,
      tag: 'visita-sin-trabajo',
    });
  }
}

// Programa de nuevo un servicio que no se pudo hacer: mismo cliente,
// técnicos, horario, ubicación y tareas, en otra fecha. Es un servicio
// nuevo; el original queda en el historial como visita sin trabajo.
export async function reprogramarVisita(servicioId: string, fecha: string, onAvance?: Avance): Promise<Servicio> {
  const supabase = createClient();
  const { data: sv, error: e1 } = await supabase.from('servicios_programados').select('*').eq('id', servicioId).single();
  if (e1) throw e1;
  const s = sv as Servicio;
  const [{ data: tecs }, { data: tareas }] = await Promise.all([
    supabase.from('servicio_tecnicos').select('tecnico_id').eq('servicio_id', servicioId),
    supabase.from('servicio_tareas').select('descripcion, completada').eq('grupo_id', s.grupo_id).order('orden', { ascending: true }),
  ]);
  const pendientes = ((tareas || []) as any[]).filter((t) => !t.completada).map((t) => t.descripcion as string);
  const creados = await crearServicio({
    proyecto: s.proyecto,
    clienteId: s.cliente_id || null,
    descripcion: s.descripcion || '',
    fechas: [fecha],
    horaProgramada: (s as any).hora_programada || null,
    horaSalidaProgramada: (s as any).hora_salida_programada || null,
    ubicacionProgramada: (s as any).ubicacion_programada || null,
    duracionMin: s.duracion_estimada_min,
    tecnicoIds: ((tecs || []) as any[]).map((t) => t.tecnico_id as string),
    tareas: pendientes,
  }, onAvance);
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('servicio_auditoria').insert({
      servicio_id: servicioId, supervisor_id: user.id,
      cambio: `Reprogramó la visita sin trabajo para el ${fecha.split('-').reverse().join('/')}`,
    });
  }
  return creados[0];
}

// Para cuando el técnico nunca marcó llegada/inicio (se le olvidó, o el
// reporte se hizo al día siguiente) y para cuando quiso cerrarlo la fecha
// programada ya había pasado — la ventana se lo impide del lado del
// técnico, y el día se queda atorado en "programado" para siempre aunque
// el reporte ya exista y esté vinculado. Es la salida manual para ese caso:
// el supervisor lo cierra a mano, dejando constancia de por qué en la
// auditoría. A propósito NO inserta un evento de "cierre" con ubicación,
// como si un técnico lo hubiera hecho ahora mismo — eso sería falsear
// cuándo y desde dónde ocurrió.
export async function cerrarDiaManualmente(servicioId: string, motivo: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  if (!motivo.trim()) throw new Error('Hay que indicar por qué se cierra manualmente.');

  const { data: dia, error: eGet } = await supabase
    .from('servicios_programados')
    .select('id, proyecto, estado, report_id, numero_dia, dias_totales')
    .eq('id', servicioId)
    .single();
  if (eGet) throw eGet;
  if (dia.estado === 'concluido') throw new Error('Este día ya está concluido.');
  if (!dia.report_id) {
    throw new Error('Este día no tiene un reporte vinculado. Si nunca se trabajó, bórralo en vez de cerrarlo; si sí se trabajó, vincula primero el reporte.');
  }

  const { error: eUpd } = await supabase
    .from('servicios_programados')
    .update({ estado: 'concluido', hora_fin: new Date().toISOString() })
    .eq('id', servicioId);
  if (eUpd) throw eUpd;

  const etiqueta = `«${dia.proyecto}»${dia.dias_totales > 1 ? ` (día ${dia.numero_dia}/${dia.dias_totales})` : ''}`;
  const cambio = `Cerró manualmente ${etiqueta}: ${motivo.trim()}`;
  await supabase.from('servicio_auditoria').insert({ servicio_id: servicioId, supervisor_id: user.id, cambio });
  await registrarAccionGlobal('cerro_dia_manual', 'servicio', servicioId, cambio);
}

// Cierra el día como concluirServicio(), y además cancela los días
// siguientes del mismo proyecto que todavía no se hayan empezado — para
// cuando el trabajo se termina antes de lo programado y esos días ya no
// se van a usar. Solo toca días en estado "programado" (nadie llegó a
// trabajarlos); si alguno ya tiene actividad o reporte, se deja tal cual
// en vez de fallar toda la operación por un solo día.
export async function concluirServicioAnticipado(servicioId: string, cierre: CierreServicio): Promise<{ diasCancelados: number }> {
  const supabase = createClient();

  const { data: dia, error: eDia } = await supabase
    .from('servicios_programados')
    .select('grupo_id, numero_dia')
    .eq('id', servicioId)
    .single();
  if (eDia) throw eDia;

  await concluirServicio(servicioId, cierre);

  const { data: siguientes } = await supabase
    .from('servicios_programados')
    .select('id, numero_dia')
    .eq('grupo_id', dia.grupo_id)
    .eq('estado', 'programado')
    .gt('numero_dia', dia.numero_dia);

  let diasCancelados = 0;
  for (const d of (siguientes || []) as any[]) {
    try {
      await eliminarDiaDeProyecto(d.id, 'El servicio terminó antes de lo estimado — día ya no necesario.');
      diasCancelados++;
    } catch {
      // Se deja ese día tal cual (ej. ya tiene un reporte vinculado) — no
      // se interrumpe el cierre del proyecto por eso.
    }
  }

  return { diasCancelados };
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

export type ServicioSinReporte = {
  id: string;
  proyecto: string;
  fecha: string;
  estado: Servicio['estado'];
  numero_dia: number;
  dias_totales: number;
  tecnicos: { id: string; nombre: string }[];
};

// El recordatorio push (ver /api/cron/recordatorio-reporte) le avisa al
// técnico; esto es lo mismo pero visible para el supervisor, con la
// intención de que sea "comprobable": no basta con confiar en que el
// técnico reaccionó al aviso, aquí se puede revisar y, si el reporte sí
// existe pero quedó sin vincular (ver buscarReportesParaVincular), cerrarlo
// a mano en vez de dejar la alarma sonando por un dato mal capturado.
export async function listarServiciosSinReporte(): Promise<ServicioSinReporte[]> {
  const supabase = createClient();
  const { data: servicios, error } = await supabase
    .from('servicios_programados')
    .select('id, proyecto, fecha, estado, numero_dia, dias_totales')
    .in('estado', ['en_curso', 'concluido'])
    .is('report_id', null)
    .or(FILTRO_DEBE_REPORTE)
    .order('fecha', { ascending: true });
  if (error) throw error;
  if (!servicios || servicios.length === 0) return [];

  const ids = servicios.map((s: any) => s.id);
  const { data: asignaciones } = await supabase
    .from('servicio_tecnicos')
    .select('servicio_id, tecnico_id, profiles(full_name)')
    .in('servicio_id', ids);

  const tecnicosPorServicio: Record<string, { id: string; nombre: string }[]> = {};
  (asignaciones || []).forEach((r: any) => {
    const nombre = Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name;
    if (!tecnicosPorServicio[r.servicio_id]) tecnicosPorServicio[r.servicio_id] = [];
    tecnicosPorServicio[r.servicio_id].push({ id: r.tecnico_id, nombre: nombre || 'Personal técnico' });
  });

  return (servicios as any[]).map((s) => ({ ...s, tecnicos: tecnicosPorServicio[s.id] || [] }));
}

export type ReporteParaVincular = {
  id: string;
  empresa_cliente: string;
  fecha: string;
  claveFormato: string;
  tecnico: string;
};

function fechaISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Reportes de los técnicos asignados a este servicio, cerca de su fecha, que
// todavía no están vinculados a NINGÚN servicio (ni a este ni a otro) — el
// candidato típico es un reporte que sí se hizo pero el técnico no
// seleccionó el servicio al capturarlo.
export async function buscarReportesParaVincular(servicioId: string): Promise<ReporteParaVincular[]> {
  const supabase = createClient();
  const { data: sv, error: eSv } = await supabase
    .from('servicios_programados')
    .select('fecha')
    .eq('id', servicioId)
    .single();
  if (eSv) throw eSv;

  const { data: asignaciones, error: eAsig } = await supabase
    .from('servicio_tecnicos')
    .select('tecnico_id')
    .eq('servicio_id', servicioId);
  if (eAsig) throw eAsig;
  const tecnicoIds = (asignaciones || []).map((a: any) => a.tecnico_id);
  if (tecnicoIds.length === 0) return [];

  // Ventana de un par de días alrededor de la fecha: a veces el reporte se
  // hace un día después de trabajado.
  const centro = new Date(`${(sv as any).fecha}T00:00:00`);
  const desde = new Date(centro); desde.setDate(desde.getDate() - 2);
  const hasta = new Date(centro); hasta.setDate(hasta.getDate() + 2);

  const { data: reportes, error: eRep } = await supabase
    .from('reports')
    .select('id, empresa_cliente, fecha, data, created_by, profiles!reports_created_by_profiles_fkey(full_name)')
    .in('created_by', tecnicoIds)
    .gte('fecha', fechaISO(desde))
    .lte('fecha', fechaISO(hasta))
    .order('fecha', { ascending: false });
  if (eRep) throw eRep;

  // Un reporte no debería servir de comprobante de dos servicios distintos:
  // se excluyen los que ya están vinculados a algún otro servicio.
  const { data: yaVinculados } = await supabase
    .from('servicios_programados')
    .select('report_id')
    .not('report_id', 'is', null);
  const vinculadosSet = new Set((yaVinculados || []).map((v: any) => v.report_id));

  return (reportes || [])
    .filter((r: any) => !vinculadosSet.has(r.id))
    .map((r: any) => ({
      id: r.id,
      empresa_cliente: r.empresa_cliente,
      fecha: r.fecha,
      claveFormato: r.data?.claveFormato || '—',
      tecnico: Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name || 'Personal técnico',
    }));
}

// `video` y `dur`: la evidencia es un video y `path` es su portada.
export type FotoDelDia = { path: string; caption: string; previewUrl: string; video?: string | null; dur?: number | null } & import('./evidencias').MetaFoto;

// Fotos ya capturadas en campo ese día puntual, para precargarlas en el
// reporte y que el técnico no tenga que volver a tomarlas: evidencia de
// avance/retraso/extra (servicio_eventos, ya está acotada a este día por
// servicio_id) y fotos de tareas completadas ese día (servicio_tareas vive a
// nivel de grupo_id porque el checklist se comparte entre días de un mismo
// proyecto, así que aquí sí hace falta filtrar por la fecha de este día).
export async function listarFotosDelDia(servicio: Pick<Servicio, 'id' | 'grupo_id' | 'fecha'>): Promise<FotoDelDia[]> {
  const supabase = createClient();
  const [y, m, d] = servicio.fecha.split('-').map(Number);
  const inicio = new Date(y, (m || 1) - 1, d || 1);
  const fin = new Date(y, (m || 1) - 1, (d || 1) + 1);

  const [{ data: tareas }, { data: eventos }] = await Promise.all([
    supabase
      .from('servicio_tareas')
      .select('descripcion, foto_path, completada_en')
      .eq('grupo_id', servicio.grupo_id)
      .not('foto_path', 'is', null)
      .gte('completada_en', inicio.toISOString())
      .lt('completada_en', fin.toISOString()),
    supabase
      .from('servicio_eventos')
      .select('tipo, nota, foto_path, video_path, video_duracion, created_at')
      .eq('servicio_id', servicio.id)
      .not('foto_path', 'is', null),
  ]);

  const ETIQUETAS: Record<string, string> = {
    avance: 'Avance de tarea',
    retraso: 'Evidencia de retraso',
    evidencia: 'Evidencia adicional',
  };

  const items: { path: string; caption: string; video?: string | null; dur?: number | null; ts?: string | null }[] = [
    ...(tareas || []).map((t: any) => ({ path: t.foto_path as string, caption: t.descripcion || 'Tarea completada', ts: t.completada_en || null })),
    ...(eventos || []).map((e: any) => ({
      path: e.foto_path as string,
      caption: e.nota || (e.video_path ? 'Video del servicio' : ETIQUETAS[e.tipo]) || 'Evidencia del servicio',
      video: e.video_path || null, dur: e.video_duracion || null, ts: e.created_at || null,
    })),
  ];
  if (items.length === 0) return [];

  const { data: signed } = await supabase.storage.from('evidencias').createSignedUrls(items.map((i) => i.path), 3600);
  const urlByPath = new Map((signed || []).map((s: any) => [s.path, s.signedUrl as string]));

  return items
    .map((i) => ({ ...i, previewUrl: urlByPath.get(i.path) || '' }))
    .filter((i) => i.previewUrl);
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
        .filter((d) => d.estado === 'concluido' && debeReporte(d))
        .forEach((d) => resultado.push(d));
    }

    const siguiente = ordenados.find((d) => d.estado !== 'concluido');
    if (siguiente) resultado.push(siguiente);
  });

  return resultado;
}

// Minutos pausados hasta el momento indicado (ahora, por defecto): lo ya
// cerrado (minutos_pausados) más, si hay una pausa abierta, lo que lleva
// corriendo esa pausa. Se usa para no contar como "retraso" o "excedido" el
// tiempo de una pausa avisada (ej. hora de comida).
export function minutosPausadosTotales(
  s: Pick<Servicio, 'minutos_pausados' | 'pausado_desde'>,
  hastaMs: number = Date.now()
): number {
  const acumulados = s.minutos_pausados || 0;
  if (!s.pausado_desde) return acumulados;
  const enCurso = Math.max(0, Math.floor((hastaMs - new Date(s.pausado_desde).getTime()) / 60000));
  return acumulados + enCurso;
}

// Calcula si un servicio terminó a tiempo, con retraso, o si ya lleva más
// tiempo del estimado sin haber concluido todavía (útil para el supervisor).
export function calcularEstadoTiempo(s: Servicio): EstadoTiempo {
  const inicioReferencia = s.hora_inicio || s.hora_llegada;
  if (!inicioReferencia) return { tipo: null };

  if (s.estado === 'concluido' && s.hora_fin) {
    const totalMin = Math.floor((new Date(s.hora_fin).getTime() - new Date(inicioReferencia).getTime()) / 60000);
    const efectivo = totalMin - minutosPausadosTotales(s, new Date(s.hora_fin).getTime());
    const diff = efectivo - s.duracion_estimada_min;
    return diff > 0 ? { tipo: 'retraso', minutos: diff } : { tipo: 'a_tiempo' };
  }

  if (s.estado === 'en_curso' || s.estado === 'en_sitio') {
    const transcurrido = Math.floor((Date.now() - new Date(inicioReferencia).getTime()) / 60000);
    const efectivo = transcurrido - minutosPausadosTotales(s);
    if (efectivo > s.duracion_estimada_min) return { tipo: 'excedido', minutos: efectivo - s.duracion_estimada_min };
  }

  return { tipo: null };
}
