import { createClient } from './supabaseClient';

// Flujo: borrador -> (firma de aprobación interna) -> aprobada -> enviada.
// "rechazada" puede pasar en cualquier punto (se descarta la cotización).
// "Enviada" solo se puede marcar una vez que ya está aprobada — ver
// puedeMarcarEnviada().
export type EstadoCotizacion = 'borrador' | 'aprobada' | 'enviada' | 'rechazada';
export type MonedaCotizacion = 'MXN' | 'USD';
// 'desglose': cada partida muestra su propio precio unitario (como siempre).
// 'kit': el PDF no desglosa precio por partida — muestra un solo total por
// sección, centrado en la columna de precio unitario. No afecta cómo se
// captura la cotización, solo cómo se dibuja el PDF.
export type PresentacionPrecios = 'desglose' | 'kit';

export type LineaCotizacion = {
  id: string;
  cotizacion_id: string;
  sistema: string;
  orden: number;
  descripcion: string;
  unidad: string;
  cantidad: number;
  // Costo real y % de ganancia (0-100) usados para llegar a precio_unitario
  // (= costo * (1 + margen_pct/100)). Son el detalle interno de cómo se armó
  // el precio — nunca se muestran en el PDF que ve el cliente.
  costo: number;
  margen_pct: number;
  precio_unitario: number;
  importe: number;
};

export type Cotizacion = {
  id: string;
  folio: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  fecha: string;
  atencion: string | null;
  empresa: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  forma_pago: string;
  tiempo_entrega: string;
  garantia: string;
  vigencia_dias: number;
  notas: string | null;
  firmante_nombre: string | null;
  firmante_correo: string | null;
  iva_pct: number;
  moneda: MonedaCotizacion;
  presentacion_precios: PresentacionPrecios;
  // Tipo de cambio (MXN por 1 USD) usado al armar la cotización — solo
  // aplica/se usa cuando moneda es 'USD'. Se guarda el valor de ese momento
  // para que el equivalente en pesos no cambie después si la cotización se
  // vuelve a abrir con otro tipo de cambio del día.
  tipo_cambio: number;
  subtotal: number;
  iva: number;
  total: number;
  estado: EstadoCotizacion;
  // Firma de aprobación interna (quien revisa y aprueba antes de enviarla al
  // cliente) — no es la firma del cliente.
  aprobada_por: string | null;
  aprobada_firma: string | null;
  aprobada_en: string | null;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

// Una línea tal como la captura el formulario, antes de calcular su importe
// ni de existir en la base de datos. precio_unitario ya debe venir calculado
// (ver precioUnitarioDesdeCosto) — este módulo no lo recalcula, solo lo
// guarda y lo usa para el importe/los totales.
export type LineaInput = {
  sistema: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  costo: number;
  margen_pct: number;
  precio_unitario: number;
};

export type CotizacionInput = {
  fecha: string;
  atencion: string;
  empresa: string;
  telefono: string;
  correo: string;
  direccion: string;
  forma_pago: string;
  tiempo_entrega: string;
  garantia: string;
  vigencia_dias: number;
  notas: string;
  firmante_nombre: string;
  firmante_correo: string;
  iva_pct: number;
  moneda: MonedaCotizacion;
  presentacion_precios: PresentacionPrecios;
  tipo_cambio: number;
  lineas: LineaInput[];
};

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

// El precio que ve el cliente sale solo del costo + el margen que se le
// quiere dejar (0-100%): precio = costo + costo*margen% = costo*(1+margen/100).
// A 100% de margen el precio queda al doble del costo — sin discontinuidad
// en ningún punto del rango, a diferencia de calcularlo como % del precio
// de venta (que se indefine justo en 100%).
export function precioUnitarioDesdeCosto(costo: number, margenPct: number): number {
  return redondear((costo || 0) * (1 + (margenPct || 0) / 100));
}

// Pasa un costo de una moneda a otra con el tipo de cambio (MXN por 1 USD).
// Cambiar la moneda de una cotización ya capturada no debe dejar el mismo
// número con otra etiqueta: 1,000 USD no son 1,000 MXN.
export function convertirMonto(monto: number, de: MonedaCotizacion, a: MonedaCotizacion, tipoCambio: number): number {
  if (de === a || !(tipoCambio > 0)) return monto;
  return redondear(de === 'USD' ? monto * tipoCambio : monto / tipoCambio);
}

export function calcularTotales(lineas: LineaInput[], ivaPct: number) {
  const subtotal = redondear(lineas.reduce((acc, l) => acc + l.cantidad * l.precio_unitario, 0));
  const iva = redondear(subtotal * (ivaPct / 100));
  const total = redondear(subtotal + iva);
  return { subtotal, iva, total };
}

async function siguienteFolio(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { count } = await supabase.from('cotizaciones').select('id', { count: 'exact', head: true });
  return `COT-${String((count || 0) + 1).padStart(4, '0')}`;
}

function filasDeLineas(cotizacionId: string, lineas: LineaInput[]) {
  return lineas.map((l, i) => ({
    cotizacion_id: cotizacionId,
    sistema: l.sistema,
    orden: i,
    descripcion: l.descripcion,
    unidad: l.unidad,
    cantidad: l.cantidad,
    costo: l.costo,
    margen_pct: l.margen_pct,
    precio_unitario: l.precio_unitario,
    importe: redondear(l.cantidad * l.precio_unitario),
  }));
}

function datosCotizacion(input: CotizacionInput) {
  const { subtotal, iva, total } = calcularTotales(input.lineas, input.iva_pct);
  return {
    fecha: input.fecha,
    atencion: input.atencion.trim() || null,
    empresa: input.empresa.trim(),
    telefono: input.telefono.trim() || null,
    correo: input.correo.trim() || null,
    direccion: input.direccion.trim() || null,
    forma_pago: input.forma_pago,
    tiempo_entrega: input.tiempo_entrega,
    garantia: input.garantia,
    vigencia_dias: input.vigencia_dias,
    notas: input.notas.trim() || null,
    firmante_nombre: input.firmante_nombre.trim() || null,
    firmante_correo: input.firmante_correo.trim() || null,
    iva_pct: input.iva_pct,
    moneda: input.moneda,
    presentacion_precios: input.presentacion_precios,
    tipo_cambio: input.moneda === 'USD' ? input.tipo_cambio || 0 : 1,
    subtotal,
    iva,
    total,
  };
}

export async function crearCotizacion(input: CotizacionInput): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const folio = await siguienteFolio(supabase);

  const { data: cot, error: e1 } = await supabase
    .from('cotizaciones')
    .insert({ folio, created_by: user.id, ...datosCotizacion(input) })
    .select('id')
    .single();
  if (e1) throw e1;

  const filas = filasDeLineas(cot.id, input.lineas);
  if (filas.length > 0) {
    const { error: e2 } = await supabase.from('cotizacion_lineas').insert(filas);
    if (e2) throw e2;
  }

  return cot.id as string;
}

// Reemplaza todas las líneas de la cotización en vez de hacer diff línea por
// línea: en una cotización el número de líneas es bajo y así no hay que
// llevar el registro de cuáles son nuevas, cuáles cambiaron y cuáles se
// borraron desde el formulario.
export async function actualizarCotizacion(id: string, input: CotizacionInput): Promise<void> {
  const supabase = createClient();

  const { error: e1 } = await supabase
    .from('cotizaciones')
    .update({ ...datosCotizacion(input), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (e1) throw e1;

  const { error: eDel } = await supabase.from('cotizacion_lineas').delete().eq('cotizacion_id', id);
  if (eDel) throw eDel;

  const filas = filasDeLineas(id, input.lineas);
  if (filas.length > 0) {
    const { error: e2 } = await supabase.from('cotizacion_lineas').insert(filas);
    if (e2) throw e2;
  }
}

export async function actualizarEstadoCotizacion(id: string, estado: EstadoCotizacion): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('cotizaciones').update({ estado, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// Firma de aprobación interna: quien revisa la cotización antes de que salga
// al cliente. Al firmar, pasa de "borrador" a "aprobada" — recién ahí se
// habilita marcarla como enviada (ver puedeMarcarEnviada).
export async function aprobarCotizacion(id: string, nombre: string, firmaDataUrl: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('cotizaciones')
    .update({
      estado: 'aprobada',
      aprobada_por: nombre,
      aprobada_firma: firmaDataUrl,
      aprobada_en: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

// Solo se puede marcar como enviada una cotización ya aprobada (firmada) —
// mandarla sin que nadie la haya revisado sería justo lo que se quiere
// evitar con este paso.
export function puedeMarcarEnviada(cot: Pick<Cotizacion, 'estado' | 'aprobada_firma'>): boolean {
  return cot.estado === 'aprobada' && !!cot.aprobada_firma;
}

export async function marcarEnviada(id: string): Promise<void> {
  return actualizarEstadoCotizacion(id, 'enviada');
}

export async function listarCotizaciones(): Promise<Cotizacion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('*, profiles!cotizaciones_created_by_profiles_fkey(full_name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as any[]) || [];
}

export async function obtenerCotizacion(id: string): Promise<{ cotizacion: Cotizacion; lineas: LineaCotizacion[] }> {
  const supabase = createClient();
  const [{ data: cotizacion, error: e1 }, { data: lineas, error: e2 }] = await Promise.all([
    supabase.from('cotizaciones').select('*, profiles!cotizaciones_created_by_profiles_fkey(full_name)').eq('id', id).single(),
    supabase.from('cotizacion_lineas').select('*').eq('cotizacion_id', id).order('orden'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { cotizacion: cotizacion as Cotizacion, lineas: (lineas as LineaCotizacion[]) || [] };
}

export async function eliminarCotizacion(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('cotizaciones').delete().eq('id', id);
  if (error) throw error;
}

// Agrupa las líneas por sistema en el orden en que cada sistema apareció
// primero — así el PDF y el formulario muestran los grupos en el mismo
// orden en que se capturaron, sin depender de un campo extra.
export function agruparPorSistema<T extends { sistema: string }>(lineas: T[]): { sistema: string; lineas: T[] }[] {
  const grupos: { sistema: string; lineas: T[] }[] = [];
  for (const l of lineas) {
    let g = grupos.find((x) => x.sistema === l.sistema);
    if (!g) {
      g = { sistema: l.sistema, lineas: [] };
      grupos.push(g);
    }
    g.lineas.push(l);
  }
  return grupos;
}
