// Resumen de una búsqueda de falla a tierra, listo para mostrarse en la
// tarjeta del lazo y para anexarse al reporte de servicio (y a su PDF).
//
// Al anexarlo se guarda como COPIA dentro de reports.data.fallasTierra, igual
// que los formatos de mantenimiento: el reporte queda documentado tal como
// estaba la búsqueda ese día aunque después se sigan haciendo cortes o se
// corrija el lazo. No usa la base: se prueba en lib/anexoFallaTierra.test.ts.

import {
  Corte, Elemento, Falla, Lazo, NOMBRE_CIRCUITO, corteSugerido, direccionVisible, posiciones, zonaConFalla,
} from './lazos';

export type DispositivoResumen = {
  nombre: string;
  direccion: string; // L01D040, o '' si no tiene
  ubicacion: string;
  lugar: string; // «Pos. 17» o «Rama de LZ1_SH_14»
};

export type CorteResumen = {
  numero: number;
  hecho_en: string;
  // null si el dispositivo se borró después.
  donde: DispositivoResumen | null;
  lado: 'panel' | 'campo';
  medicion: string;
  notas: string;
  foto_path: string | null;
  // Lo que la app sugería justo antes de este corte, y si se siguió.
  sugerido: DispositivoResumen | null;
  siguioSugerencia: boolean;
  // Cómo quedó la búsqueda después de este corte.
  quedan: number;
  tramo: string; // «posiciones 18 a 34»
};

export type AnexoFallaTierra = {
  version: 1;
  falla_id: string;
  lazo_id: string;
  lazo: {
    codigo: string;
    nombre: string;
    circuito: string;
    clase: string;
    panel: string;
    dispositivos: number;
  };
  estado: 'abierta' | 'resuelta';
  abierta_en: string;
  resuelta_en: string | null;
  // Dónde se encontró (si se encontró). null + resuelta = en el cable.
  encontrada: DispositivoResumen | null;
  causa: string;
  foto_path: string | null;
  cortes: CorteResumen[];
  // Cómo estaba la búsqueda al final (al cerrarla o al anexarla).
  final: {
    quedan: number;
    tramo: string;
    contradictorio: boolean;
    siguiente: DispositivoResumen | null;
  };
  // Cuándo se hizo esta copia.
  capturado_en: string;
};

function describirDispositivo(elemento: Elemento, elementos: Elemento[], lazo: Lazo, pos: Map<string, number>): DispositivoResumen {
  let lugar = '';
  if (elemento.padre_id) {
    const padre = elementos.find((e) => e.id === elemento.padre_id);
    lugar = `Rama de ${padre?.nombre || '—'}`;
  } else {
    const posicion = pos.get(elemento.id);
    lugar = posicion ? `Pos. ${posicion}` : '';
  }
  return {
    nombre: elemento.nombre,
    direccion: direccionVisible(elemento.direccion, lazo.numero),
    ubicacion: elemento.ubicacion || '',
    lugar,
  };
}

// «posiciones 18 a 34» / «posición 18»: de qué parte de la línea principal
// siguen en duda (una posición cuenta si él o algo de sus ramas sigue).
export function textoTramo(ids: Set<string>, pos: Map<string, number>): string {
  const enZona: number[] = [];
  for (const id of ids) {
    const p = pos.get(id);
    if (p) enZona.push(p);
  }
  if (enZona.length === 0) return '';
  const desde = Math.min(...enZona);
  const hasta = Math.max(...enZona);
  return desde === hasta ? `posición ${desde}` : `posiciones ${desde} a ${hasta}`;
}

export function resumirBusqueda(
  lazo: Lazo,
  elementos: Elemento[],
  falla: Falla & { foto_path?: string | null },
  cortes: (Corte & { foto_path?: string | null })[],
  ahora: string,
): AnexoFallaTierra {
  const pos = posiciones(elementos);
  const porId = new Map(elementos.map((e) => [e.id, e]));
  const ordenados = [...cortes].sort((a, b) => a.creado_en.localeCompare(b.creado_en));

  // Se repite la búsqueda corte por corte para saber qué se sugería antes de
  // cada uno y cómo quedó después.
  const hechos: { elementoId: string; lado: 'panel' | 'campo' }[] = [];
  const resumenCortes: CorteResumen[] = ordenados.map((corte, i) => {
    const zonaAntes = zonaConFalla(elementos, hechos);
    const sugeridoAntes = corteSugerido(elementos, zonaAntes);
    const elemento = corte.elemento_id ? porId.get(corte.elemento_id) : undefined;
    if (elemento) hechos.push({ elementoId: elemento.id, lado: corte.lado });
    const zonaDespues = zonaConFalla(elementos, hechos);
    return {
      numero: i + 1,
      hecho_en: corte.creado_en,
      donde: elemento ? describirDispositivo(elemento, elementos, lazo, pos) : null,
      lado: corte.lado,
      medicion: corte.medicion || '',
      notas: corte.notas || '',
      foto_path: corte.foto_path || null,
      sugerido: sugeridoAntes ? describirDispositivo(sugeridoAntes, elementos, lazo, pos) : null,
      siguioSugerencia: !!sugeridoAntes && sugeridoAntes.id === corte.elemento_id,
      quedan: zonaDespues.ids.size,
      tramo: textoTramo(zonaDespues.ids, pos),
    };
  });

  const zonaFinal = zonaConFalla(elementos, hechos);
  const siguiente = falla.estado === 'abierta' ? corteSugerido(elementos, zonaFinal) : null;
  const encontrada = falla.elemento_id ? porId.get(falla.elemento_id) : undefined;

  return {
    version: 1,
    falla_id: falla.id,
    lazo_id: lazo.id,
    lazo: {
      codigo: lazo.codigo,
      nombre: lazo.nombre,
      circuito: NOMBRE_CIRCUITO[lazo.tipo] || 'Lazo',
      clase: lazo.clase ? `Clase ${lazo.clase}` : '',
      panel: lazo.panel || '',
      dispositivos: elementos.length,
    },
    estado: falla.estado,
    abierta_en: falla.abierta_en,
    resuelta_en: falla.resuelta_en,
    encontrada: encontrada ? describirDispositivo(encontrada, elementos, lazo, pos) : null,
    causa: falla.causa || '',
    foto_path: falla.foto_path || null,
    cortes: resumenCortes,
    final: {
      quedan: zonaFinal.ids.size,
      tramo: textoTramo(zonaFinal.ids, pos),
      contradictorio: zonaFinal.contradictorio,
      siguiente: siguiente ? describirDispositivo(siguiente, elementos, lazo, pos) : null,
    },
    capturado_en: ahora,
  };
}

// «L01D040 · LZ1_SH_17» o solo el nombre si no tiene dirección.
export function etiquetaDispositivo(d: DispositivoResumen): string {
  return d.direccion ? `${d.direccion} · ${d.nombre}` : d.nombre;
}

// Lo que se lee de reports.data.fallasTierra: se descarta lo que no tenga la
// forma esperada (un reporte viejo o un dato dañado no debe romper el PDF).
export function anexosDeReporte(valor: unknown): AnexoFallaTierra[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((a) => a && typeof a === 'object' && a.version === 1 && Array.isArray(a.cortes) && a.final) as AnexoFallaTierra[];
}

// ¿Hubo actividad en esta búsqueda en la fecha del reporte (AAAA-MM-DD,
// hora de México)? Sirve para sugerir anexarla.
export function huboActividadEl(anexo: AnexoFallaTierra, fecha: string): boolean {
  const dia = (iso: string | null) => (iso ? diaEnMexico(iso) : '');
  if (dia(anexo.abierta_en) === fecha || dia(anexo.resuelta_en) === fecha) return true;
  return anexo.cortes.some((c) => dia(c.hecho_en) === fecha);
}

export function diaEnMexico(iso: string): string {
  // en-CA da AAAA-MM-DD.
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

export function horaEnMexico(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' });
}

export function fechaHoraEnMexico(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
