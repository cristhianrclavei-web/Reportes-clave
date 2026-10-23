'use client';

import { Layers } from 'lucide-react';
import type { TipoMotor } from './useMapaTecnicos';

// Cambia entre Google Maps y el mapa básico (OpenStreetMap). Solo aparece si
// hay llave de Google; si Google llega a su tope del día, el básico sigue.
export default function BotonMotorMapa({ motor, hayGoogle, cambiar, className = '' }: {
  motor: TipoMotor | null;
  hayGoogle: boolean;
  cambiar: () => void;
  className?: string;
}) {
  if (!hayGoogle || motor === null) return null;
  const texto = motor === 'google' ? 'Mapa básico' : 'Google Maps';
  return (
    <button
      type="button"
      onClick={cambiar}
      title={`Cambiar a ${texto}`}
      className={`h-11 px-3.5 rounded-2xl bg-surface/90 backdrop-blur-md border border-line shadow-diffuse flex items-center gap-2 text-[13px] font-semibold text-ink/80 hover:text-teal hover:border-teal/50 active:scale-95 transition ${className}`}
    >
      <Layers size={16} strokeWidth={2.3} />
      <span>{texto}</span>
    </button>
  );
}
