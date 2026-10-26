'use client';

import { MOTIVOS } from '@/lib/motivosServicio';

// Por qué un proyecto necesita más días de los cotizados. Separado en lo
// ajeno al equipo y lo que es del equipo en campo, porque eso es justo lo
// que mide el plazo (lib/plazosProyecto.ts): lo propio cuenta en contra.
const GRUPOS = [
  { origen: 'externo', titulo: 'Ajeno al equipo', sel: 'bg-amber text-inkOnAccent border-amber' },
  { origen: 'propio', titulo: 'Del equipo en campo', sel: 'bg-red text-white border-red' },
] as const;

export default function MotivoAmpliacion({ valor, onChange }: { valor: string; onChange: (clave: string) => void }) {
  return (
    <div>
      {GRUPOS.map((g) => (
        <div key={g.origen} className="mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">{g.titulo}</p>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS.filter((m) => m.ampliacion && m.origen === g.origen).map((m) => (
              <button
                key={m.clave}
                type="button"
                onClick={() => onChange(m.clave)}
                aria-pressed={valor === m.clave}
                className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors ${
                  valor === m.clave ? g.sel : 'bg-surface border-line text-ink/80 hover:border-line-strong'
                }`}
              >
                {m.texto}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
