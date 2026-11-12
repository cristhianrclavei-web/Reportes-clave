// Arranca una guía de conexión con los equipos de una cotización: cada
// concepto que trae enlace (los de SYSCOM) se vuelve un equipo con su liga a
// la ficha, listo para que el ingeniero le ponga bornes y conexiones.
// Se usa en el servidor (páginas de Diagramas y planos).

import type { SupabaseClient } from '@supabase/supabase-js';
import { SISTEMAS_GUIA, type DatosGuia, type EquipoGuia } from './guias';
import { arreglarEnlaceSyscom } from './syscomEnlace';

export type GuiaInicial = { nombre: string; sistema: string; datos: DatosGuia; clienteId: string | null; clienteNombre: string };

type Linea = { descripcion: string; sistema: string | null; enlace: string | null; orden: number };

// La cotización nombra los sistemas un poco distinto («Control de Acceso
// Vehicular», «Alarma & Detección de Humo»): se lleva al nombre de la guía.
const PISTAS_SISTEMA: [RegExp, (typeof SISTEMAS_GUIA)[number]][] = [
  [/acceso/i, 'Control de acceso'],
  [/cctv|video/i, 'CCTV'],
  [/detecci/i, 'Alarma&Det'],
  [/intrusi/i, 'Alarma intrusión'],
  [/solar/i, 'Paneles solares'],
  [/automat/i, 'Automatización'],
  [/contra incendio/i, 'Red contra incendio'],
  [/supresi/i, 'Supresión'],
  [/el[eé]ctric/i, 'Inst. eléctricas'],
];

export function sistemaDeGuia(sistemaDeCotizacion: string): string | null {
  const pista = PISTAS_SISTEMA.find(([patron]) => patron.test(sistemaDeCotizacion));
  return pista ? pista[1] : null;
}

// Primer renglón de la descripción, recortado: es el nombre del equipo.
function nombreCorto(descripcion: string): string {
  const primerRenglon = descripcion.split('\n')[0].trim();
  return primerRenglon.length > 60 ? `${primerRenglon.slice(0, 59)}…` : primerRenglon;
}

export function equiposDeLineas(lineas: Linea[]): EquipoGuia[] {
  // Con enlace = equipo de catálogo. Si ninguna trae, se toman todas (mano de obra incluida: el ingeniero quita lo que sobre).
  const conEnlace = lineas.filter((l) => l.enlace);
  const elegidas = (conEnlace.length > 0 ? conEnlace : lineas).slice(0, 30);
  return elegidas.map((l, i) => ({
    id: `eq${i + 1}`,
    nombre: nombreCorto(l.descripcion) || `Equipo ${i + 1}`,
    enlace: l.enlace ? arreglarEnlaceSyscom(l.enlace) : null,
    bornes: [],
  }));
}

export async function guiaDesdeCotizacion(supabase: SupabaseClient, cotizacionId: string): Promise<GuiaInicial | null> {
  const { data: cotizacion, error } = await supabase.from('cotizaciones').select('id, cliente_id, empresa, titulo_proyecto').eq('id', cotizacionId).maybeSingle();
  if (error || !cotizacion) return null;
  const { data: lineas, error: errorLineas } = await supabase.from('cotizacion_lineas').select('descripcion, sistema, enlace, orden').eq('cotizacion_id', cotizacionId).order('orden');
  if (errorLineas || !lineas || lineas.length === 0) return null;
  const sistemaDeLaCotizacion = (lineas as Linea[]).map((l) => sistemaDeGuia(l.sistema || '')).find((s) => s !== null);
  return {
    nombre: (cotizacion.titulo_proyecto || cotizacion.empresa || 'Guía de conexión').slice(0, 120),
    sistema: sistemaDeLaCotizacion || 'Otro',
    datos: { equipos: equiposDeLineas(lineas as Linea[]), conexiones: [], pruebas: [], notas: [], fotos: [] },
    clienteId: cotizacion.cliente_id || null,
    clienteNombre: cotizacion.empresa || '',
  };
}
