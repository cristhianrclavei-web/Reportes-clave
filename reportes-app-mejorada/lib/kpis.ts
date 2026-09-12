// Cálculo de los indicadores del panel del supervisor.
//
// Tres reglas que valen para todo lo de aquí:
//
// 1. Los tiempos salen de toques en el celular. Si alguien olvida dar "cierre"
//    hasta la mañana siguiente, ese servicio aparece de catorce horas. Todo lo
//    que se mida en minutos pasa por un filtro de valores imposibles, y lo
//    descartado se cuenta y se muestra en vez de esconderse.
//
// 2. Nada se agrupa por técnico. Un tablero que ordena personas por rapidez
//    empuja a cerrar antes de tiempo y a saltarse casillas, y entonces se
//    pierde el dato que se quería. Se agrupa por proyecto, que es donde está
//    la causa.
//
// 3. Una muestra chica no es un indicador. Por debajo de MUESTRA_MINIMA se
//    devuelve el dato pero marcado, para que la pantalla no presuma una
//    tendencia sacada de dos servicios.

import { Servicio } from './serviciosProgramados';

export const MUESTRA_MINIMA = 3;

// Un servicio de más de 14 h o de menos de 5 min es captura, no trabajo.
const MAX_MIN_SERVICIO = 14 * 60;
const MIN_MIN_SERVICIO = 5;

// Entre llegar y empezar, más de 4 h significa que el técnico se fue y volvió,
// no que estuvo esperando.
const MAX_MIN_ARRANQUE = 4 * 60;

export type Muestra<T> = {
  valor: T;
  n: number;          // casos que sí se pudieron medir
  descartados: number; // casos con datos imposibles
  confiable: boolean;  // n >= MUESTRA_MINIMA
};

function minutosEntre(desde?: string | null, hasta?: string | null): number | null {
  if (!desde || !hasta) return null;
  const a = new Date(desde).getTime();
  const b = new Date(hasta).getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return (b - a) / 60000;
}

export function mediana(nums: number[]): number {
  if (nums.length === 0) return 0;
  const orden = [...nums].sort((x, y) => x - y);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2;
}

export function formatMinutos(mins: number): string {
  const signo = mins < 0 ? '-' : '';
  const abs = Math.abs(Math.round(mins));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${signo}${m} min`;
  if (m === 0) return `${signo}${h} h`;
  return `${signo}${h} h ${m} min`;
}

// ---------------------------------------------------------------
// 1. Desviación contra lo estimado
// ---------------------------------------------------------------
// Se mide de inicio a fin, no de llegada a fin: el tiempo estimado es de
// trabajo, y el traslado o la espera en la caseta no son culpa del estimado.

export type DesviacionProyecto = {
  proyecto: string;
  estimadoMin: number;
  realMin: number;
  desviacionPct: number; // + se pasó, - cerró antes
  n: number;
};

export function desviacionPorProyecto(servicios: Servicio[]): {
  filas: DesviacionProyecto[];
  resumen: Muestra<number>; // mediana de la desviación en %
} {
  const porProyecto = new Map<string, { est: number[]; real: number[] }>();
  let descartados = 0;
  const todasLasDesviaciones: number[] = [];

  servicios.forEach((s) => {
    if (s.estado !== 'concluido') return;
    const real = minutosEntre(s.hora_inicio, s.hora_fin);
    if (real === null) return;
    if (real > MAX_MIN_SERVICIO || real < MIN_MIN_SERVICIO) {
      descartados++;
      return;
    }
    if (!s.duracion_estimada_min || s.duracion_estimada_min <= 0) return;

    const item = porProyecto.get(s.proyecto) || { est: [], real: [] };
    item.est.push(s.duracion_estimada_min);
    item.real.push(real);
    porProyecto.set(s.proyecto, item);

    todasLasDesviaciones.push(((real - s.duracion_estimada_min) / s.duracion_estimada_min) * 100);
  });

  const filas: DesviacionProyecto[] = [];
  porProyecto.forEach((v, proyecto) => {
    const estimado = mediana(v.est);
    const real = mediana(v.real);
    filas.push({
      proyecto,
      estimadoMin: estimado,
      realMin: real,
      desviacionPct: estimado > 0 ? ((real - estimado) / estimado) * 100 : 0,
      n: v.real.length,
    });
  });

  // Lo que más se sale primero: eso es lo que hay que revisar.
  filas.sort((a, b) => Math.abs(b.desviacionPct) - Math.abs(a.desviacionPct));

  return {
    filas,
    resumen: {
      valor: mediana(todasLasDesviaciones),
      n: todasLasDesviaciones.length,
      descartados,
      confiable: todasLasDesviaciones.length >= MUESTRA_MINIMA,
    },
  };
}

// ---------------------------------------------------------------
// 2. Tiempo de arranque
// ---------------------------------------------------------------
// De llegar al sitio a empezar a trabajar. Cuando crece suele ser herramienta
// que faltó, acceso que no estaba listo o contacto que no llegó.

export function tiempoDeArranque(servicios: Servicio[]): Muestra<number> {
  const minutos: number[] = [];
  let descartados = 0;

  servicios.forEach((s) => {
    const m = minutosEntre(s.hora_llegada, s.hora_inicio);
    if (m === null) return;
    if (m < 0 || m > MAX_MIN_ARRANQUE) {
      descartados++;
      return;
    }
    minutos.push(m);
  });

  return {
    valor: mediana(minutos),
    n: minutos.length,
    descartados,
    confiable: minutos.length >= MUESTRA_MINIMA,
  };
}

// ---------------------------------------------------------------
// 3. Puntualidad
// ---------------------------------------------------------------
// Solo cuenta servicios con hora_programada. Los de antes de esa columna se
// quedan fuera y se informan aparte: no se puede llegar tarde a una cita que
// nunca tuvo hora.

export type Puntualidad = {
  aTiempo: number;   // hasta 15 min después de lo acordado
  tarde: number;
  n: number;
  sinHora: number;   // servicios que no se pudieron evaluar
  medianaDesfaseMin: number;
};

const TOLERANCIA_MIN = 15;

export function puntualidad(servicios: Servicio[]): Puntualidad {
  let aTiempo = 0;
  let tarde = 0;
  let sinHora = 0;
  const desfases: number[] = [];

  servicios.forEach((s) => {
    if (!s.hora_llegada) return;
    if (!s.hora_programada) {
      sinHora++;
      return;
    }

    // hora_programada es hora de reloj local; se ancla a la fecha del servicio.
    const acordada = new Date(`${s.fecha}T${s.hora_programada}`);
    const llegada = new Date(s.hora_llegada);
    if (isNaN(acordada.getTime()) || isNaN(llegada.getTime())) return;

    const desfase = (llegada.getTime() - acordada.getTime()) / 60000;
    if (Math.abs(desfase) > MAX_MIN_SERVICIO) return; // captura errónea
    desfases.push(desfase);
    if (desfase <= TOLERANCIA_MIN) aTiempo++;
    else tarde++;
  });

  return {
    aTiempo,
    tarde,
    n: aTiempo + tarde,
    sinHora,
    medianaDesfaseMin: mediana(desfases),
  };
}

// ---------------------------------------------------------------
// 4. Retrabajo y firmas
// ---------------------------------------------------------------

export type Retrabajo = {
  total: number;
  conCorreccion: number;
  sinFirmaCliente: number;
  pctCorreccion: number;
  pctSinFirma: number;
};

export function retrabajo(
  reports: { correccion_solicitada?: boolean; correccion_habilitada?: boolean; data?: any }[]
): Retrabajo {
  const total = reports.length;
  let conCorreccion = 0;
  let sinFirmaCliente = 0;

  reports.forEach((r) => {
    if (r.correccion_solicitada || r.correccion_habilitada) conCorreccion++;
    if (!r.data?.firmaClienteData) sinFirmaCliente++;
  });

  return {
    total,
    conCorreccion,
    sinFirmaCliente,
    pctCorreccion: total > 0 ? (conCorreccion / total) * 100 : 0,
    pctSinFirma: total > 0 ? (sinFirmaCliente / total) * 100 : 0,
  };
}
