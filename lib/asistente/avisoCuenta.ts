// Mensajes para cuando el asistente deja de funcionar por la cuenta de
// Anthropic (Claude) y no por un error pasajero: la llave venció o se
// acabaron los créditos. Así quien lo usa sabe por qué y a quién avisar.

const DESPUES = 'Avisa a quien administra la app. Mientras tanto, el resto de la app funciona normal.';

export const AVISO_LLAVE = `El asistente está pausado: la llave de Anthropic (Claude) venció o ya no es válida. Hay que renovarla y cargar créditos en console.anthropic.com. ${DESPUES}`;
export const AVISO_CREDITOS = `El asistente está pausado: se acabaron los créditos de Anthropic (Claude). Hay que pagar o recargar créditos en console.anthropic.com. ${DESPUES}`;

// null = no es un problema de la cuenta (se trata como error normal).
export function avisoDeCuenta(estado: number | undefined, mensaje: string): string | null {
  const texto = mensaje.toLowerCase();
  // Anthropic responde 400 «Your credit balance is too low…» sin créditos.
  if (estado === 402 || /credit balance|billing|insufficient.*(credit|funds)|purchase credits/.test(texto)) return AVISO_CREDITOS;
  // 401: llave vencida, revocada o mal puesta. 403: la llave ya no tiene permiso.
  if (estado === 401 || estado === 403) return AVISO_LLAVE;
  return null;
}
