import { createClient } from './supabaseClient';
import {
  Servicio, crearServicio, reprogramarDia, agregarDiasAGrupo, reasignarTecnicos, motivoNoEditable,
} from './serviciosProgramados';
import { registrarAccionGlobal } from './auditoriaGlobal';

// Tablero del día para el supervisor: quién va a qué servicio, en qué va
// cada uno y si ya hay reporte. Reemplaza la hoja de Excel de la mañana.
// Junta datos que ya existen (servicios_programados, servicio_tecnicos,
// servicio_eventos y cobertura_dias); no agrega tablas.

export type AsignacionDia = {
  tecnico_id: string;
  nombre: string;
  visto_en: string | null;
  enterado_en: string | null;
};

export type ServicioDia = Servicio & {
  asignados: AsignacionDia[];
  // Último aviso del técnico desde sitio (retraso, pausa…), si hubo.
  ultimoAviso: { tipo: string; nota: string | null; created_at: string } | null;
  // «Avisar de un problema con este día» del técnico, sin atender todavía.
  avisosPendientes: { id: string; causa: string; comentario: string | null; tecnico_id: string }[];
};

export type CoberturaTecnico = {
  estado: 'reporte' | 'justificado' | 'sin_reporte' | 'no_exigible';
  motivo: string | null;
  reportes: string[];
};

export type TableroDia = {
  tecnicos: { id: string; nombre: string }[];
  servicios: ServicioDia[];
  cobertura: Record<string, CoberturaTecnico>;
};

export async function cargarTableroDia(fecha: string): Promise<TableroDia> {
  const supabase = createClient();
  const [tec, sv, cob] = await Promise.all([
    supabase.from('profiles').select('id, full_name, activo').eq('role', 'tecnico').order('full_name'),
    supabase
      .from('servicios_programados')
      .select('*, servicio_tecnicos(tecnico_id, visto_en, enterado_en, profiles(full_name))')
      .eq('fecha', fecha)
      .order('hora_programada', { ascending: true, nullsFirst: false }),
    supabase.rpc('cobertura_dias', { p_desde: fecha, p_hasta: fecha }),
  ]);
  if (tec.error) throw tec.error;
  if (sv.error) throw sv.error;

  const servicios = ((sv.data as any[]) || []).map((s) => {
    const { servicio_tecnicos, ...resto } = s;
    const asignados: AsignacionDia[] = (servicio_tecnicos || []).map((st: any) => ({
      tecnico_id: st.tecnico_id,
      nombre: (Array.isArray(st.profiles) ? st.profiles[0]?.full_name : st.profiles?.full_name) || 'Técnico',
      visto_en: st.visto_en,
      enterado_en: st.enterado_en,
    }));
    return { ...(resto as Servicio), asignados, ultimoAviso: null, avisosPendientes: [] } as ServicioDia;
  });

  // Avisos desde sitio (retraso y pausa traen el motivo que escribió el técnico).
  if (servicios.length > 0) {
    const { data: ev } = await supabase
      .from('servicio_eventos')
      .select('servicio_id, tipo, nota, created_at')
      .in('servicio_id', servicios.map((s) => s.id))
      .in('tipo', ['retraso', 'pausa'])
      .order('created_at', { ascending: false });
    for (const e of (ev as any[]) || []) {
      const s = servicios.find((x) => x.id === e.servicio_id);
      if (s && !s.ultimoAviso) s.ultimoAviso = { tipo: e.tipo, nota: e.nota, created_at: e.created_at };
    }
    const { data: av } = await supabase
      .from('servicio_avisos')
      .select('id, servicio_id, causa, comentario, tecnico_id')
      .in('servicio_id', servicios.map((s) => s.id))
      .eq('estado', 'pendiente');
    for (const a of (av as any[]) || []) {
      servicios.find((x) => x.id === a.servicio_id)?.avisosPendientes.push(a);
    }
  }

  const cobertura: Record<string, CoberturaTecnico> = {};
  for (const c of (cob.data as any[]) || []) {
    cobertura[c.tecnico_id] = { estado: c.estado, motivo: c.motivo, reportes: c.reportes || [] };
  }

  return {
    tecnicos: ((tec.data as any[]) || []).filter((t) => t.activo !== false).map((t) => ({ id: t.id, nombre: t.full_name || 'Técnico' })),
    servicios,
    cobertura,
  };
}

// Asignación rápida desde el tablero: un servicio de un día, sin tareas ni
// lista de carga (se pueden agregar después desde el detalle).
export async function asignarRapido(input: {
  proyecto: string;
  clienteId: string | null;
  descripcion: string;
  fecha: string;
  hora: string | null;
  tecnicoIds: string[];
}): Promise<Servicio> {
  const [s] = await crearServicio({
    proyecto: input.proyecto,
    clienteId: input.clienteId,
    descripcion: input.descripcion,
    fechas: [input.fecha],
    horaProgramada: input.hora,
    duracionMin: 120,
    tecnicoIds: input.tecnicoIds,
    tareas: [],
  });
  return s;
}

export const MOTIVOS_CAMBIO = [
  'El cliente no estaba',
  'No llegó el equipo o material',
  'Se complicó y no se terminó',
  'Cambio de prioridad',
  'Clima o acceso al sitio',
] as const;

// Cambio durante el día: queda el motivo en el historial del servicio y en
// Eventos, y en un solo paso se resuelve qué pasa con este servicio y a
// dónde se manda a los técnicos.
export async function registrarCambioDia(input: {
  servicio: ServicioDia;
  motivo: string;
  // Qué pasa con este servicio:
  //   'reprogramar' → no se empezó: se mueve a otra fecha;
  //   'continuar'   → ya se empezó: se agrega un día más al proyecto;
  //   'nada'        → se deja como está (el técnico cierra o reporta).
  accion: 'reprogramar' | 'continuar' | 'nada';
  nuevaFecha?: string;
  // A dónde van los técnicos (opcional):
  destino?:
    | { tipo: 'existente'; servicioId: string }
    | { tipo: 'nuevo'; proyecto: string; clienteId: string | null; descripcion: string; hora: string | null };
  tecnicoIds: string[];
  // Avisos del técnico que este cambio deja atendidos.
  avisosAtendidos?: string[];
}): Promise<string> {
  const { servicio: s, motivo } = input;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  if (!motivo.trim()) throw new Error('Indica el motivo del cambio.');

  const partes: string[] = [];

  if (input.accion === 'reprogramar') {
    if (!input.nuevaFecha) throw new Error('Elige la nueva fecha.');
    if (motivoNoEditable(s.estado)) throw new Error('Este servicio ya se empezó; usa «Continuar otro día».');
    await reprogramarDia(s.id, input.nuevaFecha);
    partes.push(`se reprogramó al ${fechaDMA(input.nuevaFecha)}`);
  } else if (input.accion === 'continuar') {
    if (!input.nuevaFecha) throw new Error('Elige la fecha para continuar.');
    await agregarDiasAGrupo(s.grupo_id, [input.nuevaFecha]);
    partes.push(`continúa el ${fechaDMA(input.nuevaFecha)}`);
  }

  if (input.destino && input.tecnicoIds.length > 0) {
    if (input.destino.tipo === 'nuevo') {
      if (!input.destino.proyecto.trim()) throw new Error('Escribe el cliente del nuevo servicio.');
      await asignarRapido({
        proyecto: input.destino.proyecto.trim(),
        clienteId: input.destino.clienteId,
        descripcion: input.destino.descripcion.trim(),
        fecha: s.fecha,
        hora: input.destino.hora,
        tecnicoIds: input.tecnicoIds,
      });
      partes.push(`técnicos enviados a «${input.destino.proyecto.trim()}» (nuevo)`);
    } else {
      const destinoId = input.destino.servicioId;
      const { data: actuales, error } = await supabase
        .from('servicio_tecnicos').select('tecnico_id').eq('servicio_id', destinoId);
      if (error) throw error;
      const ids = [...new Set([...(actuales || []).map((r: any) => r.tecnico_id as string), ...input.tecnicoIds])];
      const { data: dest } = await supabase.from('servicios_programados').select('proyecto').eq('id', destinoId).single();
      await reasignarTecnicos(destinoId, ids, `Llegan técnicos de «${s.proyecto}» (${motivo.trim()})`);
      partes.push(`técnicos enviados a «${dest?.proyecto || 'otro servicio'}»`);
    }
  }

  const cambio = `Cambio en el día en «${s.proyecto}»: ${motivo.trim()}${partes.length ? ` — ${partes.join('; ')}` : ''}`;
  await supabase.from('servicio_auditoria').insert({ servicio_id: s.id, supervisor_id: user.id, cambio });
  await registrarAccionGlobal('cambio_en_dia', 'servicio', s.id, cambio);
  for (const id of input.avisosAtendidos || []) {
    await supabase.from('servicio_avisos').update({ estado: 'atendido', resolucion_nota: cambio }).eq('id', id);
  }
  return cambio;
}

function fechaDMA(f: string): string {
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}
