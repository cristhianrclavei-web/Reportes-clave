// Datos de cada evidencia (foto o video) de un reporte y el acomodo con que
// salen en el PDF. Aquí solo hay cálculo: lo usan el formulario, el detalle
// del reporte y el generador del PDF, y así los tres coinciden en qué foto
// sale, en qué orden y bajo qué título.

export type EtapaFoto = 'antes' | 'durante' | 'despues';

export const ETAPAS: { clave: EtapaFoto; texto: string }[] = [
  { clave: 'antes', texto: 'Antes' },
  { clave: 'durante', texto: 'Durante' },
  { clave: 'despues', texto: 'Después' },
];

const TEXTO_ETAPA = new Map(ETAPAS.map((e) => [e.clave, e.texto]));

export function textoEtapa(e: string | null | undefined): string {
  return (e && TEXTO_ETAPA.get(e as EtapaFoto)) || '';
}

// Lo que se puede marcar en cada foto, además del comentario.
//   · etapa / area: ordenan y agrupan las fotos en el PDF.
//   · interna: se conserva en la app, pero no se adjunta al PDF del cliente.
//   · ts: cuándo se tomó (ISO), para imprimir la fecha bajo la foto.
export type MetaFoto = {
  etapa?: EtapaFoto | null;
  area?: string | null;
  interna?: boolean;
  ts?: string | null;
};

export type EvidenciaGuardada = {
  path: string;
  caption: string;
  video?: string | null;
  dur?: number | null;
} & MetaFoto;

// Solo los datos que traen algo: así un reporte sin marcas se guarda igual
// que antes de que existieran.
export function metaLimpia(m: MetaFoto | null | undefined): MetaFoto {
  const out: MetaFoto = {};
  if (!m) return out;
  if (m.etapa && TEXTO_ETAPA.has(m.etapa)) out.etapa = m.etapa;
  const area = (m.area || '').trim().replace(/\s+/g, ' ');
  if (area) out.area = area.slice(0, 60);
  if (m.interna) out.interna = true;
  if (m.ts) out.ts = m.ts;
  return out;
}

// Los reportes viejos guardaban solo la ruta, o ruta y comentario.
export function normalizarEvidencia(f: unknown): EvidenciaGuardada | null {
  if (typeof f === 'string') return f ? { path: f, caption: '' } : null;
  if (!f || typeof f !== 'object') return null;
  const o = f as Record<string, any>;
  if (typeof o.path !== 'string' || !o.path) return null;
  return {
    path: o.path,
    caption: typeof o.caption === 'string' ? o.caption : '',
    ...(o.video ? { video: String(o.video), dur: typeof o.dur === 'number' ? o.dur : null } : {}),
    ...metaLimpia(o),
  };
}

export function evidenciasDe(fotos: unknown): EvidenciaGuardada[] {
  return (Array.isArray(fotos) ? fotos : []).map(normalizarEvidencia).filter((f): f is EvidenciaGuardada => !!f);
}

// Áreas ya escritas en las demás fotos, para sugerirlas sin volver a teclear.
export function areasUsadas(fotos: { area?: string | null }[]): string[] {
  const vistas = new Map<string, string>();
  for (const f of fotos) {
    const a = (f.area || '').trim();
    if (a && !vistas.has(a.toLowerCase())) vistas.set(a.toLowerCase(), a);
  }
  return [...vistas.values()];
}

// «09/10/2026 14:32» en la zona horaria de la instalación.
export function fechaHoraFoto(ts: string | null | undefined, zona: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('es-MX', {
    timeZone: zona, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${v('day')}/${v('month')}/${v('year')} ${v('hour') === '24' ? '00' : v('hour')}:${v('minute')}`;
}

// ---------- Orden y grupos para el PDF ----------

export type GrupoEvidencia<T> = {
  // null = fotos sin área.
  area: string | null;
  // Antes y después de la misma área, para ponerlas lado a lado.
  pares: [T, T][];
  sueltas: T[];
};

const ORDEN_ETAPA: Record<string, number> = { antes: 0, durante: 1, despues: 2 };

// Agrupa por área en el orden en que aparecen (las que no tienen área van
// primero) y, dentro de cada una, empareja el primer «antes» con el primer
// «después», el segundo con el segundo… Lo que no tiene pareja queda suelto,
// ordenado antes → durante → después → sin etapa. Las internas no entran.
export function agruparParaPdf<T extends MetaFoto>(fotos: T[]): GrupoEvidencia<T>[] {
  const porArea = new Map<string, { area: string | null; items: T[] }>();
  for (const f of fotos) {
    if (f.interna) continue;
    const area = (f.area || '').trim() || null;
    const clave = area ? area.toLowerCase() : '';
    if (!porArea.has(clave)) porArea.set(clave, { area, items: [] });
    porArea.get(clave)!.items.push(f);
  }
  const grupos = [...porArea.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : 0)).map(([, g]) => g);
  return grupos.map(({ area, items }) => {
    const antes = items.filter((f) => f.etapa === 'antes');
    const despues = items.filter((f) => f.etapa === 'despues');
    const n = Math.min(antes.length, despues.length);
    const pares: [T, T][] = [];
    for (let i = 0; i < n; i++) pares.push([antes[i], despues[i]]);
    const enPar = new Set<T>(pares.flat());
    const sueltas = items
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => !enPar.has(f))
      .sort((a, b) => (ORDEN_ETAPA[a.f.etapa || ''] ?? 3) - (ORDEN_ETAPA[b.f.etapa || ''] ?? 3) || a.i - b.i)
      .map(({ f }) => f);
    return { area, pares, sueltas };
  });
}

// ---------- Proporciones y filas ----------

// Cada foto se ajusta a la proporción estándar más cercana: así las de un
// mismo tipo salen idénticas en la retícula y casi no se recorta nada.
export const PROPORCIONES = [16 / 9, 4 / 3, 1, 3 / 4, 9 / 16];

export function proporcionEstandar(ancho: number, alto: number): number {
  if (!ancho || !alto) return 4 / 3;
  const r = ancho / alto;
  return PROPORCIONES.reduce((mejor, p) => (Math.abs(Math.log(p / r)) < Math.abs(Math.log(mejor / r)) ? p : mejor), PROPORCIONES[0]);
}

// Alto que se busca para cada fila según cuántas fotos hay: pocas salen
// grandes; muchas, en retícula más apretada.
export function altoObjetivo(total: number): number {
  if (total <= 1) return 300;
  if (total <= 4) return 205;
  if (total <= 9) return 170;
  return 138;
}

export type FilaFotos = { indices: number[]; alto: number; completa: boolean };

// Acomodo «justificado»: cada fila llena el ancho y todas sus fotos tienen el
// mismo alto. Se van sumando fotos a la fila hasta que su alto baja al
// objetivo; se queda con la cantidad que más se le acerque. La última fila,
// si no alcanza a llenar, conserva el alto objetivo y se alinea a la izquierda.
export function filasJustificadas(proporciones: number[], ancho: number, hueco: number, objetivo: number, altoMax = objetivo * 1.6): FilaFotos[] {
  const filas: FilaFotos[] = [];
  const altoDe = (suma: number, n: number) => (ancho - hueco * (n - 1)) / suma;
  let i = 0;
  while (i < proporciones.length) {
    let suma = 0;
    let n = 0;
    let mejor = { n: 1, alto: Infinity };
    while (i + n < proporciones.length) {
      suma += proporciones[i + n];
      n++;
      const alto = altoDe(suma, n);
      if (Math.abs(alto - objetivo) < Math.abs(mejor.alto - objetivo)) mejor = { n, alto };
      if (alto <= objetivo) break;
    }
    const indices = Array.from({ length: mejor.n }, (_, k) => i + k);
    if (mejor.alto > altoMax) filas.push({ indices, alto: Math.min(objetivo, altoMax), completa: false });
    else filas.push({ indices, alto: mejor.alto, completa: true });
    i += mejor.n;
  }
  // Una foto sola al final se sube a la fila anterior si ahí todavía cabe a
  // buen tamaño: mejor tres medianas que dos grandes y una huérfana.
  const ultima = filas[filas.length - 1];
  const previa = filas[filas.length - 2];
  if (ultima && previa && !ultima.completa && ultima.indices.length === 1 && previa.completa) {
    const indices = [...previa.indices, ...ultima.indices];
    const alto = altoDe(indices.reduce((s, k) => s + proporciones[k], 0), indices.length);
    if (alto >= objetivo * 0.72) filas.splice(filas.length - 2, 2, { indices, alto, completa: true });
  }
  return filas;
}
