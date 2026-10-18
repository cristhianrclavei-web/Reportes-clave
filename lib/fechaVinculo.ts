// Un reporte solo se vincula con el servicio del MISMO día: el reporte del
// 15 de octubre no puede ser el comprobante del servicio del 14. La base lo
// respalda con un disparador (supabase/patch_vinculo_misma_fecha.sql).

function fechaDMA(fecha: string): string {
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

// null si coinciden (o si falta alguna de las dos); si no, el mensaje.
export function motivoFechaNoCoincide(fechaReporte: string | null | undefined, fechaServicio: string | null | undefined): string | null {
  if (!fechaReporte || !fechaServicio) return null;
  if (fechaReporte === fechaServicio) return null;
  return `La fecha del reporte (${fechaDMA(fechaReporte)}) no coincide con la del servicio (${fechaDMA(fechaServicio)}). Solo se puede vincular un reporte con un servicio del mismo día.`;
}
