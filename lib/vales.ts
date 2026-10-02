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
    tecnico: (Array.isArray(profiles) ? profiles[0]?.full_name : profiles?.full_name) || 'Técnico',
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
  return ((data as any[]) || []).map(({ profiles, ...a }) => ({ ...a, tecnico: profiles?.full_name || 'Técnico' }));
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
}): Promise<{ id: string; folio: string }> {
  const { data, error } = await createClient().rpc('crear_vale', {
    p_cliente_id: input.clienteId,
    p_cliente_nombre: input.clienteNombre,
    p_servicio_id: input.servicioId,
    p_nota: input.nota,
    p_items: input.items.map((i) => ({ articulo_id: i.articuloId, cantidad: i.cantidad })),
  });
  if (error) throw new Error(error.message);
  const r = data as { id: string; folio: string };
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
    mensaje: `${vale.tecnico || 'El técnico'} devolvió lo del vale de ${vale.cliente_nombre}. Confirma lo que recibiste.`,
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
    mensaje: `${vale.tecnico || 'El técnico'}: ${motivo}`,
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
