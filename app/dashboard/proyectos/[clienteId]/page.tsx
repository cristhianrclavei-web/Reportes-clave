import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import ClienteDetalle from './ClienteDetalle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ClienteDetallePage(props: { params: Promise<{ clienteId: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor') redirect('/nuevo');

  const { data: myProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  const { data: cliente, error } = await supabase.from('clientes').select('id').eq('id', params.clienteId).single();
  if (error || !cliente) notFound();

  return <ClienteDetalle clienteId={params.clienteId} userName={myProfile?.full_name || user.email || ''} />;
}
