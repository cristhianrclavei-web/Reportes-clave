// Los títulos de SYSCOM traen toda la ficha («Contacto Magnético Inalámbrico
// para Exterior / Compatible con AX PRO / Doble sensor…»). Para el reporte
// basta lo primero: hasta la primera « / », « | » o « - », y máximo 70 letras
// sin cortar palabras.
const MAX_DESCRIPCION = 70;

export function descripcionCorta(titulo: string): string {
  const limpio = titulo.replace(/\s+/g, ' ').trim();
  const primeraParte = limpio.split(/\s[\/|]\s|\s-\s/)[0].trim();
  if (primeraParte.length <= MAX_DESCRIPCION) return primeraParte;
  const recorte = primeraParte.slice(0, MAX_DESCRIPCION + 1);
  const ultimoEspacio = recorte.lastIndexOf(' ');
  const hasta = ultimoEspacio > 30 ? ultimoEspacio : MAX_DESCRIPCION;
  return recorte.slice(0, hasta).replace(/[,;:(]+$/, '').trim();
}
