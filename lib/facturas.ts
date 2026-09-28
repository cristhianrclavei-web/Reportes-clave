import { createClient } from './supabaseClient';

// Facturas por cliente (ver supabase/patch_facturacion.sql). La app arma la
// PREFACTURA con los datos del CFDI 4.0; el timbrado lo hace el PAC y aquí
// solo se registra (folio fiscal, UUID, PDF y XML).

export type EstadoFactura = 'borrador' | 'timbrada' | 'pagada' | 'cancelada';
export type MonedaFactura = 'MXN' | 'USD';

export const ESTADO_FACTURA_LABEL: Record<EstadoFactura, string> = {
  borrador: 'Prefactura',
  timbrada: 'Timbrada',
  pagada: 'Pagada',
  cancelada: 'Cancelada',
};

export const ESTADO_FACTURA_CLS: Record<EstadoFactura, string> = {
  borrador: 'bg-amber/15 text-amber border-amber/30',
  timbrada: 'bg-teal/15 text-teal border-teal/30',
  pagada: 'bg-teal text-inkOnAccent border-teal',
  cancelada: 'bg-red/15 text-red border-red/30',
};

// ---------- Catálogos del SAT (los que se usan en la empresa) ----------
export type Opcion = { clave: string; nombre: string };

export const FORMAS_PAGO: Opcion[] = [
  { clave: '01', nombre: 'Efectivo' },
  { clave: '02', nombre: 'Cheque nominativo' },
  { clave: '03', nombre: 'Transferencia electrónica de fondos' },
  { clave: '04', nombre: 'Tarjeta de crédito' },
  { clave: '28', nombre: 'Tarjeta de débito' },
  { clave: '99', nombre: 'Por definir' },
];

export const METODOS_PAGO: Opcion[] = [
  { clave: 'PUE', nombre: 'Pago en una sola exhibición' },
  { clave: 'PPD', nombre: 'Pago en parcialidades o diferido' },
];

export const USOS_CFDI: Opcion[] = [
  { clave: 'G01', nombre: 'Adquisición de mercancías' },
  { clave: 'G03', nombre: 'Gastos en general' },
  { clave: 'I01', nombre: 'Construcciones' },
  { clave: 'I02', nombre: 'Mobiliario y equipo de oficina por inversiones' },
  { clave: 'I04', nombre: 'Equipo de cómputo y accesorios' },
  { clave: 'I08', nombre: 'Otra maquinaria y equipo' },
  { clave: 'S01', nombre: 'Sin efectos fiscales' },
  { clave: 'CP01', nombre: 'Pagos' },
];

export const REGIMENES: Opcion[] = [
  { clave: '601', nombre: 'General de Ley Personas Morales' },
  { clave: '603', nombre: 'Personas Morales con Fines no Lucrativos' },
  { clave: '605', nombre: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { clave: '606', nombre: 'Arrendamiento' },
  { clave: '612', nombre: 'Personas Físicas con Actividades Empresariales y Profesionales' },
  { clave: '616', nombre: 'Sin obligaciones fiscales' },
  { clave: '620', nombre: 'Sociedades Cooperativas de Producción' },
  { clave: '621', nombre: 'Incorporación Fiscal' },
  { clave: '623', nombre: 'Opcional para Grupos de Sociedades' },
  { clave: '624', nombre: 'Coordinados' },
  { clave: '626', nombre: 'Régimen Simplificado de Confianza' },
];

export const UNIDADES: Opcion[] = [
  { clave: 'E48', nombre: 'Unidad de servicio' },
  { clave: 'H87', nombre: 'Pieza' },
  { clave: 'LO', nombre: 'Lote' },
  { clave: 'ACT', nombre: 'Actividad' },
  { clave: 'EA', nombre: 'Elemento' },
  { clave: 'MTR', nombre: 'Metro' },
  { clave: 'XBX', nombre: 'Caja' },
  { clave: 'KT', nombre: 'Kit' },
];

// Claves de producto/servicio frecuentes (sugerencias; se puede escribir otra).
export const CLAVES_PROD_SERV: Opcion[] = [
  { clave: '72151703', nombre: 'Servicio de instalación o mantenimiento de sistemas de seguridad' },
  { clave: '72154022', nombre: 'Servicio de mantenimiento y reparación de equipo de seguridad' },
  { clave: '46171600', nombre: 'Equipo de vigilancia y detección' },
  { clave: '46171619', nombre: 'Sistemas de seguridad o de control de acceso' },
  { clave: '46191500', nombre: 'Protección contra incendios' },
  { clave: '26111701', nombre: 'Baterías recargables' },
  { clave: '43222600', nombre: 'Equipo de servicio de red' },
  { clave: '26121600', nombre: 'Cables eléctricos y accesorios' },
];

export function nombreOpcion(lista: Opcion[], clave?: string | null): string {
  if (!clave) return '';
  const o = lista.find((x) => x.clave === clave);
  return o ? `(${o.clave}) ${o.nombre}` : clave;
}

// ---------- Conceptos y totales ----------
export type Concepto = {
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  unidad_clave: string;
  unidad_nombre: string;
  clave_prod_serv: string;
  // '02' sí objeto de impuesto (lleva IVA), '01' no objeto.
  objeto_imp: '01' | '02';
  importe: number;
};

export function conceptoVacio(): Concepto {
  return {
    descripcion: '',
    cantidad: 1,
    valor_unitario: 0,
    unidad_clave: 'E48',
    unidad_nombre: 'Unidad de servicio',
    clave_prod_serv: '',
    objeto_imp: '02',
    importe: 0,
  };
}

function redondear(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

export function calcularTotalesFactura(conceptos: Concepto[], ivaPct: number) {
  const lineas = conceptos.map((c) => {
    const importe = redondear(c.cantidad * c.valor_unitario);
    const iva = c.objeto_imp === '02' ? redondear((importe * ivaPct) / 100) : 0;
    return { importe, iva };
  });
  const subtotal = redondear(lineas.reduce((s, l) => s + l.importe, 0));
  const iva = redondear(lineas.reduce((s, l) => s + l.iva, 0));
  return { subtotal, iva, total: redondear(subtotal + iva) };
}

// Unidad del SAT a partir de la unidad libre de la cotización.
export function unidadDesdeTexto(u: string): Opcion {
  const t = (u || '').toLowerCase();
  if (/^(pza|pieza|pz|pzas)/.test(t)) return UNIDADES[1];
  if (/^lote/.test(t)) return UNIDADES[2];
  if (/^(m|mt|mts|metro)/.test(t)) return UNIDADES[5];
  if (/^kit/.test(t)) return UNIDADES[7];
  if (/^caja/.test(t)) return UNIDADES[6];
  return UNIDADES[0];
}

// ---------- Registro ----------
export type Factura = {
  id: string;
  folio: string;
  cliente_id: string | null;
  cotizacion_id: string | null;
  estado: EstadoFactura;
  fecha: string;
  receptor_nombre: string;
  receptor_rfc: string | null;
  receptor_regimen: string | null;
  receptor_cp: string | null;
  uso_cfdi: string | null;
  moneda: MonedaFactura;
  tipo_cambio: number;
  forma_pago: string | null;
  metodo_pago: string;
  condiciones_pago: string | null;
  conceptos: Concepto[];
  iva_pct: number;
  subtotal: number;
  iva: number;
  total: number;
  notas: string | null;
  folio_fiscal: string | null;
  uuid_sat: string | null;
  fecha_timbrado: string | null;
  pdf_path: string | null;
  xml_path: string | null;
  fecha_pago: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

export type FacturaInput = {
  cliente_id: string | null;
  cotizacion_id: string | null;
  fecha: string;
  receptor_nombre: string;
  receptor_rfc: string;
  receptor_regimen: string;
  receptor_cp: string;
  uso_cfdi: string;
  moneda: MonedaFactura;
  tipo_cambio: number;
  forma_pago: string;
  metodo_pago: string;
  condiciones_pago: string;
  conceptos: Concepto[];
  iva_pct: number;
  notas: string;
  reportes: string[];
  // Guardar RFC, régimen, etc. en el cliente para la próxima.
  guardarEnCliente: boolean;
};

function datosFactura(input: FacturaInput) {
  const conceptos = input.conceptos
    .filter((c) => c.descripcion.trim())
    .map((c) => ({ ...c, descripcion: c.descripcion.trim(), importe: redondear(c.cantidad * c.valor_unitario) }));
  const { subtotal, iva, total } = calcularTotalesFactura(conceptos, input.iva_pct);
  const t = (s: string) => s.trim() || null;
  return {
    cliente_id: input.cliente_id,
    cotizacion_id: input.cotizacion_id,
    fecha: input.fecha,
    receptor_nombre: input.receptor_nombre.trim(),
    receptor_rfc: t(input.receptor_rfc.toUpperCase()),
    receptor_regimen: t(input.receptor_regimen),
    receptor_cp: t(input.receptor_cp),
    uso_cfdi: t(input.uso_cfdi),
    moneda: input.moneda,
    tipo_cambio: input.moneda === 'USD' ? input.tipo_cambio || 0 : 1,
    forma_pago: t(input.forma_pago),
    metodo_pago: input.metodo_pago,
    condiciones_pago: t(input.condiciones_pago),
    conceptos,
    iva_pct: input.iva_pct,
    subtotal,
    iva,
    total,
    notas: t(input.notas),
  };
}

async function guardarFiscalesCliente(input: FacturaInput) {
  if (!input.guardarEnCliente || !input.cliente_id) return;
  const t = (s: string) => s.trim() || null;
  await createClient()
    .from('clientes')
    .update({
      razon_social: t(input.receptor_nombre),
      rfc: t(input.receptor_rfc.toUpperCase()),
      regimen_fiscal: t(input.receptor_regimen),
      cp_fiscal: t(input.receptor_cp),
      uso_cfdi: t(input.uso_cfdi),
    })
    .eq('id', input.cliente_id);
}

async function guardarReportes(facturaId: string, reportes: string[]) {
  const supabase = createClient();
  const { data: actuales, error } = await supabase.from('factura_reportes').select('report_id').eq('factura_id', facturaId);
  if (error) throw error;
  const ya = new Set((actuales || []).map((r: any) => r.report_id as string));
  const quitar = [...ya].filter((id) => !reportes.includes(id));
  const agregar = reportes.filter((id) => !ya.has(id));
  if (quitar.length) {
    const { error: e } = await supabase.from('factura_reportes').delete().eq('factura_id', facturaId).in('report_id', quitar);
    if (e) throw e;
  }
  if (agregar.length) {
    const { error: e } = await supabase.from('factura_reportes').insert(agregar.map((report_id) => ({ factura_id: facturaId, report_id })));
    if (e) throw e;
  }
}

export async function crearFactura(input: FacturaInput): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  const { data, error } = await supabase
    .from('facturas')
    .insert({ created_by: user.id, ...datosFactura(input) })
    .select('id')
    .single();
  if (error) throw error;
  await guardarReportes(data.id, input.reportes);
  await guardarFiscalesCliente(input);
  return data.id as string;
}

export async function actualizarFactura(id: string, input: FacturaInput): Promise<void> {
  const { error } = await createClient().from('facturas').update(datosFactura(input)).eq('id', id);
  if (error) throw error;
  await guardarReportes(id, input.reportes);
  await guardarFiscalesCliente(input);
}

export async function obtenerFactura(id: string): Promise<{ factura: Factura; reportes: string[] }> {
  const supabase = createClient();
  const [{ data: factura, error }, { data: rel }] = await Promise.all([
    supabase.from('facturas').select('*, profiles!facturas_created_by_profiles_fkey(full_name)').eq('id', id).single(),
    supabase.from('factura_reportes').select('report_id').eq('factura_id', id),
  ]);
  if (error) throw error;
  return { factura: factura as Factura, reportes: (rel || []).map((r: any) => r.report_id) };
}

export async function cambiarEstadoFactura(id: string, cambios: Partial<Factura>): Promise<void> {
  const { error } = await createClient().from('facturas').update(cambios).eq('id', id);
  if (error) throw error;
}

export async function eliminarFactura(id: string): Promise<void> {
  const { error } = await createClient().from('facturas').delete().eq('id', id);
  if (error) throw error;
}

// PDF y XML timbrados, en el bucket privado «facturas».
export async function subirArchivoCfdi(facturaId: string, archivo: File, tipo: 'pdf' | 'xml'): Promise<string> {
  const path = `cfdi/${facturaId}/${tipo === 'pdf' ? 'factura.pdf' : 'factura.xml'}`;
  const { error } = await createClient().storage.from('facturas').upload(path, archivo, {
    upsert: true,
    contentType: tipo === 'pdf' ? 'application/pdf' : 'application/xml',
  });
  if (error) throw error;
  return path;
}

export async function urlArchivoCfdi(path: string): Promise<string | null> {
  const { data } = await createClient().storage.from('facturas').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

// Lo que el formulario necesita del cliente para ligar: sus reportes y
// cotizaciones (solo columnas ligeras).
export type ReporteVinculable = {
  id: string;
  fecha: string;
  folio: string | null;
  ing: string | null;
  factura_id: string | null;
  factura_folio: string | null;
};

export type CotizacionVinculable = { id: string; folio: string; fecha: string; total: number; moneda: MonedaFactura; estado: string };

export async function vinculablesDeCliente(clienteId: string): Promise<{ reportes: ReporteVinculable[]; cotizaciones: CotizacionVinculable[] }> {
  const supabase = createClient();
  const [{ data: reps }, { data: cots }] = await Promise.all([
    supabase
      .from('reports')
      .select('id, fecha, folio:data->>claveFormato, ing:data->>ingACargo, factura_id:data->>facturaId, factura_folio:data->>facturaFolio')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false }),
    supabase
      .from('cotizaciones')
      .select('id, folio, fecha, total, moneda, estado')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false }),
  ]);
  return { reportes: (reps as any) || [], cotizaciones: (cots as any) || [] };
}

export async function lineasDeCotizacion(cotizacionId: string): Promise<Concepto[]> {
  const { data } = await createClient()
    .from('cotizacion_lineas')
    .select('descripcion, unidad, cantidad, precio_unitario')
    .eq('cotizacion_id', cotizacionId)
    .order('orden');
  return (data || []).map((l: any) => {
    const u = unidadDesdeTexto(l.unidad);
    return {
      ...conceptoVacio(),
      descripcion: l.descripcion,
      cantidad: Number(l.cantidad) || 1,
      valor_unitario: Number(l.precio_unitario) || 0,
      unidad_clave: u.clave,
      unidad_nombre: u.nombre,
    };
  });
}

export type DatosFiscales = {
  nombre: string;
  razon_social: string | null;
  rfc: string | null;
  regimen_fiscal: string | null;
  cp_fiscal: string | null;
  uso_cfdi: string | null;
};

export async function datosFiscalesCliente(clienteId: string): Promise<DatosFiscales | null> {
  const { data } = await createClient()
    .from('clientes')
    .select('nombre, razon_social, rfc, regimen_fiscal, cp_fiscal, uso_cfdi')
    .eq('id', clienteId)
    .maybeSingle();
  return (data as DatosFiscales) || null;
}
