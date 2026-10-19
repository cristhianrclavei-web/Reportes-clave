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
