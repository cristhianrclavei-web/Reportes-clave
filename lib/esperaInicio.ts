// Lo que puede detener el inicio de un servicio cuando el técnico ya está en
// el sitio: la llegada se marca (sola por GPS o a mano), pero el trabajo no
// empieza hasta que él toca «Iniciar servicio». Ese tiempo de espera no es
// trabajo, y con esta lista queda dicho por qué pasó.

export const MOTIVOS_ESPERA_INICIO: string[] = [
  'El ingreso no estaba listo (registro en caseta o vigilancia)',
  'Falta el permiso de trabajo',
  'No está el usuario o contacto del cliente',
  'Plática o curso de seguridad antes de entrar',
  'Revisión de documentos (IMSS, seguro, identificaciones)',
  'Revisión de herramienta, equipo o vehículo en el acceso',
  'El área de trabajo está ocupada o sin liberar',
  'Esperando material, herramienta o equipo',
  'Esperando al resto del equipo',
  'Otro',
];

// Se guarda como una justificación más del servicio (evento «retraso»); el
// prefijo es lo que la distingue de las demás.
export const PREFIJO_ESPERA_INICIO = 'Inicio detenido: ';

// «Otro» sin explicación no dice nada: ahí el comentario es obligatorio.
export function esperaCompleta(motivo: string | null, comentario: string): boolean {
  if (!motivo) return false;
  return motivo !== 'Otro' || comentario.trim().length >= 3;
}

export function esEsperaDeInicio(nota: string | null | undefined): boolean {
  return !!nota && nota.startsWith(PREFIJO_ESPERA_INICIO);
}
