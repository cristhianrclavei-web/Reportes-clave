import { createClient } from './supabaseClient';
import { getCurrentLocation } from './geolocation';
import { notificar } from './push';
import { leerAjustesOperacion } from './serviciosProgramados';
import { ResultadoVerificacion, TEXTO_VERIFICACION, distanciaTexto } from './pausas';

// Verificación de presencia: supervisión le pide a alguien del personal que
// confirme, en ese momento, que está en el sitio. El técnico toca «Estoy
// aquí» y la base compara su ubicación con la del servicio (la respuesta
// pasa por responder_verificacion; el teléfono no decide el resultado).
//
// «Sin respuesta» no prueba una ausencia: sin señal o con el teléfono en
// silencio pasa lo mismo. Es una señal para llamar, no una falta.

export type Verificacion = {
  id: string;
  servicio_id: string;
  tecnico_id: string;
  pedida_por: string | null;
  pedida_en: string;
  vence_en: string;
  respondida_en: string | null;
  ubicacion: { lat: number; lng: number; accuracy?: number } | null;
  distancia_m: number | null;
  resultado: ResultadoVerificacion;
  // Solo al listar para supervisión.
  nombre?: string;
};

const CAMPOS = 'id, servicio_id, tecnico_id, pedida_por, pedida_en, vence_en, respondida_en, ubicacion, distancia_m, resultado';

// Pide la verificación a cada técnico indicado. A quien ya tiene una en
// espera no se le pide otra.
export async function pedirVerificacion(servicioId: string, tecnicoIds: string[], proyecto: string): Promise<number> {
  if (tecnicoIds.length === 0) return 0;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ajustes = await leerAjustesOperacion();
  const ahora = Date.now();

  const { data: abiertas } = await supabase
    .from('verificaciones_presencia')
    .select('tecnico_id')
    .eq('servicio_id', servicioId)
    .eq('resultado', 'pendiente')
    .gt('vence_en', new Date(ahora).toISOString());
  const yaPedidas = new Set(((abiertas as any[]) || []).map((v) => v.tecnico_id as string));
  const nuevos = tecnicoIds.filter((id) => !yaPedidas.has(id));
  if (nuevos.length === 0) return 0;

  const vence = new Date(ahora + ajustes.verificacion_min * 60000).toISOString();
  const { error } = await supabase.from('verificaciones_presencia').insert(
    nuevos.map((tecnico_id) => ({ servicio_id: servicioId, tecnico_id, pedida_por: user?.id, vence_en: vence }))
  );
  if (error) throw error;

  await notificar({
    usuarios: nuevos,
    tipo: 'verificacion_presencia',
    titulo: 'Confirma que estás en el sitio',
    mensaje: `Abre «${proyecto}» y toca «Estoy aquí». Tienes ${ajustes.verificacion_min} min.`,
    url: `/servicios/${servicioId}`,
    tag: `verificacion-${servicioId}`,
  });
  return nuevos.length;
}

export async function listarVerificaciones(servicioId: string): Promise<Verificacion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('verificaciones_presencia')
    .select(`${CAMPOS}, profiles!verificaciones_presencia_tecnico_id_fkey(full_name)`)
    .eq('servicio_id', servicioId)
    .order('pedida_en', { ascending: false })
    .limit(30);
  if (error) throw error;
  return ((data as any[]) || []).map(({ profiles, ...v }) => ({
    ...v,
    nombre: (Array.isArray(profiles) ? profiles[0]?.full_name : profiles?.full_name) || 'Personal técnico',
  })) as Verificacion[];
}

// La verificación que el técnico actual tiene por responder (la más
// reciente, todavía vigente), en un servicio o en cualquiera.
export async function miVerificacionPendiente(servicioId?: string): Promise<Verificacion | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  let q = supabase
    .from('verificaciones_presencia')
    .select(CAMPOS)
    .eq('tecnico_id', user.id)
    .eq('resultado', 'pendiente')
    .gt('vence_en', new Date().toISOString())
    .order('pedida_en', { ascending: false })
    .limit(1);
  if (servicioId) q = q.eq('servicio_id', servicioId);
  const { data } = await q;
  return ((data as Verificacion[]) || [])[0] || null;
}

// «Estoy aquí». Espera la ubicación un poco más que en otros registros: aquí
// la ubicación es justo lo que se está pidiendo.
export async function responderVerificacion(v: Pick<Verificacion, 'id' | 'servicio_id'>, proyecto: string): Promise<ResultadoVerificacion> {
  const supabase = createClient();
  const ubicacion = await getCurrentLocation(12000);
  const { data, error } = await supabase.rpc('responder_verificacion', {
    p_id: v.id,
    p_lat: ubicacion?.lat ?? null,
    p_lng: ubicacion?.lng ?? null,
    p_precision: ubicacion?.accuracy ?? null,
  });
  if (error) throw error;
  const resultado = data as ResultadoVerificacion;

  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: perfil }, { data: fila }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user?.id || '').maybeSingle(),
    supabase.from('verificaciones_presencia').select('distancia_m').eq('id', v.id).maybeSingle(),
  ]);
  const quien = perfil?.full_name || 'Alguien del personal';
  const d = (fila as any)?.distancia_m as number | null;
  await notificar({
    destino: 'supervisores',
    tipo: 'verificacion_presencia',
    titulo: `Verificación: ${TEXTO_VERIFICACION[resultado].toLowerCase()}`,
    mensaje:
      resultado === 'en_sitio' ? `${quien} confirmó que está en ${proyecto}.`
        : resultado === 'fuera' ? `${quien} respondió a ${d !== null && d !== undefined ? distanciaTexto(d) : 'distancia'} de ${proyecto}.`
          : resultado === 'sin_ubicacion' ? `${quien} respondió en ${proyecto}, pero sin ubicación para comprobarlo.`
            : `${quien} respondió fuera de tiempo en ${proyecto}.`,
    url: `/dashboard/servicios/${v.servicio_id}`,
    tag: `verificacion-${v.servicio_id}`,
  });
  return resultado;
}
