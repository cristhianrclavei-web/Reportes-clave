import { describe, expect, it } from 'vitest';
import { conexionesRotas, datosGuiaSchema, equipoPrincipal } from './guias';
import { avisosSolar, datosSolarAislado, esSistemaSolarAislado, resumenSolar, type LineaSolar } from './guiaSolar';

// Los renglones de la COT-0032 (sistema tipo isla de Octavio Ávila).
const COT_0032: LineaSolar[] = [
  { descripcion: 'Modulo Solar, 645 W BIFACIAL, 53.7 Vcc (6 Unidades)', cantidad: 6 },
  { descripcion: 'Inversor / Cargador de 5 KW para Sistemas Tipo Isla 48Vcd /220Vca de Entrada, 120 o 220Vca de Salida, Onda Sinusoidal Pura con Controlador MPPT (1 Unidad)', cantidad: 1 },
  { descripcion: 'Sistema de Montaje Solar para 6 Módulos / Inclinación 10° / Para Módulo 645 W', cantidad: 1 },
  { descripcion: 'Cable Fotovoltaico Negro / 6mm² (10AWG) / Material COBRE / 2000V (40 Metros)', cantidad: 40 },
  { descripcion: 'Caja de distribución para empotrar, IP40, 04 módulos (1 Pieza)', cantidad: 1 },
  { descripcion: 'Gabinete Plástico para Exterior IP66 para Riel Din (1 Pieza)', cantidad: 1 },
  { descripcion: 'Pastilla para Riel Din, 1 Polo, 32 Amp, Vca:110/415v, 6kA (4 Unidades)', cantidad: 4 },
  { descripcion: 'Protección Térmica/ Interruptor 2P, 40 A, Corriente Directa 800 Vcc para Aplicación Fotovoltaica Montaje Riel DIN (1 Unidad)', cantidad: 1 },
  { descripcion: 'Batería de Litio / 48 Vcc / 104 Ah / 4.8 kWh (1 paquete)', cantidad: 1 },
  { descripcion: 'Instalación, cableado, conexión, programación y puesta en funcionamiento de equipos.', cantidad: 1 },
];

describe('guía de sistema solar aislado', () => {
  it('reconoce un sistema aislado (inversor + batería)', () => {
    expect(esSistemaSolarAislado(COT_0032)).toBe(true);
    expect(esSistemaSolarAislado(COT_0032.filter((l) => !/bater/i.test(l.descripcion)))).toBe(false);
  });

  it('lee los datos de la cotización', () => {
    const r = resumenSolar(COT_0032);
    expect(r).toMatchObject({
      modulos: 6, wattsModulo: 645, voltsModulo: 53.7, kwInversor: 5, voltsBateria: 48, kwhBateria: 4.8,
      ampsProteccionCD: 40, polosProteccionCD: 2, pastillas: 4, ampsPastilla: 32, calibreFV: '10',
      hayProteccionBateria: false, hayTierra: false, hayCableBateria: false,
    });
  });

  it('avisa lo que falta cotizar', () => {
    const avisos = avisosSolar(resumenSolar(COT_0032)).join('\n');
    expect(avisos).toContain('entre la batería y el inversor');
    expect(avisos).toContain('tierra física');
    expect(avisos).toContain('32 A');
    expect(avisos).toContain('322 V');
  });

  it('arma una guía válida, sin conexiones rotas y con el inversor al centro', () => {
    const datos = datosSolarAislado(COT_0032);
    expect(datosGuiaSchema.safeParse(datos).success).toBe(true);
    expect(conexionesRotas(datos)).toEqual([]);
    expect(equipoPrincipal(datos)?.id).toBe('inversor');
    const voc = datos.pruebas.find((p) => p.id === 'p-voc');
    expect(voc).toMatchObject({ min: 258, max: 354 });
    expect(datos.conexiones.find((c) => c.id === 'c-fv-pos')?.calibre).toBe('10 AWG FV');
    expect(datos.notas.some((n) => n.startsWith('ENCENDIDO'))).toBe(true);
  });

  it('con protección y tierra cotizadas ya no las pide', () => {
    const completa = [...COT_0032,
      { descripcion: 'Interruptor para batería 125 A CD', cantidad: 1 },
      { descripcion: 'Varilla de tierra copperweld 5/8', cantidad: 1 },
      { descripcion: 'Cable 2 AWG para batería', cantidad: 4 },
    ];
    const avisos = avisosSolar(resumenSolar(completa)).join('\n');
    expect(avisos).not.toContain('entre la batería y el inversor');
    expect(avisos).not.toContain('tierra física');
    expect(avisos).not.toContain('cable de la batería');
  });
});
