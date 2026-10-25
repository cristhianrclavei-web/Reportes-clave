import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import MisServiciosList from './MisServiciosList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MisServiciosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
  // Supervisión que sale a servicios también usa esta pantalla para marcar
  // llegada y conclusión de los servicios donde está asignada.
  const { data: role } = await supabase.rpc('get_my_role');

  return <MisServiciosList userName={profile?.full_name || user.email || ''} esSupervision={role === 'supervisor'} />;
}
