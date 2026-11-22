'use client';

import { createClient } from './supabaseClient';
import { reducirFoto } from './reducirFoto';
import { mensajeProyecto } from './proyectos';
import {
  datosSolarVacios, tramiteVacio,
  type DatosSolar, type EntradaBitacora, type EstadoTramite, type PagoProyecto, type ReciboCfe, type TramiteCfe,
} from './solar';

// Datos del sistema solar de un proyecto (patch_proyectos_centro.sql):
// servicio de CFE, recibos, dimensionamiento, trámite de interconexión con
// su expediente y pagos. Los archivos van al bucket privado
// «proyectos-documentos», en la carpeta del proyecto.

const BUCKET = 'proyectos-documentos';
const MAX_ARCHIVO = 15 * 1024 * 1024;

function error(e: { message?: string } | null, accion: string): Error {
  return new Error(mensajeProyecto(e, accion));
}

async function subirArchivo(proyectoId: string, carpeta: string, archivo: File): Promise<{ path: string; nombre: string }> {
  if (archivo.size > MAX_ARCHIVO) throw new Error('El archivo pesa más de 15 MB. Mándalo en PDF más ligero o como foto.');
  // Las fotos se reducen; los PDF se suben tal cual.
  const listo = archivo.type.startsWith('image/') ? await reducirFoto(archivo) : archivo;
  const ext = (archivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${proyectoId}/${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: e } = await createClient().storage.from(BUCKET).upload(path, listo, { contentType: listo.type || 'application/octet-stream' });
  if (e) throw new Error(`No se pudo subir el archivo: ${e.message}. Revisa tu señal e intenta de nuevo.`);
  return { path, nombre: archivo.name };
}

async function borrarArchivo(path: string | null) {
  if (!path) return;
  const { error: e } = await createClient().storage.from(BUCKET).remove([path]);
  // El registro ya se borró: un archivo huérfano no le estorba a nadie.
  if (e) console.error('[solarDatos] no se pudo borrar el archivo', path, e.message);
}

export async function urlArchivo(path: string): Promise<string> {
  const { data, error: e } = await createClient().storage.from(BUCKET).createSignedUrl(path, 3600);
  if (e || !data) throw new Error('No se pudo abrir el archivo. Intenta de nuevo.');
  return data.signedUrl;
}

// ---------- Todo lo solar de un proyecto ----------

export type TodoSolar = {
  datos: DatosSolar;
  recibos: ReciboCfe[];
  tramite: TramiteCfe;
  documentos: { id: string; tipo: string; archivo_path: string; archivo_nombre: string | null; creado_en: string }[];
  pagos: PagoProyecto[];
};

export async function leerSolar(proyectoId: string): Promise<TodoSolar> {
  const s = createClient();
  const [d, r, t, docs, p] = await Promise.all([
    s.from('proyecto_solar').select('*').eq('proyecto_id', proyectoId).maybeSingle(),
    s.from('recibos_cfe').select('*').eq('proyecto_id', proyectoId).order('fecha_inicio', { ascending: true, nullsFirst: true }).order('creado_en'),
    s.from('tramites_cfe').select('*').eq('proyecto_id', proyectoId).maybeSingle(),
    s.from('tramite_cfe_documentos').select('id, tipo, archivo_path, archivo_nombre, creado_en').eq('proyecto_id', proyectoId).order('creado_en'),
    s.from('proyecto_pagos').select('*').eq('proyecto_id', proyectoId).order('fecha').order('creado_en'),
  ]);
  for (const [res, nombre] of [[d, 'los datos solares'], [r, 'los recibos'], [t, 'el trámite'], [docs, 'el expediente'], [p, 'los pagos']] as const) {
    if (res.error) throw error(res.error, `cargar ${nombre}`);
  }
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    datos: d.data ? { ...datosSolarVacios(proyectoId), ...d.data, hsp: Number(d.data.hsp), factor_perdidas: Number(d.data.factor_perdidas), modulo_w: num(d.data.modulo_w), cobertura_pct: Number(d.data.cobertura_pct), costo_sistema: num(d.data.costo_sistema) } : datosSolarVacios(proyectoId),
    recibos: (r.data || []).map((x: any) => ({ ...x, kwh: Number(x.kwh), importe: Number(x.importe), precio_kwh_manual: num(x.precio_kwh_manual) })),
    tramite: t.data ? { ...tramiteVacio(proyectoId), ...t.data, bitacora: Array.isArray(t.data.bitacora) ? t.data.bitacora : [] } : tramiteVacio(proyectoId),
    documentos: docs.data || [],
    pagos: (p.data || []).map((x: any) => ({ ...x, monto: Number(x.monto) })),
  };
}

export async function guardarDatosSolar(datos: DatosSolar): Promise<void> {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  const { actualizado_en: _ignorado, ...fila } = datos;
  void _ignorado;
  const { error: e } = await s.from('proyecto_solar').upsert({ ...fila, actualizado_por: user?.id || null, actualizado_en: new Date().toISOString() });
  if (e) throw error(e, 'guardar los datos solares');
}

// ---------- Recibos ----------

export type NuevoRecibo = { periodo: string; fecha_inicio: string | null; fecha_fin: string | null; kwh: number; importe: number; precio_kwh_manual: number | null };

export function validarRecibo(r: NuevoRecibo): Partial<Record<'periodo' | 'kwh' | 'importe' | 'fechas' | 'precio', string>> {
  const e: Partial<Record<'periodo' | 'kwh' | 'importe' | 'fechas' | 'precio', string>> = {};
  if (!r.periodo.trim()) e.periodo = 'Escribe el periodo, p. ej. «Ene–Feb 2026».';
  if (!Number.isFinite(r.kwh) || r.kwh <= 0) e.kwh = 'Escribe los kWh que marca el recibo.';
  if (!Number.isFinite(r.importe) || r.importe < 0) e.importe = 'Escribe el importe del recibo.';
  if (r.fecha_inicio && r.fecha_fin && r.fecha_fin < r.fecha_inicio) e.fechas = 'La fecha final no puede ser antes de la inicial.';
  if (r.precio_kwh_manual !== null && (!Number.isFinite(r.precio_kwh_manual) || r.precio_kwh_manual <= 0)) e.precio = 'Escribe un precio válido o déjalo vacío.';
  return e;
}

export async function agregarRecibo(proyectoId: string, r: NuevoRecibo, archivo: File | null): Promise<void> {
  const primero = Object.values(validarRecibo(r))[0];
  if (primero) throw new Error(primero);
  const subido = archivo ? await subirArchivo(proyectoId, 'recibos', archivo) : null;
  const { error: e } = await createClient().from('recibos_cfe').insert({
    proyecto_id: proyectoId, ...r, periodo: r.periodo.trim(), archivo_path: subido?.path || null, archivo_nombre: subido?.nombre || null,
  });
  if (e) {
    await borrarArchivo(subido?.path || null);
    throw error(e, 'guardar el recibo');
  }
}

export async function borrarRecibo(r: Pick<ReciboCfe, 'id' | 'archivo_path'>): Promise<void> {
  const { error: e } = await createClient().from('recibos_cfe').delete().eq('id', r.id);
  if (e) throw error(e, 'borrar el recibo');
  await borrarArchivo(r.archivo_path);
}

// ---------- Trámite ----------

export async function guardarTramite(t: TramiteCfe): Promise<void> {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  const { actualizado_en: _ignorado, ...fila } = t;
  void _ignorado;
  const { error: e } = await s.from('tramites_cfe').upsert({ ...fila, actualizado_por: user?.id || null, actualizado_en: new Date().toISOString() });
  if (e) throw error(e, 'guardar el trámite');
}

export function nuevaEntrada(por: string, texto: string, estado?: EstadoTramite): EntradaBitacora {
  return { en: new Date().toISOString(), por, texto: texto.trim(), ...(estado ? { estado } : {}) };
}

export async function subirDocumentoTramite(proyectoId: string, tipo: string, archivo: File): Promise<void> {
  const subido = await subirArchivo(proyectoId, 'tramite-cfe', archivo);
  const { error: e } = await createClient().from('tramite_cfe_documentos').insert({ proyecto_id: proyectoId, tipo, archivo_path: subido.path, archivo_nombre: subido.nombre });
  if (e) {
    await borrarArchivo(subido.path);
    throw error(e, 'guardar el documento');
  }
}

export async function borrarDocumentoTramite(d: { id: string; archivo_path: string }): Promise<void> {
  const { error: e } = await createClient().from('tramite_cfe_documentos').delete().eq('id', d.id);
  if (e) throw error(e, 'borrar el documento');
  await borrarArchivo(d.archivo_path);
}

// ---------- Pagos ----------

export type NuevoPago = Pick<PagoProyecto, 'fecha' | 'monto' | 'moneda' | 'metodo' | 'concepto' | 'referencia'>;

export function validarPago(p: NuevoPago): Partial<Record<'fecha' | 'monto' | 'concepto', string>> {
  const e: Partial<Record<'fecha' | 'monto' | 'concepto', string>> = {};
  if (!p.fecha) e.fecha = 'Elige la fecha del pago.';
  if (!Number.isFinite(p.monto) || p.monto <= 0) e.monto = 'Escribe un monto mayor a cero.';
  if (!p.concepto.trim()) e.concepto = 'Escribe el concepto, p. ej. «Anticipo 50 %».';
  return e;
}

export async function listarPagos(proyectoId: string): Promise<PagoProyecto[]> {
  const { data, error: e } = await createClient().from('proyecto_pagos').select('*').eq('proyecto_id', proyectoId).order('fecha').order('creado_en');
  if (e) throw error(e, 'cargar los pagos');
  return (data || []).map((x: any) => ({ ...x, monto: Number(x.monto) }));
}

export async function agregarPago(proyectoId: string, p: NuevoPago, comprobante: File | null): Promise<void> {
  const primero = Object.values(validarPago(p))[0];
  if (primero) throw new Error(primero);
  const subido = comprobante ? await subirArchivo(proyectoId, 'pagos', comprobante) : null;
  const { error: e } = await createClient().from('proyecto_pagos').insert({
    proyecto_id: proyectoId, ...p, concepto: p.concepto.trim(), referencia: p.referencia?.trim() || null,
    comprobante_path: subido?.path || null, comprobante_nombre: subido?.nombre || null,
  });
  if (e) {
    await borrarArchivo(subido?.path || null);
    throw error(e, 'guardar el pago');
  }
}

export async function borrarPago(p: Pick<PagoProyecto, 'id' | 'comprobante_path'>): Promise<void> {
  const { error: e } = await createClient().from('proyecto_pagos').delete().eq('id', p.id);
  if (e) throw error(e, 'borrar el pago');
  await borrarArchivo(p.comprobante_path);
}
