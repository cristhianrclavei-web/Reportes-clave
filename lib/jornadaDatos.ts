import { createClient } from './supabaseClient';
import { fechaLocal, hoyLocal, sumarDias } from './fechaHoy';
import { tipoActividad } from './tiposActividad';
import { infoMotivoParada } from './paradas';
import {
  ActividadDelDia, ServicioDelDia, PausaDeServicio, Segmento, ClaseTiempo, TrasladoDelDia, ReporteDelDia, EstanciaGps, ParadaDelDia, segmentosDelDia, minutosPorClaseTiempo,
} from './jornada';

// Trae de la base lo que hace falta para armar la jornada de cada técnico
// (servicios con sus pausas y actividades de bitácora) en un rango de
// fechas, y la arma con lib/jornada.ts. Lo usan «Mi día» del técnico y la
// pestaña Jornadas de supervisión; RLS decide qué ve cada quien.

export type HorarioJornada = { inicio: string; fin: string }; // 'HH:MM'
export const HORARIO_POR_DEFECTO: HorarioJornada = { inicio: '08:00', fin: '18:00' };

export type ActividadJornada = ActividadDelDia & {
  tecnicoId: string;
  origen: 'en_vivo' | 'manual';
  registradoPor: string | null;
  proyecto: string;
  reportId: string | null;
};
export type ServicioJornada = ServicioDelDia & { fecha: string; tecnicoIds: string[]; estado: string };
// Traslado que detectó el rastreo del teléfono (supabase/patch_traslados_gps.sql).
export type TrasladoJornada = TrasladoDelDia & { tecnicoId: string; fecha: string };

// Reporte de servicio de un técnico (quien lo hizo), con su fecha.
export type ReporteJornada = ReporteDelDia & { tecnicoId: string; fecha: string; servicioId: string | null };
// Visita a un cliente u oficina que vio el rastreo.
export type EstanciaJornada = EstanciaGps & { tecnicoId: string; fecha: string };
// Parada del rastreo ya justificada (o el rato después de la firma).
export type ParadaJornada = ParadaDelDia & { tecnicoId: string; fecha: string };

// Comida permitida por día y tolerancia (Ajustes → Pausas y comida).
export type ComidaPermitida = { minutos: number; tolerancia: number };

export type DatosJornadas = {
  horario: HorarioJornada;
  festivos: Set<string>;
  servicios: ServicioJornada[];
  actividades: ActividadJornada[];
  traslados: TrasladoJornada[];
  reportes: ReporteJornada[];
  estancias: EstanciaJornada[];
  paradas?: ParadaJornada[];
  comida?: ComidaPermitida;
};

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null);

// Pausas de cada servicio: una «pausa» abre y la siguiente «reanudación»
// (o el cierre) la cierra. El tipo viene en cualquiera de las dos.
function pausasPorServicio(eventos: any[]): Map<string, PausaDeServicio[]> {
  const porServicio = new Map<string, any[]>();
  for (const e of eventos) {
    const lista = porServicio.get(e.servicio_id) || [];
    lista.push(e);
    porServicio.set(e.servicio_id, lista);
  }
  const resultado = new Map<string, PausaDeServicio[]>();
  for (const [servicioId, lista] of porServicio) {
    lista.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const pausas: PausaDeServicio[] = [];
    let abierta: PausaDeServicio | null = null;
    for (const e of lista) {
      if (e.tipo === 'pausa' && !abierta) {
        abierta = { inicio: ms(e.created_at)!, fin: null, tipo: e.pausa_tipo || null };
      } else if ((e.tipo === 'reanudacion' || e.tipo === 'cierre') && abierta) {
        abierta.fin = ms(e.created_at);
        if (!abierta.tipo && e.pausa_tipo) abierta.tipo = e.pausa_tipo;
        pausas.push(abierta);
        abierta = null;
      }
    }
    if (abierta) pausas.push(abierta);
    resultado.set(servicioId, pausas);
  }
  return resultado;
}

export async function cargarDatosJornadas(desde: string, hasta: string): Promise<DatosJornadas> {
  const supabase = createClient();
  // Un día de margen en las actividades: la hora de inicio se guarda en UTC.
  const desdeIso = fechaLocal(sumarDias(desde, -1)).toISOString();
  const hastaIso = fechaLocal(sumarDias(hasta, 2)).toISOString();

  const [ajustes, festivos, servicios, actividades, traslados, reportes, visitas, oficina, paradas] = await Promise.all([
    // '*': si la base todavía no tiene las columnas de jornada, no falla.
    supabase.from('ajustes_operacion').select('*').maybeSingle(),
    supabase.from('dias_festivos').select('fecha, tipo').gte('fecha', desde).lte('fecha', hasta),
    supabase
      .from('servicios_programados')
      .select('id, proyecto, fecha, estado, hora_llegada, hora_inicio, hora_fin, servicio_tecnicos(tecnico_id)')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .neq('estado', 'cancelado'),
    supabase
      .from('actividades')
      .select('*')
      .gte('hora_inicio', desdeIso)
      .lt('hora_inicio', hastaIso),
    // shortcut: la base entrega hasta 1,000 filas; alcanza para un mes con pocos teléfonos, paginar si crece.
    supabase.from('traslados_detectados').select('tecnico_id, fecha, inicio, fin').gte('fecha', desde).lte('fecha', hasta),
    // Reportes: su llegada y salida cuentan como servicio (los que no vienen
    // de un servicio programado no tenían otra forma de aparecer).
    supabase.from('reports')
      .select('id, created_by, fecha, empresa_cliente, llegada:data->>horaLlegada, salida:data->>horaSalida, servicio:data->>servicioProgramadoId')
      .gte('fecha', desde).lte('fecha', hasta),
    supabase.from('visitas_detectadas').select('tecnico_id, fecha, llegada, salida, clientes(nombre)').gte('fecha', desde).lte('fecha', hasta),
    supabase.rpc('gps_en_lugares_propios', { p_desde: desde, p_hasta: hasta }),
    supabase.rpc('paradas_por_revisar', { p_desde: desde, p_hasta: hasta }),
  ]);
  if (servicios.error) throw servicios.error;
  if (actividades.error) throw actividades.error;
  // Los traslados del rastreo son un apoyo: si no se pueden leer (o la base
  // todavía no tiene el parche), la jornada se arma con lo registrado.
  if (traslados.error) console.error('No se pudieron leer los traslados del rastreo:', traslados.error.message);
  // Reportes y GPS también son apoyo: sin ellos la jornada sale como antes.
  if (reportes.error) console.error('No se pudieron leer los reportes para la bitácora:', reportes.error.message);
  if (visitas.error) console.error('No se pudieron leer las visitas del rastreo:', visitas.error.message);
  if (oficina.error) console.error('No se pudo leer el tiempo en la oficina del rastreo:', oficina.error.message);
  if (paradas.error) console.error('No se pudieron leer las paradas del rastreo:', paradas.error.message);
  const listaParadas: ParadaJornada[] = [];
  for (const p of (paradas.data || []) as any[]) {
    const pieza = paradaEnBitacora(p);
    if (pieza) listaParadas.push({ ...pieza, tecnicoId: p.tecnico_id, fecha: p.fecha, inicio: ms(p.inicio)!, fin: ms(p.fin)! });
  }
  const listaReportes: ReporteJornada[] = [];
  for (const r of (reportes.data || []) as any[]) {
    const inicio = horaDelDia(r.fecha, r.llegada);
    const fin = horaDelDia(r.fecha, r.salida);
    if (inicio === null || fin === null || fin <= inicio) continue;
    listaReportes.push({ id: r.id, titulo: r.empresa_cliente || 'Reporte', inicio, fin, tecnicoId: r.created_by, fecha: r.fecha, servicioId: r.servicio || null });
  }
  const listaEstancias: EstanciaJornada[] = [
    ...((visitas.data || []) as any[]).map((v) => ({
      tecnicoId: v.tecnico_id, fecha: v.fecha, inicio: ms(v.llegada)!, fin: ms(v.salida)!,
      titulo: (Array.isArray(v.clientes) ? v.clientes[0]?.nombre : v.clientes?.nombre) || 'Con un cliente', clase: 'servicio' as const,
    })),
    ...((oficina.data || []) as any[]).map((o) => ({
      tecnicoId: o.tecnico_id, fecha: o.fecha, inicio: ms(o.inicio)!, fin: ms(o.fin)!, titulo: o.lugar || 'Oficina', clase: 'oficina' as const,
    })),
  ].filter((e) => e.fin > e.inicio);
  const listaTraslados: TrasladoJornada[] = ((traslados.data || []) as any[]).map((t) => ({
    tecnicoId: t.tecnico_id, fecha: t.fecha, inicio: ms(t.inicio)!, fin: ms(t.fin)!,
  }));

  const servicioIds = (servicios.data || []).map((s: any) => s.id as string);
  let eventos: any[] = [];
  if (servicioIds.length > 0) {
    const { data, error } = await supabase
      .from('servicio_eventos')
      .select('servicio_id, tipo, pausa_tipo, created_at')
      .in('servicio_id', servicioIds)
      .in('tipo', ['pausa', 'reanudacion', 'cierre']);
    if (error) throw error;
    eventos = data || [];
  }
  const pausas = pausasPorServicio(eventos);

  const a = (ajustes.data || {}) as { jornada_inicio?: string; jornada_fin?: string; comida_min?: number; tolerancia_min?: number };
  const horario: HorarioJornada = {
    inicio: (a.jornada_inicio || HORARIO_POR_DEFECTO.inicio).slice(0, 5),
    fin: (a.jornada_fin || HORARIO_POR_DEFECTO.fin).slice(0, 5),
  };

  const listaServicios: ServicioJornada[] = [];
  for (const s of (servicios.data || []) as any[]) {
    // Sin llegada ni inicio todavía no se trabajó: no ocupa tiempo.
    const inicio = ms(s.hora_llegada) ?? ms(s.hora_inicio);
    if (inicio === null) continue;
    listaServicios.push({
      id: s.id, titulo: s.proyecto, fecha: s.fecha, estado: s.estado,
      inicio, fin: ms(s.hora_fin),
      pausas: pausas.get(s.id) || [],
      tecnicoIds: (s.servicio_tecnicos || []).map((t: any) => t.tecnico_id as string),
    });
  }

  const listaActividades: ActividadJornada[] = ((actividades.data || []) as any[]).map((x) => ({
    id: x.id, titulo: x.titulo, proyecto: x.proyecto || '',
    tipo: tipoActividad(x.tipo).clave,
    inicio: ms(x.hora_inicio)!, fin: ms(x.hora_fin),
    dudoso: !!x.cierre_automatico,
    tecnicoId: x.created_by,
    origen: x.origen === 'manual' ? 'manual' : 'en_vivo',
    registradoPor: x.registrado_por || null,
    reportId: x.report_id || null,
  }));

  const diasFestivos = new Set(
    ((festivos.data || []) as any[]).filter((f) => f.tipo === 'oficial' || f.tipo === 'empresa').map((f) => f.fecha as string),
  );

  const comida: ComidaPermitida = { minutos: a.comida_min ?? 60, tolerancia: a.tolerancia_min ?? 15 };

  return {
    horario, festivos: diasFestivos, servicios: listaServicios, actividades: listaActividades, traslados: listaTraslados,
    reportes: listaReportes, estancias: listaEstancias, paradas: listaParadas, comida,
  };
}

// Cómo se pinta una parada en la bitácora (o null si no se pinta):
// · Comida y desayuno/tienda → comida (se descuentan de la hora de comida).
// · Después de la firma, material/herramienta, siguió trabajando o salida
//   de la planta → servicio. Asunto personal → pausa.
// · Tráfico o espera → traslado a media ruta; con el cliente, pausa.
// · Después de la firma y sin justificar (o esperando autorización) →
//   «sin registrar» con su título, para que no salga como servicio.
// · Lo demás autorizado ya es una actividad de bitácora.
export function paradaEnBitacora(p: { motivo: string | null; estado: string | null; reporte_id?: string | null; cliente?: string | null }): { clase: ClaseTiempo; titulo: string } | null {
  const trasFirma = !!p.reporte_id;
  const enCliente = trasFirma ? ` en ${p.cliente || 'el cliente'}` : '';
  const autorizada = p.estado === 'aprobada';
  if (autorizada && p.motivo === 'comida') return { clase: 'comida', titulo: 'Comida' + enCliente };
  if (autorizada && p.motivo === 'desayuno_tienda') return { clase: 'comida', titulo: 'Desayuno o tienda' + enCliente };
  if (autorizada && trasFirma && (p.motivo === 'material_herramienta' || p.motivo === 'siguio_trabajando' || p.motivo === 'tramite_salida')) {
    const info = infoMotivoParada(p.motivo);
    return { clase: 'servicio', titulo: `Cierre${enCliente}: ${info?.label.toLowerCase() || 'trabajo'}` };
  }
  if (autorizada && p.motivo === 'personal') return { clase: 'pausa', titulo: 'Asunto personal' + enCliente };
  if (autorizada && p.motivo === 'espera') return { clase: trasFirma ? 'pausa' : 'traslado', titulo: 'Tráfico o espera' + enCliente };
  if (!trasFirma || autorizada) return null;
  const falta = p.estado === 'pendiente' ? 'por autorizar' : 'falta justificar';
  return { clase: 'sin_registrar', titulo: `Después de la firma${enCliente}: ${falta}` };
}

// ¿La comida del día pasó de lo permitido más la tolerancia?
export function comidaExcedida(minutosComida: number, comida: ComidaPermitida | undefined): boolean {
  if (!comida) return false;
  return minutosComida > comida.minutos + comida.tolerancia;
}

// «10:11» del día `fecha` en milisegundos (hora de México); null si no es una hora.
export function horaDelDia(fecha: string, hhmm: string | null | undefined): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return null;
  return fechaLocal(fecha).getTime() + minutosDeHora(hhmm) * 60000;
}

function minutosDeHora(hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

// Horario de la jornada en un día: lunes a viernes que no sean festivos.
// Sábado, domingo y festivos solo cuenta lo que se registró.
export function horarioDelDia(fecha: string, datos: Pick<DatosJornadas, 'horario' | 'festivos'>): { inicio: number; fin: number } | null {
  const dia = fechaLocal(fecha);
  const diaSemana = dia.getDay();
  if (diaSemana === 0 || diaSemana === 6) return null;
  if (datos.festivos.has(fecha)) return null;
  const base = dia.getTime();
  return {
    inicio: base + minutosDeHora(datos.horario.inicio) * 60000,
    fin: base + minutosDeHora(datos.horario.fin) * 60000,
  };
}

export type DiaDeTecnico = {
  fecha: string;
  // Horario de la jornada ese día (null en fin de semana y festivos).
  jornada: { inicio: number; fin: number } | null;
  servicios: ServicioJornada[];
  actividades: ActividadJornada[];
  segmentos: Segmento[];
};

// La jornada de un técnico en una fecha. `ahora` corta el día de hoy.
export function jornadaDeTecnico(datos: DatosJornadas, tecnicoId: string, fecha: string, ahora: number): DiaDeTecnico {
  const servicios = datos.servicios.filter((s) => s.fecha === fecha && s.tecnicoIds.includes(tecnicoId));
  const actividades = datos.actividades.filter((x) => x.tecnicoId === tecnicoId && hoyLocal(new Date(x.inicio)) === fecha);
  const finDelDia = fechaLocal(sumarDias(fecha, 1)).getTime();
  const tope = Math.min(ahora, finDelDia);
  const jornada = horarioDelDia(fecha, datos);
  const traslados = datos.traslados.filter((t) => t.tecnicoId === tecnicoId && t.fecha === fecha);
  // El reporte de un servicio programado que ya está en la bitácora no se
  // repite: el servicio ya cuenta ese tiempo.
  const idsServicios = new Set(servicios.map((s) => s.id));
  const reportes = (datos.reportes || []).filter((r) => r.tecnicoId === tecnicoId && r.fecha === fecha && !(r.servicioId && idsServicios.has(r.servicioId)));
  const estancias = (datos.estancias || []).filter((e) => e.tecnicoId === tecnicoId && e.fecha === fecha);
  const paradas = (datos.paradas || []).filter((p) => p.tecnicoId === tecnicoId && p.fecha === fecha);
  const segmentos = segmentosDelDia({ servicios, actividades, traslados, reportes, estancias, paradas, jornada, tope });
  return { fecha, jornada, servicios, actividades, segmentos };
}

export async function registrarActividadManual(entrada: {
  tipo: string;
  titulo: string;
  proyecto: string;
  inicio: Date;
  fin: Date;
  nota: string;
  acompanantes: string[];
}): Promise<{ creadas: number; omitidos: { id: string; nombre: string; choca_con: string }[] }> {
  const { data, error } = await createClient().rpc('registrar_actividad_manual', {
    p_tipo: entrada.tipo,
    p_titulo: entrada.titulo,
    p_proyecto: entrada.proyecto,
    p_inicio: entrada.inicio.toISOString(),
    p_fin: entrada.fin.toISOString(),
    p_nota: entrada.nota,
    p_acompanantes: entrada.acompanantes,
  });
  if (error) throw error;
  return { creadas: data?.creadas || 0, omitidos: data?.omitidos || [] };
}


export type ResumenTecnico = {
  tecnicoId: string;
  porClase: Partial<Record<ClaseTiempo, number>>;
  // Días hábiles del periodo (hasta hoy) sin ningún registro: pueden ser
  // vacaciones o faltas; no se cuentan como «sin registrar».
  diasSinRegistros: number;
  dias: { fecha: string; porClase: Partial<Record<ClaseTiempo, number>> }[];
};

export function sumarMinutos(
  a: Partial<Record<ClaseTiempo, number>>,
  b: Partial<Record<ClaseTiempo, number>>,
): Partial<Record<ClaseTiempo, number>> {
  const suma = { ...a };
  for (const [clave, min] of Object.entries(b) as [ClaseTiempo, number][]) {
    suma[clave] = (suma[clave] || 0) + min;
  }
  return suma;
}

// Jornada de cada técnico en cada fecha del periodo, ya sumada.
export function resumenDeJornadas(datos: DatosJornadas, tecnicoIds: string[], fechas: string[], ahora: number): ResumenTecnico[] {
  return tecnicoIds.map((tecnicoId) => {
    let porClase: Partial<Record<ClaseTiempo, number>> = {};
    let diasSinRegistros = 0;
    const dias: ResumenTecnico['dias'] = [];
    for (const fecha of fechas) {
      const { segmentos } = jornadaDeTecnico(datos, tecnicoId, fecha, ahora);
      if (segmentos.length === 0) {
        if (horarioDelDia(fecha, datos)) diasSinRegistros++;
        continue;
      }
      const delDia = minutosPorClaseTiempo(segmentos);
      porClase = sumarMinutos(porClase, delDia);
      dias.push({ fecha, porClase: delDia });
    }
    return { tecnicoId, porClase, diasSinRegistros, dias };
  });
}

// Supervisión cambia la hora de entrada y de salida de la jornada.
export async function guardarHorarioJornada(horario: HorarioJornada): Promise<void> {
  const formato = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!formato.test(horario.inicio) || !formato.test(horario.fin)) throw new Error('Escribe las horas como 08:00.');
  if (horario.fin <= horario.inicio) throw new Error('La salida debe ser después de la entrada.');
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('ajustes_operacion')
    .update({ jornada_inicio: horario.inicio, jornada_fin: horario.fin, actualizado_en: new Date().toISOString(), actualizado_por: user?.id })
    .eq('id', true)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No tienes permiso para cambiar el horario.');
}

// Corrige lo registrado a mano (solo el registro propio; el de los
// acompañantes no cambia). Requiere patch_bitacora_manual_editar.sql.
export async function editarActividadManual(entrada: {
  id: string;
  tipo: string;
  titulo: string;
  proyecto: string;
  inicio: Date;
  fin: Date;
}): Promise<void> {
  const { error } = await createClient().rpc('editar_actividad_manual', {
    p_id: entrada.id,
    p_tipo: entrada.tipo,
    p_titulo: entrada.titulo,
    p_proyecto: entrada.proyecto,
    p_inicio: entrada.inicio.toISOString(),
    p_fin: entrada.fin.toISOString(),
  });
  if (error) throw error;
}

export type EstadisticasJornada = {
  // Minutos de jornada (registrado + sin registrar) y solo lo registrado.
  total: number;
  registrado: number;
  diasConRegistro: number;
  // Promedios por día con registro, en minutos.
  registradoPorDia: number;
  servicioPorDia: number;
  sinRegistrarPorDia: number;
  // Porcentaje de la jornada que fue de esa clase (0–100).
  pct: (clase: ClaseTiempo) => number;
};

// Totales y promedios de una persona (o de un grupo, sumando sus días).
export function estadisticasJornada(porClase: Partial<Record<ClaseTiempo, number>>, diasConRegistro: number): EstadisticasJornada {
  const total = Object.values(porClase).reduce((n, v) => n + (v || 0), 0);
  const sinRegistrar = porClase.sin_registrar || 0;
  const registrado = total - sinRegistrar;
  const porDia = (min: number) => (diasConRegistro > 0 ? Math.round(min / diasConRegistro) : 0);
  return {
    total,
    registrado,
    diasConRegistro,
    registradoPorDia: porDia(registrado),
    servicioPorDia: porDia(porClase.servicio || 0),
    sinRegistrarPorDia: porDia(sinRegistrar),
    pct: (clase) => (total > 0 ? Math.round(((porClase[clase] || 0) / total) * 100) : 0),
  };
}
