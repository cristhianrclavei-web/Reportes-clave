'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from './supabaseClient';
import { usePlan } from './planes';
import { tieneModulo } from './planesDatos';

// Cuadrillas: agrupan al personal técnico (ver supabase/patch_cuadrillas.sql).
// Son opcionales y son una plantilla: los servicios siguen guardando a las
// personas asignadas, así que editar una cuadrilla no cambia el historial.

export type Cuadrilla = {
  id: string;
  nombre: string;
  // Índice en la paleta de uniformes (components/AvatarTecnico.tsx).
  color: number;
  lider_id: string | null;
  // Supervisor a cargo (supabase/patch_cuadrillas_supervisor.sql); null si
  // no tiene o si la instalación aún no corre ese patch.
  supervisor_id: string | null;
  orden: number;
  miembros: string[];
};

// ¿La base ya tiene la columna del supervisor a cargo? Se sabe al listar.
let conSupervisor = false;
export function cuadrillasConSupervisor(): boolean {
  return conSupervisor;
}

// Si la base aún no tiene las tablas (instalación sin el patch) se devuelve
// una lista vacía: la app se comporta como si no hubiera cuadrillas.
export async function listarCuadrillas(): Promise<Cuadrilla[]> {
  const supabase = createClient();
  const consulta = (columnas: string) => supabase
    .from('cuadrillas')
    .select(columnas)
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true });
  // Primero con el supervisor a cargo; si la base no tiene esa columna
  // (falta patch_cuadrillas_supervisor.sql) se lee como antes.
  let { data, error } = await consulta('id, nombre, color, lider_id, supervisor_id, orden, cuadrilla_miembros(tecnico_id)');
  conSupervisor = !error;
  if (error) ({ data, error } = await consulta('id, nombre, color, lider_id, orden, cuadrilla_miembros(tecnico_id)'));
  if (error || !data) return [];
  return (data as any[]).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    color: c.color ?? 0,
    lider_id: c.lider_id,
    supervisor_id: c.supervisor_id ?? null,
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
  // undefined = no tocar (instalación sin el patch del supervisor a cargo).
  supervisorId?: string | null;
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
  if (c.supervisorId !== undefined && conSupervisor) {
    const r = await supabase.from('cuadrillas').update({ supervisor_id: c.supervisorId }).eq('id', data as string);
    if (r.error) throw new Error(r.error.message);
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

const VACIO: Cuadrilla[] = [];

// Una sola consulta por pantalla aunque varios componentes las usen.
let cache: Promise<Cuadrilla[]> | null = null;

// Las cuadrillas son de los paquetes Profesional y Empresa: sin el módulo en
// el plan, la app se comporta como si no existieran.
export function useCuadrillas(): { cuadrillas: Cuadrilla[]; recargar: () => void; incluidas: boolean } {
  const plan = usePlan();
  const incluidas = tieneModulo(plan, 'cuadrillas');
  const [todas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const cargar = useCallback((forzar = false) => {
    if (forzar || !cache) cache = listarCuadrillas();
    let vivo = true;
    cache.then((c) => { if (vivo) setCuadrillas(c); });
    return () => { vivo = false; };
  }, []);
  useEffect(() => cargar(), [cargar]);
  const cuadrillas = incluidas ? todas : VACIO;
  return { cuadrillas, recargar: () => { cargar(true); }, incluidas };
}

// Mapa técnico → su cuadrilla.
export function cuadrillaPorTecnico(cuadrillas: Cuadrilla[]): Map<string, Cuadrilla> {
  const m = new Map<string, Cuadrilla>();
  for (const c of cuadrillas) for (const t of c.miembros) m.set(t, c);
  return m;
}

// Clave para filtros: el id de la cuadrilla, o estos valores. «Mis
// cuadrillas» lleva el id del supervisor: 'mias:<id>'.
export const TODAS = 'todas';
export const SIN_CUADRILLA = 'sin';
export const MIAS = 'mias:';

export function enCuadrilla(filtro: string, mapa: Map<string, Cuadrilla>, tecnicoId: string): boolean {
  if (filtro === TODAS) return true;
  const c = mapa.get(tecnicoId);
  if (filtro.startsWith(MIAS)) return !!c?.supervisor_id && c.supervisor_id === filtro.slice(MIAS.length);
  return filtro === SIN_CUADRILLA ? !c : c?.id === filtro;
}
