'use client';

import { useState } from 'react';
import { confirmarServicio, Servicio } from '@/lib/serviciosProgramados';
import { showToast } from '@/components/Toast';
import { CheckCheck } from 'lucide-react';

// «Enterado»: el técnico confirma que vio el servicio que le asignaron. Va
// dentro de la tarjeta (que es un enlace), así que el toque no debe navegar.
export default function BotonEnterado({
  servicio,
  onConfirmado,
  className = '',
}: {
  servicio: Pick<Servicio, 'id' | 'proyecto' | 'fecha' | 'dias_totales'>;
  onConfirmado: () => void;
  className?: string;
}) {
  const [enviando, setEnviando] = useState(false);

  async function confirmar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (enviando) return;
    setEnviando(true);
    try {
      await confirmarServicio(servicio);
      onConfirmado();
      showToast('Confirmado. El supervisor ya sabe que estás enterado.', 'success');
    } catch (err: any) {
      showToast('No se pudo confirmar: ' + (err?.message || 'error'), 'error');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={confirmar}
      disabled={enviando}
      className={`min-h-[44px] px-4 rounded-xl bg-teal text-inkOnAccent font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60 ${className}`}
    >
      <CheckCheck size={17} strokeWidth={2.5} />
      {enviando ? 'Confirmando…' : 'Enterado'}
    </button>
  );
}
