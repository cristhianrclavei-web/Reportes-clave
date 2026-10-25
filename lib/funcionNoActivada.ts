// Cuando la base todavía no tiene el SQL de una función nueva, el usuario ve
// un aviso amable y el nombre del patch queda solo en la consola, para quien
// administra la app (un cliente o un prospecto del demo no necesita verlo).
export const FUNCION_NO_ACTIVADA = 'Esta función todavía no está activada en tu cuenta. Avísale a quien administra la app.';

export function avisarFuncionNoActivada(patch: string): string {
  console.error(`Falta correr supabase/${patch} en la base.`);
  return FUNCION_NO_ACTIVADA;
}
