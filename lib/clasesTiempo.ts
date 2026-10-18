import { ClaseTiempo } from './jornada';
import { TIPOS_ACTIVIDAD, COLOR_SERVICIO } from './tiposActividad';

// Nombre y color de cada clase de tiempo de la jornada, en el orden en que
// se muestran (primero el trabajo en servicio, al final lo sin registrar).

type InfoClase = { clave: ClaseTiempo; nombre: string; color: string };

export const CLASES_TIEMPO: InfoClase[] = [
  { clave: 'servicio', nombre: 'Trabajo en servicio', color: COLOR_SERVICIO },
  ...TIPOS_ACTIVIDAD.map((t) => ({ clave: t.clave as ClaseTiempo, nombre: t.nombre, color: t.color })),
  { clave: 'comida', nombre: 'Comida', color: '#FB7185' },
  { clave: 'pausa', nombre: 'Pausas en servicio', color: '#A8A29E' },
  { clave: 'sin_registrar', nombre: 'Sin registrar', color: '#F59E0B' },
];

const POR_CLAVE = new Map(CLASES_TIEMPO.map((c) => [c.clave, c]));

export function infoClase(clave: ClaseTiempo): InfoClase {
  return POR_CLAVE.get(clave) || POR_CLAVE.get('otro')!;
}

