import { normalizar } from './clientesCatalogo';

// Búsqueda de las listas de toda la app: sin acentos, mayúsculas ni signos,
// y cada palabra escrita debe aparecer (en cualquier orden). Así «Ángel»,
// «angel» y «ANGEL» dan lo mismo, y «angel centro» encuentra «Centro de
// Negocios del Ángel».
export function coincideBusqueda(texto: string, consulta: string): boolean {
  const q = normalizar(consulta);
  if (!q) return true;
  const t = normalizar(texto);
  return q.split(' ').every((palabra) => t.includes(palabra));
}
