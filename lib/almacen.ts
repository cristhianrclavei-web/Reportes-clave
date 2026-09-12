import { createClient } from './supabaseClient';
import { CategoriaInsumo, CATEGORIAS, UNIDADES } from './insumos';
import { notificar } from './push';

export { CATEGORIAS, UNIDADES };
export type { CategoriaInsumo };

export type Sistema = {
  id: string;
  nombre: string;
  activo: boolean;
};

export type Articulo = {
  id: string;
  categoria: CategoriaInsumo;
  descripcion: string;
  unidad: string;
  retornable: boolean;
  activo: boolean;
  // Cantidad por debajo de la cual conviene reponer. 0 = sin control.
  minimo: number;
  // Sistema al que pertenece (CCTV, control de acceso…). Clasifica el
  // catálogo para que buscar no sea recorrer una lista plana.
  sistema_id: string | null;
  // Describen el artículo, no la pieza: una cámara Hikvision DS-2CD siempre
  // es esa. El número de serie va en cada entrada, no aquí.
  marca: string | null;
  modelo: string | null;
};

export type TipoMovimiento = 'entrada' | 'salida' | 'retorno' | 'ajuste';

export type Movimiento = {
  id: string;
  articulo_id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  inventario: 'general' | 'proyecto';
  grupo_id: string | null;
  proveedor: string | null;
  factura_path: string | null;
  orden_compra_path: string | null;
  numeros_serie: string | null;
  nota: string | null;
  created_at: string;
};

// Un renglón de existencias tal como se muestra en la tabla: el artículo con
// su saldo en un inventario concreto.
export type Existencia = {
  articulo: Articulo;
  inventario: 'general' | 'proyecto';
  grupoId: string | null;
  proyecto: string | null;
  cantidad: number;
  ultimaEntrada: string | null;
  tieneFactura: boolean;
  tieneOrdenCompra: boolean;
};

export async function puedoGestionarAlmacen(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('puedo_gestionar_almacen');
  if (error) return false;
  return !!data;
}

// --- Catálogo ---

export async function listarArticulos(soloActivos = true): Promise<Articulo[]> {
  const supabase = createClient();
  let q = supabase.from('almacen_articulos').select('*').order('categoria').order('descripcion');
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Articulo[]) || [];
}

// --- Sistemas ---

export async function listarSistemas(soloActivos = true): Promise<Sistema[]> {
  const supabase = createClient();
  let q = supabase.from('almacen_sistemas').select('*').order('nombre');
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Sistema[]) || [];
}

export async function crearSistema(nombre: string): Promise<Sistema> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('almacen_sistemas')
    .insert({ nombre: nombre.trim(), creado_por: user?.id })
    .select()
    .single();
  if (error) throw error;
  return data as Sistema;
}

// Los sistemas no se borran: se desactivan. Los artículos que ya los usan
// conservan su clasificación y el historial no se rompe.
export async function desactivarSistema(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('almacen_sistemas').update({ activo: false }).eq('id', id);
  if (error) throw error;
}

export async function articulosPorSistema(sistemaId: string): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from('almacen_articulos')
    .select('id', { count: 'exact', head: true })
    .eq('sistema_id', sistemaId)
    .eq('activo', true);
  return count || 0;
}

export async function crearArticulo(input: {
  categoria: CategoriaInsumo;
  descripcion: string;
  unidad: string;
  retornable: boolean;
  minimo?: number;
  sistemaId?: string | null;
  marca?: string;
  modelo?: string;
}): Promise<Articulo> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('almacen_articulos')
    .insert({
      categoria: input.categoria,
      descripcion: input.descripcion.trim(),
      unidad: input.unidad,
      retornable: input.retornable,
      minimo: input.minimo || 0,
      sistema_id: input.sistemaId || null,
      marca: input.marca?.trim() || null,
      modelo: input.modelo?.trim() || null,
      creado_por: user?.id,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Articulo;
}

export async function editarArticulo(id: string, cambios: Partial<Articulo>): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('almacen_articulos').update(cambios).eq('id', id);
  if (error) throw error;
}

// Los artículos no se borran: se desactivan. Borrarlos rompería el historial
// de movimientos que los referencia.
export async function desactivarArticulo(id: string): Promise<void> {
  await editarArticulo(id, { activo: false });
}

// --- Entradas ---

async function subirDocumento(carpeta: string, file: File): Promise<string | null> {
  const supabase = createClient();
  const ext = file.name.split('.').pop() || 'pdf';
  const path = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('almacen').upload(path, file, {
    contentType: file.type || 'application/pdf',
  });
  if (error) throw new Error('No se pudo subir el archivo: ' + error.message);
  return path;
}

export async function registrarEntrada(input: {
  articuloId: string;
  cantidad: number;
  inventario: 'general' | 'proyecto';
  grupoId: string | null;
  proveedor: string;
  nota: string;
  factura: File | null;
  ordenCompra: File | null;
  numerosSerie?: string;
}): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No hay sesión activa');

  const [factura_path, orden_compra_path] = await Promise.all([
    input.factura ? subirDocumento('facturas', input.factura) : Promise.resolve(null),
    input.ordenCompra ? subirDocumento('ordenes', input.ordenCompra) : Promise.resolve(null),
  ]);

  const { error } = await supabase.from('almacen_movimientos').insert({
    articulo_id: input.articuloId,
    tipo: 'entrada',
    cantidad: input.cantidad,
    inventario: input.inventario,
    grupo_id: input.inventario === 'proyecto' ? input.grupoId : null,
    proveedor: input.proveedor.trim() || null,
    numeros_serie: input.numerosSerie?.trim() || null,
    nota: input.nota.trim() || null,
    factura_path,
    orden_compra_path,
    creado_por: user.id,
  });
  if (error) throw error;
}

export async function urlDeDocumento(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage.from('almacen').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

// --- Existencias ---

// Se arma cruzando en memoria: son pocos registros y evita joins anidados,
// que en este esquema ya nos han dado problemas de ambigüedad.
export async function listarExistencias(): Promise<Existencia[]> {
  const supabase = createClient();

  const [{ data: saldos, error: e1 }, { data: articulos, error: e2 }, { data: movs }] = await Promise.all([
    supabase.from('almacen_existencias').select('*'),
    supabase.from('almacen_articulos').select('*'),
    supabase.from('almacen_movimientos').select('articulo_id, inventario, grupo_id, created_at, factura_path, orden_compra_path').eq('tipo', 'entrada'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const porId: Record<string, Articulo> = {};
  ((articulos as Articulo[]) || []).forEach((a) => { porId[a.id] = a; });

  // Nombre del proyecto de cada grupo con existencias reservadas.
  const grupos = Array.from(new Set(((saldos as any[]) || []).map((s) => s.grupo_id).filter(Boolean)));
  const nombreProyecto: Record<string, string> = {};
  if (grupos.length > 0) {
    const { data: servicios } = await supabase
      .from('servicios_programados')
      .select('grupo_id, proyecto')
      .in('grupo_id', grupos);
    (servicios || []).forEach((sv: any) => { nombreProyecto[sv.grupo_id] = sv.proyecto; });
  }

  return ((saldos as any[]) || [])
    .filter((s) => porId[s.articulo_id])
    .map((s) => {
      const entradas = (movs || []).filter(
        (m: any) => m.articulo_id === s.articulo_id && m.inventario === s.inventario && m.grupo_id === s.grupo_id
      );
      const ultima = entradas.map((m: any) => m.created_at).sort().pop() || null;
      return {
        articulo: porId[s.articulo_id],
        inventario: s.inventario,
        grupoId: s.grupo_id,
        proyecto: s.grupo_id ? nombreProyecto[s.grupo_id] || 'Proyecto eliminado' : null,
        cantidad: Number(s.existencia) || 0,
        ultimaEntrada: ultima,
        tieneFactura: entradas.some((m: any) => m.factura_path),
        tieneOrdenCompra: entradas.some((m: any) => m.orden_compra_path),
      };
    })
    .sort((a, b) => a.articulo.descripcion.localeCompare(b.articulo.descripcion));
}

// Existencia disponible de un artículo, sumando el inventario general y lo
// reservado al proyecto indicado. Sirve para avisar al programar si alcanza.
export async function existenciaDisponible(
  articuloId: string,
  grupoId?: string | null
): Promise<{ general: number; proyecto: number; total: number }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('almacen_existencias')
    .select('*')
    .eq('articulo_id', articuloId);
  if (error) return { general: 0, proyecto: 0, total: 0 };

  let general = 0;
  let proyecto = 0;
  ((data as any[]) || []).forEach((row) => {
    const cant = Number(row.existencia) || 0;
    if (row.inventario === 'general') general += cant;
    else if (grupoId && row.grupo_id === grupoId) proyecto += cant;
  });
  return { general, proyecto, total: general + proyecto };
}

// Existencias de todos los artículos de una vez, para no consultar uno por
// uno mientras se arma una lista larga.
export async function mapaDeExistencias(grupoId?: string | null): Promise<Record<string, number>> {
  const supabase = createClient();
  const { data, error } = await supabase.from('almacen_existencias').select('*');
  if (error) return {};
  const mapa: Record<string, number> = {};
  ((data as any[]) || []).forEach((row) => {
    const cant = Number(row.existencia) || 0;
    const cuenta = row.inventario === 'general' || (grupoId && row.grupo_id === grupoId);
    if (!cuenta) return;
    mapa[row.articulo_id] = (mapa[row.articulo_id] || 0) + cant;
  });
  return mapa;
}

export type MovimientoDetallado = Movimiento & {
  articulo: Articulo | null;
  proyecto: string | null;
  quien: string;
};

// Historial de movimientos: es lo que permite explicar cualquier saldo.
export async function listarMovimientos(limite = 100): Promise<MovimientoDetallado[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('almacen_movimientos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;

  const movs = (data as any[]) || [];
  if (movs.length === 0) return [];

  const idsArt = Array.from(new Set(movs.map((m) => m.articulo_id)));
  const idsPersona = Array.from(new Set(movs.map((m) => m.creado_por).filter(Boolean)));
  const grupos = Array.from(new Set(movs.map((m) => m.grupo_id).filter(Boolean)));

  const [{ data: articulos }, { data: perfiles }, { data: servicios }] = await Promise.all([
    supabase.from('almacen_articulos').select('*').in('id', idsArt),
    idsPersona.length > 0 ? supabase.from('profiles').select('id, full_name').in('id', idsPersona) : Promise.resolve({ data: [] as any[] }),
    grupos.length > 0 ? supabase.from('servicios_programados').select('grupo_id, proyecto').in('grupo_id', grupos) : Promise.resolve({ data: [] as any[] }),
  ]);

  const porArticulo: Record<string, Articulo> = {};
  ((articulos as Articulo[]) || []).forEach((a) => { porArticulo[a.id] = a; });
  const porPersona: Record<string, string> = {};
  (perfiles || []).forEach((p: any) => { porPersona[p.id] = p.full_name; });
  const porGrupo: Record<string, string> = {};
  (servicios || []).forEach((sv: any) => { porGrupo[sv.grupo_id] = sv.proyecto; });

  return movs.map((m) => ({
    ...m,
    articulo: porArticulo[m.articulo_id] || null,
    proyecto: m.grupo_id ? porGrupo[m.grupo_id] || null : null,
    quien: porPersona[m.creado_por] || '—',
  }));
}

export type ArticuloBajoMinimo = {
  articulo: Articulo;
  existencia: number;
  faltan: number;
};

// Artículos del inventario general por debajo de su mínimo. Lo reservado a un
// proyecto no se evalúa: se compró para agotarse en esa obra.
// Revisa si algún artículo quedó bajo su mínimo y avisa a quien lleva el
// almacén. Se llama después de una salida: es el momento en que el saldo baja.
export async function avisarSiBajoMinimo(): Promise<void> {
  try {
    const bajos = await listarBajoMinimo();
    if (bajos.length === 0) return;
    const primero = bajos[0];
    await notificar({
      destino: 'almacen',
      tipo: 'stock_bajo',
      titulo: bajos.length === 1 ? 'Artículo por debajo del mínimo' : `${bajos.length} artículos por debajo del mínimo`,
      mensaje:
        bajos.length === 1
          ? `${primero.articulo.descripcion}: quedan ${primero.existencia} de ${primero.articulo.minimo} ${primero.articulo.unidad}`
          : `El primero: ${primero.articulo.descripcion}, quedan ${primero.existencia} ${primero.articulo.unidad}`,
      url: '/dashboard/almacen',
      tag: 'stock-bajo',
    });
  } catch (e) {
    console.error('No se pudo revisar el mínimo:', e);
  }
}

export async function listarBajoMinimo(): Promise<ArticuloBajoMinimo[]> {
  const supabase = createClient();
  const [{ data: articulos, error }, { data: saldos }] = await Promise.all([
    supabase.from('almacen_articulos').select('*').eq('activo', true).gt('minimo', 0),
    supabase.from('almacen_existencias').select('*').eq('inventario', 'general'),
  ]);
  if (error) throw error;

  const existePorArticulo: Record<string, number> = {};
  ((saldos as any[]) || []).forEach((row) => {
    existePorArticulo[row.articulo_id] = (existePorArticulo[row.articulo_id] || 0) + (Number(row.existencia) || 0);
  });

  return ((articulos as Articulo[]) || [])
    .map((a) => {
      const existencia = existePorArticulo[a.id] || 0;
      return { articulo: a, existencia, faltan: Math.max(0, a.minimo - existencia) };
    })
    .filter((x) => x.existencia < x.articulo.minimo)
    .sort((a, b) => b.faltan - a.faltan);
}

// Proyectos disponibles para reservar existencias.
export async function listarProyectosParaAlmacen(): Promise<{ grupoId: string; proyecto: string }[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('servicios_programados')
    .select('grupo_id, proyecto, fecha')
    .order('fecha', { ascending: false });
  if (error) throw error;

  const vistos = new Set<string>();
  const resultado: { grupoId: string; proyecto: string }[] = [];
  (data || []).forEach((sv: any) => {
    if (vistos.has(sv.grupo_id)) return;
    vistos.add(sv.grupo_id);
    resultado.push({ grupoId: sv.grupo_id, proyecto: sv.proyecto });
  });
  return resultado;
}
