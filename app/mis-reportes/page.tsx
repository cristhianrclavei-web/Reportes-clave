import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import MisReportesList from './MisReportesList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MisReportesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role === 'supervisor') redirect('/dashboard');

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  const { data: reports } = await supabase
    .from('reports')
    .select('id, created_at, empresa_cliente, fecha, tipo_servicio, sub_tipo_servicio, data, created_by, profiles(full_name)')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  return <MisReportesList reports={(reports as any) || []} userName={profile?.full_name || user.email || ''} />;
}
