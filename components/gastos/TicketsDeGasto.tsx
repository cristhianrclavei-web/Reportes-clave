'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ReceiptText } from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';
import { enlacesDeTickets } from '@/lib/paradasDatos';
import { textoMonto } from '@/lib/paradas';

// Monto y fotos del ticket de un gasto, para que supervisión lo revise. Al
// tocar una foto se ve en grande.
export default function TicketsDeGasto({ monto, fotos, sinTicket, motivoSinTicket }: {
  monto: number;
  fotos: string[];
  sinTicket: boolean;
  motivoSinTicket: string | null;
}) {
  const [enlaces, setEnlaces] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [grande, setGrande] = useState<string | null>(null);
  const clave = fotos.join('|');

  useEffect(() => {
    let cancelado = false;
    enlacesDeTickets(fotos)
      .then((lista) => { if (!cancelado) setEnlaces(lista); })
      .catch((e) => { if (!cancelado) setError(e.message); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return (
    <div className="mt-2 rounded-xl border border-line bg-surface-2/50 p-2.5">
      <p className="text-[13px] font-semibold flex items-center gap-1.5">
        <ReceiptText size={14} className="text-teal" /> Gasto: <span className="tabular-nums">{textoMonto(monto)}</span>
      </p>
      {sinTicket && (
        <p className="text-[12.5px] text-amber font-semibold mt-1 flex items-start gap-1.5">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> Sin ticket: <span className="font-normal text-ink/85">{motivoSinTicket}</span>
        </p>
      )}
      {error && <p className="text-[12.5px] text-red mt-1">{error}</p>}
      {enlaces.length > 0 && (
        <div className="flex gap-2 mt-2 overflow-x-auto">
          {enlaces.map((url, i) => (
            <button key={url} type="button" onClick={() => setGrande(url)} aria-label={`Ver ticket ${i + 1}`}
              className="shrink-0 w-16 h-20 rounded-lg overflow-hidden border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Ticket ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {grande && (
        <ModalOverlay onClose={() => setGrande(null)}>
          <div className="max-w-lg w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={grande} alt="Ticket" className="w-full max-h-[85vh] object-contain rounded-2xl bg-black" />
            <button type="button" onClick={() => setGrande(null)} className="mt-3 w-full min-h-[46px] rounded-xl bg-surface border border-line font-semibold">Cerrar</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
