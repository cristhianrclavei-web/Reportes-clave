// Consultas del mapa de técnicos en campo (ver lib/campo.ts): servicios y
// reportes del día, teléfonos y la última ubicación conocida de cada técnico.

import { createClient } from './supabaseClient';
import type { ReporteCampo, ServicioCampo } from './campo';
import type { UltimaUbicacion } from './ubicacionTecnicos';

function mensajeError(error: { message?: string } | null | undefined, accion: string): string {
  const texto = error?.message || '';
  if (/fetch|network|load failed|timeout/i.test(texto) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return `No se pudo ${accion}: sin conexión. Revisa tu señal.`;
  }
  return `No se pudo ${accion}. ${texto}`.trim();
}

const esPunto = (u: any) => Boolean(u) && typeof u.lat === 'number' && typeof u.lng === 'number';

export async function serviciosDelDia(fecha: string): Promise<ServicioCampo[]> {
  const { data, error } = await createClient()
    .from('servicios_programados')
    .select('id, proyecto, cliente_id, estado, fecha, hora_programada, hora_llegada, hora_inicio, hora_fin, pausado_desde, ubicacion_programada, radio_geocerca_m, report_id, servicio_tecnicos(tecnico_id)')
    .eq('fecha', fecha)
    .neq('estado', 'cancelado');
  if (error) throw new Error(mensajeError(error, 'cargar los servicios del día'));
  return ((data as any[]) || []).map((s) => ({
    id: s.id, proyecto: s.proyecto, cliente_id: s.cliente_id, estado: s.estado, fecha: s.fecha,
    hora_programada: s.hora_programada ? String(s.hora_programada).slice(0, 5) : null,
    hora_llegada: s.hora_llegada, hora_inicio: s.hora_inicio, hora_fin: s.hora_fin, pausado_desde: s.pausado_desde,
    ubicacion: esPunto(s.ubicacion_programada) ? s.ubicacion_programada : null,
    radio_m: s.radio_geocerca_m || 120, report_id: s.report_id,
    tecnicoIds: (s.servicio_tecnicos || []).map((t: any) => t.tecnico_id),
  }));
}

// Reportes del día: de quién los capturó y del personal que va en ellos.
export async function reportesDelDia(fecha: string): Promise<ReporteCampo[]> {
  const { data, error } = await createClient()
    .from('reports')
    .select('id, created_by, cliente_id, empresa_cliente, personal:data->personal')
    .eq('fecha', fecha);
  if (error) throw new Error(mensajeError(error, 'cargar los reportes del día'));
  return ((data as any[]) || []).map((r) => ({
    id: r.id, created_by: r.created_by, cliente_id: r.cliente_id, cliente: r.empresa_cliente || '',
    personal: Array.isArray(r.personal) ? r.personal.filter((x: unknown) => typeof x === 'string') : [],
  }));
}

// Teléfono de cada técnico, para «Llamar» y «WhatsApp».
export async function telefonos(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await createClient().from('profiles').select('id, telefono').in('id', ids);
  if (error) throw new Error(mensajeError(error, 'cargar los teléfonos'));
  const mapa: Record<string, string> = {};
  for (const p of (data as any[]) || []) if (p.telefono) mapa[p.id] = p.telefono;
  return mapa;
}

// El último punto de cada técnico activo, de cualquier día que siga guardado
// (90 días): «última vez visto», batería y precisión del GPS.
export async function ultimosPuntosConocidos(): Promise<UltimaUbicacion[]> {
  const supabase = createClient();
  const { data: perfiles, error } = await supabase.from('profiles').select('id, full_name, role, activo').eq('role', 'tecnico');
  if (error) throw new Error(mensajeError(error, 'cargar a los técnicos'));
  const activos = ((perfiles as any[]) || []).filter((p) => p.activo !== false);
  // shortcut: una consulta por técnico (son pocos); con muchos, pasar a una función en la base.
  const puntos = await Promise.all(activos.map(async (p) => {
    const { data: ultimo, error: e } = await supabase
      .from('ubicaciones_tecnicos')
      .select('lat, lng, precision_m, bateria, registrado_en')
      .eq('tecnico_id', p.id)
      .order('registrado_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e) throw new Error(mensajeError(e, 'cargar la última ubicación'));
    return ultimo ? { tecnico_id: p.id, nombre: p.full_name, ...(ultimo as any) } as UltimaUbicacion : null;
  }));
  return puntos.filter((x): x is UltimaUbicacion => x !== null).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}
