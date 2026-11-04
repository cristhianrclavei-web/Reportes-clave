import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import LazosList from './LazosList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Lazos y circuitos de todos los clientes. La usan técnicos y supervisión:
// el técnico captura el cableado en campo y cualquiera puede atender una
// falla a tierra. `?cliente=<id>` abre la lista filtrada por un cliente.
export default async function LazosPage(props: { searchParams: Promise<{ cliente?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/lazos');

  const { data: role } = await supabase.rpc('get_my_role');
  if (role !== 'supervisor' && role !== 'tecnico') redirect('/login');

  const { data: perfil } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  return (
    <LazosList
      userName={perfil?.full_name || user.email || ''}
      esSupervisor={role === 'supervisor'}
      clienteInicial={searchParams.cliente || null}
    />
  );
}
