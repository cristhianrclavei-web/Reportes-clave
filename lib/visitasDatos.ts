// Consultas del buscador de visitas (solo supervisión): lo registrado en la
// app (servicios y reportes), lo que dice el rastreo y la ubicación de los
// clientes. La lógica que cruza todo está en lib/visitas.ts.

import { createClient } from './supabaseClient';
import { RADIO_CLIENTE_M, type LugarConocido, type PuntoCompacto, type Registro, type VisitaGps } from './visitas';

export type UbicacionCliente = { lat: number; lng: number; direccion?: string };

function mensajeError(error: { message?: string } | null | undefined, accion: string): string {
  const texto = error?.message || '';
  if (/visitas_gps|puntos_de_tecnico|column .*(ubicacion|radio_m)|does not exist|schema cache/i.test(texto)) {
    return 'El buscador de visitas todavía no está activado: falta correr supabase/patch_busqueda_visitas.sql en la base.';
  }
  if (/row-level security|permission|unauthorized/i.test(texto)) return `No tienes permiso para ${accion}.`;
  if (/violates check constraint/i.test(texto)) return `No se pudo ${accion}: algún dato no es válido.`;
  if (/fetch|network|load failed|timeout/i.test(texto) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return `No se pudo ${accion}: sin conexión. Revisa tu señal e intenta de nuevo.`;
  }
  return `No se pudo ${accion}. ${texto}`.trim();
}

function esPunto(u: any): u is UbicacionCliente {
  return Boolean(u) && typeof u.lat === 'number' && typeof u.lng === 'number';
}

// ---------- Ubicación del cliente ----------

export async function ubicacionDeCliente(clienteId: string): Promise<{ ubicacion: UbicacionCliente | null; radio: number }> {
  const { data, error } = await createClient().from('clientes').select('ubicacion, radio_m').eq('id', clienteId).maybeSingle();
  if (error) throw new Error(mensajeError(error, 'leer la ubicación del cliente'));
  return { ubicacion: esPunto(data?.ubicacion) ? data!.ubicacion : null, radio: data?.radio_m || RADIO_CLIENTE_M };
}

export async function guardarUbicacionCliente(clienteId: string, ubicacion: UbicacionCliente | null, radio: number): Promise<void> {
  const { error } = await createClient().from('clientes').update({ ubicacion, radio_m: radio }).eq('id', clienteId);
  if (error) throw new Error(mensajeError(error, 'guardar la ubicación del cliente'));
}

// Todos los lugares donde se sabe que está un cliente: su ubicación y las de
// sus servicios agendados (así sirve aunque no se haya capturado en su ficha).
export async function lugaresConocidos(): Promise<LugarConocido[]> {
  const supabase = createClient();
  const [rClientes, rServicios] = await Promise.all([
    supabase.from('clientes').select('id, nombre, ubicacion, radio_m'),
    supabase.from('servicios_programados').select('cliente_id, ubicacion_programada, radio_geocerca_m').not('cliente_id', 'is', null).not('ubicacion_programada', 'is', null).limit(2000),
  ]);
  if (rClientes.error) throw new Error(mensajeError(rClientes.error, 'cargar las ubicaciones de los clientes'));
  if (rServicios.error) throw new Error(mensajeError(rServicios.error, 'cargar las ubicaciones de los servicios'));

  const nombres = new Map<string, string>();
  const lugares: LugarConocido[] = [];
  const vistos = new Set<string>();
  // Dos servicios en el mismo punto (a ~10 m) cuentan como un solo lugar.
  const agregar = (clienteId: string, u: UbicacionCliente, radio: number) => {
    const clave = `${clienteId}|${u.lat.toFixed(4)}|${u.lng.toFixed(4)}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    lugares.push({ clienteId, cliente: nombres.get(clienteId) || 'Cliente', lat: u.lat, lng: u.lng, radio });
  };
  for (const c of rClientes.data || []) {
    nombres.set(c.id, c.nombre);
    if (esPunto(c.ubicacion)) agregar(c.id, c.ubicacion, c.radio_m || RADIO_CLIENTE_M);
  }
  for (const s of rServicios.data || []) {
    // El radio del servicio (120 m) es para marcar la llegada; para buscar visitas se usa al menos el del cliente.
    if (esPunto(s.ubicacion_programada)) agregar(s.cliente_id, s.ubicacion_programada, Math.max(s.radio_geocerca_m || 0, RADIO_CLIENTE_M));
  }
  return lugares;
}

// ---------- Técnicos ----------

export type TecnicoBuscable = { id: string; nombre: string };

export async function tecnicosBuscables(): Promise<TecnicoBuscable[]> {
  const { data, error } = await createClient().from('profiles').select('id, full_name').eq('role', 'tecnico').order('full_name');
  if (error) throw new Error(mensajeError(error, 'cargar la lista de técnicos'));
  return (data || []).map((p) => ({ id: p.id, nombre: p.full_name || 'Sin nombre' }));
}

// ---------- Lo registrado ----------

// Servicios (no cancelados) y reportes de un cliente en el rango.
export async function registrosDeCliente(clienteId: string, cliente: string, desde: string, hasta: string): Promise<Registro[]> {
  const supabase = createClient();
  const [rServicios, rReportes] = await Promise.all([
    supabase.from('servicios_programados').select('id, fecha, servicio_tecnicos(tecnico_id)').eq('cliente_id', clienteId).neq('estado', 'cancelado').gte('fecha', desde).lte('fecha', hasta).limit(2000),
    supabase.from('reports').select('id, fecha, created_by').eq('cliente_id', clienteId).gte('fecha', desde).lte('fecha', hasta).limit(2000),
  ]);
  if (rServicios.error) throw new Error(mensajeError(rServicios.error, 'buscar los servicios del cliente'));
  if (rReportes.error) throw new Error(mensajeError(rReportes.error, 'buscar los reportes del cliente'));

  const registros: Registro[] = [];
  for (const s of (rServicios.data || []) as any[]) {
    for (const t of s.servicio_tecnicos || []) {
      registros.push({ tipo: 'servicio', id: s.id, fecha: s.fecha, tecnicoId: t.tecnico_id, clienteId, cliente });
    }
  }
  for (const r of rReportes.data || []) {
    registros.push({ tipo: 'reporte', id: r.id, fecha: r.fecha, tecnicoId: r.created_by, clienteId, cliente });
  }
  return registros;
}

// Servicios (no cancelados) y reportes de un técnico en el rango.
export async function registrosDeTecnico(tecnicoId: string, desde: string, hasta: string): Promise<Registro[]> {
  const supabase = createClient();
  const [rServicios, rReportes] = await Promise.all([
    supabase.from('servicio_tecnicos').select('servicios_programados!inner(id, fecha, proyecto, cliente_id, estado)').eq('tecnico_id', tecnicoId)
      .gte('servicios_programados.fecha', desde).lte('servicios_programados.fecha', hasta).neq('servicios_programados.estado', 'cancelado').limit(2000),
    supabase.from('reports').select('id, fecha, cliente_id, empresa_cliente').eq('created_by', tecnicoId).gte('fecha', desde).lte('fecha', hasta).limit(2000),
  ]);
  if (rServicios.error) throw new Error(mensajeError(rServicios.error, 'buscar los servicios del técnico'));
  if (rReportes.error) throw new Error(mensajeError(rReportes.error, 'buscar los reportes del técnico'));

  const registros: Registro[] = [];
  for (const fila of (rServicios.data || []) as any[]) {
    const s = fila.servicios_programados;
    if (s) registros.push({ tipo: 'servicio', id: s.id, fecha: s.fecha, tecnicoId, clienteId: s.cliente_id, cliente: s.proyecto || 'Servicio' });
  }
  for (const r of rReportes.data || []) {
    registros.push({ tipo: 'reporte', id: r.id, fecha: r.fecha, tecnicoId, clienteId: r.cliente_id, cliente: r.empresa_cliente || 'Reporte' });
  }
  return registros;
}

// ---------- Lo que dice el rastreo ----------

// Días en que algún técnico estuvo cerca de los lugares (los de un cliente).
export async function gpsEnLugares(lugares: LugarConocido[], desde: string, hasta: string): Promise<VisitaGps[]> {
  if (lugares.length === 0) return [];
  const p_lugares = lugares.map((l) => ({ lat: l.lat, lng: l.lng, radio: l.radio }));
  const { data, error } = await createClient().rpc('visitas_gps', { p_lugares, p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(mensajeError(error, 'consultar el rastreo'));
  return ((data || []) as any[]).map((v) => ({ tecnicoId: v.tecnico_id, fecha: v.fecha, llegada: v.llegada, salida: v.salida, minutos: v.minutos, sinSenal: v.sin_senal || 0 }));
}

// Recorrido compacto de un técnico (máximo 31 días).
export async function puntosDeTecnico(tecnicoId: string, desde: string, hasta: string): Promise<PuntoCompacto[]> {
  const { data, error } = await createClient().rpc('puntos_de_tecnico', { p_tecnico: tecnicoId, p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(mensajeError(error, 'consultar el rastreo del técnico'));
  return Array.isArray(data) ? (data as PuntoCompacto[]) : [];
}
