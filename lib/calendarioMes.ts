// Calendario mensual de servicios: la rejilla del mes y qué pintar en cada
// día. Todo con fechas de calendario (AAAA-MM-DD), sin leer el reloj: «hoy»
// lo pasa quien llama, que lo obtiene ya montado en el navegador.

export type ServicioCalendario = {
  id: string;
  fecha: string;
  estado: 'programado' | 'en_sitio' | 'en_curso' | 'concluido' | 'cancelado';
};

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const dos = (n: number) => String(n).padStart(2, '0');
export const claveFecha = (anio: number, mes: number, dia: number) => `${anio}-${dos(mes + 1)}-${dos(dia)}`;

export type CeldaMes = { fecha: string; dia: number; delMes: boolean };

// Semanas completas (lunes a domingo) que cubren el mes. `mes` va de 0 a 11.
// Los días de los meses vecinos vienen marcados para pintarlos apagados.
export function semanasDelMes(anio: number, mes: number): CeldaMes[][] {
  const primero = new Date(Date.UTC(anio, mes, 1));
  const desdeLunes = (primero.getUTCDay() + 6) % 7;
  const diasMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const filas = Math.ceil((desdeLunes + diasMes) / 7);
  const semanas: CeldaMes[][] = [];
  for (let f = 0; f < filas; f++) {
    const semana: CeldaMes[] = [];
    for (let c = 0; c < 7; c++) {
      const d = new Date(Date.UTC(anio, mes, 1 - desdeLunes + f * 7 + c));
      semana.push({
        fecha: claveFecha(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
        dia: d.getUTCDate(),
        delMes: d.getUTCMonth() === mes,
      });
    }
    semanas.push(semana);
  }
  return semanas;
}

// Mes anterior o siguiente, cuidando el cambio de año.
export function moverMes(anio: number, mes: number, pasos: number): { anio: number; mes: number } {
  const d = new Date(Date.UTC(anio, mes + pasos, 1));
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() };
}

export type ResumenDia = {
  hechos: number;
  // Programados o en marcha cuya fecha es hoy o futura.
  porVenir: number;
  // La fecha ya pasó y no se concluyeron: hay que reprogramarlos.
  vencidos: number;
  cancelados: number;
};

export function resumenPorDia(servicios: ServicioCalendario[], hoy: string): Record<string, ResumenDia> {
  const mapa: Record<string, ResumenDia> = {};
  servicios.forEach((s) => {
    const r = (mapa[s.fecha] ||= { hechos: 0, porVenir: 0, vencidos: 0, cancelados: 0 });
    if (s.estado === 'cancelado') r.cancelados++;
    else if (s.estado === 'concluido') r.hechos++;
    else if (s.fecha < hoy) r.vencidos++;
    else r.porVenir++;
  });
  return mapa;
}

// «jueves 9 de octubre» a partir de AAAA-MM-DD, sin depender de la zona.
export function fechaLargaCalendario(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-MX', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
}
