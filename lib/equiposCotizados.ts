// Equipos cotizados para el cliente del reporte (patch_equipos_cotizados.sql):
// en «Montaje de equipo», al escribir «inversor», se sugiere el que se cotizó
// y al elegirlo se llenan modelo, marca, descripción y foto. Se guarda una
// copia por cliente en el teléfono porque en campo muchas veces no hay señal.
// La parte pura se prueba en lib/equiposCotizados.test.ts.

import { coincideBusqueda } from './busqueda';

export type EquipoCotizado = {
  descripcion: string;
  cantidad: number | null;
  unidad: string | null;
  modelo: string | null;
  marca: string | null;
  enlace: string | null;
  foto: string | null;
  folio: string;
  estado: string;
};

// Mano de obra, consumibles y servicios no son equipo que se monte.
const NO_ES_EQUIPO = /^(mano de obra|instalaci[oó]n|consumibles?|programaci[oó]n|servicio|vi[aá]ticos|flete|mantenimiento|capacitaci[oó]n|configuraci[oó]n|puesta en)/i;

export function esEquipo(e: EquipoCotizado): boolean {
  return !NO_ES_EQUIPO.test(e.descripcion.trim());
}

// Los que coinciden con lo escrito; con el campo vacío, todos (lo cotizado
// para ese cliente es poco). Sin repetir el mismo equipo de dos cotizaciones.
export function filtrarCotizados(lista: EquipoCotizado[], texto: string, cuantos = 8): EquipoCotizado[] {
  const q = texto.trim();
  const vistos = new Set<string>();
  const salida: EquipoCotizado[] = [];
  for (const e of lista) {
    if (!esEquipo(e)) continue;
    if (q && !coincideBusqueda(`${e.descripcion} ${e.modelo || ''} ${e.marca || ''}`, q)) continue;
    const clave = (e.modelo || e.descripcion).trim().toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(e);
    if (salida.length >= cuantos) break;
  }
  return salida;
}

// «(6 Unidades)» y cosas así no van en la descripción del reporte.
export function descripcionDeCotizado(descripcion: string): string {
  return descripcion.split('\n')[0].replace(/\((\d+\s*)?(unidades?|piezas?|pzas?|paquetes?|metros|mts?)\)/gi, '').replace(/\s+/g, ' ').trim();
}

// ---------- Datos (navegador) ----------

const claveCopia = (clienteId: string) => `equiposCotizados:${clienteId}`;

function leerCopia(clienteId: string): EquipoCotizado[] {
  try {
    const texto = localStorage.getItem(claveCopia(clienteId));
    const lista = texto ? JSON.parse(texto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    // Copia dañada o sin acceso: se trabaja sin ella.
    return [];
  }
}

// Primero la copia del teléfono y, si hay red, la lista fresca.
export async function cargarEquiposCotizados(clienteId: string, alTener: (lista: EquipoCotizado[]) => void): Promise<void> {
  const copia = leerCopia(clienteId);
  if (copia.length > 0) alTener(copia);
  const { createClient } = await import('./supabaseClient');
  const { data, error } = await createClient().rpc('equipos_cotizados_del_cliente', { p_cliente: clienteId });
  if (error) {
    // Sin señal o falta el SQL: se queda la copia (las sugerencias son ayuda, no bloquean el reporte).
    console.warn('[equipos] No se pudieron cargar los equipos cotizados:', error.message);
    return;
  }
  const lista = (Array.isArray(data) ? data : []) as EquipoCotizado[];
  try {
    localStorage.setItem(claveCopia(clienteId), JSON.stringify(lista));
  } catch {
    // Sin espacio: la lista sigue en memoria.
  }
  alTener(lista);
}
