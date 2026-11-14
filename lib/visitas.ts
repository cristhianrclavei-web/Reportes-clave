// Buscador de visitas: cruza lo registrado (servicios y reportes) con el
// rastreo para contestar «¿qué días fueron con este cliente?» y «¿dónde
// estuvo este técnico?». Lógica pura; se prueba en lib/visitas.test.ts.
// Las consultas están en lib/visitasDatos.ts.

import { distanciaMetros } from './geocerca';

// ---------- Reglas ----------

// Menos de esto cerca de un cliente es pasar por enfrente, no una visita.
export const MINUTOS_VISITA = 10;
// Una parada: al menos este tiempo sin salir de un círculo de este radio.
export const MINUTOS_PARADA = 15;
export const RADIO_PARADA_M = 120;
// Un hueco así o mayor entre dos puntos (teléfono sin señal o dormido) se avisa junto al tiempo.
export const MINUTOS_SIN_SENAL = 15;
export const RADIO_CLIENTE_M = 200;
export const RADIOS_CLIENTE = [100, 200, 300, 500, 1000] as const;
// El rastreo se guarda 90 días; el buscador por técnico lee de 31 en 31.
export const DIAS_MAXIMO_TECNICO = 31;
export const DIAS_MAXIMO_CLIENTE = 120;

// ---------- Tipos ----------

// Un lugar donde se sabe que está un cliente: su ubicación o la de uno de sus servicios.
// `propio`: no es de un cliente sino de la empresa (oficina, almacén); ahí `cliente` es su nombre.
export type LugarConocido = { clienteId: string; cliente: string; lat: number; lng: number; radio: number; propio?: boolean };

// Algo registrado en la app ese día: un servicio agendado o un reporte.
export type Registro = {
  tipo: 'servicio' | 'reporte';
  id: string;
  fecha: string; // YYYY-MM-DD
  tecnicoId: string;
  clienteId: string | null;
  cliente: string;
};

// Lo que dice el rastreo de un técnico cerca de un cliente en un día.
// `sinSenal`: el rato más largo, en minutos, en que el teléfono no mandó puntos estando ahí.
export type VisitaGps = { tecnicoId: string; fecha: string; llegada: string; salida: string; minutos: number; sinSenal?: number };

// Punto del recorrido compacto: [segundos desde 1970, lat, lng].
export type PuntoCompacto = [number, number, number];

export type Parada = {
  fecha: string;
  desde: string; // ISO
  hasta: string;
  minutos: number;
  lat: number;
  lng: number;
  // El rato más largo, en minutos, sin puntos del teléfono durante la parada.
  sinSenal: number;
  // Cliente conocido donde cae la parada (si alguno).
  clienteId: string | null;
  cliente: string | null;
  // ¿Hay servicio o reporte de ese cliente ese día?
  conRegistro: boolean;
  // La parada fue en un lugar de la empresa (oficina, almacén): no hay nada que revisar.
  propio: boolean;
};

// ---------- Fechas ----------

// Día en hora de México de un instante (los días del buscador son los de la empresa).
export function diaEnMexico(instante: Date | number): string {
  return new Date(instante).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

export function horaEnMexicoCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
}

// «· 1 h 12 min sin señal» cuando el hueco es de notar; si no, nada.
export function textoSinSenal(minutos: number | undefined): string {
  return minutos && minutos >= MINUTOS_SIN_SENAL ? `${textoDuracion(minutos)} sin señal del teléfono` : '';
}

export function textoDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86400000);
}

// Revisa el rango de fechas antes de consultar. Devuelve el mensaje de error o null.
export function errorDeRango(desde: string, hasta: string, maximoDias: number): string | null {
  const formato = /^\d{4}-\d{2}-\d{2}$/;
  if (!formato.test(desde) || !formato.test(hasta)) return 'Elige las dos fechas.';
  if (desde > hasta) return 'La fecha «desde» va antes que la fecha «hasta».';
  if (diasEntre(desde, hasta) > maximoDias) return `El rango máximo es de ${maximoDias} días. Acorta las fechas.`;
  return null;
}

// ---------- Paradas ----------

// Paradas de un recorrido: tramos donde el técnico no salió de un círculo
// de RADIO_PARADA_M durante MINUTOS_PARADA o más. Cada parada es de un solo día.
// Si el teléfono deja de mandar puntos un rato y al volver sigue en el mismo
// lugar, es la misma parada: no hay señal de que se haya ido.
type ParadaSinLugar = Omit<Parada, 'clienteId' | 'cliente' | 'conRegistro' | 'propio'>;

export function detectarParadas(puntos: PuntoCompacto[]): ParadaSinLugar[] {
  const paradas: ParadaSinLugar[] = [];
  let grupo: PuntoCompacto[] = [];

  function cerrarGrupo() {
    if (grupo.length >= 2) {
      const inicio = grupo[0][0];
      const fin = grupo[grupo.length - 1][0];
      const minutos = Math.round((fin - inicio) / 60);
      let huecoMayor = 0;
      for (let i = 1; i < grupo.length; i++) huecoMayor = Math.max(huecoMayor, grupo[i][0] - grupo[i - 1][0]);
      if (minutos >= MINUTOS_PARADA) {
        const lat = grupo.reduce((suma, p) => suma + p[1], 0) / grupo.length;
        const lng = grupo.reduce((suma, p) => suma + p[2], 0) / grupo.length;
        paradas.push({
          fecha: diaEnMexico(inicio * 1000),
          desde: new Date(inicio * 1000).toISOString(),
          hasta: new Date(fin * 1000).toISOString(),
          minutos,
          lat,
          lng,
          sinSenal: Math.round(huecoMayor / 60),
        });
      }
    }
    grupo = [];
  }

  for (const punto of puntos) {
    if (grupo.length === 0) {
      grupo = [punto];
      continue;
    }
    const ancla = grupo[0];
    const sigueAhi = distanciaMetros({ lat: ancla[1], lng: ancla[2] }, { lat: punto[1], lng: punto[2] }) <= RADIO_PARADA_M;
    const mismoDia = diaEnMexico(ancla[0] * 1000) === diaEnMexico(punto[0] * 1000);
    if (sigueAhi && mismoDia) {
      grupo.push(punto);
    } else {
      cerrarGrupo();
      grupo = [punto];
    }
  }
  cerrarGrupo();
  return paradas;
}

// El cliente conocido más cercano a un punto, si cae dentro de su radio.
export function lugarEn(lat: number, lng: number, lugares: LugarConocido[]): LugarConocido | null {
  let mejor: LugarConocido | null = null;
  let mejorDistancia = Infinity;
  for (const lugar of lugares) {
    const d = distanciaMetros({ lat, lng }, { lat: lugar.lat, lng: lugar.lng });
    if (d <= lugar.radio && d < mejorDistancia) {
      mejor = lugar;
      mejorDistancia = d;
    }
  }
  return mejor;
}

// ---------- Por técnico ----------

export type DiaDeTecnico = {
  fecha: string;
  registros: Registro[];
  paradas: Parada[];
  // Paradas en un cliente conocido sin servicio ni reporte de ese cliente ese día.
  sinRegistro: number;
  // Paradas en un lugar que no es de ningún cliente con ubicación.
  sinIdentificar: number;
};

export function diasDeTecnico(puntos: PuntoCompacto[], registros: Registro[], lugares: LugarConocido[]): DiaDeTecnico[] {
  const dias = new Map<string, DiaDeTecnico>();
  const dia = (fecha: string) => {
    if (!dias.has(fecha)) dias.set(fecha, { fecha, registros: [], paradas: [], sinRegistro: 0, sinIdentificar: 0 });
    return dias.get(fecha)!;
  };
  for (const r of registros) dia(r.fecha).registros.push(r);
  for (const p of detectarParadas(puntos)) {
    const lugar = lugarEn(p.lat, p.lng, lugares);
    const delDia = dia(p.fecha);
    const propio = Boolean(lugar?.propio);
    const conRegistro = Boolean(lugar && delDia.registros.some((r) => r.clienteId === lugar.clienteId));
    delDia.paradas.push({ ...p, clienteId: lugar?.clienteId || null, cliente: lugar?.cliente || null, conRegistro, propio });
    // En la oficina o el almacén no se espera servicio ni reporte.
    if (propio) continue;
    if (!lugar) delDia.sinIdentificar += 1;
    else if (!conRegistro) delDia.sinRegistro += 1;
  }
  return [...dias.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ---------- Por cliente ----------

export type VisitaACliente = {
  fecha: string;
  tecnicoId: string;
  registros: Registro[];
  gps: VisitaGps | null;
  // 'sin_registro': el rastreo lo ubica ahí y nadie registró servicio ni reporte del cliente ese día.
  // 'sin_rastreo': hay registro pero el rastreo no lo ubica ahí (o no traía el teléfono).
  aviso: 'sin_registro' | 'sin_rastreo' | null;
};

// Una fila por técnico y día. `hayLugares`: si el cliente tiene dónde comparar contra el GPS.
// `rastreo`: días en que sí puede haber rastreo (de `desde` a antes de `hoy`); fuera de
// ahí no se avisa «sin rastreo»: el servicio todavía no pasa o los puntos ya se borraron.
export function visitasACliente(registros: Registro[], gps: VisitaGps[], hayLugares: boolean, rastreo?: { desde: string | null; hoy: string }): VisitaACliente[] {
  const filas = new Map<string, VisitaACliente>();
  const fila = (fecha: string, tecnicoId: string) => {
    const clave = `${fecha}|${tecnicoId}`;
    if (!filas.has(clave)) filas.set(clave, { fecha, tecnicoId, registros: [], gps: null, aviso: null });
    return filas.get(clave)!;
  };
  for (const r of registros) fila(r.fecha, r.tecnicoId).registros.push(r);
  for (const g of gps) {
    if (g.minutos < MINUTOS_VISITA) continue;
    fila(g.fecha, g.tecnicoId).gps = g;
  }
  const diasConRegistro = new Set(registros.map((r) => r.fecha));
  for (const f of filas.values()) {
    if (f.gps && f.registros.length === 0 && !diasConRegistro.has(f.fecha)) f.aviso = 'sin_registro';
    else if (!f.gps && f.registros.length > 0 && hayLugares) {
      const yaPaso = !rastreo || f.fecha < rastreo.hoy;
      const hayPuntos = !rastreo?.desde || f.fecha >= rastreo.desde;
      if (yaPaso && hayPuntos) f.aviso = 'sin_rastreo';
    }
  }
  return [...filas.values()].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.tecnicoId.localeCompare(b.tecnicoId));
}
