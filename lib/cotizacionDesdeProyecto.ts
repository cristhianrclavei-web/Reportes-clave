'use client';

import { createClient } from './supabaseClient';
import { obtenerPlano } from './planosDatos';
import { materialesDelPlano, type RenglonMaterial } from './cctv';
import { nombreSistema } from './proyectosEtapas';
import { datosSolarVacios, dimensionar } from './solar';

// Datos para abrir «Nueva cotización» desde un proyecto (con el cliente y el
// nombre de la obra) o desde un plano (además, los equipos y la tubería
// sembrados como renglones). Al guardar, la cotización queda en el proyecto.

export type OrigenCotizacion = {
  proyecto: { id: string; nombre: string } | null;
  plano: { id: string; nombre: string } | null;
  cliente: { empresa: string; atencion: string | null; telefono: string | null; correo: string | null; direccion: string | null };
  titulo: string;
  sistema: string;
  renglones: RenglonMaterial[];
};

async function datosDelCliente(clienteId: string) {
  const supabase = createClient();
  const [{ data: cliente, error }, { data: contactos }] = await Promise.all([
    supabase.from('clientes').select('nombre, direccion, calle, num_exterior, colonia, ciudad, estado').eq('id', clienteId).single(),
    supabase.from('cliente_contactos').select('nombre, telefono, correo').eq('cliente_id', clienteId).order('created_at').limit(1),
  ]);
  if (error || !cliente) throw new Error('No se pudo leer el cliente. Revisa tu señal e intenta de nuevo.');
  const partes = [[cliente.calle, cliente.num_exterior].filter(Boolean).join(' '), cliente.colonia, [cliente.ciudad, cliente.estado].filter(Boolean).join(', ')].filter(Boolean);
  const contacto = contactos?.[0];
  return {
    empresa: cliente.nombre as string,
    atencion: contacto?.nombre || null,
    telefono: contacto?.telefono || null,
    correo: contacto?.correo || null,
    direccion: (partes.length >= 2 ? partes.join(', ') : cliente.direccion) || null,
  };
}

export async function origenDesdeProyecto(proyectoId: string): Promise<OrigenCotizacion> {
  const { data: proyecto, error } = await createClient().from('proyectos').select('id, nombre, cliente_id, sistemas').eq('id', proyectoId).single();
  if (error || !proyecto) throw new Error('No se encontró el proyecto. Puede que lo hayan borrado.');
  const sistemas: string[] = proyecto.sistemas || [];
  const solar = sistemas.includes('solar') ? await renglonesSolares(proyecto.id) : [];
  return {
    proyecto: { id: proyecto.id, nombre: proyecto.nombre },
    plano: null,
    cliente: await datosDelCliente(proyecto.cliente_id),
    titulo: proyecto.nombre,
    sistema: solar.length > 0 ? nombreSistema('solar') : sistemas.length === 1 ? nombreSistema(sistemas[0]) : 'General',
    renglones: solar,
  };
}

export async function origenDesdePlano(planoId: string): Promise<OrigenCotizacion> {
  const { plano } = await obtenerPlano(planoId);
  let proyecto: { id: string; nombre: string } | null = null;
  if (plano.proyecto_id) {
    const { data } = await createClient().from('proyectos').select('id, nombre').eq('id', plano.proyecto_id).maybeSingle();
    proyecto = data || null;
  }
  const sistema = nombreSistema(plano.sistema || 'deteccion');
  return {
    proyecto,
    plano: { id: plano.id, nombre: plano.nombre },
    cliente: await datosDelCliente(plano.cliente_id),
    titulo: proyecto ? `${proyecto.nombre} · ${sistema}` : `${sistema} · ${plano.nombre}`,
    sistema,
    renglones: materialesDelPlano(plano.sembrado, plano.metros_por_unidad),
  };
}

// Del dimensionamiento del proyecto: lo que normalmente lleva un sistema
// interconectado. Cantidades y descripciones se ajustan en la cotización.
async function renglonesSolares(proyectoId: string): Promise<RenglonMaterial[]> {
  const supabase = createClient();
  const [{ data: d }, { data: recibos }] = await Promise.all([
    supabase.from('proyecto_solar').select('*').eq('proyecto_id', proyectoId).maybeSingle(),
    supabase.from('recibos_cfe').select('kwh, importe, precio_kwh_manual, fecha_inicio, fecha_fin').eq('proyecto_id', proyectoId),
  ]);
  // Sin dimensionamiento guardado se usan los valores de siempre (como en pantalla).
  const base = { ...datosSolarVacios(proyectoId), ...(d || {}) };
  const calculo = dimensionar(
    { hsp: Number(base.hsp), factor_perdidas: Number(base.factor_perdidas), modulo_w: base.modulo_w ? Number(base.modulo_w) : null, modulos: base.modulos, cobertura_pct: Number(base.cobertura_pct), costo_sistema: null },
    (recibos || []).map((r: any) => ({ ...r, kwh: Number(r.kwh), importe: Number(r.importe), precio_kwh_manual: r.precio_kwh_manual ? Number(r.precio_kwh_manual) : null })),
  );
  if (calculo.modulos < 1) return [];
  const w = base.modulo_w ? Number(base.modulo_w) : 0;
  return [
    { descripcion: `Módulo fotovoltaico de ${w} W`, cantidad: calculo.modulos, unidad: 'Pza', modelo: null },
    { descripcion: base.inversor ? `Inversor ${base.inversor}` : `Inversor de interconexión de ${Math.ceil(calculo.kwp)} kW`, cantidad: 1, unidad: 'Pza', modelo: null },
    { descripcion: 'Estructura de montaje de aluminio para módulos', cantidad: calculo.modulos, unidad: 'Pza', modelo: null },
    { descripcion: 'Cable fotovoltaico, conectores MC4, protecciones de CD y CA y tierra física', cantidad: 1, unidad: 'Lote', modelo: null },
    { descripcion: `Mano de obra: instalación, configuración y puesta en marcha de sistema de ${calculo.kwp.toFixed(2)} kWp`, cantidad: 1, unidad: 'Serv', modelo: null },
    { descripcion: 'Trámite de interconexión ante CFE (diagrama unifilar y expediente)', cantidad: 1, unidad: 'Serv', modelo: null },
  ];
}
