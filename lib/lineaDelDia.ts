// Línea de tiempo de un día de trabajo: junta, en orden, los servicios
// programados (de la llegada al cierre) y las actividades de bitácora, y
// calcula los huecos sin registrar entre ellos. Puro: recibe milisegundos y
// «ahora», no lee el reloj.

import { TipoActividad } from './tiposActividad';

export type BloqueDia = {
  clave: string;
  clase: 'servicio' | TipoActividad;
  titulo: string;
  detalle?: string;
  inicio: number;
  // null: sigue en curso (se dibuja hasta «ahora»).
  fin: number | null;
  href: string;
  // Se cerró sola y nadie ha confirmado la hora: su duración no es de fiar.
  dudoso?: boolean;
};

export type HuecoDia = { inicio: number; fin: number; minutos: number };

const MIN = 60000;

export function finDe(b: BloqueDia, ahora: number): number {
  return Math.max(b.inicio, b.fin ?? ahora);
}

export function minutosDe(b: BloqueDia, ahora: number): number {
  return Math.round((finDe(b, ahora) - b.inicio) / MIN);
}

export function ordenar(bloques: BloqueDia[]): BloqueDia[] {
  return [...bloques].sort((a, b) => a.inicio - b.inicio || (a.fin ?? Infinity) - (b.fin ?? Infinity));
}

// Tramos de `minimo` minutos o más sin nada registrado, entre el primer
// bloque del día y el último. Antes del primero y después del último no se
// cuenta: no se sabe a qué hora empezó ni terminó la jornada.
export function huecosDelDia(bloques: BloqueDia[], ahora: number, minimo = 30): HuecoDia[] {
  const orden = ordenar(bloques);
  const huecos: HuecoDia[] = [];
  let cubiertoHasta = orden.length ? finDe(orden[0], ahora) : 0;
  for (const b of orden.slice(1)) {
    if (b.inicio - cubiertoHasta >= minimo * MIN) {
      huecos.push({ inicio: cubiertoHasta, fin: b.inicio, minutos: Math.round((b.inicio - cubiertoHasta) / MIN) });
    }
    cubiertoHasta = Math.max(cubiertoHasta, finDe(b, ahora));
  }
  return huecos;
}

// Horas (en punto) que debe abarcar la barra: de 7 a 19 por defecto, y más
// si hubo algo antes o después. `inicioDelDia` es la medianoche local.
export function ventanaDelDia(bloques: BloqueDia[], inicioDelDia: number, ahora: number): { desde: number; hasta: number } {
  let desde = 7, hasta = 19;
  for (const b of bloques) {
    const h0 = Math.floor((b.inicio - inicioDelDia) / (60 * MIN));
    const h1 = Math.ceil((finDe(b, ahora) - inicioDelDia) / (60 * MIN));
    desde = Math.min(desde, Math.max(0, h0));
    hasta = Math.max(hasta, Math.min(24, h1));
  }
  return { desde, hasta };
}

// Minutos del día por clase de bloque. Los dudosos no se suman.
export function minutosPorClase(bloques: BloqueDia[], ahora: number): Partial<Record<BloqueDia['clase'], number>> {
  const suma: Partial<Record<BloqueDia['clase'], number>> = {};
  bloques.forEach((b) => {
    if (b.dudoso) return;
    suma[b.clase] = (suma[b.clase] || 0) + minutosDe(b, ahora);
  });
  return suma;
}

// «2 h 15 min», «45 min».
export function duracionTexto(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h > 0 ? (m % 60 ? `${h} h ${m % 60} min` : `${h} h`) : `${m} min`;
}
