import { describe, it, expect } from 'vitest';
import { evaluarVentanaServicio } from './ventanaServicio';

// La regla que se protege aqui: un servicio solo se opera el dia exacto para
// el que esta programado. Es la barrera contra el error mas caro en campo —
// vincular un reporte al servicio equivocado, casi siempre uno de otra fecha
// con nombre de cliente parecido.
//
// Todas las pruebas pasan el reloj como parametro. Eso hace que una prueba
// escrita hoy siga significando lo mismo dentro de un año, y que no haya que
// tocar la hora del sistema para probar el pasado o el futuro.

// 10 de septiembre de 2026, 10 de la mañana hora de México.
const DIA_10 = new Date(2026, 8, 10, 10, 0, 0);

describe('evaluarVentanaServicio', () => {
  it('permite operar el dia exacto', () => {
    const r = evaluarVentanaServicio({ fecha: '2026-09-10' }, DIA_10);
    expect(r.permitido).toBe(true);
    expect(r.motivo).toBeNull();
  });

  it('bloquea el dia anterior', () => {
    const r = evaluarVentanaServicio({ fecha: '2026-09-11' }, DIA_10);
    expect(r.permitido).toBe(false);
    expect(r.motivo).toContain('Falta 1 día');
  });

  it('bloquea un dia ya pasado', () => {
    const r = evaluarVentanaServicio({ fecha: '2026-09-09' }, DIA_10);
    expect(r.permitido).toBe(false);
    expect(r.motivo).toContain('ya pasó');
  });

  // El caso que motivo la excepcion: el trabajo se hizo, falta el papeleo.
  // El reporte casi nunca se captura el mismo dia, se captura al volver.
  it('permite documentar un servicio concluido aunque la fecha haya pasado', () => {
    const r = evaluarVentanaServicio(
      { fecha: '2026-09-01', estado: 'concluido', report_id: null },
      DIA_10
    );
    expect(r.permitido).toBe(true);
  });

  // Pero si ya tiene reporte, no hay nada que documentar y vuelve a regir la
  // regla de fecha. Si no fuera asi, un servicio viejo quedaria abierto para
  // siempre como destino de cualquier reporte.
  it('vuelve a bloquear si el servicio concluido ya tiene reporte', () => {
    const r = evaluarVentanaServicio(
      { fecha: '2026-09-01', estado: 'concluido', report_id: 'algun-uuid' },
      DIA_10
    );
    expect(r.permitido).toBe(false);
  });

  // Sin esto, 'YYYY-MM-DD' se interpreta como UTC y en México se corre un dia:
  // un servicio del 10 se veria como del 9 y quedaria bloqueado de madrugada.
  it('no se corre de dia cerca de medianoche', () => {
    const casiMedianoche = new Date(2026, 8, 10, 23, 45, 0);
    const r = evaluarVentanaServicio({ fecha: '2026-09-10' }, casiMedianoche);
    expect(r.permitido).toBe(true);

    const recienPasada = new Date(2026, 8, 10, 0, 15, 0);
    const r2 = evaluarVentanaServicio({ fecha: '2026-09-10' }, recienPasada);
    expect(r2.permitido).toBe(true);
  });

  it('usa singular y plural correctamente', () => {
    const unDia = evaluarVentanaServicio({ fecha: '2026-09-11' }, DIA_10);
    expect(unDia.motivo).toContain('Falta 1 día');
    expect(unDia.motivo).not.toContain('días');

    const variosDias = evaluarVentanaServicio({ fecha: '2026-09-13' }, DIA_10);
    expect(variosDias.motivo).toContain('Faltan 3 días');
  });

  it('devuelve la fecha en texto legible siempre', () => {
    const r = evaluarVentanaServicio({ fecha: '2026-09-10' }, DIA_10);
    expect(r.fechaTexto).toContain('septiembre');
    expect(r.fechaTexto).toContain('2026');
  });
});
