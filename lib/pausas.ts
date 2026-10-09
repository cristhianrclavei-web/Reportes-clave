// Reglas de las pausas de un servicio (hora de comida, salida por material…)
// y de la presencia en sitio. Aquí solo hay cálculo: lo usan la pantalla del
// técnico, la de supervisión y el cron de recordatorios, y así los tres
// coinciden en cuándo una pausa «ya terminó» o alguien está «fuera».

export type TipoPausa = 'comida' | 'material' | 'espera_cliente' | 'personal' | 'otro';

export const TIPOS_PAUSA: { clave: TipoPausa; texto: string; detalle: string }[] = [
  { clave: 'comida', texto: 'Comida', detalle: 'Tu hora de comida' },
  { clave: 'material', texto: 'Compra de material', detalle: 'Sales del sitio por material o herramienta' },
  { clave: 'espera_cliente', texto: 'Espera del cliente', detalle: 'El cliente te pide detener el trabajo' },
  { clave: 'personal', texto: 'Asunto personal', detalle: 'Emergencia o trámite fuera del sitio' },
  { clave: 'otro', texto: 'Otro', detalle: 'Escribe el motivo' },
];

const POR_CLAVE = new Map(TIPOS_PAUSA.map((t) => [t.clave, t]));

export function textoTipoPausa(clave: string | null | undefined): string {
  return (clave && POR_CLAVE.get(clave as TipoPausa)?.texto) || 'Pausa';
}

// Tiempos permitidos; los configura supervisión (tabla ajustes_operacion).
export type AjustesOperacion = {
  comida_min: number;
  otras_pausas_min: number;
  tolerancia_min: number;
  verificacion_min: number;
};

export const AJUSTES_POR_DEFECTO: AjustesOperacion = {
  comida_min: 60,
  otras_pausas_min: 30,
  tolerancia_min: 15,
  verificacion_min: 10,
};

// Minutos permitidos de una pausa. En una salida por material manda lo que
// el técnico dijo que tardaría: ir a la ferretería no dura lo mismo siempre.
export function limiteDePausa(tipo: TipoPausa, ajustes: AjustesOperacion, estimadoMin?: number | null): number {
  if (tipo === 'comida') return ajustes.comida_min;
  if (tipo === 'material' && estimadoMin && estimadoMin > 0) return Math.min(240, Math.round(estimadoMin));
  return ajustes.otras_pausas_min;
}

export type NivelPausa = 'normal' | 'por_terminar' | 'terminada' | 'excedida';

export type EstadoPausa = {
  transcurridos: number;
  // Minutos que quedan (0 si ya se acabó el tiempo) y minutos de más.
  restantes: number;
  excedidos: number;
  nivel: NivelPausa;
};

// Cuántos minutos antes del límite se avisa «por terminar».
export const PREAVISO_MIN = 10;

// Sin límite (pausas anteriores a este control) nunca se excede.
export function estadoPausa(desdeIso: string, limiteMin: number | null | undefined, ahoraMs: number, toleranciaMin: number): EstadoPausa {
  const transcurridos = Math.max(0, Math.floor((ahoraMs - new Date(desdeIso).getTime()) / 60000));
  if (!limiteMin || limiteMin <= 0) return { transcurridos, restantes: 0, excedidos: 0, nivel: 'normal' };
  const restantes = Math.max(0, limiteMin - transcurridos);
  const excedidos = Math.max(0, transcurridos - limiteMin);
  let nivel: NivelPausa = 'normal';
  if (transcurridos >= limiteMin + toleranciaMin && excedidos > 0) nivel = 'excedida';
  else if (transcurridos >= limiteMin) nivel = 'terminada';
  else if (restantes <= PREAVISO_MIN && limiteMin > PREAVISO_MIN * 2) nivel = 'por_terminar';
  return { transcurridos, restantes, excedidos, nivel };
}

// Recordatorio que le toca a una pausa según lo que ya se le mandó
// (0 ninguno · 1 por terminar · 2 terminó · 3 excedida). Devuelve el nivel
// nuevo, o null si no hay nada que mandar. Nunca retrocede y, si el cron se
// atrasó, manda solo el más avanzado en vez de los tres seguidos.
export function avisoQueToca(estado: EstadoPausa, yaEnviados: number): 1 | 2 | 3 | null {
  const nivel = estado.nivel === 'excedida' ? 3 : estado.nivel === 'terminada' ? 2 : estado.nivel === 'por_terminar' ? 1 : 0;
  return nivel > yaEnviados ? (nivel as 1 | 2 | 3) : null;
}

// ¿Está fuera del sitio? La imprecisión del GPS juega a favor de la persona:
// bajo techo el teléfono fácilmente se equivoca por decenas de metros.
export const MARGEN_SITIO_M = 80;

export function fueraDeSitio(distanciaM: number, precisionM: number | null | undefined, radioM: number): boolean {
  return distanciaM - (precisionM || 0) > radioM + MARGEN_SITIO_M;
}

export function distanciaTexto(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

// «1 h 05 min», «45 min».
export function minutosTexto(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}

export type ResultadoVerificacion = 'pendiente' | 'en_sitio' | 'fuera' | 'sin_ubicacion' | 'sin_respuesta';

// Una verificación sin responder se da por «sin respuesta» en cuanto vence,
// aunque el cron todavía no la haya marcado.
export function resultadoVerificacion(
  v: { resultado: ResultadoVerificacion; vence_en: string },
  ahoraMs: number
): ResultadoVerificacion {
  if (v.resultado === 'pendiente' && new Date(v.vence_en).getTime() <= ahoraMs) return 'sin_respuesta';
  return v.resultado;
}

export const TEXTO_VERIFICACION: Record<ResultadoVerificacion, string> = {
  pendiente: 'Esperando respuesta',
  en_sitio: 'En sitio',
  fuera: 'Fuera del sitio',
  sin_ubicacion: 'Respondió sin ubicación',
  sin_respuesta: 'Sin respuesta',
};

// ---------- Indicador de pausas por persona ----------

export type EventoPausa = {
  tipo: 'reanudacion' | 'salida_sitio';
  pausa_tipo: string | null;
  minutos: number | null;
  limite_min: number | null;
  fuera_sitio: boolean;
  created_by: string | null;
  nombre: string;
};

export type PausasPersona = {
  id: string;
  nombre: string;
  comidas: number;
  // Promedio de minutos de comida (0 si no tuvo).
  comidaPromedio: number;
  // Pausas de cualquier tipo que pasaron de su tiempo más la tolerancia.
  excedidas: number;
  // Veces que reanudó lejos del sitio o la app lo detectó fuera sin pausa.
  fuera: number;
};

// Solo entran las pausas ya cerradas (se cuentan al reanudar) que tienen
// tipo: las anteriores a este control no traían tiempo permitido.
export function resumenPausas(eventos: EventoPausa[], toleranciaMin: number): PausasPersona[] {
  const mapa = new Map<string, PausasPersona & { minComida: number }>();
  for (const e of eventos) {
    if (!e.created_by) continue;
    let p = mapa.get(e.created_by);
    if (!p) {
      p = { id: e.created_by, nombre: e.nombre, comidas: 0, comidaPromedio: 0, excedidas: 0, fuera: 0, minComida: 0 };
      mapa.set(e.created_by, p);
    }
    if (e.fuera_sitio) p.fuera++;
    if (e.tipo !== 'reanudacion' || !e.pausa_tipo) continue;
    const min = e.minutos || 0;
    if (e.pausa_tipo === 'comida') { p.comidas++; p.minComida += min; }
    if (e.limite_min && min > e.limite_min + toleranciaMin) p.excedidas++;
  }
  return [...mapa.values()]
    .map(({ minComida, ...p }) => ({ ...p, comidaPromedio: p.comidas ? Math.round(minComida / p.comidas) : 0 }))
    .filter((p) => p.comidas > 0 || p.excedidas > 0 || p.fuera > 0)
    .sort((a, b) => (b.excedidas + b.fuera) - (a.excedidas + a.fuera) || a.nombre.localeCompare(b.nombre));
}
