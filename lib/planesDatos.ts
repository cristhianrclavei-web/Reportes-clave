// Paquetes, precios y suscripción: datos puros, usables en servidor y cliente.
// El hook usePlan() vive en lib/planes.ts.

// Paquetes de la app (ver supabase/patch_planes.sql: los módulos de cada
// plan deben coincidir con modulos_activos()).
export type Modulo =
  | 'reportes' | 'servicios' | 'ubicacion' | 'clientes'
  | 'cotizaciones' | 'almacen' | 'formatos' | 'cuadrillas' | 'facturacion' | 'ia';

export type PlanClave = 'campo' | 'profesional' | 'empresa';

// `usuarios` debe coincidir con usuarios_del_plan() de
// supabase/patch_suscripcion.sql. Precios en MXN al mes, sin IVA; el anual
// es 10 mensualidades (12 meses por el precio de 10).
export const PLANES: Record<PlanClave, {
  nombre: string;
  modulos: Modulo[];
  usuarios: number;
  precioMensual: number;
  lema: string;
  incluye: string[];
}> = {
  campo: {
    nombre: 'Campo',
    modulos: ['reportes', 'servicios', 'ubicacion', 'clientes'],
    usuarios: 5,
    precioMensual: 1490,
    lema: 'Para empezar a ordenar el trabajo en campo',
    incluye: ['Reportes con fotos y firmas', 'Agenda y servicios', 'Ubicación de técnicos', 'Clientes'],
  },
  profesional: {
    nombre: 'Profesional',
    modulos: ['reportes', 'servicios', 'ubicacion', 'clientes', 'cotizaciones', 'almacen', 'formatos', 'cuadrillas'],
    usuarios: 10,
    precioMensual: 2990,
    lema: 'El más completo para integradores',
    incluye: ['Todo lo de Campo', 'Cotizaciones', 'Almacén y vales', 'Formatos de mantenimiento con etiqueta QR', 'Cuadrillas para equipos grandes'],
  },
  empresa: {
    nombre: 'Empresa',
    modulos: ['reportes', 'servicios', 'ubicacion', 'clientes', 'cotizaciones', 'almacen', 'formatos', 'cuadrillas', 'facturacion', 'ia'],
    usuarios: 25,
    precioMensual: 5490,
    lema: 'Toda la operación y la cobranza',
    incluye: ['Todo lo de Profesional', 'Facturación por cliente', 'Asistente IA (cuando esté disponible)', 'Soporte prioritario'],
  },
};

export const PRECIO_USUARIO_EXTRA = 149;
export const MESES_PAGADOS_EN_ANUAL = 10;

// Contacto para contratar o renovar (configurable por instalación).
export const VENTAS_WHATSAPP = process.env.NEXT_PUBLIC_VENTAS_WHATSAPP || '';
export const VENTAS_CORREO = process.env.NEXT_PUBLIC_VENTAS_CORREO || '';

// Calculado en la base (estado_suscripcion()) con la fecha de México: la app
// no calcula días con el reloj del navegador ni del servidor.
export type FaseSuscripcion = 'sin_vencimiento' | 'prueba' | 'activa' | 'gracia' | 'vencida';

export type Suscripcion = {
  estado: 'licencia' | 'prueba' | 'activa' | 'cancelada';
  fase: FaseSuscripcion;
  periodo: 'mensual' | 'anual' | null;
  inicio_en: string | null;
  vence_en: string | null;
  dias_restantes: number | null;
  fin_gracia: string | null;
  dias_gracia_restantes: number | null;
  solo_lectura: boolean;
};

export type MiPlan = {
  plan: PlanClave;
  modulos: Modulo[];
  limite_usuarios: number | null;
  usuarios_activos: number;
  // Ausentes si la base aún no tiene patch_suscripcion.sql.
  suscripcion?: Suscripcion;
  es_supervisor?: boolean;
};

export function tieneModulo(plan: MiPlan, m: Modulo): boolean {
  return plan.modulos.includes(m);
}

export function soloLectura(plan: MiPlan): boolean {
  return plan.suscripcion?.solo_lectura === true;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// 'YYYY-MM-DD' → '12 oct 2026', sin pasar por Date (evita desfases de zona).
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

export function dias(n: number): string {
  return n === 1 ? '1 día' : `${n} días`;
}

export function dinero(n: number): string {
  return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
