import { createClient } from './supabaseClient';
import { Servicio, Tarea, calcularEstadoTiempo } from './serviciosProgramados';

// Progreso real de una obra a lo largo de sus días. Con un reporte por día,
// el supervisor tenía que abrirlos uno por uno para saber cómo va el
// proyecto; esto reconstruye la evolución en una sola vista.
//
// El avance de cada día no se guarda en ninguna parte: se deduce de cuándo se
// completó cada tarea (completada_en) y de los avances parciales registrados
// como eventos. Por eso se calcula aquí y no se consulta.

export type DiaProgreso = {
  servicio: Servicio;
  tecnicos: string[];
  tareasCerradasEseDia: number;
  avancesParciales: number;
  acumuladoTareas: number;      // tareas cerradas hasta ese día, inclusive
  pctAcumulado: number;         // sobre el total del checklist
  retrasoMin: number | null;
  tieneReporte: boolean;
};

export type ProgresoProyecto = {
  proyecto: string;
  grupoId: string;
  totalTareas: number;
  tareasCerradas: number;
  pctGlobal: number;
  diasConReporte: number;
  diasTotales: number;
  dias: DiaProgreso[];
};

function mismaFechaLocal(iso: string, fecha: string): boolean {
  const d = new Date(iso);
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return local === fecha;
}

export async function obtenerProgresoProyecto(grupoId: string): Promise<ProgresoProyecto | null> {
  const supabase = createClient();

  const { data: dias, error: e1 } = await supabase
    .from('servicios_programados')
    .select('*')
    .eq('grupo_id', grupoId)
    .order('numero_dia', { ascending: true });
  if (e1) throw e1;
  if (!dias || dias.length === 0) return null;

  const ids = dias.map((d: any) => d.id);

  const [{ data: tareas }, { data: asignaciones }, { data: eventos }] = await Promise.all([
    supabase.from('servicio_tareas').select('*').eq('grupo_id', grupoId),
    supabase.from('servicio_tecnicos').select('servicio_id, profiles(full_name)').in('servicio_id', ids),
    supabase
      .from('servicio_eventos')
      .select('servicio_id, tipo, created_at, tarea_id, avance_pct')
      .in('servicio_id', ids)
      .eq('tipo', 'avance')
      .order('created_at', { ascending: true }),
  ]);

  const listaTareas = (tareas as Tarea[]) || [];
  const totalTareas = listaTareas.length;
  const tareasCerradas = listaTareas.filter((t) => t.completada).length;

  const tecnicosPorServicio: Record<string, string[]> = {};
  (asignaciones || []).forEach((a: any) => {
    const nombre = Array.isArray(a.profiles) ? a.profiles[0]?.full_name : a.profiles?.full_name;
    if (!nombre) return;
    if (!tecnicosPorServicio[a.servicio_id]) tecnicosPorServicio[a.servicio_id] = [];
    tecnicosPorServicio[a.servicio_id].push(nombre);
  });

  const listaEventos = (eventos as any[]) || [];

  // Cuánto se llevaba de una tarea al terminar el día indicado. Una tarea
  // completada aporta 100; una a medias aporta su último avance registrado
  // hasta ese día. Sin esto, un día de puros avances parciales se veía en 0%
  // aunque hubiera trabajo hecho.
  function aporteAlCierre(t: Tarea, finDelDia: Date): number {
    if (t.completada && t.completada_en && new Date(t.completada_en) <= finDelDia) return 100;

    const avancesDeLaTarea = listaEventos.filter(
      (e) => e.tarea_id === t.id && e.avance_pct != null && new Date(e.created_at) <= finDelDia
    );
    if (avancesDeLaTarea.length > 0) {
      return Math.max(0, Math.min(100, avancesDeLaTarea[avancesDeLaTarea.length - 1].avance_pct));
    }
    return 0;
  }

  let acumulado = 0;
  const diasProgreso: DiaProgreso[] = (dias as Servicio[]).map((sv) => {
    // Una tarea cuenta para el día en que se cerró, no para el día que la
    // tenía asignada: el checklist es compartido entre los días.
    const cerradasEseDia = listaTareas.filter(
      (t) => t.completada && t.completada_en && mismaFechaLocal(t.completada_en, sv.fecha)
    ).length;
    acumulado += cerradasEseDia;

    const parciales = listaEventos.filter((e) => e.servicio_id === sv.id).length;
    const et = calcularEstadoTiempo(sv);

    // El porcentaje se calcula al cierre de ese día, incluyendo lo que quedó
    // a medias, en lugar de contar solo tareas cerradas.
    const [y, m, d] = sv.fecha.split('-').map(Number);
    const finDelDia = new Date(y, m - 1, d, 23, 59, 59);
    const suma = listaTareas.reduce((acc, t) => acc + aporteAlCierre(t, finDelDia), 0);

    return {
      servicio: sv,
      tecnicos: tecnicosPorServicio[sv.id] || [],
      tareasCerradasEseDia: cerradasEseDia,
      avancesParciales: parciales,
      acumuladoTareas: acumulado,
      pctAcumulado: totalTareas > 0 ? Math.round(suma / totalTareas) : 0,
      retrasoMin: et.tipo === 'retraso' || et.tipo === 'excedido' ? et.minutos || null : null,
      tieneReporte: !!sv.report_id,
    };
  });

  return {
    proyecto: (dias[0] as Servicio).proyecto,
    grupoId,
    totalTareas,
    tareasCerradas,
    // Mismo criterio que el resto de la app: una tarea al 50% aporta medio
    // punto, no cero.
    pctGlobal:
      totalTareas > 0
        ? Math.round(
            listaTareas.reduce((acc, t) => acc + (t.completada ? 100 : Math.max(0, Math.min(100, t.avance_pct || 0))), 0) /
              totalTareas
          )
        : 0,
    diasConReporte: diasProgreso.filter((d) => d.tieneReporte).length,
    diasTotales: dias.length,
    dias: diasProgreso,
  };
}
