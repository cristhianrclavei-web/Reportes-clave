// Eficiencia de los servicios: qué tan apegado al plan salió cada día de
// trabajo y, cuando no, por qué.
//
// Las horas solas no alcanzan. Salir una hora antes es bueno si el trabajo
// quedó terminado y malo si quedó pendiente; llegar tarde por el tráfico o
// porque el cliente no estaba no es lo mismo que salir tarde de la base. Por
// eso cada servicio lleva dos respuestas del técnico (patch_eficiencia_servicios.sql):
//   - resultado del cierre: terminado, pendiente o no realizado (siempre);
//   - motivo, solo cuando hay desviación: llegó más de 15 min tarde, cerró más
//     de 15 min después de lo programado, o no terminó.
// Cada motivo es externo (no cuenta en contra) o propio (sí cuenta).
//
// Los servicios anteriores a esto no tienen resultado: salen como «sin
// clasificar» y no entran en ningún porcentaje.

import { Servicio, minutosPausadosTotales } from './serviciosProgramados';
import { Origen, origenMotivo, textoMotivo } from './motivosServicio';

export { MOTIVOS, origenMotivo, textoMotivo } from './motivosServicio';
export type { Motivo, Origen } from './motivosServicio';

// Margen de tolerancia, igual para llegada y salida.
export const MARGEN_MIN = 15;

// Más de 14 h de desfase es un toque olvidado, no un dato.
const MAX_DESFASE_MIN = 14 * 60;

export type ResultadoCierre = 'terminado' | 'pendiente' | 'no_realizado';

export const TEXTO_RESULTADO: Record<ResultadoCierre, string> = {
  terminado: 'Trabajo terminado',
  pendiente: 'Quedó trabajo pendiente',
  no_realizado: 'No se pudo realizar',
};

type ServicioTiempos = Pick<
  Servicio,
  'fecha' | 'hora_programada' | 'hora_salida_programada' | 'hora_llegada' | 'hora_inicio' | 'hora_fin'
  | 'duracion_estimada_min' | 'minutos_pausados' | 'pausado_desde'
>;

// hora_programada es hora de reloj local; se ancla a la fecha del servicio.
function minutosContraReloj(fecha: string, hora: string | null, momentoIso: string | null): number | null {
  if (!hora || !momentoIso) return null;
  const acordada = new Date(`${fecha}T${hora}`).getTime();
  const real = new Date(momentoIso).getTime();
  if (isNaN(acordada) || isNaN(real)) return null;
  const min = (real - acordada) / 60000;
  return Math.abs(min) > MAX_DESFASE_MIN ? null : Math.round(min);
}

// Minutos de diferencia en la llegada: + llegó después, − llegó antes.
// null si el servicio no tiene hora acordada o no se marcó llegada.
export function desfaseLlegada(s: ServicioTiempos): number | null {
  return minutosContraReloj(s.fecha, s.hora_programada, s.hora_llegada);
}

// Minutos de diferencia en la salida: + se pasó, − cerró antes. Contra la
// hora de salida programada; si no se capturó, contra la duración estimada
// (descontando pausas avisadas).
export function desfaseSalida(s: ServicioTiempos): number | null {
  if (s.hora_salida_programada) return minutosContraReloj(s.fecha, s.hora_salida_programada, s.hora_fin);
  const inicio = s.hora_inicio || s.hora_llegada;
  if (!inicio || !s.hora_fin || !s.duracion_estimada_min || s.duracion_estimada_min <= 0) return null;
  const fin = new Date(s.hora_fin).getTime();
  const total = (fin - new Date(inicio).getTime()) / 60000;
  if (isNaN(total) || total < 0 || total > MAX_DESFASE_MIN) return null;
  return Math.round(total - minutosPausadosTotales(s, fin) - s.duracion_estimada_min);
}

export type TipoHecho = 'llegada_tarde' | 'salida_tarde' | 'no_terminado' | 'termino_antes';

export type Hecho = {
  tipo: TipoHecho;
  minutos: number; // siempre positivo; 0 en «no terminado»
  // null = a favor (terminó antes).
  origen: Origen | null;
  motivo: string | null;
};

export type Lectura = 'positiva' | 'neutra' | 'negativa' | 'sin_clasificar';

export type Evaluacion = {
  lectura: Lectura;
  hechos: Hecho[];
  llegadaMin: number | null;
  salidaMin: number | null;
  minutosGanados: number;
  minutosPerdidosPropios: number;
  minutosPerdidosExternos: number;
};

type ServicioEvaluable = ServicioTiempos & Pick<
  Servicio,
  'estado' | 'resultado' | 'resultado_motivo' | 'llegada_motivo' | 'salida_motivo'
>;

// Lectura de un día concluido. Cualquier hecho por causa propia lo vuelve
// negativo; si solo hubo causas externas, neutro; sin desviaciones (o con
// tiempo ganado y el trabajo terminado), positivo.
export function evaluarServicio(s: ServicioEvaluable): Evaluacion {
  const llegadaMin = desfaseLlegada(s);
  const salidaMin = desfaseSalida(s);
  const base = { llegadaMin, salidaMin, minutosGanados: 0, minutosPerdidosPropios: 0, minutosPerdidosExternos: 0 };
  if (s.estado !== 'concluido' || !s.resultado) {
    return { ...base, lectura: 'sin_clasificar', hechos: [] };
  }

  const hechos: Hecho[] = [];
  if (llegadaMin !== null && llegadaMin > MARGEN_MIN) {
    hechos.push({ tipo: 'llegada_tarde', minutos: llegadaMin, origen: origenMotivo(s.llegada_motivo), motivo: s.llegada_motivo || null });
  }
  if (salidaMin !== null && salidaMin > MARGEN_MIN) {
    hechos.push({ tipo: 'salida_tarde', minutos: salidaMin, origen: origenMotivo(s.salida_motivo), motivo: s.salida_motivo || null });
  }
  if (s.resultado !== 'terminado') {
    hechos.push({ tipo: 'no_terminado', minutos: 0, origen: origenMotivo(s.resultado_motivo), motivo: s.resultado_motivo || null });
  } else if (salidaMin !== null && salidaMin < -MARGEN_MIN) {
    hechos.push({ tipo: 'termino_antes', minutos: -salidaMin, origen: null, motivo: null });
  }

  let minutosGanados = 0, minutosPerdidosPropios = 0, minutosPerdidosExternos = 0;
  hechos.forEach((h) => {
    if (h.origen === null) minutosGanados += h.minutos;
    else if (h.origen === 'propio') minutosPerdidosPropios += h.minutos;
    else minutosPerdidosExternos += h.minutos;
  });

  const lectura: Lectura = hechos.some((h) => h.origen === 'propio')
    ? 'negativa'
    : hechos.some((h) => h.origen === 'externo') ? 'neutra' : 'positiva';

  return { lectura, hechos, llegadaMin, salidaMin, minutosGanados, minutosPerdidosPropios, minutosPerdidosExternos };
}

// ---------------------------------------------------------------
// Agregados para el panel
// ---------------------------------------------------------------

export type Conteo = { positivas: number; neutras: number; negativas: number; sinClasificar: number };

export type ResumenEficiencia = Conteo & {
  // Positivas entre positivas + negativas: las causas externas quedan fuera
  // para que el porcentaje sea justo. null si no hay nada que medir.
  cumplimientoPct: number | null;
  clasificados: number;
  minutosGanados: number;
  minutosPerdidosPropios: number;
  minutosPerdidosExternos: number;
};

function conteoVacio(): Conteo {
  return { positivas: 0, neutras: 0, negativas: 0, sinClasificar: 0 };
}

function sumar(c: Conteo, lectura: Lectura) {
  if (lectura === 'positiva') c.positivas++;
  else if (lectura === 'neutra') c.neutras++;
  else if (lectura === 'negativa') c.negativas++;
  else c.sinClasificar++;
}

function cumplimiento(c: Conteo): number | null {
  const base = c.positivas + c.negativas;
  return base > 0 ? (c.positivas / base) * 100 : null;
}

function concluidos<T extends ServicioEvaluable>(servicios: T[]): T[] {
  return servicios.filter((s) => s.estado === 'concluido');
}

export function resumenEficiencia(servicios: ServicioEvaluable[]): ResumenEficiencia {
  const c = conteoVacio();
  let minutosGanados = 0, minutosPerdidosPropios = 0, minutosPerdidosExternos = 0;
  concluidos(servicios).forEach((s) => {
    const e = evaluarServicio(s);
    sumar(c, e.lectura);
    minutosGanados += e.minutosGanados;
    minutosPerdidosPropios += e.minutosPerdidosPropios;
    minutosPerdidosExternos += e.minutosPerdidosExternos;
  });
  return {
    ...c,
    cumplimientoPct: cumplimiento(c),
    clasificados: c.positivas + c.neutras + c.negativas,
    minutosGanados, minutosPerdidosPropios, minutosPerdidosExternos,
  };
}

// Lunes de la semana de una fecha AAAA-MM-DD. Todo en UTC: son fechas de
// calendario, no instantes, y así no dependen de la zona de quien lo ve.
export function lunesDe(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = new Date(Date.UTC(y, m - 1, d));
  const desdeLunes = (dia.getUTCDay() + 6) % 7;
  dia.setUTCDate(dia.getUTCDate() - desdeLunes);
  return dia.toISOString().slice(0, 10);
}

export type SemanaEficiencia = Conteo & { inicio: string; etiqueta: string };

// Las últimas `semanas` semanas hasta la de `hoy` (AAAA-MM-DD), de la más
// vieja a la actual, incluidas las que no tuvieron servicios.
export function eficienciaPorSemana(servicios: ServicioEvaluable[], hoy: string, semanas = 8): SemanaEficiencia[] {
  const filas: SemanaEficiencia[] = [];
  const actual = lunesDe(hoy);
  const [y, m, d] = actual.split('-').map(Number);
  for (let i = semanas - 1; i >= 0; i--) {
    const lunes = new Date(Date.UTC(y, m - 1, d - i * 7));
    const inicio = lunes.toISOString().slice(0, 10);
    const mes = lunes.toLocaleDateString('es-MX', { month: 'short', timeZone: 'UTC' }).replace('.', '');
    filas.push({ inicio, etiqueta: `${lunes.getUTCDate()} ${mes}`, ...conteoVacio() });
  }
  const porInicio = new Map(filas.map((f) => [f.inicio, f]));
  concluidos(servicios).forEach((s) => {
    const fila = porInicio.get(lunesDe(s.fecha));
    if (fila) sumar(fila, evaluarServicio(s).lectura);
  });
  return filas;
}

export type MotivoFrecuente = { clave: string; texto: string; origen: Origen; n: number; minutos: number };

// Cuántas veces aparece cada motivo (llegada, salida o trabajo sin terminar),
// del más frecuente al menos.
export function motivosFrecuentes(servicios: ServicioEvaluable[]): MotivoFrecuente[] {
  const mapa = new Map<string, MotivoFrecuente>();
  concluidos(servicios).forEach((s) => {
    evaluarServicio(s).hechos.forEach((h) => {
      if (h.origen === null) return;
      const clave = h.motivo || 'sin_motivo';
      const fila = mapa.get(clave) || { clave, texto: textoMotivo(h.motivo), origen: h.origen, n: 0, minutos: 0 };
      fila.n++;
      fila.minutos += h.minutos;
      mapa.set(clave, fila);
    });
  });
  return [...mapa.values()].sort((a, b) => b.n - a.n || b.minutos - a.minutos);
}

export type VisitasEnFalso = {
  total: number;
  // Minutos de la visita (de la llegada al cierre) que no produjeron trabajo.
  minutos: number;
  porCliente: { nombre: string; n: number; externas: number }[];
};

// Visitas en falso: días en que el personal llegó y no se pudo trabajar
// (resultado «no realizado»). Por cliente, para ver con quién se pierden
// más vueltas; `externas` son las que no fueron por causa del equipo.
export function visitasEnFalso<T extends ServicioEvaluable & Pick<Servicio, 'proyecto'>>(servicios: T[]): VisitasEnFalso {
  const mapa = new Map<string, { nombre: string; n: number; externas: number }>();
  let total = 0, minutos = 0;
  concluidos(servicios).forEach((s) => {
    if (s.resultado !== 'no_realizado') return;
    total++;
    const desde = s.hora_llegada || s.hora_inicio;
    if (desde && s.hora_fin) {
      const m = (new Date(s.hora_fin).getTime() - new Date(desde).getTime()) / 60000;
      if (m > 0 && m < MAX_DESFASE_MIN) minutos += Math.round(m);
    }
    const fila = mapa.get(s.proyecto) || { nombre: s.proyecto, n: 0, externas: 0 };
    fila.n++;
    if (origenMotivo(s.resultado_motivo) === 'externo') fila.externas++;
    mapa.set(s.proyecto, fila);
  });
  return { total, minutos, porCliente: [...mapa.values()].sort((x, y) => y.n - x.n || x.nombre.localeCompare(y.nombre, 'es')) };
}

export type FilaGrupo = Conteo & {
  nombre: string;
  n: number; // días clasificados
  cumplimientoPct: number | null;
  // De los que tenían hora acordada, cuántos llegaron dentro del margen.
  puntualidadPct: number | null;
  terminadosPct: number | null;
  // Ganados menos perdidos por causa propia: + a favor, − en contra.
  minutosNetos: number;
};

// Agrupa por lo que devuelva `grupos` (técnicos asignados, cliente…). Un
// servicio con varios técnicos cuenta para cada uno: el día lo trabajaron
// juntos. Los días sin clasificar no forman fila.
export function eficienciaPorGrupo<T extends ServicioEvaluable>(servicios: T[], grupos: (s: T) => string[]): FilaGrupo[] {
  type Acum = { c: Conteo; conHora: number; puntuales: number; terminados: number; netos: number };
  const mapa = new Map<string, Acum>();
  concluidos(servicios).forEach((s) => {
    const e = evaluarServicio(s);
    if (e.lectura === 'sin_clasificar') return;
    grupos(s).forEach((nombre) => {
      const a = mapa.get(nombre) || { c: conteoVacio(), conHora: 0, puntuales: 0, terminados: 0, netos: 0 };
      sumar(a.c, e.lectura);
      if (e.llegadaMin !== null) {
        a.conHora++;
        if (e.llegadaMin <= MARGEN_MIN) a.puntuales++;
      }
      if (s.resultado === 'terminado') a.terminados++;
      a.netos += e.minutosGanados - e.minutosPerdidosPropios;
      mapa.set(nombre, a);
    });
  });
  return [...mapa.entries()]
    .map(([nombre, a]) => {
      const n = a.c.positivas + a.c.neutras + a.c.negativas;
      return {
        nombre, n, ...a.c,
        cumplimientoPct: cumplimiento(a.c),
        puntualidadPct: a.conHora > 0 ? (a.puntuales / a.conHora) * 100 : null,
        terminadosPct: n > 0 ? (a.terminados / n) * 100 : null,
        minutosNetos: a.netos,
      };
    })
    .sort((x, y) => y.n - x.n || x.nombre.localeCompare(y.nombre));
}
