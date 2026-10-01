'use client';

import { useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';

// Avatar ilustrado de técnico (casco, cara y uniforme) y la tira para elegir
// técnico en el celular. Mismo lenguaje que el menú de secciones (DockNav):
// al pasar el cursor se eleva, el resaltado se desliza entre técnicos
// (layoutId) y aparece el nombre.

const RESORTE = { type: 'spring', stiffness: 420, damping: 32 } as const;

// Color estable por persona (mismo nombre → mismo color).
const TONOS = [
  { fondo: '#d8efe8', uniforme: '#1f8a6e' },
  { fondo: '#dbe7f6', uniforme: '#2f62a8' },
  { fondo: '#f4e3d3', uniforme: '#b8642c' },
  { fondo: '#e6def3', uniforme: '#6a4fa3' },
  { fondo: '#f3dbe0', uniforme: '#a8405a' },
  { fondo: '#e2ecd6', uniforme: '#4f7f2c' },
];
const PIEL = ['#f1c7a3', '#d9a27a', '#b97c55', '#8d5a3b'];

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

export function AvatarTecnico({ nombre, size = 44, estado = null }: { nombre: string; size?: number; estado?: EstadoAvatar }) {
  const h = hash(nombre);
  const tono = TONOS[h % TONOS.length];
  const piel = PIEL[(h >> 3) % PIEL.length];
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden className="rounded-full block">
        <circle cx="24" cy="24" r="24" fill={tono.fondo} />
        {/* hombros / uniforme */}
        <path d="M8 48c1.5-9 8-13.5 16-13.5S38.5 39 40 48z" fill={tono.uniforme} />
        <path d="M21 34.6h6l-3 5z" fill="#ffffff" opacity="0.85" />
        {/* cuello y cara */}
        <rect x="20.5" y="27" width="7" height="8" rx="3" fill={piel} />
        <circle cx="24" cy="22" r="8.2" fill={piel} />
        <circle cx="21.2" cy="22.6" r="0.95" fill="#2b2b2b" />
        <circle cx="26.8" cy="22.6" r="0.95" fill="#2b2b2b" />
        <path d="M21.6 25.6c1.4 1.2 3.4 1.2 4.8 0" stroke="#2b2b2b" strokeWidth="0.9" strokeLinecap="round" fill="none" />
        {/* casco */}
        <path d="M14.6 19.6c0-6 4.2-9.6 9.4-9.6s9.4 3.6 9.4 9.6z" fill="#f2b53a" />
        <rect x="13" y="18.6" width="22" height="2.6" rx="1.3" fill="#e09a1c" />
        <rect x="22.8" y="10.4" width="2.4" height="8.4" rx="1.2" fill="#ffd36b" />
      </svg>
      {estado && (
        <span className="absolute -bottom-0.5 -right-0.5 flex">
          {estado === 'campo' && <span className={`absolute inset-0 rounded-full ${PUNTO[estado]} animate-ping opacity-60`} />}
          <span className={`relative w-3 h-3 rounded-full ring-2 ring-bg ${PUNTO[estado]}`} />
        </span>
      )}
    </span>
  );
}

export type ItemTira = { id: string; nombre: string; etiqueta: string; cuenta?: number; estado?: EstadoAvatar };

// Tira horizontal de avatares. El seleccionado queda resaltado con su nombre
// debajo; en computadora, el nombre también aparece al pasar el cursor.
export function TiraTecnicos({
  items, seleccionado, onSeleccionar, grupo,
}: {
  items: ItemTira[];
  seleccionado: string | undefined;
  onSeleccionar: (id: string) => void;
  grupo: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const sel = items.find((i) => i.id === seleccionado);
  return (
    <div>
      <LayoutGroup id={grupo}>
        <div className="flex gap-1 overflow-x-auto pt-2.5 pb-1.5 -mx-2 px-2" style={{ scrollbarWidth: 'none' }} data-tira={grupo}>
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
                className="relative shrink-0 w-[62px] pt-1.5 pb-2 rounded-2xl flex flex-col items-center"
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
                    <AvatarTecnico nombre={it.nombre} size={42} estado={it.estado || null} />
                  </span>
                  {typeof it.cuenta === 'number' && (
                    <span className={`absolute -top-1 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold flex items-center justify-center ring-2 ring-bg ${
                      it.cuenta === 0 ? 'bg-surface-2 text-muted' : 'bg-teal text-inkOnAccent'
                    }`}>{it.cuenta}</span>
                  )}
                </motion.span>
                <span className={`relative mt-1 text-[10.5px] leading-tight max-w-full truncate px-0.5 ${activo ? 'text-teal font-semibold' : 'text-muted'}`}>
                  {it.etiqueta}
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
      <AnimatePresence mode="wait">
        {sel && (
          <motion.p
            key={sel.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.16 }}
            className="text-center text-[15px] font-display font-semibold mt-1"
          >
            {sel.nombre}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
