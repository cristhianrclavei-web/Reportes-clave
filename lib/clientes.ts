import { createClient } from './supabaseClient';
import { registrarAccionGlobal } from './auditoriaGlobal';
import type { EstadoProyecto } from './proyectos';

export type Cliente = {
  id: string;
  nombre: string;
  direccion: string | null;
  logo_path: string | null;
  foto_portada_path: string | null;
  created_by: string;
  created_at: string;
};

export type ClienteContacto = {
  id: string;
  cliente_id: string;
  nombre: string;
  puesto: string | null;
  telefono: string | null;
  correo: string | null;
  created_at: string;
};

// Lo que necesita la fila de un proyecto dentro de un sistema: no trae el
// detalle completo (eso es obtenerProyecto, en lib/proyectos.ts), solo lo
// que se ve de un vistazo en la lista — incluyendo qué documentos ya tiene,
// para no tener que entrar a cada proyecto solo para saber si hay planos.
export type ProyectoResumen = {
  id: string;
  sistema: string;
  nombre: string;
  descripcion: string | null;
  estado: EstadoProyecto;
  concluido_en: string | null;
  updated_at: string;
  documentos_nombres: string[];
  cotizaciones_count: number;
};

export type ClienteConResumen = Cliente & {
  logo_url: string | null;
  foto_portada_url: string | null;
  total_proyectos: number;
  sistemas: string[];
};

// Genérica: sirve tanto para el logo como para la foto de portada, ambos
// son solo una ruta en el mismo bucket privado.
async function urlFirmada(supabase: ReturnType<typeof createClient>, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from('proyectos-documentos').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

export async function crearCliente(input: { nombre: string; direccion: string }): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('Falta el nombre del cliente.');

  const { data: existente } = await supabase.from('clientes').select('id').ilike('nombre', nombre).maybeSingle();
  if (existente) throw new Error('Ya existe un cliente con ese nombre.');

  const { data, error } = await supabase
    .from('clientes')
    .insert({ nombre, direccion: input.direccion.trim() || null, created_by: user.id })
    .select('id')
    .single();
  if (error) throw error;

  await registrarAccionGlobal('creo_proyecto', 'proyecto', data.id, `Dio de alta al cliente «${nombre}»`);
  return data.id as string;
}

export async function listarClientesConResumen(): Promise<ClienteConResumen[]> {
  const supabase = createClient();
  const [{ data: clientes, error: e1 }, { data: proyectos, error: e2 }] = await Promise.all([
    supabase.from('clientes').select('*').order('nombre'),
    supabase.from('proyectos').select('cliente_id, sistema'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const porCliente = new Map<string, { total: number; sistemas: Set<string> }>();
  (proyectos || []).forEach((p: any) => {
    if (!porCliente.has(p.cliente_id)) porCliente.set(p.cliente_id, { total: 0, sistemas: new Set() });
    const acc = porCliente.get(p.cliente_id)!;
    acc.total++;
    acc.sistemas.add(p.sistema);
  });

  const lista = (clientes as Cliente[]) || [];
  const [logoUrls, portadaUrls] = await Promise.all([
    Promise.all(lista.map((c) => urlFirmada(supabase, c.logo_path))),
    Promise.all(lista.map((c) => urlFirmada(supabase, c.foto_portada_path))),
  ]);

  return lista.map((c, i) => {
    const resumen = porCliente.get(c.id);
    return {
      ...c,
      logo_url: logoUrls[i],
      foto_portada_url: portadaUrls[i],
      total_proyectos: resumen?.total || 0,
      sistemas: resumen ? Array.from(resumen.sistemas) : [],
    };
  });
}

export async function obtenerClienteCompleto(id: string): Promise<{
  cliente: Cliente;
  logoUrl: string | null;
  portadaUrl: string | null;
  contactos: ClienteContacto[];
  proyectos: ProyectoResumen[];
}> {
  const supabase = createClient();
  const { data: cliente, error: e1 } = await supabase.from('clientes').select('*').eq('id', id).single();
  if (e1) throw e1;

  const [{ data: contactos, error: e2 }, { data: proyectos, error: e3 }] = await Promise.all([
    supabase.from('cliente_contactos').select('*').eq('cliente_id', id).order('created_at'),
    supabase.from('proyectos').select('*, proyecto_documentos(nombre), proyecto_cotizaciones(cotizacion_id)').eq('cliente_id', id).order('updated_at', { ascending: false }),
  ]);
  if (e2) throw e2;
  if (e3) throw e3;

  const [logoUrl, portadaUrl] = await Promise.all([
    urlFirmada(supabase, (cliente as Cliente).logo_path),
    urlFirmada(supabase, (cliente as Cliente).foto_portada_path),
  ]);

  const proyectosResumen: ProyectoResumen[] = ((proyectos as any[]) || []).map((p) => ({
    id: p.id,
    sistema: p.sistema,
    nombre: p.nombre,
    descripcion: p.descripcion,
    estado: p.estado,
    concluido_en: p.concluido_en,
    updated_at: p.updated_at,
    documentos_nombres: Array.from(new Set((p.proyecto_documentos || []).map((d: any) => d.nombre as string))),
    cotizaciones_count: (p.proyecto_cotizaciones || []).length,
  }));

  return { cliente: cliente as Cliente, logoUrl, portadaUrl, contactos: (contactos as ClienteContacto[]) || [], proyectos: proyectosResumen };
}

export async function actualizarPerfilCliente(id: string, input: { nombre: string; direccion: string }): Promise<void> {
  const supabase = createClient();
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('Falta el nombre del cliente.');
  const { error } = await supabase.from('clientes').update({ nombre, direccion: input.direccion.trim() || null }).eq('id', id);
  if (error) throw error;
}

// Reemplaza el logo: sube el nuevo antes de borrar el viejo, así si la
// subida falla el cliente no se queda sin foto.
export async function subirLogoCliente(id: string, file: File): Promise<void> {
  const supabase = createClient();
  const { data: actual } = await supabase.from('clientes').select('logo_path').eq('id', id).single();
  const anterior = actual?.logo_path as string | null;

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `clientes/${id}/logo-${Date.now()}.${ext}`;
  const { error: eUp } = await supabase.storage.from('proyectos-documentos').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (eUp) throw new Error('No se pudo subir la foto: ' + eUp.message);

  const { error } = await supabase.from('clientes').update({ logo_path: path }).eq('id', id);
  if (error) throw error;

  if (anterior) {
    try { await supabase.storage.from('proyectos-documentos').remove([anterior]); } catch { /* no crítico */ }
  }
}

// Foto de portada: la imagen ancha del sitio/fachada, aparte del logo
// circular. Mismo patrón que subirLogoCliente — sube antes de borrar la
// anterior.
export async function subirFotoPortadaCliente(id: string, file: File): Promise<void> {
  const supabase = createClient();
  const { data: actual } = await supabase.from('clientes').select('foto_portada_path').eq('id', id).single();
  const anterior = actual?.foto_portada_path as string | null;

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `clientes/${id}/portada-${Date.now()}.${ext}`;
  const { error: eUp } = await supabase.storage.from('proyectos-documentos').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (eUp) throw new Error('No se pudo subir la foto: ' + eUp.message);

  const { error } = await supabase.from('clientes').update({ foto_portada_path: path }).eq('id', id);
  if (error) throw error;

  if (anterior) {
    try { await supabase.storage.from('proyectos-documentos').remove([anterior]); } catch { /* no crítico */ }
  }
}

export async function eliminarFotoPortadaCliente(id: string): Promise<void> {
  const supabase = createClient();
  const { data: actual } = await supabase.from('clientes').select('foto_portada_path').eq('id', id).single();
  const anterior = actual?.foto_portada_path as string | null;

  const { error } = await supabase.from('clientes').update({ foto_portada_path: null }).eq('id', id);
  if (error) throw error;

  if (anterior) {
    try { await supabase.storage.from('proyectos-documentos').remove([anterior]); } catch { /* no crítico */ }
  }
}

export async function agregarContacto(
  clienteId: string,
  input: { nombre: string; puesto: string; telefono: string; correo: string }
): Promise<void> {
  const supabase = createClient();
  if (!input.nombre.trim()) throw new Error('Falta el nombre del contacto.');
  const { error } = await supabase.from('cliente_contactos').insert({
    cliente_id: clienteId,
    nombre: input.nombre.trim(),
    puesto: input.puesto.trim() || null,
    telefono: input.telefono.trim() || null,
    correo: input.correo.trim() || null,
  });
  if (error) throw error;
}

export async function eliminarContacto(contactoId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('cliente_contactos').delete().eq('id', contactoId);
  if (error) throw error;
}

export async function eliminarCliente(id: string): Promise<void> {
  const supabase = createClient();
  const { data: cliente, error: eGet } = await supabase.from('clientes').select('nombre, logo_path, foto_portada_path').eq('id', id).single();
  if (eGet) throw eGet;

  // Documentos de TODOS los proyectos de este cliente, para limpiarlos del
  // storage antes de que el borrado en cascada se lleve las filas.
  const { data: proyectosIds } = await supabase.from('proyectos').select('id').eq('cliente_id', id);
  const ids = (proyectosIds || []).map((p: any) => p.id as string);
  let paths: string[] = [];
  if (ids.length > 0) {
    const { data: docs } = await supabase.from('proyecto_documentos').select('archivo_path').in('proyecto_id', ids);
    paths = (docs || []).map((d: any) => d.archivo_path as string).filter(Boolean);
  }
  if (cliente.logo_path) paths.push(cliente.logo_path);
  if (cliente.foto_portada_path) paths.push(cliente.foto_portada_path);

  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) throw error;

  if (paths.length > 0) {
    try { await supabase.storage.from('proyectos-documentos').remove(paths); } catch (e) { console.error('No se pudieron limpiar algunos archivos:', e); }
  }

  await registrarAccionGlobal('elimino_proyecto', 'proyecto', id, `Eliminó al cliente «${cliente.nombre}» y todos sus proyectos`);
}
