import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import PersonalPanel from './PersonalPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PersonalPage(props: { searchParams: Promise<{ sub?: string | string[] }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/solicitudes');
  const { data: profile } = await supabase.from('profiles').select('full_name, can_manage_usuarios').eq('id', user.id).single();
  const { sub } = await props.searchParams;
  return (
    <PersonalPanel
      userName={profile?.full_name || user.email || ''}
      esGestor={profile?.can_manage_usuarios === true}
      subInicial={typeof sub === 'string' ? sub : undefined}
    />
  );
}
