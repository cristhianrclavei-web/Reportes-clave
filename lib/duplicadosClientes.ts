import { normalizar } from './clientesCatalogo';

// Agrupa clientes y nombres sueltos de reportes que probablemente son el
// mismo cliente, para la pantalla «Posibles duplicados». Solo sugiere: la
// decisión de unir siempre es de un supervisor.

export type NodoCliente = { tipo: 'cliente'; id: string; nombre: string; alias: string[]; reportes: number; porRevisar: boolean };
export type NodoSuelto = { tipo: 'suelto'; nombre: string; norm: string; reportes: number; variantes: string[] };
export type Nodo = NodoCliente | NodoSuelto;

// Palabras que no identifican a un cliente: «de», «del»… y también las muy
// comunes en nombres de negocio («casa», «plaza», «centro»…). Sin estas,
// «Casa de Willy» y «Tequila Casa San Matías» caerían en el mismo grupo.
const NO_DISTINGUEN = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'san', 'santa',
  'sa', 'cv', 'rl', 'sc', 'sapi', 'srl', 'the',
  'casa', 'plaza', 'centro', 'grupo', 'tienda', 'corporativo', 'servicios', 'negocios',
  'comercial', 'industrial', 'empresa', 'compania', 'parque', 'edificio', 'torre',
  'hotel', 'capital', 'norte', 'sur', 'oriente', 'poniente',
]);

function claves(texto: string): string[] {
  return normalizar(texto).split(' ').filter((p) => p.length >= 4 && !NO_DISTINGUEN.has(p));
}

// «tequila»/«tequilera», «hsmc»/«hsmch», «apostol»/«apostol».
function casiIgual(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function nombresDe(n: Nodo): string[] {
  return n.tipo === 'cliente' ? [n.nombre, ...n.alias] : [n.nombre];
}

export function normDe(n: Nodo): string {
  return n.tipo === 'cliente' ? normalizar(n.nombre) : n.norm;
}

function parAcomodado(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function seParecen(a: Nodo, b: Nodo): boolean {
  const ka = nombresDe(a).flatMap(claves);
  const kb = nombresDe(b).flatMap(claves);
  return ka.some((x) => kb.some((y) => casiIgual(x, y)));
}

// Agrupa nombres de reportes sin cliente: mismo nombre sin acentos,
// mayúsculas ni espacios extra = un solo «suelto» con sus variantes.
export function agruparSueltos(reportes: { empresa_cliente: string; cliente_id: string | null }[]): NodoSuelto[] {
  const mapa = new Map<string, NodoSuelto>();
  for (const r of reportes) {
    if (r.cliente_id) continue;
    const norm = normalizar(r.empresa_cliente);
    if (!norm) continue;
    const s = mapa.get(norm) || { tipo: 'suelto', nombre: r.empresa_cliente.trim(), norm, reportes: 0, variantes: [] };
    s.reportes++;
    if (!s.variantes.includes(r.empresa_cliente.trim())) s.variantes.push(r.empresa_cliente.trim());
    mapa.set(norm, s);
  }
  return [...mapa.values()];
}

// Grupos de 2+ nodos que se parecen (por cadenas: si A~B y B~C, van juntos),
// excluyendo los pares que alguien ya marcó como «No son el mismo». Solo se
// devuelven grupos que incluyan al menos un nombre suelto o un cliente por
// revisar: dos clientes ya revisados no se vuelven a proponer.
export function gruposDuplicados(nodos: Nodo[], descartados: Set<string>): Nodo[][] {
  const padre = nodos.map((_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  for (let i = 0; i < nodos.length; i++) {
    for (let j = i + 1; j < nodos.length; j++) {
      if (descartados.has(parAcomodado(normDe(nodos[i]), normDe(nodos[j])))) continue;
      if (seParecen(nodos[i], nodos[j])) padre[raiz(i)] = raiz(j);
    }
  }
  const grupos = new Map<number, Nodo[]>();
  nodos.forEach((n, i) => {
    const r = raiz(i);
    grupos.set(r, [...(grupos.get(r) || []), n]);
  });
  return [...grupos.values()]
    .filter((g) => g.length >= 2)
    .filter((g) => g.some((n) => n.tipo === 'suelto' || n.porRevisar))
    .map((g) => [...g].sort((a, b) => (a.tipo === b.tipo ? b.reportes - a.reportes : a.tipo === 'cliente' ? -1 : 1)));
}

// Pares a guardar cuando un supervisor dice «No son el mismo».
export function paresDelGrupo(grupo: Nodo[]): { a_norm: string; b_norm: string }[] {
  const pares: { a_norm: string; b_norm: string }[] = [];
  for (let i = 0; i < grupo.length; i++) {
    for (let j = i + 1; j < grupo.length; j++) {
      const [a, b] = parAcomodado(normDe(grupo[i]), normDe(grupo[j])).split('|');
      pares.push({ a_norm: a, b_norm: b });
    }
  }
  return pares;
}

export function claveDescartado(a: string, b: string): string {
  return parAcomodado(a, b);
}
