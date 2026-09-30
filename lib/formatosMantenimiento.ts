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
  // Punto que no se marca a mano: su resultado sale de la tabla de pruebas
  // por dispositivo (formatos con `dispositivos`), según esta categoría.
  desdeDispositivos?: CategoriaDispositivo;
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
  // Datos generales del sistema que se capturan una vez (panel, equipo de
  // prueba…). Se imprimen al inicio del anexo.
  campos?: CampoFormato[];
  // Lleva tabla de pruebas dispositivo por dispositivo.
  dispositivos?: boolean;
};

export type CampoFormato = { key: string; label: string; placeholder?: string };

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
  campos?: CampoFormato[];
  datos?: Record<string, string>;
  dispositivos?: DispositivoPrueba[];
};

// ------------------------------------------------------------------
// Pruebas por dispositivo (detectores, estaciones manuales, photobeams…)
// ------------------------------------------------------------------
export type CategoriaDispositivo = 'humo' | 'calor' | 'photobeam' | 'estacion' | 'ducto' | 'asd';

export type TipoDispositivo = {
  key: string;
  label: string;
  corto: string;
  categoria: CategoriaDispositivo;
  metodos: string[];
  // Qué se anota como medición (opcional) y ejemplo para el campo.
  medicion?: string;
};

// Métodos según NFPA 72 Tabla 14.4.3.2: el humo debe entrar a la cámara
// (el imán solo prueba la electrónica y no cuenta como prueba funcional).
export const TIPOS_DISPOSITIVO: TipoDispositivo[] = [
  { key: 'humo-foto', label: 'Humo fotoeléctrico', corto: 'Humo fotoel.', categoria: 'humo', medicion: 'Sensibilidad %/m',
    metodos: ['Aerosol de humo listado', 'Humo aprobado por el fabricante'] },
  { key: 'humo-ion', label: 'Humo iónico', corto: 'Humo iónico', categoria: 'humo', medicion: 'Sensibilidad %/m',
    metodos: ['Aerosol de humo listado', 'Humo aprobado por el fabricante'] },
  { key: 'multi', label: 'Multicriterio (humo / calor)', corto: 'Multicriterio', categoria: 'humo', medicion: 'Sensibilidad %/m',
    metodos: ['Aerosol de humo listado', 'Aerosol + fuente de calor', 'Aerosol multicriterio'] },
  { key: 'calor-fijo-r', label: 'Calor temp. fija (restaurable)', corto: 'Calor fijo', categoria: 'calor', medicion: 'Temp. °C',
    metodos: ['Fuente de calor listada'] },
  { key: 'calor-rr', label: 'Calor termovelocimétrico', corto: 'Calor termovel.', categoria: 'calor', medicion: 'Temp. °C',
    metodos: ['Calor (elemento de incremento)', 'Calor (ambos elementos)'] },
  { key: 'calor-fijo-nr', label: 'Calor temp. fija (no restaurable)', corto: 'Calor no rest.', categoria: 'calor', medicion: 'Años en servicio',
    metodos: ['Prueba eléctrica sin activarlo'] },
  { key: 'calor-lineal', label: 'Calor lineal (cable)', corto: 'Calor lineal', categoria: 'calor',
    metodos: ['Continuidad del lazo', 'Fuente de calor (restaurable)'] },
  { key: 'photobeam', label: 'Photobeam (haz proyectado)', corto: 'Photobeam', categoria: 'photobeam', medicion: 'Señal / % oscurecimiento',
    metodos: ['Filtro calibrado', 'Obstrucción parcial', 'Filtro + bloqueo total'] },
  { key: 'estacion-1', label: 'Estación manual (simple acción)', corto: 'Est. manual', categoria: 'estacion',
    metodos: ['Accionamiento manual'] },
  { key: 'estacion-2', label: 'Estación manual (doble acción)', corto: 'Est. manual doble', categoria: 'estacion',
    metodos: ['Accionamiento manual'] },
  { key: 'ducto', label: 'Detector de ducto', corto: 'Ducto', categoria: 'ducto', medicion: 'Presión dif. inH2O',
    metodos: ['Aerosol + presión diferencial', 'Aerosol con manejadora operando'] },
  { key: 'asd', label: 'Aspiración (ASD / VESDA)', corto: 'Aspiración', categoria: 'asd', medicion: 'Tiempo de transporte s',
    metodos: ['Humo en el puerto más lejano'] },
];

export const CATEGORIAS: { key: CategoriaDispositivo; label: string }[] = [
  { key: 'humo', label: 'Detectores de humo' },
  { key: 'calor', label: 'Detectores de calor' },
  { key: 'photobeam', label: 'Photobeams' },
  { key: 'estacion', label: 'Estaciones manuales' },
  { key: 'ducto', label: 'Detectores de ducto' },
  { key: 'asd', label: 'Detección por aspiración' },
];

export type ResultadoDispositivo = 'pasa' | 'falla' | 'no_probado';

export const ETIQUETA_RESULTADO_DISP: Record<ResultadoDispositivo, string> = {
  pasa: 'Pasa', falla: 'Falla', no_probado: 'No probado',
};

// Motivos frecuentes para capturar rápido en el celular (se pueden editar).
export const MOTIVOS_FALLA = [
  'No entró en alarma', 'Dirección o descripción incorrecta en panel', 'Respuesta mayor a 10 s',
  'Sensibilidad fuera de rango', 'Sucio / contaminado', 'Daño físico', 'No se restablece', 'Falla de comunicación en lazo',
];
export const MOTIVOS_NO_PROBADO = [
  'No accesible (altura / obstrucción)', 'Área restringida', 'Proceso del cliente en operación', 'Dispositivo retirado / no localizado',
];

export type DispositivoPrueba = {
  id: string;
  tipo: string;
  // Lazo-dirección (p. ej. «L1-045») o zona en paneles convencionales.
  direccion: string;
  ubicacion: string;
  metodo: string;
  valor: string;
  resultado: ResultadoDispositivo | null;
  nota: string;
};

export function tipoDispositivo(key: string): TipoDispositivo | undefined {
  return TIPOS_DISPOSITIVO.find((t) => t.key === key);
}

export function nuevoDispositivo(tipo: string, direccion = '', ubicacion = ''): DispositivoPrueba {
  return {
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
    tipo,
    direccion,
    ubicacion,
    metodo: tipoDispositivo(tipo)?.metodos[0] || '',
    valor: '',
    resultado: null,
    nota: '',
  };
}

// «L1-045» → «L1-046»: incrementa el último número conservando los ceros.
export function siguienteDireccion(dir: string): string {
  const m = dir.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return dir;
  const n = String(Number(m[2]) + 1).padStart(m[2].length, '0');
  return `${m[1]}${n}${m[3]}`;
}

export function resumenDispositivos(lista: DispositivoPrueba[] = []) {
  let pasa = 0, falla = 0, noProbado = 0, pendientes = 0;
  for (const d of lista) {
    if (d.resultado === 'pasa') pasa++;
    else if (d.resultado === 'falla') falla++;
    else if (d.resultado === 'no_probado') noProbado++;
    else pendientes++;
  }
  return { pasa, falla, noProbado, pendientes, total: lista.length };
}

export function resumenPorTipo(lista: DispositivoPrueba[] = []) {
  return TIPOS_DISPOSITIVO.map((t) => ({ tipo: t, ...resumenDispositivos(lista.filter((d) => d.tipo === t.key)) }))
    .filter((x) => x.total > 0);
}

function etiquetaDisp(d: DispositivoPrueba): string {
  const t = tipoDispositivo(d.tipo);
  return [d.direccion, d.ubicacion].filter(Boolean).join(' ') || t?.corto || 'Sin dirección';
}

// Recalcula los puntos que dependen de la tabla: N/A si no hay dispositivos
// de esa categoría; «No cumple» si alguno falló o quedó sin probar (NFPA 72
// pide probar el 100%); «Cumple» si todos pasaron. Así la etiqueta y la
// página de verificación reflejan las fallas sin lógica aparte.
export function sincronizarDispositivos(f: FormatoLlenado): FormatoLlenado {
  if (!f.dispositivos) return f;
  const lista = f.dispositivos;
  return {
    ...f,
    puntos: f.puntos.map((p) => {
      if (!p.desdeDispositivos) return p;
      const deCat = lista.filter((d) => tipoDispositivo(d.tipo)?.categoria === p.desdeDispositivos);
      const r = resumenDispositivos(deCat);
      if (r.total === 0) return { ...p, resultado: 'na', valor: '', nota: '' };
      const probados = r.pasa + r.falla;
      const valor = `${r.pasa} pasan / ${r.total}`;
      if (r.pendientes > 0) return { ...p, resultado: null, valor, nota: '' };
      const partes: string[] = [];
      const fallas = deCat.filter((d) => d.resultado === 'falla');
      const sinProbar = deCat.filter((d) => d.resultado === 'no_probado');
      if (fallas.length) partes.push(`Fallan ${fallas.length}: ${fallas.map((d) => `${etiquetaDisp(d)}${d.nota ? ` (${d.nota})` : ''}`).join('; ')}`);
      if (sinProbar.length) partes.push(`Sin probar ${sinProbar.length}: ${sinProbar.map((d) => `${etiquetaDisp(d)}${d.nota ? ` (${d.nota})` : ''}`).join('; ')}`);
      return {
        ...p,
        resultado: partes.length ? 'no_cumple' : 'cumple',
        valor: probados === r.total ? valor : `${valor} (${probados} probados)`,
        nota: partes.join('. '),
      };
    }),
  };
}

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

// ------------------------------------------------------------------
// Supresión por agente limpio
// ------------------------------------------------------------------
const AGENTE_LIMPIO: PlantillaFormato = {
  id: 'agente-limpio',
  version: 1,
  sistema: 'Supresión',
  titulo: 'Sistema de supresión por agente limpio',
  normas: [
    { clave: 'NFPA 2001', nombre: 'Standard on Clean Agent Fire Extinguishing Systems, Cap. 7: Inspección, servicio, prueba y mantenimiento' },
    { clave: 'NFPA 72', nombre: 'National Fire Alarm and Signaling Code (detección y panel de liberación)' },
    { clave: 'NOM-002-STPS-2010', nombre: 'Prevención y protección contra incendios (7.4 programa anual; 7.7 registros)' },
  ],
  nota:
    'Frecuencias según NFPA 2001. Toda prueba del circuito de disparo se hace con los actuadores desconectados de las válvulas de los cilindros, siguiendo el manual del fabricante.',
  puntos: [
    {
      id: 'al-bitacora', frecuencia: 'semestral', componente: 'Inspección mensual del cliente',
      actividad: 'Revisar la bitácora de inspecciones mensuales (manómetros, panel, accesos).',
      criterio: 'Bitácora al día y sin anomalías sin atender.',
    },
    {
      id: 'al-cilindros', frecuencia: 'semestral', componente: 'Cilindros y agente',
      actividad: 'Pesar cada cilindro (o medir nivel) y leer la presión corregida por temperatura.',
      criterio: 'Pérdida de agente ≤ 5% y de presión ≤ 10% respecto a lo marcado; si se rebasa, recargar o reemplazar.',
      medicion: 'kg / psi',
      ref: 'NFPA 2001 Cap. 7',
    },
    {
      id: 'al-fisico', frecuencia: 'semestral', componente: 'Cilindros y soportería',
      actividad: 'Inspección física de cilindros, soportes, válvulas, mangueras flexibles y sellos de seguridad.',
      criterio: 'Sin corrosión, golpes ni fugas; cilindros firmemente sujetos; sellos y pasadores en su lugar.',
    },
    {
      id: 'al-panel', frecuencia: 'semestral', componente: 'Panel de liberación',
      actividad: 'Revisar estado del panel, baterías e historial de eventos.',
      criterio: 'Panel en estado normal, sin fallas activas; baterías sin daño y con voltaje según fabricante.',
      medicion: 'V',
    },
    {
      id: 'al-deteccion', frecuencia: 'anual', componente: 'Detección',
      actividad: 'Prueba funcional del 100% de los detectores del área protegida (zonas cruzadas).',
      criterio: 'Primera zona activa prealarma; segunda zona inicia la secuencia de disparo.',
      medicion: 'probados / total',
      ref: 'NFPA 72',
    },
    {
      id: 'al-secuencia', frecuencia: 'anual', componente: 'Secuencia de disparo',
      actividad: 'Simular la descarga con actuadores desconectados: alarmas, retardo, paro de HVAC, cierre de compuertas y señal al panel de incendio.',
      criterio: 'Todas las funciones se ejecutan en orden y el retardo coincide con el programado.',
      medicion: 's de retardo',
    },
    {
      id: 'al-solenoide', frecuencia: 'anual', componente: 'Actuador / solenoide',
      actividad: 'Probar el actuador eléctrico y el manual (desconectados de la válvula del cilindro).',
      criterio: 'Carrera completa del actuador al recibir la señal y al accionarlo manualmente.',
    },
    {
      id: 'al-manuales', frecuencia: 'anual', componente: 'Estaciones de disparo y aborto',
      actividad: 'Probar la estación de disparo manual y el interruptor de aborto.',
      criterio: 'El disparo manual inicia la secuencia; el aborto la detiene mientras se mantiene presionado.',
    },
    {
      id: 'al-tuberia', frecuencia: 'anual', componente: 'Tubería y boquillas',
      actividad: 'Inspeccionar soportería, uniones y boquillas de descarga.',
      criterio: 'Sin obstrucciones ni daño; boquillas orientadas según la memoria de cálculo.',
    },
    {
      id: 'al-cuarto', frecuencia: 'anual', componente: 'Hermeticidad del cuarto',
      actividad: 'Inspeccionar el recinto en busca de nuevas perforaciones, cambios de uso, volumen o ventilación.',
      criterio: 'Sin cambios que afecten la retención; si los hay, prueba de puerta sopladora con retención ≥ 10 min.',
      ref: 'NFPA 2001',
    },
    {
      id: 'al-senalizacion', frecuencia: 'anual', componente: 'Señalización',
      actividad: 'Verificar letreros de advertencia en accesos y en las estaciones manuales.',
      criterio: 'Letreros visibles con el agente utilizado y las instrucciones de desalojo.',
    },
  ],
};

// ------------------------------------------------------------------
// Control de acceso
// ------------------------------------------------------------------
const CONTROL_ACCESO: PlantillaFormato = {
  id: 'control-acceso',
  version: 1,
  sistema: 'Control de acceso',
  titulo: 'Sistema de control de acceso',
  normas: [
    { clave: 'NFPA 731', nombre: 'Standard for the Installation of Electronic Premises Security Systems (ed. 2023)' },
    { clave: 'NFPA 101', nombre: 'Código de Seguridad Humana: puertas de salida con control de acceso' },
    { clave: 'UL 294', nombre: 'Access Control System Units (equipos listados)' },
  ],
  nota:
    'Las puertas que forman parte de una ruta de evacuación deben liberarse ante falla de energía y alarma de incendio (NFPA 101). Pruebas según el manual del fabricante.',
  puntos: [
    {
      id: 'ca-lectoras', frecuencia: 'trimestral', componente: 'Lectoras y teclados',
      actividad: 'Limpieza y prueba de lectura con credenciales de prueba (tarjeta, PIN, biometría).',
      criterio: 'Lectura y respuesta en menos de 1 s; se niega el acceso a credenciales no válidas.',
    },
    {
      id: 'ca-cerraduras', frecuencia: 'trimestral', componente: 'Cerraduras y electroimanes',
      actividad: 'Revisar alineación de placa y armadura, fijación y limpieza de superficies.',
      criterio: 'Cierre firme sin juego; superficies limpias y alineadas.',
    },
    {
      id: 'ca-sensores', frecuencia: 'trimestral', componente: 'Sensores de puerta',
      actividad: 'Probar contacto de puerta, alarma de puerta forzada y puerta abierta demasiado tiempo.',
      criterio: 'Los eventos se reportan en el software con la puerta correcta.',
    },
    {
      id: 'ca-salida', frecuencia: 'semestral', componente: 'Botones y sensores de salida',
      actividad: 'Probar el sensor de salida y el botón manual de cada puerta de evacuación.',
      criterio: 'El botón libera la puerta aun sin el sensor y la mantiene abierta al menos 30 s.',
      ref: 'NFPA 101',
    },
    {
      id: 'ca-falla-energia', frecuencia: 'semestral', componente: 'Liberación por falla de energía',
      actividad: 'Cortar la energía de la cerradura en puertas de evacuación.',
      criterio: 'Las cerraduras tipo fail-safe se liberan de inmediato.',
      ref: 'NFPA 101',
    },
    {
      id: 'ca-incendio', frecuencia: 'semestral', componente: 'Integración con alarma de incendio',
      actividad: 'Simular señal de alarma de incendio hacia el control de acceso.',
      criterio: 'Se liberan las puertas de la ruta de evacuación y permanecen libres hasta restablecer.',
      ref: 'NFPA 101',
    },
    {
      id: 'ca-fuentes', frecuencia: 'semestral', componente: 'Fuentes y baterías',
      actividad: 'Medir voltaje de fuentes y probar respaldo de baterías de paneles.',
      criterio: 'Voltaje dentro del rango del fabricante; el panel opera con baterías y reporta falla de CA.',
      medicion: 'V',
    },
    {
      id: 'ca-paneles', frecuencia: 'anual', componente: 'Paneles y comunicación',
      actividad: 'Verificar comunicación de todos los paneles con el servidor y la hora sincronizada.',
      criterio: '100% de los paneles en línea y sincronizados.',
    },
    {
      id: 'ca-base', frecuencia: 'anual', componente: 'Base de datos',
      actividad: 'Depurar usuarios y credenciales inactivas junto con el cliente; respaldar la base de datos.',
      criterio: 'Solo usuarios vigentes autorizados; respaldo generado y resguardado.',
    },
    {
      id: 'ca-firmware', frecuencia: 'anual', componente: 'Firmware y software',
      actividad: 'Actualizar firmware de paneles y software a la versión estable del fabricante; cambiar contraseñas de fábrica.',
      criterio: 'Versión estable vigente; ninguna cuenta con contraseña de fábrica.',
    },
  ],
};

// ------------------------------------------------------------------
// Alarma de intrusión
// ------------------------------------------------------------------
const INTRUSION: PlantillaFormato = {
  id: 'intrusion',
  version: 1,
  sistema: 'Alarma intrusión',
  titulo: 'Sistema de alarma de intrusión',
  normas: [
    { clave: 'NFPA 731', nombre: 'Standard for the Installation of Electronic Premises Security Systems (ed. 2023)' },
  ],
  nota:
    'Antes de las pruebas se avisa a la central de monitoreo y al cliente para evitar despachos. Pruebas según el manual del fabricante del panel.',
  puntos: [
    {
      id: 'in-panel', frecuencia: 'trimestral', componente: 'Panel de alarma',
      actividad: 'Revisar estado del panel, teclados e historial de eventos.',
      criterio: 'Sin fallas activas; zonas sin anular de forma permanente.',
    },
    {
      id: 'in-pir', frecuencia: 'trimestral', componente: 'Sensores de movimiento',
      actividad: 'Prueba de caminata en cada sensor para verificar cobertura.',
      criterio: 'Detecta dentro del área de cobertura; sin zonas ciegas ni obstrucciones nuevas.',
      medicion: 'probados / total',
    },
    {
      id: 'in-contactos', frecuencia: 'trimestral', componente: 'Contactos magnéticos',
      actividad: 'Abrir y cerrar cada puerta y ventana supervisada.',
      criterio: 'El panel indica la zona abierta al instante; contactos bien fijados.',
      medicion: 'probados / total',
    },
    {
      id: 'in-otros', frecuencia: 'trimestral', componente: 'Otros dispositivos',
      actividad: 'Probar botones de pánico, sensores de ruptura de vidrio y detectores de vibración (si aplica).',
      criterio: 'Cada dispositivo genera su evento correcto en el panel.',
    },
    {
      id: 'in-sirenas', frecuencia: 'semestral', componente: 'Sirenas y estrobos',
      actividad: 'Probar sirenas interiores y exteriores.',
      criterio: 'Operan y se escuchan en el área; gabinete exterior sin daño.',
    },
    {
      id: 'in-comunicador', frecuencia: 'semestral', componente: 'Comunicador (IP / celular)',
      actividad: 'Enviar eventos de prueba y simular falla de la vía principal.',
      criterio: 'La central recibe los eventos por la vía principal y la de respaldo.',
      medicion: 's de recepción',
    },
    {
      id: 'in-bateria', frecuencia: 'anual', componente: 'Batería de respaldo',
      actividad: 'Desconectar CA, medir voltaje bajo carga y revisar fecha de la batería.',
      criterio: 'Opera con batería y reporta falla de CA; autonomía igual o mayor a la de diseño.',
      medicion: 'V',
    },
    {
      id: 'in-usuarios', frecuencia: 'anual', componente: 'Usuarios y códigos',
      actividad: 'Revisar con el cliente la lista de usuarios, códigos y contactos de emergencia.',
      criterio: 'Solo usuarios vigentes; código maestro de fábrica cambiado.',
    },
  ],
};

// ------------------------------------------------------------------
// Automatización (BMS / BAS)
// ------------------------------------------------------------------
const BMS: PlantillaFormato = {
  id: 'bms',
  version: 1,
  sistema: 'Automatización',
  titulo: 'Sistema de automatización de edificios (BMS)',
  normas: [
    { clave: 'ASHRAE/ACCA 180', nombre: 'Inspección y mantenimiento de sistemas HVAC comerciales (controles)' },
    { clave: 'ASHRAE Guideline 13', nombre: 'Especificación de sistemas de control digital directo' },
    { clave: 'ISO 16484', nombre: 'Sistemas de automatización y control de edificios (BACS)' },
  ],
  nota:
    'Calibraciones contra un instrumento de referencia con certificado de calibración vigente. Los valores de tolerancia son los del fabricante del sensor.',
  puntos: [
    {
      id: 'bms-alarmas', frecuencia: 'trimestral', componente: 'Servidor y estación de trabajo',
      actividad: 'Revisar alarmas activas, historial de tendencias y puntos fuera de servicio o en manual.',
      criterio: 'Sin alarmas sin atender; puntos en manual justificados y documentados.',
    },
    {
      id: 'bms-sensores', frecuencia: 'semestral', componente: 'Sensores de campo',
      actividad: 'Comparar temperatura, humedad, CO₂ y presión diferencial contra instrumento de referencia.',
      criterio: 'Diferencia dentro de la exactitud del fabricante del sensor; recalibrar o reemplazar si no.',
      medicion: 'desviación',
    },
    {
      id: 'bms-actuadores', frecuencia: 'semestral', componente: 'Actuadores, válvulas y compuertas',
      actividad: 'Comandar de 0 a 100% y verificar la carrera completa y la retroalimentación.',
      criterio: 'Movimiento suave, sin atascos ni holgura; posición real igual a la comandada.',
    },
    {
      id: 'bms-controladores', frecuencia: 'semestral', componente: 'Controladores',
      actividad: 'Revisar estado, alimentación, baterías internas y fijación de conexiones.',
      criterio: 'Controladores en línea; voltaje según fabricante; sin conexiones flojas.',
      medicion: 'V',
    },
    {
      id: 'bms-secuencias', frecuencia: 'anual', componente: 'Secuencias de control',
      actividad: 'Verificar horarios, puntos de ajuste y secuencias contra la operación acordada.',
      criterio: 'Las secuencias responden según la lógica documentada.',
    },
    {
      id: 'bms-red', frecuencia: 'anual', componente: 'Red BACnet / Modbus',
      actividad: 'Revisar comunicación del bus (RS-485 / IP), dispositivos fuera de línea y terminaciones.',
      criterio: 'Todos los dispositivos en línea; sin errores de comunicación recurrentes.',
    },
    {
      id: 'bms-respaldo', frecuencia: 'anual', componente: 'Respaldo',
      actividad: 'Respaldar base de datos, programas y gráficos; actualizar software a versión estable.',
      criterio: 'Respaldo generado y entregado al cliente.',
    },
  ],
};

// ------------------------------------------------------------------
// Red contra incendio (bombas, válvulas, hidrantes, rociadores)
// ------------------------------------------------------------------
const RED_CONTRA_INCENDIO: PlantillaFormato = {
  id: 'red-contra-incendio',
  version: 1,
  sistema: 'Red contra incendio',
  titulo: 'Red contra incendio (bombas, hidrantes y rociadores)',
  normas: [
    { clave: 'NFPA 25', nombre: 'Inspection, Testing, and Maintenance of Water-Based Fire Protection Systems' },
    { clave: 'NFPA 20', nombre: 'Instalación de bombas estacionarias contra incendio (referencia de la curva)' },
    { clave: 'NOM-002-STPS-2010', nombre: 'Prevención y protección contra incendios (7.4 programa anual; 7.7 registros)' },
  ],
  nota:
    'Frecuencias según NFPA 25. Las pruebas semanales y mensuales sin flujo de las bombas las realiza el cliente y se revisan en su bitácora; las pruebas con flujo se coordinan con el cliente.',
  puntos: [
    {
      id: 'rci-bitacora', frecuencia: 'trimestral', componente: 'Bitácora del cliente',
      actividad: 'Revisar registros de pruebas sin flujo: bomba diésel semanal (30 min) y eléctrica mensual (10 min).',
      criterio: 'Pruebas al día; presiones de succión y descarga registradas.',
      ref: 'NFPA 25 Cap. 8',
    },
    {
      id: 'rci-churn', frecuencia: 'trimestral', componente: 'Bomba contra incendio',
      actividad: 'Prueba sin flujo: arranque automático por caída de presión, presiones, fugas y temperatura.',
      criterio: 'Arranca sola; presión estable; sin fugas ni sobrecalentamiento; goteo normal de empaques.',
      medicion: 'psi succión / descarga',
      ref: 'NFPA 25 Cap. 8',
    },
    {
      id: 'rci-jockey', frecuencia: 'trimestral', componente: 'Bomba jockey y tablero',
      actividad: 'Verificar arranque y paro de la jockey, y alarmas del tablero de control.',
      criterio: 'Arranque y paro en las presiones de ajuste; sin arranques excesivos.',
      medicion: 'psi arranque / paro',
    },
    {
      id: 'rci-valvulas', frecuencia: 'trimestral', componente: 'Válvulas de control',
      actividad: 'Inspeccionar posición y aseguramiento de válvulas (sello, candado o supervisión eléctrica).',
      criterio: 'Válvulas en posición normal, accesibles y aseguradas o supervisadas.',
      ref: 'NFPA 25 Cap. 13',
    },
    {
      id: 'rci-flujo', frecuencia: 'trimestral', componente: 'Alarmas de flujo',
      actividad: 'Probar alarma de flujo desde la conexión de prueba (mecánicas trimestral; de paleta o presión semestral).',
      criterio: 'Alarma de flujo local y en el panel de incendio.',
      ref: 'NFPA 25',
    },
    {
      id: 'rci-toma-siamesa', frecuencia: 'trimestral', componente: 'Toma siamesa',
      actividad: 'Inspeccionar toma de bomberos: tapas, roscas, válvula check y señalización.',
      criterio: 'Accesible, con tapas, sin daño ni obstrucciones y señalizada.',
    },
    {
      id: 'rci-tamper', frecuencia: 'semestral', componente: 'Supervisión de válvulas',
      actividad: 'Probar los interruptores de supervisión (tamper) de las válvulas.',
      criterio: 'Señal de supervisión en el panel antes de 2 vueltas del volante o 1/5 del recorrido.',
      ref: 'NFPA 25',
    },
    {
      id: 'rci-gabinetes', frecuencia: 'anual', componente: 'Gabinetes y mangueras',
      actividad: 'Inspeccionar gabinetes, válvulas angulares, mangueras, chiflones y su acomodo.',
      criterio: 'Mangueras sin cortes ni moho, bien acomodadas; válvulas sin fugas; gabinete accesible.',
      ref: 'NFPA 25 Cap. 6',
    },
    {
      id: 'rci-hidrantes', frecuencia: 'anual', componente: 'Hidrantes',
      actividad: 'Inspeccionar y operar hidrantes (apertura completa hasta limpiar el agua y cierre).',
      criterio: 'Operan sin dificultad, drenan correctamente y sin fugas.',
      ref: 'NFPA 25 Cap. 7',
    },
    {
      id: 'rci-rociadores', frecuencia: 'anual', componente: 'Rociadores (si aplica)',
      actividad: 'Inspección visual desde el piso de rociadores, tubería y soportes; revisar gabinete de repuestos.',
      criterio: 'Sin corrosión, pintura ni daño; 45 cm libres bajo el deflector; al menos 6 repuestos con su llave.',
      ref: 'NFPA 25 Cap. 5',
    },
    {
      id: 'rci-dren', frecuencia: 'anual', componente: 'Prueba de dren principal',
      actividad: 'Abrir el dren principal y registrar presión estática y residual.',
      criterio: 'Sin caída mayor al 10% respecto a pruebas anteriores; si la hay, investigar la causa.',
      medicion: 'psi estática / residual',
      ref: 'NFPA 25 13.2.5',
    },
    {
      id: 'rci-curva', frecuencia: 'anual', componente: 'Prueba de flujo de la bomba',
      actividad: 'Prueba de desempeño a 0%, 100% y 150% del gasto nominal.',
      criterio: 'Presión no menor al 95% de la curva de aceptación o de placa en cada punto.',
      medicion: 'psi a 0 / 100 / 150%',
      ref: 'NFPA 25 Cap. 8',
    },
    {
      id: 'rci-diesel', frecuencia: 'anual', componente: 'Motor diésel (si aplica)',
      actividad: 'Revisar baterías, nivel de combustible, aceite, anticongelante, bandas y mangueras.',
      criterio: 'Tanque de combustible al menos a 2/3; baterías y cargador operando; sin fugas.',
    },
  ],
};

// ------------------------------------------------------------------
// Instalaciones eléctricas
// ------------------------------------------------------------------
const ELECTRICAS: PlantillaFormato = {
  id: 'instalaciones-electricas',
  version: 1,
  sistema: 'Inst. eléctricas',
  titulo: 'Instalaciones eléctricas de baja tensión',
  normas: [
    { clave: 'NOM-029-STPS-2011', nombre: 'Mantenimiento de las instalaciones eléctricas en los centros de trabajo' },
    { clave: 'NOM-022-STPS-2015', nombre: 'Electricidad estática: medición anual de la red de tierras' },
    { clave: 'NOM-001-SEDE', nombre: 'Instalaciones eléctricas (utilización), versión vigente' },
    { clave: 'NFPA 70B', nombre: 'Standard for Electrical Equipment Maintenance' },
  ],
  nota:
    'Trabajos con equipo desenergizado bajo procedimiento de bloqueo y etiquetado, y equipo de protección personal según NOM-029-STPS-2011. Mediciones con instrumentos con certificado de calibración vigente.',
  puntos: [
    {
      id: 'el-seguridad', frecuencia: 'semestral', componente: 'Seguridad del trabajo',
      actividad: 'Aplicar procedimiento de bloqueo y etiquetado, verificar ausencia de tensión y usar el EPP adecuado.',
      criterio: 'Procedimiento aplicado y autorizado por el cliente.',
      ref: 'NOM-029-STPS-2011',
    },
    {
      id: 'el-termografia', frecuencia: 'semestral', componente: 'Tableros (termografía)',
      actividad: 'Termografía infrarroja en barras, interruptores y conexiones con el equipo bajo carga.',
      criterio: 'Diferencia entre fases ≤ 3 °C; de 4 a 15 °C programar corrección; más de 15 °C corregir de inmediato.',
      medicion: '°C',
      ref: 'NFPA 70B / ANSI-NETA MTS',
    },
    {
      id: 'el-visual', frecuencia: 'semestral', componente: 'Tableros (inspección)',
      actividad: 'Revisar tapas, directorio de circuitos, señalización de riesgo y espacio libre frente al tablero.',
      criterio: 'Tapas completas, circuitos identificados, señal de riesgo eléctrico y área de trabajo despejada.',
      ref: 'NOM-001-SEDE',
    },
    {
      id: 'el-mediciones', frecuencia: 'semestral', componente: 'Parámetros eléctricos',
      actividad: 'Medir voltaje y corriente por fase, y revisar desbalance.',
      criterio: 'Voltaje dentro de ±10% del nominal; corriente menor a la capacidad del interruptor.',
      medicion: 'V / A',
    },
    {
      id: 'el-ups', frecuencia: 'semestral', componente: 'UPS',
      actividad: 'Revisar alarmas, prueba de transferencia a baterías y a bypass, y medir baterías.',
      criterio: 'Transferencia sin caída de la carga; baterías dentro del rango del fabricante.',
      medicion: 'V',
    },
    {
      id: 'el-reapriete', frecuencia: 'anual', componente: 'Tableros (mantenimiento)',
      actividad: 'Con el tablero desenergizado: limpieza con aspiradora o aire seco y reapriete con torquímetro.',
      criterio: 'Par de apriete según el fabricante del equipo; sin polvo ni rastros de calentamiento.',
      ref: 'NFPA 70B',
    },
    {
      id: 'el-interruptores', frecuencia: 'anual', componente: 'Interruptores',
      actividad: 'Operar mecánicamente los interruptores principales y derivados, y probar los diferenciales (botón de prueba).',
      criterio: 'Operación mecánica libre; los diferenciales disparan con su botón de prueba.',
    },
    {
      id: 'el-tierras', frecuencia: 'anual', componente: 'Sistema de tierras',
      actividad: 'Medir resistencia de la red de tierras y continuidad en puntos de conexión (telurómetro).',
      criterio: 'Red de tierras ≤ 25 Ω; pararrayos ≤ 10 Ω; continuidad en todos los puntos.',
      medicion: 'Ω',
      ref: 'NOM-022-STPS-2015',
    },
    {
      id: 'el-aislamiento', frecuencia: 'anual', componente: 'Alimentadores',
      actividad: 'Prueba de resistencia de aislamiento en alimentadores principales (desenergizados).',
      criterio: 'Valor igual o mayor al mínimo recomendado para la tensión del circuito y consistente con pruebas anteriores.',
      medicion: 'MΩ',
      ref: 'NFPA 70B',
    },
  ],
};

// ------------------------------------------------------------------
// Paneles solares
// ------------------------------------------------------------------
const FOTOVOLTAICO: PlantillaFormato = {
  id: 'fotovoltaico',
  version: 1,
  sistema: 'Paneles solares',
  titulo: 'Sistema fotovoltaico',
  normas: [
    { clave: 'IEC 62446-1', nombre: 'Sistemas fotovoltaicos: pruebas, documentación y mantenimiento' },
    { clave: 'IEC 62446-2', nombre: 'Mantenimiento de sistemas fotovoltaicos conectados a la red' },
    { clave: 'NOM-001-SEDE', nombre: 'Artículo 690, sistemas solares fotovoltaicos (versión vigente)' },
  ],
  nota:
    'Mediciones de corriente directa con equipo categoría adecuada y guantes dieléctricos; la limpieza se hace según el fabricante del módulo (sin abrasivos ni agua fría sobre módulos calientes).',
  puntos: [
    {
      id: 'fv-produccion', frecuencia: 'trimestral', componente: 'Monitoreo',
      actividad: 'Revisar producción contra lo esperado y el registro de fallas del inversor.',
      criterio: 'Producción acorde a la irradiancia del periodo; sin fallas recurrentes.',
      medicion: 'kWh',
    },
    {
      id: 'fv-limpieza', frecuencia: 'trimestral', componente: 'Módulos',
      actividad: 'Limpieza de módulos e inspección visual (vidrio, marco, cajas de conexión, sombras nuevas).',
      criterio: 'Sin suciedad, vidrio roto, delaminación ni sombras nuevas.',
      ref: 'IEC 62446-2',
    },
    {
      id: 'fv-estructura', frecuencia: 'semestral', componente: 'Estructura',
      actividad: 'Revisar apriete de grapas y anclajes, corrosión y aterrizaje de la estructura.',
      criterio: 'Sin holgura ni corrosión; estructura y marcos aterrizados.',
    },
    {
      id: 'fv-cableado', frecuencia: 'semestral', componente: 'Cableado y conectores DC',
      actividad: 'Inspeccionar cable solar, conectores, canalizaciones y cajas combinadoras.',
      criterio: 'Sin daño por UV, roedores ni calentamiento; conectores bien acoplados.',
    },
    {
      id: 'fv-inversor', frecuencia: 'semestral', componente: 'Inversores',
      actividad: 'Limpieza de filtros y disipadores, revisión de ventilación y de conexiones.',
      criterio: 'Ventilación libre; opera sin alarmas; conexiones sin calentamiento.',
    },
    {
      id: 'fv-protecciones', frecuencia: 'semestral', componente: 'Protecciones',
      actividad: 'Revisar fusibles, desconectadores DC/AC, supresores y señalización.',
      criterio: 'Protecciones en buen estado; desconectadores operan; etiquetas de advertencia visibles.',
      ref: 'NOM-001-SEDE Art. 690',
    },
    {
      id: 'fv-strings', frecuencia: 'anual', componente: 'Cadenas (strings)',
      actividad: 'Medir Voc e Isc (o corriente de operación) por cadena y verificar polaridad.',
      criterio: 'Voc dentro de ±5% del valor esperado corregido por temperatura; cadenas iguales entre sí.',
      medicion: 'V / A',
      ref: 'IEC 62446-1',
    },
    {
      id: 'fv-aislamiento', frecuencia: 'anual', componente: 'Aislamiento',
      actividad: 'Prueba de resistencia de aislamiento de las cadenas a tierra.',
      criterio: 'Resistencia ≥ 1 MΩ.',
      medicion: 'MΩ',
      ref: 'IEC 62446-1',
    },
    {
      id: 'fv-termografia', frecuencia: 'anual', componente: 'Termografía',
      actividad: 'Termografía de módulos, conectores y tablero con buena irradiancia.',
      criterio: 'Sin puntos calientes en celdas, diodos o conexiones.',
      ref: 'IEC TS 62446-3',
    },
    {
      id: 'fv-tierra', frecuencia: 'anual', componente: 'Puesta a tierra',
      actividad: 'Verificar continuidad del conductor de tierra de equipos y estructura.',
      criterio: 'Continuidad en todos los marcos, estructura e inversores.',
      ref: 'IEC 62446-1',
    },
  ],
};

// ------------------------------------------------------------------
// Pruebas de dispositivos iniciadores (detección de incendio)
// ------------------------------------------------------------------
// Formato especial para las visitas en que se prueba cada detector,
// estación manual y photobeam: además de la lista de cotejo lleva la tabla
// de pruebas por dispositivo (NFPA 72 14.6, registro de inspección y
// pruebas). Los puntos «desdeDispositivos» se calculan con esa tabla.
const PRUEBAS_DETECTORES: PlantillaFormato = {
  id: 'pruebas-detectores',
  version: 1,
  sistema: 'Alarma&Det',
  titulo: 'Pruebas de dispositivos iniciadores de alarma de incendio',
  normas: [
    { clave: 'NFPA 72', nombre: 'National Fire Alarm and Signaling Code (ed. 2022): Cap. 14 inspección, prueba y mantenimiento (Tablas 14.3.1 y 14.4.3.2; 14.4.4.3 sensibilidad; 14.6 registros); Cap. 17 dispositivos iniciadores' },
    { clave: 'NOM-002-STPS-2010', nombre: 'Prevención y protección contra incendios en los centros de trabajo (7.4 programa anual de revisión y pruebas; 7.7 registros)' },
  ],
  nota:
    'Pruebas funcionales en sitio del 100% de los dispositivos listados, con los métodos y equipos indicados por el fabricante de cada uno (NFPA 72 Tabla 14.4.3.2). Los detectores de humo se prueban con humo o aerosol listado que entre a la cámara; la prueba con imán no sustituye la prueba funcional. Los dispositivos sin probar se registran con su motivo.',
  campos: [
    { key: 'panel', label: 'Panel (marca y modelo)', placeholder: 'Ej. Notifier NFS2-3030' },
    { key: 'tipoSistema', label: 'Tipo de sistema', placeholder: 'Direccionable / convencional; número de lazos o zonas' },
    { key: 'ubicacionPanel', label: 'Ubicación del panel', placeholder: 'Ej. Caseta de vigilancia, planta baja' },
    { key: 'monitoreo', label: 'Central de monitoreo', placeholder: 'Nombre y teléfono, o «Sin monitoreo»' },
    { key: 'equipoPrueba', label: 'Equipo de prueba utilizado', placeholder: 'Ej. Aerosol Solo A3 lote 2412, calor Solo 461, filtros de photobeam, pértiga' },
    { key: 'autorizo', label: 'Persona del cliente que autorizó las pruebas', placeholder: 'Nombre y puesto' },
    { key: 'calificacion', label: 'Calificación del técnico', placeholder: 'Ej. Certificación del fabricante / NICET nivel II' },
  ],
  dispositivos: true,
  puntos: [
    // Antes de probar
    {
      id: 'pd-aviso', frecuencia: 'semestral', componente: 'Aviso previo',
      actividad: 'Avisar al responsable del inmueble, a los ocupantes y a la central de monitoreo antes de iniciar las pruebas.',
      criterio: 'Todos avisados y autorización registrada; la central pone la cuenta en prueba.',
      ref: 'NFPA 72 14.2',
    },
    {
      id: 'pd-estado-inicial', frecuencia: 'semestral', componente: 'Panel de control (estado inicial)',
      actividad: 'Registrar el estado del panel antes de probar y descargar o revisar el historial de eventos.',
      criterio: 'Panel en normal, o fallas preexistentes anotadas antes de iniciar.',
      ref: 'NFPA 72 T.14.3.1',
    },
    {
      id: 'pd-aislar', frecuencia: 'semestral', componente: 'Funciones de control',
      actividad: 'Aislar según procedimiento las funciones que no deben operar durante la prueba (liberación de agentes, paro de equipos, elevadores, voceo).',
      criterio: 'Funciones aisladas y anotadas; ninguna operación o descarga no deseada durante las pruebas.',
      ref: 'NFPA 72 14.2',
    },
    // Inspección visual
    {
      id: 'pd-vis-detectores', frecuencia: 'semestral', componente: 'Detectores de humo y calor',
      actividad: 'Inspección visual de cada detector: base, fijación, LED, limpieza y ubicación.',
      criterio: 'Sin daño, pintura, polvo ni cubiertas de obra; no están en flujo directo de aire ni a menos de 0.9 m de difusores o rejillas de retorno.',
      ref: 'NFPA 72 T.14.3.1 / 17.7.4.1',
    },
    {
      id: 'pd-vis-cambios', frecuencia: 'semestral', componente: 'Cobertura',
      actividad: 'Revisar cambios en el inmueble que afecten la cobertura: muros o plafones nuevos, cambio de uso, estantería alta.',
      criterio: 'Sin áreas sin cobertura; los cambios encontrados se reportan para evaluar el diseño.',
      ref: 'NFPA 72 Cap. 17',
    },
    {
      id: 'pd-vis-estaciones', frecuencia: 'semestral', componente: 'Estaciones manuales',
      actividad: 'Inspección visual: acceso libre, señalización, tapa protectora y altura de montaje.',
      criterio: 'Visibles y sin obstrucción; parte operable entre 1.07 y 1.22 m del piso; a no más de 1.5 m de cada salida.',
      ref: 'NFPA 72 17.15',
    },
    {
      id: 'pd-vis-photobeam', frecuencia: 'semestral', componente: 'Photobeams',
      actividad: 'Inspección de emisor, receptor o reflector: trayectoria del haz, soportería y lentes.',
      criterio: 'Trayectoria libre (sin anuncios, estantería ni luminarias); soportes firmes sin vibración; lentes limpias.',
      ref: 'NFPA 72 T.14.3.1',
    },
    {
      id: 'pd-vis-ducto', frecuencia: 'semestral', componente: 'Detectores de ducto',
      actividad: 'Inspección de carcasa, tubos de muestreo y sellos; acceso para prueba.',
      criterio: 'Carcasa cerrada y sellada; tubo de muestreo orientado contra el flujo; acceso disponible.',
      ref: 'NFPA 72 T.14.3.1',
    },
    // Pruebas por dispositivo (se calculan con la tabla)
    {
      id: 'pd-prueba-humo', frecuencia: 'anual', componente: 'Detectores de humo',
      actividad: 'Prueba funcional en sitio del 100% con aerosol listado o humo aprobado por el fabricante (no con imán ni flama).',
      criterio: 'Cada detector entra en alarma y el panel muestra su dirección y descripción correctas en 10 s o menos; se restablece.',
      medicion: 'pasan / total', ref: 'NFPA 72 T.14.4.3.2 / 10.11.1', desdeDispositivos: 'humo',
    },
    {
      id: 'pd-sensibilidad', frecuencia: 'anual', componente: 'Sensibilidad de detectores de humo',
      actividad: 'Verificar sensibilidad con el reporte del panel direccionable o con equipo calibrado, según su ciclo.',
      criterio: 'Dentro del rango listado. Al año de instalados y luego cada 2 años (hasta 5 años si dos pruebas seguidas salen en rango); fuera de rango: limpiar, recalibrar o reemplazar.',
      medicion: 'fecha de la última prueba', ref: 'NFPA 72 14.4.4.3',
    },
    {
      id: 'pd-prueba-calor', frecuencia: 'anual', componente: 'Detectores de calor',
      actividad: 'Restaurables y termovelocimétricos: fuente de calor listada. No restaurables: prueba mecánica o eléctrica sin activarlos.',
      criterio: 'Alarma en el panel con dirección correcta. No restaurables de 15 años o más: reemplazar o enviar 2 de cada 100 a laboratorio.',
      medicion: 'pasan / total', ref: 'NFPA 72 T.14.4.3.2 / 14.4.4.5', desdeDispositivos: 'calor',
    },
    {
      id: 'pd-prueba-photobeam', frecuencia: 'anual', componente: 'Photobeams',
      actividad: 'Prueba con filtro calibrado u obstrucción según el fabricante; verificar alineación y nivel de señal.',
      criterio: 'Alarma con el filtro de valor de alarma; señal dentro del rango del fabricante; bloqueo total indica falla (no alarma) cuando el equipo lo contempla.',
      medicion: 'pasan / total', ref: 'NFPA 72 T.14.4.3.2', desdeDispositivos: 'photobeam',
    },
    {
      id: 'pd-prueba-estaciones', frecuencia: 'anual', componente: 'Estaciones manuales',
      actividad: 'Accionar el 100% de las estaciones manuales.',
      criterio: 'Alarma en el panel con la ubicación correcta; mecanismo y tapa operan; se restablecen con llave o herramienta.',
      medicion: 'pasan / total', ref: 'NFPA 72 T.14.4.3.2', desdeDispositivos: 'estacion',
    },
    {
      id: 'pd-prueba-ducto', frecuencia: 'anual', componente: 'Detectores de ducto',
      actividad: 'Prueba funcional con aerosol y medición de la presión diferencial del tubo de muestreo.',
      criterio: 'Alarma o supervisión según el diseño y paro de la manejadora si aplica; presión dentro del rango del fabricante.',
      medicion: 'pasan / total', ref: 'NFPA 72 T.14.4.3.2', desdeDispositivos: 'ducto',
    },
    {
      id: 'pd-prueba-asd', frecuencia: 'anual', componente: 'Detección por aspiración',
      actividad: 'Introducir humo en el puerto de muestreo más lejano y medir el tiempo de transporte; revisar flujo.',
      criterio: 'Alarma dentro del tiempo de diseño (máximo 120 s); flujo dentro del rango del fabricante.',
      medicion: 'pasan / total', ref: 'NFPA 72 T.14.4.3.2 / 17.7.3.6', desdeDispositivos: 'asd',
    },
    {
      id: 'pd-notificacion', frecuencia: 'anual', componente: 'Respuesta del sistema',
      actividad: 'En al menos una prueba por zona o lazo, dejar operar la notificación y las funciones de control programadas.',
      criterio: 'Sirenas y estrobos operan; las funciones de control responden según la matriz causa-efecto.',
      ref: 'NFPA 72 T.14.4.3.2',
    },
    // Al terminar
    {
      id: 'pd-restablecer', frecuencia: 'semestral', componente: 'Regreso a servicio',
      actividad: 'Restablecer funciones aisladas y verificar el panel; avisar el fin de las pruebas a monitoreo y ocupantes.',
      criterio: 'Panel en normal, sin dispositivos deshabilitados ni en modo prueba; la central confirma que recibió las señales y sale de prueba.',
      ref: 'NFPA 72 14.2',
    },
  ],
};

export const PLANTILLAS: PlantillaFormato[] = [
  CCTV, DETECCION, PRUEBAS_DETECTORES, AGENTE_LIMPIO, CONTROL_ACCESO, INTRUSION, BMS, RED_CONTRA_INCENDIO, ELECTRICAS, FOTOVOLTAICO,
];

// Puntos que tocan en una visita: los de esa frecuencia y los más frecuentes.
// Los que salen de la tabla de dispositivos van siempre: si en la visita se
// prueban dispositivos, quedan registrados.
export function puntosDeVisita(p: PlantillaFormato, visita: Frecuencia): PuntoFormato[] {
  return p.puntos.filter((x) => x.desdeDispositivos || ORDEN[x.frecuencia] <= ORDEN[visita]);
}

// Frecuencias que ofrece una plantilla (solo las que tienen puntos propios
// o anteriores, empezando por la más corta que tenga algo).
export function frecuenciasDe(p: PlantillaFormato): Frecuencia[] {
  const min = Math.min(...p.puntos.filter((x) => !x.desdeDispositivos).map((x) => ORDEN[x.frecuencia]));
  return FRECUENCIAS.map((f) => f.key).filter((k) => ORDEN[k] >= min);
}

export function nuevoFormato(p: PlantillaFormato, visita?: Frecuencia): FormatoLlenado {
  const v = visita || frecuenciasDe(p)[0];
  const f: FormatoLlenado = {
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
    ...(p.campos ? { campos: p.campos, datos: {} } : {}),
    ...(p.dispositivos ? { dispositivos: [] } : {}),
  };
  return sincronizarDispositivos(f);
}

// Cambiar el tipo de visita conserva lo ya marcado en los puntos que siguen.
export function cambiarVisita(f: FormatoLlenado, visita: Frecuencia): FormatoLlenado {
  const p = PLANTILLAS.find((x) => x.id === f.plantillaId);
  if (!p) return f;
  const previos = new Map(f.puntos.map((x) => [x.id, x]));
  return sincronizarDispositivos({
    ...f,
    visita,
    puntos: puntosDeVisita(p, visita).map((x) => {
      const prev = previos.get(x.id);
      return { ...x, resultado: prev?.resultado ?? null, valor: prev?.valor ?? '', nota: prev?.nota ?? '' };
    }),
  });
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
