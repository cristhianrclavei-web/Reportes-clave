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
  // Panel al que pertenece (patch_lazos_paneles.sql). Sin el patch no viene.
  panel_id?: string | null;
  notas: string | null;
  creado_en: string;
};

// Un panel de un cliente y cuántas salidas de cada tipo tiene.
export type Panel = {
  id: string;
  cliente_id: string;
  nombre: string;
  modelo: string | null;
  ubicacion: string | null;
  slc: number;
  nac: number;
  voceo: number;
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
  // Foto de evidencia al cerrar (patch_lazos_falla_foto.sql).
  foto_path?: string | null;
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
  // Foto de evidencia del corte (patch_lazos_corte_foto.sql).
  foto_path?: string | null;
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
    { codigo: 'CO', nombre: 'Corneta / sirena', forma: 'cuadro', conDireccion: false },
    CAJA,
    FIN_DE_LINEA,
  ],
};

export const NOMBRE_CIRCUITO: Record<TipoCircuito, string> = {
  deteccion: 'Lazo de detección',
  voceo: 'Circuito de voceo',
  estrobos: 'Circuito NAC · sirenas y estrobos',
};

// Prefijo del código según el tipo: LZ1, VC1, NAC1.
export const PREFIJO_CIRCUITO: Record<TipoCircuito, string> = {
  deteccion: 'LZ',
  voceo: 'VC',
  estrobos: 'NAC',
};

// Cómo se llama la salida del panel de cada tipo: SLC 1, NAC 3, Voceo 1.
export const SALIDA_CIRCUITO: Record<TipoCircuito, string> = {
  deteccion: 'SLC',
  voceo: 'Voceo',
  estrobos: 'NAC',
};

export function etiquetaSalida(lazo: Pick<Lazo, 'tipo' | 'numero'>): string {
  return `${SALIDA_CIRCUITO[lazo.tipo]} ${lazo.numero ?? '?'}`;
}

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

// ---------- Resumen y paneles ----------

// Cuántos hay de cada tipo, del más común al menos común (empate: por código).
export function conteoPorTipo(elementos: Elemento[]): { tipo: string; cuantos: number }[] {
  const cuenta = new Map<string, number>();
  for (const e of elementos) cuenta.set(e.tipo, (cuenta.get(e.tipo) || 0) + 1);
  const lista = [...cuenta.entries()].map(([tipo, cuantos]) => ({ tipo, cuantos }));
  lista.sort((a, b) => b.cuantos - a.cuantos || a.tipo.localeCompare(b.tipo));
  return lista;
}

// Dispositivos de un tipo que lleva dirección y todavía no la tiene.
export function sinDireccion(elementos: Elemento[]): Elemento[] {
  return elementos.filter((e) => tipoDispositivo(e.tipo).conDireccion && !e.direccion);
}

function panelNormalizado(panel: string | null): string {
  return (panel || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const ORDEN_TIPO: Record<TipoCircuito, number> = { deteccion: 0, estrobos: 1, voceo: 2 };

// Orden de los circuitos en un panel: lazos SLC, luego NAC, luego voceo, y
// dentro de cada tipo por número.
export function ordenarCircuitos<T extends Lazo>(lista: T[]): T[] {
  return [...lista].sort((a, b) =>
    ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || (a.numero ?? 99) - (b.numero ?? 99) || a.codigo.localeCompare(b.codigo));
}

// Circuitos que salen del mismo panel que `lazo`, incluido él. Con panel
// registrado (panel_id) son todos los de ese panel; sin él, los lazos de
// detección del mismo cliente con el mismo panel escrito.
export function lazosDelMismoPanel<T extends Lazo>(lazo: Lazo, todos: T[]): T[] {
  if (lazo.panel_id) return ordenarCircuitos(todos.filter((l) => l.panel_id === lazo.panel_id));
  if (lazo.tipo !== 'deteccion') return todos.filter((l) => l.id === lazo.id);
  const panel = panelNormalizado(lazo.panel);
  return ordenarCircuitos(todos.filter((l) =>
    !l.panel_id && l.cliente_id === lazo.cliente_id && l.tipo === 'deteccion' && panelNormalizado(l.panel) === panel));
}

// Siguiente número libre de ese tipo en el panel (para proponer el lazo 2
// o la NAC 3).
export function siguienteNumeroDeLazo(lazosDelPanel: Lazo[], tipo: TipoCircuito = 'deteccion'): number {
  let mayor = 0;
  for (const l of lazosDelPanel) if (l.tipo === tipo) mayor = Math.max(mayor, l.numero || 0);
  return Math.min(mayor + 1, 99);
}

export type Salida = { tipo: TipoCircuito; numero: number | null; lazo: Lazo | null };

// Las salidas de un panel, como se ven en su frente: cada SLC, NAC y voceo
// que tiene, con el circuito capturado en ella o vacía. Lo capturado con un
// número más alto que las salidas (o sin número) también aparece.
export function salidasDelPanel<T extends Lazo>(panel: Pick<Panel, 'slc' | 'nac' | 'voceo'>, circuitos: T[]): { tipo: TipoCircuito; salidas: (Salida & { lazo: T | null })[] }[] {
  const capacidad: Record<TipoCircuito, number> = { deteccion: panel.slc, estrobos: panel.nac, voceo: panel.voceo };
  const tipos: TipoCircuito[] = ['deteccion', 'estrobos', 'voceo'];
  const resultado: { tipo: TipoCircuito; salidas: (Salida & { lazo: T | null })[] }[] = [];
  for (const tipo of tipos) {
    const delTipo = ordenarCircuitos(circuitos.filter((c) => c.tipo === tipo));
    const salidas: (Salida & { lazo: T | null })[] = [];
    for (let n = 1; n <= capacidad[tipo]; n++) {
      const enEsa = delTipo.filter((c) => c.numero === n);
      if (enEsa.length === 0) salidas.push({ tipo, numero: n, lazo: null });
      for (const c of enEsa) salidas.push({ tipo, numero: n, lazo: c });
    }
    for (const c of delTipo) {
      const fuera = c.numero === null || c.numero > capacidad[tipo];
      if (fuera) salidas.push({ tipo, numero: c.numero, lazo: c });
    }
    if (salidas.length > 0) resultado.push({ tipo, salidas });
  }
  return resultado;
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

// Cómo se muestra: como la nombran ellos, L + número de lazo a dos dígitos,
// D o M y tres dígitos (D8 en el lazo 1 → L01D008). Sin número de lazo,
// solo D008.
export function prefijoLazo(numeroLazo: number | null): string {
  if (!numeroLazo) return '';
  return `L${String(numeroLazo).padStart(2, '0')}`;
}

export function direccionVisible(direccion: string | null, numeroLazo: number | null): string {
  if (!direccion) return '';
  const letra = direccion[0];
  const numero = direccion.slice(1).padStart(3, '0');
  return `${prefijoLazo(numeroLazo)}${letra}${numero}`;
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

// Recorrido del lazo como en la lista: cada dispositivo de la línea
// principal y enseguida todo lo que cuelga de él (rama por rama).
export function enOrdenDeRecorrido(elementos: Elemento[]): Elemento[] {
  const resultado: Elemento[] = [];
  function agregar(e: Elemento, vueltas: number) {
    resultado.push(e);
    if (vueltas > 50) return; // por si algún dato quedara en ciclo
    for (const hijo of hijosDe(elementos, e.id)) agregar(hijo, vueltas + 1);
  }
  for (const e of lineaPrincipal(elementos)) agregar(e, 0);
  return resultado;
}

// Todo lo que cuelga de un dispositivo, en cualquier nivel.
function descendientesDe(elementos: Elemento[], id: string): string[] {
  const resultado: string[] = [];
  for (const hijo of hijosDe(elementos, id)) {
    resultado.push(hijo.id, ...descendientesDe(elementos, hijo.id));
  }
  return resultado;
}

// Qué queda del lado campo al abrir el lazo a la salida de un dispositivo.
// - En la línea principal: lo que sigue en la línea y sus ramas (las ramas
//   del propio dispositivo se quedan del lado panel, salen antes del corte).
// - En una rama: lo que cuelga de él.
export function ladoCampo(elementos: Elemento[], elemento: Elemento): Set<string> {
  const campo = new Set<string>();
  if (elemento.padre_id) {
    for (const id of descendientesDe(elementos, elemento.id)) campo.add(id);
    return campo;
  }
  const principal = lineaPrincipal(elementos);
  const indice = principal.findIndex((e) => e.id === elemento.id);
  for (const siguiente of principal.slice(indice + 1)) {
    campo.add(siguiente.id);
    for (const id of descendientesDe(elementos, siguiente.id)) campo.add(id);
  }
  return campo;
}

export type ZonaFalla = {
  // Dispositivos donde todavía puede estar la falla.
  ids: Set<string>;
  // Los cortes se contradicen (p. ej. se anotó mal un lado o hay dos fallas).
  contradictorio: boolean;
};

// Dónde puede estar la falla después de los cortes. Cada corte con la falla
// del lado campo deja solo lo de ese lado; del lado panel, lo quita.
export function zonaConFalla(elementos: Elemento[], cortes: { elementoId: string; lado: 'panel' | 'campo' }[]): ZonaFalla {
  let ids = new Set(elementos.map((e) => e.id));
  for (const corte of cortes) {
    const elemento = elementos.find((e) => e.id === corte.elementoId);
    if (!elemento) continue;
    const campo = ladoCampo(elementos, elemento);
    const quedan = new Set<string>();
    for (const id of ids) {
      const estaEnCampo = campo.has(id);
      if (corte.lado === 'campo' && estaEnCampo) quedan.add(id);
      if (corte.lado === 'panel' && !estaEnCampo) quedan.add(id);
    }
    ids = quedan;
  }
  return { ids, contradictorio: ids.size === 0 };
}

// Dónde conviene cortar: el dispositivo que parte la zona lo más cerca
// posible de la mitad, ya sea en la línea principal o dentro de una rama.
// null si ya queda un solo dispositivo.
export function corteSugerido(elementos: Elemento[], zona: ZonaFalla): Elemento | null {
  if (zona.contradictorio || zona.ids.size <= 1) return null;
  let mejor: Elemento | null = null;
  let mejorLadoMayor = Infinity;
  for (const elemento of enOrdenDeRecorrido(elementos)) {
    let enCampo = 0;
    for (const id of ladoCampo(elementos, elemento)) if (zona.ids.has(id)) enCampo++;
    const enPanel = zona.ids.size - enCampo;
    // Un corte que deja todo de un solo lado no enseña nada.
    if (enCampo === 0 || enPanel === 0) continue;
    const ladoMayor = Math.max(enCampo, enPanel);
    if (ladoMayor < mejorLadoMayor) {
      mejor = elemento;
      mejorLadoMayor = ladoMayor;
    }
  }
  return mejor;
}

// Cuántos cortes más, como máximo, para llegar a un solo dispositivo.
export function cortesRestantes(cuantos: number): number {
  if (cuantos <= 1) return 0;
  return Math.ceil(Math.log2(cuantos));
}

// ---------- Historial de cambios ----------

// Un renglón de lazo_historial (supabase/patch_lazos_historial.sql): solo
// trae los campos que cambiaron.
export type Cambio = {
  id: string;
  tabla: 'lazos' | 'lazo_elementos' | 'lazo_fallas' | 'lazo_cortes';
  registro_id: string | null;
  elemento_id: string | null;
  accion: 'alta' | 'cambio' | 'baja';
  antes: Record<string, any> | null;
  despues: Record<string, any> | null;
  usuario_nombre: string | null;
  creado_en: string;
};

function texto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return 'vacío';
  return `«${valor}»`;
}

// «dirección L01D004 → L01D005; ubicación «A» → «B»»
function diferencias(antes: Record<string, any>, despues: Record<string, any>, numeroLazo: number | null): string[] {
  const partes: string[] = [];
  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  let movido = false;
  for (const clave of claves) {
    const a = antes[clave];
    const d = despues[clave];
    if (clave === 'orden' || clave === 'padre_id') { movido = true; continue; }
    if (clave === 'direccion') partes.push(`dirección ${direccionVisible(a, numeroLazo) || 'sin dirección'} → ${direccionVisible(d, numeroLazo) || 'sin dirección'}`);
    else if (clave === 'foto_path') partes.push(a ? 'cambió la foto' : 'agregó la foto');
    else if (clave === 'nombre') partes.push(`nombre ${texto(a)} → ${texto(d)}`);
    else if (clave === 'ubicacion') partes.push(`ubicación ${texto(a)} → ${texto(d)}`);
    else if (clave === 'tipo') partes.push(`tipo ${a} → ${d}`);
    else if (clave === 'panel') partes.push(`panel ${texto(a)} → ${texto(d)}`);
    else if (clave === 'clase') partes.push(`clase ${a || '—'} → ${d || '—'}`);
    else if (clave === 'panel_id') partes.push(d ? 'lo pasó a un panel' : 'lo quitó del panel');
    else if (clave === 'numero') partes.push(`número ${a ?? '—'} → ${d ?? '—'}`);
  }
  if (movido) partes.push('lo cambió de lugar en el lazo');
  return partes;
}

// Frase de un cambio para leerla en el historial. `nombreDe` da el nombre
// actual de un dispositivo (si ya se borró, se usa el que traía el cambio).
export function describirCambio(c: Cambio, numeroLazo: number | null, nombreDe: (id: string | null) => string | null): string {
  const antes = c.antes || {};
  const despues = c.despues || {};
  const fila = { ...antes, ...despues };

  if (c.tabla === 'lazo_elementos') {
    const nombre = nombreDe(c.elemento_id) || fila.nombre || 'un dispositivo';
    const direccion = direccionVisible(fila.direccion ?? null, numeroLazo);
    const conDireccion = direccion ? ` (${direccion})` : '';
    if (c.accion === 'alta') return `Agregó ${nombre}${conDireccion}`;
    if (c.accion === 'baja') return `Borró ${antes.nombre || nombre}${conDireccion}`;
    const partes = diferencias(antes, despues, numeroLazo);
    return `Corrigió ${nombre}${partes.length ? ': ' + partes.join('; ') : ''}`;
  }

  if (c.tabla === 'lazo_cortes') {
    const nombre = nombreDe(c.elemento_id) || 'un dispositivo';
    if (c.accion === 'baja') return `Quitó el corte a la salida de ${nombre}`;
    const medicion = fila.medicion ? ` · ${fila.medicion}` : '';
    return `Registró un corte a la salida de ${nombre}: la falla quedó del lado ${fila.lado}${medicion}`;
  }

  if (c.tabla === 'lazo_fallas') {
    if (c.accion === 'alta') return 'Inició una búsqueda de falla a tierra';
    if (c.accion === 'baja') return 'Borró una búsqueda de falla a tierra';
    if (despues.estado === 'resuelta') {
      const donde = nombreDe(c.elemento_id);
      return `Cerró la búsqueda de falla${donde ? ` en ${donde}` : ''}${fila.causa ? `: ${fila.causa}` : ''}`;
    }
    return 'Actualizó la búsqueda de falla a tierra';
  }

  if (c.accion === 'alta') return `Creó el lazo ${fila.codigo || ''}`.trim();
  const partes = diferencias(antes, despues, numeroLazo);
  return `Cambió los datos del lazo${partes.length ? ': ' + partes.join('; ') : ''}`;
}
