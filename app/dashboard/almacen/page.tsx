import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import AlmacenList from './AlmacenList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AlmacenPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/mis-reportes');

  // El almacén lo lleva una persona concreta, no cualquier supervisor.
  const { data: puede } = await supabase.rpc('puedo_gestionar_almacen');
  if (!puede) redirect('/dashboard');

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  return <AlmacenList userName={profile?.full_name || user.email || ''} />;
}
