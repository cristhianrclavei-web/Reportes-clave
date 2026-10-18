import { createClient } from './supabaseClient';
import { fechaLocal, hoyLocal, sumarDias } from './fechaHoy';
import { tipoActividad } from './tiposActividad';
import {
  ActividadDelDia, ServicioDelDia, PausaDeServicio, Segmento, ClaseTiempo, segmentosDelDia, minutosPorClaseTiempo,
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

export type DatosJornadas = {
  horario: HorarioJornada;
  festivos: Set<string>;
  servicios: ServicioJornada[];
  actividades: ActividadJornada[];
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

  const [ajustes, festivos, servicios, actividades] = await Promise.all([
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
  ]);
  if (servicios.error) throw servicios.error;
  if (actividades.error) throw actividades.error;

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

  const a = (ajustes.data || {}) as { jornada_inicio?: string; jornada_fin?: string };
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

  return { horario, festivos: diasFestivos, servicios: listaServicios, actividades: listaActividades };
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
  const segmentos = segmentosDelDia({ servicios, actividades, jornada, tope });
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
