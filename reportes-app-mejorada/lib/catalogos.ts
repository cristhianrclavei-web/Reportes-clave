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

const CACHE_VEHICULOS = 'catalogoVehiculos';
const CACHE_PERSONAL = 'catalogoPersonal';

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
  return leerCache<Vehiculo>(CACHE_VEHICULOS);
}

export function personalEnCache(): Persona[] {
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
