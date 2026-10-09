import { describe, it, expect } from 'vitest';
import { Servicio } from './serviciosProgramados';
import {
  desfaseLlegada, desfaseSalida, evaluarServicio, resumenEficiencia, eficienciaPorSemana,
  motivosFrecuentes, eficienciaPorGrupo, lunesDe, visitasEnFalso,
} from './eficiencia';
import { debeReporte } from './visitaSinTrabajo';
import { estadoFacturacion } from './reportStatus';

function iso(fecha: string, hora: string): string {
  return new Date(`${fecha}T${hora}`).toISOString();
}

let n = 0;
function servicio(o: Partial<Servicio> = {}): Servicio {
  n++;
  return {
    id: `s${n}`, creado_por: 'u', proyecto: 'Cliente A', descripcion: null, fecha: '2026-10-05',
    hora_programada: '09:00', hora_salida_programada: '12:00', ubicacion_programada: null, radio_geocerca_m: 120,
    duracion_estimada_min: 180, hora_llegada: iso('2026-10-05', '09:00'), hora_inicio: iso('2026-10-05', '09:05'),
    hora_fin: iso('2026-10-05', '12:00'), estado: 'concluido', pausado_desde: null, minutos_pausados: 0,
    report_id: null, grupo_id: 'g', numero_dia: 1, dias_totales: 1, created_at: iso('2026-10-01', '10:00'),
    resultado: 'terminado', ...o,
  };
}

describe('desfases', () => {
  it('llegada: minutos contra la hora acordada', () => {
    expect(desfaseLlegada(servicio({ hora_llegada: iso('2026-10-05', '09:32') }))).toBe(32);
    expect(desfaseLlegada(servicio({ hora_llegada: iso('2026-10-05', '08:50') }))).toBe(-10);
    expect(desfaseLlegada(servicio({ hora_programada: null }))).toBeNull();
  });

  it('salida: contra la hora de salida programada', () => {
    expect(desfaseSalida(servicio({ hora_fin: iso('2026-10-05', '11:00') }))).toBe(-60);
    expect(desfaseSalida(servicio({ hora_fin: iso('2026-10-05', '12:40') }))).toBe(40);
  });

  it('salida sin hora programada: contra la duración estimada, sin contar pausas', () => {
    const s = servicio({ hora_salida_programada: null, duracion_estimada_min: 120, hora_fin: iso('2026-10-05', '12:05'), minutos_pausados: 30 });
    expect(desfaseSalida(s)).toBe(30); // 180 trabajados − 30 de pausa − 120 estimados
  });

  it('un cierre olvidado hasta el día siguiente no es un dato', () => {
    expect(desfaseSalida(servicio({ hora_fin: iso('2026-10-06', '09:00') }))).toBeNull();
  });
});

describe('evaluarServicio', () => {
  it('en horario y terminado es positivo', () => {
    expect(evaluarServicio(servicio()).lectura).toBe('positiva');
  });

  it('sin resultado capturado queda sin clasificar', () => {
    expect(evaluarServicio(servicio({ resultado: null })).lectura).toBe('sin_clasificar');
  });

  it('salir antes con el trabajo terminado es tiempo ganado', () => {
    const e = evaluarServicio(servicio({ hora_fin: iso('2026-10-05', '11:00') }));
    expect(e.lectura).toBe('positiva');
    expect(e.minutosGanados).toBe(60);
  });

  it('salir antes dejando trabajo pendiente por causa propia es negativo', () => {
    const e = evaluarServicio(servicio({ hora_fin: iso('2026-10-05', '11:00'), resultado: 'pendiente', resultado_motivo: 'falta_material' }));
    expect(e.lectura).toBe('negativa');
    expect(e.minutosGanados).toBe(0);
  });

  it('no terminar porque el cliente no estaba es neutro', () => {
    const e = evaluarServicio(servicio({ hora_fin: iso('2026-10-05', '09:40'), resultado: 'no_realizado', resultado_motivo: 'cliente_ausente' }));
    expect(e.lectura).toBe('neutra');
  });

  it('llegar tarde por tráfico es neutro; por salir tarde de base, negativo', () => {
    const tarde = { hora_llegada: iso('2026-10-05', '09:40') };
    expect(evaluarServicio(servicio({ ...tarde, llegada_motivo: 'trafico' })).lectura).toBe('neutra');
    const propio = evaluarServicio(servicio({ ...tarde, llegada_motivo: 'salida_tarde' }));
    expect(propio.lectura).toBe('negativa');
    expect(propio.minutosPerdidosPropios).toBe(40);
  });

  it('llegar tarde sin decir por qué cuenta como propio', () => {
    expect(evaluarServicio(servicio({ hora_llegada: iso('2026-10-05', '09:40') })).lectura).toBe('negativa');
  });

  it('15 minutos de margen no cuentan, ni en llegada ni en salida', () => {
    const e = evaluarServicio(servicio({ hora_llegada: iso('2026-10-05', '09:15'), hora_fin: iso('2026-10-05', '12:15') }));
    expect(e.hechos).toHaveLength(0);
    expect(e.lectura).toBe('positiva');
  });

  it('una causa propia pesa más que una externa en el mismo día', () => {
    const e = evaluarServicio(servicio({
      hora_llegada: iso('2026-10-05', '09:40'), llegada_motivo: 'trafico',
      hora_fin: iso('2026-10-05', '13:00'), salida_motivo: 'retrabajo',
    }));
    expect(e.lectura).toBe('negativa');
    expect(e.minutosPerdidosExternos).toBe(40);
    expect(e.minutosPerdidosPropios).toBe(60);
  });
});

describe('agregados', () => {
  const lista = [
    servicio(),
    servicio({ hora_fin: iso('2026-10-05', '11:00') }),
    servicio({ hora_llegada: iso('2026-10-05', '09:40'), llegada_motivo: 'trafico' }),
    servicio({ resultado: 'pendiente', resultado_motivo: 'falta_material' }),
    servicio({ resultado: null }),
    servicio({ estado: 'programado', resultado: null }),
  ];

  it('el cumplimiento deja fuera lo externo y lo sin clasificar', () => {
    const r = resumenEficiencia(lista);
    expect([r.positivas, r.neutras, r.negativas, r.sinClasificar]).toEqual([2, 1, 1, 1]);
    expect(r.cumplimientoPct).toBeCloseTo((2 / 3) * 100);
  });

  it('motivos: cuenta cada uno con su origen', () => {
    const m = motivosFrecuentes(lista);
    expect(m.map((x) => [x.clave, x.origen, x.n])).toEqual(
      expect.arrayContaining([['trafico', 'externo', 1], ['falta_material', 'propio', 1]]),
    );
  });

  it('por semana: llena las semanas vacías y acomoda por lunes', () => {
    expect(lunesDe('2026-10-08')).toBe('2026-10-05');
    expect(lunesDe('2026-10-11')).toBe('2026-10-05');
    const semanas = eficienciaPorSemana(lista, '2026-10-08', 3);
    expect(semanas.map((s) => s.inicio)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    expect(semanas[2].positivas).toBe(2);
    expect(semanas[0].positivas + semanas[0].negativas).toBe(0);
  });

  it('por grupo: un día con dos técnicos cuenta para ambos', () => {
    const filas = eficienciaPorGrupo(
      [{ ...servicio(), tecnicos: ['Ana', 'Luis'] }, { ...servicio({ resultado: 'pendiente', resultado_motivo: 'otro' }), tecnicos: ['Ana'] }],
      (s) => s.tecnicos,
    );
    const ana = filas.find((f) => f.nombre === 'Ana')!;
    expect(ana.n).toBe(2);
    expect(ana.cumplimientoPct).toBe(50);
    expect(ana.terminadosPct).toBe(50);
    expect(filas.find((f) => f.nombre === 'Luis')!.cumplimientoPct).toBe(100);
  });
});

describe('visitas sin trabajo', () => {
  it('que el cliente no tenga el equipo es causa externa: no cuenta en contra', () => {
    const e = evaluarServicio(servicio({ resultado: 'no_realizado', resultado_motivo: 'cliente_sin_equipo', hora_fin: iso('2026-10-05', '09:20') }));
    expect(e.lectura).toBe('neutra');
  });

  it('cuenta las visitas en falso por cliente y el tiempo en sitio', () => {
    const v = visitasEnFalso([
      servicio({ proyecto: 'Cliente A', resultado: 'no_realizado', resultado_motivo: 'cliente_sin_equipo', hora_fin: iso('2026-10-05', '09:20') }),
      servicio({ proyecto: 'Cliente A', resultado: 'no_realizado', resultado_motivo: 'falta_material', hora_fin: iso('2026-10-05', '09:10') }),
      servicio({ proyecto: 'Cliente B', resultado: 'no_realizado', resultado_motivo: 'permiso', hora_fin: iso('2026-10-05', '09:30') }),
      servicio({ proyecto: 'Cliente C' }),
      servicio({ proyecto: 'Cliente D', resultado: 'no_realizado', estado: 'en_curso' }),
    ]);
    expect(v.total).toBe(3);
    expect(v.minutos).toBe(60);
    expect(v.porCliente).toEqual([
      { nombre: 'Cliente A', n: 2, externas: 1 },
      { nombre: 'Cliente B', n: 1, externas: 1 },
    ]);
  });

  it('el reporte no se exige mientras se revisa ni ya liberada; rechazada, sí', () => {
    expect(debeReporte({ report_id: null })).toBe(true);
    expect(debeReporte({ report_id: null, visita_estado: 'pendiente' })).toBe(false);
    expect(debeReporte({ report_id: null, visita_estado: 'liberado' })).toBe(false);
    expect(debeReporte({ report_id: null, visita_estado: 'rechazado' })).toBe(true);
    expect(debeReporte({ report_id: 'r1', visita_estado: 'rechazado' })).toBe(false);
  });
});

describe('facturación de un reporte', () => {
  it('pendiente solo mientras no esté en una factura ni descartado', () => {
    expect(estadoFacturacion({})).toBe('sin_finalizar');
    expect(estadoFacturacion({ servicioConcluido: true })).toBe('pendiente');
    expect(estadoFacturacion({ servicioConcluido: true, facturaEstado: 'pendiente' })).toBe('pendiente');
    expect(estadoFacturacion({ servicioConcluido: true, facturaEstado: 'en_proceso', facturaId: 'f1' })).toBe('en_factura');
    expect(estadoFacturacion({ servicioConcluido: true, facturaEstado: 'facturado', facturaId: 'f1' })).toBe('facturado');
    expect(estadoFacturacion({ servicioConcluido: true, facturaEstado: 'no_facturable' })).toBe('no_facturable');
  });

  it('la nota antigua de «no se puede facturar» se lee como no facturable', () => {
    expect(estadoFacturacion({ servicioConcluido: true, facturaEstado: 'en_proceso', facturaNota: 'garantía' })).toBe('no_facturable');
  });
});
