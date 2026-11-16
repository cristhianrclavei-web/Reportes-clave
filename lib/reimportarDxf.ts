// Volver a subir el DXF de un plano que ya existe, sin duplicar equipos.
//
// Se compara lo que trae el DXF nuevo contra lo que ya está colocado:
//   1. Por dirección: el mismo «L01D017» es el mismo equipo aunque se haya movido.
//   2. Por posición: sin dirección, el equipo del mismo tipo más cercano
//      (dentro de `tolerancia`, en puntos de la hoja).
// Resultado: nuevos (no estaban), actualizados (se movieron o cambiaron de
// tipo o dirección), sin cambio, y eliminados (ya no vienen en el DXF). La
// pantalla deja elegir cuáles aplicar. Lógica pura; se prueba en
// lib/reimportarDxf.test.ts.

import { PANEL_EN_PLANO, direccionDeTexto } from './lazos';
import type { EquipoPlano } from './planos';

export type Cambio = { anterior: EquipoPlano; nuevo: EquipoPlano; motivo: string };

export type Comparacion = {
  nuevos: EquipoPlano[];
  actualizados: Cambio[];
  sinCambio: number;
  eliminados: EquipoPlano[];
};

type Direccion = { lazo: number | null; direccion: string };

function leerDireccion(etiqueta: string | null | undefined): Direccion | null {
  if (!etiqueta) return null;
  const direccion = direccionDeTexto(etiqueta);
  if (!direccion) return null;
  const lazo = /^L(\d{1,2})/i.exec(etiqueta.trim());
  return { lazo: lazo ? Number(lazo[1]) : null, direccion };
}

// «L01D017», «D17» y «D017» son la misma dirección (si una no dice el lazo,
// se da por el mismo); «L02D017» es otra.
function mismaDireccion(a: Direccion | null, b: Direccion | null): boolean {
  if (!a || !b || a.direccion !== b.direccion) return false;
  return a.lazo === null || b.lazo === null || a.lazo === b.lazo;
}

function distancia(a: EquipoPlano, b: EquipoPlano): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function compararImportacion(existentes: EquipoPlano[], importados: EquipoPlano[], tolerancia: number): Comparacion {
  // El panel (FACP) se coloca a mano: no entra en la comparación.
  const colocados = existentes.filter((e) => e.tipo !== PANEL_EN_PLANO);
  const usados = new Set<string>();
  const pareja = new Map<string, EquipoPlano>(); // id importado → existente

  // 1) Por dirección (si hay dos con la misma, el más cercano).
  for (const nuevo of importados) {
    const suya = leerDireccion(nuevo.etiqueta);
    if (!suya) continue;
    const candidatos = colocados.filter((e) => !usados.has(e.id) && mismaDireccion(leerDireccion(e.etiqueta), suya));
    if (candidatos.length === 0) continue;
    candidatos.sort((a, b) => distancia(a, nuevo) - distancia(b, nuevo));
    pareja.set(nuevo.id, candidatos[0]);
    usados.add(candidatos[0].id);
  }

  // 2) Por posición, del par más cercano al más lejano: primero los del
  // mismo tipo; si no, cualquiera (cambió de tipo en el dibujo).
  for (const mismoTipo of [true, false]) {
    const pares: { nuevo: EquipoPlano; anterior: EquipoPlano; d: number }[] = [];
    for (const nuevo of importados) {
      if (pareja.has(nuevo.id)) continue;
      for (const anterior of colocados) {
        if (usados.has(anterior.id)) continue;
        if (mismoTipo && anterior.tipo !== nuevo.tipo) continue;
        // Si los dos tienen dirección y es distinta, son equipos distintos.
        const da = leerDireccion(anterior.etiqueta);
        const dn = leerDireccion(nuevo.etiqueta);
        if (da && dn && !mismaDireccion(da, dn)) continue;
        const d = distancia(anterior, nuevo);
        if (d <= tolerancia) pares.push({ nuevo, anterior, d });
      }
    }
    pares.sort((a, b) => a.d - b.d);
    for (const { nuevo, anterior } of pares) {
      if (pareja.has(nuevo.id) || usados.has(anterior.id)) continue;
      pareja.set(nuevo.id, anterior);
      usados.add(anterior.id);
    }
  }

  const resultado: Comparacion = { nuevos: [], actualizados: [], sinCambio: 0, eliminados: [] };
  for (const nuevo of importados) {
    const anterior = pareja.get(nuevo.id);
    if (!anterior) {
      resultado.nuevos.push(nuevo);
      continue;
    }
    const motivos: string[] = [];
    // Moverse menos de una décima de la tolerancia es redondeo, no un cambio.
    if (distancia(anterior, nuevo) > tolerancia * 0.1) motivos.push('se movió');
    if (anterior.tipo !== nuevo.tipo) motivos.push(`${anterior.tipo} → ${nuevo.tipo}`);
    const etiquetaNueva = nuevo.etiqueta || null;
    if (etiquetaNueva && !mismaDireccion(leerDireccion(anterior.etiqueta), leerDireccion(etiquetaNueva))) {
      motivos.push(`dirección ${anterior.etiqueta || 'sin dirección'} → ${etiquetaNueva}`);
    }
    if (motivos.length === 0) resultado.sinCambio += 1;
    else resultado.actualizados.push({ anterior, nuevo, motivo: motivos.join(', ') });
  }
  resultado.eliminados = colocados.filter((e) => !usados.has(e.id));
  return resultado;
}

// Aplica lo elegido al sembrado. Un equipo actualizado conserva su id, su
// liga con el dispositivo del lazo, su tamaño y su etapa; toma la posición,
// el tipo, el giro y la dirección del DXF.
export function aplicarImportacion(
  equipos: EquipoPlano[],
  elegidos: { nuevos: EquipoPlano[]; actualizados: Cambio[]; eliminados: EquipoPlano[] },
): EquipoPlano[] {
  const quitar = new Set(elegidos.eliminados.map((e) => e.id));
  const cambios = new Map(elegidos.actualizados.map((c) => [c.anterior.id, c.nuevo]));
  const resultado = equipos
    .filter((e) => !quitar.has(e.id))
    .map((e) => {
      const nuevo = cambios.get(e.id);
      if (!nuevo) return e;
      // Si la dirección es la misma pero el DXF la trae más corta («D001»), se queda la completa.
      const etiqueta = mismaDireccion(leerDireccion(e.etiqueta), leerDireccion(nuevo.etiqueta)) ? e.etiqueta : nuevo.etiqueta || e.etiqueta || null;
      return { ...e, x: nuevo.x, y: nuevo.y, tipo: nuevo.tipo, rotacion: nuevo.rotacion ?? null, etiqueta };
    });
  return [...resultado, ...elegidos.nuevos];
}
