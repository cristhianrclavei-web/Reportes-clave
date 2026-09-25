// `ahora` se recibe desde afuera (en vez de leer Date.now() aquí) porque esta
// función corre durante el render: si calculara "ahora" ella misma, el
// servidor (Vercel, UTC) y el navegador (México) podrían calcular un número
// de días distinto y React tronaría al hidratar (mismo problema que
// SelectorSemana). Con `null` (antes de montar en el cliente) se omiten los
// días y se corrige solo, ya montado — ver ReportesList.tsx.
export function facturaChip(data: any, fecha: string, ahora: number | null): { label: string; className: string } | null {
  if (!data?.servicioConcluido) {
    return { label: 'Sin finalizar', className: 'bg-surface-2 text-muted' };
  }
  const estado = data?.facturaEstado;
  if (estado === 'facturado') {
    return { label: 'Facturado', className: 'bg-teal/15 text-teal' };
  }
  if (estado === 'en_proceso') {
    return { label: 'Factura en proceso', className: 'bg-red/15 text-red' };
  }
  // pendiente
  const desde = data?.fechaConcluido || fecha;
  let dias: number | null = null;
  if (desde && ahora !== null) {
    const ms = ahora - new Date(desde + 'T00:00:00').getTime();
    dias = Math.floor(ms / 86400000);
  }
  const label = dias !== null && dias > 0 ? `Por facturar · ${dias}d` : 'Por facturar';
  return { label, className: 'bg-amber/15 text-amber' };
}
