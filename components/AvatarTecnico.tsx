'use client';

import { useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { usePerfil, urlFoto } from '@/lib/perfiles';

// Avatar ilustrado de técnico (casco, cara y uniforme) y la tira para elegir
// técnico en el celular. Mismo lenguaje que el menú de secciones (DockNav):
// al pasar el cursor se eleva, el resaltado se desliza entre técnicos
// (layoutId) y aparece el nombre.

const RESORTE = { type: 'spring', stiffness: 420, damping: 32 } as const;

// Todos con el mismo tono de piel y fondo; solo cambia el color del
// uniforme. Con `indice` (posición del técnico en la lista ordenada) no se
// repite entre los primeros 10; sin él, sale del nombre.
export const UNIFORMES = ['#1f8a6e', '#2f62a8', '#b8642c', '#6a4fa3', '#a8405a', '#4f7f2c', '#0f7c8c', '#c2861b', '#3d4a5c', '#8a5a2b'];
const FONDO = '#e1ebe8';
const PIEL = '#e2ad86';

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export type EstadoAvatar = 'alerta' | 'campo' | 'listo' | null;

const PUNTO: Record<Exclude<EstadoAvatar, null>, string> = {
  alerta: 'bg-red',
  campo: 'bg-amber',
  listo: 'bg-teal',
};

// Figuras del avatar genérico: cada quien elige la que más se le parece.
export const ESTILOS_AVATAR = ['Clásico', 'Cabello largo', 'Cabello recogido', 'Barba'] as const;
const CABELLO = '#4a2f22';

export function AvatarTecnico({ nombre, size = 44, estado = null, indice, id, estilo }: {
  nombre: string; size?: number; estado?: EstadoAvatar; indice?: number; id?: string;
  // Figura a dibujar (ESTILOS_AVATAR). Sin ella, la que eligió la persona en su perfil.
  estilo?: number;
}) {
  // Con `id`: foto de perfil si la subió, o el color de uniforme que eligió.
  const perfil = usePerfil(id);
  const [fallo, setFallo] = useState<string | null>(null);
  const url = urlFoto(perfil?.foto_path);
  // Si la foto no carga (borrada, sin red), se queda el avatar genérico.
  const foto = url && url !== fallo ? url : null;
  const uniforme = UNIFORMES[(perfil?.avatar_color ?? indice ?? hash(nombre)) % UNIFORMES.length];
  const piel = PIEL;
  const figura = estilo ?? perfil?.avatar_estilo ?? 0;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {foto ? (
        <img src={foto} alt="" width={size} height={size} loading="lazy" onError={() => setFallo(foto)} className="rounded-full block object-cover w-full h-full" />
      ) : (
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden className="rounded-full block">
        <circle cx="24" cy="24" r="24" fill={FONDO} />
        {/* cabello largo: cae detrás de los hombros */}
        {figura === 1 && <path d="M14.9 19.5c-2 6.5-2 13.5.6 18.5h17c2.600-5 2.600-12 .6-18.5z" fill={CABELLO} />}
        {/* hombros / uniforme */}
        <path d="M8 48c1.5-9 8-13.5 16-13.5S38.5 39 40 48z" fill={uniforme} />
        <path d="M21 34.6h6l-3 5z" fill="#ffffff" opacity="0.85" />
        {/* cuello y cara */}
        <rect x="20.5" y="27" width="7" height="8" rx="3" fill={piel} />
        <circle cx="24" cy="22" r="8.2" fill={piel} />
        {/* cabello largo: mechones a los lados de la cara */}
        {figura === 1 && (
          <>
            <path d="M15.6 20.4c-.5 3.200-.2 6 .9 8.600.9-2.600 1.200-5.400 1.100-8.600z" fill={CABELLO} />
            <path d="M32.4 20.4c.5 3.200.2 6-.9 8.600-.9-2.600-1.200-5.400-1.100-8.600z" fill={CABELLO} />
          </>
        )}
        {/* cabello recogido: coleta a un lado y patillas */}
        {figura === 2 && (
          <>
            <path d="M31.6 20.6c5 .6 7.200 6 4.600 11.400-.5-3.400-2-6-4.800-7.400z" fill={CABELLO} />
            <path d="M15.8 20.4c-.2 2 .1 3.800.8 5.200.6-1.600.8-3.400.7-5.200z" fill={CABELLO} />
            <path d="M32.2 20.4c.2 2-.1 3.800-.8 5.200-.6-1.600-.8-3.400-.7-5.200z" fill={CABELLO} />
          </>
        )}
        {/* barba */}
        {figura === 3 && <path d="M16.2 23.200c.3 4.800 3.600 7.400 7.800 7.400s7.500-2.600 7.800-7.400c-1.800 2.200-4.400 3.200-7.800 3.200s-6-1-7.800-3.200z" fill={CABELLO} />}
        <circle cx="21.2" cy="22.6" r="0.95" fill="#2b2b2b" />
        <circle cx="26.8" cy="22.6" r="0.95" fill="#2b2b2b" />
        <path d="M21.6 25.6c1.4 1.2 3.4 1.2 4.8 0" stroke="#2b2b2b" strokeWidth="0.9" strokeLinecap="round" fill="none" />
        {/* casco */}
        <path d="M14.6 19.6c0-6 4.2-9.6 9.4-9.6s9.4 3.6 9.4 9.6z" fill="#f2b53a" />
        <rect x="13" y="18.6" width="22" height="2.6" rx="1.3" fill="#e09a1c" />
        <rect x="22.8" y="10.4" width="2.4" height="8.4" rx="1.2" fill="#ffd36b" />
      </svg>
      )}
      {estado && (
        <span className="absolute -bottom-0.5 -right-0.5 flex">
          {estado === 'campo' && <span className={`absolute inset-0 rounded-full ${PUNTO[estado]} animate-ping opacity-60`} />}
          <span className={`relative w-3 h-3 rounded-full ring-2 ring-bg ${PUNTO[estado]}`} />
        </span>
      )}
    </span>
  );
}

// «Cristhian Ivan Rodriguez» → ["Cristhian", "Ivan Rodriguez"]; si no es un
// nombre de persona (p. ej. «Sin técnico»), se usa la etiqueta tal cual.
function dosRenglones(nombre: string, etiqueta: string): string[] {
  const p = nombre.trim().split(/\s+/);
  if (p.length < 2 || etiqueta === nombre) return [etiqueta];
  return [p[0], p.slice(1).join(' ')];
}

export type ItemTira = { id: string; nombre: string; etiqueta: string; cuenta?: number; estado?: EstadoAvatar; indice?: number };

// Tira de avatares repartidos a lo ancho, cada uno con su nombre en dos
// renglones; el seleccionado queda resaltado y en computadora el nombre
// completo aparece también al pasar el cursor.
export function TiraTecnicos({
  items, seleccionado, onSeleccionar, grupo,
}: {
  items: ItemTira[];
  seleccionado: string | undefined;
  onSeleccionar: (id: string) => void;
  grupo: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <LayoutGroup id={grupo}>
        {/* Columnas iguales a todo lo ancho; si no caben (más de ~5), se desliza. */}
        <div
          className="grid gap-1 overflow-x-auto pt-2.5 pb-1.5 -mx-2 px-2"
          style={{ scrollbarWidth: 'none', gridTemplateColumns: `repeat(${items.length}, minmax(68px, 1fr))` }}
          data-tira={grupo}
        >
          {items.map((it) => {
            const activo = it.id === seleccionado;
            return (
              <motion.button
                key={it.id}
                type="button"
                data-tec={it.id}
                onClick={() => onSeleccionar(it.id)}
                onHoverStart={() => setHover(it.id)}
                onHoverEnd={() => setHover((h) => (h === it.id ? null : h))}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.94 }}
                transition={RESORTE}
                aria-label={it.nombre}
                aria-pressed={activo}
                className="relative min-w-0 pt-1.5 pb-2 px-1 rounded-2xl flex flex-col items-center"
              >
                {activo && (
                  <motion.span
                    layoutId={`${grupo}-fondo`}
                    transition={RESORTE}
                    className="absolute inset-0 rounded-2xl bg-teal/12 ring-1 ring-teal/40 shadow-glow-teal"
                  />
                )}
                <motion.span
                  className="relative"
                  animate={{ scale: activo ? 1.08 : 1 }}
                  transition={RESORTE}
                >
                  <span className={`block rounded-full ${activo ? 'ring-2 ring-teal ring-offset-2 ring-offset-bg' : ''}`}>
                    <AvatarTecnico id={it.id} nombre={it.nombre} size={42} estado={it.estado || null} indice={it.indice} />
                  </span>
                  {typeof it.cuenta === 'number' && (
                    <span className={`absolute -top-1 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold flex items-center justify-center ring-2 ring-bg ${
                      it.cuenta === 0 ? 'bg-surface-2 text-muted' : 'bg-teal text-inkOnAccent'
                    }`}>{it.cuenta}</span>
                  )}
                </motion.span>
                {/* Nombre en dos renglones: nombre de pila y apellido(s). */}
                <span className={`relative mt-1.5 text-[11px] leading-[1.15] text-center w-full ${activo ? 'text-teal font-semibold' : 'text-muted'}`}>
                  {dosRenglones(it.nombre, it.etiqueta).map((r, i) => (
                    <span key={i} className="block truncate">{r}</span>
                  ))}
                </span>
                <AnimatePresence>
                  {hover === it.id && !activo && (
                    <motion.span
                      role="tooltip"
                      initial={{ opacity: 0, y: 4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="hidden lg:block pointer-events-none absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-lg bg-teal px-2 py-0.5 text-[11.5px] font-semibold text-inkOnAccent shadow-glow-teal"
                    >
                      {it.nombre}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
      </LayoutGroup>
    </div>
  );
}
