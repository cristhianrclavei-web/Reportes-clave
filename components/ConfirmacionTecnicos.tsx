'use client';

import { CheckCheck, Eye, EyeOff } from 'lucide-react';
import type { ConfirmacionTecnico } from '@/lib/serviciosProgramados';

// Estado de confirmación de cada técnico de un día programado:
//   gris «Sin ver» · ámbar «Visto» · verde «Enterado».
// Los datos llegan cargados en el navegador (useEffect), así que formatear la
// hora aquí no afecta la hidratación.

function fechaHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function estadoConfirmacion(c: Pick<ConfirmacionTecnico, 'visto_en' | 'enterado_en'>): 'sin_ver' | 'visto' | 'enterado' {
  if (c.enterado_en) return 'enterado';
  if (c.visto_en) return 'visto';
  return 'sin_ver';
}

const CFG = {
  sin_ver: { label: 'Sin ver', cls: 'bg-surface-2 text-muted border-line', Icono: EyeOff },
  visto: { label: 'Visto', cls: 'bg-amber/15 text-amber border-amber/30', Icono: Eye },
  enterado: { label: 'Enterado', cls: 'bg-teal/15 text-teal border-teal/30', Icono: CheckCheck },
};

export default function ConfirmacionTecnicos({ items, className = '' }: { items: ConfirmacionTecnico[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {items.map((c) => {
        const e = estadoConfirmacion(c);
        const { label, cls, Icono } = CFG[e];
        const cuando = e === 'enterado' ? c.enterado_en : e === 'visto' ? c.visto_en : null;
        return (
          <span
            key={c.tecnico_id}
            title={cuando ? `${label} ${fechaHora(cuando)}` : label}
            className={`text-[12px] font-medium px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${cls}`}
          >
            <Icono size={12} strokeWidth={2.5} className="shrink-0" />
            <span className="text-ink/85">{c.nombre}</span>
            <span>· {label}{cuando ? ` ${fechaHora(cuando)}` : ''}</span>
          </span>
        );
      })}
    </div>
  );
}

// Para la tarjeta de un proyecto: cuántos técnicos faltan de confirmar en sus
// días todavía programados.
export function ResumenConfirmacion({ items }: { items: ConfirmacionTecnico[] }) {
  if (items.length === 0) return null;
  const faltan = new Set(items.filter((c) => !c.enterado_en).map((c) => c.tecnico_id));
  if (faltan.size === 0) {
    return (
      <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-teal/15 text-teal flex items-center gap-1.5 w-fit">
        <CheckCheck size={12} strokeWidth={2.6} /> Todos enterados
      </span>
    );
  }
  return (
    <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-amber/15 text-amber flex items-center gap-1.5 w-fit">
      <Eye size={12} strokeWidth={2.6} /> {faltan.size} sin confirmar
    </span>
  );
}
