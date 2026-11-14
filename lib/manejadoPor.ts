// Quién manejó el vehículo, como se escribe en el reporte. Casi siempre es
// una sola persona; si al regreso manejó otra, se dicen las dos.
export function textoManejadoPor(data: { manejadoPor?: string | null; manejadoPorRegreso?: string | null } | null | undefined): string {
  const ida = (data?.manejadoPor || '').trim();
  const regreso = (data?.manejadoPorRegreso || '').trim();
  if (!regreso || regreso === ida) return ida;
  if (!ida) return `Regreso: ${regreso}`;
  return `Ida: ${ida} · Regreso: ${regreso}`;
}
