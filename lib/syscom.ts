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
function imagenDe(p: any): string | null {
  const candidatas: unknown[] = [p.img_portada, p.imagen];
  if (Array.isArray(p.imagenes) && p.imagenes.length > 0) {
    const primera = p.imagenes[0];
    candidatas.push(typeof primera === 'string' ? primera : primera?.imagen || primera?.url);
  }
  for (const c of candidatas) {
    if (typeof c !== 'string') continue;
    const url = c.trim().replace(/^http:\/\//i, 'https://');
    if (/^https:\/\//i.test(url)) return url;
  }
  return null;
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
  };
}

// Deja en el registro de Vercel qué campos trajo el primer producto (solo
// nombres y tipos, sin valores), para ajustar si SYSCOM cambia su formato.
function registrarFormato(p: any) {
  const tipos = (o: any) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Array.isArray(v) ? 'array' : typeof v]));
  console.log('[syscom] campos del producto:', JSON.stringify({ producto: tipos(p), precios: tipos(p?.precios), existencia: tipos(p?.existencia) }));
}

// Búsqueda de texto libre, la que usa el buscador dentro de una cotización.
export async function buscarProductosSyscom(busqueda: string, limit = 20): Promise<ProductoSyscom[]> {
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
  return lista.map(normalizarProducto);
}

export async function obtenerProductoSyscom(id: number): Promise<ProductoSyscom | null> {
  const datos = await llamarSyscom(`/productos/${id}`, { moneda: 'MXN', iva: false, inventarios: true });
  if (!datos) return null;
  return normalizarProducto(Array.isArray(datos) ? datos[0] : datos);
}
