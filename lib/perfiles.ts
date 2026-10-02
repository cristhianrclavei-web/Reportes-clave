'use client';

import { useEffect, useState } from 'react';
import { createClient } from './supabaseClient';

// Perfil público de cada usuario (patch_perfil_personalizado.sql): foto o
// avatar genérico con color, apodo, puesto y especialidades. Se carga una
// sola vez por sesión y lo comparten todos los avatares de la app.

export type PerfilPublico = {
  id: string;
  full_name: string | null;
  apodo: string | null;
  foto_path: string | null;
  avatar_color: number | null;
  puesto: string | null;
  especialidades: string[];
  role: string | null;
};

export const ESPECIALIDADES = [
  'CCTV', 'Detección de incendio', 'Supresión', 'Control de acceso', 'Alarma de intrusión',
  'Redes y cableado', 'Automatización', 'Energía solar', 'Eléctrico', 'Programación de paneles',
];

let cache: Record<string, PerfilPublico> | null = null;
let pendiente: Promise<void> | null = null;
const oyentes = new Set<() => void>();

function avisar() {
  oyentes.forEach((f) => f());
}

export function cargarPerfiles(forzar = false): Promise<void> {
  if (cache && !forzar) return Promise.resolve();
  if (pendiente && !forzar) return pendiente;
  pendiente = (async () => {
    try {
      const { data, error } = await createClient().rpc('perfiles_publicos');
      if (error) throw error;
      const m: Record<string, PerfilPublico> = {};
      for (const p of (data as PerfilPublico[]) || []) m[p.id] = { ...p, especialidades: p.especialidades || [] };
      cache = m;
    } catch {
      // Sin el SQL o sin red: los avatares siguen con el genérico.
      cache = cache || {};
    } finally {
      pendiente = null;
      avisar();
    }
  })();
  return pendiente;
}

// Mapa id → perfil; se re-renderiza cuando llega o se actualiza.
export function usePerfiles(): Record<string, PerfilPublico> {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    oyentes.add(f);
    cargarPerfiles();
    return () => { oyentes.delete(f); };
  }, []);
  return cache || {};
}

export function usePerfil(id?: string | null): PerfilPublico | null {
  const m = usePerfiles();
  return id ? m[id] || null : null;
}

// Id del usuario con sesión (de la sesión local, sin ir a la red).
export function useMiId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setId(data.session?.user.id || null)).catch(() => {});
  }, []);
  return id;
}

export function urlFoto(path: string | null | undefined): string | null {
  if (!path) return null;
  return createClient().storage.from('avatares').getPublicUrl(path).data.publicUrl;
}

// Recorta al centro en cuadrado y reduce a 512 px JPEG: las fotos del
// celular pesan varios MB y aquí se ven en 30–60 px.
async function prepararFoto(file: File): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('No se pudo leer la imagen'));
    i.src = URL.createObjectURL(file);
  });
  const lado = Math.min(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(512, lado);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la foto'))), 'image/jpeg', 0.86));
}

export async function guardarMiPerfil(cambios: Partial<Omit<PerfilPublico, 'id' | 'full_name' | 'role'>> & { emergencia_nombre?: string | null; emergencia_telefono?: string | null }): Promise<void> {
  const { error } = await createClient().rpc('actualizar_mi_perfil', { p: cambios });
  if (error) throw new Error(error.message);
  await cargarPerfiles(true);
}

export async function subirMiFoto(file: File, anterior: string | null): Promise<string> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sin sesión');
  const blob = await prepararFoto(file);
  const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('avatares').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw new Error('No se pudo subir la foto: ' + error.message);
  await guardarMiPerfil({ foto_path: path });
  if (anterior) await supabase.storage.from('avatares').remove([anterior]).catch(() => {});
  return path;
}

export async function quitarMiFoto(anterior: string | null): Promise<void> {
  await guardarMiPerfil({ foto_path: null });
  if (anterior) await createClient().storage.from('avatares').remove([anterior]).catch(() => {});
}
