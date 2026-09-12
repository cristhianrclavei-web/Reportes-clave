import { createClient } from './supabaseClient';
import { registrarAccionGlobal } from './auditoriaGlobal';
import { notificar } from './push';

export type CategoriaInsumo = 'herramienta' | 'material' | 'equipo';

export const CATEGORIAS: { valor: CategoriaInsumo; label: string }[] = [
  { valor: 'herramienta', label: 'Herramienta' },
  { valor: 'material', label: 'Material' },
  { valor: 'equipo', label: 'Equipo' },
];

// Unidades de uso común en campo. La lista es abierta: si falta alguna, el
// supervisor puede escribirla.
export const UNIDADES = [
  'pza', 'pzas', 'mts', 'cm', 'rollo', 'caja', 'bulto', 'costal',
  'kg', 'lt', 'juego', 'par', 'tramo', 'cubeta', 'galón', 'm²', 'saco',
];

export type Insumo = {
  id: string;
  grupo_id: string;
  servicio_id: string;
  categoria: CategoriaInsumo;
  descripcion: string;
  cantidad: number;
  unidad: string;
  orden: number;
  agregado_por: string | null;
  es_del_tecnico: boolean;
  nota: string | null;
  estado_solicitud: 'aprobado' | 'solicitado' | 'rechazado';
  motivo_solicitud: string | null;
  // Artículo del catálogo al que corresponde. Opcional: los renglones
  // capturados antes de la fase 2 solo tienen descripción.
  articulo_id: string | null;
};

export type MotivoFaltante = 'en_obra' | 'danado' | 'perdido' | 'otro';
export type MotivoNoEntregado = 'sin_stock' | 'en_uso' | 'no_localizado' | 'no_requerido' | 'otro';

// Por qué una pieza no salió del almacén. Se pregunta al firmar la salida.
export const MOTIVOS_NO_ENTREGADO: { valor: MotivoNoEntregado; label: string }[] = [
  { valor: 'sin_stock', label: 'No había en almacén' },
  { valor: 'en_uso', label: 'Estaba en uso en otra obra' },
  { valor: 'no_localizado', label: 'No se encontró' },
  { valor: 'no_requerido', label: 'Ya no se necesitó' },
  { valor: 'otro', label: 'Otro motivo' },
];

export const MOTIVOS_FALTANTE: { valor: MotivoFaltante; label: string }[] = [
  { valor: 'en_obra', label: 'Se quedó en la obra' },
  { valor: 'danado', label: 'Se dañó' },
  { valor: 'perdido', label: 'Se perdió' },
  { valor: 'otro', label: 'Otro motivo' },
];

export type EstadoInsumo = {
  insumo_id: string;
  servicio_id: string;
  salida: boolean;
  retorno: boolean;
  salida_en: string | null;
  retorno_en: string | null;
  motivo_faltante: MotivoFaltante | null;
  nota_faltante: string | null;
  motivo_no_entregado: MotivoNoEntregado | null;
  nota_no_entregado: string | null;
  cantidad_entregada: number;
  cantidad_retornada: number;
};

export type Resguardo = {
  id: string;
  servicio_id: string;
  tipo: 'salida' | 'devolucion';
  firmado_por: string;
  firmado_en: string;
  firma_path: string | null;
  items: any[];
  recibido_por: string | null;
  recibido_en: string | null;
  profiles?: any;
};

export type InsumoConEstado = Insumo & { estado: EstadoInsumo | null };

export type ProgresoInsumos = {
  total: number;
  salieron: number;
  regresaron: number;
  faltantesAlRetorno: number; // salieron pero no regresaron
  noEntregados: number;       // el almacén no los entregó
};

// Lista del proyecto + cómo va en el día indicado. La lista es del proyecto y
// el estado es del día, así que se consultan por separado y se cruzan aquí.
export async function obtenerInsumos(grupoId: string, servicioId: string): Promise<InsumoConEstado[]> {
  const supabase = createClient();
  const [{ data: insumos, error: e1 }, { data: estados, error: e2 }] = await Promise.all([
    // Solo lo aprobado forma parte del resguardo: lo solicitado todavía no
    // existe para efectos de la carga.
    supabase.from('servicio_insumos').select('*').eq('grupo_id', grupoId).eq('estado_solicitud', 'aprobado').order('categoria').order('orden'),
    supabase.from('servicio_insumo_estado').select('*').eq('servicio_id', servicioId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const porInsumo: Record<string, EstadoInsumo> = {};
  (estados || []).forEach((e: any) => { porInsumo[e.insumo_id] = e; });

  return ((insumos as Insumo[]) || []).map((i) => ({ ...i, estado: porInsumo[i.id] || null }));
}

export function calcularProgresoInsumos(lista: InsumoConEstado[]): ProgresoInsumos {
  const total = lista.length;
  const salieron = lista.filter((i) => i.estado?.salida).length;
  const regresaron = lista.filter((i) => i.estado?.retorno).length;
  const faltantesAlRetorno = lista.filter((i) => i.estado?.salida && !i.estado?.retorno).length;
  const noEntregados = lista.filter((i) => !i.estado?.salida && i.estado?.motivo_no_entregado).length;
  return { total, salieron, regresaron, faltantesAlRetorno, noEntregados };
}

// Lo que hay que devolver es solo lo que salió: no se puede regresar algo que
// el almacén nunca entregó.
export function insumosADevolver(lista: InsumoConEstado[]): InsumoConEstado[] {
  return lista.filter((i) => i.estado?.salida);
}

export function insumosNoEntregados(lista: InsumoConEstado[]): InsumoConEstado[] {
  return lista.filter((i) => !i.estado?.salida && i.estado?.motivo_no_entregado);
}

// Marca salida o retorno de un insumo en un día concreto. Usa upsert porque
// la fila de estado solo existe cuando alguien marca algo por primera vez.
// `cantidad` es cuánto se entregó o devolvió realmente. El booleano queda
// como "hubo movimiento", que es lo que consultan las vistas existentes.
export async function marcarInsumo(
  insumoId: string,
  servicioId: string,
  campo: 'salida' | 'retorno',
  cantidad: number
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ahora = new Date().toISOString();
  const hubo = cantidad > 0;

  const cambios: any = { insumo_id: insumoId, servicio_id: servicioId };
  cambios[campo] = hubo;
  cambios[`${campo}_por`] = hubo ? user?.id : null;
  cambios[`${campo}_en`] = hubo ? ahora : null;
  cambios[campo === 'salida' ? 'cantidad_entregada' : 'cantidad_retornada'] = Math.max(0, cantidad);

  const { error } = await supabase
    .from('servicio_insumo_estado')
    .upsert(cambios, { onConflict: 'insumo_id,servicio_id' });
  if (error) throw error;
}

// Acciones en lote. Van en una sola llamada al servidor: hacerlo pieza por
// pieza sobre una lista de 20 renglones es lento y en campo se nota.
// En lote se asume la cantidad completa de cada renglón: es la acción de
// "recibí todo", y los ajustes parciales se hacen uno por uno.
export async function marcarInsumosEnLote(
  insumos: { id: string; cantidad: number }[],
  servicioId: string,
  campo: 'salida' | 'retorno',
  valor: boolean
): Promise<void> {
  if (insumos.length === 0) return;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ahora = new Date().toISOString();

  const columnaCantidad = campo === 'salida' ? 'cantidad_entregada' : 'cantidad_retornada';
  const filas = insumos.map((i) => ({
    insumo_id: i.id,
    servicio_id: servicioId,
    [campo]: valor,
    [`${campo}_por`]: valor ? user?.id : null,
    [`${campo}_en`]: valor ? ahora : null,
    [columnaCantidad]: valor ? i.cantidad : 0,
  }));

  const { error } = await supabase
    .from('servicio_insumo_estado')
    .upsert(filas, { onConflict: 'insumo_id,servicio_id' });
  if (error) throw error;
}

export async function registrarMotivoEnLote(
  insumoIds: string[],
  servicioId: string,
  modo: 'salida' | 'retorno',
  motivo: string,
  nota: string
): Promise<void> {
  if (insumoIds.length === 0) return;
  const supabase = createClient();

  const filas = insumoIds.map((id) =>
    modo === 'salida'
      ? { insumo_id: id, servicio_id: servicioId, motivo_no_entregado: motivo, nota_no_entregado: nota.trim() || null }
      : { insumo_id: id, servicio_id: servicioId, motivo_faltante: motivo, nota_faltante: nota.trim() || null }
  );

  const { error } = await supabase
    .from('servicio_insumo_estado')
    .upsert(filas, { onConflict: 'insumo_id,servicio_id' });
  if (error) throw error;
}

export async function agregarInsumo(input: {
  grupoId: string;
  servicioId: string;
  categoria: CategoriaInsumo;
  descripcion: string;
  cantidad: number;
  unidad: string;
  esDelTecnico: boolean;
  proyecto?: string;
  motivo?: string;
  articuloId?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('servicio_insumos').insert({
    grupo_id: input.grupoId,
    servicio_id: input.servicioId,
    categoria: input.categoria,
    descripcion: input.descripcion.trim(),
    cantidad: input.cantidad,
    unidad: input.unidad,
    articulo_id: input.articuloId || null,
    agregado_por: user?.id,
    es_del_tecnico: input.esDelTecnico,
    estado_solicitud: input.esDelTecnico ? 'solicitado' : 'aprobado',
    motivo_solicitud: input.motivo?.trim() || null,
    orden: 999,
  });
  if (error) throw error;

  // Lo que agrega el técnico se avisa al supervisor por la bitácora de
  // Eventos: si hizo falta algo, es información que sirve para la próxima vez.
  if (input.esDelTecnico) {
    await registrarAccionGlobal(
      'solicito_insumo',
      'servicio',
      input.servicioId,
      `Solicitó para «${input.proyecto || 'el proyecto'}»: ${input.cantidad} ${input.unidad} de ${input.descripcion.trim()} (${input.categoria})${input.motivo?.trim() ? ` — ${input.motivo.trim()}` : ''}`
    );

    await notificar({
      destino: 'supervisores',
      tipo: 'solicitud_herramienta',
      titulo: 'Solicitud de herramienta',
      mensaje: `${input.cantidad} ${input.unidad} de ${input.descripcion.trim()} para ${input.proyecto || 'un proyecto'}`,
      url: '/dashboard',
      tag: 'solicitud-insumo',
    });
  }
}

export type InsumoNuevo = {
  categoria: CategoriaInsumo;
  descripcion: string;
  cantidad: number;
  unidad: string;
  // Referencia al catálogo; null en renglones capturados antes de la fase 2
  // o en plantillas guardadas con el formato anterior.
  articuloId?: string | null;
};

// Guarda la lista capturada durante el alta del servicio. Se llama después de
// crear el proyecto, porque hasta entonces no existe el grupo al que pertenece.
export async function agregarInsumosIniciales(
  grupoId: string,
  servicioId: string,
  items: InsumoNuevo[]
): Promise<void> {
  const limpios = items.filter((i) => i.descripcion.trim());
  if (limpios.length === 0) return;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('servicio_insumos').insert(
    limpios.map((item, i) => ({
      grupo_id: grupoId,
      servicio_id: servicioId,
      categoria: item.categoria,
      descripcion: item.descripcion.trim(),
      cantidad: item.cantidad,
      unidad: item.unidad,
      orden: i,
      agregado_por: user?.id,
      es_del_tecnico: false,
    }))
  );
  if (error) throw error;
}

// Solicitudes pendientes de un proyecto, para técnico y supervisor.
export async function listarSolicitudesInsumo(grupoId: string): Promise<Insumo[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('servicio_insumos')
    .select('*')
    .eq('grupo_id', grupoId)
    .eq('estado_solicitud', 'solicitado')
    .order('created_at');
  if (error) throw error;
  return (data as Insumo[]) || [];
}

// Todas las solicitudes pendientes del equipo, para el aviso del supervisor.
export async function listarSolicitudesPendientes(): Promise<(Insumo & { proyecto?: string; solicitante?: string })[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('servicio_insumos')
    .select('*')
    .eq('estado_solicitud', 'solicitado')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const solicitudes = (data as Insumo[]) || [];
  if (solicitudes.length === 0) return [];

  const idsServicio = Array.from(new Set(solicitudes.map((s) => s.servicio_id)));
  const idsPersona = Array.from(new Set(solicitudes.map((s) => s.agregado_por).filter(Boolean))) as string[];

  const [{ data: servicios }, { data: perfiles }] = await Promise.all([
    supabase.from('servicios_programados').select('id, proyecto').in('id', idsServicio),
    idsPersona.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', idsPersona)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const proyectoPorId: Record<string, string> = {};
  (servicios || []).forEach((sv: any) => { proyectoPorId[sv.id] = sv.proyecto; });
  const nombrePorId: Record<string, string> = {};
  (perfiles || []).forEach((p: any) => { nombrePorId[p.id] = p.full_name; });

  return solicitudes.map((s) => ({
    ...s,
    proyecto: proyectoPorId[s.servicio_id],
    solicitante: s.agregado_por ? nombrePorId[s.agregado_por] : undefined,
  }));
}

export async function resolverSolicitudInsumo(
  insumo: Insumo & { proyecto?: string },
  aprobar: boolean
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('servicio_insumos')
    .update({
      estado_solicitud: aprobar ? 'aprobado' : 'rechazado',
      resuelto_por: user?.id,
      resuelto_en: new Date().toISOString(),
    })
    .eq('id', insumo.id);
  if (error) throw error;

  const detalle = `${insumo.cantidad} ${insumo.unidad} de ${insumo.descripcion} en «${insumo.proyecto || 'el proyecto'}»`;
  await registrarAccionGlobal(
    aprobar ? 'aprobo_insumo' : 'rechazo_insumo',
    'servicio',
    insumo.servicio_id,
    aprobar ? `Autorizó ${detalle}` : `Rechazó la solicitud de ${detalle}`
  );
}

export async function editarInsumo(
  id: string,
  cambios: { categoria?: CategoriaInsumo; descripcion?: string; cantidad?: number; unidad?: string }
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('servicio_insumos').update(cambios).eq('id', id);
  if (error) throw error;
}

export async function eliminarInsumo(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('servicio_insumos').delete().eq('id', id);
  if (error) throw error;
}

// Resumen de una lista completa, para verla como un renglón de tabla en vez
// de desplegar todo el checklist dentro del detalle del servicio.
export type ResumenChecklist = {
  grupoId: string;
  servicioId: string;
  proyecto: string;
  herramienta: number;
  material: number;
  equipo: number;
  total: number;
  creadoEn: string | null;
  creadoPor: string;
  entregadoEn: string | null;
};

export async function resumenDeChecklist(grupoId: string): Promise<ResumenChecklist | null> {
  const todos = await listarChecklists();
  return todos.find((c) => c.grupoId === grupoId) || null;
}

// Todas las listas de herramienta creadas, una por proyecto. Se arma cruzando
// en memoria en lugar de con joins anidados: PostgREST se vuelve frágil con
// varias relaciones hacia profiles, y esto son pocos registros.
export async function listarChecklists(): Promise<ResumenChecklist[]> {
  const supabase = createClient();
  const [{ data: insumos, error: e1 }, { data: servicios, error: e2 }, { data: resguardos }] = await Promise.all([
    supabase.from('servicio_insumos').select('grupo_id, servicio_id, categoria, created_at, agregado_por'),
    supabase.from('servicios_programados').select('id, grupo_id, proyecto, numero_dia'),
    supabase.from('servicio_resguardos').select('servicio_id, tipo, firmado_en').eq('tipo', 'salida'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const idsCreadores = Array.from(new Set((insumos || []).map((i: any) => i.agregado_por).filter(Boolean)));
  let nombres: Record<string, string> = {};
  if (idsCreadores.length > 0) {
    const { data: perfiles } = await supabase.from('profiles').select('id, full_name').in('id', idsCreadores);
    (perfiles || []).forEach((p: any) => { nombres[p.id] = p.full_name; });
  }

  const proyectoPorGrupo: Record<string, string> = {};
  const primerDiaPorGrupo: Record<string, string> = {};
  (servicios || []).forEach((sv: any) => {
    proyectoPorGrupo[sv.grupo_id] = sv.proyecto;
    if (sv.numero_dia === 1) primerDiaPorGrupo[sv.grupo_id] = sv.id;
  });

  const entregaPorServicio: Record<string, string> = {};
  (resguardos || []).forEach((r: any) => { entregaPorServicio[r.servicio_id] = r.firmado_en; });

  const mapa: Record<string, ResumenChecklist> = {};
  (insumos || []).forEach((i: any) => {
    if (!mapa[i.grupo_id]) {
      mapa[i.grupo_id] = {
        grupoId: i.grupo_id,
        servicioId: primerDiaPorGrupo[i.grupo_id] || i.servicio_id,
        proyecto: proyectoPorGrupo[i.grupo_id] || 'Proyecto eliminado',
        herramienta: 0, material: 0, equipo: 0, total: 0,
        creadoEn: i.created_at,
        creadoPor: nombres[i.agregado_por] || '—',
        entregadoEn: null,
      };
    }
    const r = mapa[i.grupo_id];
    r[i.categoria as CategoriaInsumo] += 1;
    r.total += 1;
    if (i.created_at && (!r.creadoEn || i.created_at < r.creadoEn)) r.creadoEn = i.created_at;
  });

  Object.values(mapa).forEach((r) => {
    r.entregadoEn = entregaPorServicio[r.servicioId] || null;
  });

  return Object.values(mapa).sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || ''));
}

// Listas de carga de los proyectos donde el técnico está asignado, con el día
// que le toca atender. Sirve para la sección propia del técnico, en lugar de
// tener el checklist enterrado dentro del detalle de cada servicio.
export type MiChecklist = ResumenChecklist & {
  fecha: string;
  numeroDia: number;
  diasTotales: number;
  salidaFirmada: boolean;
  devolucionFirmada: boolean;
  recibidoEnAlmacen: boolean;
  solicitudesPendientes: number;
};

export async function listarMisChecklists(): Promise<MiChecklist[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: asignaciones, error: eAsig } = await supabase
    .from('servicio_tecnicos')
    .select('servicio_id')
    .eq('tecnico_id', user.id);
  if (eAsig) throw eAsig;

  const idsAsignados = (asignaciones || []).map((a: any) => a.servicio_id);
  if (idsAsignados.length === 0) return [];

  const { data: servicios, error: eSv } = await supabase
    .from('servicios_programados')
    .select('*')
    .in('id', idsAsignados)
    .order('fecha', { ascending: true });
  if (eSv) throw eSv;

  const dias = (servicios as any[]) || [];
  const grupos = Array.from(new Set(dias.map((d) => d.grupo_id)));
  if (grupos.length === 0) return [];

  const [{ data: insumos }, { data: resguardos }] = await Promise.all([
    supabase.from('servicio_insumos').select('grupo_id, categoria, estado_solicitud').in('grupo_id', grupos),
    supabase.from('servicio_resguardos').select('servicio_id, tipo, recibido_en').in('servicio_id', idsAsignados),
  ]);

  const resultado: MiChecklist[] = [];

  grupos.forEach((grupoId) => {
    const delGrupo = (insumos || []).filter((i: any) => i.grupo_id === grupoId);
    const aprobados = delGrupo.filter((i: any) => i.estado_solicitud === 'aprobado');
    const pendientes = delGrupo.filter((i: any) => i.estado_solicitud === 'solicitado').length;
    // Un proyecto sin lista no tiene nada que mostrar aquí.
    if (aprobados.length === 0 && pendientes === 0) return;

    const diasDelGrupo = dias.filter((d) => d.grupo_id === grupoId);
    // El día que le toca: el primero sin concluir; si ya todos cerraron, el último.
    const dia = diasDelGrupo.find((d) => d.estado !== 'concluido') || diasDelGrupo[diasDelGrupo.length - 1];
    if (!dia) return;

    const misResguardos = (resguardos || []).filter((r: any) => r.servicio_id === dia.id);
    const salida = misResguardos.find((r: any) => r.tipo === 'salida');
    const devolucion = misResguardos.find((r: any) => r.tipo === 'devolucion');

    resultado.push({
      grupoId,
      servicioId: dia.id,
      proyecto: dia.proyecto,
      herramienta: aprobados.filter((i: any) => i.categoria === 'herramienta').length,
      material: aprobados.filter((i: any) => i.categoria === 'material').length,
      equipo: aprobados.filter((i: any) => i.categoria === 'equipo').length,
      total: aprobados.length,
      creadoEn: null,
      creadoPor: '',
      entregadoEn: null,
      fecha: dia.fecha,
      numeroDia: dia.numero_dia,
      diasTotales: dia.dias_totales,
      salidaFirmada: !!salida,
      devolucionFirmada: !!devolucion,
      recibidoEnAlmacen: !!devolucion?.recibido_en,
      solicitudesPendientes: pendientes,
    });
  });

  return resultado.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// --- Resguardo firmado ---

// Los nombres se resuelven en una segunda consulta y no con un embed:
// servicio_resguardos tiene DOS relaciones hacia profiles (quien firma y
// quien recibe), y PostgREST falla por ambigüedad cuando eso pasa.
export async function obtenerResguardos(servicioId: string): Promise<Resguardo[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('servicio_resguardos')
    .select('*')
    .eq('servicio_id', servicioId);
  if (error) throw error;

  const resguardos = (data as Resguardo[]) || [];
  const ids = Array.from(new Set(resguardos.map((r) => r.firmado_por).filter(Boolean)));
  if (ids.length === 0) return resguardos;

  const { data: perfiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
  const nombres: Record<string, string> = {};
  (perfiles || []).forEach((p: any) => { nombres[p.id] = p.full_name; });

  return resguardos.map((r) => ({ ...r, profiles: { full_name: nombres[r.firmado_por] } }));
}

async function subirFirma(servicioId: string, tipo: string, dataUrl: string): Promise<string | null> {
  const supabase = createClient();
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `resguardos/${servicioId}/${tipo}-${Date.now()}.png`;
    const { error } = await supabase.storage.from('evidencias').upload(path, blob, { contentType: 'image/png' });
    if (error) throw error;
    return path;
  } catch (e) {
    console.error('No se pudo subir la firma', e);
    return null;
  }
}

// Registra el motivo por el que algo no regresó. Sin esto, una casilla en
// blanco se ve igual que un olvido al marcar.
export async function registrarFaltante(
  insumoId: string,
  servicioId: string,
  motivo: MotivoFaltante,
  nota: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('servicio_insumo_estado')
    .upsert(
      { insumo_id: insumoId, servicio_id: servicioId, motivo_faltante: motivo, nota_faltante: nota.trim() || null },
      { onConflict: 'insumo_id,servicio_id' }
    );
  if (error) throw error;
}

export async function registrarNoEntregado(
  insumoId: string,
  servicioId: string,
  motivo: MotivoNoEntregado,
  nota: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('servicio_insumo_estado')
    .upsert(
      { insumo_id: insumoId, servicio_id: servicioId, motivo_no_entregado: motivo, nota_no_entregado: nota.trim() || null },
      { onConflict: 'insumo_id,servicio_id' }
    );
  if (error) throw error;
}

export async function firmarResguardo(
  tipo: 'salida' | 'devolucion',
  servicioId: string,
  proyecto: string,
  lista: InsumoConEstado[],
  firmaDataUrl: string
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const firma_path = await subirFirma(servicioId, tipo, firmaDataUrl);

  const items = lista.map((i) => ({
    descripcion: i.descripcion,
    cantidad: i.cantidad,
    // Cantidad real del movimiento: es lo que da valor al documento firmado
    // cuando la entrega fue parcial.
    cantidad_movimiento: tipo === 'salida' ? (i.estado?.cantidad_entregada || 0) : (i.estado?.cantidad_retornada || 0),
    unidad: i.unidad,
    categoria: i.categoria,
    entregado: tipo === 'salida' ? !!i.estado?.salida : !!i.estado?.retorno,
    motivo_faltante: i.estado?.motivo_faltante || null,
    nota_faltante: i.estado?.nota_faltante || null,
    motivo_no_entregado: i.estado?.motivo_no_entregado || null,
    nota_no_entregado: i.estado?.nota_no_entregado || null,
  }));

  const { data: resguardo, error } = await supabase
    .from('servicio_resguardos')
    .upsert({ servicio_id: servicioId, tipo, firmado_por: user?.id, firmado_en: new Date().toISOString(), firma_path, items },
            { onConflict: 'servicio_id,tipo' })
    .select('id')
    .single();
  if (error) throw error;

  // La firma de salida descuenta del almacén. Si algo falla aquí, el
  // resguardo ya quedó firmado: se avisa, pero no se revierte la firma.
  if (tipo === 'salida' && resguardo?.id) {
    const { error: eMov } = await supabase.rpc('registrar_salida_resguardo', {
      p_servicio_id: servicioId,
      p_resguardo_id: resguardo.id,
    });
    if (eMov) {
      console.error('No se pudo descontar del inventario:', eMov);
    } else {
      // El saldo acaba de bajar: es el momento de revisar los mínimos.
      const { avisarSiBajoMinimo } = await import('./almacen');
      await avisarSiBajoMinimo();
    }
  }

  const marcados = items.filter((i) => i.entregado).length;
  const faltantes = items.length - marcados;

  if (tipo === 'salida') {
    // Lo que el almacén no entregó es lo que el supervisor necesita saber:
    // sirve para reponer stock antes de la próxima salida.
    // Incluye tanto lo que no salió como lo que salió incompleto.
    const noEntregados = items
      .filter((i) => i.cantidad_movimiento < i.cantidad)
      .map((i) => {
        const faltan = i.cantidad - i.cantidad_movimiento;
        const motivo = MOTIVOS_NO_ENTREGADO.find((m) => m.valor === i.motivo_no_entregado)?.label || 'sin motivo';
        return `${faltan} ${i.unidad} de ${i.descripcion} (${motivo})`;
      })
      .join('; ');
    await registrarAccionGlobal(
      'firmo_resguardo',
      'servicio',
      servicioId,
      noEntregados
        ? `Tomó resguardo de herramienta en «${proyecto}»: ${marcados} de ${items.length} piezas. No se le entregaron: ${noEntregados}`
        : `Tomó resguardo de herramienta en «${proyecto}»: las ${items.length} piezas completas`
    );
  } else {
    const detalleFaltantes = items
      .filter((i) => i.cantidad_movimiento < i.cantidad)
      .map((i) => {
        const faltan = i.cantidad - i.cantidad_movimiento;
        const motivo = MOTIVOS_FALTANTE.find((m) => m.valor === i.motivo_faltante)?.label || 'sin motivo';
        return `${faltan} ${i.unidad} de ${i.descripcion} (${motivo})`;
      })
      .join('; ');
    await registrarAccionGlobal(
      'devolvio_herramienta',
      'servicio',
      servicioId,
      faltantes > 0
        ? `Devolvió herramienta de «${proyecto}»: ${marcados} de ${items.length}. No regresaron: ${detalleFaltantes}`
        : `Devolvió herramienta de «${proyecto}»: las ${items.length} piezas completas`
    );
  }
}

// El supervisor acusa recibo de toda la lista de una vez: no tiene sentido
// obligarlo a revisar pieza por pieza lo que el técnico ya firmó.
// `destino` decide a qué inventario vuelve lo devuelto. Se pregunta cada vez
// en lugar de aplicar una regla fija: el sobrante de un proyecto a veces se
// queda reservado y a veces pasa al general.
export async function confirmarRecepcion(
  servicioId: string,
  proyecto: string,
  destino: 'general' | 'proyecto' = 'general'
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: resguardo, error } = await supabase
    .from('servicio_resguardos')
    .update({ recibido_por: user?.id, recibido_en: new Date().toISOString() })
    .eq('servicio_id', servicioId)
    .eq('tipo', 'devolucion')
    .select('id')
    .maybeSingle();
  if (error) throw error;

  if (resguardo?.id) {
    const { error: eMov } = await supabase.rpc('registrar_retorno_resguardo', {
      p_servicio_id: servicioId,
      p_resguardo_id: resguardo.id,
      p_destino: destino,
    });
    if (eMov) console.error('No se pudo devolver al inventario:', eMov);
  }

  await registrarAccionGlobal(
    'recibio_herramienta',
    'servicio',
    servicioId,
    `Confirmó la recepción en almacén de «${proyecto}». Lo devuelto entra al inventario ${destino === 'proyecto' ? 'del proyecto' : 'general'}.`
  );
}

// --- Plantillas ---

export type PlantillaInsumos = {
  id: string;
  nombre: string;
  items: { categoria: CategoriaInsumo; descripcion: string; cantidad: number; unidad: string }[];
};

export async function listarPlantillas(): Promise<PlantillaInsumos[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('plantillas_insumos')
    .select('id, nombre, items')
    .order('nombre');
  if (error) throw error;
  return (data as PlantillaInsumos[]) || [];
}

// Guarda una plantilla a partir de renglones sueltos, para poder hacerlo
// desde el alta del servicio, cuando el proyecto todavía no existe.
export async function guardarPlantillaDeItems(
  nombre: string,
  items: { categoria: CategoriaInsumo; descripcion: string; cantidad: number; unidad: string }[]
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('plantillas_insumos')
    .insert({ nombre: nombre.trim(), creado_por: user?.id, items });
  if (error) throw error;
}

export async function guardarComoPlantilla(nombre: string, lista: Insumo[]): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const items = lista.map((i) => ({
    categoria: i.categoria,
    descripcion: i.descripcion,
    cantidad: i.cantidad,
    unidad: i.unidad,
  }));
  const { error } = await supabase
    .from('plantillas_insumos')
    .insert({ nombre: nombre.trim(), creado_por: user?.id, items });
  if (error) throw error;
}

export async function actualizarPlantilla(
  id: string,
  cambios: { nombre?: string; items?: { categoria: CategoriaInsumo; descripcion: string; cantidad: number; unidad: string }[] }
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('plantillas_insumos').update(cambios).eq('id', id);
  if (error) throw error;
}

export async function eliminarPlantilla(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('plantillas_insumos').delete().eq('id', id);
  if (error) throw error;
}

// Vuelca una plantilla sobre un proyecto. Se agrega a lo que ya haya, no lo
// reemplaza: es común combinar una plantilla base con extras del trabajo.
export async function aplicarPlantilla(
  plantilla: PlantillaInsumos,
  grupoId: string,
  servicioId: string
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (plantilla.items.length === 0) return;

  const filas = plantilla.items.map((item, i) => ({
    grupo_id: grupoId,
    servicio_id: servicioId,
    categoria: item.categoria,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    unidad: item.unidad,
    orden: i,
    agregado_por: user?.id,
    es_del_tecnico: false,
  }));

  const { error } = await supabase.from('servicio_insumos').insert(filas);
  if (error) throw error;
}
