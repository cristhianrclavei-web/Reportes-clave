// Proyectos como centro de la app (supabase/patch_proyectos_centro.sql):
// sistemas que lleva una obra y las etapas de su embudo. Lógica pura; se
// prueba en lib/proyectosEtapas.test.ts.

export type SistemaClave = 'deteccion' | 'cctv' | 'acceso' | 'solar' | 'intrusion' | 'otro';

export type Etapa = 'prospecto' | 'cotizado' | 'vendido' | 'instalacion' | 'tramite_cfe' | 'terminado' | 'cancelado';

export const SISTEMAS: { clave: SistemaClave; nombre: string; corto: string; descripcion: string }[] = [
  { clave: 'deteccion', nombre: 'Detección de incendio', corto: 'Detección', descripcion: 'Paneles, lazos, planos, avance de obra y fallas a tierra' },
  { clave: 'cctv', nombre: 'CCTV', corto: 'CCTV', descripcion: 'Plano con cámaras y su campo de visión, red, disco duro y materiales' },
  { clave: 'acceso', nombre: 'Control de acceso', corto: 'Acceso', descripcion: 'Plano de puertas, lectoras y guías de conexión' },
  { clave: 'solar', nombre: 'Paneles solares', corto: 'Solar', descripcion: 'Recibos de CFE, dimensionamiento, cotización, unifilar y trámite de interconexión' },
  { clave: 'intrusion', nombre: 'Alarma de intrusión', corto: 'Intrusión', descripcion: 'Plano de sensores y guías de conexión' },
  { clave: 'otro', nombre: 'Otro sistema', corto: 'Otro', descripcion: 'Automatización, eléctrico u otro trabajo' },
];

export function nombreSistema(clave: string): string {
  return SISTEMAS.find((s) => s.clave === clave)?.nombre || clave;
}

export function cortoSistema(clave: string): string {
  return SISTEMAS.find((s) => s.clave === clave)?.corto || clave;
}

// El texto libre que usaban los proyectos de antes y las cotizaciones
// («Alarma & Detección de Humo», «Paneles Solares»…) a su clave.
export function sistemaDeTexto(texto: string): SistemaClave {
  const t = (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/solar|fotovolt/.test(t)) return 'solar';
  if (/cctv|camara|video/.test(t)) return 'cctv';
  if (/acceso/.test(t)) return 'acceso';
  if (/intrusi/.test(t)) return 'intrusion';
  if (/detecci|incendio|humo|alarma|\bdet\b/.test(t)) return 'deteccion';
  return 'otro';
}

const ORDEN: Etapa[] = ['prospecto', 'cotizado', 'vendido', 'instalacion', 'tramite_cfe', 'terminado'];

export function llevaSolar(sistemas: readonly string[]): boolean {
  return sistemas.includes('solar');
}

// Etapas del embudo de un proyecto: el trámite de CFE solo si lleva solar,
// y entonces «Terminado» se llama «Interconectado».
export function etapasDe(sistemas: readonly string[]): Etapa[] {
  return llevaSolar(sistemas) ? ORDEN : ORDEN.filter((e) => e !== 'tramite_cfe');
}

export function nombreEtapa(etapa: Etapa, sistemas: readonly string[]): string {
  switch (etapa) {
    case 'prospecto': return 'Prospecto';
    case 'cotizado': return 'Cotizado';
    case 'vendido': return 'Vendido';
    case 'instalacion': return 'Instalación';
    case 'tramite_cfe': return 'Trámite CFE';
    case 'terminado': return llevaSolar(sistemas) ? 'Interconectado' : 'Terminado';
    case 'cancelado': return 'Cancelado';
  }
}

// Qué significa cada etapa (ayuda en el tablero y al cambiarla).
export function ayudaEtapa(etapa: Etapa, sistemas: readonly string[]): string {
  const solar = llevaSolar(sistemas);
  switch (etapa) {
    case 'prospecto': return 'Interesado, todavía sin cotización.';
    case 'cotizado': return 'Ya tiene cotización enviada.';
    case 'vendido': return 'El cliente aprobó; falta instalar.';
    case 'instalacion': return solar
      ? 'En obra. Se cierra con la revisión final y el sistema apagado para el trámite.'
      : 'En obra.';
    case 'tramite_cfe': return 'Solicitud de interconexión con CFE, hasta que cambian el medidor.';
    case 'terminado': return solar
      ? 'CFE puso el medidor bidireccional y el sistema se volvió a encender.'
      : 'Entregado al cliente.';
    case 'cancelado': return 'El cliente no siguió.';
  }
}

export function siguienteEtapa(etapa: Etapa, sistemas: readonly string[]): Etapa | null {
  const lista = etapasDe(sistemas);
  const i = lista.indexOf(etapa);
  if (i < 0 || i === lista.length - 1) return null;
  return lista[i + 1];
}

// Al quitar «solar» de un proyecto que estaba en trámite, regresa a instalación.
export function etapaValida(etapa: Etapa, sistemas: readonly string[]): Etapa {
  if (etapa === 'tramite_cfe' && !llevaSolar(sistemas)) return 'instalacion';
  return etapa;
}

// Color de la etapa para chips y columnas (clases de Tailwind del tema).
export function tonoEtapa(etapa: Etapa): { chip: string; punto: string } {
  switch (etapa) {
    case 'prospecto': return { chip: 'bg-surface-2 text-muted border-line', punto: 'bg-faint' };
    case 'cotizado': return { chip: 'bg-amber/15 text-amber border-amber/30', punto: 'bg-amber' };
    case 'vendido': return { chip: 'bg-teal/15 text-teal border-teal/30', punto: 'bg-teal' };
    case 'instalacion': return { chip: 'bg-teal/15 text-teal border-teal/30', punto: 'bg-teal' };
    case 'tramite_cfe': return { chip: 'bg-amber/15 text-amber border-amber/30', punto: 'bg-amber' };
    case 'terminado': return { chip: 'bg-teal text-inkOnAccent border-teal', punto: 'bg-teal-dark' };
    case 'cancelado': return { chip: 'bg-red/10 text-red border-red/30', punto: 'bg-red' };
  }
}

// Lo que se muestra de la etapa: una instalación existente siempre está «En operación».
export function etiquetaEtapa(etapa: Etapa, sistemas: readonly string[], tipo?: 'obra' | 'instalacion'): string {
  if (tipo === 'instalacion' && etapa === 'terminado') return 'En operación';
  return nombreEtapa(etapa, sistemas);
}
