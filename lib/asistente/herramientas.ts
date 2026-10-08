import type { SupabaseClient } from '@supabase/supabase-js';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { MARCA, hoyNegocio } from '@/lib/marca';
import { buscarProductosSyscom, syscomConfigurado } from '@/lib/syscom';
import { enviarPush } from '@/lib/pushServidor';
import { calcularTotales, normalizarEnlace, precioUnitarioDesdeCosto } from '@/lib/cotizaciones';

// Funciones de consulta del asistente. Reglas de este archivo:
//
//   1. Solo lectura, con dos excepciones, ambas solo para supervisores y
//      solo tras la confirmación explícita del usuario:
//        · crear_borrador_cotizacion inserta una cotización en «borrador»,
//          marcada como generada por IA;
//        · programar_servicio inserta un servicio nuevo (igual que «Agendar»).
//      No hay ningún update ni delete.
//   2. Todo se consulta con la sesión de quien pregunta (el cliente de
//      lib/supabaseServer), así que la RLS decide qué filas ve cada rol igual
//      que en el resto de la app. Única excepción, decidida por la empresa:
//      el técnico puede consultar dirección y contactos de cualquier cliente
//      (los necesita para llegar al servicio) aunque no tenga la sección
//      Clientes, y las plantillas de la empresa (rutinas de tareas y
//      plantillas de insumos) para preparar un servicio. Esas dos consultas
//      usan el cliente admin con columnas fijas.
//   3. Se piden columnas concretas: firmas y fotos nunca se mandan al
//      modelo. Costos y márgenes solo en precios_de_referencia, que existe
//      únicamente para el supervisor (quien ya los ve al cotizar en la app).
//   4. Cada consulta tiene tope de filas: una pregunta amplia no debe
//      convertirse en una descarga de la base.

export type QuienPregunta = {
  id: string;
  nombre: string;
  rol: 'tecnico' | 'supervisor';
  correo?: string;
  // false con la suscripción en solo lectura: no se ofrece crear borradores.
  puedeEscribir?: boolean;
};

const TOPE = 40;
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Fecha AAAA-MM-DD');
const limite = z.number().int().min(1).max(TOPE).optional().describe(`Máximo de renglones (por defecto 15, tope ${TOPE})`);

// El texto del modelo entra a filtros .or() de PostgREST: se le quitan los
// caracteres que ahí separan condiciones o son comodines.
function limpio(t: string | undefined): string {
  return (t || '').replace(/[,()%*\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// Patrón para ilike que no distingue acentos: cada vocal se vuelve el comodín
// de un carácter, así «camara» encuentra «Cámara». La columna puede no tener
// la extensión unaccent, y quien dicta o escribe rápido no pone acentos.
function patron(t: string | undefined): string {
  const l = limpio(t);
  return l ? `%${l.replace(/[aeiouáéíóúü]/gi, '_')}%` : '';
}

const sinAcentos = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Marca de tiempo de la base (UTC) → hora del día en la zona de la operación.
function horaLocal(ts: string | null | undefined): string | null {
  if (!ts) return null;
  return new Intl.DateTimeFormat('es-MX', { timeZone: MARCA.zonaHoraria, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
}

function recorta(v: unknown, max = 600): unknown {
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) + '…' : v;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => recorta(x, 200));
  return v;
}

function salida(filas: unknown[] | null, pedidas: number, extra: Record<string, unknown> = {}): string {
  const lista = filas || [];
  return JSON.stringify({
    total_devuelto: lista.length,
    // Si se llenó el tope puede haber más: el modelo debe decirlo o afinar.
    puede_haber_mas: lista.length >= pedidas,
    ...extra,
    renglones: lista,
  });
}

function falla(e: { message?: string } | null): string {
  return JSON.stringify({ error: 'No se pudo consultar', detalle: e?.message || 'desconocido' });
}

// Los mismos que sugiere el formulario de cotización (CotizacionForm).
const SISTEMAS_COTIZACION = ['CCTV', 'Control de Acceso', 'Control de Acceso Vehicular', 'Alarma & Detección de Humo', 'Alarma de Intrusión', 'Red Contra Incendio', 'Automatización', 'Paneles Solares', 'Instalaciones Eléctricas'];
const UNIDADES_COTIZACION = ['Pza', 'Lote', 'Serv', 'Mts', 'Hrs', 'Juego'];

const folioDe = (id: string) => id.slice(0, 8).toUpperCase();

// Dirección dentro de la app que abre el detalle de un reporte. Cada rol
// tiene su lista: la del supervisor y la de «Mis reportes» del técnico.
const enlaceReporte = (id: string, esSupervisor: boolean) =>
  `${esSupervisor ? '/dashboard/reportes' : '/mis-reportes'}?reporte=${id}`;

export function crearHerramientas(supabase: SupabaseClient, yo: QuienPregunta, admin: SupabaseClient | null = null) {
  const esSupervisor = yo.rol === 'supervisor';

  // Nombres de las personas, para devolver «quién» en vez de un id. La RLS
  // deja al técnico ver los perfiles públicos de sus compañeros.
  let nombres: Promise<Map<string, string>> | null = null;
  const cargarNombres = () => {
    nombres ||= Promise.resolve(supabase.from('profiles').select('id, full_name')).then(
      ({ data }) => new Map(((data as { id: string; full_name: string }[]) || []).map((p) => [p.id, p.full_name])),
    );
    return nombres;
  };
  const idsDePersona = async (texto: string): Promise<string[]> => {
    const t = sinAcentos(limpio(texto));
    const mapa = await cargarNombres();
    return [...mapa.entries()].filter(([, n]) => sinAcentos(n).includes(t)).map(([id]) => id);
  };

  // Se busca en el propio reporte (data.equipos) y no en
  // almacen_equipos_instalados: esa tabla solo tiene los reportes posteriores
  // a la liga con el almacén, y la pregunta es por todo el historial.
  const buscarEquipos = betaZodTool({
    name: 'buscar_equipos_instalados',
    description:
      'Equipos instalados en campo según los reportes (cámaras, paneles, lectoras, sensores…): en qué cliente y en qué reporte se instaló cierto modelo, marca o número de serie, o qué equipos tiene instalados un cliente.',
    inputSchema: z.object({
      texto: z.string().optional().describe('Modelo, marca, número de serie o descripción del equipo'),
      cliente: z.string().optional().describe('Nombre o parte del nombre del cliente'),
      limite,
    }),
    run: async (i) => {
      const n = i.limite || 15;
      const palabras = sinAcentos(limpio(i.texto)).split(' ').filter((p) => p.length > 1).slice(0, 4);
      let q = supabase
        .from('reports')
        .select('id, fecha, empresa_cliente, created_by, equipos:data->equipos')
        .not('data->equipos', 'is', null)
        .neq('data->>equipos', '[]')
        .order('fecha', { ascending: false })
        .limit(n);
      for (const p of palabras) q = q.ilike('data->>equipos', patron(p));
      const c = limpio(i.cliente);
      if (c) q = q.ilike('empresa_cliente', patron(c));
      const { data, error } = await q;
      if (error) return falla(error);
      const mapa = await cargarNombres();
      return salida(
        ((data as any[]) || []).map((r) => {
          const todos: any[] = Array.isArray(r.equipos) ? r.equipos : [];
          const texto = (e: any) => sinAcentos([e?.desc, e?.marca, e?.modelo, e?.serie].join(' '));
          // Las palabras pueden caer en renglones distintos del mismo
          // reporte: si ninguno las reúne todas, se devuelven todos.
          const exactos = todos.filter((e) => palabras.every((p) => texto(e).includes(p)));
          return {
            folio_reporte: folioDe(r.id),
            enlace: enlaceReporte(r.id, esSupervisor),
            cliente: r.empresa_cliente, fecha: r.fecha,
            hecho_por: mapa.get(r.created_by) || null,
            equipos: (exactos.length ? exactos : todos).slice(0, 25).map((e) => ({
              cantidad: e?.cant || null, descripcion: e?.desc || null, marca: e?.marca || null, modelo: e?.modelo || null, serie: e?.serie || null,
            })),
          };
        }),
        n,
      );
    },
  });

  // Un técnico no ve los perfiles de sus compañeros: decirle «no existe»
  // lo manda a probar otras formas de escribir el nombre, y no es eso.
  const sinPersona = (nombre: string) =>
    esSupervisor
      ? `No hay nadie llamado «${nombre}»`
      : `Con rol de técnico solo se puede consultar lo propio: no hay acceso a la información de «${nombre}». No reintentes con otro nombre.`;

  const buscarReportes = betaZodTool({
    name: 'buscar_reportes',
    description:
      'Reportes de servicio: qué se hizo en una visita, última visita a un cliente, cuántos reportes hizo una persona, reportes sin firma del cliente o sin finalizar. Un técnico solo ve los suyos.',
    inputSchema: z.object({
      cliente: z.string().optional().describe('Nombre o parte del nombre del cliente'),
      persona: z.string().optional().describe('Nombre de quien hizo el reporte'),
      desde: fecha.optional(),
      hasta: fecha.optional(),
      solo_sin_firma_cliente: z.boolean().optional(),
      solo_sin_finalizar: z.boolean().optional(),
      limite,
    }),
    run: async (i) => {
      const n = i.limite || 15;
      let q = supabase
        .from('reports')
        .select(
          'id, fecha, empresa_cliente, tipo_servicio, sub_tipo_servicio, created_by, sistema:data->sistemaSeguridad, actividades:data->actividades, personal:data->personal, observaciones:data->>observaciones, concluido:data->>servicioConcluido, firmo_cliente:data->>firmaClienteNombre, cliente_ausente:data->>clienteAusente, factura:data->>facturaEstado',
          { count: 'exact' },
        )
        .order('fecha', { ascending: false })
        .limit(n);
      const c = limpio(i.cliente);
      if (c) q = q.ilike('empresa_cliente', patron(c));
      if (i.desde) q = q.gte('fecha', i.desde);
      if (i.hasta) q = q.lte('fecha', i.hasta);
      if (i.persona) {
        const ids = await idsDePersona(i.persona);
        if (ids.length === 0) return JSON.stringify({ error: sinPersona(i.persona) });
        q = q.in('created_by', ids);
      }
      if (i.solo_sin_firma_cliente) q = q.or('data->>firmaClienteNombre.is.null,data->>firmaClienteNombre.eq.');
      if (i.solo_sin_finalizar) q = q.or('data->>servicioConcluido.is.null,data->>servicioConcluido.eq.false');
      const { data, error, count } = await q;
      if (error) return falla(error);
      const mapa = await cargarNombres();
      return salida(
        ((data as any[]) || []).map((r) => ({
          folio: folioDe(r.id),
          enlace: enlaceReporte(r.id, esSupervisor),
          fecha: r.fecha, cliente: r.empresa_cliente,
          tipo: [r.tipo_servicio, r.sub_tipo_servicio].filter(Boolean).join(' · ') || null,
          sistema: r.sistema,
          hecho_por: mapa.get(r.created_by) || null,
          personal: recorta(r.personal),
          actividades: recorta(r.actividades),
          observaciones: recorta(r.observaciones),
          finalizado: r.concluido === 'true',
          firmo_cliente: r.firmo_cliente || null,
          cliente_ausente: r.cliente_ausente === 'true',
          factura: r.factura || null,
        })),
        n,
        // Total real de reportes que cumplen el filtro, aunque se devuelvan menos.
        { total_que_coinciden: count ?? null },
      );
    },
  });

  const servicios = betaZodTool({
    name: 'consultar_servicios',
    description:
      'Servicios programados (agenda): qué hay en una fecha o rango, quién está asignado, estado (programado, en sitio, en curso, concluido, cancelado), dirección, y cuáles no tienen reporte. Un técnico solo ve los que tiene asignados.',
    inputSchema: z.object({
      desde: fecha,
      hasta: fecha,
      persona: z.string().optional().describe('Nombre de un técnico asignado'),
      cliente_o_proyecto: z.string().optional(),
      solo_sin_reporte: z.boolean().optional().describe('Solo servicios no cancelados que aún no tienen reporte'),
      limite,
    }),
    run: async (i) => {
      const n = i.limite || 25;
      let q = supabase
        .from('servicios_programados')
        .select('id, grupo_id, proyecto, descripcion, fecha, hora_programada, hora_salida_programada, estado, ubicacion_programada, hora_llegada, hora_fin, report_id, numero_dia, dias_totales, cancelado_motivo, servicio_tecnicos(tecnico_id)')
        .gte('fecha', i.desde)
        .lte('fecha', i.hasta)
        .order('fecha')
        .order('hora_programada')
        .limit(TOPE * 2);
      const c = limpio(i.cliente_o_proyecto);
      if (c) q = q.ilike('proyecto', patron(c));
      if (i.solo_sin_reporte) q = q.is('report_id', null).neq('estado', 'cancelado');
      const { data, error } = await q;
      if (error) return falla(error);
      const mapa = await cargarNombres();
      let filas = (data as any[]) || [];
      if (i.persona) {
        const ids = new Set(await idsDePersona(i.persona));
        if (ids.size === 0) return JSON.stringify({ error: sinPersona(i.persona) });
        filas = filas.filter((s) => (s.servicio_tecnicos || []).some((t: any) => ids.has(t.tecnico_id)));
      }
      return salida(
        filas.slice(0, n).map((s) => ({
          servicio_id: s.id,
          enlace: `${esSupervisor ? '/dashboard/servicios' : '/servicios'}/${s.id}`,
          proyecto: s.proyecto, descripcion: recorta(s.descripcion, 300),
          fecha: s.fecha, hora: s.hora_programada?.slice(0, 5) || null, hora_salida: s.hora_salida_programada?.slice(0, 5) || null,
          dia: s.dias_totales > 1 ? `${s.numero_dia} de ${s.dias_totales}` : null,
          estado: s.estado, motivo_cancelacion: s.cancelado_motivo || null,
          direccion: s.ubicacion_programada?.direccion || null,
          hora_real_llegada: horaLocal(s.hora_llegada), hora_real_fin: horaLocal(s.hora_fin),
          tiene_reporte: !!s.report_id,
          tecnicos: (s.servicio_tecnicos || []).map((t: any) => mapa.get(t.tecnico_id) || 'Sin nombre'),
        })),
        n,
      );
    },
  });

  const tareas = betaZodTool({
    name: 'tareas_de_servicio',
    description: 'Lista de tareas (checklist) de un servicio y su avance. Requiere el servicio_id que devuelve consultar_servicios.',
    inputSchema: z.object({ servicio_id: z.string().uuid() }),
    run: async (i) => {
      const { data: s, error: e1 } = await supabase.from('servicios_programados').select('id, grupo_id, proyecto').eq('id', i.servicio_id).maybeSingle();
      if (e1) return falla(e1);
      if (!s) return JSON.stringify({ error: 'No existe ese servicio o no tienes acceso' });
      // El checklist pertenece al proyecto (grupo), no a un día.
      const { data, error } = await supabase
        .from('servicio_tareas')
        .select('descripcion, orden, completada, avance_pct, completada_en, nota')
        .eq('grupo_id', s.grupo_id)
        .order('orden')
        .limit(80);
      if (error) return falla(error);
      return salida(data, 80, { proyecto: s.proyecto });
    },
  });

  const existencias = betaZodTool({
    name: 'existencias_almacen',
    description:
      'Almacén: cuánto hay de un artículo, dónde se guarda y qué artículos están por debajo de su mínimo. No incluye costos.',
    inputSchema: z.object({
      texto: z.string().optional().describe('Descripción, marca o modelo del artículo'),
      solo_bajo_minimo: z.boolean().optional(),
      limite,
    }),
    run: async (i) => {
      const n = i.limite || 20;
      let q = supabase
        .from('almacen_articulos')
        .select('id, descripcion, unidad, categoria, marca, modelo, minimo, retornable, almacen_ubicaciones(nombre)')
        .eq('activo', true)
        .order('descripcion')
        .limit(i.solo_bajo_minimo ? 500 : n);
      const t = limpio(i.texto);
      if (t) q = q.or(['descripcion', 'marca', 'modelo'].map((col) => `${col}.ilike.${patron(t)}`).join(','));
      if (i.solo_bajo_minimo) q = q.gt('minimo', 0);
      const { data: arts, error } = await q;
      if (error) return falla(error);
      const ids = ((arts as any[]) || []).map((a) => a.id);
      if (ids.length === 0) return salida([], n);
      const { data: ex, error: e2 } = await supabase.from('almacen_existencias').select('articulo_id, inventario, existencia').in('articulo_id', ids);
      if (e2) return falla(e2);
      const saldo = new Map<string, { general: number; proyecto: number }>();
      for (const e of (ex as any[]) || []) {
        const s = saldo.get(e.articulo_id) || { general: 0, proyecto: 0 };
        if (e.inventario === 'proyecto') s.proyecto += Number(e.existencia) || 0;
        else s.general += Number(e.existencia) || 0;
        saldo.set(e.articulo_id, s);
      }
      let filas = ((arts as any[]) || []).map((a) => {
        const s = saldo.get(a.id) || { general: 0, proyecto: 0 };
        return {
          articulo: a.descripcion, marca: a.marca, modelo: a.modelo, categoria: a.categoria, unidad: a.unidad,
          disponible_en_almacen: s.general,
          reservado_a_proyectos: s.proyecto,
          minimo: a.minimo || null,
          ubicacion: a.almacen_ubicaciones?.nombre || null,
          es_herramienta_retornable: a.retornable,
        };
      });
      if (i.solo_bajo_minimo) filas = filas.filter((f) => f.minimo !== null && f.disponible_en_almacen < f.minimo);
      return salida(filas.slice(0, n), n);
    },
  });

  const vales = betaZodTool({
    name: 'consultar_vales',
    description:
      'Vales de almacén: material o herramienta entregada a una persona, quién tiene algo en préstamo, vales por entregar o por devolver. Un técnico solo ve sus vales.',
    inputSchema: z.object({
      persona: z.string().optional().describe('Nombre de quien tiene el vale'),
      articulo: z.string().optional().describe('Descripción, marca o modelo del artículo'),
      solo_abiertos: z.boolean().optional().describe('Solo vales no cerrados, rechazados ni cancelados'),
      limite,
    }),
    run: async (i) => {
      const n = i.limite || 15;
      let q = supabase
        .from('almacen_vales')
        .select('folio, tecnico_id, cliente_nombre, estado, entregado_en, fecha_limite, devuelto_en, created_at, almacen_vale_items(cantidad_solicitada, cantidad_entregada, cantidad_devuelta, almacen_articulos(descripcion, unidad, marca, modelo, retornable))')
        .order('created_at', { ascending: false })
        .limit(TOPE * 2);
      if (i.solo_abiertos) q = q.not('estado', 'in', '(cerrado,rechazado,cancelado)');
      if (i.persona) {
        const ids = await idsDePersona(i.persona);
        if (ids.length === 0) return JSON.stringify({ error: sinPersona(i.persona) });
        q = q.in('tecnico_id', ids);
      }
      const { data, error } = await q;
      if (error) return falla(error);
      const mapa = await cargarNombres();
      const t = sinAcentos(limpio(i.articulo));
      const coincide = (a: any) => !t || sinAcentos([a?.descripcion, a?.marca, a?.modelo].join(' ')).includes(t);
      const filas = ((data as any[]) || [])
        .map((v) => ({
          folio: v.folio,
          persona: mapa.get(v.tecnico_id) || null,
          cliente: v.cliente_nombre, estado: v.estado,
          entregado: v.entregado_en?.slice(0, 10) || null,
          fecha_limite: v.fecha_limite, devuelto: v.devuelto_en?.slice(0, 10) || null,
          articulos: (v.almacen_vale_items || []).filter((it: any) => coincide(it.almacen_articulos)).map((it: any) => ({
            articulo: [it.almacen_articulos?.descripcion, it.almacen_articulos?.marca, it.almacen_articulos?.modelo].filter(Boolean).join(' '),
            unidad: it.almacen_articulos?.unidad,
            solicitado: it.cantidad_solicitada, entregado: it.cantidad_entregada, devuelto: it.cantidad_devuelta,
            retornable: it.almacen_articulos?.retornable,
          })),
        }))
        .filter((v) => v.articulos.length > 0 || !t);
      return salida(filas.slice(0, n), n);
    },
  });

  const clientes = betaZodTool({
    name: 'buscar_clientes',
    description: 'Clientes registrados: dirección y contactos (nombre, puesto, teléfono, correo). Sirve también para la dirección y el contacto de un servicio: busca al cliente por el nombre del proyecto del servicio.',
    inputSchema: z.object({ texto: z.string().describe('Nombre o parte del nombre del cliente'), limite }),
    run: async (i) => {
      const n = i.limite || 8;
      // Sin datos fiscales (RFC, régimen): solo lo necesario para llegar y
      // saber a quién buscar.
      const lector = !esSupervisor && admin ? admin : supabase;
      const { data, error } = await lector
        .from('clientes')
        .select('nombre, direccion, calle, num_exterior, num_interior, colonia, codigo_postal, ciudad, estado, cliente_contactos(nombre, puesto, telefono, correo)')
        .ilike('nombre', patron(i.texto) || '%')
        .order('nombre')
        .limit(n);
      if (error) return falla(error);
      return salida(data, n);
    },
  });

  const cotizaciones = betaZodTool({
    name: 'buscar_cotizaciones',
    description:
      'Cotizaciones: folio, cliente, fecha, estado (borrador, aprobada, enviada, rechazada) y total. Con un folio devuelve también las partidas con precio de venta. Nunca incluye costos ni márgenes.',
    inputSchema: z.object({
      cliente: z.string().optional(),
      folio: z.string().optional(),
      estado: z.enum(['borrador', 'aprobada', 'enviada', 'rechazada']).optional(),
      desde: fecha.optional(),
      hasta: fecha.optional(),
      limite,
    }),
    run: async (i) => {
      const n = i.limite || 15;
      let q = supabase
        .from('cotizaciones')
        .select('id, folio, fecha, empresa, atencion, estado, moneda, subtotal, iva, total, vigencia_dias, created_by')
        .order('fecha', { ascending: false })
        .limit(n);
      const c = limpio(i.cliente);
      if (c) q = q.ilike('empresa', patron(c));
      const f = limpio(i.folio);
      if (f) q = q.ilike('folio', `%${f}%`);
      if (i.estado) q = q.eq('estado', i.estado);
      if (i.desde) q = q.gte('fecha', i.desde);
      if (i.hasta) q = q.lte('fecha', i.hasta);
      const { data, error } = await q;
      if (error) return falla(error);
      const mapa = await cargarNombres();
      const filas: any[] = ((data as any[]) || []).map(({ id, created_by, ...r }) => ({ ...r, elaboro: mapa.get(created_by) || null, _id: id }));
      if (f && filas.length === 1) {
        const { data: lineas } = await supabase
          .from('cotizacion_lineas')
          .select('sistema, descripcion, unidad, cantidad, precio_unitario, importe')
          .eq('cotizacion_id', filas[0]._id)
          .order('orden')
          .limit(80);
        filas[0].partidas = lineas || [];
      }
      return salida(filas.map(({ _id, ...r }) => ({ ...r, enlace: `/dashboard/cotizaciones/${_id}` })), n);
    },
  });

  const disponibles = betaZodTool({
    name: 'tecnicos_disponibles',
    description: 'Técnicos activos que no tienen ningún servicio asignado en una fecha, y los que sí con cuántos.',
    inputSchema: z.object({ fecha }),
    run: async (i) => {
      const [{ data: tecs, error }, { data: servs, error: e2 }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, activo').eq('role', 'tecnico').order('full_name'),
        supabase.from('servicios_programados').select('id, proyecto, servicio_tecnicos(tecnico_id)').eq('fecha', i.fecha).neq('estado', 'cancelado'),
      ]);
      if (error || e2) return falla(error || e2);
      const carga = new Map<string, string[]>();
      for (const s of (servs as any[]) || []) {
        for (const t of s.servicio_tecnicos || []) carga.set(t.tecnico_id, [...(carga.get(t.tecnico_id) || []), s.proyecto]);
      }
      const activos = ((tecs as any[]) || []).filter((t) => t.activo !== false);
      return JSON.stringify({
        fecha: i.fecha,
        libres: activos.filter((t) => !carga.has(t.id)).map((t) => t.full_name),
        ocupados: activos.filter((t) => carga.has(t.id)).map((t) => ({ nombre: t.full_name, servicios: carga.get(t.id) })),
      });
    },
  });

  const recurrentes = betaZodTool({
    name: 'mantenimientos_recurrentes',
    description: 'Mantenimientos preventivos recurrentes (pólizas): cuáles tocan en un rango de fechas, con su cliente o proyecto y frecuencia.',
    inputSchema: z.object({ desde: fecha, hasta: fecha }),
    run: async (i) => {
      const { data, error } = await supabase
        .from('mantenimientos_recurrentes')
        .select('proyecto, descripcion, frecuencia, proxima_fecha, hora, notas, ultima_programacion')
        .eq('activo', true)
        .gte('proxima_fecha', i.desde)
        .lte('proxima_fecha', i.hasta)
        .order('proxima_fecha')
        .limit(TOPE);
      if (error) return falla(error);
      return salida(data, TOPE);
    },
  });

  const listaDeCarga = betaZodTool({
    name: 'lista_de_carga_de_servicio',
    description:
      'Lista de carga (insumos) de un servicio: la herramienta, el material y el equipo que se definió llevar. Requiere el servicio_id que devuelve consultar_servicios. Si viene vacía, el servicio no tiene lista de carga capturada.',
    inputSchema: z.object({ servicio_id: z.string().uuid() }),
    run: async (i) => {
      const { data: s, error: e1 } = await supabase.from('servicios_programados').select('id, grupo_id, proyecto, descripcion').eq('id', i.servicio_id).maybeSingle();
      if (e1) return falla(e1);
      if (!s) return JSON.stringify({ error: 'No existe ese servicio o no tienes acceso' });
      const { data, error } = await supabase
        .from('servicio_insumos')
        .select('categoria, descripcion, cantidad, unidad, es_del_tecnico, nota')
        .eq('grupo_id', s.grupo_id)
        .eq('estado_solicitud', 'aprobado')
        .order('categoria')
        .order('orden')
        .limit(120);
      if (error) return falla(error);
      return salida(data, 120, { proyecto: s.proyecto, servicio: recorta(s.descripcion, 300) });
    },
  });

  const plantillas = betaZodTool({
    name: 'plantillas_de_la_empresa',
    description:
      'Plantillas propias de la empresa para preparar un trabajo: rutinas de tareas por tipo de sistema (qué se revisa y prueba en un mantenimiento) y plantillas de insumos (qué herramienta, material y equipo llevar). Úsala para saber cómo hace la empresa un tipo de servicio.',
    inputSchema: z.object({ texto: z.string().optional().describe('Sistema o tipo de trabajo: CCTV, incendio, control de acceso, preventivo… Vacío devuelve todas') }),
    run: async (i) => {
      const lector = !esSupervisor && admin ? admin : supabase;
      const [{ data: rutinas, error }, { data: insumos, error: e2 }] = await Promise.all([
        lector.from('rutinas_tareas').select('nombre, sistema, descripcion, secciones').eq('activo', true).order('nombre').limit(60),
        lector.from('plantillas_insumos').select('nombre, items').order('nombre').limit(60),
      ]);
      if (error || e2) return falla(error || e2);
      const palabras = sinAcentos(limpio(i.texto)).split(' ').filter((p) => p.length > 2);
      const coincide = (...campos: unknown[]) => palabras.length === 0 || palabras.some((p) => sinAcentos(campos.join(' ')).includes(p));
      const r = ((rutinas as any[]) || []).filter((x) => coincide(x.nombre, x.sistema, x.descripcion));
      const p = ((insumos as any[]) || []).filter((x) => coincide(x.nombre));
      return JSON.stringify({
        // Si el filtro no encontró nada se devuelven los nombres de todas,
        // para que el modelo elija la más parecida en vez de decir «no hay».
        rutinas_de_tareas: r.length ? r : ((rutinas as any[]) || []).map((x) => ({ nombre: x.nombre, sistema: x.sistema })),
        plantillas_de_insumos: p.length ? p : ((insumos as any[]) || []).map((x) => ({ nombre: x.nombre })),
        coincidencia_exacta: r.length + p.length > 0,
      });
    },
  });

  // ---------- Cotizar (solo supervisor) ----------

  const preciosDeReferencia = betaZodTool({
    name: 'precios_de_referencia',
    description:
      'Costos y precios para armar una cotización, de tres fuentes en orden de preferencia: SYSCOM (precio vigente de proveedor, si está conectado), partidas de cotizaciones anteriores de la empresa (con su costo, margen y precio de venta) y artículos del almacén (último costo). Busca un concepto a la vez: «panel solar 550», «inversor 8 kW», «mano de obra instalación».',
    inputSchema: z.object({ texto: z.string().describe('Concepto a buscar: producto, modelo, marca o servicio') }),
    run: async (i) => {
      const palabras = sinAcentos(limpio(i.texto)).split(' ').filter((p) => p.length > 1).slice(0, 4);
      if (palabras.length === 0) return JSON.stringify({ error: 'Indica qué concepto buscar' });
      let ql = supabase
        .from('cotizacion_lineas')
        .select('sistema, descripcion, unidad, costo, margen_pct, precio_unitario, cotizaciones(folio, fecha, empresa, moneda)')
        .limit(12);
      let qa = supabase.from('almacen_articulos').select('descripcion, marca, modelo, unidad, costo_unitario').eq('activo', true).limit(10);
      for (const p of palabras) {
        ql = ql.ilike('descripcion', patron(p));
        qa = qa.or(['descripcion', 'marca', 'modelo'].map((col) => `${col}.ilike.${patron(p)}`).join(','));
      }
      const syscom = syscomConfigurado()
        ? buscarProductosSyscom(limpio(i.texto), 8)
            .then((ps) => ({ conectado: true, productos: ps.map((x) => ({ titulo: x.titulo, marca: x.marca, modelo: x.modelo, costo: x.precio, moneda: x.moneda, existencia: x.existencia })) }))
            .catch((e) => ({ conectado: true, error: String(e?.message || e).slice(0, 200), productos: [] }))
        : Promise.resolve({ conectado: false, productos: [] });
      const [{ data: lineas, error }, { data: arts, error: e2 }, sy] = await Promise.all([ql, qa, syscom]);
      if (error || e2) return falla(error || e2);
      return JSON.stringify({
        syscom: sy,
        cotizaciones_anteriores: ((lineas as any[]) || []).map(({ cotizaciones: c, ...l }) => ({ ...l, folio: c?.folio, fecha: c?.fecha, cliente: c?.empresa, moneda: c?.moneda })),
        almacen: ((arts as any[]) || []).map((a) => ({ articulo: [a.descripcion, a.marca, a.modelo].filter(Boolean).join(' '), unidad: a.unidad, ultimo_costo: a.costo_unitario })),
      });
    },
  });

  const redaccion = betaZodTool({
    name: 'redaccion_de_cotizaciones',
    description:
      'Cómo redacta la empresa sus cotizaciones: condiciones (forma de pago, tiempo de entrega, garantía, vigencia, notas) y la redacción completa de las partidas de cotizaciones recientes, opcionalmente de un sistema o tema. Úsala antes de escribir partidas para imitar el estilo de la empresa.',
    inputSchema: z.object({ tema: z.string().optional().describe('Sistema o palabra clave: «solar», «CCTV», «incendio»…') }),
    run: async (i) => {
      const sel = 'id, folio, fecha, empresa, forma_pago, tiempo_entrega, garantia, vigencia_dias, notas, moneda, iva_pct';
      const { data: recientes, error } = await supabase.from('cotizaciones').select(sel).order('fecha', { ascending: false }).limit(3);
      if (error) return falla(error);
      let cots = (recientes as any[]) || [];
      const t = patron(i.tema);
      if (t) {
        const { data: ls } = await supabase.from('cotizacion_lineas').select('cotizacion_id').or(`sistema.ilike.${t},descripcion.ilike.${t}`).limit(40);
        const ids = [...new Set(((ls as any[]) || []).map((l) => l.cotizacion_id))].slice(0, 3);
        if (ids.length) {
          const { data: delTema } = await supabase.from('cotizaciones').select(sel).in('id', ids);
          cots = [...((delTema as any[]) || []), ...cots.filter((c) => !ids.includes(c.id))].slice(0, 4);
        }
      }
      if (cots.length === 0) return JSON.stringify({ aviso: 'La empresa aún no tiene cotizaciones en la app para tomar como ejemplo.', sistemas_usuales: SISTEMAS_COTIZACION, unidades_usuales: UNIDADES_COTIZACION });
      const { data: lineas } = await supabase.from('cotizacion_lineas').select('cotizacion_id, sistema, descripcion, unidad, cantidad').in('cotizacion_id', cots.map((c) => c.id)).order('orden').limit(120);
      return JSON.stringify({
        sistemas_usuales: SISTEMAS_COTIZACION,
        unidades_usuales: UNIDADES_COTIZACION,
        ejemplos: cots.map(({ id, ...c }) => ({ ...c, partidas: ((lineas as any[]) || []).filter((l) => l.cotizacion_id === id).map(({ cotizacion_id, ...l }) => l) })),
      });
    },
  });

  const texto = (max: number) => z.string().max(max);
  const crearBorrador = betaZodTool({
    name: 'crear_borrador_cotizacion',
    description:
      'Guarda una cotización nueva en estado BORRADOR, marcada como generada por IA para que una persona la revise antes de aprobarla. Úsala solo después de mostrar el resumen completo y de que el usuario lo haya confirmado de forma explícita en su último mensaje. El precio de venta y los totales los calcula el sistema a partir del costo y el margen: no los calcules tú.',
    inputSchema: z.object({
      confirmado_por_el_usuario: z.literal(true).describe('true solo si el usuario ya vio el resumen y dijo que sí'),
      empresa: texto(160).min(2).describe('Nombre del cliente'),
      atencion: texto(160).optional().describe('Persona a quien va dirigida'),
      telefono: texto(40).optional(),
      correo: texto(120).optional(),
      direccion: texto(300).optional(),
      forma_pago: texto(400).optional(),
      tiempo_entrega: texto(400).optional(),
      garantia: texto(600).optional(),
      vigencia_dias: z.number().int().min(1).max(180).optional(),
      notas: texto(1500).optional().describe('Notas que SÍ verá el cliente en el PDF'),
      moneda: z.enum(['MXN', 'USD']).optional(),
      tipo_cambio: z.number().positive().optional().describe('MXN por 1 USD; obligatorio si la moneda es USD'),
      pendientes_de_revisar: texto(1500).describe('Para quien revisa, no para el cliente: qué precios son de referencia o estimados, qué cantidades supusiste y qué falta confirmar. Una línea por punto.'),
      partidas: z.array(z.object({
        sistema: texto(80).describe('Grupo de la partida, p. ej. «Paneles Solares»'),
        descripcion: texto(1200).min(3),
        unidad: texto(20),
        cantidad: z.number().positive(),
        costo: z.number().min(0).describe('Costo unitario para la empresa, sin IVA, en la moneda de la cotización'),
        margen_pct: z.number().min(0).max(300).describe('Margen de ganancia sobre el costo; 0 si el usuario lo pondrá a mano'),
        enlace: texto(300).optional().describe('Dirección https de donde salió el precio, si la hay'),
      })).min(1).max(60),
    }),
    run: async (i) => {
      const moneda = i.moneda || 'MXN';
      if (moneda === 'USD' && !i.tipo_cambio) return JSON.stringify({ error: 'Falta el tipo de cambio para cotizar en USD' });
      const lineas = i.partidas.map((l) => ({
        sistema: l.sistema.trim() || 'General', descripcion: l.descripcion.trim(), unidad: l.unidad.trim() || 'Pza',
        cantidad: l.cantidad, costo: l.costo, margen_pct: l.margen_pct,
        precio_unitario: precioUnitarioDesdeCosto(l.costo, l.margen_pct),
        enlace: l.enlace && /^https:\/\//i.test(l.enlace) ? l.enlace : null,
      }));
      const ivaPct = 16;
      const { subtotal, iva, total } = calcularTotales(lineas, ivaPct);
      // Mismo consecutivo que usa el formulario de la app.
      const { count } = await supabase.from('cotizaciones').select('id', { count: 'exact', head: true });
      const folio = `COT-${String((count || 0) + 1).padStart(4, '0')}`;
      const { data: cot, error } = await supabase
        .from('cotizaciones')
        .insert({
          folio, created_by: yo.id, estado: 'borrador', fecha: hoyNegocio(),
          empresa: i.empresa.trim(), atencion: i.atencion?.trim() || null, telefono: i.telefono?.trim() || null,
          correo: i.correo?.trim() || null, direccion: i.direccion?.trim() || null,
          forma_pago: i.forma_pago?.trim() || 'Contado 100% contra entrega',
          tiempo_entrega: i.tiempo_entrega?.trim() || 'De 5 a 7 días hábiles previamente programados para todos los servicios que integran la cotización.',
          garantia: i.garantia?.trim() || 'Equipos 12 meses, contra defectos de fabricación.',
          vigencia_dias: i.vigencia_dias || 15, notas: i.notas?.trim() || null,
          firmante_nombre: yo.nombre, firmante_correo: yo.correo || null,
          iva_pct: ivaPct, moneda, presentacion_precios: 'desglose', tipo_cambio: moneda === 'USD' ? i.tipo_cambio : 1,
          subtotal, iva, total,
          generada_por_ia: true, notas_ia: i.pendientes_de_revisar.trim() || null,
        })
        .select('id')
        .single();
      if (error) {
        if (/generada_por_ia|notas_ia/.test(error.message)) return JSON.stringify({ error: 'La base aún no está preparada para borradores del asistente: falta correr patch_asistente_cotizaciones.sql. Avisa a quien administra la app.' });
        return falla(error);
      }
      const { error: e2 } = await supabase.from('cotizacion_lineas').insert(
        lineas.map((l, n) => ({ cotizacion_id: cot.id, orden: n, ...l, importe: Math.round(l.cantidad * l.precio_unitario * 100) / 100, enlace: normalizarEnlace(l.enlace) })),
      );
      if (e2) return JSON.stringify({ error: 'Se creó la cotización pero no se pudieron guardar sus partidas', detalle: e2.message, folio, enlace: `/dashboard/cotizaciones/${cot.id}` });
      return JSON.stringify({
        creada: true, folio, estado: 'borrador', enlace: `/dashboard/cotizaciones/${cot.id}`,
        moneda, subtotal, iva, total,
        partidas: lineas.map((l) => ({ descripcion: l.descripcion.slice(0, 60), cantidad: l.cantidad, precio_unitario: l.precio_unitario })),
      });
    },
  });

  // ---------- Programar servicios (solo supervisor) ----------

  const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe('Hora HH:MM en 24 h');
  const programarServicio = betaZodTool({
    name: 'programar_servicio',
    description:
      'Agenda un servicio nuevo (uno o varios días) y lo asigna a técnicos, igual que la sección «Agendar» de la app; los técnicos reciben su aviso. Úsala solo después de mostrar el resumen y de que el usuario lo confirme de forma explícita en su último mensaje. No sirve para cambiar ni cancelar servicios existentes.',
    inputSchema: z.object({
      confirmado_por_el_usuario: z.literal(true).describe('true solo si el usuario ya vio el resumen y dijo que sí'),
      cliente_o_proyecto: texto(160).min(2).describe('Nombre del cliente o proyecto, como aparece en la app si ya existe'),
      descripcion: texto(600).min(3).describe('Qué se va a hacer'),
      fechas: z.array(fecha).min(1).max(31).describe('Una fecha por día de trabajo'),
      hora_llegada: hora.optional(),
      hora_salida: hora.optional(),
      tecnicos: z.array(texto(80)).min(1).max(12).describe('Nombres de los técnicos asignados'),
      tareas: z.array(texto(300)).max(60).optional().describe('Lista de tareas del servicio, en orden'),
      lista_de_carga: z.array(z.object({
        categoria: z.enum(['herramienta', 'material', 'equipo']),
        descripcion: texto(200).min(2),
        cantidad: z.number().positive(),
        unidad: texto(20),
      })).max(60).optional().describe('Herramienta, material y equipo a llevar'),
    }),
    run: async (i) => {
      const hoy = hoyNegocio();
      const fechas = [...new Set(i.fechas)].sort();
      if (fechas[0] < hoy) return JSON.stringify({ error: `No se puede agendar en una fecha pasada (${fechas[0]}). Hoy es ${hoy}.` });
      if (i.hora_llegada && i.hora_salida && i.hora_salida <= i.hora_llegada) return JSON.stringify({ error: 'La hora de salida debe ser posterior a la de llegada' });

      // Técnicos: cada nombre debe corresponder a una sola persona activa.
      const { data: perfiles, error: eP } = await supabase.from('profiles').select('id, full_name, activo').eq('role', 'tecnico');
      if (eP) return falla(eP);
      const activos = ((perfiles as any[]) || []).filter((p) => p.activo !== false);
      const ids: string[] = [];
      const asignados: string[] = [];
      for (const nombre of i.tecnicos) {
        const t = sinAcentos(limpio(nombre));
        const exacto = activos.filter((p) => sinAcentos(p.full_name) === t);
        const hallados = exacto.length ? exacto : activos.filter((p) => sinAcentos(p.full_name).includes(t));
        if (hallados.length === 0) return JSON.stringify({ error: `No hay un técnico activo llamado «${nombre}»`, tecnicos_activos: activos.map((p) => p.full_name) });
        if (hallados.length > 1) return JSON.stringify({ error: `«${nombre}» coincide con varias personas; pregunta cuál`, opciones: hallados.map((p) => p.full_name) });
        if (!ids.includes(hallados[0].id)) { ids.push(hallados[0].id); asignados.push(hallados[0].full_name); }
      }

      // Cliente: si existe en la app se liga y se usa su nombre oficial.
      const { data: cls } = await supabase.from('clientes').select('id, nombre').ilike('nombre', patron(i.cliente_o_proyecto)).limit(6);
      const lista = (cls as any[]) || [];
      const igual = lista.filter((c) => sinAcentos(c.nombre) === sinAcentos(i.cliente_o_proyecto.trim()));
      if (igual.length !== 1 && lista.length > 1) return JSON.stringify({ error: 'Hay varios clientes con ese nombre; pregunta cuál', opciones: lista.map((c) => c.nombre) });
      const cliente = igual[0] || lista[0] || null;
      const proyecto = cliente?.nombre || i.cliente_o_proyecto.trim();

      // Ubicación: la del último servicio de ese cliente que la tenga, para
      // que la llegada se siga detectando sola. Si no hay, se queda sin punto.
      let ubicacion: unknown = null;
      {
        let q = supabase.from('servicios_programados').select('ubicacion_programada').not('ubicacion_programada', 'is', null).order('fecha', { ascending: false }).limit(1);
        q = cliente ? q.eq('cliente_id', cliente.id) : q.ilike('proyecto', proyecto);
        const { data: previo } = await q;
        ubicacion = (previo as any[])?.[0]?.ubicacion_programada || null;
      }

      // Empalmes: no impiden agendar (un técnico puede tener dos servicios
      // el mismo día), pero se devuelven para que el supervisor lo sepa.
      const { data: mismosDias } = await supabase
        .from('servicios_programados')
        .select('proyecto, fecha, hora_programada, servicio_tecnicos(tecnico_id)')
        .in('fecha', fechas)
        .neq('estado', 'cancelado');
      const empalmes = ((mismosDias as any[]) || []).flatMap((s) =>
        (s.servicio_tecnicos || []).filter((t: any) => ids.includes(t.tecnico_id)).map((t: any) => ({
          tecnico: asignados[ids.indexOf(t.tecnico_id)], fecha: s.fecha, hora: s.hora_programada?.slice(0, 5) || null, servicio: s.proyecto,
        })),
      );

      const duracion = i.hora_llegada && i.hora_salida
        ? (Number(i.hora_salida.slice(0, 2)) * 60 + Number(i.hora_salida.slice(3))) - (Number(i.hora_llegada.slice(0, 2)) * 60 + Number(i.hora_llegada.slice(3)))
        : 120;
      const grupoId = crypto.randomUUID();
      const creados: { id: string; fecha: string }[] = [];
      for (let dia = 0; dia < fechas.length; dia++) {
        const { data: s, error } = await supabase
          .from('servicios_programados')
          .insert({
            creado_por: yo.id, proyecto, cliente_id: cliente?.id || null, descripcion: i.descripcion.trim(),
            fecha: fechas[dia], hora_programada: i.hora_llegada || null, hora_salida_programada: i.hora_salida || null,
            ubicacion_programada: ubicacion, duracion_estimada_min: duracion,
            grupo_id: grupoId, numero_dia: dia + 1, dias_totales: fechas.length,
          })
          .select('id, fecha')
          .single();
        if (error) return JSON.stringify({ error: 'No se pudo agendar', detalle: error.message, dias_ya_creados: creados.length });
        creados.push(s as any);
        const { error: eT } = await supabase.from('servicio_tecnicos').insert(ids.map((tid) => ({ servicio_id: s.id, tecnico_id: tid })));
        if (eT) return JSON.stringify({ error: 'El servicio se creó pero no se pudieron asignar los técnicos; hay que asignarlos en la app', detalle: eT.message, enlace: `/dashboard/servicios/${s.id}` });
      }
      const avisos: string[] = [];
      if (i.tareas?.length) {
        const { error } = await supabase.from('servicio_tareas').insert(i.tareas.map((d, n) => ({ servicio_id: creados[0].id, grupo_id: grupoId, descripcion: d.trim(), orden: n })));
        if (error) avisos.push('No se pudieron guardar las tareas: ' + error.message);
      }
      if (i.lista_de_carga?.length) {
        const { error } = await supabase.from('servicio_insumos').insert(i.lista_de_carga.map((it, n) => ({
          grupo_id: grupoId, servicio_id: creados[0].id, categoria: it.categoria, descripcion: it.descripcion.trim(),
          cantidad: it.cantidad, unidad: it.unidad.trim() || 'pza', orden: n, agregado_por: yo.id, es_del_tecnico: false,
        })));
        if (error) avisos.push('No se pudo guardar la lista de carga: ' + error.message);
      }
      if (!ubicacion) avisos.push('El servicio quedó sin ubicación en el mapa: si se quiere detectar la llegada sola, hay que ponerla en el detalle del servicio.');

      // Lo mismo que hace «Agendar»: bitácora de acciones y aviso a los
      // asignados (respetando lo que cada quien eligió recibir). Ninguno de
      // los dos debe tumbar un servicio que ya quedó agendado.
      let pushEnviados = 0;
      try {
        await supabase.from('auditoria_global').insert({
          actor_id: yo.id, accion: 'programo_servicio', entidad: 'servicio', entidad_id: creados[0].id,
          detalle: `Programó «${proyecto}» con el asistente — ${fechas.length} día(s), ${ids.length} persona(s), ${i.tareas?.length || 0} tarea(s). Fechas: ${fechas.join(', ')}`,
        });
        const { data: pref } = await supabase.rpc('filtrar_por_preferencia', { p_usuarios: ids, p_tipo: 'servicio_asignado' });
        const destino = ((pref as any[]) || []).map((r) => (typeof r === 'string' ? r : r.filtrar_por_preferencia)).filter((id) => id && id !== yo.id);
        const [a, m, d] = fechas[0].split('-');
        pushEnviados = (await enviarPush(destino, { titulo: 'Te asignaron un servicio', mensaje: `${proyecto} · ${fechas.length > 1 ? `${fechas.length} días desde el ` : ''}${d}/${m}/${a}`, url: '/servicios', tag: 'servicio-asignado' })).enviadas;
      } catch (e) {
        console.error('[asistente] aviso o bitácora del servicio:', e);
      }

      return JSON.stringify({
        agendado: true, proyecto, cliente_ligado: !!cliente, tecnicos: asignados,
        dias: creados.map((c) => ({ fecha: c.fecha, enlace: `/dashboard/servicios/${c.id}` })),
        hora_llegada: i.hora_llegada || null, hora_salida: i.hora_salida || null,
        tareas: i.tareas?.length || 0, lista_de_carga: i.lista_de_carga?.length || 0,
        // 0 = ningún asignado tiene notificaciones activas en su teléfono;
        // el servicio igual les aparece al abrir la app.
        notificaciones_enviadas: pushEnviados,
        empalmes_con_otros_servicios: empalmes, avisos,
      });
    },
  });

  // El técnico no recibe las funciones de supervisión: aunque la RLS ya le
  // devolvería vacío, no ofrecerlas evita respuestas confusas («no hay
  // cotizaciones») sobre datos que simplemente no le corresponden.
  const comunes = [buscarEquipos, buscarReportes, servicios, tareas, listaDeCarga, plantillas, existencias, vales, clientes];
  if (!esSupervisor) return comunes;
  return [...comunes, cotizaciones, disponibles, recurrentes, preciosDeReferencia, redaccion, ...(yo.puedeEscribir === false ? [] : [crearBorrador, programarServicio])];
}
