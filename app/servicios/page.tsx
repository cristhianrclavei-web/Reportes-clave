import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import MisServiciosList from './MisServiciosList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MisServiciosPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <MisServiciosList />;
}
