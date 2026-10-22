// Cola de puntos de ubicación del teléfono de la empresa (app de Android).
// Los puntos se guardan en el teléfono hasta que la base confirma que los
// recibió: sin señal se juntan y se mandan después. Lógica pura, sin
// navegador, para poder probarla.

export type PuntoUbicacion = {
  // De quién es el punto: si en el teléfono se cambia de cuenta, lo que
  // quedó pendiente de la anterior no se manda con la sesión de la nueva.
  usuario: string;
  registrado_en: string; // ISO
  lat: number;
  lng: number;
  precision_m: number | null;
  velocidad_ms: number | null;
};

// Un punto por minuto. Se acepta desde los 55 s para no perder el minuto si
// el GPS entrega un poco antes.
export const SEPARACION_MINIMA_MS = 55 * 1000;
// Un día completo de puntos por minuto, de sobra. Si el teléfono pasa más
// tiempo sin señal se descartan los más viejos para no llenar la memoria.
export const MAXIMO_EN_COLA = 1500;
// Lo que se manda a la base en cada envío (la función acepta hasta 500).
export const POR_ENVIO = 300;

export function tocaGuardar(ultimoGuardadoMs: number | null, ahoraMs: number): boolean {
  if (ultimoGuardadoMs === null) return true;
  return ahoraMs - ultimoGuardadoMs >= SEPARACION_MINIMA_MS;
}

export function agregarACola(cola: PuntoUbicacion[], punto: PuntoUbicacion): PuntoUbicacion[] {
  const nueva = [...cola, punto];
  if (nueva.length <= MAXIMO_EN_COLA) return nueva;
  return nueva.slice(nueva.length - MAXIMO_EN_COLA);
}

// Lo que toca mandar con la sesión de `usuario`: solo sus puntos.
export function loteDe(cola: PuntoUbicacion[], usuario: string): PuntoUbicacion[] {
  return cola.filter((p) => p.usuario === usuario).slice(0, POR_ENVIO);
}

// Quita de la cola los puntos que la base ya confirmó.
export function quitarEnviados(cola: PuntoUbicacion[], enviados: PuntoUbicacion[]): PuntoUbicacion[] {
  const clave = (p: PuntoUbicacion) => `${p.usuario}|${p.registrado_en}`;
  const yaEnviados = new Set(enviados.map(clave));
  return cola.filter((p) => !yaEnviados.has(clave(p)));
}

// Lee la cola guardada; si está dañada empieza vacía en vez de fallar.
export function leerCola(texto: string | null): PuntoUbicacion[] {
  if (!texto) return [];
  try {
    const datos = JSON.parse(texto);
    if (!Array.isArray(datos)) return [];
    // Un punto sin dueño (de una versión anterior) no se puede mandar.
    return datos.filter((p) => typeof p?.usuario === 'string' && typeof p?.lat === 'number' && typeof p?.lng === 'number' && typeof p?.registrado_en === 'string');
  } catch {
    return [];
  }
}
