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

// Un panel de un cliente. slc/nac/voceo quedan en la base pero ya no se
// usan: los circuitos se agregan uno por uno.
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
  // Todo junto («Cocina · Planta baja · sobre plafón»); es lo que se muestra.
  ubicacion: string | null;
  // Por partes (patch_lazos_ubicacion.sql). Sin el patch no vienen.
  area?: string | null;
  nivel?: string | null;
  referencia?: string | null;
  foto_path: string | null;
  // Primero de un tramo que todavía no se une al lazo (patch_lazos_sin_conectar.sql):
  // se captura un nivel antes de saber dónde se conecta. Solo cuenta sin padre.
  sin_conectar?: boolean;
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
  // El panel no va en ningún lazo, pero se siembra en el plano.
  if (codigo === PANEL_EN_PLANO) return { codigo, nombre: 'Panel de alarma (FACP)', forma: 'cuadro', conDireccion: false };
  return { codigo, nombre: codigo, forma: 'cuadro', conDireccion: false };
}

export const PANEL_EN_PLANO = 'FACP';

// ---------- Orden ----------

function porOrden(a: Elemento, b: Elemento): number {
  return a.orden - b.orden;
}

// Dispositivos de la línea principal, del panel al final.
export function lineaPrincipal(elementos: Elemento[]): Elemento[] {
  return elementos.filter((e) => !e.padre_id && !e.sin_conectar).sort(porOrden);
}

// ¿Es el primero de un tramo sin conectar?
export function esInicioSinConectar(e: Elemento): boolean {
  return !e.padre_id && Boolean(e.sin_conectar);
}

// Primeros de los tramos sin conectar, en el orden en que se crearon.
export function tramosSinConectar(elementos: Elemento[]): Elemento[] {
  return elementos.filter(esInicioSinConectar).sort(porOrden);
}

// Todos los que están en un tramo sin conectar (el primero y lo que cuelga).
export function idsSinConectar(elementos: Elemento[]): Set<string> {
  const ids = new Set<string>();
  for (const inicio of tramosSinConectar(elementos)) for (const id of subarbol(elementos, inicio.id)) ids.add(id);
  return ids;
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

// ---------- Ubicación por partes ----------

export type PartesUbicacion = { area: string; nivel: string; referencia: string };

// «Cocina · Planta baja · sobre plafón». null si no hay nada.
export function armarUbicacion(partes: PartesUbicacion): string | null {
  const texto = [partes.area, partes.nivel, partes.referencia].map((p) => p.trim()).filter(Boolean).join(' · ');
  return texto || null;
}

// Partes para editar un dispositivo. Los capturados antes de separar la
// ubicación solo tienen el texto junto: va completo en «Área».
export function partesDe(e: Pick<Elemento, 'ubicacion' | 'area' | 'nivel' | 'referencia'>): PartesUbicacion {
  if (e.area || e.nivel || e.referencia) return { area: e.area || '', nivel: e.nivel || '', referencia: e.referencia || '' };
  return { area: e.ubicacion || '', nivel: '', referencia: '' };
}

// Valores que ya se usaron en el lazo para un campo, del más usado al menos
// (para tocarlos en vez de escribirlos otra vez).
export function valoresUsados(elementos: Elemento[], campo: 'area' | 'nivel', maximo = 8): string[] {
  const cuenta = new Map<string, number>();
  for (const e of elementos) {
    const valor = (e[campo] || '').trim();
    if (valor) cuenta.set(valor, (cuenta.get(valor) || 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).slice(0, maximo).map(([valor]) => valor);
}

// Sin acentos ni mayúsculas, para comparar lo que se escribe con lo ya usado.
function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Primera sugerencia que empieza con lo escrito («habit» → «Habitación 30»).
// Nada si no hay lo escrito, si nada coincide o si ya está completo.
export function sugerenciaPara(escrito: string, sugerencias: string[]): string | null {
  const buscado = sinAcentos(escrito);
  if (!buscado.trim()) return null;
  for (const s of sugerencias) {
    const opcion = sinAcentos(s);
    if (opcion.startsWith(buscado) && opcion !== buscado) return s;
  }
  return null;
}

// Cuántos dispositivos hay en cada nivel (los que no tienen nivel no cuentan).
export function conteoPorNivel(elementos: Elemento[]): { nivel: string; cuantos: number }[] {
  const cuenta = new Map<string, number>();
  for (const e of elementos) {
    const nivel = (e.nivel || '').trim();
    if (nivel) cuenta.set(nivel, (cuenta.get(nivel) || 0) + 1);
  }
  return [...cuenta.entries()].map(([nivel, cuantos]) => ({ nivel, cuantos })).sort((a, b) => b.cuantos - a.cuantos || a.nivel.localeCompare(b.nivel, 'es'));
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

// La dirección escrita en un plano («L01D017», «D17», «M004») como se guarda
// en el lazo (letra y número de 3 cifras). null si no se entiende.
export function direccionDeTexto(texto: string): string | null {
  const partes = /^(?:L\d{1,2}[-\s]?)?([DM])[-\s]?(\d{1,3})$/i.exec(texto.trim());
  if (!partes || Number(partes[2]) === 0) return null;
  return partes[1].toUpperCase() + partes[2].padStart(3, '0');
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
  // Al final, lo que falta unir al lazo.
  for (const e of tramosSinConectar(elementos)) agregar(e, 0);
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
    // area, nivel y referencia ya van dentro de «ubicación».
    else if (clave === 'area' || clave === 'nivel' || clave === 'referencia') continue;
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

// ---------- Lugares: dónde va un dispositivo ----------

// Dónde va el dispositivo: colgando de quién (o en la línea principal) y
// entre qué números de orden.
//
// En la línea principal los dispositivos van uno tras otro con `orden`.
// Lo que cuelga directo de un dispositivo es una RAMA aparte (varias = una
// estrella); dentro de una rama, lo que sigue en serie cuelga del anterior.
// `adoptar`: dispositivos que pasan a colgar del nuevo (al insertar en medio
// de una rama, lo que seguía queda después del nuevo).
// `sinConectar`: el nuevo es el primero de un tramo que todavía no se une al lazo.
export type Lugar = { padreId: string | null; ordenAntes: number | null; ordenDespues: number | null; adoptar?: string[]; sinConectar?: boolean };

// Lugar al final de la línea principal.
export function lugarAlFinal(elementos: Elemento[]): Lugar {
  const principal = lineaPrincipal(elementos);
  const ultimo = principal[principal.length - 1];
  return { padreId: null, ordenAntes: ultimo ? ultimo.orden : null, ordenDespues: null };
}

// Lugar justo después de un dispositivo. En una rama: en serie después de
// él, y lo que seguía pasa a seguir al nuevo.
export function lugarDespuesDe(elementos: Elemento[], elemento: Elemento): Lugar {
  // En una rama o en un tramo sin conectar, lo que sigue cuelga de él.
  if (elemento.padre_id || esInicioSinConectar(elemento)) {
    return { padreId: elemento.id, ordenAntes: null, ordenDespues: null, adoptar: hijosDe(elementos, elemento.id).map((h) => h.id) };
  }
  const hermanos = elemento.padre_id ? hijosDe(elementos, elemento.padre_id) : lineaPrincipal(elementos);
  const i = hermanos.findIndex((h) => h.id === elemento.id);
  const siguiente = hermanos[i + 1];
  return { padreId: elemento.padre_id, ordenAntes: elemento.orden, ordenDespues: siguiente ? siguiente.orden : null };
}

// Lugar justo antes de un dispositivo. En una rama, el nuevo toma su lugar
// y él pasa a colgar del nuevo.
export function lugarAntesDe(elementos: Elemento[], elemento: Elemento): Lugar {
  // Antes del primero de un tramo sin conectar: el nuevo pasa a ser el primero.
  if (esInicioSinConectar(elemento)) {
    return { padreId: null, ordenAntes: null, ordenDespues: elemento.orden, adoptar: [elemento.id], sinConectar: true };
  }
  const hermanos = elemento.padre_id ? hijosDe(elementos, elemento.padre_id) : lineaPrincipal(elementos);
  const i = hermanos.findIndex((h) => h.id === elemento.id);
  const anterior = hermanos[i - 1];
  const adoptar = elemento.padre_id ? [elemento.id] : undefined;
  return { padreId: elemento.padre_id, ordenAntes: anterior ? anterior.orden : null, ordenDespues: elemento.orden, adoptar };
}

// Una rama nueva desde un dispositivo, a la derecha de las que ya tiene.
export function lugarColgandoDe(elementos: Elemento[], padre: Elemento): Lugar {
  const hijos = hijosDe(elementos, padre.id);
  const ultimo = hijos[hijos.length - 1];
  return { padreId: padre.id, ordenAntes: ultimo ? ultimo.orden : null, ordenDespues: null };
}

// El dispositivo de la línea principal del que cuelga (o él mismo).
export function raizDe(elementos: Elemento[], elemento: Elemento): Elemento {
  let actual = elemento;
  let vueltas = 0;
  while (actual.padre_id && vueltas < 50) {
    const padre = elementos.find((e) => e.id === actual.padre_id);
    if (!padre) break;
    actual = padre;
    vueltas++;
  }
  return actual;
}


// ---------- Acomodo del diagrama ----------

// Una rama chica (pocos dispositivos) se dibuja colgando debajo de su
// dispositivo. Una larga (como 23 en serie) haría el diagrama altísimo y en
// el PDF se saldría de la hoja: se dibuja aparte como su propia línea, a lo
// ancho y en renglones, con una etiqueta «Rama A» en el dispositivo del que sale.
export const MAXIMO_RAMA_COLGADA = 4;

export type BloqueRama = {
  letra: string;
  // Dispositivo del que sale la rama (null: tramo sin conectar al lazo).
  origen: Elemento | null;
  // La rama en serie: el primero y lo que sigue colgando uno de otro.
  linea: Elemento[];
};

export type AcomodoDiagrama = {
  principal: Elemento[];
  bloques: BloqueRama[];
  // Primer dispositivo de cada rama que va aparte → su letra.
  letraDeRama: Map<string, string>;
};

export function cuantosEnRama(elementos: Elemento[], id: string, vueltas = 0): number {
  if (vueltas > 50) return 1;
  return 1 + hijosDe(elementos, id).reduce((suma, h) => suma + cuantosEnRama(elementos, h.id, vueltas + 1), 0);
}

// La serie que empieza en `inicio`: sigue mientras cada uno tenga
// exactamente un dispositivo colgando. Se detiene en el que tiene varios
// (una estrella) o ninguno.
export function cadenaDesde(elementos: Elemento[], inicio: Elemento): Elemento[] {
  const cadena = [inicio];
  let actual = inicio;
  while (cadena.length < 500) {
    const hijos = hijosDe(elementos, actual.id);
    if (hijos.length !== 1) break;
    actual = hijos[0];
    cadena.push(actual);
  }
  return cadena;
}

// Lo que cuelga del dispositivo `i` de una línea, sin contar al siguiente de
// la misma línea (en una rama, el siguiente es su hijo).
export function colgantesEnLinea(elementos: Elemento[], linea: Elemento[], i: number): Elemento[] {
  const siguiente = linea[i + 1];
  return hijosDe(elementos, linea[i].id).filter((h) => h.id !== siguiente?.id);
}

function letraNumero(n: number): string {
  let texto = '';
  let k = n;
  do {
    texto = String.fromCharCode(65 + (k % 26)) + texto;
    k = Math.floor(k / 26) - 1;
  } while (k >= 0);
  return texto;
}

export function armarDiagrama(elementos: Elemento[]): AcomodoDiagrama {
  const principal = lineaPrincipal(elementos);
  const bloques: BloqueRama[] = [];
  const letraDeRama = new Map<string, string>();

  // Recorre una línea y aparta sus ramas largas; cada rama apartada se
  // recorre igual (puede tener sus propias ramas largas).
  function revisar(linea: Elemento[]) {
    linea.forEach((e, i) => {
      for (const colgante of colgantesEnLinea(elementos, linea, i)) {
        if (cuantosEnRama(elementos, colgante.id) <= MAXIMO_RAMA_COLGADA) continue;
        const bloque: BloqueRama = { letra: letraNumero(bloques.length), origen: e, linea: cadenaDesde(elementos, colgante) };
        bloques.push(bloque);
        letraDeRama.set(colgante.id, bloque.letra);
        revisar(bloque.linea);
      }
    });
  }
  revisar(principal);
  // Tramos sin conectar: cada uno aparte, al final.
  for (const inicio of tramosSinConectar(elementos)) {
    const bloque: BloqueRama = { letra: letraNumero(bloques.length), origen: null, linea: cadenaDesde(elementos, inicio) };
    bloques.push(bloque);
    revisar(bloque.linea);
  }
  return { principal, bloques, letraDeRama };
}

// ---------- Mover un dispositivo ----------

export type ModoMover = 'despues' | 'antes' | 'colgar';

function subarbol(elementos: Elemento[], id: string): Set<string> {
  const ids = new Set<string>([id]);
  let crecio = true;
  while (crecio) {
    crecio = false;
    for (const e of elementos) {
      if (e.padre_id && ids.has(e.padre_id) && !ids.has(e.id)) {
        ids.add(e.id);
        crecio = true;
      }
    }
  }
  return ids;
}

// Qué dispositivos cambian (padre y orden) al mover `moverId` respecto a
// `destinoId`. Si el que se mueve va en serie dentro de una rama, el hueco
// se cierra (lo que seguía sube a su lugar); si tiene ramas propias, se las
// lleva. Lanza un error si el destino no tiene sentido.
export function planDeMovimiento(elementos: Elemento[], moverId: string, destinoId: string, modo: ModoMover): Elemento[] {
  const original = new Map(elementos.map((e) => [e.id, e]));
  const mover = original.get(moverId);
  const destino = original.get(destinoId);
  if (!mover || !destino) throw new Error('No se encontró el dispositivo.');
  if (moverId === destinoId) throw new Error('Elige otro dispositivo como destino.');

  const trabajo = new Map(elementos.map((e) => [e.id, { ...e }]));
  const lista = () => [...trabajo.values()];

  // 1. Sacarlo de donde está.
  const hijos = hijosDe(elementos, moverId);
  if (mover.padre_id && hijos.length === 1) {
    const siguiente = trabajo.get(hijos[0].id) as Elemento;
    siguiente.padre_id = mover.padre_id;
    siguiente.orden = mover.orden;
  }
  const seLleva = subarbol(lista(), moverId);
  if (seLleva.has(destinoId)) throw new Error('No se puede poner dentro de lo que cuelga de él mismo.');
  // Mientras se calcula el nuevo lugar no debe contar en su sitio viejo.
  trabajo.delete(moverId);

  // 2. Lugar nuevo, como si se capturara ahí.
  const destinoActual = trabajo.get(destinoId) as Elemento;
  let lugar: Lugar;
  if (modo === 'despues') lugar = lugarDespuesDe(lista(), destinoActual);
  else if (modo === 'antes') lugar = lugarAntesDe(lista(), destinoActual);
  else lugar = lugarColgandoDe(lista(), destinoActual);

  // Si estaba sin conectar y se pone en el lazo, ya queda conectado.
  const movido: Elemento = { ...mover, padre_id: lugar.padreId, orden: ordenEntre(lugar.ordenAntes, lugar.ordenDespues), sin_conectar: Boolean(lugar.sinConectar) };
  trabajo.set(moverId, movido);
  for (const id of lugar.adoptar || []) {
    if (id === moverId) continue;
    const adoptado = trabajo.get(id);
    if (adoptado) adoptado.padre_id = moverId;
  }

  // 3. Solo lo que cambió.
  const cambios: Elemento[] = [];
  for (const e of trabajo.values()) {
    const antes = original.get(e.id) as Elemento;
    if (antes.padre_id !== e.padre_id || antes.orden !== e.orden || Boolean(antes.sin_conectar) !== Boolean(e.sin_conectar)) cambios.push(e);
  }
  return cambios;
}

// Cómo quedan varios dispositivos movidos juntos (p. ej. 5 que se capturaron
// en serie y en realidad salen de otro). 'estrella': cada uno sale directo
// del destino como derivación propia; los demás modos los dejan en serie,
// en el mismo orden en que estaban.
export type ModoMoverVarios = ModoMover | 'estrella';

export function planDeMovimientoVarios(elementos: Elemento[], ids: string[], destinoId: string, modo: ModoMoverVarios): Elemento[] {
  if (ids.length === 0) return [];
  if (ids.includes(destinoId)) throw new Error('El destino no puede ser uno de los que vas a mover.');

  // En el orden del recorrido, no en el orden en que se tocaron.
  const posicion = new Map(enOrdenDeRecorrido(elementos).map((e, i) => [e.id, i]));
  const enOrden = [...ids].sort((a, b) => (posicion.get(a) ?? 0) - (posicion.get(b) ?? 0));

  // Uno por uno sobre la copia de trabajo: el primero va respecto al
  // destino y cada siguiente después del anterior, así quedan en serie.
  let trabajo = elementos;
  let anterior: string | null = null;
  for (const id of enOrden) {
    let cambios: Elemento[];
    if (modo === 'estrella') cambios = planDeMovimiento(trabajo, id, destinoId, 'colgar');
    else if (anterior === null) cambios = planDeMovimiento(trabajo, id, destinoId, modo);
    else cambios = planDeMovimiento(trabajo, id, anterior, 'despues');
    const cambiado = new Map(cambios.map((c) => [c.id, c]));
    trabajo = trabajo.map((e) => cambiado.get(e.id) || e);
    anterior = id;
  }

  // Solo lo que quedó distinto a como estaba.
  const original = new Map(elementos.map((e) => [e.id, e]));
  return trabajo.filter((e) => {
    const antes = original.get(e.id) as Elemento;
    return antes.padre_id !== e.padre_id || antes.orden !== e.orden || Boolean(antes.sin_conectar) !== Boolean(e.sin_conectar);
  });
}
