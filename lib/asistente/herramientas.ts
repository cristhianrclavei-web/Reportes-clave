import type { SupabaseClient } from '@supabase/supabase-js';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { MARCA } from '@/lib/marca';

// Funciones de consulta del asistente. Reglas de este archivo:
//
//   1. Solo lectura: aquí no hay insert, update ni delete.
//   2. Todo se consulta con la sesión de quien pregunta (el cliente de
//      lib/supabaseServer), así que la RLS decide qué filas ve cada rol igual
//      que en el resto de la app. Única excepción, decidida por la empresa:
//      el técnico puede consultar dirección y contactos de cualquier cliente
//      (los necesita para llegar al servicio) aunque no tenga la sección
//      Clientes, y las plantillas de la empresa (rutinas de tareas y
//      plantillas de insumos) para preparar un servicio. Esas dos consultas
//      usan el cliente admin con columnas fijas.
//   3. Se piden columnas concretas: firmas, fotos, costos y márgenes no se
//      mandan al modelo aunque la RLS dejara leerlos.
//   4. Cada consulta tiene tope de filas: una pregunta amplia no debe
//      convertirse en una descarga de la base.

export type QuienPregunta = { id: string; nombre: string; rol: 'tecnico' | 'supervisor' };

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

  // El técnico no recibe las funciones de supervisión: aunque la RLS ya le
  // devolvería vacío, no ofrecerlas evita respuestas confusas («no hay
  // cotizaciones») sobre datos que simplemente no le corresponden.
  const comunes = [buscarEquipos, buscarReportes, servicios, tareas, listaDeCarga, plantillas, existencias, vales, clientes];
  return esSupervisor ? [...comunes, cotizaciones, disponibles, recurrentes] : comunes;
}
