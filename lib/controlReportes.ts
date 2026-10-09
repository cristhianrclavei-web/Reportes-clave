import { createClient } from './supabaseClient';

// Control de reportes para el supervisor: qué debe cada técnico.
//   · Servicios de días ya pasados sin reporte ligado (si nunca se marcó
//     llegada, puede que ni se haya hecho: el supervisor debe revisarlo).
//   · Días hábiles sin reporte ni justificación (cobertura_dias, la misma
//     regla de los avisos de las 18:00 y 9:00).

export type FilaCobertura = {
  tecnico_id: string;
  tecnico: string | null;
  fecha: string;
  estado: 'reporte' | 'justificado' | 'sin_reporte' | 'no_exigible';
};

export type ServicioPendiente = {
  id: string;
  proyecto: string;
  fecha: string;
  estado: 'programado' | 'en_sitio' | 'en_curso' | 'concluido';
  // 'pendiente': visita sin trabajo que el supervisor debe revisar.
  visita_estado?: string | null;
  numero_dia: number;
  dias_totales: number;
  tecnicoIds: string[];
};

export async function cargarControl(desde: string, hasta: string): Promise<{
  tecnicos: { id: string; nombre: string }[];
  cobertura: FilaCobertura[];
  servicios: ServicioPendiente[];
}> {
  const supabase = createClient();
  const [tec, cob, sv] = await Promise.all([
    supabase.from('profiles').select('id, full_name, activo').eq('role', 'tecnico').order('full_name'),
    supabase.rpc('cobertura_dias', { p_desde: desde, p_hasta: hasta }),
    supabase
      .from('servicios_programados')
      .select('id, proyecto, fecha, estado, visita_estado, numero_dia, dias_totales, servicio_tecnicos(tecnico_id)')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .is('report_id', null)
      // Una visita sin trabajo ya liberada no debe reporte.
      .or('visita_estado.is.null,visita_estado.neq.liberado')
      .neq('estado', 'cancelado')
      .order('fecha', { ascending: true }),
  ]);
  if (tec.error) throw tec.error;
  if (cob.error) throw cob.error;
  if (sv.error) throw sv.error;
  return {
    tecnicos: ((tec.data as any[]) || []).filter((t) => t.activo !== false).map((t) => ({ id: t.id, nombre: t.full_name || 'Personal técnico' })),
    cobertura: (cob.data as FilaCobertura[]) || [],
    servicios: ((sv.data as any[]) || []).map(({ servicio_tecnicos, ...s }) => ({
      ...s,
      tecnicoIds: (servicio_tecnicos || []).map((x: any) => x.tecnico_id),
    })),
  };
}

// El supervisor registra la justificación de un día por el técnico (p. ej.
// estuvo en oficina). La base guarda quién la registró y la manda a Eventos.
export async function justificarPorTecnico(input: {
  tecnicoId: string;
  fecha: string;
  motivo: 'no_asisti' | 'sin_servicio' | 'festivo' | 'vacaciones' | 'otro';
  detalle: string;
}): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  if (input.motivo === 'otro' && input.detalle.trim().length < 3) throw new Error('Escribe el motivo.');
  const { error } = await supabase.from('justificaciones_dia').insert({
    tecnico_id: input.tecnicoId,
    fecha: input.fecha,
    motivo: input.motivo,
    detalle: input.detalle.trim() || null,
    registrado_por: user.id,
  });
  if (error) {
    if (error.code === '23505') throw new Error('Ese día ya tiene una justificación.');
    throw error;
  }
}
