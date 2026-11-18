// Guía de conexión de un sistema solar AISLADO (inversor/cargador con
// batería, sin CFE) armada a partir de los renglones de la cotización:
// equipos con sus bornes, conexiones con calibre y protección, mediciones
// con su rango, el orden de armado y encendido, y los avisos de lo que falta
// cotizar. El ingeniero la revisa y la aprueba antes de que la vean los
// técnicos (patch_guias_aprobacion.sql). Se prueba en lib/guiaSolar.test.ts.

import type { ConexionGuia, DatosGuia, EquipoGuia, PruebaGuia } from './guias';

export type LineaSolar = { descripcion: string; cantidad?: number | null; enlace?: string | null };

// ---------- Leer la cotización ----------

// Primer número que sigue el patrón, con punto decimal: «53.7 Vcc» → 53.7.
function numero(texto: string, patron: RegExp): number | null {
  const m = texto.match(patron);
  if (!m) return null;
  const valor = Number(m[1].replace(',', '.'));
  return Number.isFinite(valor) ? valor : null;
}

const esModulo = (d: string) => /m[oó]dulo\s+solar|panel(es)?\s+solar/i.test(d);
const esInversor = (d: string) => /inversor/i.test(d);
const esBateria = (d: string) => /bater[ií]a/i.test(d) && !/cable|fusible|interruptor/i.test(d);
const esProteccionCD = (d: string) => /(interruptor|protecci[oó]n|breaker|pastilla)/i.test(d) && /(corriente directa|\bv\s?c[cd]\b|\bvdc\b|fotovolt)/i.test(d);
const esPastillaCA = (d: string) => /(pastilla|termomagn|interruptor)/i.test(d) && !esProteccionCD(d);
const esProteccionBateria = (d: string) => /(fusible|interruptor|breaker)/i.test(d) && /bater[ií]a/i.test(d);
const esTierra = (d: string) => /tierra|varilla|copperweld/i.test(d);
const esCableBateria = (d: string) => /cable/i.test(d) && (/bater[ií]a/i.test(d) || /\b[1-4]\s*AWG|\b\d\/0\b/i.test(d));

export type ResumenSolar = {
  modulos: number;
  wattsModulo: number | null;
  // El voltaje del módulo como lo dice la cotización (normalmente el de circuito abierto).
  voltsModulo: number | null;
  kwInversor: number | null;
  voltsBateria: number;
  kwhBateria: number | null;
  ampsProteccionCD: number | null;
  polosProteccionCD: number | null;
  pastillas: number;
  ampsPastilla: number | null;
  calibreFV: string | null;
  hayProteccionBateria: boolean;
  hayTierra: boolean;
  hayCableBateria: boolean;
  enlaces: { inversor: string | null; bateria: string | null; modulo: string | null };
};

// ¿Los renglones son de un sistema aislado? Hace falta inversor y batería.
export function esSistemaSolarAislado(lineas: LineaSolar[]): boolean {
  return lineas.some((l) => esInversor(l.descripcion)) && lineas.some((l) => esBateria(l.descripcion));
}

export function resumenSolar(lineas: LineaSolar[]): ResumenSolar {
  const buscar = (prueba: (d: string) => boolean) => lineas.find((l) => prueba(l.descripcion)) || null;
  const modulo = buscar(esModulo);
  const inversor = buscar(esInversor);
  const bateria = buscar(esBateria);
  const proteccionCD = buscar(esProteccionCD);
  const pastillas = lineas.filter((l) => esPastillaCA(l.descripcion));
  const cableFV = buscar((d) => /cable/i.test(d) && /fotovolt|solar|\bFV\b|\bPV\b/i.test(d));

  // «(6 Unidades)» o la cantidad del renglón.
  const unidadesModulo = modulo ? numero(modulo.descripcion, /\((\d+)\s*unidades?\)/i) : null;
  const voltsInversorBateria = inversor ? numero(inversor.descripcion, /(\d+)\s*V\s?c[cd]/i) : null;
  const voltsBateria = bateria ? numero(bateria.descripcion, /(\d+)\s*V\s?c[cd]/i) : null;

  return {
    modulos: modulo ? Math.max(1, Math.round(modulo.cantidad || unidadesModulo || 1)) : 0,
    wattsModulo: modulo ? numero(modulo.descripcion, /(\d+)\s*W\b/i) : null,
    voltsModulo: modulo ? numero(modulo.descripcion, /(\d+(?:[.,]\d+)?)\s*V\s?c[cd]/i) : null,
    kwInversor: inversor ? numero(inversor.descripcion, /(\d+(?:[.,]\d+)?)\s*kW/i) : null,
    voltsBateria: voltsBateria || voltsInversorBateria || 48,
    kwhBateria: bateria ? numero(bateria.descripcion, /(\d+(?:[.,]\d+)?)\s*kWh/i) : null,
    ampsProteccionCD: proteccionCD ? numero(proteccionCD.descripcion, /(\d+)\s*A(mp)?\b/i) : null,
    polosProteccionCD: proteccionCD ? numero(proteccionCD.descripcion, /(\d)\s*P(olos?)?\b/i) : null,
    pastillas: pastillas.reduce((suma, l) => suma + Math.max(1, Math.round(l.cantidad || 1)), 0),
    ampsPastilla: pastillas[0] ? numero(pastillas[0].descripcion, /(\d+)\s*A(mp)?\b/i) : null,
    calibreFV: cableFV ? (cableFV.descripcion.match(/(\d+)\s*AWG/i)?.[1] ?? null) : null,
    hayProteccionBateria: lineas.some((l) => esProteccionBateria(l.descripcion)),
    hayTierra: lineas.some((l) => esTierra(l.descripcion)),
    hayCableBateria: lineas.some((l) => esCableBateria(l.descripcion)),
    enlaces: { inversor: inversor?.enlace || null, bateria: bateria?.enlace || null, modulo: modulo?.enlace || null },
  };
}

// ---------- Lo que falta o hay que revisar ----------

export function avisosSolar(r: ResumenSolar): string[] {
  const avisos: string[] = [];
  if (!r.hayProteccionBateria) avisos.push('No viene protección (interruptor o fusible de CD) entre la batería y el inversor. Revisa si la batería la trae; si no, hay que cotizarla.');
  if (!r.hayCableBateria) avisos.push('No viene el cable de la batería al inversor (más grueso que el de los paneles). Revisa si la batería lo incluye.');
  if (!r.hayTierra) avisos.push('No viene la tierra física (varilla y cable) para estructura, gabinete e inversor (NOM-001, art. 690).');
  if (r.ampsPastilla !== null && r.ampsPastilla > 20) avisos.push(`Las pastillas son de ${r.ampsPastilla} A: solo si los circuitos van en cable 10 AWG o más grueso. Con 12 AWG van de 20 A y con 14 AWG de 15 A.`);
  if (r.voltsModulo !== null && r.modulos > 0) {
    avisos.push(`Con ${r.modulos} módulos en serie el arreglo da unos ${Math.round(r.modulos * r.voltsModulo)} V (más con frío). Confirma en la ficha del inversor el voltaje FV máximo y su rango MPPT, y si van en serie o en dos cadenas.`);
  }
  return avisos;
}

// ---------- La guía ----------

function borne(id: string, nombre: string) {
  return { id, nombre };
}

function conexion(id: string, de: [string, string], a: [string, string], color: string, calibre: string | null, nota?: string): ConexionGuia {
  return { id, de: { equipo: de[0], borne: de[1] }, a: { equipo: a[0], borne: a[1] }, color, calibre, ...(nota ? { nota } : {}) };
}

export function datosSolarAislado(lineas: LineaSolar[]): DatosGuia {
  const r = resumenSolar(lineas);
  const calibreFV = r.calibreFV ? `${r.calibreFV} AWG FV` : 'FV';
  const nombreArreglo = r.modulos > 0 ? `Paneles (${r.modulos}${r.wattsModulo ? ` × ${r.wattsModulo} W` : ''})` : 'Paneles solares';
  const nombreProteccionCD = `Interruptor CD${r.polosProteccionCD ? ` ${r.polosProteccionCD}P` : ''}${r.ampsProteccionCD ? ` ${r.ampsProteccionCD} A` : ''}`;
  const nombreCentro = `Centro de carga${r.pastillas ? ` (${r.pastillas} × ${r.ampsPastilla ?? '?'} A)` : ''}`;

  const equipos: EquipoGuia[] = [
    {
      id: 'inversor', nombre: `Inversor${r.kwInversor ? ` ${r.kwInversor} kW` : ''} ${r.voltsBateria} V`, enlace: r.enlaces.inversor,
      nota: 'Va al centro: le llegan los paneles, la batería y sale la corriente para la casa.',
      bornes: [
        borne('pv_pos', 'PV +'), borne('pv_neg', 'PV −'),
        borne('bat_pos', 'BAT +'), borne('bat_neg', 'BAT −'),
        borne('bms', 'BMS (CAN/RS485)'),
        borne('out_l', 'AC OUT L'), borne('out_n', 'AC OUT N'),
        borne('tierra', 'Tierra ⏚'),
      ],
    },
    {
      id: 'paneles', nombre: nombreArreglo, enlace: r.enlaces.modulo,
      nota: r.modulos > 1 ? `En serie: el + de un módulo al − del siguiente. Quedan libres el + del primero y el − del último.` : null,
      bornes: [borne('pos', '+ (primer módulo)'), borne('neg', '− (último módulo)'), borne('marcos', 'Marcos y estructura')],
    },
    {
      id: 'proteccion_cd', nombre: nombreProteccionCD, nota: 'En el gabinete exterior. Ábrelo antes de tocar los cables de los paneles.',
      bornes: [borne('ent_pos', 'Entrada +'), borne('ent_neg', 'Entrada −'), borne('sal_pos', 'Salida +'), borne('sal_neg', 'Salida −')],
    },
    {
      id: 'proteccion_bat', nombre: 'Protección de batería', nota: r.hayProteccionBateria ? null : 'No viene en la cotización: el ingeniero define si la trae la batería o se compra.',
      bornes: [borne('entrada', 'Entrada (de batería +)'), borne('salida', 'Salida (a inversor +)')],
    },
    {
      id: 'bateria', nombre: `Batería ${r.voltsBateria} V${r.kwhBateria ? ` ${r.kwhBateria} kWh` : ''}`, enlace: r.enlaces.bateria,
      bornes: [borne('pos', '+'), borne('neg', '−'), borne('bms', 'BMS (CAN/RS485)')],
    },
    {
      id: 'centro', nombre: nombreCentro,
      bornes: [borne('ent_l', 'Entrada L'), borne('ent_n', 'Entrada N (barra)'), borne('tierra', 'Barra de tierra')],
    },
    { id: 'tierra', nombre: 'Tierra física (varilla)', bornes: [borne('varilla', 'Varilla / conector')] },
  ];

  const conexiones: ConexionGuia[] = [
    conexion('c-fv-pos', ['paneles', 'pos'], ['proteccion_cd', 'ent_pos'], 'rojo', calibreFV, 'Con el interruptor ABIERTO. Mide antes el voltaje del arreglo (prueba 1).'),
    conexion('c-fv-neg', ['paneles', 'neg'], ['proteccion_cd', 'ent_neg'], 'negro', calibreFV),
    conexion('c-cd-pos', ['proteccion_cd', 'sal_pos'], ['inversor', 'pv_pos'], 'rojo', calibreFV),
    conexion('c-cd-neg', ['proteccion_cd', 'sal_neg'], ['inversor', 'pv_neg'], 'negro', calibreFV),
    conexion('c-bat-prot', ['bateria', 'pos'], ['proteccion_bat', 'entrada'], 'rojo', null, 'Cable de batería: calibre según la ficha (no el de los paneles).'),
    conexion('c-prot-inv', ['proteccion_bat', 'salida'], ['inversor', 'bat_pos'], 'rojo', null),
    conexion('c-bat-neg', ['bateria', 'neg'], ['inversor', 'bat_neg'], 'negro', null, 'Revisa la polaridad dos veces: al revés daña el inversor.'),
    conexion('c-bms', ['bateria', 'bms'], ['inversor', 'bms'], 'azul', 'datos', 'Cable de comunicación; configura en el inversor el protocolo de la batería.'),
    conexion('c-ca-l', ['inversor', 'out_l'], ['centro', 'ent_l'], 'negro', null),
    conexion('c-ca-n', ['inversor', 'out_n'], ['centro', 'ent_n'], 'blanco', null),
    conexion('c-t-inv', ['inversor', 'tierra'], ['tierra', 'varilla'], 'verde', null),
    conexion('c-t-paneles', ['paneles', 'marcos'], ['tierra', 'varilla'], 'verde', null, 'Todos los marcos y la estructura, unidos.'),
    conexion('c-t-centro', ['centro', 'tierra'], ['tierra', 'varilla'], 'verde', null),
  ];

  const pruebas: PruebaGuia[] = [];
  if (r.voltsModulo !== null && r.modulos > 0) {
    // Con sol el voltaje baja con el calor y sube con el frío.
    const nominal = r.modulos * r.voltsModulo;
    pruebas.push({ id: 'p-voc', texto: 'Voltaje del arreglo en circuito abierto, con el interruptor CD abierto (+ en el rojo)', unidad: 'V', min: Math.round(nominal * 0.8), max: Math.round(nominal * 1.1) });
  } else {
    pruebas.push({ id: 'p-voc', texto: 'Voltaje del arreglo en circuito abierto, con el interruptor CD abierto (+ en el rojo)', unidad: 'V', min: null, max: null });
  }
  const vb = r.voltsBateria;
  pruebas.push(
    { id: 'p-bat', texto: 'Voltaje de la batería antes de conectarla al inversor (+ en el rojo)', unidad: 'V', min: Math.round(vb * 0.92), max: Math.round(vb * 1.17) },
    { id: 'p-ca', texto: 'Voltaje de salida en el centro de carga, entre L y N', unidad: 'V', min: 114, max: 126 },
    { id: 'p-nt', texto: 'Voltaje entre neutro y tierra en el centro de carga', unidad: 'V', min: null, max: 2 },
    { id: 'p-tierra', texto: 'Resistencia de la tierra física', unidad: 'Ω', min: null, max: 25 },
  );

  const notas: string[] = [
    'ARMADO, todo sin energía: 1) estructura y módulos, 2) tierra física, 3) gabinete con el interruptor CD, 4) inversor, 5) batería, 6) centro de carga.',
    'Los paneles dan voltaje con solo recibir luz. Trabaja con el interruptor CD abierto y nunca desconectes cables de los paneles con carga: la corriente directa hace arco.',
    'ENCENDIDO: 1) protección de la batería, 2) inversor, 3) interruptor CD de los paneles, 4) pastillas de las cargas. APAGADO: al revés.',
    'Antes de cargar, configura en el inversor el tipo de batería (litio), su voltaje y la comunicación BMS con la batería.',
    'La salida de 120 V es la de la prueba 3; si el inversor se configura a 220 V, el ingeniero ajusta el rango.',
    ...avisosSolar(r).map((aviso) => `REVISAR (ingeniero): ${aviso}`),
  ];

  return { equipos, conexiones, pruebas, notas: notas.map((n) => (n.length > 300 ? `${n.slice(0, 299)}…` : n)), fotos: [] };
}
