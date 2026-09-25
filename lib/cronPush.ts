import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabaseAdmin';

// Compartido entre los cron de recordatorios: busca a los técnicos
// asignados a un servicio, filtra por su preferencia de notificación, y
// envía el push directo (sin pasar por /api/push, que exige sesión de
// usuario — el cron no tiene una).
export async function avisarTecnicos(
  admin: ReturnType<typeof createAdminClient>,
  servicioId: string,
  tipo: string,
  carga: string
): Promise<{ enviadas: number; caducadas: string[] }> {
  const { data: asignaciones } = await admin
    .from('servicio_tecnicos')
    .select('tecnico_id')
    .eq('servicio_id', servicioId);
  const tecnicoIds = (asignaciones || []).map((a: any) => a.tecnico_id as string);
  return avisarUsuarios(admin, tecnicoIds, tipo, carga);
}

// Lo mismo, pero con los destinatarios ya decididos (p. ej. el recordatorio
// de reporte pendiente, que es por técnico y no por servicio).
export async function avisarUsuarios(
  admin: ReturnType<typeof createAdminClient>,
  tecnicoIds: string[],
  tipo: string,
  carga: string
): Promise<{ enviadas: number; caducadas: string[] }> {
  if (tecnicoIds.length === 0) return { enviadas: 0, caducadas: [] };

  const { data: filtrados } = await admin.rpc('filtrar_por_preferencia', {
    p_usuarios: tecnicoIds,
    p_tipo: tipo,
  });
  const ids = ((filtrados as any[]) || []).map((r) => (typeof r === 'string' ? r : r.filtrar_por_preferencia));
  if (ids.length === 0) return { enviadas: 0, caducadas: [] };

  const { data: subs } = await admin
    .from('push_suscripciones')
    .select('usuario_id, endpoint, p256dh, auth')
    .in('usuario_id', ids);
  if (!subs || subs.length === 0) return { enviadas: 0, caducadas: [] };

  let enviadas = 0;
  const caducadas: string[] = [];
  await Promise.all(
    subs.map(async (sub: any) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, carga);
        enviadas++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          caducadas.push(sub.endpoint);
        } else {
          console.error('Fallo al enviar recordatorio:', e?.statusCode, e?.body);
        }
      }
    })
  );
  return { enviadas, caducadas };
}
