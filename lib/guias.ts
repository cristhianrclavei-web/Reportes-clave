// Guías de conexión (supabase/patch_guias_conexion.sql): cómo se conecta una
// instalación, borne por borne, con sus pruebas y las notas del ingeniero.
// Aquí van los tipos y la lógica pura; se prueba en lib/guias.test.ts.

import { z } from 'zod';

// ---------- Tipos ----------

export type Borne = { id: string; nombre: string };

export type EquipoGuia = {
  id: string;
  nombre: string;
  modelo?: string | null;
  // Manual o ficha del equipo (p. ej. la de SYSCOM).
  enlace?: string | null;
  nota?: string | null;
  bornes: Borne[];
};

export type Punta = { equipo: string; borne: string };

export type ConexionGuia = {
  id: string;
  de: Punta;
  a: Punta;
  // Color del cable: uno de COLORES_CABLE o dos unidos con «/» (blanco/rojo).
  color?: string | null;
  calibre?: string | null;
  nota?: string | null;
};

// Una medición de puesta en marcha con el valor que debe salir.
export type PruebaGuia = {
  id: string;
  texto: string;
  unidad?: string | null;
  min?: number | null;
  max?: number | null;
};

export type FotoGuia = { path: string; pie: string };

export type DatosGuia = {
  equipos: EquipoGuia[];
  conexiones: ConexionGuia[];
  pruebas: PruebaGuia[];
  // Notas del ingeniero y errores comunes.
  notas: string[];
  // «Así debe quedar».
  fotos: FotoGuia[];
};

// Quién marcó y cuándo (el nombre va aquí mismo para no depender de otra consulta).
export type Marca = { por: string; nombre: string; en: string };
export type MarcaPrueba = Marca & { valor: number };

export type AvanceGuia = {
  conexiones: Record<string, Marca>;
  pruebas: Record<string, MarcaPrueba>;
};

export type Guia = {
  id: string;
  nombre: string;
  sistema: string;
  descripcion: string | null;
  es_plantilla: boolean;
  cliente_id: string | null;
  servicio_grupo_id: string | null;
  datos: DatosGuia;
  avance: AvanceGuia;
  creado_por: string;
  creado_en: string;
  actualizado_en: string;
};

// Los sistemas, con los mismos nombres del reporte de servicio.
export const SISTEMAS_GUIA = ['Control de acceso', 'CCTV', 'Alarma&Det', 'Alarma intrusión', 'Paneles solares', 'Automatización', 'Red contra incendio', 'Supresión', 'Inst. eléctricas', 'Otro'] as const;

export function nombreSistema(sistema: string): string {
  return sistema === 'Alarma&Det' ? 'Alarma y detección' : sistema;
}

// ---------- Colores de cable ----------

export const COLORES_CABLE: Record<string, string> = {
  rojo: '#dc2626',
  negro: '#111827',
  blanco: '#f8fafc',
  amarillo: '#eab308',
  azul: '#2563eb',
  verde: '#16a34a',
  naranja: '#ea580c',
  café: '#92400e',
  gris: '#9ca3af',
  morado: '#9333ea',
  rosa: '#ec4899',
};

const COLOR_SIN_DEFINIR = '#64748b';

// «blanco/rojo» → ['#f8fafc', '#dc2626']. Un color que no está en la lista sale gris.
export function tonosDeCable(color: string | null | undefined): string[] {
  if (!color) return [COLOR_SIN_DEFINIR];
  const tonos = color.toLowerCase().split('/').map((parte) => COLORES_CABLE[parte.trim()] || COLOR_SIN_DEFINIR);
  return tonos.slice(0, 2);
}

// ---------- Validación ----------

const texto = (max: number) => z.string().trim().max(max);
const id = z.string().min(1).max(60);

const puntaSchema = z.object({ equipo: id, borne: id });

export const datosGuiaSchema = z.object({
  equipos: z.array(z.object({
    id,
    nombre: texto(60).min(1, 'Ponle nombre al equipo'),
    modelo: texto(80).nullish(),
    enlace: texto(400).nullish(),
    nota: texto(300).nullish(),
    bornes: z.array(z.object({ id, nombre: texto(40).min(1, 'Ponle nombre al borne') })).max(80),
  })).max(30),
  conexiones: z.array(z.object({
    id,
    de: puntaSchema,
    a: puntaSchema,
    color: texto(30).nullish(),
    calibre: texto(20).nullish(),
    nota: texto(200).nullish(),
  })).max(200),
  pruebas: z.array(z.object({
    id,
    texto: texto(160).min(1, 'Describe la prueba'),
    unidad: texto(12).nullish(),
    min: z.number().finite().nullish(),
    max: z.number().finite().nullish(),
  })).max(40),
  notas: z.array(texto(300).min(1)).max(30),
  fotos: z.array(z.object({ path: z.string().max(300), pie: texto(120) })).max(12),
});

export const guiaSchema = z.object({
  nombre: texto(120).min(1, 'Ponle nombre a la guía'),
  sistema: texto(60).min(1, 'Elige el sistema'),
  descripcion: texto(600).nullish(),
});

export const DATOS_VACIOS: DatosGuia = { equipos: [], conexiones: [], pruebas: [], notas: [], fotos: [] };
export const AVANCE_VACIO: AvanceGuia = { conexiones: {}, pruebas: {} };

// Lo que llega de la base (o de una copia vieja) siempre con todas sus partes.
export function leerDatos(valor: unknown): DatosGuia {
  const v = (valor || {}) as Partial<DatosGuia>;
  return {
    equipos: Array.isArray(v.equipos) ? v.equipos.map((e) => ({ ...e, bornes: Array.isArray(e.bornes) ? e.bornes : [] })) : [],
    conexiones: Array.isArray(v.conexiones) ? v.conexiones : [],
    pruebas: Array.isArray(v.pruebas) ? v.pruebas : [],
    notas: Array.isArray(v.notas) ? v.notas : [],
    fotos: Array.isArray(v.fotos) ? v.fotos : [],
  };
}

export function leerAvance(valor: unknown): AvanceGuia {
  const v = (valor || {}) as Partial<AvanceGuia>;
  return { conexiones: { ...(v.conexiones || {}) }, pruebas: { ...(v.pruebas || {}) } };
}

// Conexiones que apuntan a un equipo o borne que ya no existe (se borró al editar).
export function conexionesRotas(datos: DatosGuia): ConexionGuia[] {
  const existe = (p: Punta) => datos.equipos.some((e) => e.id === p.equipo && e.bornes.some((b) => b.id === p.borne));
  return datos.conexiones.filter((c) => !existe(c.de) || !existe(c.a));
}

// ---------- Textos ----------

export function textoPunta(datos: DatosGuia, p: Punta): string {
  const equipo = datos.equipos.find((e) => e.id === p.equipo);
  const borne = equipo?.bornes.find((b) => b.id === p.borne);
  return `${equipo?.nombre || '¿equipo?'} · ${borne?.nombre || '¿borne?'}`;
}

// «Terminal · D6 BTN → Botón de salida · NO, cable amarillo/gris calibre 22»
export function textoConexion(datos: DatosGuia, c: ConexionGuia): string {
  const cable = [c.color ? `cable ${c.color}` : null, c.calibre ? `calibre ${c.calibre}` : null].filter(Boolean).join(' ');
  return `${textoPunta(datos, c.de)} → ${textoPunta(datos, c.a)}${cable ? `, ${cable}` : ''}`;
}

// ---------- Avance y pruebas ----------

export type EstadoPrueba = 'sin-medir' | 'bien' | 'fuera';

export function estadoDePrueba(prueba: PruebaGuia, valor: number | null | undefined): EstadoPrueba {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return 'sin-medir';
  if (prueba.min !== null && prueba.min !== undefined && valor < prueba.min) return 'fuera';
  if (prueba.max !== null && prueba.max !== undefined && valor > prueba.max) return 'fuera';
  return 'bien';
}

// «11 a 14 V», «máx. 5 Ω», «mín. 12 V» o '' si no tiene rango.
export function rangoDePrueba(p: PruebaGuia): string {
  const unidad = p.unidad ? ` ${p.unidad}` : '';
  const hayMin = p.min !== null && p.min !== undefined;
  const hayMax = p.max !== null && p.max !== undefined;
  if (hayMin && hayMax) return `${p.min} a ${p.max}${unidad}`;
  if (hayMin) return `mín. ${p.min}${unidad}`;
  if (hayMax) return `máx. ${p.max}${unidad}`;
  return '';
}

export type Progreso = {
  conexiones: number; conexionesHechas: number;
  pruebas: number; pruebasHechas: number; pruebasFuera: number;
  // 0 a 100, contando conexiones y pruebas.
  porcentaje: number;
  terminado: boolean;
};

export function progresoDe(datos: DatosGuia, avance: AvanceGuia): Progreso {
  const conexionesHechas = datos.conexiones.filter((c) => avance.conexiones[c.id]).length;
  const medidas = datos.pruebas.filter((p) => avance.pruebas[p.id]);
  const pruebasFuera = medidas.filter((p) => estadoDePrueba(p, avance.pruebas[p.id].valor) === 'fuera').length;
  const total = datos.conexiones.length + datos.pruebas.length;
  const hechas = conexionesHechas + medidas.length;
  return {
    conexiones: datos.conexiones.length, conexionesHechas,
    pruebas: datos.pruebas.length, pruebasHechas: medidas.length, pruebasFuera,
    porcentaje: total === 0 ? 0 : Math.round((hechas / total) * 100),
    terminado: total > 0 && hechas === total && pruebasFuera === 0,
  };
}

// ---------- Quién sabe qué ----------

export type Experiencia = { por: string; nombre: string; sistema: string; guias: number; conexiones: number };

// Por técnico y sistema: en cuántas guías participó y cuántas conexiones hizo.
// Sale de las marcas del avance, así que no hay que capturar nada aparte.
export function experienciaPorTecnico(guias: Pick<Guia, 'sistema' | 'avance' | 'es_plantilla'>[]): Experiencia[] {
  const porClave = new Map<string, Experiencia>();
  for (const guia of guias) {
    if (guia.es_plantilla) continue;
    const enEstaGuia = new Map<string, { nombre: string; conexiones: number }>();
    const marcas: Marca[] = [...Object.values(guia.avance.conexiones), ...Object.values(guia.avance.pruebas)];
    for (const marca of marcas) {
      const actual = enEstaGuia.get(marca.por) || { nombre: marca.nombre, conexiones: 0 };
      actual.conexiones += 1;
      enEstaGuia.set(marca.por, actual);
    }
    for (const [por, dato] of enEstaGuia) {
      const clave = `${por}|${guia.sistema}`;
      const acumulado = porClave.get(clave) || { por, nombre: dato.nombre, sistema: guia.sistema, guias: 0, conexiones: 0 };
      acumulado.guias += 1;
      acumulado.conexiones += dato.conexiones;
      porClave.set(clave, acumulado);
    }
  }
  return [...porClave.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || b.guias - a.guias);
}

// ---------- Copiar una plantilla ----------

// La guía nueva arranca con el mismo dibujo y sin nada marcado.
export function copiaDeDatos(datos: DatosGuia): DatosGuia {
  return JSON.parse(JSON.stringify(datos)) as DatosGuia;
}

// ---------- Acomodo del diagrama ----------
//
// El equipo principal (el que más cables tiene: la controladora, la terminal)
// va a la izquierda con sus bornes en columna. Los demás van a la derecha, en
// el orden de los bornes del principal a los que se conectan, para que los
// cables se crucen lo menos posible. Todo en unidades del dibujo (SVG).

export const MEDIDAS_DIAGRAMA = { anchoTotal: 360, anchoPrincipal: 128, anchoOtro: 132, altoBorne: 30, altoTitulo: 34, separacion: 16, margen: 8 };

export type CajaEquipo = { equipo: EquipoGuia; x: number; y: number; ancho: number; alto: number; lado: 'izquierda' | 'derecha' };
export type CableDibujado = { conexion: ConexionGuia; d: string; medio: [number, number] };
export type Acomodo = { cajas: CajaEquipo[]; cables: CableDibujado[]; alto: number; ancho: number };

function cuantasConexiones(datos: DatosGuia, equipoId: string): number {
  return datos.conexiones.filter((c) => c.de.equipo === equipoId || c.a.equipo === equipoId).length;
}

export function equipoPrincipal(datos: DatosGuia): EquipoGuia | null {
  let mejor: EquipoGuia | null = null;
  let mas = -1;
  for (const e of datos.equipos) {
    const n = cuantasConexiones(datos, e.id);
    if (n > mas) {
      mejor = e;
      mas = n;
    }
  }
  return mejor;
}

export function acomodar(datos: DatosGuia): Acomodo {
  const m = MEDIDAS_DIAGRAMA;
  const principal = equipoPrincipal(datos);
  if (!principal) return { cajas: [], cables: [], alto: 0, ancho: m.anchoTotal };
  const altoDe = (e: EquipoGuia) => m.altoTitulo + Math.max(1, e.bornes.length) * m.altoBorne + 6;

  // Renglón (índice) del borne del principal al que se conecta cada equipo, en promedio.
  const renglonMedio = (e: EquipoGuia): number => {
    const indices: number[] = [];
    for (const c of datos.conexiones) {
      const punta = c.de.equipo === principal.id && c.a.equipo === e.id ? c.de : c.a.equipo === principal.id && c.de.equipo === e.id ? c.a : null;
      if (!punta) continue;
      const i = principal.bornes.findIndex((b) => b.id === punta.borne);
      if (i >= 0) indices.push(i);
    }
    if (indices.length === 0) return Number.MAX_SAFE_INTEGER;
    return indices.reduce((suma, i) => suma + i, 0) / indices.length;
  };
  const otros = datos.equipos.filter((e) => e.id !== principal.id);
  const orden = new Map(otros.map((e, i) => [e.id, i]));
  otros.sort((a, b) => renglonMedio(a) - renglonMedio(b) || (orden.get(a.id) || 0) - (orden.get(b.id) || 0));

  const cajas: CajaEquipo[] = [{ equipo: principal, x: m.margen, y: m.margen, ancho: m.anchoPrincipal, alto: altoDe(principal), lado: 'izquierda' }];
  let y = m.margen;
  // Se deja libre una franja a la derecha para los cables entre dos equipos de ese lado.
  const xOtros = m.anchoTotal - m.margen - 22 - m.anchoOtro;
  for (const e of otros) {
    cajas.push({ equipo: e, x: xOtros, y, ancho: m.anchoOtro, alto: altoDe(e), lado: 'derecha' });
    y += altoDe(e) + m.separacion;
  }
  const alto = Math.max(cajas[0].y + cajas[0].alto, y - m.separacion) + m.margen;

  // Dónde queda el centro del renglón de un borne.
  const yDeBorne = (p: Punta): number | null => {
    const caja = cajas.find((c) => c.equipo.id === p.equipo);
    if (!caja) return null;
    const i = caja.equipo.bornes.findIndex((b) => b.id === p.borne);
    if (i < 0) return null;
    return caja.y + m.altoTitulo + i * m.altoBorne + m.altoBorne / 2;
  };

  const cables: CableDibujado[] = [];
  let carril = 0;
  for (const conexion of datos.conexiones) {
    const cajaDe = cajas.find((c) => c.equipo.id === conexion.de.equipo);
    const cajaA = cajas.find((c) => c.equipo.id === conexion.a.equipo);
    const y1 = yDeBorne(conexion.de);
    const y2 = yDeBorne(conexion.a);
    if (!cajaDe || !cajaA || y1 === null || y2 === null) continue;
    if (cajaDe.lado !== cajaA.lado) {
      // De un lado al otro: curva suave entre las dos orillas.
      const izquierda = cajaDe.lado === 'izquierda' ? { caja: cajaDe, y: y1 } : { caja: cajaA, y: y2 };
      const derecha = cajaDe.lado === 'izquierda' ? { caja: cajaA, y: y2 } : { caja: cajaDe, y: y1 };
      const x1 = izquierda.caja.x + izquierda.caja.ancho;
      const x2 = derecha.caja.x;
      const mitad = (x1 + x2) / 2;
      cables.push({ conexion, d: `M ${x1} ${izquierda.y} C ${mitad} ${izquierda.y} ${mitad} ${derecha.y} ${x2} ${derecha.y}`, medio: [mitad, (izquierda.y + derecha.y) / 2] });
    } else {
      // Dos bornes del mismo lado: un corchete por fuera, cada uno en su carril.
      const haciaFuera = cajaDe.lado === 'derecha' ? 1 : -1;
      const orilla = cajaDe.lado === 'derecha' ? cajaDe.x + cajaDe.ancho : cajaDe.x;
      const x = orilla + haciaFuera * (7 + (carril % 3) * 6);
      carril += 1;
      cables.push({ conexion, d: `M ${orilla} ${y1} L ${x} ${y1} L ${x} ${y2} L ${orilla} ${y2}`, medio: [x, (y1 + y2) / 2] });
    }
  }
  return { cajas, cables, alto, ancho: m.anchoTotal };
}
