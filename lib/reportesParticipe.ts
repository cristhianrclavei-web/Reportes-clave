import { createClient } from './supabaseClient';

// Lo esencial de un reporte que hizo un compañero y en el que el técnico
// también trabajó. La base solo entrega estos datos (función
// reportes_donde_participe, supabase/patch_reportes_donde_participe.sql).
export type ReporteParticipe = {
  id: string;
  fecha: string;
  empresa_cliente: string;
  folio: string | null;
  hora_llegada: string | null;
  hora_salida: string | null;
  actividades: string[];
  autor: string | null;
};

export async function listarReportesDondeParticipe(): Promise<ReporteParticipe[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('reportes_donde_participe');
  if (error) throw error;
  return ((data as any[]) || []).map((r) => ({
    ...r,
    actividades: Array.isArray(r.actividades) ? r.actividades.filter((a: unknown) => typeof a === 'string' && a.trim()) : [],
  }));
}
