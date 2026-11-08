// Conexiones del lazo dibujadas en el plano: de qué dispositivo viene cada
// uno, dónde queda el que se conecta desde el plano y las flechas entre
// planos (un lazo que pasa de un nivel a otro). Lógica pura, se prueba en
// lib/conexionesPlano.test.ts.
//
// No hay datos nuevos: «de este se conecta a este» es el mismo orden y las
// mismas ramas del diagrama unifilar (lazo_elementos: padre_id y orden). Lo
// que se conecta en el plano aparece en el unifilar y al revés.

import {
  esInicioSinConectar, hijosDe, lineaPrincipal, ordenEntre, tramosSinConectar, lugarAlFinal, lugarAntesDe, lugarColgandoDe, lugarDespuesDe,
  type Elemento, type Lazo, type Lugar,
} from './lazos';
import type { Punto, Sembrado } from './planos';
import { redDeTuberias } from './rutaTuberia';

// ---------- Recorrido ----------

// De dónde le llega el cable: del panel (primero de la línea principal), del
// dispositivo anterior en la línea, o del que cuelga (en una rama).
export function anteriorDe(elementos: Elemento[], elemento: Elemento): 'panel' | Elemento | null {
  if (elemento.padre_id) return elementos.find((e) => e.id === elemento.padre_id) || null;
  // Primero de un tramo sin conectar: todavía no le llega de ningún lado.
  if (esInicioSinConectar(elemento)) return null;
  const principal = lineaPrincipal(elementos);
  const i = principal.findIndex((e) => e.id === elemento.id);
  if (i <= 0) return 'panel';
  return principal[i - 1];
}

// ¿Ya sale algo de él? En la línea principal: el siguiente de la línea.
// En una rama: lo que cuelga de él.
export function tieneSiguiente(elementos: Elemento[], elemento: Elemento): boolean {
  if (elemento.padre_id || esInicioSinConectar(elemento)) return hijosDe(elementos, elemento.id).length > 0;
  const principal = lineaPrincipal(elementos);
  const i = principal.findIndex((e) => e.id === elemento.id);
  return i >= 0 && i < principal.length - 1;
}

// Dónde queda un dispositivo nuevo conectado «después de `desde`».
// - Desde el panel: primero de la línea principal.
// - Si de `desde` todavía no sale nada: sigue en serie.
// - Si ya sale algo: rama nueva (estrella), o en medio si se pide.
export function lugarParaConectar(elementos: Elemento[], desde: 'panel' | Elemento, enMedio: boolean): Lugar {
  if (desde === 'panel') {
    const principal = lineaPrincipal(elementos);
    if (principal.length === 0) return lugarAlFinal(elementos);
    return lugarAntesDe(elementos, principal[0]);
  }
  if (tieneSiguiente(elementos, desde) && !enMedio) return lugarColgandoDe(elementos, desde);
  return lugarDespuesDe(elementos, desde);
}

// Un tramo nuevo que todavía no se une al lazo (otro nivel, por ejemplo):
// se arma y se conecta después con conectarTramo.
export function lugarTramoSinConectar(elementos: Elemento[]): Lugar {
  const tramos = tramosSinConectar(elementos);
  const ultimo = tramos[tramos.length - 1];
  return { padreId: null, ordenAntes: ultimo ? ultimo.orden : null, ordenDespues: null, sinConectar: true };
}

// Une un tramo sin conectar (el que empieza en `inicioId`) después de
// `desde`. Si queda al final de la línea principal (o en medio, si se pide),
// el tramo en serie pasa a ser parte de la línea; si `desde` ya tiene
// siguiente, el tramo cuelga de él como rama. Devuelve los que cambian.
export function conectarTramo(elementos: Elemento[], inicioId: string, desde: 'panel' | Elemento, enMedio: boolean): Elemento[] {
  const inicio = elementos.find((e) => e.id === inicioId);
  if (!inicio || !esInicioSinConectar(inicio)) throw new Error('Ese tramo ya está conectado.');
  if (desde !== 'panel' && enSuTramo(elementos, inicio, desde)) throw new Error('No se puede unir un tramo consigo mismo.');

  // En una rama, o si ya sale algo y no se pidió en medio: cuelga como rama.
  const comoRama = desde !== 'panel' && (Boolean(desde.padre_id) || (tieneSiguiente(elementos, desde) && !enMedio));
  if (desde !== 'panel' && comoRama) {
    const hijos = hijosDe(elementos, desde.id);
    const ultimoHijo = hijos[hijos.length - 1];
    return [{ ...inicio, padre_id: desde.id, orden: ordenEntre(ultimoHijo ? ultimoHijo.orden : null, null), sin_conectar: false }];
  }

  // A la línea principal: la serie del tramo, uno tras otro, entre `desde` y el que seguía.
  const principal = lineaPrincipal(elementos);
  let antes: number | null;
  let despues: number | null;
  if (desde === 'panel') {
    antes = null;
    despues = principal[0] ? principal[0].orden : null;
  } else {
    const i = principal.findIndex((e) => e.id === desde.id);
    antes = desde.orden;
    despues = principal[i + 1] ? principal[i + 1].orden : null;
  }
  const serie: Elemento[] = [inicio];
  while (serie.length < 500) {
    const hijos = hijosDe(elementos, serie[serie.length - 1].id);
    if (hijos.length !== 1) break;
    serie.push(hijos[0]);
  }
  const cambios: Elemento[] = [];
  serie.forEach((e, k) => {
    let orden: number;
    if (antes === null && despues === null) orden = k + 1;
    else if (despues === null) orden = (antes as number) + k + 1;
    else if (antes === null) orden = despues - (serie.length - k);
    else orden = antes + ((despues - antes) * (k + 1)) / (serie.length + 1);
    cambios.push({ ...e, padre_id: null, orden, sin_conectar: false });
  });
  return cambios;
}

// ¿`otro` es parte del tramo que empieza en `inicio`?
function enSuTramo(elementos: Elemento[], inicio: Elemento, otro: Elemento): boolean {
  let actual: Elemento | undefined = otro;
  let vueltas = 0;
  while (actual && vueltas < 500) {
    if (actual.id === inicio.id) return true;
    actual = actual.padre_id ? elementos.find((e) => e.id === actual?.padre_id) : undefined;
    vueltas++;
  }
  return false;
}

// ---------- Lo que se dibuja ----------

// `camino`: por dónde se dibuja; sigue la tubería si los dos están junto a
// una tubería que los une, si no es la línea directa [desde, hasta].
export type LineaConexion = { lazoId: string; desde: Punto; hasta: Punto; camino: Punto[] };
export type MarcaConexion = { lazoId: string; en: Punto; texto: string };

// Un color por lazo (distinto de los de la tubería), por su lugar en la lista.
const COLORES_LAZO = ['#0f766e', '#a21caf', '#b45309', '#1d4ed8', '#be123c', '#4d7c0f', '#7c2d12', '#334155'];

export function colorDeLazo(indice: number): string {
  return COLORES_LAZO[indice % COLORES_LAZO.length];
}

// Líneas entre dispositivos sembrados en este plano y marcas cuando el
// cable llega del panel, viene de otro plano o sigue en otro plano.
// `planoDe`: en qué otro plano está sembrado cada dispositivo.
// `planoDe` y la posición se buscan igual para dispositivos y paneles (por id).
// `alcance`: qué tan lejos de una tubería puede estar un equipo para que el
// cable se dibuje por ella (0 = siempre línea directa).
export function conexionesEnPlano(
  lazos: { id: string; panel_id?: string | null; elementos: Elemento[] }[],
  sembrado: Sembrado,
  planoDe: Map<string, string>,
  alcance = 0,
): { lineas: LineaConexion[]; marcas: MarcaConexion[] } {
  const red = alcance > 0 ? redDeTuberias(sembrado.tuberias, alcance) : null;
  function linea(lazoId: string, desde: Punto, hasta: Punto): LineaConexion {
    const camino = (red && red.ruta(desde, hasta)) || [desde, hasta];
    return { lazoId, desde, hasta, camino };
  }

  const posicion = new Map<string, Punto>();
  for (const e of sembrado.equipos) {
    if (e.elementoId) posicion.set(e.elementoId, [e.x, e.y]);
    if (e.panelId) posicion.set(e.panelId, [e.x, e.y]);
  }

  // Un lazo sin panel registrado sale del único panel sin registrar del plano.
  const sinRegistrar = sembrado.equipos.filter((e) => e.tipo === 'FACP' && !e.panelId);
  const panelSinRegistro: Punto | null = sinRegistrar.length === 1 ? [sinRegistrar[0].x, sinRegistrar[0].y] : null;

  const lineas: LineaConexion[] = [];
  const marcas: MarcaConexion[] = [];
  const yaMarcado = new Set<string>();

  function marcar(lazoId: string, en: Punto, texto: string) {
    const clave = `${en[0]},${en[1]},${texto}`;
    if (yaMarcado.has(clave)) return;
    yaMarcado.add(clave);
    marcas.push({ lazoId, en, texto });
  }

  for (const lazo of lazos) {
    for (const elemento of lazo.elementos) {
      const aqui = posicion.get(elemento.id) || null;
      const anterior = anteriorDe(lazo.elementos, elemento);
      if (anterior === null) {
        if (aqui && esInicioSinConectar(elemento)) marcar(lazo.id, aqui, '« Sin conectar');
        continue;
      }
      if (anterior === 'panel') {
        // El cable sale del panel: línea si el panel está sembrado aquí.
        const panelAqui = lazo.panel_id ? posicion.get(lazo.panel_id) || null : panelSinRegistro;
        const panelEn = lazo.panel_id ? planoDe.get(lazo.panel_id) : undefined;
        if (aqui && panelAqui) lineas.push(linea(lazo.id, panelAqui, aqui));
        else if (aqui && panelEn) marcar(lazo.id, aqui, `« Panel en ${panelEn}`);
        else if (aqui) marcar(lazo.id, aqui, '« Panel');
        else if (panelAqui && planoDe.has(elemento.id)) marcar(lazo.id, panelAqui, `Sigue en ${planoDe.get(elemento.id)} »`);
        continue;
      }
      const alla = posicion.get(anterior.id) || null;
      if (aqui && alla) {
        lineas.push(linea(lazo.id, alla, aqui));
      } else if (aqui && planoDe.has(anterior.id)) {
        marcar(lazo.id, aqui, `« Viene de ${planoDe.get(anterior.id)}`);
      } else if (alla && planoDe.has(elemento.id)) {
        marcar(lazo.id, alla, `Sigue en ${planoDe.get(elemento.id)} »`);
      }
    }
  }
  return { lineas, marcas };
}

// ---------- Revisión ----------

// Avisos para revisar el lazo antes de darlo por bueno. No bloquean nada.
export function revisarLazo(
  lazo: Pick<Lazo, 'tipo' | 'clase'>,
  elementos: Elemento[],
  enAlgunPlano: Set<string>,
  textoDireccion: (direccion: string) => string,
): string[] {
  const avisos: string[] = [];

  const enDerivacion = elementos.filter((e) => e.padre_id).length;
  if (enDerivacion > 0 && lazo.tipo === 'deteccion' && lazo.clase === 'A') {
    avisos.push(`Lazo clase A con ${enDerivacion} en derivación (T). En clase A el cable sale y regresa al panel sin derivaciones.`);
  }
  if (enDerivacion > 0 && lazo.tipo !== 'deteccion') {
    avisos.push(`Circuito de notificación con ${enDerivacion} en derivación (T). Normalmente va en un solo recorrido con el fin de línea al final.`);
  }

  const porDireccion = new Map<string, number>();
  for (const e of elementos) if (e.direccion) porDireccion.set(e.direccion, (porDireccion.get(e.direccion) || 0) + 1);
  const repetidas = [...porDireccion].filter(([, cuantos]) => cuantos > 1).map(([direccion]) => textoDireccion(direccion));
  if (repetidas.length > 0) avisos.push(`Dirección repetida: ${repetidas.join(', ')}.`);

  const sueltos = tramosSinConectar(elementos).length;
  if (sueltos > 0) avisos.push(`${sueltos} ${sueltos === 1 ? 'tramo sin conectar' : 'tramos sin conectar'}: falta unirlo al lazo.`);

  const sinPlano = elementos.filter((e) => !enAlgunPlano.has(e.id)).length;
  if (sinPlano > 0) avisos.push(`${sinPlano} ${sinPlano === 1 ? 'dispositivo todavía no está' : 'dispositivos todavía no están'} en ningún plano.`);

  return avisos;
}
