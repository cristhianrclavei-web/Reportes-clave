'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Network } from 'lucide-react';
import { nombreSistema, progresoDe, type Guia } from '@/lib/guias';
import { guiasDelCliente } from '@/lib/guiasDatos';

// Las guías de conexión del cliente, dentro del servicio del técnico: las
// del proyecto de este servicio van primero. Si el cliente no tiene guías,
// no se muestra nada.
export default function GuiasDelCliente({ clienteId, grupoId }: { clienteId: string | null | undefined; grupoId: string }) {
  const [guias, setGuias] = useState<Guia[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clienteId) return;
    let vigente = true;
    guiasDelCliente(clienteId)
      .then((lista) => { if (vigente) setGuias(lista); })
      .catch((e) => { if (vigente) setError(e?.message || 'No se pudieron cargar las guías de conexión.'); });
    return () => { vigente = false; };
  }, [clienteId]);

  if (error) return <p className="text-[13px] text-amber bg-amber/10 rounded-xl px-3 py-2 mb-4">{error}</p>;
  if (guias.length === 0) return null;

  const deEsteServicio = (g: Guia) => (g.servicio_grupo_id === grupoId ? 0 : 1);
  const ordenadas = [...guias].sort((a, b) => deEsteServicio(a) - deEsteServicio(b));

  return (
    <section className="mb-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted mb-2">Guías de conexión · {guias.length}</p>
      <div className="flex flex-col gap-2">
        {ordenadas.map((g) => {
          const progreso = progresoDe(g.datos, g.avance);
          return (
            <Link key={g.id} href={`/guias/${g.id}`} className="rounded-2xl border border-teal/40 bg-teal/5 p-3 flex items-center gap-3 active:scale-[0.99] transition-transform">
              <span className="w-10 h-10 rounded-xl bg-teal/15 text-teal flex items-center justify-center shrink-0"><Network size={20} strokeWidth={2.2} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14.5px] font-semibold truncate">{g.nombre}</span>
                <span className="block text-[12.5px] text-muted truncate">
                  {nombreSistema(g.sistema)} · {progreso.conexionesHechas} de {progreso.conexiones} conexiones{g.servicio_grupo_id === grupoId ? ' · de este servicio' : ''}
                </span>
              </span>
              <span className="font-mono text-[12.5px] text-muted">{progreso.porcentaje} %</span>
              <ChevronRight size={18} className="text-muted shrink-0" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
