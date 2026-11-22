// Diagramas unifilares de sistemas fotovoltaicos (supabase/patch_unifilares.sql):
// interconectados a CFE, aislados con baterías o híbridos. Se arman con
// equipos de un catálogo unidos por tramos; cada tramo lleva sus conductores,
// tubería y metros, y la app calcula la caída de tensión.
// Aquí van los tipos, el catálogo, los cálculos y las plantillas (lógica
// pura); el dibujo está en lib/unifilarDibujo.ts. Se prueba en
// lib/unifilar.test.ts.

import { z } from 'zod';

// ---------- Tipos ----------

export type TipoSistema = 'interconectado' | 'aislado' | 'hibrido';

export type TipoEquipo =
  | 'arreglo' | 'fusibles' | 'desconectador' | 'inversor_red' | 'inversor_hibrido' | 'inversor_aislado'
  | 'controlador' | 'baterias' | 'tablero' | 'itm' | 'medidor' | 'transformador' | 'cfe' | 'generador'
  | 'dps' | 'cargas' | 'tierra';

export type EquipoUnifilar = {
  id: string;
  tipo: TipoEquipo;
  // Esquina superior izquierda en el dibujo.
  x: number;
  y: number;
  // Primer renglón del texto del equipo («Inversor de interconexión»).
  nombre: string;
  modelo: string;
  // Lo que cambia según el tipo (watts del módulo, número de MPPT…), como
  // texto, igual que en el formulario. Se lee con num().
  valores: Record<string, string>;
  // Cuánto se movió el texto de su lugar de siempre.
  etiqueta: { dx: number; dy: number };
};

export type Circuito = 'cd' | '1f' | '2f' | '3f';

export type Conductor = { funcion: string; calibre: string; color: string; aislamiento: string };

export type Punta = { equipo: string; puerto: string };

export type TramoUnifilar = {
  id: string;
  a: Punta;
  b: Punta;
  // Tierra se dibuja en verde y sin cálculo.
  tierra: boolean;
  circuito: Circuito;
  titulo: string;
  conductores: Conductor[];
  tuberia: string;
  metros: string;
  // Vacío = lo calcula la app desde los equipos.
  voltaje: string;
  corriente: string;
  mostrarEtiqueta: boolean;
  etiqueta: { dx: number; dy: number };
  // Dónde va el tramo de en medio cuando el cable hace codo (null = a la mitad).
  codo: number | null;
};

export type ProyectoUnifilar = {
  titulo: string;
  nombre: string;
  descripcion: string;
  direccion: string;
  lat: string;
  lng: string;
  diseno: string;
  fecha: string;
  escala: string;
  clave: string;
  hoja: string;
  tamano: 'carta' | 'tabloide';
};

export type DatosUnifilar = {
  proyecto: ProyectoUnifilar;
  notas: string[];
  equipos: EquipoUnifilar[];
  tramos: TramoUnifilar[];
};

export type Unifilar = {
  id: string;
  nombre: string;
  tipo: TipoSistema;
  cliente_id: string | null;
  datos: DatosUnifilar;
  creado_por: string;
  creado_en: string;
  actualizado_en: string;
};

export const NOMBRE_TIPO_SISTEMA: Record<TipoSistema, string> = {
  interconectado: 'Interconectado a CFE',
  aislado: 'Aislado con baterías',
  hibrido: 'Híbrido (red + baterías)',
};

// ---------- Números ----------

// «1,5» y «1.5» valen igual; lo vacío o raro es 0.
export function num(texto: string | undefined | null): number {
  const n = Number(String(texto ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
}

// 2 decimales sin ceros de sobra: 5.67, 20.25, 50.
export function redondear(n: number, decimales = 2): string {
  const f = 10 ** decimales;
  return String(Math.round(n * f) / f);
}

// ---------- Conductores ----------

// Cobre: sección en mm² y resistencia en ohm/km a 75 °C
// (NOM-001-SEDE, tabla 8 del capítulo 10).
export const CALIBRES: { calibre: string; mm2: number; ohmKm: number }[] = [
  { calibre: '14', mm2: 2.08, ohmKm: 10.2 },
  { calibre: '12', mm2: 3.31, ohmKm: 6.33 },
  { calibre: '10', mm2: 5.26, ohmKm: 3.97 },
  { calibre: '8', mm2: 8.37, ohmKm: 2.51 },
  { calibre: '6', mm2: 13.3, ohmKm: 1.61 },
  { calibre: '4', mm2: 21.2, ohmKm: 1.01 },
  { calibre: '3', mm2: 26.7, ohmKm: 0.804 },
  { calibre: '2', mm2: 33.6, ohmKm: 0.636 },
  { calibre: '1', mm2: 42.4, ohmKm: 0.505 },
  { calibre: '1/0', mm2: 53.5, ohmKm: 0.4 },
  { calibre: '2/0', mm2: 67.4, ohmKm: 0.317 },
  { calibre: '3/0', mm2: 85, ohmKm: 0.251 },
  { calibre: '4/0', mm2: 107, ohmKm: 0.199 },
  { calibre: '250', mm2: 127, ohmKm: 0.169 },
  { calibre: '300', mm2: 152, ohmKm: 0.141 },
  { calibre: '350', mm2: 177, ohmKm: 0.12 },
  { calibre: '400', mm2: 203, ohmKm: 0.105 },
  { calibre: '500', mm2: 253, ohmKm: 0.0846 },
];

export function datosCalibre(calibre: string) {
  return CALIBRES.find((c) => c.calibre === calibre) || null;
}

// «10 AWG» o «250 kcmil».
export function nombreCalibre(calibre: string): string {
  return num(calibre) >= 250 ? `${calibre} kcmil` : `${calibre} AWG`;
}

export const COLORES_CONDUCTOR = ['Rojo', 'Negro', 'Blanco', 'Verde', 'Azul', 'Gris', 'Desnudo'];
export const AISLAMIENTOS = ['XLPE', 'PV', 'THW', 'THW-LS', 'THHW', 'THHW-LS', 'THHN', 'THWN', 'RHW', 'Desnudo'];
export const TUBERIAS = [
  'Conduit IMC 16 mm (1/2")', 'Conduit IMC 21 mm (3/4")', 'Conduit IMC 27 mm (1")', 'Conduit IMC 35 mm (1 1/4")',
  'Conduit IMC 41 mm (1 1/2")', 'Conduit IMC 53 mm (2")', 'Conduit PVC 21 mm (3/4")', 'Conduit PVC 27 mm (1")',
  'Conduit EMT 21 mm (3/4")', 'Charola', 'Canaleta',
];
export const FUNCIONES_CONDUCTOR = ['Positivo', 'Negativo', 'Fase 1', 'Fase 2', 'Fase 3', 'Neutro', 'CPTE', 'CPT'];

export const NOMBRE_CIRCUITO: Record<Circuito, string> = {
  cd: 'Corriente directa',
  '1f': 'Monofásico (fase y neutro)',
  '2f': 'Bifásico (2 fases)',
  '3f': 'Trifásico',
};

export function conductoresPorOmision(circuito: Circuito, tierra: boolean): Conductor[] {
  if (tierra) return [{ funcion: 'CPT', calibre: '8', color: 'Desnudo', aislamiento: 'Desnudo' }];
  const cpte: Conductor = { funcion: 'CPTE', calibre: '10', color: 'Verde', aislamiento: 'THHW' };
  if (circuito === 'cd') {
    return [
      { funcion: 'Positivo', calibre: '10', color: 'Rojo', aislamiento: 'XLPE' },
      { funcion: 'Negativo', calibre: '10', color: 'Negro', aislamiento: 'XLPE' },
      cpte,
    ];
  }
  const fase = (n: number, color: string): Conductor => ({ funcion: `Fase ${n}`, calibre: '8', color, aislamiento: 'THW' });
  const neutro: Conductor = { funcion: 'Neutro', calibre: '8', color: 'Blanco', aislamiento: 'THW' };
  if (circuito === '1f') return [{ ...fase(1, 'Negro'), funcion: 'Fase' }, neutro, cpte];
  if (circuito === '2f') return [fase(1, 'Negro'), fase(2, 'Rojo'), cpte];
  return [fase(1, 'Negro'), fase(2, 'Rojo'), fase(3, 'Azul'), neutro, cpte];
}

// «Positivo: Rojo 10 AWG XLPE - 5.26 mm²», como en los planos de CFE.
export function textoConductor(c: Conductor): string {
  const datos = datosCalibre(c.calibre);
  const mm2 = datos ? ` - ${datos.mm2} mm²` : '';
  return `${c.funcion}: ${nombreCalibre(c.calibre)} ${c.aislamiento}${mm2} ${c.color}`.replace(/\s+/g, ' ').trim();
}

// ---------- Catálogo de equipos ----------

export type Lado = 'izq' | 'der' | 'arr' | 'aba';

export type Puerto = { id: string; nombre: string; x: number; y: number; lado: Lado; tierra?: boolean };

export type Campo = {
  clave: string;
  etiqueta: string;
  unidad?: string;
  tipo?: 'numero' | 'texto' | 'opcion';
  opciones?: { valor: string; texto: string }[];
  ayuda?: string;
};

export type DefinicionEquipo = {
  tipo: TipoEquipo;
  nombre: string;
  grupo: 'Generación' | 'Conversión' | 'Protección' | 'Red y cargas';
  descripcion: string;
  campos: Campo[];
  valores: Record<string, string>;
};

const FASES: Campo = {
  clave: 'fases', etiqueta: 'Salida de CA', tipo: 'opcion',
  opciones: [{ valor: '1f', texto: 'Monofásica (F + N)' }, { valor: '2f', texto: 'Bifásica (2 F)' }, { valor: '3f', texto: 'Trifásica' }],
};

const CAMPOS_INVERSOR: Campo[] = [
  { clave: 'potencia', etiqueta: 'Potencia de salida', unidad: 'kW' },
  { clave: 'mppts', etiqueta: 'Entradas MPPT', ayuda: 'De 1 a 24. Los industriales traen muchas.' },
  { clave: 'vmaxCd', etiqueta: 'Voltaje máximo de CD', unidad: 'V' },
  { clave: 'imaxMppt', etiqueta: 'Corriente máxima por MPPT', unidad: 'A' },
  FASES,
  { clave: 'voltajeCa', etiqueta: 'Voltaje de CA', unidad: 'V' },
  { clave: 'imaxCa', etiqueta: 'Corriente máxima de salida', unidad: 'A', ayuda: 'Vacío = potencia ÷ voltaje.' },
];

const CAMPO_V_BATERIA: Campo = { clave: 'vBateria', etiqueta: 'Voltaje del banco de baterías', unidad: 'V' };

export const CATALOGO: DefinicionEquipo[] = [
  {
    tipo: 'arreglo', nombre: 'Arreglo fotovoltaico', grupo: 'Generación',
    descripcion: 'Cadenas de módulos en serie y en paralelo.',
    campos: [
      { clave: 'watts', etiqueta: 'Potencia del módulo', unidad: 'W' },
      { clave: 'serie', etiqueta: 'Módulos en serie (por cadena)' },
      { clave: 'paralelo', etiqueta: 'Cadenas en paralelo' },
      { clave: 'voc', etiqueta: 'Voc del módulo', unidad: 'V' },
      { clave: 'isc', etiqueta: 'Isc del módulo', unidad: 'A' },
      { clave: 'vmp', etiqueta: 'Vmp del módulo', unidad: 'V' },
      { clave: 'factorVoc', etiqueta: 'Factor de Voc por temperatura (690-7)', ayuda: '1.00 si el Voc ya está corregido.' },
    ],
    valores: { watts: '550', serie: '9', paralelo: '1', voc: '49.5', isc: '14', vmp: '41.6', factorVoc: '1.00' },
  },
  {
    tipo: 'fusibles', nombre: 'Fusibles de CD', grupo: 'Protección',
    descripcion: 'Caja combinadora o portafusibles, una vía por cadena.',
    campos: [
      { clave: 'vias', etiqueta: 'Vías' },
      { clave: 'amperes', etiqueta: 'Capacidad', unidad: 'A' },
      { clave: 'voltaje', etiqueta: 'Voltaje', unidad: 'VCD' },
    ],
    valores: { vias: '2', amperes: '30', voltaje: '1000' },
  },
  {
    tipo: 'desconectador', nombre: 'Desconectador de CD', grupo: 'Protección',
    descripcion: 'Interruptor de corte de corriente directa.',
    campos: [
      { clave: 'amperes', etiqueta: 'Capacidad', unidad: 'A' },
      { clave: 'voltaje', etiqueta: 'Voltaje', unidad: 'VCD' },
    ],
    valores: { amperes: '32', voltaje: '1000' },
  },
  {
    tipo: 'inversor_red', nombre: 'Inversor de interconexión', grupo: 'Conversión',
    descripcion: 'Inyecta a la red de CFE. Sin baterías.',
    campos: CAMPOS_INVERSOR,
    valores: { potencia: '8', mppts: '2', vmaxCd: '600', imaxMppt: '16', fases: '2f', voltajeCa: '220', imaxCa: '' },
  },
  {
    tipo: 'inversor_hibrido', nombre: 'Inversor híbrido', grupo: 'Conversión',
    descripcion: 'Red de CFE, baterías y salida de respaldo.',
    campos: [...CAMPOS_INVERSOR, CAMPO_V_BATERIA],
    valores: { potencia: '6', mppts: '2', vmaxCd: '500', imaxMppt: '16', fases: '1f', voltajeCa: '127', imaxCa: '', vBateria: '48' },
  },
  {
    tipo: 'inversor_aislado', nombre: 'Inversor aislado', grupo: 'Conversión',
    descripcion: 'Sin red: paneles, baterías y generador opcional.',
    campos: [...CAMPOS_INVERSOR, CAMPO_V_BATERIA],
    valores: { potencia: '5', mppts: '1', vmaxCd: '500', imaxMppt: '18', fases: '1f', voltajeCa: '127', imaxCa: '', vBateria: '48' },
  },
  {
    tipo: 'controlador', nombre: 'Controlador de carga MPPT', grupo: 'Conversión',
    descripcion: 'Carga las baterías desde los paneles.',
    campos: [
      { clave: 'amperes', etiqueta: 'Corriente de carga', unidad: 'A' },
      { clave: 'vmaxCd', etiqueta: 'Voltaje máximo de paneles', unidad: 'V' },
      CAMPO_V_BATERIA,
    ],
    valores: { amperes: '60', vmaxCd: '150', vBateria: '48' },
  },
  {
    tipo: 'baterias', nombre: 'Banco de baterías', grupo: 'Generación',
    descripcion: 'Baterías en serie y en paralelo.',
    campos: [
      { clave: 'voltaje', etiqueta: 'Voltaje de cada batería', unidad: 'V' },
      { clave: 'ah', etiqueta: 'Capacidad de cada batería', unidad: 'Ah' },
      { clave: 'serie', etiqueta: 'Baterías en serie' },
      { clave: 'paralelo', etiqueta: 'Grupos en paralelo' },
    ],
    valores: { voltaje: '48', ah: '100', serie: '1', paralelo: '1' },
  },
  {
    tipo: 'tablero', nombre: 'Tablero de distribución', grupo: 'Protección',
    descripcion: 'Tablero con el interruptor del sistema.',
    campos: [
      { clave: 'barras', etiqueta: 'Capacidad en barras', unidad: 'A' },
      { clave: 'polos', etiqueta: 'Polos del ITM' },
      { clave: 'amperes', etiqueta: 'Capacidad del ITM', unidad: 'A' },
    ],
    valores: { barras: '250', polos: '2', amperes: '50' },
  },
  {
    tipo: 'itm', nombre: 'Interruptor termomagnético', grupo: 'Protección',
    descripcion: 'ITM principal o de un circuito.',
    campos: [
      { clave: 'polos', etiqueta: 'Polos' },
      { clave: 'amperes', etiqueta: 'Capacidad', unidad: 'A', ayuda: 'Vacío = S/E (sin especificar).' },
    ],
    valores: { polos: '2', amperes: '' },
  },
  {
    tipo: 'medidor', nombre: 'Medidor bidireccional', grupo: 'Red y cargas',
    descripcion: 'Medidor de CFE para interconexión.',
    campos: [], valores: {},
  },
  {
    tipo: 'transformador', nombre: 'Transformador', grupo: 'Red y cargas',
    descripcion: 'Transformador de CFE (tipo poste o pedestal).',
    campos: [{ clave: 'kva', etiqueta: 'Capacidad', unidad: 'kVA', ayuda: 'Vacío = S/E.' }],
    valores: { kva: '' },
  },
  {
    tipo: 'cfe', nombre: 'Suministro eléctrico', grupo: 'Red y cargas',
    descripcion: 'La red de CFE.',
    campos: [], valores: {},
  },
  {
    tipo: 'generador', nombre: 'Generador', grupo: 'Generación',
    descripcion: 'Planta de emergencia.',
    campos: [
      { clave: 'potencia', etiqueta: 'Potencia', unidad: 'kW' },
      { clave: 'voltajeCa', etiqueta: 'Voltaje', unidad: 'V' },
    ],
    valores: { potencia: '5', voltajeCa: '127' },
  },
  {
    tipo: 'dps', nombre: 'Supresor de picos (DPS)', grupo: 'Protección',
    descripcion: 'Dispositivo de protección contra sobretensiones.',
    campos: [{ clave: 'voltaje', etiqueta: 'Voltaje', unidad: 'V' }],
    valores: { voltaje: '' },
  },
  {
    tipo: 'cargas', nombre: 'Cargas', grupo: 'Red y cargas',
    descripcion: 'Centro de carga o circuitos de consumo.',
    campos: [], valores: {},
  },
  {
    tipo: 'tierra', nombre: 'Puesta a tierra', grupo: 'Protección',
    descripcion: 'Electrodo o barra de tierra.',
    campos: [], valores: {},
  },
];

export function definicion(tipo: TipoEquipo): DefinicionEquipo {
  return CATALOGO.find((d) => d.tipo === tipo) || CATALOGO[0];
}

export function esInversor(tipo: TipoEquipo): boolean {
  return tipo === 'inversor_red' || tipo === 'inversor_hibrido' || tipo === 'inversor_aislado';
}

// Cuántas cadenas o vías se dibujan: hasta 24 MPPT, 24 vías.
export function entero(texto: string, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(num(texto)) || min));
}

// ---------- Medidas y puertos de cada equipo ----------

export const MPPT_ALTO = 24;
export const VIA_ALTO = 40;
export const FILA_ARREGLO = 54;
export const FILAS_DIBUJADAS = 3;

export function filasDeArreglo(e: EquipoUnifilar): number {
  return Math.min(FILAS_DIBUJADAS, entero(e.valores.paralelo, 1, 999));
}

export function tamanoDe(e: EquipoUnifilar): { w: number; h: number } {
  switch (e.tipo) {
    case 'arreglo': return { w: 200, h: filasDeArreglo(e) * FILA_ARREGLO - 18 + (entero(e.valores.paralelo, 1, 999) > FILAS_DIBUJADAS ? 14 : 0) };
    case 'fusibles': return { w: 70, h: entero(e.valores.vias, 1, 24) * VIA_ALTO + 10 };
    case 'desconectador': return { w: 70, h: 40 };
    case 'inversor_red':
    case 'inversor_hibrido':
    case 'inversor_aislado': {
      const alto = Math.max(90, entero(e.valores.mppts, 1, 24) * MPPT_ALTO);
      return { w: 18 + Math.max(90, Math.min(alto, 130)), h: alto };
    }
    case 'controlador': return { w: 80, h: 70 };
    case 'baterias': return { w: 100, h: 56 };
    case 'tablero': return { w: 110, h: 56 };
    case 'itm': return { w: 80, h: 50 };
    case 'medidor': return { w: 100, h: 60 };
    case 'transformador': return { w: 64, h: 50 };
    case 'cfe': return { w: 56, h: 56 };
    case 'generador': return { w: 56, h: 56 };
    case 'dps': return { w: 34, h: 44 };
    case 'cargas': return { w: 90, h: 50 };
    case 'tierra': return { w: 30, h: 28 };
  }
}

export function puertosDe(e: EquipoUnifilar): Puerto[] {
  const { w, h } = tamanoDe(e);
  const tierraAbajo = (x = w / 2): Puerto => ({ id: 'tierra', nombre: 'Tierra', x, y: h, lado: 'aba', tierra: true });
  switch (e.tipo) {
    case 'arreglo':
      return [{ id: 'salida', nombre: 'Salida (+/−)', x: w, y: (filasDeArreglo(e) * FILA_ARREGLO - 18) / 2, lado: 'der' }, tierraAbajo()];
    case 'fusibles': {
      const vias = entero(e.valores.vias, 1, 24);
      const lista: Puerto[] = [];
      for (let i = 0; i < vias; i++) {
        const y = 25 + i * VIA_ALTO;
        lista.push({ id: `entrada${i + 1}`, nombre: `Entrada ${i + 1}`, x: 0, y, lado: 'izq' });
        lista.push({ id: `salida${i + 1}`, nombre: `Salida ${i + 1}`, x: w, y, lado: 'der' });
      }
      return [...lista, tierraAbajo()];
    }
    case 'desconectador':
    case 'itm':
    case 'tablero':
      return [
        { id: 'entrada', nombre: 'Entrada', x: 0, y: h / 2, lado: 'izq' },
        { id: 'salida', nombre: 'Salida', x: w, y: h / 2, lado: 'der' },
        tierraAbajo(),
      ];
    case 'inversor_red':
    case 'inversor_hibrido':
    case 'inversor_aislado': {
      const n = entero(e.valores.mppts, 1, 24);
      const alto = h / n;
      const lista: Puerto[] = [];
      // MPPT1 abajo, como en los planos: se numeran de abajo hacia arriba.
      for (let i = 0; i < n; i++) lista.push({ id: `mppt${i + 1}`, nombre: `MPPT ${i + 1}`, x: 0, y: h - alto * (i + 0.5), lado: 'izq' });
      const cuadro = w - 18;
      if (e.tipo === 'inversor_red') return [...lista, { id: 'ca', nombre: 'Salida de CA', x: w, y: h / 2, lado: 'der' }, tierraAbajo(18 + cuadro * 0.75)];
      // Baterías abajo a la izquierda, respaldo abajo a la derecha y la red
      // de lado: así los cables no se cruzan.
      if (e.tipo === 'inversor_hibrido') {
        return [
          ...lista,
          { id: 'ca', nombre: 'Red (CA)', x: w, y: h / 2, lado: 'der' },
          { id: 'respaldo', nombre: 'Respaldo (CA)', x: 18 + cuadro * 0.7, y: h, lado: 'aba' },
          { id: 'bat', nombre: 'Baterías', x: 18 + cuadro * 0.25, y: h, lado: 'aba' },
          tierraAbajo(18 + cuadro * 0.95),
        ];
      }
      return [
        ...lista,
        { id: 'ca', nombre: 'Salida de CA', x: w, y: h / 2, lado: 'der' },
        { id: 'gen', nombre: 'Generador (CA)', x: 18 + cuadro / 2, y: 0, lado: 'arr' },
        { id: 'bat', nombre: 'Baterías', x: 18 + cuadro * 0.25, y: h, lado: 'aba' },
        tierraAbajo(18 + cuadro * 0.95),
      ];
    }
    case 'controlador':
      return [
        { id: 'pv', nombre: 'Paneles', x: 0, y: h / 2, lado: 'izq' },
        { id: 'bat', nombre: 'Baterías', x: w, y: h / 2, lado: 'der' },
        tierraAbajo(),
      ];
    case 'baterias':
      return [{ id: 'salida', nombre: 'Salida (+/−)', x: w / 2, y: 0, lado: 'arr' }, tierraAbajo(w - 12)];
    case 'medidor':
      return [
        { id: 'entrada', nombre: 'Lado CFE', x: 0, y: h / 2, lado: 'izq' },
        { id: 'salida', nombre: 'Lado usuario', x: w, y: h * 0.35, lado: 'der' },
        // Por un lado para que el cable de tierra no pase sobre el texto de abajo.
        { id: 'tierra', nombre: 'Tierra', x: w, y: h - 10, lado: 'der', tierra: true },
      ];
    case 'transformador':
      return [
        { id: 'entrada', nombre: 'Primario', x: 0, y: h / 2, lado: 'izq' },
        { id: 'salida', nombre: 'Secundario', x: w, y: h / 2, lado: 'der' },
      ];
    case 'cfe':
    case 'generador':
      return [{ id: 'salida', nombre: 'Salida', x: w, y: h / 2, lado: 'der' }];
    case 'dps':
      return [{ id: 'entrada', nombre: 'Conexión', x: 0, y: 14, lado: 'izq' }, tierraAbajo()];
    case 'cargas':
      return [{ id: 'entrada', nombre: 'Entrada', x: 0, y: h / 2, lado: 'izq' }, tierraAbajo()];
    case 'tierra':
      return [{ id: 'conexion', nombre: 'Conexión', x: w / 2, y: 0, lado: 'arr', tierra: true }];
  }
}

export function puertoDe(e: EquipoUnifilar, id: string): Puerto | null {
  return puertosDe(e).find((p) => p.id === id) || null;
}

// Punto del puerto en el dibujo.
export function puntoDe(datos: DatosUnifilar, punta: Punta): { x: number; y: number; lado: Lado } | null {
  const e = datos.equipos.find((x) => x.id === punta.equipo);
  if (!e) return null;
  const p = puertoDe(e, punta.puerto);
  if (!p) return null;
  return { x: e.x + p.x, y: e.y + p.y, lado: p.lado };
}

// ---------- Recorrido de tramos ----------

// En los equipos que solo dejan pasar la energía, qué puerto sigue del otro
// lado (entrada3 ↔ salida3). Los demás equipos la generan o la transforman.
function puertoDelOtroLado(e: EquipoUnifilar, puerto: string): string | null {
  if (!['fusibles', 'desconectador', 'itm', 'tablero', 'medidor'].includes(e.tipo)) return null;
  if (puerto.startsWith('entrada')) return `salida${puerto.slice('entrada'.length)}`;
  if (puerto.startsWith('salida')) return `entrada${puerto.slice('salida'.length)}`;
  return null;
}

function tramoEn(datos: DatosUnifilar, punta: Punta, sinContar: string): { tramo: TramoUnifilar; otra: Punta } | null {
  for (const t of datos.tramos) {
    if (t.id === sinContar || t.tierra) continue;
    if (t.a.equipo === punta.equipo && t.a.puerto === punta.puerto) return { tramo: t, otra: t.b };
    if (t.b.equipo === punta.equipo && t.b.puerto === punta.puerto) return { tramo: t, otra: t.a };
  }
  return null;
}

// Sigue el cable desde `punta` (a través de fusibles, ITM…) hasta el primer
// equipo que no sea de paso. Regresa ese equipo y el puerto al que llegó.
export function seguirCable(datos: DatosUnifilar, punta: Punta, desdeTramo: string): { equipo: EquipoUnifilar; puerto: string } | null {
  let actual = punta;
  let tramoPrevio = desdeTramo;
  for (let paso = 0; paso < 12; paso++) {
    const e = datos.equipos.find((x) => x.id === actual.equipo);
    if (!e) return null;
    const otroLado = puertoDelOtroLado(e, actual.puerto);
    if (!otroLado) return { equipo: e, puerto: actual.puerto };
    const siguiente = tramoEn(datos, { equipo: e.id, puerto: otroLado }, tramoPrevio);
    if (!siguiente) return null;
    tramoPrevio = siguiente.tramo.id;
    actual = siguiente.otra;
  }
  return null;
}

// ---------- Cálculos ----------

export function datosArreglo(e: EquipoUnifilar) {
  const serie = entero(e.valores.serie, 1, 999);
  const paralelo = entero(e.valores.paralelo, 1, 999);
  const modulos = serie * paralelo;
  const kwp = (modulos * num(e.valores.watts)) / 1000;
  const factor = num(e.valores.factorVoc) || 1;
  const vocMax = serie * num(e.valores.voc) * factor;
  // 690-8(a): 125 % de la Isc.
  const imax = paralelo * num(e.valores.isc) * 1.25;
  const vmp = serie * num(e.valores.vmp);
  return { serie, paralelo, modulos, kwp, vocMax, imax, vmp };
}

export function datosBaterias(e: EquipoUnifilar) {
  const serie = entero(e.valores.serie, 1, 999);
  const paralelo = entero(e.valores.paralelo, 1, 999);
  const voltaje = serie * num(e.valores.voltaje);
  const ah = paralelo * num(e.valores.ah);
  return { serie, paralelo, voltaje, ah, kwh: (voltaje * ah) / 1000 };
}

export function kwpTotal(datos: DatosUnifilar): number {
  return datos.equipos.filter((e) => e.tipo === 'arreglo').reduce((s, e) => s + datosArreglo(e).kwp, 0);
}

function corrienteDeCa(e: EquipoUnifilar): number {
  const voltaje = num(e.valores.voltajeCa);
  if (num(e.valores.imaxCa) > 0) return num(e.valores.imaxCa);
  if (!voltaje) return 0;
  const watts = num(e.valores.potencia) * 1000;
  return e.valores.fases === '3f' ? watts / (Math.sqrt(3) * voltaje) : watts / voltaje;
}

// Voltaje y corriente que lleva un equipo en ese puerto, si los sabe.
function electricoDe(datos: DatosUnifilar, e: EquipoUnifilar, puerto: string): { voltaje: number; corriente: number; circuito: Circuito } | null {
  if (e.tipo === 'arreglo') {
    const a = datosArreglo(e);
    return { voltaje: a.vmp, corriente: a.imax, circuito: 'cd' };
  }
  if (esInversor(e.tipo) && (puerto === 'ca' || puerto === 'respaldo' || puerto === 'gen')) {
    return { voltaje: num(e.valores.voltajeCa), corriente: corrienteDeCa(e), circuito: (e.valores.fases as Circuito) || '2f' };
  }
  if (esInversor(e.tipo) && puerto === 'bat') {
    const v = num(e.valores.vBateria);
    return { voltaje: v, corriente: v ? (num(e.valores.potencia) * 1000) / v : 0, circuito: 'cd' };
  }
  if (e.tipo === 'controlador' && puerto === 'bat') {
    return { voltaje: num(e.valores.vBateria), corriente: num(e.valores.amperes), circuito: 'cd' };
  }
  if (e.tipo === 'generador') {
    const v = num(e.valores.voltajeCa);
    return { voltaje: v, corriente: v ? (num(e.valores.potencia) * 1000) / v : 0, circuito: '1f' };
  }
  if (e.tipo === 'baterias') {
    // La corriente la pone quien la jala: se busca del otro lado del cable.
    return null;
  }
  void datos;
  return null;
}

// Voltaje y corriente de un tramo: lo capturado o lo que dicen los equipos
// de sus dos puntas (siguiendo el cable por fusibles e interruptores).
export function electricoDeTramo(datos: DatosUnifilar, t: TramoUnifilar): { voltaje: number; corriente: number; calculado: boolean } {
  let voltaje = num(t.voltaje);
  let corriente = num(t.corriente);
  const calculado = !(voltaje > 0 && corriente > 0);
  if (calculado) {
    for (const punta of [t.a, t.b]) {
      const fin = seguirCable(datos, punta, t.id);
      if (!fin) continue;
      const el = electricoDe(datos, fin.equipo, fin.puerto);
      if (!el) continue;
      if (!(voltaje > 0)) voltaje = el.voltaje;
      if (!(corriente > 0)) corriente = el.corriente;
      if (voltaje > 0 && corriente > 0) break;
    }
  }
  return { voltaje, corriente, calculado };
}

// Caída de tensión en %: ΔV = k·L·I·R / 1000, k = 2 (CD, 1 y 2 fases) o √3 (3 fases).
export function caidaDeTension(datos: DatosUnifilar, t: TramoUnifilar): number | null {
  if (t.tierra) return null;
  const metros = num(t.metros);
  const principal = t.conductores.find((c) => !/^CPT/i.test(c.funcion));
  const calibre = principal ? datosCalibre(principal.calibre) : null;
  const { voltaje, corriente } = electricoDeTramo(datos, t);
  if (!(metros > 0) || !calibre || !(voltaje > 0) || !(corriente > 0)) return null;
  const k = t.circuito === '3f' ? Math.sqrt(3) : 2;
  const caida = (k * metros * corriente * calibre.ohmKm) / 1000;
  return (caida / voltaje) * 100;
}

export const CAIDA_MAXIMA = 3;

// Nombre de la entrada del inversor a la que llega un arreglo («MPPT1»).
export function mpptDeArreglo(datos: DatosUnifilar, e: EquipoUnifilar): { inversor: EquipoUnifilar; mppt: string } | null {
  const salida = tramoEn(datos, { equipo: e.id, puerto: 'salida' }, '');
  if (!salida) return null;
  const fin = seguirCable(datos, salida.otra, salida.tramo.id);
  if (!fin) return null;
  if (!(esInversor(fin.equipo.tipo) || fin.equipo.tipo === 'controlador')) return null;
  return { inversor: fin.equipo, mppt: fin.puerto.replace('mppt', 'MPPT') };
}

// ---------- Textos del dibujo ----------

// El tramo que sale de un arreglo: su texto va junto con el del arreglo.
export function tramoDeArreglo(datos: DatosUnifilar, e: EquipoUnifilar): TramoUnifilar | null {
  if (e.tipo !== 'arreglo') return null;
  return datos.tramos.find((t) => !t.tierra && ((t.a.equipo === e.id && t.a.puerto === 'salida') || (t.b.equipo === e.id && t.b.puerto === 'salida'))) || null;
}


export function lineasDeEquipo(datos: DatosUnifilar, e: EquipoUnifilar): string[] {
  const v = e.valores;
  const modelo = e.modelo.trim();
  switch (e.tipo) {
    case 'arreglo': {
      const a = datosArreglo(e);
      const destino = mpptDeArreglo(datos, e);
      const mppt = destino && destino.mppt.startsWith('MPPT') ? ` (${destino.mppt})` : '';
      // Como en los planos de CFE, los datos del cable que sale del arreglo
      // van en el mismo bloque de texto que los del arreglo.
      const salida = tramoDeArreglo(datos, e);
      return [
        `P máx${mppt} = ${redondear(a.kwp)} kWp`,
        `Voc máx: ${redondear(a.vocMax)} V`,
        `Imax: ${redondear(a.imax)} A`,
        `${a.serie} módulos de ${redondear(num(v.watts), 0)} W${a.paralelo > 1 ? ` × ${a.paralelo} cadenas` : ''}${modelo ? ` ${modelo}` : ''}`,
        ...(salida && salida.mostrarEtiqueta ? lineasDeTramo(datos, salida) : []),
      ];
    }
    case 'fusibles':
      return [`${e.nombre}${modelo ? ` ${modelo}` : ''} ${v.amperes || '?'} A, ${v.voltaje || '?'} VCD`];
    case 'desconectador':
      return [e.nombre, `${modelo ? `${modelo} ` : ''}${v.amperes || '?'} A, ${v.voltaje || '?'} VCD`];
    case 'inversor_red':
    case 'inversor_hibrido':
    case 'inversor_aislado':
      return [e.nombre, [modelo, num(v.potencia) ? `${v.potencia} kW` : ''].filter(Boolean).join(' · ')].filter(Boolean);
    case 'controlador':
      return [e.nombre, [modelo, num(v.amperes) ? `${v.amperes} A` : ''].filter(Boolean).join(' · ')].filter(Boolean);
    case 'baterias': {
      const b = datosBaterias(e);
      return [e.nombre, modelo, `${b.serie} en serie × ${b.paralelo} · ${redondear(b.voltaje)} V · ${redondear(b.ah)} Ah · ${redondear(b.kwh)} kWh`].filter(Boolean);
    }
    case 'tablero':
      return [e.nombre, `Capacidad en barras: ${v.barras || '?'} A`, `ITM: ${v.polos || '?'} X ${v.amperes || '?'} A`];
    case 'itm':
      return [e.nombre, num(v.amperes) ? `${v.polos || '?'} X ${v.amperes} A` : 'S/E'];
    case 'transformador':
      return [e.nombre, `${num(v.kva) ? v.kva : 'S/E'} kVA`];
    case 'generador':
      return [e.nombre, [modelo, num(v.potencia) ? `${v.potencia} kW` : ''].filter(Boolean).join(' · ')].filter(Boolean);
    case 'dps':
      return [e.nombre, modelo].filter(Boolean);
    case 'tierra':
      return [];
    default:
      return [e.nombre, modelo].filter(Boolean);
  }
}

export function lineasDeTramo(datos: DatosUnifilar, t: TramoUnifilar): string[] {
  const lineas: string[] = [];
  if (t.titulo.trim()) lineas.push(t.titulo.trim());
  for (const c of t.conductores) lineas.push(textoConductor(c));
  if (t.tuberia.trim()) lineas.push(`Tubería: ${t.tuberia.trim()}`);
  if (num(t.metros) > 0) lineas.push(`Longitud: ${redondear(num(t.metros))} m`);
  const caida = caidaDeTension(datos, t);
  if (caida !== null) lineas.push(`Caída de tensión: ${redondear(caida)} %`);
  return lineas;
}

// ---------- Revisión ----------

export type Aviso = { nivel: 'error' | 'aviso'; texto: string; equipo?: string; tramo?: string };

export function revisar(datos: DatosUnifilar): Aviso[] {
  const avisos: Aviso[] = [];

  // Arreglos contra la entrada del inversor o controlador.
  const corrientePorMppt = new Map<string, { inversor: EquipoUnifilar; mppt: string; corriente: number }>();
  for (const e of datos.equipos.filter((x) => x.tipo === 'arreglo')) {
    const a = datosArreglo(e);
    const destino = mpptDeArreglo(datos, e);
    if (!destino) {
      avisos.push({ nivel: 'aviso', texto: `Un arreglo de ${redondear(a.kwp)} kWp no llega a ningún inversor ni controlador.`, equipo: e.id });
      continue;
    }
    const vmax = num(destino.inversor.valores.vmaxCd);
    if (vmax > 0 && a.vocMax > vmax) {
      avisos.push({ nivel: 'error', texto: `El Voc máx del arreglo (${redondear(a.vocMax)} V) pasa del máximo de ${destino.inversor.nombre} (${vmax} V). Quita módulos de la cadena.`, equipo: e.id });
    }
    const clave = `${destino.inversor.id}|${destino.mppt}`;
    const previo = corrientePorMppt.get(clave);
    corrientePorMppt.set(clave, { inversor: destino.inversor, mppt: destino.mppt, corriente: (previo?.corriente || 0) + a.imax / 1.25 });
  }
  for (const { inversor, mppt, corriente } of corrientePorMppt.values()) {
    const imax = num(inversor.valores.imaxMppt);
    if (esInversor(inversor.tipo) && imax > 0 && corriente > imax) {
      avisos.push({ nivel: 'aviso', texto: `${mppt} de ${inversor.nombre} recibe ${redondear(corriente)} A de Isc y admite ${imax} A.`, equipo: inversor.id });
    }
  }

  for (const t of datos.tramos.filter((x) => !x.tierra)) {
    const nombre = t.titulo.trim() || nombreDeTramo(datos, t);
    const caida = caidaDeTension(datos, t);
    if (caida !== null && caida > CAIDA_MAXIMA) {
      avisos.push({ nivel: 'error', texto: `${nombre}: la caída de tensión es de ${redondear(caida)} % (máximo ${CAIDA_MAXIMA} %). Sube el calibre o acorta el tramo.`, tramo: t.id });
    } else if (!(num(t.metros) > 0) && t.mostrarEtiqueta) {
      // Los tramos sin texto en el plano (uniones cortas dentro del tablero) no piden longitud.
      avisos.push({ nivel: 'aviso', texto: `${nombre}: falta la longitud.`, tramo: t.id });
    }
  }

  for (const e of datos.equipos) {
    const conectado = datos.tramos.some((t) => t.a.equipo === e.id || t.b.equipo === e.id);
    if (!conectado) avisos.push({ nivel: 'aviso', texto: `${e.nombre || definicion(e.tipo).nombre} no está conectado a nada.`, equipo: e.id });
  }
  return avisos;
}

export function nombreDeTramo(datos: DatosUnifilar, t: TramoUnifilar): string {
  const nombre = (p: Punta) => datos.equipos.find((e) => e.id === p.equipo)?.nombre || 'Equipo';
  return `${nombre(t.a)} → ${nombre(t.b)}`;
}

// ---------- Crear ----------

export function nuevoEquipo(tipo: TipoEquipo, x: number, y: number, nuevoId: () => string): EquipoUnifilar {
  const d = definicion(tipo);
  return { id: nuevoId(), tipo, x, y, nombre: d.nombre, modelo: '', valores: { ...d.valores }, etiqueta: { dx: 0, dy: 0 } };
}

export function nuevoTramo(datos: DatosUnifilar, a: Punta, b: Punta, nuevoId: () => string): TramoUnifilar {
  const ea = datos.equipos.find((e) => e.id === a.equipo);
  const eb = datos.equipos.find((e) => e.id === b.equipo);
  const tierra = !!(ea && puertoDe(ea, a.puerto)?.tierra) || !!(eb && puertoDe(eb, b.puerto)?.tierra);
  const base: TramoUnifilar = {
    id: nuevoId(), a, b, tierra, circuito: 'cd', titulo: '', conductores: [], tuberia: tierra ? '' : 'Conduit IMC 21 mm (3/4")',
    metros: '', voltaje: '', corriente: '', mostrarEtiqueta: !tierra, etiqueta: { dx: 0, dy: 0 }, codo: null,
  };
  if (!tierra) {
    // El tipo de circuito lo dicen los equipos de las puntas (CD de paneles, CA del inversor…).
    const conTramo = { ...datos, tramos: [...datos.tramos, base] };
    for (const punta of [a, b]) {
      const fin = seguirCable(conTramo, punta, base.id);
      const el = fin ? electricoDe(conTramo, fin.equipo, fin.puerto) : null;
      if (el) { base.circuito = el.circuito; break; }
      if (fin && ['medidor', 'transformador', 'cfe', 'cargas'].includes(fin.equipo.tipo)) base.circuito = '2f';
    }
  }
  base.conductores = conductoresPorOmision(base.circuito, tierra);
  return base;
}

export function proyectoVacio(): ProyectoUnifilar {
  return {
    titulo: '', nombre: '', descripcion: '', direccion: '', lat: '', lng: '', diseno: '', fecha: '',
    escala: 'S/E', clave: '', hoja: '1', tamano: 'carta',
  };
}

export const NOTAS_POR_OMISION = [
  'No se muestran las conexiones detalladas del sistema de puesta a tierra y unión. El sistema de puesta a tierra y unión del SFV se debe conectar al sistema de puesta a tierra y unión de la instalación existente.',
  'Los Voc e Isc especificados corresponden a los valores máximos según 690-7(a) y 690-8(a) respectivamente.',
];

export function tituloPorOmision(tipo: TipoSistema): string {
  if (tipo === 'aislado') return 'DIAGRAMA UNIFILAR DEL SISTEMA FOTOVOLTAICO AISLADO CON BANCO DE BATERÍAS';
  if (tipo === 'hibrido') return 'DIAGRAMA UNIFILAR DEL SISTEMA FOTOVOLTAICO HÍBRIDO INTERCONECTADO A LA RED ELÉCTRICA DE CFE';
  return 'DIAGRAMA UNIFILAR DEL SISTEMA FOTOVOLTAICO INTERCONECTADO A LA RED ELÉCTRICA DE CFE';
}

export function descripcionPorOmision(tipo: TipoSistema): string {
  if (tipo === 'aislado') return 'SISTEMA FOTOVOLTAICO AISLADO CON BANCO DE BATERÍAS';
  if (tipo === 'hibrido') return 'SISTEMA FOTOVOLTAICO HÍBRIDO INTERCONECTADO A LA RED ELÉCTRICA DE CFE';
  return 'SISTEMA FOTOVOLTAICO INTERCONECTADO A LA RED ELÉCTRICA DE CFE';
}

// Equipos de ejemplo para empezar, ya conectados como en un plano de CFE.
export function plantilla(tipo: TipoSistema, nuevoId: () => string): DatosUnifilar {
  const datos: DatosUnifilar = { proyecto: proyectoVacio(), notas: [...NOTAS_POR_OMISION], equipos: [], tramos: [] };
  const poner = (t: TipoEquipo, x: number, y: number, cambios: Partial<EquipoUnifilar> = {}) => {
    const e = { ...nuevoEquipo(t, x, y, nuevoId), ...cambios };
    if (cambios.valores) e.valores = { ...definicion(t).valores, ...cambios.valores };
    datos.equipos.push(e);
    return e;
  };
  const unir = (a: EquipoUnifilar, pa: string, b: EquipoUnifilar, pb: string, cambios: Partial<TramoUnifilar> = {}) => {
    const t = { ...nuevoTramo(datos, { equipo: a.id, puerto: pa }, { equipo: b.id, puerto: pb }, nuevoId), ...cambios };
    datos.tramos.push(t);
    return t;
  };

  // El texto del arreglo va arriba de él: se dejan 130 de alto para el texto.
  const arreglo1 = poner('arreglo', 0, 130);
  const arreglo2 = poner('arreglo', 0, 310, { valores: { serie: '8' } });

  if (tipo === 'interconectado') {
    const fusibles = poner('fusibles', 270, 200);
    const inversor = poner('inversor_red', 400, 190);
    const tablero = poner('tablero', 700, 207);
    const principal = poner('itm', 880, 210, { nombre: 'ITM Principal' });
    const medidor = poner('medidor', 720, 420);
    const trafo = poner('transformador', 540, 425, { nombre: 'Transformador tipo poste' });
    const cfe = poner('cfe', 380, 422);
    const tierra = poner('tierra', 870, 470);
    unir(arreglo1, 'salida', fusibles, 'entrada1', { metros: '50' });
    unir(arreglo2, 'salida', fusibles, 'entrada2', { metros: '50' });
    unir(fusibles, 'salida1', inversor, 'mppt2', { mostrarEtiqueta: false });
    unir(fusibles, 'salida2', inversor, 'mppt1', { mostrarEtiqueta: false });
    unir(inversor, 'ca', tablero, 'entrada', { titulo: 'Circuito de salida inversor', metros: '20' });
    unir(tablero, 'salida', principal, 'entrada', { mostrarEtiqueta: false });
    const alimentador = unir(principal, 'salida', medidor, 'salida', { titulo: 'Alimentador principal', metros: '10' });
    alimentador.conductores = conductoresPorOmision('2f', false);
    alimentador.conductores.splice(2, 0, { funcion: 'Neutro', calibre: '6', color: 'Blanco', aislamiento: 'THW' });
    for (const c of alimentador.conductores) if (!/^CPT/.test(c.funcion)) c.calibre = '6';
    unir(cfe, 'salida', trafo, 'entrada', { mostrarEtiqueta: false });
    unir(trafo, 'salida', medidor, 'entrada', { mostrarEtiqueta: false });
    unir(medidor, 'tierra', tierra, 'conexion');
    return datos;
  }

  const tipoInversor: TipoEquipo = tipo === 'hibrido' ? 'inversor_hibrido' : 'inversor_aislado';
  const fusibles = poner('fusibles', 270, 200);
  const inversor = poner(tipoInversor, 400, 190, { valores: { mppts: '2' } });
  const baterias = poner('baterias', 0, 470);
  const protBat = poner('desconectador', 120, 430, { nombre: 'Protección de baterías', valores: { amperes: '125', voltaje: '60' } });
  unir(arreglo1, 'salida', fusibles, 'entrada1', { metros: '30' });
  unir(arreglo2, 'salida', fusibles, 'entrada2', { metros: '30' });
  unir(fusibles, 'salida1', inversor, 'mppt2', { mostrarEtiqueta: false });
  unir(fusibles, 'salida2', inversor, 'mppt1', { mostrarEtiqueta: false });
  unir(baterias, 'salida', protBat, 'entrada', { mostrarEtiqueta: false });
  const circuitoBaterias = unir(protBat, 'salida', inversor, 'bat', { titulo: 'Circuito de baterías', metros: '3' });
  // Las baterías llevan mucha corriente a poco voltaje: cable grueso.
  for (const c of circuitoBaterias.conductores) c.calibre = /^CPT/.test(c.funcion) ? '6' : '2/0';
  if (tipo === 'aislado') {
    const cargas = poner('tablero', 700, 207, { nombre: 'Centro de carga' });
    unir(inversor, 'ca', cargas, 'entrada', { titulo: 'Circuito de salida inversor', metros: '10' });
    return datos;
  }
  const respaldo = poner('tablero', 660, 400, { nombre: 'Centro de carga (respaldo)' });
  unir(inversor, 'respaldo', respaldo, 'entrada', { titulo: 'Circuito de respaldo', metros: '10' });
  const medidor = poner('medidor', 700, 205);
  const trafo = poner('transformador', 880, 201, { nombre: 'Transformador tipo poste' });
  const cfe = poner('cfe', 1010, 198);
  unir(inversor, 'ca', medidor, 'entrada', { titulo: 'Circuito de interconexión', metros: '10' });
  unir(medidor, 'salida', trafo, 'entrada', { mostrarEtiqueta: false });
  unir(trafo, 'salida', cfe, 'salida', { mostrarEtiqueta: false });
  return datos;
}

export function datosVacios(): DatosUnifilar {
  return { proyecto: proyectoVacio(), notas: [...NOTAS_POR_OMISION], equipos: [], tramos: [] };
}

// ---------- Validación ----------

const texto = (max: number) => z.string().max(max, `Máximo ${max} letras`);
const id = z.string().min(1).max(60);
const punta = z.object({ equipo: id, puerto: z.string().min(1).max(30) });
const desplazamiento = z.object({ dx: z.number().finite(), dy: z.number().finite() });
const TIPOS = CATALOGO.map((d) => d.tipo) as [TipoEquipo, ...TipoEquipo[]];

export const datosUnifilarSchema = z.object({
  proyecto: z.object({
    titulo: texto(200), nombre: texto(120), descripcion: texto(300), direccion: texto(300),
    lat: texto(30), lng: texto(30), diseno: texto(120), fecha: texto(40), escala: texto(30),
    clave: texto(60), hoja: texto(20), tamano: z.enum(['carta', 'tabloide']),
  }),
  notas: z.array(texto(600)).max(12),
  equipos: z.array(z.object({
    id, tipo: z.enum(TIPOS), x: z.number().finite(), y: z.number().finite(),
    nombre: texto(80), modelo: texto(80),
    valores: z.record(z.string().max(30), texto(40)),
    etiqueta: desplazamiento,
  })).max(300),
  tramos: z.array(z.object({
    id, a: punta, b: punta, tierra: z.boolean(), circuito: z.enum(['cd', '1f', '2f', '3f']),
    titulo: texto(80),
    conductores: z.array(z.object({ funcion: texto(30), calibre: texto(10), color: texto(20), aislamiento: texto(20) })).max(10),
    tuberia: texto(80), metros: texto(12), voltaje: texto(12), corriente: texto(12),
    mostrarEtiqueta: z.boolean(), etiqueta: desplazamiento, codo: z.number().finite().nullable(),
  })).max(600),
});

// Lo que llega de la base, completado para que las pantallas no truenen con
// datos viejos o a medias.
export function leerDatos(valor: unknown): DatosUnifilar {
  const v = (valor && typeof valor === 'object' ? valor : {}) as Partial<DatosUnifilar>;
  return {
    proyecto: { ...proyectoVacio(), ...(v.proyecto || {}) },
    notas: Array.isArray(v.notas) ? v.notas : [...NOTAS_POR_OMISION],
    equipos: Array.isArray(v.equipos) ? v.equipos.map((e) => ({ ...e, valores: { ...(e.valores || {}) }, etiqueta: e.etiqueta || { dx: 0, dy: 0 } })) : [],
    tramos: Array.isArray(v.tramos) ? v.tramos.map((t) => ({ ...t, etiqueta: t.etiqueta || { dx: 0, dy: 0 }, codo: t.codo ?? null })) : [],
  };
}
