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
  | 'cerro_dia_manual'
  | 'libero_reporte'
  | 'exigio_reporte'
  | 'elimino_reporte'
  | 'aprobo_revision'
  | 'marco_finalizado'
  | 'subio_factura'
  | 'marco_no_facturable'
  | 'solicito_correccion'
  | 'habilito_correccion'
  | 'cerro_correccion'
  | 'aplico_correccion'
  | 'creo_proyecto'
  | 'actualizo_estado_proyecto'
  | 'elimino_proyecto'
  | 'justifico_dia'
  | 'autorizo_justificacion'
  | 'rechazo_justificacion'
  | 'marco_festivo'
  | 'quito_festivo'
  | 'unio_clientes'
  | 'cambio_en_dia'
  // Administración de usuarios (las registra el servidor, /api/usuarios).
  | 'creo_usuario'
  | 'edito_usuario'
  | 'elimino_usuario';

// Secciones con subsección «Actividad» (patch_actividad_por_seccion.sql).
export type SeccionActividad = 'servicios' | 'reportes' | 'cotizaciones' | 'facturacion' | 'clientes' | 'personal' | 'almacen';

export type EntradaAuditoria = {
  id: string;
  actor_id: string;
  // Además de AccionGlobal, las que anota la base (creo_cotizacion, movimiento_almacen…).
  accion: string;
  entidad: string;
  seccion?: string | null;
  entidad_id: string | null;
  detalle: string | null;
  created_at: string;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

// Best-effort: si el registro de auditoría falla (ej. sin red justo en
// ese instante) NO debe tumbar la acción principal que ya se completó.
export async function registrarAccionGlobal(
  accion: AccionGlobal,
  entidad: 'servicio' | 'reporte' | 'proyecto',
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

export const FALTA_SQL_ACTIVIDAD = 'La actividad por sección todavía no está activada en tu cuenta. Avísale a quien administra la app.';

// Sin sección: todo (página «Actividad»). Con sección: solo lo de esa sección.
export async function listarAuditoriaGlobal(limite = 300, seccion?: SeccionActividad): Promise<EntradaAuditoria[]> {
  const supabase = createClient();
  let consulta = supabase
    .from('auditoria_global')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (seccion) consulta = consulta.eq('seccion', seccion);
  const { data, error } = await consulta;
  if (error) {
    if (/seccion/.test(error.message) && /does not exist|not find|schema cache/i.test(error.message)) {
      console.error('Falta correr supabase/patch_actividad_por_seccion.sql en la base.');
      throw new Error(FALTA_SQL_ACTIVIDAD);
    }
    throw error;
  }
  return (data as EntradaAuditoria[]) || [];
}
