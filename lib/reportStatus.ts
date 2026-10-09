// En qué va la facturación de un reporte. Las facturas se arman en la sección
// Facturación con todos los reportes de un servicio; el reporte solo refleja
// si ya va en una. Un reporte deja de estar «por facturar» cuando se liga a
// una factura o cuando se marca que no se va a facturar (con su motivo).
//
//   sin_finalizar  el servicio no se ha dado por concluido
//   pendiente      concluido y sin factura: es lo que hay que atender
//   en_factura     ligado a una prefactura todavía sin timbrar
//   facturado      ligado a una factura timbrada (o con el PDF que antes se
//                  subía desde el propio reporte)
//   no_facturable  alguien registró por qué no se factura
//
// Antes «en_proceso» sin factura ligada era la nota de «no se puede
// facturar»: se sigue leyendo así.
export type EstadoFacturacion = 'sin_finalizar' | 'pendiente' | 'en_factura' | 'facturado' | 'no_facturable';

export function estadoFacturacion(data: any): EstadoFacturacion {
  if (!data?.servicioConcluido) return 'sin_finalizar';
  const estado = data?.facturaEstado;
  if (estado === 'facturado') return 'facturado';
  if (data?.facturaId) return 'en_factura';
  if (estado === 'no_facturable' || estado === 'en_proceso') return 'no_facturable';
  return 'pendiente';
}

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
  const estado = estadoFacturacion(data);
  if (estado === 'facturado') {
    return { label: 'Facturado', className: 'bg-teal/15 text-teal' };
  }
  if (estado === 'en_factura') {
    return { label: data?.facturaFolio ? `En prefactura ${data.facturaFolio}` : 'En prefactura', className: 'bg-teal/10 text-teal' };
  }
  if (estado === 'no_facturable') {
    return { label: 'No se factura', className: 'bg-surface-2 text-muted' };
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
