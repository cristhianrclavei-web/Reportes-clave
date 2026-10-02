'use client';

import { AvatarTecnico } from '@/components/AvatarTecnico';
import { usePerfil } from '@/lib/perfiles';

// Quién hizo el reporte, con su foto de perfil (o avatar genérico).
//   · compacto: para la tarjeta de la lista de reportes.
//   · recuadro: «Elaborado por» dentro del detalle del reporte.

// «Cristhian Ivan Rodriguez» → «Cristhian Ivan»: cabe en la tarjeta.
function corto(n: string) {
  const p = n.trim().split(/\s+/);
  return p.length > 2 ? `${p[0]} ${p[1]}` : n;
}

export default function AutorReporte({ id, nombre, variante = 'compacto' }: { id?: string | null; nombre: string; variante?: 'compacto' | 'recuadro' }) {
  const perfil = usePerfil(id);
  const puesto = perfil?.puesto || (perfil?.role === 'supervisor' ? 'Supervisor' : 'Técnico');

  if (variante === 'compacto') {
    return (
      <span className="flex items-center gap-2 min-w-0">
        <span className="rounded-full ring-2 ring-teal/25 shrink-0"><AvatarTecnico id={id || undefined} nombre={nombre || 'Técnico'} size={34} /></span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[13px] font-semibold truncate max-w-[150px]">{corto(nombre || 'Técnico')}</span>
          <span className="block text-[11px] text-muted truncate max-w-[150px]">{puesto}</span>
        </span>
      </span>
    );
  }

  return (
    <div className="mb-5 rounded-2xl border border-line bg-surface-2/40 p-4 flex items-center gap-4">
      <span className="rounded-full ring-4 ring-teal/20 shrink-0"><AvatarTecnico id={id || undefined} nombre={nombre || 'Técnico'} size={60} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] uppercase tracking-wider text-muted mb-0.5">Elaborado por</p>
        <p className="font-display font-semibold text-[17px] leading-tight truncate">
          {nombre || 'Técnico'}
          {perfil?.apodo && <span className="text-[13px] text-muted font-sans font-medium"> · «{perfil.apodo}»</span>}
        </p>
        <p className="text-[12.5px] text-muted">{puesto}</p>
        {perfil && perfil.especialidades.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {perfil.especialidades.slice(0, 4).map((e) => (
              <span key={e} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-teal/12 text-teal">{e}</span>
            ))}
            {perfil.especialidades.length > 4 && <span className="text-[10.5px] text-muted">+{perfil.especialidades.length - 4}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
