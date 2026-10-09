import { reducirFoto } from './reducirFoto';
import type { Avance } from './useAvanceGuardado';
import { createClient } from './supabaseClient';
import { notificar } from './push';
import { Articulo, listarArticulos, mapaDeExistencias } from './almacen';

// Vales de almacén (patch_vales_almacen.sql): el técnico pide, el almacén
// entrega, el técnico firma, devuelve con foto y el almacén confirma. Cada
// paso es una función de la base que valida quién lo hace y mueve el
// inventario; aquí solo se llaman y se avisa a quien sigue.

export type EstadoVale = 'solicitado' | 'por_firmar' | 'en_uso' | 'devolucion_por_confirmar' | 'cerrado' | 'rechazado' | 'cancelado';

export const ETIQUETA_ESTADO: Record<EstadoVale, { label: string; cls: string }> = {
  solicitado: { label: 'Por entregar', cls: 'bg-amber/15 text-amber' },
  por_firmar: { label: 'Por firmar', cls: 'bg-amber/15 text-amber' },
  en_uso: { label: 'En uso', cls: 'bg-teal/15 text-teal' },
  devolucion_por_confirmar: { label: 'Devolución por confirmar', cls: 'bg-amber/15 text-amber' },
  cerrado: { label: 'Cerrado', cls: 'bg-surface-2 text-muted' },
  rechazado: { label: 'Rechazado', cls: 'bg-red/12 text-red' },
  cancelado: { label: 'Cancelado', cls: 'bg-surface-2 text-faint' },
};

export const MOTIVOS_FALTANTE: { valor: string; label: string }[] = [
  { valor: 'consumido', label: 'Se consumió' },
  { valor: 'en_obra', label: 'Se quedó en obra' },
  { valor: 'danado', label: 'Se dañó' },
  { valor: 'perdido', label: 'Se perdió' },
  { valor: 'otro', label: 'Otro' },
];

export type ValeItem = {
  id: string;
  articulo_id: string;
  orden: number;
  cantidad_solicitada: number;
  cantidad_entregada: number | null;
  cantidad_devuelta: number | null;
  cantidad_recibida: number | null;
  motivo_faltante: string | null;
  nota: string | null;
  articulo: Pick<Articulo, 'id' | 'descripcion' | 'unidad' | 'categoria' | 'marca' | 'modelo' | 'retornable'> & { almacen_ubicaciones?: { nombre: string } | null };
};

export type Vale = {
  id: string;
  folio: string;
  tecnico_id: string;
  tecnico?: string;
  cliente_id: string | null;
  cliente_nombre: string;
  servicio_id: string | null;
  nota: string | null;
  estado: EstadoVale;
  entregado_en: string | null;
  nota_entrega: string | null;
  firma_recepcion: string | null;
  firmado_en: string | null;
  fecha_limite: string | null;
  extension_dias: number | null;
  extension_motivo: string | null;
  extension_estado: 'pendiente' | 'aprobada' | 'rechazada' | null;
  devuelto_en: string | null;
  fotos_devolucion: string[];
  nota_devolucion: string | null;
  recibido_en: string | null;
  nota_recepcion: string | null;
  motivo_rechazo: string | null;
  created_at: string;
  items: ValeItem[];
};

export type AltaSolicitada = {
  id: string;
  tecnico_id: string;
  tecnico?: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  contexto: string | null;
  estado: 'pendiente' | 'atendida' | 'descartada';
  created_at: string;
};

// ¿Ya pasó su plazo? (en uso o por firmar, con fecha límite vencida)
export function valeVencido(v: Pick<Vale, 'estado' | 'fecha_limite'>, ahora = Date.now()): boolean {
  return (v.estado === 'en_uso' || v.estado === 'por_firmar') && !!v.fecha_limite && new Date(v.fecha_limite).getTime() < ahora;
}

const SELECT_VALE =
  '*, profiles!almacen_vales_tecnico_id_fkey(full_name), almacen_vale_items(*, almacen_articulos(id, descripcion, unidad, categoria, marca, modelo, retornable, almacen_ubicaciones(nombre)))';

function mapear(r: any): Vale {
  const { profiles, almacen_vale_items, ...resto } = r;
  return {
    ...resto,
    tecnico: (Array.isArray(profiles) ? profiles[0]?.full_name : profiles?.full_name) || 'Personal técnico',
    items: ((almacen_vale_items as any[]) || [])
      .map(({ almacen_articulos, ...i }) => ({ ...i, articulo: almacen_articulos }))
      .sort((a, b) => a.orden - b.orden),
  } as Vale;
}

// Técnico: los suyos. Almacén/supervisor: todos (la base filtra con RLS).
export async function listarVales(opciones: { soloMios?: boolean; limite?: number } = {}): Promise<Vale[]> {
  const supabase = createClient();
  let q = supabase.from('almacen_vales').select(SELECT_VALE).order('created_at', { ascending: false }).limit(opciones.limite || 200);
  if (opciones.soloMios) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    q = q.eq('tecnico_id', user.id);
  }
  const { data, error } = await q;
  if (error) throw error;
  return ((data as any[]) || []).map(mapear);
}

export async function obtenerVale(id: string): Promise<Vale | null> {
  const { data, error } = await createClient().from('almacen_vales').select(SELECT_VALE).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapear(data) : null;
}

export async function listarAltasPendientes(): Promise<AltaSolicitada[]> {
  const { data, error } = await createClient()
    .from('almacen_altas_solicitadas')
    .select('*, profiles!almacen_altas_solicitadas_tecnico_id_fkey(full_name)')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data as any[]) || []).map(({ profiles, ...a }) => ({ ...a, tecnico: profiles?.full_name || 'Personal técnico' }));
}

// Catálogo con existencias para el formulario del técnico.
export async function catalogoParaPedir(grupoId?: string | null): Promise<{ articulo: Articulo; existencia: number }[]> {
  const [arts, mapa] = await Promise.all([listarArticulos(true), mapaDeExistencias(grupoId)]);
  return arts.map((a) => ({ articulo: a, existencia: Math.max(0, mapa[a.id] || 0) }));
}

async function nombreUsuario(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Alguien';
  const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
  return data?.full_name || 'Alguien';
}

// ---------- Técnico ----------
export async function crearVale(input: {
  clienteId: string | null;
  clienteNombre: string;
  servicioId: string | null;
  nota: string;
  items: { articuloId: string; cantidad: number; descripcion: string }[];
}, onAvance?: Avance): Promise<{ id: string; folio: string }> {
  onAvance?.(25, 'Creando el vale');
  const { data, error } = await createClient().rpc('crear_vale', {
    p_cliente_id: input.clienteId,
    p_cliente_nombre: input.clienteNombre,
    p_servicio_id: input.servicioId,
    p_nota: input.nota,
    p_items: input.items.map((i) => ({ articulo_id: i.articuloId, cantidad: i.cantidad })),
  });
  if (error) throw new Error(error.message);
  const r = data as { id: string; folio: string };
  onAvance?.(72, 'Avisando al almacén');
  const quien = await nombreUsuario();
  await notificar({
    destino: 'almacen',
    tipo: 'vale_almacen',
    titulo: `Vale ${r.folio}: piden al almacén`,
    mensaje: `${quien} pide ${input.items.length} artículo(s) para ${input.clienteNombre}: ${input.items.slice(0, 3).map((i) => i.descripcion).join(', ')}${input.items.length > 3 ? '…' : ''}`,
    url: '/dashboard/almacen?sub=vales',
    tag: `vale-${r.id}`,
  });
  return r;
}

export async function solicitarAlta(input: { descripcion: string; cantidad: number; unidad: string; contexto: string }): Promise<void> {
  const { error } = await createClient().rpc('solicitar_alta_articulo', {
    p_descripcion: input.descripcion,
    p_cantidad: input.cantidad,
    p_unidad: input.unidad,
    p_contexto: input.contexto,
  });
  if (error) throw new Error(error.message);
  const quien = await nombreUsuario();
  await notificar({
    destino: 'almacen',
    tipo: 'vale_almacen',
    titulo: 'Piden algo que no está en inventario',
    mensaje: `${quien}: ${input.cantidad} ${input.unidad} de «${input.descripcion}»${input.contexto ? ` (${input.contexto})` : ''}. Si lo tienes, dalo de alta.`,
    url: '/dashboard/almacen?sub=vales',
    tag: 'alta-articulo',
  });
}

export async function firmarVale(vale: Vale, firma: string): Promise<void> {
  const { error } = await createClient().rpc('firmar_vale', { p_vale: vale.id, p_firma: firma });
  if (error) throw new Error(error.message);
}

export async function subirFotoDevolucion(valeId: string, file: File | Blob): Promise<string> {
  file = await reducirFoto(file);
  const ext = (file as File).name?.split('.').pop() || 'jpg';
  const path = `vales/${valeId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await createClient().storage.from('almacen').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) throw new Error('No se pudo subir la foto: ' + error.message);
  return path;
}

export async function devolverVale(vale: Vale, items: { id: string; cantidad: number; motivo: string | null; nota: string }[], fotos: string[], nota: string): Promise<void> {
  const { error } = await createClient().rpc('devolver_vale', {
    p_vale: vale.id,
    p_items: items.map((i) => ({ id: i.id, cantidad: i.cantidad, motivo: i.motivo, nota: i.nota })),
    p_fotos: fotos,
    p_nota: nota,
  });
  if (error) throw new Error(error.message);
  await notificar({
    destino: 'almacen',
    tipo: 'vale_almacen',
    titulo: `Vale ${vale.folio}: devolución por confirmar`,
    mensaje: `${vale.tecnico || 'Quien lo llevó'} devolvió lo del vale de ${vale.cliente_nombre}. Confirma lo que recibiste.`,
    url: '/dashboard/almacen?sub=vales',
    tag: `vale-${vale.id}`,
  });
}

export async function pedirMasDias(vale: Vale, dias: number, motivo: string): Promise<void> {
  const { error } = await createClient().rpc('solicitar_extension_vale', { p_vale: vale.id, p_dias: dias, p_motivo: motivo });
  if (error) throw new Error(error.message);
  await notificar({
    destino: 'almacen',
    tipo: 'vale_almacen',
    titulo: `Vale ${vale.folio}: piden ${dias} día(s) más`,
    mensaje: `${vale.tecnico || 'Personal técnico'}: ${motivo}`,
    url: '/dashboard/almacen?sub=vales',
    tag: `vale-${vale.id}`,
  });
}

// La solicitud de más días sigue sin respuesta: se le recuerda al almacén.
// No cambia nada en el vale; solo vuelve a avisar.
export async function recordarMasDias(vale: Vale): Promise<void> {
  await notificar({
    destino: 'almacen',
    tipo: 'vale_almacen',
    titulo: `Vale ${vale.folio}: sigue esperando ${vale.extension_dias} día(s) más`,
    mensaje: `${vale.tecnico || 'Personal técnico'} pidió ampliar el plazo y no ha tenido respuesta${vale.extension_motivo ? `: ${vale.extension_motivo}` : '.'}`,
    url: '/dashboard/almacen?sub=vales',
    tag: `vale-${vale.id}`,
  });
}

export async function cancelarVale(vale: Vale, motivo: string, comoAlmacen = false): Promise<void> {
  const { error } = await createClient().rpc('cancelar_vale', { p_vale: vale.id, p_motivo: motivo });
  if (error) throw new Error(error.message);
  if (comoAlmacen) {
    await notificar({
      usuarios: [vale.tecnico_id],
      tipo: 'vale_almacen',
      titulo: `Vale ${vale.folio} rechazado`,
      mensaje: motivo,
      url: '/checklists',
      tag: `vale-${vale.id}`,
    });
  }
}

// ---------- Almacén ----------
export async function entregarVale(vale: Vale, items: { id: string; cantidad: number }[], nota: string): Promise<void> {
  const { error } = await createClient().rpc('entregar_vale', { p_vale: vale.id, p_items: items, p_nota: nota });
  if (error) throw new Error(error.message);
  await notificar({
    usuarios: [vale.tecnico_id],
    tipo: 'vale_almacen',
    titulo: `Vale ${vale.folio}: firma de recibido`,
    mensaje: `El almacén te entregó lo del vale de ${vale.cliente_nombre}. Revísalo y firma de recibido en la app.`,
    url: '/checklists',
    tag: `vale-${vale.id}`,
  });
}

export async function recibirDevolucion(vale: Vale, items: { id: string; cantidad: number }[], nota: string): Promise<void> {
  const { error } = await createClient().rpc('recibir_devolucion_vale', { p_vale: vale.id, p_items: items, p_nota: nota });
  if (error) throw new Error(error.message);
  await notificar({
    usuarios: [vale.tecnico_id],
    tipo: 'vale_almacen',
    titulo: `Vale ${vale.folio} cerrado`,
    mensaje: 'El almacén confirmó tu devolución.',
    url: '/checklists',
    tag: `vale-${vale.id}`,
  });
}

export async function resolverMasDias(vale: Vale, aprobar: boolean): Promise<void> {
  const { error } = await createClient().rpc('resolver_extension_vale', { p_vale: vale.id, p_aprobar: aprobar });
  if (error) throw new Error(error.message);
  await notificar({
    usuarios: [vale.tecnico_id],
    tipo: 'vale_almacen',
    titulo: `Vale ${vale.folio}: ${aprobar ? 'te dieron más días' : 'no se aprobaron más días'}`,
    mensaje: aprobar ? `Tienes ${vale.extension_dias} día(s) más para devolverlo.` : 'Devuelve lo del vale lo antes posible.',
    url: '/checklists',
    tag: `vale-${vale.id}`,
  });
}

export async function resolverAlta(id: string, estado: 'atendida' | 'descartada', articuloId: string | null, nota: string): Promise<void> {
  const { error } = await createClient().rpc('resolver_alta_articulo', { p_id: id, p_estado: estado, p_articulo: articuloId, p_nota: nota });
  if (error) throw new Error(error.message);
}

export async function urlsFotos(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data } = await createClient().storage.from('almacen').createSignedUrls(paths, 3600);
  return (data || []).map((d) => d.signedUrl || '');
}

// --- Préstamo entre técnicos (patch_almacen_fase_d.sql) ---

export type Traspaso = {
  id: string;
  folio: string;
  vale_origen_id: string;
  de_tecnico: string;
  a_tecnico: string;
  items: { item: string; cantidad: number }[];
  nota: string | null;
  estado: 'pendiente' | 'aceptado' | 'rechazado' | 'cancelado';
  vale_destino_id: string | null;
  motivo_rechazo: string | null;
  created_at: string;
  de?: { full_name: string | null } | null;
  a?: { full_name: string | null } | null;
};

const SELECT_TRASPASO = '*, de:profiles!almacen_traspasos_de_tecnico_fkey(full_name), a:profiles!almacen_traspasos_a_tecnico_fkey(full_name)';

export const nombreCorto = (n?: string | null) => (n || '').split(' ').slice(0, 2).join(' ') || 'Personal técnico';

// Préstamos que me quieren hacer (pendientes de aceptar). [] si falta el SQL.
export async function traspasosParaMi(): Promise<Traspaso[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('almacen_traspasos')
    .select(SELECT_TRASPASO)
    .eq('a_tecnico', user.id)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });
  return error ? [] : ((data as Traspaso[]) || []);
}

export async function traspasosDeVale(valeId: string): Promise<Traspaso[]> {
  const { data, error } = await createClient()
    .from('almacen_traspasos')
    .select(SELECT_TRASPASO)
    .or(`vale_origen_id.eq.${valeId},vale_destino_id.eq.${valeId}`)
    .order('created_at', { ascending: false });
  return error ? [] : ((data as Traspaso[]) || []);
}

export async function companerosParaPrestamo(): Promise<{ id: string; full_name: string }[]> {
  const { data, error } = await createClient().rpc('companeros_para_prestamo');
  if (error) throw new Error(error.message);
  return (data as { id: string; full_name: string }[]) || [];
}

export async function proponerTraspaso(vale: Vale, aTecnico: { id: string; full_name: string }, items: { item: string; cantidad: number }[], nota: string): Promise<void> {
  const { data, error } = await createClient().rpc('proponer_traspaso', {
    p_vale: vale.id, p_a_tecnico: aTecnico.id, p_items: items, p_nota: nota,
  });
  if (error) throw new Error(error.message);
  await notificar({
    usuarios: [aTecnico.id],
    traspaso: data as string,
    tipo: 'vale_almacen',
    titulo: `${nombreCorto(vale.tecnico)} te quiere prestar herramienta`,
    mensaje: `De su vale ${vale.folio} (${vale.cliente_nombre}). Acéptalo con tu firma en Vales de almacén.`,
    url: '/checklists',
    tag: `traspaso-${data}`,
  });
}

export async function aceptarTraspaso(t: Traspaso, firma: string): Promise<void> {
  const { error } = await createClient().rpc('aceptar_traspaso', { p_traspaso: t.id, p_firma: firma });
  if (error) throw new Error(error.message);
  const quien = nombreCorto(t.a?.full_name);
  await Promise.all([
    notificar({ usuarios: [t.de_tecnico], traspaso: t.id, tipo: 'vale_almacen', titulo: `${quien} recibió el préstamo ${t.folio}`, mensaje: 'Ya quedó a su nombre; tu vale bajó esas cantidades.', url: '/checklists', tag: `traspaso-${t.id}` }),
    notificar({ destino: 'almacen', tipo: 'vale_almacen', titulo: `Préstamo ${t.folio} entre compañeros`, mensaje: `${nombreCorto(t.de?.full_name)} → ${quien}. Ahora lo tiene ${quien}.`, url: '/dashboard/almacen?sub=vales', tag: `traspaso-${t.id}` }),
  ]);
}

export async function rechazarTraspaso(t: Traspaso, motivo: string): Promise<void> {
  const { error } = await createClient().rpc('resolver_traspaso', { p_traspaso: t.id, p_estado: 'rechazado', p_motivo: motivo });
  if (error) throw new Error(error.message);
  await notificar({ usuarios: [t.de_tecnico], traspaso: t.id, tipo: 'vale_almacen', titulo: `${nombreCorto(t.a?.full_name)} no aceptó el préstamo ${t.folio}`, mensaje: motivo || 'Sigue a tu nombre.', url: '/checklists', tag: `traspaso-${t.id}` });
}

export async function cancelarTraspaso(t: Traspaso): Promise<void> {
  const { error } = await createClient().rpc('resolver_traspaso', { p_traspaso: t.id, p_estado: 'cancelado', p_motivo: '' });
  if (error) throw new Error(error.message);
}

// Cuánto de cada partida puede todavía prestar (entregado − comprometido en préstamos pendientes).
export function disponiblesParaPrestar(vale: Vale, pendientes: Traspaso[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of vale.items) out[i.id] = Number(i.cantidad_entregada || 0);
  for (const t of pendientes) if (t.estado === 'pendiente' && t.vale_origen_id === vale.id) for (const x of t.items) out[x.item] = (out[x.item] || 0) - Number(x.cantidad);
  return out;
}

// Lo que salió del almacén para un servicio (vales entregados), neto de lo
// que ya se devolvió: sirve para llenar los materiales del reporte.
export async function salidasDelServicio(servicioId: string): Promise<{ folios: string[]; items: { articulo: ValeItem['articulo']; cantidad: number }[] }> {
  const { data, error } = await createClient()
    .from('almacen_vales')
    .select(SELECT_VALE)
    .eq('servicio_id', servicioId)
    .in('estado', ['por_firmar', 'en_uso', 'devolucion_por_confirmar', 'cerrado']);
  if (error) return { folios: [], items: [] };
  const vales = ((data as any[]) || []).map(mapear);
  const porArticulo = new Map<string, { articulo: ValeItem['articulo']; cantidad: number }>();
  for (const v of vales) for (const i of v.items) {
    const neto = Number(i.cantidad_entregada || 0) - Number(i.cantidad_recibida ?? i.cantidad_devuelta ?? 0);
    if (neto <= 0 || !i.articulo) continue;
    const prev = porArticulo.get(i.articulo_id);
    porArticulo.set(i.articulo_id, { articulo: i.articulo, cantidad: (prev?.cantidad || 0) + neto });
  }
  return { folios: vales.map((v) => v.folio), items: [...porArticulo.values()] };
}
