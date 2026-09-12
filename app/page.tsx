import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');

  redirect(role === 'supervisor' ? '/dashboard' : '/mis-reportes');
}
