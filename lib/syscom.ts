// Cliente de la API de SYSCOM (developers.syscom.mx/api/v1). SOLO se importa
// desde código de servidor (route handlers) — el client_secret nunca debe
// llegar al navegador, por eso las variables no llevan prefijo NEXT_PUBLIC_.
// Ver app/api/syscom/productos/route.ts para el único punto de entrada que
// el cliente sí puede llamar.
//
// Auth: OAuth2 client_credentials. El token dura 365 días (lo dice la propia
// documentación de SYSCOM), así que se cachea en memoria del proceso en vez
// de pedirlo en cada búsqueda — solo se renueva si expiró o si nunca se pidió.

const BASE_URL = 'https://developers.syscom.mx/api/v1';

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

  const respuesta = await fetch(`${BASE_URL}/oauth/token`, {
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
  const datos = await respuesta.json();
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

  const respuesta = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (respuesta.status === 429) {
    throw new Error('SYSCOM está limitando las peticiones por ahora — intenta de nuevo en un momento.');
  }
  if (!respuesta.ok) {
    throw new Error(`SYSCOM devolvió un error (HTTP ${respuesta.status}).`);
  }
  return respuesta.json();
}

// La API puede traer el nombre bajo "titulo" o "nombre" según el endpoint, y
// la existencia como número plano o como objeto con detalle por sucursal —
// esto normaliza ambos casos en vez de asumir una sola forma exacta, porque
// no hay manera de confirmarlo sin una cuenta real todavía.
function normalizarProducto(p: any): ProductoSyscom {
  let existencia: number | null = null;
  if (typeof p.existencia === 'number') existencia = p.existencia;
  else if (p.existencia && typeof p.existencia === 'object') {
    existencia = p.existencia.disponible ?? p.existencia.total ?? null;
  }
  return {
    id: p.id ?? p.producto_id,
    titulo: p.titulo || p.nombre || '(sin título)',
    modelo: p.modelo || p.sku || null,
    marca: typeof p.marca === 'string' ? p.marca : p.marca?.nombre || null,
    precio: typeof p.precio === 'number' ? p.precio : p.precio?.precio_descuento ?? p.precio?.precio_lista ?? null,
    moneda: p.moneda || p.precio?.moneda || 'MXN',
    existencia,
    imagen: p.img_portada || p.imagen || null,
  };
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
  return lista.map(normalizarProducto);
}

export async function obtenerProductoSyscom(id: number): Promise<ProductoSyscom | null> {
  const datos = await llamarSyscom(`/productos/${id}`, { moneda: 'MXN', iva: false, inventarios: true });
  if (!datos) return null;
  return normalizarProducto(Array.isArray(datos) ? datos[0] : datos);
}
