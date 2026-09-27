import { describe, it, expect } from 'vitest';
import { agruparSueltos, gruposDuplicados, NodoCliente, paresDelGrupo, claveDescartado } from './duplicadosClientes';

const cli = (id: string, nombre: string, porRevisar = false): NodoCliente => ({ tipo: 'cliente', id, nombre, alias: [], reportes: 1, porRevisar });

// Nombres reales de los reportes sin vincular (2026-09-27).
const reportes = [
  'Hsmc', 'Templo San Mateo Apostol', 'Tequila San Matías', 'HSMCH Capital Norte', 'Parroquia San Mateo Apóstol ',
  'Casa de willy ', 'Plaza del Angel', 'Plaza del Angel', 'Plaza del Angel', 'Plaza del angel', 'Print Pack',
  'Tequila Casa San Matías ', 'Casa de willy', 'Tienda Abarrotes Six', 'CLASSIQA CHAPALITA', 'Pinturas Casther ', 'MAQUISA',
].map((e) => ({ empresa_cliente: e, cliente_id: null }));

const clientes = [cli('t', 'Tequilera San Matias'), cli('a', 'Aislantes y Empaques'), cli('p', 'Technology Park'), cli('c', 'Centro de Negocios Del Ángel')];

describe('duplicadosClientes', () => {
  const sueltos = agruparSueltos(reportes);

  it('junta las variantes del mismo nombre', () => {
    const angel = sueltos.find((s) => s.norm === 'plaza del angel')!;
    expect(angel.reportes).toBe(4);
    expect(sueltos.find((s) => s.norm === 'casa de willy')!.reportes).toBe(2);
  });

  it('agrupa los parecidos reales y no mezcla «casa» ni «san»', () => {
    const grupos = gruposDuplicados([...clientes, ...sueltos], new Set());
    const nombres = grupos.map((g) => g.map((n) => n.nombre).sort());
    expect(nombres).toContainEqual(['Centro de Negocios Del Ángel', 'Plaza del Angel'].sort());
    expect(nombres).toContainEqual(['Tequila Casa San Matías', 'Tequila San Matías', 'Tequilera San Matias'].sort());
    expect(nombres).toContainEqual(['Parroquia San Mateo Apóstol', 'Templo San Mateo Apostol'].sort());
    expect(nombres).toContainEqual(['HSMCH Capital Norte', 'Hsmc'].sort());
    expect(grupos.flat().some((n) => n.nombre.startsWith('Casa de willy'))).toBe(false);
    expect(grupos).toHaveLength(4);
  });

  it('no vuelve a sugerir pares descartados', () => {
    const g = gruposDuplicados([...clientes, ...sueltos], new Set());
    const hsmc = g.find((x) => x.some((n) => n.nombre === 'Hsmc'))!;
    const desc = new Set(paresDelGrupo(hsmc).map((p) => claveDescartado(p.a_norm, p.b_norm)));
    expect(gruposDuplicados([...clientes, ...sueltos], desc).some((x) => x.some((n) => n.nombre === 'Hsmc'))).toBe(false);
  });

  it('dos clientes ya revisados no se proponen', () => {
    expect(gruposDuplicados([cli('1', 'Farmacia Guadalupe'), cli('2', 'Farmacias Guadalupe')], new Set())).toHaveLength(0);
    expect(gruposDuplicados([cli('1', 'Farmacia Guadalupe'), cli('2', 'Farmacias Guadalupe', true)], new Set())).toHaveLength(1);
  });
});
