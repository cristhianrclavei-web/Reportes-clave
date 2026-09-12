import { createClient } from './supabaseClient';
import { registrarAccionGlobal } from './auditoriaGlobal';
import { notificar } from './push';

// Flujo de corrección de un reporte ya cerrado:
// solicitar (técnico) → habilitar (supervisor) → aplicar (técnico).
// Cada paso queda en la bitácora de Eventos con el nombre de quien lo hizo.

export async function solicitarCorreccion(
  report: { id: string; empresa_cliente: string; data: any },
  motivo: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('reports')
    .update({
      correccion_solicitada: true,
      correccion_motivo: motivo.trim(),
      correccion_solicitada_en: new Date().toISOString(),
    })
    .eq('id', report.id);
  if (error) throw error;

  const folio = report.data?.claveFormato ? ` (folio ${report.data.claveFormato})` : '';
  await registrarAccionGlobal(
    'solicito_correccion',
    'reporte',
    report.id,
    `Solicitó corregir el reporte de «${report.empresa_cliente}»${folio}: ${motivo.trim()}`
  );

  await notificar({
    destino: 'supervisores',
    tipo: 'correccion_solicitada',
    titulo: 'Piden corregir un reporte',
    mensaje: `${report.empresa_cliente}: ${motivo.trim()}`,
    url: '/dashboard',
    tag: 'correccion',
  });
}

// Solo un supervisor llega aquí; el trigger de la base de datos lo respalda.
export async function habilitarCorreccion(
  report: { id: string; empresa_cliente: string; data: any }
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('reports')
    .update({
      correccion_habilitada: true,
      correccion_solicitada: false,
      correccion_por: user?.id,
      correccion_en: new Date().toISOString(),
    })
    .eq('id', report.id);
  if (error) throw error;

  const folio = report.data?.claveFormato ? ` (folio ${report.data.claveFormato})` : '';
  await registrarAccionGlobal(
    'habilito_correccion',
    'reporte',
    report.id,
    `Autorizó corregir el reporte de «${report.empresa_cliente}»${folio} — el técnico puede agregar fotos y cambiar el servicio vinculado`
  );
}

export async function cancelarCorreccion(
  report: { id: string; empresa_cliente: string; data: any }
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('reports')
    .update({ correccion_habilitada: false, correccion_solicitada: false, correccion_solicitada_en: null })
    .eq('id', report.id);
  if (error) throw error;

  await registrarAccionGlobal(
    'cerro_correccion',
    'reporte',
    report.id,
    `Cerró el permiso de corrección del reporte de «${report.empresa_cliente}» sin que se aplicaran cambios`
  );
}

// El técnico aplica la corrección: nuevas fotos y/o cambio de servicio
// vinculado. Al terminar, el permiso se consume — para otra corrección hay
// que pedir autorización de nuevo.
export async function aplicarCorreccion(
  report: { id: string; empresa_cliente: string; data: any },
  cambios: { nuevasFotos: { path: string; caption: string }[]; nuevoServicioId: string | null; servicioAnteriorId: string | null }
): Promise<void> {
  const supabase = createClient();

  const fotosPrevias: any[] = report.data?.fotos || [];
  const dataActualizada = {
    ...report.data,
    fotos: [...fotosPrevias, ...cambios.nuevasFotos],
    servicioProgramadoId: cambios.nuevoServicioId,
  };

  const { error } = await supabase
    .from('reports')
    .update({ data: dataActualizada, correccion_habilitada: false, correccion_solicitada: false, correccion_motivo: null, correccion_solicitada_en: null })
    .eq('id', report.id);
  if (error) throw error;

  // Re-vincular del lado de servicios_programados: liberar el anterior y
  // marcar el nuevo. Best-effort — el reporte ya quedó corregido.
  if (cambios.servicioAnteriorId && cambios.servicioAnteriorId !== cambios.nuevoServicioId) {
    try {
      await supabase.from('servicios_programados').update({ report_id: null }).eq('id', cambios.servicioAnteriorId);
    } catch (e) {
      console.error('No se pudo desvincular el servicio anterior:', e);
    }
  }
  if (cambios.nuevoServicioId && cambios.nuevoServicioId !== cambios.servicioAnteriorId) {
    try {
      await supabase.from('servicios_programados').update({ report_id: report.id }).eq('id', cambios.nuevoServicioId);
    } catch (e) {
      console.error('No se pudo vincular el servicio nuevo:', e);
    }
  }

  const partes: string[] = [];
  if (cambios.nuevasFotos.length > 0) {
    partes.push(`agregó ${cambios.nuevasFotos.length} foto(s)`);
  }
  if (cambios.nuevoServicioId !== cambios.servicioAnteriorId) {
    partes.push('cambió el servicio vinculado');
  }
  const folio = report.data?.claveFormato ? ` (folio ${report.data.claveFormato})` : '';
  await registrarAccionGlobal(
    'aplico_correccion',
    'reporte',
    report.id,
    `Corrigió el reporte de «${report.empresa_cliente}»${folio}: ${partes.join(' y ') || 'sin cambios'}`
  );
}
