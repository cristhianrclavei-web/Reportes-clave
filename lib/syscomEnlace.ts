// Reconoce un enlace de syscom.mx y saca el número del producto. Se usa en
// el navegador (por eso no vive en lib/syscom.ts, que es solo del servidor).
// Formatos vistos: …/producto/ds-2cd1043g2-hikvision-213930.html,
// …/productosinfo/210684 y …/producto/213930.
export function idProductoDeEnlace(enlace: string): string | null {
  let url: URL;
  try {
    url = new URL(enlace.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)syscom\.mx$/i.test(url.hostname)) return null;
  const m = url.pathname.match(/(\d{3,})(?:\.html?)?\/?$/i);
  if (!m) return null;
  return m[1];
}

// La página de un producto por su número. OJO: syscom.mx/producto/<número>
// (sin el nombre) redirige a una página que no existe; /products/<número> sí abre.
export function enlaceDeProducto(id: string | number): string {
  return `https://www.syscom.mx/products/${id}`;
}

// Corrige los enlaces viejos con la forma que ya no abre (los que la app
// guardó antes en cotizaciones y reportes). Cualquier otro enlace queda igual.
export function arreglarEnlaceSyscom(enlace: string): string {
  let url: URL;
  try {
    url = new URL(enlace.trim());
  } catch {
    return enlace;
  }
  if (!/(^|\.)syscom\.mx$/i.test(url.hostname)) return enlace;
  const roto = url.pathname.match(/^\/(?:products\/+)?producto\/(\d+)\/?$/i);
  return roto ? enlaceDeProducto(roto[1]) : enlace;
}
