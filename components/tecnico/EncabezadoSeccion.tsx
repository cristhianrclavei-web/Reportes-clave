import { ReactNode } from 'react';

// Encabezado de cada sección del técnico: título, una línea de contexto
// (cuántos hay, qué falta) y, si la sección tiene una acción principal, su
// botón. En computadora el botón va a la derecha con su ancho natural; en
// celular ocupa el renglón completo, al alcance del pulgar.
export default function EncabezadoSeccion({ titulo, detalle, accion }: {
  titulo: string;
  detalle?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 mb-5 lg:flex-row lg:items-end lg:justify-between lg:mb-6">
      <div className="min-w-0">
        <h1 className="font-display font-bold text-[26px] leading-tight lg:text-[32px] tracking-wide">{titulo}</h1>
        {detalle && <p className="text-[14px] text-muted mt-1 leading-snug">{detalle}</p>}
      </div>
      {accion && <div className="shrink-0 [&>*]:w-full lg:[&>*]:w-auto">{accion}</div>}
    </div>
  );
}

// Botón de la acción principal de una sección.
export const BOTON_PRINCIPAL = 'min-h-[54px] lg:min-h-[46px] px-6 rounded-2xl bg-teal text-inkOnAccent font-display font-semibold text-[16px] lg:text-[14.5px] tracking-wide shadow-glow-teal flex items-center justify-center gap-2 transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]';

// Rótulo de un grupo dentro de una lista («Pendientes», «Octubre 2026»…).
export function RotuloGrupo({ children, cuenta }: { children: ReactNode; cuenta?: number }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</span>
      {cuenta !== undefined && <span className="text-[11.5px] font-semibold text-faint tabular-nums">{cuenta}</span>}
      <span className="flex-1 h-px bg-line" aria-hidden="true" />
    </div>
  );
}
