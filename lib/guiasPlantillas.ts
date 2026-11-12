// Plantillas de guías que ya vienen con la app (las que arme el ingeniero se
// guardan en la base con «es plantilla»). Se copian al crear una guía: lo que
// se cambie en la copia no altera la plantilla.

import type { DatosGuia } from './guias';

export type PlantillaBase = { id: string; nombre: string; sistema: string; descripcion: string; datos: DatosGuia };

// Terminal de reconocimiento facial Hikvision DS-K1T342, según la figura 4-1
// «Device Wiring» de su manual: los colores son los de la coleta del equipo.
const TERMINAL_DS_K1T342: PlantillaBase = {
  id: 'base-ds-k1t342',
  nombre: 'Terminal facial DS-K1T342 con chapa, botón y contacto',
  sistema: 'Control de acceso',
  descripcion: 'Una puerta: terminal Hikvision DS-K1T342, electroimán, botón de salida y contacto magnético. Colores de la coleta según el manual (figura 4-1). Revisa los rangos de las pruebas contra la fuente que instales.',
  datos: {
    equipos: [
      {
        id: 'terminal', nombre: 'Terminal', modelo: 'Hikvision DS-K1T342', nota: 'Los cables salen en 4 grupos (A, B, C y D).',
        bornes: [
          { id: 'a1', nombre: 'A1 · 12 VDC' }, { id: 'a2', nombre: 'A2 · GND' },
          { id: 'b1', nombre: 'B1 · 485+' }, { id: 'b2', nombre: 'B2 · 485−' }, { id: 'b3', nombre: 'B3 · GND' },
          { id: 'c1', nombre: 'C1 · W0' }, { id: 'c2', nombre: 'C2 · W1' }, { id: 'c3', nombre: 'C3 · GND' },
          { id: 'd1', nombre: 'D1 · NC' }, { id: 'd2', nombre: 'D2 · COM' }, { id: 'd3', nombre: 'D3 · NO' },
          { id: 'd4', nombre: 'D4 · SEN' }, { id: 'd5', nombre: 'D5 · GND' }, { id: 'd6', nombre: 'D6 · BTN' },
        ],
      },
      { id: 'fuente', nombre: 'Fuente 12 VDC', bornes: [{ id: 'pos', nombre: '+12 V' }, { id: 'neg', nombre: 'GND (−)' }] },
      { id: 'chapa', nombre: 'Electroimán', nota: 'Abre al quitarle corriente: va por el contacto NC.', bornes: [{ id: 'pos', nombre: '+' }, { id: 'neg', nombre: '−' }] },
      { id: 'contacto', nombre: 'Contacto de puerta', bornes: [{ id: 'com', nombre: 'COM' }, { id: 'nc', nombre: 'NC' }] },
      { id: 'boton', nombre: 'Botón de salida', bornes: [{ id: 'com', nombre: 'COM' }, { id: 'no', nombre: 'NO' }] },
    ],
    conexiones: [
      { id: 'c-alim-pos', de: { equipo: 'terminal', borne: 'a1' }, a: { equipo: 'fuente', borne: 'pos' }, color: 'rojo', nota: 'Alimentación de la terminal.' },
      { id: 'c-alim-neg', de: { equipo: 'terminal', borne: 'a2' }, a: { equipo: 'fuente', borne: 'neg' }, color: 'negro' },
      { id: 'c-chapa-com', de: { equipo: 'terminal', borne: 'd2' }, a: { equipo: 'fuente', borne: 'pos' }, color: 'blanco/amarillo', nota: 'El positivo de la fuente entra al relevador por COM.' },
      { id: 'c-chapa-nc', de: { equipo: 'terminal', borne: 'd1' }, a: { equipo: 'chapa', borne: 'pos' }, color: 'blanco/morado', nota: 'Sale por NC hacia el positivo del electroimán.' },
      { id: 'c-chapa-neg', de: { equipo: 'chapa', borne: 'neg' }, a: { equipo: 'fuente', borne: 'neg' }, color: 'negro' },
      { id: 'c-contacto-sen', de: { equipo: 'terminal', borne: 'd4' }, a: { equipo: 'contacto', borne: 'nc' }, color: 'amarillo/verde' },
      { id: 'c-contacto-gnd', de: { equipo: 'terminal', borne: 'd5' }, a: { equipo: 'contacto', borne: 'com' }, color: 'negro' },
      { id: 'c-boton-btn', de: { equipo: 'terminal', borne: 'd6' }, a: { equipo: 'boton', borne: 'no' }, color: 'amarillo/gris' },
      { id: 'c-boton-gnd', de: { equipo: 'terminal', borne: 'd5' }, a: { equipo: 'boton', borne: 'com' }, color: 'negro', nota: 'Comparte el GND (D5) con el contacto de puerta.' },
    ],
    pruebas: [
      { id: 'p-alim', texto: 'Voltaje de alimentación en la terminal (A1 y A2)', unidad: 'V', min: 11, max: 13 },
      { id: 'p-chapa', texto: 'Voltaje en el electroimán con la puerta cerrada', unidad: 'V', min: 11, max: 13 },
    ],
    notas: [
      'Conecta todo sin energía y energiza hasta el final.',
      'No conectes el equipo directo a la corriente eléctrica: siempre a través de la fuente (manual).',
      'Wiegand (C1, C2, C3): si le conectas una lectora de tarjetas, configura el Wiegand como ENTRADA; si la terminal va a una controladora, como SALIDA (manual).',
      'Con contrachapa eléctrica (abre al darle corriente) se usa NO (D3) en lugar de NC (D1).',
    ],
    fotos: [],
  },
};

export const PLANTILLAS_BASE: PlantillaBase[] = [TERMINAL_DS_K1T342];
