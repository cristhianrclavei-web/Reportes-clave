// Catálogo de Grupo Ascencio (proveedor de material eléctrico de Clave).
// Su tienda es WooCommerce y su «Store API» pública da los productos sin
// iniciar sesión. No es una API oficial para terceros: se usa solo para
// BUSCAR y llenar descripción, modelo (SKU), marca, foto y ficha técnica en
// las cotizaciones. El precio se captura a mano (casi ningún producto lo trae).
// shortcut: depende de un acceso público no documentado; si lo cierran, la
// búsqueda avisa el error y se cotiza a mano. Si Ascencio da lista de precios
// o API de clientes, cambiar a eso.

export const URL_ASCENCIO = 'https://grupoascencio.com.mx';

export type ProductoAscencio = {
  id: number;
  titulo: string;
  modelo: string;
  marca: string;
  imagen: string | null;
  // Página del producto en su tienda.
  link: string;
  // PDF de la ficha técnica, si la publican.
  ficha: string | null;
  descripcion: string;
};

type CategoriaWoo = { id: number; name: string; parent?: number };
type ProductoWoo = {
  id: number;
  name: string;
  sku?: string;
  permalink?: string;
  short_description?: string;
  description?: string;
  images?: { src?: string }[];
  categories?: CategoriaWoo[];
};

function sinHtml(texto: string): string {
  return texto
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

// La marca viene como una categoría hija de «MARCAS» (SIEMENS, SCHNEIDER…).
export function aProducto(p: ProductoWoo, idsMarcas: Set<number>): ProductoAscencio {
  const marca = (p.categories || []).find((c) => idsMarcas.has(c.id))?.name || '';
  const html = `${p.description || ''} ${p.short_description || ''}`;
  const ficha = /href="(https:\/\/[^"]+\.pdf)"/i.exec(html)?.[1] || null;
  const imagen = p.images?.[0]?.src || null;
  return {
    id: p.id,
    titulo: sinHtml(p.name || ''),
    modelo: (p.sku || '').trim(),
    marca,
    imagen: imagen && /^https:\/\//i.test(imagen) ? imagen : null,
    link: p.permalink || `${URL_ASCENCIO}/?p=${p.id}`,
    ficha,
    descripcion: sinHtml(p.short_description || '').slice(0, 400),
  };
}

export function idsDeMarcas(categorias: CategoriaWoo[]): Set<number> {
  const raiz = categorias.find((c) => c.name.trim().toUpperCase() === 'MARCAS' && !c.parent);
  if (!raiz) return new Set();
  return new Set(categorias.filter((c) => c.parent === raiz.id).map((c) => c.id));
}

async function pedir<T>(ruta: string): Promise<T> {
  const respuesta = await fetch(`${URL_ASCENCIO}/wp-json/wc/store/v1/${ruta}`, {
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/json' },
    // Las categorías cambian poco: una hora en caché; la búsqueda, 10 min.
    next: { revalidate: ruta.startsWith('products/categories') ? 3600 : 600 },
  });
  if (!respuesta.ok) throw new Error(`Grupo Ascencio respondió ${respuesta.status}`);
  return respuesta.json() as Promise<T>;
}

function normal(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Su tienda busca la FRASE completa («contactor siemens» no encuentra nada).
// Si la frase no trae resultados, se busca la palabra más larga y aquí se
// dejan solo los que tienen todas las palabras en nombre, modelo o marca.
export function conTodasLasPalabras(productos: ProductoAscencio[], q: string): ProductoAscencio[] {
  const palabras = normal(q).split(/\s+/).filter(Boolean);
  return productos.filter((p) => {
    const texto = normal(`${p.titulo} ${p.modelo} ${p.marca}`);
    return palabras.every((palabra) => texto.includes(palabra));
  });
}

export async function buscarProductosAscencio(q: string): Promise<ProductoAscencio[]> {
  const categorias = pedir<CategoriaWoo[]>('products/categories?per_page=100').catch(() => [] as CategoriaWoo[]);
  const frase = await pedir<ProductoWoo[]>(`products?search=${encodeURIComponent(q)}&per_page=20`);
  const marcas = idsDeMarcas(await categorias);
  const deFrase = (Array.isArray(frase) ? frase : []).map((p) => aProducto(p, marcas));
  const palabras = q.trim().split(/\s+/);
  if (deFrase.length > 0 || palabras.length < 2) return deFrase;

  const masLarga = [...palabras].sort((a, b) => b.length - a.length)[0];
  const amplios = await pedir<ProductoWoo[]>(`products?search=${encodeURIComponent(masLarga)}&per_page=100`);
  const todos = (Array.isArray(amplios) ? amplios : []).map((p) => aProducto(p, marcas));
  return conTodasLasPalabras(todos, q).slice(0, 20);
}
