// Motivos de desviación de un servicio (llegar tarde, cerrar tarde, no
// terminar) y su lectura: externo no cuenta en contra, propio sí. Archivo
// aparte y sin dependencias para que lo usen tanto lib/eficiencia.ts como
// lib/serviciosProgramados.ts.
//
// En la base se guarda la clave; cambiar aquí el texto o el origen de un
// motivo reclasifica también lo ya capturado.

export type Origen = 'externo' | 'propio';

export type Motivo = {
  clave: string;
  texto: string;
  origen: Origen;
  // Dónde se ofrece: al justificar la llegada, al cerrar, o en ambos.
  llegada: boolean;
  cierre: boolean;
};

export const MOTIVOS: Motivo[] = [
  { clave: 'trafico', texto: 'Tráfico o traslado', origen: 'externo', llegada: true, cierre: false },
  { clave: 'cliente_ausente', texto: 'El cliente no se encontraba', origen: 'externo', llegada: true, cierre: true },
  { clave: 'cliente_sin_equipo', texto: 'Equipo o área del cliente no disponible', origen: 'externo', llegada: false, cierre: true },
  { clave: 'permiso', texto: 'Permiso de trabajo o acceso', origen: 'externo', llegada: true, cierre: true },
  { clave: 'instruccion_cliente', texto: 'Instrucción del cliente', origen: 'externo', llegada: true, cierre: true },
  { clave: 'clima', texto: 'Clima', origen: 'externo', llegada: true, cierre: true },
  { clave: 'salida_tarde', texto: 'Salida tarde de base o del servicio anterior', origen: 'propio', llegada: true, cierre: false },
  { clave: 'falta_material', texto: 'Falta de material o herramienta', origen: 'propio', llegada: true, cierre: true },
  { clave: 'retrabajo', texto: 'Retrabajo', origen: 'propio', llegada: false, cierre: true },
  { clave: 'otro', texto: 'Otro', origen: 'propio', llegada: true, cierre: true },
];

const POR_CLAVE = new Map(MOTIVOS.map((m) => [m.clave, m]));

export function textoMotivo(clave: string | null | undefined): string {
  if (!clave) return 'Sin motivo';
  return POR_CLAVE.get(clave)?.texto || clave;
}

// Un motivo que no se capturó (o una clave desconocida) cuenta como propio:
// lo externo hay que decirlo.
export function origenMotivo(clave: string | null | undefined): Origen {
  return (clave && POR_CLAVE.get(clave)?.origen) || 'propio';
}
