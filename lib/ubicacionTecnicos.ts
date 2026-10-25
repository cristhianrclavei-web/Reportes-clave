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

// Historial: la base guarda los puntos 90 días (patch_ubicacion_tecnicos.sql).
export const DIAS_HISTORIAL = 90;

// Último punto de cada técnico en un día pasado (desde/hasta en ISO). Los
// de hoy salen de ultimasUbicacionesHoy. Supervisión no se rastrea, pero
// se filtra por si quedaron puntos de antes de patch_rastreo_solo_tecnicos.sql.
export async function ultimasUbicacionesDelDia(desdeIso: string, hastaIso: string): Promise<UltimaUbicacion[]> {
  const supabase = createClient();
  // Un punto por minuto en horario: ~650 por técnico al día.
  // shortcut: tope de 8,000 puntos (unos 12 técnicos); con más personal, pasar a una función en la base.
  const { data, error } = await supabase
    .from('ubicaciones_tecnicos')
    .select('tecnico_id, lat, lng, precision_m, registrado_en')
    .gte('registrado_en', desdeIso)
    .lt('registrado_en', hastaIso)
    .order('registrado_en', { ascending: false })
    .limit(8000);
  if (error) throw new Error(mensajeError(error.message));

  // Lista ordenada del más nuevo al más viejo: el primero de cada técnico es su último punto.
  const ultimos = new Map<string, Omit<UltimaUbicacion, 'nombre'>>();
  for (const p of (data || []) as Omit<UltimaUbicacion, 'nombre'>[]) {
    if (!ultimos.has(p.tecnico_id)) ultimos.set(p.tecnico_id, p);
  }
  if (ultimos.size === 0) return [];

  const { data: perfiles, error: ePerfiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('id', [...ultimos.keys()]);
  if (ePerfiles) throw new Error(mensajeError(ePerfiles.message));

  const lista: UltimaUbicacion[] = [];
  for (const perfil of (perfiles || []) as { id: string; full_name: string | null; role: string }[]) {
    const punto = ultimos.get(perfil.id);
    if (!punto || perfil.role === 'supervisor') continue;
    lista.push({ ...punto, nombre: perfil.full_name });
  }
  return lista.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}

// Recorrido de un técnico en un día, del más viejo al más nuevo.
export async function recorridoDelDia(tecnicoId: string, desdeIso: string, hastaIso: string): Promise<PuntoRecorrido[]> {
  const { data, error } = await createClient()
    .from('ubicaciones_tecnicos')
    .select('lat, lng, registrado_en')
    .eq('tecnico_id', tecnicoId)
    .gte('registrado_en', desdeIso)
    .lt('registrado_en', hastaIso)
    .order('registrado_en', { ascending: true })
    .limit(1500);
  if (error) throw new Error(mensajeError(error.message));
  return (data || []) as PuntoRecorrido[];
}

// Lo que ve el usuario; el nombre del patch va a la consola (mensajeError).
export const FALTA_SQL_UBICACION = 'El mapa de técnicos todavía no está activado en tu cuenta. Avísale a quien administra la app.';

function mensajeError(texto: string): string {
  if (/ultimas_ubicaciones_hoy|ubicaciones_tecnicos/.test(texto) && /does not exist|not find|schema cache/i.test(texto)) {
    console.error('Falta correr supabase/patch_ubicacion_tecnicos.sql en la base.');
    return FALTA_SQL_UBICACION;
  }
  return 'No se pudieron cargar las ubicaciones. Revisa tu conexión e intenta de nuevo.';
}

// Cada cuántos minutos del reloj lleva una marca el recorrido.
export const MINUTOS_ENTRE_MARCAS = 10;

// El primer punto de cada tramo de 10 minutos del reloj (9:02, 9:10, 9:24…).
// El recorrido viene del más viejo al más nuevo.
export function marcasDelRecorrido(recorrido: PuntoRecorrido[], minutos = MINUTOS_ENTRE_MARCAS): PuntoRecorrido[] {
  const marcas: PuntoRecorrido[] = [];
  let horaAnterior = '';
  for (const punto of recorrido) {
    const fecha = new Date(punto.registrado_en);
    // Día, hora y tramo (con 10 min: 0 = :00-:09, 1 = :10-:19…) juntos: no
    // se confunden las 9 de dos días distintos.
    const tramo = Math.floor(fecha.getMinutes() / minutos);
    const clave = `${fecha.toDateString()} ${fecha.getHours()} ${tramo}`;
    if (clave === horaAnterior) continue;
    horaAnterior = clave;
    marcas.push(punto);
  }
  return marcas;
}
