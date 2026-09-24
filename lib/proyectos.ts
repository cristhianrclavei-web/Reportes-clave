import { createClient } from './supabaseClient';
import { registrarAccionGlobal } from './auditoriaGlobal';
import type { Cliente } from './clientes';

export type EstadoProyecto = 'propuesta' | 'en_curso' | 'concluido';

export type Proyecto = {
  id: string;
  cliente_id: string;
  sistema: string;
  nombre: string;
  descripcion: string | null;
  estado: EstadoProyecto;
  created_by: string;
  created_at: string;
  updated_at: string;
  concluido_en: string | null;
};

export type DocumentoProyecto = {
  id: string;
  proyecto_id: string;
  nombre: string;
  descripcion: string | null;
  archivo_path: string;
  archivo_nombre_original: string | null;
  subido_por: string;
  created_at: string;
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

export type CotizacionVinculada = {
  cotizacion_id: string;
  folio: string;
  empresa: string;
  estado: string;
  total: number;
  moneda: 'MXN' | 'USD';
};

// Sugerencias para el formulario — mismo catálogo de sistemas que ya se usa
// al armar cotizaciones, para no inventar una lista paralela.
export const SISTEMAS_SUGERIDOS = [
  'CCTV', 'Control de Acceso', 'Control de Acceso Vehicular', 'Alarma & Detección de Humo',
  'Alarma de Intrusión', 'Red Contra Incendio', 'Automatización', 'Paneles Solares', 'Instalaciones Eléctricas',
];

export const TIPOS_DOCUMENTO_SUGERIDOS = [
  'Planos', 'Formato de mantenimiento', 'Formato de interconexión', 'Manual', 'Garantía', 'Otro',
];

// Crea un proyecto para un cliente que YA existe (se llega aquí desde
// dentro de la ficha del cliente, así que no hace falta resolver/crear el
// cliente por nombre — a diferencia de cuando este módulo no tenía todavía
// una pantalla de cliente propia).
export async function crearProyectoParaCliente(input: {
  clienteId: string;
  sistema: string;
  nombre: string;
  descripcion: string;
}): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  if (!input.sistema.trim()) throw new Error('Falta el sistema.');
  if (!input.nombre.trim()) throw new Error('Falta el nombre del proyecto.');

  const { data: proyecto, error } = await supabase
    .from('proyectos')
    .insert({
      cliente_id: input.clienteId,
      sistema: input.sistema.trim(),
      nombre: input.nombre.trim(),
      descripcion: input.descripcion.trim() || null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) throw error;

  await registrarAccionGlobal(
    'creo_proyecto',
    'proyecto',
    proyecto.id,
    `Creó «${input.nombre.trim()}» (${input.sistema.trim()})`
  );

  return proyecto.id as string;
}

export async function obtenerProyecto(id: string): Promise<{
  proyecto: Proyecto;
  cliente: Cliente;
  documentos: DocumentoProyecto[];
  cotizaciones: CotizacionVinculada[];
}> {
  const supabase = createClient();
  const { data: proyecto, error: e1 } = await supabase.from('proyectos').select('*').eq('id', id).single();
  if (e1) throw e1;

  const [{ data: cliente, error: e2 }, { data: documentos, error: e3 }, { data: vinculos, error: e4 }] = await Promise.all([
    supabase.from('clientes').select('*').eq('id', (proyecto as Proyecto).cliente_id).single(),
    supabase.from('proyecto_documentos').select('*, profiles(full_name)').eq('proyecto_id', id).order('created_at', { ascending: false }),
    supabase.from('proyecto_cotizaciones').select('cotizacion_id, cotizaciones(folio, empresa, estado, total, moneda)').eq('proyecto_id', id),
  ]);
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;

  const cotizaciones: CotizacionVinculada[] = ((vinculos as any[]) || [])
    .filter((v) => v.cotizaciones)
    .map((v) => ({ cotizacion_id: v.cotizacion_id, ...v.cotizaciones }));

  return {
    proyecto: proyecto as Proyecto,
    cliente: cliente as Cliente,
    documentos: (documentos as DocumentoProyecto[]) || [],
    cotizaciones,
  };
}

export async function actualizarEstadoProyecto(id: string, estado: EstadoProyecto): Promise<void> {
  const supabase = createClient();
  const { data: proyecto, error: eGet } = await supabase.from('proyectos').select('nombre').eq('id', id).single();
  if (eGet) throw eGet;

  // concluido_en se llena solo al llegar a "Concluido" y se limpia si se
  // regresa a otro estado (fue un error marcarlo, no hay fecha real que
  // conservar).
  const { error } = await supabase
    .from('proyectos')
    .update({
      estado,
      updated_at: new Date().toISOString(),
      concluido_en: estado === 'concluido' ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) throw error;

  const ESTADO_LABEL: Record<EstadoProyecto, string> = { propuesta: 'Propuesta', en_curso: 'En curso', concluido: 'Concluido' };
  await registrarAccionGlobal('actualizo_estado_proyecto', 'proyecto', id, `Cambió «${proyecto.nombre}» a ${ESTADO_LABEL[estado]}`);
}

export async function eliminarProyecto(id: string): Promise<void> {
  const supabase = createClient();
  const { data: proyecto, error: eGet } = await supabase.from('proyectos').select('nombre').eq('id', id).single();
  if (eGet) throw eGet;

  const { data: docs } = await supabase.from('proyecto_documentos').select('archivo_path').eq('proyecto_id', id);
  const paths = (docs || []).map((d: any) => d.archivo_path as string).filter(Boolean);

  const { error } = await supabase.from('proyectos').delete().eq('id', id);
  if (error) throw error;

  if (paths.length > 0) {
    try {
      await supabase.storage.from('proyectos-documentos').remove(paths);
    } catch (e) {
      console.error('No se pudieron limpiar algunos documentos del proyecto eliminado:', e);
    }
  }

  await registrarAccionGlobal('elimino_proyecto', 'proyecto', id, `Eliminó el proyecto «${proyecto.nombre}»`);
}

export async function agregarDocumento(
  proyectoId: string,
  input: { nombre: string; descripcion: string; archivo: File }
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  if (!input.nombre.trim()) throw new Error('Falta indicar de qué es el documento.');

  const ext = input.archivo.name.split('.').pop() || 'bin';
  const path = `${proyectoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: eUp } = await supabase.storage
    .from('proyectos-documentos')
    .upload(path, input.archivo, { contentType: input.archivo.type || 'application/octet-stream' });
  if (eUp) throw new Error('No se pudo subir el archivo: ' + eUp.message);

  const { error } = await supabase.from('proyecto_documentos').insert({
    proyecto_id: proyectoId,
    nombre: input.nombre.trim(),
    descripcion: input.descripcion.trim() || null,
    archivo_path: path,
    archivo_nombre_original: input.archivo.name,
    subido_por: user.id,
  });
  if (error) throw error;

  await supabase.from('proyectos').update({ updated_at: new Date().toISOString() }).eq('id', proyectoId);
}

export async function eliminarDocumento(documentoId: string, archivoPath: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('proyecto_documentos').delete().eq('id', documentoId);
  if (error) throw error;
  try {
    await supabase.storage.from('proyectos-documentos').remove([archivoPath]);
  } catch (e) {
    console.error('No se pudo borrar el archivo del documento:', e);
  }
}

export async function obtenerUrlDocumento(archivoPath: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage.from('proyectos-documentos').createSignedUrl(archivoPath, 3600);
  return data?.signedUrl || null;
}

// Cotizaciones que se pueden vincular: por folio o empresa. No hace falta
// que coincida el nombre exacto del cliente del proyecto — a veces la
// cotización se hizo antes de que existiera el proyecto, o el nombre no
// quedó idéntico.
export async function buscarCotizacionesParaVincular(busqueda: string): Promise<CotizacionVinculada[]> {
  const supabase = createClient();
  const q = busqueda.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('id, folio, empresa, estado, total, moneda')
    .or(`folio.ilike.%${q}%,empresa.ilike.%${q}%`)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return ((data as any[]) || []).map((c) => ({
    cotizacion_id: c.id,
    folio: c.folio,
    empresa: c.empresa,
    estado: c.estado,
    total: c.total,
    moneda: c.moneda,
  }));
}

export async function vincularCotizacion(proyectoId: string, cotizacionId: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  const { error } = await supabase
    .from('proyecto_cotizaciones')
    .insert({ proyecto_id: proyectoId, cotizacion_id: cotizacionId, vinculado_por: user.id });
  if (error) {
    if (error.code === '23505') throw new Error('Esa cotización ya está vinculada a este proyecto.');
    throw error;
  }
}

export async function desvincularCotizacion(proyectoId: string, cotizacionId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('proyecto_cotizaciones')
    .delete()
    .eq('proyecto_id', proyectoId)
    .eq('cotizacion_id', cotizacionId);
  if (error) throw error;
}
