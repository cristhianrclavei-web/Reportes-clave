import { reducirFoto } from './reducirFoto';
import { createClient } from './supabaseClient';
import { notificar } from './push';
import { fechaLocal, hoyLocal, sumarDias } from './fechaHoy';
import type { Festivo } from './avisos';

// Solicitudes de personal (patch_solicitudes_personal.sql): horas extra,
// vacaciones y permisos, con firma del solicitante y de quien autoriza.

export type TipoSolicitud = 'horas_extra' | 'vacaciones' | 'permiso';
export type EstadoSolicitud = 'pendiente' | 'correccion' | 'aprobada' | 'rechazada' | 'cancelada';

export type Solicitud = {
  id: string;
  folio: string;
  tipo: TipoSolicitud;
  solicitante_id: string;
  estado: EstadoSolicitud;
  fecha: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  horas: number | null;
  actividades: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  servicio_id: string | null;
  proyecto: string | null;
  corte_pago: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  dias: number | null;
  medio_dia: boolean;
  goce_sueldo: boolean | null;
  motivo_tipo: string | null;
  motivo: string | null;
  cubre_nombre: string | null;
  fecha_regreso: string | null;
  fotos: string[];
  nota: string | null;
  firma_solicitante: string;
  revisado_por: string | null;
  revisado_nombre: string | null;
  revisado_en: string | null;
  firma_autoriza: string | null;
  comentario_revision: string | null;
  historial: { en: string; por: string; accion: string; comentario?: string }[];
  created_at: string;
  updated_at: string;
  solicitante?: { full_name: string | null } | null;
};

export const TIPO_LABEL: Record<TipoSolicitud, string> = {
  horas_extra: 'Horas extra',
  vacaciones: 'Vacaciones',
  permiso: 'Permiso',
};

export const ESTADO_SOLICITUD: Record<EstadoSolicitud, { label: string; cls: string }> = {
  pendiente: { label: 'Por autorizar', cls: 'bg-amber/15 text-amber' },
  correccion: { label: 'Corrección pedida', cls: 'bg-amber/20 text-amber ring-1 ring-amber/30' },
  aprobada: { label: '✓ Autorizada', cls: 'bg-teal/12 text-teal ring-1 ring-teal/25' },
  rechazada: { label: 'Rechazada', cls: 'bg-red/12 text-red ring-1 ring-red/25' },
  cancelada: { label: 'Cancelada', cls: 'bg-surface-2 text-ink/60 ring-1 ring-line-strong' },
};

export const MOTIVOS_PERMISO = [
  { valor: 'personal', label: 'Asunto personal' },
  { valor: 'medico', label: 'Cita o incapacidad médica' },
  { valor: 'familiar', label: 'Asunto familiar' },
  { valor: 'tramite', label: 'Trámite' },
  { valor: 'otro', label: 'Otro' },
];

// ------------------------------------------------------------------
// Días de pago
// ------------------------------------------------------------------
// Se paga el 15 y el último día del mes (30, 31, o 28/29 en febrero). Si
// cae en sábado o domingo, se paga el viernes anterior.

const pad = (n: number) => String(n).padStart(2, '0');

function ajustarFinDeSemana(fecha: string): string {
  const d = fechaLocal(fecha).getDay();
  if (d === 6) return sumarDias(fecha, -1); // sábado → viernes
  if (d === 0) return sumarDias(fecha, -2); // domingo → viernes
  return fecha;
}

export function cortesDelMes(anio: number, mes1a12: number): [string, string] {
  const diasMes = new Date(anio, mes1a12, 0).getDate();
  const a = `${anio}-${pad(mes1a12)}-15`;
  const b = `${anio}-${pad(mes1a12)}-${pad(diasMes)}`;
  return [ajustarFinDeSemana(a), ajustarFinDeSemana(b)];
}

// Día de pago en el que entra un trabajo hecho en `fecha` (el siguiente
// pago en o después de esa fecha).
export function corteDe(fecha: string): string {
  const d = fechaLocal(fecha);
  for (let i = 0; i < 3; i++) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1 + i;
    const anio = y + Math.floor((m - 1) / 12);
    const mes = ((m - 1) % 12) + 1;
    for (const c of cortesDelMes(anio, mes)) if (c >= fecha) return c;
  }
  return fecha;
}

// Días hábiles (lunes a viernes) que faltan de `hoy` al pago; 0 = hoy es el pago.
export function diasHabilesHasta(hoy: string, corte: string): number {
  let n = 0;
  let f = hoy;
  while (f < corte) {
    f = sumarDias(f, 1);
    const d = fechaLocal(f).getDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

// Recordatorio: los 2 días hábiles antes del pago, para que entre en el
// cierre de nómina (el día del pago ya es tarde). Si hoy es día de pago, se
// mira el siguiente.
export function recordatorioCorte(hoy: string = hoyLocal()): { corte: string; faltan: number } | null {
  let corte = corteDe(hoy);
  if (corte === hoy) corte = corteDe(sumarDias(hoy, 1));
  const faltan = diasHabilesHasta(hoy, corte);
  return faltan >= 1 && faltan <= 2 ? { corte, faltan } : null;
}

export function fechaBonita(f: string | null): string {
  if (!f) return '—';
  return fechaLocal(f).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Minutos entre dos horas «HH:MM»; si la de fin es menor o igual, cruzó la medianoche.
export function minutosEntre(inicio: string, fin: string): number {
  if (!inicio || !fin) return 0;
  const [h1, m1] = inicio.split(':').map(Number);
  const [h2, m2] = fin.split(':').map(Number);
  let m = h2 * 60 + m2 - (h1 * 60 + m1);
  if (m <= 0) m += 24 * 60;
  return m;
}

export function duracionTexto(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Días que se piden: de lunes a sábado sin contar domingos ni festivos (se
// puede ajustar a mano en el formulario).
export function diasSolicitados(inicio: string, fin: string, festivos: Festivo[], medioDia: boolean): number {
  if (!inicio || !fin || fin < inicio) return 0;
  if (inicio === fin && medioDia) return 0.5;
  let n = 0;
  for (let f = inicio; f <= fin; f = sumarDias(f, 1)) {
    if (fechaLocal(f).getDay() === 0) continue;
    if (festivos.some((x) => x.fecha === f)) continue;
    n++;
  }
  return n;
}

// Siguiente día de trabajo después del último día de ausencia.
export function diaDeRegreso(fin: string, festivos: Festivo[]): string {
  let f = sumarDias(fin, 1);
  while (fechaLocal(f).getDay() === 0 || festivos.some((x) => x.fecha === f)) f = sumarDias(f, 1);
  return f;
}

// ------------------------------------------------------------------
// Datos
// ------------------------------------------------------------------

const SELECT = '*, solicitante:profiles!solicitudes_personal_solicitante_id_fkey(full_name)';

export async function listarSolicitudes(opciones: { soloMias?: boolean } = {}): Promise<Solicitud[]> {
  const supabase = createClient();
  let q = supabase.from('solicitudes_personal').select(SELECT).order('created_at', { ascending: false }).limit(300);
  if (opciones.soloMias) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];
    q = q.eq('solicitante_id', session.user.id);
  }
  const { data, error } = await q;
  if (error) throw error;
  return ((data as Solicitud[]) || []).map((s) => ({ ...s, fotos: s.fotos || [], historial: s.historial || [] }));
}

export async function puedoAprobarPersonal(): Promise<boolean> {
  const { data, error } = await createClient().rpc('puedo_aprobar_personal');
  return !error && data === true;
}

export async function subirEvidencia(file: File): Promise<string> {
  file = await reducirFoto(file);
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sin sesión');
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('solicitudes').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) throw new Error('No se pudo subir la evidencia: ' + error.message);
  return path;
}

export async function urlsEvidencias(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data } = await createClient().storage.from('solicitudes').createSignedUrls(paths, 3600);
  return (data || []).map((d) => d.signedUrl || '').filter(Boolean);
}

export type DatosSolicitud = Partial<Omit<Solicitud, 'id' | 'folio' | 'solicitante_id' | 'estado' | 'historial' | 'created_at' | 'updated_at' | 'solicitante'>> & { tipo: TipoSolicitud };

function resumen(d: { tipo: TipoSolicitud; horas?: number | null; dias?: number | null; fecha?: string | null; fecha_inicio?: string | null }): string {
  if (d.tipo === 'horas_extra') return `${duracionTexto(Math.round((d.horas || 0) * 60))} el ${fechaBonita(d.fecha || null)}`;
  return `${d.dias ?? ''} día(s) desde el ${fechaBonita(d.fecha_inicio || null)}`;
}

export async function crearSolicitud(d: DatosSolicitud, nombre: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.from('solicitudes_personal').insert(d).select('id, folio, horas').single();
  if (error) throw new Error(error.message);
  await notificar({
    destino: 'personal',
    tipo: 'solicitud_personal',
    titulo: `${TIPO_LABEL[d.tipo]} por autorizar · ${data.folio}`,
    mensaje: `${nombre}: ${resumen({ ...d, horas: data.horas ?? d.horas })}`,
    url: '/dashboard/personal',
    tag: `solicitud-${data.id}`,
  });
  return data.id as string;
}

export async function actualizarSolicitud(s: Solicitud, d: Partial<DatosSolicitud>, nombre: string): Promise<void> {
  const { error } = await createClient().rpc('actualizar_solicitud_personal', { p_id: s.id, p: d });
  if (error) throw new Error(error.message);
  await notificar({
    destino: 'personal',
    tipo: 'solicitud_personal',
    titulo: `${s.folio} ${s.estado === 'correccion' ? 'corregida' : 'actualizada'}: por autorizar`,
    mensaje: `${nombre} ${s.estado === 'correccion' ? 'corrigió' : 'modificó'} su solicitud de ${TIPO_LABEL[s.tipo].toLowerCase()}.`,
    url: '/dashboard/personal',
    tag: `solicitud-${s.id}`,
  });
}

export async function cancelarSolicitud(id: string): Promise<void> {
  const { error } = await createClient().rpc('cancelar_solicitud_personal', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function resolverSolicitud(s: Solicitud, accion: 'aprobar' | 'rechazar' | 'correccion', comentario: string, firma?: string, nombre?: string): Promise<void> {
  const { error } = await createClient().rpc('resolver_solicitud_personal', {
    p_id: s.id, p_accion: accion, p_comentario: comentario, p_firma: firma || '', p_nombre: nombre || '',
  });
  if (error) throw new Error(error.message);
  const titulo = accion === 'aprobar' ? `${s.folio} autorizada` : accion === 'rechazar' ? `${s.folio} rechazada` : `${s.folio}: te piden una corrección`;
  await notificar({
    usuarios: [s.solicitante_id],
    tipo: 'solicitud_personal',
    titulo,
    mensaje: comentario || `Tu solicitud de ${TIPO_LABEL[s.tipo].toLowerCase()} fue autorizada.`,
    url: '/solicitudes',
    tag: `solicitud-${s.id}`,
  });
}
