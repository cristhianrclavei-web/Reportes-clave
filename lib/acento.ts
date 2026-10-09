'use client';

import { useSyncExternalStore } from 'react';
import { createClient } from './supabaseClient';
import { MARCA } from './marca';

// Color de acento que elige cada persona. Solo cambia las variables de
// acento (app/globals.css, bloques [data-acento]); todo lo que usa las
// clases «teal» lo toma sin enterarse. El logo y los PDF conservan el color
// de la marca.
//
// Se guarda en el dispositivo (para pintarlo antes de dibujar la página, ver
// el script de app/layout.tsx) y en el perfil (para que lo siga a otros
// dispositivos; requiere supabase/patch_color_acento.sql).

export type Acento = 'marca' | 'bosque' | 'oceano' | 'ciruela' | 'brasa';

// `muestra`: color del botón en el selector (el de tema oscuro).
export const ACENTOS: { clave: Acento; nombre: string; muestra: string }[] = [
  { clave: 'marca', nombre: 'Original', muestra: MARCA.tema === 'azul' ? '#3B82F6' : '#22B08A' },
  { clave: 'bosque', nombre: 'Bosque', muestra: '#34C78E' },
  { clave: 'oceano', nombre: 'Océano', muestra: '#3B82F6' },
  { clave: 'ciruela', nombre: 'Ciruela', muestra: '#A78BFA' },
  { clave: 'brasa', nombre: 'Brasa', muestra: '#F0805A' },
];

// El «original» ya es verde o azul según la instalación: se quita de la
// lista el que saldría repetido.
export const ACENTOS_OFRECIDOS = ACENTOS.filter((a) => a.clave !== (MARCA.tema === 'azul' ? 'oceano' : 'bosque'));

export const KEY_ACENTO = 'acento';

const VALIDOS = new Set<string>(ACENTOS.map((a) => a.clave));
const oyentes = new Set<() => void>();

function leer(): Acento {
  try {
    const v = localStorage.getItem(KEY_ACENTO);
    return v && VALIDOS.has(v) ? (v as Acento) : 'marca';
  } catch {
    return 'marca';
  }
}

function pintar(a: Acento) {
  const raiz = document.documentElement;
  if (a === 'marca') raiz.removeAttribute('data-acento');
  else raiz.setAttribute('data-acento', a);
}

function aplicarLocal(a: Acento) {
  try { localStorage.setItem(KEY_ACENTO, a); } catch { /* modo privado */ }
  pintar(a);
  oyentes.forEach((f) => f());
}

function suscribir(avisar: () => void): () => void {
  oyentes.add(avisar);
  const otraPestana = (e: StorageEvent) => { if (e.key === KEY_ACENTO) { pintar(leer()); avisar(); } };
  window.addEventListener('storage', otraPestana);
  return () => { oyentes.delete(avisar); window.removeEventListener('storage', otraPestana); };
}

// Elegir un color: se ve al instante y se manda al perfil sin esperar. Si
// la base todavía no tiene la columna, se queda en el dispositivo.
export function elegirAcento(a: Acento) {
  aplicarLocal(a);
  (async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      await supabase.from('profiles').update({ color_acento: a }).eq('id', session.user.id);
    } catch { /* sin conexión: queda en el dispositivo */ }
  })();
}

// Al entrar: si el perfil trae un color distinto al del dispositivo (se
// eligió en otro lado), manda el del perfil.
export async function traerAcentoDelPerfil(): Promise<void> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data, error } = await supabase.from('profiles').select('color_acento').eq('id', session.user.id).maybeSingle();
    if (error) return;
    const guardado = (data as any)?.color_acento as string | null;
    if (guardado && VALIDOS.has(guardado) && guardado !== leer()) aplicarLocal(guardado as Acento);
  } catch { /* se queda el del dispositivo */ }
}

export function useAcento(): Acento {
  return useSyncExternalStore<Acento>(suscribir, leer, () => 'marca');
}
