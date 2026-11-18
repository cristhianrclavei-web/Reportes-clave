import { describe, expect, it } from 'vitest';
import { descripcionDeCotizado, filtrarCotizados, type EquipoCotizado } from './equiposCotizados';

const base = { cantidad: 1, unidad: 'Pza', enlace: null, foto: null, estado: 'aprobada' };
const LISTA: EquipoCotizado[] = [
  { ...base, descripcion: 'Inversor / Cargador de 5 KW para Sistemas Tipo Isla 48Vcd', modelo: 'PV335048TLV', marca: 'MUST', folio: 'COT-0032' },
  { ...base, descripcion: 'Batería de Litio / 48 Vcc / 104 Ah / 4.8 kWh (1 paquete)', modelo: 'RLB10048MAX', marca: 'EPCOM', folio: 'COT-0032' },
  { ...base, descripcion: 'Instalación, cableado, conexión y puesta en funcionamiento', modelo: null, marca: null, folio: 'COT-0032' },
  { ...base, descripcion: 'Inversor / Cargador de 5 KW para Sistemas Tipo Isla 48Vcd', modelo: 'PV335048TLV', marca: 'MUST', folio: 'COT-0041', estado: 'borrador' },
];

describe('equipos cotizados del cliente', () => {
  it('encuentra el inversor al escribir «inversor» sin repetirlo', () => {
    const r = filtrarCotizados(LISTA, 'inversor');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ modelo: 'PV335048TLV', folio: 'COT-0032' });
  });

  it('busca también por modelo y marca', () => {
    expect(filtrarCotizados(LISTA, 'rlb100')[0]?.modelo).toBe('RLB10048MAX');
    expect(filtrarCotizados(LISTA, 'epcom')[0]?.modelo).toBe('RLB10048MAX');
  });

  it('con el campo vacío muestra todo el equipo, sin la mano de obra', () => {
    expect(filtrarCotizados(LISTA, '').map((e) => e.modelo)).toEqual(['PV335048TLV', 'RLB10048MAX']);
  });

  it('limpia la descripción para el reporte', () => {
    expect(descripcionDeCotizado('Batería de Litio / 48 Vcc / 104 Ah / 4.8 kWh (1 paquete)')).toBe('Batería de Litio / 48 Vcc / 104 Ah / 4.8 kWh');
    expect(descripcionDeCotizado('Modulo Solar, 645 W BIFACIAL (6 Unidades)')).toBe('Modulo Solar, 645 W BIFACIAL');
  });
});
