// El diagrama unifilar a AutoCAD (DXF R12): las mismas figuras de la
// pantalla y del PDF (lib/unifilarDibujo.ts) como líneas, círculos y textos,
// cada cosa en su capa: equipos y cables en FV-UNIFILAR, tierra en
// FV-TIERRA y textos en FV-TEXTOS. Lógica pura; se prueba en
// lib/unifilarDxf.test.ts.

import { Dxf } from './exportarPlanoDxf';
import { dibujarDiagrama, type Figura, type Tinta } from './unifilarDibujo';
import type { DatosUnifilar } from './unifilar';

type P = [number, number];

const CAPAS: Record<'linea' | 'tierra' | 'texto', { nombre: string; color: number }> = {
  linea: { nombre: 'FV-UNIFILAR', color: 7 },
  tierra: { nombre: 'FV-TIERRA', color: 3 },
  texto: { nombre: 'FV-TEXTOS', color: 7 },
};

const capaDe = (tinta?: Tinta) => (tinta === 'verde' ? CAPAS.tierra.nombre : CAPAS.linea.nombre);

// Trazo SVG con M, L, Q, C y Z (absolutos) a polilíneas; las curvas se
// parten en 12 tramos.
export function trazoAPuntos(d: string, ox: number, oy: number): { puntos: P[]; cerrada: boolean }[] {
  const fichas = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const figuras: { puntos: P[]; cerrada: boolean }[] = [];
  let actual: P[] = [];
  let i = 0;
  const n = () => Number(fichas[i++]);
  const punto = (): P => [ox + n(), oy + n()];
  while (i < fichas.length) {
    const c = fichas[i++].toUpperCase();
    if (c === 'M') {
      if (actual.length > 1) figuras.push({ puntos: actual, cerrada: false });
      actual = [punto()];
    } else if (c === 'L') {
      actual.push(punto());
    } else if (c === 'Q' || c === 'C') {
      const inicio = actual[actual.length - 1];
      const control = c === 'Q' ? [punto()] : [punto(), punto()];
      const fin = punto();
      const pts = [inicio, ...control, fin];
      for (let k = 1; k <= 12; k++) {
        const t = k / 12;
        // De Casteljau: sirve igual para cuadrática y cúbica.
        let capa = pts;
        while (capa.length > 1) capa = capa.slice(1).map((p, j) => [capa[j][0] + (p[0] - capa[j][0]) * t, capa[j][1] + (p[1] - capa[j][1]) * t] as P);
        actual.push(capa[0]);
      }
    } else if (c === 'Z') {
      if (actual.length > 1) figuras.push({ puntos: actual, cerrada: true });
      actual = [];
    }
  }
  if (actual.length > 1) figuras.push({ puntos: actual, cerrada: false });
  return figuras;
}

function circuloEnPuntos(cx: number, cy: number, r: number): P[] {
  return Array.from({ length: 36 }, (_, k) => [cx + r * Math.cos((k / 36) * Math.PI * 2), cy + r * Math.sin((k / 36) * Math.PI * 2)] as P);
}

export function exportarUnifilarDxf(datos: DatosUnifilar): Uint8Array {
  const dxf = new Dxf();
  // y hacia abajo en la app; hacia arriba en AutoCAD.
  const a = (p: P): P => [p[0], -p[1]];
  dxf.par(0, 'SECTION');
  dxf.par(2, 'TABLES');
  dxf.par(0, 'TABLE');
  dxf.par(2, 'LAYER');
  dxf.par(70, Object.keys(CAPAS).length);
  for (const capa of Object.values(CAPAS)) {
    dxf.par(0, 'LAYER');
    dxf.par(2, capa.nombre);
    dxf.par(70, 0);
    dxf.par(62, capa.color);
    dxf.par(6, 'CONTINUOUS');
  }
  dxf.par(0, 'ENDTAB');
  dxf.par(0, 'ENDSEC');
  dxf.par(0, 'SECTION');
  dxf.par(2, 'ENTITIES');
  const dibujar = (f: Figura) => {
    if (f.k === 'linea') {
      const puntos: P[] = [];
      for (let i = 0; i + 1 < f.puntos.length; i += 2) puntos.push(a([f.puntos[i], f.puntos[i + 1]]));
      if (puntos.length > 1) dxf.polilinea(capaDe(f.tinta), puntos, false);
    } else if (f.k === 'rect') {
      dxf.polilinea(capaDe(f.tinta), [a([f.x, f.y]), a([f.x + f.w, f.y]), a([f.x + f.w, f.y + f.h]), a([f.x, f.y + f.h])], true);
    } else if (f.k === 'circulo') {
      dxf.polilinea(capaDe(f.tinta), circuloEnPuntos(f.cx, f.cy, f.r).map(a), true);
    } else if (f.k === 'trazo') {
      for (const t of trazoAPuntos(f.d, f.x, f.y)) dxf.polilinea(capaDe(f.tinta), t.puntos.map(a), t.cerrada);
    } else if (f.k === 'texto') {
      const [x, y] = a([f.x, f.y]);
      dxf.texto(CAPAS.texto.nombre, x, y, f.tam * 0.75, f.texto, f.ancla === 'medio', f.giro ? -f.giro : 0);
    }
  };
  for (const f of dibujarDiagrama(datos)) dibujar(f);
  dxf.par(0, 'ENDSEC');
  dxf.par(0, 'EOF');
  return dxf.bytes();
}
