import { createClient } from './supabaseClient';

// Lectura de las ubicaciones de los técnicos para el mapa de supervisión
// (supabase/patch_ubicacion_tecnicos.sql).

export type UltimaUbicacion = {
  tecnico_id: string;
  nombre: string | null;
  registrado_en: string;
  lat: number;
  lng: number;
  precision_m: number | null;
};

export type PuntoRecorrido = { lat: number; lng: number; registrado_en: string };

export type EstadoSenal = 'en_linea' | 'reciente' | 'sin_senal';

// Un punto por minuto: con más de 3 minutos sin puntos algo pasa (sin
// señal, GPS apagado); con más de 15 ya no se sabe dónde está.
export function estadoSenal(registradoEn: string, ahoraMs: number): EstadoSenal {
  const minutos = (ahoraMs - new Date(registradoEn).getTime()) / 60000;
  if (minutos <= 3) return 'en_linea';
  if (minutos <= 15) return 'reciente';
  return 'sin_senal';
}

export async function ultimasUbicacionesHoy(): Promise<UltimaUbicacion[]> {
  const { data, error } = await createClient().rpc('ultimas_ubicaciones_hoy');
  if (error) throw new Error(mensajeError(error.message));
  return (data || []) as UltimaUbicacion[];
}

// Recorrido de hoy de un técnico, del más viejo al más nuevo.
export async function recorridoDeHoy(tecnicoId: string, desdeIso: string): Promise<PuntoRecorrido[]> {
  const { data, error } = await createClient()
    .from('ubicaciones_tecnicos')
    .select('lat, lng, registrado_en')
    .eq('tecnico_id', tecnicoId)
    .gte('registrado_en', desdeIso)
    .order('registrado_en', { ascending: true })
    .limit(1500);
  if (error) throw new Error(mensajeError(error.message));
  return (data || []) as PuntoRecorrido[];
}

export const FALTA_SQL_UBICACION = 'Falta correr supabase/patch_ubicacion_tecnicos.sql en la base.';

function mensajeError(texto: string): string {
  if (/ultimas_ubicaciones_hoy|ubicaciones_tecnicos/.test(texto) && /does not exist|not find|schema cache/i.test(texto)) {
    return FALTA_SQL_UBICACION;
  }
  return 'No se pudieron cargar las ubicaciones. Revisa tu conexión e intenta de nuevo.';
}
