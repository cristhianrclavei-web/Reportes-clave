'use client';

// Quién cambió qué en la cotización (tabla cotizacion_cambios,
// supabase/patch_cotizacion_cambios.sql). Se anota al guardar cada edición.

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';

type Registro = {
  id: string;
  creado_en: string;
  cambios: string[];
  profiles: { full_name: string } | { full_name: string }[] | null;
};

const fecha = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

function autor(r: Registro): string {
  const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
  return p?.full_name || 'Alguien';
}

// `recarga` cambia cada vez que se guarda una edición, para volver a leer.
export default function HistorialCambios({ cotizacionId, recarga }: { cotizacionId: string; recarga: number }) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    createClient()
      .from('cotizacion_cambios')
      .select('id, creado_en, cambios, profiles(full_name)')
      .eq('cotizacion_id', cotizacionId)
      .order('creado_en', { ascending: false })
      .limit(30)
      .then(({ data, error: e }) => {
        if (!vigente) return;
        if (e) {
          console.error('Historial de cambios:', e.message);
          setError('No se pudo cargar el historial de cambios. Recarga la página para intentar de nuevo.');
          return;
        }
        setError(null);
        setRegistros((data as Registro[]) || []);
      });
    return () => { vigente = false; };
  }, [cotizacionId, recarga]);

  if (error) return <p className="text-[12.5px] text-red mb-3">{error}</p>;
  if (registros.length === 0) return null;

  return (
    <details className="glass rounded-2xl p-4 mb-3">
      <summary className="flex items-center gap-2 cursor-pointer text-[14px] font-semibold min-h-[32px]">
        <History size={16} strokeWidth={2.4} className="text-teal" />
        Historial de cambios ({registros.length})
      </summary>
      <ol className="mt-3 space-y-3">
        {registros.map((r) => (
          <li key={r.id} className="border-l-2 border-teal/40 pl-3">
            <p className="text-[12.5px] text-muted mb-1"><b className="text-ink/85">{autor(r)}</b> · {fecha(r.creado_en)}</p>
            <ul className="text-[13px] text-ink/85 space-y-0.5">
              {r.cambios.map((c, i) => <li key={i}>• {c}</li>)}
            </ul>
          </li>
        ))}
      </ol>
    </details>
  );
}
