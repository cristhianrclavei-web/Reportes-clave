// Técnicos en campo: lo que comparten el mapa del Resumen y Servicios → Mapa.
// Junta el rastreo del teléfono (ubicaciones_tecnicos) con los servicios y
// reportes del día para decir en qué va cada técnico: su estado, paradas
// numeradas con cliente y reporte, los tramos de su ruta, los tiempos y las
// alertas. Lógica pura; se prueba en lib/campo.test.ts. Las consultas están
// en lib/campoDatos.ts y en lib/ubicacionTecnicos.ts.

import { distanciaMetros } from './geocerca';
import { detectarParadas, lugarEn, type LugarConocido, type PuntoCompacto } from './visitas';
import type { PuntoRecorrido } from './ubicacionTecnicos';

export type Punto = [number, number];

export type ServicioCampo = {
  id: string;
  proyecto: string;
  cliente_id: string | null;
  estado: 'programado' | 'en_sitio' | 'en_curso' | 'concluido' | 'cancelado';
  fecha: string;
  hora_programada: string | null; // 'HH:MM'
  hora_llegada: string | null; // ISO
  hora_inicio: string | null;
  hora_fin: string | null;
  pausado_desde: string | null;
  ubicacion: { lat: number; lng: number; direccion?: string } | null;
  radio_m: number;
  report_id: string | null;
  tecnicoIds: string[];
};

export type ReporteCampo = { id: string; created_by: string; cliente_id: string | null; cliente: string; personal: string[] };

export type EstadoTecnico = 'en_servicio' | 'en_ruta' | 'pausa' | 'terminado' | 'sin_salir';

export const TEXTO_ESTADO: Record<EstadoTecnico, string> = {
  en_servicio: 'En servicio',
  en_ruta: 'En ruta',
  pausa: 'Pausa',
  terminado: 'Terminado',
  sin_salir: 'Sin salir',
};

// Verde = completado, ámbar = en curso, azul = en ruta (el color de la app), rojo solo para alertas.
export const COLOR_ESTADO: Record<EstadoTecnico, string> = {
  en_servicio: '#f59e0b',
  en_ruta: '#3b82f6',
  pausa: '#94a3b8',
  terminado: '#16a34a',
  sin_salir: '#64748b',
};

export const COLOR_RECORRIDO = '#16a34a';
export const COLOR_ACTUAL = '#3b82f6';
export const COLOR_FALTA = '#94a3b8';

// ---------- Servicios del técnico ----------

export function serviciosDe(tecnicoId: string, servicios: ServicioCampo[]): ServicioCampo[] {
  return servicios
    .filter((s) => s.estado !== 'cancelado' && s.tecnicoIds.includes(tecnicoId))
    .sort((a, b) => (a.hora_programada || '99').localeCompare(b.hora_programada || '99'));
}

export function servicioActual(servicios: ServicioCampo[]): ServicioCampo | null {
  return servicios.find((s) => s.estado === 'en_sitio' || s.estado === 'en_curso') || null;
}

export function siguienteServicio(servicios: ServicioCampo[]): ServicioCampo | null {
  return servicios.find((s) => s.estado === 'programado') || null;
}

export function avanceDelDia(servicios: ServicioCampo[]): { hechos: number; total: number } {
  return { hechos: servicios.filter((s) => s.estado === 'concluido').length, total: servicios.length };
}

// En qué va: en un servicio (o en pausa), en camino, terminó el día o aún no sale.
export function estadoTecnico(servicios: ServicioCampo[], conPuntos: boolean, termino: boolean): EstadoTecnico {
  const actual = servicioActual(servicios);
  if (actual) return actual.pausado_desde ? 'pausa' : 'en_servicio';
  const pendientes = servicios.some((s) => s.estado === 'programado');
  if (termino || (servicios.length > 0 && !pendientes && conPuntos)) return 'terminado';
  return conPuntos ? 'en_ruta' : 'sin_salir';
}

// ---------- Recorrido ----------

export function aCompacto(recorrido: PuntoRecorrido[]): PuntoCompacto[] {
  return recorrido.map((p) => [Math.round(Date.parse(p.registrado_en) / 1000), p.lat, p.lng]);
}

export type EstadoReporte = 'entregado' | 'pendiente' | 'sin_reporte';

export const TEXTO_REPORTE: Record<EstadoReporte, string> = { entregado: 'Entregado', pendiente: 'Pendiente', sin_reporte: 'Sin reporte' };

export type ParadaCampo = {
  numero: number;
  desde: string;
  hasta: string;
  minutos: number;
  lat: number;
  lng: number;
  // Cliente o lugar de la empresa donde fue (null: lugar sin identificar).
  lugar: string | null;
  clienteId: string | null;
  propio: boolean;
  servicio: ServicioCampo | null;
  // Solo con un cliente; en la oficina o un lugar sin identificar no aplica.
  reporte: EstadoReporte | null;
  // Hoy y sigue ahí.
  enCurso: boolean;
};

const MINUTOS_EN_LINEA = 15;

// Paradas del día numeradas (1, 2, 3…), con el cliente, el servicio y si hay reporte.
export function paradasDelDia(
  recorrido: PuntoRecorrido[], lugares: LugarConocido[], servicios: ServicioCampo[], reportes: ReporteCampo[], esHoy: boolean, ahoraMs: number,
): ParadaCampo[] {
  const ultimo = recorrido[recorrido.length - 1];
  const reciente = Boolean(ultimo) && (ahoraMs - Date.parse(ultimo.registrado_en)) / 60000 <= MINUTOS_EN_LINEA;
  return detectarParadas(aCompacto(recorrido)).map((p, i) => {
    const lugar = lugarEn(p.lat, p.lng, lugares);
    const propio = Boolean(lugar?.propio);
    const clienteId = lugar && !propio ? lugar.clienteId : null;
    const servicio = propio ? null : servicios.find((s) => (clienteId && s.cliente_id === clienteId)
      || (s.ubicacion && distanciaMetros({ lat: p.lat, lng: p.lng }, s.ubicacion) <= (s.radio_m || 120) + 80)) || null;
    let reporte: EstadoReporte | null = null;
    if (servicio || clienteId) {
      const conReporte = Boolean(servicio?.report_id) || reportes.some((r) => clienteId && r.cliente_id === clienteId);
      if (conReporte) reporte = 'entregado';
      else reporte = esHoy ? 'pendiente' : 'sin_reporte';
    }
    const enCurso = esHoy && reciente && p.hasta === ultimo?.registrado_en;
    return {
      numero: i + 1, desde: p.desde, hasta: p.hasta, minutos: p.minutos, lat: p.lat, lng: p.lng,
      lugar: lugar?.cliente || servicio?.proyecto || null, clienteId: clienteId || servicio?.cliente_id || null, propio, servicio, reporte, enCurso,
    };
  });
}

// Tramos de la ruta: lo recorrido (verde) y, hoy, el tramo actual desde la
// última parada (azul). Si sigue en una parada, no hay tramo actual.
export function tramosDeRuta(recorrido: PuntoRecorrido[], paradas: ParadaCampo[], esHoy: boolean): { hecho: Punto[]; actual: Punto[] } {
  const puntos = recorrido.map((p) => [p.lat, p.lng] as Punto);
  const ultima = paradas[paradas.length - 1];
  if (!esHoy || !ultima || ultima.enCurso) return { hecho: puntos, actual: [] };
  const corte = recorrido.findIndex((p) => p.registrado_en === ultima.hasta);
  if (corte < 0 || corte >= recorrido.length - 1) return { hecho: puntos, actual: [] };
  return { hecho: puntos.slice(0, corte + 1), actual: puntos.slice(corte) };
}

// Lo que falta: de donde está a los servicios pendientes, en orden.
export function rutaFaltante(posicion: Punto | null, servicios: ServicioCampo[]): Punto[] {
  const pendientes = servicios.filter((s) => s.estado === 'programado' && s.ubicacion).map((s) => [s.ubicacion!.lat, s.ubicacion!.lng] as Punto);
  if (!posicion || pendientes.length === 0) return [];
  return [posicion, ...pendientes];
}

// Kilómetros del recorrido. Un brinco de más de 3 km en menos de 2 minutos
// es un error del GPS y no cuenta.
export function kmRecorridos(recorrido: PuntoRecorrido[]): number {
  let metros = 0;
  for (let i = 1; i < recorrido.length; i++) {
    const d = distanciaMetros(recorrido[i - 1], recorrido[i]);
    const minutos = (Date.parse(recorrido[i].registrado_en) - Date.parse(recorrido[i - 1].registrado_en)) / 60000;
    if (d > 3000 && minutos < 2) continue;
    metros += d;
  }
  return Math.round(metros / 100) / 10;
}

// Minutos en sitio (paradas) contra minutos en ruta (el resto del día).
export function tiemposDelDia(recorrido: PuntoRecorrido[], paradas: ParadaCampo[]): { enSitio: number; enRuta: number } {
  if (recorrido.length < 2) return { enSitio: 0, enRuta: 0 };
  const total = Math.round((Date.parse(recorrido[recorrido.length - 1].registrado_en) - Date.parse(recorrido[0].registrado_en)) / 60000);
  const enSitio = paradas.reduce((suma, p) => suma + p.minutos, 0);
  return { enSitio, enRuta: Math.max(0, total - enSitio) };
}

// ---------- Alertas (solo cuando algo está mal) ----------

export type Alerta = { tipo: 'parado' | 'sin_reporte' | 'fuera_de_ruta'; texto: string };

export function alertasDelTecnico(paradas: ParadaCampo[], servicios: ServicioCampo[], posicion: Punto | null, esHoy: boolean): Alerta[] {
  const alertas: Alerta[] = [];
  const ultima = paradas[paradas.length - 1];
  const actual = servicioActual(servicios);
  // Parado más de 30 min en un lugar que no es su servicio ni la oficina.
  if (esHoy && ultima?.enCurso && ultima.minutos >= 30 && !ultima.propio && !(actual && ultima.servicio?.id === actual.id)) {
    alertas.push({ tipo: 'parado', texto: `Parado ${ultima.minutos} min ${ultima.lugar ? `en ${ultima.lugar}` : 'en un lugar sin servicio'}` });
  }
  for (const s of servicios) {
    if (s.estado === 'concluido' && !s.report_id) alertas.push({ tipo: 'sin_reporte', texto: `${s.proyecto}: terminado sin reporte` });
  }
  // Con un servicio abierto y lejos de su sitio.
  if (esHoy && actual?.ubicacion && posicion) {
    const metros = distanciaMetros({ lat: posicion[0], lng: posicion[1] }, actual.ubicacion);
    if (metros > (actual.radio_m || 120) + 400) {
      alertas.push({ tipo: 'fuera_de_ruta', texto: `Lejos de ${actual.proyecto} (${metros >= 1000 ? `${(metros / 1000).toFixed(1)} km` : `${Math.round(metros)} m`})` });
    }
  }
  return alertas;
}

// ---------- Mapa ----------

// Guadalajara y zona metropolitana: donde se abre el mapa.
export const CENTRO_GUADALAJARA: Punto = [20.6597, -103.3496];
export const ZOOM_GUADALAJARA = 11;
const RADIO_ZONA_KM = 120;

// Puntos para encuadrar: si hay alguno en la zona de Guadalajara, solo esos
// (un punto suelto lejos no debe llevar el mapa a todo el país).
export function paraEncuadrar(puntos: Punto[]): Punto[] {
  const cerca = puntos.filter((p) => distanciaMetros({ lat: p[0], lng: p[1] }, { lat: CENTRO_GUADALAJARA[0], lng: CENTRO_GUADALAJARA[1] }) <= RADIO_ZONA_KM * 1000);
  return cerca.length > 0 ? cerca : puntos;
}

// Metros que mide un pixel del mapa en ese zoom y latitud (mapas web estándar).
export function metrosPorPixel(zoom: number, lat: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8);
}

// Junta las marcas que en pantalla quedarían encimadas (a menos de
// `separacion` pixeles); al acercar el mapa se separan solas.
export function agruparCercanas<T extends { lat: number; lng: number }>(marcas: T[], metrosPixel: number, separacion = 40): T[][] {
  const grupos: { centro: { lat: number; lng: number }; marcas: T[] }[] = [];
  const limite = metrosPixel * separacion;
  for (const m of marcas) {
    const grupo = grupos.find((g) => distanciaMetros(g.centro, m) < limite);
    if (grupo) grupo.marcas.push(m);
    else grupos.push({ centro: { lat: m.lat, lng: m.lng }, marcas: [m] });
  }
  return grupos.map((g) => g.marcas);
}

// Dónde iba a esa hora (para el reproductor): entre dos puntos, a la parte proporcional.
export function posicionEn(recorrido: PuntoRecorrido[], ms: number): Punto | null {
  if (recorrido.length === 0) return null;
  const tiempos = recorrido.map((p) => Date.parse(p.registrado_en));
  if (ms <= tiempos[0]) return [recorrido[0].lat, recorrido[0].lng];
  for (let i = 1; i < recorrido.length; i++) {
    if (ms <= tiempos[i]) {
      const t = (ms - tiempos[i - 1]) / Math.max(1, tiempos[i] - tiempos[i - 1]);
      const a = recorrido[i - 1];
      const b = recorrido[i];
      return [a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t];
    }
  }
  const ultimo = recorrido[recorrido.length - 1];
  return [ultimo.lat, ultimo.lng];
}

// «hace 5 min», «hace 2 h», «ayer 6:29 p.m.», «13 nov 6:29 p.m.».
export function ultimaVez(iso: string, ahoraMs: number): string {
  const minutos = Math.round((ahoraMs - Date.parse(iso)) / 60000);
  const hora = new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' });
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  const dia = (d: number) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  if (dia(Date.parse(iso)) === dia(ahoraMs)) return `hoy ${hora}`;
  if (dia(Date.parse(iso)) === dia(ahoraMs - 86400000)) return `ayer ${hora}`;
  const fecha = new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Mexico_City' });
  return `${fecha} ${hora}`;
}
