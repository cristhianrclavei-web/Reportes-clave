import { createClient } from './supabaseClient';

// Catálogo de clientes para el autocompletado del campo «Empresa / Cliente».
// Solo nombres y alias (ver catalogo_clientes() en
// supabase/patch_clientes_vinculo_reportes.sql). Se guarda una copia local
// para que funcione sin conexión, igual que vehículos y personal.

export type ContactoCatalogo = { nombre: string; puesto: string | null };
export type ClienteCatalogo = { id: string; nombre: string; alias: string[]; contactos?: ContactoCatalogo[] };

const CACHE = 'catalogoClientes';

// Palabras que no distinguen a un cliente de otro: «Centro de Negocios del
// Ángel» y «Plaza del Ángel» se parecen por «angel», no por «del».
const VACIAS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a',
  'sa', 'cv', 'rl', 'sc', 'sapi', 'srl', 'the',
]);

export function normalizar(texto: string): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function palabras(texto: string): string[] {
  return normalizar(texto).split(' ').filter((p) => p && !VACIAS.has(p));
}

// Cliente cuyo nombre o alias es exactamente lo escrito (sin acentos ni
// mayúsculas). Es el que se vincula solo.
export function clienteExacto(texto: string, catalogo: ClienteCatalogo[]): ClienteCatalogo | null {
  const q = normalizar(texto);
  if (!q) return null;
  return catalogo.find((c) => normalizar(c.nombre) === q || c.alias.some((a) => normalizar(a) === q)) || null;
}

// Sugerencias mientras se escribe: alguna palabra del nombre o de un alias
// empieza con alguna palabra de lo escrito.
export function coincidencias(texto: string, catalogo: ClienteCatalogo[], max = 8): ClienteCatalogo[] {
  const qs = palabras(texto);
  if (qs.length === 0) return [];
  const puntua = (c: ClienteCatalogo) => {
    const todas = [c.nombre, ...c.alias].flatMap(palabras);
    return qs.filter((q) => todas.some((p) => p.startsWith(q))).length;
  };
  return catalogo
    .map((c) => ({ c, p: puntua(c) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.c.nombre.localeCompare(b.c.nombre))
    .slice(0, max)
    .map((x) => x.c);
}

// «¿Es alguno de estos?»: clientes que comparten alguna palabra significativa
// con lo escrito (completa o casi: «angel»/«angeles»). Se usa cuando no hay
// coincidencia exacta, para frenar duplicados antes de crearlos.
export function parecidos(texto: string, catalogo: ClienteCatalogo[], max = 3): ClienteCatalogo[] {
  const qs = palabras(texto).filter((p) => p.length >= 4);
  if (qs.length === 0) return [];
  const casi = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
  return catalogo
    .map((c) => {
      const todas = [c.nombre, ...c.alias].flatMap(palabras);
      const comunes = qs.filter((q) => todas.some((p) => casi(p, q))).length;
      return { c, comunes };
    })
    .filter((x) => x.comunes > 0)
    .sort((a, b) => b.comunes - a.comunes || a.c.nombre.localeCompare(b.c.nombre))
    .slice(0, max)
    .map((x) => x.c);
}

export function catalogoEnCache(): ClienteCatalogo[] {
  try {
    const crudo = localStorage.getItem(CACHE);
    return crudo ? (JSON.parse(crudo) as ClienteCatalogo[]) : [];
  } catch {
    return [];
  }
}

export async function listarCatalogoClientes(): Promise<ClienteCatalogo[]> {
  const { data, error } = await createClient().rpc('catalogo_clientes');
  if (error || !data) return catalogoEnCache();
  const lista = (data as any[]).map((r) => ({
    id: r.id as string,
    nombre: r.nombre as string,
    alias: (r.alias as string[]) || [],
    contactos: (r.contactos as ContactoCatalogo[]) || [],
  }));
  try { localStorage.setItem(CACHE, JSON.stringify(lista)); } catch { /* sin caché */ }
  return lista;
}

// Best-effort: si no hay conexión simplemente no se guarda el alias.
export async function agregarAliasCliente(clienteId: string, alias: string): Promise<void> {
  try {
    await createClient().rpc('agregar_alias_cliente', { p_cliente: clienteId, p_alias: alias });
  } catch {
    /* sin conexión */
  }
}
