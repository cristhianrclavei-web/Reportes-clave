import { createClient } from './supabaseClient';

// Equipos instalados en reportes y su liga con el almacén
// (patch_equipos_instalados.sql). Los llena un trigger al guardar el
// reporte; aquí solo se leen y el almacenista resuelve los «sin_registro».

export type EstadoEquipo = 'ligado' | 'sin_registro' | 'registrado' | 'no_aplica';

export type EquipoInstalado = {
  id: string;
  reporte_id: string;
  folio: string | null;
  servicio_id: string | null;
  tecnico_id: string | null;
  cliente: string | null;
  fecha: string | null;
  cantidad: number;
  descripcion: string | null;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  articulo_id: string | null;
  estado: EstadoEquipo;
  nota: string | null;
  resuelto_en: string | null;
  created_at: string;
  tecnico?: { full_name: string | null } | null;
};

const SELECT = '*, tecnico:profiles!almacen_equipos_instalados_tecnico_id_fkey(full_name)';

export async function listarEquiposSinRegistro(): Promise<EquipoInstalado[]> {
  const { data, error } = await createClient()
    .from('almacen_equipos_instalados')
    .select(SELECT)
    .eq('estado', 'sin_registro')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as EquipoInstalado[]) || [];
}

export async function listarEquiposResueltos(limite = 40): Promise<EquipoInstalado[]> {
  const { data, error } = await createClient()
    .from('almacen_equipos_instalados')
    .select(SELECT)
    .in('estado', ['registrado', 'no_aplica'])
    .order('resuelto_en', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data as EquipoInstalado[]) || [];
}

// null = no se pudo saber (falta el SQL o sin permiso): la alerta se oculta.
export async function contarEquiposSinRegistro(): Promise<number | null> {
  const { count, error } = await createClient()
    .from('almacen_equipos_instalados')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'sin_registro');
  return error ? null : count || 0;
}

export async function resolverEquipo(id: string, input: { estado: 'registrado' | 'no_aplica'; articuloId?: string | null; movimientos?: boolean; nota?: string }): Promise<void> {
  const { error } = await createClient().rpc('resolver_equipo_instalado', {
    p_id: id,
    p_estado: input.estado,
    p_articulo: input.articuloId || null,
    p_movimientos: !!input.movimientos,
    p_nota: input.nota || '',
  });
  if (error) throw new Error(error.message);
}

// Para el técnico al guardar el reporte: cuántos renglones quedaron sin
// registro. 0 si no se pudo consultar (no frena el guardado).
export async function sinRegistroDeReporte(reporteId: string): Promise<number> {
  const { data, error } = await createClient().rpc('equipos_sin_registro_de', { p_reporte: reporteId });
  return error ? 0 : Number(data) || 0;
}

export function textoEquipo(e: Pick<EquipoInstalado, 'descripcion' | 'marca' | 'modelo'>): string {
  return [e.descripcion, [e.marca, e.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Equipo';
}
