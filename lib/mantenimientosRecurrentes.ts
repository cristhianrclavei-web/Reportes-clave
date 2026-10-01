import { createClient } from './supabaseClient';
import { fechaLocal, hoyLocal } from './fechaHoy';
import { registrarAccionGlobal } from './auditoriaGlobal';

// Mantenimientos recurrentes por cliente (patch_mantenimientos_recurrentes.sql).
// La Agenda muestra los que vencen pronto; al programarlos se crea un
// servicio normal y la próxima fecha avanza según la frecuencia.

export type Frecuencia = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

export const FRECUENCIAS: { valor: Frecuencia; label: string; meses: number }[] = [
  { valor: 'mensual', label: 'Mensual', meses: 1 },
  { valor: 'bimestral', label: 'Bimestral', meses: 2 },
  { valor: 'trimestral', label: 'Trimestral', meses: 3 },
  { valor: 'semestral', label: 'Semestral', meses: 6 },
  { valor: 'anual', label: 'Anual', meses: 12 },
];

// Cuántos días antes de la fecha aparece en «por programar».
export const DIAS_AVISO = 14;

export type Recurrente = {
  id: string;
  cliente_id: string | null;
  proyecto: string;
  descripcion: string | null;
  frecuencia: Frecuencia;
  proxima_fecha: string;
  hora: string | null;
  duracion_min: number;
  tecnico_ids: string[];
  notas: string | null;
  activo: boolean;
  ultima_programacion: string | null;
};

// «2026-11-30» + 3 meses → «2027-02-28» (si el mes no tiene ese día, el último).
export function sumarMeses(fecha: string, meses: number): string {
  const d = fechaLocal(fecha);
  const dia = d.getDate();
  const objetivo = new Date(d.getFullYear(), d.getMonth() + meses, 1);
  const ultimo = new Date(objetivo.getFullYear(), objetivo.getMonth() + 1, 0).getDate();
  objetivo.setDate(Math.min(dia, ultimo));
  return hoyLocal(objetivo);
}

export function siguienteFecha(r: Pick<Recurrente, 'proxima_fecha' | 'frecuencia'>): string {
  const meses = FRECUENCIAS.find((f) => f.valor === r.frecuencia)?.meses || 1;
  return sumarMeses(r.proxima_fecha, meses);
}

export async function listarRecurrentes(): Promise<Recurrente[]> {
  const { data, error } = await createClient()
    .from('mantenimientos_recurrentes')
    .select('*')
    .order('proxima_fecha', { ascending: true });
  if (error) throw error;
  return (data as Recurrente[]) || [];
}

export async function guardarRecurrente(r: Omit<Recurrente, 'id' | 'ultima_programacion'> & { id?: string }): Promise<void> {
  const supabase = createClient();
  const fila = {
    cliente_id: r.cliente_id,
    proyecto: r.proyecto.trim(),
    descripcion: r.descripcion?.trim() || null,
    frecuencia: r.frecuencia,
    proxima_fecha: r.proxima_fecha,
    hora: r.hora || null,
    duracion_min: r.duracion_min,
    tecnico_ids: r.tecnico_ids,
    notas: r.notas?.trim() || null,
    activo: r.activo,
  };
  const { error } = r.id
    ? await supabase.from('mantenimientos_recurrentes').update(fila).eq('id', r.id)
    : await supabase.from('mantenimientos_recurrentes').insert(fila);
  if (error) throw error;
}

export async function eliminarRecurrente(id: string): Promise<void> {
  const { error } = await createClient().from('mantenimientos_recurrentes').delete().eq('id', id);
  if (error) throw error;
}

// Después de crear el servicio del periodo: guarda cuál fue y avanza la
// próxima fecha. «Saltar» avanza sin crear servicio.
export async function avanzarRecurrente(r: Recurrente, servicioId: string | null): Promise<void> {
  const supabase = createClient();
  const nueva = siguienteFecha(r);
  const { error } = await supabase
    .from('mantenimientos_recurrentes')
    .update({
      proxima_fecha: nueva,
      ...(servicioId ? { ultimo_servicio_id: servicioId, ultima_programacion: r.proxima_fecha } : {}),
    })
    .eq('id', r.id);
  if (error) throw error;
  if (!servicioId) {
    await registrarAccionGlobal('cambio_en_dia', 'servicio', null, `Saltó el mantenimiento recurrente de «${r.proyecto}» del ${r.proxima_fecha}; el siguiente queda el ${nueva}`);
  }
}

export function porProgramar(lista: Recurrente[], hoy: string): Recurrente[] {
  const limite = hoyLocal(new Date(fechaLocal(hoy).getTime() + DIAS_AVISO * 86400000));
  return lista.filter((r) => r.activo && r.proxima_fecha <= limite);
}
