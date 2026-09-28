// Formatos de mantenimiento preventivo que se anexan al reporte de servicio.
//
// Cada formato es una lista de cotejo por sistema, con la frecuencia, la
// actividad y el criterio de aceptación tomados de la norma de referencia.
// Al llenarse, el reporte guarda una COPIA del texto de cada punto (no solo
// su id): si mañana se corrige un formato, los reportes que ya se entregaron
// se siguen imprimiendo tal como se firmaron.
//
// Las frecuencias son las máximas que marca la norma; hacerlo más seguido
// también cumple. Una visita «Anual» incluye los puntos semestrales, etc.

export type Frecuencia = 'trimestral' | 'semestral' | 'anual';

export const FRECUENCIAS: { key: Frecuencia; label: string }[] = [
  { key: 'trimestral', label: 'Trimestral' },
  { key: 'semestral', label: 'Semestral' },
  { key: 'anual', label: 'Anual' },
];

const ORDEN: Record<Frecuencia, number> = { trimestral: 1, semestral: 2, anual: 3 };

export type PuntoFormato = {
  id: string;
  frecuencia: Frecuencia;
  componente: string;
  actividad: string;
  criterio: string;
  // Si el punto pide un dato medido, qué se anota (p. ej. «V», «días»).
  medicion?: string;
  ref?: string;
};

export type Norma = { clave: string; nombre: string };

export type PlantillaFormato = {
  id: string;
  version: number;
  // Debe coincidir con la opción de «Sistema de seguridad» del reporte.
  sistema: string;
  titulo: string;
  normas: Norma[];
  nota: string;
  puntos: PuntoFormato[];
};

export type Resultado = 'cumple' | 'no_cumple' | 'na';

export type PuntoLlenado = PuntoFormato & { resultado: Resultado | null; valor: string; nota: string };

export type FormatoLlenado = {
  plantillaId: string;
  version: number;
  sistema: string;
  titulo: string;
  normas: Norma[];
  nota: string;
  visita: Frecuencia;
  areas: string;
  recomendaciones: string;
  puntos: PuntoLlenado[];
};

// ------------------------------------------------------------------
// CCTV
// ------------------------------------------------------------------
const CCTV: PlantillaFormato = {
  id: 'cctv',
  version: 1,
  sistema: 'CCTV',
  titulo: 'Sistema de videovigilancia (CCTV)',
  normas: [
    { clave: 'NFPA 731', nombre: 'Standard for the Installation of Electronic Premises Security Systems (ed. 2023)' },
    { clave: 'IEC 62676-4', nombre: 'Sistemas de videovigilancia para aplicaciones de seguridad — Guías de aplicación' },
    { clave: 'IEEE 802.3af/at/bt', nombre: 'Alimentación por Ethernet (PoE)' },
  ],
  nota:
    'Frecuencias recomendadas con base en IEC 62676-4 y las instrucciones del fabricante; los días de retención y el nivel de detalle por cámara son los acordados con el cliente.',
  puntos: [
    {
      id: 'cam-limpieza', frecuencia: 'trimestral', componente: 'Cámaras',
      actividad: 'Limpieza de lente, domo y carcasa; revisión de fijación, sellos y ausencia de humedad.',
      criterio: 'Imagen sin manchas, condensación ni obstrucciones; soporte firme.',
    },
    {
      id: 'cam-encuadre', frecuencia: 'trimestral', componente: 'Cámaras',
      actividad: 'Verificar encuadre, enfoque y nivel de detalle de cada cámara.',
      criterio: 'Cumple el nivel de detalle definido para el punto (identificación ≥ 250 px/m, reconocimiento ≥ 125 px/m).',
      ref: 'IEC 62676-4',
    },
    {
      id: 'cam-noche', frecuencia: 'trimestral', componente: 'Cámaras',
      actividad: 'Probar el cambio día/noche y la iluminación infrarroja.',
      criterio: 'Imagen utilizable con baja iluminación, sin reflejos del IR.',
    },
    {
      id: 'grab-canales', frecuencia: 'trimestral', componente: 'Grabador (NVR/DVR/VMS)',
      actividad: 'Verificar que todos los canales graben y reproducir una muestra de cada uno; revisar días de retención.',
      criterio: '100% de los canales grabando; retención igual o mayor a la acordada con el cliente.',
      medicion: 'días',
    },
    {
      id: 'grab-discos', frecuencia: 'trimestral', componente: 'Discos duros',
      actividad: 'Revisar estado S.M.A.R.T. y registro de errores del grabador.',
      criterio: 'Estado «Normal/OK», sin sectores reasignados ni errores de escritura.',
    },
    {
      id: 'grab-hora', frecuencia: 'trimestral', componente: 'Fecha y hora',
      actividad: 'Verificar la sincronización de hora (NTP) en grabador y cámaras.',
      criterio: 'Diferencia no mayor a 1 minuto contra la hora oficial.',
    },
    {
      id: 'ali-poe', frecuencia: 'semestral', componente: 'Alimentación PoE',
      actividad: 'Medir voltaje en puertos PoE y revisar el consumo contra la capacidad del switch.',
      criterio: '44–57 VDC en el puerto; consumo total no mayor al 80% de la capacidad PoE del switch.',
      medicion: 'V',
      ref: 'IEEE 802.3',
    },
    {
      id: 'ali-fuentes', frecuencia: 'semestral', componente: 'Fuentes auxiliares',
      actividad: 'Medir voltaje de salida bajo carga (12 VDC / 24 VAC) en la cámara más lejana.',
      criterio: 'Dentro del rango del fabricante de la cámara (típicamente ±10% del nominal).',
      medicion: 'V',
    },
    {
      id: 'ali-ups', frecuencia: 'semestral', componente: 'UPS de grabador y switches',
      actividad: 'Revisar estado de baterías y alarmas del UPS.',
      criterio: 'Sin alarmas; respaldo operando.',
    },
    {
      id: 'cab-conectores', frecuencia: 'semestral', componente: 'Cableado y conectores',
      actividad: 'Inspeccionar conectores RJ45/BNC, cajas de registro y sellado en exterior; prueba de conectividad.',
      criterio: 'Sin sulfatación ni humedad; ping de 100 paquetes sin pérdida.',
    },
    {
      id: 'cab-supresores', frecuencia: 'semestral', componente: 'Tierra y supresores',
      actividad: 'Revisar supresores de picos y conexión a tierra de cámaras exteriores.',
      criterio: 'Supresores sin daño; continuidad a tierra.',
    },
    {
      id: 'ciber-firmware', frecuencia: 'anual', componente: 'Firmware',
      actividad: 'Respaldar configuración y actualizar firmware de cámaras y grabador/VMS.',
      criterio: 'Versión estable vigente del fabricante, sin vulnerabilidades publicadas sin corregir.',
    },
    {
      id: 'ciber-cuentas', frecuencia: 'anual', componente: 'Usuarios y contraseñas',
      actividad: 'Depurar usuarios, cambiar contraseñas de fábrica y deshabilitar servicios sin uso (UPnP, P2P).',
      criterio: 'Ninguna cuenta con contraseña de fábrica; solo usuarios autorizados.',
    },
    {
      id: 'grab-respaldo', frecuencia: 'anual', componente: 'Respaldo de configuración',
      actividad: 'Generar respaldo de configuración del grabador/VMS y entregarlo al cliente.',
      criterio: 'Respaldo generado y resguardado.',
    },
    {
      id: 'grab-exportar', frecuencia: 'anual', componente: 'Exportación de video',
      actividad: 'Exportar un clip de prueba y reproducirlo fuera del grabador.',
      criterio: 'Clip reproducible con fecha y hora visibles.',
    },
  ],
};

// ------------------------------------------------------------------
// Detección y alarma de incendio
// ------------------------------------------------------------------
const DETECCION: PlantillaFormato = {
  id: 'deteccion-incendio',
  version: 1,
  sistema: 'Alarma&Det',
  titulo: 'Sistema de detección y alarma de incendio',
  normas: [
    { clave: 'NFPA 72', nombre: 'National Fire Alarm and Signaling Code (ed. 2022), Cap. 14: Inspección, prueba y mantenimiento' },
    { clave: 'NOM-002-STPS-2010', nombre: 'Prevención y protección contra incendios en los centros de trabajo (7.4 programa anual de revisión y pruebas; 7.7 registros)' },
  ],
  nota:
    'Frecuencias según NFPA 72 (Tablas 14.3.1 y 14.4.3.2) para sistemas supervisados. Las pruebas se hacen con los métodos y equipos indicados por el fabricante de cada dispositivo.',
  puntos: [
    {
      id: 'fac-visual', frecuencia: 'semestral', componente: 'Panel de control (FACP)',
      actividad: 'Inspección visual de LEDs, pantalla y fusibles; revisar historial de eventos.',
      criterio: 'Panel en estado normal, sin fallas ni supervisiones activas; eventos del historial atendidos.',
      ref: 'NFPA 72 T.14.3.1',
    },
    {
      id: 'fac-ca', frecuencia: 'semestral', componente: 'Alimentación principal',
      actividad: 'Revisar el circuito de alimentación del panel.',
      criterio: 'Circuito dedicado, identificado en rojo como «ALARMA DE INCENDIO» y asegurado contra desconexión accidental.',
      ref: 'NFPA 72 Cap. 10',
    },
    {
      id: 'bat-visual', frecuencia: 'semestral', componente: 'Baterías de respaldo',
      actividad: 'Inspección de baterías: fecha de fabricación, terminales, deformación o fugas; medir voltaje de carga.',
      criterio: 'Sin corrosión, fugas ni deformación; fecha marcada y dentro de la vida útil del fabricante; voltaje de carga según fabricante.',
      medicion: 'V',
      ref: 'NFPA 72 T.14.4.3.2',
    },
    {
      id: 'bat-carga', frecuencia: 'semestral', componente: 'Baterías de respaldo',
      actividad: 'Desconectar la alimentación de CA y medir el voltaje de baterías bajo carga.',
      criterio: 'El panel indica falla de CA y opera con baterías; voltaje bajo carga no menor al mínimo del fabricante.',
      medicion: 'V',
      ref: 'NFPA 72 T.14.4.3.2',
    },
    {
      id: 'ini-visual', frecuencia: 'semestral', componente: 'Dispositivos iniciadores',
      actividad: 'Inspección visual de detectores de humo y calor, estaciones manuales y detectores de ducto.',
      criterio: 'Sin daño, pintura, polvo ni cubiertas protectoras; bien fijados y accesibles.',
      ref: 'NFPA 72 T.14.3.1',
    },
    {
      id: 'not-visual', frecuencia: 'semestral', componente: 'Dispositivos de notificación',
      actividad: 'Inspección visual de sirenas, estrobos y altavoces.',
      criterio: 'Sin daño ni obstrucciones; bien fijados.',
      ref: 'NFPA 72 T.14.3.1',
    },
    {
      id: 'sup-flujo', frecuencia: 'semestral', componente: 'Interruptores de flujo y supervisión (si aplica)',
      actividad: 'Probar interruptores de flujo desde la conexión de prueba y los de supervisión de válvulas (tamper).',
      criterio: 'Alarma de flujo en el panel; supervisión antes de 2 vueltas del volante o 1/5 del recorrido de la válvula.',
      ref: 'NFPA 72 T.14.4.3.2',
    },
    {
      id: 'fac-funciones', frecuencia: 'anual', componente: 'Panel de control (FACP)',
      actividad: 'Probar funciones del panel: falla a tierra, circuito abierto en lazos y sirenas, falla de CA, LEDs y zumbador.',
      criterio: 'El panel indica cada condición de falla y se restablece correctamente.',
      ref: 'NFPA 72 T.14.4.3.2',
    },
    {
      id: 'bat-capacidad', frecuencia: 'anual', componente: 'Baterías de respaldo',
      actividad: 'Verificar la capacidad de baterías (prueba de descarga o cálculo contra el consumo del sistema).',
      criterio: 'Capacidad suficiente para 24 h en reposo más 5 min en alarma (15 min si hay voceo de evacuación).',
      ref: 'NFPA 72 10.6.7',
    },
    {
      id: 'det-humo', frecuencia: 'anual', componente: 'Detectores de humo',
      actividad: 'Prueba funcional del 100% con aerosol o gas de prueba aprobado por el fabricante (nunca con flama).',
      criterio: 'Cada detector entra en alarma y el panel indica su dirección o zona en 10 s o menos.',
      medicion: 'probados / total',
      ref: 'NFPA 72 10.11.1',
    },
    {
      id: 'det-sensibilidad', frecuencia: 'anual', componente: 'Detectores de humo',
      actividad: 'Prueba de sensibilidad (desde el panel o con equipo de prueba), cuando corresponda según su ciclo.',
      criterio: 'Dentro del rango del fabricante. Se prueba al año de instalados y después cada 2 años.',
      ref: 'NFPA 72 14.4.4.3',
    },
    {
      id: 'det-calor', frecuencia: 'anual', componente: 'Detectores de calor',
      actividad: 'Restaurables: prueba con fuente de calor. No restaurables: prueba mecánica/eléctrica sin activarlos.',
      criterio: 'Alarma en el panel; los no restaurables sin daño y con menos de 15 años en servicio.',
      ref: 'NFPA 72 T.14.4.3.2',
    },
    {
      id: 'est-manuales', frecuencia: 'anual', componente: 'Estaciones manuales',
      actividad: 'Accionar el 100% de las estaciones manuales.',
      criterio: 'Alarma en el panel con su ubicación; se restablecen correctamente.',
      medicion: 'probadas / total',
    },
    {
      id: 'det-ducto', frecuencia: 'anual', componente: 'Detectores de ducto (si aplica)',
      actividad: 'Prueba funcional y verificación del paro de la manejadora de aire.',
      criterio: 'Señal en el panel y paro de la manejadora ejecutado.',
    },
    {
      id: 'not-prueba', frecuencia: 'anual', componente: 'Dispositivos de notificación',
      actividad: 'Prueba del 100% de sirenas, estrobos y altavoces.',
      criterio: 'Todos operan; estrobos sincronizados donde se ven más de dos a la vez.',
      ref: 'NFPA 72 18.5',
    },
    {
      id: 'not-audibilidad', frecuencia: 'anual', componente: 'Audibilidad',
      actividad: 'Medir nivel sonoro con sonómetro (ponderación A, a 1.5 m del piso) en áreas representativas o donde hubo cambios.',
      criterio: '15 dBA sobre el ruido ambiente promedio (o 5 dBA sobre el máximo de 60 s); no más de 110 dBA.',
      medicion: 'dBA',
      ref: 'NFPA 72 18.4',
    },
    {
      id: 'causa-efecto', frecuencia: 'anual', componente: 'Funciones de control',
      actividad: 'Probar la matriz causa-efecto: liberación de puertas, paro de HVAC, elevadores, puertas cortafuego.',
      criterio: 'Todas las funciones operan según la matriz de causa-efecto del proyecto.',
      ref: 'NFPA 72 T.14.4.3.2',
    },
    {
      id: 'monitoreo', frecuencia: 'anual', componente: 'Central de monitoreo (si aplica)',
      actividad: 'Enviar señales de alarma, supervisión y falla a la central.',
      criterio: 'La central confirma la recepción de las tres señales.',
      ref: 'NFPA 72 T.14.4.3.2',
    },
  ],
};

export const PLANTILLAS: PlantillaFormato[] = [CCTV, DETECCION];

// Puntos que tocan en una visita: los de esa frecuencia y los más frecuentes.
export function puntosDeVisita(p: PlantillaFormato, visita: Frecuencia): PuntoFormato[] {
  return p.puntos.filter((x) => ORDEN[x.frecuencia] <= ORDEN[visita]);
}

// Frecuencias que ofrece una plantilla (solo las que tienen puntos propios
// o anteriores, empezando por la más corta que tenga algo).
export function frecuenciasDe(p: PlantillaFormato): Frecuencia[] {
  const min = Math.min(...p.puntos.map((x) => ORDEN[x.frecuencia]));
  return FRECUENCIAS.map((f) => f.key).filter((k) => ORDEN[k] >= min);
}

export function nuevoFormato(p: PlantillaFormato, visita?: Frecuencia): FormatoLlenado {
  const v = visita || frecuenciasDe(p)[0];
  return {
    plantillaId: p.id,
    version: p.version,
    sistema: p.sistema,
    titulo: p.titulo,
    normas: p.normas,
    nota: p.nota,
    visita: v,
    areas: '',
    recomendaciones: '',
    puntos: puntosDeVisita(p, v).map((x) => ({ ...x, resultado: null, valor: '', nota: '' })),
  };
}

// Cambiar el tipo de visita conserva lo ya marcado en los puntos que siguen.
export function cambiarVisita(f: FormatoLlenado, visita: Frecuencia): FormatoLlenado {
  const p = PLANTILLAS.find((x) => x.id === f.plantillaId);
  if (!p) return f;
  const previos = new Map(f.puntos.map((x) => [x.id, x]));
  return {
    ...f,
    visita,
    puntos: puntosDeVisita(p, visita).map((x) => {
      const prev = previos.get(x.id);
      return { ...x, resultado: prev?.resultado ?? null, valor: prev?.valor ?? '', nota: prev?.nota ?? '' };
    }),
  };
}

export function resumenFormato(f: FormatoLlenado) {
  let cumple = 0, noCumple = 0, na = 0, pendientes = 0;
  for (const x of f.puntos) {
    if (x.resultado === 'cumple') cumple++;
    else if (x.resultado === 'no_cumple') noCumple++;
    else if (x.resultado === 'na') na++;
    else pendientes++;
  }
  return { cumple, noCumple, na, pendientes, total: f.puntos.length };
}

export const ETIQUETA_FRECUENCIA: Record<Frecuencia, string> = {
  trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
};

export const ETIQUETA_RESULTADO: Record<Resultado, string> = {
  cumple: 'Cumple', no_cumple: 'No cumple', na: 'N/A',
};
