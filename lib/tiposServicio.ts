// Un reporte puede tener varios tipos de servicio (por ejemplo, instalación
// nueva y mantenimiento correctivo el mismo día con el mismo cliente). Se
// guardan en las mismas columnas de texto de siempre, separados por coma:
//   tipo_servicio     = 'Instalación nueva, Mantenimiento'
//   sub_tipo_servicio = 'Correctivo, Preventivo'
// Así los reportes viejos (un solo valor) se leen igual y no hace falta
// cambiar la base.

const SEPARADOR = ', ';

export function separarTipos(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const partes = texto.split(',').map((parte) => parte.trim());
  return partes.filter((parte) => parte !== '');
}

export function unirTipos(lista: string[]): string | null {
  if (lista.length === 0) return null;
  return lista.join(SEPARADOR);
}

export function tieneTipo(texto: string | null | undefined, tipo: string): boolean {
  return separarTipos(texto).includes(tipo);
}

// Texto para mostrar: «Instalación nueva · Mantenimiento correctivo · Otro: …».
export function textoTiposServicio(
  tipo: string | null | undefined,
  subTipo: string | null | undefined,
  otroTexto?: string | null,
): string {
  const partes: string[] = [];
  const subs = separarTipos(subTipo);
  for (const t of separarTipos(tipo)) {
    if (t === 'Mantenimiento' && subs.length > 0) {
      for (const sub of subs) partes.push(`Mantenimiento ${sub.toLowerCase()}`);
    } else if (t === 'Otro' && otroTexto) {
      partes.push(`Otro: ${otroTexto}`);
    } else {
      partes.push(t);
    }
  }
  return partes.join(' · ');
}
