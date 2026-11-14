// Consultas de paradas y gastos con ticket (ver lib/paradas.ts). Todo pasa
// por funciones de la base (supabase/patch_paradas_gastos.sql), que revisan
// quién pregunta y validan otra vez lo que se manda.

import { createClient } from './supabaseClient';
import { generarUUID } from './uuid';
import { mensajeError } from './visitasExigiblesDatos';
import { errorDeParada, gastoParaEnviar, infoMotivoParada, type DatosGasto, type MotivoParada, type Parada } from './paradas';

export async function cargarParadas(desde: string, hasta: string, tecnicoId?: string): Promise<Parada[]> {
  const { data, error } = await createClient().rpc('paradas_por_revisar', {
    p_desde: desde,
    p_hasta: hasta,
    p_tecnico: tecnicoId || null,
  });
  if (error) throw new Error(mensajeError(error, 'cargar las paradas del rastreo'));
  return ((data as any[]) || []).map((p) => ({ ...p, monto: p.monto === null ? null : Number(p.monto) }));
}

// Sube las fotos del ticket a la carpeta de quien tiene la sesión. Devuelve las rutas.
export async function subirTickets(fotos: File[]): Promise<string[]> {
  if (fotos.length === 0) return [];
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const usuarioId = data.session?.user.id;
  if (!usuarioId) throw new Error('Tu sesión se cerró. Vuelve a entrar e intenta de nuevo.');
  const rutas: string[] = [];
  for (const foto of fotos) {
    const extension = foto.type === 'image/png' ? 'png' : foto.type === 'image/webp' ? 'webp' : 'jpg';
    const ruta = `${usuarioId}/${generarUUID()}.${extension}`;
    const { error } = await supabase.storage.from('tickets').upload(ruta, foto, { contentType: foto.type || 'image/jpeg' });
    if (error) throw new Error(mensajeError(error, 'subir la foto del ticket'));
    rutas.push(ruta);
  }
  return rutas;
}

// Prepara el gasto para la base: sube las fotos (si hay ticket) y lo arma.
export async function gastoListo(gasto: DatosGasto): Promise<object> {
  const rutas = gasto.sinTicket ? [] : await subirTickets(gasto.fotos);
  return gastoParaEnviar(gasto, rutas);
}

export async function justificarParada(id: string, motivo: MotivoParada, detalle: string, gasto: DatosGasto): Promise<void> {
  const problema = errorDeParada(motivo, detalle, gasto);
  if (problema) throw new Error(problema);
  const gastoEnviar = infoMotivoParada(motivo)?.gasto ? await gastoListo(gasto) : null;
  const { error } = await createClient().rpc('justificar_parada', {
    p_id: id, p_motivo: motivo, p_detalle: detalle.trim(), p_gasto: gastoEnviar,
  });
  if (error) throw new Error(mensajeError(error, 'guardar la parada'));
}

export async function revisarParada(id: string, aprobar: boolean): Promise<void> {
  const { error } = await createClient().rpc('revisar_parada', { p_id: id, p_aprobar: aprobar });
  if (error) throw new Error(mensajeError(error, aprobar ? 'autorizar la parada' : 'rechazar la parada'));
}

export type GastoGuardado = { visita_id: string | null; monto: number; fotos: string[]; sin_ticket: boolean; motivo_sin_ticket: string | null };

// Gastos (tickets) de varias visitas, para revisarlos en Cobertura.
export async function gastosDeVisitas(visitaIds: string[]): Promise<Map<string, GastoGuardado>> {
  const mapa = new Map<string, GastoGuardado>();
  if (visitaIds.length === 0) return mapa;
  const { data, error } = await createClient()
    .from('gastos_campo')
    .select('visita_id, monto, fotos, sin_ticket, motivo_sin_ticket')
    .in('visita_id', visitaIds);
  if (error) throw new Error(mensajeError(error, 'cargar los tickets'));
  for (const fila of (data as any[]) || []) mapa.set(fila.visita_id, { ...fila, monto: Number(fila.monto) });
  return mapa;
}

// Enlaces temporales (1 hora) para ver las fotos privadas de los tickets.
export async function enlacesDeTickets(rutas: string[]): Promise<string[]> {
  if (rutas.length === 0) return [];
  const { data, error } = await createClient().storage.from('tickets').createSignedUrls(rutas, 3600);
  if (error) throw new Error(mensajeError(error, 'abrir las fotos del ticket'));
  return (data || []).map((d) => d.signedUrl || '').filter(Boolean);
}
