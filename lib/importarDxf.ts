// Pasar los dispositivos de un DXF a la app: los bloques de AutoCAD
// (detector, estación manual…) se vuelven equipos sembrados que se pueden
// mover y editar, y el texto de la dirección que está junto a cada uno
// (p. ej. «L01D017») queda como su etiqueta. Lo que se importa se quita del
// fondo para que no salga dos veces.
// Lógica pura; se prueba en lib/importarDxf.test.ts.

import { primitivasDe, textoLimpio, type DxfLeido } from './leerDxf';
import { PANEL_EN_PLANO, tipoDispositivo } from './lazos';
import { BLOQUE_DE_TIPO } from './simbolosPlano';
import { TAMANOS_SIMBOLO, tamanoSimbolo, type EquipoPlano } from './planos';
import type { TransformacionDxf } from './dibujarDxf';

type Entidad = DxfLeido['entidades'][number];

function valor(e: Entidad, codigo: number): string | undefined {
  return e.pares.find(([c]) => c === codigo)?.[1];
}

function numero(e: Entidad, codigo: number, porOmision = 0): number {
  const n = Number(valor(e, codigo));
  return valor(e, codigo) !== undefined && Number.isFinite(n) ? n : porOmision;
}

// Lo que cuenta: espacio modelo y capas encendidas.
function seUsa(dxf: DxfLeido, e: Entidad): boolean {
  if (numero(e, 67) === 1) return false;
  const capa = valor(e, 8) || '0';
  return !dxf.capas.get(capa)?.apagada;
}

// ---------- Bloques ----------

export type BloqueEncontrado = { nombre: string; cuantos: number; sugerido: string | null };

// Tipo de la app según el nombre del bloque. Los que exporta la app se
// llaman FA_<código>, así un DXF exportado vuelve igual.
const PISTAS: [RegExp, string][] = [
  [/HUMO|PHOTO(?!BEAM)|FOTO|SMOKE|OPTIC/, 'SH'],
  [/CALOR|HEAT|TERM/, 'SC'],
  [/EMAN|ESTACI|PULL|MANUAL/, 'EMA'],
  [/SIRENA.*ESTROB|HORN.*STROBE/, 'SE'],
  [/BOCINA.*ESTROB|SPEAKER.*STROBE/, 'BE'],
  [/ESTROB|STROBE/, 'ES'],
  [/SIRENA|CORNETA|HORN/, 'CO'],
  [/BOCINA|SPEAKER/, 'BO'],
  [/AISLA|ISOLAT/, 'AIS'],
  [/RELEV|RELAY/, 'CR'],
  [/MONITOR/, 'MM'],
  [/MODULO.*CONTROL|CONTROL.*MOD/, 'MC'],
];

export function tipoSugerido(nombreBloque: string): string | null {
  const nombre = nombreBloque.toUpperCase();
  const propio = /^FA_([A-Z]+)$/.exec(nombre);
  if (propio && tipoDispositivo(propio[1]).codigo === propio[1]) return propio[1];
  // Los bloques de la simbología de Clave, por su nombre exacto.
  const deLaSimbologia = Object.keys(BLOQUE_DE_TIPO).find((tipo) => BLOQUE_DE_TIPO[tipo] === nombre);
  if (deLaSimbologia && deLaSimbologia !== PANEL_EN_PLANO) return deLaSimbologia;
  for (const [patron, codigo] of PISTAS) if (patron.test(nombre)) return codigo;
  return null;
}

// Bloques insertados en el dibujo, los que parecen dispositivos primero.
export function bloquesDelDxf(dxf: DxfLeido): BloqueEncontrado[] {
  const cuenta = new Map<string, number>();
  for (const e of dxf.entidades) {
    if (e.tipo !== 'INSERT' || !seUsa(dxf, e)) continue;
    const nombre = valor(e, 2) || '';
    // Los anónimos (*U, *D…) son cotas o bloques dinámicos sin nombre útil.
    if (!nombre || nombre.startsWith('*')) continue;
    cuenta.set(nombre, (cuenta.get(nombre) || 0) + 1);
  }
  const lista = [...cuenta].map(([nombre, cuantos]) => ({ nombre, cuantos, sugerido: tipoSugerido(nombre) }));
  return lista.sort((a, b) => Number(!!b.sugerido) - Number(!!a.sugerido) || b.cuantos - a.cuantos);
}

// ---------- Direcciones ----------

// Una dirección lleva números y letras o guion, sin espacios: L01D017,
// 1D045, M1-12. Los números solos («04», «23») suelen ser cuartos o ejes.
export function pareceDireccion(texto: string): boolean {
  const t = texto.trim().toUpperCase();
  return t.length >= 4 && t.length <= 12 && /^[A-Z]*\d*[A-Z-]+\d+$/.test(t);
}

// Si la dirección dice D (detector) o M (módulo) antes del número, solo se
// le da a un equipo de esa clase.
function claseCompatible(direccion: string, tipo: string): boolean {
  const letra = /([A-Z])\d+$/.exec(direccion.toUpperCase())?.[1];
  const esDetector = tipoDispositivo(tipo).forma === 'detector';
  if (letra === 'D') return esDetector;
  if (letra === 'M') return !esDetector;
  return true;
}

type TextoDireccion = { indice: number; texto: string; x: number; y: number; alto: number };

function centroDelTexto(dxf: DxfLeido, e: Entidad): Omit<TextoDireccion, 'indice'> | null {
  const [p] = primitivasDe({ ...dxf, entidades: [e] });
  if (!p || p.tipo !== 'texto' || !pareceDireccion(p.texto)) return null;
  // Ancho aproximado de la letra: 0.6 del alto.
  const ancho = p.texto.length * p.alto * 0.6;
  const ux = Math.cos(p.angulo);
  const uy = Math.sin(p.angulo);
  const a = (0.5 - p.anclaX) * ancho;
  const b = (p.anclaY - 0.5) * p.alto;
  return { texto: p.texto.trim(), x: p.x + ux * a - uy * b, y: p.y + uy * a + ux * b, alto: p.alto };
}

// ---------- Importar ----------

// `medida`: lo que mide el símbolo en el dibujo, para que en la app salga
// del mismo tamaño (se quita al pasar a la hoja).
export type EquipoImportado = EquipoPlano & { medida: number };

export type Importado = {
  equipos: EquipoImportado[];
  conDireccion: number;
  // Índices de dxf.entidades ya convertidos (se quitan del fondo).
  usadas: Set<number>;
};

// `tipoPorBloque`: nombre del bloque → código de la app (los que no
// están, no se importan). Los equipos salen en coordenadas del DIBUJO;
// `pasarAHoja` los lleva a la hoja cuando ya se sabe cómo queda el fondo.
export function importarDispositivos(dxf: DxfLeido, tipoPorBloque: Map<string, string>, nuevoId: () => string): Importado {
  type Disp = { indice: number; tipo: string; X: number; Y: number; giro: number; medida: number };
  const dispositivos: Disp[] = [];
  dxf.entidades.forEach((e, indice) => {
    if (e.tipo !== 'INSERT' || !seUsa(dxf, e)) return;
    const tipo = tipoPorBloque.get(valor(e, 2) || '');
    if (!tipo) return;
    let X = numero(e, 10);
    let giro = numero(e, 50);
    // Bloque en espejo (extrusión hacia abajo): la X va al revés.
    if (numero(e, 230, 1) < 0) {
      X = -X;
      giro = 180 - giro;
    }
    dispositivos.push({ indice, tipo, X, Y: numero(e, 20), giro, medida: medidaDe(dxf, e) });
  });

  const textos: TextoDireccion[] = [];
  dxf.entidades.forEach((e, indice) => {
    if ((e.tipo !== 'TEXT' && e.tipo !== 'MTEXT') || !seUsa(dxf, e)) return;
    // Rápido: descarta lo que de plano no es dirección antes de calcular.
    if (!pareceDireccion(textoLimpio(valor(e, 1) || ''))) return;
    const centro = centroDelTexto(dxf, e);
    if (centro) textos.push({ indice, ...centro });
  });

  // Cada dirección a un solo equipo y viceversa, empezando por las parejas
  // más cercanas. Más lejos de 6 alturas de letra ya no es suya.
  const parejas: { d: number; t: number; distancia: number }[] = [];
  dispositivos.forEach((p, d) => {
    if (!tipoDispositivo(p.tipo).conDireccion) return;
    textos.forEach((x, t) => {
      if (!claseCompatible(x.texto, p.tipo)) return;
      const distancia = Math.hypot(x.x - p.X, x.y - p.Y);
      if (distancia <= x.alto * 6) parejas.push({ d, t, distancia });
    });
  });
  parejas.sort((a, b) => a.distancia - b.distancia);
  const direccionDe = new Map<number, number>();
  const textoUsado = new Set<number>();
  for (const { d, t } of parejas) {
    if (direccionDe.has(d) || textoUsado.has(t)) continue;
    direccionDe.set(d, t);
    textoUsado.add(t);
  }

  const usadas = new Set<number>();
  const equipos = dispositivos.map((p, d): EquipoImportado => {
    usadas.add(p.indice);
    const t2 = direccionDe.get(d);
    if (t2 !== undefined) usadas.add(textos[t2].indice);
    // AutoCAD gira contra las manecillas; la app, a favor.
    const rotacion = Math.round((((360 - p.giro) % 360) + 360) % 360 * 10) / 10;
    return {
      id: nuevoId(),
      tipo: p.tipo,
      x: p.X,
      y: p.Y,
      etiqueta: t2 === undefined ? null : textos[t2].texto,
      rotacion: rotacion === 0 || rotacion === 360 ? null : rotacion,
      medida: p.medida,
    };
  });
  return { equipos, conDireccion: direccionDe.size, usadas };
}

// Lado mayor del símbolo ya colocado (con su escala), en unidades del dibujo.
function medidaDe(dxf: DxfLeido, e: Entidad): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of primitivasDe({ ...dxf, entidades: [e] })) {
    if (p.tipo !== 'trazo') continue;
    for (const [x, y] of p.puntos) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length === 0) return 0;
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

// El paso de tamaño de la app más parecido al del dibujo (1 = normal).
function tamanoParecido(medidaEnHoja: number, normal: number): number | null {
  if (!(medidaEnHoja > 0)) return null;
  const buscado = medidaEnHoja / normal;
  let mejor: number = TAMANOS_SIMBOLO[0];
  for (const t of TAMANOS_SIMBOLO) if (Math.abs(Math.log(t / buscado)) < Math.abs(Math.log(mejor / buscado))) mejor = t;
  return mejor === 1 ? null : mejor;
}

// Del dibujo a la hoja: x = (X − x0)/k ; y = (y1 − Y)/k. El símbolo toma el
// tamaño que tenía en AutoCAD.
export function pasarAHoja(equipos: EquipoImportado[], t: TransformacionDxf, hoja: { ancho: number; alto: number }): EquipoPlano[] {
  const normal = tamanoSimbolo(hoja.ancho, hoja.alto);
  return equipos.map(({ medida, ...e }) => ({
    ...e,
    x: (e.x - t.x0) / t.k,
    y: (t.y1 - e.y) / t.k,
    tamano: tamanoParecido(medida / t.k, normal),
  }));
}

// El dibujo sin lo que ya se importó.
export function sinImportados(dxf: DxfLeido, usadas: Set<number>): DxfLeido {
  if (usadas.size === 0) return dxf;
  return { ...dxf, entidades: dxf.entidades.filter((_, i) => !usadas.has(i)) };
}
