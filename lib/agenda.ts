import { Servicio } from './serviciosProgramados';

// Agenda del supervisor: agrupa los días programados por cercanía, para
// responder de un vistazo "qué hay hoy, qué viene, y qué se quedó atrás".
// Un día vencido es el que ya pasó su fecha y nunca se concluyó: con el
// bloqueo por fecha activo, el técnico ya no puede tocarlo, así que alguien
// tiene que reprogramarlo o el trabajo queda en el limbo.

export type BloqueAgenda = {
  clave: 'vencidos' | 'hoy' | 'manana' | 'semana' | 'despues';
  titulo: string;
  dias: Servicio[];
};

function aFechaLocal(fecha: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function diasDeDiferencia(fecha: string, ahora: Date = new Date()): number {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  return Math.round((aFechaLocal(fecha).getTime() - hoy.getTime()) / 86400000);
}

export function esDiaVencido(s: Pick<Servicio, 'fecha' | 'estado'>, ahora: Date = new Date()): boolean {
  return s.estado !== 'concluido' && diasDeDiferencia(s.fecha, ahora) < 0;
}

export function formatFechaAgenda(fecha: string): string {
  return aFechaLocal(fecha).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function construirAgenda(servicios: Servicio[], ahora: Date = new Date()): BloqueAgenda[] {
  const bloques: Record<BloqueAgenda['clave'], Servicio[]> = {
    vencidos: [], hoy: [], manana: [], semana: [], despues: [],
  };

  servicios.forEach((s) => {
    const diff = diasDeDiferencia(s.fecha, ahora);
    if (s.estado === 'concluido') return; // la agenda es de lo que falta por hacer
    if (diff < 0) bloques.vencidos.push(s);
    else if (diff === 0) bloques.hoy.push(s);
    else if (diff === 1) bloques.manana.push(s);
    else if (diff <= 7) bloques.semana.push(s);
    else bloques.despues.push(s);
  });

  // Vencidos: del más antiguo primero (lo más rezagado urge más).
  bloques.vencidos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  (['hoy', 'manana', 'semana', 'despues'] as const).forEach((k) => {
    bloques[k].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.proyecto.localeCompare(b.proyecto));
  });

  const titulos: Record<BloqueAgenda['clave'], string> = {
    vencidos: 'Vencidos — requieren reprogramarse',
    hoy: 'Hoy',
    manana: 'Mañana',
    semana: 'Esta semana',
    despues: 'Más adelante',
  };

  return (['vencidos', 'hoy', 'manana', 'semana', 'despues'] as const)
    .map((clave) => ({ clave, titulo: titulos[clave], dias: bloques[clave] }))
    .filter((b) => b.dias.length > 0);
}
