import { reducirFoto } from './reducirFoto';
import { createClient } from './supabaseClient';
import { coincideBusqueda } from './busqueda';
import { registrarAccionGlobal } from './auditoriaGlobal';
import type { Cliente } from './clientes';
import { etapaValida, nombreEtapa, type Etapa, type SistemaClave, SISTEMAS } from './proyectosEtapas';

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
  // patch_proyectos_centro.sql
  etapa: Etapa;
  sistemas: SistemaClave[];
  fecha_inicio: string | null;
  fecha_entrega: string | null;
  monto: number | null;
  moneda: 'MXN' | 'USD';
  responsable_id: string | null;
  etapa_desde: string | null;
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

// Texto que se guarda en la columna vieja `sistema` (la usan pantallas y
// reportes de antes): los nombres de los sistemas del proyecto.
export function textoSistemas(sistemas: readonly string[]): string {
  return sistemas.map((c) => SISTEMAS.find((x) => x.clave === c)?.nombre || c).join(' + ');
}

export type NuevoProyecto = {
  clienteId: string;
  nombre: string;
  sistemas: SistemaClave[];
  etapa: Etapa;
  descripcion: string;
  fechaInicio: string | null;
  fechaEntrega: string | null;
  monto: number | null;
  moneda: 'MXN' | 'USD';
  responsableId: string | null;
};

// Mismas reglas que la base (patch_proyectos_centro.sql), para avisar antes de guardar.
export function validarProyecto(p: Pick<NuevoProyecto, 'nombre' | 'sistemas' | 'fechaInicio' | 'fechaEntrega' | 'monto'>): Partial<Record<'nombre' | 'sistemas' | 'fechas' | 'monto', string>> {
  const errores: Partial<Record<'nombre' | 'sistemas' | 'fechas' | 'monto', string>> = {};
  if (!p.nombre.trim()) errores.nombre = 'Ponle nombre al proyecto.';
  else if (p.nombre.trim().length > 120) errores.nombre = 'Máximo 120 letras.';
  if (p.sistemas.length === 0) errores.sistemas = 'Elige al menos un sistema.';
  if (p.fechaInicio && p.fechaEntrega && p.fechaEntrega < p.fechaInicio) errores.fechas = 'La entrega no puede ser antes del inicio.';
  if (p.monto !== null && (!Number.isFinite(p.monto) || p.monto < 0)) errores.monto = 'Escribe un monto válido.';
  return errores;
}

function filaDeProyecto(p: Omit<NuevoProyecto, 'clienteId'>) {
  return {
    nombre: p.nombre.trim(),
    sistemas: p.sistemas,
    sistema: textoSistemas(p.sistemas),
    etapa: etapaValida(p.etapa, p.sistemas),
    descripcion: p.descripcion.trim() || null,
    fecha_inicio: p.fechaInicio || null,
    fecha_entrega: p.fechaEntrega || null,
    monto: p.monto,
    moneda: p.moneda,
    responsable_id: p.responsableId,
  };
}

// Crea un proyecto para un cliente que YA existe.
export async function crearProyecto(input: NuevoProyecto): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa. Vuelve a entrar.');
  const errores = validarProyecto(input);
  const primero = Object.values(errores)[0];
  if (primero) throw new Error(primero);

  const { data: proyecto, error } = await supabase
    .from('proyectos')
    .insert({ cliente_id: input.clienteId, created_by: user.id, ...filaDeProyecto(input) })
    .select('id')
    .single();
  if (error) throw new Error(mensajeProyecto(error, 'crear el proyecto'));

  await registrarAccionGlobal('creo_proyecto', 'proyecto', proyecto.id, `Creó «${input.nombre.trim()}» (${textoSistemas(input.sistemas)})`);
  return proyecto.id as string;
}

export async function actualizarProyecto(id: string, cambios: Omit<NuevoProyecto, 'clienteId'>): Promise<void> {
  const errores = validarProyecto(cambios);
  const primero = Object.values(errores)[0];
  if (primero) throw new Error(primero);
  const { error } = await createClient().from('proyectos').update(filaDeProyecto(cambios)).eq('id', id);
  if (error) throw new Error(mensajeProyecto(error, 'guardar el proyecto'));
}

export async function cambiarEtapaProyecto(proyecto: Pick<Proyecto, 'id' | 'nombre' | 'sistemas'>, etapa: Etapa): Promise<void> {
  const { error } = await createClient().from('proyectos').update({ etapa: etapaValida(etapa, proyecto.sistemas) }).eq('id', proyecto.id);
  if (error) throw new Error(mensajeProyecto(error, 'cambiar la etapa'));
  await registrarAccionGlobal('actualizo_estado_proyecto', 'proyecto', proyecto.id, `Cambió «${proyecto.nombre}» a ${nombreEtapa(etapa, proyecto.sistemas)}`);
}

export function mensajeProyecto(error: { message?: string; code?: string } | null | undefined, accion: string): string {
  const texto = error?.message || '';
  if (/column .*(etapa|sistemas|proyecto_id)|schema cache/i.test(texto)) return `No se pudo ${accion}: falta correr supabase/patch_proyectos_centro.sql en la base.`;
  if (/otro cliente/i.test(texto)) return `No se pudo ${accion}: ese proyecto es de otro cliente.`;
  if (/row-level security|permission/i.test(texto)) return `No tienes permiso para ${accion}.`;
  if (/violates check constraint/i.test(texto)) return `No se pudo ${accion}: algún dato no es válido.`;
  if (/fetch|network|load failed|timeout/i.test(texto)) return `No se pudo ${accion}: sin conexión. Revisa tu señal e intenta de nuevo.`;
  return `No se pudo ${accion}. ${texto}`.trim();
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

  const archivo = await reducirFoto(input.archivo);
  const ext = archivo.name.split('.').pop() || 'bin';
  const path = `${proyectoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: eUp } = await supabase.storage
    .from('proyectos-documentos')
    .upload(path, archivo, { contentType: archivo.type || 'application/octet-stream' });
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
  // Se filtra aquí (sin acentos ni mayúsculas) en vez de con ilike en la
  // base, que sí distingue «Ángel» de «angel».
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('id, folio, empresa, estado, total, moneda')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  const filtradas = ((data as any[]) || []).filter((c) => coincideBusqueda(`${c.folio} ${c.empresa}`, q)).slice(0, 10);
  return filtradas.map((c) => ({
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

// ---------- Todos los proyectos (tablero) ----------

export type ProyectoConCliente = Pick<Proyecto, 'id' | 'cliente_id' | 'nombre' | 'etapa' | 'sistemas' | 'fecha_entrega' | 'monto' | 'moneda' | 'responsable_id' | 'etapa_desde'> & { cliente: string };

export async function listarTodosProyectos(): Promise<ProyectoConCliente[]> {
  const { data, error } = await createClient()
    .from('proyectos')
    .select('id, cliente_id, nombre, etapa, sistemas, fecha_entrega, monto, moneda, responsable_id, etapa_desde, clientes(nombre)')
    .order('updated_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(mensajeProyecto(error, 'cargar los proyectos'));
  return (data || []).map((p: any) => ({
    ...p,
    monto: p.monto === null ? null : Number(p.monto),
    cliente: (Array.isArray(p.clientes) ? p.clientes[0]?.nombre : p.clientes?.nombre) || 'Cliente',
  }));
}
