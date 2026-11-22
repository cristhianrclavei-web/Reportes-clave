'use client';

import { createClient } from './supabaseClient';
import { mensajeProyecto } from './proyectos';

// Lo que pertenece a una obra: cotizaciones, servicios, levantamientos,
// paneles y circuitos de detección, planos, guías de conexión y unifilares.
// Todo se liga con `proyecto_id` (patch_proyectos_centro.sql). Lo de antes,
// sin proyecto, se ve en la ficha del cliente y se mueve con moverAProyecto.

export type TipoContenido = 'cotizacion' | 'servicio' | 'levantamiento' | 'panel' | 'lazo' | 'plano' | 'guia' | 'unifilar';

export type ElementoContenido = {
  tipo: TipoContenido;
  id: string;
  titulo: string;
  detalle: string;
  fecha: string;
  // Sistema al que pertenece, si se sabe (planos, guías, unifilares, detección).
  sistema: string | null;
  enlace: string;
  // Servicios: todos los días del mismo servicio se mueven juntos.
  grupoId?: string | null;
};

export type Contenido = Record<TipoContenido, ElementoContenido[]>;

export const NOMBRE_CONTENIDO: Record<TipoContenido, { uno: string; varios: string }> = {
  cotizacion: { uno: 'Cotización', varios: 'Cotizaciones' },
  servicio: { uno: 'Servicio', varios: 'Servicios' },
  levantamiento: { uno: 'Levantamiento', varios: 'Levantamientos' },
  panel: { uno: 'Panel de detección', varios: 'Paneles de detección' },
  lazo: { uno: 'Circuito', varios: 'Circuitos (lazos, voceo, estrobos)' },
  plano: { uno: 'Plano', varios: 'Planos' },
  guia: { uno: 'Guía de conexión', varios: 'Guías de conexión' },
  unifilar: { uno: 'Unifilar FV', varios: 'Unifilares fotovoltaicos' },
};

const TABLA: Record<TipoContenido, string> = {
  cotizacion: 'cotizaciones',
  servicio: 'servicios_programados',
  levantamiento: 'levantamientos',
  panel: 'lazo_paneles',
  lazo: 'lazos',
  plano: 'lazo_planos',
  guia: 'guias_conexion',
  unifilar: 'unifilares',
};

const VACIO = (): Contenido => ({ cotizacion: [], servicio: [], levantamiento: [], panel: [], lazo: [], plano: [], guia: [], unifilar: [] });

const fechaCorta = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const moneda = (n: number, m: string) => `${new Intl.NumberFormat('es-MX', { style: 'currency', currency: m === 'USD' ? 'USD' : 'MXN' }).format(n || 0)}`;

const NOMBRE_ESTADO_SERVICIO: Record<string, string> = {
  programado: 'Programado', en_curso: 'En curso', pausado: 'Pausado', concluido: 'Concluido', cancelado: 'Cancelado',
};

// `filtro`: por proyecto, o lo del cliente que no tiene proyecto.
async function consultar(filtro: { proyectoId: string } | { clienteId: string; sinProyecto: true }): Promise<Contenido> {
  const supabase = createClient();
  const aplicar = (q: any) => ('proyectoId' in filtro ? q.eq('proyecto_id', filtro.proyectoId) : q.eq('cliente_id', filtro.clienteId).is('proyecto_id', null));

  const [cot, serv, lev, pan, laz, pla, gui, uni] = await Promise.all([
    aplicar(supabase.from('cotizaciones').select('id, folio, titulo_proyecto, estado, total, moneda, fecha, created_at')).order('created_at', { ascending: false }).limit(200),
    aplicar(supabase.from('servicios_programados').select('id, grupo_id, proyecto, descripcion, fecha, estado, numero_dia, dias_totales')).order('fecha', { ascending: false }).limit(400),
    aplicar(supabase.from('levantamientos').select('id, folio, fecha, created_at')).order('created_at', { ascending: false }).limit(200),
    aplicar(supabase.from('lazo_paneles').select('id, nombre, modelo, creado_en')).order('creado_en').limit(200),
    aplicar(supabase.from('lazos').select('id, nombre, codigo, tipo, creado_en')).order('creado_en').limit(400),
    aplicar(supabase.from('lazo_planos').select('id, nombre, sistema, actualizado_en')).order('actualizado_en', { ascending: false }).limit(200),
    aplicar(supabase.from('guias_conexion').select('id, nombre, sistema, actualizado_en').eq('es_plantilla', false)).order('actualizado_en', { ascending: false }).limit(200),
    aplicar(supabase.from('unifilares').select('id, nombre, tipo, actualizado_en')).order('actualizado_en', { ascending: false }).limit(200),
  ]);

  // Las tablas que no existen todavía (sin su patch) no rompen la pantalla.
  const filas = (r: { data: any[] | null; error: any }, nombre: string): any[] => {
    if (!r.error) return r.data || [];
    if (/does not exist|could not find the table|schema cache/i.test(r.error.message || '') && !/proyecto_id/.test(r.error.message || '')) return [];
    throw new Error(mensajeProyecto(r.error, `cargar ${nombre}`));
  };

  const c = VACIO();
  c.cotizacion = filas(cot, 'las cotizaciones').map((x) => ({
    tipo: 'cotizacion', id: x.id, titulo: `${x.folio || 'Borrador'} · ${x.titulo_proyecto || 'Sin título'}`,
    detalle: `${moneda(x.total, x.moneda)} · ${x.estado}`, fecha: x.fecha || x.created_at, sistema: null, enlace: `/dashboard/cotizaciones/${x.id}`,
  }));

  // Un servicio de varios días es un solo renglón.
  const porGrupo = new Map<string, any[]>();
  for (const s of filas(serv, 'los servicios')) {
    const clave = s.grupo_id || s.id;
    porGrupo.set(clave, [...(porGrupo.get(clave) || []), s]);
  }
  c.servicio = [...porGrupo.entries()].map(([clave, dias]) => {
    const ordenados = [...dias].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    const primero = ordenados[0];
    const ultimo = ordenados[ordenados.length - 1];
    const rango = primero.fecha === ultimo.fecha ? fechaCorta(primero.fecha) : `${fechaCorta(primero.fecha)} – ${fechaCorta(ultimo.fecha)}`;
    const estados = new Set(dias.map((d) => d.estado));
    const estado = estados.size === 1 ? NOMBRE_ESTADO_SERVICIO[primero.estado] || primero.estado : 'Varios estados';
    return {
      tipo: 'servicio' as const, id: primero.id, grupoId: primero.grupo_id || null, titulo: primero.proyecto || primero.descripcion || 'Servicio',
      detalle: `${rango} · ${dias.length} ${dias.length === 1 ? 'día' : 'días'} · ${estado}`, fecha: ultimo.fecha, sistema: null,
      // Varios días: la vista de avance del servicio; uno solo: su detalle.
      enlace: primero.grupo_id && dias.length > 1 ? `/dashboard/servicios/proyecto/${primero.grupo_id}` : `/dashboard/servicios/${primero.id}`,
    };
  }).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  c.levantamiento = filas(lev, 'los levantamientos').map((x) => ({
    tipo: 'levantamiento', id: x.id, titulo: x.folio || 'Levantamiento', detalle: fechaCorta(x.fecha || x.created_at), fecha: x.fecha || x.created_at,
    sistema: null, enlace: `/api/levantamientos/${x.id}/pdf`,
  }));
  c.panel = filas(pan, 'los paneles').map((x) => ({
    tipo: 'panel', id: x.id, titulo: x.nombre, detalle: x.modelo || 'Panel de detección', fecha: x.creado_en, sistema: 'deteccion', enlace: `/lazos/panel/${x.id}`,
  }));
  c.lazo = filas(laz, 'los circuitos').map((x) => ({
    tipo: 'lazo', id: x.id, titulo: x.nombre || x.codigo, detalle: x.codigo || x.tipo, fecha: x.creado_en, sistema: 'deteccion', enlace: `/lazos/${x.id}`,
  }));
  c.plano = filas(pla, 'los planos').map((x) => ({
    tipo: 'plano', id: x.id, titulo: x.nombre, detalle: `Actualizado ${fechaCorta(x.actualizado_en)}`, fecha: x.actualizado_en, sistema: x.sistema || 'deteccion', enlace: `/lazos/plano/${x.id}`,
  }));
  c.guia = filas(gui, 'las guías').map((x) => ({
    tipo: 'guia', id: x.id, titulo: x.nombre, detalle: x.sistema, fecha: x.actualizado_en, sistema: sistemaDeGuia(x.sistema), enlace: `/guias/${x.id}`,
  }));
  c.unifilar = filas(uni, 'los unifilares').map((x) => ({
    tipo: 'unifilar', id: x.id, titulo: x.nombre, detalle: `Actualizado ${fechaCorta(x.actualizado_en)}`, fecha: x.actualizado_en, sistema: 'solar', enlace: `/unifilares/${x.id}`,
  }));
  return c;
}

function sistemaDeGuia(texto: string): string {
  const t = (texto || '').toLowerCase();
  if (t.includes('solar')) return 'solar';
  if (t.includes('cctv')) return 'cctv';
  if (t.includes('acceso')) return 'acceso';
  if (t.includes('intrusi')) return 'intrusion';
  if (t.includes('detecci') || t.includes('incendio')) return 'deteccion';
  return 'otro';
}

export function contenidoDelProyecto(proyectoId: string): Promise<Contenido> {
  return consultar({ proyectoId });
}

export function contenidoSinProyecto(clienteId: string): Promise<Contenido> {
  return consultar({ clienteId, sinProyecto: true });
}

export function totalDe(c: Contenido): number {
  return Object.values(c).reduce((s, l) => s + l.length, 0);
}

// Ligar algo a un proyecto (o soltarlo con null). Un servicio se mueve con
// todos sus días; un circuito de detección arrastra su panel si no tiene.
export async function moverAProyecto(e: Pick<ElementoContenido, 'tipo' | 'id' | 'grupoId'>, proyectoId: string | null): Promise<void> {
  const supabase = createClient();
  let consulta = supabase.from(TABLA[e.tipo]).update({ proyecto_id: proyectoId });
  consulta = e.tipo === 'servicio' && e.grupoId ? consulta.eq('grupo_id', e.grupoId) : consulta.eq('id', e.id);
  const { error } = await consulta;
  if (error) throw new Error(mensajeProyecto(error, 'mover al proyecto'));
}
