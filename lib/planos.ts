// Planos con sembrado de equipos y canalización: lógica que no habla con la
// base (se prueba en lib/planos.test.ts). Los datos están en
// lib/planosDatos.ts y el esquema en supabase/patch_lazos_planos.sql.
//
// Todas las coordenadas van en PUNTOS de la hoja del PDF (1 punto = 1/72 de
// pulgada), con el origen arriba a la izquierda y la «y» hacia abajo, como
// se ve en pantalla. Así lo sembrado no depende de la imagen ni del zoom.

import { z } from 'zod';
import { TIPOS_POR_CIRCUITO, tipoDispositivo } from './lazos';

export type Punto = [number, number];

export type EquipoPlano = {
  id: string;
  tipo: string;
  x: number;
  y: number;
  // Dispositivo del lazo que representa (si se sembró desde un lazo).
  elementoId?: string | null;
  // Texto junto al símbolo (dirección o nombre corto).
  etiqueta?: string | null;
};

export type TuberiaPlano = {
  id: string;
  tipo: string;
  diametro: string;
  puntos: Punto[];
};

export type Sembrado = { equipos: EquipoPlano[]; tuberias: TuberiaPlano[] };

export type Plano = {
  id: string;
  cliente_id: string;
  nombre: string;
  pdf_path: string;
  imagen_path: string;
  pagina: number;
  ancho: number;
  alto: number;
  metros_por_unidad: number | null;
  sembrado: Sembrado;
  creado_en: string;
  actualizado_en: string;
};

export const SEMBRADO_VACIO: Sembrado = { equipos: [], tuberias: [] };

// ---------- Catálogos ----------

export const TIPOS_TUBERIA = ['EMT', 'PVC', 'Flexible', 'Galvanizada', 'Charola'] as const;
export const DIAMETROS = ['1/2"', '3/4"', '1"', '1 1/4"', '1 1/2"', '2"'] as const;

// Un color por diámetro para distinguirlos en el plano y en el PDF.
const COLOR_DIAMETRO: Record<string, string> = {
  '1/2"': '#0ea5e9',
  '3/4"': '#2563eb',
  '1"': '#7c3aed',
  '1 1/4"': '#db2777',
  '1 1/2"': '#ea580c',
  '2"': '#65a30d',
};

export function colorTuberia(diametro: string): string {
  return COLOR_DIAMETRO[diametro] || '#475569';
}

// Equipos que se pueden sembrar: los mismos códigos de los lazos, sin repetir.
export function tiposSembrables(): { codigo: string; nombre: string }[] {
  const vistos = new Set<string>();
  const lista: { codigo: string; nombre: string }[] = [];
  for (const tipos of Object.values(TIPOS_POR_CIRCUITO)) {
    for (const t of tipos) {
      if (vistos.has(t.codigo)) continue;
      vistos.add(t.codigo);
      lista.push({ codigo: t.codigo, nombre: t.nombre });
    }
  }
  return lista;
}

// Color del símbolo según el sistema: detección rojo, notificación naranja,
// voceo azul, cajas gris.
export function colorEquipo(tipo: string): string {
  const forma = tipoDispositivo(tipo).forma;
  if (forma === 'caja' || forma === 'fin') return '#64748b';
  if (TIPOS_POR_CIRCUITO.voceo.some((t) => t.codigo === tipo)) return '#2563eb';
  if (TIPOS_POR_CIRCUITO.estrobos.some((t) => t.codigo === tipo)) return '#ea580c';
  return '#dc2626';
}

// Tamaño de los símbolos: proporcional a la hoja, para que en una carta y
// en un doble carta se vean igual de grandes respecto al dibujo.
export function tamanoSimbolo(ancho: number, alto: number): number {
  return Math.max(ancho, alto) / 110;
}

// ---------- Escala ----------

const METROS_POR_PUNTO_IMPRESO = 0.0254 / 72;

// Escala impresa 1:N → metros reales por punto de la hoja.
export function escalaDesdeProporcion(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * METROS_POR_PUNTO_IMPRESO;
}

// Al revés, para mostrar «1:100» si se calibró con una medida.
export function proporcionDeEscala(metrosPorUnidad: number): number {
  return Math.round(metrosPorUnidad / METROS_POR_PUNTO_IMPRESO);
}

export function distancia(a: Punto, b: Punto): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

// Calibrar con dos puntos de una medida conocida (una puerta de 0.90 m).
export function escalaDesdeMedida(a: Punto, b: Punto, metros: number): number | null {
  const enHoja = distancia(a, b);
  if (enHoja <= 0 || !Number.isFinite(metros) || metros <= 0) return null;
  return metros / enHoja;
}

// ---------- Medidas y cantidades ----------

export function longitudEnHoja(puntos: Punto[]): number {
  let total = 0;
  for (let i = 1; i < puntos.length; i++) total += distancia(puntos[i - 1], puntos[i]);
  return total;
}

export function metrosDeTuberia(t: TuberiaPlano, metrosPorUnidad: number | null): number | null {
  if (!metrosPorUnidad) return null;
  return longitudEnHoja(t.puntos) * metrosPorUnidad;
}

export type CantidadEquipo = { tipo: string; nombre: string; cuantos: number };
export type CantidadTuberia = { tipo: string; diametro: string; tramos: number; metros: number | null };

export function cantidadesDeEquipos(sembrado: Sembrado): CantidadEquipo[] {
  const porTipo = new Map<string, number>();
  for (const e of sembrado.equipos) porTipo.set(e.tipo, (porTipo.get(e.tipo) || 0) + 1);
  const lista: CantidadEquipo[] = [];
  for (const [tipo, cuantos] of porTipo) lista.push({ tipo, nombre: tipoDispositivo(tipo).nombre, cuantos });
  return lista.sort((a, b) => b.cuantos - a.cuantos || a.nombre.localeCompare(b.nombre, 'es'));
}

// Metros por tipo y diámetro. Sin escala solo cuenta los tramos.
export function cantidadesDeTuberia(sembrado: Sembrado, metrosPorUnidad: number | null): CantidadTuberia[] {
  const porClave = new Map<string, CantidadTuberia>();
  for (const t of sembrado.tuberias) {
    const clave = `${t.tipo}|${t.diametro}`;
    const fila = porClave.get(clave) || { tipo: t.tipo, diametro: t.diametro, tramos: 0, metros: metrosPorUnidad ? 0 : null };
    fila.tramos += 1;
    const metros = metrosDeTuberia(t, metrosPorUnidad);
    if (fila.metros !== null && metros !== null) fila.metros += metros;
    porClave.set(clave, fila);
  }
  const ordenDiametro = (d: string) => (DIAMETROS as readonly string[]).indexOf(d);
  return [...porClave.values()].sort((a, b) => a.tipo.localeCompare(b.tipo, 'es') || ordenDiametro(a.diametro) - ordenDiametro(b.diametro));
}

export function formatoMetros(metros: number): string {
  return `${metros.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
}

// ---------- Validación ----------
// Se valida antes de guardar: el jsonb no tiene esquema en la base.

const numeroEnHoja = z.number().finite().min(-100000).max(100000);
const puntoSchema = z.tuple([numeroEnHoja, numeroEnHoja]);

export const sembradoSchema = z.object({
  equipos: z.array(z.object({
    id: z.string().min(1).max(40),
    tipo: z.string().min(1).max(6),
    x: numeroEnHoja,
    y: numeroEnHoja,
    elementoId: z.string().uuid().nullish(),
    etiqueta: z.string().max(40).nullish(),
  })).max(3000),
  tuberias: z.array(z.object({
    id: z.string().min(1).max(40),
    tipo: z.string().min(1).max(20),
    diametro: z.string().min(1).max(12),
    puntos: z.array(puntoSchema).min(2).max(500),
  })).max(2000),
});

// Lo que viene de la base o de una copia local, siempre con las dos listas.
export function leerSembrado(valor: unknown): Sembrado {
  const resultado = sembradoSchema.safeParse(valor);
  if (resultado.success) return resultado.data as Sembrado;
  return { equipos: [], tuberias: [] };
}

export const nombrePlanoSchema = z.string().trim().min(1, 'Ponle nombre al plano, por ejemplo «Planta baja».').max(80, 'Máximo 80 letras.');

// ---------- Ayudas para el editor ----------

// El equipo más cercano a un punto, dentro de un radio (para tocarlo).
export function equipoEn(sembrado: Sembrado, p: Punto, radio: number): EquipoPlano | null {
  let mejor: EquipoPlano | null = null;
  let mejorDistancia = radio;
  for (const e of sembrado.equipos) {
    const d = distancia(p, [e.x, e.y]);
    if (d <= mejorDistancia) {
      mejor = e;
      mejorDistancia = d;
    }
  }
  return mejor;
}

// Distancia de un punto a un segmento (para tocar una tubería).
function distanciaASegmento(p: Punto, a: Punto, b: Punto): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const largo2 = dx * dx + dy * dy;
  if (largo2 === 0) return distancia(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo2;
  t = Math.max(0, Math.min(1, t));
  return distancia(p, [a[0] + t * dx, a[1] + t * dy]);
}

export function tuberiaEn(sembrado: Sembrado, p: Punto, radio: number): TuberiaPlano | null {
  for (let i = sembrado.tuberias.length - 1; i >= 0; i--) {
    const t = sembrado.tuberias[i];
    for (let j = 1; j < t.puntos.length; j++) {
      if (distanciaASegmento(p, t.puntos[j - 1], t.puntos[j]) <= radio) return t;
    }
  }
  return null;
}

// Al dibujar tubería: si el punto queda casi horizontal o vertical respecto
// al anterior, se endereza (la tubería casi siempre va a escuadra).
export function aEscuadra(anterior: Punto, p: Punto, tolerancia = 0.08): Punto {
  const dx = Math.abs(p[0] - anterior[0]);
  const dy = Math.abs(p[1] - anterior[1]);
  if (dy <= dx * tolerancia) return [p[0], anterior[1]];
  if (dx <= dy * tolerancia) return [anterior[0], p[1]];
  return p;
}

// Se cambia al girar la hoja: dónde se dibuja la página del PDF original en
// la hoja nueva para que se vea como en pantalla (pdf-lib gira contra reloj).
export function colocacionDePagina(rotacion: number, anchoOriginal: number, altoOriginal: number): { x: number; y: number; giro: number } {
  const r = ((rotacion % 360) + 360) % 360;
  if (r === 90) return { x: 0, y: anchoOriginal, giro: -90 };
  if (r === 180) return { x: anchoOriginal, y: altoOriginal, giro: 180 };
  if (r === 270) return { x: altoOriginal, y: 0, giro: 90 };
  return { x: 0, y: 0, giro: 0 };
}
