import { createClient } from './supabaseClient';

// Registro permanente de acciones de supervisores. A diferencia de
// servicio_auditoria (que se borra en cascada con su servicio), estas
// entradas sobreviven a la eliminación de la entidad — por eso
// entidad_id NO tiene foreign key.

export type AccionGlobal =
  | 'programo_servicio'
  | 'aviso_servicio'
  | 'resolvio_aviso'
  | 'edito_servicio'
  | 'reasigno_tecnicos'
  | 'amplio_proyecto'
  | 'reprogramo_dia'
  | 'agrego_insumo'
  | 'solicito_insumo'
  | 'aprobo_insumo'
  | 'rechazo_insumo'
  | 'firmo_resguardo'
  | 'devolvio_herramienta'
  | 'recibio_herramienta'
  | 'elimino_servicio'
  | 'elimino_dia'
  | 'elimino_reporte'
  | 'aprobo_revision'
  | 'marco_finalizado'
  | 'subio_factura'
  | 'marco_no_facturable'
  | 'solicito_correccion'
  | 'habilito_correccion'
  | 'cerro_correccion'
  | 'aplico_correccion';

export type EntradaAuditoria = {
  id: string;
  actor_id: string;
  accion: AccionGlobal;
  entidad: 'servicio' | 'reporte';
  entidad_id: string | null;
  detalle: string | null;
  created_at: string;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

// Best-effort: si el registro de auditoría falla (ej. sin red justo en
// ese instante) NO debe tumbar la acción principal que ya se completó.
export async function registrarAccionGlobal(
  accion: AccionGlobal,
  entidad: 'servicio' | 'reporte',
  entidadId: string | null,
  detalle: string
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('auditoria_global').insert({
      actor_id: user.id,
      accion,
      entidad,
      entidad_id: entidadId,
      detalle,
    });
  } catch (e) {
    console.error('No se pudo registrar en auditoría global:', e);
  }
}

export async function listarAuditoriaGlobal(limite = 300): Promise<EntradaAuditoria[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('auditoria_global')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data as EntradaAuditoria[]) || [];
}
