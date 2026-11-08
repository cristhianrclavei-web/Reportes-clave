// Lector de DXF de AutoCAD para usarlo como plano (fase 2). Sin librerías:
// el DXF es texto en pares «código / valor». De aquí sale una lista de trazos
// y textos en coordenadas reales del dibujo, cada uno con sus capas, para
// dibujarlo (lib/dibujarDxf.ts) y apagar capas como en AutoCAD.
//
// Se dibuja lo que sirve para sembrar: líneas, polilíneas, arcos, círculos,
// elipses, splines, textos y bloques (con giro, escala, espejo y anidados).
// Se omiten achurados (HATCH), imágenes y lo del espacio papel.
// Lógica pura; se prueba en lib/leerDxf.test.ts.

export type Par = [number, string];
export type PuntoDxf = [number, number];

type Entidad = { tipo: string; pares: Par[]; vertices?: Entidad[]; atributos?: Entidad[] };
type Bloque = { nombre: string; base: PuntoDxf; entidades: Entidad[]; externo: boolean };

export type Capa = { nombre: string; apagada: boolean };

export type DxfLeido = {
  version: string;
  insunits: number;
  capas: Map<string, Capa>;
  bloques: Map<string, Bloque>;
  entidades: Entidad[];
};

// Lo que se dibuja. `capas`: la suya y las de los bloques que la contienen
// (si se apaga una, no se ve).
export type Trazo = { tipo: 'trazo'; puntos: PuntoDxf[]; cerrado: boolean; capas: string[] };
export type TextoDxf = {
  tipo: 'texto'; x: number; y: number; alto: number; angulo: number; texto: string;
  // 0 izquierda, 0.5 centro, 1 derecha; vertical 0 base/arriba… como fracción.
  anclaX: number; anclaY: number; capas: string[];
};
export type Primitiva = Trazo | TextoDxf;

// ---------- Leer los pares ----------

export function leerPares(texto: string): Par[] {
  const lineas = texto.split(/\r?\n/);
  const pares: Par[] = [];
  for (let i = 0; i + 1 < lineas.length; i += 2) {
    const codigo = Number(lineas[i].trim());
    if (!Number.isFinite(codigo)) continue;
    pares.push([codigo, lineas[i + 1].replace(/\r$/, '')]);
  }
  return pares;
}

// Los DXF de AutoCAD 2007 en adelante vienen en UTF-8; los viejos, en Windows-1252.
export function decodificarDxf(bytes: ArrayBuffer): string {
  const inicio = new TextDecoder('latin1').decode(bytes.slice(0, 4000));
  const version = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/.exec(inicio)?.[1] || 'AC1009';
  const utf8 = Number(version.slice(2)) >= 1021;
  return new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(bytes);
}

// ---------- Secciones ----------

function valor(e: Entidad, codigo: number): string | undefined {
  return e.pares.find(([c]) => c === codigo)?.[1];
}

function numero(e: Entidad, codigo: number, porOmision = 0): number {
  const v = valor(e, codigo);
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : porOmision;
}

// Corta una lista de pares en entidades (cada una empieza con código 0).
// POLYLINE junta sus VERTEX e INSERT sus ATTRIB, hasta SEQEND.
function entidadesDe(pares: Par[]): Entidad[] {
  const lista: Entidad[] = [];
  let actual: Entidad | null = null;
  let contenedor: Entidad | null = null;
  for (const [codigo, v] of pares) {
    if (codigo === 0) {
      const tipo = v.trim();
      if (tipo === 'SEQEND') {
        contenedor = null;
        actual = null;
        continue;
      }
      const nueva: Entidad = { tipo, pares: [] };
      if (contenedor && tipo === 'VERTEX') (contenedor.vertices ||= []).push(nueva);
      else if (contenedor && tipo === 'ATTRIB') (contenedor.atributos ||= []).push(nueva);
      else {
        lista.push(nueva);
        contenedor = tipo === 'POLYLINE' || tipo === 'INSERT' ? nueva : null;
      }
      actual = nueva;
      continue;
    }
    if (actual) actual.pares.push([codigo, v]);
  }
  return lista;
}

export function leerDxf(texto: string): DxfLeido {
  const pares = leerPares(texto);
  const resultado: DxfLeido = { version: 'AC1009', insunits: 0, capas: new Map(), bloques: new Map(), entidades: [] };

  // Separa las secciones.
  const secciones = new Map<string, Par[]>();
  for (let i = 0; i < pares.length; i++) {
    if (pares[i][0] === 0 && pares[i][1].trim() === 'SECTION' && pares[i + 1]?.[0] === 2) {
      const nombre = pares[i + 1][1].trim();
      let j = i + 2;
      while (j < pares.length && !(pares[j][0] === 0 && pares[j][1].trim() === 'ENDSEC')) j++;
      secciones.set(nombre, pares.slice(i + 2, j));
      i = j;
    }
  }

  const encabezado = secciones.get('HEADER') || [];
  for (let i = 0; i < encabezado.length; i++) {
    if (encabezado[i][0] !== 9) continue;
    const variable = encabezado[i][1].trim();
    if (variable === '$ACADVER') resultado.version = encabezado[i + 1]?.[1].trim() || resultado.version;
    if (variable === '$INSUNITS') resultado.insunits = Number(encabezado[i + 1]?.[1]) || 0;
  }

  // Capas: apagada si su color es negativo; congelada si el bit 1 de 70.
  for (const e of entidadesDe(secciones.get('TABLES') || [])) {
    if (e.tipo !== 'LAYER') continue;
    const nombre = valor(e, 2);
    if (!nombre) continue;
    const apagada = numero(e, 62, 7) < 0 || (numero(e, 70) & 1) === 1;
    resultado.capas.set(nombre, { nombre, apagada });
  }

  // Bloques: BLOCK … entidades … ENDBLK.
  let bloque: Bloque | null = null;
  for (const e of entidadesDe(secciones.get('BLOCKS') || [])) {
    if (e.tipo === 'BLOCK') {
      bloque = {
        nombre: valor(e, 2) || '',
        base: [numero(e, 10), numero(e, 20)],
        entidades: [],
        // Referencia externa (xref) o dependiente: no viene el dibujo.
        externo: (numero(e, 70) & 4) === 4,
      };
      continue;
    }
    if (e.tipo === 'ENDBLK') {
      if (bloque) resultado.bloques.set(bloque.nombre, bloque);
      bloque = null;
      continue;
    }
    if (bloque) bloque.entidades.push(e);
  }

  resultado.entidades = entidadesDe(secciones.get('ENTITIES') || []);
  return resultado;
}

// ---------- Unidades ----------

// Metros por unidad según $INSUNITS (0 = sin unidad).
const METROS_POR_INSUNITS: Record<number, number> = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 14: 0.1 };

export const UNIDADES = [
  { nombre: 'metros', metros: 1 },
  { nombre: 'centímetros', metros: 0.01 },
  { nombre: 'milímetros', metros: 0.001 },
  { nombre: 'pulgadas', metros: 0.0254 },
] as const;

// Las unidades del archivo a veces están mal (un plano en metros marcado en
// milímetros). Se propone la que deja el dibujo de un tamaño de edificio
// (entre 5 m y 3 km); si la del archivo cuadra, esa.
export function unidadProbable(insunits: number, anchoDibujo: number): number {
  const delArchivo = METROS_POR_INSUNITS[insunits];
  const razonable = (m: number) => anchoDibujo * m >= 5 && anchoDibujo * m <= 3000;
  if (delArchivo && razonable(delArchivo)) return delArchivo;
  return UNIDADES.find((u) => razonable(u.metros))?.metros || delArchivo || 1;
}

// ---------- De entidades a lo que se dibuja ----------

// x' = a·x + c·y + e ; y' = b·x + d·y + f
type Matriz = [number, number, number, number, number, number];
const IDENTIDAD: Matriz = [1, 0, 0, 1, 0, 0];

function componer(m: Matriz, n: Matriz): Matriz {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function aplicar(m: Matriz, [x, y]: PuntoDxf): PuntoDxf {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function lineal(m: Matriz, [x, y]: PuntoDxf): PuntoDxf {
  return [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
}

// Muchas entidades (círculos, arcos, polilíneas, bloques, textos) vienen en
// su propio sistema de coordenadas (OCS), definido por su extrusión 210/220/230.
// Lo normal es (0,0,1) y no cambia nada; (0,0,−1) es un espejo, y a veces viene
// inclinada. Esta matriz lleva del OCS al plano XY del dibujo con la regla de
// AutoCAD (arbitrary axis algorithm). `elevacion`: código 30 o 38.
function matrizOcs(e: Entidad, codigoElevacion: number): Matriz | null {
  let nx = numero(e, 210);
  let ny = numero(e, 220);
  let nz = numero(e, 230, 1);
  const largo = Math.hypot(nx, ny, nz) || 1;
  nx /= largo;
  ny /= largo;
  nz /= largo;
  if (Math.abs(nx) < 1e-9 && Math.abs(ny) < 1e-9 && nz > 0) return null;
  let ax: [number, number, number];
  if (Math.abs(nx) < 1 / 64 && Math.abs(ny) < 1 / 64) ax = [nz, 0, -nx]; // Wy × N
  else ax = [-ny, nx, 0]; // Wz × N
  const la = Math.hypot(...ax);
  ax = [ax[0] / la, ax[1] / la, ax[2] / la];
  // Ay = N × Ax
  let ay: [number, number, number] = [ny * ax[2] - nz * ax[1], nz * ax[0] - nx * ax[2], nx * ax[1] - ny * ax[0]];
  const lb = Math.hypot(...ay);
  ay = [ay[0] / lb, ay[1] / lb, ay[2] / lb];
  const z = numero(e, codigoElevacion);
  return [ax[0], ax[1], ay[0], ay[1], z * nx, z * ny];
}

function arco(cx: number, cy: number, r: number, inicio: number, fin: number): PuntoDxf[] {
  let barrido = fin - inicio;
  while (barrido <= 0) barrido += Math.PI * 2;
  const pasos = Math.max(6, Math.ceil((barrido / (Math.PI * 2)) * 48));
  const puntos: PuntoDxf[] = [];
  for (let i = 0; i <= pasos; i++) {
    const a = inicio + (barrido * i) / pasos;
    puntos.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return puntos;
}

// Tramo de polilínea con «bulge» (curvatura) entre dos vértices.
function conCurva(a: PuntoDxf, b: PuntoDxf, bulge: number): PuntoDxf[] {
  if (Math.abs(bulge) < 1e-9) return [b];
  const angulo = 4 * Math.atan(bulge);
  const cuerda = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (cuerda === 0) return [b];
  const r = cuerda / (2 * Math.sin(angulo / 2));
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const h = r * Math.cos(angulo / 2);
  const ux = (b[0] - a[0]) / cuerda;
  const uy = (b[1] - a[1]) / cuerda;
  const cx = mx - uy * h;
  const cy = my + ux * h;
  const inicio = Math.atan2(a[1] - cy, a[0] - cx);
  const pasos = Math.max(4, Math.ceil((Math.abs(angulo) / (Math.PI * 2)) * 48));
  const puntos: PuntoDxf[] = [];
  for (let i = 1; i <= pasos; i++) {
    const t = inicio + (angulo * i) / pasos;
    puntos.push([cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t)]);
  }
  puntos[puntos.length - 1] = b;
  return puntos;
}

// Pares 10/20 (y 42) en orden, para LWPOLYLINE.
function verticesLw(e: Entidad): { p: PuntoDxf; bulge: number }[] {
  const lista: { p: PuntoDxf; bulge: number }[] = [];
  for (const [c, v] of e.pares) {
    if (c === 10) lista.push({ p: [Number(v), 0], bulge: 0 });
    else if (c === 20 && lista.length) lista[lista.length - 1].p[1] = Number(v);
    else if (c === 42 && lista.length) lista[lista.length - 1].bulge = Number(v);
  }
  return lista;
}

function puntosDe(e: Entidad, codigoX: number, codigoY: number): PuntoDxf[] {
  const lista: PuntoDxf[] = [];
  for (const [c, v] of e.pares) {
    if (c === codigoX) lista.push([Number(v), 0]);
    else if (c === codigoY && lista.length) lista[lista.length - 1][1] = Number(v);
  }
  return lista;
}

function polilinea(vertices: { p: PuntoDxf; bulge: number }[], cerrada: boolean): PuntoDxf[] {
  if (vertices.length === 0) return [];
  const puntos: PuntoDxf[] = [vertices[0].p];
  for (let i = 1; i < vertices.length; i++) puntos.push(...conCurva(vertices[i - 1].p, vertices[i].p, vertices[i - 1].bulge));
  if (cerrada && vertices.length > 2) puntos.push(...conCurva(vertices[vertices.length - 1].p, vertices[0].p, vertices[vertices.length - 1].bulge));
  return puntos;
}

// Quita los códigos de formato de MTEXT (\P salto, {\fArial;…}, \A1; …).
export function textoLimpio(crudo: string): string {
  return crudo
    .replace(/\\[ACFHQTWfp][^;\\]*;/g, '')
    .replace(/\\P/g, '\n')
    .replace(/\\S([^;^#/]*)[\^#/]([^;]*);/g, (_, a: string, b: string) => (b ? `${a}/${b}` : a))
    .replace(/\\[LlOoKkNn]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/\\\\/g, '\\')
    .replace(/[{}]/g, '')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[pP]/g, '±')
    .replace(/%%[uUoO]/g, '')
    .trim();
}

// Todas las entidades del dibujo convertidas en trazos y textos, en
// coordenadas reales. Los bloques se abren (hasta 12 niveles).
export function primitivasDe(dxf: DxfLeido): Primitiva[] {
  const salida: Primitiva[] = [];

  function trazo(puntos: PuntoDxf[], m: Matriz, capas: string[], cerrado = false) {
    if (puntos.length < 2) return;
    salida.push({ tipo: 'trazo', puntos: puntos.map((p) => aplicar(m, p)), cerrado, capas });
  }

  function texto(e: Entidad, m: Matriz, capas: string[], esMtext: boolean) {
    let contenido = esMtext ? e.pares.filter(([c]) => c === 3).map(([, v]) => v).join('') + (valor(e, 1) || '') : valor(e, 1) || '';
    contenido = textoLimpio(contenido);
    if (!contenido) return;
    const alto = numero(e, 40, 1);
    let x = numero(e, 10);
    let y = numero(e, 20);
    let anclaX = 0;
    let anclaY = 0;
    let angulo = (numero(e, 50) * Math.PI) / 180;
    if (esMtext) {
      // 71: 1 arriba-izq … 9 abajo-der. Dirección por 11/21 si viene.
      const adjunto = numero(e, 71, 1);
      anclaX = ((adjunto - 1) % 3) / 2;
      anclaY = Math.floor((adjunto - 1) / 3) / 2;
      if (valor(e, 11) !== undefined) angulo = Math.atan2(numero(e, 21), numero(e, 11));
    } else {
      // TEXT alineado: 72 horizontal, 73 vertical; entonces el punto es 11/21.
      const h = numero(e, 72);
      const v = numero(e, 73);
      if ((h !== 0 || v !== 0) && valor(e, 11) !== undefined) {
        x = numero(e, 11);
        y = numero(e, 21);
        anclaX = h === 1 || h === 4 ? 0.5 : h === 2 ? 1 : 0;
        anclaY = v === 3 ? 0 : v === 2 ? 0.5 : 1;
      } else {
        anclaY = 1;
      }
    }
    // TEXT va en su OCS; MTEXT ya viene en coordenadas del dibujo.
    const mo = esMtext ? null : matrizOcs(e, 30);
    const mt = mo ? componer(m, mo) : m;
    const [px, py] = aplicar(mt, [x, y]);
    // Giro y escala del bloque en que va.
    const direccion = lineal(mt, [Math.cos(angulo), Math.sin(angulo)]);
    const arriba = lineal(mt, [-Math.sin(angulo), Math.cos(angulo)]);
    salida.push({
      tipo: 'texto', x: px, y: py, alto: alto * Math.hypot(...arriba), angulo: Math.atan2(direccion[1], direccion[0]),
      texto: contenido, anclaX, anclaY, capas,
    });
  }

  function abrir(entidades: Entidad[], m: Matriz, capasPadre: string[], capaHeredada: string | null, nivel: number) {
    if (nivel > 12) return;
    for (const e of entidades) {
      if (numero(e, 67) === 1) continue; // espacio papel
      let capa = valor(e, 8) || '0';
      if (capa === '0' && capaHeredada) capa = capaHeredada;
      const capas = [...capasPadre, capa];
      const x = (c: number) => numero(e, c);
      // En su sistema de coordenadas (OCS) si lo trae.
      const mo = matrizOcs(e, e.tipo === 'LWPOLYLINE' ? 38 : 30);
      const mOcs = mo ? componer(m, mo) : m;

      switch (e.tipo) {
        case 'LINE':
          trazo([[x(10), numero(e, 20)], [x(11), numero(e, 21)]], m, capas);
          break;
        case 'LWPOLYLINE': {
          const cerrada = (numero(e, 70) & 1) === 1;
          trazo(polilinea(verticesLw(e), cerrada), mOcs, capas, cerrada);
          break;
        }
        case 'POLYLINE': {
          const flags = numero(e, 70);
          if (flags & (16 | 64)) break; // mallas 3D
          const vertices = (e.vertices || [])
            .filter((v) => !(numero(v, 70) & 16))
            .map((v) => ({ p: [numero(v, 10), numero(v, 20)] as PuntoDxf, bulge: numero(v, 42) }));
          // La 2D va en su OCS; la 3D (bit 8), en coordenadas del dibujo.
          trazo(polilinea(vertices, (flags & 1) === 1), flags & 8 ? m : mOcs, capas, (flags & 1) === 1);
          break;
        }
        case 'CIRCLE':
          trazo(arco(x(10), numero(e, 20), numero(e, 40), 0, Math.PI * 2), mOcs, capas, true);
          break;
        case 'ARC': {
          const inicio = (numero(e, 50) * Math.PI) / 180;
          const fin = (numero(e, 51) * Math.PI) / 180;
          trazo(arco(x(10), numero(e, 20), numero(e, 40), inicio, fin), mOcs, capas);
          break;
        }
        case 'ELLIPSE': {
          const cx = numero(e, 10);
          const cy = numero(e, 20);
          const ax = numero(e, 11);
          const ay = numero(e, 21);
          const razon = numero(e, 40, 1);
          let inicio = numero(e, 41);
          let fin = numero(e, 42, Math.PI * 2);
          while (fin <= inicio) fin += Math.PI * 2;
          const pasos = Math.max(8, Math.ceil(((fin - inicio) / (Math.PI * 2)) * 48));
          const puntos: PuntoDxf[] = [];
          for (let i = 0; i <= pasos; i++) {
            const t = inicio + ((fin - inicio) * i) / pasos;
            const px = cx + ax * Math.cos(t) - ay * razon * Math.sin(t);
            const py = cy + ay * Math.cos(t) + ax * razon * Math.sin(t);
            puntos.push([px, py]);
          }
          trazo(puntos, m, capas);
          break;
        }
        case 'SPLINE': {
          // Por los puntos de ajuste si vienen; si no, por los de control.
          const ajuste = puntosDe(e, 11, 21);
          trazo(ajuste.length >= 2 ? ajuste : puntosDe(e, 10, 20), m, capas);
          break;
        }
        case 'LEADER':
          trazo(puntosDe(e, 10, 20), m, capas);
          break;
        case 'SOLID':
        case 'TRACE': {
          const p = [[x(10), numero(e, 20)], [x(11), numero(e, 21)], [x(13), numero(e, 23)], [x(12), numero(e, 22)]] as PuntoDxf[];
          trazo(p, mOcs, capas, true);
          break;
        }
        case 'TEXT':
        case 'ATTRIB':
          texto(e, m, capas, false);
          break;
        case 'MTEXT':
          texto(e, m, capas, true);
          break;
        case 'DIMENSION': {
          // La cota ya viene dibujada en su bloque anónimo, en coordenadas del dibujo.
          const b = dxf.bloques.get(valor(e, 2) || '');
          if (b && !b.externo) abrir(b.entidades, m, capas, capa, nivel + 1);
          break;
        }
        case 'INSERT': {
          const b = dxf.bloques.get(valor(e, 2) || '');
          if (!b || b.externo) break;
          const sx = numero(e, 41, 1);
          const sy = numero(e, 42, 1);
          const giro = (numero(e, 50) * Math.PI) / 180;
          const columnas = Math.max(1, numero(e, 70, 1));
          const renglones = Math.max(1, numero(e, 71, 1));
          const dx = numero(e, 44);
          const dy = numero(e, 45);
          for (let c = 0; c < columnas; c++) {
            for (let r = 0; r < renglones; r++) {
              const ix = numero(e, 10) + c * dx * Math.cos(giro) - r * dy * Math.sin(giro);
              const iy = numero(e, 20) + c * dx * Math.sin(giro) + r * dy * Math.cos(giro);
              const cos = Math.cos(giro);
              const sin = Math.sin(giro);
              // Mueve a la base, escala, gira, coloca (y refleja si va en espejo).
              // Mueve a la base, escala, gira y coloca, todo en su OCS.
              let local: Matriz = [cos * sx, sin * sx, -sin * sy, cos * sy, ix, iy];
              local = componer(local, [1, 0, 0, 1, -b.base[0], -b.base[1]]);
              abrir(b.entidades, componer(mOcs, local), capas, capa, nivel + 1);
            }
          }
          for (const atributo of e.atributos || []) texto(atributo, m, capas, false);
          break;
        }
        default:
          // HATCH, POINT, IMAGE, VIEWPORT, XLINE/RAY (infinitas), 3DFACE…: no se dibujan.
          break;
      }
    }
  }

  abrir(dxf.entidades, IDENTIDAD, [], null, 0);
  return salida;
}

// ---------- Capas y medidas ----------

export function visible(p: Primitiva, ocultas: Set<string>): boolean {
  return !p.capas.some((c) => ocultas.has(c));
}

// Cuántas cosas hay en cada capa (por la capa propia de cada trazo o texto).
export function cuentaPorCapa(primitivas: Primitiva[]): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const p of primitivas) {
    const capa = p.capas[p.capas.length - 1];
    cuenta.set(capa, (cuenta.get(capa) || 0) + 1);
  }
  return cuenta;
}

// Capas que conviene apagar para sembrar: cotas, muebles, vegetación…
export function capaQueEstorba(nombre: string): boolean {
  return /cota|dim|mobili|mueble|vegeta|arbol|árbol|tree|node|solapa|achur|hatch|pulido|piso|textos? solapa/i.test(nombre);
}

export type Caja = { minX: number; minY: number; maxX: number; maxY: number };

export function cajaDe(primitivas: Primitiva[], ocultas: Set<string>): Caja | null {
  let caja: Caja | null = null;
  const sumar = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!caja) caja = { minX: x, minY: y, maxX: x, maxY: y };
    else {
      caja.minX = Math.min(caja.minX, x);
      caja.minY = Math.min(caja.minY, y);
      caja.maxX = Math.max(caja.maxX, x);
      caja.maxY = Math.max(caja.maxY, y);
    }
  };
  for (const p of primitivas) {
    if (!visible(p, ocultas)) continue;
    if (p.tipo === 'trazo') for (const [x, y] of p.puntos) sumar(x, y);
    else sumar(p.x, p.y);
  }
  return caja;
}
