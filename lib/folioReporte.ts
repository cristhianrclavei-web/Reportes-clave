import type { SupabaseClient } from '@supabase/supabase-js';

// Consecutivo del folio del reporte (iniciales-A-016). Antes salía de CONTAR
// los reportes del técnico: si se borraba uno, el siguiente repetía número
// (pasó con CIR-A-016). Ahora es el número más alto ya usado + 1, y nunca
// menos que el total de reportes + 1 (por los viejos sin ese formato).
export function siguienteConsecutivo(folios: (string | null | undefined)[]): number {
  let mayor = 0;
  for (const folio of folios) {
    const encontrado = /-A-(\d+)$/.exec(folio || '');
    if (encontrado) mayor = Math.max(mayor, Number(encontrado[1]));
  }
  return Math.max(mayor, folios.length) + 1;
}

export async function consecutivoDelTecnico(supabase: SupabaseClient, tecnicoId: string): Promise<number> {
  const { data, error } = await supabase.from('reports').select('folio:data->>claveFormato').eq('created_by', tecnicoId);
  if (error) throw error;
  return siguienteConsecutivo((data || []).map((fila: { folio: string | null }) => fila.folio));
}
