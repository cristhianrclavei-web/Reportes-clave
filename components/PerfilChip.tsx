'use client';

import Link from 'next/link';
import { UserRound } from 'lucide-react';

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

// El nombre de quien entró es el acceso al perfil. Un botón aparte no cabía en
// la barra junto al logo, el tema y el de salir, y tocar el propio nombre es
// donde la gente ya busca sus datos.
//
// Bajo 420 px se queda solo el círculo: el área táctil sigue siendo la misma,
// lo que se va es el texto.
export default function PerfilChip({ nombre, respaldo = 'Mi perfil' }: { nombre?: string; respaldo?: string }) {
  const ini = iniciales(nombre || '');

  return (
    <Link
      href="/perfil"
      aria-label="Mi perfil"
      className="shrink-0 min-h-[44px] flex items-center gap-2 pr-1 rounded-full active:scale-95 transition-transform"
    >
      <span className="w-9 h-9 rounded-full bg-teal text-inkOnAccent flex items-center justify-center text-[11.5px] font-display font-bold shrink-0">
        {ini || <UserRound size={17} strokeWidth={2.4} />}
      </span>
      <span className="hidden min-[420px]:block text-[13px] font-medium truncate max-w-[92px]">
        {nombre || respaldo}
      </span>
    </Link>
  );
}
