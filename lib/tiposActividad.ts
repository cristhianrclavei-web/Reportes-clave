// Tipos de actividad de la bitácora: lo que el personal hace fuera de un
// servicio programado. Se elige con un toque al iniciar (antes había que
// escribir proyecto y título). Archivo sin dependencias: lo usan la app, la
// línea de tiempo del día y el resumen del supervisor.
//
// En la base se guarda la clave (patch_bitacora_tipos.sql). Las actividades
// anteriores a los tipos no tienen: se tratan como «otro».

export type TipoActividad = 'traslado' | 'compra' | 'oficina' | 'capacitacion' | 'apoyo_cliente' | 'otro';

export const TIPOS_ACTIVIDAD: { clave: TipoActividad; nombre: string; ejemplo: string; color: string }[] = [
  { clave: 'traslado', nombre: 'Traslado', ejemplo: 'Camino a un sitio o de regreso', color: '#7C8CF8' },
  { clave: 'compra', nombre: 'Compra de material', ejemplo: 'Proveedor, ferretería, recoger pedido', color: '#F5A524' },
  { clave: 'oficina', nombre: 'Oficina o taller', ejemplo: 'Armado, pruebas, papeleo', color: '#38BDF8' },
  { clave: 'capacitacion', nombre: 'Capacitación', ejemplo: 'Curso, junta, inducción', color: '#C084FC' },
  { clave: 'apoyo_cliente', nombre: 'Apoyo a cliente', ejemplo: 'Revisión o visita no programada', color: '#34D399' },
  { clave: 'otro', nombre: 'Otro', ejemplo: 'Lo que no cabe en lo demás', color: '#94A3B8' },
];

const POR_CLAVE = new Map(TIPOS_ACTIVIDAD.map((t) => [t.clave, t]));

export function tipoActividad(clave: string | null | undefined) {
  return POR_CLAVE.get((clave || 'otro') as TipoActividad) || POR_CLAVE.get('otro')!;
}

// Color con el que se pinta un servicio programado en la línea del día.
export const COLOR_SERVICIO = 'rgb(var(--c-acento))';
