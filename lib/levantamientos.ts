import { createClient } from './supabaseClient';

export const SISTEMAS_SUGERIDOS = [
  'CCTV', 'Control de Acceso', 'Control de Acceso Vehicular', 'Alarma & Detección de Humo',
  'Alarma de Intrusión', 'Red Contra Incendio', 'Automatización', 'Paneles Solares', 'Instalaciones Eléctricas',
];

export type FotoGuardada = { path: string; caption: string };

export type Levantamiento = {
  id: string;
  folio: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  fecha: string;
  empresa: string;
  atencion: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  notas: string | null;
  fotos: FotoGuardada[];
  profiles?: { full_name: string } | { full_name: string }[] | null;
};

export type SistemaLevantamiento = {
  id: string;
  levantamiento_id: string;
  orden: number;
  sistema: string;
  estado_actual: string | null;
  observaciones: string | null;
  fotos: FotoGuardada[];
};

// Una sección de sistema tal como la arma el formulario, antes de subir sus
// fotos y de existir en la base de datos.
export type SistemaInput = {
  sistema: string;
  estado_actual: string;
  observaciones: string;
  fotosExistentes: FotoGuardada[];
  fotosNuevas: File[];
};

export type LevantamientoInput = {
  fecha: string;
  empresa: string;
  atencion: string;
  telefono: string;
  correo: string;
  direccion: string;
  notas: string;
  fotosExistentes: FotoGuardada[];
  fotosNuevas: File[];
  sistemas: SistemaInput[];
};

async function siguienteFolio(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { count } = await supabase.from('levantamientos').select('id', { count: 'exact', head: true });
  return `LEV-${String((count || 0) + 1).padStart(4, '0')}`;
}

async function subirFoto(levantamientoId: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `levantamientos/${levantamientoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('evidencias').upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) throw error;
  return path;
}

// Sube lo nuevo y junta con lo que ya existía — se usa igual al crear (donde
// fotosExistentes siempre viene vacío) que al editar.
async function resolverFotos(levantamientoId: string, fotosExistentes: FotoGuardada[], fotosNuevas: File[]): Promise<FotoGuardada[]> {
  const subidas = await Promise.all(fotosNuevas.map((f) => subirFoto(levantamientoId, f)));
  return [...fotosExistentes, ...subidas.map((path) => ({ path, caption: '' }))];
}

function datosCabecera(input: LevantamientoInput) {
  return {
    fecha: input.fecha,
    empresa: input.empresa.trim(),
    atencion: input.atencion.trim() || null,
    telefono: input.telefono.trim() || null,
    correo: input.correo.trim() || null,
    direccion: input.direccion.trim() || null,
    notas: input.notas.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

export async function crearLevantamiento(input: LevantamientoInput): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const folio = await siguienteFolio(supabase);

  const { data: lev, error: e1 } = await supabase
    .from('levantamientos')
    .insert({ folio, created_by: user.id, fotos: [], ...datosCabecera(input) })
    .select('id')
    .single();
  if (e1) throw e1;

  const levantamientoId = lev.id as string;

  const fotosGenerales = await resolverFotos(levantamientoId, input.fotosExistentes, input.fotosNuevas);
  if (fotosGenerales.length > 0) {
    const { error: eFotos } = await supabase.from('levantamientos').update({ fotos: fotosGenerales }).eq('id', levantamientoId);
    if (eFotos) throw eFotos;
  }

  await guardarSistemas(levantamientoId, input.sistemas);

  return levantamientoId;
}

export async function actualizarLevantamiento(id: string, input: LevantamientoInput): Promise<void> {
  const supabase = createClient();

  const fotos = await resolverFotos(id, input.fotosExistentes, input.fotosNuevas);
  const { error: e1 } = await supabase.from('levantamientos').update({ fotos, ...datosCabecera(input) }).eq('id', id);
  if (e1) throw e1;

  const { error: eDel } = await supabase.from('levantamiento_sistemas').delete().eq('levantamiento_id', id);
  if (eDel) throw eDel;

  await guardarSistemas(id, input.sistemas);
}

async function guardarSistemas(levantamientoId: string, sistemas: SistemaInput[]): Promise<void> {
  const supabase = createClient();
  const filas = await Promise.all(
    sistemas.map(async (s, i) => ({
      levantamiento_id: levantamientoId,
      orden: i,
      sistema: s.sistema.trim() || 'General',
      estado_actual: s.estado_actual.trim() || null,
      observaciones: s.observaciones.trim() || null,
      fotos: await resolverFotos(levantamientoId, s.fotosExistentes, s.fotosNuevas),
    }))
  );
  if (filas.length === 0) return;
  const { error } = await supabase.from('levantamiento_sistemas').insert(filas);
  if (error) throw error;
}

export async function listarLevantamientos(soloPropios: boolean): Promise<Levantamiento[]> {
  const supabase = createClient();
  let query = supabase
    .from('levantamientos')
    .select('*, profiles!levantamientos_created_by_profiles_fkey(full_name)')
    .order('created_at', { ascending: false });
  if (soloPropios) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No hay sesión activa');
    query = query.eq('created_by', user.id);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as any[]) || [];
}

export async function obtenerLevantamiento(id: string): Promise<{ levantamiento: Levantamiento; sistemas: SistemaLevantamiento[] }> {
  const supabase = createClient();
  const [{ data: levantamiento, error: e1 }, { data: sistemas, error: e2 }] = await Promise.all([
    supabase.from('levantamientos').select('*, profiles!levantamientos_created_by_profiles_fkey(full_name)').eq('id', id).single(),
    supabase.from('levantamiento_sistemas').select('*').eq('levantamiento_id', id).order('orden'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { levantamiento: levantamiento as Levantamiento, sistemas: (sistemas as SistemaLevantamiento[]) || [] };
}

export async function eliminarLevantamiento(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('levantamientos').delete().eq('id', id);
  if (error) throw error;
}

export async function urlsDeFotos(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const supabase = createClient();
  const { data, error } = await supabase.storage.from('evidencias').createSignedUrls(paths, 3600);
  if (error || !data) return {};
  const mapa: Record<string, string> = {};
  data.forEach((d, i) => { if (d.signedUrl) mapa[paths[i]] = d.signedUrl; });
  return mapa;
}
