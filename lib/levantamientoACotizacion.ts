// Cotizar un levantamiento: convierte lo que se encontró en el sitio
// (recomendaciones, equipos con falla, observaciones) en conceptos
// propuestos que supervisión revisa antes de armar la cotización.
// Lógica pura; se prueba en lib/levantamientoACotizacion.test.ts.

import type { Cotizacion, LineaCotizacion } from './cotizaciones';
import type { Levantamiento, SistemaLevantamiento } from './levantamientos';

export type OrigenPropuesta = 'recomendacion' | 'reemplazo' | 'observacion' | 'mano_obra' | 'manual';

export type ConceptoPropuesto = {
  id: string;
  sistema: string;
  origen: OrigenPropuesta;
  // El texto tal como venía en el levantamiento (para comparar al editar).
  textoOriginal: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  incluir: boolean;
  enlace: string;
  costo: number | null;
  foto: string;
  modelo: string;
  marca: string;
  // Foto del levantamiento elegida para el concepto (ruta en «evidencias»);
  // al armar la cotización se copia al bucket de cotizaciones.
  fotoLevantamiento: string;
};

// Unidades de medida que, junto a un número, dicen cuánto se cotiza.
const UNIDADES_MEDIDA: { patron: RegExp; unidad: string }[] = [
  { patron: /^(m|mt|mts|metro|metros|ml)$/, unidad: 'Mts' },
  { patron: /^(hr|hrs|hora|horas)$/, unidad: 'Hrs' },
  { patron: /^(juego|juegos)$/, unidad: 'Juego' },
  { patron: /^(lote|lotes)$/, unidad: 'Lote' },
];

// Después de un número son características, no cantidad: «450 W», «8 puertos».
const NO_ES_CANTIDAD = /^(w|kw|kwp|wp|v|vca|vcd|vdc|a|ah|mah|mm|cm|pulg|"|%|mp|tb|gb|hz|puertos?|canales?|vias?|hilos?|pares?|x\d*)$/;

function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// «50 mts de cable belden 2x18» → 50 Mts; «Instalar 6 cámaras» → 6 Pza;
// «switch de 8 puertos» → 1 Pza (el 8 es característica). Sin número claro:
// 1 Pza. Es una propuesta: supervisión la corrige en la revisión.
export function leerCantidad(texto: string): { cantidad: number; unidad: string } {
  const simple = sinAcentos(texto);
  const tokens = simple.match(/\d+(?:[.,]\d+)?|[a-zñ"%]+/g) || [];

  // Primero una medida explícita en cualquier parte («unos 120 m en total»).
  for (let i = 0; i < tokens.length - 1; i++) {
    if (!/^\d/.test(tokens[i])) continue;
    const medida = UNIDADES_MEDIDA.find((u) => u.patron.test(tokens[i + 1]));
    if (medida) return { cantidad: Number(tokens[i].replace(',', '.')), unidad: medida.unidad };
  }

  // Luego piezas: un número entero seguido de un sustantivo, que no venga
  // después de «de», «a» o «x» («de 450 W», «a 2 hilos», «2x18»).
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (!/^\d+$/.test(token)) continue;
    const anterior = tokens[i - 1] || '';
    if (['de', 'a', 'x', 'cat', 'por'].includes(anterior)) continue;
    const siguiente = tokens[i + 1];
    if (/^\d/.test(siguiente) || NO_ES_CANTIDAD.test(siguiente)) continue;
    const cantidad = Number(token);
    if (cantidad > 0 && cantidad < 10000) return { cantidad, unidad: 'Pza' };
  }
  return { cantidad: 1, unidad: 'Pza' };
}

// Estados de un equipo existente por los que conviene ofrecer el reemplazo.
const ESTADOS_PARA_REEMPLAZO = ['No funciona', 'Obsoleto', 'Con fallas'];

function esEnlace(texto: string): boolean {
  return /^https?:\/\/\S+$/i.test(texto.trim());
}

// Todo lo que se puede cotizar de un levantamiento, ya agrupado por sistema.
// Recomendaciones y mano de obra van marcadas; reemplazos y observaciones
// se ofrecen sin marcar (no siempre se cotizan).
export function propuestasDeLevantamiento(sistemas: SistemaLevantamiento[], nuevoId: () => string): ConceptoPropuesto[] {
  const propuestas: ConceptoPropuesto[] = [];
  const vacio = { enlace: '', costo: null, foto: '', modelo: '', marca: '', fotoLevantamiento: '' };

  for (const s of sistemas) {
    const sistema = s.sistema.trim() || 'General';
    const recomendaciones = (s.recomendaciones || []).map((r) => r.trim()).filter(Boolean);

    for (const r of recomendaciones) {
      propuestas.push({ id: nuevoId(), sistema, origen: 'recomendacion', textoOriginal: r, descripcion: r, ...leerCantidad(r), incluir: true, ...vacio });
    }

    for (const e of s.equipos || []) {
      if (!ESTADOS_PARA_REEMPLAZO.includes(e.estado)) continue;
      const actual = e.modelo ? ` (actual: ${e.modelo}, ${e.estado.toLowerCase()})` : ` (${e.estado.toLowerCase()})`;
      const texto = `Reemplazo de ${e.descripcion}${actual}`;
      propuestas.push({ id: nuevoId(), sistema, origen: 'reemplazo', textoOriginal: texto, descripcion: `Reemplazo de ${e.descripcion}`, cantidad: e.cantidad || 1, unidad: 'Pza', incluir: false, ...vacio });
    }

    // Levantamientos de antes de las recomendaciones: cada renglón de las
    // observaciones es un posible concepto. Un renglón que solo es un enlace
    // (p. ej. de SYSCOM) se le pega al concepto de arriba.
    if (recomendaciones.length === 0) {
      for (const renglon of (s.observaciones || '').split(/\r?\n/).map((t) => t.trim()).filter(Boolean)) {
        const anterior = propuestas[propuestas.length - 1];
        if (esEnlace(renglon)) {
          if (anterior && anterior.sistema === sistema && anterior.origen === 'observacion' && !anterior.enlace) anterior.enlace = renglon;
          continue;
        }
        propuestas.push({ id: nuevoId(), sistema, origen: 'observacion', textoOriginal: renglon, descripcion: renglon, ...leerCantidad(renglon), incluir: false, ...vacio });
      }
    }

    const texto = `Mano de obra: instalación, configuración y puesta en marcha de ${sistema}`;
    propuestas.push({ id: nuevoId(), sistema, origen: 'mano_obra', textoOriginal: texto, descripcion: texto, cantidad: 1, unidad: 'Serv', incluir: true, ...vacio });
  }
  return propuestas;
}

// Datos con los que se abre «Nueva cotización». Lo que queda vacío lo llena
// el formulario con sus valores de siempre (forma de pago, garantía…).
export function cotizacionDesdeLevantamiento(
  levantamiento: Levantamiento,
  conceptos: ConceptoPropuesto[],
  hoy: string,
  firmante: { nombre: string; correo: string },
): { cotizacion: Cotizacion; lineas: LineaCotizacion[] } {
  const elegidos = conceptos.filter((c) => c.incluir && c.descripcion.trim());
  const sistemas = [...new Set(elegidos.map((c) => c.sistema))];

  const lineas: LineaCotizacion[] = elegidos.map((c, orden) => ({
    id: c.id,
    cotizacion_id: '',
    sistema: c.sistema,
    orden,
    descripcion: c.descripcion.trim(),
    unidad: c.unidad.trim() || 'Pza',
    cantidad: c.cantidad > 0 ? c.cantidad : 1,
    // Costo en 0 y margen en 0: el formulario toma el costo como precio
    // hasta que se capture (ver «tieneMargenGuardado» en CotizacionForm).
    costo: c.costo ?? 0,
    margen_pct: 0,
    precio_unitario: c.costo ?? 0,
    importe: 0,
    enlace: c.enlace || null,
    foto: c.foto || null,
    modelo: c.modelo || null,
    marca: c.marca || null,
  }));

  const cotizacion = {
    id: '',
    folio: '',
    created_by: '',
    created_at: '',
    updated_at: '',
    fecha: hoy,
    titulo_proyecto: sistemas.join(', ').slice(0, 120),
    atencion: levantamiento.atencion,
    empresa: levantamiento.empresa,
    telefono: levantamiento.telefono,
    correo: levantamiento.correo,
    direccion: levantamiento.direccion,
    forma_pago: '',
    tiempo_entrega: '',
    garantia: '',
    vigencia_dias: 15,
    notas: null,
    firmante_nombre: firmante.nombre || null,
    firmante_correo: firmante.correo || null,
    iva_pct: 16,
    moneda: 'MXN',
    presentacion_precios: 'desglose',
    // Si se eligieron fotos (del levantamiento o de SYSCOM), que salgan en el PDF.
    mostrar_fotos: lineas.some((l) => l.foto),
    tipo_cambio: 1,
    subtotal: 0,
    iva: 0,
    total: 0,
    estado: 'borrador',
    aprobada_por: null,
    aprobada_firma: null,
    aprobada_en: null,
  } satisfies Cotizacion;

  return { cotizacion, lineas };
}
