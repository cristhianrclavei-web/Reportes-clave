import { redirect } from 'next/navigation';
import { hoyNegocio } from '@/lib/marca';
import { createClient } from '@/lib/supabaseServer';
import ResumenList from './ResumenList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ResumenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/nuevo');

  const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  const { data: reports, error: errorReports } = await supabase
    .from('reports')
    .select('*, profiles!reports_created_by_profiles_fkey(full_name)')
    .order('created_at', { ascending: false });

  // Días programados cuya fecha ya pasó y siguen sin concluirse: con el
  // bloqueo por fecha, el técnico no puede tocarlos hasta que se reprogramen.
  // «Hoy» en la zona horaria de la operación, no la del servidor (UTC): si
  // no, después de las 6 de la tarde los servicios de hoy salían vencidos.
  const hoyStr = hoyNegocio();
  const { data: diasVencidos } = await supabase
    .from('servicios_programados')
    .select('id, proyecto, fecha, numero_dia, dias_totales')
    .lt('fecha', hoyStr)
    .not('estado', 'in', '(concluido,cancelado)')
    .order('fecha', { ascending: true });

  return (
    <ResumenList
      diasVencidos={(diasVencidos as any) || []}
      reports={(reports as any) || []}
      userName={myProfile?.full_name || user.email || ''}
      errorCarga={errorReports?.message || null}
    />
  );
}
