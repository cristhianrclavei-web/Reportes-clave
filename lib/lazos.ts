// Lazos y circuitos: lógica que no habla con la base (se prueba en
// lib/lazos.test.ts). Los datos y la cola sin conexión están en
// lib/lazosDatos.ts; el esquema en supabase/patch_lazos.sql.

export type TipoCircuito = 'deteccion' | 'voceo' | 'estrobos';

export type Lazo = {
  id: string;
  cliente_id: string;
  tipo: TipoCircuito;
  codigo: string;
  nombre: string;
  numero: number | null;
  clase: 'A' | 'B' | null;
  panel: string | null;
  notas: string | null;
  creado_en: string;
};

export type Elemento = {
  id: string;
  lazo_id: string;
  padre_id: string | null;
  orden: number;
  tipo: string;
  nombre: string;
  direccion: string | null;
  ubicacion: string | null;
  foto_path: string | null;
  creado_por?: string;
  creado_en?: string;
};

export type Falla = {
  id: string;
  lazo_id: string;
  estado: 'abierta' | 'resuelta';
  elemento_id: string | null;
  causa: string | null;
  abierta_en: string;
  resuelta_en: string | null;
  abierta_por?: string;
};

export type Corte = {
  id: string;
  falla_id: string;
  elemento_id: string | null;
  lado: 'panel' | 'campo';
  medicion: string | null;
  notas: string | null;
  creado_en: string;
};

// Forma del símbolo en el diagrama.
export type Forma = 'detector' | 'caja' | 'fin' | 'cuadro';

export type TipoDispositivo = { codigo: string; nombre: string; forma: Forma; conDireccion: boolean };

// Códigos que usan en sus planos. Caja de registro y fin de línea van en
// todos los circuitos. Si cambia un nombre, se cambia solo aquí.
const CAJA: TipoDispositivo = { codigo: 'RG', nombre: 'Caja de registro', forma: 'caja', conDireccion: false };
const FIN_DE_LINEA: TipoDispositivo = { codigo: 'FDL', nombre: 'Resistencia de fin de línea', forma: 'fin', conDireccion: false };

export const TIPOS_POR_CIRCUITO: Record<TipoCircuito, TipoDispositivo[]> = {
  deteccion: [
    { codigo: 'SH', nombre: 'Detector de humo', forma: 'detector', conDireccion: true },
    { codigo: 'SC', nombre: 'Detector de calor', forma: 'detector', conDireccion: true },
    { codigo: 'MC', nombre: 'Módulo de control', forma: 'cuadro', conDireccion: true },
    { codigo: 'MM', nombre: 'Módulo monitor', forma: 'cuadro', conDireccion: true },
    { codigo: 'MD', nombre: 'Módulo dual', forma: 'cuadro', conDireccion: true },
    { codigo: 'CR', nombre: 'Módulo de relevador', forma: 'cuadro', conDireccion: true },
    { codigo: 'EMA', nombre: 'Estación manual de alarma', forma: 'cuadro', conDireccion: true },
    { codigo: 'EA', nombre: 'Estación de aborto', forma: 'cuadro', conDireccion: true },
    { codigo: 'EL', nombre: 'Estación de liberación', forma: 'cuadro', conDireccion: true },
    { codigo: 'AIS', nombre: 'Aislador', forma: 'cuadro', conDireccion: true },
    { codigo: 'CO', nombre: 'Corneta / sirena', forma: 'cuadro', conDireccion: false },
    { codigo: 'AL', nombre: 'Dispositivo supervisado', forma: 'cuadro', conDireccion: false },
    CAJA,
  ],
  voceo: [
    { codigo: 'BO', nombre: 'Bocina', forma: 'cuadro', conDireccion: false },
    { codigo: 'BE', nombre: 'Bocina con estrobo', forma: 'cuadro', conDireccion: false },
    CAJA,
    FIN_DE_LINEA,
  ],
  estrobos: [
    { codigo: 'ES', nombre: 'Estrobo', forma: 'cuadro', conDireccion: false },
    { codigo: 'SE', nombre: 'Sirena con estrobo', forma: 'cuadro', conDireccion: false },
    CAJA,
    FIN_DE_LINEA,
  ],
};

export const NOMBRE_CIRCUITO: Record<TipoCircuito, string> = {
  deteccion: 'Lazo de detección',
  voceo: 'Circuito de voceo',
  estrobos: 'Circuito de estrobos',
};

// Prefijo del código según el tipo: LZ1, VC1, ES1.
export const PREFIJO_CIRCUITO: Record<TipoCircuito, string> = {
  deteccion: 'LZ',
  voceo: 'VC',
  estrobos: 'ES',
};

export function tipoDispositivo(codigo: string): TipoDispositivo {
  for (const lista of Object.values(TIPOS_POR_CIRCUITO)) {
    const encontrado = lista.find((t) => t.codigo === codigo);
    if (encontrado) return encontrado;
  }
  return { codigo, nombre: codigo, forma: 'cuadro', conDireccion: false };
}

// ---------- Orden ----------

function porOrden(a: Elemento, b: Elemento): number {
  return a.orden - b.orden;
}

// Dispositivos de la línea principal, del panel al final.
export function lineaPrincipal(elementos: Elemento[]): Elemento[] {
  return elementos.filter((e) => !e.padre_id).sort(porOrden);
}

// Lo que cuelga de un dispositivo, en su orden.
export function hijosDe(elementos: Elemento[], padreId: string): Elemento[] {
  return elementos.filter((e) => e.padre_id === padreId).sort(porOrden);
}

// Número de `orden` para poner un dispositivo nuevo entre `antes` y
// `despues` (cualquiera puede faltar: al inicio o al final).
export function ordenEntre(antes: number | null, despues: number | null): number {
  if (antes === null && despues === null) return 1;
  if (antes === null) return (despues as number) - 1;
  if (despues === null) return antes + 1;
  return (antes + despues) / 2;
}

// Posición de cada dispositivo de la línea principal (1, 2, 3…). Lo que
// cuelga de un dispositivo comparte la posición de su padre.
export function posiciones(elementos: Elemento[]): Map<string, number> {
  const mapa = new Map<string, number>();
  const principal = lineaPrincipal(elementos);
  principal.forEach((e, i) => mapa.set(e.id, i + 1));

  // Un hijo puede tener sus propios hijos (una derivación larga): se sube
  // hasta encontrar al de la línea principal.
  const porId = new Map(elementos.map((e) => [e.id, e]));
  for (const e of elementos) {
    if (mapa.has(e.id)) continue;
    let actual: Elemento | undefined = e;
    let vueltas = 0;
    while (actual && actual.padre_id && vueltas < 50) {
      actual = porId.get(actual.padre_id);
      vueltas++;
    }
    if (actual && mapa.has(actual.id)) mapa.set(e.id, mapa.get(actual.id) as number);
  }
  return mapa;
}

// ---------- Nombres y direcciones ----------

// Siguiente nombre automático al estilo de sus planos: LZ1_SH_8. Toma el
// número más alto que ya tenga ese tipo en el lazo y le suma uno. Las cajas
// van aparte: RG-01, RG-02…
export function nombreSugerido(codigoLazo: string, tipo: string, elementos: Elemento[]): string {
  if (tipo === 'RG') {
    let mayor = 0;
    for (const e of elementos) {
      const m = /^RG-(\d+)$/.exec(e.nombre);
      if (m) mayor = Math.max(mayor, Number(m[1]));
    }
    return `RG-${String(mayor + 1).padStart(2, '0')}`;
  }
  const prefijo = `${codigoLazo}_${tipo}_`;
  let mayor = 0;
  for (const e of elementos) {
    if (!e.nombre.startsWith(prefijo)) continue;
    const numero = Number(e.nombre.slice(prefijo.length));
    if (Number.isInteger(numero)) mayor = Math.max(mayor, numero);
  }
  return `${prefijo}${mayor + 1}`;
}

// Deja la dirección como se guarda: D o M y el número sin ceros de más
// («d 08» → «D8»). Devuelve null si no es válida.
export function normalizarDireccion(letra: string, numero: string): string | null {
  const l = letra.trim().toUpperCase();
  const n = numero.trim();
  if (l !== 'D' && l !== 'M') return null;
  if (!/^\d{1,3}$/.test(n)) return null;
  const valor = Number(n);
  if (valor < 1) return null;
  return `${l}${valor}`;
}

// Cómo se muestra: con el número de lazo y tres dígitos, como en el panel
// (D8 en el lazo 1 → 1D008).
export function direccionVisible(direccion: string | null, numeroLazo: number | null): string {
  if (!direccion) return '';
  const letra = direccion[0];
  const numero = direccion.slice(1).padStart(3, '0');
  return `${numeroLazo ?? ''}${letra}${numero}`;
}

// ¿Otro dispositivo del lazo ya tiene esa dirección?
export function direccionOcupada(direccion: string, elementos: Elemento[], excepto?: string): Elemento | null {
  return elementos.find((e) => e.direccion === direccion && e.id !== excepto) || null;
}

// Siguiente dirección libre de esa letra (para proponerla).
export function siguienteDireccion(letra: 'D' | 'M', elementos: Elemento[]): number {
  let mayor = 0;
  for (const e of elementos) {
    if (e.direccion && e.direccion[0] === letra) mayor = Math.max(mayor, Number(e.direccion.slice(1)));
  }
  return mayor + 1;
}

// ---------- Búsqueda de falla a tierra ----------

export type Tramo = {
  desde: number;
  hasta: number;
  // Dos cortes se contradicen (p. ej. la falla se movió o se anotó mal un lado).
  contradictorio: boolean;
};

// Tramo donde está la falla después de los cortes, en orden de captura.
// Cortar a la salida de la posición k deja 1…k del lado panel y k+1…n del
// lado campo.
export function tramoConFalla(total: number, cortes: { posicion: number; lado: 'panel' | 'campo' }[]): Tramo {
  let desde = 1;
  let hasta = total;
  for (const corte of cortes) {
    if (corte.lado === 'campo') desde = Math.max(desde, corte.posicion + 1);
    else hasta = Math.min(hasta, corte.posicion);
  }
  if (desde > hasta) return { desde: hasta, hasta: desde, contradictorio: true };
  return { desde, hasta, contradictorio: false };
}

// Dónde conviene cortar: a la salida de la posición que parte el tramo a la
// mitad. null si ya queda un solo dispositivo.
export function corteSugerido(tramo: Tramo): number | null {
  if (tramo.contradictorio || tramo.hasta <= tramo.desde) return null;
  return Math.floor((tramo.desde + tramo.hasta - 1) / 2);
}

// Cuántos cortes más, como máximo, para llegar a un solo dispositivo.
export function cortesRestantes(tramo: Tramo): number {
  const cuantos = tramo.hasta - tramo.desde + 1;
  if (cuantos <= 1) return 0;
  return Math.ceil(Math.log2(cuantos));
}
