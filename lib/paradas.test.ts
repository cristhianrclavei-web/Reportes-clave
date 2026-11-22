import { describe, it, expect } from 'vitest';
import { GASTO_VACIO, errorDeGasto, errorDeParada, gastoParaEnviar, paradasPorJustificar, textoHorarioParada, motivoSugerido, motivosDeParada } from './paradas';

const foto = new File(['x'], 'ticket.jpg', { type: 'image/jpeg' });

describe('errorDeGasto', () => {
  it('pide monto y ticket', () => {
    expect(errorDeGasto(GASTO_VACIO)).toContain('cuánto');
    expect(errorDeGasto({ ...GASTO_VACIO, monto: 500 })).toContain('foto del ticket');
    expect(errorDeGasto({ ...GASTO_VACIO, monto: 500, fotos: [foto] })).toBeNull();
  });

  it('sin ticket pide la explicación', () => {
    expect(errorDeGasto({ ...GASTO_VACIO, monto: 500, sinTicket: true })).toContain('por qué');
    expect(errorDeGasto({ ...GASTO_VACIO, monto: 500, sinTicket: true, motivoSinTicket: 'La gasolinera no tenía papel' })).toBeNull();
  });
});

describe('errorDeParada', () => {
  it('comida y espera no piden nada más', () => {
    expect(errorDeParada('comida', '', GASTO_VACIO)).toBeNull();
    expect(errorDeParada('espera', '', GASTO_VACIO)).toBeNull();
  });

  it('compra pide qué material y el gasto', () => {
    expect(errorDeParada('compra_material', '', GASTO_VACIO)).toContain('material');
    expect(errorDeParada('compra_material', 'Tubo conduit', GASTO_VACIO)).toContain('cuánto');
    expect(errorDeParada('compra_material', 'Tubo conduit', { ...GASTO_VACIO, monto: 320, fotos: [foto] })).toBeNull();
  });

  it('sin motivo no pasa', () => {
    expect(errorDeParada('', 'algo', GASTO_VACIO)).toContain('Elige');
  });
});

describe('gastoParaEnviar', () => {
  it('sin ticket no manda fotos', () => {
    expect(gastoParaEnviar({ monto: 100.456, fotos: [foto], sinTicket: true, motivoSinTicket: ' no dieron ' }, ['a/b.jpg']))
      .toEqual({ monto: 100.46, fotos: [], sin_ticket: true, motivo_sin_ticket: 'no dieron' });
  });
});

describe('paradas', () => {
  it('le toca justificar las nuevas y las rechazadas', () => {
    const lista = [{ id: 1, estado: null }, { id: 2, estado: 'pendiente' }, { id: 3, estado: 'rechazada' }, { id: 4, estado: 'aprobada' }];
    expect(paradasPorJustificar(lista).map((p) => p.id)).toEqual([1, 3]);
  });

  it('da el horario en hora de México', () => {
    expect(textoHorarioParada({ inicio: '2026-11-04T16:12:00Z', fin: '2026-11-04T16:21:00Z', minutos: 9 })).toBe('10:12 – 10:21 · 9 min');
  });
});

describe('motivos después de la firma', () => {
  const trasFirma = { reporte_id: 'r', inicio: '2026-11-20T19:30:00Z', fin: '2026-11-20T20:30:00Z', minutos: 60 }; // 13:30–14:30 en México
  it('ofrece solo los motivos que aplican', () => {
    const valores = motivosDeParada(trasFirma).map((m) => m.valor);
    expect(valores).toContain('material_herramienta');
    expect(valores).not.toContain('combustible');
    expect(motivosDeParada({ reporte_id: null }).map((m) => m.valor)).not.toContain('siguio_trabajando');
  });
  it('sugiere comida si fue media hora o más a la hora de comida', () => {
    expect(motivoSugerido(trasFirma)).toBe('comida');
    expect(motivoSugerido({ ...trasFirma, minutos: 20 })).toBe('');
    expect(motivoSugerido({ ...trasFirma, inicio: '2026-11-20T23:00:00Z', fin: '2026-11-20T23:45:00Z', minutos: 45 })).toBe('');
    expect(motivoSugerido({ ...trasFirma, reporte_id: null })).toBe('');
  });
});
