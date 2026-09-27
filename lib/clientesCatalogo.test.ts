import { describe, it, expect } from 'vitest';
import { clienteExacto, coincidencias, parecidos, normalizar, ClienteCatalogo } from './clientesCatalogo';

const cat: ClienteCatalogo[] = [
  { id: '1', nombre: 'Centro de Negocios del Ángel', alias: [] },
  { id: '2', nombre: 'Tequilera San Matías', alias: ['Tequila San Matias'] },
  { id: '3', nombre: 'Aislantes y Empaques', alias: [] },
  { id: '4', nombre: 'Technology Park', alias: [] },
];

describe('clientesCatalogo', () => {
  it('normaliza acentos, mayúsculas y signos', () => {
    expect(normalizar('  Centro de Negocios del ÁNGEL. ')).toBe('centro de negocios del angel');
  });
  it('exacto por nombre o por alias, sin acentos ni mayúsculas', () => {
    expect(clienteExacto('centro de negocios del angel', cat)?.id).toBe('1');
    expect(clienteExacto('TEQUILA SAN MATIAS', cat)?.id).toBe('2');
    expect(clienteExacto('Plaza del Ángel', cat)).toBeNull();
  });
  it('sugiere por cualquier palabra', () => {
    expect(coincidencias('angel', cat).map((c) => c.id)).toEqual(['1']);
    expect(coincidencias('san', cat).map((c) => c.id)).toEqual(['2']);
    expect(coincidencias('del', cat)).toEqual([]);
  });
  it('parecidos comparten una palabra significativa', () => {
    expect(parecidos('Plaza del Angel', cat).map((c) => c.id)).toEqual(['1']);
    expect(parecidos('Tequilas San Matias', cat).map((c) => c.id)).toEqual(['2']);
    expect(parecidos('Farmacia Guadalajara', cat)).toEqual([]);
  });
});
