import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import MisReportesList from './MisReportesList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MisReportesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  // Supervisión (también quien sale a servicios, al guardar su reporte) va a sus Reportes.
  if (role === 'supervisor') redirect('/dashboard/reportes');

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  const { data: reports, error: errorReports } = await supabase
    .from('reports')
    .select('*, profiles!reports_created_by_profiles_fkey(full_name)')
    .eq('created_by', user.id)
    // Por la fecha del servicio (la más reciente primero), no por cuándo se
    // capturó: un reporte atrasado queda en su día. Mismo día: el último capturado arriba.
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });

  return (
    <MisReportesList
      reports={(reports as any) || []}
      userName={profile?.full_name || user.email || ''}
      errorCarga={errorReports?.message || null}
    />
  );
}
