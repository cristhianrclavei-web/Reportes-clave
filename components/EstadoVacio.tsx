import { ReactNode } from 'react';

// Estado vacío de una lista: ícono en su cuadro, título y una pista de qué
// hacer. Mismo aspecto que ya tenían Cotizaciones, Facturación y Mis
// servicios, para que todas las pantallas vacías se vean iguales.
export default function EstadoVacio({ icono, titulo, detalle, className = 'py-10' }: {
  icono: ReactNode;
  titulo: string;
  detalle?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-3.5 text-faint">
        {icono}
      </div>
      <p className="text-[14.5px] font-medium mb-1">{titulo}</p>
      {detalle && <p className="text-[13px] text-muted leading-relaxed max-w-[300px]">{detalle}</p>}
    </div>
  );
}
