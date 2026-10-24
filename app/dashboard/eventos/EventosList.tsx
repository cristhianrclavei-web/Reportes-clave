'use client';

import { useState } from 'react';
import SupervisorShell from '@/components/SupervisorShell';
import ActividadSeccion, { NOMBRE_SECCION } from '@/components/ActividadSeccion';
import type { SeccionActividad } from '@/lib/auditoriaGlobal';

// Página «Actividad»: todo junto, con filtro por sección. Cada sección tiene
// además su propia subsección «Actividad» (components/ActividadSeccion).
export default function EventosList({ userName }: { userName?: string }) {
  const [seccion, setSeccion] = useState<SeccionActividad | ''>('');
  return (
    <SupervisorShell
      active="eventos"
      title="Actividad del equipo"
      userName={userName}
      wrapperClassName="max-w-2xl lg:max-w-none mx-auto pb-28 lg:pb-16 lg:px-8 2xl:px-10"
    >
      <select
        aria-label="Sección"
        value={seccion}
        onChange={(e) => setSeccion(e.target.value as SeccionActividad | '')}
        className="w-full mb-3 px-3 py-2.5 rounded-xl bg-surface-2 border border-line focus:border-teal focus:outline-none text-[13px]"
      >
        <option value="">Todas las secciones</option>
        {(Object.keys(NOMBRE_SECCION) as SeccionActividad[]).map((k) => (
          <option key={k} value={k}>{NOMBRE_SECCION[k]}</option>
        ))}
      </select>
      <ActividadSeccion seccion={seccion || undefined} mostrarSeccion={!seccion} />
    </SupervisorShell>
  );
}
