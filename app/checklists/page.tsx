import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import MisChecklistsList from './MisChecklistsList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ChecklistsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Sección exclusiva del técnico: el supervisor administra la herramienta
  // desde el detalle de cada servicio.
  const { data: role } = await supabase.rpc('get_my_role');
  if (role === 'supervisor') redirect('/dashboard');

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  return <MisChecklistsList userName={profile?.full_name || user.email || ''} />;
}
