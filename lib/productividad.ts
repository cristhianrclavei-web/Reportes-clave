// Productividad del equipo día por día: cuánto trabajo se cerró, cuántas
// horas se estuvo en sitio y cuántos reportes se entregaron, para comparar un
// periodo contra el anterior. Puro: las fechas son de calendario (AAAA-MM-DD).
//
// Es del equipo completo, no por persona (ver la regla 2 de lib/kpis.ts).

import { evaluarServicio } from './eficiencia';
import { Servicio } from './serviciosProgramados';

// Más de 16 h en un solo servicio es un cierre olvidado, no trabajo.
const TOPE_MIN = 16 * 60;

export type DiaProductividad = {
  fecha: string;
  // Días de servicio concluidos.
  servicios: number;
  // Minutos en sitio: de la llegada al cierre, sin pausas. Es tiempo de reloj
  // (un servicio de 3 h cuenta 3 h aunque vayan cuatro personas), para que
  // cuadre con las horas que se ven en cada servicio.
  minutos: number;
  // De esos minutos, los que salieron de la hora de llegada y salida de un
  // reporte porque no había servicio con horas registradas.
  minutosDeReportes: number;
  reportes: number;
  aFavor: number;
  enContra: number;
  externas: number;
};

export type Metrica = 'servicios' | 'minutos' | 'reportes';

type ServicioDia = Parameters<typeof evaluarServicio>[0] & Pick<Servicio, 'fecha'> & { id?: string; report_id?: string | null };

export type ReporteDia = {
  id?: string;
  fecha?: string | null;
  empresa_cliente?: string | null;
  data?: { horaLlegada?: string | null; horaSalida?: string | null; servicioProgramadoId?: string | null } | null;
};

function restarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10);
}

// «14:25» → 865 minutos desde medianoche; null si no es una hora.
function minutosDelDia(hora?: string | null): number | null {
  const partes = /^(\d{1,2}):(\d{2})/.exec(hora || '');
  if (!partes) return null;
  return Number(partes[1]) * 60 + Number(partes[2]);
}

// Tiempo en sitio según el reporte: de su hora de llegada a su hora de salida.
function minutosDeReporte(r: ReporteDia): number {
  const llegada = minutosDelDia(r.data?.horaLlegada);
  const salida = minutosDelDia(r.data?.horaSalida);
  if (llegada === null || salida === null) return 0;
  const min = salida - llegada;
  return min > 0 && min <= TOPE_MIN ? min : 0;
}

// Los últimos `dias` días hasta `hoy`, del más viejo al más nuevo, incluidos
// los que no tuvieron actividad.
export function serieProductividad(
  servicios: ServicioDia[],
  reportes: ReporteDia[],
  hoy: string,
  dias: number,
): DiaProductividad[] {
  const serie: DiaProductividad[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    serie.push({ fecha: restarDias(hoy, i), servicios: 0, minutos: 0, minutosDeReportes: 0, reportes: 0, aFavor: 0, enContra: 0, externas: 0 });
  }
  const porFecha = new Map(serie.map((d) => [d.fecha, d]));

  // Servicios y reportes cuyo tiempo ya se contó desde el servicio, para no
  // sumarlo otra vez desde el reporte.
  const serviciosConTiempo = new Set<string>();
  const reportesYaContados = new Set<string>();

  servicios.forEach((s) => {
    const dia = porFecha.get(s.fecha);
    if (!dia || s.estado !== 'concluido') return;
    dia.servicios++;
    const desde = s.hora_llegada || s.hora_inicio;
    if (desde && s.hora_fin) {
      const min = Math.round((new Date(s.hora_fin).getTime() - new Date(desde).getTime()) / 60000 - (s.minutos_pausados || 0));
      if (min > 0 && min <= TOPE_MIN) {
        dia.minutos += min;
        if (s.id) serviciosConTiempo.add(s.id);
        if (s.report_id) reportesYaContados.add(s.report_id);
      }
    }
    const lectura = evaluarServicio(s).lectura;
    if (lectura === 'positiva') dia.aFavor++;
    else if (lectura === 'negativa') dia.enContra++;
    else if (lectura === 'neutra') dia.externas++;
  });

  // Tiempo que solo consta en reportes. Varios reportes del mismo trabajo (el
  // mismo servicio o, sin servicio, el mismo cliente ese día) cuentan una sola
  // vez: se toma el más largo.
  const tiempoPorTrabajo = new Map<string, { dia: DiaProductividad; minutos: number }>();

  reportes.forEach((r) => {
    const dia = r.fecha ? porFecha.get(r.fecha) : undefined;
    if (!dia) return;
    dia.reportes++;

    const servicioId = r.data?.servicioProgramadoId || null;
    if (servicioId && serviciosConTiempo.has(servicioId)) return;
    if (r.id && reportesYaContados.has(r.id)) return;
    const minutos = minutosDeReporte(r);
    if (minutos === 0) return;

    const trabajo = `${r.fecha}|${servicioId || (r.empresa_cliente || '').trim().toLowerCase()}`;
    const previo = tiempoPorTrabajo.get(trabajo);
    if (!previo || minutos > previo.minutos) tiempoPorTrabajo.set(trabajo, { dia, minutos });
  });

  tiempoPorTrabajo.forEach(({ dia, minutos }) => {
    dia.minutos += minutos;
    dia.minutosDeReportes += minutos;
  });

  return serie;
}

export type Comparativo = {
  actual: number;
  previo: number;
  // null cuando el periodo anterior no tuvo nada: no hay contra qué comparar.
  cambioPct: number | null;
};

// Parte la serie en dos mitades iguales (periodo anterior y actual) y compara
// el total de una medida.
export function compararPeriodos(serie: DiaProductividad[], metrica: Metrica): Comparativo {
  const mitad = Math.floor(serie.length / 2);
  const suma = (lista: DiaProductividad[]) => lista.reduce((n, d) => n + d[metrica], 0);
  const previo = suma(serie.slice(0, mitad));
  const actual = suma(serie.slice(mitad));
  return { actual, previo, cambioPct: previo > 0 ? ((actual - previo) / previo) * 100 : null };
}

// El día con más de esa medida; null si no hubo nada. En empate gana el más
// reciente.
export function mejorDia(dias: DiaProductividad[], metrica: Metrica): DiaProductividad | null {
  let mejor: DiaProductividad | null = null;
  dias.forEach((d) => { if (d[metrica] > 0 && (!mejor || d[metrica] >= mejor[metrica])) mejor = d; });
  return mejor;
}

// Promedio por día con actividad (los días sin nada no bajan el promedio:
// domingos y festivos no son días flojos).
export function promedioPorDiaActivo(dias: DiaProductividad[], metrica: Metrica): number | null {
  const activos = dias.filter((d) => d[metrica] > 0);
  return activos.length ? activos.reduce((n, d) => n + d[metrica], 0) / activos.length : null;
}
