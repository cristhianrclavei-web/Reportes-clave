// Catálogos que llenan listas del formulario de reporte.
//
// El formulario se usa en campo, muchas veces sin señal, así que ninguna de
// estas listas puede depender de que haya internet en ese momento: se guarda
// una copia local y se refresca cuando se puede. Es el mismo trato que ya se
// le da a los servicios asignados.
//
// Si nunca se pudo descargar (teléfono nuevo, primer uso sin señal), la lista
// sale vacía y los campos siguen aceptando texto libre. Nunca se bloquea la
// captura de un reporte por no tener el catálogo.

import { createClient } from './supabaseClient';

export type Vehiculo = { id: string; nombre: string; placas: string };
export type Persona = { id: string; full_name: string; role: string };

// La clave del cache lleva version. Cuando cambia la forma de los datos que
// devuelve el servidor, basta con subir el numero: la clave vieja deja de
// leerse y cada dispositivo vuelve a descargar sin que nadie tenga que
// limpiar nada a mano.
//
// v2: listar_personal devolvia la columna como "nombre" y la app espera
// "full_name". Los equipos que alcanzaron a guardar la forma vieja mostraban
// los nombres en blanco en los campos de autocompletado.
const CACHE_VEHICULOS = 'catalogoVehiculos_v2';
const CACHE_PERSONAL = 'catalogoPersonal_v2';

// Claves de versiones anteriores. Se borran al arrancar para no dejar
// basura ocupando espacio en equipos que ya venian usando la app.
const CACHES_OBSOLETOS = ['catalogoVehiculos', 'catalogoPersonal'];

function limpiarCachesObsoletos() {
  try {
    CACHES_OBSOLETOS.forEach((clave) => localStorage.removeItem(clave));
  } catch {
    /* modo privado o almacenamiento bloqueado: no es critico */
  }
}

function leerCache<T>(clave: string): T[] {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T[]) : [];
  } catch {
    return [];
  }
}

function guardarCache(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* almacenamiento lleno o modo privado: se sigue sin caché */
  }
}

export function vehiculosEnCache(): Vehiculo[] {
  limpiarCachesObsoletos();
  return leerCache<Vehiculo>(CACHE_VEHICULOS);
}

export function personalEnCache(): Persona[] {
  limpiarCachesObsoletos();
  return leerCache<Persona>(CACHE_PERSONAL);
}

export async function listarVehiculos(): Promise<Vehiculo[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('vehiculos')
    .select('id, nombre, placas')
    .eq('activo', true)
    .order('nombre');

  // Sin señal se responde con lo último que se alcanzó a guardar.
  if (error || !data) return vehiculosEnCache();

  guardarCache(CACHE_VEHICULOS, data);
  return data as Vehiculo[];
}

export async function listarPersonal(): Promise<Persona[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('listar_personal');

  if (error || !data) return personalEnCache();

  guardarCache(CACHE_PERSONAL, data);
  return data as Persona[];
}
