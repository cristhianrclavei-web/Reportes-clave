// Paneles solares de un proyecto: recibos de CFE, precio del kWh,
// dimensionamiento, ahorro, retorno y expediente del trámite de
// interconexión. Lógica pura; se prueba en lib/solar.test.ts.

export type ReciboCfe = {
  id: string;
  proyecto_id: string;
  periodo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  kwh: number;
  importe: number;
  precio_kwh_manual: number | null;
  archivo_path: string | null;
  archivo_nombre: string | null;
  creado_en: string;
};

export type DatosSolar = {
  proyecto_id: string;
  titular: string | null;
  rpu: string | null;
  tarifa: string | null;
  tipo_persona: 'fisica' | 'moral';
  direccion_servicio: string | null;
  hsp: number;
  factor_perdidas: number;
  modulo_w: number | null;
  modulos: number | null;
  cobertura_pct: number;
  inversor: string | null;
  costo_sistema: number | null;
  notas: string | null;
  actualizado_en?: string;
};

export function datosSolarVacios(proyectoId: string): DatosSolar {
  return {
    proyecto_id: proyectoId, titular: null, rpu: null, tarifa: null, tipo_persona: 'fisica', direccion_servicio: null,
    hsp: 5.5, factor_perdidas: 0.8, modulo_w: 550, modulos: null, cobertura_pct: 100, inversor: null, costo_sistema: null, notas: null,
  };
}

export const TARIFAS_CFE = ['1', '1A', '1B', '1C', '1D', '1E', '1F', 'DAC', 'PDBT', 'GDBT', 'RABT', 'GDMTO', 'GDMTH', 'APMT', 'RAMT', '9-CU', '9-N'];

// ---------- Recibos ----------

// Precio del kWh de un recibo: el capturado a mano o importe ÷ kWh.
export function precioKwh(r: Pick<ReciboCfe, 'kwh' | 'importe' | 'precio_kwh_manual'>): number | null {
  if (r.precio_kwh_manual && r.precio_kwh_manual > 0) return r.precio_kwh_manual;
  if (!(r.kwh > 0)) return null;
  return r.importe / r.kwh;
}

const DIA = 86400000;

function diasDe(r: Pick<ReciboCfe, 'fecha_inicio' | 'fecha_fin'>): number | null {
  if (!r.fecha_inicio || !r.fecha_fin) return null;
  const d = Math.round((Date.parse(r.fecha_fin) - Date.parse(r.fecha_inicio)) / DIA) + 1;
  return d > 0 ? d : null;
}

// Consumo anual estimado: con fechas, se lleva a 365 días; sin fechas se
// supone recibo bimestral (60 días), que es lo normal en casa habitación.
export function consumoAnual(recibos: Pick<ReciboCfe, 'kwh' | 'fecha_inicio' | 'fecha_fin'>[]): number {
  if (recibos.length === 0) return 0;
  let kwh = 0;
  let dias = 0;
  for (const r of recibos) {
    kwh += r.kwh;
    dias += diasDe(r) ?? 60;
  }
  if (dias <= 0) return 0;
  return (kwh / dias) * 365;
}

// Precio promedio del kWh, pesado por el consumo de cada recibo.
export function precioPromedio(recibos: Pick<ReciboCfe, 'kwh' | 'importe' | 'precio_kwh_manual'>[]): number | null {
  let kwh = 0;
  let pesos = 0;
  for (const r of recibos) {
    const p = precioKwh(r);
    if (p === null || !(r.kwh > 0)) continue;
    kwh += r.kwh;
    pesos += p * r.kwh;
  }
  return kwh > 0 ? pesos / kwh : null;
}

export function gastoAnual(recibos: Pick<ReciboCfe, 'kwh' | 'importe' | 'precio_kwh_manual' | 'fecha_inicio' | 'fecha_fin'>[]): number {
  const precio = precioPromedio(recibos);
  return precio === null ? 0 : consumoAnual(recibos) * precio;
}

// ---------- Dimensionamiento ----------

// Supuestos que se muestran en pantalla: el ahorro de años futuros sube con
// la tarifa y baja con la degradación de los módulos.
export const INCREMENTO_TARIFA = 0.04;
export const DEGRADACION_ANUAL = 0.005;
export const ANOS_PROYECCION = 25;

export type Dimensionamiento = {
  consumoAnual: number;
  kwpNecesario: number;
  modulos: number;
  kwp: number;
  produccionAnual: number;
  coberturaReal: number;
  precioKwh: number | null;
  ahorroAnual: number;
  ahorro25: number;
  retornoAnos: number | null;
};

export function dimensionar(datos: Pick<DatosSolar, 'hsp' | 'factor_perdidas' | 'modulo_w' | 'modulos' | 'cobertura_pct' | 'costo_sistema'>, recibos: Parameters<typeof gastoAnual>[0]): Dimensionamiento {
  const anual = consumoAnual(recibos);
  const rendimiento = datos.hsp * 365 * datos.factor_perdidas; // kWh por kWp al año
  const kwpNecesario = rendimiento > 0 ? (anual * (datos.cobertura_pct / 100)) / rendimiento : 0;
  const w = datos.modulo_w && datos.modulo_w > 0 ? datos.modulo_w : 0;
  const sugeridos = w > 0 ? Math.ceil((kwpNecesario * 1000) / w) : 0;
  const modulos = datos.modulos && datos.modulos > 0 ? datos.modulos : sugeridos;
  const kwp = (modulos * w) / 1000;
  const produccionAnual = kwp * rendimiento;
  const precio = precioPromedio(recibos);
  // Lo que se produce de más no se paga (medición neta): el ahorro tope es el consumo.
  const ahorroAnual = precio === null ? 0 : Math.min(produccionAnual, anual) * precio;
  let ahorro25 = 0;
  for (let ano = 0; ano < ANOS_PROYECCION; ano++) {
    ahorro25 += ahorroAnual * (1 + INCREMENTO_TARIFA) ** ano * (1 - DEGRADACION_ANUAL) ** ano;
  }
  const costo = datos.costo_sistema || 0;
  const retornoAnos = costo > 0 && ahorroAnual > 0 ? costo / ahorroAnual : null;
  return {
    consumoAnual: anual, kwpNecesario, modulos, kwp, produccionAnual,
    coberturaReal: anual > 0 ? (produccionAnual / anual) * 100 : 0,
    precioKwh: precio, ahorroAnual, ahorro25, retornoAnos,
  };
}

// ---------- Trámite de interconexión ----------

export type EstadoTramite = 'preparando' | 'entregado' | 'en_revision' | 'observaciones' | 'aprobado' | 'contrato_firmado' | 'medidor_cambiado' | 'rechazado';
export type Esquema = 'medicion_neta' | 'facturacion_neta' | 'venta_total';

export type EntradaBitacora = { en: string; por: string; texto: string; estado?: EstadoTramite };

export type TramiteCfe = {
  proyecto_id: string;
  estado: EstadoTramite;
  esquema: Esquema;
  numero_solicitud: string | null;
  oficina: string | null;
  fecha_entrega: string | null;
  fecha_aprobacion: string | null;
  fecha_contrato: string | null;
  fecha_medidor: string | null;
  numero_medidor: string | null;
  bitacora: EntradaBitacora[];
  actualizado_en?: string;
};

export function tramiteVacio(proyectoId: string): TramiteCfe {
  return {
    proyecto_id: proyectoId, estado: 'preparando', esquema: 'medicion_neta', numero_solicitud: null, oficina: null,
    fecha_entrega: null, fecha_aprobacion: null, fecha_contrato: null, fecha_medidor: null, numero_medidor: null, bitacora: [],
  };
}

export const ESTADOS_TRAMITE: { clave: EstadoTramite; nombre: string; ayuda: string }[] = [
  { clave: 'preparando', nombre: 'Preparando expediente', ayuda: 'Juntando documentos; el sistema ya instalado y apagado.' },
  { clave: 'entregado', nombre: 'Solicitud entregada', ayuda: 'Se entregó a CFE; anota el número de solicitud y la fecha.' },
  { clave: 'en_revision', nombre: 'En revisión de CFE', ayuda: 'CFE revisa el expediente.' },
  { clave: 'observaciones', nombre: 'Con observaciones', ayuda: 'CFE pidió corregir algo: anótalo en la bitácora.' },
  { clave: 'aprobado', nombre: 'Aprobado', ayuda: 'CFE aprobó; sigue la firma de contratos.' },
  { clave: 'contrato_firmado', nombre: 'Contrato firmado', ayuda: 'Contratos de interconexión y suministro firmados; falta el medidor.' },
  { clave: 'medidor_cambiado', nombre: 'Medidor cambiado', ayuda: 'CFE puso el medidor bidireccional: se enciende el sistema.' },
  { clave: 'rechazado', nombre: 'Rechazado', ayuda: 'CFE negó la solicitud; anota el motivo.' },
];

export const NOMBRE_ESQUEMA: Record<Esquema, string> = {
  medicion_neta: 'Medición neta (net metering)',
  facturacion_neta: 'Facturación neta (net billing)',
  venta_total: 'Venta total de energía',
};

export function nombreEstadoTramite(e: EstadoTramite): string {
  return ESTADOS_TRAMITE.find((x) => x.clave === e)?.nombre || e;
}

// Tiempo de referencia de CFE para responder (días hábiles).
export const DIAS_HABILES_ESPERADOS = 25;

// Días hábiles (lunes a viernes) desde la entrega hasta hoy.
export function diasHabilesDesde(desde: string, hoy: string): number {
  const inicio = Date.parse(`${desde}T12:00:00Z`);
  const fin = Date.parse(`${hoy}T12:00:00Z`);
  if (!(fin > inicio)) return 0;
  let dias = 0;
  for (let t = inicio + DIA; t <= fin; t += DIA) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) dias++;
  }
  return dias;
}

export type DocumentoRequerido = { tipo: string; nombre: string; ayuda: string; automatico?: 'unifilar' };

// Expediente de la solicitud de interconexión (Manual de Interconexión de
// Centrales de Generación con capacidad menor a 0.5 MW, DOF 15/12/2016, y
// requisitos publicados por CFE).
export function documentosRequeridos(tipoPersona: 'fisica' | 'moral'): DocumentoRequerido[] {
  const lista: DocumentoRequerido[] = [
    { tipo: 'solicitud', nombre: 'Solicitud de interconexión firmada', ayuda: 'Formato del Manual de Interconexión, firmado por el titular del servicio.' },
  ];
  if (tipoPersona === 'moral') {
    lista.push(
      { tipo: 'acta', nombre: 'Acta constitutiva', ayuda: 'De la empresa titular del servicio.' },
      { tipo: 'poder', nombre: 'Poder del representante legal', ayuda: 'Poder notarial de quien firma.' },
      { tipo: 'identificacion', nombre: 'Identificación del representante legal', ayuda: 'INE o pasaporte vigente.' },
    );
  } else {
    lista.push({ tipo: 'identificacion', nombre: 'Identificación oficial del titular', ayuda: 'INE o pasaporte vigente.' });
  }
  lista.push(
    { tipo: 'carta_poder', nombre: 'Carta poder simple', ayuda: 'Si el trámite lo hace Clave en nombre del titular, con copia de las identificaciones de testigos.' },
    { tipo: 'recibo', nombre: 'Recibo de CFE sin adeudo', ayuda: 'El más reciente, con el número de servicio (RPU).' },
    { tipo: 'croquis', nombre: 'Croquis de ubicación', ayuda: 'Ubicación del inmueble y del punto de interconexión.' },
    { tipo: 'unifilar', nombre: 'Diagrama unifilar', ayuda: 'Incluye los centros de carga del mismo punto. Sale del unifilar del proyecto.', automatico: 'unifilar' },
    { tipo: 'ficha_modulos', nombre: 'Ficha técnica de los módulos', ayuda: 'Del fabricante, del modelo instalado.' },
    { tipo: 'ficha_inversor', nombre: 'Ficha técnica del inversor', ayuda: 'Del fabricante, del modelo instalado.' },
    { tipo: 'certificado_inversor', nombre: 'Certificado del inversor', ayuda: 'UL 1741 / IEEE 1547 u homologación, cuando CFE lo pide.' },
  );
  return lista;
}

export function nombreDocumento(tipo: string): string {
  for (const t of ['fisica', 'moral'] as const) {
    const d = documentosRequeridos(t).find((x) => x.tipo === tipo);
    if (d) return d.nombre;
  }
  return tipo === 'otro' ? 'Otro documento' : tipo;
}

// ---------- Pagos ----------

export type PagoProyecto = {
  id: string;
  proyecto_id: string;
  fecha: string;
  monto: number;
  moneda: 'MXN' | 'USD';
  metodo: 'transferencia' | 'efectivo' | 'cheque' | 'tarjeta' | 'otro';
  concepto: string;
  referencia: string | null;
  comprobante_path: string | null;
  comprobante_nombre: string | null;
  creado_en: string;
};

export const METODOS_PAGO: { clave: PagoProyecto['metodo']; nombre: string }[] = [
  { clave: 'transferencia', nombre: 'Transferencia' },
  { clave: 'efectivo', nombre: 'Efectivo' },
  { clave: 'cheque', nombre: 'Cheque' },
  { clave: 'tarjeta', nombre: 'Tarjeta' },
  { clave: 'otro', nombre: 'Otro' },
];

export function cobrado(pagos: Pick<PagoProyecto, 'monto' | 'moneda'>[], moneda: 'MXN' | 'USD'): number {
  return pagos.filter((p) => p.moneda === moneda).reduce((s, p) => s + p.monto, 0);
}
