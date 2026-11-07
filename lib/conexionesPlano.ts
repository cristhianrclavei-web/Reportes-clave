// Conexiones del lazo dibujadas en el plano: de qué dispositivo viene cada
// uno, dónde queda el que se conecta desde el plano y las flechas entre
// planos (un lazo que pasa de un nivel a otro). Lógica pura, se prueba en
// lib/conexionesPlano.test.ts.
//
// No hay datos nuevos: «de este se conecta a este» es el mismo orden y las
// mismas ramas del diagrama unifilar (lazo_elementos: padre_id y orden). Lo
// que se conecta en el plano aparece en el unifilar y al revés.

import {
  hijosDe, lineaPrincipal, lugarAlFinal, lugarAntesDe, lugarColgandoDe, lugarDespuesDe,
  type Elemento, type Lazo, type Lugar,
} from './lazos';
import type { Punto, Sembrado } from './planos';

// ---------- Recorrido ----------

// De dónde le llega el cable: del panel (primero de la línea principal), del
// dispositivo anterior en la línea, o del que cuelga (en una rama).
export function anteriorDe(elementos: Elemento[], elemento: Elemento): 'panel' | Elemento | null {
  if (elemento.padre_id) return elementos.find((e) => e.id === elemento.padre_id) || null;
  const principal = lineaPrincipal(elementos);
  const i = principal.findIndex((e) => e.id === elemento.id);
  if (i <= 0) return 'panel';
  return principal[i - 1];
}

// ¿Ya sale algo de él? En la línea principal: el siguiente de la línea.
// En una rama: lo que cuelga de él.
export function tieneSiguiente(elementos: Elemento[], elemento: Elemento): boolean {
  if (elemento.padre_id) return hijosDe(elementos, elemento.id).length > 0;
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

// ---------- Lo que se dibuja ----------

export type LineaConexion = { lazoId: string; desde: Punto; hasta: Punto };
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
export function conexionesEnPlano(
  lazos: { id: string; panel_id?: string | null; elementos: Elemento[] }[],
  sembrado: Sembrado,
  planoDe: Map<string, string>,
): { lineas: LineaConexion[]; marcas: MarcaConexion[] } {
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
      if (anterior === null) continue;
      if (anterior === 'panel') {
        // El cable sale del panel: línea si el panel está sembrado aquí.
        const panelAqui = lazo.panel_id ? posicion.get(lazo.panel_id) || null : panelSinRegistro;
        const panelEn = lazo.panel_id ? planoDe.get(lazo.panel_id) : undefined;
        if (aqui && panelAqui) lineas.push({ lazoId: lazo.id, desde: panelAqui, hasta: aqui });
        else if (aqui && panelEn) marcar(lazo.id, aqui, `« Panel en ${panelEn}`);
        else if (aqui) marcar(lazo.id, aqui, '« Panel');
        else if (panelAqui && planoDe.has(elemento.id)) marcar(lazo.id, panelAqui, `Sigue en ${planoDe.get(elemento.id)} »`);
        continue;
      }
      const alla = posicion.get(anterior.id) || null;
      if (aqui && alla) {
        lineas.push({ lazoId: lazo.id, desde: alla, hasta: aqui });
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

  const sinPlano = elementos.filter((e) => !enAlgunPlano.has(e.id)).length;
  if (sinPlano > 0) avisos.push(`${sinPlano} ${sinPlano === 1 ? 'dispositivo todavía no está' : 'dispositivos todavía no están'} en ningún plano.`);

  return avisos;
}
