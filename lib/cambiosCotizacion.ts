// Describe en palabras qué cambió al editar una cotización, para el historial
// de cambios (tabla cotizacion_cambios, supabase/patch_cotizacion_cambios.sql)
// y para el aviso a quien pidió la aprobación.
//
// Al guardar, las partidas se borran y se vuelven a crear (con ids nuevos),
// así que se emparejan por sistema + descripción. Si se cambia la descripción
// de una partida, sale como «Quitó» la vieja y «Agregó» la nueva.

type Encabezado = {
  titulo_proyecto?: string | null;
  empresa: string;
  atencion: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  forma_pago: string;
  tiempo_entrega: string;
  garantia: string;
  vigencia_dias: number;
  notas: string | null;
  moneda: string;
  iva_pct: number;
  iva_incluido?: boolean;
  total: number;
};

type Partida = {
  sistema: string;
  titulo_sistema?: string | null;
  opcional?: boolean;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
};

const CAMPOS: { campo: keyof Encabezado; nombre: string }[] = [
  { campo: 'titulo_proyecto', nombre: 'Proyecto' },
  { campo: 'empresa', nombre: 'Empresa' },
  { campo: 'atencion', nombre: 'Atención' },
  { campo: 'telefono', nombre: 'Teléfono' },
  { campo: 'correo', nombre: 'Correo' },
  { campo: 'direccion', nombre: 'Dirección' },
  { campo: 'forma_pago', nombre: 'Forma de pago' },
  { campo: 'tiempo_entrega', nombre: 'Tiempo de entrega' },
  { campo: 'garantia', nombre: 'Garantía' },
  { campo: 'vigencia_dias', nombre: 'Vigencia (días)' },
  { campo: 'notas', nombre: 'Notas' },
  { campo: 'moneda', nombre: 'Moneda' },
  { campo: 'iva_pct', nombre: 'IVA %' },
];

function dinero(n: number): string {
  return '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined || String(valor).trim() === '') return '(vacío)';
  const limpio = String(valor).trim();
  return limpio.length > 60 ? limpio.slice(0, 57) + '…' : limpio;
}

function clave(p: Partida): string {
  return `${p.sistema.trim().toLowerCase()}|${p.descripcion.trim().toLowerCase()}`;
}

function nombrePartida(p: Partida): string {
  return texto(p.descripcion);
}

// Nombre del proyecto de cada sistema que sigue existiendo y cambió.
function describirTitulosDeSistema(antes: Partida[], despues: Partida[]): string[] {
  const titulos = (lineas: Partida[]) => {
    const porSistema = new Map<string, string>();
    for (const l of lineas) {
      const sistema = l.sistema.trim();
      if (!porSistema.get(sistema)) porSistema.set(sistema, (l.titulo_sistema || '').trim());
    }
    return porSistema;
  };
  const viejos = titulos(antes);
  const cambios: string[] = [];
  for (const [sistema, nuevo] of titulos(despues)) {
    if (!viejos.has(sistema)) continue;
    const viejo = viejos.get(sistema) || '';
    if (viejo !== nuevo) cambios.push(`Título de ${sistema}: ${texto(viejo)} → ${texto(nuevo)}`);
  }
  return cambios;
}

function describirPartidas(antes: Partida[], despues: Partida[]): string[] {
  const cambios: string[] = [];

  // Agrupar las de antes por clave; si se repite la misma descripción, se
  // emparejan en orden.
  const pendientes = new Map<string, Partida[]>();
  for (const p of antes) {
    const lista = pendientes.get(clave(p)) || [];
    lista.push(p);
    pendientes.set(clave(p), lista);
  }

  for (const nueva of despues) {
    const lista = pendientes.get(clave(nueva));
    const vieja = lista && lista.length > 0 ? lista.shift() : undefined;
    if (!vieja) {
      cambios.push(`Agregó: ${nombrePartida(nueva)} (${nueva.cantidad} ${nueva.unidad}, ${dinero(nueva.precio_unitario)} c/u)`);
      continue;
    }
    const detalles: string[] = [];
    if (Number(vieja.cantidad) !== Number(nueva.cantidad)) detalles.push(`cantidad ${vieja.cantidad} → ${nueva.cantidad}`);
    if (vieja.unidad !== nueva.unidad) detalles.push(`unidad ${vieja.unidad} → ${nueva.unidad}`);
    if (Math.abs(Number(vieja.precio_unitario) - Number(nueva.precio_unitario)) >= 0.005) {
      detalles.push(`precio ${dinero(vieja.precio_unitario)} → ${dinero(nueva.precio_unitario)}`);
    }
    if (Boolean(vieja.opcional) !== Boolean(nueva.opcional)) detalles.push(nueva.opcional ? 'ahora es opcional (no suma)' : 'ya no es opcional (suma al total)');
    if (detalles.length > 0) cambios.push(`Cambió ${nombrePartida(nueva)}: ${detalles.join(', ')}`);
  }

  for (const lista of pendientes.values()) {
    for (const vieja of lista) cambios.push(`Quitó: ${nombrePartida(vieja)} (${vieja.cantidad} ${vieja.unidad})`);
  }
  return cambios;
}

export function describirCambiosCotizacion(
  antes: { cotizacion: Encabezado; lineas: Partida[] },
  despues: { cotizacion: Encabezado; lineas: Partida[] },
): string[] {
  const cambios: string[] = [];

  for (const { campo, nombre } of CAMPOS) {
    const viejo = texto(antes.cotizacion[campo]);
    const nuevo = texto(despues.cotizacion[campo]);
    if (viejo !== nuevo) cambios.push(`${nombre}: ${viejo} → ${nuevo}`);
  }
  if (Boolean(antes.cotizacion.iva_incluido) !== Boolean(despues.cotizacion.iva_incluido)) {
    cambios.push(despues.cotizacion.iva_incluido ? 'Precios ahora con IVA incluido' : 'Precios ahora sin IVA incluido');
  }

  cambios.push(...describirTitulosDeSistema(antes.lineas, despues.lineas));
  cambios.push(...describirPartidas(antes.lineas, despues.lineas));

  if (Math.abs(Number(antes.cotizacion.total) - Number(despues.cotizacion.total)) >= 0.005) {
    cambios.push(`Total: ${dinero(antes.cotizacion.total)} → ${dinero(despues.cotizacion.total)}`);
  }
  return cambios;
}

// El aviso cabe en la pantalla de bloqueo: los primeros cambios y cuántos más.
export function textoAvisoAprobacion(aprobador: string, empresa: string, cambios: string[]): string {
  if (cambios.length === 0) return `${aprobador} aprobó en la app la cotización de ${empresa}.`;
  const primeros = cambios.slice(0, 2).join('; ');
  const resto = cambios.length > 2 ? ` y ${cambios.length - 2} cambio(s) más (ver historial)` : '';
  return `${aprobador} la editó y aprobó (${empresa}): ${primeros}${resto}.`;
}
