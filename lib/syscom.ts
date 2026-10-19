// Cliente de la API de SYSCOM (developers.syscom.mx/api/v1). SOLO se importa
// desde código de servidor (route handlers) — el client_secret nunca debe
// llegar al navegador, por eso las variables no llevan prefijo NEXT_PUBLIC_.
// Ver app/api/syscom/productos/route.ts para el único punto de entrada que
// el cliente sí puede llamar.
//
// Auth: OAuth2 client_credentials. El token dura 365 días (lo dice la propia
// documentación de SYSCOM), así que se cachea en memoria del proceso en vez
// de pedirlo en cada búsqueda — solo se renueva si expiró o si nunca se pidió.

import { fetch as fetchUndici, ProxyAgent } from 'undici';

const BASE_URL = 'https://developers.syscom.mx/api/v1';

// SYSCOM solo acepta peticiones desde IPs autorizadas y Vercel no tiene IP
// fija: si existe FIXIE_URL, las llamadas a SYSCOM (y solo esas) salen por el
// proxy de Fixie, que sí tiene IPs fijas. El resto de la app no pasa por ahí
// para no gastar el cupo mensual de Fixie. Sin la variable, van directo.
let proxyFixie: ProxyAgent | null = null;
function fetchSyscom(url: string, opciones: { method?: string; headers?: Record<string, string>; body?: URLSearchParams }) {
  const urlProxy = process.env.FIXIE_URL;
  if (!urlProxy) return fetchUndici(url, opciones);
  if (!proxyFixie) proxyFixie = new ProxyAgent(urlProxy);
  return fetchUndici(url, { ...opciones, dispatcher: proxyFixie });
}

export type ProductoSyscom = {
  id: number;
  titulo: string;
  modelo: string | null;
  marca: string | null;
  precio: number | null;
  moneda: string | null;
  existencia: number | null;
  imagen: string | null;
  // Página del producto en syscom.mx (ficha completa).
  link: string | null;
};

// Lo que se ve en «Ver ficha» sin salir de la app.
export type FichaSyscom = ProductoSyscom & {
  imagenes: string[];
  caracteristicas: string[];
  descripcion: string;
  garantia: string | null;
  recursos: { nombre: string; url: string }[];
};

let tokenCache: { token: string; expiraEn: number } | null = null;

export function syscomConfigurado(): boolean {
  return !!(process.env.SYSCOM_CLIENT_ID && process.env.SYSCOM_CLIENT_SECRET);
}

async function obtenerToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiraEn) return tokenCache.token;

  const clientId = process.env.SYSCOM_CLIENT_ID;
  const clientSecret = process.env.SYSCOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Faltan SYSCOM_CLIENT_ID / SYSCOM_CLIENT_SECRET.');
  }

  const respuesta = await fetchSyscom(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!respuesta.ok) {
    throw new Error(`SYSCOM rechazó las credenciales (HTTP ${respuesta.status}).`);
  }
  const datos: any = await respuesta.json();
  if (!datos.access_token) throw new Error('SYSCOM no devolvió un access_token.');

  // Se resta un margen (1 día) a la expiración real para nunca usar un token
  // que caduque a medio vuelo de una petición.
  const expiraEn = Date.now() + Math.max(0, (datos.expires_in || 0) - 86400) * 1000;
  tokenCache = { token: datos.access_token, expiraEn };
  return tokenCache.token;
}

async function llamarSyscom(ruta: string, params: Record<string, string | boolean | number | undefined>) {
  const token = await obtenerToken();
  const url = new URL(`${BASE_URL}${ruta}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  });

  const respuesta = await fetchSyscom(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (respuesta.status === 429) {
    throw new Error('SYSCOM está limitando las peticiones por ahora — intenta de nuevo en un momento.');
  }
  if (!respuesta.ok) {
    throw new Error(`SYSCOM devolvió un error (HTTP ${respuesta.status}).`);
  }
  return (await respuesta.json()) as any;
}

// La API puede traer el nombre bajo "titulo" o "nombre" según el endpoint, y
// la existencia como número plano o como objeto con detalle por sucursal —
// esto normaliza ambos casos en vez de asumir una sola forma exacta, porque
// no hay manera de confirmarlo sin una cuenta real todavía.
//
// Con la cuenta real se vio que precio, existencia e imagen no venían como
// se supuso: SYSCOM manda los precios dentro de «precios» y como texto
// ("1234.56"), y la existencia en «total_existencia».

// Convierte "1,234.56" o 1234.56 a número; null si no es un número > 0.
function aNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return valor > 0 ? valor : null;
  if (typeof valor !== 'string') return null;
  const n = Number(valor.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// El costo para Clave: el precio con su descuento de distribuidor; si no
// viene, el especial, el precio 1 o el de lista, en ese orden.
function precioDe(p: any): number | null {
  const fuentes = [p.precios, p.precio].filter((f) => f && typeof f === 'object');
  const nombres = ['precio_descuento', 'precio_especial', 'precio_1', 'precio_lista'];
  for (const fuente of fuentes) {
    for (const nombre of nombres) {
      const n = aNumero(fuente[nombre]);
      if (n !== null) return n;
    }
  }
  return aNumero(p.precio);
}

function existenciaDe(p: any): number | null {
  if (p.total_existencia !== undefined && p.total_existencia !== null) {
    const n = Number(p.total_existencia);
    if (Number.isFinite(n)) return n;
  }
  if (typeof p.existencia === 'number') return p.existencia;
  if (p.existencia && typeof p.existencia === 'object') {
    const n = Number(p.existencia.nuevo ?? p.existencia.disponible ?? p.existencia.total);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Solo imágenes https (la CSP y el PDF no aceptan otras).
function aHttps(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const url = valor.trim().replace(/^http:\/\//i, 'https://');
  if (/^https:\/\//i.test(url)) return url;
  return null;
}

// SYSCOM manda las fotos en «imagenes»: cada una como texto o como objeto
// con la dirección en «imagen» (o url/path).
function imagenesDe(p: any): string[] {
  const lista: string[] = [];
  const portada = aHttps(p.img_portada) || aHttps(p.imagen);
  if (portada) lista.push(portada);
  if (Array.isArray(p.imagenes)) {
    for (const im of p.imagenes) {
      const url = typeof im === 'string' ? aHttps(im) : aHttps(im?.imagen) || aHttps(im?.url) || aHttps(im?.path);
      if (url && !lista.includes(url)) lista.push(url);
    }
  }
  return lista;
}

function imagenDe(p: any): string | null {
  return imagenesDe(p)[0] || null;
}

function linkDe(p: any): string | null {
  const link = aHttps(p.link);
  if (link) return link;
  const id = p.producto_id ?? p.id;
  if (!id) return null;
  return `https://www.syscom.mx/producto/${id}`;
}

// La descripción de SYSCOM viene en HTML; aquí se vuelve texto plano para
// no meter HTML de un tercero en la página.
export function htmlATexto(html: unknown): string {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function textosDe(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((x) => (typeof x === 'string' ? x : x?.caracteristica || x?.texto || x?.nombre || ''))
    .map((x) => htmlATexto(x))
    .filter((x) => x.length > 0);
}

function recursosDe(lista: unknown): { nombre: string; url: string }[] {
  if (!Array.isArray(lista)) return [];
  const recursos: { nombre: string; url: string }[] = [];
  for (const r of lista) {
    const url = aHttps(r?.path) || aHttps(r?.url) || aHttps(r?.link);
    if (url) recursos.push({ nombre: htmlATexto(r?.recurso || r?.nombre || 'Documento'), url });
  }
  return recursos;
}

export function normalizarProducto(p: any): ProductoSyscom {
  return {
    id: p.id ?? p.producto_id,
    titulo: p.titulo || p.nombre || '(sin título)',
    modelo: p.modelo || p.sku || null,
    marca: typeof p.marca === 'string' ? p.marca : p.marca?.nombre || null,
    precio: precioDe(p),
    moneda: p.moneda || p.precios?.moneda || 'MXN',
    existencia: existenciaDe(p),
    imagen: imagenDe(p),
    link: linkDe(p),
  };
}

export function normalizarFicha(p: any): FichaSyscom {
  return {
    ...normalizarProducto(p),
    imagenes: imagenesDe(p),
    caracteristicas: textosDe(p.caracteristicas),
    descripcion: htmlATexto(p.descripcion),
    garantia: typeof p.garantia === 'string' && p.garantia.trim() ? p.garantia.trim() : null,
    recursos: recursosDe(p.recursos),
  };
}

// Deja en el registro de Vercel qué campos trajo el primer producto (solo
// nombres y tipos, sin valores), para ajustar si SYSCOM cambia su formato.
function registrarFormato(p: any) {
  const tipos = (o: any) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Array.isArray(v) ? 'array' : typeof v]));
  const primero = (lista: any) => (Array.isArray(lista) && lista.length > 0 ? (typeof lista[0] === 'object' ? tipos(lista[0]) : typeof lista[0]) : null);
  console.log('[syscom] campos del producto:', JSON.stringify({
    producto: tipos(p), precios: tipos(p?.precios), imagen: primero(p?.imagenes),
    caracteristica: primero(p?.caracteristicas), recurso: primero(p?.recursos),
  }));
}

// Cada consulta a SYSCOM sale por Fixie, que tiene tope mensual (2,500 en
// el plan actual): las respuestas se guardan un rato en memoria para que
// repetir una búsqueda o abrir la misma ficha no gaste otra consulta.
// shortcut: la memoria es por instancia de Vercel y se pierde al
// redesplegar; si el cupo se queda corto, guardar en Supabase.
const MINUTOS_BUSQUEDA = 6 * 60;
const MINUTOS_FICHA = 24 * 60;
const recordadas = new Map<string, { valor: unknown; vence: number }>();

async function conMemoria<T>(clave: string, minutos: number, pedir: () => Promise<T>): Promise<T> {
  const guardada = recordadas.get(clave);
  if (guardada && guardada.vence > Date.now()) return guardada.valor as T;
  const valor = await pedir();
  if (recordadas.size > 500) recordadas.clear();
  recordadas.set(clave, { valor, vence: Date.now() + minutos * 60000 });
  return valor;
}

// Búsqueda de texto libre, la que usa el buscador dentro de una cotización.
export async function buscarProductosSyscom(busqueda: string, limit = 30): Promise<ProductoSyscom[]> {
  const clave = 'b:' + busqueda.trim().toLowerCase().replace(/\s+/g, ' ');
  return conMemoria(clave, MINUTOS_BUSQUEDA, () => buscarSinMemoria(busqueda, limit));
}

async function buscarSinMemoria(busqueda: string, limit: number): Promise<ProductoSyscom[]> {
  const datos = await llamarSyscom('/productos', {
    busqueda: busqueda.slice(0, 120),
    limit,
    moneda: 'MXN',
    iva: false,
    imagenes: true,
    inventarios: true,
  });
  const lista = Array.isArray(datos) ? datos : datos?.productos || [];
  if (lista.length > 0) registrarFormato(lista[0]);
  return ordenarPorParecido(lista.map(normalizarProducto), busqueda);
}

// Sin acentos ni mayúsculas, para comparar «camara» con «Cámara».
function simple(texto: string | null): string {
  return (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// La API de SYSCOM mezcla accesorios con lo buscado (al buscar «dvr» salen
// discos y baluns antes que los DVR). Como en syscom.mx, primero van los
// productos cuyo nombre o modelo trae las palabras buscadas. El orden de
// SYSCOM se respeta entre productos con el mismo puntaje.
export function ordenarPorParecido(productos: ProductoSyscom[], busqueda: string): ProductoSyscom[] {
  // «camaras» también encuentra «camara».
  const palabras = simple(busqueda)
    .split(/[^a-z0-9ñ-]+/)
    .filter((p) => p.length >= 2)
    .map((p) => (p.length > 4 ? p.replace(/(es|s)$/, '') : p));
  if (palabras.length === 0) return productos;

  function puntaje(p: ProductoSyscom): number {
    const titulo = simple(p.titulo);
    const modelo = simple(p.modelo);
    const marca = simple(p.marca);
    let total = 0;
    let todasEnTitulo = true;
    for (const palabra of palabras) {
      const enTitulo = titulo.includes(palabra);
      if (enTitulo) total += 3;
      else todasEnTitulo = false;
      if (titulo.startsWith(palabra)) total += 3;
      if (modelo.includes(palabra)) total += 4;
      if (marca.includes(palabra)) total += 1;
    }
    if (todasEnTitulo) total += 2;
    return total;
  }

  return productos
    .map((p, i) => ({ p, i, puntos: puntaje(p) }))
    .sort((a, b) => b.puntos - a.puntos || a.i - b.i)
    .map((x) => x.p);
}

// Ficha completa de un producto (descripción, características, fotos y
// documentos), para «Ver ficha» y para llenar el concepto desde un enlace.
export async function obtenerFichaSyscom(id: string): Promise<FichaSyscom | null> {
  return conMemoria('f:' + id, MINUTOS_FICHA, async () => {
    const datos = await llamarSyscom(`/productos/${encodeURIComponent(id)}`, { moneda: 'MXN', iva: false, inventarios: true });
    const producto = Array.isArray(datos) ? datos[0] : datos;
    if (!producto || typeof producto !== 'object') return null;
    registrarFormato(producto);
    return normalizarFicha(producto);
  });
}
