// El sembrado de regreso a AutoCAD (fase 2): un DXF con los equipos como
// bloques, la tubería por tipo y diámetro, y las conexiones de cada lazo,
// cada cosa en su capa FA-*. Si el plano se subió en DXF, todo cae en las
// coordenadas reales del dibujo: se inserta en 0,0 y queda en su lugar.
// Si vino de PDF, sale a escala real y se acomoda con ALINEAR (ALIGN).
//
// DXF R12 (AC1009): lo abre cualquier AutoCAD. Lógica pura; se prueba en
// lib/exportarPlanoDxf.test.ts.

import { tipoDispositivo } from './lazos';
import { colorEquipo, tamanoDe, tamanoSimbolo, type Plano } from './planos';
import { figuraDe } from './simbolosPlano';
import type { LineaConexion, MarcaConexion } from './conexionesPlano';
import { medidasDeConexion, puntaDeLlegada, puntasDeFlecha, radioDeEquipoEn, trazoDeConexion } from './rutaTuberia';

type P = [number, number];

// De la hoja de la app a unidades del dibujo: X = ox + x·f ; Y = oy − y·f.
export type Colocacion = { ox: number; oy: number; f: number };

// Plano DXF: sus coordenadas reales. Plano PDF: a escala real en las unidades
// elegidas (metros por unidad del dibujo), con el origen en la esquina de abajo.
export function colocacionDe(plano: Pick<Plano, 'formato' | 'dxf' | 'alto' | 'metros_por_unidad'>, metrosPorUnidadDestino: number): Colocacion {
  if (plano.formato === 'dxf' && plano.dxf) return { ox: plano.dxf.x0, oy: plano.dxf.y1, f: plano.dxf.k };
  const f = plano.metros_por_unidad ? plano.metros_por_unidad / metrosPorUnidadDestino : 1;
  return { ox: 0, oy: plano.alto * f, f };
}

// ---------- Capas ----------

// Colores de AutoCAD (ACI).
const ACI_ROJO = 1;
const ACI_NARANJA = 30;
const ACI_AZUL = 5;
const ACI_GRIS = 8;
const ACI_VERDE = 3;

const COLOR_DIAMETRO: Record<string, number> = { '1/2"': 4, '3/4"': 5, '1"': 6, '1 1/4"': 221, '1 1/2"': 30, '2"': 3 };
const COLORES_LAZO = [94, 211, 41, 150, 241, 82, 21, 251];

// AutoCAD no acepta < > / \ " : ; ? * | = ` en nombres.
function nombreValido(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/"/g, '')
    .replace(/\//g, '-')
    .replace(/[<>\\:;?*|=`,]/g, '')
    .replace(/\s+/g, '_')
    .toUpperCase();
}

export function capaDeEquipo(tipo: string): { nombre: string; color: number } {
  const t = tipoDispositivo(tipo);
  if (tipo === 'FACP') return { nombre: 'FA-PANEL', color: ACI_VERDE };
  if (t.forma === 'caja' || t.forma === 'fin') return { nombre: 'FA-CAJAS', color: ACI_GRIS };
  const color = colorEquipo(tipo);
  if (color === '#2563eb') return { nombre: 'FA-VOCEO', color: ACI_AZUL };
  if (color === '#ea580c') return { nombre: 'FA-NOTIFICACION', color: ACI_NARANJA };
  return { nombre: 'FA-DETECCION', color: ACI_ROJO };
}

export function capaDeTuberia(tipo: string, diametro: string): { nombre: string; color: number } {
  return { nombre: `FA-TUB-${nombreValido(tipo)}-${nombreValido(diametro)}`, color: COLOR_DIAMETRO[diametro] || 7 };
}

export function nombreBloque(tipo: string): string {
  return `FA_${nombreValido(tipo)}`;
}

// ---------- Trazos SVG del símbolo → polilíneas ----------

// Arco SVG (círculo) de a a b, en puntos (fórmula del estándar SVG F.6.5).
function arcoSvg(a: P, r: number, grande: boolean, horario: boolean, b: P): P[] {
  const dx = (a[0] - b[0]) / 2;
  const dy = (a[1] - b[1]) / 2;
  const d2 = dx * dx + dy * dy;
  if (d2 === 0) return [b];
  const radio = Math.max(r, Math.sqrt(d2));
  let factor = Math.sqrt(Math.max(0, (radio * radio - d2) / d2));
  if (grande === horario) factor = -factor;
  const cx = factor * dy + (a[0] + b[0]) / 2;
  const cy = -factor * dx + (a[1] + b[1]) / 2;
  const inicio = Math.atan2(a[1] - cy, a[0] - cx);
  let barrido = Math.atan2(b[1] - cy, b[0] - cx) - inicio;
  if (horario && barrido < 0) barrido += Math.PI * 2;
  if (!horario && barrido > 0) barrido -= Math.PI * 2;
  const pasos = Math.max(4, Math.ceil((Math.abs(barrido) / (Math.PI * 2)) * 32));
  const puntos: P[] = [];
  for (let i = 1; i <= pasos; i++) {
    const t = inicio + (barrido * i) / pasos;
    puntos.push([cx + radio * Math.cos(t), cy + radio * Math.sin(t)]);
  }
  puntos[puntos.length - 1] = b;
  return puntos;
}

// Un trazo de simbolosPlano (M, L, A, Z en coordenadas absolutas) en
// polilíneas. Devuelve cada figura con si va cerrada.
export function trazoAPolilineas(d: string): { puntos: P[]; cerrada: boolean }[] {
  const fichas = d.match(/[MLAZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const figuras: { puntos: P[]; cerrada: boolean }[] = [];
  let actual: P[] = [];
  let i = 0;
  const num = () => Number(fichas[i++]);
  while (i < fichas.length) {
    const comando = fichas[i++].toUpperCase();
    if (comando === 'M') {
      if (actual.length > 1) figuras.push({ puntos: actual, cerrada: false });
      actual = [[num(), num()]];
    } else if (comando === 'L') {
      actual.push([num(), num()]);
    } else if (comando === 'A') {
      const r = num();
      num(); // radio y (son círculos)
      num(); // giro
      const grande = num() === 1;
      const horario = num() === 1;
      const fin: P = [num(), num()];
      actual.push(...arcoSvg(actual[actual.length - 1], r, grande, horario, fin));
    } else if (comando === 'Z') {
      if (actual.length > 1) figuras.push({ puntos: actual, cerrada: true });
      actual = [];
    }
  }
  if (actual.length > 1) figuras.push({ puntos: actual, cerrada: false });
  return figuras;
}

// ---------- Escritura del DXF ----------

class Dxf {
  private lineas: string[] = [];

  par(codigo: number, valor: string | number) {
    const texto = typeof valor === 'number' ? numeroDxf(valor) : valor;
    this.lineas.push(String(codigo), texto);
  }

  polilinea(capa: string, puntos: P[], cerrada: boolean, extra: [number, number | string][] = []) {
    this.par(0, 'POLYLINE');
    this.par(8, capa);
    for (const [c, v] of extra) this.par(c, v);
    this.par(66, 1);
    this.par(70, cerrada ? 1 : 0);
    this.par(10, 0);
    this.par(20, 0);
    this.par(30, 0);
    for (const [x, y] of puntos) {
      this.par(0, 'VERTEX');
      this.par(8, capa);
      this.par(10, x);
      this.par(20, y);
      this.par(30, 0);
    }
    this.par(0, 'SEQEND');
    this.par(8, capa);
  }

  texto(capa: string, x: number, y: number, alto: number, texto: string, centrado: boolean, giro = 0, extra: [number, number | string][] = []) {
    this.par(0, 'TEXT');
    this.par(8, capa);
    for (const [c, v] of extra) this.par(c, v);
    this.par(10, x);
    this.par(20, y);
    this.par(30, 0);
    this.par(40, alto);
    this.par(1, texto);
    if (giro) this.par(50, giro);
    if (centrado) {
      this.par(72, 1);
      this.par(11, x);
      this.par(21, y);
      this.par(31, 0);
      this.par(73, 2);
    }
  }

  // AutoCAD R12 lee el texto en Windows-1252 (acentos y ñ caben ahí).
  bytes(): Uint8Array {
    const texto = this.lineas.join('\r\n') + '\r\n';
    const salida = new Uint8Array(texto.length);
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      salida[i] = c <= 0xff ? c : 63; // «?» si no cabe
    }
    return salida;
  }
}

function numeroDxf(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number(n.toFixed(6)).toString();
}

export type DatosDxf = {
  plano: Plano;
  colocacion: Colocacion;
  // Dirección o nombre junto a cada equipo (como en pantalla).
  etiquetaDe: (equipoId: string) => string;
  conexiones?: { lineas: LineaConexion[]; marcas: MarcaConexion[] };
  lazos?: { id: string; codigo: string }[];
};

export function exportarPlanoDxf({ plano, colocacion, etiquetaDe, conexiones, lazos = [] }: DatosDxf): Uint8Array {
  const { ox, oy, f } = colocacion;
  const X = (x: number) => ox + x * f;
  const Y = (y: number) => oy - y * f;
  const rBase = (tamanoSimbolo(plano.ancho, plano.alto) / 2) * f;
  const { equipos, tuberias } = plano.sembrado;

  // Capas que se usan.
  const capas = new Map<string, { color: number; tipoLinea: string }>();
  capas.set('FA-TEXTO', { color: 7, tipoLinea: 'CONTINUOUS' });
  for (const e of equipos) {
    const c = capaDeEquipo(e.tipo);
    capas.set(c.nombre, { color: c.color, tipoLinea: 'CONTINUOUS' });
  }
  for (const t of tuberias) {
    const c = capaDeTuberia(t.tipo, t.diametro);
    capas.set(c.nombre, { color: c.color, tipoLinea: 'CONTINUOUS' });
  }
  const capaLazo = new Map<string, string>();
  lazos.forEach((l, i) => {
    const nombre = `FA-LAZO-${nombreValido(l.codigo)}`;
    capaLazo.set(l.id, nombre);
    if (conexiones && [...conexiones.lineas, ...conexiones.marcas].some((c) => c.lazoId === l.id)) {
      capas.set(nombre, { color: COLORES_LAZO[i % COLORES_LAZO.length], tipoLinea: 'DASHED' });
    }
  });

  const dxf = new Dxf();

  // Encabezado.
  dxf.par(0, 'SECTION');
  dxf.par(2, 'HEADER');
  dxf.par(9, '$ACADVER');
  dxf.par(1, 'AC1009');
  dxf.par(9, '$DWGCODEPAGE');
  dxf.par(3, 'ANSI_1252');
  dxf.par(9, '$INSBASE');
  dxf.par(10, 0);
  dxf.par(20, 0);
  dxf.par(30, 0);
  dxf.par(9, '$LTSCALE');
  dxf.par(40, 1);
  dxf.par(0, 'ENDSEC');

  // Tablas: tipos de línea, capas y estilo de texto.
  dxf.par(0, 'SECTION');
  dxf.par(2, 'TABLES');
  dxf.par(0, 'TABLE');
  dxf.par(2, 'LTYPE');
  dxf.par(70, 2);
  dxf.par(0, 'LTYPE');
  dxf.par(2, 'CONTINUOUS');
  dxf.par(70, 0);
  dxf.par(3, 'Solid line');
  dxf.par(72, 65);
  dxf.par(73, 0);
  dxf.par(40, 0);
  // Guiones del tamaño de los símbolos, para que se vean a la escala del plano.
  dxf.par(0, 'LTYPE');
  dxf.par(2, 'DASHED');
  dxf.par(70, 0);
  dxf.par(3, '__ __ __ __');
  dxf.par(72, 65);
  dxf.par(73, 2);
  dxf.par(40, rBase * 1.5);
  dxf.par(49, rBase);
  dxf.par(49, -rBase * 0.5);
  dxf.par(0, 'ENDTAB');

  dxf.par(0, 'TABLE');
  dxf.par(2, 'LAYER');
  dxf.par(70, capas.size + 1);
  dxf.par(0, 'LAYER');
  dxf.par(2, '0');
  dxf.par(70, 0);
  dxf.par(62, 7);
  dxf.par(6, 'CONTINUOUS');
  for (const [nombre, { color, tipoLinea }] of capas) {
    dxf.par(0, 'LAYER');
    dxf.par(2, nombre);
    dxf.par(70, 0);
    dxf.par(62, color);
    dxf.par(6, tipoLinea);
  }
  dxf.par(0, 'ENDTAB');

  dxf.par(0, 'TABLE');
  dxf.par(2, 'STYLE');
  dxf.par(70, 1);
  dxf.par(0, 'STYLE');
  dxf.par(2, 'STANDARD');
  dxf.par(70, 0);
  dxf.par(40, 0);
  dxf.par(41, 1);
  dxf.par(50, 0);
  dxf.par(71, 0);
  dxf.par(42, 2.5);
  dxf.par(3, 'txt');
  dxf.par(4, '');
  dxf.par(0, 'ENDTAB');
  dxf.par(0, 'ENDSEC');

  // Bloques: un símbolo por tipo, de radio 1, en la capa 0 y color «por
  // bloque» para que tome el color de la capa donde se inserta.
  dxf.par(0, 'SECTION');
  dxf.par(2, 'BLOCKS');
  const tipos = [...new Set(equipos.map((e) => e.tipo))];
  for (const tipo of tipos) {
    const nombre = nombreBloque(tipo);
    dxf.par(0, 'BLOCK');
    dxf.par(8, '0');
    dxf.par(2, nombre);
    dxf.par(70, 0);
    dxf.par(10, 0);
    dxf.par(20, 0);
    dxf.par(30, 0);
    dxf.par(3, nombre);
    const figura = figuraDe(tipo);
    for (const t of figura.trazos) {
      for (const fig of trazoAPolilineas(t.d)) {
        // El símbolo está con y hacia abajo; en AutoCAD y va hacia arriba.
        dxf.polilinea('0', fig.puntos.map(([x, y]) => [x, -y] as P), fig.cerrada, [[62, 0]]);
      }
    }
    for (const l of figura.letras) dxf.texto('0', l.x, -l.y, l.tam * 0.75, l.texto, true, 0, [[62, 0]]);
    dxf.par(0, 'ENDBLK');
    dxf.par(8, '0');
  }
  dxf.par(0, 'ENDSEC');

  // Lo dibujado.
  dxf.par(0, 'SECTION');
  dxf.par(2, 'ENTITIES');

  for (const t of tuberias) {
    dxf.polilinea(capaDeTuberia(t.tipo, t.diametro).nombre, t.puntos.map(([x, y]) => [X(x), Y(y)] as P), false);
  }

  if (conexiones) {
    const radioEn = radioDeEquipoEn(equipos, rBase);
    for (const l of conexiones.lineas) {
      const capa = capaLazo.get(l.lazoId) || 'FA-LAZO';
      // Por la tubería si la hay, con flechas delgadas a lo largo (como en pantalla).
      const camino = l.camino.map(([x, y]) => [X(x), Y(y)] as P);
      // Las puntas se recortan a la orilla de cada equipo: la llegada lleva punta grande.
      const m = medidasDeConexion(radioEn(l.desde), radioEn(l.hasta));
      const trazo = trazoDeConexion(camino, m.inicio, m.cada, m.fin);
      if (!trazo) continue;
      dxf.polilinea(capa, trazo.linea, false);
      for (const f of trazo.flechas) dxf.polilinea(capa, puntasDeFlecha(f, m.flecha), true, [[6, 'CONTINUOUS']]);
      dxf.polilinea(capa, puntaDeLlegada(trazo.llegada, m.punta), true, [[6, 'CONTINUOUS']]);
    }
    for (const m of conexiones.marcas) {
      dxf.texto(capaLazo.get(m.lazoId) || 'FA-TEXTO', X(m.en[0]), Y(m.en[1]) - rBase * 2.3, rBase * 0.85, m.texto.replace(/[«»]/g, '').trim(), true);
    }
  }

  for (const e of equipos) {
    const r = rBase * tamanoDe(e);
    const x = X(e.x);
    const y = Y(e.y);
    dxf.par(0, 'INSERT');
    dxf.par(8, capaDeEquipo(e.tipo).nombre);
    dxf.par(2, nombreBloque(e.tipo));
    dxf.par(10, x);
    dxf.par(20, y);
    dxf.par(30, 0);
    dxf.par(41, r);
    dxf.par(42, r);
    dxf.par(43, r);
    // En la app el giro es en el sentido de las manecillas; en AutoCAD, al revés.
    if (e.rotacion) dxf.par(50, (360 - e.rotacion) % 360);
    const etiqueta = etiquetaDe(e.id);
    if (etiqueta) dxf.texto('FA-TEXTO', x + r * 1.25, y + r * 0.75, r * 0.85, etiqueta, false);
  }

  dxf.par(0, 'ENDSEC');
  dxf.par(0, 'EOF');
  return dxf.bytes();
}
