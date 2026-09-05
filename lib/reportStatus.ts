export function facturaChip(data: any, fecha: string): { label: string; className: string } | null {
  if (!data?.servicioConcluido) {
    return { label: 'Sin finalizar', className: 'bg-surface-2 text-muted' };
  }
  const estado = data?.facturaEstado;
  if (estado === 'facturado') {
    return { label: '✓ Facturado', className: 'bg-teal/15 text-teal' };
  }
  if (estado === 'en_proceso') {
    return { label: '⚠ Factura en proceso', className: 'bg-red/15 text-red' };
  }
  // pendiente
  const desde = data?.fechaConcluido || fecha;
  let dias: number | null = null;
  if (desde) {
    const ms = Date.now() - new Date(desde + 'T00:00:00').getTime();
    dias = Math.floor(ms / 86400000);
  }
  const label = dias !== null && dias > 0 ? `Por facturar · ${dias}d` : 'Por facturar';
  return { label, className: 'bg-amber/15 text-amber' };
}
