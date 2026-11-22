// Propuestas de cambio (supabase/patch_propuestas_cambio.sql), como en git:
// el técnico edita una copia; aquí se compara su copia contra cómo estaba el
// original cuando empezó (`base`) y contra cómo está ahora (`actual`), y se
// fusionan solo los cambios que supervisión acepta.
//
// Cada documento se ve como colecciones de elementos con `id` (equipos,
// tuberías, tramos, conexiones…) y algunos campos sueltos (la escala, los
// datos del plano, las notas). Así un cambio es «agregó / quitó / cambió tal
// elemento» y la fusión es por elemento: lo que tocó solo uno entra solo; si
// los dos tocaron lo mismo, es un conflicto y supervisión elige.
// Lógica pura; se prueba en lib/propuestas.test.ts.

import { tipoDispositivo } from './lazos';
import type { EquipoPlano, Sembrado, TuberiaPlano } from './planos';
import { definicion, nombreDeTramo, type DatosUnifilar, type EquipoUnifilar, type TramoUnifilar } from './unifilar';
import type { ConexionGuia, DatosGuia, EquipoGuia, PruebaGuia } from './guias';

export type TipoDocumento = 'plano' | 'unifilar' | 'guia';

export const NOMBRE_DOCUMENTO: Record<TipoDocumento, string> = { plano: 'Plano', unifilar: 'Unifilar FV', guia: 'Guía de conexión' };

// El plano como documento: lo sembrado y la escala.
export type DocumentoPlano = Sembrado & { metros: number | null };

type Doc = Record<string, unknown>;
type ConId = { id: string };

type Coleccion = {
  clave: string;
  // «el detector D017», «la tubería EMT 3/4"».
  nombre: (item: any, doc: any) => string;
  // Qué cambió en un elemento, en palabras.
  queCambio?: (antes: any, despues: any) => string;
};

type Esquema = { colecciones: Coleccion[]; campos: { clave: string; nombre: string }[] };

function cambiosDeCampos(antes: Doc, despues: Doc, nombres: Record<string, string>): string {
  const claves = [...new Set([...Object.keys(antes || {}), ...Object.keys(despues || {})])]
    .filter((k) => !igual(antes?.[k], despues?.[k]));
  const textos = [...new Set(claves.map((k) => nombres[k] || 'datos'))];
  return textos.join(', ');
}

const CAMPOS_EQUIPO_PLANO: Record<string, string> = {
  x: 'posición', y: 'posición', rotacion: 'giro', tamano: 'tamaño', etiqueta: 'nombre', modelo: 'modelo', ip: 'IP', altura: 'altura',
  angulo: 'ángulo de visión', alcance: 'alcance', conectadoA: 'conexión de red', elementoId: 'dispositivo ligado', panelId: 'panel', etapa: 'etapa', tipo: 'tipo',
};

export const ESQUEMAS: Record<TipoDocumento, Esquema> = {
  plano: {
    colecciones: [
      {
        clave: 'equipos',
        nombre: (e: EquipoPlano) => `${tipoDispositivo(e.tipo).nombre}${e.etiqueta ? ` ${e.etiqueta}` : ''}`,
        queCambio: (a, b) => cambiosDeCampos(a, b, CAMPOS_EQUIPO_PLANO),
      },
      {
        clave: 'tuberias',
        nombre: (t: TuberiaPlano) => `tubería ${t.tipo} ${t.diametro}`,
        queCambio: (a, b) => cambiosDeCampos(a, b, { puntos: 'trazo', tipo: 'tipo', diametro: 'diámetro' }),
      },
    ],
    campos: [{ clave: 'metros', nombre: 'Escala del plano' }],
  },
  unifilar: {
    colecciones: [
      {
        clave: 'equipos',
        nombre: (e: EquipoUnifilar) => e.nombre || definicion(e.tipo).nombre,
        queCambio: (a, b) => cambiosDeCampos(a, b, { x: 'posición', y: 'posición', nombre: 'nombre', modelo: 'modelo', valores: 'datos técnicos', etiqueta: 'texto', tipo: 'tipo' }),
      },
      {
        clave: 'tramos',
        nombre: (t: TramoUnifilar, doc: DatosUnifilar) => (t.titulo || (doc?.equipos ? nombreDeTramo(doc, t) : 'tramo')),
        queCambio: (a, b) => cambiosDeCampos(a, b, {
          conductores: 'conductores', metros: 'longitud', tuberia: 'tubería', circuito: 'circuito', titulo: 'título',
          voltaje: 'voltaje', corriente: 'corriente', etiqueta: 'texto', codo: 'codo', mostrarEtiqueta: 'texto', a: 'conexión', b: 'conexión',
        }),
      },
    ],
    campos: [{ clave: 'proyecto', nombre: 'Datos del plano' }, { clave: 'notas', nombre: 'Notas' }],
  },
  guia: {
    colecciones: [
      {
        clave: 'equipos',
        nombre: (e: EquipoGuia) => e.nombre,
        queCambio: (a, b) => cambiosDeCampos(a, b, { nombre: 'nombre', modelo: 'modelo', enlace: 'enlace', nota: 'nota', bornes: 'bornes' }),
      },
      {
        clave: 'conexiones',
        nombre: (c: ConexionGuia, doc: DatosGuia) => {
          const eq = (id: string) => doc?.equipos?.find((e) => e.id === id)?.nombre || 'equipo';
          return `cable ${eq(c.de.equipo)} → ${eq(c.a.equipo)}`;
        },
        queCambio: (a, b) => cambiosDeCampos(a, b, { de: 'origen', a: 'destino', color: 'color', calibre: 'calibre', nota: 'nota' }),
      },
      {
        clave: 'pruebas',
        nombre: (p: PruebaGuia) => `prueba «${p.texto}»`,
        queCambio: (a, b) => cambiosDeCampos(a, b, { texto: 'texto', unidad: 'unidad', min: 'rango', max: 'rango' }),
      },
    ],
    campos: [{ clave: 'notas', nombre: 'Notas del ingeniero' }, { clave: 'fotos', nombre: 'Fotos de «así debe quedar»' }],
  },
};

export type TipoCambio = 'agregado' | 'quitado' | 'modificado';

export type Cambio = {
  // Clave única del cambio: «equipos:<id>» o «campo:metros».
  clave: string;
  coleccion: string | null;
  campo: string | null;
  elementoId: string | null;
  tipo: TipoCambio;
  antes: unknown;
  despues: unknown;
  // Alguien más cambió lo mismo en el original mientras tanto.
  conflicto: boolean;
  texto: string;
};

// La base de datos (jsonb) regresa las llaves en otro orden que como se
// guardaron, y un dato vacío puede venir como null o no venir: se ordenan
// las llaves y se quitan los vacíos antes de comparar.
function normal(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(normal);
  if (valor && typeof valor === 'object') {
    const limpio: Record<string, unknown> = {};
    for (const clave of Object.keys(valor).sort()) {
      const v = (valor as Record<string, unknown>)[clave];
      if (v !== null && v !== undefined) limpio[clave] = normal(v);
    }
    return limpio;
  }
  return valor ?? null;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(normal(a)) === JSON.stringify(normal(b));

function porId<T extends ConId>(lista: unknown): Map<string, T> {
  return new Map(((Array.isArray(lista) ? lista : []) as T[]).map((x) => [x.id, x]));
}

function capital(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Qué cambió el técnico (de `base` a `propuesta`) y si choca con lo que hay
// ahora en el original (`actual`). Lo que ya está igual en el original no
// sale (alguien más ya lo hizo).
export function compararPropuesta(tipo: TipoDocumento, base: Doc, propuesta: Doc, actual: Doc): Cambio[] {
  const esquema = ESQUEMAS[tipo];
  const cambios: Cambio[] = [];
  for (const col of esquema.colecciones) {
    const b = porId<ConId>(base[col.clave]);
    const p = porId<ConId>(propuesta[col.clave]);
    const a = porId<ConId>(actual[col.clave]);
    for (const [id, item] of p) {
      if (!b.has(id)) {
        if (a.has(id) && igual(a.get(id), item)) continue;
        cambios.push({ clave: `${col.clave}:${id}`, coleccion: col.clave, campo: null, elementoId: id, tipo: 'agregado', antes: null, despues: item, conflicto: a.has(id), texto: `Agregó ${col.nombre(item, propuesta)}` });
      } else if (!igual(b.get(id), item)) {
        const enActual = a.get(id);
        if (igual(enActual, item)) continue;
        const conflicto = !enActual || !igual(enActual, b.get(id));
        const que = col.queCambio ? col.queCambio(b.get(id), item) : '';
        cambios.push({
          clave: `${col.clave}:${id}`, coleccion: col.clave, campo: null, elementoId: id, tipo: 'modificado', antes: b.get(id), despues: item, conflicto,
          texto: `${capital(col.nombre(item, propuesta))}: cambió ${que || 'datos'}${!enActual ? ' (alguien más lo quitó)' : ''}`,
        });
      }
    }
    for (const [id, item] of b) {
      if (p.has(id)) continue;
      const enActual = a.get(id);
      if (!enActual) continue; // ya no está: nada que quitar
      cambios.push({
        clave: `${col.clave}:${id}`, coleccion: col.clave, campo: null, elementoId: id, tipo: 'quitado', antes: item, despues: null,
        conflicto: !igual(enActual, item), texto: `Quitó ${col.nombre(item, base)}${!igual(enActual, item) ? ' (alguien más lo cambió)' : ''}`,
      });
    }
  }
  for (const campo of esquema.campos) {
    const b = base[campo.clave];
    const p = propuesta[campo.clave];
    if (igual(b, p) || igual(actual[campo.clave], p)) continue;
    cambios.push({
      clave: `campo:${campo.clave}`, coleccion: null, campo: campo.clave, elementoId: null, tipo: 'modificado', antes: b, despues: p,
      conflicto: !igual(actual[campo.clave], b), texto: `Cambió ${campo.nombre.toLowerCase()}`,
    });
  }
  return cambios;
}

// El original con los cambios aceptados. Aceptar un conflicto = quedarse con
// lo del técnico; no aceptarlo = dejar el original como está.
export function fusionar<T extends Doc>(tipo: TipoDocumento, actual: T, cambios: Cambio[], aceptados: Set<string>): T {
  const resultado: Doc = { ...actual };
  for (const col of ESQUEMAS[tipo].colecciones) {
    let lista = [...((Array.isArray(actual[col.clave]) ? actual[col.clave] : []) as ConId[])];
    for (const c of cambios.filter((x) => x.coleccion === col.clave && aceptados.has(x.clave))) {
      const i = lista.findIndex((x) => x.id === c.elementoId);
      if (c.tipo === 'quitado') {
        if (i >= 0) lista = lista.filter((x) => x.id !== c.elementoId);
      } else if (i >= 0) {
        lista[i] = c.despues as ConId;
      } else {
        lista.push(c.despues as ConId);
      }
    }
    resultado[col.clave] = lista;
  }
  for (const c of cambios.filter((x) => x.campo && aceptados.has(x.clave))) resultado[c.campo!] = c.despues;
  return resultado as T;
}

// Al abrir la copia: los cambios que el técnico ya hizo, sobre lo que hay
// ahora en el original (lo demás que haya cambiado supervisión se ve).
export function copiaAlDia<T extends Doc>(tipo: TipoDocumento, base: T, propuesta: T, actual: T): T {
  const cambios = compararPropuesta(tipo, base, propuesta, actual);
  return fusionar(tipo, actual, cambios, new Set(cambios.map((c) => c.clave)));
}

// Para pintar el plano en la revisión: cómo quedó cada equipo.
export function estadoPorElemento(cambios: Cambio[], coleccion: string): Map<string, TipoCambio> {
  return new Map(cambios.filter((c) => c.coleccion === coleccion && c.elementoId).map((c) => [c.elementoId!, c.tipo]));
}

export function documentoDePlano(sembrado: Sembrado, metros: number | null): DocumentoPlano {
  return { equipos: sembrado.equipos, tuberias: sembrado.tuberias, metros };
}
