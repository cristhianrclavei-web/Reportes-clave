// Durante la primera hora después de guardar un reporte, su autor lo puede
// editar sin pedir corrección (por si se equivocó en un dato o le faltó
// algo), siempre que el cliente todavía no lo haya firmado.
// La base de datos aplica la misma regla en proteger_edicion_reporte
// (supabase/patch_edicion_primera_hora.sql).
export const MINUTOS_EDICION_LIBRE = 60;

type ReporteParaEditar = { created_at: string; data?: { firmaClienteData?: string | null } | null };

export function finEdicionLibre(createdAt: string): number {
  return new Date(createdAt).getTime() + MINUTOS_EDICION_LIBRE * 60 * 1000;
}

export function puedeEditarSinPermiso(reporte: ReporteParaEditar, ahoraMs: number): boolean {
  const firmadoPorCliente = Boolean(reporte.data?.firmaClienteData);
  if (firmadoPorCliente) return false;
  return ahoraMs < finEdicionLibre(reporte.created_at);
}
