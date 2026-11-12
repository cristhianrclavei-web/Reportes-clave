// Qué anexos especiales se pueden agregar a un reporte según el SISTEMA en
// que se trabajó (los «Sistemas» que se marcan en el reporte). Hoy solo hay
// uno: la búsqueda de falla a tierra, que es del sistema de detección. Cuando
// haya anexos de otros sistemas (paneles solares, control de acceso…), se
// agregan aquí con los sistemas en que aplican.

export type AnexoEspecial = 'fallaTierra';

// Los nombres de sistema son los del reporte (SEGURIDAD_OPTS en app/nuevo).
export const SISTEMAS_DE_ANEXO: Record<AnexoEspecial, string[]> = {
  // Lazos de detección: alarma y detección de incendio, y los paneles de supresión.
  fallaTierra: ['Alarma&Det', 'Supresión'],
};

// ¿El reporte trabaja en alguno de los sistemas de ese anexo?
export function aplicaAnexo(anexo: AnexoEspecial, sistemasDelReporte: string[]): boolean {
  return SISTEMAS_DE_ANEXO[anexo].some((sistema) => sistemasDelReporte.includes(sistema));
}
