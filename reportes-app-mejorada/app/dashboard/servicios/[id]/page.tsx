import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import ServicioSupervisorDetail from './ServicioSupervisorDetail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ServicioDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/mis-reportes');

  const { data: servicio, error } = await supabase.from('servicios_programados').select('*').eq('id', params.id).single();
  if (error || !servicio) notFound();

  return <ServicioSupervisorDetail servicioId={params.id} />;
}
