import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import ReportesList from './ReportesList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ReportesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/mis-reportes');

  const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  const { data: reports, error: errorReports } = await supabase
    .from('reports')
    .select('*, profiles!reports_created_by_profiles_fkey(full_name)')
    .order('created_at', { ascending: false });

  return (
    <ReportesList
      reports={(reports as any) || []}
      userName={myProfile?.full_name || user.email || ''}
      errorCarga={errorReports?.message || null}
    />
  );
}
