// Consultas de las visitas que piden reporte (ver lib/visitasExigibles.ts).
// Todo pasa por funciones de la base (supabase/patch_visitas_exigibles.sql),
// que revisan quién pregunta y validan otra vez lo que se manda.

import { createClient } from './supabaseClient';
import { errorDeJustificacion, type MotivoVisita, type VisitaExigible } from './visitasExigibles';

// ¿El error es porque todavía no se corre el parche en la base?
export function faltaElParche(error: { message?: string; code?: string } | null | undefined): boolean {
  const texto = error?.message || '';
  return error?.code === 'PGRST202' || /visitas_por_revisar|mi_horario_gps|justificar_visita|revisar_visita|does not exist|schema cache/i.test(texto);
}

function mensajeError(error: { message?: string; code?: string } | null | undefined, accion: string): string {
  const texto = error?.message || '';
  if (faltaElParche(error)) {
    return 'Las visitas por rastreo todavía no están activadas: falta correr supabase/patch_visitas_exigibles.sql en la base.';
  }
  const sinConexion = typeof navigator !== 'undefined' && !navigator.onLine;
  if (sinConexion || /fetch|network|load failed|timeout/i.test(texto)) {
    return `No se pudo ${accion}: sin conexión. Revisa tu señal e intenta de nuevo.`;
  }
  // Los mensajes que lanza la base ya vienen en español y dicen qué hacer.
  return texto ? `No se pudo ${accion}. ${texto}` : `No se pudo ${accion}. Intenta de nuevo.`;
}

// Visitas del rango con su estado. Un técnico solo recibe las suyas.
export async function cargarVisitas(desde: string, hasta: string, tecnicoId?: string): Promise<VisitaExigible[]> {
  const { data, error } = await createClient().rpc('visitas_por_revisar', {
    p_desde: desde,
    p_hasta: hasta,
    p_tecnico: tecnicoId || null,
  });
  if (error) throw new Error(mensajeError(error, 'cargar las visitas del rastreo'));
  return (data as VisitaExigible[]) || [];
}

export async function justificarVisita(id: string, motivo: MotivoVisita, detalle: string): Promise<void> {
  const problema = errorDeJustificacion(motivo, detalle);
  if (problema) throw new Error(problema);
  const { error } = await createClient().rpc('justificar_visita', { p_id: id, p_motivo: motivo, p_detalle: detalle.trim() });
  if (error) throw new Error(mensajeError(error, 'guardar la justificación'));
}

export async function revisarVisita(id: string, aprobar: boolean): Promise<void> {
  const { error } = await createClient().rpc('revisar_visita', { p_id: id, p_aprobar: aprobar });
  if (error) throw new Error(mensajeError(error, aprobar ? 'autorizar la visita' : 'rechazar la visita'));
}

export type HorarioGps = { llegada: string; salida: string; minutos: number; sinSenal: number };

// Lo que vio el rastreo de quien tiene la sesión con ese cliente ese día.
// null si no hay nada (no trae teléfono de la empresa, el cliente no tiene
// ubicación, o no estuvo ahí).
export async function horarioGps(clienteId: string, fecha: string): Promise<HorarioGps | null> {
  const { data, error } = await createClient().rpc('mi_horario_gps', { p_cliente: clienteId, p_fecha: fecha });
  if (error) throw new Error(mensajeError(error, 'consultar el horario del rastreo'));
  const fila = ((data as any[]) || [])[0];
  if (!fila) return null;
  return { llegada: fila.llegada, salida: fila.salida, minutos: fila.minutos, sinSenal: fila.sin_senal || 0 };
}
