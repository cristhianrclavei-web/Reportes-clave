import type { SupabaseClient } from '@supabase/supabase-js';

// Qué está viendo la persona al preguntar. El chat manda la ruta de la
// pantalla y aquí se convierte en un párrafo para el modelo, de modo que
// «esta cotización», «este servicio» o «este cliente» tengan sentido sin dar
// folio. Se consulta con la sesión de quien pregunta: si no tiene acceso a
// lo que dice la ruta, simplemente no hay contexto.
//
// La ruta viene del navegador, así que solo se aceptan formas conocidas con
// un UUID; nada de ella se copia tal cual a las instrucciones.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const corto = (t: unknown, n = 300) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function contextoDePantalla(supabase: SupabaseClient, pantalla: unknown): Promise<string> {
  if (typeof pantalla !== 'string' || pantalla.length > 300) return '';
  const [ruta, consulta = ''] = pantalla.split('?');
  try {
    let m = ruta.match(new RegExp(`^/dashboard/cotizaciones/(${UUID})$`, 'i'));
    if (m) {
      const { data: c } = await supabase.from('cotizaciones').select('folio, empresa, estado, fecha, total, moneda').eq('id', m[1]).maybeSingle();
      return c ? `Pantalla actual: la cotización ${c.folio} de «${corto(c.empresa, 120)}», estado ${c.estado}, del ${c.fecha}, total ${c.total} ${c.moneda}.` : '';
    }
    m = ruta.match(new RegExp(`^/(?:dashboard/)?servicios/(${UUID})$`, 'i'));
    if (m) {
      const { data: s } = await supabase.from('servicios_programados').select('id, proyecto, descripcion, fecha, hora_programada, estado').eq('id', m[1]).maybeSingle();
      return s ? `Pantalla actual: el servicio de «${corto(s.proyecto, 120)}» del ${s.fecha}${s.hora_programada ? ` a las ${String(s.hora_programada).slice(0, 5)}` : ''}, estado ${s.estado} (servicio_id ${s.id}). Descripción: ${corto(s.descripcion)}.` : '';
    }
    m = ruta.match(new RegExp(`^/dashboard/proyectos/(${UUID})(?:/|$)`, 'i'));
    if (m) {
      const { data: c } = await supabase.from('clientes').select('nombre').eq('id', m[1]).maybeSingle();
      return c ? `Pantalla actual: la ficha del cliente «${corto(c.nombre, 120)}».` : '';
    }
    const idReporte = new URLSearchParams(consulta).get('reporte');
    if (idReporte && new RegExp(`^${UUID}$`, 'i').test(idReporte) && /^\/(dashboard\/reportes|mis-reportes)$/.test(ruta)) {
      const { data: r } = await supabase
        .from('reports')
        .select('id, fecha, empresa_cliente, tipo_servicio, actividades:data->actividades, observaciones:data->>observaciones')
        .eq('id', idReporte).maybeSingle();
      if (!r) return '';
      const acts = Array.isArray((r as any).actividades) ? (r as any).actividades.slice(0, 8).map((a: unknown) => corto(a, 140)).join('; ') : '';
      return `Pantalla actual: el reporte folio ${String(r.id).slice(0, 8).toUpperCase()} de «${corto(r.empresa_cliente, 120)}» del ${r.fecha}${r.tipo_servicio ? ` (${corto(r.tipo_servicio, 60)})` : ''}.${acts ? ` Actividades registradas: ${acts}.` : ''}${(r as any).observaciones ? ` Observaciones: ${corto((r as any).observaciones)}.` : ''}`;
    }
  } catch {
    // Sin contexto: la pregunta se atiende igual.
  }
  return '';
}

// El modelo puede cerrar su mensaje con [[opciones: A | B | C]] para ofrecer
// respuestas de un toque. Aquí se separan del texto: el chat las pinta como
// botones y no se guardan ni se leen en voz alta.
export function separarOpciones(respuesta: string): { texto: string; opciones: string[] } {
  const m = respuesta.match(/\[\[\s*opciones\s*:\s*([^\]]*)\]\]\s*$/i);
  if (!m) return { texto: respuesta, opciones: [] };
  const opciones = [...new Set(m[1].split('|').map((o) => o.trim()).filter((o) => o.length > 0 && o.length <= 40))].slice(0, 5);
  return { texto: respuesta.slice(0, m.index).trim(), opciones };
}
