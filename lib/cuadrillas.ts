'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from './supabaseClient';

// Cuadrillas: agrupan al personal técnico (ver supabase/patch_cuadrillas.sql).
// Son opcionales y son una plantilla: los servicios siguen guardando a las
// personas asignadas, así que editar una cuadrilla no cambia el historial.

export type Cuadrilla = {
  id: string;
  nombre: string;
  // Índice en la paleta de uniformes (components/AvatarTecnico.tsx).
  color: number;
  lider_id: string | null;
  orden: number;
  miembros: string[];
};

// Si la base aún no tiene las tablas (instalación sin el patch) se devuelve
// una lista vacía: la app se comporta como si no hubiera cuadrillas.
export async function listarCuadrillas(): Promise<Cuadrilla[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('cuadrillas')
    .select('id, nombre, color, lider_id, orden, cuadrilla_miembros(tecnico_id)')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  if (error || !data) return [];
  return (data as any[]).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    color: c.color ?? 0,
    lider_id: c.lider_id,
    orden: c.orden ?? 0,
    miembros: ((c.cuadrilla_miembros as any[]) || []).map((m) => m.tecnico_id),
  }));
}

export async function guardarCuadrilla(c: {
  id?: string | null;
  nombre: string;
  color: number;
  liderId: string | null;
  miembros: string[];
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('guardar_cuadrilla', {
    p_id: c.id || null,
    p_nombre: c.nombre.trim(),
    p_color: c.color,
    p_lider: c.liderId,
    p_miembros: c.miembros,
  });
  if (error) {
    if (error.code === '23505') throw new Error('Ya hay una cuadrilla con ese nombre.');
    throw new Error(error.message);
  }
  cache = null;
  return data as string;
}

export async function eliminarCuadrilla(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('cuadrillas').delete().eq('id', id);
  if (error) throw new Error(error.message);
  cache = null;
}

// Una sola consulta por pantalla aunque varios componentes las usen.
let cache: Promise<Cuadrilla[]> | null = null;

export function useCuadrillas(): { cuadrillas: Cuadrilla[]; recargar: () => void } {
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const cargar = useCallback((forzar = false) => {
    if (forzar || !cache) cache = listarCuadrillas();
    let vivo = true;
    cache.then((c) => { if (vivo) setCuadrillas(c); });
    return () => { vivo = false; };
  }, []);
  useEffect(() => cargar(), [cargar]);
  return { cuadrillas, recargar: () => { cargar(true); } };
}

// Mapa técnico → su cuadrilla.
export function cuadrillaPorTecnico(cuadrillas: Cuadrilla[]): Map<string, Cuadrilla> {
  const m = new Map<string, Cuadrilla>();
  for (const c of cuadrillas) for (const t of c.miembros) m.set(t, c);
  return m;
}

// Clave para filtros: el id de la cuadrilla, o estos dos valores.
export const TODAS = 'todas';
export const SIN_CUADRILLA = 'sin';

export function enCuadrilla(filtro: string, mapa: Map<string, Cuadrilla>, tecnicoId: string): boolean {
  if (filtro === TODAS) return true;
  const c = mapa.get(tecnicoId);
  return filtro === SIN_CUADRILLA ? !c : c?.id === filtro;
}
