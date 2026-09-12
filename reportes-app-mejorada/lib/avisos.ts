// Avisos del técnico sobre un día ya programado, y días festivos.
//
// El técnico ya podía registrar un retraso, pero ese aviso nace cuando ya está
// en el sitio: documenta el viaje perdido en vez de evitarlo. Esto es para lo
// que se sabe antes — el cliente no va a estar, es festivo, falta material.

import { createClient } from './supabaseClient';
import { notificar } from './push';

export type CausaAviso =
  | 'cliente_no_disponible'
  | 'dia_festivo'
  | 'falta_material'
  | 'acceso_restringido'
  | 'clima'
  | 'otro';

export const CAUSAS: { valor: CausaAviso; label: string }[] = [
  { valor: 'cliente_no_disponible', label: 'El cliente no va a estar' },
  { valor: 'dia_festivo', label: 'Es día festivo o el cliente cierra' },
  { valor: 'falta_material', label: 'Falta material o herramienta' },
  { valor: 'acceso_restringido', label: 'No hay acceso al sitio' },
  { valor: 'clima', label: 'El clima lo impide' },
  { valor: 'otro', label: 'Otra razón' },
];

export function etiquetaCausa(causa: string): string {
  return CAUSAS.find((c) => c.valor === causa)?.label || causa;
}

export type Aviso = {
  id: string;
  servicio_id: string;
  tecnico_id: string;
  causa: CausaAviso;
  comentario: string | null;
  fecha_propuesta: string | null;
  estado: 'pendiente' | 'atendido' | 'descartado';
  resuelto_por: string | null;
  resuelto_en: string | null;
  resolucion_nota: string | null;
  created_at: string;
};

export type Festivo = { fecha: string; nombre: string; tipo: 'oficial' | 'costumbre' | 'empresa' };

// --- Días festivos ---------------------------------------------

const CACHE_FESTIVOS = 'catalogoFestivos';

export function festivosEnCache(): Festivo[] {
  try {
    const crudo = localStorage.getItem(CACHE_FESTIVOS);
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
}

export async function listarFestivos(): Promise<Festivo[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('dias_festivos')
    .select('fecha, nombre, tipo')
    .order('fecha');

  if (error || !data) return festivosEnCache();
  try { localStorage.setItem(CACHE_FESTIVOS, JSON.stringify(data)); } catch { /* sin caché */ }
  return data as Festivo[];
}

export function festivoDe(fecha: string, festivos: Festivo[]): Festivo | null {
  if (!fecha) return null;
  return festivos.find((f) => f.fecha === fecha) || null;
}

// --- Avisos ----------------------------------------------------

export async function crearAviso(input: {
  servicioId: string;
  causa: CausaAviso;
  comentario: string;
  fechaPropuesta?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const comentario = input.comentario.trim();
  if (input.causa === 'otro' && !comentario) {
    throw new Error('Cuando la razón es «otra», hay que decir cuál.');
  }

  const { error } = await supabase.from('servicio_avisos').insert({
    servicio_id: input.servicioId,
    tecnico_id: user.id,
    causa: input.causa,
    comentario: comentario || null,
    fecha_propuesta: input.fechaPropuesta || null,
  });
  if (error) throw error;

  // El aviso no sirve de nada si el supervisor se entera hasta que entra a
  // mirar. Justo lo que se quiere evitar es que el día llegue sin que nadie
  // lo supiera.
  const { data: sv } = await supabase
    .from('servicios_programados')
    .select('proyecto, fecha')
    .eq('id', input.servicioId)
    .single();

  const { data: perfil } = await supabase
    .from('profiles').select('full_name').eq('id', user.id).single();

  await notificar({
    tipo: 'aviso_servicio',
    titulo: `Aviso sobre ${sv?.proyecto || 'un servicio'}`,
    mensaje: `${perfil?.full_name || 'Un técnico'}: ${etiquetaCausa(input.causa)}${
      sv?.fecha ? ` · ${sv.fecha}` : ''
    }`,
    url: '/dashboard/servicios',
  }).catch(() => { /* el aviso ya quedó guardado; el push es extra */ });
}

export async function listarAvisosDeServicio(servicioId: string): Promise<Aviso[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('servicio_avisos')
    .select('*')
    .eq('servicio_id', servicioId)
    .order('created_at', { ascending: false });
  return (data as Aviso[]) || [];
}

export type AvisoPendiente = Aviso & {
  servicio: { id: string; proyecto: string; fecha: string; estado: string } | null;
  tecnico: string;
};

export async function listarAvisosPendientes(): Promise<AvisoPendiente[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('servicio_avisos')
    .select('*, servicios_programados(id, proyecto, fecha, estado), profiles!servicio_avisos_tecnico_id_fkey(full_name)')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });

  return ((data as any[]) || []).map((a) => ({
    ...a,
    servicio: a.servicios_programados || null,
    tecnico: a.profiles?.full_name || 'Técnico',
  }));
}

export async function resolverAviso(
  avisoId: string,
  estado: 'atendido' | 'descartado',
  nota: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('servicio_avisos')
    .update({ estado, resolucion_nota: nota.trim() || null })
    .eq('id', avisoId);
  if (error) throw error;
}
