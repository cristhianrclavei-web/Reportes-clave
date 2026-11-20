'use client';

// «Viene del levantamiento LEV-0006»: para revisar lo que se encontró en
// el sitio mientras se arma o corrige la cotización.

import { useEffect, useState } from 'react';
import { ClipboardList, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { abrirArchivo } from '@/lib/abrirArchivo';

export default function OrigenLevantamiento({ levantamientoId }: { levantamientoId: string }) {
  const [folio, setFolio] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient().from('levantamientos').select('folio').eq('id', levantamientoId).maybeSingle()
      .then(({ data, error: e }) => {
        if (e) setError('No se pudo leer el levantamiento: ' + e.message);
        else setFolio(data?.folio || null);
      });
  }, [levantamientoId]);

  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface-2/60 p-3 flex items-center gap-3">
      <ClipboardList size={18} className="text-teal shrink-0" />
      <p className="flex-1 min-w-0 text-[13px]">
        {error || <>Viene del levantamiento <span className="font-mono font-semibold text-teal">{folio || '…'}</span></>}
      </p>
      <button type="button" onClick={() => abrirArchivo(`/api/levantamientos/${levantamientoId}/pdf?t=${Date.now()}`)}
        className="shrink-0 h-9 px-3 rounded-full border border-line text-[12.5px] font-semibold flex items-center gap-1.5 hover:bg-surface">
        <FileText size={14} /> Ver levantamiento
      </button>
    </div>
  );
}
