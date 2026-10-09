// Visita sin trabajo: el técnico llegó pero no se pudo trabajar (el cliente
// no tenía el equipo, no dio acceso…). Lo registra al cerrar el día y el
// supervisor decide si ese servicio queda liberado del reporte
// (patch_visita_sin_trabajo.sql; solo un supervisor puede liberar).
//
// Sin dependencias, para usarlo desde cualquier lado.

export type VisitaEstado = 'pendiente' | 'liberado' | 'rechazado';

export const TEXTO_VISITA: Record<VisitaEstado, string> = {
  pendiente: 'Visita sin trabajo · por revisar',
  liberado: 'Visita sin trabajo · no requiere reporte',
  rechazado: 'Sí requiere reporte',
};

type ConReporte = { report_id?: string | null; visita_estado?: string | null };

// ¿A este servicio le falta su reporte? Mientras el supervisor revisa la
// visita no se le exige al técnico; liberada, ya no se exige nunca.
export function debeReporte(s: ConReporte): boolean {
  return !s.report_id && s.visita_estado !== 'pendiente' && s.visita_estado !== 'liberado';
}

// Lo mismo, como filtro de PostgREST (va junto con report_id is null).
export const FILTRO_DEBE_REPORTE = 'visita_estado.is.null,visita_estado.eq.rechazado';
